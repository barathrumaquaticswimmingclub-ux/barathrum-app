'use strict';
const assert=require('node:assert/strict'),crypto=require('crypto'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest');
const {initDb,createApp,passwordHash}=require('./server'),I=require('./whatsapp-invoices'),W=require('./whatsapp-payments'),B=require('./business');
(async()=>{
 B.today=()=> '2026-11-24';
 Object.assign(process.env,{WHATSAPP_APP_SECRET:'test-invoice-secret',WHATSAPP_ACCESS_TOKEN:'test-token',WHATSAPP_VERIFY_TOKEN:'test-verify',WHATSAPP_PHONE_NUMBER_ID:'11111',WHATSAPP_WABA_ID:'22222'});
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 for(const role of ['owner','coach'])await pool.query('INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,$1,$2,FALSE)',[role,await passwordHash('invoice-test')]);
 const app=createApp({pool,secureCookies:false}),o=request.agent(app),coach=request.agent(app),anon=request(app);
 const call=async(agent,method,path,body={},status=200)=>{const r=await agent[method](path).set('X-BRTM-Request','1').send(body);assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
 await call(o,'post','/auth/login',{username:'owner',password:'invoice-test'});await call(coach,'post','/auth/login',{username:'coach',password:'invoice-test'});
 const a=(await call(o,'post','/api/atlet',{nama:'Invoice Child',kelompok:'Semi Private Class',status:'Aktif',noHpOrtu:'081122223333'},201)).data;
 const p=(await call(o,'post','/api/pembayaran',{atletId:a.id,tanggal:B.today(),status:'Belum Lunas'},201)).data;
 const createBill=async name=>{const a=(await call(o,'post','/api/atlet',{nama:name,kelompok:'Semi Private Class',status:'Aktif',noHpOrtu:'081122223333'},201)).data;return (await call(o,'post','/api/pembayaran',{atletId:a.id,tanggal:B.today(),status:'Belum Lunas'},201)).data;};
 let sent=[],mode='invalid',templateExists=true;
 app.locals.whatsappFetch=async(url,opt)=>{
  if(mode==='invalid')return {ok:false,status:401,json:async()=>({error:{code:190}})};
  if(url.includes('/phone_numbers'))return {ok:true,json:async()=>({data:[{id:'11111',display_phone_number:'+62 811-210-260',platform_type:'CLOUD_API'}]})};
  if(url.includes('/message_templates')){
   if(opt.method==='POST'){assert.equal(JSON.parse(opt.body).category,'UTILITY');templateExists=true;return {ok:true,json:async()=>({id:'t1',status:'PENDING',category:'UTILITY'})};}
   return {ok:true,json:async()=>({data:templateExists?[{name:I.TEMPLATE,language:'id',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:I.BODY}]}]:[]})};
  }
  assert(url.endsWith('/11111/messages'));const body=JSON.parse(opt.body);sent.push(body);
  if(mode==='timeout')throw Error('timeout');
  if(mode==='early')await I.statuses(pool,[{id:'early-id',status:'delivered',recipient_id:body.to,biz_opaque_callback_data:body.biz_opaque_callback_data}]);
  return {ok:true,json:async()=>({messages:[{id:mode==='early'?'early-id':'sent-'+sent.length}]})};
 };
 await app.locals.deliverWhatsAppInvoices();assert.equal(sent.length,0);
 await call(anon,'post','/api/owner/whatsapp/invoices/enable',{},401);await call(coach,'post','/api/owner/whatsapp/invoices/enable',{},403);
 await call(o,'post','/api/owner/whatsapp/invoices/enable');let state=await call(o,'get','/api/owner/whatsapp/invoices');assert.match(state.config.last_error,/190/);assert.equal(state.jobs.length,1);assert.equal(state.jobs[0].status,'pending');
 await app.locals.deliverWhatsAppInvoices();assert.equal(sent.length,0);
 mode='ok';await call(o,'post','/api/owner/whatsapp/invoices/enable');await app.locals.deliverWhatsAppInvoices();await app.locals.deliverWhatsAppInvoices();assert.equal(sent.length,1);assert.equal(sent[0].to,'6281122223333');assert.equal(sent[0].template.name,I.TEMPLATE);assert.equal(sent[0].template.components[0].parameters[1].text,a.nama);assert.equal(sent[0].template.components[0].parameters[4].text,'200.000');
 state=await call(o,'get','/api/owner/whatsapp/invoices');assert.equal(state.jobs[0].status,'accepted');assert(!JSON.stringify(state).includes('test-token'));
 // Signed delivery callbacks advance status monotonically and do not create payment confirmations.
 const callback={object:'whatsapp_business_account',entry:[{id:'22222',changes:[{field:'messages',value:{metadata:{phone_number_id:'11111'},statuses:[{id:'sent-1',status:'read'},{id:'sent-1',status:'sent'}]}}]}]};
 const raw=JSON.stringify(callback),sig='sha256='+crypto.createHmac('sha256','test-invoice-secret').update(raw).digest('hex');
 await anon.post('/integrations/whatsapp').set('Content-Type','application/json').set('X-Hub-Signature-256',sig).send(raw).expect(200);
 assert.equal((await call(o,'get','/api/owner/whatsapp/invoices')).jobs[0].status,'read');assert.equal((await pool.query('SELECT * FROM brtm_wa_confirmations')).rows.length,0);
 const paid=await createBill('Paid Before Send');await app.locals.deliverWhatsAppInvoices(); // one invoice is sent once, further payment activity does not resend it
 await call(o,'put','/api/pembayaran/'+paid.id,{...paid,status:'Lunas'});await app.locals.deliverWhatsAppInvoices();assert.equal(sent.length,2);
 const paidQueued=await createBill('Paid While Queued');await call(o,'post','/api/owner/whatsapp/invoices/enable');await call(o,'put','/api/pembayaran/'+paidQueued.id,{...paidQueued,status:'Lunas'});await app.locals.deliverWhatsAppInvoices();assert.equal(sent.length,2);
 const cancelled=await createBill('Cancelled Before Send');await call(o,'post','/api/owner/whatsapp/invoices/enable');await call(o,'post','/api/owner/package/'+cancelled.id+'/cancel',{reason:'Pembatalan untuk uji invoice'});await app.locals.deliverWhatsAppInvoices();assert.equal(sent.length,2);
 // Timeouts are left for review, never automatically replayed and charged twice.
 await createBill('Timeout Child');mode='timeout';await app.locals.deliverWhatsAppInvoices();await app.locals.deliverWhatsAppInvoices();assert.equal(sent.length,3);assert.equal((await call(o,'get','/api/owner/whatsapp/invoices')).jobs[0].status,'unknown');
 await createBill('Early Callback');mode='early';await app.locals.deliverWhatsAppInvoices();assert.equal((await call(o,'get','/api/owner/whatsapp/invoices')).jobs[0].status,'delivered');
 // Approval is required even when a new template has just been created.
 templateExists=false;await call(o,'post','/api/owner/whatsapp/invoices/enable');assert.equal((await call(o,'get','/api/owner/whatsapp/invoices')).config.template_status,'PENDING');await createBill('Approval Pending');await app.locals.deliverWhatsAppInvoices();assert.equal(sent.length,4);
 const form='Nama anak: Anak Contoh\nKelas: 4 SD\nPembayaran bulan: November 2026\nKelas yang di ambil: Semi Private\nNominal: Rp 200.000\nTanggal transfer: 24 November 2026';
 assert.deepEqual(W.identity(form),{name:'Anak Contoh',group:'Semi Private Class',paymentMonth:'November 2026',amountText:'Rp 200.000',transferDate:'24 November 2026'});
 assert.equal(W.identity('Nama anak: Anak Contoh\nKelas: \nPembayaran bulan: November'),null);
 assert.equal(W.identity('Nama anak: Anak Contoh\nKelas: \nKelas yang diambil: Private').group,'Private Class');
 const before=(await call(o,'get','/api/pembayaran')).find(x=>x.id===p.id);assert.equal(before.status,'Belum Lunas');assert.equal(before.sisaPertemuan,4);
 const backup=await call(o,'get','/api/backup');assert(backup.tables.brtm_wa_invoice_jobs.length>0);assert(backup.tables.brtm_wa_invoice_config[0].enabled);
 await db.close();console.log('PASS automatic invoice queue, one send per invoice, Owner-only activation, token/approval gates, recipient/amount, signed delivery status, cancellation, uncertain-send protection, early callbacks, confirmation format and unchanged quota.');
})().catch(e=>{console.error(e);process.exit(1);});
