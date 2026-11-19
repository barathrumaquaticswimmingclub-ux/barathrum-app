'use strict';
const B=require('./business'),N=require('./notifications');
const fail=(status,message)=>Object.assign(Error(message),{status});
async function notify(db,p,previousEnd){
 const end=B.packageView(p).berlakuSampai;
 await N.enqueue(db,p.atletId,'package-renewal:'+p.id,'Informasi perpanjangan paket',`Ayah/Bunda, paket ${p.namaAtlet}${previousEnd?' sebelumnya berakhir '+previousEnd:''}. Perpanjangan ${p.totalPertemuan} pertemuan telah tercatat ${p.status==='Lunas'?'lunas':'belum lunas'}, berlaku ${p.tanggal} sampai ${end}. Terima kasih.`);
}
function mount(app,{owner,wrap,transaction,record,rows,validate,save,payments}){
 app.post('/api/owner/package/:id/notify',owner,wrap(async(req,res)=>{
  await transaction(async db=>{const p=await record(db,'pembayaran',req.params.id,true);if(B.canonical(p.jenisKelas)==='Prestasi Class')throw fail(400,'Khusus paket pertemuan');const previousEnd=p.renewalFrom?B.packageView(await record(db,'pembayaran',p.renewalFrom)).berlakuSampai:req.body.previousEnd||'';if(previousEnd&&(!B.validDate(previousEnd)||previousEnd>=p.tanggal))throw fail(400,'Tanggal akhir paket lama harus sebelum paket baru mulai');if(!['Lunas','Belum Lunas'].includes(p.status))throw fail(400,'Status paket tidak dapat diberitahukan');await notify(db,p,previousEnd);});
  res.json({pesan:'Pemberitahuan paket tersedia di BRTM SWIM. Notifikasi HP dikirim jika diaktifkan.'});
 }));
 app.post('/api/owner/package/:id/renew',owner,wrap(async(req,res)=>{
  const data=await transaction(async db=>{
   const old=await record(db,'pembayaran',req.params.id,true);
   if(B.canonical(old.jenisKelas)==='Prestasi Class')throw fail(400,'Khusus paket pertemuan');
   if(!/^[-\w]{10,80}$/.test(req.body.requestId||''))throw fail(400,'Kode perpanjangan tidak valid');
   const existing=(await rows(db,'pembayaran')).find(p=>p.renewalFrom===old.id);
   if(existing){if(existing.renewalRequestId===req.body.requestId)return existing;throw fail(409,'Paket berikutnya sudah ada. Buka riwayat untuk mengeditnya.');}
   const view=(await payments(db)).find(p=>p.id===old.id),end=req.body.oldEnd;
   if(!B.validDate(end)||end<old.tanggal||end>view.berlakuSampai)throw fail(400,'Batas paket lama harus di dalam masa berlaku paket.');
   if(!B.validDate(req.body.tanggal)||req.body.tanggal!==B.addDays(end,1))throw fail(400,'Paket baru dimulai sehari setelah paket lama berakhir.');
   const attendance=await rows(db,'absensi');
   if(attendance.some(a=>a.paketId===old.id&&a.status==='Hadir'&&a.tanggal>end))throw fail(409,'Batas paket lama tidak boleh melewati latihan yang telah dipakai.');
   const prepared=await validate(req,db,'pembayaran',{...req.body,atletId:old.atletId,jenisKelas:old.jenisKelas,rincianOwner:true,paketKhusus:true,biayaPendaftaran:0,alasanKhusus:'Perpanjangan paket oleh Owner'},null);
   if(end!==view.berlakuSampai)await save(db,req.user,'pembayaran',{...old,tanggalBerakhir:end,pengecualian:null,statusManual:'Otomatis'},old);
   const p=await save(db,req.user,'pembayaran',{...prepared,renewalFrom:old.id,renewalRequestId:req.body.requestId},null);
   await notify(db,p,end);return p;
  });res.json({data,pesan:'Paket baru tersimpan, riwayat lama tetap ada, dan pemberitahuan tersedia di BRTM SWIM.'});
 }));
}
module.exports={mount};
