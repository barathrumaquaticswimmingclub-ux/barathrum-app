'use strict';
const B=require('./business');
const {parentEvaluation}=require('./evaluation');
const fail=(status,message)=>Object.assign(Error(message),{status});
async function initDb(db){
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_parent_views (athlete_id INTEGER NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE, kind TEXT NOT NULL, record_id TEXT NOT NULL, revision TEXT NOT NULL, opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(athlete_id,kind,record_id,revision))`);
}
function revision(r){return r.diperbaruiPada||r.dibuatPada||'legacy';}
function parentMessage(kind,r,a,s){
 if(kind==='perkembangan'){const p=parentEvaluation(r,a,s);return ['teknik','fisik','attitude','catatan'].map(k=>p[k]).filter(Boolean).join('\n');}
 if(kind==='absensi')return `${r.tanggal}: ${r.status}`;
 return `${r.jenisKelas} · ${r.status} · Rp${Number(r.totalTagihan||0).toLocaleString('id-ID')} · Mulai ${r.tanggal}`;
}
function mount(app,{pool,wrap,owner,transaction,rows,record,validate,save,payments}){
 const team=(req,res,next)=>['owner','prestasi'].includes(req.user.role)?next():next(fail(403,'Khusus tim Prestasi'));
 app.post('/api/prestasi/attendance',team,wrap(async(req,res)=>{
  const today=B.today(),{entries,batchId}=req.body;
  if(new Date(today+'T12:00:00+07:00').getUTCDay()===0)throw fail(400,'Hari Minggu tidak ada absensi rutin');
  if(!Array.isArray(entries)||!entries.length||entries.length>300||!/^[-\w]{10,80}$/.test(batchId||''))throw fail(400,'Isi absensi atlet aktif');
  const result=await transaction(async c=>{
   await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   if((await rows(c,'absensi')).some(r=>r.batchId===batchId&&r.dibuatOlehId===String(req.user.id)))return {duplicate:true};
   const athletes=(await rows(c,'atlet')).filter(a=>B.canonical(a.kelompok)==='Prestasi Class'&&a.status==='Aktif');
   const ids=new Set(entries.map(x=>String(x.atletId)));
   if(ids.size!==entries.length||ids.size!==athletes.length||athletes.some(a=>!ids.has(a.id)))throw fail(409,'Daftar atlet aktif berubah. Muat ulang dan isi kembali.');
   const schedules=(await rows(c,'jadwal')).filter(s=>s.tanggal===today&&B.canonical(s.jenisKelas)==='Prestasi Class');
   if(schedules.some(s=>s.statusSesi==='Libur'))throw fail(400,'Hari ini diliburkan Owner');
   let schedule=schedules.find(s=>s.sesiRutin===true);
   if(!schedule)schedule=await save(c,req.user,'jadwal',{nama:'Latihan Prestasi',tanggal:today,jenisKelas:'Prestasi Class',mulai:'',selesai:'',jam:'Harian',lokasi:'Kolam Renang Pondok Selfie',coachId:String(req.user.id),pelatih:req.user.nama,atletIds:athletes.map(a=>a.id),statusSesi:'Terjadwal',sesiRutin:true},null);
   else if(athletes.some(a=>!schedule.atletIds.includes(a.id)))schedule=await save(c,req.user,'jadwal',{...schedule,atletIds:[...new Set([...schedule.atletIds,...athletes.map(a=>a.id)])]},schedule);
   const existing=await rows(c,'absensi');
   for(const e of entries){
    if(!['Hadir','Izin','Alpa'].includes(e.status)||e.status!=='Hadir'&&!String(e.catatan||'').trim())throw fail(400,'Pilih kehadiran dan isi keterangan izin/tidak hadir');
    if(existing.some(r=>r.atletId===String(e.atletId)&&r.tanggal===today))throw fail(409,'Absensi hari ini sudah tercatat. Gunakan Edit untuk koreksi.');
    const d=await validate(req,c,'absensi',{...e,tanggal:today,jadwalId:schedule.id},null);
    await save(c,req.user,'absensi',{...d,batchId},null);
   }
   return {count:entries.length};
  });res.json({pesan:'Absensi hari ini tersimpan',...result});
 }));
 app.get('/api/owner/activity/:kind',owner,wrap(async(req,res)=>{
  const kind=req.params.kind;if(!['perkembangan','absensi','pembayaran'].includes(kind))throw fail(404,'Bagian tidak ditemukan');
  const all=kind==='pembayaran'?await payments():await rows(pool,kind),athletes=await rows(pool,'atlet'),schedules=await rows(pool,'jadwal');
  const views=(await pool.query('SELECT * FROM brtm_parent_views WHERE kind=$1',[kind])).rows;
  res.json(all.sort((a,b)=>String(b.diperbaruiPada||b.dibuatPada||b.tanggal).localeCompare(String(a.diperbaruiPada||a.dibuatPada||a.tanggal))||Number(b.id)-Number(a.id)).map(r=>{
   const a=athletes.find(a=>a.id===String(r.atletId))||{nama:r.namaAtlet};
   const opened=views.find(v=>String(v.athlete_id)===String(r.atletId)&&v.record_id===r.id&&v.revision===revision(r));
   return {...r,parentMessage:parentMessage(kind,r,a,schedules.find(s=>s.id===r.jadwalId)),parentOpenedAt:opened?.opened_at||null};
  }));
 }));
}
module.exports={initDb,mount,revision};
