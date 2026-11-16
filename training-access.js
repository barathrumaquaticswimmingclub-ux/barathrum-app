"use strict";
const crypto=require('node:crypto');
const origin='https://barathrum-app-production.up.railway.app';
function sign(value){const key=process.env.BRTM_CHAT_BRIDGE_TOKEN;if(!key||key.length<40)return null;return crypto.createHmac('sha256',key).update('brtm-training-device-v1:'+value).digest('hex');}
function issue(seconds=300){const value=String(Math.floor(Date.now()/1000)+seconds);const signature=sign(value);if(!signature)throw Object.assign(Error('Ruang latihan belum tersedia'),{status:503});return value+'.'+signature;}
function valid(token){if(typeof token!=='string'||!/^\d{10}\.[a-f0-9]{64}$/.test(token))return false;const [expires,sig]=token.split('.'),expected=sign(expires);return !!expected&&Number(expires)>Date.now()/1000&&crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(expected,'hex'));}
function link(){return origin+'/training/access?key='+issue(365*86400);}
function mount(app,{pool,wrap,auth,changed,secureCookies}){
 app.get('/training/access',wrap(async(req,res)=>{if(!valid(req.query.key))return res.redirect('/training/');res.set('Referrer-Policy','no-referrer');res.cookie('brtm_training_device',issue(365*86400),{httpOnly:true,secure:secureCookies,sameSite:'lax',path:'/api/training',maxAge:365*86400000});res.redirect(req.query.install==='1'?'/training/install/':'/training/');}));
 app.use('/api/training',wrap(async(req,res,next)=>{const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('brtm_training_device='))?.split('=')[1];if(valid(token)){req.user=(await pool.query("SELECT id,username,nama,role FROM brtm_users WHERE role='owner' AND active=TRUE ORDER BY id LIMIT 1")).rows[0];if(req.user)return next();}auth(req,res,e=>e?next(e):changed(req,res,next));}));
}
module.exports={mount,link,valid,issue};
