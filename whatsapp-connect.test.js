'use strict';
const assert=require('node:assert/strict'),request=require('supertest'),crypto=require('crypto'),{PGlite}=require('@electric-sql/pglite');
const {initDb,createApp,passwordHash}=require('./server'),C=require('./whatsapp-connect'),W=require('./whatsapp-payments');
(async()=>{
 Object.assign(process.env,{WHATSAPP_CONFIG_KEY:'a'.repeat(64),WHATSAPP_APP_SECRET:'b'.repeat(32),WHATSAPP_PHONE_NUMBER_ID:'11111',WHATSAPP_WABA_ID:'22222'});
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 for(const role of ['owner','coach'])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,$1,$2,FALSE)',[role,await passwordHash('connect-test')]);
 const app=createApp({pool,secureCookies:false}),owner=request.agent(app),coach=request.agent(app),anon=request(app);
 const call=async(agent,method,path,body={},status=200)=>{const r=await agent[method](path).set('X-BRTM-Request','1').send(body);assert.equal(r.status,status,JSON.stringify(r.body));return r;};
 await call(owner,'post','/auth/login',{username:'owner',password:'connect-test'});await call(coach,'post','/auth/login',{username:'coach',password:'connect-test'});
 await call(anon,'post','/api/owner/whatsapp/connect',{},401);await call(coach,'post','/api/owner/whatsapp/connect',{},403);
 let count=0,wrongApp=false,denyPermissions=false;const token='EAA'+'x'.repeat(100);
 app.locals.whatsappFetch=async(url,options)=>{
  count++;const u=new URL(url);
  if(u.pathname.endsWith('/oauth/access_token')){assert.equal(u.searchParams.get('redirect_uri'),C.CALLBACK);assert.equal(u.searchParams.get('client_secret'),'b'.repeat(32));return {ok:true,json:async()=>({access_token:token,expires_in:3600})};}
  if(u.pathname.endsWith('/debug_token'))return {ok:true,json:async()=>({data:{is_valid:true,app_id:wrongApp?'other-app':C.APP_ID,scopes:denyPermissions?[]:C.SCOPES}})};
  if(u.pathname.endsWith('/phone_numbers')){assert.equal(options.headers.Authorization,'Bearer '+token);return {ok:true,json:async()=>({data:[{id:'11111',display_phone_number:'+62 811-210-260',platform_type:'CLOUD_API'}]})};}
  if(u.pathname.endsWith('/subscribed_apps'))return {ok:true,json:async()=>({success:true})};
  throw Error('unexpected endpoint');
 };
 const begin=async()=>{const r=await call(owner,'post','/api/owner/whatsapp/connect');const u=new URL(r.body.url);assert.equal(u.origin,'https://www.facebook.com');assert.equal(u.searchParams.get('response_type'),'code');assert.equal(u.searchParams.get('redirect_uri'),C.CALLBACK);assert(!JSON.stringify(r.body).includes(token));assert(r.headers['set-cookie'].some(c=>c.includes('HttpOnly')&&c.includes('SameSite=Lax')));return u.searchParams.get('state');};
 const state=await begin(),callback='/integrations/whatsapp/connect/callback?'+new URLSearchParams({state,code:'one-time-auth-code'});
 await anon.get(callback).expect(400);assert.equal(count,0);
 await owner.get('/integrations/whatsapp/connect/callback?state='+'0'.repeat(64)+'&code=wrong').expect(400);assert.equal(count,0);
 const result=await owner.get(callback);assert.equal(result.status,303);assert.equal(result.headers.location,'/integrations/whatsapp/connect/result?status=connected');assert(!JSON.stringify(result.body).includes(token));
 const settings=await W.settings(pool);assert.equal(settings.token,token);assert.equal(settings.secret,'b'.repeat(32));assert.equal(count,4);
 const cipher=(await pool.query('SELECT cipher FROM brtm_wa_connection')).rows[0].cipher;assert(!cipher.includes(token));
 await owner.get(callback).expect(400);assert.equal(count,4);
 // A cancelled flow, wrong Meta app, or missing scopes must preserve the old connection.
 const cancelled=await begin();const no=await owner.get('/integrations/whatsapp/connect/callback').query({state:cancelled,error:'access_denied'});assert.equal(no.status,303);assert(no.headers.location.endsWith('cancelled'));assert.equal(count,4);
 wrongApp=true;const mismatched=await begin();const denied=await owner.get('/integrations/whatsapp/connect/callback').query({state:mismatched,code:'another-code'});assert(denied.headers.location.endsWith('failed'));assert.equal((await pool.query('SELECT cipher FROM brtm_wa_connection')).rows[0].cipher,cipher);
 wrongApp=false;denyPermissions=true;const missingScopes=await begin();const missing=await owner.get('/integrations/whatsapp/connect/callback').query({state:missingScopes,code:'another-code'});assert(missing.headers.location.endsWith('failed'));assert.equal((await pool.query('SELECT cipher FROM brtm_wa_connection')).rows[0].cipher,cipher);
 const expired=await begin();await pool.query("UPDATE brtm_wa_oauth_flows SET expires_at=NOW()-INTERVAL '1 minute' WHERE state_hash=$1",[crypto.createHash('sha256').update(expired).digest('hex')]);await owner.get('/integrations/whatsapp/connect/callback').query({state:expired,code:'old-code'}).expect(400);
 const revoked=await begin();await pool.query("DELETE FROM brtm_sessions WHERE user_id=(SELECT id FROM brtm_users WHERE username='owner')");await owner.get('/integrations/whatsapp/connect/callback').query({state:revoked,code:'revoked-code'}).expect(401);
 await db.close();console.log('PASS direct Meta connection: Owner-only start, bound session/nonce/state, CSRF and replay/expiry/revocation protection, server-side exchange, matching app/scopes/business number, encrypted storage, cancellation and failure preservation.');
})().catch(e=>{console.error(e);process.exit(1);});
