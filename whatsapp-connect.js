'use strict';
const crypto=require('node:crypto');
const ORIGIN='https://barathrum-app-production.up.railway.app';
const CALLBACK=ORIGIN+'/integrations/whatsapp/connect/callback';
const APP_ID='1656989035908297',COOKIE='brtm_meta_connect';
const SCOPES=['whatsapp_business_management','whatsapp_business_messaging'];
const hash=s=>crypto.createHash('sha256').update(String(s||'')).digest('hex');
const cookie=(req,name)=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
const fail=(status,message)=>Object.assign(Error(message),{status,expose:true});
async function initDb(db){await db.query(`CREATE TABLE IF NOT EXISTS brtm_wa_oauth_flows(state_hash TEXT PRIMARY KEY,nonce_hash TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES brtm_users(id) ON DELETE CASCADE,session_hash TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,consumed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);}
async function json(app,url,options={}){
 let response;try{response=await app.locals.whatsappFetch(url,{...options,signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw fail(503,'Sambungan ke Meta belum berhasil. Silakan coba lagi.');}
 let data;try{data=await response.json();}catch{throw fail(502,'Meta belum mengembalikan jawaban yang valid.');}
 if(!response.ok)throw fail(502,'Meta belum menyetujui sambungan'+(Number.isInteger(data.error?.code)?' (kode '+data.error.code+')':'')+'.');
 return data;
}
function mount(app,h){
 const {pool,owner,wrap,transaction,audit,secureCookies}=h,W=require('./whatsapp-payments');
 const cookieOptions={httpOnly:true,secure:!!secureCookies,sameSite:'lax',path:'/integrations/whatsapp/connect',maxAge:10*60*1000};
 app.post('/api/owner/whatsapp/connect',owner,wrap(async(req,res)=>{
  const c=await W.settings(pool);if(!c.secret||!/^[a-f0-9]{64}$/.test(process.env.WHATSAPP_CONFIG_KEY||''))throw fail(409,'App Secret dan penyimpanan sambungan perlu disiapkan terlebih dahulu.');
  const session=cookie(req,'brtm_session');if(!/^[a-f0-9]{64}$/.test(session))throw fail(401,'Masuk kembali ke akun Owner.');
  const state=crypto.randomBytes(32).toString('hex'),nonce=crypto.randomBytes(32).toString('hex');
  await transaction(async db=>{
   await db.query('DELETE FROM brtm_wa_oauth_flows WHERE expires_at<NOW()');
   await db.query("INSERT INTO brtm_wa_oauth_flows(state_hash,nonce_hash,user_id,session_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '10 minutes')",[hash(state),hash(nonce),req.user.id,hash(session)]);
   await audit(db,req.user,'mulai-sambungan-meta','whatsapp',null,null,{scopes:SCOPES});
  });
  res.cookie(COOKIE,nonce,cookieOptions);
  const url=new URL('https://www.facebook.com/'+c.version+'/dialog/oauth');
  url.search=new URLSearchParams({client_id:APP_ID,redirect_uri:CALLBACK,response_type:'code',state,scope:SCOPES.join(','),auth_type:'rerequest'}).toString();
  res.json({url:url.href});
 }));
 app.get('/integrations/whatsapp/connect/callback',wrap(async(req,res)=>{
  res.set('Referrer-Policy','no-referrer');
  const state=typeof req.query.state==='string'?req.query.state:'',nonce=cookie(req,COOKIE);
  if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(nonce))throw fail(400,'Sesi penyambungan tidak valid. Mulai dari tombol Sambungkan lewat Meta di BRTM.');
  const flow=await transaction(async db=>{
   const f=(await db.query('UPDATE brtm_wa_oauth_flows SET consumed_at=NOW() WHERE state_hash=$1 AND nonce_hash=$2 AND consumed_at IS NULL AND expires_at>NOW() RETURNING *',[hash(state),hash(nonce)])).rows[0];
   if(!f)throw fail(400,'Sesi penyambungan sudah digunakan atau kedaluwarsa.');
   const u=(await db.query("SELECT u.* FROM brtm_users u JOIN brtm_sessions s ON s.user_id=u.id WHERE u.id=$1 AND u.role='owner' AND u.active=TRUE AND s.token_hash=$2 AND s.expires_at>NOW()",[f.user_id,f.session_hash])).rows[0];
   if(!u)throw fail(401,'Sesi Owner telah berakhir. Masuk kembali dan mulai penyambungan.');
   return {...f,user:u};
  });
  res.clearCookie(COOKIE,{httpOnly:true,secure:!!secureCookies,sameSite:'lax',path:'/integrations/whatsapp/connect'});
  if(req.query.error)return res.redirect(303,'/integrations/whatsapp/connect/result?status=cancelled');
  if(typeof req.query.code!=='string'||!req.query.code||req.query.code.length>4096)throw fail(400,'Meta belum mengirim kode penyambungan. Silakan mulai kembali.');
  const c=await W.settings(pool),base='https://graph.facebook.com/'+c.version+'/';
  // Only the server exchanges the one-time code. No access token reaches the page.
  const exchange=new URL(base+'oauth/access_token');exchange.search=new URLSearchParams({client_id:APP_ID,redirect_uri:CALLBACK,client_secret:c.secret,code:req.query.code}).toString();
  let token,expiresAt,subscribed=false;
  try{
   const result=await json(app,exchange.href);token=result.access_token;
   if(typeof token!=='string'||token.length<40||token.length>4096)throw fail(502,'Meta belum memberikan token akses yang valid.');
   const debug=new URL(base+'debug_token');debug.search=new URLSearchParams({input_token:token}).toString();
   const info=(await json(app,debug.href,{headers:{Authorization:'Bearer '+APP_ID+'|'+c.secret}})).data;
   if(!info?.is_valid||String(info.app_id)!==APP_ID||!SCOPES.every(s=>info.scopes?.includes(s)))throw fail(409,'Akun Meta belum memberikan kedua izin WhatsApp untuk aplikasi BRTM.');
   const headers={Authorization:'Bearer '+token};
   const phones=await json(app,base+c.wabaId+'/phone_numbers?fields=id,display_phone_number,platform_type',{headers});
   const own=phones.data?.find(p=>String(p.id)===c.phoneId&&String(p.display_phone_number).replace(/\D/g,'')==='62811210260');
   if(!own||own.platform_type&&own.platform_type!=='CLOUD_API')throw fail(409,'Akun Meta ini belum memiliki akses Cloud API ke nomor 0811210260.');
   expiresAt=Number(info.expires_at)>0?new Date(Number(info.expires_at)*1000).toISOString():Number(result.expires_in)>0?new Date(Date.now()+Number(result.expires_in)*1000).toISOString():null;
   try{subscribed=(await json(app,base+c.wabaId+'/subscribed_apps',{method:'POST',headers})).success===true;}catch{/* The valid outbound connection is retained; Owner can retry the webhook subscription. */}
   await transaction(async db=>{
    await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');
    const active=(await db.query("SELECT u.id FROM brtm_users u JOIN brtm_sessions s ON s.user_id=u.id WHERE u.id=$1 AND u.role='owner' AND u.active=TRUE AND s.token_hash=$2 AND s.expires_at>NOW()",[flow.user_id,flow.session_hash])).rows[0];
    if(!active)throw fail(401,'Sesi Owner telah berakhir.');
    const current=await W.settings(db);
    await W.storeSettings(db,{secret:current.secret,token,tokenExpiresAt:expiresAt});
    await audit(db,flow.user,'sambungkan-whatsapp-lewat-meta','whatsapp',null,null,{phone:'0811210260',subscribed,tokenExpiresAt:expiresAt});
   });
   return res.redirect(303,'/integrations/whatsapp/connect/result?status='+(subscribed?'connected':'connected-webhook-pending'));
  }catch(e){
   // Do not reflect Meta text, authorization codes, tokens, or request URLs.
   await audit(pool,flow.user,'sambungan-meta-belum-berhasil','whatsapp',null,null,{status:e.status||502});
   return res.redirect(303,'/integrations/whatsapp/connect/result?status=failed');
  }
 }));
 app.get('/integrations/whatsapp/connect/result',(req,res)=>{
  const status=req.query.status,connected=status==='connected'||status==='connected-webhook-pending';
  const title=connected?'WhatsApp BRTM tersambung':status==='cancelled'?'Penyambungan dibatalkan':'Sambungan belum berhasil';
  const text=connected?'Token sudah diperiksa untuk nomor 0811210260 dan disimpan otomatis. Buka Pembayaran untuk memeriksa invoice WA otomatis.':status==='cancelled'?'Token sebelumnya tetap tersimpan.':'Token sebelumnya tetap tersimpan. Buka pengaturan sambungan di BRTM dan coba kembali.';
  res.set({'Referrer-Policy':'no-referrer','Cache-Control':'no-store'}).type('html').send('<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><body><main><h1>'+title+'</h1><p>'+text+'</p>'+(status==='connected-webhook-pending'?'<p>Langganan pesan masuk masih perlu diperiksa.</p>':'')+'<p><a href="/club/">Kembali ke BRTM</a></p></main></body></html>');
 });
}
module.exports={APP_ID,CALLBACK,SCOPES,initDb,mount};
