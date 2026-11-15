'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest');
const {initDb,createApp,passwordHash}=require('./server'),B=require('./business');
(async()=>{
 B.today=()=> '2026-11-15';
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 const hash=await passwordHash('capacity-test');
 await pool.query("INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES('owner','Owner','owner',$1,FALSE)",[hash]);
 const owner=request.agent(createApp({pool,secureCookies:false}));let checks=0;
 async function call(m,url,body,status=200){const r=await owner[m](url).set('X-BRTM-Request','1').send(body);assert.equal(r.status,status,url+' '+JSON.stringify(r.body));checks++;return r.body;}
 await call('post','/auth/login',{username:'owner',password:'capacity-test'});
 await call('post','/api/atlet',{nama:'Private terlalu muda',kelompok:'Private Class',status:'Aktif',tanggalLahir:'2024-01-01'},400);
 await call('post','/api/atlet',{nama:'Private cukup umur',kelompok:'Private Class',status:'Aktif',tanggalLahir:'2020-01-01'},201);
 let index=0;
 for(const [kind,config] of Object.entries(B.CLASSES)){
  const coach=(await pool.query("INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,'coach',$2,FALSE) RETURNING id",['coach'+index,hash])).rows[0].id;
  const count=config.kapasitas===null?301:config.kapasitas+1;
  const ids=[];for(let i=0;i<count;i++)ids.push(String((await pool.query("INSERT INTO data_klub(jenis,data) VALUES('atlet',$1) RETURNING id",[JSON.stringify({nama:kind+' '+i,kelompok:kind,status:'Aktif'})])).rows[0].id));
  const accepted=config.kapasitas===null?ids:ids.slice(0,config.kapasitas);
  const body={nama:kind,tanggal:'2026-11-16',mulai:'08:00',selesai:'09:00',coachId:String(coach),jenisKelas:kind,atletIds:accepted,lokasi:'Kolam uji'};
  const s=(await call('post','/api/jadwal',body,201)).data;
  if(config.kapasitas!==null){
   await call('post','/api/jadwal',{...body,tanggal:'2026-11-17',atletIds:ids},400);
   await call('put','/api/jadwal/'+s.id,{...body,atletIds:ids,alasanPerubahan:'Uji kapasitas'},400);
   assert.equal((await call('get','/api/jadwal')).find(r=>r.id===s.id).atletIds.length,config.kapasitas);
  }
  const slot=(await pool.query("INSERT INTO brtm_weekly_slots(coach_id,place,weekday,start_time,end_time) VALUES($1,$2,2,'10:00','11:00') RETURNING id",[coach,kind==='Prestasi Class'?'Prestasi':'Hotel Grand Wahid'])).rows[0];
  await call('put','/api/owner/schedule/'+slot.id,{className:kind,athleteIds:accepted});
  if(config.kapasitas!==null){await call('put','/api/owner/schedule/'+slot.id,{className:kind,athleteIds:ids},400);await call('put','/api/owner/schedule/'+slot.id,{className:kind,athleteIds:accepted.slice(1)});}
  else assert.equal((await pool.query('SELECT athlete_ids FROM brtm_weekly_slots WHERE id=$1',[slot.id])).rows[0].athlete_ids.length,301);
  index++;
 }
 const rules=require('./public/rules/parent/data.json');assert(!/paling lambat akhir bulan|0 kehadiran|Administrasi pendampingan|biaya administrasi/i.test(rules.prestasi));assert(rules.prestasi.includes('tanggal pembayaran pertama'));
 await db.close();console.log('PASS '+checks+' capacity API checks: all classes create/edit/weekly, regular roster changes, 301 Prestasi without product cap, rollback on overflow and updated public rules.');
})().catch(e=>{console.error(e);process.exit(1);});
