const { PGlite } = require('@electric-sql/pglite');
const { initDb, createApp, passwordHash } = require('./server');
const B = require('./business');
const express = require('express');
const crypto = require('crypto');
if(process.env.NODE_ENV==='production'||process.env.RAILWAY_ENVIRONMENT_ID)throw new Error('Synthetic preview is disabled in production; use npm start');
(async () => {
  const db = new PGlite();
  let release;
  let queue = Promise.resolve();
  const query = async (sql, params) => { const r = await db.query(sql, params); return { ...r, rowCount: r.affectedRows || r.rows.length }; };
  const pool = { query, async connect() {
    const old = queue; let resolve; queue = new Promise(r => resolve = r); await old;
    return { query, release() { resolve(); } };
  }};
  await initDb(pool);
  for (const [name, role] of [['owner','owner'],['coach1','coach'],['prestasi','prestasi']]) await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$2,$3,$4,FALSE)',[name,role==='owner'?'Owner BRTM':name==='coach1'?'Coach 1':'Tim Prestasi',role,await passwordHash('DemoBrtm2026!')]);
  await pool.query('UPDATE brtm_install SET completed=TRUE WHERE id=1');
  const seed = async (jenis, data) => (await pool.query('INSERT INTO data_klub(jenis,data) VALUES($1,$2) RETURNING id',[jenis,JSON.stringify(data)])).rows[0].id;
  const aid=await seed('atlet',{nama:'Atlet Contoh',namaPanggilan:'Contoh',tanggalLahir:'2017-04-21',namaOrtu:'Wali Contoh',jk:'Perempuan',alamat:'Salatiga',kelasSekolah:'3 SD',tujuan:'Percaya diri di air',kelompok:'Private Class',status:'Aktif',sekolah:'DBS',noHpOrtu:'081234567890'});
  const prid=await seed('atlet',{nama:'Atlet Prestasi',kelompok:'Prestasi Class',status:'Aktif',sekolah:'SMP Contoh'});
  await seed('pembayaran',{atletId:String(aid),namaAtlet:'Atlet Contoh',...B.price({tanggal:B.today(),jenisKelas:'Private Class',status:'Lunas'},{kelompok:'Private Class'}),pemakaianAwal:0});
  await seed('jadwal',{nama:'Private • Sesi sore',tanggal:B.today(),mulai:'15:00',selesai:'16:00',jam:'15:00–16:00',lokasi:'Hotel Grand Wahid Salatiga',coachId:'2',pelatih:'Coach 1',atletIds:[String(aid)],jenisKelas:'Private Class'});
  await seed('catatanwaktu',{atletId:String(prid),namaAtlet:'Atlet Prestasi',tanggal:B.today(),gaya:'Bebas',jarak:50,kolam:25,detik:32.7,dibuatOleh:'prestasi'});
  const portArg=process.argv.indexOf('--port');
  const preview=express();
  preview.use((req,res,next)=>{const set=res.setHeader.bind(res);res.setHeader=(name,value)=>set(name,name.toLowerCase()==='x-frame-options'?'SAMEORIGIN':name.toLowerCase()==='content-security-policy'?String(value).replace("frame-ancestors 'none'","frame-ancestors 'self'"):value);next();});
  preview.get('/mobile',(req,res)=>res.type('html').send('<!doctype html><html><head><title>BRTM Mobile QA</title><style>body{margin:0;background:#e3ebef;display:grid;place-items:center;min-height:100vh}iframe{border:0;width:390px;height:844px;box-shadow:0 10px 60px #0002;background:white}</style></head><body><iframe title="BRTM tampilan HP" src="/"></iframe></body></html>'));
  // Synthetic preview accounts only; this server is never used by npm start.
  preview.get('/preview/:role',async(req,res)=>{
    const username={owner:'owner',coach:'coach1',prestasi:'prestasi',swimowner:'owner'}[req.params.role];
    if(!username)return res.sendStatus(404);
    const user=(await pool.query('SELECT id FROM brtm_users WHERE username=$1',[username])).rows[0];
    const token=crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO '+(req.params.role==='swimowner'?'brtm_swim_owner_sessions':'brtm_sessions')+'(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[crypto.createHash('sha256').update(token).digest('hex'),user.id,new Date(Date.now()+86400000)]);
    res.setHeader('Set-Cookie',`${req.params.role==='swimowner'?'brtm_swim_session':'brtm_session'}=${token}; HttpOnly; SameSite=Strict; Path=/`);res.redirect(req.params.role==='swimowner'?'/swim/':'/');
  });
  preview.use(createApp({pool,setupHash:'preview-disabled',secureCookies:false}));
  preview.listen(portArg>=0?Number(process.argv[portArg+1]):Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('BRTM preview ready'));
})().catch(e=>{console.error(e);process.exit(1)});
