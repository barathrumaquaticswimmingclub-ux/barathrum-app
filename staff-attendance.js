'use strict';
const B=require('./business'),R=require('./regular'),crypto=require('crypto');
const fail=(status,message)=>Object.assign(Error(message),{status});
const states=['Hadir melatih','Hadir menunggu murid','Izin','Sakit','Libur'];
const worked=s=>states.slice(0,2).includes(s);
const mins=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?Number(s.slice(0,2))*60+Number(s.slice(3)):null;
function person(staff,user){const heads=staff.filter(u=>u.role==='coach'&&/\badhi\b/i.test(u.nama));return user.role==='prestasi'&&heads.length===1?String(heads[0].id):String(user.id);}
function slots(staff,user,schedules,month){
 const ownId=person(staff,user),found=new Map(),put=s=>{const key=[s.tanggal,s.mulai,s.selesai].join('|'),old=found.get(key);if(old){for(const c of s.classes)if(!old.classes.includes(c))old.classes.push(c);for(const id of s.sourceIds)if(!old.sourceIds.includes(id))old.sourceIds.push(id);old.libur=old.libur||s.libur;return;}found.set(key,s);};
 for(const s of schedules)if(s.tanggal?.startsWith(month)&&mins(s.mulai)!==null&&mins(s.selesai)>mins(s.mulai)&&!s.regularFixedRetired&&(R.assigned(s,user.id)||String(s.coachId)===ownId||s.coachIds?.map(String).includes(ownId))&&(!s.weeklyKey||!R.isRegular(s)||s.atletIds?.length||s.statusSesi==='Libur'))put({tanggal:s.tanggal,mulai:s.mulai,selesai:s.selesai,classes:[s.jenisKelas],sourceIds:[String(s.id)],libur:s.statusSesi==='Libur'});
 // Available Regular times are choices, not automatic staff attendance or child bookings.
 if(/\b(fauzan|ilyas)\b/i.test(user.nama))for(let date=month+'-01';date<=B.monthEnd(month+'-01');date=B.addDays(date,1)){
  const day=new Date(date+'T12:00:00Z').getUTCDay();if(!day)continue;for(const hour of day===6?[8,9,15,16]:[15,16]){
   const start=String(hour).padStart(2,'0')+':00',end=String(hour+1).padStart(2,'0')+':00',key=[date,start,end].join('|');if(!found.has(key))put({tanggal:date,mulai:start,selesai:end,classes:['Regular Class (fleksibel)'],sourceIds:[],libur:false});
  }
 }
 return [...found.values()].sort((a,b)=>a.tanggal.localeCompare(b.tanggal)||a.mulai.localeCompare(b.mulai)).map(s=>({...s,key:[s.tanggal,s.mulai,s.selesai].join('|'),kelas:s.classes.join(', ')}));
}
function mount(app,h){const {pool,wrap,transaction,rows,audit}=h;
 require('./staff-check-in').mount(app,h);
 const coach=(req,res,next)=>['coach','prestasi'].includes(req.user.role)?next():next(fail(403,'Khusus absensi pribadi pelatih'));
 app.get('/api/coach/staff-attendance',coach,wrap(async(req,res)=>{
  const month=req.query.month||B.today().slice(0,7);if(typeof month!=='string'||!/^\d{4}-\d{2}$/.test(month)||!B.validDate(month+'-01'))throw fail(400,'Pilih bulan yang valid');
  const data=await transaction(async db=>{
   const staff=(await db.query('SELECT id,nama,username,role,active FROM brtm_users')).rows,id=person(staff,req.user);
   if(req.query.staffId&&String(req.query.staffId)!==id)throw fail(403,'Hanya absensi Anda sendiri');
   const records=(await rows(db,'absenstaf')).filter(r=>!r.deleted&&r.staffId===id&&r.tanggal.startsWith(month)),verified=(await rows(db,'jamstaf')).filter(r=>!r.deleted&&r.staffId===id&&r.tanggal.startsWith(month));
   for(const r of records)r.review=r.ownerManaged?'Dicatat Owner':r.checkInId?'Tercatat':verified.some(v=>v.tanggal===r.tanggal&&v.mulai<=r.mulai&&v.selesai>=r.selesai)?'Diverifikasi Owner':'Terkirim ke Owner';
   const available=slots(staff,req.user,await rows(db,'jadwal'),month);
   return {month,today:B.today(),time:B.time(),staffId:id,nama:req.user.nama,states,records:records.sort((a,b)=>b.tanggal.localeCompare(a.tanggal)||b.mulai.localeCompare(a.mulai)),slots:available,replacements:staff.filter(u=>u.active&&u.role==='coach'&&String(u.id)!==id).map(u=>({id:String(u.id),nama:u.nama}))};
  });res.json(data);
 }));
 app.post('/api/coach/staff-attendance',coach,wrap(async(req,res)=>{
  const d=req.body;if(worked(d.status))throw fail(400,'Gunakan Hadir Hari Ini dengan foto dan lokasi aktif');if(!/^[-\w]{10,80}$/.test(d.requestId||'')||!B.validDate(d.tanggal)||!states.includes(d.status))throw fail(400,'Isi tanggal dan status absensi');
  const start=mins(d.mulai),end=mins(d.selesai);if(start===null||end===null||end<=start||end-start>240)throw fail(400,'Isi jam per sesi, maksimal 4 jam');
  if(d.tanggal>B.addDays(B.today(),35)||worked(d.status)&&(d.tanggal>B.today()||d.tanggal===B.today()&&d.selesai>B.time().slice(0,5)))throw fail(400,'Kehadiran diisi setelah sesi selesai. Izin/sakit boleh dilaporkan sebelum sesi.');
  const note=String(d.catatan||'').trim();if(note.length>1000||!worked(d.status)&&note.length<3)throw fail(400,'Isi alasan izin, sakit, atau libur');
  const data=await transaction(async db=>{
   await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const staff=(await db.query('SELECT id,nama,username,role,active FROM brtm_users')).rows,id=person(staff,req.user);
   if(d.staffId!==undefined&&String(d.staffId)!==id)throw fail(403,'Hanya dapat mengisi absensi Anda sendiri');
   const schedules=await rows(db,'jadwal'),available=slots(staff,req.user,schedules,d.tanggal.slice(0,7));
   const slot=d.slotKey?available.find(s=>s.key===d.slotKey&&s.tanggal===d.tanggal&&s.mulai===d.mulai&&s.selesai===d.selesai):null;
   if(d.slotKey&&!slot)throw fail(403,'Sesi tidak ditugaskan kepada Anda. Untuk sesi tambahan pilih isi jam sendiri.');
   const replacementId=['Izin','Sakit'].includes(d.status)?String(d.replacementId||''):'';
   if(replacementId&&!staff.some(u=>String(u.id)===replacementId&&u.active&&u.role==='coach'&&String(u.id)!==id))throw fail(400,'Pilih pelatih pengganti yang valid');
   const kelas=String(slot?.kelas||d.kelas||'Jam tugas staf').trim();if(!kelas||kelas.length>200)throw fail(400,'Isi kelas / tugas maksimal 200 karakter');
   const sourceIds=slot?.sourceIds||[],a=await rows(db,'absensi');
   const linked=worked(d.status)&&d.status!=='Hadir menunggu murid'?a.filter(r=>sourceIds.includes(String(r.jadwalId))&&r.status==='Hadir'&&(!R.isRegular(r)||String(r.dibuatOlehId)===String(req.user.id)||r.dibuatOleh===req.user.username)):[];
   const payload={staffId:id,tanggal:d.tanggal,mulai:d.mulai,selesai:d.selesai,status:d.status,kelas,catatan:note,replacementId,sourceId:sourceIds[0]||'',atletIds:[...new Set(linked.map(r=>String(r.atletId)))]};
   const hash=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),all=await rows(db,'absenstaf'),retry=all.find(r=>r.requestId===d.requestId);
   if(retry){if(retry.staffId!==id||retry.requestHash!==hash)throw fail(409,'Kode penyimpanan sudah dipakai. Muat ulang formulir.');return retry;}
   if((await rows(db,'jamstaf')).some(r=>r.staffId===id&&r.tanggal===d.tanggal&&r.mulai<d.selesai&&r.selesai>d.mulai))throw fail(409,'Jam ini sudah diverifikasi Owner. Hubungi Owner untuk koreksi.');
   if(d.id){const target=all.find(r=>r.id===String(d.id));if(!target||target.staffId!==id)throw fail(403,'Hanya catatan absensi Anda sendiri');if(target.tanggal!==d.tanggal||target.mulai!==d.mulai||target.selesai!==d.selesai)throw fail(400,'Tanggal dan jam catatan lama tidak dapat dipindahkan. Hubungi Owner untuk koreksi.');}
   const old=all.find(r=>r.staffId===id&&r.tanggal===d.tanggal&&r.mulai===d.mulai&&r.selesai===d.selesai);
   if(old&&(old.deleted||old.ownerManaged||old.checkInId))throw fail(409,'Absensi ini hanya dapat diubah oleh Owner');
   if(!old&&d.expectedRevision)throw fail(409,'Catatan absensi sudah berubah. Muat ulang daftar.');
   if(old&&d.expectedRevision!==old.revision)throw fail(409,'Absensi sudah berubah. Muat ulang sebelum memperbaiki.');
   if(all.some(r=>r.id!==old?.id&&r.staffId===id&&r.tanggal===d.tanggal&&r.mulai<d.selesai&&r.selesai>d.mulai))throw fail(409,'Jam bertumpuk dengan absensi Anda. Koreksi catatan yang sudah ada.');
   const saved={...payload,origin:'coach',requestId:d.requestId,requestHash:hash,revision:crypto.randomUUID(),reportedAt:new Date().toISOString(),reportedBy:String(req.user.id),reportedName:req.user.nama};
   const q=old?await db.query("UPDATE data_klub SET data=$1 WHERE id=$2 AND jenis='absenstaf' RETURNING id",[JSON.stringify(saved),old.id]):await db.query("INSERT INTO data_klub(jenis,data) VALUES('absenstaf',$1) RETURNING id",[JSON.stringify(saved)]);
   const out={...saved,id:String(q.rows[0].id)};await audit(db,req.user,old?'koreksi-absensi-staf-sendiri':'isi-absensi-staf-sendiri','absenstaf',out.id,old,out);return out;
  });res.json({data,pesan:'Absensi Anda tersimpan di Slip Gaji Staf dan terlihat oleh Owner. Absensi anak tetap diisi terpisah.'});
 }));
}
module.exports={mount,slots,person,states,worked};
