'use strict';
const B=require('./business'),R=require('./regular');
const fail=(status,message)=>Object.assign(Error(message),{status});
const mins=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?Number(s.slice(0,2))*60+Number(s.slice(3)):null;
const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const states=['Hadir melatih','Hadir menunggu murid','Tidak hadir','Libur'];
const worked=s=>states.slice(0,2).includes(s);
const day=s=>new Intl.DateTimeFormat('id-ID',{weekday:'long',timeZone:'Asia/Jakarta'}).format(new Date(s+'T12:00:00Z'));
const period=(date,start)=>new Date(date+'T12:00:00Z').getUTCDay()===6||start>='12:00'?'sore':'pagi';
function cut(a,b,covers){let parts=[[a,b]];for(const [x,y] of covers)parts=parts.flatMap(([p,q])=>y<=p||x>=q?[[p,q]]:[[p,Math.min(q,x)],[Math.max(p,y),q]].filter(([u,v])=>v>u));return parts;}
function historical(schedules,slots,edits,month,until){
 const extra=[],dateOf=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
 for(const slot of slots){const changes=edits.filter(e=>String(e.record_id)===String(slot.id)).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));if(!changes.length)continue;
  for(let date=month+'-01';date<=until;date=B.addDays(date,1)){
   if(!changes.some(e=>dateOf(e.created_at)<=date))continue;
   const next=changes.find(e=>dateOf(e.created_at)>date),s=next?.before_data||slot;
   if(Number(s.weekday)!==new Date(date+'T12:00:00Z').getUTCDay()||!s.class_name||!(s.athlete_ids||[]).length)continue;
   // Fixed Regular assignments cease to define attendance when flexible booking starts.
   if(R.isRegular({jenisKelas:s.class_name})&&schedules.some(j=>j.regularFlex&&j.tanggal<=date&&(!j.lokasi||j.lokasi===s.place)))continue;
   if(schedules.some(j=>j.tanggal===date&&(j.weeklyKey==='weekly:'+slot.id||String(j.coachId)===String(s.coach_id)&&j.mulai===s.start_time&&j.selesai===s.end_time&&j.lokasi===s.place)))continue;
   extra.push({id:'historical:'+slot.id+':'+date,tanggal:date,mulai:s.start_time,selesai:s.end_time,coachId:String(s.coach_id),lokasi:s.place,jenisKelas:s.class_name,atletIds:s.athlete_ids,historyOnly:true});
  }
 }
 return extra;
}
function augment(report,{staff,schedules,attendance,athletes,workRecords=[],weeklySlots=[],slotChanges=[],now=B.time()},union){
 const coaches=staff.filter(u=>['coach','prestasi'].includes(u.role)),heads=coaches.filter(u=>u.role==='coach'&&/\badhi\b/i.test(u.nama));
 const canonical=id=>{const u=coaches.find(u=>String(u.id)===String(id));return u?.role==='prestasi'&&heads.length===1?String(heads[0].id):u?String(u.id):null;};
 const closed=s=>s.tanggal<report.asOf||s.tanggal===report.asOf&&s.selesai<=now.slice(0,5);
 const inMonth=s=>B.validDate(s.tanggal)&&s.tanggal.startsWith(report.month)&&mins(s.mulai)!==null&&mins(s.selesai)>mins(s.mulai);
 const plans=[...schedules,...historical(schedules,weeklySlots,slotChanges,report.month,report.asOf<report.end?report.asOf:report.end)].filter(inMonth);
 for(const u of coaches)if(canonical(u.id)===String(u.id)&&!report.rows.some(r=>r.id===String(u.id))&&(workRecords.some(r=>canonical(r.staffId)===String(u.id))||plans.some(s=>canonical(s.coachId)===String(u.id))))report.rows.push({id:String(u.id),nama:u.nama,jamSore:0,jamPagi:0,menitSore:0,menitPagi:0,rincian:[]});
 const pupil=id=>({id:String(id),nama:athletes.find(a=>String(a.id)===String(id))?.nama||attendance.find(r=>String(r.atletId)===String(id))?.namaAtlet||'Atlet #'+id});
 for(const row of report.rows){
  const assigned=s=>(s.coachIds?.length?s.coachIds:[s.coachId]).some(id=>canonical(id)===row.id);
  const own=plans.filter(s=>assigned(s)&&closed(s)&&!s.regularFixedRetired&&(!s.weeklyKey||!R.isRegular(s)||s.atletIds?.length));
  const relevant=own.filter(s=>s.atletIds?.length||s.historyOnly||s.statusSesi==='Libur');
  const manual=workRecords.filter(r=>canonical(r.staffId)===row.id&&inMonth(r)&&r.tanggal<=report.asOf);
  // A verified staff record supersedes only its own interval; child attendance is untouched.
  for(const m of manual){const a=mins(m.mulai),b=mins(m.selesai);
   row.rincian=row.rincian.flatMap(d=>d.tanggal!==m.tanggal?[d]:cut(mins(d.mulai),mins(d.selesai),[[a,b]]).map(([x,y])=>({...d,mulai:clock(x),selesai:clock(y),menit:d.menit?y-x:0,jam:d.menit?(y-x)/60:0})));
   const parts=new Date(m.tanggal+'T12:00:00Z').getUTCDay()===6?[[a,b]]:[[a,Math.min(b,720)],[Math.max(a,720),b]].filter(([x,y])=>y>x);
   for(const [x,y] of parts)row.rincian.push({tanggal:m.tanggal,hari:day(m.tanggal),mulai:clock(x),selesai:clock(y),kategori:period(m.tanggal,clock(x)),menit:worked(m.status)?y-x:0,jam:worked(m.status)?(y-x)/60:0,status:m.status,keterangan:m.status+' · Diverifikasi Owner: '+m.alasan,kelas:[{nama:m.kelas||'Jam tugas staf',atlet:(m.atletIds||[]).map(pupil)}],verificationId:m.id,expectedRevision:m.revision,ownerVerified:true,alasan:m.alasan,recordStart:m.mulai,recordEnd:m.selesai,recordSourceId:m.sourceId});
  }
  const settled=d=>d.ownerVerified||d.status==='Melatih'||d.status==='Libur';
  // Empty or unfilled sessions are unresolved STAFF presence, never proof of absence.
  for(const d of row.rincian){d.perluVerifikasi=!settled(d)&&d.status!=='Pelatih lain';if(d.perluVerifikasi)d.keterangan+=' · Kehadiran staf belum diverifikasi';}
  for(const s of relevant){
   if(s.statusSesi==='Libur')continue;
   const evidence=attendance.filter(r=>String(r.jadwalId)===String(s.id));
   const writer=r=>canonical(r.dibuatOlehId||coaches.find(u=>String(u.username).toLowerCase()===String(r.dibuatOleh||'').toLowerCase())?.id);
   if(s.regularFlex&&evidence.some(r=>r.status==='Hadir'&&writer(r))&&!evidence.some(r=>r.status==='Hadir'&&!writer(r))){
    const covered=row.rincian.filter(d=>d.tanggal===s.tanggal).map(d=>[mins(d.mulai),mins(d.selesai)]);
    for(const [x,y] of cut(mins(s.mulai),mins(s.selesai),covered))row.rincian.push({tanggal:s.tanggal,hari:day(s.tanggal),mulai:clock(x),selesai:clock(y),kategori:period(s.tanggal,clock(x)),menit:0,jam:0,status:'Pelatih lain',keterangan:'Absensi dicatat pelatih lain; tidak menambah jam staf ini',kelas:[{nama:s.jenisKelas,atlet:(s.atletIds||[]).map(pupil)}],perluVerifikasi:false});
    continue;
   }
   const covered=row.rincian.filter(d=>d.tanggal===s.tanggal&&(settled(d)||d.perluVerifikasi||d.status==='Pelatih lain')).map(d=>[mins(d.mulai),mins(d.selesai)]);
   for(const [x,y] of cut(mins(s.mulai),mins(s.selesai),covered))row.rincian.push({tanggal:s.tanggal,hari:day(s.tanggal),mulai:clock(x),selesai:clock(y),kategori:period(s.tanggal,clock(x)),menit:0,jam:0,status:'Perlu verifikasi',keterangan:(s.historyOnly?'Jadwal mingguan historis':'Jadwal tercatat')+' · Kehadiran staf belum diverifikasi',kelas:[{nama:s.jenisKelas,atlet:(s.atletIds||[]).map(pupil)}],perluVerifikasi:true});
  }
  row.rincian.sort((a,b)=>a.tanggal.localeCompare(b.tanggal)||a.mulai.localeCompare(b.mulai));
  const minutes=kind=>{const dates=[...new Set(row.rincian.map(d=>d.tanggal))];return dates.reduce((n,date)=>n+union(row.rincian.filter(d=>d.tanggal===date&&d.kategori===kind&&d.menit>0).map(d=>[mins(d.mulai),mins(d.selesai)])),0);};
  row.menitSore=minutes('sore');row.menitPagi=minutes('pagi');row.jamSore=row.menitSore/60;row.jamPagi=row.menitPagi/60;
  const unresolved=row.rincian.filter(d=>d.perluVerifikasi),dates=[...new Set(unresolved.map(d=>d.tanggal))];
  row.jamPerluVerifikasi=dates.reduce((n,date)=>n+union(unresolved.filter(d=>d.tanggal===date).map(d=>[mins(d.mulai),mins(d.selesai)])),0)/60;
  row.tanpaJam=schedules.filter(s=>assigned(s)&&B.validDate(s.tanggal)&&s.tanggal.startsWith(report.month)&&s.tanggal<=report.asOf&&!inMonth(s)&&!manual.some(m=>m.sourceId===String(s.id)&&m.tanggal===s.tanggal)&&attendance.some(r=>String(r.jadwalId)===String(s.id)&&r.status==='Hadir')).map(s=>({tanggal:s.tanggal,hari:day(s.tanggal),kelas:[{nama:s.jenisKelas,atlet:(s.atletIds||[]).map(pupil)}],sourceId:s.id,keterangan:'Ada absensi Hadir, tetapi jam sesi belum tersimpan'}));
  row.sesiPerluVerifikasi=unresolved.length+row.tanpaJam.length;
  row.jamTerjadwalTerdeteksi=[...new Set(relevant.map(s=>s.tanggal))].reduce((n,date)=>n+union(relevant.filter(s=>s.tanggal===date).map(s=>[mins(s.mulai),mins(s.selesai)])),0)/60;
  const traced=[...relevant,...row.rincian];row.jamCakupanSesi=[...new Set(traced.map(d=>d.tanggal))].reduce((n,date)=>n+union(traced.filter(d=>d.tanggal===date).map(d=>[mins(d.mulai),mins(d.selesai)])),0)/60;
  row.dataPertama=[...relevant.map(s=>s.tanggal),...row.rincian.map(d=>d.tanggal),...row.tanpaJam.map(d=>d.tanggal)].sort()[0]||null;
  row.cakupanBelumLengkap=!row.dataPertama||row.dataPertama>B.addDays(report.start,6);
  row.statusRekap=row.sesiPerluVerifikasi||row.cakupanBelumLengkap?'Belum lengkap':'Tercatat';
 }
 report.sesiPerluVerifikasi=report.rows.reduce((n,r)=>n+r.sesiPerluVerifikasi,0);
 report.catatanValiditas='Jam terkonfirmasi berasal dari absensi anak Hadir atau verifikasi kehadiran staf oleh Owner. Jam belum diverifikasi tidak berarti staf tidak hadir. Data yang tidak pernah tersimpan perlu dicatat Owner; jumlah jadwal mingguan tidak otomatis menjadi kehadiran.';
 return report;
}
function mount(app,{owner,wrap,transaction,rows,audit}){
 app.post('/api/owner/staff-hours/verify',owner,wrap(async(req,res)=>{
  const d=req.body;
  if(d.confirmed!==true||!/^[1-9]\d{0,14}$/.test(String(d.staffId||''))||!/^[-\w]{10,80}$/.test(d.requestId||'')||!B.validDate(d.tanggal)||d.tanggal>B.today()||mins(d.mulai)===null||mins(d.selesai)<=mins(d.mulai)||!states.includes(d.status)||d.tanggal===B.today()&&d.selesai>B.time().slice(0,5))throw fail(400,'Isi tanggal, jam, dan status kehadiran staf yang valid');
  const alasan=String(d.alasan||'').trim(),kelas=String(d.kelas||'Jam tugas staf').trim(),sourceId=String(d.sourceId||'');
  if(sourceId&&!/^[1-9]\d{0,14}$/.test(sourceId))throw fail(400,'Sumber jadwal tidak valid');
  if(alasan.length<8||alasan.length>1000||kelas.length>200)throw fail(400,'Isi dasar verifikasi minimal 8 karakter');
  if(!Array.isArray(d.atletIds)||d.atletIds.some(id=>!/^\d+$/.test(String(id)))||d.atletIds.length>200)throw fail(400,'Daftar atlet tidak valid');
  const result=await transaction(async db=>{
   await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const staff=(await db.query("SELECT id FROM brtm_users WHERE id=$1 AND role IN ('coach','prestasi')",[d.staffId])).rows[0];if(!staff)throw fail(400,'Pilih staf pelatih');
   if(sourceId&&!(await rows(db,'jadwal')).some(s=>s.id===sourceId&&s.tanggal===d.tanggal))throw fail(400,'Sumber jadwal atau tanggal tidak sesuai');
   const registered=await rows(db,'atlet');if(d.atletIds.some(id=>!registered.some(a=>String(a.id)===String(id))))throw fail(400,'Pilih anak yang masih tersimpan di data atlet');
   const all=await rows(db,'jamstaf'),payload={staffId:String(staff.id),tanggal:d.tanggal,mulai:d.mulai,selesai:d.selesai,status:d.status,alasan,kelas,sourceId,atletIds:d.status==='Hadir melatih'?[...new Set(d.atletIds.map(String))]:[]};
   const retry=all.find(r=>r.requestId===d.requestId);if(retry){if(JSON.stringify(Object.fromEntries(Object.keys(payload).map(k=>[k,retry[k]])))!==JSON.stringify(payload))throw fail(409,'Kode penyimpanan sudah digunakan untuk data lain');return retry;}
   const old=all.find(r=>r.staffId===payload.staffId&&r.tanggal===d.tanggal&&r.mulai===d.mulai&&r.selesai===d.selesai);
   if(old&&d.expectedRevision!==old.revision)throw fail(409,'Verifikasi sudah berubah. Muat ulang rincian sebelum mengoreksi.');
   if(all.some(r=>r.id!==old?.id&&r.staffId===payload.staffId&&r.tanggal===d.tanggal&&r.mulai<d.selesai&&r.selesai>d.mulai))throw fail(409,'Jam bertumpuk dengan verifikasi staf yang sudah ada. Koreksi catatan tersebut.');
   const saved={...payload,requestId:d.requestId,revision:require('crypto').randomUUID(),verifiedAt:new Date().toISOString(),verifiedBy:req.user.username};
   const q=old?await db.query("UPDATE data_klub SET data=$1 WHERE id=$2 AND jenis='jamstaf' RETURNING id",[JSON.stringify(saved),old.id]):await db.query("INSERT INTO data_klub(jenis,data) VALUES('jamstaf',$1) RETURNING id",[JSON.stringify(saved)]);
   const out={...saved,id:String(q.rows[0].id)};await audit(db,req.user,old?'koreksi-kehadiran-staf':'verifikasi-kehadiran-staf','jamstaf',out.id,old,out);return out;
  });res.json({data:result,pesan:'Kehadiran staf tersimpan. Absensi dan kuota anak tidak berubah.'});
 }));
}
module.exports={augment,mount,historical,states};
