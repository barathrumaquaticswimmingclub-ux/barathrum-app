'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),crypto=require('crypto');
const {PGlite}=require('@electric-sql/pglite'),request=require('supertest'),{JSDOM,VirtualConsole}=require('jsdom');
const B=require('./business'),N=require('./notifications'),{initDb,createApp,passwordHash}=require('./server');
(async()=>{
 B.today=()=> '2026-11-28';B.time=()=> '07:00:00';
 const db=new PGlite(),pool={async query(sql,p){const r=await db.query(sql,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};
 await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 await pool.query("INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES('owner','Owner','owner',$1,FALSE)",[await passwordHash('family-test')]);
 for(const name of ['Fauzan','Ilyas'])await pool.query("INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES($1,$1,'coach',$2,FALSE)",[name,await passwordHash('family-test')]);
 const app=createApp({pool,secureCookies:false}),owner=request.agent(app),parent=request.agent(app),stranger=request.agent(app);let checks=0;
 async function call(a,m,url,data,code=200){const r=await a[m](url).set('X-BRTM-Request','1').send(data);assert.equal(r.status,code,url+' '+JSON.stringify(r.body));checks++;return r.body;}
 await call(owner,'post','/auth/login',{username:'owner',password:'family-test'});
 async function create(n,p,kelas='Private Class'){return (await call(owner,'post','/api/atlet',{nama:n,namaPanggilan:n.split(' ')[0],noHpOrtu:p,emailOrtu:'family@example.com',kelompok:kelas,status:'Aktif'},201)).data;}
 const a=await create('Kakak Keluarga','081234567890'),b=await create('Adik Keluarga','6281234567890','Regular Class (1x Seminggu)'),c=await create('Anak Lain','089876543210'),d=await create('Saudara Manual','087777777777');
 await call(owner,'post','/api/orangtua/siapkan');
 for(const [agent,username] of [[parent,a.nama],[stranger,c.nama]])await call(agent,'post','/swim/api/login',{username,password:'brtm'});
 await call(request(app),'post','/swim/api/children',{nama:b.nama},401);
 await call(parent,'get','/swim/api/dashboard?child='+b.id,undefined,403);
 const rejection=await call(parent,'post','/swim/api/children',{nama:c.nama},409);
 assert(!JSON.stringify(rejection).includes(c.noHpOrtu));
 await call(parent,'post','/swim/api/children',{nama:'Tidak Terdaftar'},409);
 await call(parent,'post','/swim/api/children',{nama:'  ADIK   KELUARGA '});
 await call(parent,'post','/swim/api/children',{nama:b.nama});
 assert.equal((await call(parent,'get','/swim/api/children')).length,2);
 assert.equal((await call(stranger,'get','/swim/api/children')).length,1);
 const bill=(await call(owner,'post','/api/pembayaran',{atletId:b.id,tanggal:B.today(),status:'Lunas'},201)).data;
 const dash=await call(parent,'get','/swim/api/dashboard?child='+b.id);
 assert.equal(dash.profil.id,b.id);assert.equal(dash.latihan.sisaPertemuan,4);assert.equal(dash.familia.length,2);
 assert.equal((await call(parent,'get','/swim/api/dashboard')).profil.id,a.id);
 await call(parent,'put','/swim/api/profile?child='+b.id,{revision:dash.profil.revision,namaPanggilan:'Adik Baru'});
 assert.equal((await call(parent,'get','/swim/api/dashboard?child='+b.id)).profil.namaPanggilan,'Adik Baru');
 assert.equal((await call(parent,'get','/swim/api/dashboard')).profil.namaPanggilan,'Kakak');
 await call(parent,'post','/swim/api/regular?child='+b.id,{mulai:'08:00'});
 assert.equal((await call(parent,'get','/swim/api/dashboard?child='+b.id)).jadwal[0].mulai,'08:00');
 assert.equal((await call(parent,'get','/swim/api/dashboard')).jadwal.length,0);
 await call(stranger,'post','/swim/api/regular?child='+b.id,{mulai:'08:00'},403);
 await call(parent,'post','/swim/api/regular?child='+b.id,{batal:true});
 await call(parent,'post','/api/owner/family/'+a.id,{atletId:c.id},401);

 await call(parent,'get','/swim/api/documents/invoice/'+bill.id,undefined,404);
 await call(parent,'get','/swim/api/documents/invoice/'+bill.id+'?child='+b.id);
 await call(stranger,'get','/swim/api/documents/invoice/'+bill.id+'?child='+b.id,undefined,403);
 // Changing the visible contact must not authorize a new family link.
 await pool.query("UPDATE data_klub SET data=jsonb_set(data,'{noHpOrtu}',$1) WHERE id=$2",[JSON.stringify(c.noHpOrtu),a.id]);
 await call(parent,'post','/swim/api/children',{nama:c.nama},409);
 // Owner can help with differing registered contacts and revoke without deleting data.
 await call(owner,'post','/api/owner/family/'+a.id,{atletId:d.id});
 assert.equal((await call(parent,'get','/swim/api/children')).length,3);
 await call(owner,'post','/api/owner/family/'+a.id,{atletId:d.id,lepas:true});
 await call(parent,'get','/swim/api/dashboard?child='+d.id,undefined,403);
 await call(owner,'put','/api/atlet/'+d.id,{...d,noHpOrtu:a.noHpOrtu});
 await call(parent,'post','/swim/api/children',{nama:d.nama});
 await call(parent,'delete','/swim/api/children/'+d.id);
 // A push subscription belongs to the login account and receives both children.
 const sub={endpoint:'https://fcm.googleapis.com/family-test',keys:{auth:'a'.repeat(22),p256dh:'b'.repeat(87)}};
 await call(parent,'post','/swim/api/push/subscribe?child='+b.id,{subscription:sub});
 const root=(await pool.query('SELECT id FROM brtm_parents WHERE athlete_id=$1',[a.id])).rows[0];
 assert.equal((await pool.query('SELECT parent_id FROM brtm_push_subscriptions')).rows[0].parent_id,root.id);
 await N.enqueue(pool,b.id,'family-test','Kabar adik','Isi privat');let pushes=[];
 await N.deliver(pool,async(s,p)=>pushes.push(JSON.parse(p)));
 assert(pushes.some(p=>p.child===b.id&&p.body.includes(b.nama)));assert(pushes.every(p=>!p.body.includes('Isi privat')));
 // Revoked target accounts cannot be accessed through a family link.
 await pool.query('UPDATE brtm_parents SET active=FALSE WHERE athlete_id=$1',[b.id]);
 await call(parent,'get','/swim/api/dashboard?child='+b.id,undefined,403);
 assert(!(await call(parent,'get','/swim/api/children')).some(x=>x.id===b.id));
 await pool.query('UPDATE brtm_parents SET active=TRUE WHERE athlete_id=$1',[b.id]);
 // Same-name records require Owner help, even if their contacts match.
 await pool.query("INSERT INTO data_klub(jenis,data) VALUES('atlet',$1)",[JSON.stringify({...b,id:undefined,noHpOrtu:'081234567890'})]);
 await call(parent,'post','/swim/api/children',{nama:b.nama},409);
 // DOM runs against the real authenticated API.
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/navigation|scrollTo/.test(e.message))errors.push(e.message);});
 const dom=new JSDOM(fs.readFileSync('public/swim/index.html','utf8').replace(/<script[^>]*src[^>]*><\/script>/g,''),{url:'https://brtm.test/swim/',runScripts:'outside-only',virtualConsole:vc}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.matchMedia=()=>({matches:false});w.crypto.randomUUID=crypto.randomUUID;
 w.fetch=async(url,o={})=>{const r=await parent[(o.method||'GET').toLowerCase()](url).set('X-BRTM-Request','1').send(o.body?JSON.parse(o.body):undefined);return {ok:r.status<400,status:r.status,json:async()=>r.body};};
 w.eval(['progression.js','swim/swim.js','swim/feedback.js','swim/inbox.js','swim/portal.js','swim/family.js'].map(p=>fs.readFileSync('public/'+p,'utf8')).join('\n')+'\nwindow.familyTestState=()=>({profile:parentSnapshot?.profil.id,notifications:inboxNotifications});');
 await new Promise(r=>setTimeout(r,1000));
 assert(w.document.querySelector('[data-family-child="'+a.id+'"]'));
 await w.eval('selectFamilyChild('+JSON.stringify(b.id)+')');
 assert.equal(w.familyTestState().profile,b.id);assert(w.document.querySelector('[data-family-child="'+b.id+'"][aria-pressed="true"]'));
 w.document.querySelector('[data-portal-tab=payments]').click();await new Promise(r=>setTimeout(r,20));
 assert(w.document.querySelector('a[href="/swim/api/statement?child='+b.id+'"]'));
 assert(w.document.querySelector('a[href="/swim/api/documents/invoice/'+bill.id+'?child='+b.id+'"]'));
 await w.eval('selectFamilyChild('+JSON.stringify(a.id)+')');assert.equal(w.familyTestState().profile,a.id);
 assert.equal(w.familyTestState().notifications.some(n=>n.event_key==='family-test'),false);
 w.document.getElementById('familyAdd').click();assert(w.document.getElementById('familyForm').closest('dialog').open);
 assert.equal(w.document.querySelectorAll('#familyForm input').length,1);
 w.document.getElementById('familyCancel').click();assert.deepEqual(errors,[]);
 dom.window.close();
 await N.enqueue(pool,b.id,'family-revoked','Kabar','Privat');await call(parent,'delete','/swim/api/children/'+b.id);
 pushes=[];await N.deliver(pool,async(s,p)=>pushes.push(JSON.parse(p)));assert.equal(pushes.length,0);
 await call(parent,'get','/swim/api/dashboard?child='+b.id,undefined,403);
 assert.equal((await call(owner,'get','/api/backup')).tables.brtm_parent_children.length,0);
 await db.close();console.log('PASS '+checks+' family checks: name-only linking, frozen contacts, Owner help, scoped dashboards/documents, revocation, push delivery and DOM child switching.');
})().catch(e=>{console.error(e);process.exit(1);});
