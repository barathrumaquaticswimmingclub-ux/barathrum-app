'use strict';
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const supertest=require('supertest');
const {createApp,initDb,passwordHash}=require('./server');
const T=require('./public/progression');
async function main(){
 const db=new PGlite();const pool={async query(sql,p){const r=await db.query(sql,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 for(const [username,role] of [['owner','owner'],['juara','prestasi'],['coach','coach']])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES ($1,$1,$2,$3,FALSE)',[username,role,await passwordHash('preview123')]);
 const app=createApp({pool,secureCookies:false}),owner=supertest.agent(app),coach=supertest.agent(app),juara=supertest.agent(app),parent=supertest.agent(app),anon=supertest(app);
 const write=(a,m,url,data)=>a[m](url).set('X-BRTM-Request','1').send(data||{});
 const previewCookies={};
 for(const [agent,username] of [[owner,'owner'],[coach,'coach'],[juara,'juara']]){const login=await write(agent,'post','/auth/login',{username,password:'preview123'});assert.equal(login.status,200);previewCookies[username]=login.headers['set-cookie'];}
 const create=async nama=>(await write(owner,'post','/api/atlet',{nama,kelompok:'Prestasi Class',status:'Aktif'})).body.data;
 const a=await create('Atlet Contoh'),b=await create('Anak Kedua');
 const fixture={atletId:a.id,gaya:'Bebas',jarak:2000,kolam:25,tanggal:'2026-10-01',detik:1621.84};
 let r=await write(juara,'post','/api/prestasi/times',{batchId:'test-batch-0001',entries:[fixture,{...fixture,gaya:'Ganti',jarak:100,detik:80}]});assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal((await write(juara,'post','/api/prestasi/times',{batchId:'test-batch-0001',entries:[fixture]})).body.duplicate,true);
 assert.equal((await write(coach,'post','/api/prestasi/times',{batchId:'test-batch-0002',entries:[fixture]})).status,403);
 assert.equal((await write(anon,'post','/api/prestasi/times',{batchId:'test-batch-0002',entries:[fixture]})).status,401);
 assert.equal((await write(juara,'post','/api/prestasi/times',{batchId:'test-batch-0003',entries:[fixture,{...fixture,detik:-1}]})).status,400);
 assert.equal((await juara.get('/api/catatanwaktu')).body.length,2);
 await write(juara,'post','/api/prestasi/times',{batchId:'test-batch-0004',entries:[{...fixture,tanggal:'2026-11-01',detik:1600},{...fixture,atletId:b.id,detik:1500}]});
 await write(owner,'post','/api/orangtua/siapkan');const parentLogin=await write(parent,'post','/swim/api/login',{username:'Atlet Contoh',password:'brtm'});previewCookies.parent=parentLogin.headers['set-cookie'];
 const dashboard=(await parent.get('/swim/api/dashboard')).body;assert.equal(dashboard.catatanwaktu.length,3);assert(!JSON.stringify(dashboard.catatanwaktu).includes('Anak Kedua'));
 const p=await write(juara,'post','/api/program',{judul:'Program teknik',jenis:'Program',tanggal:'2026-11-01',grup:'Prestasi A',dryland:'3 x 10 squat',swimming:'8 x 50 bebas',evaluasi:'Jaga teknik'});assert.equal(p.status,201,JSON.stringify(p.body));
 const word=await juara.get('/api/prestasi/program/'+p.body.data.id+'/word').buffer(true).parse((res,cb)=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>cb(null,Buffer.concat(chunks)));});assert.equal(word.status,200);assert(word.headers['content-type'].includes('wordprocessingml'));assert(word.body.length>1000);
 assert.equal((await parent.get('/api/prestasi/program/'+p.body.data.id+'/word')).status,401);
 assert.equal((await coach.get('/api/prestasi/program/'+p.body.data.id+'/word')).status,403);
 for(const [input,expected] of [['35.00',35],['1.27.34',87.34],['1:27.34',87.34],['27.01.84',1621.84],['1:60.00',null],['',null],['-1',null]])assert.equal(T.parse(input),expected);
 assert.equal(T.format(59.999),'1:00.00');assert.equal(T.events.length,17);
 const report=T.report(dashboard.catatanwaktu).find(x=>x.jarak===2000);assert.equal(report.base.detik,1621.84);assert.equal(report.best.detik,1600);assert.equal(report.last.detik,1600);assert.equal(report.delta,-21.84);
 assert.equal(T.report(dashboard.catatanwaktu,50).find(x=>x.jarak===2000).base,null);
 assert.equal((await anon.get('/rules/parent/')).status,200);
 if(process.env.PRESTASI_PREVIEW){
  app.get('/preview/staff',(req,res)=>{res.setHeader('Set-Cookie',previewCookies.juara);res.redirect('/club/');});
  app.get('/preview/parent',(req,res)=>{res.setHeader('Set-Cookie',previewCookies.parent);res.redirect('/swim/');});
  const fs=require('fs');const photo={mime:'image/png',base64:fs.readFileSync('public/icons/brtm-brand-512.png').toString('base64')};await pool.query('INSERT INTO brtm_photos(athlete_id,mime,base64) VALUES ($1,$2,$3)',[a.id,photo.mime,photo.base64]);
  app.listen(process.argv.includes('--port')?Number(process.argv[process.argv.indexOf('--port')+1]):process.env.PORT||3000,'0.0.0.0',()=>console.log('Preview ready on 3000'));return;
 }
 await db.close();console.log('PASS Prestasi: atomic multi-day tests, retry deduplication, role isolation, private parent reports, 2000m, IM, base/best/latest/deltas, Word export and rules page.');
}
main().catch(e=>{console.error(e);process.exit(1);});
