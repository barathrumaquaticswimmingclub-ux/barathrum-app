'use strict';
const crypto=require('crypto'),B=require('./business');
const fail=(status,message)=>Object.assign(Error(message),{status});
const states=['Hadir melatih','Hadir menunggu murid','Tidak hadir','Izin','Sakit','Libur'];
const validTime=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const interval=r=>({staffId:r.staffId,tanggal:r.tanggal,mulai:r.mulai,selesai:r.selesai});
function mount(app,{owner,wrap,transaction,rows,audit}){
 async function mutate(req,deleting=false){
  const d=req.body||{},recordId=req.params.id;
  if(!/^[-\w]{10,80}$/.test(d.requestId||'')||recordId&&!/^[1-9]\d{0,14}$/.test(recordId))throw fail(400,'Permintaan absensi tidak valid');
  if(!deleting&&(!/^[1-9]\d{0,14}$/.test(String(d.staffId||''))||!B.validDate(d.tanggal)||d.tanggal>B.today()||!validTime(d.mulai)||!validTime(d.selesai)||d.selesai<=d.mulai||!states.includes(d.status)))throw fail(400,'Isi pelatih, tanggal, jam, dan status yang valid');
  const kelas=String(d.kelas||'Latihan tambahan').trim(),catatan=String(d.catatan||'').trim();
  if(!deleting&&(!kelas||kelas.length>200||catatan.length>1000))throw fail(400,'Kelas maksimal 200 karakter dan catatan maksimal 1000 karakter');
  const hash=crypto.createHash('sha256').update(JSON.stringify({recordId:recordId||'',deleting,staffId:d.staffId,tanggal:d.tanggal,mulai:d.mulai,selesai:d.selesai,status:d.status,kelas,catatan,expectedRevision:d.expectedRevision})).digest('hex');
  return transaction(async db=>{
   await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const all=await rows(db,'absenstaf'),previous=all.find(r=>r.ownerRequestId===d.requestId);
   if(previous){if(previous.ownerRequestHash!==hash)throw fail(409,'Kode penyimpanan sudah digunakan untuk data lain');return previous;}
   const old=recordId?all.find(r=>r.id===recordId):null;
   if(recordId&&!old)throw fail(404,'Absensi tidak ditemukan');
   if(old&&(old.deleted||old.revision!==d.expectedRevision))throw fail(409,'Absensi sudah berubah atau dihapus. Muat ulang sebelum mengedit');
   let saved;
   if(deleting){
    if(!old)throw fail(404,'Absensi tidak ditemukan');
    saved={...old,deleted:true,deletedAt:new Date().toISOString(),payrollExclusions:[...(old.payrollExclusions||[]),interval(old)]};
   }else{
    const staff=(await db.query("SELECT id,nama,role FROM brtm_users WHERE id=$1 AND role IN ('coach','prestasi')",[d.staffId])).rows[0];
    if(!staff)throw fail(400,'Pilih staf pelatih');
    const staffList=(await db.query('SELECT id,nama,role FROM brtm_users')).rows,staffId=require('./staff-attendance').person(staffList,staff);
    if(all.some(r=>!r.deleted&&r.id!==old?.id&&r.staffId===staffId&&r.tanggal===d.tanggal&&r.mulai<d.selesai&&r.selesai>d.mulai))throw fail(409,'Jam bertumpuk dengan absensi pelatih yang sudah ada. Edit catatan tersebut');
    saved={...old,staffId,tanggal:d.tanggal,mulai:d.mulai,selesai:d.selesai,status:d.status,kelas,catatan,ownerManaged:true,origin:old?.origin||'owner',atletIds:old?.atletIds||[],replacementId:'',sourceId:old?.sourceId||'',payrollExclusions:[...(old?.payrollExclusions||[]),...(old?[interval(old)]:[])],reportedAt:old?.reportedAt||new Date().toISOString(),reportedBy:old?.reportedBy||String(req.user.id),reportedName:old?.reportedName||req.user.nama};
   }
   delete saved.id;
   saved.revision=crypto.randomUUID();saved.ownerUpdatedAt=new Date().toISOString();saved.ownerUpdatedBy=String(req.user.id);saved.ownerRequestId=d.requestId;saved.ownerRequestHash=hash;
   const q=old?await db.query("UPDATE data_klub SET data=$1 WHERE jenis='absenstaf' AND id=$2 RETURNING id",[JSON.stringify(saved),old.id]):await db.query("INSERT INTO data_klub(jenis,data) VALUES('absenstaf',$1) RETURNING id",[JSON.stringify(saved)]);
   const out={...saved,id:String(q.rows[0].id)};
   await audit(db,req.user,deleting?'hapus-absensi-pelatih':old?'edit-absensi-pelatih':'tambah-absensi-pelatih','absenstaf',out.id,old,out);
   return out;
  });
 }
 app.post('/api/owner/staff-attendance',owner,wrap(async(req,res)=>res.json({data:await mutate(req),pesan:'Absensi pelatih tersimpan dan rekap jam diperbarui.'})));
 app.put('/api/owner/staff-attendance/:id',owner,wrap(async(req,res)=>res.json({data:await mutate(req),pesan:'Absensi pelatih diperbarui dan jam disinkronkan.'})));
 app.delete('/api/owner/staff-attendance/:id',owner,wrap(async(req,res)=>res.json({data:await mutate(req,true),pesan:'Absensi dihapus dan sesi ini dikeluarkan dari hitungan jam mengajar.'})));
}
module.exports={mount};
