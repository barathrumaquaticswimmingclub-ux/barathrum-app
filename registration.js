'use strict';
const crypto=require('crypto'),B=require('./business');
const rules=require('./public/rules/parent/data.json');
const CONSENT='Saya sudah membaca dan memahami seluruh peraturan BARATHRUM AQUATIC SWIMMING CLUB serta menyetujui ketentuan tersebut.';
const fail=(status,message)=>Object.assign(Error(message),{status});
const days=['','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const fields=['nama','namaPanggilan','tanggalLahir','jk','tempatLahir','alamat','namaOrtu','noHpOrtu','sekolah','kelasSekolah','tujuan','kelompok'];
async function options(db){
 const slots=(await db.query("SELECT s.* FROM brtm_weekly_slots s JOIN brtm_users u ON u.id=s.coach_id WHERE u.active=TRUE AND u.role IN ('coach','prestasi') AND s.place<>'Prestasi' ORDER BY s.weekday,s.start_time,s.place")).rows;
 const athletes=(await db.query("SELECT id,data->>'status' AS status FROM data_klub WHERE jenis='atlet'")).rows;
 const active=new Set(athletes.filter(a=>a.status==='Aktif').map(a=>String(a.id))),classes={};
 for(const [kind,config] of Object.entries(B.CLASSES)){
  if(kind==='Prestasi Class')continue;const regular=kind.startsWith('Regular Class'),seen=new Set();
  classes[kind]={sessions:kind==='Regular Class (2x Seminggu)'?2:1,schedules:[]};
  for(const s of slots){
   if(!days[s.weekday]||regular&&s.place!=='Kolam Renang Pondok Selfie'||s.class_name&&s.class_name!==kind)continue;
   // Regular is restricted to the club's published Pondok Selfie hours, even if a slot is mistyped.
   if(regular&&!((s.start_time==='15:00'&&s.end_time==='16:00')||(s.start_time==='16:00'&&s.end_time==='17:00')||(s.weekday===6&&((s.start_time==='08:00'&&s.end_time==='09:00')||(s.start_time==='09:00'&&s.end_time==='10:00')))))continue;
   const count=new Set((s.athlete_ids||[]).map(String).filter(id=>active.has(id))).size;
   if(count>=config.kapasitas)continue;
   const value=[s.place,s.weekday,s.start_time,s.end_time].join('|');if(seen.has(value))continue;seen.add(value);
   classes[kind].schedules.push({value,place:s.place,day:s.weekday,dayLabel:days[s.weekday],start:s.start_time,end:s.end_time});
  }
 }
 return {version:rules.version,consent:CONSENT,classes};
}
function chosen(input,available){
 const config=available.classes[input.kelompok],selected=input.schedules;
 if(!config||!Array.isArray(selected)||selected.length!==config.sessions)throw fail(400,'Pilih kelas dan jumlah jadwal yang sesuai.');
 const found=selected.map(value=>config.schedules.find(s=>s.value===value));
 if(found.some(s=>!s))throw fail(409,'Pilihan jadwal berubah atau sudah penuh. Muat ulang pilihan jadwal dan konfirmasi dengan admin.');
 if(found.length===2&&found[0].day===found[1].day)throw fail(400,'Regular 2× wajib memilih dua hari yang berbeda.');
 return found;
}
function mount(app,{pool,wrap,transaction,rows,limit,cleanPayload,applyRegistration}){
 app.get('/registration/api/options',wrap(async(req,res)=>res.json(await options(pool))));
 app.post('/registration/api/submit',wrap(async(req,res)=>{
  if(req.get('X-BRTM-Request')!=='1')throw fail(403,'Muat ulang formulir sebelum mengirim.');
  if(req.get('origin')){let origin;try{origin=new URL(req.get('origin'));}catch{throw fail(403,'Asal permintaan tidak valid.');}if(origin.host!==req.get('host'))throw fail(403,'Asal permintaan tidak diizinkan.');}
  limit(req,'registration-submit',300);
  const input=req.body;if(!input||typeof input!=='object'||Array.isArray(input)||input.website)throw fail(400,'Isian tidak valid.');
  if(!/^[-\w]{20,80}$/.test(input.requestId||''))throw fail(400,'Muat ulang formulir sebelum mengirim.');
  const payload={};for(const k of fields){if(typeof input[k]!=='string'||!input[k].trim()||input[k].length>(k==='nama'?150:500))throw fail(400,'Lengkapi '+k+' dengan benar.');payload[k]=input[k].trim();}
  if(!require('./billing-policy').email(input.emailOrtu?.trim()||''))throw fail(400,'Email aktif orang tua wajib diisi untuk invoice dan kuitansi');
  if(input.emailOrtu!=null){if(typeof input.emailOrtu!=='string'||input.emailOrtu.trim()&&!require('./billing-policy').email(input.emailOrtu.trim()))throw fail(400,'Alamat email orang tua tidak valid');payload.emailOrtu=input.emailOrtu.trim();}
  payload.persetujuan=input.consent===true?CONSENT:'';payload.versiKetentuan=input.version;
  if(input.version!==rules.version)throw fail(409,'Peraturan telah diperbarui. Muat ulang dan baca peraturan terbaru.');
  if(!input.consent)throw fail(400,'Persetujuan orang tua/wali wajib diisi.');
  const submissionHash=crypto.createHash('sha256').update(JSON.stringify({payload,schedules:input.schedules,foto:input.foto})).digest('hex');
  const responseId='web-'+input.requestId,old=(await pool.query("SELECT payload FROM brtm_registrations WHERE kind='nonprestasi' AND response_id=$1",[responseId])).rows[0];
  if(old){if(old.payload.submissionHash!==submissionHash)throw fail(409,'Data pengiriman berubah. Muat ulang formulir sebelum mengirim kembali.');return res.status(201).json({ok:true,installUrl:'/swim/install/'});}
  chosen(input,await options(pool));
  // Decode by content (including HEIC, BMP, TIFF and AVIF); only resized WebP reaches storage.
  payload.foto=await require('./images').staff(input.foto);
  const clean=cleanPayload(payload,'nonprestasi');
  await transaction(async c=>{
   await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const replay=(await c.query("SELECT payload FROM brtm_registrations WHERE kind='nonprestasi' AND response_id=$1",[responseId])).rows[0];
   if(replay){if(replay.payload.submissionHash!==submissionHash)throw fail(409,'Data pengiriman berubah.');return;}
   const schedules=chosen(input,await options(c));
   const jadwalPilihan=schedules.map(s=>`${s.dayLabel} ${s.start}–${s.end} · ${s.place}`).join('; ');
   const data={...clean,jadwalPilihan,schedules:schedules.map(s=>s.value),submissionHash,sumber:'Formulir BRTM',jadwalStatus:'Menunggu konfirmasi admin'};
   const r=(await c.query("INSERT INTO brtm_registrations(kind,response_id,payload,status) VALUES('nonprestasi',$1,$2,'Perlu diperiksa') RETURNING *",[responseId,JSON.stringify(data)])).rows[0];
   const athletes=(await rows(c,'atlet')).filter(a=>!a.mergedInto);
   const match=require('./roster-identity').registrationMatch(athletes,data);
   if(match.possible.length)throw fail(409,'Data anak sama persis dengan data yang sudah terdaftar. Pendaftaran duplikat ditolak; hubungi admin untuk aktivasi.');
   await applyRegistration(c,r,'new','Formulir BRTM');
  });
  // No existing-name, account or athlete identifiers are disclosed on the public route.
  res.status(201).json({ok:true,installUrl:'/swim/install/'});
 }));
}
module.exports={mount,options,CONSENT};
