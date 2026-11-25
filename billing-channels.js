'use strict';
const B=require('./business'),P=require('./billing-policy'),N=require('./notifications');
const TABLES=['brtm_email_invoice_jobs','brtm_billing_channel_policy'];
async function initDb(db){
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_billing_channel_policy(id INTEGER PRIMARY KEY CHECK(id=1),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 // One-time switch requested by Owner: WA is prepared manually; never incur Meta sending charges.
 await db.query('WITH first_run AS (INSERT INTO brtm_billing_channel_policy(id) VALUES(1) ON CONFLICT DO NOTHING RETURNING id) UPDATE brtm_wa_invoice_config SET enabled=FALSE,updated_at=NOW() WHERE id=1 AND EXISTS(SELECT 1 FROM first_run)');
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_email_invoice_jobs(id SERIAL PRIMARY KEY,payment_id INTEGER NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE,athlete_id INTEGER NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending',recipient TEXT,provider_id TEXT,last_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(payment_id))`);
}
function configured(){return !!require('./billing-email').mode();}
async function enqueue(db,packs){
 for(const p of packs.filter(p=>P.eligible(p))){
  const a=(await db.query("SELECT data FROM data_klub WHERE jenis='atlet' AND id=$1",[p.atletId])).rows[0]?.data;if(a?.status!=='Aktif')continue;
  // Initial invoices and renewal notices share the same payment identity.
  const notices=(await db.query('SELECT data FROM brtm_billing_notices WHERE athlete_id=$1',[p.atletId])).rows;
  if(!notices.some(n=>String(n.data.paymentId||n.data.id)===String(p.id)||p.periode&&n.data.periode===p.periode&&!n.data.sppSuperseded)){
   const r=(await db.query('INSERT INTO brtm_billing_notices(athlete_id,event_key,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[p.atletId,'billing-invoice:'+p.id,JSON.stringify({...p,paymentId:p.id,provisional:true})])).rows[0];
   if(r)await N.enqueue(db,p.atletId,'invoice:'+r.id,'Invoice pembayaran BRTM',require('./billing-reminders').message(p)+'\nRincian dan PDF tersedia di BRTM SWIM.');
  }
  if(P.email(a.emailOrtu||''))await db.query('INSERT INTO brtm_email_invoice_jobs(payment_id,athlete_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[p.id,p.atletId]);
 }
}
async function pdf(p){const {PassThrough}=require('stream'),stream=new PassThrough(),chunks=[];stream.type=()=>stream;stream.attachment=()=>stream;const done=new Promise((resolve,reject)=>{stream.on('data',c=>chunks.push(c));stream.on('end',()=>resolve(Buffer.concat(chunks)));stream.on('error',reject);});require('./reports').bill(stream,p,'invoice',p.id);return done;}
async function deliver(app,h){
 const db=h.pool;
 // A timeout/crash can follow acceptance. Never automatically repeat an uncertain send.
 await db.query("UPDATE brtm_email_invoice_jobs SET status='unknown',last_error='Hasil pengiriman belum pasti; periksa layanan email.',updated_at=NOW() WHERE status='sending' AND updated_at<NOW()-INTERVAL '2 minutes'");
 if(!configured())return;
 const jobs=(await db.query("SELECT * FROM brtm_email_invoice_jobs WHERE status='pending' ORDER BY id")).rows;
 const snapshot=await h.payments();let processed=0;
 const athletes=(await db.query("SELECT id,data FROM data_klub WHERE jenis='atlet'")).rows;

 for(const j of jobs){
  const candidate=snapshot.find(p=>String(p.id)===String(j.payment_id)),contact=athletes.find(a=>String(a.id)===String(j.athlete_id))?.data;
  if(P.unpaid(candidate)&&contact?.status==='Aktif'&&(!P.eligible(candidate)||!P.email(contact.emailOrtu||'')))continue;
  if(processed++>=10)break;
  const claim=await db.query("UPDATE brtm_email_invoice_jobs SET status='sending',updated_at=NOW() WHERE id=$1 AND status='pending' RETURNING id",[j.id]);if(!claim.rows.length)continue;
  let p=(await h.payments()).find(p=>String(p.id)===String(j.payment_id));
  let a=(await db.query("SELECT data FROM data_klub WHERE jenis='atlet' AND id=$1",[j.athlete_id])).rows[0]?.data;
  if(!P.unpaid(p)||a?.status!=='Aktif'){await db.query("UPDATE brtm_email_invoice_jobs SET status='cancelled',updated_at=NOW() WHERE id=$1",[j.id]);continue;}
  if(!P.eligible(p)||!P.email(a.emailOrtu||'')){await db.query("UPDATE brtm_email_invoice_jobs SET status='pending',updated_at=NOW() WHERE id=$1",[j.id]);continue;}
  try{
   const signature=JSON.stringify(p),attachment=await pdf(p);
   // Recheck after PDF generation, immediately before external transmission.
   p=(await h.payments()).find(p=>String(p.id)===String(j.payment_id));a=(await db.query("SELECT data FROM data_klub WHERE jenis='atlet' AND id=$1",[j.athlete_id])).rows[0]?.data;
   if(!P.eligible(p)||JSON.stringify(p)!==signature||a?.status!=='Aktif'||!P.email(a.emailOrtu||'')){await db.query("UPDATE brtm_email_invoice_jobs SET status=$2,updated_at=NOW() WHERE id=$1",[j.id,P.unpaid(p)?'pending':'cancelled']);continue;}
   await db.query('UPDATE brtm_email_invoice_jobs SET recipient=$2 WHERE id=$1',[j.id,a.emailOrtu]);
   const result=await require('./billing-email').send(app,{from:require('./billing-email').from(),to:[a.emailOrtu],subject:'Invoice BRTM • '+p.namaAtlet+' • '+(p.periodeLabel||p.tanggal),text:require('./billing-reminders').message(p)+'\n\nBuka BRTM SWIM: https://barathrum-app-production.up.railway.app/swim/',attachments:[{filename:'BRTM-Invoice-'+p.id+'.pdf',content:attachment.toString('base64')}]},'brtm-invoice-'+j.id);
   await db.query('UPDATE brtm_email_invoice_jobs SET status=$2,provider_id=$3,last_error=$4,updated_at=NOW() WHERE id=$1',[j.id,result.status,result.id||null,result.error||null]);
  }catch{await db.query("UPDATE brtm_email_invoice_jobs SET status='unknown',last_error='Hasil pengiriman belum pasti; periksa layanan email.',updated_at=NOW() WHERE id=$1",[j.id]);}
 }
}
function mount(app,h){app.locals.billingEmailFetch=global.fetch;app.locals.billingSmtpSend=require('./billing-email').smtpSend;app.locals.deliverBillingEmails=()=>deliver(app,h);
 h.pool&&app.get('/api/owner/billing/channels',h.owner,h.wrap(async(req,res)=>{res.json({emailConfigured:configured(),emailFrom:require('./billing-email').from(),emailStatus:configured()?'Sambungan email tersedia':'Menunggu alamat email pengirim dan sambungan layanan email',prestasiPolicy:'Tagihan Prestasi hanya dikirim pada hari terakhir bulan (WIB); yang sudah lunas tidak ditagih kembali.',jobs:(await h.pool.query('SELECT payment_id,status,last_error,updated_at FROM brtm_email_invoice_jobs ORDER BY id DESC LIMIT 50')).rows});}));
}
module.exports={TABLES,initDb,enqueue,deliver,pdf,configured,mount};
