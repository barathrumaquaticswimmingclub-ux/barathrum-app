'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest');
const {initDb,createApp,passwordHash}=require('./server');
(async()=>{
 const db=new PGlite();const pool={async query(s,p){const r=await db.query(s,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await initDb(pool);
 await pool.query("INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES ('brtm','Owner','owner',$1,FALSE),('coach','Coach','coach',$2,FALSE)",[await passwordHash('OwnerTest2026'),await passwordHash('CoachTest2026')]);
 const app=createApp({pool,secureCookies:false}),owner=request.agent(app),staff=request.agent(app),parent=request.agent(app),anon=request(app);
 const write=(a,m,u,b={})=>a[m](u).set('X-BRTM-Request','1').send(b);let n=0;
 async function check(r,status=200){const v=await r;assert.equal(v.status,status,JSON.stringify(v.body));n++;return v.body;}
 await check(write(staff,'post','/auth/login',{username:'brtm',password:'OwnerTest2026'}));
 const a=(await check(write(staff,'post','/api/atlet',{nama:'Anak Profil',namaPanggilan:'Profil',namaOrtu:'Wali Contoh',jk:'Perempuan',tanggalLahir:'2016-01-02',kelompok:'Group Class',status:'Aktif',alamat:'Rumah sendiri'}),201)).data;
 await check(write(staff,'post','/api/atlet',{nama:'Prestasi Contoh',kelompok:'Prestasi Class',status:'Aktif'}),201);
 await check(write(staff,'post','/api/orangtua/siapkan'));
 await check(write(owner,'post','/swim/api/login',{username:'brtm',password:'OwnerTest2026'}));
 let d=await check(owner.get('/swim/api/dashboard'));assert.deepEqual(d.counts,{prestasi:1,pemula:1});assert.equal(d.role,'owner');
 await check(owner.get('/api/atlet'),401);await check(staff.get('/swim/api/dashboard'),401);
 await check(write(anon,'post','/swim/api/login',{username:'coach',password:'CoachTest2026'}),401);
 await check(write(parent,'post','/swim/api/login',{username:'anak profil',password:'brtm'}));
 await check(parent.get('/swim/api/owner/atlet/'+a.id),403);await check(write(parent,'delete','/swim/api/owner/akun/'+a.id),403);await check(parent.get('/swim/api/photo/999'),403);
 const foto={mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7V8AAAAASUVORK5CYII='};
 await check(write(owner,'put','/swim/api/owner/atlet/'+a.id,{nama:'Anak Profil',namaPanggilan:'Panggilan Baru',foto}));
 d=await check(parent.get('/swim/api/dashboard'));assert.equal(d.profil.namaPanggilan,'Panggilan Baru');assert.equal(d.profil.alamat,'Rumah sendiri');assert.equal(d.profil.namaOrtu,'Wali Contoh');
 const photo=await parent.get(d.profil.foto);assert.equal(photo.status,200);assert.match(photo.headers['content-type'],/image\/png/);assert.equal(photo.headers['cache-control'],'no-store');
 await check(write(owner,'put','/swim/api/owner/atlet/'+a.id,{foto:{mime:'image/png',base64:Buffer.from('<script>x</script>').toString('base64')}}),400);
 await check(write(owner,'delete','/swim/api/owner/akun/'+a.id));await check(parent.get('/swim/api/dashboard'),401);
 assert.equal((await check(staff.get('/api/atlet'))).find(x=>x.id===a.id).nama,'Anak Profil');
 assert.equal((await check(owner.get('/swim/api/dashboard'))).atlet.find(x=>x.id===a.id).deleted,true);
 await check(write(owner,'put','/swim/api/owner/akun/'+a.id,{active:true}));await check(write(parent,'post','/swim/api/login',{username:'anak profil',password:'brtm'}));
 // Staff password changes revoke owner SWIM authority through the live user record.
 await pool.query('UPDATE brtm_users SET must_change=TRUE WHERE username=$1',['brtm']);await check(owner.get('/swim/api/dashboard'),401);
 console.log('PASS '+n+' owner SWIM checks: role and cookie isolation, counts, shared profile/photo, private images, reversible account removal, session revocation.');await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
