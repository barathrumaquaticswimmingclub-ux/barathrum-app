'use strict';
const normalize=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^0/,'62');
const fail=(status,message)=>Object.assign(Error(message),{status});
async function initDb(db){
 await db.query('ALTER TABLE brtm_parents ADD COLUMN IF NOT EXISTS family_phone TEXT');
 // Capture the registered contact once. Parent profile edits cannot grant family access.
 await db.query("UPDATE brtm_parents p SET family_phone=COALESCE(a.data->>'noHpOrtu','') FROM data_klub a WHERE a.id=p.athlete_id AND p.family_phone IS NULL");
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_parent_children(parent_id INTEGER NOT NULL REFERENCES brtm_parents(id) ON DELETE CASCADE,athlete_id INTEGER NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE,linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(parent_id,athlete_id))`);
}
async function children(db,parent){
 const result=await db.query(`SELECT a.id,a.data,p.active,p.deleted FROM data_klub a LEFT JOIN brtm_parents p ON p.athlete_id=a.id WHERE a.jenis='atlet' AND (a.id=$1 OR a.id IN (SELECT athlete_id FROM brtm_parent_children WHERE parent_id=$2)) ORDER BY a.id`,[parent.athlete_id,parent.id]);
 return result.rows.filter(r=>!r.data.mergedInto&&r.active&&!r.deleted).map(r=>({id:String(r.id),nama:r.data.nama,namaPanggilan:r.data.namaPanggilan||'',kelompok:r.data.kelompok,utama:String(r.id)===String(parent.athlete_id)}));
}
async function select(db,parent,id){
 if(!id||String(id)===String(parent.athlete_id))return parent;
 if(!/^[1-9]\d{0,9}$/.test(String(id)))throw fail(403,'Akses anak tidak tersedia');
 const linked=(await children(db,parent)).some(a=>a.id===String(id));
 if(!linked)throw fail(403,'Akses anak tidak tersedia. Pilih kembali Anak Saya.');
 const target=(await db.query('SELECT * FROM brtm_parents WHERE athlete_id=$1 AND active=TRUE AND deleted=FALSE',[id])).rows[0];
 if(!target)throw fail(403,'Akses anak tidak tersedia');
 return {...target,account_id:parent.id};
}
function mount(app,h){
 const {pool,wrap,parentAuth,auth,changed,owner,transaction,record,rows,audit,limit}=h;
 app.get('/swim/api/children',parentAuth,wrap(async(req,res)=>{if(!req.familyParent)throw fail(403,'Khusus orang tua');res.json(await children(pool,req.familyParent));}));
 app.post('/swim/api/children',parentAuth,wrap(async(req,res)=>{
  if(!req.familyParent)throw fail(403,'Khusus orang tua');limit(req,'family-link:'+req.familyParent.id,15);
  const name=normalize(req.body.nama);if(name.length<2||name.length>200)throw fail(400,'Masukkan nama lengkap anak.');
  await transaction(async db=>{
   const root=(await db.query('SELECT * FROM brtm_parents WHERE id=$1 AND active=TRUE AND deleted=FALSE FOR UPDATE',[req.familyParent.id])).rows[0];
   if(!root)throw fail(403,'Akses keluarga tidak tersedia');
   const matches=(await rows(db,'atlet')).filter(a=>!a.mergedInto&&normalize(a.nama)===name);
   const unavailable=()=>fail(409,'Belum dapat menautkan anak. Pastikan nama lengkap benar dan nomor WhatsApp terdaftar sama, atau hubungi Owner untuk bantuan.');
   if(matches.length!==1)throw unavailable();
   const a=matches[0],target=(await db.query('SELECT * FROM brtm_parents WHERE athlete_id=$1 AND active=TRUE AND deleted=FALSE',[a.id])).rows[0];
   const contact=phone(root.family_phone);if(!target||contact.length<10||contact!==phone(target.family_phone))throw unavailable();
   if(String(root.athlete_id)!==String(a.id))await db.query('INSERT INTO brtm_parent_children(parent_id,athlete_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[root.id,a.id]);
   await audit(db,{id:null,username:'orangtua:'+root.id},'tautkan-anak','atlet',a.id);
  });res.json({pesan:'Anak berhasil ditautkan. Pilih namanya di Anak Saya.'});
 }));
 app.delete('/swim/api/children/:id',parentAuth,wrap(async(req,res)=>{
  if(!req.familyParent)throw fail(403,'Khusus orang tua');
  if(!/^[1-9]\d{0,9}$/.test(req.params.id))throw fail(400,'Anak tidak valid');
  await transaction(async db=>{await db.query('DELETE FROM brtm_parent_children WHERE parent_id=$1 AND athlete_id=$2',[req.familyParent.id,req.params.id]);await audit(db,{id:null,username:'orangtua:'+req.familyParent.id},'lepas-tautan-anak','atlet',req.params.id);});
  res.json({pesan:'Tautan anak dilepas. Data latihan tetap tersimpan.'});
 }));
 app.get('/api/owner/family/:id',auth,changed,owner,wrap(async(req,res)=>{
  await record(pool,'atlet',req.params.id);const p=(await pool.query('SELECT * FROM brtm_parents WHERE athlete_id=$1',[req.params.id])).rows[0];
  res.json(p?await children(pool,p):[]);
 }));
 app.post('/api/owner/family/:id',auth,changed,owner,wrap(async(req,res)=>{
  await transaction(async db=>{
   await record(db,'atlet',req.params.id);await record(db,'atlet',req.body.atletId);
   const accounts=(await db.query('SELECT * FROM brtm_parents WHERE athlete_id=$1 OR athlete_id=$2',[req.params.id,req.body.atletId])).rows;
   const root=accounts.find(p=>String(p.athlete_id)===req.params.id),target=accounts.find(p=>String(p.athlete_id)===String(req.body.atletId));
   if(!root||!target||!root.active||root.deleted||!target.active||target.deleted)throw fail(409,'Siapkan dan aktifkan akun orang tua kedua anak terlebih dahulu.');
   if(req.body.lepas===true)await db.query('DELETE FROM brtm_parent_children WHERE parent_id=$1 AND athlete_id=$2',[root.id,target.athlete_id]);
   else if(root.id!==target.id)await db.query('INSERT INTO brtm_parent_children(parent_id,athlete_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[root.id,target.athlete_id]);
   await audit(db,req.user,req.body.lepas?'owner-lepas-tautan-anak':'owner-tautkan-anak','atlet',String(target.athlete_id));
  });res.json({pesan:'Tautan keluarga diperbarui.'});
 }));
}
module.exports={initDb,children,select,mount,phone};
