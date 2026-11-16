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
function mount(app,{pool,owner,wrap,transaction,rows,save,payments}){
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
