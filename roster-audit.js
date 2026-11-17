'use strict';
const B=require('./business');
async function inspect(db,{rows,payments}){
 const athletes=await rows(db,'atlet'),packs=await payments(db),schedules=await rows(db,'jadwal');
 const slots=(await db.query('SELECT * FROM brtm_weekly_slots ORDER BY id')).rows;
 const users=(await db.query('SELECT id,nama,username,role,active FROM brtm_users ORDER BY id')).rows;
 const edits=(await db.query("SELECT record_id,before_data,after_data,created_at FROM brtm_audit WHERE action='ubah-jadwal-mingguan' ORDER BY created_at DESC,id DESC")).rows;
 const today=B.today(),issues=[],targets=[];
 const assigned=(s,a)=>s.place==='Prestasi'?B.canonical(a.kelompok)==='Prestasi Class':(s.athlete_ids||[]).map(String).includes(a.id);
 const detail=s=>({id:s.id,coachId:s.coach_id,coach:users.find(u=>String(u.id)===String(s.coach_id))?.nama,weekday:s.weekday,start:s.start_time,end:s.end_time,place:s.place,className:s.class_name,athleteIds:s.athlete_ids});
 for(const a of athletes){
  const ownSlots=slots.filter(s=>assigned(s,a)),ownPacks=packs.filter(p=>String(p.atletId)===a.id),paid=ownPacks.some(p=>p.status==='Lunas'&&p.statusMasaBerlaku==='Aktif');
  const reasons=[];if(paid&&ownSlots.length&&a.status!=='Aktif')reasons.push('PAID_ASSIGNED_INACTIVE');
  for(const s of ownSlots){
   if(!users.some(u=>String(u.id)===String(s.coach_id)&&u.active))reasons.push('INACTIVE_COACH:'+s.id);
   if(B.canonical(s.class_name)!==B.canonical(a.kelompok))reasons.push('CLASS_MISMATCH:'+s.id);
   for(let n=0;n<7;n++){
    const date=B.addDays(today,n);if(new Date(date+'T12:00:00Z').getUTCDay()!==Number(s.weekday))continue;
    const own=schedules.find(j=>j.tanggal===date&&j.weeklyKey==='weekly:'+s.id);
    if(a.status==='Aktif'&&B.canonical(s.class_name)===B.canonical(a.kelompok)&&(!own||!own.atletIds?.map(String).includes(a.id))){
     const blocking=schedules.filter(j=>j.tanggal===date&&j.mulai<s.end_time&&j.selesai>s.start_time&&(String(j.coachId)===String(s.coach_id)||j.atletIds?.map(String).includes(a.id))).map(j=>({id:j.id,status:j.statusSesi,coachId:j.coachId,className:j.jenisKelas,start:j.mulai,end:j.selesai,athleteIds:j.atletIds,weeklyKey:j.weeklyKey,manualReplacement:!!j.jadwalSebelumnya}));
     reasons.push({code:'MISSING_SESSION_MEMBER',slot:s.id,date,blocking});
    }
   }
  }
  if(reasons.length)issues.push({id:a.id,name:a.nama,status:a.status,className:a.kelompok,paid,reasons,slots:ownSlots.map(detail)});
  if(/gabriel|alula|\blula\b/i.test(a.nama+' '+(a.namaPanggilan||'')))targets.push({id:a.id,name:a.nama,status:a.status,className:a.kelompok,packs:ownPacks.map(p=>({id:p.id,status:p.status,start:p.tanggal,end:p.berlakuSampai,remaining:p.sisaPertemuan,validity:p.statusMasaBerlaku})),slots:ownSlots.map(s=>({...detail(s),lastEdit:edits.find(e=>String(e.record_id)===String(s.id))})),sessions:schedules.filter(j=>j.tanggal>=B.addDays(today,-7)&&j.tanggal<=B.addDays(today,7)&&j.atletIds?.map(String).includes(a.id)).map(j=>({id:j.id,date:j.tanggal,start:j.mulai,end:j.selesai,coachId:j.coachId,status:j.statusSesi,weeklyKey:j.weeklyKey}))});
 }
 return {date:today,totalAthletes:athletes.length,activeAthletes:athletes.filter(a=>a.status==='Aktif').length,paidAssigned:athletes.filter(a=>slots.some(s=>assigned(s,a))&&packs.some(p=>String(p.atletId)===a.id&&p.status==='Lunas'&&p.statusMasaBerlaku==='Aktif')).length,issues,targets,coaches:users.filter(u=>u.role!=='owner')};
}
function log(report){
 console.log('BRTM_ROSTER_AUDIT_SUMMARY '+JSON.stringify({...report,issues:report.issues.length,targets:report.targets.length,coaches:report.coaches}));
 for(const t of report.targets)console.log('BRTM_ROSTER_AUDIT_TARGET '+JSON.stringify(t));
 for(const i of report.issues)console.log('BRTM_ROSTER_AUDIT_ISSUE '+JSON.stringify(i));
}
module.exports={inspect,log};
