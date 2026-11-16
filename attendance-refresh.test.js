'use strict';
const fs=require('node:fs'),{JSDOM}=require('jsdom'),vm=require('node:vm');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://brtm.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,run=code=>vm.runInContext(code,dom.getInternalVMContext());
 w.fetch=()=>new Promise(()=>{});w.setInterval=()=>0;w.scrollTo=({left=0,top=0})=>{w.scrollX=left;w.scrollY=top;};
 for(const file of ['app','intake','prestasi-ui','operations-ui','community-ui','spp-ui','owner-tables','coach-ui'])run(fs.readFileSync('public/'+file+'.js','utf8'));
 await run(`(async()=>{
 S.user={id:'1',role:'owner'};S.config={today:'2026-11-16',classes:{}};S.syncedDay=S.config.today;
 const realRender=renderCurrent;let rendered=0;
 renderCurrent=()=>{rendered++;};
 request=async url=>url==='/api/config'?S.config:url==='/api/owner/workspace'?{staff:[],slots:[]}:url==='/api/owner/receipts'?{ranges:[],receipts:[]}:[];
 const menus=menuKeys();
 for(const menu of menus){
  S.section=menu;S.records={atlet:[{id:'old',nama:'Old record'}]};
  $('records').innerHTML='<details open data-view-key="coach"><summary>Coach</summary><div class="ops-scroll"><input id="draft" value="Isian belum disimpan"></div></details>';
  const before=$('records').firstChild,input=$('draft');input.focus();$('search').value='Adhi';$('filter').innerHTML='<option selected>Aktif</option>';$('monthFilter').value='2026-11';
  window.scrollY=850;before.querySelector('.ops-scroll').scrollLeft=180;
  await refreshInBackground();
  if(rendered||$('records').firstChild!==before||!before.open||document.activeElement!==input||input.value!=='Isian belum disimpan'||window.scrollY!==850||before.querySelector('.ops-scroll').scrollLeft!==180)throw Error('Timer disturbed '+menu);
  if(S.records.atlet[0].id!=='old'||!S.pendingSnapshot||$('refreshButton').dataset.available!=='true')throw Error('Background snapshot was not deferred for '+menu);
  if($('search').value!=='Adhi'||$('filter').value!=='Aktif'||$('monthFilter').value!=='2026-11')throw Error('Filter was reset for '+menu);
 }
 // The timer also protects Coach and Prestasi pages, not just Owner tables.
 for(const role of ['coach','prestasi']){S.user.role=role;for(const menu of menuKeys()){S.section=menu;const node=$('records').firstChild;await refreshInBackground();if($('records').firstChild!==node||rendered)throw Error('Role page changed: '+role+'/'+menu);}}
 S.user.role='owner';
 // A response that started before a save/manual reload cannot overwrite newer data.
 let release;const blocked=new Promise(resolve=>release=resolve);let block=true;
 request=async url=>url==='/api/config'?(block?blocked:S.config):url==='/api/atlet'?[{id:'new',nama:'New record'}]:[];
 const old=load({background:true});block=false;await load();release(S.config);await old;
 if(S.records.atlet[0].id!=='new'||S.pendingSnapshot)throw Error('Late background response overwrote newer state');
 // Opening a dialog after a request starts must leave its draft and focus intact.
 let finish;const delayed=new Promise(resolve=>finish=resolve);
 request=async url=>url==='/api/config'?delayed:[];
 const pending=load({background:true});$('editor').setAttribute('open','');$('formFields').innerHTML='<input id="noteDraft" value="Keep this note">';$('noteDraft').focus();finish(S.config);await pending;
 if($('noteDraft').value!=='Keep this note'||document.activeElement!==$('noteDraft'))throw Error('In-flight refresh disturbed editor');
 $('editor').removeAttribute('open');
 // Exercise the actual schedule renderer: manual reload used to close these details.
 S.section='jadwal';S.records={atlet:[],jadwal:[]};S.workspace={staff:[{id:2,nama:'Coach Adhi'}],slots:[{id:1,place:'Hotel Grand Wahid',coach_id:2,weekday:1,start_time:'15:00',end_time:'16:00',athlete_ids:[],class_name:'Private Class'}]};
 renderCurrent=realRender;renderCurrent();const details=$('records').querySelector('details');details.open=true;details.querySelector('.ops-scroll').scrollLeft=140;window.scrollY=970;
 request=async url=>url==='/api/config'?S.config:url==='/api/owner/workspace'?S.workspace:url==='/api/owner/receipts'?{ranges:[],receipts:[]}:[];
 await load();
 if(!$('records').querySelector('details').open||window.scrollY!==970||$('records').querySelector('details .ops-scroll').scrollLeft!==140)throw Error('Manual schedule refresh lost expanded details or scroll');
 if($('refreshButton').dataset.available!=='false')throw Error('Manual refresh did not clear update indicator');
 })()`);
 dom.window.close();console.log('PASS all-menu refresh: timer preserves DOM/focus/drafts/filters/scroll for Owner, Coach and Prestasi; staged data, stale-response protection and actual expanded schedule restoration.');
})().catch(e=>{console.error(e);process.exitCode=1;});
