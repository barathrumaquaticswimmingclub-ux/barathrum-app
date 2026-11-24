'use strict';
const B=require('./business'),R=require('./regular');
const fail=(status,message)=>Object.assign(Error(message),{status});
const minute=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
function union(intervals){let total=0,end=-1;for(const [a,b] of intervals.sort((x,y)=>x[0]-y[0])){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return total;}
function calculate({staff,schedules,attendance,month,today=B.today()}){
 const coaches=staff.filter(u=>['coach','prestasi'].includes(u.role));
 // The shared Prestasi login represents Coach Adhi, not an additional employee.
 const head=coaches.filter(u=>u.role==='coach'&&/\badhi\b/i.test(u.nama));
 const canonical=id=>{const u=coaches.find(u=>String(u.id)===String(id));return u?.role==='prestasi'&&head.length===1?String(head[0].id):u?String(u.id):null;};
 const buckets=new Map(),unassigned=new Set();
 function credit(id,date,start,end,saturday){id=canonical(id);if(!id)return;const parts=saturday?[[start,end,'sore']]:[[start,Math.min(end,720),'pagi'],[Math.max(start,720),end,'sore']];for(const [a,b,period] of parts){if(b<=a)continue;const key=id+'|'+date+'|'+period;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push([a,b]);}}
 const entries=new Map();for(const r of attendance){if(r.status!=='Hadir')continue;const key=String(r.jadwalId);if(!entries.has(key))entries.set(key,[]);entries.get(key).push(r);}
 for(const s of schedules){
  if(!B.validDate(s.tanggal)||!s.tanggal.startsWith(month)||s.tanggal>today||s.statusSesi==='Libur')continue;
  const records=entries.get(String(s.id))||[],start=minute(s.mulai),end=minute(s.selesai);
  if(!records.length||start===null||end===null||end<=start)continue;
  const saturday=new Date(s.tanggal+'T12:00:00Z').getUTCDay()===6;
  if(R.isRegular(s)){
   let ids;
   if(saturday&&start<720){
    ids=coaches.filter(u=>u.role==='coach'&&/\b(fauzan|ilyas)\b/i.test(u.nama)).map(u=>String(u.id));
    if(ids.length!==2)ids=[...new Set((s.coachIds||[]).map(String).filter(id=>canonical(id)))];
    if(ids.length!==2){unassigned.add(String(s.id));continue;}
   }else{
    ids=[...new Set(records.map(r=>{if(r.dibuatOlehId)return canonical(r.dibuatOlehId);return canonical(coaches.find(u=>u.username===r.dibuatOleh)?.id);}).filter(Boolean))];
    if(records.some(r=>!canonical(r.dibuatOlehId||coaches.find(u=>u.username===r.dibuatOleh)?.id)))unassigned.add(String(s.id));
   }
   for(const id of ids)credit(id,s.tanggal,start,end,saturday);
  }else credit(s.coachId,s.tanggal,start,end,saturday);
 }
 const result=[];for(const u of coaches){if(canonical(u.id)!==String(u.id))continue;let pagi=0,sore=0;for(const [key,values] of buckets){const [id,,period]=key.split('|');if(id===String(u.id)){if(period==='pagi')pagi+=union(values);else sore+=union(values);}}
  if(!u.profile?.archived||pagi||sore)result.push({id:String(u.id),nama:u.nama,menitSore:sore,menitPagi:pagi,jamSore:sore/60,jamPagi:pagi/60});
 }
 return {month,rows:result.sort((a,b)=>a.nama.localeCompare(b.nama,'id')),unassignedSessions:unassigned.size};
}
function mount(app,{pool,owner,wrap,transaction,rows}){
 app.get('/api/owner/staff-hours',owner,wrap(async(req,res)=>{
  const month=req.query.month===undefined?B.today().slice(0,7):req.query.month;
  if(typeof month!=='string'||!/^\d{4}-\d{2}$/.test(month)||!B.validDate(month+'-01'))throw fail(400,'Pilih bulan yang valid');
  const data=await transaction(async db=>{
   const staff=(await db.query('SELECT id,nama,username,role,active,profile FROM brtm_users ORDER BY id')).rows;
   return calculate({staff,schedules:await rows(db,'jadwal'),attendance:await rows(db,'absensi'),month});
  });res.json(data);
 }));
}
module.exports={mount,calculate,union};
