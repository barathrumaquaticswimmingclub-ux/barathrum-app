'use strict';
// One-time Owner-requested reset. Subsequent restarts preserve later edits.
const action='reset-semua-sandi-orangtua-20261124';
async function run(pool,passwordHash){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
  if((await c.query('SELECT id FROM brtm_audit WHERE action=$1 LIMIT 1',[action])).rows.length){await c.query('COMMIT');return null;}
  const hash=await passwordHash('brtm',4);
  const updated=await c.query('UPDATE brtm_parents SET password_hash=$1 RETURNING id',[hash]);
  const sessions=await c.query('DELETE FROM brtm_parent_sessions RETURNING token_hash');
  const result={accounts:updated.rows.length,sessions:sessions.rows.length};
  await c.query("INSERT INTO brtm_audit(username,action,jenis,after_data) VALUES('owner-request',$1,'orangtua',$2)",[action,JSON.stringify(result)]);
  await c.query('COMMIT');console.log('Parent password reset completed:',JSON.stringify(result));return result;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function cleanUsernames(pool){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
  const marker='hapus-titik-koma-id-orangtua-20261124';
  if((await c.query('SELECT id FROM brtm_audit WHERE action=$1 LIMIT 1',[marker])).rows.length){await c.query('COMMIT');return;}
  const accounts=(await c.query('SELECT id,athlete_id,username FROM brtm_parents ORDER BY id')).rows;
  const used=new Set(accounts.map(a=>a.username));let count=0;
  for(const a of accounts){
   let username=a.username.normalize('NFKC').replace(/[.,]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
   if(username===a.username)continue;
   if(!username)username='brtm'+a.athlete_id;
   const base=username;let suffix=0;while(used.has(username)&&username!==a.username)username=base+' #'+a.athlete_id+(suffix++?'-'+suffix:'');
   used.delete(a.username);used.add(username);
   await c.query('UPDATE brtm_parents SET username=$1 WHERE id=$2',[username,a.id]);count++;
  }
  await c.query("INSERT INTO brtm_audit(username,action,jenis,after_data) VALUES('owner-request',$1,'orangtua',$2)",[marker,JSON.stringify({accounts:count})]);
  await c.query('COMMIT');console.log('Parent username punctuation cleanup completed:',count);
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
module.exports={run,cleanUsernames};
