'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest');
const {initDb,createApp,passwordHash}=require('./server'),B=require('./business');
async function main(){
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);
 for(const role of ['owner','prestasi','coach'])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,$1,$2,FALSE)',[role,await passwordHash('program-test')]);
 const app=createApp({pool,secureCookies:false}),owner=request.agent(app),juara=request.agent(app),coach=request.agent(app),anon=request(app);
 async function call(a,m,path,data,status=200){const r=await a[m](path).set('X-BRTM-Request','1').send(data);assert.equal(r.status,status,JSON.stringify(r.body));return r;}
 for(const [a,u] of [[owner,'owner'],[juara,'prestasi'],[coach,'coach']])await call(a,'post','/auth/login',{username:u,password:'program-test'});
 const foto={mime:'image/png',base64:require('fs').readFileSync('public/icons/brtm-brand-512.png').toString('base64')};
 const input={jenis:'Program',tanggal:'2099-01-01',dryland:'3 x 10 squat',grupProgram:[1,2,3,4].map(n=>({nomor:n,swimming:'Swimming grup '+n,foto}))};
 const p=(await call(juara,'post','/api/program',input,201)).body.data;
 assert.equal(p.tanggal,B.today());assert.match(p.judul,/Program Prestasi/);assert.equal(p.grupProgram.length,4);assert(!JSON.stringify(p).includes(foto.base64));
 for(const n of [1,2,3,4]){const r=await call(owner,'get','/api/prestasi/program/'+p.id+'/photo/'+n);assert.match(r.headers['content-type'],/image\/webp/);assert(r.body.length<Buffer.from(foto.base64,'base64').length);}
 await call(coach,'get','/api/prestasi/program/'+p.id+'/photo/1',undefined,403);await call(anon,'get','/api/prestasi/program/'+p.id+'/photo/1',undefined,401);
 const edit={...p,tanggal:'2099-12-01',grupProgram:p.grupProgram.map(g=>({nomor:g.nomor,swimming:g.nomor===2?'Program berbeda':g.swimming}))};
 const updated=(await call(juara,'put','/api/program/'+p.id,edit)).body.data;assert.equal(updated.tanggal,p.tanggal);assert(updated.grupProgram.every(g=>g.adaFoto));
 edit.grupProgram[1].hapusFoto=true;const removed=(await call(juara,'put','/api/program/'+p.id,edit)).body.data;assert.equal(removed.grupProgram[1].adaFoto,false);assert(removed.grupProgram[0].adaFoto);await call(juara,'get','/api/prestasi/program/'+p.id+'/photo/2',undefined,404);
 await call(juara,'post','/api/program',{...input,grupProgram:[...input.grupProgram,{nomor:1,foto}]},400);
 await call(juara,'post','/api/program',{...input,grupProgram:[{nomor:1,foto},{nomor:1,foto}]},400);
 await call(juara,'post','/api/program',{...input,grupProgram:[{nomor:5,foto}]},400);
 await call(juara,'post','/api/program',{jenis:'Program',grupProgram:[]},400);
 await call(juara,'post','/api/program',{jenis:'Program',grupProgram:[{nomor:2,foto}]},201);
 await call(juara,'post','/api/program',{jenis:'Program',dryland:'Lari ringan saja',grupProgram:[]},201);
 const event=(await call(juara,'post','/api/program',{jenis:'Event',detail:'Kejuaraan, kumpul 06.00',grupProgram:[]},201)).body.data;assert.equal(event.tanggal,B.today());
 await call(juara,'post','/api/program',{jenis:'Event',grupProgram:[{nomor:1,foto}]},400);
 const legacy=(await pool.query("INSERT INTO data_klub(jenis,data) VALUES('program',$1) RETURNING id",[JSON.stringify({judul:'Program lama',tanggal:'2026-10-01',jenis:'Program',swimming:'4 x 25 bebas',fotoProgram:foto})])).rows[0];
 await call(owner,'get','/api/prestasi/program/'+legacy.id+'/photo/1');
 const migrated=(await call(owner,'put','/api/program/'+legacy.id,{jenis:'Program',grupProgram:[{nomor:1,swimming:'4 x 25 bebas'}]})).body.data;assert.equal(migrated.tanggal,'2026-10-01');assert.equal(migrated.judul,'Program lama');assert.equal(migrated.grupProgram[0].adaFoto,true);
 await call(owner,'get','/api/prestasi/program/'+legacy.id+'/photo');
 const list=(await call(owner,'get','/api/program')).body;assert(!JSON.stringify(list).includes(foto.base64));
 const word=await call(owner,'get','/api/prestasi/program/'+p.id+'/word');assert.match(word.headers['content-type'],/wordprocessingml/);
 await db.close();console.log('PASS grouped programs: server dates, four photos, preservation/removal, legacy migration, private routes and Word export.');
}
main().catch(e=>{console.error(e);process.exit(1);});
