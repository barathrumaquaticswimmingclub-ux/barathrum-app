'use strict';
const B=require('./business');
const N=require('./notifications');
const webpush=require('web-push');
const crypto=require('crypto');
const fail=(status,message)=>Object.assign(Error(message),{status});
// Public membership numbers are independent of internal record IDs.
const memberId=(number,registeredAt)=>{
 const stamp=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(registeredAt)).replaceAll('/','');
 return 'BRTM'+String(number).padStart(5,'0')+stamp;
};
async function migrateMembers(db){
 const c=await db.connect();
 try{await c.query('BEGIN');
  await c.query('LOCK TABLE brtm_members IN EXCLUSIVE MODE');
  await c.query('CREATE SEQUENCE IF NOT EXISTS brtm_member_number_seq');
  await c.query('ALTER TABLE brtm_members ADD COLUMN IF NOT EXISTS member_number BIGINT');
  await c.query('ALTER TABLE brtm_members ADD COLUMN IF NOT EXISTS legacy_member_id TEXT');
  await c.query(`WITH numbered AS (SELECT athlete_id,ROW_NUMBER() OVER(ORDER BY registered_at,athlete_id)+(SELECT COALESCE(MAX(member_number),0) FROM brtm_members) AS n FROM brtm_members WHERE member_number IS NULL) UPDATE brtm_members m SET member_number=n.n FROM numbered n WHERE m.athlete_id=n.athlete_id`);
  await c.query(`SELECT setval('brtm_member_number_seq',GREATEST((SELECT last_value+CASE WHEN is_called THEN 1 ELSE 0 END FROM brtm_member_number_seq),(SELECT COALESCE(MAX(member_number),0)+1 FROM brtm_members)),FALSE)`);
  await c.query(`ALTER TABLE brtm_members ALTER COLUMN member_number SET DEFAULT nextval('brtm_member_number_seq')`);
  await c.query('CREATE UNIQUE INDEX IF NOT EXISTS brtm_members_number_unique ON brtm_members(member_number)');
  const old=(await c.query(`SELECT * FROM brtm_members WHERE member_id LIKE 'BRTM-%'`)).rows;
  for(const m of old)await c.query('UPDATE brtm_members SET legacy_member_id=COALESCE(legacy_member_id,member_id),member_id=$1 WHERE athlete_id=$2',[memberId(m.member_number,m.registered_at),m.athlete_id]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
const clean=(v,label,max=2000)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw fail(400,label+' wajib diisi dengan benar');return v.trim();};
const token=v=>{if(typeof v!=='string'||!/^[-\w]{10,80}$/.test(v))throw fail(400,'Kode pengiriman tidak valid');return v;};
async function initDb(db){
 // Registry deliberately survives athlete deletion: a number is never reused.
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_members (athlete_id INTEGER PRIMARY KEY, member_id TEXT UNIQUE NOT NULL, registered_at TIMESTAMPTZ NOT NULL, nama TEXT NOT NULL, status TEXT NOT NULL)`);
 await db.query(`INSERT INTO brtm_members SELECT id,'BRTM-'||CASE WHEN LENGTH(id::text)<6 THEN LPAD(id::text,6,'0') ELSE id::text END,COALESCE(dibuat_pada,NOW()),COALESCE(data->>'nama',''),COALESCE(data->>'status','Aktif') FROM data_klub WHERE jenis='atlet' AND NOT EXISTS (SELECT 1 FROM brtm_members m WHERE m.athlete_id=data_klub.id) ON CONFLICT DO NOTHING`);
 await migrateMembers(db);
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_announcements (id SERIAL PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, class_name TEXT NOT NULL, training_date TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, recipient_count INTEGER NOT NULL, created_by INTEGER NOT NULL REFERENCES brtm_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await db.query(`ALTER TABLE brtm_announcements ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'umum'`);
 await db.query(`ALTER TABLE brtm_announcements ADD COLUMN IF NOT EXISTS dates JSONB NOT NULL DEFAULT '[]'::jsonb`);
 await db.query(`ALTER TABLE brtm_announcements ADD COLUMN IF NOT EXISTS request_hash TEXT`);
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_announcement_photos (announcement_id INTEGER PRIMARY KEY REFERENCES brtm_announcements(id) ON DELETE CASCADE, mime TEXT NOT NULL, base64 TEXT NOT NULL)`);
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_feedback (id SERIAL PRIMARY KEY, request_id TEXT NOT NULL, parent_id INTEGER NOT NULL REFERENCES brtm_parents(id), athlete_id INTEGER NOT NULL REFERENCES data_klub(id), coach_id INTEGER NOT NULL REFERENCES brtm_users(id), body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Baru' CHECK(status IN ('Baru','Ditanggapi','Selesai')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(parent_id,request_id))`);
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_feedback_replies (id SERIAL PRIMARY KEY, feedback_id INTEGER NOT NULL REFERENCES brtm_feedback(id), user_id INTEGER NOT NULL REFERENCES brtm_users(id), body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_staff_notifications (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES brtm_users(id), feedback_id INTEGER NOT NULL REFERENCES brtm_feedback(id), read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id,feedback_id))`);
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_staff_push_subscriptions (endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES brtm_users(id), subscription JSONB NOT NULL)`);
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_staff_push_jobs (id SERIAL PRIMARY KEY, notification_id INTEGER NOT NULL REFERENCES brtm_staff_notifications(id), endpoint TEXT NOT NULL REFERENCES brtm_staff_push_subscriptions(endpoint) ON DELETE CASCADE, attempts INTEGER NOT NULL DEFAULT 0, sent_at TIMESTAMPTZ, next_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(notification_id,endpoint))`);
}
async function afterSave(db,kind,a){
 if(kind!=='atlet')return;
 const existing=(await db.query('UPDATE brtm_members SET nama=$1,status=$2 WHERE athlete_id=$3 RETURNING member_id',[a.nama,a.status||'Aktif',a.id])).rows[0];
 if(existing){a.memberId=existing.member_id;return;}
 const number=(await db.query("SELECT nextval('brtm_member_number_seq') AS n")).rows[0].n;
 const registeredAt=(await db.query('SELECT dibuat_pada FROM data_klub WHERE id=$1',[a.id])).rows[0].dibuat_pada;
 a.memberId=memberId(number,registeredAt);
 await db.query(`INSERT INTO brtm_members(athlete_id,member_id,member_number,registered_at,nama,status) VALUES($1,$2,$3,$4,$5,$6)`,[a.id,a.memberId,number,registeredAt,a.nama,a.status||'Aktif']);
}
function subscription(s){
 let url;try{url=new URL(s?.endpoint);}catch{throw fail(400,'Alamat notifikasi tidak valid');}
 if(url.protocol!=='https:'||url.port||url.username||url.password||!(url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.push.apple.com')||url.hostname==='web.push.apple.com'||url.hostname.endsWith('.notify.windows.com')))throw fail(400,'Layanan notifikasi tidak didukung');
 if(!/^[A-Za-z0-9_-]{80,100}$/.test(s?.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{20,30}$/.test(s?.keys?.auth||''))throw fail(400,'Kunci notifikasi tidak valid');
 return {endpoint:url.href,keys:s.keys};
}
async function deliver(pool,sender=webpush.sendNotification){
 const key=(await pool.query('SELECT * FROM brtm_push_keys WHERE id=1')).rows[0];
 const jobs=(await pool.query(`SELECT j.*,s.subscription FROM brtm_staff_push_jobs j JOIN brtm_staff_push_subscriptions s ON s.endpoint=j.endpoint JOIN brtm_staff_notifications n ON n.id=j.notification_id AND n.user_id=s.user_id JOIN brtm_users u ON u.id=n.user_id WHERE u.active=TRUE AND j.sent_at IS NULL AND j.attempts<5 AND j.next_attempt<=NOW() ORDER BY j.id LIMIT 50`)).rows;
 for(const j of jobs){
  const claim=await pool.query(`UPDATE brtm_staff_push_jobs SET attempts=attempts+1,next_attempt=NOW()+INTERVAL '5 minutes' WHERE id=$1 AND next_attempt<=NOW() RETURNING id`,[j.id]);if(!claim.rows.length)continue;
  try{await sender(j.subscription,JSON.stringify({title:'BRTM',body:'Ada masukan baru dari orang tua. Buka BRTM untuk meninjau.',tag:'brtm-feedback-'+j.id,url:'/club/'}),{TTL:3600,timeout:15000,vapidDetails:{subject:'https://barathrum-app-production.up.railway.app',publicKey:key.public_key,privateKey:key.private_key}});await pool.query('UPDATE brtm_staff_push_jobs SET sent_at=NOW() WHERE id=$1',[j.id]);}
  catch(e){if([404,410].includes(e.statusCode))await pool.query('DELETE FROM brtm_staff_push_subscriptions WHERE endpoint=$1',[j.endpoint]);}
 }
}
async function listFeedback(db,where,args){
 const list=(await db.query(`SELECT f.*,u.nama AS coach_name,a.data->>'nama' AS athlete_name FROM brtm_feedback f JOIN brtm_users u ON u.id=f.coach_id JOIN data_klub a ON a.id=f.athlete_id WHERE ${where} ORDER BY f.id DESC LIMIT 100`,args)).rows;
 for(const f of list)f.replies=(await db.query(`SELECT r.id,r.body,r.created_at,u.nama AS staff_name FROM brtm_feedback_replies r JOIN brtm_users u ON u.id=r.user_id WHERE r.feedback_id=$1 ORDER BY r.id`,[f.id])).rows;
 return list;
}
function mountParent(app,{pool,wrap,parentAuth,transaction,rows,audit,limit}){
 const onlyParent=(req,res,next)=>req.parent?next():next(fail(403,'Khusus orang tua'));
 app.get('/swim/api/announcements/:id/photo',parentAuth,onlyParent,wrap(async(req,res)=>{
  if(!/^[1-9]\d{0,14}$/.test(req.params.id))throw fail(404,'Foto tidak ditemukan');
  const p=(await pool.query(`SELECT p.mime,p.base64 FROM brtm_announcement_photos p JOIN brtm_notifications n ON n.event_key='pengumuman:'||p.announcement_id::text WHERE p.announcement_id=$1 AND n.athlete_id=$2 LIMIT 1`,[req.params.id,req.parent.athlete_id])).rows[0];
  if(!p)throw fail(404,'Foto tidak ditemukan');res.type(p.mime).send(Buffer.from(p.base64,'base64'));
 }));
 app.get('/swim/api/feedback/coaches',parentAuth,onlyParent,wrap(async(req,res)=>{
  // All named coaches are available because BRTM rotates coaches; no contact data exposed.
  res.json((await pool.query("SELECT id,nama FROM brtm_users WHERE active=TRUE AND role IN ('coach','prestasi') ORDER BY nama")).rows);
 }));
 app.get('/swim/api/feedback',parentAuth,onlyParent,wrap(async(req,res)=>res.json(await listFeedback(pool,'f.athlete_id=$1',[req.parent.athlete_id]))));
 app.post('/swim/api/feedback',parentAuth,onlyParent,wrap(async(req,res)=>{
  limit(req,'feedback:'+req.parent.id,20);
  const requestId=token(req.body.requestId),body=clean(req.body.body,'Kritik / saran');
  if(!/^[1-9]\d{0,14}$/.test(String(req.body.coachId||'')))throw fail(400,'Pilih pelatih');
  const result=await transaction(async c=>{
   await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const old=(await c.query('SELECT * FROM brtm_feedback WHERE parent_id=$1 AND request_id=$2',[req.parent.id,requestId])).rows[0];
   if(old){if(old.body!==body||String(old.coach_id)!==String(req.body.coachId))throw fail(409,'Kode pengiriman telah digunakan');return old;}
   const coach=(await c.query("SELECT id FROM brtm_users WHERE id=$1 AND active=TRUE AND role IN ('coach','prestasi')",[req.body.coachId])).rows[0];if(!coach)throw fail(400,'Pilih pelatih aktif');
   const f=(await c.query('INSERT INTO brtm_feedback(request_id,parent_id,athlete_id,coach_id,body) VALUES($1,$2,$3,$4,$5) RETURNING *',[requestId,req.parent.id,req.parent.athlete_id,coach.id,body])).rows[0];
   const users=(await c.query("SELECT id FROM brtm_users WHERE active=TRUE AND (role='owner' OR id=$1)",[coach.id])).rows;
   for(const u of users){const n=(await c.query('INSERT INTO brtm_staff_notifications(user_id,feedback_id) VALUES($1,$2) RETURNING id',[u.id,f.id])).rows[0];await c.query('INSERT INTO brtm_staff_push_jobs(notification_id,endpoint) SELECT $1,endpoint FROM brtm_staff_push_subscriptions WHERE user_id=$2 ON CONFLICT DO NOTHING',[n.id,u.id]);}
   await audit(c,{username:'orangtua:'+req.parent.id},'kirim-masukan','feedback',String(f.id),null,{coachId:String(coach.id),atletId:String(req.parent.athlete_id)});
   return f;
  });res.status(201).json({id:result.id,pesan:'Masukan diterima pelatih yang dipilih dan Owner.'});
 }));
}
function mount(app,{pool,wrap,owner,transaction,rows,audit,limit}){
 app.post('/api/community/announcements',owner,wrap(async(req,res)=>{
  const requestId=token(req.body.requestId),className=req.body.className==='Semua kelas'?'Semua kelas':B.canonical(req.body.className),kind=req.body.kind||'umum',title=clean(req.body.title,'Judul',150),body=clean(req.body.body,'Pesan');
  if(!['umum','libur','speed-test','doa-restu','hasil-lomba','selamat'].includes(kind))throw fail(400,'Jenis pengumuman tidak valid');
  if(className!=='Semua kelas'&&!Object.hasOwn(B.CLASSES,className))throw fail(400,'Pilih kelas tujuan');
  if(kind==='speed-test'&&className!=='Prestasi Class')throw fail(400,'Speed test khusus Prestasi Class');
  const rawDates=req.body.dates===undefined?[req.body.trainingDate]:req.body.dates;
  if(!Array.isArray(rawDates)||!rawDates.length||rawDates.length>12||rawDates.some(d=>!B.validDate(d)))throw fail(400,'Pilih 1–12 tanggal yang valid');
  const dates=[...new Set(rawDates)].sort(),trainingDate=dates[0];
  if(['speed-test','libur'].includes(kind)&&dates.some(d=>d<B.today()))throw fail(400,'Pilih tanggal hari ini atau mendatang');
  const hash=crypto.createHash('sha256').update(JSON.stringify({className,kind,dates,title,body,photo:req.body.photo||null})).digest('hex');
  const photo=req.body.photo?await require('./images').compress(req.body.photo):null;
  const day=d=>new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(d+'T12:00:00+07:00'));
  const out=await transaction(async c=>{
   await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
   const old=(await c.query('SELECT * FROM brtm_announcements WHERE request_id=$1',[requestId])).rows[0];
   if(old){if(old.request_hash?old.request_hash!==hash:old.class_name!==className||old.training_date!==trainingDate||old.title!==title||old.body!==body)throw fail(409,'Kode pengiriman telah digunakan');return {...old,duplicate:true};}
   const athletes=(await rows(c,'atlet')).filter(a=>a.status==='Aktif'&&(className==='Semua kelas'||B.canonical(a.kelompok)===className));
   if(!athletes.length)throw fail(400,'Belum ada atlet aktif di kelas ini');
   const a=(await c.query('INSERT INTO brtm_announcements(request_id,class_name,training_date,title,body,recipient_count,created_by,kind,dates,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[requestId,className,trainingDate,title,body,athletes.length,req.user.id,kind,JSON.stringify(dates),hash])).rows[0];
   if(photo)await c.query('INSERT INTO brtm_announcement_photos(announcement_id,mime,base64) VALUES($1,$2,$3)',[a.id,photo.mime,photo.base64]);
   for(const child of athletes)await N.enqueue(c,child.id,'pengumuman:'+a.id,title,`${className}\n${dates.map(day).join(' • ')}\n${body}`);
   await audit(c,req.user,'kirim-pengumuman','pengumuman',String(a.id),null,a);return a;
  });res.status(201).json(out);
 }));
 app.get('/api/community/announcements',owner,wrap(async(req,res)=>res.json((await pool.query('SELECT a.*,EXISTS(SELECT 1 FROM brtm_announcement_photos p WHERE p.announcement_id=a.id) AS has_photo FROM brtm_announcements a ORDER BY a.id DESC LIMIT 50')).rows)));
 app.get('/api/community/announcements/:id/photo',owner,wrap(async(req,res)=>{
  if(!/^[1-9]\d{0,14}$/.test(req.params.id))throw fail(404,'Foto tidak ditemukan');
  const p=(await pool.query('SELECT mime,base64 FROM brtm_announcement_photos WHERE announcement_id=$1',[req.params.id])).rows[0];
  if(!p)throw fail(404,'Foto tidak ditemukan');res.type(p.mime).send(Buffer.from(p.base64,'base64'));
 }));
 app.get('/api/community/members',owner,wrap(async(req,res)=>{
  const year=Number(req.query.year||B.today().slice(0,4));if(!Number.isInteger(year)||year<2000||year>2100)throw fail(400,'Tahun tidak valid');
  const members=(await pool.query('SELECT * FROM brtm_members ORDER BY athlete_id')).rows;
  const records=await rows(pool,'atlet');const current=new Map(records.map(a=>[a.id,a]));
  const yearOf=v=>new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(v));
  const present=new Set((await rows(pool,'absensi')).filter(r=>r.status==='Hadir'&&r.tanggal?.startsWith(year+'-')).map(r=>String(r.atletId)));
  res.json({year,total:members.length,active:records.filter(a=>a.status==='Aktif').length,newInYear:members.filter(m=>Number(yearOf(m.registered_at))===year).length,throughYear:members.filter(m=>Number(yearOf(m.registered_at))<=year).length,trainedInYear:present.size,members:members.map(m=>({...m,status:current.has(String(m.athlete_id))?current.get(String(m.athlete_id)).status:'Diarsipkan'}))});
 }));
 app.get('/api/community/feedback',wrap(async(req,res)=>res.json(await listFeedback(pool,req.user.role==='owner'?'TRUE':'f.coach_id=$1',req.user.role==='owner'?[]:[req.user.id]))));
 app.post('/api/community/feedback/:id/reply',wrap(async(req,res)=>{
  limit(req,'feedback-reply:'+req.user.id,40);
  if(!/^[1-9]\d{0,14}$/.test(req.params.id))throw fail(400,'ID tidak valid');
  const body=clean(req.body.body,'Tanggapan'),status=req.body.status||'Ditanggapi';if(!['Ditanggapi','Selesai'].includes(status))throw fail(400,'Status tidak valid');
  await transaction(async c=>{
   const f=(await c.query('SELECT * FROM brtm_feedback WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!f||req.user.role!=='owner'&&String(f.coach_id)!==String(req.user.id))throw fail(404,'Masukan tidak ditemukan');
   const r=(await c.query('INSERT INTO brtm_feedback_replies(feedback_id,user_id,body) VALUES($1,$2,$3) RETURNING id',[f.id,req.user.id,body])).rows[0];
   await c.query('UPDATE brtm_feedback SET status=$1 WHERE id=$2',[status,f.id]);
   await N.enqueue(c,f.athlete_id,'tanggapan:'+r.id,'Tanggapan untuk masukan Anda','Masukan Anda telah ditanggapi oleh '+req.user.nama+'. Buka Kritik & saran untuk membaca tanggapan.');
   await audit(c,req.user,'tanggapi-masukan','feedback',String(f.id),null,{status,replyId:r.id});
  });res.json({ok:true});
 }));
 app.get('/api/community/notifications',wrap(async(req,res)=>res.json((await pool.query('SELECT * FROM brtm_staff_notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[req.user.id])).rows)));
 app.post('/api/community/notifications/:id/read',wrap(async(req,res)=>{if(!/^[1-9]\d{0,14}$/.test(req.params.id))throw fail(400,'ID tidak valid');await pool.query('UPDATE brtm_staff_notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);res.json({ok:true});}));
 app.get('/api/community/push/key',wrap(async(req,res)=>res.json({publicKey:(await pool.query('SELECT public_key FROM brtm_push_keys WHERE id=1')).rows[0].public_key})));
 app.post('/api/community/push/subscribe',wrap(async(req,res)=>{const s=subscription(req.body.subscription);await pool.query('INSERT INTO brtm_staff_push_subscriptions(endpoint,user_id,subscription) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,subscription=EXCLUDED.subscription',[s.endpoint,req.user.id,JSON.stringify(s)]);res.json({ok:true});}));
 app.post('/api/community/push/unsubscribe',wrap(async(req,res)=>{await pool.query('DELETE FROM brtm_staff_push_subscriptions WHERE endpoint=$1 AND user_id=$2',[req.body.endpoint,req.user.id]);res.json({ok:true});}));
}
module.exports={initDb,afterSave,memberId,mount,mountParent,deliver};
