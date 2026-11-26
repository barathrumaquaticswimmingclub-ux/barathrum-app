'use strict';
const assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),request=require('supertest'),{initDb,createApp}=require('./server');
(async()=>{const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};await initDb(pool);const app=createApp({pool,secureCookies:false}),r=request(app);let calls=0;app.locals.whatsappFetch=async()=>{calls++;throw Error('must not call Meta');};
for(const path of ['/api/owner/whatsapp/invoices'])assert.equal((await r.get(path)).status,410);
for(const path of ['/api/owner/whatsapp/invoices/enable'])assert.equal((await r.post(path).set('X-BRTM-Request','1').send({})).status,410,path);
assert.equal((await r.get('/api/owner/whatsapp/connection')).status,401);
assert.equal((await r.get('/api/owner/whatsapp/confirmations')).status,401);
assert.equal((await r.get('/integrations/whatsapp')).status,503);
await app.locals.deliverWhatsAppInvoices();await require('./whatsapp-invoices').deliver(app,{pool});assert.equal(calls,0);assert.equal((await pool.query('SELECT enabled FROM brtm_wa_invoice_config')).rows[0].enabled,false);await db.close();console.log('PASS incoming WhatsApp retained, Owner authorization enforced; outgoing invoice routes and workers disabled without network calls.');})().catch(e=>{console.error(e);process.exit(1);});
