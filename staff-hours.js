'use strict';
const B=require('./business'),R=require('./regular');
const fail=(status,message)=>Object.assign(Error(message),{status});
const minute=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
function union(intervals){let total=0,end=-1;for(const [a,b] of intervals.sort((x,y)=>x[0]-y[0])){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return total;}
function calculate({staff,schedules,attendance,athletes=[],month,today=B.today(),now=B.time()}){
 const coaches=staff.filter(u=>['coach','prestasi'].includes(u.role));
 // The shared Prestasi login represents Coach Adhi, not an additional employee.
 const head=coaches.filter(u=>u.role==='coach'&&/\badhi\b/i.test(u.nama));
 const canonical=id=>{const u=coaches.find(u=>String(u.id)===String(id));return u?.role==='prestasi'&&head.length===1?String(head[0].id):u?String(u.id):null;};
 const buckets=new Map(),unassigned=new Set(),detailBuckets=new Map();
 const author=r=>canonical(r.dibuatOlehId||coaches.find(u=>u.username===r.dibuatOleh)?.id);
 const names=records=>records.map(r=>({id:String(r.atletId||r.namaAtlet||''),nama:athletes.find(a=>String(a.id)===String(r.atletId))?.nama||r.namaAtlet||attendance.find(a=>String(a.atletId)===String(r.atletId))?.namaAtlet||'Atlet #'+(r.atletId||'?')}));
 function credit(id,date,start,end,saturday,s,records){id=canonical(id);if(!id)return;const parts=saturday?[[start,end,'sore']]:[[start,Math.min(end,720),'pagi'],[Math.max(start,720),end,'sore']];for(const [a,b,period] of parts){if(b<=a)continue;const key=id+'|'+date+'|'+period;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push([a,b]);if(!detailBuckets.has(key))detailBuckets.set(key,[]);detailBuckets.get(key).push({start:a,end:b,kelas:s.jenisKelas,atlet:names(records)});}}
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
    ids=[...new Set(records.map(author).filter(Boolean))];
    if(records.some(r=>!author(r)))unassigned.add(String(s.id));
   }
   for(const id of ids)credit(id,s.tanggal,start,end,saturday,s,saturday&&start<720?records:records.filter(r=>author(r)===canonical(id)));
  }else credit(s.coachId,s.tanggal,start,end,saturday,s,records);
 }
 const result=[];for(const u of coaches){if(canonical(u.id)!==String(u.id))continue;let pagi=0,sore=0;for(const [key,values] of buckets){const [id,,period]=key.split('|');if(id===String(u.id)){if(period==='pagi')pagi+=union(values);else sore+=union(values);}}
  const rincian=[];for(const [key,values] of detailBuckets){const [id,tanggal,kategori]=key.split('|');if(id!==String(u.id))continue;const merged=[];for(const v of values.sort((a,b)=>a.start-b.start||a.end-b.end)){let g=merged.at(-1);if(!g||v.start>=g.end){g={start:v.start,end:v.end,groups:new Map()};merged.push(g);}g.end=Math.max(g.end,v.end);if(!g.groups.has(v.kelas))g.groups.set(v.kelas,new Map());for(const a of v.atlet)g.groups.get(v.kelas).set(a.id,a);}
   for(const g of merged){const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');rincian.push({tanggal,hari:new Intl.DateTimeFormat('id-ID',{weekday:'long',timeZone:'Asia/Jakarta'}).format(new Date(tanggal+'T12:00:00Z')),mulai:clock(g.start),selesai:clock(g.end),kategori,menit:g.end-g.start,jam:(g.end-g.start)/60,kelas:[...g.groups].sort(([a],[b])=>a.localeCompare(b,'id')).map(([nama,children])=>({nama,atlet:[...children.values()].sort((a,b)=>a.nama.localeCompare(b.nama,'id'))}))});}
  }rincian.sort((a,b)=>a.tanggal.localeCompare(b.tanggal)||a.mulai.localeCompare(b.mulai));
  if(!u.profile?.archived||pagi||sore)result.push({id:String(u.id),nama:u.nama,menitSore:sore,menitPagi:pagi,jamSore:sore/60,jamPagi:pagi/60,rincian});
 }
 // Explanatory rows never contribute minutes to payroll totals.
 for(const row of result)for(const d of row.rincian){d.status='Melatih';d.keterangan='Melatih';}
 const regularPair=s=>{
  const known=coaches.filter(u=>u.role==='coach'&&/\b(fauzan|ilyas)\b/i.test(u.nama)).map(u=>String(u.id));
  return known.length===2?known:[...new Set((s.coachIds||[]).map(canonical).filter(Boolean))];
 };
 const noteRows=new Map();
 function note(id,s,status,keterangan,classes){
  id=canonical(id);const row=result.find(r=>r.id===id);if(!row)return;
  const key=[id,s.tanggal,s.mulai,s.selesai,status].join('|');
  let d=noteRows.get(key);if(!d){d={tanggal:s.tanggal,hari:new Intl.DateTimeFormat('id-ID',{weekday:'long',timeZone:'Asia/Jakarta'}).format(new Date(s.tanggal+'T12:00:00Z')),mulai:s.mulai,selesai:s.selesai,kategori:new Date(s.tanggal+'T12:00:00Z').getUTCDay()===6||s.mulai>='12:00'?'sore':'pagi',menit:0,jam:0,status,keterangan,kelas:[]};noteRows.set(key,d);row.rincian.push(d);}
  for(const k of classes){let group=d.kelas.find(g=>g.nama===k.nama);if(!group){group={nama:k.nama,atlet:[]};d.kelas.push(group);}for(const a of k.atlet)if(!group.atlet.some(x=>x.id===a.id))group.atlet.push(a);}
 }
 const enrolled=s=>names((s.atletIds||[]).map(id=>({atletId:id})));
 const inMonth=s=>B.validDate(s.tanggal)&&s.tanggal.startsWith(month)&&minute(s.mulai)!==null&&minute(s.selesai)>minute(s.mulai);
 const saturdayMorning=s=>new Date(s.tanggal+'T12:00:00Z').getUTCDay()===6&&s.mulai<'12:00';
 const assigned=s=>R.isRegular(s)&&saturdayMorning(s)?regularPair(s):[...new Set((s.coachIds?.length?s.coachIds:[s.coachId]).map(canonical).filter(Boolean))];
 for(const s of schedules.filter(s=>inMonth(s)&&s.statusSesi==='Libur')){
  for(const id of assigned(s))note(id,s,'Libur','Libur'+(s.alasanLibur?' · '+s.alasanLibur:''),[{nama:s.jenisKelas,atlet:enrolled(s)}]);
 }
 // Regular uses per-date flexible bookings. Retired weekly rosters are not evidence
 // of an occupied second session; only actual flexible activation/attendance is.
 for(const first of schedules.filter(s=>inMonth(s)&&s.regularFlex===true&&R.isRegular(s)&&s.statusSesi!=='Libur'&&['08:00','15:00'].includes(s.mulai))){
  const records=entries.get(String(first.id))||[];if(!records.length)continue;
  const start=first.mulai==='08:00'?'09:00':'16:00',end=start==='09:00'?'10:00':'17:00';
  if(first.tanggal>today||first.tanggal===today&&end>now.slice(0,5))continue;
  const ids=saturdayMorning(first)?regularPair(first):[...new Set(records.map(author).filter(Boolean))];
  const second=schedules.filter(s=>inMonth(s)&&R.isRegular(s)&&s.tanggal===first.tanggal&&s.mulai<end&&s.selesai>start&&s.lokasi===first.lokasi&&(s.regularFlex===true||s.statusSesi==='Libur'));
  for(const id of ids){
   const row=result.find(r=>r.id===canonical(id));if(!row||row.rincian.some(r=>r.tanggal===first.tanggal&&r.mulai<end&&r.selesai>start&&['Melatih','Libur'].includes(r.status)))continue;
   const active=second.filter(s=>s.statusSesi!=='Libur'),present=active.some(s=>(entries.get(String(s.id))||[]).length);
   const occupied=active.some(s=>(s.atletIds||[]).length),marked=active.some(s=>attendance.some(r=>String(r.jadwalId)===String(s.id)));
   const otherKnown=active.some(s=>(entries.get(String(s.id))||[]).some(r=>author(r)&&author(r)!==canonical(id)));
   const status=present?(otherKnown?'Pelatih lain':'Pencatat belum jelas'):marked?'Tidak ada anak Hadir':occupied?'Belum diabsen':'Kosong';
   const text=present?(otherKnown?'Sesi ditangani pelatih lain':'Absensi ada; pencatat pelatih belum teridentifikasi'):marked?'Tidak ada anak Hadir':occupied?'Absensi belum diisi':'Kosong belum ada murid';
   const classes=active.length?active.map(s=>({nama:s.jenisKelas,atlet:enrolled(s)})):[{nama:'Regular Class (fleksibel)',atlet:[]}];
   note(id,{...first,mulai:start,selesai:end},status,text,classes);
  }
 }
 for(const row of result)row.rincian.sort((a,b)=>a.tanggal.localeCompare(b.tanggal)||a.mulai.localeCompare(b.mulai)||a.status.localeCompare(b.status));
 return {month,start:month+'-01',end:B.monthEnd(month+'-01'),asOf:today,rows:result.sort((a,b)=>a.nama.localeCompare(b.nama,'id')),unassignedSessions:unassigned.size};
}
function mount(app,{pool,owner,wrap,transaction,rows}){
 async function read(req){
  const month=req.query.month===undefined?B.today().slice(0,7):req.query.month;
  if(typeof month!=='string'||!/^\d{4}-\d{2}$/.test(month)||!B.validDate(month+'-01'))throw fail(400,'Pilih bulan yang valid');
  const data=await transaction(async db=>{
   const staff=(await db.query('SELECT id,nama,username,role,active,profile FROM brtm_users ORDER BY id')).rows;
   return calculate({staff,schedules:await rows(db,'jadwal'),attendance:await rows(db,'absensi'),athletes:await rows(db,'atlet'),month});
  });return data;
 }
 app.get('/api/owner/staff-hours',owner,wrap(async(req,res)=>res.json(await read(req))));
 app.get('/api/owner/staff-hours/:id/pdf',owner,wrap(async(req,res)=>{
  const data=await read(req),staff=data.rows.find(r=>r.id===req.params.id);if(!staff)throw fail(404,'Staf tidak ditemukan');
  require('./reports').staffHours(res,data,staff);
 }));
}
module.exports={mount,calculate,union};
