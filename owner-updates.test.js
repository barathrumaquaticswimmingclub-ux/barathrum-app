'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest'),sharp=require('sharp'),fs=require('fs');
const B=require('./business'),F=require('./owner-finance'),{initDb,createApp,passwordHash}=require('./server');
(async()=>{
 B.today=()=> '2026-11-13';
 assert.deepEqual(F.ranges().map(r=>r.start),['2026-11-13','2026-11-09','2026-11-01']);assert.equal(F.ranges('2026-11-01')[1].start,'2026-10-26');
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};await initDb(pool);await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 for(const [username,role] of [['owner','owner'],['coach','coach']])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,$2,$3,FALSE)',[username,role,await passwordHash('owner-updates-test')]);
 const app=createApp({pool,secureCookies:false}),owner=request.agent(app),coach=request.agent(app);let n=0;
 async function call(a,m,url,body,code=200){const r=await a[m](url).set('X-BRTM-Request','1').send(body);assert.equal(r.status,code,url+' '+JSON.stringify(r.body));n++;return r;}
 for(const [a,username] of [[owner,'owner'],[coach,'coach']])await call(a,'post','/auth/login',{username,password:'owner-updates-test'});
 const athlete=async(n,kelompok)=>(await call(owner,'post','/api/atlet',{nama:n,kelompok,status:'Aktif'},201)).body.data;
 const a=await athlete('Atlet Paket','Private Class'),b=await athlete('Atlet Prestasi','Prestasi Class');
 const bill=(await call(owner,'post','/api/pembayaran',{atletId:a.id,tanggal:'2026-11-10',status:'Lunas'},201)).body.data;
 await call(coach,'get','/api/owner/receipts',undefined,403);await call(coach,'put','/api/owner/athlete/'+a.id+'/status',{status:'Nonaktif'},403);
 await call(owner,'put','/api/owner/athlete/'+a.id+'/status',{status:'Nonaktif'});assert.equal((await call(owner,'get','/api/atlet')).body.find(x=>x.id===a.id).status,'Nonaktif');
 assert.equal((await call(owner,'get','/api/pembayaran')).body.find(x=>x.id===bill.id).status,'Lunas');
 await call(owner,'put','/api/owner/athlete/'+a.id+'/status',{status:'Aktif'});
 const changed=(await call(owner,'put','/api/pembayaran/'+bill.id,{...bill,tanggal:'2026-11-09',status:'Lunas',rincianOwner:true,paketKhusus:true,kuotaKhusus:4,biayaKhusus:350000,biayaPendaftaran:0,potonganDiskon:25000,alasanKhusus:'Koreksi rincian Owner'})).body.data;assert.equal(changed.totalTagihan,325000);
 let finance=(await call(owner,'get','/api/owner/receipts')).body;assert.equal(finance.receipts[0].paidOn,'2026-11-13');assert.equal(finance.receipts[0].amount,325000);
 await call(owner,'put','/api/owner/receipts/paket:'+bill.id,{amount:300000,paidOn:'2026-11-08',reason:'Koreksi tanggal dan nominal'});finance=(await call(owner,'get','/api/owner/receipts')).body;assert.equal(finance.receipts[0].amount,300000);assert.equal(finance.receipts[0].paidOn,'2026-11-08');
 for(const range of ['day','week','month']){const pdf=await call(owner,'get','/api/owner/receipts/pdf?range='+range);assert.equal(pdf.body.subarray(0,4).toString(),'%PDF');fs.writeFileSync('/tmp/brtm-owner-'+range+'.pdf',pdf.body);}
 await call(owner,'delete','/api/owner/receipts/paket:'+bill.id,{reason:'x'},400);
 await call(owner,'delete','/api/owner/receipts/paket:'+bill.id,{reason:'Pencatatan ganda dibatalkan'});assert.equal((await call(owner,'get','/api/owner/receipts')).body.receipts.length,0);assert.equal((await call(owner,'get','/api/pembayaran')).body.find(x=>x.id===bill.id).status,'Belum Lunas');
 const schedule=(await call(owner,'post','/api/jadwal',{nama:'Prestasi tes',tanggal:B.today(),jenisKelas:'Prestasi Class',mulai:'15:00',selesai:'16:00',lokasi:'Kolam Renang Pondok Selfie',coachId:'2',atletIds:[b.id]},201)).body.data;
 await call(owner,'post','/api/absensi',{jadwalId:schedule.id,atletId:b.id,tanggal:B.today(),status:'Hadir'},201);
 let sp=(await call(owner,'get','/api/pembayaran')).body.find(p=>p.atletId===b.id);
 await call(owner,'put','/api/pembayaran/'+sp.id,{...sp,status:'Lunas',rincianOwner:true,biayaKhusus:300000,potonganDiskon:25000,biayaPendaftaran:50000,paymentRequestId:'owner-test-spp-001'});
 sp=(await call(owner,'get','/api/pembayaran')).body.find(p=>p.id===sp.id);assert.equal(sp.totalTagihan,325000);assert.equal(sp.penerimaanTunai,325000);assert.equal(sp.status,'Lunas');
 await call(owner,'put','/api/pembayaran/'+sp.id,{...sp,status:'Lunas',rincianOwner:true,biayaKhusus:300000,potonganDiskon:50000,biayaPendaftaran:0});
 sp=(await call(owner,'get','/api/pembayaran')).body.find(p=>p.id===sp.id);assert.equal(sp.totalTagihan,250000);assert.equal(sp.penerimaanTunai,250000);assert.equal(sp.status,'Lunas');
 let r=(await call(owner,'get','/api/owner/receipts')).body.receipts[0];assert.equal(r.amount,250000);
 await call(owner,'put','/api/owner/receipts/'+r.key,{amount:250000,paidOn:'2026-11-01',reason:'Tanggal transfer dikoreksi'});await call(owner,'delete','/api/owner/receipts/'+r.key,{reason:'Transaksi uji dibatalkan'});
 sp=(await call(owner,'get','/api/pembayaran')).body.find(p=>p.id===sp.id);assert.equal(sp.status,'Belum Lunas');assert.equal(sp.penerimaanTunai,0);
 // Reject arbitrary bytes; accept real image content despite wrong or missing MIME and compress it before persistence.
 const upload=async(buffer,mime)=>call(owner,'put','/api/owner/staff/2/profile',{jabatan:'Pelatih',photo:{mime,base64:buffer.toString('base64')}});
 for(const format of ['jpeg','png','webp','tiff','avif']){const photo=await sharp({create:{width:1600,height:1200,channels:3,background:'#3274a0'}})[format]().toBuffer();await upload(photo,'application/octet-stream');const stored=(await pool.query('SELECT profile FROM brtm_users WHERE id=2')).rows[0].profile.photo;assert.equal(stored.mime,'image/webp');const meta=await sharp(Buffer.from(stored.base64,'base64')).metadata();assert(meta.width<=1000&&meta.height<=1000);assert.equal(meta.exif,undefined);}
 const bmp=require('bmp-js').encode({data:Buffer.from([255,50,100,150]),width:1,height:1}).data;await upload(bmp,'');
 await call(owner,'put','/api/owner/staff/2/profile',{photo:{mime:'image/png',base64:Buffer.from('not a photo').toString('base64')}},400);
 assert((await call(owner,'get','/api/audit')).body.some(x=>x.action==='hapus-penerimaan'));
 await db.close();console.log('PASS '+n+' Owner update checks: image decoding/compression, status, zero fees, price/date corrections, variable SPP/FIFO, receipt reports/ranges/PDFs, audited reversals and role isolation.');
})().catch(e=>{console.error(e);process.exit(1);});
