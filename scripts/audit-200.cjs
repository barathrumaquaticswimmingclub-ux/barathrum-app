'use strict';
// Synthetic-only PostgreSQL audit. Refuses remote hosts and non-audit database names.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{Pool}=require('pg');
const {initDb,createApp,passwordHash}=require('../server'),B=require('../business');
const connection=process.env.BRTM_AUDIT_DATABASE_URL;
if(!connection)throw Error('Set BRTM_AUDIT_DATABASE_URL to a disposable localhost PostgreSQL database named brtm_audit_*.');
const parsed=new URL(connection),dbName=parsed.pathname.slice(1);
if(!['127.0.0.1','localhost'].includes(parsed.hostname)||!/^brtm_audit_[a-z0-9_]+$/.test(dbName))throw Error('Audit is restricted to localhost and brtm_audit_* databases.');
const bin=process.env.BRTM_AUDIT_PG_BIN||'',output=process.env.BRTM_AUDIT_RESULT||'/tmp/brtm-launch-audit-200.json';
const result={startedAt:new Date().toISOString(),members:200,database:'PostgreSQL',poolMax:10,stages:[],checks:0};
let pool,restored,server;
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function main(){
 B.today=()=> '2026-11-14';pool=new Pool({connectionString:connection,max:10});
 assert.equal((await pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0,'Use an empty audit database');
 result.databaseVersion=(await pool.query('SHOW server_version')).rows[0].server_version;
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 const staffHash=await passwordHash('audit-staff-2026'),parentHash=await passwordHash('brtm',4);
 for(const [username,role] of [['owner','owner'],['coach','coach'],['juara','prestasi']])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,$2,$3,FALSE)',[username,role,staffHash]);
 const athletes=[];
 for(let i=0;i<200;i++){
  const a={nama:'AUDIT Anggota '+String(i+1).padStart(3,'0'),kelompok:i<100?'Prestasi Class':'Regular Class (1x Seminggu)',status:'Aktif',tanggalLahir:'2016-01-01',namaOrtu:'Wali uji '+i,noHpOrtu:'080000000000',alamat:'DATA SINTETIS',sekolah:'Sekolah Uji'};
  const id=String((await pool.query("INSERT INTO data_klub(jenis,data) VALUES('atlet',$1) RETURNING id",[a])).rows[0].id);
  await pool.query("INSERT INTO brtm_members(athlete_id,member_number,member_id,registered_at,nama,status) VALUES($1,$2,$3,$4,$5,'Aktif')",[id,i+1,'BRTM'+String(i+1).padStart(5,'0')+'14112026','2026-11-14',a.nama]);
  const parentId=(await pool.query('INSERT INTO brtm_parents(athlete_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[id,a.nama.toLowerCase(),parentHash])).rows[0].id;
  const payment={...B.price({jenisKelas:a.kelompok,tanggal:B.today(),status:'Lunas'},a),atletId:id,namaAtlet:a.nama,dibayarPada:B.today()};
  const paymentId=String((await pool.query("INSERT INTO data_klub(jenis,data) VALUES('pembayaran',$1) RETURNING id",[payment])).rows[0].id);
  if(i<100)await pool.query('INSERT INTO brtm_spp_receipts(event_key,invoice_id,athlete_id,amount,paid_on) VALUES($1,$2,$3,250000,$4)',['audit-'+id,paymentId,id,B.today()]);
  await pool.query('INSERT INTO brtm_photos(athlete_id,mime,base64) VALUES($1,$2,$3)',[id,'image/png','iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6KXQAAAAASUVORK5CYII=']);
  athletes.push({...a,id,parentId,paymentId});
 }
 const app=createApp({pool,secureCookies:false});server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let base='http://127.0.0.1:'+server.address().port;
 async function api(url,{method='GET',body,cookie,expected=200}={}){
  const started=performance.now(),r=await fetch(base+url,{method,headers:{'X-BRTM-Request':'1',...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const bytes=Buffer.from(await r.arrayBuffer());assert.equal(r.status,expected,url+' '+bytes.toString().slice(0,220));result.checks++;
  return {body:r.headers.get('content-type')?.includes('application/json')?JSON.parse(bytes):bytes,cookie:r.headers.get('set-cookie')?.split(';')[0],ms:performance.now()-started};
 }
 async function stage(name,fn){const t=performance.now(),responses=await Promise.all(athletes.map(fn)),times=responses.map(x=>x.ms).sort((a,b)=>a-b);const item={name,requests:responses.length,failures:0,totalMs:Math.round(performance.now()-t),p50Ms:Math.round(times[99]),p95Ms:Math.round(times[189]),maxMs:Math.round(times[199])};result.stages.push(item);console.log(JSON.stringify(item));return responses;}
 const owner=(await api('/auth/login',{method:'POST',body:{username:'owner',password:'audit-staff-2026'}})).cookie;
 const coach=(await api('/auth/login',{method:'POST',body:{username:'coach',password:'audit-staff-2026'}})).cookie;
 const juara=(await api('/auth/login',{method:'POST',body:{username:'juara',password:'audit-staff-2026'}})).cookie;
 const sessions=[];for(let start=0;start<200;start+=start===0?100:16){const list=athletes.slice(start,start===0?100:Math.min(200,start+16)),hour=start===0?7:8+Math.floor((start-100)/16);const s=(await api('/api/jadwal',{method:'POST',cookie:owner,body:{nama:'Sesi audit '+start,tanggal:B.today(),mulai:String(hour).padStart(2,'0')+':00',selesai:String(hour+1).padStart(2,'0')+':00',coachId:start===0?'3':'2',jenisKelas:list[0].kelompok,atletIds:list.map(a=>a.id),lokasi:'Kolam uji'},expected:201})).body.data;sessions.push(s);for(const a of list)a.scheduleId=s.id;}
 // 200 real HTTP requests launched together from one IP, representing a shared Wi-Fi/NAT.
 const logins=await stage('200 simultaneous valid logins, same IP',a=>api('/swim/api/login',{method:'POST',body:{username:a.nama,password:'brtm'}}));athletes.forEach((a,i)=>a.cookie=logins[i].cookie);
 const staffReads=Promise.all([[owner,'/api/atlet'],[owner,'/api/pembayaran'],[coach,'/api/jadwal'],[juara,'/api/atlet']].map(([cookie,url])=>api(url,{cookie})));
 await stage('200 simultaneous parent dashboards',async a=>{const r=await api('/swim/api/dashboard',{cookie:a.cookie});assert.equal(r.body.profil.id,a.id);assert.equal(r.body.pembayaran.terakhirBayar,B.today());assert.equal(r.body.latihan.hadirBulanIni,0);return r;});
 await staffReads;
 await api('/api/pembayaran',{cookie:coach,expected:403});await api('/api/backup',{cookie:juara,expected:403});await api('/api/atlet',{cookie:athletes[0].cookie,expected:401});
 await api('/swim/api/documents/invoice/'+athletes[1].paymentId,{cookie:athletes[0].cookie,expected:404});
 await stage('200 simultaneous invoice PDFs',a=>api('/swim/api/documents/invoice/'+a.paymentId,{cookie:a.cookie}));
 await stage('200 simultaneous feedback writes',a=>api('/swim/api/feedback',{method:'POST',cookie:a.cookie,body:{coachId:a.kelompok==='Prestasi Class'?'3':'2',body:'Masukan sintetis pengujian '+a.id,requestId:'audit-feedback-'+a.id},expected:201}));
 assert.equal((await pool.query('SELECT count(*)::int n FROM brtm_feedback')).rows[0].n,200);
 const t=performance.now();await api('/api/prestasi/attendance',{method:'POST',cookie:juara,body:{batchId:'audit-prestasi-batch-001',entries:athletes.slice(0,100).map(a=>({atletId:a.id,status:'Hadir'}))}});
 const batchTime=Math.round(performance.now()-t);await api('/api/prestasi/attendance',{method:'POST',cookie:juara,body:{batchId:'audit-prestasi-batch-001',entries:athletes.slice(0,100).map(a=>({atletId:a.id,status:'Hadir'}))}});
 for(const a of athletes.slice(100))await api('/api/session-entry',{method:'POST',cookie:coach,body:{atletId:a.id,jadwalId:a.scheduleId,tanggal:B.today(),status:'Hadir',noted:'Catatan pelatih sintetis pengujian'}});
 result.attendanceBatchMs=batchTime;assert.equal((await pool.query("SELECT count(*)::int n FROM data_klub WHERE jenis='absensi'")).rows[0].n,200);
 await stage('200 dashboards after attendance and payments',async a=>{const r=await api('/swim/api/dashboard',{cookie:a.cookie});assert.equal(r.body.profil.id,a.id);assert.equal(r.body.latihan.hadirBulanIni,1);assert.equal(r.body.pembayaran.saldoKredit,0);if(a.kelompok!=='Prestasi Class')assert.equal(r.body.latihan.sisaPertemuan,3);return r;});
 const snapshot=(await api('/api/backup',{cookie:owner})).body;assert.equal(snapshot.tables.brtm_parents.length,200);assert.equal(snapshot.tables.brtm_photos.length,200);result.operationalExportVerified=true;
 async function fingerprint(p){const tables=(await p.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;const out={};for(const {tablename} of tables){const rows=(await p.query('SELECT to_jsonb(t) r FROM "'+tablename+'" t ORDER BY to_jsonb(t)::text')).rows.map(r=>r.r);out[tablename]={count:rows.length,sha256:hash(JSON.stringify(rows))};}return out;}
 const before=await fingerprint(pool),dump='/tmp/'+dbName+'.dump',restoreName=dbName+'_restored';
 const env={...process.env,PGHOST:parsed.hostname,PGPORT:parsed.port||'5432',PGUSER:decodeURIComponent(parsed.username),PGPASSWORD:decodeURIComponent(parsed.password)};
 const command=(name,args)=>execFileSync(path.join(bin,name),args,{env,timeout:120000,stdio:['ignore','pipe','pipe']});
 const dumpStarted=performance.now();command('pg_dump',['-Fc','-d',dbName,'-f',dump]);result.backup={bytes:fs.statSync(dump).size,ms:Math.round(performance.now()-dumpStarted),sha256:hash(fs.readFileSync(dump))};
 await pool.query('CREATE DATABASE "'+restoreName+'"');const restoreStarted=performance.now();command('pg_restore',['--exit-on-error','--no-owner','-d',restoreName,dump]);
 const restoredUrl=new URL(connection);restoredUrl.pathname='/'+restoreName;restored=new Pool({connectionString:restoredUrl.href,max:10});assert.deepEqual(await fingerprint(restored),before);result.restore={ms:Math.round(performance.now()-restoreStarted),tables:Object.keys(before).length,allTableHashesMatch:true,members:before.brtm_parents.count};
 await new Promise(r=>server.close(r));server=createApp({pool:restored,secureCookies:false}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 await stage('200 restored accounts log in simultaneously',a=>api('/swim/api/login',{method:'POST',body:{username:a.nama,password:'brtm'}}));
 await stage('200 restored dashboards preserve identity, payment and attendance',async a=>{const r=await api('/swim/api/dashboard',{cookie:a.cookie});assert.equal(r.body.profil.id,a.id);assert.equal(r.body.latihan.hadirBulanIni,1);assert.equal(r.body.pembayaran.terakhirBayar,B.today());return r;});
 // Wrong-password controls remain active; successful logins do not exhaust a shared-IP budget.
 for(let i=0;i<8;i++)await api('/swim/api/login',{method:'POST',body:{username:athletes[0].nama,password:'wrong'},expected:401});
 await api('/swim/api/login',{method:'POST',body:{username:athletes[0].nama,password:'wrong'},expected:429});
 result.status='PASS';result.finishedAt=new Date().toISOString();result.memoryRssMB=Math.round(process.memoryUsage().rss/1048576);fs.writeFileSync(output,JSON.stringify(result,null,2));console.log('PASS full 200-member PostgreSQL audit; results: '+output);
}
main().catch(e=>{result.status='FAIL';result.error=e.stack;fs.writeFileSync(output,JSON.stringify(result,null,2));console.error(e);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(restored)await restored.end();if(pool)await pool.end();});
