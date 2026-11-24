'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 for(const mode of ['normal','unsupported','push-error','push-pending','network-error','timeout']){
  const dom=new JSDOM(fs.readFileSync('public/swim/index.html','utf8'),{url:'https://brtm.test/swim/',runScripts:'outside-only'}),w=dom.window,run=code=>vm.runInContext(code,dom.getInternalVMContext());
  w.fetch=()=>new Promise(()=>{});w.setInterval=()=>0;w.AbortController=AbortController;
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  run(fs.readFileSync('public/swim/swim.js','utf8'));
  let pushUnsubscribed=false,calls=[],releaseLogout,signal;
  const sub={endpoint:'test',unsubscribe:async()=>{pushUnsubscribed=true;if(mode==='push-error')throw Error('push');}};
  Object.defineProperty(w.navigator,'serviceWorker',{value:{getRegistration:async()=>mode==='push-pending'?new Promise(()=>{}):mode==='unsupported'?{}:{pushManager:{getSubscription:async()=>sub}}}});
  w.testRequest=(url,body,method,s)=>{calls.push(url);signal=s;if(mode==='network-error')return Promise.reject(Error('offline'));return new Promise(resolve=>{releaseLogout=resolve;});};
  if(mode==='timeout')w.setTimeout=fn=>setTimeout(fn,5);
  run("request=testRequest;swimRefreshSequence++;$('login').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;");
  const oldVersion=run('swimViewVersion'),first=w.document.getElementById('logout').onclick();
  await w.document.getElementById('logout').onclick();
  assert.deepEqual(calls,['logout'],'Only one logout request, without push dependency');
  assert(run('swimViewVersion')>oldVersion,'Old dashboard responses must be invalidated');
  if(!['network-error','timeout'].includes(mode)){assert(w.document.getElementById('logout').disabled);releaseLogout({ok:true});}
  await first;await new Promise(r=>setTimeout(r,10));
  assert.equal(w.document.getElementById('logout').disabled,false);
  if(['network-error','timeout'].includes(mode)){
   assert.equal(w.document.getElementById('dashboard').hidden,false,'Do not claim successful logout without server confirmation');
   assert.match(w.document.getElementById('statusMessage').textContent,/tekan Keluar lagi/);
   if(mode==='timeout')assert(signal.aborted,'Timed out request must be aborted');
  }else{
   assert.equal(w.document.getElementById('login').hidden,false);
   assert.equal(w.document.getElementById('dashboard').hidden,true);
   if(['normal','push-error'].includes(mode))assert(pushUnsubscribed);
  }
  dom.window.close();console.log('PASS logout '+mode);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
