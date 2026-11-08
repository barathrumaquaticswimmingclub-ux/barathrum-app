'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('./server');
async function main() {
  const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));
  assert.equal(manifest.display,'standalone'); assert.equal(manifest.scope,'/club/'); assert.equal(manifest.id,'/');
  for (const size of [192,512]) assert(manifest.icons.some(i => i.sizes===`${size}x${size}` && i.purpose==='any'));
  assert(manifest.icons.some(i => i.purpose==='maskable'));
  for (const icon of manifest.icons) {
    const png = fs.readFileSync('public'+icon.src);
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(icon.sizes,`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
  }
  const app=createApp({pool:{},setupHash:'unused',secureCookies:false});
  const web=await request(app).get('/manifest.webmanifest');assert.equal(web.status,200);assert.match(web.headers['content-type'],/manifest\+json/);
  const sw=await request(app).get('/sw.js');assert.equal(sw.status,200);assert.match(sw.headers['content-security-policy'],/worker-src 'self'/);
  const html=await request(app).get('/');assert.equal(html.status,200);assert.match(html.text,/rel="manifest"/);assert.match(html.text,/id="installButton"/);
  const handlers={},removed=[],stored=[];
  const context={URL,Promise,fetch:async()=>{throw Error('offline')},caches:{open:async()=>({addAll:async list=>stored.push(...list)}),keys:async()=>['brtm-offline-v0','other-app-cache'],delete:async key=>removed.push(key),match:async key=>key==='/offline.html'?'offline page':'public asset'},self:{location:{origin:'https://brtm.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('public/sw.js','utf8'),context);
  let done;handlers.install({waitUntil:p=>done=p});await done;
  assert(stored.includes('/offline.html'));assert(stored.every(p=>!/^\/(api|auth)/.test(p)));assert(!stored.includes('/'));
  handlers.activate({waitUntil:p=>done=p});await done;assert.deepEqual(removed,['brtm-offline-v0']);
  const dispatch=async(path,method='GET',mode='cors',origin='https://brtm.test')=>{let intercepted=false,result;handlers.fetch({request:{url:origin+path,method,mode},respondWith:p=>{intercepted=true;result=p}});return {intercepted,result:await result};};
  for(const path of ['/api/atlet','/api/pembayaran','/api/backup','/auth/me','/auth/login'])assert.equal((await dispatch(path,'GET','navigate')).intercepted,false);
  assert.equal((await dispatch('/api/absensi','POST')).intercepted,false);
  assert.equal((await dispatch('/','POST','navigate')).intercepted,false);
  assert.equal((await dispatch('/file','GET','cors','https://other.test')).intercepted,false);
  assert.equal((await dispatch('/','GET','navigate')).result,'offline page');
  assert.equal((await dispatch('/icons/brtm-brand-192.png')).result,'public asset');
  assert.equal((await dispatch('/app.js')).intercepted,false);
  context.fetch=async()=> 'fresh response';assert.equal((await dispatch('/','GET','navigate')).result,'fresh response');
  function installHarness(standalone=false) {
    const events={},clicks={},classes=new Set();let registration;
    const button={disabled:false,classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),add:name=>classes.add(name)},addEventListener:(event,fn)=>clicks[event]=fn};
    const dialog={open:false,showModal(){this.open=true},close(){this.open=false}};
    const nodes={installButton:button,installHelp:dialog,closeInstallHelp:{addEventListener:(event,fn)=>clicks.close=fn}};
    const nav={serviceWorker:{getRegistrations:async()=>[],register:(url,options)=>{registration={url,options};return Promise.resolve()}}};
    const scope={URL,Promise,navigator:nav,window:{navigator:nav,isSecureContext:true,matchMedia:()=>({matches:standalone}),addEventListener:(event,fn)=>events[event]=fn},document:{getElementById:id=>nodes[id]}};
    vm.createContext(scope);vm.runInContext(fs.readFileSync('public/install.js','utf8'),scope);
    return {events,clicks,classes,dialog,get registration(){return registration;}};
  }
  const ui=installHarness();await ui.clicks.click();assert.equal(ui.dialog.open,true);ui.clicks.close();assert.equal(ui.dialog.open,false);
  let prompted=false,prevented=false;ui.events.beforeinstallprompt({preventDefault(){prevented=true},prompt:async()=>{prompted=true},userChoice:Promise.resolve({outcome:'accepted'})});await ui.clicks.click();assert(prompted&&prevented);assert(ui.classes.has('hidden'));
  await new Promise(r=>setImmediate(r));assert.equal(ui.registration.url,'/club/sw.js');assert.equal(ui.registration.options.updateViaCache,'none');assert(installHarness(true).classes.has('hidden'));
  console.log('PASS: install manifest and PNG sizes; public asset delivery/CSP; offline fallback; API, auth, POST and cross-origin requests never intercepted; cache isolation; install prompt and fallback guide; installed-mode button hidden.');
}
main().catch(error=>{console.error(error);process.exit(1)});
