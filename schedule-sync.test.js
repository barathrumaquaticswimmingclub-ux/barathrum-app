'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),supertest=require('supertest');
const B=require('./business'),{initDb,createApp,passwordHash}=require('./server');
async function main(){
 let day='2026-11-16';B.today=()=>day;B.time=()=> '17:00:00';
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 const names=['owner','panji','cika','diandra','tata','ilyas','fauzan','adhi'];
 for(const [i,name] of names.entries())await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$2,$3,$4,FALSE)',[name,name,i?'coach':'owner',await passwordHash('sync-test-password')]);
 const app=createApp({pool,secureCookies:false}),owner=supertest.agent(app),records=[];
 const call=async(agent,method,url,body,status=200)=>{const r=await agent[method](url).set('X-BRTM-Request','1').send(body);assert.equal(r.status,status,url+' '+JSON.stringify(r.body));return r.body;};
 await call(owner,'post','/auth/login',{username:'owner',password:'sync-test-password'});
 for(const [i,name] of names.slice(1).entries()){
  const coach=supertest.agent(app);await call(coach,'post','/auth/login',{username:name,password:'sync-test-password'});
  const children=[];for(const n of ['Awal',i===0?'Alula sheza yunsira (Lula)':'Tambahan']){
   const a=(await call(owner,'post','/api/atlet',{nama:n+' '+name,kelompok:'Semi Private Class',status:'Aktif'},201)).data;children.push(a);
   await call(owner,'post','/api/pembayaran',{atletId:a.id,jenisKelas:a.kelompok,tanggal:day,status:'Lunas'},201);
  }
  await call(owner,'post','/api/owner/schedule/coach',{coachId:String(i+2),place:'Hotel Grand Wahid'});
  const slot=(await call(owner,'get','/api/owner/workspace')).slots.find(s=>s.coach_id===i+2&&s.weekday===1&&s.start_time==='16:00');
  const put=ids=>call(owner,'put','/api/owner/schedule/'+slot.id,{className:'Semi Private Class',athleteIds:ids,start:'16:00',end:'17:00'});
  await put([children[0].id]);const session=(await call(coach,'get','/api/jadwal')).find(s=>s.tanggal===day&&s.mulai==='16:00');assert(session);
  await call(coach,'post','/api/session-entry',{jadwalId:session.id,atletId:children[0].id,tanggal:day,status:'Hadir',noted:'Latihan dilakukan sesuai arahan pelatih.'});
  const before=(await pool.query("SELECT id,data FROM data_klub WHERE jenis='absensi' AND data->>'jadwalId'=$1",[session.id])).rows;
  await put(children.map(a=>a.id));const updated=(await call(coach,'get','/api/jadwal')).find(s=>s.id===session.id);assert(updated.atletIds.includes(children[1].id),'missing newly assigned child '+name);
  assert.deepEqual((await pool.query("SELECT id,data FROM data_klub WHERE jenis='absensi' AND data->>'jadwalId'=$1",[session.id])).rows,before);
  records.push({coach,children,slot,session});
 }
 await pool.query("UPDATE brtm_audit SET created_at='2026-11-16T10:00:00+07:00' WHERE action='ubah-jadwal-mingguan'");day='2026-11-17';await app.locals.maintain();
 for(const {coach,children,session} of records){
  assert((await call(coach,'get','/api/atlet')).some(a=>a.id===children[1].id));
  const body={jadwalId:session.id,atletId:children[1].id,tanggal:'2026-11-16',status:'Hadir',noted:'Catatan susulan sesuai latihan kemarin.'};
  await call(coach,'post','/api/session-entry',body);await call(coach,'post','/api/session-entry',body,409);
  assert.equal((await call(coach,'get','/api/absensi')).filter(a=>a.jadwalId===session.id&&a.atletId===children[1].id).length,1);
 }
 await call(records[1].coach,'post','/api/session-entry',{jadwalId:records[0].session.id,atletId:records[0].children[1].id,tanggal:'2026-11-16',status:'Izin'},403);
 const r0=records[0];
 const laterChild=(await call(owner,'post','/api/atlet',{nama:'Peserta baru tanggal 17',kelompok:'Semi Private Class',status:'Aktif'},201)).data;
 await call(owner,'put','/api/owner/schedule/'+r0.slot.id,{className:'Semi Private Class',athleteIds:[...r0.children.map(a=>a.id),laterChild.id],start:'16:00',end:'17:00'});
 await pool.query("UPDATE brtm_audit SET created_at='2026-11-17T10:00:00+07:00' WHERE id=(SELECT MAX(id) FROM brtm_audit WHERE action='ubah-jadwal-mingguan' AND record_id=$1)",[String(r0.slot.id)]);
 await app.locals.maintain();
 assert(!(await call(owner,'get','/api/jadwal')).find(s=>s.id===r0.session.id).atletIds.includes(laterChild.id),'new assignment must not be backdated');
 const r=records[0],monday='2026-11-23';day=monday;await app.locals.maintain();
 const old=(await call(owner,'get','/api/jadwal')).find(s=>s.tanggal===day&&s.weeklyKey==='weekly:'+r.slot.id);assert(old);
 await pool.query("DELETE FROM data_klub WHERE jenis='jadwal' AND id=$1",[old.id]);day='2026-11-24';
 const fresh=createApp({pool,secureCookies:false}),agent=supertest.agent(fresh);await call(agent,'post','/auth/login',{username:'panji',password:'sync-test-password'});
 const recovered=(await call(agent,'get','/api/jadwal')).filter(s=>s.tanggal===monday&&s.weeklyKey==='weekly:'+r.slot.id);assert.equal(recovered.length,1);assert(recovered[0].atletIds.includes(r.children[1].id));
 const second=records[1];await pool.query("UPDATE brtm_audit SET created_at='2026-11-24T10:00:00+07:00' WHERE action='ubah-jadwal-mingguan' AND record_id=$1",[String(second.slot.id)]);
 const missing=(await call(owner,'get','/api/jadwal')).find(s=>s.tanggal===monday&&s.weeklyKey==='weekly:'+second.slot.id);await pool.query("DELETE FROM data_klub WHERE jenis='jadwal' AND id=$1",[missing.id]);
 await pool.query("UPDATE data_klub SET data=data||'{\"statusSesi\":\"Libur\",\"alasanLibur\":\"Uji libur\"}'::jsonb WHERE id=$1",[recovered[0].id]);await fresh.locals.maintain();await fresh.locals.maintain();
 assert.equal((await pool.query("SELECT id FROM data_klub WHERE jenis='jadwal' AND data->>'weeklyKey'=$1 AND data->>'tanggal'=$2",['weekly:'+second.slot.id,monday])).rows.length,0);
 assert.equal((await pool.query('SELECT data FROM data_klub WHERE id=$1',[recovered[0].id])).rows[0].data.statusSesi,'Libur');
 await call(agent,'post','/api/session-entry',{jadwalId:recovered[0].id,atletId:r.children[1].id,tanggal:monday,status:'Izin'},400);
 await db.close();console.log('PASS schedule synchronization: seven coaches, Lula, partial attendance, yesterday backfill, read repair, ownership, idempotency, audit-dated history and holidays.');
}
main().catch(e=>{console.error(e);process.exit(1);});
