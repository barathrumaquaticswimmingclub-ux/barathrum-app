'use strict';
const crypto=require('node:crypto'),express=require('express'),B=require('./business');
const TABLES=['brtm_wa_confirmations','brtm_wa_connection'];
const fail=(status,message)=>Object.assign(Error(message),{status});
const normalize=s=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('id');
async function settings(db){const encrypted=(await db.query('SELECT cipher FROM brtm_wa_connection WHERE id=1')).rows[0]?.cipher;let saved={};if(encrypted){try{const key=Buffer.from(process.env.WHATSAPP_CONFIG_KEY||'','hex');const parts=encrypted.split('.');const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(parts[0],'hex'));d.setAuthTag(Buffer.from(parts[1],'hex'));saved=JSON.parse(Buffer.concat([d.update(Buffer.from(parts[2],'hex')),d.final()]).toString('utf8'));}catch{throw fail(503,'Pengaturan sambungan WhatsApp perlu diperiksa Owner');}}return {secret:saved.secret||process.env.WHATSAPP_APP_SECRET||'',verify:process.env.WHATSAPP_VERIFY_TOKEN||'',token:saved.token||process.env.WHATSAPP_ACCESS_TOKEN||'',phoneId:process.env.WHATSAPP_PHONE_NUMBER_ID||'',wabaId:process.env.WHATSAPP_WABA_ID||'',version:'v27.0'};}
async function initDb(db){await db.query(`CREATE TABLE IF NOT EXISTS brtm_wa_connection(id INTEGER PRIMARY KEY CHECK(id=1),cipher TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);await db.query(`CREATE TABLE IF NOT EXISTS brtm_wa_confirmations(id UUID PRIMARY KEY,message_id TEXT UNIQUE NOT NULL,sender TEXT NOT NULL,payload JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),payment_id TEXT,user_id INTEGER,reason TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);}
function identity(text){
 if(typeof text!=='string'||text.length>4000)return null;
 const name=text.match(/(?:^|\n)\s*nama(?:\s+lengkap)?(?:\s+anak)?\s*[:=]\s*([^\n]{3,150})/i)?.[1]?.trim();
 const raw=text.match(/(?:^|\n)\s*(?:kelas|class)\s*[:=]\s*([^\n]{2,100})/i)?.[1]?.trim();
 if(!name||!raw)return null;
 const aliases={'private':'Private Class','semi private':'Semi Private Class','private couple':'Private Couple Class','group':'Group Class','grup':'Group Class','hydro therapy':'Hydro Terapi Class','hydro terapi':'Hydro Terapi Class','prestasi':'Prestasi Class','regular 1x':'Regular Class (1x Seminggu)','regular 2x':'Regular Class (2x Seminggu)'};
 const group=Object.keys(B.CLASSES).find(k=>normalize(k)===normalize(raw))||aliases[normalize(raw)];
 return group?{name,group}:null;
}
function signature(raw,header,secret){if(!secret||!/^sha256=[a-f0-9]{64}$/.test(header||''))return false;return crypto.timingSafeEqual(Buffer.from(header.slice(7),'hex'),crypto.createHmac('sha256',secret).update(raw).digest());}
async function confirmation(db,id,lock=false){if(!/^[a-f0-9-]{36}$/i.test(id||''))throw fail(400,'Konfirmasi tidak valid');const r=(await db.query('SELECT * FROM brtm_wa_confirmations WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];if(!r)throw fail(404,'Konfirmasi tidak ditemukan');return r;}
async function forPayment(db,d,a,activation){
 if(!d.whatsappConfirmationId)return null;
 if(activation||d.status!=='Lunas'||d.bankChecked!==true)throw fail(400,'Cocokkan bukti dengan uang masuk, lalu verifikasi sebagai Lunas melalui Pembayaran');
 const r=await confirmation(db,d.whatsappConfirmationId,true);if(r.status!=='pending')throw fail(409,'Konfirmasi sudah diproses; muat ulang daftar');
 if(normalize(r.payload.name)!==normalize(a.nama)||r.payload.group!==B.canonical(a.kelompok))throw fail(409,'Nama lengkap dan kelas konfirmasi harus sesuai atlet yang dipilih');
 return r;
}
function mountWebhook(app,{pool,wrap,transaction,fetcher=fetch}){
 // Incomplete messages stay only in bounded, short-lived memory. Ordinary chat is never persisted.
 const candidates=new Map(),windowMs=30*60*1000;
 app.get('/integrations/whatsapp',wrap(async(req,res)=>{const c=await settings(pool);if(!c.verify)return res.sendStatus(503);const supplied=req.query['hub.verify_token'];if(req.query['hub.mode']!=='subscribe'||typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(c.verify)||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(c.verify)))return res.sendStatus(403);const challenge=req.query['hub.challenge'];if(typeof challenge!=='string'||!/^\d{1,100}$/.test(challenge))return res.sendStatus(400);res.type('text').send(challenge);}));
 app.post('/integrations/whatsapp',express.raw({type:'application/json',limit:'1mb'}),wrap(async(req,res)=>{
  const c=await settings(pool);if(!c.secret||!c.phoneId||!c.wabaId)return res.sendStatus(503);
  if(!Buffer.isBuffer(req.body)||!signature(req.body,req.get('X-Hub-Signature-256'),c.secret))return res.sendStatus(403);
  let body;try{body=JSON.parse(req.body.toString('utf8'));}catch{return res.sendStatus(400);}
  if(body.object!=='whatsapp_business_account')return res.sendStatus(200);
  const now=Date.now();for(const [key,v]of candidates)if(now-v.received>windowMs)candidates.delete(key);
  for(const entry of (Array.isArray(body.entry)?body.entry:[])){
   if(String(entry.id)!==c.wabaId)continue;
   for(const change of (Array.isArray(entry.changes)?entry.changes:[])){
    const v=change.value;if(change.field!=='messages'||String(v?.metadata?.phone_number_id)!==c.phoneId)continue;
    for(const m of (Array.isArray(v.messages)?v.messages:[])){
     if(typeof m.id!=='string'||m.id.length>300||!/^\d{9,15}$/.test(m.from||'')||!Number.isFinite(Number(m.timestamp))||Math.abs(now-Number(m.timestamp)*1000)>36*60*60*1000)continue;
     const attachment=m.type==='image'?m.image:m.type==='document'?m.document:null;
     const proof=attachment&&/^\d{1,100}$/.test(attachment.id||'')&&['image/jpeg','image/png','image/webp','application/pdf'].includes(attachment.mime_type)?{mediaId:attachment.id,mime:attachment.mime_type,messageId:m.id,time:Number(m.timestamp)*1000}:null;
     const details=identity(m.type==='text'?m.text?.body:attachment?.caption);
     if(!proof&&!details)continue;
     const key=m.from,prior=candidates.get(key);let item=prior&&Math.abs(Number(m.timestamp)*1000-prior.time)<=windowMs?prior:{received:now,time:Number(m.timestamp)*1000};
     if(details){if(item.details&&normalize(item.details.name)!==normalize(details.name))item={received:now,time:Number(m.timestamp)*1000};item.details=details;item.time=Number(m.timestamp)*1000;}
     if(proof)item.proof=proof;item.received=now;candidates.delete(key);if(candidates.size>=1000)candidates.delete(candidates.keys().next().value);candidates.set(key,item);
     if(!item.details||!item.proof)continue;
     const payload={...item.details,...item.proof};
     await transaction(async db=>{await db.query('INSERT INTO brtm_wa_confirmations(id,message_id,sender,payload) VALUES($1,$2,$3,$4) ON CONFLICT(message_id) DO NOTHING',[crypto.randomUUID(),item.proof.messageId,m.from,JSON.stringify(payload)]);});
     candidates.delete(key);
    }
   }
  }
  res.sendStatus(200);
 }));
 app.locals.whatsappFetch=fetcher;
}
function mountOwner(app,{pool,owner,wrap,transaction,audit,rows}){
 app.get('/api/owner/whatsapp/connection',owner,wrap(async(req,res)=>{const c=await settings(pool);res.json({hasToken:!!c.token,hasSecret:!!c.secret,canSave:/^[a-f0-9]{64}$/.test(process.env.WHATSAPP_CONFIG_KEY||''),callback:'https://barathrum-app-production.up.railway.app/integrations/whatsapp',verifyToken:c.verify,phone:'0811210260'});}));
 app.post('/api/owner/whatsapp/connection',owner,wrap(async(req,res)=>{
  if(!/^[a-f0-9]{64}$/.test(process.env.WHATSAPP_CONFIG_KEY||''))throw fail(503,'Penyimpanan sambungan belum tersedia');
  await transaction(async db=>{await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');const current=await settings(db),data={secret:current.secret,token:current.token};
   if(req.body.secret){if(typeof req.body.secret!=='string'||!/^[a-f0-9]{32}$/i.test(req.body.secret.trim()))throw fail(400,'App Secret Meta harus 32 karakter heksadesimal');data.secret=req.body.secret.trim();}
   if(req.body.token){if(typeof req.body.token!=='string'||req.body.token.trim().length<40||req.body.token.trim().length>4096||!/^[A-Za-z0-9._|=-]+$/.test(req.body.token.trim()))throw fail(400,'Token akses Meta tidak valid');data.token=req.body.token.trim();}
   if(!data.token&&!data.secret)throw fail(400,'Isi token akses atau App Secret');
   const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',Buffer.from(process.env.WHATSAPP_CONFIG_KEY,'hex'),iv),cipher=Buffer.concat([c.update(JSON.stringify(data),'utf8'),c.final()]);
   await db.query('INSERT INTO brtm_wa_connection(id,cipher) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET cipher=EXCLUDED.cipher,updated_at=NOW()',[iv.toString('hex')+'.'+c.getAuthTag().toString('hex')+'.'+cipher.toString('hex')]);
   await audit(db,req.user,'atur-sambungan-whatsapp','whatsapp',null,null,{tokenSaved:!!data.token,secretSaved:!!data.secret});});res.json({pesan:'Kredensial WhatsApp tersimpan. Uji sambungan untuk memeriksa akses nomor.'});
 }));
 async function phoneAccess(){const c=await settings(pool);if(!c.token)throw fail(409,'Token akses belum dipasang');const r=await app.locals.whatsappFetch('https://graph.facebook.com/'+c.version+'/'+c.wabaId+'/phone_numbers?fields=id,display_phone_number,platform_type',{headers:{Authorization:'Bearer '+c.token},signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok){let code;try{code=(await r.json()).error?.code;}catch{}throw fail(502,'Meta belum memberikan akses API ke nomor BRTM'+(Number.isInteger(code)?' (kode '+code+')':'')+'.');}const data=await r.json(),phone=data.data?.find(p=>String(p.id)===c.phoneId&&String(p.display_phone_number).replace(/\D/g,'')==='62811210260');if(!phone)throw fail(409,'Nomor 0811210260 belum tersedia untuk API aplikasi ini. Perlu penyiapan nomor yang mendukung WhatsApp Business App.');if(phone.platform_type&&phone.platform_type!=='CLOUD_API')throw fail(409,'Nomor BRTM belum terhubung ke Cloud API. Penyiapan coexistence diperlukan agar WhatsApp Business di HP tetap digunakan.');return c;}
 app.post('/api/owner/whatsapp/connection/test',owner,wrap(async(req,res)=>{await phoneAccess();res.json({pesan:'Token memiliki akses API ke nomor 0811210260. Webhook dan penerimaan pesan tetap perlu diuji.'});}));
 app.post('/api/owner/whatsapp/connection/subscribe',owner,wrap(async(req,res)=>{const c=await phoneAccess();if(!c.secret||!c.verify)throw fail(409,'Lengkapi App Secret dan verifikasi webhook terlebih dahulu');const r=await app.locals.whatsappFetch('https://graph.facebook.com/'+c.version+'/'+c.wabaId+'/subscribed_apps',{method:'POST',headers:{Authorization:'Bearer '+c.token},signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok||(await r.json()).success!==true)throw fail(502,'Langganan pesan belum berhasil di Meta');await audit(pool,req.user,'langganan-whatsapp','whatsapp',null,null,{phone:'0811210260'});res.json({pesan:'Langganan aplikasi ke akun WhatsApp tersimpan. Uji pesan masuk diperlukan untuk memastikan penerimaan.'});}));

 app.get('/api/owner/whatsapp/confirmations',owner,wrap(async(req,res)=>{const c=await settings(pool),items=(await pool.query("SELECT id,sender,payload,status,payment_id,reason,created_at FROM brtm_wa_confirmations ORDER BY created_at DESC LIMIT 200")).rows;res.json({configured:!!(c.secret&&c.verify&&c.token&&c.phoneId&&c.wabaId),items:items.map(r=>({...r,payload:{name:r.payload.name,group:r.payload.group,mime:r.payload.mime},proof:'/api/owner/whatsapp/confirmations/'+r.id+'/proof'}))});}));
 app.post('/api/owner/whatsapp/confirmations/:id/reject',owner,wrap(async(req,res)=>{const reason=String(req.body.reason||'').trim();if(reason.length<8||reason.length>500)throw fail(400,'Isi alasan penolakan 8–500 karakter');await transaction(async db=>{await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');const r=await confirmation(db,req.params.id,true);if(r.status!=='pending')throw fail(409,'Konfirmasi sudah diproses');await db.query("UPDATE brtm_wa_confirmations SET status='rejected',reason=$2,user_id=$3,updated_at=NOW() WHERE id=$1",[r.id,reason,req.user.id]);await audit(db,req.user,'tolak-konfirmasi-whatsapp','whatsapp',r.id,null,{reason});});res.json({pesan:'Konfirmasi ditolak. Pembayaran dan paket tidak berubah.'});}));
 app.get('/api/owner/whatsapp/confirmations/:id/proof',owner,wrap(async(req,res)=>{
  const r=await confirmation(pool,req.params.id),c=await settings(pool);if(!c.token)throw fail(503,'Akses bukti WhatsApp belum dikonfigurasi');
  const fetcher=app.locals.whatsappFetch,options={headers:{Authorization:'Bearer '+c.token},signal:AbortSignal.timeout(15000),redirect:'error'};
  const metadata=await fetcher('https://graph.facebook.com/'+c.version+'/'+encodeURIComponent(r.payload.mediaId),options);if(!metadata.ok)throw fail(502,'Bukti belum tersedia dari Meta. Minta orang tua mengirim ulang jika sudah kedaluwarsa.');
  const media=await metadata.json();let u;try{u=new URL(media.url);}catch{throw fail(502,'Alamat bukti tidak valid');}
  if(u.protocol!=='https:'||!['.facebook.com','.fbcdn.net','.fbsbx.com'].some(s=>u.hostname.endsWith(s))||u.port||u.username||u.password||Number(media.file_size)>10*1024*1024)throw fail(502,'Bukti tidak dapat diunduh');
  const response=await fetcher(u.href,{...options,signal:AbortSignal.timeout(15000)});if(!response.ok)throw fail(502,'Bukti gagal diunduh');
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>10*1024*1024)throw fail(413,'Bukti maksimal 10 MB');chunks.push(chunk);}
  const buffer=Buffer.concat(chunks),mime=r.payload.mime;const valid=mime==='application/pdf'?buffer.subarray(0,5).toString()==='%PDF-':mime==='image/jpeg'?buffer[0]===255&&buffer[1]===216:mime==='image/png'?buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP';
  if(!valid)throw fail(502,'Format bukti tidak sesuai');res.type(mime).set('Content-Disposition','inline; filename="bukti-whatsapp.'+(mime==='application/pdf'?'pdf':mime.split('/')[1])+'"').send(buffer);
 }));
}
module.exports={TABLES,initDb,mountWebhook,mountOwner,forPayment,identity,signature};
