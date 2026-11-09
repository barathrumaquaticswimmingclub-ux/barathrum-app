'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest');
const {initDb,createApp,passwordHash}=require('./server'),B=require('./business'),C=require('./community'),N=require('./notifications');
async function main(){
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};await initDb(pool);
 for(const [name,role] of [['owner','owner'],['coach','coach'],['other','coach'],['juara','prestasi']])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,$2,$3,FALSE)',[name,role,await passwordHash('test-password')]);
 const app=createApp({pool,secureCookies:false}),owner=request.agent(app),coach=request.agent(app),other=request.agent(app),parent=request.agent(app),parent2=request.agent(app);
 async function send(a,m,url,data,status=200){const r=await a[m](url).set('X-BRTM-Request','1').send(data);assert.equal(r.status,status,JSON.stringify(r.body));return r.body;}
 for(const [a,u] of [[owner,'owner'],[coach,'coach'],[other,'other']])await send(a,'post','/auth/login',{username:u,password:'test-password'});
 const create=async(n,k='Prestasi Class',status='Aktif')=>(await send(owner,'post','/api/atlet',{nama:n,kelompok:k,status},201)).data;
 const a=await create('Atlet Satu'),b=await create('Atlet Dua'),c=await create('Pemula','Private Class');await create('Cuti','Prestasi Class','Nonaktif');
 await send(owner,'post','/api/orangtua/siapkan',{});await send(parent,'post','/swim/api/login',{username:'Atlet Satu',password:'brtm'});await send(parent2,'post','/swim/api/login',{username:'Atlet Dua',password:'brtm'});
 let dash=await send(parent,'get','/swim/api/dashboard');const mid=dash.profil.memberId;assert.equal(mid,C.memberId(a.id));assert.match(mid,/^BRTM-\d{6}$/);
 await send(owner,'put','/api/atlet/'+a.id,{...a,memberId:'FAKE',nama:'Atlet Satu Baru'});assert.equal((await send(parent,'get','/swim/api/dashboard')).profil.memberId,mid);
 await send(owner,'put','/api/atlet/'+a.id,{...a,status:'Nonaktif'});await send(owner,'put','/api/atlet/'+a.id,{...a,status:'Aktif'});assert.equal((await send(parent,'get','/swim/api/dashboard')).profil.memberId,mid);
 let report=await send(owner,'get','/api/community/members');assert.equal(report.total,4);assert.equal(report.active,3);assert.equal(report.newInYear,4);assert.equal(report.trainedInYear,0);
 await send(coach,'get','/api/community/members',undefined,403);await send(owner,'get','/api/community/members?year=bad',undefined,400);
 await C.initDb(pool);assert.equal((await send(owner,'get','/api/community/members')).total,4);
 const ann={requestId:'announcement-test-001',className:'Prestasi Class',trainingDate:B.today(),title:'Latihan Prestasi libur',body:'Latihan hari ini libur karena kolam ditutup.'};
 await send(coach,'post','/api/community/announcements',ann,403);const out=await send(owner,'post','/api/community/announcements',ann,201);assert.equal(out.recipient_count,2);
 assert.equal((await send(owner,'post','/api/community/announcements',ann,201)).duplicate,true);
 await send(owner,'post','/api/community/announcements',{...ann,body:'berbeda'},409);
 for(const p of [parent,parent2]){const list=await send(p,'get','/swim/api/notifications');assert.equal(list.length,1);assert.equal(list[0].title,ann.title);}
 assert.equal((await pool.query('SELECT * FROM brtm_notifications WHERE athlete_id=$1',[c.id])).rows.length,0);
 await send(parent,'post','/swim/api/push/subscribe',{subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/parent',keys:{auth:'a'.repeat(22),p256dh:'a'.repeat(87)}}});
 const nextAnn={...ann,requestId:'announcement-test-002'};await send(owner,'post','/api/community/announcements',nextAnn,201);let sent=0;
 await N.deliver(pool,async(s,payload)=>{sent++;assert.match(JSON.parse(payload).body,/Latihan Prestasi libur/);});assert.equal(sent,1);
 const coaches=await send(parent,'get','/swim/api/feedback/coaches');assert.equal(coaches.length,3);assert(!JSON.stringify(coaches).includes('password'));
 const feedback={requestId:'parent-feedback-test-001',coachId:'2',body:'Mohon lebih jelas ketika memberi instruksi.',athleteId:b.id};
 await send(parent,'post','/swim/api/feedback',{...feedback,coachId:'1'},400);
 const f=await send(parent,'post','/swim/api/feedback',feedback,201);assert.equal((await send(parent,'post','/swim/api/feedback',feedback,201)).id,f.id);
 await send(parent,'post','/swim/api/feedback',{...feedback,body:'berubah'},409);
 assert.equal((await send(parent2,'get','/swim/api/feedback')).length,0);
 const ownFeedback=await send(parent,'get','/swim/api/feedback');assert.equal(ownFeedback[0].athlete_id,Number(a.id));
 assert.equal((await send(coach,'get','/api/community/feedback')).length,1);assert.equal((await send(other,'get','/api/community/feedback')).length,0);assert.equal((await send(owner,'get','/api/community/feedback')).length,1);
 const ns=await send(coach,'get','/api/community/notifications');assert.equal(ns.length,1);assert.equal((await send(owner,'get','/api/community/notifications')).length,1);assert.equal((await send(other,'get','/api/community/notifications')).length,0);
 await send(other,'post','/api/community/notifications/'+ns[0].id+'/read',{});assert.equal((await send(coach,'get','/api/community/notifications'))[0].read_at,null);
 await send(coach,'post','/api/community/notifications/'+ns[0].id+'/read',{});assert((await send(coach,'get','/api/community/notifications'))[0].read_at);
 await send(other,'post','/api/community/feedback/'+f.id+'/reply',{body:'Tidak boleh'},404);
 await send(coach,'post','/api/community/feedback/'+f.id+'/reply',{body:'Terima kasih, akan kami perbaiki.',status:'Ditanggapi'});
 assert.equal((await send(parent,'get','/swim/api/feedback'))[0].replies[0].body,'Terima kasih, akan kami perbaiki.');
 await send(owner,'post','/api/community/feedback/'+f.id+'/reply',{body:'Owner sudah meninjau tindak lanjut.',status:'Selesai'});
 assert.equal((await send(parent,'get','/swim/api/feedback'))[0].status,'Selesai');
 await send(coach,'post','/api/community/push/subscribe',{subscription:{endpoint:'https://localhost/private',keys:{auth:'a'.repeat(22),p256dh:'a'.repeat(87)}}},400);
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/staff',keys:{auth:'a'.repeat(22),p256dh:'a'.repeat(87)}};
 await send(coach,'post','/api/community/push/subscribe',{subscription:sub});await send(parent,'post','/swim/api/feedback',{...feedback,requestId:'parent-feedback-test-002'},201);
 let staffSent=0;await C.deliver(pool,async(s,payload)=>{staffSent++;assert(!payload.includes(feedback.body));assert.equal(JSON.parse(payload).url,'/club/');});await C.deliver(pool,async()=>staffSent++);assert.equal(staffSent,1);
 // Account switching on a shared device must not deliver the old user's pending jobs.
 await send(parent,'post','/swim/api/feedback',{...feedback,requestId:'parent-feedback-test-003'},201);await send(other,'post','/api/community/push/subscribe',{subscription:sub});await C.deliver(pool,async()=>staffSent++);assert.equal(staffSent,1);
 await send(owner,'delete','/api/atlet/'+a.id,{},400);
 await send(owner,'post','/api/tester/reset',{},409);
 const legacy=(await pool.query("INSERT INTO data_klub(jenis,data,dibuat_pada) VALUES('atlet',$1,'2025-06-01') RETURNING id",[JSON.stringify({nama:'Atlet Lama',status:'Nonaktif',kelompok:'Private Class'})])).rows[0];
 await C.initDb(pool);const history=await send(owner,'get','/api/community/members?year=2025');assert.equal(history.throughYear,1);assert.equal(history.newInYear,1);assert.equal(history.members.find(m=>m.athlete_id===legacy.id).member_id,C.memberId(legacy.id));
 await pool.query("INSERT INTO data_klub(jenis,data) VALUES('absensi',$1),('absensi',$1)",[JSON.stringify({atletId:a.id,status:'Hadir',tanggal:'2025-05-01'})]);assert.equal((await send(owner,'get','/api/community/members?year=2025')).trainedInYear,1);
 const backup=await send(owner,'get','/api/backup');for(const t of ['brtm_members','brtm_feedback','brtm_feedback_replies','brtm_announcements'])assert(backup.tables[t].length);
 await db.close();console.log('PASS community: permanent member IDs, registration counts, year validation, targeted announcements and push, deduplication, feedback privacy, correct child binding, owner/coach routing, replies, read isolation, device account switching and backups.');
}
main().catch(e=>{console.error(e);process.exit(1);});
