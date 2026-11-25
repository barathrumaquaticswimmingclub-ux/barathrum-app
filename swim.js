'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const B = require('./business');
const P = require('./profile');
const N = require('./notifications');
const SPP = require('./spp');
const {parentEvaluation}=require('./evaluation');
const digest = x => crypto.createHash('sha256').update(x).digest('hex');
const norm = x => String(x || '').normalize('NFKC').replace(/[.,]/g,'').trim().replace(/\s+/g, ' ').toLowerCase();
const phone = x => String(x || '').replace(/\D/g, '').replace(/^0/, '62');
const fail = (status, message) => Object.assign(new Error(message), { status });
const system = { id: null, username: 'google-form' };
async function initDb(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS brtm_swim_owner_sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES brtm_users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL)`);
  await db.query(`CREATE TABLE IF NOT EXISTS brtm_photos (athlete_id INTEGER PRIMARY KEY REFERENCES data_klub(id) ON DELETE CASCADE, mime TEXT NOT NULL, base64 TEXT NOT NULL)`);
  await db.query(`CREATE TABLE IF NOT EXISTS brtm_parents (id SERIAL PRIMARY KEY, athlete_id INTEGER UNIQUE NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE)`);
  await db.query(`ALTER TABLE brtm_parents ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.query(`CREATE TABLE IF NOT EXISTS brtm_parent_sessions (token_hash TEXT PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES brtm_parents(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL)`);
  await db.query(`CREATE TABLE IF NOT EXISTS brtm_form_keys (kind TEXT PRIMARY KEY CHECK (kind IN ('prestasi','nonprestasi')), token_hash TEXT NOT NULL, form_id TEXT, form_url TEXT, last_received_at TIMESTAMPTZ)`);
  await db.query(`CREATE TABLE IF NOT EXISTS brtm_registrations (id SERIAL PRIMARY KEY, kind TEXT NOT NULL, response_id TEXT NOT NULL, payload JSONB NOT NULL, status TEXT NOT NULL, athlete_id INTEGER REFERENCES data_klub(id) ON DELETE SET NULL, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(kind,response_id))`);
}
function mount(app, h) {
  const { pool, wrap, auth, owner, changed, transaction, rows, record, save, audit, payments, passwordHash, verify, limit, secureCookies } = h;
  // Parent sessions never authenticate the staff API; the two cookies and tables are separate.
  const cookie = (res, value, age = 7 * 86400) => res.setHeader('Set-Cookie', `brtm_swim_session=${value}; HttpOnly; SameSite=Strict; Path=/swim; Max-Age=${age}${secureCookies ? '; Secure' : ''}`);
  const cookieToken = req => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('brtm_swim_session='))?.slice(18);
  app.use('/swim/api', (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.get('X-BRTM-Request') !== '1') return next(fail(403, 'Muat ulang halaman'));
      try { if (req.get('origin') && new URL(req.get('origin')).host !== req.get('host')) return next(fail(403, 'Asal permintaan tidak diizinkan')); } catch { return next(fail(403, 'Asal permintaan tidak valid')); }
    } next();
  });
  async function resolvedParent(parent){
    if(!parent)return null;
    const a=(await pool.query("SELECT data FROM data_klub WHERE jenis='atlet' AND id=$1",[parent.athlete_id])).rows[0]?.data;
    if(!a?.mergedInto)return a?parent:null;
    const canonical=(await pool.query("SELECT id,data FROM data_klub WHERE jenis='atlet' AND id=$1",[a.mergedInto])).rows[0];
    if(!canonical||canonical.data.mergedInto)return null;
    const account=(await pool.query('SELECT active,deleted FROM brtm_parents WHERE athlete_id=$1',[canonical.id])).rows[0];if(account&&(!account.active||account.deleted))return null;
    return {...parent,athlete_id:canonical.id};
  }
  const parentAuth = wrap(async (req, res, next) => {
    const token = cookieToken(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw fail(401, 'Silakan masuk ke BRTM SWIM');
    const ownerSession = (await pool.query(`SELECT u.* FROM brtm_swim_owner_sessions s JOIN brtm_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE AND u.role='owner' AND u.must_change=FALSE`, [digest(token)])).rows[0];
    if (ownerSession) { req.swimOwner = ownerSession; return next(); }
    const r = await pool.query(`SELECT p.* FROM brtm_parent_sessions s JOIN brtm_parents p ON p.id=s.parent_id JOIN data_klub a ON a.id=p.athlete_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND p.active=TRUE AND p.deleted=FALSE AND a.jenis='atlet'`, [digest(token)]);
    req.parent=await resolvedParent(r.rows[0]);if (!req.parent) throw fail(401, 'Silakan masuk ke BRTM SWIM');next();
  });
  require('./community').mountParent(app,{pool,wrap,parentAuth,transaction,rows,audit,limit});
  async function provision(db, athlete) {
    const existing = (await db.query('SELECT id,username,active FROM brtm_parents WHERE athlete_id=$1', [athlete.id])).rows[0];
    if (existing) return existing;
    const base = norm(athlete.nama); let username = base;
    if ((await db.query('SELECT id FROM brtm_parents WHERE username=$1', [username])).rows.length) username = base + ' #' + athlete.id;
    // The suffix loop also handles a child's literal name already containing a suffix.
    while ((await db.query('SELECT id FROM brtm_parents WHERE username=$1', [username])).rows.length) username += '-';
    return (await db.query('INSERT INTO brtm_parents (athlete_id,username,password_hash) VALUES ($1,$2,$3) RETURNING id,username,active', [athlete.id, username, await passwordHash('brtm', 4)])).rows[0];
  }
  app.post('/swim/api/login', wrap(async (req, res) => {
    const username = norm(req.body?.username).slice(0, 200);
    const attemptKey=limit(req, 'swim:' + username, 8); limit(req, 'swim-total', 40, false);
    const staff = (await pool.query("SELECT * FROM brtm_users WHERE username=$1 AND role='owner' AND active=TRUE AND must_change=FALSE", [username])).rows[0];
    if (staff && await verify(req.body?.password,staff.password_hash)) {
      limit.reset(attemptKey);
      const token=crypto.randomBytes(32).toString('hex');
      await pool.query('DELETE FROM brtm_swim_owner_sessions WHERE expires_at<NOW()');
      await pool.query('INSERT INTO brtm_swim_owner_sessions VALUES ($1,$2,$3)',[digest(token),staff.id,new Date(Date.now()+7*86400000)]);
      await audit(pool,staff,'masuk-owner-swim'); cookie(res,token); return res.json({ok:true,role:'owner'});
    }
    const u = await resolvedParent((await pool.query(`SELECT p.* FROM brtm_parents p JOIN data_klub a ON a.id=p.athlete_id WHERE p.username=$1 AND a.jenis='atlet'`, [username])).rows[0]);
    const fallback = '00000000000000000000000000000000:' + '00'.repeat(64);
    if (!(await verify(req.body?.password, u?.password_hash || fallback)) || !u?.active || u.deleted) { limit(req, 'swim-total', 40); throw fail(401, 'Nama anak atau kata sandi salah. Hubungi admin jika perlu bantuan.'); }
    limit.reset(attemptKey);
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('DELETE FROM brtm_parent_sessions WHERE expires_at<NOW()');
    await pool.query('INSERT INTO brtm_parent_sessions VALUES ($1,$2,$3)', [digest(token), u.id, new Date(Date.now() + 7 * 86400000)]);
    await pool.query("INSERT INTO brtm_audit(username,action,jenis,record_id,login_context) VALUES($1,'masuk-orangtua','orangtua',$2,$3)",[u.username,String(u.athlete_id),JSON.stringify(require('./workflow').loginContext(req))]);
    cookie(res, token); res.json({ ok: true });
  }));
  app.post('/swim/api/logout', wrap(async (req, res) => {
    const token = cookieToken(req); if (token) await pool.query('DELETE FROM brtm_parent_sessions WHERE token_hash=$1', [digest(token)]);
    if (token) await pool.query('DELETE FROM brtm_swim_owner_sessions WHERE token_hash=$1',[digest(token)]);
    cookie(res, '', 0); res.json({ ok: true });
  }));
  async function dashboard(req, res, athleteId) {
    const a = await record(pool, 'atlet', athleteId), today = B.today(), month = today.slice(0, 7);
    const prestasi = B.canonical(a.kelompok) === 'Prestasi Class';
    // Read only this child's operational records. Never share a dashboard cache
    // across accounts; every response still checks the current authenticated child.
    const project=r=>r.rows.map(x=>({...x.data,id:String(x.id)}));
    const ownRows=async kind=>project(await pool.query("SELECT id,data FROM data_klub WHERE jenis=$1 AND data->>'atletId'=$2 ORDER BY id DESC",[kind,a.id]));
    const [names,paymentRows,ownAttendance,ownEvaluations,coachResult]=await Promise.all([
      pool.query("SELECT data->>'nama' AS nama FROM data_klub WHERE jenis='atlet'"),
      pool.query("SELECT id,data FROM data_klub WHERE jenis='pembayaran' AND (data->>'atletId'=$1 OR COALESCE(data->>'atletId','')='') ORDER BY id DESC",[a.id]),
      ownRows('absensi'),ownRows('perkembangan'),
      pool.query("SELECT id,nama FROM brtm_users WHERE active=TRUE AND role='coach'")
    ]);
    const uniqueName = names.rows.filter(x => norm(x.nama) === norm(a.nama)).length === 1;
    const selected=project(paymentRows).filter(p=>p.atletId?String(p.atletId)===a.id:uniqueName&&norm(p.namaAtlet)===norm(a.nama));
    const packs = (await payments(pool,false,selected)).sort((x, y) => String(y.tanggal).localeCompare(String(x.tanggal)) || Number(y.id) - Number(x.id));
    const settled=packs.filter(p=>p.status==='Lunas'&&!p.sppTidakDitagih);
    const sppState=(await SPP.summaries(pool))[a.id]||{saldoKredit:0,sppMenungguOwner:false};
    const paid = packs.filter(p => B.cashReceived(p)>0).sort((x, y) => String(y.dibayarPada || y.tanggal).localeCompare(String(x.dibayarPada || x.tanggal)) || Number(y.id) - Number(x.id));
    const pack = packs.find(p => p.statusMasaBerlaku === 'Aktif') || packs[0];
    const attendance = ownAttendance.sort((x, y) => String(y.tanggal).localeCompare(String(x.tanggal)) || Number(y.id) - Number(x.id));
    const present = attendance.filter(x => x.status === 'Hadir');
    const evaluations = ownEvaluations.sort((x, y) => String(y.tanggal).localeCompare(String(x.tanggal)) || Number(y.id) - Number(x.id));
    const linkedSchedules=[...new Set([...attendance,...evaluations].map(x=>x.jadwalId).filter(Boolean).map(String))];
    const allSchedules=project(await pool.query("SELECT id,data FROM data_klub WHERE jenis='jadwal' AND (EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(data->'atletIds')='array' THEN data->'atletIds' ELSE '[]'::jsonb END) aid WHERE aid=$1) OR id::text=ANY($2::text[])) ORDER BY id DESC",[a.id,linkedSchedules]));
    const schedules = allSchedules.filter(x => x.atletIds?.map(String).includes(a.id)).sort((x, y) => (x.tanggal + x.mulai).localeCompare(y.tanggal + y.mulai));
    const coachProfiles=coachResult.rows;
    const unpaid = packs.filter(p => p.status === 'Belum Lunas');
    const firstPayment=prestasi?(await SPP.firstPayments(pool))[a.id]:null;
    const cycleMonth=B.prestasiPeriod(today,firstPayment);
    const hasMonthlyAttendance=present.some(x=>B.prestasiPeriod(x.tanggal,firstPayment)===cycleMonth&&B.canonical(x.jenisKelas||allSchedules.find(s=>s.id===x.jadwalId)?.jenisKelas||a.kelompok)==='Prestasi Class');
    const paymentSummary=prestasi?require('./athlete-payment-status').prestasi(packs,firstPayment,hasMonthlyAttendance,sppState.sppMenungguOwner,today):require('./athlete-payment-status').nonprestasi(packs,today);
    const nextPayment = prestasi?B.prestasiNextDue(packs,firstPayment,today):unpaid.length ? unpaid.map(p => p.jatuhTempo || p.tanggal).filter(Boolean).sort()[0] : pack?.berlakuSampai || null;
    // Explicit projection: no contacts, other children, staff notes, or raw financial records.
    res.json({ viewRefs: req.swimOwner ? [] : [...packs.filter(r=>String(r.atletId)===a.id).map(r=>({kind:'pembayaran',id:r.id,revision:require('./operations').revision(r)})),...attendance.map(r=>({kind:'absensi',id:r.id,revision:require('./operations').revision(r)})),...evaluations.map(r=>({kind:'perkembangan',id:r.id,revision:require('./operations').revision(r)}))], today, updatedAt: new Date().toISOString(), role: req.swimOwner ? 'owner' : 'parent', profil: { id:a.id, revision:P.revision(a), loginName:req.parent?.username||'', memberId:a.memberId, ...Object.fromEntries(P.FIELDS.map(k=>[k,a[k]||''])), kelompok: B.canonical(a.kelompok), status:a.status||'Aktif', foto: '/swim/api/photo/'+a.id },
      latihan: { prestasi, hadirBulanIni: present.filter(x => x.tanggal?.startsWith(month)).length, hadirTotal: present.length, terpakaiPaket: prestasi ? null : pack?.terpakai ?? null, sisaPertemuan: prestasi ? null : pack?.statusMasaBerlaku === 'Aktif' ? pack.sisaPertemuan : pack ? 0 : null, kuota: prestasi ? null : pack?.totalPertemuan ?? null, paketLunas:prestasi?paymentSummary.sppPeriodeAktifLunas===true:pack?.status==='Lunas', statusPaket: prestasi ? 'Bulanan · kehadiran fleksibel' : pack?.statusMasaBerlaku || 'Belum ada paket', berlakuSampai: prestasi ? null : pack?.berlakuSampai || null },
      pembayaran: { ...sppState,tanggalPembayaranPertama:firstPayment||null,terakhirBayar: paid[0]?.dibayarPada || paid[0]?.tanggal || null, bayarBerikutnya: nextPayment, adaTunggakan: prestasi?unpaid.some(p=>p.jatuhTempo<today):unpaid.length > 0, statusDetail:paymentSummary?.statusSPPDetail||'',status: prestasi?(paymentSummary.statusSPP==='Lunas'&&paymentSummary.sppPeriodeAktifLunas?'Lunas periode ini':paymentSummary.statusSPP):sppState.sppMenungguOwner?'Menunggu Persetujuan Owner':paymentSummary.statusSPP },
      catatanwaktu: prestasi ? (await ownRows('catatanwaktu')).map(x=>({id:x.id,tanggal:x.tanggal,gaya:x.gaya,jarak:x.jarak,kolam:x.kolam,detik:x.detik,testName:x.testName||''})) : [],
      hasilLomba:prestasi?(await require('./race-results').list(pool,a.id)).map(require('./race-results').project):[],
      riwayatPembayaran:await require('./parent-ledger').list(pool,a.id,packs),
      jadwal: schedules.map(x => {const r=attendance.find(r=>r.jadwalId===x.id);return {id:x.id,tanggal:x.tanggal,mulai:x.mulai,selesai:x.selesai,lokasi:x.lokasi,pelatih:x.pelatih,coachId:x.coachId||null,coaches:coachProfiles.filter(c=>[x.coachId,...(x.coachIds||[])].map(String).includes(String(c.id))).map(c=>({id:String(c.id),nama:c.nama})),statusSesi:x.statusSesi||'Terjadwal',alasanLibur:x.alasanLibur||'',absensi:r?{status:r.status,keterangan:r.catatan||''}:null};}),
      tagihan: packs.map(r=>({id:r.id,jenisKelas:r.jenisKelas,status:r.status,totalTagihan:r.totalTagihan,tanggal:r.tanggal,berlakuSampai:r.berlakuSampai,sisaPertemuan:r.sisaPertemuan,sppMetode:r.sppMetode,sppTidakDitagih:r.sppTidakDitagih,penerimaanTunai:B.cashReceived(r),periodeMulai:r.periodeMulai,periodeSelesai:r.periodeSelesai,periodeLabel:r.periodeLabel,invoicePada:r.invoicePada,invoiceTersedia:r.invoiceTersedia,jatuhTempo:r.jatuhTempo})),
      absensi: attendance.map(x => ({ tanggal: x.tanggal, status: x.status })),
      evaluasi: evaluations.map(x => parentEvaluation(x,a,allSchedules.find(s=>s.id===x.jadwalId))) });
  }
  app.get('/api/owner/athlete/:id/dashboard',auth,changed,owner,wrap(async(req,res)=>{req.swimOwner=req.user;return dashboard(req,res,req.params.id);}));
  app.get('/swim/api/regular/options',parentAuth,wrap(async(req,res)=>{if(req.swimOwner)throw fail(403,'Gunakan menu bantuan Regular pada aplikasi staf');res.json(await require('./regular').options(pool,h,req.parent.athlete_id,B.today()));}));
  app.post('/swim/api/regular',parentAuth,wrap(async(req,res)=>{if(req.swimOwner)throw fail(403,'Gunakan menu bantuan Regular pada aplikasi staf');if(req.body.batal!==true&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.mulai||''))throw fail(400,'Pilih jam kedatangan terlebih dahulu');res.json(await transaction(db=>require('./regular').book(db,h,{id:null,username:'orangtua:'+req.parent.id},req.parent.athlete_id,B.today(),req.body.mulai,req.body.batal===true)));}));
  app.post('/swim/api/viewed',parentAuth,wrap(async(req,res)=>{
    if(req.swimOwner)throw fail(403,'Khusus orang tua');
    const entries=req.body.entries;
    if(!Array.isArray(entries)||entries.length>2000)throw fail(400,'Daftar tampilan tidak valid');
    const aid=String(req.parent.athlete_id);
    await transaction(async c=>{for(const e of entries){
      if(!['perkembangan','absensi','pembayaran'].includes(e.kind))throw fail(400,'Jenis tampilan tidak valid');
      const r=await record(c,e.kind,e.id);
      if(String(r.atletId)!==aid||require('./operations').revision(r)!==e.revision)continue;
      await c.query('INSERT INTO brtm_parent_views (athlete_id,kind,record_id,revision) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',[aid,e.kind,String(r.id),e.revision]);
    }});res.json({ok:true});
  }));
  const swimOwner = (req,res,next) => req.swimOwner ? next() : next(fail(403,'Hanya Owner BRTM SWIM'));
  async function putPhoto(db,athleteId,value) {
    const image=await require('./images').compress(value);
    await db.query('INSERT INTO brtm_photos (athlete_id,mime,base64) VALUES ($1,$2,$3) ON CONFLICT(athlete_id) DO UPDATE SET mime=EXCLUDED.mime,base64=EXCLUDED.base64',[athleteId,image.mime,image.base64]);
  }
  app.get('/swim/api/dashboard',parentAuth,wrap(async(req,res)=>{
    if (!req.swimOwner) return dashboard(req,res,req.parent.athlete_id);
    const athletes=(await rows(pool,'atlet')).filter(a=>!a.mergedInto);
    const accounts=(await pool.query('SELECT athlete_id,username,active,deleted FROM brtm_parents')).rows;
    const active=athletes.filter(a=>a.status!=='Nonaktif');
    res.json({role:'owner',today:B.today(),updatedAt:new Date().toISOString(),counts:{prestasi:active.filter(a=>B.canonical(a.kelompok)==='Prestasi Class').length,pemula:active.filter(a=>B.canonical(a.kelompok)!=='Prestasi Class').length},atlet:athletes.map(a=>{const p=accounts.find(p=>String(p.athlete_id)===a.id);return {id:a.id,nama:a.nama,namaPanggilan:a.namaPanggilan||'',kelompok:B.canonical(a.kelompok),status:a.status||'Aktif',username:p?.username||'',active:p?.active||false,deleted:p?.deleted||false};})});
  }));
  app.get('/swim/api/owner/atlet/:id',parentAuth,swimOwner,wrap(async(req,res)=>dashboard(req,res,req.params.id)));
  app.put('/swim/api/profile',parentAuth,wrap(async(req,res)=>{
    if(!req.parent||req.swimOwner)throw fail(403,'Khusus profil anak pada akun orang tua');
    const allowed=[...P.FIELDS.filter(k=>k!=='jadwalPilihan'),'foto','revision'];
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).some(k=>!allowed.includes(k)))throw fail(400,'Hanya biodata dan foto anak yang dapat diubah di sini');
    if(Object.hasOwn(req.body,'namaPanggilan')&&!String(req.body.namaPanggilan||'').trim())throw fail(400,'Nama panggilan wajib diisi');
    const photo=req.body.foto?await require('./images').staff(req.body.foto):null;
    await transaction(async c=>{
      await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
      const old=await record(c,'atlet',String(req.parent.athlete_id),true);
      if(req.body.revision!==P.revision(old))throw fail(409,'Biodata sudah berubah. Tutup editor, muat ulang data, lalu periksa kembali sebelum menyimpan.');
      const data=P.cleanProfile(req.body,old),actor={id:null,username:'orangtua:'+req.parent.id};
      const conflicts=require('./roster-identity').candidates(await rows(c,'atlet'),data).filter(a=>a.tanggalLahir&&a.tanggalLahir===data.tanggalLahir&&norm(a.nama)===norm(data.nama));
      if(conflicts.length)throw fail(409,'Identitas ini sudah tercatat pada atlet lain. Hubungi Owner untuk mencocokkan data.');
      await save(c,actor,'atlet',data,old);
      if(photo){await putPhoto(c,old.id,photo);await audit(c,actor,'ubah-foto-swim','atlet',old.id);}
      await audit(c,actor,'ubah-profil-orangtua','atlet',old.id,{revision:P.revision(old)},{fields:P.FIELDS.filter(k=>old[k]!==data[k]),foto:!!photo});
    });res.json({pesan:'Profil dan foto tersimpan serta tersinkron ke BRTM. ID login tetap sama.'});
  }));
  app.put('/swim/api/owner/atlet/:id',parentAuth,swimOwner,wrap(async(req,res)=>{
    await transaction(async c=>{
      const old=await record(c,'atlet',req.params.id,true),data=P.cleanProfile(req.body,old);
      await save(c,req.swimOwner,'atlet',data,old);
      if(req.body.foto) {await putPhoto(c,old.id,req.body.foto);await audit(c,req.swimOwner,'ubah-foto-swim','atlet',old.id);}
    });res.json({pesan:'Biodata anak diperbarui'});
  }));
  app.put('/swim/api/owner/akun/:id',parentAuth,swimOwner,wrap(async(req,res)=>{
    if(typeof req.body.active!=='boolean')throw fail(400,'Status akun tidak valid');
    await transaction(async c=>{
      await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');const a=await record(c,'atlet',req.params.id);
      await provision(c,a);await c.query('UPDATE brtm_parents SET active=$1,deleted=FALSE WHERE athlete_id=$2',[req.body.active,a.id]);
      await c.query('DELETE FROM brtm_parent_sessions WHERE parent_id IN (SELECT id FROM brtm_parents WHERE athlete_id=$1)',[a.id]);
      await audit(c,req.swimOwner,req.body.active?'aktifkan-akun-swim':'nonaktifkan-akun-swim','atlet',a.id);
    });res.json({pesan:'Status akun diperbarui'});
  }));
  app.delete('/swim/api/owner/akun/:id',parentAuth,swimOwner,wrap(async(req,res)=>{
    await transaction(async c=>{
      await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');const a=await record(c,'atlet',req.params.id);
      await provision(c,a);await c.query('UPDATE brtm_parents SET active=FALSE,deleted=TRUE WHERE athlete_id=$1',[a.id]);
      await c.query('DELETE FROM brtm_parent_sessions WHERE parent_id IN (SELECT id FROM brtm_parents WHERE athlete_id=$1)',[a.id]);
      await audit(c,req.swimOwner,'hapus-dashboard-akun-swim','atlet',a.id);
    });res.json({pesan:'Dashboard dan akun disembunyikan. Riwayat latihan dan pembayaran klub tetap tersimpan; Owner dapat memulihkan akses.'});
  }));
  app.get('/swim/api/photo/:id',parentAuth,wrap(async(req,res)=>{
    if(!req.swimOwner&&String(req.parent.athlete_id)!==req.params.id)throw fail(403,'Foto tidak dapat diakses');
    const p=(await pool.query('SELECT mime,base64 FROM brtm_photos WHERE athlete_id=$1',[req.params.id])).rows[0];
    if(!p)return res.sendStatus(404);res.type(p.mime).send(Buffer.from(p.base64,'base64'));
  }));
  app.get('/swim/api/notifications',parentAuth,wrap(async(req,res)=>{
    if(!req.parent)throw fail(403,'Notifikasi khusus akun orang tua');
    const before=req.query.before;if(before&&!/^[1-9]\d{0,17}$/.test(before))throw fail(400,'Nomor halaman tidak valid');
    res.json((await pool.query(`SELECT n.id,n.title,n.body,n.created_at,n.event_key,n.read_at,p.announcement_id AS photo_id FROM brtm_notifications n LEFT JOIN brtm_announcement_photos p ON n.event_key='pengumuman:'||p.announcement_id::text WHERE n.athlete_id=$1 AND NOT EXISTS(SELECT 1 FROM brtm_billing_notices b WHERE n.event_key='invoice:'||b.id::text AND b.data->>'sppSuperseded'='true') AND ($2::bigint IS NULL OR n.id<$2::bigint) ORDER BY n.id DESC LIMIT 50`,[req.parent.athlete_id,before||null])).rows);
  }));
  app.get('/swim/api/push/key',parentAuth,wrap(async(req,res)=>{
    if(!req.parent)throw fail(403,'Notifikasi khusus akun orang tua');
    res.json({publicKey:(await pool.query('SELECT public_key FROM brtm_push_keys WHERE id=1')).rows[0].public_key});
  }));
  app.post('/swim/api/push/subscribe',parentAuth,wrap(async(req,res)=>{
    if(!req.parent)throw fail(403,'Notifikasi khusus akun orang tua');
    const s=req.body.subscription;
    let url;try{url=new URL(s?.endpoint);}catch{throw fail(400,'Langganan notifikasi tidak valid');}
    const allowed=url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.push.apple.com')||url.hostname==='web.push.apple.com'||url.hostname==='wns2-par02p.notify.windows.com'||url.hostname.endsWith('.notify.windows.com');
    if(url.protocol!=='https:'||url.port||url.username||url.password||!allowed||!s.keys||!/^[-_a-zA-Z0-9]{16,200}$/.test(s.keys.auth)||!/^[-_a-zA-Z0-9]{50,200}$/.test(s.keys.p256dh))throw fail(400,'Langganan notifikasi tidak valid');
    await pool.query('INSERT INTO brtm_push_subscriptions(endpoint,parent_id,subscription) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET parent_id=EXCLUDED.parent_id,subscription=EXCLUDED.subscription',[url.href,req.parent.id,JSON.stringify({endpoint:url.href,keys:s.keys})]);
    res.json({pesan:'Notifikasi HP diaktifkan'});
  }));
  app.post('/swim/api/push/unsubscribe',parentAuth,wrap(async(req,res)=>{
    if(req.parent)await pool.query('DELETE FROM brtm_push_subscriptions WHERE endpoint=$1 AND parent_id=$2',[req.body.endpoint,req.parent.id]);res.json({ok:true});
  }));
  app.post('/swim/api/notifications/:id/read',parentAuth,wrap(async(req,res)=>{if(!req.parent)throw fail(403,'Khusus orang tua');await pool.query('UPDATE brtm_notifications SET read_at=NOW() WHERE id=$1 AND athlete_id=$2',[req.params.id,req.parent.athlete_id]);res.json({ok:true});}));
  async function parentCoach(req){if(!req.parent)throw fail(403,'Khusus orang tua');const schedules=await rows(pool,'jadwal');if(!schedules.some(s=>[s.coachId,...(s.coachIds||[])].map(String).includes(req.params.id)&&s.atletIds?.map(String).includes(String(req.parent.athlete_id))))throw fail(404,'Profil pelatih tidak tersedia');const u=(await pool.query('SELECT id,nama,profile FROM brtm_users WHERE id=$1',[req.params.id])).rows[0];if(!u)throw fail(404,'Profil pelatih tidak tersedia');return u;}
  app.get('/swim/api/coaches/:id',parentAuth,wrap(async(req,res)=>{const u=await parentCoach(req);res.json({nama:u.nama,jabatan:u.profile.jabatan||'Pelatih',noWa:u.profile.noWa||'',foto:u.profile.photo?'/swim/api/coaches/'+u.id+'/photo':null});}));
  app.get('/swim/api/coaches/:id/photo',parentAuth,wrap(async(req,res)=>{const u=await parentCoach(req),p=u.profile.photo;if(!p)throw fail(404,'Foto belum tersedia');res.type(p.mime).send(Buffer.from(p.base64,'base64'));}));
  app.get('/swim/api/receipt/:key',parentAuth,wrap(async(req,res)=>{if(!req.parent)throw fail(403,'Khusus orang tua');const a=await record(pool,'atlet',req.parent.athlete_id),packs=(await payments()).filter(p=>String(p.atletId)===a.id),r=(await require('./parent-ledger').list(pool,a.id,packs)).find(r=>r.key===req.params.key&&r.status==='Diterima');if(!r)throw fail(404,'Kuitansi tidak tersedia');const p=packs.find(p=>p.id===r.billId);if(!p)throw fail(404,'Kuitansi tidak tersedia');require('./reports').bill(res,{...p,penerimaanTunai:r.amount,dibayarPada:r.paidOn},'receipt',r.key.replace(':','-'));}));
  app.get('/swim/api/statement',parentAuth,wrap(async(req,res)=>{if(!req.parent)throw fail(403,'Khusus orang tua');const a=await record(pool,'atlet',req.parent.athlete_id),packs=(await payments()).filter(p=>String(p.atletId)===String(a.id));require('./reports').statement(res,a,await require('./parent-ledger').list(pool,a.id,packs));}));
  app.get('/swim/api/documents/:kind/:id',parentAuth,wrap(async(req,res)=>{
    const kind=req.params.kind;let p;
    if(kind==='notice'){const n=(await pool.query('SELECT * FROM brtm_billing_notices WHERE id=$1',[req.params.id])).rows[0];if(n&&!n.data.sppSuperseded)p=n.data;}
    else if(['invoice','receipt'].includes(kind))p=await record(pool,'pembayaran',req.params.id);
    if(!p||!req.swimOwner&&String(p.atletId)!==String(req.parent.athlete_id))throw fail(404,'Dokumen tidak tersedia');
    if(kind==='invoice'&&p.jenisKelas==='Prestasi Class'){p=B.prestasiView(p,(await SPP.firstPayments(pool))[p.atletId]);if(!p.invoiceTersedia)throw fail(409,'Invoice periode ini tersedia pada '+p.invoicePada+'. Toleransi pembayaran sampai akhir bulan.');}
    if(kind==='receipt'&&B.cashReceived(p)<=0)throw fail(400,'Belum ada penerimaan pembayaran');
    require('./reports').bill(res,p,kind==='receipt'?'receipt':'invoice',(kind==='notice'?'N':'')+req.params.id);
  }));
  app.use('/swim/api', (req, res) => res.status(404).json({ pesan: 'Bagian tidak ditemukan' }));
  app.get(/^\/swim$/, (req, res) => res.redirect('/swim/'));
  app.get('/swim/', (req, res) => res.sendFile(path.join(__dirname, 'public/swim/index.html')));

  const admin = [auth, changed, owner];
  app.get('/api/orangtua', ...admin, wrap(async (req, res) => {
    const accounts = (await pool.query('SELECT athlete_id,username,active FROM brtm_parents ORDER BY id')).rows;
    res.json((await rows(pool, 'atlet')).filter(a=>!a.mergedInto).map(a => ({ id: a.id, nama: a.nama, status: a.status, ...(accounts.find(p => String(p.athlete_id) === a.id) || { username: '', active: false }) })));
  }));
  app.post('/api/orangtua/siapkan', ...admin, wrap(async (req, res) => {
    const count = await transaction(async c => {
      await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE'); let n = 0;
      for (const a of await rows(c, 'atlet')) if (a.status !== 'Nonaktif') { await provision(c, a); n++; }
      await audit(c, req.user, 'siapkan-akun-orangtua', 'akun'); return n;
    }); res.json({ pesan: `${count} akun atlet aktif siap digunakan. Kata sandi: brtm.` });
  }));
  app.put('/api/orangtua/:id/credentials', ...admin, wrap(async (req, res) => {
    const username=norm(req.body?.username);
    if(!username||username.length>200)throw fail(400,'Nama pengguna wajib diisi, maksimal 200 karakter');
    const password=req.body?.password;
    if(password!==undefined&&typeof password!=='string')throw fail(400,'Kata sandi tidak valid');
    if(password&&(password.length<4||password.length>128))throw fail(400,'Kata sandi harus 4–128 karakter');
    const hash=password?await passwordHash(password,4):null;
    await transaction(async c=>{
      await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
      const a=await record(c,'atlet',req.params.id);
      if(a.mergedInto)throw fail(400,'Gunakan akun atlet utama');
      const duplicate=(await c.query('SELECT id FROM brtm_parents WHERE username=$1 AND athlete_id<>$2',[username,a.id])).rows[0];
      const staff=(await c.query("SELECT id FROM brtm_users WHERE username=$1 AND role='owner'",[username])).rows[0];
      if(duplicate||staff)throw fail(409,'Nama pengguna sudah digunakan. Pilih nama lain.');
      await provision(c,a);
      const before=(await c.query('SELECT username FROM brtm_parents WHERE athlete_id=$1',[a.id])).rows[0];
      await c.query('UPDATE brtm_parents SET username=$1,password_hash=COALESCE($2,password_hash) WHERE athlete_id=$3',[username,hash,a.id]);
      await c.query('DELETE FROM brtm_parent_sessions WHERE parent_id IN (SELECT id FROM brtm_parents WHERE athlete_id=$1)',[a.id]);
      await audit(c,req.user,'ubah-akses-orangtua','atlet',a.id,{username:before.username},{username,passwordChanged:!!hash});
    });
    res.json({pesan:'Akun orang tua diperbarui. Silakan masuk kembali dengan akun terbaru.'});
  }));
  app.put('/api/orangtua/:id', ...admin, wrap(async (req, res) => {
    if (typeof req.body.active !== 'boolean') throw fail(400, 'Status tidak valid');
    await transaction(async c => {
      await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE'); const a = await record(c, 'atlet', req.params.id);
      await provision(c, a); await c.query('UPDATE brtm_parents SET active=$1,deleted=FALSE WHERE athlete_id=$2', [req.body.active, a.id]);
      await c.query('DELETE FROM brtm_parent_sessions WHERE parent_id IN (SELECT id FROM brtm_parents WHERE athlete_id=$1)', [a.id]);
      await audit(c, req.user, req.body.active ? 'aktifkan-orangtua' : 'nonaktifkan-orangtua', 'atlet', a.id);
    }); res.json({ pesan: 'Akses orang tua diperbarui' });
  }));
  app.get('/api/pendaftaran', ...admin, wrap(async (req, res) => res.json((await pool.query('SELECT * FROM brtm_registrations ORDER BY id DESC')).rows)));
  app.get('/api/formulir', ...admin, wrap(async (req, res) => res.json((await pool.query('SELECT kind,form_url,last_received_at FROM brtm_form_keys ORDER BY kind')).rows)));
  app.post('/api/formulir/siapkan', ...admin, wrap(async (req, res) => {
    const kinds = ['prestasi', 'nonprestasi'], keys = {};
    // Downloading a replacement explicitly rotates the old credentials.
    await transaction(async c => {
      for (const kind of kinds) { keys[kind] = crypto.randomBytes(32).toString('hex'); await c.query('INSERT INTO brtm_form_keys (kind,token_hash) VALUES ($1,$2) ON CONFLICT(kind) DO UPDATE SET token_hash=EXCLUDED.token_hash', [kind, digest(keys[kind])]); }
      await audit(c, req.user, 'siapkan-integrasi-form');
    });
    const base = (secureCookies ? 'https' : req.protocol) + '://' + req.get('host');
    const script = fs.readFileSync(path.join(__dirname, 'scripts/google-forms.gs'), 'utf8').replace('__BRTM_CONFIG__', JSON.stringify({ base, keys })).replace('__BRTM_RULES__', fs.readFileSync(path.join(__dirname,'scripts/form-rules.json'),'utf8').trim());
    res.attachment('BRTM-Google-Forms.gs').type('text/plain').send(script);
  }));
  function cleanPayload(input, kind) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400, 'Data formulir tidak valid');
    const out = {};
    for (const k of ['nama','namaPanggilan','tanggalLahir','jk','tempatLahir','sekolah','kelasSekolah','alamat','noHpOrtu','namaOrtu','tujuan','riwayatRenang','persetujuan','versiKetentuan','kelompok','jadwalPilihan']) {
      if (input[k] != null && typeof input[k] !== 'string') throw fail(400, 'Isian tidak valid');
      out[k] = String(input[k] || '').trim(); if (out[k].length > (k === 'nama' ? 150 : 500)) throw fail(400, 'Isian terlalu panjang');
    }
    if (/^\d{2}-\d{2}-\d{4}$/.test(out.tanggalLahir)) out.tanggalLahir=out.tanggalLahir.split('-').reverse().join('-');
    if (!out.nama || !B.validDate(out.tanggalLahir) || out.tanggalLahir > B.today() || !/^\+?[0-9 ()-]{8,25}$/.test(out.noHpOrtu)) throw fail(400, 'Nama, tanggal lahir, dan WhatsApp orang tua wajib valid');
    if (!['Laki-laki','Perempuan'].includes(out.jk)) throw fail(400, 'Jenis kelamin tidak valid');
    out.kelompok = kind === 'prestasi' ? 'Prestasi Class' : B.canonical(out.kelompok);
    if (!Object.hasOwn(B.CLASSES, out.kelompok) || kind === 'nonprestasi' && out.kelompok === 'Prestasi Class') throw fail(400, 'Kelas tidak sesuai formulir');
    B.validateAge(out);
    if(input.versiKetentuan){
      const required=['namaPanggilan','namaOrtu','noHpOrtu','sekolah','kelasSekolah','alamat',kind==='prestasi'?'riwayatRenang':'tujuan'];
      if(required.some(k=>!out[k])||!['Saya telah membaca dan menyetujui ketentuan BRTM.',require('./registration').CONSENT].includes(out.persetujuan)||!input.foto)throw fail(400,'Lengkapi biodata, foto dan persetujuan ketentuan');
    }
    if(!input.foto)throw fail(400,'Foto anak wajib diunggah (foto bebas)');
    out.foto=P.photo(input.foto);
    return out;
  }
  async function applyRegistration(db, registration, target, source='Google Form', distinctReason='') {
    let p;
    try { p = cleanPayload(registration.payload, registration.kind); }
    catch (e) { if (target === 'new') throw e; p = {}; }
    let a;
    if (target === 'new') {
      if(require('./roster-identity').registrationMatch(await rows(db,'atlet'),p).possible.length)throw fail(409,'Data anak sama persis dengan data yang sudah terdaftar. Pendaftaran duplikat ditolak.');
      const profile={...p};delete profile.foto;
      a = await save(db, system, 'atlet', { ...profile, status: 'Aktif', sumber: source }, null);
    } else {
      const old = await record(db, 'atlet', target, true);
      // Keep existing class, name, status and training/financial history. Fill missing profile fields only.
      const data = { ...old };
      for (const k of ['namaPanggilan','tanggalLahir','jk','tempatLahir','sekolah','kelasSekolah','alamat','noHpOrtu','namaOrtu','tujuan','riwayatRenang','persetujuan','versiKetentuan','jadwalPilihan']) if (!data[k] && p[k]) data[k] = p[k];
      if(source==='Formulir BRTM'&&p.jadwalPilihan)data.jadwalPilihan=p.jadwalPilihan;
      a = await save(db, system, 'atlet', data, old);
    }
    if(p.foto) await putPhoto(db,a.id,p.foto);
    await provision(db, a);
    await db.query("UPDATE brtm_registrations SET status='Tersambung',athlete_id=$1,note=$2 WHERE id=$3", [a.id, target === 'new' ? 'Atlet baru dibuat' : 'Terhubung ke atlet lama; riwayat dipertahankan', registration.id]);
    return a;
  }
  require('./registration').mount(app,{pool,wrap,transaction,rows,limit,cleanPayload,applyRegistration});
  app.post('/integrations/google-forms/:kind', wrap(async (req, res) => {
    const kind = req.params.kind; if (!['prestasi','nonprestasi'].includes(kind)) throw fail(404, 'Formulir tidak ditemukan');
    limit(req, 'form-total', 300);
    const token = String(req.get('authorization') || '').replace(/^Bearer /, '');
    const key = (await pool.query('SELECT * FROM brtm_form_keys WHERE kind=$1', [kind])).rows[0];
    if (!/^[a-f0-9]{64}$/.test(token) || !key || !crypto.timingSafeEqual(Buffer.from(digest(token)), Buffer.from(key.token_hash))) throw fail(401, 'Kunci integrasi tidak valid');
    if (req.body?.action === 'register') {
      const formId = String(req.body.formId || ''), url = String(req.body.formUrl || '');
      if (!/^[\w-]{10,200}$/.test(formId) || !/^https:\/\/docs\.google\.com\/forms\/d\/(e\/)?[\w-]+\/(viewform|edit)$/.test(url)) throw fail(400, 'Alamat formulir tidak valid');
      await pool.query('UPDATE brtm_form_keys SET form_id=$1,form_url=$2 WHERE kind=$3', [formId, url, kind]); return res.json({ ok: true });
    }
    const responseId = String(req.body?.responseId || ''); if (!/^[\w-]{1,250}$/.test(responseId)) throw fail(400, 'ID jawaban tidak valid');
    let data, validationError = '';
    try { data = cleanPayload(req.body.data, kind); data.foto=await require('./images').compress(data.foto); }
    catch (e) {
      if (e.status !== 400 || !req.body.data || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) throw e;
      validationError = e.message; data = {};
      for (const k of ['nama','namaPanggilan','tanggalLahir','jk','tempatLahir','sekolah','kelasSekolah','alamat','noHpOrtu','namaOrtu','tujuan','riwayatRenang','persetujuan','versiKetentuan','kelompok','jadwalPilihan']) data[k] = typeof req.body.data[k] === 'string' ? req.body.data[k].slice(0,500) : '';
    }
    const result = await transaction(async c => {
      await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
      const old = (await c.query('SELECT id,status FROM brtm_registrations WHERE kind=$1 AND response_id=$2', [kind, responseId])).rows[0];
      if (old) return { status: old.status, duplicate: true };
      const r = (await c.query("INSERT INTO brtm_registrations (kind,response_id,payload,status) VALUES ($1,$2,$3,'Perlu diperiksa') RETURNING *", [kind, responseId, JSON.stringify(data)])).rows[0];
      if (validationError) {
        await c.query('UPDATE brtm_registrations SET note=$1 WHERE id=$2', ['Data belum valid: ' + validationError + '. Perbaiki profil atlet di BRTM, lalu hubungkan ke atlet yang benar.', r.id]);
        await c.query('UPDATE brtm_form_keys SET last_received_at=NOW() WHERE kind=$1', [kind]);
        return { status: 'Perlu diperiksa' };
      }
      const match=require('./roster-identity').registrationMatch(await rows(c,'atlet'),data);
      if(match.possible.length){
        await c.query('UPDATE brtm_registrations SET status=$1,note=$2 WHERE id=$3',['Ditolak duplikat','Seluruh biodata anak sama persis dengan data yang sudah terdaftar; tidak membuat atlet baru.',r.id]);
      }else await applyRegistration(c,r,'new');
      await c.query('UPDATE brtm_form_keys SET last_received_at=NOW() WHERE kind=$1', [kind]);
      return {status:match.possible.length?'Ditolak duplikat':'Tersambung',duplicateData:match.possible.length>0};
    }); res.json({ ok: true, ...result });
  }));
  app.post('/api/pendaftaran/:id/hubungkan', ...admin, wrap(async (req, res) => {
    await transaction(async c => {
      await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
      const r = (await c.query('SELECT * FROM brtm_registrations WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!r) throw fail(404, 'Pendaftaran tidak ditemukan'); if (r.status !== 'Perlu diperiksa') throw fail(409, 'Pendaftaran sudah diproses');
      if (req.body.atletId !== 'new' && !/^[1-9]\d{0,14}$/.test(String(req.body.atletId))) throw fail(400, 'Pilih atlet tujuan');
      const distinctReason=String(req.body.distinctReason||'').trim();
      if(req.body.atletId==='new'&&distinctReason&&(distinctReason.length<8||distinctReason.length>500))throw fail(400,'Isi alasan pembeda identitas 8–500 karakter');
      const a = await applyRegistration(c, r, req.body.atletId, 'Pemeriksaan Owner', req.body.atletId==='new'?distinctReason:'');
      await audit(c, req.user, 'hubungkan-pendaftaran', 'atlet', a.id, null, { registrationId: r.id, distinctReason:distinctReason||null });
    }); res.json({ pesan: 'Data formulir berhasil dihubungkan' });
  }));
}
module.exports = { initDb, mount };
