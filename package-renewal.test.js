'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),supertest=require('supertest');
const B=require('./business'),{initDb,createApp,passwordHash}=require('./server');
(async()=>{
 B.today=()=> '2026-11-19';
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 await pool.query("INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES('owner','Owner','owner',$1,FALSE)",[await passwordHash('renew-test')]);
 const app=createApp({pool,secureCookies:false}),o=supertest.agent(app),anon=supertest(app);
 const call=async(agent,method,path,body,status=200)=>{const r=await agent[method](path).set('X-BRTM-Request','1').send(body||{});assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
 await call(o,'post','/auth/login',{username:'owner',password:'renew-test'});
 const a=(await call(o,'post','/api/atlet',{nama:'Renew Child',kelompok:'Semi Private Class',status:'Aktif'},201)).data;
 const p=(await call(o,'post','/api/pembayaran',{atletId:a.id,tanggal:'2026-10-20',status:'Lunas'},201)).data;
 const path='/api/owner/package/'+p.id+'/renew',input={requestId:'renewal-test-123',oldEnd:'2026-11-19',tanggal:'2026-11-20',status:'Lunas',kuotaKhusus:4,biayaKhusus:200000,potonganDiskon:0};
 await call(anon,'post',path,input,401);
 await call(o,'post',path,{...input,tanggal:'2026-11-19'},400);
 const renewed=(await call(o,'post',path,input)).data;
 assert.notEqual(renewed.id,p.id);assert.equal(renewed.totalPertemuan,4);
 assert.equal((await call(o,'post',path,input)).data.id,renewed.id);
 await call(o,'post',path,{...input,requestId:'another-request-123'},409);
 const packs=await call(o,'get','/api/pembayaran');assert.equal(packs.length,2);assert.equal(packs.find(x=>x.id===p.id).berlakuSampai,'2026-11-19');assert.equal(packs.find(x=>x.id===renewed.id).berlakuSampai,'2026-12-20');
 await call(o,'post','/api/owner/package/'+renewed.id+'/notify');await call(o,'post','/api/owner/package/'+renewed.id+'/notify');
 const notes=(await pool.query("SELECT * FROM brtm_notifications WHERE event_key=$1",['package-renewal:'+renewed.id])).rows;assert.equal(notes.length,1);assert.equal(String(notes[0].athlete_id),a.id);assert.match(notes[0].body,/2026-11-19/);assert.match(notes[0].body,/4 pertemuan/);
 const autoChild=(await call(o,'post','/api/atlet',{nama:'Automatic Child',kelompok:'Semi Private Class',status:'Aktif'},201)).data;
 const exhausted=(await call(o,'post','/api/owner/activation',{atletId:autoChild.id,requestId:'auto-exhausted-test',tanggal:'2026-11-01',berakhir:'2026-12-01',kuota:4,sisa:0,harga:200000,potonganDiskon:25000,status:'Lunas'})).data;
 await app.locals.maintain();await app.locals.maintain();
 let autoPacks=(await call(o,'get','/api/pembayaran')).filter(p=>p.atletId===autoChild.id);
 assert.equal(autoPacks.length,2);const auto=autoPacks.find(p=>p.renewalFrom===exhausted.id);
 assert.equal(auto.status,'Belum Lunas');assert.equal(auto.sisaPertemuan,4);assert.equal(auto.totalTagihan,175000);assert.equal(auto.biayaPendaftaran,0);
 const notice=(await pool.query('SELECT * FROM brtm_billing_notices WHERE event_key=$1',['paket-otomatis:'+auto.id])).rows;assert.equal(notice.length,1);
 // Settlement ignores altered terms and keeps previously consumed quota.
 await pool.query("UPDATE data_klub SET data=jsonb_set(data,'{pemakaianAwal}','1') WHERE id=$1",[auto.id]);
 const settlement={id:auto.id,atletId:autoChild.id,requestId:'auto-settlement-test',tanggal:'2026-11-19',berakhir:'2027-01-01',kuota:99,harga:1,potonganDiskon:0,status:'Lunas',dibayarPada:B.today()};
 await call(o,'post','/api/owner/payment',settlement);await call(o,'post','/api/owner/payment',settlement);
 autoPacks=(await call(o,'get','/api/pembayaran')).filter(p=>p.atletId===autoChild.id);
 assert.equal(autoPacks.length,2);const settled=autoPacks.find(p=>p.id===auto.id);assert.equal(settled.status,'Lunas');assert.equal(settled.sisaPertemuan,3);assert.equal(settled.totalTagihan,175000);assert.equal(settled.berlakuSampai,auto.berlakuSampai);assert.equal(settled.totalPertemuan,4);
 // Old activation forms stored the remaining balance as the total quota.
 for(const [kelas,small,total] of [['Semi Private Class',1,4],['Semi Private Class',2,4],['Regular Class (2x Seminggu)',3,8]]){
  const a=(await call(o,'post','/api/atlet',{nama:'Legacy '+small,kelompok:kelas,status:'Aktif'},201)).data;
  const p=(await call(o,'post','/api/owner/activation',{atletId:a.id,requestId:'legacy-balance-'+small,tanggal:B.today(),berakhir:'2026-12-19',kuota:small,sisa:small,harga:200000,status:'Lunas'})).data;
  await app.locals.maintain();await app.locals.maintain();
  const fixed=(await call(o,'get','/api/pembayaran')).find(x=>x.id===p.id);
  assert.equal(fixed.totalPertemuan,total);assert.equal(fixed.sisaPertemuan,small);assert.equal(fixed.totalTagihan,p.totalTagihan);assert.equal(fixed.status,p.status);
 }
 // Already-created automatic packages recover the full allocation without erasing attendance.
 await pool.query("UPDATE data_klub SET data=data || $1::jsonb WHERE id=$2",[JSON.stringify({totalPertemuan:2,pemakaianAwal:1,quotaSyncVersion:0,automaticRenewal:true,status:'Belum Lunas',catatan:'Berikutnya 2x seminggu'}),auto.id]);
 await app.locals.maintain();await app.locals.maintain();
 const repaired=(await call(o,'get','/api/pembayaran')).find(x=>x.id===auto.id);
 assert.equal(repaired.totalPertemuan,4);assert.equal(repaired.pemakaianAwal,1);assert.equal(repaired.sisaPertemuan,3);assert.equal(repaired.status,'Belum Lunas');
 const quota=require('./package-renewal').nextQuota;
 assert.equal(quota({jenisKelas:'Semi Private Class',totalPertemuan:1}),4);
 assert.equal(quota({jenisKelas:'Semi Private Class',totalPertemuan:4,catatan:'Mulai paket berikutnya 2x seminggu'}),8);
 assert.equal(quota({jenisKelas:'Regular Class (2x Seminggu)',totalPertemuan:8,catatan:'Ganti 1 kali per minggu'}),4);
 assert.equal(quota({jenisKelas:'Semi Private Class',totalPertemuan:8,catatan:'Dulu 2x seminggu, berikutnya 1x seminggu'}),4);
 assert(require('./roster-eligibility').paidCovers(repaired,B.today()));
 await pool.query("INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES('renewcoach','Coach','coach',$1,FALSE)",[await passwordHash('coach-renew-test')]);
 const coach=supertest.agent(app);await call(coach,'post','/auth/login',{username:'renewcoach',password:'coach-renew-test'});
 const coachId=String((await pool.query("SELECT id FROM brtm_users WHERE username='renewcoach'")).rows[0].id);
 await call(o,'post','/api/owner/schedule/coach',{coachId,place:'Hotel Grand Wahid'});
 const slot=(await call(o,'get','/api/owner/workspace')).slots.find(x=>String(x.coach_id)===coachId&&x.weekday===4&&x.start_time==='15:00');assert(slot);
 await call(o,'put','/api/owner/schedule/'+slot.id,{className:'Semi Private Class',athleteIds:[autoChild.id],start:slot.start_time,end:slot.end_time});
 await app.locals.maintain();
 const session=(await call(coach,'get','/api/jadwal')).find(x=>x.tanggal===B.today()&&x.atletIds.includes(autoChild.id));assert(session,'Unpaid automatic renewal must appear in coach roster');
 await call(coach,'post','/api/session-entry',{jadwalId:session.id,atletId:autoChild.id,tanggal:B.today(),status:'Hadir',noted:'Latihan dengan paket belum lunas.'});
 const consumed=(await call(o,'get','/api/pembayaran')).find(x=>x.id===auto.id);assert.equal(consumed.sisaPertemuan,2);
 await call(o,'post','/api/owner/payment',{...settlement,requestId:'settle-after-coach-123'});
 const final=(await call(o,'get','/api/pembayaran')).find(x=>x.id===auto.id);assert.equal(final.sisaPertemuan,2);assert.equal(final.status,'Lunas');assert.equal(final.catatan,'Berikutnya 2x seminggu');

 await db.close();console.log('PASS renewal authorization, history preservation, dates, quota, retry, duplicate protection and private notification deduplication');
})().catch(e=>{console.error(e);process.exit(1);});
