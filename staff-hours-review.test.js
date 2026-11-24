'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite'),supertest=require('supertest');
const B=require('./business'),H=require('./staff-hours'),V=require('./staff-hours-review'),{initDb,createApp,passwordHash}=require('./server');
(async()=>{
 B.today=()=> '2026-11-24';B.time=()=> '20:00:00';
 const staff=[{id:'1',nama:'Owner',username:'owner',role:'owner'},{id:'2',nama:'Ilyas',username:'ilyas',role:'coach',profile:{}},{id:'3',nama:'Fauzan',username:'fauzan',role:'coach',profile:{}}];
 const schedules=[],attendance=[],athletes=[{id:'a',nama:'Anak latihan',status:'Aktif'}];
 for(const monday of ['2026-11-09','2026-11-16'])for(let day=0;day<6;day++)for(const hour of day===5?[15]:[15,16]){
  const id=String(schedules.length+1),tanggal=B.addDays(monday,day);schedules.push({id,tanggal,mulai:hour+':00',selesai:(hour+1)+':00',coachId:'2',pelatih:'Ilyas',jenisKelas:'Regular Class (1x Seminggu)',atletIds:['a'],lokasi:'Kolam Renang Pondok Selfie'});
  if(day===0&&hour===15)attendance.push({id:'r'+id,jadwalId:id,tanggal,status:'Hadir',atletId:'a',namaAtlet:'Anak latihan',dibuatOlehId:'1'});
 }
 assert.equal(schedules.length,22);
 const source={staff,schedules,attendance,athletes,month:'2026-11'},report=()=>V.augment(H.calculate(source),source,H.union);
 let result=report(),r=result.rows.find(r=>r.id==='2');assert.equal(r.jamTerjadwalTerdeteksi,22);assert.equal(r.jamSore,2);assert.equal(r.jamPerluVerifikasi,20);assert.equal(r.statusRekap,'Belum lengkap');assert.equal(r.rincian.length,22);
 source.workRecords=[{id:'v1',staffId:'2',tanggal:'2026-11-10',mulai:'15:00',selesai:'16:00',status:'Hadir menunggu murid',alasan:'Hadir menunggu sesuai catatan Owner',kelas:'Regular',revision:'r1',atletIds:[]}];
 result=report();r=result.rows.find(r=>r.id==='2');assert.equal(r.jamSore,3);assert.equal(r.jamPerluVerifikasi,19);assert(r.rincian.some(d=>d.ownerVerified&&d.jam===1&&d.status==='Hadir menunggu murid'));
 source.workRecords[0].status='Tidak hadir';r=report().rows.find(r=>r.id==='2');assert.equal(r.jamSore,2);assert.equal(r.jamPerluVerifikasi,19);
 // Historical recurrence is dated by audit evidence and ceases to be a fixed Regular roster after flexible booking starts.
 const slots=[{id:1,coach_id:2,weekday:1,place:'Kolam Renang Pondok Selfie',start_time:'15:00',end_time:'16:00',class_name:'Regular Class (1x Seminggu)',athlete_ids:['a']}],edits=[{record_id:'1',created_at:'2026-11-08T01:00:00Z'}];
 let historical=V.historical([],slots,edits,'2026-11','2026-11-30');assert.deepEqual(historical.map(s=>s.tanggal),['2026-11-09','2026-11-16','2026-11-23','2026-11-30']);
 historical=V.historical([{tanggal:'2026-11-17',regularFlex:true,lokasi:'Kolam Renang Pondok Selfie'}],slots,edits,'2026-11','2026-11-30');assert.deepEqual(historical.map(s=>s.tanggal),['2026-11-09','2026-11-16']);
 const shifted=[{record_id:'1',created_at:'2026-11-08T01:00:00Z'},{record_id:'1',created_at:'2026-11-17T01:00:00Z',before_data:{...slots[0],coach_id:3}}];
 assert.equal(V.historical([],slots,shifted,'2026-11','2026-11-16')[0].coachId,'3','Historical coach must come from the next edit snapshot, never current assignment');
 const untimedSource={staff,schedules:[{id:'u',coachId:'2',tanggal:'2026-11-10',jenisKelas:'Regular Class (1x Seminggu)',mulai:'',selesai:''}],attendance:[{jadwalId:'u',status:'Hadir',dibuatOlehId:'1'}],athletes,month:'2026-11'};
 let untimed=V.augment(H.calculate(untimedSource),untimedSource,H.union);assert.equal(untimed.rows.find(r=>r.id==='2').tanpaJam.length,1);
 untimedSource.workRecords=[{id:'v',staffId:'2',sourceId:'u',tanggal:'2026-11-10',mulai:'15:00',selesai:'16:00',status:'Hadir melatih',alasan:'Jam historis sesuai catatan Owner',kelas:'Regular',atletIds:[]}];
 untimed=V.augment(H.calculate(untimedSource),untimedSource,H.union);assert.equal(untimed.rows.find(r=>r.id==='2').tanpaJam.length,0);assert.equal(untimed.rows.find(r=>r.id==='2').jamSore,1);
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 for(const u of staff)await pool.query('INSERT INTO brtm_users(id,nama,username,role,password_hash,must_change) VALUES($1,$2,$3,$4,$5,FALSE)',[u.id,u.nama,u.username,u.role,await passwordHash('review-test-pass')]);
 for(const s of schedules){const inserted=(await pool.query("INSERT INTO data_klub(jenis,data) VALUES('jadwal',$1) RETURNING id",[JSON.stringify(s)])).rows[0];for(const a of attendance.filter(a=>a.jadwalId===s.id))await pool.query("INSERT INTO data_klub(jenis,data) VALUES('absensi',$1)",[JSON.stringify({...a,jadwalId:String(inserted.id)})]);}
 const before=(await pool.query("SELECT id,jenis,data FROM data_klub ORDER BY id")).rows;
 const app=createApp({pool,secureCookies:false}),owner=supertest.agent(app),coach=supertest.agent(app);
 const call=async(a,m,url,body,status=200)=>{const r=await a[m](url).set('X-BRTM-Request','1').send(body||{});assert.equal(r.status,status,url+' '+JSON.stringify(r.body));return r.body;};
 for(const [a,username] of [[owner,'owner'],[coach,'ilyas']])await call(a,'post','/auth/login',{username,password:'review-test-pass'});
 const endpoint='/api/owner/staff-hours/verify',input={confirmed:true,staffId:'2',requestId:'review-first-12345',tanggal:'2026-11-10',mulai:'15:00',selesai:'16:00',status:'Hadir menunggu murid',alasan:'Catatan kehadiran staf oleh Owner',kelas:'Regular Class (fleksibel)',atletIds:[]};
 await call(supertest(app),'post',endpoint,input,401);await call(coach,'post',endpoint,input,403);
 for(const bad of [{confirmed:false},{staffId:'oops'},{tanggal:'2026-11-25'},{selesai:'14:00'},{status:'Lunas'},{alasan:'x'},{staffId:'999'}])await call(owner,'post',endpoint,{...input,...bad},400);
 let saved=(await call(owner,'post',endpoint,input)).data;assert.equal((await call(owner,'post',endpoint,input)).data.id,saved.id);
 await call(owner,'post',endpoint,{...input,status:'Tidak hadir'},409);
 let live=await call(owner,'get','/api/owner/staff-hours?month=2026-11');assert.equal(live.rows.find(r=>r.id==='2').jamSore,3);assert.equal(live.rows.find(r=>r.id==='2').jamPerluVerifikasi,19);
 await call(owner,'post',endpoint,{...input,requestId:'review-overlap-12345',mulai:'15:30',selesai:'16:30'},409);
 saved=(await call(owner,'post',endpoint,{...input,requestId:'review-correct-12345',expectedRevision:saved.revision,status:'Tidak hadir',alasan:'Koreksi catatan kehadiran oleh Owner'})).data;
 await call(owner,'post',endpoint,{...input,requestId:'review-stale-12345',expectedRevision:'old'},409);
 live=await call(owner,'get','/api/owner/staff-hours?month=2026-11');assert.equal(live.rows.find(r=>r.id==='2').jamSore,2);
 await call(owner,'post',endpoint,{...input,requestId:'review-missing-date-12345',tanggal:'2026-11-03',status:'Hadir melatih',alasan:'Jam lama belum tersimpan di aplikasi'});
 live=await call(owner,'get','/api/owner/staff-hours?month=2026-11');assert.equal(live.rows.find(r=>r.id==='2').jamSore,3);assert.equal(live.rows.find(r=>r.id==='2').dataPertama,'2026-11-03');
 const after=(await pool.query("SELECT id,jenis,data FROM data_klub WHERE jenis<>'jamstaf' ORDER BY id")).rows;assert.deepEqual(after,before,'Staff review must not alter child attendance, quota, schedules, or parent data');
 assert.equal((await pool.query("SELECT * FROM brtm_audit WHERE jenis='jamstaf'")).rows.length,3);
 const backup=await call(owner,'get','/api/backup');assert(backup.tables.data_klub.some(r=>r.jenis==='jamstaf'),'Staff verifications must be included in the normal backup');
 const pdf=await owner.get('/api/owner/staff-hours/2/pdf?month=2026-11');assert.equal(pdf.status,200);assert.match(pdf.headers['content-type'],/application\/pdf/);if(process.env.BRTM_PDF_TEST_OUTPUT)fs.writeFileSync(process.env.BRTM_PDF_TEST_OUTPUT,pdf.body);
 await db.close();console.log('PASS payroll reconciliation: 22 planned vs 2 confirmed/20 pending, waiting hours, historical recurrence/cutover, Owner-only dated verification, no child mutations, correction/retry/stale-revision/overlap checks, missing historical hours, audit and PDF.');
})().catch(e=>{console.error(e);process.exit(1);});
