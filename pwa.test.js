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
  assert.equal((await dispatch('/icons/brtm-staff-20261114-192.png')).result,'public asset');
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
  // A public installation URL uses the same app identity and supports both phone guides.
  const installPage=await request(app).get('/swim/install/');assert.equal(installPage.status,200);assert.match(installPage.text,/Android & iPhone/);assert.match(installPage.text,/apple-touch-icon/);assert.match(installPage.text,/href="\/swim\/manifest.webmanifest"/);assert(!installPage.text.includes('loginForm'));
  assert.equal((await request(app).get('/swim/install/install.css')).status,200);assert.equal((await request(app).get('/swim/install-support.js')).status,200);
  const parentHtml=await request(app).get('/swim/');assert.match(parentHtml.text,/apple-mobile-web-app-capable/);assert.match(parentHtml.text,/install-support.js/);
  const swimManifest=JSON.parse(fs.readFileSync('public/swim/manifest.webmanifest','utf8'));assert.equal(swimManifest.id,'/swim/');assert.equal(swimManifest.start_url,'/swim/');
  const staffInstallPage=await request(app).get('/club/install/');assert.equal(staffInstallPage.status,200);assert.match(staffInstallPage.text,/Owner, Coach, atau Prestasi/);assert.match(staffInstallPage.text,/href="\/manifest.webmanifest"/);assert.match(staffInstallPage.text,/brtm-staff-20261114-192.png/);assert(!staffInstallPage.text.includes('loginForm'));assert(!staffInstallPage.text.includes('BRTM SWIM'));assert.match(html.text,/apple-touch-icon/);assert.match(html.text,/iPhone · Safari/);
  const {JSDOM}=require('jsdom');
  function phoneHarness({ios=false,ipad=false,standalone=false,main=false,staff=false}={}){
    const html=staff?staffInstallPage.text:main?parentHtml.text:installPage.text,dom=new JSDOM(html,{runScripts:'outside-only',url:'https://brtm.test/swim/install/'}),w=dom.window;
    Object.defineProperty(w.navigator,'userAgent',{value:ios?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'});
    if(ipad){Object.defineProperty(w.navigator,'platform',{value:'MacIntel'});Object.defineProperty(w.navigator,'maxTouchPoints',{value:5});}
    w.matchMedia=()=>({matches:standalone});Object.defineProperty(w,'isSecureContext',{value:true});let registration;
    Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async(url,options)=>{registration={url,options};}}});
    const dialog=w.document.getElementById('installHelp');if(dialog){dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;}
    w.eval(fs.readFileSync('public/swim/install-support.js','utf8'));
    return {w,dom,button:w.document.getElementById('install'),status:w.document.getElementById('installStatus'),registration:()=>registration};
  }
  const android=phoneHarness();assert(!android.w.document.getElementById('androidHelp').hidden);assert(android.w.document.getElementById('iosHelp').hidden);assert.equal(android.registration().url,'/swim/sw.js');assert.equal(android.registration().options.scope,'/swim/');
  let prompts=0;const event=new android.w.Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>prompts++;event.userChoice=Promise.resolve({outcome:'dismissed'});android.w.dispatchEvent(event);assert.equal(prompts,0);assert(event.defaultPrevented);
  android.button.click();await new Promise(r=>setImmediate(r));assert.equal(prompts,1);assert.match(android.status.textContent,/dibatalkan/);assert(!android.button.disabled);
  android.button.click();assert.equal(prompts,1);assert.match(android.status.textContent,/Chrome/);
  const accepted=new android.w.Event('beforeinstallprompt',{cancelable:true});accepted.prompt=async()=>prompts++;accepted.userChoice=Promise.resolve({outcome:'accepted'});android.w.dispatchEvent(accepted);android.button.click();await new Promise(r=>setImmediate(r));assert.match(android.status.textContent,/disetujui/);
  android.w.dispatchEvent(new android.w.Event('appinstalled'));assert(android.button.hidden);assert(android.w.document.getElementById('installGuide').hidden);
  const iphone=phoneHarness({ios:true});assert(iphone.w.document.getElementById('androidHelp').hidden);assert(!iphone.w.document.getElementById('iosHelp').hidden);iphone.button.click();assert.match(iphone.status.textContent,/Safari.*Bagikan/);
  const ipad=phoneHarness({ipad:true});assert(!ipad.w.document.getElementById('iosHelp').hidden);
  const opened=phoneHarness({standalone:true});assert(opened.button.hidden);assert(opened.w.document.getElementById('installGuide').hidden);
  const mainPhone=phoneHarness({ios:true,main:true});mainPhone.button.click();assert(mainPhone.w.document.getElementById('installHelp').open);mainPhone.w.document.getElementById('closeInstallHelp').click();assert(!mainPhone.w.document.getElementById('installHelp').open);
  mainPhone.w.document.querySelector('[data-install-platform="android"]').click();assert(!mainPhone.w.document.getElementById('androidHelp').hidden);
  const failed=new mainPhone.w.Event('beforeinstallprompt',{cancelable:true});failed.prompt=async()=>{throw Error('not supported');};mainPhone.w.dispatchEvent(failed);mainPhone.button.click();await new Promise(r=>setImmediate(r));assert(mainPhone.w.document.getElementById('installHelp').open);assert(!mainPhone.button.disabled);
  const staffAndroid=phoneHarness({staff:true});assert.equal(staffAndroid.button.textContent,'Pasang BRTM');assert.equal(staffAndroid.registration().url,'/club/sw.js');assert.equal(staffAndroid.registration().options.scope,'/club/');
  let staffPrompts=0;const staffEvent=new staffAndroid.w.Event('beforeinstallprompt',{cancelable:true});staffEvent.prompt=async()=>staffPrompts++;staffEvent.userChoice=Promise.resolve({outcome:'accepted'});staffAndroid.w.dispatchEvent(staffEvent);assert.equal(staffPrompts,0);staffAndroid.button.click();await new Promise(r=>setImmediate(r));assert.equal(staffPrompts,1);assert.match(staffAndroid.status.textContent,/ikon BRTM setelah/);assert(!staffAndroid.status.textContent.includes('SWIM'));
  const staffIphone=phoneHarness({staff:true,ios:true});staffIphone.button.click();assert.match(staffIphone.status.textContent,/Safari.*Bagikan/);assert(!staffIphone.w.document.getElementById('iosHelp').hidden);assert.equal(staffIphone.registration().options.scope,'/club/');
  staffAndroid.w.dispatchEvent(new staffAndroid.w.Event('appinstalled'));assert(staffAndroid.button.hidden);assert.equal(staffAndroid.status.textContent,'BRTM siap dibuka dari ikon aplikasi Anda.');
  assert.equal(android.registration().options.scope,'/swim/');
  staffAndroid.dom.window.close();staffIphone.dom.window.close();
  for(const h of [android,iphone,ipad,opened,mainPhone])h.dom.window.close();
  console.log('PASS: separate BRTM and SWIM install links/icons/scopes, staff Android/iPhone flows, public SWIM install link, Android prompts/cancellation/errors, iPhone/iPad guides and shared app identity; install manifest and PNG sizes; public asset delivery/CSP; offline fallback; API, auth, POST and cross-origin requests never intercepted; cache isolation; install prompt and fallback guide; installed-mode button hidden.');
}
main().catch(error=>{console.error(error);process.exit(1)});
