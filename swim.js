'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const B = require('./business');
const P = require('./profile');
const N = require('./notifications');
const {parentEvaluation}=require('./evaluation');
const digest = x => crypto.createHash('sha256').update(x).digest('hex');
const norm = x => String(x || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
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
  const parentAuth = wrap(async (req, res, next) => {
    const token = cookieToken(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw fail(401, 'Silakan masuk ke BRTM SWIM');
    const ownerSession = (await pool.query(`SELECT u.* FROM brtm_swim_owner_sessions s JOIN brtm_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE AND u.role='owner' AND u.must_change=FALSE`, [digest(token)])).rows[0];
    if (ownerSession) { req.swimOwner = ownerSession; return next(); }
    const r = await pool.query(`SELECT p.* FROM brtm_parent_sessions s JOIN brtm_parents p ON p.id=s.parent_id JOIN data_klub a ON a.id=p.athlete_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND p.active=TRUE AND p.deleted=FALSE AND a.jenis='atlet' AND COALESCE(a.data->>'status','Aktif')<>'Nonaktif'`, [digest(token)]);
    if (!r.rows[0]) throw fail(401, 'Silakan masuk ke BRTM SWIM'); req.parent = r.rows[0]; next();
  });
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
    limit(req, 'swim:' + username, 8); limit(req, 'swim-total', 40);
    const staff = (await pool.query("SELECT * FROM brtm_users WHERE username=$1 AND role='owner' AND active=TRUE AND must_change=FALSE", [username])).rows[0];
    if (staff && await verify(req.body?.password,staff.password_hash)) {
      const token=crypto.randomBytes(32).toString('hex');
      await pool.query('DELETE FROM brtm_swim_owner_sessions WHERE expires_at<NOW()');
      await pool.query('INSERT INTO brtm_swim_owner_sessions VALUES ($1,$2,$3)',[digest(token),staff.id,new Date(Date.now()+7*86400000)]);
      await audit(pool,staff,'masuk-owner-swim'); cookie(res,token); return res.json({ok:true,role:'owner'});
    }
    const u = (await pool.query(`SELECT p.* FROM brtm_parents p JOIN data_klub a ON a.id=p.athlete_id WHERE p.username=$1 AND a.jenis='atlet' AND COALESCE(a.data->>'status','Aktif')<>'Nonaktif'`, [username])).rows[0];
    const fallback = '00000000000000000000000000000000:' + '00'.repeat(64);
    if (!(await verify(req.body?.password, u?.password_hash || fallback)) || !u?.active || u.deleted) throw fail(401, 'Nama anak atau kata sandi salah. Hubungi admin jika perlu bantuan.');
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('DELETE FROM brtm_parent_sessions WHERE expires_at<NOW()');
    await pool.query('INSERT INTO brtm_parent_sessions VALUES ($1,$2,$3)', [digest(token), u.id, new Date(Date.now() + 7 * 86400000)]);
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
    const allAthletes = await rows(pool, 'atlet');
    const uniqueName = allAthletes.filter(x => norm(x.nama) === norm(a.nama)).length === 1;
    const packs = (await payments()).filter(p => p.atletId ? String(p.atletId) === a.id : uniqueName && norm(p.namaAtlet) === norm(a.nama)).sort((x, y) => String(y.tanggal).localeCompare(String(x.tanggal)) || Number(y.id) - Number(x.id));
    const paid = packs.filter(p => p.status === 'Lunas').sort((x, y) => String(y.dibayarPada || y.tanggal).localeCompare(String(x.dibayarPada || x.tanggal)) || Number(y.id) - Number(x.id));
    const pack = packs.find(p => p.status === 'Lunas' && p.statusMasaBerlaku === 'Aktif') || packs[0];
    const attendance = (await rows(pool, 'absensi')).filter(x => String(x.atletId) === a.id).sort((x, y) => String(y.tanggal).localeCompare(String(x.tanggal)) || Number(y.id) - Number(x.id));
    const present = attendance.filter(x => x.status === 'Hadir');
    const evaluations = (await rows(pool, 'perkembangan')).filter(x => String(x.atletId) === a.id).sort((x, y) => String(y.tanggal).localeCompare(String(x.tanggal)) || Number(y.id) - Number(x.id));
    const allSchedules=await rows(pool,'jadwal');
    const schedules = allSchedules.filter(x => x.atletIds?.map(String).includes(a.id) && x.tanggal >= today).sort((x, y) => (x.tanggal + x.mulai).localeCompare(y.tanggal + y.mulai));
    const unpaid = packs.filter(p => p.status === 'Belum Lunas');
    const nextPayment = unpaid.length ? unpaid.map(p => p.jatuhTempo || p.tanggal).filter(Boolean).sort()[0] : prestasi ? B.monthEnd(today) : pack?.berlakuSampai || null;
    // Explicit projection: no contacts, other children, staff notes, or raw financial records.
    res.json({ today, updatedAt: new Date().toISOString(), role: req.swimOwner ? 'owner' : 'parent', profil: { id:a.id, ...Object.fromEntries(P.FIELDS.map(k=>[k,a[k]||''])), kelompok: B.canonical(a.kelompok), status:a.status||'Aktif', foto: '/swim/api/photo/'+a.id },
      latihan: { prestasi, hadirBulanIni: present.filter(x => x.tanggal?.startsWith(month)).length, hadirTotal: present.length, terpakaiPaket: prestasi ? null : pack?.terpakai ?? null, sisaPertemuan: prestasi ? null : pack?.statusMasaBerlaku === 'Aktif' ? pack.sisaPertemuan : pack ? 0 : null, kuota: prestasi ? null : pack?.totalPertemuan ?? null, statusPaket: prestasi ? 'Bulanan · kehadiran fleksibel' : pack?.statusMasaBerlaku || 'Belum ada paket', berlakuSampai: prestasi ? null : pack?.berlakuSampai || null },
      pembayaran: { terakhirBayar: paid[0]?.dibayarPada || paid[0]?.tanggal || null, bayarBerikutnya: nextPayment, adaTunggakan: unpaid.length > 0, status: unpaid.length ? 'Belum Lunas' : prestasi ? paid.some(p => p.periode === month) ? 'Lunas bulan ini' : present.some(x => x.tanggal?.startsWith(month)) ? 'Perlu konfirmasi admin' : 'Belum ada kehadiran bulan ini' : pack?.status === 'Lunas' ? pack.statusMasaBerlaku === 'Aktif' ? 'Lunas' : 'Perlu perpanjangan' : 'Belum ada pembayaran' },
      catatanwaktu: prestasi ? (await rows(pool,'catatanwaktu')).filter(x=>String(x.atletId)===a.id).map(x=>({id:x.id,tanggal:x.tanggal,gaya:x.gaya,jarak:x.jarak,kolam:x.kolam,detik:x.detik,testName:x.testName||''})) : [],
      jadwal: schedules.map(x => ({ tanggal: x.tanggal, mulai: x.mulai, selesai: x.selesai, lokasi: x.lokasi, pelatih: x.pelatih, statusSesi:x.statusSesi||'Terjadwal', alasanLibur:x.alasanLibur||'' })),
      absensi: attendance.map(x => ({ tanggal: x.tanggal, status: x.status })),
      evaluasi: evaluations.map(x => parentEvaluation(x,a,allSchedules.find(s=>s.id===x.jadwalId))) });
  }
  const swimOwner = (req,res,next) => req.swimOwner ? next() : next(fail(403,'Hanya Owner BRTM SWIM'));
  async function putPhoto(db,athleteId,value) {
    const image=P.photo(value);
    await db.query('INSERT INTO brtm_photos (athlete_id,mime,base64) VALUES ($1,$2,$3) ON CONFLICT(athlete_id) DO UPDATE SET mime=EXCLUDED.mime,base64=EXCLUDED.base64',[athleteId,image.mime,image.base64]);
  }
  app.get('/swim/api/dashboard',parentAuth,wrap(async(req,res)=>{
    if (!req.swimOwner) return dashboard(req,res,req.parent.athlete_id);
    const athletes=await rows(pool,'atlet');
    const accounts=(await pool.query('SELECT athlete_id,username,active,deleted FROM brtm_parents')).rows;
    const active=athletes.filter(a=>a.status!=='Nonaktif');
    res.json({role:'owner',today:B.today(),updatedAt:new Date().toISOString(),counts:{prestasi:active.filter(a=>B.canonical(a.kelompok)==='Prestasi Class').length,pemula:active.filter(a=>B.canonical(a.kelompok)!=='Prestasi Class').length},atlet:athletes.map(a=>{const p=accounts.find(p=>String(p.athlete_id)===a.id);return {id:a.id,nama:a.nama,namaPanggilan:a.namaPanggilan||'',kelompok:B.canonical(a.kelompok),status:a.status||'Aktif',username:p?.username||'',active:p?.active||false,deleted:p?.deleted||false};})});
  }));
  app.get('/swim/api/owner/atlet/:id',parentAuth,swimOwner,wrap(async(req,res)=>dashboard(req,res,req.params.id)));
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
    res.json((await pool.query('SELECT id,title,body,created_at FROM brtm_notifications WHERE athlete_id=$1 ORDER BY id DESC LIMIT 50',[req.parent.athlete_id])).rows);
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
  app.use('/swim/api', (req, res) => res.status(404).json({ pesan: 'Bagian tidak ditemukan' }));
  app.get(/^\/swim$/, (req, res) => res.redirect('/swim/'));
  app.get('/swim/', (req, res) => res.sendFile(path.join(__dirname, 'public/swim/index.html')));

  const admin = [auth, changed, owner];
  app.get('/api/orangtua', ...admin, wrap(async (req, res) => {
    const accounts = (await pool.query('SELECT athlete_id,username,active FROM brtm_parents ORDER BY id')).rows;
    res.json((await rows(pool, 'atlet')).map(a => ({ id: a.id, nama: a.nama, status: a.status, ...(accounts.find(p => String(p.athlete_id) === a.id) || { username: '', active: false }) })));
  }));
  app.post('/api/orangtua/siapkan', ...admin, wrap(async (req, res) => {
    const count = await transaction(async c => {
      await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE'); let n = 0;
      for (const a of await rows(c, 'atlet')) if (a.status !== 'Nonaktif') { await provision(c, a); n++; }
      await audit(c, req.user, 'siapkan-akun-orangtua', 'akun'); return n;
    }); res.json({ pesan: `${count} akun atlet aktif siap digunakan. Kata sandi: brtm.` });
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
    for (const k of ['nama','namaPanggilan','tanggalLahir','jk','tempatLahir','sekolah','kelasSekolah','alamat','noHpOrtu','namaOrtu','tujuan','riwayatRenang','persetujuan','versiKetentuan','kelompok']) {
      if (input[k] != null && typeof input[k] !== 'string') throw fail(400, 'Isian tidak valid');
      out[k] = String(input[k] || '').trim(); if (out[k].length > (k === 'nama' ? 150 : 500)) throw fail(400, 'Isian terlalu panjang');
    }
    if (/^\d{2}-\d{2}-\d{4}$/.test(out.tanggalLahir)) out.tanggalLahir=out.tanggalLahir.split('-').reverse().join('-');
    if (!out.nama || !B.validDate(out.tanggalLahir) || out.tanggalLahir > B.today() || !/^\+?[0-9 ()-]{8,25}$/.test(out.noHpOrtu)) throw fail(400, 'Nama, tanggal lahir, dan WhatsApp orang tua wajib valid');
    if (!['Laki-laki','Perempuan'].includes(out.jk)) throw fail(400, 'Jenis kelamin tidak valid');
    out.kelompok = kind === 'prestasi' ? 'Prestasi Class' : B.canonical(out.kelompok);
    if (!Object.hasOwn(B.CLASSES, out.kelompok) || kind === 'nonprestasi' && out.kelompok === 'Prestasi Class') throw fail(400, 'Kelas tidak sesuai formulir');
    if(input.versiKetentuan){
      const required=['namaPanggilan','namaOrtu','noHpOrtu','sekolah','kelasSekolah','alamat',kind==='prestasi'?'riwayatRenang':'tujuan'];
      if(required.some(k=>!out[k])||out.persetujuan!=='Saya telah membaca dan menyetujui ketentuan BRTM.'||!input.foto)throw fail(400,'Lengkapi biodata, foto dan persetujuan ketentuan');
    }
    if(!input.foto)throw fail(400,'Foto anak wajib diunggah (foto bebas)');
    out.foto=P.photo(input.foto);
    return out;
  }
  async function applyRegistration(db, registration, target) {
    let p;
    try { p = cleanPayload(registration.payload, registration.kind); }
    catch (e) { if (target === 'new') throw e; p = {}; }
    let a;
    if (target === 'new') {
      const profile={...p};delete profile.foto;
      a = await save(db, system, 'atlet', { ...profile, status: 'Aktif', sumber: 'Google Form' }, null);
    } else {
      const old = await record(db, 'atlet', target, true);
      // Keep existing class, name, status and training/financial history. Fill missing profile fields only.
      const data = { ...old };
      for (const k of ['namaPanggilan','tanggalLahir','jk','tempatLahir','sekolah','kelasSekolah','alamat','noHpOrtu','namaOrtu','tujuan','riwayatRenang','persetujuan','versiKetentuan']) if (!data[k] && p[k]) data[k] = p[k];
      a = await save(db, system, 'atlet', data, old);
    }
    if(p.foto) await putPhoto(db,a.id,p.foto);
    await provision(db, a);
    await db.query("UPDATE brtm_registrations SET status='Tersambung',athlete_id=$1,note=$2 WHERE id=$3", [a.id, target === 'new' ? 'Atlet baru dibuat' : 'Terhubung ke atlet lama; riwayat dipertahankan', registration.id]);
    return a;
  }
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
    try { data = cleanPayload(req.body.data, kind); }
    catch (e) {
      if (e.status !== 400 || !req.body.data || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) throw e;
      validationError = e.message; data = {};
      for (const k of ['nama','namaPanggilan','tanggalLahir','jk','tempatLahir','sekolah','kelasSekolah','alamat','noHpOrtu','namaOrtu','tujuan','riwayatRenang','persetujuan','versiKetentuan','kelompok']) data[k] = typeof req.body.data[k] === 'string' ? req.body.data[k].slice(0,500) : '';
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
      const sameName = (await rows(c, 'atlet')).filter(a => norm(a.nama) === norm(data.nama));
      const exact = sameName.filter(a => a.tanggalLahir === data.tanggalLahir && phone(a.noHpOrtu) === phone(data.noHpOrtu) && B.canonical(a.kelompok) === data.kelompok && a.status !== 'Nonaktif');
      if (!sameName.length) await applyRegistration(c, r, 'new');
      else if (sameName.length === 1 && exact.length === 1) await applyRegistration(c, r, exact[0].id);
      else await c.query('UPDATE brtm_registrations SET note=$1 WHERE id=$2', ['Nama sudah ada. Owner perlu mencocokkan identitas/kelas sebelum menghubungkan.', r.id]);
      await c.query('UPDATE brtm_form_keys SET last_received_at=NOW() WHERE kind=$1', [kind]);
      return { status: !sameName.length || sameName.length === 1 && exact.length === 1 ? 'Tersambung' : 'Perlu diperiksa' };
    }); res.json({ ok: true, ...result });
  }));
  app.post('/api/pendaftaran/:id/hubungkan', ...admin, wrap(async (req, res) => {
    await transaction(async c => {
      await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
      const r = (await c.query('SELECT * FROM brtm_registrations WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!r) throw fail(404, 'Pendaftaran tidak ditemukan'); if (r.status !== 'Perlu diperiksa') throw fail(409, 'Pendaftaran sudah diproses');
      if (req.body.atletId !== 'new' && !/^[1-9]\d{0,14}$/.test(String(req.body.atletId))) throw fail(400, 'Pilih atlet tujuan');
      const a = await applyRegistration(c, r, req.body.atletId);
      await audit(c, req.user, 'hubungkan-pendaftaran', 'atlet', a.id, null, { registrationId: r.id });
    }); res.json({ pesan: 'Data formulir berhasil dihubungkan' });
  }));
}
module.exports = { initDb, mount };
