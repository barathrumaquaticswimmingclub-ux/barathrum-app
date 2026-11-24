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
   if(attendance.some(a=>a.paketId===old.id&&['Hadir','Alpa'].includes(a.status)&&a.tanggal>end))throw fail(409,'Batas paket lama tidak boleh melewati latihan yang telah dipakai.');
   const prepared=await validate(req,db,'pembayaran',{...req.body,atletId:old.atletId,jenisKelas:old.jenisKelas,rincianOwner:true,paketKhusus:true,biayaPendaftaran:0,alasanKhusus:'Perpanjangan paket oleh Owner'},null);
   if(end!==view.berlakuSampai)await save(db,req.user,'pembayaran',{...old,tanggalBerakhir:end,pengecualian:null,statusManual:'Otomatis'},old);
   const p=await save(db,req.user,'pembayaran',{...prepared,renewalFrom:old.id,renewalRequestId:req.body.requestId},null);
   await notify(db,p,end);return p;
  });res.json({data,pesan:'Paket baru tersimpan, riwayat lama tetap ada, dan pemberitahuan tersedia di BRTM SWIM.'});
 }));
}
function nextQuota(p){
 // Only explicit frequency notes override the class allocation; do not infer from prices.
 const matches=[...String(p.catatan||'').matchAll(/\b([12])\s*(?:x|×|kali)\s*(?:(?:per|dalam)\s*|\/\s*)?(?:se|satu\s*)?minggu\b/gi)];
 return matches.length?Number(matches.at(-1)[1])*4:Math.max(B.CLASSES[B.canonical(p.jenisKelas)]?.sesi||4,Number(p.totalPertemuan)||0);
}
async function syncLegacyQuota(db,{rows,payments,save}){
 const views=await payments(db);
 for(const p of await rows(db,'pembayaran')){
  const standard=B.CLASSES[B.canonical(p.jenisKelas)]?.sesi;
  if(!standard||p.quotaSyncVersion===1||p.dibatalkan||!(p.activationOnly||p.automaticRenewal)||!Number.isInteger(p.totalPertemuan)||p.totalPertemuan<1||p.totalPertemuan>=standard)continue;
  const view=views.find(v=>v.id===p.id);
  // Imported opening balances keep the exact remaining sessions; automatic packages
  // represent a full allocation; retain any usage corrected by the Owner.
  const pemakaianAwal=p.automaticRenewal?view.pemakaianAwal:view.pemakaianAwal+standard-p.totalPertemuan;
  await save(db,{id:null,username:'sistem-kuota'},'pembayaran',{...p,totalPertemuan:standard,pemakaianAwal,quotaSyncVersion:1},p);
 }
}
async function renewExhausted(db,{rows,payments,save}){
 await syncLegacyQuota(db,{rows,payments,save});
 const all=await payments(db),athletes=(await rows(db,'atlet')).filter(a=>a.status==='Aktif'&&!a.mergedInto);
 for(const a of athletes){
  if(B.canonical(a.kelompok)==='Prestasi Class')continue;
  const related=all.filter(p=>String(p.atletId)===String(a.id)&&B.canonical(p.jenisKelas)===B.canonical(a.kelompok)&&!p.dibatalkan).sort((x,y)=>y.tanggal.localeCompare(x.tanggal)||Number(y.id)-Number(x.id));
  const old=related[0];
  if(!old||old.sisaPertemuan!==0||old.tanggal>B.today()||old.statusManual==='Kedaluwarsa'||!['Lunas','Belum Lunas'].includes(old.status)||related.some(p=>p.renewalFrom===old.id))continue;
  const terms=B.price({tanggal:B.today(),status:'Belum Lunas',paketKhusus:true,rincianOwner:true,kuotaKhusus:nextQuota(old),biayaKhusus:old.jumlah,potonganDiskon:old.potonganDiskon||0,biayaPendaftaran:0,alasanKhusus:'Perpanjangan otomatis karena kuota habis'},a);
  const p=await save(db,{id:null,username:'sistem-paket'},'pembayaran',{...terms,atletId:a.id,namaAtlet:a.nama,renewalFrom:old.id,renewalRequestId:'automatic:'+old.id,automaticRenewal:true,quotaSyncVersion:1,catatan:old.catatan||'',pemakaianAwal:0},null);
  all.push(B.packageView(p));
  const key='paket-otomatis:'+p.id;
  const notice=(await db.query('INSERT INTO brtm_billing_notices(athlete_id,event_key,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[a.id,key,JSON.stringify({...p,provisional:true})])).rows[0];
  if(notice)await N.enqueue(db,a.id,'invoice:'+notice.id,'Paket baru — Belum Lunas',`Ayah/Bunda, kuota ${a.nama} sebelumnya telah habis. Paket baru ${p.totalPertemuan} pertemuan sudah tersedia dengan tagihan Rp${p.totalTagihan.toLocaleString('id-ID')}, berstatus Belum Lunas. Invoice tersedia di aplikasi. Pembayaran hanya melunasi tagihan ini dan tidak menambah kuota lagi.`);
 }
}
module.exports={mount,renewExhausted,nextQuota};
