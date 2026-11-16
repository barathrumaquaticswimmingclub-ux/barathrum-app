'use strict';
const assert=require('node:assert/strict'),request=require('supertest'),fs=require('fs'),{JSDOM}=require('jsdom');
const {createApp}=require('./server'),R=require('./releases');
(async()=>{
 let checks=0;const real=R.metadata();assert.match(real.id,/^[a-f0-9]{20}$/);assert.equal(R.metadata().id,real.id);
 const app=createApp({pool:{query:async()=>({rows:[],rowCount:0})},secureCookies:false,enforceRelease:true});const anon=request(app);
 for(const route of ['/','/club/','/swim/','/index.html','/swim/index.html']){const r=await anon.get(route);assert.equal(r.status,200);assert(r.text.includes('content="'+app.locals.release.id+'"'));assert(r.text.indexOf('/release-guard.js')<r.text.indexOf(route.startsWith('/swim')?'/swim/swim.js':'/app.js'));checks++;}
 const meta=(await anon.get('/app-release')).body;assert(!JSON.stringify(meta).includes('password'));assert.equal(meta.id,app.locals.release.id);
 for(const url of ['/api/atlet','/api/pembayaran','/swim/api/dashboard','/auth/me']){assert.equal((await anon.get(url)).status,428);assert.equal((await anon.get(url).set('X-BRTM-Release','outdated')).status,428);assert.equal((await anon.get(url).set('X-BRTM-Release',meta.id)).status,401);checks+=3;}
 assert.equal((await anon.post('/auth/login').set('X-BRTM-Request','1').send({username:'owner',password:'wrong'})).status,428);
 for(const url of ['/api/atlet/1/foto','/api/owner/documents/invoice/1','/swim/api/photo/1','/swim/api/announcements/1/photo','/swim/api/statement'])assert.equal((await anon.get(url)).status,401);
 for(const url of ['/manifest.webmanifest','/swim/manifest.webmanifest']){const r=await anon.get(url);assert.equal(r.status,200);assert(r.body.icons.every(i=>i.src.includes('?v=')));}
 for(const url of ['/club/sw.js','/swim/sw.js']){const r=await anon.get(url);assert(r.text.includes('BRTM_SW_REVISION="'+meta.id+'"'));assert(r.text.includes('BRTM_ICON_192'));new (require('vm').Script)(r.text);checks++;}
 const fixture={id:'current',apps:{staff:{iconRevision:'icon-staff',install:'/club/install/'},swim:{iconRevision:'icon-swim',install:'/swim/install/'}}};
 async function dom({kind='swim',installed=false,offline=false,latest=fixture,seen,apiMismatch=false}={}){
  const d=new JSDOM('<!doctype html><html><head><meta name="brtm-release" content="current"><meta name="brtm-app" content="'+kind+'"></head><body><main id="main">Private app</main></body></html>',{url:'https://brtm.test/'+(kind==='swim'?'swim/':'club/'),runScripts:'outside-only',pretendToBeVisual:true}),w=d.window,calls=[];let fail=offline,release=latest;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.matchMedia=()=>({matches:installed});w.Headers=Headers;w.fetch=async(url,o={})=>{if(String(url).startsWith('/app-release')){if(fail)throw Error('offline');return new Response(JSON.stringify(release),{headers:{'Content-Type':'application/json'}});}calls.push({url:String(url),headers:new Headers(o.headers),body:o.body});return new Response(JSON.stringify(apiMismatch?{code:'BRTM_UPDATE_REQUIRED',releaseId:'next'}:{ok:true}),{status:apiMismatch?428:200,headers:{'Content-Type':'application/json'}});};
  if(seen)w.localStorage.setItem('brtm-icon-revision-'+kind,seen);w.eval(fs.readFileSync('public/release-guard.js','utf8'));await new Promise(r=>setTimeout(r,20));
  return {d,w,calls,setOffline:v=>fail=v,setRelease:v=>release=v};
 }
 for(const kind of ['staff','swim']){
  const t=await dom({kind});assert(!t.w.document.documentElement.classList.contains('brtm-release-locked'));await t.w.fetch('/'+(kind==='swim'?'swim/':'')+'api/test',{method:'POST',headers:{'X-BRTM-Request':'1','Content-Type':'application/json'},body:'{}'});assert.equal(t.calls[0].headers.get('X-BRTM-Release'),'current');assert.equal(t.calls[0].headers.get('X-BRTM-Request'),'1');
  for(const event of ['focus','pageshow','visibilitychange']){const target=event==='visibilitychange'?t.w.document:t.w;target.dispatchEvent(new t.w.Event(event));assert(!t.w.document.documentElement.classList.contains('brtm-release-locked'),'Foreground checks must not open a blocking gate for a ready app');await new Promise(r=>setTimeout(r,20));checks++;}
  t.setOffline(true);t.w.dispatchEvent(new t.w.Event('focus'));await new Promise(r=>setTimeout(r,20));assert(!t.w.document.documentElement.classList.contains('brtm-release-locked'));t.setOffline(false);checks++;
  await t.w.fetch('https://other.test/data');assert.equal(t.calls[1].headers.get('X-BRTM-Release'),null);t.setRelease({...fixture,id:'next'});t.w.document.dispatchEvent(new t.w.Event('visibilitychange'));await new Promise(r=>setTimeout(r,20));assert(t.w.document.body.textContent.includes('Pembaruan aplikasi wajib'));await assert.rejects(()=>t.w.fetch('/api/test',{method:'POST'}));assert.equal(t.calls.length,2);t.d.window.close();checks+=5;
 }
 // A normal foreground return must re-check; offline blocks until a successful retry without sending writes.
 const offline=await dom({offline:true});assert(offline.w.document.body.textContent.includes('Hubungkan ke internet'));await assert.rejects(()=>offline.w.fetch('/api/test',{method:'POST'}));const read=offline.w.fetch('/swim/api/dashboard');assert.equal(offline.calls.length,0);offline.setOffline(false);offline.w.document.querySelector('#brtm-release-gate button').click();await read;assert.equal(offline.calls.length,1);offline.d.window.close();checks+=4;
 for(const kind of ['staff','swim']){const t=await dom({kind,installed:true,seen:'old-icon'});assert(t.w.document.body.textContent.includes('Samakan ikon aplikasi'));assert(t.w.document.body.textContent.includes('tidak dapat memeriksanya otomatis'));const waiting=t.w.fetch('/api/test');assert.equal(t.calls.length,0);t.w.document.querySelector('#brtm-release-gate button').click();await waiting;assert.equal(t.w.localStorage.getItem('brtm-icon-revision-'+kind),fixture.apps[kind].iconRevision);assert(!t.w.document.documentElement.classList.contains('brtm-release-locked'));t.d.window.close();checks+=4;}
 const goodIcon=await dom({installed:true,seen:'icon-swim'});assert(!goodIcon.w.document.documentElement.classList.contains('brtm-release-locked'));goodIcon.d.window.close();
 const changed=await dom({apiMismatch:true});await changed.w.fetch('/api/test');assert(changed.w.document.body.textContent.includes('Pembaruan aplikasi wajib'));changed.d.window.close();
 const {PGlite}=require('@electric-sql/pglite'),{initDb,passwordHash}=require('./server');
 const db=new PGlite(),pool={async query(q,p){const r=await db.query(q,p);return {...r,rowCount:r.affectedRows||r.rows.length};},async connect(){return {query:pool.query,release(){}};}};await initDb(pool);await pool.query('UPDATE brtm_install SET completed=TRUE');
 await pool.query("INSERT INTO brtm_users(username,nama,role,password_hash,must_change) VALUES('owner','Owner','owner',$1,FALSE)",[await passwordHash('release-test-owner')]);
 const state=R.metadata(),live=createApp({pool,secureCookies:false,enforceRelease:true,release:state}),owner=request.agent(live),parent=request.agent(live);let current=state.id;
 async function api(agent,method,url,body,expected=200){const r=await agent[method](url).set('X-BRTM-Release',current).set('X-BRTM-Request','1').send(body);assert.equal(r.status,expected,url+' '+JSON.stringify(r.body));checks++;return r.body;}
 await api(owner,'post','/auth/login',{username:'owner',password:'release-test-owner'});
 const athlete=(await api(owner,'post','/api/atlet',{nama:'Anak Update',kelompok:'Prestasi Class',status:'Aktif'},201)).data;
 await api(owner,'post','/api/orangtua/siapkan',{});await api(parent,'post','/swim/api/login',{username:athlete.nama,password:'brtm'});assert.equal((await api(parent,'get','/swim/api/dashboard')).profil.id,athlete.id);
 state.id='rollout-next';await api(owner,'get','/api/atlet',undefined,428);await api(parent,'get','/swim/api/dashboard',undefined,428);await api(owner,'put','/api/atlet/'+athlete.id,{...athlete,nama:'Must not change'},428);
 current=state.id;assert.equal((await api(owner,'get','/api/atlet'))[0].nama,athlete.nama);assert.equal((await api(parent,'get','/swim/api/dashboard')).profil.id,athlete.id);await db.close();
 console.log('PASS '+checks+' mandatory-update checks: fresh HTML versions, stale API rejection, authenticated downloads intact, icon URL hashing, worker revisions, both apps, foreground checks, offline retry, header forwarding, server mismatch and honest manual launcher-icon confirmation.');
})().catch(e=>{console.error(e);process.exit(1);});
