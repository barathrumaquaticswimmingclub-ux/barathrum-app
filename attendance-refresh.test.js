'use strict';
const fs=require('node:fs'),{JSDOM}=require('jsdom'),vm=require('node:vm');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://brtm.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,run=code=>vm.runInContext(code,dom.getInternalVMContext());
 w.fetch=()=>new Promise(()=>{});w.setInterval=()=>0;w.scrollTo=({left,top})=>{w.scrollX=left;w.scrollY=top;};
 for(const file of ['app','intake','prestasi-ui','operations-ui','community-ui','spp-ui','owner-tables','coach-ui'])run(fs.readFileSync('public/'+file+'.js','utf8'));
 await run(`(async()=>{
 S.user={id:'1',role:'owner'};S.config={today:'2026-11-16'};S.syncedDay=S.config.today;
 let requests=0,rendered=0;
 request=async url=>{requests++;return url==='/api/config'?S.config:[];};
 renderCurrent=()=>{rendered++;$('records').innerHTML='<div class="ops-scroll"><table><tr><td>Updated</td></tr></table></div>';window.scrollY=0;};
 S.section='absensi';$('records').innerHTML='<div class="ops-scroll">Original attendance</div>';
 const original=$('records').firstChild;
 await refreshInBackground();
 if(requests||$('records').firstChild!==original)throw Error('Attendance must not refresh on timer');
 S.section='dashboard';
 const dialog=$('editor');dialog.setAttribute('open','');await refreshInBackground();
 if(requests)throw Error('Open form must pause refresh');dialog.removeAttribute('open');
 window.scrollY=850;$('records').firstChild.scrollLeft=180;
 await refreshInBackground();
 if(rendered!==1||window.scrollY!==850||$('records').firstChild.scrollLeft!==180)throw Error('Background refresh lost scroll');
 })()`);
 // Fresh deferred response for testing base loader against mid-flight form/navigation changes.
 for(const action of ["S.section='absensi'", "$('editor').setAttribute('open','')"]){
  await run(`(async()=>{
   $('editor').removeAttribute('open');S.section='dashboard';
   let resolveResponse;const response=new Promise(resolve=>resolveResponse=resolve);
   request=()=>response;
   const before=$('records').firstChild;
   const pending=dataLoad({background:true});
   ${action};resolveResponse([]);await pending;
   if($('records').firstChild!==before)throw Error('In-flight refresh replaced active work');
  })()`);
 }
 await run(`(async()=>{
 $('editor').removeAttribute('open');S.section='absensi';
 request=async url=>url==='/api/config'?S.config:[];
 window.scrollY=970;$('records').firstChild.scrollLeft=140;
 for(const role of ['owner','coach','prestasi']){
 S.user.role=role;await load();
 if(window.scrollY!==970||$('records').firstChild.scrollLeft!==140)throw Error('Save/manual refresh lost position for '+role);
 }
 })()`);
 dom.window.close();console.log('PASS attendance refresh: timer pause, open forms, in-flight navigation/forms, vertical and horizontal scroll, manual refresh through Coach/Owner wrappers.');
})().catch(e=>{console.error(e);process.exitCode=1;});
