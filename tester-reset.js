'use strict';
const crypto=require('crypto');
async function initDb(db){await db.query(`CREATE TABLE IF NOT EXISTS brtm_tester_archives (id SERIAL PRIMARY KEY, snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), restored_at TIMESTAMPTZ)`);}
function mount(app,h){
 const {pool,wrap,owner,transaction,audit}=h;
 async function snapshot(db){
  const data=(await db.query("SELECT * FROM data_klub WHERE jenis NOT IN ('pelatih','program') ORDER BY id")).rows;
  const parents=(await db.query('SELECT * FROM brtm_parents ORDER BY id')).rows;
  const photos=(await db.query('SELECT * FROM brtm_photos ORDER BY athlete_id')).rows;
  const registrations=(await db.query('SELECT * FROM brtm_registrations ORDER BY id')).rows;
  return {data,parents,photos,registrations};
 }
 const fingerprint=s=>crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex');
 app.get('/api/tester/preview',owner,wrap(async(req,res)=>{
  const snap=await snapshot(pool);res.json({fingerprint:fingerprint(snap),jumlahAtlet:snap.data.filter(x=>x.jenis==='atlet').length,jumlahRiwayat:snap.data.filter(x=>x.jenis!=='atlet').length});
 }));
 app.post('/api/tester/reset',owner,wrap(async(req,res)=>{
  const result=await transaction(async c=>{
   await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   if((await c.query('SELECT id FROM brtm_feedback LIMIT 1')).rows.length)throw Object.assign(Error('Arsip tester tidak dapat dijalankan setelah masukan orang tua tercatat. Riwayat masukan harus dipertahankan.'),{status:409});
   if((await c.query('SELECT id FROM brtm_spp_receipts LIMIT 1')).rows.length||(await c.query("SELECT id FROM brtm_spp_pending WHERE status='Pending' LIMIT 1")).rows.length)throw Object.assign(Error('Arsip tester tidak dapat dijalankan setelah penerimaan atau koreksi SPP tercatat. Riwayat keuangan harus dipertahankan.'),{status:409});
   const snap=await snapshot(c);
   if(req.body.fingerprint!==fingerprint(snap))throw Object.assign(Error('Data berubah. Periksa daftar tester kembali.'),{status:409});
   if(req.body.confirmation!=='ARSIPKAN SEMUA DATA TESTER')throw Object.assign(Error('Konfirmasi arsip tester tidak valid'),{status:400});
   const archive=(await c.query('INSERT INTO brtm_tester_archives(snapshot) VALUES ($1) RETURNING id',[JSON.stringify(snap)])).rows[0];
   await c.query("DELETE FROM data_klub WHERE jenis NOT IN ('pelatih','program')");
   await c.query("UPDATE brtm_registrations SET status='Arsip tester',payload='{}'::jsonb,note='Diarsipkan sebelum pemakaian nyata',athlete_id=NULL");
   await audit(c,req.user,'arsipkan-semua-tester','arsip',String(archive.id),null,{jumlahAtlet:snap.data.filter(x=>x.jenis==='atlet').length});
   return {archiveId:String(archive.id),pesan:'Data tester diarsipkan. Akun tim dan pengaturan formulir tetap tersedia.'};
  });res.json(result);
 }));
 app.get('/api/tester/arsip',owner,wrap(async(req,res)=>res.json((await pool.query('SELECT id,created_at,restored_at FROM brtm_tester_archives ORDER BY id DESC')).rows)));
 app.post('/api/tester/restore/:id',owner,wrap(async(req,res)=>{
  await transaction(async c=>{
   await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const a=(await c.query('SELECT * FROM brtm_tester_archives WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!a||a.restored_at)throw Object.assign(Error('Arsip tidak tersedia'),{status:404});
   if((await c.query("SELECT id FROM data_klub WHERE jenis NOT IN ('pelatih','program') LIMIT 1")).rows.length)throw Object.assign(Error('Pemulihan hanya dapat dilakukan sebelum ada data latihan baru'),{status:409});
   for(const r of a.snapshot.data)await c.query('INSERT INTO data_klub(id,jenis,data,dibuat_pada) VALUES($1,$2,$3,$4)',[r.id,r.jenis,JSON.stringify(r.data),r.dibuat_pada]);
   for(const p of a.snapshot.parents)await c.query('INSERT INTO brtm_parents(id,athlete_id,username,password_hash,active,deleted) VALUES($1,$2,$3,$4,$5,$6)',[p.id,p.athlete_id,p.username,p.password_hash,p.active,p.deleted]);
   for(const p of a.snapshot.photos)await c.query('INSERT INTO brtm_photos VALUES($1,$2,$3)',[p.athlete_id,p.mime,p.base64]);
   for(const r of a.snapshot.registrations)await c.query('UPDATE brtm_registrations SET payload=$1,status=$2,athlete_id=$3,note=$4 WHERE id=$5',[JSON.stringify(r.payload),r.status,r.athlete_id,r.note,r.id]);
   await c.query('UPDATE brtm_tester_archives SET restored_at=NOW() WHERE id=$1',[a.id]);await audit(c,req.user,'pulihkan-tester','arsip',String(a.id));
  });res.json({pesan:'Data tester dipulihkan. Sesi orang tua perlu masuk kembali.'});
 }));
}
module.exports={initDb,mount};
