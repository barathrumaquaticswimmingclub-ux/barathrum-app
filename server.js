'use strict';
const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const { promisify } = require('util');
const B = require('./business');
const N = require('./notifications');
const SPP = require('./spp');
const scrypt = promisify(crypto.scrypt);
const KINDS = ['atlet', 'pelatih', 'jadwal', 'absensi', 'pembayaran', 'perkembangan', 'catatanwaktu', 'program'];
const APP_VERSION = '2.1.0';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
function text(value, label, required = true, max = 500) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw fail(400, `${label} wajib diisi dengan benar`);
  return value.trim();
}
function date(value, label = 'Tanggal') { if (!B.validDate(value)) throw fail(400, `${label} tidak valid`); return value; }
function id(value) { const v = String(value || ''); if (!/^[1-9]\d{0,14}$/.test(v)) throw fail(400, 'ID tidak valid'); return v; }
function publicUser(u) { return { id: String(u.id), username: u.username, nama: u.nama, role: u.role, active: u.active, mustChangePassword: u.must_change }; }
async function passwordHash(password, minimum = 5) {
  if (typeof password !== 'string' || password.length < minimum || password.length > 128) throw fail(400, 'Kata sandi harus 5–128 karakter');
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + (await scrypt(password, salt, 64)).toString('hex');
}
async function verify(password, hash) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, key] = hash.split(':');
  const check = await scrypt(password, salt, 64);
  return check.length === Buffer.from(key, 'hex').length && crypto.timingSafeEqual(check, Buffer.from(key, 'hex'));
}
async function initDb(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS data_klub (id SERIAL PRIMARY KEY, jenis VARCHAR(30) NOT NULL, data JSONB NOT NULL, dibuat_pada TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS brtm_users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, nama TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('owner','coach','prestasi')), password_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, must_change BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS brtm_sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES brtm_users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS brtm_audit (id BIGSERIAL PRIMARY KEY, user_id INTEGER, username TEXT NOT NULL, action TEXT NOT NULL, jenis TEXT, record_id TEXT, before_data JSONB, after_data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS brtm_install (id INTEGER PRIMARY KEY CHECK (id=1), completed BOOLEAN NOT NULL DEFAULT FALSE)`);
  await pool.query('INSERT INTO brtm_install (id, completed) VALUES (1, FALSE) ON CONFLICT (id) DO NOTHING');
  await pool.query(`CREATE INDEX IF NOT EXISTS brtm_data_kind ON data_klub (jenis)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS brtm_sessions_expiry ON brtm_sessions (expires_at)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS brtm_attendance_unique ON data_klub ((data->>'jadwalId'), (data->>'atletId')) WHERE jenis='absensi' AND data->>'jadwalId' IS NOT NULL AND data->>'atletId' IS NOT NULL`);
  await require('./swim').initDb(pool);
  await require('./operations').initDb(pool);
  await N.initDb(pool);
  await SPP.initDb(pool);
  await require('./community').initDb(pool);
  await require('./tester-reset').initDb(pool);
  await require('./workflow').initDb(pool);
}
function createApp({ pool, setupHash = process.env.BRTM_SETUP_HASH || require('./bootstrap.json').setupHash, secureCookies = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT_ID } = {}) {
  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; worker-src 'self'; manifest-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" }); next();
  });
  app.use('/integrations/google-forms',express.json({limit:'8mb'}));
  app.use('/swim/api/viewed',express.json({limit:'1mb'}));
  app.use('/swim/api/owner',express.json({limit:'8mb'}));
  app.use('/api/prestasi/time-table',express.json({limit:'1mb'}));
  app.use('/api/prestasi/times',express.json({limit:'1mb'}));
  app.use('/api/prestasi/attendance',express.json({limit:'1mb'}));
  app.use('/api/community/announcements',express.json({limit:'8mb'}));
  app.use('/api/program',express.json({limit:'30mb'}));
  app.use('/api/prestasi/ocr',express.json({limit:'8mb'}));
  app.use('/api/owner/staff',express.json({limit:'8mb'}));
  app.use(express.json({ limit: '100kb' }));
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const attempts = new Map();
  function limit(req, key, max = 8) {
    const now = Date.now();
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
    if (attempts.size > 10000) attempts.clear();
    const k = req.ip + ':' + key;
    const a = attempts.get(k) || { count: 0, until: now + 15 * 60000 };
    a.count++; attempts.set(k, a);
    if (a.count > max) throw fail(429, 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
    return k;
  }
  app.use(['/auth', '/api'], (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('X-BRTM-Request') !== '1') return next(fail(403, 'Muat ulang halaman sebelum menyimpan'));
      const origin = req.get('origin');
      if (origin) { try { if (new URL(origin).host !== req.get('host')) return next(fail(403, 'Asal permintaan tidak diizinkan')); } catch { return next(fail(403, 'Asal permintaan tidak valid')); } }
    } next();
  });
  const cookieToken = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('brtm_session='))?.slice(13);
  async function session(req) {
    const token = cookieToken(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const r = await pool.query(`SELECT u.* FROM brtm_sessions s JOIN brtm_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`, [digest(token)]);
    return r.rows[0] || null;
  }
  const auth = wrap(async (req, res, next) => { req.user = await session(req); if (!req.user) throw fail(401, 'Silakan masuk ke akun BRTM'); next(); });
  const owner = (req, res, next) => req.user.role === 'owner' ? next() : next(fail(403, 'Hanya Owner yang dapat mengakses bagian ini'));
  const changed = (req, res, next) => req.user.must_change ? next(fail(403, 'Ubah kata sandi awal terlebih dahulu')) : next();
  async function audit(db, user, action, jenis = null, recordId = null, before = null, after = null) {
    await db.query(`INSERT INTO brtm_audit (user_id,username,action,jenis,record_id,before_data,after_data) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [user?.id || null, user?.username || 'setup', action, jenis, recordId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
  }
  async function transaction(fn) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
    catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
  }
  async function rows(db, kind, lock = false) {
    const r = await db.query(`SELECT id,data FROM data_klub WHERE jenis=$1 ORDER BY id DESC${lock ? ' FOR UPDATE' : ''}`, [kind]);
    return r.rows.map(x => ({ ...x.data, id: String(x.id) }));
  }
  async function record(db, kind, recordId, lock = false) {
    const r = await db.query(`SELECT id,data FROM data_klub WHERE jenis=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`, [kind, id(recordId)]);
    if (!r.rowCount) throw fail(404, 'Data tidak ditemukan');
    return { ...r.rows[0].data, id: String(r.rows[0].id) };
  }
  async function save(db, user, kind, data, previous) {
    if(kind==='program')data=await require('./images').program({...data,grupProgram:data.grupProgram?.map(g=>({...g}))},previous);
    const payload = { ...data, diperbaruiPada: new Date().toISOString(), diperbaruiOleh: user.username }; delete payload.id;
    if (!previous) { payload.dibuatOleh = user.username; payload.dibuatOlehId = String(user.id); payload.dibuatPada = new Date().toISOString(); }
    const r = previous ? await db.query('UPDATE data_klub SET data=$1 WHERE jenis=$2 AND id=$3 RETURNING id,data', [JSON.stringify(payload), kind, previous.id]) : await db.query('INSERT INTO data_klub (jenis,data) VALUES ($1,$2) RETURNING id,data', [kind, JSON.stringify(payload)]);
    const out = { ...r.rows[0].data, id: String(r.rows[0].id) };
    await audit(db, user, previous ? 'ubah' : 'tambah', kind, out.id, previous, out); await SPP.afterSave(db,user,kind,out,previous); if(kind!=='pembayaran'||B.canonical(out.jenisKelas)!=='Prestasi Class')await N.afterSave(db,kind,out,previous); await require('./community').afterSave(db,kind,out); return kind==='pembayaran'&&B.canonical(out.jenisKelas)==='Prestasi Class'?record(db,kind,out.id):out;
  }
  function setCookie(res, token, maxAge = 7 * 86400) { res.setHeader('Set-Cookie', `brtm_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`); }
  app.get('/health', wrap(async (req, res) => { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'ok', version: APP_VERSION }); }));
  app.get('/auth/status', wrap(async (req, res) => { const r = await pool.query('SELECT completed FROM brtm_install WHERE id=1'); res.json({ configured: !!r.rows[0]?.completed, version: APP_VERSION }); }));
  app.post('/auth/setup', wrap(async (req, res) => {
    limit(req, 'setup', 5);
    if (typeof req.body?.token !== 'string' || digest(req.body.token) !== setupHash) throw fail(403, 'Kode aktivasi tidak valid');
    const hash = await passwordHash(req.body.password);
    const result = await transaction(async c => {
      const r = await c.query('SELECT completed FROM brtm_install WHERE id=1 FOR UPDATE');
      if (r.rows[0].completed) throw fail(409, 'Akun Owner sudah diaktifkan');
      if ((await c.query('SELECT id FROM brtm_users LIMIT 1')).rowCount) throw fail(409, 'Akun sudah tersedia');
      const u = await c.query(`INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES('owner','Owner BRTM','owner',$1,TRUE) RETURNING *`, [hash]);
      for (let i = 1; i <= 7; i++) await c.query(`INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$2,'coach',$3,TRUE)`, ['coach' + i, 'Coach ' + i, await passwordHash(crypto.randomBytes(24).toString('base64url'))]);
      await c.query(`INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES('prestasi','Tim Prestasi','prestasi',$1,TRUE)`, [await passwordHash(crypto.randomBytes(24).toString('base64url'))]);
      await c.query('UPDATE brtm_install SET completed=TRUE WHERE id=1'); await audit(c, u.rows[0], 'aktivasi'); return publicUser(u.rows[0]);
    }); res.status(201).json({ user: result, pesan: 'Akun BRTM diaktifkan' });
  }));
  app.post('/auth/login', wrap(async (req, res) => {
    const username = String(req.body?.username || '').toLowerCase().slice(0, 50);
    const key = limit(req, 'login:' + username, 8); limit(req, 'login-total', 40);
    const r = await pool.query('SELECT * FROM brtm_users WHERE username=$1', [username]); const u = r.rows[0];
    const fallback = '00000000000000000000000000000000:' + '00'.repeat(64);
    if (!(await verify(req.body?.password, u?.password_hash || fallback)) || !u?.active) throw fail(401, 'Nama pengguna atau kata sandi salah');
    attempts.delete(key); const token = crypto.randomBytes(32).toString('hex');
    await pool.query('DELETE FROM brtm_sessions WHERE expires_at<NOW()');
    await pool.query(`INSERT INTO brtm_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)`, [digest(token), u.id, new Date(Date.now() + 7 * 86400000)]);
    await pool.query("INSERT INTO brtm_audit(user_id,username,action,login_context) VALUES($1,$2,'masuk',$3)",[u.id,u.username,JSON.stringify(require('./workflow').loginContext(req))]); setCookie(res, token); res.json({ user: publicUser(u) });
  }));
  app.get('/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/auth/logout', wrap(async (req, res) => { const token = cookieToken(req); if (token) await pool.query('DELETE FROM brtm_sessions WHERE token_hash=$1', [digest(token)]); setCookie(res, '', 0); res.json({ ok: true }); }));
  app.post('/auth/password', auth, wrap(async (req, res) => {
    limit(req, 'password:' + req.user.id, 8);
    if (!(await verify(req.body?.currentPassword, req.user.password_hash))) throw fail(400, 'Kata sandi saat ini salah');
    if (req.body.currentPassword === req.body.password) throw fail(400, 'Gunakan kata sandi baru yang berbeda');
    const hash = await passwordHash(req.body?.password);
    await transaction(async c => { await c.query('UPDATE brtm_users SET password_hash=$1,must_change=FALSE WHERE id=$2', [hash, req.user.id]); await c.query('DELETE FROM brtm_sessions WHERE user_id=$1', [req.user.id]); await c.query('DELETE FROM brtm_swim_owner_sessions WHERE user_id=$1',[req.user.id]); await audit(c, req.user, 'ubah-kata-sandi'); });
    setCookie(res, '', 0); res.json({ pesan: 'Kata sandi diganti. Silakan masuk kembali.' });
  }));
  app.post('/auth/require-password-change', auth, wrap(async (req,res)=>{
    await transaction(async c=>{await c.query('UPDATE brtm_users SET must_change=TRUE WHERE id=$1',[req.user.id]);await c.query('DELETE FROM brtm_sessions WHERE user_id=$1',[req.user.id]);await audit(c,req.user,'wajib-ganti-kata-sandi');});
    setCookie(res,'',0);res.json({pesan:'Masuk berikutnya wajib mengganti kata sandi.'});
  }));
  app.get('/club/',(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
  app.get('/club/sw.js',(req,res)=>res.sendFile(path.join(__dirname,'public/sw.js')));
  require('./swim').mount(app, { pool, wrap, auth, owner, changed, transaction, rows, record, save, audit, payments, passwordHash, verify, limit, secureCookies });
  app.use('/api', auth, changed);
  app.get('/api', (req, res) => res.json({ nama: 'BARATHRUM AQUATIC SWIMMING CLUB', version: APP_VERSION, role: req.user.role }));
  app.get('/api/config', (req, res) => res.json({ classes: B.CLASSES, today: B.today(), timezone: 'Asia/Jakarta', schools: ['DBS','ABA 5','Ebenhaezer','TEC'] }));
  SPP.mount(app,{pool,wrap,owner,transaction});
  require('./community').mount(app,{pool,wrap,owner,transaction,rows,audit,limit});
  require('./tester-reset').mount(app,{pool,wrap,owner,transaction,audit});
  app.get('/api/akun', owner, wrap(async (req, res) => { const r = await pool.query('SELECT * FROM brtm_users ORDER BY id'); res.json(r.rows.map(publicUser)); }));
  app.put('/api/akun/:id', owner, wrap(async (req, res) => {
    const uid = id(req.params.id); const nama = text(req.body.nama, 'Nama akun', true, 100);
    if (typeof req.body.active !== 'boolean') throw fail(400, 'Status akun tidak valid');
    const username = req.body.username === undefined ? null : text(req.body.username, 'ID akun', true, 40).toLowerCase();
    if (username !== null && !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) throw fail(400, 'ID akun harus 3–40 huruf kecil, angka, titik, garis bawah, atau tanda hubung');
    const changingPassword = typeof req.body.password === 'string' && req.body.password !== '';
    if (changingPassword && uid === String(req.user.id)) throw fail(400, 'Gunakan Ganti Kata Sandi untuk kata sandi akun sendiri');
    const hash = changingPassword ? await passwordHash(req.body.password) : null;
    const result = await transaction(async c => {
      const old = (await c.query('SELECT * FROM brtm_users WHERE id=$1 FOR UPDATE', [uid])).rows[0];
      if (!old) throw fail(404, 'Akun tidak ditemukan');
      if (old.role === 'owner' && !req.body.active) throw fail(400, 'Akun Owner harus tetap aktif');
      const nextUsername = username ?? old.username;
      const r = await c.query('UPDATE brtm_users SET nama=$1,active=$2,username=$3,password_hash=$4,must_change=$5 WHERE id=$6 RETURNING *', [nama, req.body.active, nextUsername, hash || old.password_hash, hash ? false : old.must_change, uid]);
      const revoke = !req.body.active || nextUsername !== old.username || !!hash;
      if (revoke) {await c.query('DELETE FROM brtm_sessions WHERE user_id=$1', [uid]);await c.query('DELETE FROM brtm_swim_owner_sessions WHERE user_id=$1',[uid]);}
      await audit(c, req.user, 'ubah-akun', 'akun', uid, publicUser(old), publicUser(r.rows[0]));
      if (hash) await audit(c, req.user, 'atur-kata-sandi', 'akun', uid);
      return { ...publicUser(r.rows[0]), sessionRevoked: revoke && uid === String(req.user.id) };
    }); res.json(result);
  }));
  app.post('/api/akun/:id/reset', owner, wrap(async (req, res) => {
    const uid = id(req.params.id); if (uid === String(req.user.id)) throw fail(400, 'Gunakan menu Ganti Kata Sandi untuk akun sendiri');
    const password = 'Brtm!' + crypto.randomBytes(12).toString('base64url'); const hash = await passwordHash(password);
    const u = await transaction(async c => {
      const r = await c.query('UPDATE brtm_users SET password_hash=$1,must_change=TRUE WHERE id=$2 RETURNING *', [hash, uid]);
      if (!r.rowCount) throw fail(404, 'Akun tidak ditemukan');
      await c.query('DELETE FROM brtm_sessions WHERE user_id=$1', [uid]); await c.query('DELETE FROM brtm_swim_owner_sessions WHERE user_id=$1',[uid]); await audit(c, req.user, 'reset-kata-sandi', 'akun', uid); return publicUser(r.rows[0]);
    }); res.json({ user: u, password, pesan: 'Kata sandi awal baru. Ditampilkan satu kali.' });
  }));
  async function accessible(req, db = pool) {
    if (req.user.role === 'owner') return null;
    if (req.user.role === 'prestasi') return new Set((await rows(db, 'atlet')).filter(a => B.canonical(a.kelompok) === 'Prestasi Class').map(a => a.id));
    const schedules = await rows(db, 'jadwal'); return new Set(schedules.filter(s => String(s.coachId) === String(req.user.id)).flatMap(s => s.atletIds || []).map(String));
  }
  async function payments(db = pool, lock = false) {
    const list = await rows(db, 'pembayaran', lock);
    const counts = (await db.query(`SELECT data->>'paketId' AS paket, COUNT(*) AS jumlah FROM data_klub WHERE jenis='absensi' AND data->>'status'='Hadir' AND data->>'paketId' IS NOT NULL GROUP BY data->>'paketId'`)).rows;
    const used = Object.fromEntries(counts.map(x => [x.paket, Number(x.jumlah)])); return list.map(x => B.packageView(x, used[x.id] || 0));
  }
  function athleteLink(payment, athlete) { return payment.atletId ? String(payment.atletId) === athlete.id : payment.namaAtlet?.trim().toLowerCase() === athlete.nama?.trim().toLowerCase(); }
  async function athleteList(req) {
    const allowed = await accessible(req); const list = (await rows(pool, 'atlet')).filter(a => !allowed || allowed.has(a.id)); const packs = await payments();const attendance=await rows(pool,'absensi'),schedules=await rows(pool,'jadwal'),sppStates=await SPP.summaries(pool);
    return list.map(a => {
      const related = packs.filter(p => athleteLink(p, a)).sort((x, y) => String(y.tanggal).localeCompare(String(x.tanggal)) || Number(y.id) - Number(x.id));
      const active = related.find(p => p.statusMasaBerlaku === 'Aktif'); const latest = active || related[0];
      const isPrestasi = B.canonical(a.kelompok) === 'Prestasi Class';
      const paidMonth = related.find(p => p.status === 'Lunas' && p.periode === B.today().slice(0, 7) && p.jenisKelas === 'Prestasi Class'&&!p.sppTidakDitagih);
      const op = isPrestasi ? { statusPaket: 'Bulanan', sisaPertemuan: null, berlakuSampai: B.monthEnd(B.today()) } : { statusPaket: latest ? latest.statusMasaBerlaku : 'Belum ada paket', sisaPertemuan: latest?.sisaPertemuan ?? null, berlakuSampai: latest?.berlakuSampai || '' };
      const presentMonth=attendance.some(r=>r.atletId===a.id&&r.status==='Hadir'&&r.tanggal?.startsWith(B.today().slice(0,7))&&B.canonical(r.jenisKelas||schedules.find(s=>s.id===r.jadwalId)?.jenisKelas||a.kelompok)==='Prestasi Class');
      const overdue=related.some(p=>p.status==='Belum Lunas'&&p.totalTagihan>0);
      const finance = { statusSPP: isPrestasi ? sppStates[a.id]?.sppMenungguOwner?'Menunggu Persetujuan Owner':overdue?'Belum Lunas':paidMonth?'Lunas':presentMonth?'Belum Lunas':'Tidak Ada SPP Bulan Ini' : related.some(p=>p.status==='Belum Lunas') ? 'Belum Lunas' : active ? 'Lunas' : latest?.status === 'Belum Lunas' ? 'Belum Lunas' : latest ? 'Perlu perpanjangan' : 'Belum ada pembayaran', jatuhTempo: isPrestasi ? overdue?related.filter(p=>p.status==='Belum Lunas'&&p.totalTagihan>0).map(p=>p.jatuhTempo||p.tanggal).sort()[0]:presentMonth?B.monthEnd(B.today()):'' : latest?.berlakuSampai || '', paketId: active?.id || '' };
      if (req.user.role === 'owner') return { ...a, memberId:require('./community').memberId(a.id), kelompok: B.canonical(a.kelompok), ...op, ...finance, ...(sppStates[a.id]||{saldoKredit:0,sppMenungguOwner:false}), foto:'/api/atlet/'+a.id+'/foto' };
      return { id: a.id, memberId:require('./community').memberId(a.id), nama: a.nama, kelompok: B.canonical(a.kelompok), status: a.status, sekolah: a.sekolah || '', kelasSekolah: a.kelasSekolah || '', ...op, foto:'/api/atlet/'+a.id+'/foto' };
    });
  }
  app.get('/api/atlet/:id/foto', wrap(async(req,res)=>{
    const a=await record(pool,'atlet',req.params.id), allowed=await accessible(req);
    if(allowed&&!allowed.has(a.id))throw fail(403,'Foto tidak dapat diakses');
    const p=(await pool.query('SELECT mime,base64 FROM brtm_photos WHERE athlete_id=$1',[a.id])).rows[0];
    if(!p)return res.sendStatus(404);res.type(p.mime).send(Buffer.from(p.base64,'base64'));
  }));
  app.get('/api/backup', owner, wrap(async (req, res) => {
    const snapshot=await transaction(async c=>{
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const tables={};
      for(const table of ['data_klub','brtm_audit','brtm_photos','brtm_registrations','brtm_notifications','brtm_parent_views','brtm_members','brtm_announcements','brtm_announcement_photos','brtm_feedback','brtm_feedback_replies','brtm_staff_notifications','brtm_spp_receipts','brtm_spp_accounts','brtm_spp_pending','brtm_weekly_slots','brtm_billing_notices']){
        tables[table]=(await c.query('SELECT * FROM '+table)).rows;
      }
      tables.brtm_parents=(await c.query('SELECT id,athlete_id,username,active,deleted FROM brtm_parents')).rows;
      tables.brtm_users=(await c.query('SELECT id,username,nama,role,active FROM brtm_users')).rows;
      tables.brtm_staff_profiles=(await c.query('SELECT id,nama,username,role,active,profile FROM brtm_users ORDER BY id')).rows;
      return tables;
    });
    res.attachment(`BRTM-cadangan-${B.today()}.json`).json({version:APP_VERSION,dieksporPada:new Date().toISOString(),data:snapshot.data_klub,audit:snapshot.brtm_audit,tables:snapshot,catatan:'Cadangan data operasional dan foto; kredensial dan sesi tidak disertakan.'});
  }));
  app.get('/api/audit', owner, wrap(async (req, res) => { res.json((await pool.query('SELECT id,username,action,jenis,record_id,created_at,login_context FROM brtm_audit ORDER BY id DESC LIMIT 2000')).rows); }));
  app.get('/api/:jenis', wrap(async (req, res) => {
    const kind = req.params.jenis; if (!KINDS.includes(kind)) throw fail(404, 'Bagian tidak ditemukan');
    if (req.user.role !== 'owner' && ['pembayaran','pelatih'].includes(kind)) throw fail(403, 'Hanya Owner yang dapat melihat bagian ini');
    if (kind === 'atlet') return res.json(await athleteList(req)); if (kind === 'pembayaran') return res.json(await payments());
    const allowed = await accessible(req); let list = await rows(pool, kind);
    if (allowed) {
      if (kind === 'jadwal') list = list.filter(s => req.user.role === 'coach' ? String(s.coachId) === String(req.user.id) : B.canonical(s.jenisKelas) === 'Prestasi Class');
      else if (kind === 'program') list = req.user.role === 'prestasi' ? list : list.filter(p => p.dibuatOleh === req.user.username || p.jenis === 'Program');
      else list = list.filter(x => allowed.has(String(x.atletId)) && (req.user.role !== 'coach' || kind !== 'absensi' || x.coachId === String(req.user.id)));
      if(kind==='jadwal')list=list.map(s=>({...s,atletIds:(s.atletIds||[]).filter(a=>allowed.has(String(a)))}));
    } res.json(kind==='program'?list.map(require('./program').project):list);
  }));
  async function validate(req, db, kind, input, old) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400, 'Isi formulir tidak valid');
    const user = req.user, isOwner = user.role === 'owner';
    if (!isOwner) {
      const writeKinds = user.role === 'coach' ? ['absensi','perkembangan'] : ['absensi','perkembangan','catatanwaktu','program'];
      if (!writeKinds.includes(kind)) throw fail(403, 'Anda tidak memiliki izin mengubah bagian ini');
      const authorId = old?.dibuatOlehId || old?.coachId;
      if (old && (authorId ? String(authorId) !== String(user.id) : old.dibuatOleh !== user.username)) throw fail(403, 'Anda hanya dapat memperbaiki catatan sendiri');
    }
    const out = { ...old }; delete out.id;
    if (kind === 'atlet') {
      out.nama = text(input.nama, 'Nama atlet', true, 150); out.kelompok = B.canonical(input.kelompok);
      if (!Object.hasOwn(B.CLASSES, out.kelompok)) throw fail(400, 'Pilih jenis kelas');
      if (!['Aktif','Nonaktif'].includes(input.status)) throw fail(400, 'Status atlet tidak valid'); out.status = input.status;
      for (const k of ['namaPanggilan','namaOrtu','riwayatRenang','tempatLahir','sekolah','kelasSekolah','alamat','noHpOrtu','tujuan','catatan','jk','nik']) out[k] = Object.hasOwn(input,k) ? text(input[k], k, false, k === 'catatan' ? 2000 : 500) : old?.[k] || '';
      out.tanggalLahir = input.tanggalLahir ? date(input.tanggalLahir, 'Tanggal lahir') : '';
      if (out.tanggalLahir > B.today()) throw fail(400, 'Tanggal lahir tidak boleh di masa depan');
      if (out.noHpOrtu && !/^\+?[0-9 ()-]{8,25}$/.test(out.noHpOrtu)) throw fail(400, 'Nomor WhatsApp orang tua tidak valid');
      if (old && out.kelompok !== B.canonical(old.kelompok) && (await payments(db)).some(p => athleteLink(p, old) && p.statusMasaBerlaku === 'Aktif' && p.status === 'Lunas')) throw fail(400, 'Kelas baru dapat diganti setelah paket aktif selesai');
      return out;
    }
    if (kind === 'pelatih') { for (const [k,label] of [['nama','Nama pelatih'],['noHp','Nomor HP'],['spesialisasi','Spesialisasi']]) out[k] = text(input[k], label, k === 'nama', 200); return out; }
    if (kind === 'jadwal') {
      out.nama = text(input.nama, 'Nama sesi', true, 150); out.tanggal = date(input.tanggal); out.mulai = text(input.mulai, 'Jam mulai', true, 5); out.selesai = text(input.selesai, 'Jam selesai', true, 5);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(out.mulai) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(out.selesai) || out.mulai >= out.selesai) throw fail(400, 'Jam selesai harus setelah jam mulai');
      out.lokasi = text(input.lokasi, 'Lokasi', true, 200); out.coachId = id(input.coachId);
      const u = (await db.query('SELECT * FROM brtm_users WHERE id=$1 AND active=TRUE', [out.coachId])).rows[0]; if (!u) throw fail(400, 'Pilih akun pelatih aktif');
      out.pelatih = u.nama; out.hari = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long' }).format(new Date(out.tanggal + 'T12:00:00+07:00')); out.jam = `${out.mulai}–${out.selesai}`;
      out.jenisKelas = B.canonical(input.jenisKelas); if (!Object.hasOwn(B.CLASSES, out.jenisKelas)) throw fail(400, 'Pilih kelas sesi');
      if (!Array.isArray(input.atletIds) || !input.atletIds.length || input.atletIds.length > 200) throw fail(400, 'Pilih minimal satu atlet untuk sesi');
      out.atletIds = [...new Set(input.atletIds.map(id))];
      if(out.jenisKelas==='Private Class'&&out.atletIds.length!==1)throw fail(400,'Private Class hanya boleh 1 anak untuk 1 pelatih. Pilih kelas yang sesuai untuk beberapa anak.');
      for (const aid of out.atletIds) { const a = await record(db, 'atlet', aid); if (a.status === 'Nonaktif' || B.canonical(a.kelompok) !== out.jenisKelas) throw fail(400, 'Atlet sesi harus aktif dan sesuai jenis kelas'); }
      out.catatan = text(input.catatan, 'Catatan', false, 2000);
      const moving = old && (old.tanggal !== out.tanggal || old.mulai !== out.mulai || old.selesai !== out.selesai || old.coachId !== out.coachId || old.jenisKelas !== out.jenisKelas || JSON.stringify(old.atletIds) !== JSON.stringify(out.atletIds));
      if (moving) {
        if ((await rows(db, 'absensi')).some(a => a.jadwalId === old.id)) throw fail(400, 'Sesi yang sudah memiliki absensi tidak boleh dipindah. Buat sesi berikutnya.');
        out.alasanPerubahan = text(input.alasanPerubahan, 'Alasan jadwal/pelatih pengganti', true, 500); out.jadwalSebelumnya = { tanggal: old.tanggal, mulai: old.mulai, selesai: old.selesai, coachId: old.coachId };
      }
      out.statusSesi=input.statusSesi||old?.statusSesi||'Terjadwal';
      if(!['Terjadwal','Libur'].includes(out.statusSesi))throw fail(400,'Status sesi tidak valid');
      if(old?.statusSesi==='Libur' && (moving||out.statusSesi!=='Libur'))throw fail(400,'Sesi libur sudah tercatat. Buat jadwal pengganti baru.');
      out.alasanLibur=out.statusSesi==='Libur'?text(input.alasanLibur||old?.alasanLibur,'Alasan libur',true,500):'';
      if(out.statusSesi==='Libur' && old?.statusSesi!=='Libur') {
        if((await rows(db,'absensi')).some(a=>a.jadwalId===old?.id))throw fail(400,'Sesi yang sudah diabsen tidak boleh diliburkan');
        const packs=await payments(db,true);
        for(const p of packs.filter(p=>out.atletIds.includes(String(p.atletId))&&p.totalPertemuan!==null&&p.tanggal<=out.tanggal&&p.berlakuSampai>=out.tanggal)) {
          const pengecualian={alasan:'Libur BRTM: '+out.alasanLibur,berlakuSampai:B.addDays(p.berlakuSampai,7),oleh:user.username,pada:new Date().toISOString()};
          await save(db,user,'pembayaran',{...p,pengecualian},p);
        }
      }
      const clash = (await rows(db, 'jadwal')).find(s => s.statusSesi!=='Libur' && out.statusSesi!=='Libur' && s.id !== old?.id && s.tanggal === out.tanggal && s.mulai < out.selesai && s.selesai > out.mulai && (s.coachId === out.coachId || s.atletIds?.some(a => out.atletIds.includes(String(a)))));
      if (clash) throw fail(400, 'Jadwal bentrok dengan sesi ' + clash.nama); return out;
    }
    if (kind === 'pembayaran') {
      const athlete = await record(db, 'atlet', id(input.atletId || old?.atletId)); out.atletId = athlete.id; out.namaAtlet = athlete.nama;
      if(input.paymentRequestId!==undefined&&!/^[-\w]{10,80}$/.test(input.paymentRequestId))throw fail(400,'Kode pembayaran tidak valid');
      delete out.sppPaymentRequestId;if(input.paymentRequestId)out.sppPaymentRequestId=input.paymentRequestId;
      try { Object.assign(out, B.price(input, athlete)); } catch (e) { throw fail(400, e.message); }
      if (out.jenisKelas !== B.canonical(athlete.kelompok)) throw fail(400, 'Kelas pembayaran harus sama dengan kelas atlet');
      if(old?.sppDikelola&&(String(old.atletId)!==out.atletId||old.periode!==out.periode))throw fail(400,'Atlet dan bulan SPP otomatis tidak dapat diganti.');
      if(old?.sppDikelola&&old.status==='Lunas'&&out.status==='Belum Lunas'&&old.penerimaanTunai>0&&(input.catatan===old.catatan||!input.catatan||input.catatan.trim().length<8))throw fail(400,'Tuliskan alasan baru untuk koreksi pembayaran minimal 8 karakter.');
      if(old?.status==='Lunas'&&out.status==='Belum Lunas'&&(!input.catatan||input.catatan===old.catatan||input.catatan.trim().length<8))throw fail(400,'Isi alasan koreksi pembayaran minimal 8 karakter.');
      const packs = await payments(db), previous = old && packs.find(p => p.id === old.id);
      if (previous?.terpakai > 0 && (out.atletId !== old.atletId || out.jenisKelas !== B.canonical(old.jenisKelas) || out.tanggal !== old.tanggal)) throw fail(400, 'Identitas, tanggal, kelas, dan status paket yang telah dipakai tidak boleh diganti');
      if(previous && out.totalPertemuan!==null && out.totalPertemuan<previous.terpakai)throw fail(400,'Kuota tidak boleh lebih kecil dari pertemuan terpakai');
      out.pemakaianAwal = previous?.pemakaianAwal || 0; delete out.sisaPertemuan; if (old) out.pengecualian = old.pengecualian || null;
      const duplicate = packs.find(p => p.id !== old?.id && athleteLink(p, athlete) && (out.jenisKelas === 'Prestasi Class' ? p.jenisKelas === 'Prestasi Class' && p.periode === out.periode : p.tanggal === out.tanggal && p.jenisKelas === out.jenisKelas));
      if (duplicate) throw fail(409, 'Tagihan atlet untuk tanggal/periode ini sudah ada. Edit tagihan tersebut.');
      out.catatan = text(input.catatan, 'Catatan pembayaran', false, 1000); out.dibayarPada = out.status === 'Lunas' ? old?.status === 'Lunas' ? old.dibayarPada || old.tanggal : B.today() : null; return out;
    }
    if (['absensi','perkembangan','catatanwaktu'].includes(kind)) {
      const aid = id(input.atletId || old?.atletId), athlete = await record(db, 'atlet', aid), allowed = await accessible(req, db);
      if (allowed && !allowed.has(aid)) throw fail(403, 'Atlet belum ditugaskan kepada akun ini');
      out.atletId = aid; out.namaAtlet = athlete.nama; out.tanggal = date(kind==='perkembangan'&&user.role==='prestasi' ? old?.tanggal||B.today() : input.tanggal || old?.tanggal);
      if (out.tanggal > B.today()) throw fail(400, 'Catatan kehadiran/perkembangan/waktu tidak boleh di masa depan');
      if (old && ((old.atletId && old.atletId !== aid) || (old.tanggal && old.tanggal !== out.tanggal))) throw fail(400, 'Atlet dan tanggal catatan tidak dapat diganti');
      if (kind === 'catatanwaktu') {
        if (B.canonical(athlete.kelompok) !== 'Prestasi Class') throw fail(400, 'Catatan waktu hanya untuk atlet Prestasi');
        if (!['Bebas','Punggung','Dada','Kupu-kupu','Ganti'].includes(input.gaya)) throw fail(400, 'Pilih gaya renang');
        out.gaya = input.gaya; out.jarak = Number(input.jarak); out.kolam = old?.kolam || 25; out.detik = Number(input.detik);
        if (![25,50,100,200,400,800,1500,2000].includes(out.jarak) || ![25,50].includes(out.kolam) || !Number.isFinite(out.detik) || out.detik <= 0 || out.detik > 86400) throw fail(400, 'Jarak, panjang kolam, atau waktu tidak valid');
        out.testName = text(input.testName, 'Nama periode tes', false, 150);
        out.event = text(input.event, 'Event/latihan', false, 200); out.catatan = text(input.catatan, 'Catatan', false, 1000); return out;
      }
      if(kind==='perkembangan' && (user.role==='prestasi'||isOwner&&old) && !old?.jadwalId){
        if(athlete.status!=='Aktif')throw fail(400,'Pilih atlet aktif');
        out.coachId=old?.coachId||String(user.id);out.pelatih=old?.pelatih||user.nama;out.catatan=text(input.catatan,'Noted',true,2000);return out;
      }
      out.jadwalId = id(input.jadwalId || old?.jadwalId); const schedule = await record(db, 'jadwal', out.jadwalId, true);
      if(schedule.statusSesi==='Libur')throw fail(400,'Sesi diliburkan; tidak ada pengurangan kuota');
      if (!schedule.atletIds?.map(String).includes(aid)) throw fail(400, 'Atlet tidak terdaftar pada sesi ini');
      if (schedule.tanggal !== out.tanggal) throw fail(400, 'Tanggal harus sesuai jadwal sesi');
      if (!isOwner && String(schedule.coachId) !== String(user.id) && !(user.role === 'prestasi' && B.canonical(schedule.jenisKelas) === 'Prestasi Class')) throw fail(403, 'Sesi ini ditugaskan kepada pelatih lain');
      if (old?.jadwalId && old.jadwalId !== out.jadwalId) throw fail(400, 'Sesi catatan tidak dapat diganti');
      out.jenisKelas=B.canonical(schedule.jenisKelas);
      out.coachId = String(schedule.coachId); out.pelatih = B.canonical(schedule.jenisKelas)==='Prestasi Class'?'Coach Adhi':schedule.pelatih; out.catatan = text(input.catatan, 'Catatan', false, 2000);
      if (kind === 'perkembangan') { for (const k of ['teknik','fisik','attitude']) out[k] = text(input[k], k, false, 1000); return out; }
      if (!['Hadir','Izin','Sakit','Alpa'].includes(input.status)) throw fail(400, 'Pilih status kehadiran'); out.status = input.status; out.paketId = null;
      if (out.status === 'Hadir' && B.canonical(athlete.kelompok) !== 'Prestasi Class') {
        const packs = (await payments(db, true)).filter(p => athleteLink(p, athlete) && p.jenisKelas === B.canonical(athlete.kelompok) && ['Lunas','Belum Lunas'].includes(p.status) && (p.statusManual!=='Kedaluwarsa'||old?.paketId===p.id) && p.tanggal <= out.tanggal && p.berlakuSampai >= out.tanggal && (p.sisaPertemuan > 0 || (old?.status === 'Hadir' && old.paketId === p.id))).sort((a,b) => a.berlakuSampai.localeCompare(b.berlakuSampai));
        if (!packs.length) throw fail(400, 'Tidak ada paket dengan sisa pertemuan pada tanggal sesi. Hubungi Owner untuk mencatat paket berikutnya.'); out.paketId = packs[0].id;
      } return out;
    }
    if (kind === 'program') {
      if (!isOwner && user.role !== 'prestasi') throw fail(403, 'Khusus tim Prestasi');
      return require('./program').prepare(input,old);
    } throw fail(404, 'Bagian tidak ditemukan');
  }
  require('./workflow').mount(app,{pool,wrap,owner,transaction,rows,record,save,validate,audit,passwordHash,payments});
  require('./operations').mount(app,{pool,wrap,owner,transaction,rows,record,validate,save,payments});
  require('./prestasi').mount(app,{wrap,transaction,validate,save,rows,limit,record:(db,kind,id)=>record(db||pool,kind,id)});
  app.post('/api/pembayaran/:id/pengecualian', owner, wrap(async (req, res) => {
    const result = await transaction(async c => {
      const old = await record(c, 'pembayaran', req.params.id, true), alasan = text(req.body.alasan, 'Alasan pengecualian', true, 1000);
      if (alasan.length < 8) throw fail(400, 'Alasan minimal 8 karakter'); const berlakuSampai = date(req.body.berlakuSampai);
      if (berlakuSampai < B.today() || berlakuSampai <= old.tanggalBerakhir) throw fail(400, 'Tanggal pengecualian harus setelah masa berlaku asli dan tidak lewat');
      const pengecualian = { alasan, berlakuSampai, oleh: req.user.username, pada: new Date().toISOString() };
      return B.packageView(await save(c, req.user, 'pembayaran', { ...old, pengecualian }, old));
    }); res.json({ pesan: 'Masa berlaku diperpanjang tanpa menambah pertemuan', data: result });
  }));
  app.post('/api/:jenis', wrap(async (req, res) => {
    const kind = req.params.jenis; if (!KINDS.includes(kind)) throw fail(404, 'Bagian tidak ditemukan');
    const result = await transaction(async c => { await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE'); const data = await validate(req, c, kind, req.body, null); return save(c, req.user, kind, data, null); }); res.status(201).json({ pesan: 'Data berhasil disimpan', data: kind==='program'?require('./program').project(result):result });
  }));
  app.put('/api/:jenis/:id', wrap(async (req, res) => {
    const kind = req.params.jenis; if (!KINDS.includes(kind)) throw fail(404, 'Bagian tidak ditemukan');
    const result = await transaction(async c => { await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE'); const old = await record(c, kind, req.params.id, true); const data = await validate(req, c, kind, req.body, old); return save(c, req.user, kind, data, old); }); res.json({ pesan: 'Perubahan tersimpan', data: kind==='program'?require('./program').project(result):result });
  }));
  app.delete('/api/:jenis/:id', owner, wrap(async (req, res) => {
    const kind = req.params.jenis; if (!KINDS.includes(kind)) throw fail(404, 'Bagian tidak ditemukan');
    await transaction(async c => {
      await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE'); const old = await record(c, kind, req.params.id, true);
      if (kind === 'atlet') {
        if((await c.query('SELECT id FROM brtm_feedback WHERE athlete_id=$1 LIMIT 1',[old.id])).rows.length)throw fail(400,'Atlet memiliki riwayat masukan. Ubah status menjadi Nonaktif.');
        const linked = (await c.query(`SELECT data FROM data_klub WHERE jenis <> 'atlet'`)).rows.some(r => String(r.data.atletId) === old.id || r.data.atletIds?.map(String).includes(old.id) || r.data.namaAtlet?.trim().toLowerCase() === old.nama?.trim().toLowerCase());
        if (linked) throw fail(400, 'Atlet memiliki riwayat. Ubah status menjadi Nonaktif.');
      }
      if (kind === 'jadwal' && (await rows(c, 'absensi')).some(a => a.jadwalId === old.id)) throw fail(400, 'Jadwal dengan absensi tidak boleh dihapus');
      if(kind==='pembayaran'&&old.sppDikelola)throw fail(400,'SPP otomatis mengikuti absensi. Koreksi absensi atau pembayaran, jangan menghapus riwayat SPP.');
      if (kind === 'pembayaran' && (await payments(c)).find(p => p.id === old.id)?.terpakai > 0) throw fail(400, 'Paket yang telah dipakai tidak boleh dihapus');
      await c.query('DELETE FROM data_klub WHERE jenis=$1 AND id=$2', [kind, old.id]); await audit(c, req.user, 'hapus', kind, old.id, old, null);if(kind==='absensi')await SPP.reconcile(c,old.atletId,req.user);
    }); res.json({ pesan: 'Data dihapus dan dicatat dalam riwayat' });
  }));
  app.use('/api', (req,res) => res.status(404).json({ pesan: 'Endpoint tidak ditemukan' }));
  app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error); const status = error.status || (error.code === '23505' ? 409 : 500);
    if (status >= 500) console.error('BRTM request failed:', error.code || error.name);
    res.status(status).json({ pesan: error.code === '23505' ? 'Data sudah tercatat. Muat ulang daftar sebelum menyimpan lagi.' : status >= 500 ? 'Server belum dapat memproses data. Coba lagi.' : error.message });
  });
  app.locals.maintain=()=>transaction(async c=>{await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');await require('./workflow').materialize(c,{rows,save});await require('./workflow').billing(c,await payments(c));});
  return app;
}
if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false, max: 10 });
  initDb(pool).then(()=>SPP.migrate(pool)).then(() => {
    const app = createApp({ pool });
    const stopNotifications=N.startWorker(pool,async()=>{
      await app.locals.maintain();
      const list=(await pool.query("SELECT id,data FROM data_klub WHERE jenis='pembayaran'")).rows;
      const counts=(await pool.query("SELECT data->>'paketId' AS paket, COUNT(*) AS jumlah FROM data_klub WHERE jenis='absensi' AND data->>'status'='Hadir' GROUP BY data->>'paketId'")).rows;
      return list.map(p=>B.packageView({...p.data,id:String(p.id)},Number(counts.find(c=>c.paket===String(p.id))?.jumlah||0)));
    });
    const server = app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('BRTM v' + APP_VERSION + ' ready'));
    process.on('SIGTERM', () => { stopNotifications(); server.close(() => pool.end().then(() => process.exit(0))); });
  }).catch(e => { console.error('BRTM database initialization failed:', e.code || e.name); process.exit(1); });
}
module.exports = { createApp, initDb, passwordHash, verify };
