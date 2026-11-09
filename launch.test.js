'use strict';
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const request=require('supertest');
const {initDb,createApp,passwordHash}=require('./server');
const B=require('./business'),N=require('./notifications');
async function main(){
 const db=new PGlite();const pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);
 for(const role of ['owner','coach','prestasi'])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,$1,$2,FALSE)',[role,await passwordHash('password')]);
 const app=createApp({pool,secureCookies:false}),owner=request.agent(app),juara=request.agent(app),coach=request.agent(app),parent=request.agent(app);
 async function call(a,m,url,body,status=200){const r=await a[m](url).set('X-BRTM-Request','1').send(body);assert.equal(r.status,status,JSON.stringify(r.body));return r.body;}
 for(const [a,u] of [[owner,'owner'],[juara,'prestasi'],[coach,'coach']])await call(a,'post','/auth/login',{username:u,password:'password'});
 const today=B.today(),create=async(kind,data)=>(await call(owner,'post','/api/'+kind,data,201)).data;
 const a=await create('atlet',{nama:'Anak Tester',namaPanggilan:'Test',kelompok:'Private Class',status:'Aktif'}),p=await create('atlet',{nama:'Anak Prestasi',kelompok:'Prestasi Class',status:'Aktif'});
 const pack=await create('pembayaran',{atletId:a.id,jenisKelas:'Private Class',tanggal:today,status:'Lunas',paketKhusus:true,kuotaKhusus:8,biayaKhusus:750000,alasanKhusus:'Private dua kali seminggu'});assert.equal(pack.totalPertemuan,8);assert.equal(pack.totalTagihan,750000);
 await call(coach,'post','/api/pembayaran',{atletId:a.id,paketKhusus:true},403);
 await call(owner,'post','/api/pembayaran',{atletId:a.id,jenisKelas:'Private Class',tanggal:B.addDays(today,1),status:'Lunas',paketKhusus:true,kuotaKhusus:1.5,biayaKhusus:750000,alasanKhusus:'Private khusus'},400);
 const session=await create('jadwal',{nama:'Sesi sore',tanggal:today,mulai:'15:00',selesai:'16:00',coachId:'2',jenisKelas:'Private Class',atletIds:[a.id],lokasi:'Kolam'});
 const att=await create('absensi',{atletId:a.id,jadwalId:session.id,tanggal:today,status:'Hadir'});
 await create('perkembangan',{atletId:a.id,jadwalId:session.id,tanggal:today,fisik:'kedinginan'});
 await call(owner,'post','/api/orangtua/siapkan',{});
 await call(parent,'post','/swim/api/login',{username:'anak tester',password:'brtm'});
 let dash=await call(parent,'get','/swim/api/dashboard');assert.match(dash.evaluasi[0].fisik,/latihan sore/);assert.match(dash.evaluasi[0].fisik,/Adik Test masih merasa kedinginan/);assert.equal(dash.latihan.sisaPertemuan,7);
 let inbox=await call(parent,'get','/swim/api/notifications');assert.equal(inbox.length,2);
 await call(owner,'put','/api/absensi/'+att.id,{...att,status:'Hadir'});assert.equal((await call(parent,'get','/swim/api/notifications')).length,2);
 await call(juara,'get','/api/atlet/'+a.id+'/foto',undefined,403);
 assert.deepEqual((await call(juara,'get','/api/atlet')).map(a=>a.id),[p.id]);assert.equal((await call(juara,'get','/api/jadwal')).length,0);
 await call(juara,'post','/api/perkembangan',{atletId:a.id,tanggal:today,jadwalId:session.id,catatan:'hacked'},403);
 const holiday=await create('jadwal',{nama:'Sesi libur',tanggal:B.addDays(today,1),mulai:'15:00',selesai:'16:00',coachId:'2',jenisKelas:'Private Class',atletIds:[a.id],lokasi:'Kolam',statusSesi:'Libur',alasanLibur:'Kolam ditutup'});
 let packs=await call(owner,'get','/api/pembayaran');assert.equal(packs[0].berlakuSampai,B.addDays(B.addMonth(today),7));
 await call(owner,'put','/api/jadwal/'+holiday.id,holiday);assert.equal((await call(owner,'get','/api/pembayaran'))[0].berlakuSampai,packs[0].berlakuSampai);
 await call(owner,'post','/api/absensi',{atletId:a.id,jadwalId:holiday.id,tanggal:holiday.tanggal,status:'Hadir'},400);
 await N.reminders(pool,packs);await N.reminders(pool,packs);
 // Provider host validation prevents using push as a generic outbound request proxy.
 await call(parent,'post','/swim/api/push/subscribe',{subscription:{endpoint:'https://127.0.0.1/push',keys:{auth:'a'.repeat(22),p256dh:'a'.repeat(87)}}},400);
 await call(parent,'post','/swim/api/push/subscribe',{subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{auth:'a'.repeat(22),p256dh:'a'.repeat(87)}}});
 await N.enqueue(pool,a.id,'mock-push','Test','Data privat anak');let sent=0;await N.deliver(pool,async(s,payload)=>{sent++;assert(!payload.includes('Data privat anak'));});await N.deliver(pool,async()=>{sent++;});assert.equal(sent,1);
 const before=await call(owner,'get','/api/tester/preview');await call(coach,'post','/api/tester/reset',{},403);await call(owner,'post','/api/tester/reset',{fingerprint:'stale',confirmation:'ARSIPKAN SEMUA DATA TESTER'},409);
 const reset=await call(owner,'post','/api/tester/reset',{fingerprint:before.fingerprint,confirmation:'ARSIPKAN SEMUA DATA TESTER'});assert.equal((await call(owner,'get','/api/atlet')).length,0);await call(parent,'get','/swim/api/dashboard',undefined,401);
 await call(owner,'post','/api/tester/restore/'+reset.archiveId,{});assert.equal((await call(owner,'get','/api/atlet')).length,2);
 await db.close();console.log('PASS launch checks: custom package, parent wording, deduplicated notifications, push delivery, holiday extension, Juara restrictions, reversible reset.');
}
main().catch(e=>{console.error(e);process.exit(1);});
