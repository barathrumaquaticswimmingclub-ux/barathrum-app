'use strict';
const B=require('./business'),crypto=require('node:crypto');
const fail=(status,message)=>Object.assign(Error(message),{status});
async function extendPackages(db,user,schedule,payments,save){
 const packs=await payments(db,true);
 for(const p of packs.filter(p=>(schedule.atletIds||[]).map(String).includes(String(p.atletId))&&p.totalPertemuan!==null&&p.tanggal<=schedule.tanggal&&p.berlakuSampai>=schedule.tanggal)){
  const pengecualian={alasan:'Libur BRTM: '+schedule.alasanLibur,berlakuSampai:B.addDays(p.berlakuSampai,7),oleh:user.username,pada:new Date().toISOString()};
  await save(db,user,'pembayaran',{...p,pengecualian},p);
 }
}
function selection(input){
 const date=input.date,className=B.canonical(input.className);
 if(!B.validDate(date))throw fail(400,'Pilih tanggal libur yang valid');
 if(className!=='Semua kelas'&&!Object.hasOwn(B.CLASSES,className))throw fail(400,'Pilih kelas atau Semua kelas');
 return {date,className};
}
const matches=(s,q)=>s.tanggal===q.date&&(q.className==='Semua kelas'||B.canonical(s.jenisKelas)===q.className);
const revision=s=>crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex');
function mount(app,{pool,owner,wrap,transaction,rows,save,payments,audit}){
 async function correction(db,id){
  if(!/^[1-9]\d{0,14}$/.test(id||''))throw fail(400,'ID sesi tidak valid');
  const s=(await rows(db,'jadwal')).find(s=>s.id===id);if(!s)throw fail(404,'Jadwal tidak ditemukan');
  const attendance=(await rows(db,'absensi')).filter(r=>r.jadwalId===id),notes=(await rows(db,'perkembangan')).filter(r=>r.jadwalId===id);
  return {schedule:s,attendance,notes,revision:revision({s,attendance,notes})};
 }
 app.get('/api/owner/holidays/:id/correction',owner,wrap(async(req,res)=>{
  const c=await correction(pool,req.params.id);
  res.json({schedule:{id:c.schedule.id,nama:c.schedule.nama,tanggal:c.schedule.tanggal,jam:c.schedule.jam,kelas:c.schedule.jenisKelas,lokasi:c.schedule.lokasi,statusSesi:c.schedule.statusSesi},attendance:c.attendance.map(r=>({id:r.id,nama:r.namaAtlet||'Atlet #'+r.atletId,status:r.status,tanggal:r.tanggal})),notesCount:c.notes.length,revision:c.revision});
 }));
 app.post('/api/owner/holidays/:id/correction',owner,wrap(async(req,res)=>{
  const {requestId}=req.body,reason=String(req.body.reason||'').trim(),holidayReason=String(req.body.holidayReason||'Libur latihan BRTM').trim();
  if(req.body.confirm!==true||reason.length<8||reason.length>500||!holidayReason||holidayReason.length>500||!/^[-\w]{10,80}$/.test(requestId||''))throw fail(400,'Konfirmasi pembatalan, alasan koreksi minimal 8 karakter, dan keterangan libur wajib diisi');
  const result=await transaction(async db=>{
   await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');const c=await correction(db,req.params.id),s=c.schedule;
   if(s.holidayCorrection?.requestId===requestId)return {duplicate:true,deletedAttendance:0,deletedNotes:0};
   if(c.revision!==req.body.revision)throw fail(409,'Absensi atau jadwal berubah. Buka kembali tinjauan sebelum mengoreksi.');
   if(!c.attendance.length&&!c.notes.length)throw fail(409,'Tidak ada absensi salah yang perlu dibatalkan. Gunakan Libur latihan biasa.');
   const meta={reason,scheduleId:s.id,requestId};
   for(const [kind,list] of [['absensi',c.attendance],['perkembangan',c.notes]])for(const r of list){
    await audit(db,req.user,'batal-catatan-sesi-libur',kind,r.id,r,meta);
    await db.query('DELETE FROM data_klub WHERE jenis=$1 AND id=$2',[kind,r.id]);
   }
   const N=require('./notifications');
   for(const r of c.attendance){
    const notices=(await db.query("SELECT id,title,body FROM brtm_notifications WHERE athlete_id=$1 AND (event_key LIKE $2 OR event_key LIKE $3)",[r.atletId,'hadir:'+r.id+':%','koreksi-hadir:'+r.id+':%'])).rows;
    for(const n of notices){
     const next={title:'Koreksi kehadiran: sesi libur',body:'Catatan kehadiran tanggal '+s.tanggal+' dibatalkan karena sesi latihan diliburkan.'};
     await audit(db,req.user,'koreksi-notifikasi-libur','notifikasi',String(n.id),n,{...next,...meta});
     await db.query('UPDATE brtm_notifications SET title=$1,body=$2 WHERE id=$3',[next.title,next.body,n.id]);
     await db.query('DELETE FROM brtm_push_jobs WHERE notification_id=$1 AND sent_at IS NULL',[n.id]);
    }
   }
   const ids=[...new Set([...c.attendance,...c.notes].map(r=>r.atletId))];
   for(const aid of ids){await require('./spp').reconcile(db,aid,req.user);await N.enqueue(db,aid,'batal-absensi-libur:'+s.id+':'+requestId,'Koreksi kehadiran latihan','Sesi latihan tanggal '+s.tanggal+' pukul '+(s.jam||s.mulai||'sesuai jadwal')+' dinyatakan libur. Catatan kehadiran dan evaluasi sesi yang salah dibatalkan.');}
   const next={...s,statusSesi:'Libur',alasanLibur:holidayReason,atletIds:s.atletIds||[],holidayCorrection:{requestId,deletedAttendance:c.attendance.length,deletedNotes:c.notes.length}};
   if(s.statusSesi!=='Libur')await extendPackages(db,req.user,next,payments,save);
   await save(db,req.user,'jadwal',next,s);
   await audit(db,req.user,'koreksi-absensi-dan-liburkan','jadwal',s.id,s,{...next,...meta});
   return {deletedAttendance:c.attendance.length,deletedNotes:c.notes.length};
  });res.json({...result,pesan:result.duplicate?'Koreksi ini sudah tersimpan; tidak ada pembatalan atau perpanjangan ganda.':'Absensi salah dibatalkan dan sesi diliburkan. Kuota serta SPP dihitung ulang; penerimaan pembayaran tetap tersimpan.'});
 }));
 app.get('/api/owner/holidays/preview',owner,wrap(async(req,res)=>{
  const q=selection(req.query),attendance=await rows(pool,'absensi');
  const sessions=(await rows(pool,'jadwal')).filter(s=>matches(s,q)).sort((a,b)=>String(a.mulai).localeCompare(String(b.mulai))||String(a.pelatih).localeCompare(String(b.pelatih)));
  res.json({...q,sessions:sessions.map(s=>({id:s.id,revision:revision(s),kelas:s.jenisKelas,nama:s.nama,jam:s.jam||s.mulai+'–'+s.selesai,lokasi:s.lokasi,pelatih:s.pelatih,peserta:(s.atletIds||[]).length,libur:s.statusSesi==='Libur',alasanLibur:s.alasanLibur||'',hasAttendance:attendance.some(a=>a.jadwalId===s.id),attendanceCount:attendance.filter(a=>a.jadwalId===s.id).length}))});
 }));
 app.post('/api/owner/holidays',owner,wrap(async(req,res)=>{
  const q=selection(req.body),reason=String(req.body.reason||'').trim(),ids=req.body.scheduleIds;
  if(!reason||reason.length>500)throw fail(400,'Isi keterangan libur maksimal 500 karakter');
  if(!Array.isArray(ids)||!ids.length||ids.length>200||ids.some(id=>typeof id!=='string'||!(/^[1-9]\d{0,14}$/).test(id))||new Set(ids).size!==ids.length)throw fail(400,'Pilih sesi latihan yang diliburkan');
  const result=await transaction(async db=>{
   await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const schedules=await rows(db,'jadwal'),attendance=await rows(db,'absensi'),chosen=ids.map(id=>schedules.find(s=>s.id===id));
   if(chosen.some(s=>!s||!matches(s,q)))throw fail(409,'Pilihan jadwal berubah atau tidak sesuai kelas/tanggal. Muat ulang daftar sesi.');
   for(const s of chosen)if(s.statusSesi!=='Libur'){
    if(attendance.some(a=>a.jadwalId===s.id))throw fail(409,'Sesi '+(s.jam||s.nama)+' sudah memiliki absensi. Periksa absensi terlebih dahulu; sesi tidak diubah.');
    if(!req.body.revisions||req.body.revisions[s.id]!==revision(s))throw fail(409,'Jadwal berubah sejak daftar dibuka. Muat ulang daftar sesi sebelum menyimpan.');
   }
   let changed=0;for(const s of chosen)if(s.statusSesi!=='Libur'){
    const next={...s,statusSesi:'Libur',alasanLibur:reason,atletIds:s.atletIds||[]};
    await extendPackages(db,req.user,next,payments,save);await save(db,req.user,'jadwal',next,s);changed++;
   }
   return {changed,alreadyHoliday:chosen.length-changed};
  });res.json({...result,pesan:result.changed?result.changed+' sesi ditandai Libur. Tidak perlu absensi anak pada sesi tersebut.':'Sesi sudah libur; tidak ada perubahan atau notifikasi ganda.'});
 }));
}
module.exports={mount,extendPackages};
