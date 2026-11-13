'use strict';
const B=require('./business'),N=require('./notifications');
const fail=(s,m)=>Object.assign(Error(m),{status:s});
const places=['Hotel Grand Wahid','Kolam Renang Pondok Selfie','Prestasi'];
async function initDb(db){
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_weekly_slots(id SERIAL PRIMARY KEY, coach_id INTEGER NOT NULL REFERENCES brtm_users(id), place TEXT NOT NULL, weekday INTEGER NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, class_name TEXT NOT NULL DEFAULT '', athlete_ids JSONB NOT NULL DEFAULT '[]', UNIQUE(coach_id,place,weekday,start_time))`);
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_billing_notices(id SERIAL PRIMARY KEY,athlete_id INTEGER NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE,event_key TEXT UNIQUE NOT NULL,data JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await db.query(`ALTER TABLE brtm_users ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'`);
 await db.query(`ALTER TABLE brtm_audit ADD COLUMN IF NOT EXISTS login_context JSONB`);
 await db.query(`ALTER TABLE brtm_notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ`);
 await db.query(`UPDATE brtm_users u SET profile=u.profile||jsonb_build_object('noWa',COALESCE(p.data->>'noHp',''),'jabatan',COALESCE(NULLIF(p.data->>'spesialisasi',''),'Pelatih')) FROM data_klub p WHERE p.jenis='pelatih' AND regexp_replace(lower(u.nama),'^coach +','')=regexp_replace(lower(p.data->>'nama'),'^coach +','') AND NOT (u.profile ? 'noWa')`);
}
function loginContext(req){return {ip:req.ip,device:String(req.get('user-agent')||'Tidak tersedia').slice(0,500),place:req.get('x-vercel-ip-city')||req.get('cf-ipcity')||'Lokasi tidak tersedia (IP tercatat)'};}
async function noticeBill(db,a,key,p){
 const data={...p,atletId:a.id,namaAtlet:a.nama,jenisKelas:a.kelompok,tanggal:B.today(),jatuhTempo:Object.hasOwn(p,'jatuhTempo')?p.jatuhTempo:B.today(),provisional:true};
 const r=(await db.query('INSERT INTO brtm_billing_notices(athlete_id,event_key,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[a.id,key,JSON.stringify(data)])).rows[0];
 if(r)await N.enqueue(db,a.id,'invoice:'+r.id,'Invoice pembayaran BRTM',`Invoice ${a.kelompok} untuk Adik ${a.nama}: Rp${Number(data.totalTagihan).toLocaleString('id-ID')}. ${data.jatuhTempo?'Batas pembayaran '+data.jatuhTempo+'.':'Tanggal batas bayar mengikuti tanggal pembayaran pertama.'} Rincian dan PDF tersedia di kotak masuk.${a.kelompok==='Prestasi Class'?' SPP final mengikuti kehadiran; bulan tanpa kehadiran tidak ditagih.':''}`);
}
async function billing(db,packs){
 const athletes=(await db.query("SELECT id,data FROM data_klub WHERE jenis='atlet' AND data->>'status'='Aktif'")).rows.map(r=>({...r.data,id:String(r.id)})),first=await require('./spp').firstPayments(db);
 for(const a of athletes){const related=packs.filter(p=>String(p.atletId)===a.id).sort((x,y)=>String(y.tanggal).localeCompare(String(x.tanggal))||Number(y.id)-Number(x.id));
  if(a.kelompok==='Prestasi Class'){
   if(B.today()===B.monthEnd(B.today())){const month=B.addMonth(B.today().slice(0,7)+'-01').slice(0,7),existing=related.find(p=>p.periode===month);if(!existing||existing.status!=='Lunas')await noticeBill(db,a,'prestasi-akhir-bulan:'+a.id+':'+month,{jumlah:existing?.jumlah??250000,biayaPendaftaran:0,potonganDiskon:existing?.potonganDiskon||0,totalTagihan:(existing?.jumlah??250000)-(existing?.potonganDiskon||0),periode:month,jatuhTempo:first[a.id]?B.prestasiDue(month,first[a.id]):null});}
  }else if(related[0]?.sisaPertemuan===0){const p=related[0];await noticeBill(db,a,'paket-habis:'+p.id,{jumlah:p.jumlah,biayaPendaftaran:0,potonganDiskon:p.potonganDiskon,totalTagihan:p.jumlah-p.potonganDiskon,totalPertemuan:p.totalPertemuan});}
 }
}
async function materialize(db,{rows,save},user={id:null,username:'sistem-jadwal'},days=35){
 const athletes=await rows(db,'atlet'),users=(await db.query('SELECT * FROM brtm_users WHERE active=TRUE')).rows;
 const adhi=users.find(u=>/adhi/i.test(u.nama)&&u.role==='coach')||users.find(u=>u.role==='prestasi');
 if(adhi&&!(await db.query("SELECT id FROM brtm_weekly_slots WHERE place='Prestasi' LIMIT 1")).rows.length){for(let day=1;day<=6;day++){for(const [start,end] of (day===1||day===3?[['05:00','06:30'],['15:00','17:00']]:[['15:00','17:00']]))await db.query("INSERT INTO brtm_weekly_slots(coach_id,place,weekday,start_time,end_time,class_name) VALUES($1,'Prestasi',$2,$3,$4,'Prestasi Class') ON CONFLICT DO NOTHING",[adhi.id,day,start,end]);}}
 const slots=(await db.query('SELECT * FROM brtm_weekly_slots ORDER BY id')).rows;
 const schedules=await rows(db,'jadwal'),attendance=await rows(db,'absensi');
 for(let offset=0;offset<days;offset++){
  const tanggal=B.addDays(B.today(),offset),day=new Date(tanggal+'T12:00:00Z').getUTCDay();
  const entries=slots.filter(s=>s.weekday===day&&users.some(u=>u.id===s.coach_id)).map(s=>({...s,ids:s.place==='Prestasi'?athletes.filter(a=>a.status==='Aktif'&&a.kelompok==='Prestasi Class').map(a=>a.id):s.athlete_ids.map(String).filter(id=>athletes.some(a=>a.id===id&&a.status==='Aktif'&&a.kelompok===s.class_name)),key:'weekly:'+s.id,place:s.place==='Prestasi'?(s.start_time<'12:00'?'Kolam Renang Kalitaman':places[1]):s.place}));

  for(const e of entries){
   const old=schedules.find(s=>s.weeklyKey===e.key&&s.tanggal===tanggal);
   if(old&&(old.statusSesi==='Libur'||attendance.some(a=>a.jadwalId===old.id)))continue;
   if(!e.ids.length){if(old)await db.query("DELETE FROM data_klub WHERE jenis='jadwal' AND id=$1",[old.id]);continue;}
   const coach=users.find(u=>u.id===e.coach_id),d={nama:e.class_name,tanggal,mulai:e.start_time,selesai:e.end_time,jam:e.start_time+'–'+e.end_time,lokasi:e.place,jenisKelas:e.class_name,coachId:String(e.coach_id),pelatih:e.class_name==='Prestasi Class'?'Coach Adhi':coach.nama,atletIds:e.ids,statusSesi:'Terjadwal',weeklyKey:e.key,hari:new Intl.DateTimeFormat('id-ID',{weekday:'long',timeZone:'Asia/Jakarta'}).format(new Date(tanggal+'T12:00:00Z'))};
   const clash=schedules.find(s=>s.id!==old?.id&&s.tanggal===tanggal&&s.statusSesi!=='Libur'&&s.mulai<d.selesai&&s.selesai>d.mulai&&(s.coachId===d.coachId||s.atletIds?.some(id=>d.atletIds.includes(String(id)))));
   if(clash)continue;
   if(!old||['coachId','atletIds','mulai','selesai','jenisKelas','lokasi','pelatih'].some(k=>JSON.stringify(old[k])!==JSON.stringify(d[k]))){const saved=await save(db,user,'jadwal',{...old,...d},old);if(old)Object.assign(old,saved);else schedules.push(saved);}
  }
 }
}
function mount(app,h){require('./owner-finance').mount(app,h);require('./coach').mount(app,h);const {pool,wrap,owner,transaction,rows,record,save,audit,passwordHash,payments}=h;
 const tx=fn=>transaction(async c=>{await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');return fn(c);});
 app.post('/api/session-entry',wrap(async(req,res)=>{
  const result=await tx(async c=>{
   const b=req.body,old=b.id?await record(c,'absensi',b.id,true):null;
   const data=await h.validate(req,c,'absensi',b,old),saved=await save(c,req.user,'absensi',data,old);
   const note=(await rows(c,'perkembangan')).find(n=>n.jadwalId===saved.jadwalId&&n.atletId===saved.atletId&&(req.user.role==='owner'||String(n.dibuatOlehId||n.coachId)===String(req.user.id)));
   if(String(b.noted||'').trim()||note){const input={jadwalId:saved.jadwalId,atletId:saved.atletId,tanggal:saved.tanggal,catatan:b.noted||'',teknik:note?.teknik||'',fisik:note?.fisik||'',attitude:note?.attitude||''};await save(c,req.user,'perkembangan',await h.validate(req,c,'perkembangan',input,note),note);}
   await require('./coach').enforce(c,h,req,saved);
   return saved;
  });res.json({data:result});
 }));
 app.get('/api/owner/workspace',owner,wrap(async(req,res)=>{res.json({slots:(await pool.query('SELECT * FROM brtm_weekly_slots ORDER BY place,coach_id,weekday,start_time')).rows,staff:(await pool.query('SELECT id,nama,username,role,active,profile FROM brtm_users ORDER BY id')).rows.map(u=>({...u,profile:{...u.profile,photo:!!u.profile.photo}}))});}));
 app.post('/api/owner/schedule/coach',owner,wrap(async(req,res)=>{
  const coachId=String(req.body.coachId),place=req.body.place;if(!places.slice(0,2).includes(place))throw fail(400,'Pilih tempat latihan');
  await tx(async c=>{if(!(await c.query("SELECT id FROM brtm_users WHERE id=$1 AND role IN ('coach','prestasi') AND active=TRUE",[coachId])).rowCount)throw fail(400,'Pilih pelatih aktif');
   for(let day=1;day<=6;day++){const hours=place===places[0]?[7,8,9,14,15,16]:day===6?[8,9,15,16]:[15,16];for(const hour of hours)await c.query('INSERT INTO brtm_weekly_slots(coach_id,place,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[coachId,place,day,String(hour).padStart(2,'0')+':00',String(hour+1).padStart(2,'0')+':00']);}
   await audit(c,req.user,'tambah-jadwal-mingguan','jadwal',coachId,null,{place});});res.json({ok:true});
 }));
 app.put('/api/owner/schedule/:id',owner,wrap(async(req,res)=>{
  await tx(async c=>{const old=(await c.query('SELECT * FROM brtm_weekly_slots WHERE id=$1',[req.params.id])).rows[0];if(!old)throw fail(404,'Jadwal tidak ditemukan');
   const d=req.body,ids=old.place==='Prestasi'?(await rows(c,'atlet')).filter(a=>a.status==='Aktif'&&a.kelompok==='Prestasi Class').map(a=>a.id):[...new Set((d.athleteIds||[]).map(String))];if(old.place!=='Prestasi'&&(!Array.isArray(d.athleteIds)||ids.length>200))throw fail(400,'Peserta tidak valid');
   if(ids.length&&!B.CLASSES[d.className])throw fail(400,'Pilih kelas');
   const capacity={'Private Class':1,'Private Couple Class':2,'Semi Private Class':3,'Group Class':6,'Hydro Terapi Class':6};if(ids.length>(capacity[d.className]||200))throw fail(400,'Jumlah peserta melebihi kapasitas kelas');
   for(const aid of ids){const a=await record(c,'atlet',aid);if(a.status!=='Aktif'||a.kelompok!==d.className)throw fail(400,'Pilih atlet aktif sesuai kelas');}
   const start=d.start||old.start_time,end=d.end||old.end_time;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end)throw fail(400,'Jam latihan tidak valid');
   const clashes=(await c.query('SELECT * FROM brtm_weekly_slots WHERE weekday=$1 AND id<>$2',[old.weekday,old.id])).rows;
   const activePrestasi=(await rows(c,'atlet')).filter(a=>a.status==='Aktif'&&a.kelompok==='Prestasi Class').map(a=>a.id);
   if(ids.length&&clashes.some(s=>{const otherIds=s.place==='Prestasi'?activePrestasi:s.athlete_ids.map(String);return otherIds.length&&s.start_time<end&&s.end_time>start&&(s.coach_id===Number(d.coachId||old.coach_id)||otherIds.some(a=>ids.includes(a)));}))throw fail(409,'Jadwal pelatih atau atlet bentrok');

   if(d.coachId&&!(await c.query("SELECT id FROM brtm_users WHERE id=$1 AND active=TRUE AND role IN ('coach','prestasi')",[d.coachId])).rowCount)throw fail(400,'Pilih pelatih aktif');
   await c.query('UPDATE brtm_weekly_slots SET class_name=$1,athlete_ids=$2,start_time=$3,end_time=$4,coach_id=$6 WHERE id=$5',[d.className||'',JSON.stringify(ids),start,end,old.id,d.coachId||old.coach_id]);await audit(c,req.user,'ubah-jadwal-mingguan','jadwal',String(old.id),old,d);await materialize(c,h,req.user);
  });res.json({pesan:'Jadwal mingguan dan sesi mendatang diperbarui'});
 }));
 app.post('/api/owner/schedule/sync',owner,wrap(async(req,res)=>{await tx(c=>materialize(c,h,req.user));res.json({ok:true});}));
 app.post('/api/owner/staff',owner,wrap(async(req,res)=>{
  const d=req.body;if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(d.username||'')||!String(d.nama||'').trim()||!['coach','prestasi'].includes(d.role))throw fail(400,'Nama, ID, atau jabatan akses tidak valid');const hash=await passwordHash(d.password);
  await tx(async c=>{const u=(await c.query('INSERT INTO brtm_users(nama,username,role,password_hash,must_change,profile) VALUES($1,$2,$3,$4,FALSE,$5) RETURNING id',[d.nama.trim().slice(0,100),d.username,d.role,hash,JSON.stringify({jabatan:String(d.jabatan||'Pelatih').slice(0,100),noWa:String(d.noWa||'').slice(0,30)})])).rows[0];await audit(c,req.user,'tambah-staf','akun',String(u.id));});res.json({ok:true});
 }));
 app.put('/api/owner/staff/:id/profile',owner,wrap(async(req,res)=>{
  const d=req.body;const profile={jabatan:String(d.jabatan||'Pelatih').slice(0,100),noWa:String(d.noWa||'').slice(0,30)};if(d.photo)profile.photo=await require('./images').staff(d.photo);
  await tx(async c=>{const u=(await c.query('SELECT * FROM brtm_users WHERE id=$1',[req.params.id])).rows[0];if(!u)throw fail(404,'Staf tidak ditemukan');const next={...u.profile,...profile};await c.query('UPDATE brtm_users SET profile=$1 WHERE id=$2',[JSON.stringify(next),u.id]);await audit(c,req.user,'ubah-profil-staf','akun',String(u.id),u.profile,next);});res.json({ok:true});
 }));
 app.get('/api/owner/staff/:id/photo',owner,wrap(async(req,res)=>{const p=(await pool.query('SELECT profile FROM brtm_users WHERE id=$1',[req.params.id])).rows[0]?.profile?.photo;if(!p)throw fail(404,'Foto tidak tersedia');res.type(p.mime).send(Buffer.from(p.base64,'base64'));}));
 app.delete('/api/owner/staff/:id',owner,wrap(async(req,res)=>{
  await tx(async c=>{const u=(await c.query('SELECT * FROM brtm_users WHERE id=$1',[req.params.id])).rows[0];if(!u||u.role==='owner')throw fail(400,'Akun Owner tidak dapat dihapus');
   // Archive the identity referenced by immutable activity and attendance records.
   await c.query("UPDATE brtm_users SET active=FALSE,profile=profile||'{\"archived\":true}'::jsonb WHERE id=$1",[u.id]);await c.query('DELETE FROM brtm_sessions WHERE user_id=$1',[u.id]);await c.query('DELETE FROM brtm_weekly_slots WHERE coach_id=$1',[u.id]);await audit(c,req.user,'hapus-staf','akun',String(u.id));});res.json({ok:true});
 }));
 app.put('/api/owner/athlete/:id/status',owner,wrap(async(req,res)=>{
  if(!['Aktif','Nonaktif'].includes(req.body.status))throw fail(400,'Pilih status atlet');
  await tx(async c=>{const a=await record(c,'atlet',req.params.id,true);await save(c,req.user,'atlet',{...a,status:req.body.status},a);await materialize(c,h,req.user);});res.json({ok:true});
 }));
 app.put('/api/owner/time/:id/status',owner,wrap(async(req,res)=>{if(typeof req.body.active!=='boolean')throw fail(400,'Status tidak valid');await tx(async c=>{const a=await record(c,'atlet',req.params.id,true);if(a.kelompok!=='Prestasi Class')throw fail(400,'Khusus atlet Prestasi');await save(c,req.user,'atlet',{...a,waktuAktif:req.body.active},a);});res.json({ok:true});}));
 app.put('/api/owner/package/:id/status',owner,wrap(async(req,res)=>{if(!['Aktif','Kedaluwarsa','Otomatis'].includes(req.body.status))throw fail(400,'Status tidak valid');await tx(async c=>{const p=await record(c,'pembayaran',req.params.id,true);if(p.jenisKelas==='Prestasi Class')throw fail(400,'Status Prestasi mengikuti bulan berjalan');const current=(await payments(c)).find(x=>x.id===p.id);if(req.body.status==='Aktif'&&current.sisaPertemuan===0)throw fail(400,'Kuota sudah habis. Atur kuota atau pilih paket berikutnya.');const next={...p,statusManual:req.body.status==='Otomatis'?null:req.body.status};if(req.body.status==='Aktif'&&current.berlakuSampai<B.today())next.pengecualian={alasan:'Masa berlaku diaktifkan kembali oleh Owner',berlakuSampai:B.addMonth(B.today()),oleh:req.user.username,pada:new Date().toISOString()};await save(c,req.user,'pembayaran',next,p);});res.json({ok:true});}));
 app.put('/api/community/announcements/:id',owner,wrap(async(req,res)=>{const {title,body}=req.body;if(!String(title||'').trim()||String(title).length>150||!String(body||'').trim()||String(body).length>2000)throw fail(400,'Judul dan pesan wajib diisi');await tx(async c=>{const old=(await c.query('SELECT * FROM brtm_announcements WHERE id=$1',[req.params.id])).rows[0];if(!old)throw fail(404,'Pengumuman tidak ditemukan');await c.query('UPDATE brtm_announcements SET title=$1,body=$2 WHERE id=$3',[title.trim(),body.trim(),old.id]);await c.query("UPDATE brtm_notifications SET title=$1,body=$2 WHERE event_key=$3",[title.trim(),old.class_name+'\n'+(old.dates||[old.training_date]).join(', ')+'\n'+body.trim(),'pengumuman:'+old.id]);await audit(c,req.user,'ubah-pengumuman','pengumuman',String(old.id),old,{title,body});});res.json({ok:true});}));
 app.delete('/api/community/announcements/:id',owner,wrap(async(req,res)=>{await tx(async c=>{const old=(await c.query('SELECT * FROM brtm_announcements WHERE id=$1',[req.params.id])).rows[0];if(!old)throw fail(404,'Pengumuman tidak ditemukan');await c.query('DELETE FROM brtm_notifications WHERE event_key=$1',['pengumuman:'+old.id]);await c.query('DELETE FROM brtm_announcements WHERE id=$1',[old.id]);await audit(c,req.user,'hapus-pengumuman','pengumuman',String(old.id),old);});res.json({ok:true});}));
 app.get('/api/owner/reports/pdf',owner,wrap(async(req,res)=>require('./reports').club(res,await rows(pool,'atlet'),await payments(),req.query.month||'')));
 app.get('/api/owner/program/pdf',owner,wrap(async(req,res)=>require('./reports').program(res,(await rows(pool,'program')).filter(p=>p.jenis==='Program'),req.query.month||B.today().slice(0,7))));
 app.get('/api/owner/documents/:kind/:id',owner,wrap(async(req,res)=>{const p=await record(pool,'pembayaran',req.params.id);if(!['invoice','receipt'].includes(req.params.kind)||req.params.kind==='receipt'&&B.cashReceived(p)<=0)throw fail(400,'Dokumen pembayaran belum tersedia');require('./reports').bill(res,p,req.params.kind,p.id);}));
}
module.exports={initDb,mount,materialize,billing,loginContext};
