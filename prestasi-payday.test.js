'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest'),fs=require('fs');
const B=require('./business'),N=require('./notifications'),{initDb,createApp,passwordHash}=require('./server');
(async()=>{
 assert.equal(B.prestasiDue('2026-09','2026-08-10'),'2026-09-10');assert.equal(B.prestasiDue('2026-02','2026-01-31'),'2026-02-28');assert.equal(B.prestasiDue('2026-03','2026-01-31'),'2026-03-31');assert.equal(B.prestasiDue('2028-02','2028-01-31'),'2028-02-29');
 let today='2026-08-10';B.today=()=>today;const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 for(const [name,role] of [['owner','owner'],['coach','coach']])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,$2,$3,FALSE)',[name,role,await passwordHash('payday-test')]);
 const app=createApp({pool,secureCookies:false}),owner=request.agent(app),parent=request.agent(app);let n=0;
 async function call(a,m,url,body,code=200){const r=await a[m](url).set('X-BRTM-Request','1').send(body);assert.equal(r.status,code,url+' '+JSON.stringify(r.body));n++;return r;}
 await call(owner,'post','/auth/login',{username:'owner',password:'payday-test'});
 const a=(await call(owner,'post','/api/atlet',{nama:'Contoh Bayar Sepuluh',kelompok:'Prestasi Class',status:'Aktif'},201)).body.data;
 async function attend(date){const s=(await call(owner,'post','/api/jadwal',{nama:'Latihan',tanggal:date,mulai:'15:00',selesai:'16:00',lokasi:'Pondok Selfie',coachId:'2',atletIds:[a.id],jenisKelas:a.kelompok},201)).body.data;await call(owner,'post','/api/absensi',{atletId:a.id,jadwalId:s.id,tanggal:date,status:'Hadir'},201);}
 await attend('2026-08-09');let bill=(await call(owner,'get','/api/pembayaran')).body[0];await call(owner,'put','/api/pembayaran/'+bill.id,{...bill,status:'Lunas',paymentRequestId:'payday-first-august-001'});
 await call(owner,'post','/api/orangtua/siapkan');await call(parent,'post','/swim/api/login',{username:a.nama,password:'brtm'});
 assert.equal((await call(parent,'get','/swim/api/dashboard')).body.pembayaran.bayarBerikutnya,'2026-09-10');
 await app.locals.maintain();assert.equal((await pool.query('SELECT * FROM brtm_billing_notices')).rows.length,0);
 today='2026-08-30';await app.locals.maintain();await N.reminders(pool,(await call(owner,'get','/api/pembayaran')).body);assert.equal((await pool.query('SELECT * FROM brtm_billing_notices')).rows.length,0);
 today='2026-08-31';await app.locals.maintain();await app.locals.maintain();const notices=(await pool.query('SELECT * FROM brtm_billing_notices')).rows;assert.equal(notices.length,1);assert.equal(notices[0].data.periode,'2026-09');assert.equal(notices[0].data.jatuhTempo,'2026-09-10');assert.equal(notices[0].data.tanggal,'2026-08-31');
 let notifications=(await call(parent,'get','/swim/api/notifications')).body;assert.equal(notifications.filter(n=>n.event_key.startsWith('invoice:')).length,1);assert(notifications.find(n=>n.event_key.startsWith('invoice:')).body.includes('2026-09-10'));
 const pdf=await call(parent,'get','/swim/api/documents/notice/'+notices[0].id);fs.writeFileSync('/tmp/brtm-payday-invoice.pdf',pdf.body);
 today='2026-09-01';await attend(today);bill=(await call(owner,'get','/api/pembayaran')).body.find(p=>p.periode==='2026-09');assert.equal(bill.jatuhTempo,'2026-09-10');assert.equal((await call(parent,'get','/swim/api/dashboard')).body.pembayaran.bayarBerikutnya,'2026-09-10');
 today='2026-09-11';await N.reminders(pool,(await call(owner,'get','/api/pembayaran')).body);notifications=(await call(parent,'get','/swim/api/notifications')).body;assert(!notifications.some(n=>/^(tagihan|spp):/.test(n.event_key)));assert.equal((await call(parent,'get','/swim/api/dashboard')).body.pembayaran.bayarBerikutnya,'2026-09-10');
 today='2026-09-12';await call(owner,'put','/api/pembayaran/'+bill.id,{...bill,status:'Lunas',paymentRequestId:'payday-late-september-001'});assert.equal((await call(parent,'get','/swim/api/dashboard')).body.pembayaran.bayarBerikutnya,'2026-10-10');
 today='2026-09-30';await app.locals.maintain();const all=(await pool.query('SELECT * FROM brtm_billing_notices ORDER BY id')).rows;assert.equal(all.length,2);assert.equal(all[1].data.jatuhTempo,'2026-10-10');assert.equal((await call(owner,'get','/api/atlet')).body[0].jatuhTempo,'2026-10-10');
 await db.close();console.log('PASS '+n+' Prestasi payday checks: first payment 10 August, invoice 31 August/due 10 September, no midmonth invoices, retry dedup, overdue dates, late-payment anchor and February/leap-year clamping.');
})().catch(e=>{console.error(e);process.exit(1);});
