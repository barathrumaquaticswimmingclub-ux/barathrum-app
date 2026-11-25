'use strict';
const B=require('./business'),R=require('./regular'),crypto=require('crypto');
const fail=(status,message)=>Object.assign(Error(message),{status});
const overlap=(s,d)=>s.tanggal===d.tanggal&&s.mulai<d.selesai&&s.selesai>d.mulai;
const assigned=(s,id)=>String(s.coachId)===String(id)||s.coachIds?.map(String).includes(String(id));
const capacity=s=>B.CLASSES[B.canonical(s.jenisKelas)]?.kapasitas===null?Infinity:B.CLASSES[B.canonical(s.jenisKelas)].kapasitas*(s.regularFlex?Math.max(1,s.coachIds?.length||1):1);
function mount(app,h){const {owner,wrap,transaction,rows,record,save}=h;
 app.get('/api/owner/athlete/:id/replacement-options',owner,wrap(async(req,res)=>{
  const date=req.query.date||B.today();if(!B.validDate(date))throw fail(400,'Pilih tanggal yang valid');
  res.json(await transaction(async db=>{
   const athlete=await record(db,'atlet',req.params.id),coaches=(await db.query("SELECT id,nama,role FROM brtm_users WHERE active=TRUE AND role IN ('coach','prestasi') ORDER BY nama")).rows.map(c=>({...c,id:String(c.id)}));
   const sessions=(await rows(db,'jadwal')).filter(s=>s.tanggal===date&&s.statusSesi!=='Libur'&&!s.regularFixedRetired&&B.canonical(s.jenisKelas)===B.canonical(athlete.kelompok)&&s.mulai&&s.selesai);
   return {tanggal:date,coaches,sessions:sessions.map(s=>({id:s.id,coachId:s.coachId,coachIds:s.coachIds||[s.coachId],mulai:s.mulai,selesai:s.selesai,lokasi:s.lokasi,pelatih:s.pelatih,full:!s.atletIds?.map(String).includes(athlete.id)&&(s.atletIds?.length||0)>=capacity(s)}))};
  }));
 }));
 app.post('/api/owner/athlete/:id/replacement',owner,wrap(async(req,res)=>{
  const d=req.body;
  if(!B.validDate(d.tanggal)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.mulai||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.selesai||'')||d.selesai<=d.mulai||!/^\d+$/.test(String(d.coachId||''))||!/^[-\w]{10,80}$/.test(d.requestId||'')||typeof d.lokasi!=='string'||!d.lokasi.trim()||d.lokasi.length>200||String(d.catatan||'').length>1000)throw fail(400,'Isi tanggal, pelatih, jam dan lokasi yang valid');
  const hash=crypto.createHash('sha256').update(JSON.stringify({athleteId:req.params.id,tanggal:d.tanggal,mulai:d.mulai,selesai:d.selesai,coachId:String(d.coachId),lokasi:d.lokasi.trim(),sessionId:d.sessionId||'',catatan:d.catatan||''})).digest('hex');
  const result=await transaction(async db=>{
   await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const athlete=await record(db,'atlet',req.params.id);if(athlete.status!=='Aktif')throw fail(400,'Aktifkan atlet terlebih dahulu');
   const coach=(await db.query("SELECT id,nama FROM brtm_users WHERE id=$1 AND active=TRUE AND role IN ('coach','prestasi')",[d.coachId])).rows[0];if(!coach)throw fail(400,'Pilih pelatih aktif');
   const all=await rows(db,'jadwal'),attendance=await rows(db,'absensi');
   const retry=all.find(s=>s.oneOffBookings?.some(b=>b.requestId===d.requestId));if(retry){const booking=retry.oneOffBookings.find(b=>b.requestId===d.requestId);if(booking.hash!==hash)throw fail(409,'Kode penyimpanan sudah digunakan untuk jadwal lain');return {jadwalId:retry.id,merged:true};}
   let target=d.sessionId?all.find(s=>s.id===String(d.sessionId)):all.find(s=>s.statusSesi!=='Libur'&&!s.regularFixedRetired&&s.tanggal===d.tanggal&&s.mulai===d.mulai&&s.selesai===d.selesai&&s.lokasi===d.lokasi.trim()&&assigned(s,d.coachId)&&B.canonical(s.jenisKelas)===B.canonical(athlete.kelompok));
   if(d.sessionId&&(!target||target.statusSesi==='Libur'||target.regularFixedRetired||target.tanggal!==d.tanggal||target.mulai!==d.mulai||target.selesai!==d.selesai||target.lokasi!==d.lokasi.trim()||!assigned(target,d.coachId)||B.canonical(target.jenisKelas)!==B.canonical(athlete.kelompok)))throw fail(409,'Sesi berubah. Pilih jadwal kembali');
   const peers=all.filter(s=>s.id!==target?.id&&overlap(s,d)&&s.statusSesi!=='Libur'&&!s.regularFixedRetired);
   if(peers.some(s=>assigned(s,d.coachId)&&s.atletIds?.some(id=>String(id)!==athlete.id)))throw fail(409,'Pelatih memiliki jadwal lain pada jam tersebut. Pilih sesi yang sesuai atau jam lain');
   if(all.some(s=>s.statusSesi==='Libur'&&overlap(s,d)&&(assigned(s,d.coachId)||s.atletIds?.map(String).includes(athlete.id))))throw fail(409,'Sesi pada jam tersebut sedang libur. Pilih waktu lain');
   const previous=peers.filter(s=>s.atletIds?.map(String).includes(athlete.id));
   if(previous.some(s=>attendance.some(r=>String(r.jadwalId)===s.id&&String(r.atletId)===athlete.id)))throw fail(409,'Jadwal lama sudah diabsen. Koreksi absensi dahulu sebelum memindahkan');
   const ids=[...new Set([...(target?.atletIds||[]).map(String),athlete.id])];
   if(ids.length>capacity(target||{jenisKelas:B.canonical(athlete.kelompok)}))throw fail(409,'Sesi sudah penuh. Pilih sesi lain');
   for(const old of previous)await save(db,req.user,'jadwal',{...old,atletIds:old.atletIds.filter(id=>String(id)!==athlete.id),oneOffRemovedAthleteIds:[...new Set([...(old.oneOffRemovedAthleteIds||[]),athlete.id])]},old);
   const saved=await save(db,req.user,'jadwal',{...target,nama:target?.nama||'Jadwal pengganti · '+B.canonical(athlete.kelompok),jenisKelas:B.canonical(athlete.kelompok),tanggal:d.tanggal,mulai:d.mulai,selesai:d.selesai,jam:d.mulai+'–'+d.selesai,hari:new Intl.DateTimeFormat('id-ID',{weekday:'long',timeZone:'Asia/Jakarta'}).format(new Date(d.tanggal+'T12:00:00Z')),lokasi:d.lokasi.trim(),coachId:target?.coachId||String(coach.id),pelatih:target?.pelatih||coach.nama,atletIds:ids,statusSesi:'Terjadwal',...(!target?{oneOff:true}:{}),oneOffAthleteIds:[...new Set([...(target?.oneOffAthleteIds||[]),athlete.id])],oneOffRemovedAthleteIds:(target?.oneOffRemovedAthleteIds||[]).filter(id=>String(id)!==athlete.id),oneOffBookings:[...(target?.oneOffBookings||[]),{requestId:d.requestId,hash,athleteId:athlete.id,catatan:String(d.catatan||'')}],catatan:target?.catatan||String(d.catatan||'')},target);
   return {jadwalId:saved.id,merged:!!target};
  });res.json({...result,pesan:'Jadwal pengganti satu kali tersimpan dan muncul di pelatih serta orang tua.'});
 }));
}
module.exports={mount};
