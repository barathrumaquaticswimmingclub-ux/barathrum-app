'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest'),fs=require('fs');
const B=require('./business'),N=require('./notifications'),SPP=require('./spp'),{initDb,createApp,passwordHash}=require('./server');
(async()=>{
 assert.equal(B.prestasiDue('2026-12','2026-11-28'),'2026-12-31');
 for(const [month,first,start,end] of [['2026-02','2026-01-31','2026-02-28','2026-03-31'],['2028-02','2028-01-31','2028-02-29','2028-03-31'],['2026-12','2026-11-28','2026-12-28','2027-01-28']]){
  const c=B.prestasiCycle(month,first);assert.equal(c.periodeMulai,start);assert.equal(c.periodeSelesai,end);assert.equal(c.invoicePada,B.monthEnd(start));
 }
 assert.equal(B.prestasiPeriod('2026-12-27','2026-11-28'),'2026-11');assert.equal(B.prestasiPeriod('2026-12-28','2026-11-28'),'2026-12');assert.equal(B.prestasiPeriod('2027-01-01','2026-11-28'),'2026-12');
 let today='2026-11-28';B.today=()=>today;const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 for(const [name,role] of [['owner','owner'],['coach','coach']])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,$2,$3,FALSE)',[name,role,await passwordHash('payday-test')]);
 const app=createApp({pool,secureCookies:false}),owner=request.agent(app),parent=request.agent(app);let n=0;
 async function call(a,m,url,body,code=200){const r=await a[m](url).set('X-BRTM-Request','1').send(body);assert.equal(r.status,code,url+' '+JSON.stringify(r.body));n++;return r;}
 await call(owner,'post','/auth/login',{username:'owner',password:'payday-test'});
 const a=(await call(owner,'post','/api/atlet',{nama:'Contoh Bayar Dua Puluh Delapan',kelompok:'Prestasi Class',status:'Aktif'},201)).body.data;
 async function attend(date){const s=(await call(owner,'post','/api/jadwal',{nama:'Latihan',tanggal:date,mulai:'15:00',selesai:'16:00',lokasi:'Pondok Selfie',coachId:'2',atletIds:[a.id],jenisKelas:a.kelompok},201)).body.data;return (await call(owner,'post','/api/absensi',{atletId:a.id,jadwalId:s.id,tanggal:date,status:'Hadir'},201)).body.data;}
 const bills=async()=>(await call(owner,'get','/api/pembayaran')).body;
 const dashboard=async()=>(await call(parent,'get','/swim/api/dashboard')).body;
 const paid=(await call(owner,'post','/api/pembayaran',{atletId:a.id,tanggal:today,status:'Lunas',paymentRequestId:'period-first-november-001'},201)).body.data;
 await call(owner,'post','/api/orangtua/siapkan');await call(parent,'post','/swim/api/login',{username:a.nama,password:'brtm'});
 assert.equal((await dashboard()).pembayaran.bayarBerikutnya,'2026-12-31');
 today='2026-11-30';await app.locals.maintain();await app.locals.maintain();assert.equal((await pool.query('SELECT * FROM brtm_billing_notices')).rows.length,0);
 today='2026-12-01';await attend(today);await app.locals.maintain();let ps=await bills();assert.equal(ps.length,1);assert.equal(ps[0].id,paid.id);assert.equal(ps[0].status,'Lunas');assert.equal(ps[0].sppHadir,1);assert.equal(ps[0].periodeMulai,'2026-11-28');assert.equal(ps[0].periodeSelesai,'2026-12-28');assert.equal(ps[0].periodeLabel,'November 2026 – Desember 2026');assert.equal((await dashboard()).pembayaran.status,'Lunas periode ini');assert.equal((await dashboard()).pembayaran.adaTunggakan,false);assert.equal((await pool.query('SELECT * FROM brtm_billing_notices')).rows.length,0);
 // Migrate a phantom calendar-December bill and premature legacy preview without losing cash/history.
 const ghost={...B.price({tanggal:'2026-12-01',status:'Belum Lunas',jenisKelas:'Prestasi Class'},{kelompok:'Prestasi Class'}),atletId:a.id,namaAtlet:a.nama,sppDikelola:true,sppHadir:1};
 const ghostId=String((await pool.query("INSERT INTO data_klub(jenis,data) VALUES('pembayaran',$1) RETURNING id",[JSON.stringify(ghost)])).rows[0].id);
 const oldNotice={...ghost,tanggal:'2026-11-30',jatuhTempo:'2026-12-28'};
 const oldId=(await pool.query('INSERT INTO brtm_billing_notices(athlete_id,event_key,data) VALUES($1,$2,$3) RETURNING id',[a.id,'prestasi-akhir-bulan:'+a.id+':2026-12',JSON.stringify(oldNotice)])).rows[0].id;
 const parentId=(await pool.query('SELECT id FROM brtm_parents WHERE athlete_id=$1',[a.id])).rows[0].id;await pool.query('INSERT INTO brtm_push_subscriptions(endpoint,parent_id,subscription) VALUES($1,$2,$3)',['https://fcm.googleapis.com/fake-test-cycle',parentId,JSON.stringify({endpoint:'https://fcm.googleapis.com/fake-test-cycle'})]);
 await N.enqueue(pool,a.id,'invoice:'+oldId,'Invoice lama terlalu awal','Invoice Desember');
 const receiptSnapshot=(await pool.query('SELECT * FROM brtm_spp_receipts ORDER BY id')).rows;
 await SPP.migrate(pool);await SPP.migrate(pool);assert.deepEqual((await pool.query('SELECT * FROM brtm_spp_receipts ORDER BY id')).rows,receiptSnapshot);
 assert.equal((await bills()).find(p=>p.id===ghostId).totalTagihan,0);assert.equal((await dashboard()).pembayaran.status,'Lunas periode ini');
 let pushCount=0;await N.deliver(pool,async()=>pushCount++);assert.equal(pushCount,0);
 assert(!(await call(parent,'get','/swim/api/notifications')).body.some(n=>n.event_key==='invoice:'+oldId));await call(parent,'get','/swim/api/documents/notice/'+oldId,undefined,404);
 today='2026-12-27';assert.equal((await dashboard()).latihan.paketLunas,true);
 today='2026-12-28';const decAttendance=await attend(today);let dec=(await bills()).find(p=>p.periode==='2026-12');assert.equal(dec.id,ghostId);assert.equal(dec.status,'Belum Lunas');assert.equal(dec.totalTagihan,250000);assert.equal(dec.jatuhTempo,'2026-12-31');assert.equal(dec.periodeMulai,'2026-12-28');assert.equal(dec.periodeSelesai,'2027-01-28');assert.equal(dec.invoiceTersedia,false);assert.equal((await dashboard()).pembayaran.adaTunggakan,false);
 await call(parent,'get','/swim/api/documents/invoice/'+dec.id,undefined,409);
 today='2026-12-30';await app.locals.maintain();await N.reminders(pool,await bills());assert.equal((await pool.query("SELECT * FROM brtm_notifications WHERE event_key LIKE 'invoice:%'")).rows.length,1);
 today='2026-12-31';await app.locals.maintain();await app.locals.maintain();const notices=(await pool.query("SELECT * FROM brtm_billing_notices WHERE COALESCE(data->>'sppSuperseded','false')<>'true'")).rows;assert.equal(notices.length,1);assert.equal(notices[0].data.periode,'2026-12');assert.equal(notices[0].data.jatuhTempo,'2026-12-31');assert.equal(notices[0].data.tanggal,'2026-12-31');assert.equal(notices[0].data.periodeSelesai,'2027-01-28');
 const notifications=(await call(parent,'get','/swim/api/notifications')).body;assert.equal(notifications.filter(n=>n.event_key.startsWith('invoice:')).length,1);assert(notifications.find(n=>n.event_key.startsWith('invoice:')).body.includes('2026-12-31'));
 const pdf=await call(parent,'get','/swim/api/documents/notice/'+notices[0].id);fs.writeFileSync('/tmp/brtm-cycle-invoice.pdf',pdf.body);await call(parent,'get','/swim/api/documents/invoice/'+dec.id);
 today='2027-01-01';await app.locals.maintain();assert.equal((await dashboard()).pembayaran.bayarBerikutnya,'2026-12-31');assert.equal((await dashboard()).pembayaran.adaTunggakan,true);assert.equal((await pool.query("SELECT * FROM brtm_billing_notices WHERE data->>'periode'='2027-01'")).rows.length,0);
 today='2027-01-05';await call(owner,'put','/api/pembayaran/'+dec.id,{...dec,status:'Lunas',paymentRequestId:'period-late-december-001'});assert.equal((await dashboard()).pembayaran.bayarBerikutnya,'2027-01-31');assert.equal((await dashboard()).latihan.paketLunas,true);assert.equal((await dashboard()).pembayaran.terakhirBayar,today);assert((await dashboard()).riwayatPembayaran[0].keterangan.includes('Desember 2026 – Januari 2027'));
 ps=await bills();assert.equal(ps.reduce((sum,p)=>sum+B.cashReceived(p,'2026-11'),0),250000);assert.equal(ps.reduce((sum,p)=>sum+B.cashReceived(p,'2026-12'),0),0);assert.equal(ps.reduce((sum,p)=>sum+B.cashReceived(p,'2027-01'),0),250000);
 // Corrections preserve paid commitments, early payment suppresses the next invoice.
 await call(owner,'put','/api/absensi/'+decAttendance.id,{...decAttendance,status:'Izin'});assert.equal((await bills()).find(p=>p.id===dec.id).status,'Lunas');
 today='2027-01-28';await attend(today);let jan=(await bills()).find(p=>p.periode==='2027-01');await call(owner,'put','/api/pembayaran/'+jan.id,{...jan,status:'Lunas',paymentRequestId:'period-early-january-001'});
 today='2027-01-31';await app.locals.maintain();assert.equal((await pool.query("SELECT * FROM brtm_billing_notices WHERE data->>'periode'='2027-01'")).rows.length,0);assert.equal((await dashboard()).pembayaran.bayarBerikutnya,'2027-02-28');
 await db.close();console.log('PASS '+n+' cycle/expiry checks: November 28 payment, no December 1 bill, December 31 invoice/tolerance, migration/cash preservation, legacy preview retirement, year rollover, early/late payments, period labels/PDF/privacy, retries and leap-month anchors.');
})().catch(e=>{console.error(e);process.exit(1);});
