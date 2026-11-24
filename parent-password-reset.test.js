'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),{passwordHash,verify}=require('./server'),{run,cleanUsernames}=require('./parent-password-reset');
(async()=>{
 const db=new PGlite(),pool={query:(q,p)=>db.query(q,p),connect:async()=>({query:(q,p)=>db.query(q,p),release(){}})};
 await db.exec('CREATE TABLE brtm_install(id INT PRIMARY KEY);INSERT INTO brtm_install VALUES(1);CREATE TABLE brtm_parents(id INT PRIMARY KEY,password_hash TEXT,username TEXT,active BOOLEAN);CREATE TABLE brtm_parent_sessions(token_hash TEXT);CREATE TABLE brtm_audit(id SERIAL,username TEXT,action TEXT,jenis TEXT,after_data JSONB);');
 const old=await passwordHash('old-password');await db.query("INSERT INTO brtm_parents VALUES(1,$1,'wali',TRUE),(2,$1,'wali2',FALSE)",[old]);await db.exec("INSERT INTO brtm_parent_sessions VALUES('session')");
 assert.deepEqual(await run(pool,passwordHash),{accounts:2,sessions:1});
 for(const a of (await db.query('SELECT * FROM brtm_parents')).rows)assert(await verify('brtm',a.password_hash));
 assert.equal((await db.query('SELECT username FROM brtm_parents WHERE id=1')).rows[0].username,'wali');
 const changed=await passwordHash('changed-password');await db.query('UPDATE brtm_parents SET password_hash=$1 WHERE id=1',[changed]);assert.equal(await run(pool,passwordHash),null);assert(await verify('changed-password',(await db.query('SELECT password_hash FROM brtm_parents WHERE id=1')).rows[0].password_hash));
 assert.equal((await db.query('SELECT * FROM brtm_audit')).rows.length,1);await db.exec("ALTER TABLE brtm_parents ADD COLUMN athlete_id INT;UPDATE brtm_parents SET athlete_id=id;UPDATE brtm_parents SET username='ilham akram. fillah' WHERE id=1;UPDATE brtm_parents SET username='name, child' WHERE id=2;");await cleanUsernames(pool);await cleanUsernames(pool);assert.equal((await db.query('SELECT username FROM brtm_parents WHERE id=1')).rows[0].username,'ilham akram fillah');assert.equal((await db.query('SELECT username FROM brtm_parents WHERE id=2')).rows[0].username,'name child');await db.close();console.log('PASS bulk parent reset, session revocation, usernames/status preserved, restart idempotence');
})().catch(e=>{console.error(e);process.exitCode=1;});
