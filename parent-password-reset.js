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
module.exports={run};
