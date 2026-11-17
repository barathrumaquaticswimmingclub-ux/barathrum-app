'use strict';
const B=require('./business');
const fail=(s,m)=>Object.assign(Error(m),{status:s});
const isRegular=a=>/^Regular Class \([12]x Seminggu\)$/.test(B.canonical(a?.kelompok||a?.jenisKelas));
const assigned=(s,id)=>String(s.coachId)===String(id)||(s.regularFlex===true&&s.coachIds?.map(String).includes(String(id)));
async function options(db,h,aid,date){
 if(!B.validDate(date))throw fail(400,'Tanggal tidak valid');
 const a=await h.record(db,'atlet',aid);if(!isRegular(a)||a.status!=='Aktif')throw fail(400,'Khusus atlet Regular aktif');
 const coaches=(await db.query("SELECT id,nama FROM brtm_users WHERE active=TRUE AND role='coach'")).rows.filter(u=>/\b(fauzan|ilyas)\b/i.test(u.nama));
 if(coaches.length!==2)throw fail(409,'Pelatih Regular Pondok Selfie belum tersedia');
 const day=new Date(date+'T12:00:00Z').getUTCDay();
 const hours=day===0?[]:day===6?[8,9,15,16]:[15,16];
 const schedules=await h.rows(db,'jadwal');
 const slots=hours.map(hour=>{const mulai=String(hour).padStart(2,'0')+':00',selesai=String(hour+1).padStart(2,'0')+':00';
 const overlapping=schedules.filter(s=>s.tanggal===date&&s.mulai<selesai&&s.selesai>mulai);
 const busy=overlapping.some(s=>s.statusSesi!=='Libur'&&!isRegular(s)&&s.atletIds?.length&&coaches.some(c=>assigned(s,c.id)));
 const blocked=busy||overlapping.some(s=>s.statusSesi==='Libur'&&(s.lokasi||'').includes('Pondok Selfie')&&(isRegular(s)||coaches.some(c=>assigned(s,c.id))));
 const ids=new Set(overlapping.filter(s=>s.regularFlex&&s.statusSesi!=='Libur').flatMap(s=>s.atletIds||[]).map(String));
 return {mulai,selesai,tersedia:!blocked&&(date<B.today()||date>B.today()||date===B.today()&&B.time()<selesai+':00')&&(ids.has(String(aid))||ids.size<coaches.length*16),terdaftar:overlapping.some(s=>s.regularFlex&&s.atletIds?.map(String).includes(String(aid))),pelatih:coaches.map(c=>c.nama).join(' & ')};});
 return {tanggal:date,slots};
}
async function book(db,h,user,aid,date,start,cancel=false){
 await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
 const a=await h.record(db,'atlet',aid);if(!isRegular(a)||a.status!=='Aktif')throw fail(400,'Khusus atlet Regular aktif');
 if(!B.validDate(date)||date<B.addDays(B.today(),-7)||date>B.addDays(B.today(),35))throw fail(400,'Pilih tanggal dalam rentang 7 hari lalu sampai 35 hari mendatang');
 const schedules=await h.rows(db,'jadwal'),attendance=await h.rows(db,'absensi');
 const allOwn=schedules.filter(s=>s.tanggal===date&&s.atletIds?.map(String).includes(String(aid)));
 if(allOwn.some(s=>!isRegular(s)&&s.statusSesi!=='Libur'))throw fail(409,'Anak sudah memiliki sesi kelas lain pada tanggal ini. Hubungi Owner untuk koreksi.');
 const own=allOwn.filter(isRegular);
 if(own.some(s=>attendance.some(r=>r.jadwalId===s.id&&String(r.atletId)===String(aid))))throw fail(409,'Absensi sudah diisi. Koreksi absensi dahulu sebelum mengubah sesi.');
 const previous=own.find(s=>s.regularFlex&&s.mulai===start);
 if(previous&&previous.statusSesi!=='Libur'&&!cancel)return {pesan:'Sesi sudah diaktifkan',jadwalId:previous.id};
 if(!cancel){
 const opt=await options(db,h,aid,date),slot=opt.slots.find(s=>s.mulai===start);
 if(!slot||!slot.tersedia)throw fail(409,'Sesi sudah selesai, penuh, atau libur. Pilih sesi lain.');
 const packs=(await h.payments(db,true)).filter(p=>String(p.atletId)===String(aid)&&isRegular(p)&&p.status==='Lunas'&&p.statusManual!=='Kedaluwarsa'&&p.tanggal<=date&&p.berlakuSampai>=date&&p.sisaPertemuan>0);
 if(!packs.length)throw fail(409,'Tidak ada paket Regular lunas dengan sisa pertemuan pada tanggal ini.');
 const reserved=new Set(schedules.filter(s=>s.regularFlex&&s.tanggal>=B.today()&&s.atletIds?.map(String).includes(String(aid))&&!own.includes(s)&&!attendance.some(r=>r.jadwalId===s.id&&String(r.atletId)===String(aid)&&r.status==='Hadir')).map(s=>s.tanggal));
 if(reserved.size>=packs.reduce((n,p)=>n+p.sisaPertemuan,0))throw fail(409,'Sisa kuota sudah dialokasikan ke sesi lain. Batalkan sesi tersebut dahulu.');
 }
 for(const s of own){const next={...s,atletIds:s.atletIds.filter(id=>String(id)!==String(aid))};await h.save(db,user,'jadwal',next,s);}
 if(cancel){await h.audit(db,user,'batal-regular','atlet',aid,null,{tanggal:date});return {pesan:'Aktivasi sesi dibatalkan'};}
 const coaches=(await db.query("SELECT id,nama FROM brtm_users WHERE active=TRUE AND role='coach'")).rows.filter(u=>/\b(fauzan|ilyas)\b/i.test(u.nama));
 // One session and one attendance record shared by both coaches.
 let session=schedules.find(s=>s.regularFlex&&s.tanggal===date&&s.mulai===start&&s.jenisKelas===B.canonical(a.kelompok)&&s.statusSesi!=='Libur');
 const ids=[...new Set([...(session?.atletIds||[]).filter(id=>String(id)!==String(aid)),String(aid)])];
 const saved=await h.save(db,user,'jadwal',{...session,nama:'Regular fleksibel',jenisKelas:B.canonical(a.kelompok),tanggal:date,mulai:start,selesai:String(Number(start.slice(0,2))+1).padStart(2,'0')+':00',jam:start+'–'+String(Number(start.slice(0,2))+1).padStart(2,'0')+':00',hari:new Intl.DateTimeFormat('id-ID',{weekday:'long',timeZone:'Asia/Jakarta'}).format(new Date(date+'T12:00:00Z')),lokasi:'Kolam Renang Pondok Selfie',coachId:String(coaches[0].id),coachIds:coaches.map(c=>String(c.id)),pelatih:coaches.map(c=>c.nama).join(' & '),atletIds:ids,statusSesi:'Terjadwal',regularFlex:true},session);
 await h.audit(db,user,'aktifkan-regular','atlet',aid,null,{tanggal:date,mulai:start,jadwalId:saved.id});
 return {pesan:'Sesi aktif di jadwal Coach Fauzan dan Coach Ilyas. Absensi akan diisi pelatih.',jadwalId:saved.id};
}
function mountOwner(app,h){
 app.get('/api/owner/regular/:id/options',h.owner,h.wrap(async(req,res)=>res.json(await options(h.pool,h,req.params.id,req.query.date||B.today()))));
 app.post('/api/owner/regular/:id',h.owner,h.wrap(async(req,res)=>res.json(await h.transaction(db=>book(db,h,req.user,req.params.id,req.body.tanggal,req.body.mulai,req.body.batal===true)))));
}
module.exports={isRegular,assigned,options,book,mountOwner};
