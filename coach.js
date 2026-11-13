'use strict';
const B=require('./business');
const fail=(status,message)=>Object.assign(Error(message),{status});
const content=n=>['catatan','teknik','fisik','attitude'].some(k=>String(n[k]||'').trim());
function localDay(v){if(!v||v==='legacy')return '';const d=new Date(v);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):'';}
function monthShift(anchor,n){const [y,m,d]=anchor.split('-').map(Number),first=new Date(Date.UTC(y,m-1+n,1));return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate()))).toISOString().slice(0,10);}
function period(date,anchor,prestasi){
 if(prestasi)return {start:date.slice(0,7)+'-01',end:B.monthEnd(date)};
 let n=(Number(date.slice(0,4))-Number(anchor.slice(0,4)))*12+Number(date.slice(5,7))-Number(anchor.slice(5,7));if(monthShift(anchor,n)>date)n--;
 return {start:monthShift(anchor,n),end:B.addDays(monthShift(anchor,n+1),-1)};
}
function policy({athlete,date,attendance=[],notes=[],packs=[],schedules=[],registeredAt='',current=null}){
 const aid=String(athlete.id),prestasi=B.canonical(athlete.kelompok)==='Prestasi Class',has=a=>String(a.atletId)===aid;
 const present=attendance.filter(r=>has(r)&&r.status==='Hadir'),ownNotes=notes.filter(n=>has(n)&&content(n));
 const anchors=[athlete.tanggalMasuk,localDay(athlete.dibuatPada),localDay(registeredAt),...packs.filter(has).map(p=>p.tanggal),...present.map(r=>r.tanggal)].filter(B.validDate).sort();
 const anchor=anchors[0]||date,range=period(date,anchor,prestasi),completed=ownNotes.some(n=>n.tanggal>=range.start&&n.tanggal<=date);
 const scheduled=schedules.filter(s=>s.statusSesi!=='Libur'&&s.atletIds?.map(String).includes(aid)&&s.tanggal>=range.start&&s.tanggal<=range.end).map(s=>s.tanggal).sort();
 const last=scheduled.at(-1),lastSession=last===date&&date>=B.addDays(range.end,-6);
 const pack=current?.paketId&&packs.find(p=>p.id===current.paketId),used=pack?Number(pack.pemakaianAwal||0)+present.filter(r=>r.paketId===pack.id).length:0;
 const finalMeeting=!prestasi&&pack&&Number(pack.totalPertemuan)>0&&used>=Number(pack.totalPertemuan);
 const prior=new Map();for(const r of present){const p=period(r.tanggal,anchor,prestasi);if(p.end<date)prior.set(p.start,p);}
 const missing=[...prior.values()].filter(p=>!ownNotes.some(n=>n.tanggal>=p.start&&n.tanggal<=date));
 const overdue=missing.length>0,required=!completed&&(date>=range.end||lastSession||finalMeeting||overdue);
 return {...range,anchor,completed,required,overdue,missingPeriods:missing,meeting:pack?used:null,quota:pack?.totalPertemuan||null,reason:completed?'Noted periode ini sudah tersedia':overdue?'Noted periode sebelumnya belum tersedia':finalMeeting?'Pertemuan terakhir paket':lastSession?'Sesi terakhir menjelang akhir periode':'Minimal satu noted pada periode ini',deadline:range.end};
}
async function context(db,h){return {attendance:await h.rows(db,'absensi'),notes:await h.rows(db,'perkembangan'),packs:await h.payments(db),schedules:await h.rows(db,'jadwal'),members:(await db.query('SELECT athlete_id,registered_at FROM brtm_members')).rows};}
async function status(db,h,athlete,date,current=null,ctx=null){const c=ctx||await context(db,h);return policy({...c,athlete,date,current,registeredAt:c.members.find(m=>String(m.athlete_id)===String(athlete.id))?.registered_at});}
async function enforce(db,h,req,entry){if(req.user.role!=='coach'||entry.status!=='Hadir')return;const a=await h.record(db,'atlet',entry.atletId),p=await status(db,h,a,entry.tanggal,entry);if(p.required)throw fail(400,'Noted untuk orang tua wajib diisi: '+p.reason+'. Batas periode '+p.end+'.');}
function mount(app,h){const {pool,wrap,rows,record,transaction,audit}=h;
 app.get('/api/coach/profile',wrap(async(req,res)=>{const u=(await pool.query('SELECT id,nama,role,profile FROM brtm_users WHERE id=$1',[req.user.id])).rows[0];res.json({id:String(u.id),nama:u.nama,jabatan:u.profile.jabatan||(u.role==='coach'?'Pelatih':u.role==='prestasi'?'Tim Prestasi':'Owner'),noWa:u.profile.noWa||'',foto:u.profile.photo?'/api/coach/profile/photo':null});}));
 app.get('/api/coach/profile/photo',wrap(async(req,res)=>{const p=(await pool.query('SELECT profile FROM brtm_users WHERE id=$1',[req.user.id])).rows[0]?.profile.photo;if(!p)throw fail(404,'Foto profil belum tersedia');res.type(p.mime).send(Buffer.from(p.base64,'base64'));}));
 app.get('/api/coach/noted',wrap(async(req,res)=>{
  if(!['owner','coach'].includes(req.user.role))throw fail(403,'Khusus Coach dan Owner');
  const c=await context(pool,h),assigned=new Set(c.schedules.filter(s=>String(s.coachId)===String(req.user.id)).flatMap(s=>s.atletIds||[]).map(String)),athletes=(await rows(pool,'atlet')).filter(a=>a.status==='Aktif'&&(req.user.role==='owner'||assigned.has(a.id)));
  const result=[];for(const a of athletes){const entries=c.attendance.filter(r=>String(r.atletId)===a.id&&r.tanggal<=B.today()&&r.status==='Hadir').sort((a,b)=>b.tanggal.localeCompare(a.tanggal)||Number(b.id)-Number(a.id));result.push({atletId:a.id,...await status(pool,h,a,B.today(),entries[0],c)});}res.json(result);
 }));
 app.get('/api/coach/noted/:id',wrap(async(req,res)=>{
  if(req.user.role!=='coach')throw fail(403,'Khusus Coach');
  const a=await record(pool,'atlet',req.params.id),s=await record(pool,'jadwal',req.query.scheduleId);
  if(String(s.coachId)!==String(req.user.id)||!s.atletIds?.map(String).includes(a.id))throw fail(403,'Sesi belum ditugaskan kepada Anda');
  const c=await context(pool,h),old=c.attendance.find(r=>r.atletId===a.id&&r.jadwalId===s.id),eligible=c.packs.filter(p=>String(p.atletId)===a.id&&['Lunas','Belum Lunas'].includes(p.status)&&(p.statusManual!=='Kedaluwarsa'||old?.paketId===p.id)&&p.tanggal<=s.tanggal&&p.berlakuSampai>=s.tanggal&&(p.sisaPertemuan>0||old?.status==='Hadir'&&old.paketId===p.id)).sort((a,b)=>a.berlakuSampai.localeCompare(b.berlakuSampai));
  const current={atletId:a.id,jadwalId:s.id,tanggal:s.tanggal,status:'Hadir',paketId:eligible[0]?.id||null};c.attendance=c.attendance.filter(r=>r!==old);c.attendance.push(current);
  res.json(await status(pool,h,a,s.tanggal,current,c));
 }));
 app.delete('/api/coach/noted/:id',wrap(async(req,res)=>{
  if(req.user.role!=='coach')throw fail(403,'Khusus Coach');
  await transaction(async db=>{await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');const n=await record(db,'perkembangan',req.params.id,true),author=n.dibuatOlehId||n.coachId;if(author?String(author)!==String(req.user.id):n.dibuatOleh!==req.user.username)throw fail(403,'Hanya catatan Anda sendiri yang dapat dihapus');const assigned=(await rows(db,'jadwal')).some(s=>String(s.coachId)===String(req.user.id)&&s.atletIds?.map(String).includes(String(n.atletId)));if(!assigned)throw fail(403,'Atlet belum ditugaskan kepada Anda');await db.query("DELETE FROM data_klub WHERE jenis='perkembangan' AND id=$1",[n.id]);await audit(db,req.user,'hapus-noted-coach','perkembangan',n.id,n,null);});res.json({pesan:'Noted dihapus. Kewajiban noted dihitung ulang.'});
 }));
}
module.exports={policy,period,monthShift,status,enforce,mount,content};
