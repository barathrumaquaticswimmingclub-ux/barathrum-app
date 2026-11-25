'use strict';
const B=require('./business');
const TEMPLATE='brtm_invoice_pembayaran_v1',LANGUAGE='id';
const BODY='📄 INVOICE BRTM\n\nYth. Ayah/Bunda, tagihan latihan berikut telah diterbitkan.\n\nNomor invoice: {{1}}\nNama anak: {{2}}\nKelas: {{3}}\nPeriode / masa berlaku: {{4}}\nTotal tagihan: Rp{{5}}\nStatus: Belum Lunas\n\nRincian dan PDF invoice tersedia di BRTM SWIM:\nhttps://barathrum-app-production.up.railway.app/swim/\n\nSetelah transfer, balas dengan bukti pembayaran beserta nama anak, kelas, bulan pembayaran, nominal, dan tanggal transfer. Jika sudah mengirim bukti, mohon tunggu validasi admin.\n\nTerima kasih. 🙏🏻\nBARATHRUM AQUATIC SWIMMING CLUB';
const TABLES=['brtm_wa_invoice_config','brtm_wa_invoice_jobs'];
const fail=(status,message)=>Object.assign(Error(message),{status});
async function initDb(db){
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_wa_invoice_config(id INTEGER PRIMARY KEY CHECK(id=1),enabled BOOLEAN NOT NULL DEFAULT FALSE,template_status TEXT NOT NULL DEFAULT 'BELUM_DIPERIKSA',last_error TEXT,checked_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await db.query('INSERT INTO brtm_wa_invoice_config(id) VALUES(1) ON CONFLICT DO NOTHING');
 await db.query(`CREATE TABLE IF NOT EXISTS brtm_wa_invoice_jobs(id SERIAL PRIMARY KEY,payment_id INTEGER NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE,athlete_id INTEGER NOT NULL REFERENCES data_klub(id) ON DELETE CASCADE,event_key TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,message_id TEXT UNIQUE,last_error TEXT,recipient TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),next_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}
function eligible(p){return require('./billing-policy').eligible(p);}
async function enqueue(db,packs){
 const c=(await db.query('SELECT enabled FROM brtm_wa_invoice_config WHERE id=1')).rows[0];if(!c?.enabled)return;
 for(const p of packs.filter(eligible)){
  await db.query(`INSERT INTO brtm_wa_invoice_jobs(payment_id,athlete_id,event_key) SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM data_klub WHERE id=$2 AND jenis='atlet' AND data->>'status'='Aktif') ON CONFLICT DO NOTHING`,[p.id,p.atletId,'invoice:'+p.id]);
 }
}
function parameters(p){
 const one=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,500);
 return ['BRTM-'+p.id,p.namaAtlet,p.jenisKelas,p.periodeLabel||p.tanggal+' s.d. '+(p.berlakuSampai||p.tanggalBerakhir),Number(p.totalTagihan).toLocaleString('id-ID')].map(text=>({type:'text',text:one(text)}));
}
function phone(value){const p=String(value||'').replace(/\D/g,'').replace(/^0/,'62');return /^\d{9,15}$/.test(p)?p:null;}
async function graph(app,c,path,body){
 if(!c.token||!c.wabaId||!c.phoneId)throw fail(409,'Lengkapi sambungan WhatsApp BRTM terlebih dahulu.');
 const res=await app.locals.whatsappFetch('https://graph.facebook.com/'+c.version+'/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});
 const data=await res.json();if(!res.ok){const e=fail(502,'Meta menolak permintaan'+(Number.isInteger(data.error?.code)?' (kode '+data.error.code+')':'')+'.');e.metaCode=data.error?.code;e.httpStatus=res.status;throw e;}return data;
}
async function refresh(app,db){
 const c=await require('./whatsapp-payments').settings(db);
 try{
  // Check the actual business number; a test number must never send club invoices.
  const phones=await graph(app,c,c.wabaId+'/phone_numbers?fields=id,display_phone_number,platform_type');
  const own=phones.data?.find(p=>String(p.id)===c.phoneId&&phone(p.display_phone_number)==='62811210260');
  if(!own||own.platform_type&&own.platform_type!=='CLOUD_API')throw fail(409,'Nomor 0811210260 belum tersedia untuk pengiriman Cloud API. Sambungkan WhatsApp Business dengan dukungan coexistence.');
  let t=(await graph(app,c,c.wabaId+'/message_templates?name='+TEMPLATE+'&fields=id,name,language,status,category,components')).data?.find(t=>t.name===TEMPLATE&&t.language===LANGUAGE);
  if(!t)t=await graph(app,c,c.wabaId+'/message_templates',{name:TEMPLATE,language:LANGUAGE,category:'UTILITY',components:[{type:'BODY',text:BODY,example:{body_text:[['BRTM-123','Nama Contoh','Regular Class (1x Seminggu)','24 November s.d. 24 Desember 2026','150.000']]}}]});
  const status=t.status||'PENDING';
  const mismatch=t.category&&t.category!=='UTILITY'||t.components&&!t.components.some(x=>x.type==='BODY'&&x.text===BODY);
  await db.query('UPDATE brtm_wa_invoice_config SET template_status=$1,last_error=$2,checked_at=NOW() WHERE id=1',[mismatch?'TEMPLATE_BERBEDA':status,mismatch?'Isi atau kategori template berbeda. Periksa template invoice BRTM.':null]);
 }catch(e){await db.query("UPDATE brtm_wa_invoice_config SET template_status='TERHAMBAT',last_error=$1,checked_at=NOW() WHERE id=1",[e.metaCode===190?'Akses Meta tidak valid (kode 190). Perbarui token sambungan.':e.status?e.message:'Sambungan ke Meta belum berhasil.']);}
}
async function deliver(app,h){
 const {pool,payments}=h;let config=(await pool.query('SELECT * FROM brtm_wa_invoice_config WHERE id=1')).rows[0];if(!config?.enabled)return;
 await enqueue(pool,await payments());
 // A worker crash or network timeout is ambiguous; do not automatically resend it.
 await pool.query("UPDATE brtm_wa_invoice_jobs SET status='unknown',last_error='Hasil pengiriman belum pasti. Periksa WhatsApp sebelum mengirim ulang.',updated_at=NOW() WHERE status='sending' AND updated_at<NOW()-INTERVAL '2 minutes'");
 if(!config.checked_at||Date.now()-new Date(config.checked_at).getTime()>5*60*1000){await refresh(app,pool);config=(await pool.query('SELECT * FROM brtm_wa_invoice_config WHERE id=1')).rows[0];}
 if(config.template_status!=='APPROVED'||config.last_error)return;
 const c=await require('./whatsapp-payments').settings(pool);
 const jobs=(await pool.query("SELECT id,payment_id,athlete_id FROM brtm_wa_invoice_jobs WHERE status='pending' AND attempts<5 AND next_attempt<=NOW() ORDER BY id LIMIT 10")).rows;
 for(const job of jobs){
  const claim=await pool.query("UPDATE brtm_wa_invoice_jobs SET status='sending',attempts=attempts+1,updated_at=NOW() WHERE id=$1 AND status='pending' RETURNING id",[job.id]);if(!claim.rows.length)continue;
  // Re-read after claiming: do not send an already paid, cancelled, or superseded bill.
  const p=(await payments()).find(p=>String(p.id)===String(job.payment_id));
  const a=(await pool.query("SELECT data FROM data_klub WHERE id=$1 AND jenis='atlet'",[job.athlete_id])).rows[0]?.data;
  if(!p||!eligible(p)||a?.status!=='Aktif'){await pool.query("UPDATE brtm_wa_invoice_jobs SET status='cancelled',updated_at=NOW() WHERE id=$1",[job.id]);continue;}
  const to=phone(a.noHpOrtu);if(!to){await pool.query("UPDATE brtm_wa_invoice_jobs SET status='failed',last_error='Nomor WhatsApp orang tua belum valid.',updated_at=NOW() WHERE id=$1",[job.id]);continue;}
  await pool.query('UPDATE brtm_wa_invoice_jobs SET recipient=$2 WHERE id=$1',[job.id,to]);
  try{
   const r=await graph(app,c,c.phoneId+'/messages',{messaging_product:'whatsapp',recipient_type:'individual',to,biz_opaque_callback_data:'brtm-invoice:'+job.id,type:'template',template:{name:TEMPLATE,language:{code:LANGUAGE},components:[{type:'body',parameters:parameters(p)}]}});
   const id=r.messages?.[0]?.id;if(typeof id!=='string'||id.length>300)throw Error('missing_message_id');
   await pool.query("UPDATE brtm_wa_invoice_jobs SET status=CASE WHEN status='sending' THEN 'accepted' ELSE status END,message_id=$2,updated_at=NOW() WHERE id=$1",[job.id,id]);
  }catch(e){
   // Only explicit rate/token rejection is retried. Uncertain acceptance requires review.
   const retry=e.metaCode===190||e.httpStatus===429;
   await pool.query("UPDATE brtm_wa_invoice_jobs SET status=$2,last_error=$3,next_attempt=NOW()+INTERVAL '5 minutes',updated_at=NOW() WHERE id=$1 AND status='sending'",[job.id,retry?'pending':e.httpStatus&&e.httpStatus<500?'failed':'unknown',e.status?e.message:'Hasil pengiriman belum pasti. Periksa WhatsApp sebelum mengirim ulang.']);
   if(e.metaCode===190){await pool.query("UPDATE brtm_wa_invoice_config SET template_status='TERHAMBAT',last_error='Akses Meta tidak valid (kode 190). Perbarui token sambungan.',checked_at=NOW() WHERE id=1");break;}
  }
 }
}
async function statuses(db,items){
 for(const s of Array.isArray(items)?items:[]){
  if(typeof s.id!=='string'||!['sent','delivered','read','failed'].includes(s.status))continue;
  const ranks={sending:0,accepted:1,sent:2,failed:2,delivered:3,read:4,unknown:0};
  const callback=String(s.biz_opaque_callback_data||'').match(/^brtm-invoice:([1-9]\d*)$/)?.[1];
  const job=(await db.query('SELECT id,status FROM brtm_wa_invoice_jobs WHERE message_id=$1 OR (id=$2 AND recipient=$3 AND message_id IS NULL AND status IN (\'sending\',\'unknown\'))',[s.id,callback||null,String(s.recipient_id||'')])).rows[0];if(!job||ranks[s.status]<=ranks[job.status])continue;
  await db.query('UPDATE brtm_wa_invoice_jobs SET status=$2,last_error=$3,message_id=$4,updated_at=NOW() WHERE id=$1',[job.id,s.status,s.status==='failed'?'Meta melaporkan pesan gagal'+(Number.isInteger(s.errors?.[0]?.code)?' (kode '+s.errors[0].code+')':'')+'.':null,s.id]);
 }
}
function mount(app,h){
 const {pool,owner,wrap,transaction,audit,payments}=h;
 app.get('/api/owner/whatsapp/invoices',owner,wrap(async(req,res)=>{
  const config=(await pool.query('SELECT * FROM brtm_wa_invoice_config WHERE id=1')).rows[0];
  const counts=(await pool.query('SELECT status,COUNT(*)::integer AS count FROM brtm_wa_invoice_jobs GROUP BY status')).rows;
  const jobs=(await pool.query('SELECT id,payment_id,status,attempts,last_error,updated_at FROM brtm_wa_invoice_jobs ORDER BY id DESC LIMIT 50')).rows;
  const deliveryWarning=jobs.some(j=>j.status==='failed'&&/131042/.test(j.last_error||''))?'Ada invoice yang gagal dikirim karena penagihan akun WhatsApp Meta (131042). Periksa pengaturan penagihan Meta. Token tersambung dan template disetujui belum berarti pesan diterima. Invoice tetap tersedia di BRTM SWIM.':null;
  res.json({config,counts,jobs,deliveryWarning,template:TEMPLATE,preview:BODY});
 }));
 app.post('/api/owner/whatsapp/invoices/enable',owner,wrap(async(req,res)=>{
  await transaction(async db=>{await db.query('SELECT id FROM brtm_install WHERE id=1 FOR UPDATE');await db.query('UPDATE brtm_wa_invoice_config SET enabled=TRUE,updated_at=NOW() WHERE id=1');await enqueue(db,await payments(db));await audit(db,req.user,'aktifkan-invoice-whatsapp-otomatis','whatsapp',null,null,{onePerInvoice:true});});
  await refresh(app,pool);const c=(await pool.query('SELECT * FROM brtm_wa_invoice_config WHERE id=1')).rows[0];
  res.json({pesan:c.template_status==='APPROVED'?'Invoice WhatsApp otomatis aktif. Pengingat lanjutan tetap dikirim manual.':c.last_error||'Invoice otomatis sudah dijadwalkan; menunggu persetujuan template Meta.',config:c});
 }));
 app.locals.deliverWhatsAppInvoices=()=>deliver(app,h);
}
module.exports={TABLES,TEMPLATE,LANGUAGE,BODY,initDb,enqueue,parameters,phone,eligible,refresh,deliver,statuses,mount};
