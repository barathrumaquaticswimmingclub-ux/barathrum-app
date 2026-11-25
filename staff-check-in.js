'use strict';
const B=require('./business'),crypto=require('crypto'),sharp=require('sharp');
const fail=(status,message)=>Object.assign(Error(message),{status});
function location(d){
 const l=d.location;
 if(!l||!['latitude','longitude','accuracy','timestamp'].every(k=>typeof l[k]==='number'&&Number.isFinite(l[k]))||Math.abs(l.latitude)>90||Math.abs(l.longitude)>180||l.accuracy<0||Math.abs(Date.now()-l.timestamp)>120000)throw fail(400,'Aktifkan lokasi/GPS dan izinkan lokasi, lalu coba lagi');
 return {latitude:l.latitude,longitude:l.longitude,accuracy:l.accuracy,timestamp:l.timestamp};
}
async function photo(value){
 if(typeof value!=='string'||value.length>1800000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value))throw fail(400,'Ambil foto kamera sebelum menyimpan');
 try{const buffer=await sharp(Buffer.from(value.split(',')[1],'base64'),{limitInputPixels:16000000}).rotate().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:60,mozjpeg:true}).toBuffer();if(buffer.length>180000)throw Error('large');return 'data:image/jpeg;base64,'+buffer.toString('base64');}catch(e){throw fail(400,'Foto tidak dapat diproses. Ambil foto kembali');}
}
function mount(app,{wrap,transaction,rows,audit,owner}){
 const coach=(req,res,next)=>['coach','prestasi'].includes(req.user.role)?next():next(fail(403,'Khusus pelatih'));
 app.post('/api/coach/check-in',coach,wrap(async(req,res)=>{
  const d=req.body,loc=location(d);
  if(!/^[-\w]{10,80}$/.test(d.requestId||'')||!Array.isArray(d.slotKeys)||!d.slotKeys.length||d.slotKeys.length>16||new Set(d.slotKeys).size!==d.slotKeys.length||d.slotKeys.some(k=>typeof k!=='string'))throw fail(400,'Pilih minimal satu jadwal hari ini');
  const image=await photo(d.photo),hash=crypto.createHash('sha256').update(JSON.stringify({slotKeys:d.slotKeys,photo:d.photo,location:loc})).digest('hex');
  const data=await transaction(async db=>{
   await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const staff=(await db.query('SELECT id,nama,username,role,active FROM brtm_users')).rows,{person,slots}=require('./staff-attendance'),id=person(staff,req.user),today=B.today();
   const existing=(await db.query("SELECT id,data FROM data_klub WHERE jenis='buktistaf' AND data->>'requestId'=$1",[d.requestId])).rows[0],retry=existing?{...existing.data,id:String(existing.id)}:null;
   if(retry){if(retry.reportedBy!==String(req.user.id)||retry.requestHash!==hash)throw fail(409,'Kode penyimpanan sudah dipakai');return {id:retry.id,reportedAt:retry.reportedAt};}
   const available=slots(staff,req.user,await rows(db,'jadwal'),today.slice(0,7)),selected=d.slotKeys.map(k=>available.find(s=>s.key===k&&s.tanggal===today&&!s.libur));
   if(selected.some(s=>!s))throw fail(400,'Jadwal berubah atau libur. Muat ulang dan pilih jadwal hari ini');
   if(selected.some((s,i)=>selected.some((t,j)=>i!==j&&s.mulai<t.selesai&&s.selesai>t.mulai)))throw fail(400,'Pilih sesi dengan jam yang tidak bertumpuk');
   const records=[...await rows(db,'absenstaf'),...await rows(db,'jamstaf')];
   if(selected.some(s=>records.some(r=>r.staffId===id&&r.tanggal===today&&r.mulai<s.selesai&&r.selesai>s.mulai)))throw fail(409,'Ada sesi yang sudah diisi. Muat ulang dan pilih sesi yang belum diisi');
   const reportedAt=new Date().toISOString(),proof={staffId:id,requestId:d.requestId,requestHash:hash,reportedAt,reportedBy:String(req.user.id),reportedName:req.user.nama,location:loc,photo:image,slotKeys:d.slotKeys};
   const result=await db.query("INSERT INTO data_klub(jenis,data) VALUES('buktistaf',$1) RETURNING id",[JSON.stringify(proof)]),checkInId=String(result.rows[0].id);
   for(const s of selected){const saved={staffId:id,tanggal:today,mulai:s.mulai,selesai:s.selesai,status:'Hadir melatih',kelas:s.kelas,catatan:'Hadir Hari Ini',replacementId:'',sourceId:s.sourceIds[0]||'',atletIds:[],origin:'coach',requestId:d.requestId+':'+s.mulai,revision:crypto.randomUUID(),reportedAt,reportedBy:String(req.user.id),reportedName:req.user.nama,checkInId};const q=await db.query("INSERT INTO data_klub(jenis,data) VALUES('absenstaf',$1) RETURNING id",[JSON.stringify(saved)]);await audit(db,req.user,'hadir-hari-ini','absenstaf',String(q.rows[0].id),null,saved);}
   return {id:checkInId,reportedAt};
  });res.json({data,pesan:'Kehadiran, foto, waktu, dan lokasi tersimpan.'});
 }));
 app.get('/api/owner/staff-check-in/:id',owner,wrap(async(req,res)=>{if(!/^\d+$/.test(req.params.id))throw fail(404,'Bukti tidak ditemukan');const found=await transaction(async db=>(await db.query("SELECT id,data FROM data_klub WHERE jenis='buktistaf' AND id=$1",[req.params.id])).rows[0]),p=found?{...found.data,id:String(found.id)}:null;if(!p)throw fail(404,'Bukti tidak ditemukan');res.set('Cache-Control','no-store').json(p);}));
}
module.exports={mount,location,photo};
