'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest');
const B=require('./business'),P=require('./billing-policy'),C=require('./billing-channels'),N=require('./notifications'),{initDb,createApp,passwordHash}=require('./server');
(async()=>{
 let day='2026-11-25';B.today=()=>day;
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 await pool.query("INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES('owner','Owner','owner',$1,FALSE)",[await passwordHash('test-mail')]);
 const app=createApp({pool,secureCookies:false}),o=request.agent(app),anon=request(app);
 const call=async(agent,method,path,body,status=200)=>{const r=await agent[method](path).set('X-BRTM-Request','1').send(body);assert.equal(r.status,status,path+' '+JSON.stringify(r.body));return r.body;};
 await call(o,'post','/auth/login',{username:'owner',password:'test-mail'});
 await call(anon,'get','/api/owner/billing/channels',undefined,401);
 assert.equal((await call(o,'get','/api/owner/billing/channels')).emailConfigured,false);
 const create=async(k,v)=>(await call(o,'post','/api/'+k,v,201)).data;
 const a=await create('atlet',{nama:'Email Child',kelompok:'Semi Private Class',status:'Aktif',emailOrtu:'guardian@example.com',noHpOrtu:'081122223333'});
 assert.equal(a.emailOrtu,'guardian@example.com');
 await call(o,'put','/api/atlet/'+a.id,{...a,emailOrtu:'a@example.com\r\nBcc: other@example.com'},400);
 const bill=await create('pembayaran',{atletId:a.id,tanggal:day,status:'Belum Lunas'});
 const b=await create('atlet',{nama:'Prestasi Month End',kelompok:'Prestasi Class',status:'Aktif',emailOrtu:'prestasi@example.com',noHpOrtu:'081122223334'});
 let packs=[{...bill},{id:'9999',atletId:b.id,namaAtlet:b.nama,jenisKelas:'Prestasi Class',status:'Belum Lunas',jumlah:250000,totalTagihan:250000,tanggal:day,periode:'2026-11',invoiceTersedia:true}];
 // Use a real payment FK while keeping explicit mutable billing state for delivery-time tests.
 const raw=(await pool.query("INSERT INTO data_klub(jenis,data) VALUES('pembayaran',$1) RETURNING id",[JSON.stringify(packs[1])])).rows[0];packs[1].id=String(raw.id);
 const saveRaw=()=>pool.query("UPDATE data_klub SET data=$2 WHERE id=$1",[packs[1].id,JSON.stringify(packs[1])]);await saveRaw();
 const h={pool,payments:async()=>packs};
 let sends=[];app.locals.billingEmailFetch=async(url,opt)=>{sends.push(JSON.parse(opt.body));return {ok:true,json:async()=>({id:'email-'+sends.length})};};
 await C.enqueue(pool,packs);await C.enqueue(pool,packs);
 assert.equal((await pool.query('SELECT * FROM brtm_email_invoice_jobs')).rows.length,1);
 assert.equal((await pool.query('SELECT * FROM brtm_billing_notices WHERE athlete_id=$1',[a.id])).rows.length,1);
 for(const channel of ['app','wa'])await call(o,'post','/api/owner/billing/'+packs[1].id+'/remind',{channel},409);
 await C.deliver(app,h);assert.equal(sends.length,0);
 Object.assign(process.env,{RESEND_API_KEY:'fake-test-only',BRTM_EMAIL_FROM:'billing@example.com'});
 await C.deliver(app,h);assert.equal(sends.length,1);assert.deepEqual(sends[0].to,['guardian@example.com']);assert(sends[0].attachments[0].content.startsWith('JVBER'));assert(!sends[0].text.includes(b.nama));
 await C.deliver(app,h);assert.equal(sends.length,1);
 day='2026-11-30';await C.enqueue(pool,packs);await C.enqueue(pool,packs);assert.equal((await pool.query('SELECT * FROM brtm_email_invoice_jobs')).rows.length,2);
 // End-month queue must not spill over to December 1.
 day='2026-12-01';await C.deliver(app,h);assert.equal(sends.length,1);
 assert.equal(P.eligible(packs[1]),false);assert.throws(()=>P.assertReminder(packs[1]),/hari terakhir/);
 // Settling before dispatch cancels the email even at the next month end.
 packs[1].status='Lunas';await saveRaw();day='2026-12-31';await C.deliver(app,h);assert.equal(sends.length,1);assert.equal((await pool.query('SELECT status FROM brtm_email_invoice_jobs WHERE payment_id=$1',[packs[1].id])).rows[0].status,'cancelled');
 assert.equal((await pool.query('SELECT enabled FROM brtm_wa_invoice_config')).rows[0].enabled,false);
 // Pending push is revalidated against current payment, including a paid end-month bill.
 const notice=(await pool.query('SELECT * FROM brtm_billing_notices WHERE athlete_id=$1',[b.id])).rows[0];
 assert.equal(await P.notificationAllowed(pool,{athlete_id:b.id,event_key:'invoice:'+notice.id}),false);
 packs[1].status='Belum Lunas';await saveRaw();day='2027-01-01';assert.equal(await P.notificationAllowed(pool,{athlete_id:b.id,event_key:'invoice:'+notice.id}),false);
 day='2027-01-31';assert.equal(await P.notificationAllowed(pool,{athlete_id:b.id,event_key:'invoice:'+notice.id}),true);
 // Early payment and no attendance/no bill never become eligible.
 for(const date of ['2026-11-30','2026-12-31','2027-01-31','2028-02-29']){assert(P.endOfMonth(packs[1],date));assert(!P.eligible({...packs[1],status:'Lunas'},date));assert(!P.eligible({...packs[1],sppTidakDitagih:true},date));}
 assert(!P.endOfMonth(packs[1],'2028-02-28'));
 // A network timeout is uncertain and never retried automatically.
 const c=await create('atlet',{nama:'Timeout Child',kelompok:'Group Class',status:'Aktif',emailOrtu:'timeout@example.com'});
 const timeout=await create('pembayaran',{atletId:c.id,tanggal:day,status:'Belum Lunas'});packs.push(timeout);await C.enqueue(pool,packs);
 let attempts=0;app.locals.billingEmailFetch=async()=>{attempts++;throw Error('timeout');};await C.deliver(app,h);await C.deliver(app,h);assert.equal(attempts,1);assert.equal((await pool.query('SELECT status FROM brtm_email_invoice_jobs WHERE payment_id=$1',[timeout.id])).rows[0].status,'unknown');
 delete process.env.RESEND_API_KEY;
 Object.assign(process.env,{BRTM_SMTP_HOST:'smtp.example.com',BRTM_SMTP_PORT:'465',BRTM_SMTP_USER:'billing@example.com',BRTM_SMTP_PASSWORD:'fake-test-only'});
 let smtpMessage;app.locals.billingSmtpSend=async m=>{smtpMessage=m;return {messageId:'smtp-test',accepted:m.to};};
 const transport=require('./billing-email');assert.equal(transport.mode(),'smtp');
 const result=await transport.send(app,{from:'billing@example.com',to:['guardian@example.com'],subject:'Invoice',text:'Invoice',attachments:[]},'test-id');assert.equal(result.status,'accepted');assert.deepEqual(smtpMessage.to,['guardian@example.com']);
 app.locals.billingSmtpSend=async()=>({messageId:'rejected',accepted:[]});assert.equal((await transport.send(app,{to:['guardian@example.com']},'reject')).status,'failed');
 for(const k of ['BRTM_EMAIL_FROM','BRTM_SMTP_HOST','BRTM_SMTP_PORT','BRTM_SMTP_USER','BRTM_SMTP_PASSWORD'])delete process.env[k];
 const E=require('./registration-email');assert.equal(transport.from(),'barathrumaquaticswimmingclub@gmail.com');
 assert.equal(E.extract({'Email Address':'parent@example.com'}),'parent@example.com');assert.equal(E.extract({emailOrtu:'one@example.com',respondentEmail:'other@example.com'}),'');assert.equal(E.extract({nama:'parent@example.com'}),'');
 const imported=await create('atlet',{nama:'Linked Email Import',kelompok:'Group Class',status:'Aktif'}),conflict=await create('atlet',{nama:'Conflicting Email Import',kelompok:'Group Class',status:'Aktif'});
 for(const [athlete,email,key] of [[imported.id,'import@example.com','import'],[conflict.id,'one@example.com','conflict1'],[conflict.id,'two@example.com','conflict2'],[a.id,'replace@example.com','preserve']])await pool.query("INSERT INTO brtm_registrations(kind,response_id,payload,status,athlete_id) VALUES('nonprestasi',$1,$2,'Tersambung',$3)",[key,JSON.stringify({emailAddress:email}),athlete]);
 const sync=await E.sync(pool);assert.equal(sync.filled,1);assert.equal(sync.conflicts,1);assert.equal((await pool.query('SELECT data FROM data_klub WHERE id=$1',[imported.id])).rows[0].data.emailOrtu,'import@example.com');assert.equal((await pool.query('SELECT data FROM data_klub WHERE id=$1',[a.id])).rows[0].data.emailOrtu,'guardian@example.com');assert.equal((await E.sync(pool)).filled,0);
 assert.equal((await pool.query("SELECT * FROM brtm_audit WHERE action='sinkron-email-pendaftaran'")).rows.length,1);
 await db.close();console.log('PASS billing channels: privacy, email/PDF, deduplication, missing configuration, month-end only, paid cancellation, push revalidation, leap year, manual WA and uncertain delivery.');
})().catch(e=>{console.error(e);process.exit(1);});
