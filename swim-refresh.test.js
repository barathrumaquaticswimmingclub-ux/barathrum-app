'use strict';
const fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('public/swim/index.html','utf8'),{url:'https://brtm.test/swim/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.fetch=()=>new Promise(()=>{});w.setInterval=()=>0;w.matchMedia=()=>({matches:false});w.scrollTo=({left=0,top=0})=>{w.scrollX=left;w.scrollY=top;};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const run=code=>vm.runInContext(code,dom.getInternalVMContext());
 for(const file of ['progression.js','swim/swim.js','swim/feedback.js','swim/inbox.js','swim/portal.js'])run(fs.readFileSync('public/'+file,'utf8'));
 await run(`(async()=>{
 swimRefreshSequence++;loading=false;
 const data={role:'parent',today:'2026-11-16',updatedAt:'2026-11-16T01:00:00Z',profil:{id:'1',nama:'Atlet',kelompok:'Prestasi Class',status:'Aktif'},latihan:{prestasi:true},pembayaran:{status:'Lunas'},tagihan:[],evaluasi:[],jadwal:[],absensi:[],catatanwaktu:[],riwayatPembayaran:[],viewRefs:[]};
 let next=JSON.parse(JSON.stringify(data));request=async url=>url==='dashboard'?next:url==='notifications'?[]:{};
 await refresh();
 for(const page of ['dashboard','payments','schedule','evaluation','times','notifications']){
  switchParentPage(page);
  $('portalPage').insertAdjacentHTML('beforeend','<details open><summary>Rincian</summary><div class="portal-scroll"><input id="readingDraft" value="Tetap"></div></details>');
  const node=$('portalPage'),draft=$('readingDraft');draft.focus();window.scrollY=720;draft.parentElement.scrollLeft=120;
  next={...data,pembayaran:{status:'Baru'}};await refresh({background:true});
  if($('portalPage')!==node||!draft.closest('details').open||document.activeElement!==draft||window.scrollY!==720||draft.value!=='Tetap'||draft.parentElement.scrollLeft!==120)throw Error('Parent timer disturbed '+page);
  if($('refresh').dataset.available!=='true')throw Error('Parent change indicator missing');
 }
 // An open inbox's content and its scroll must also survive a background notification check.
 $('parentInboxList').innerHTML='<p id="messageBeingRead">Pesan yang sedang dibaca</p>';const message=$('messageBeingRead');inboxOpen=true;await refreshNotifications({background:true});if($('messageBeingRead')!==message)throw Error('Inbox message was replaced');inboxOpen=false;
 // Unchanged payloads that only have a newer fetch timestamp do not trigger an update indicator.
 next={...data,updatedAt:'2026-11-16T02:00:00Z'};await refresh({background:true});if($('refresh').dataset.available!=='false')throw Error('Timestamp-only update was flagged');
 // An in-flight timer cannot clobber a newer explicit reload.
 let release;const delayed=new Promise(resolve=>release=resolve);request=async url=>url==='dashboard'?delayed:[];
 const stale=refresh({background:true});next={...data,pembayaran:{status:'Newest'}};request=async url=>url==='dashboard'?next:[];await refresh();release({...data,pembayaran:{status:'Old'}});await stale;if(parentSnapshot.pembayaran.status!=='Newest'||pendingSwim)throw Error('Stale SWIM response won');
 // Owner filters and expanded details are retained on manual reload too.
 ownerMode=true;selectedId=null;const owners={role:'owner',today:data.today,updatedAt:data.updatedAt,counts:{prestasi:1,pemula:0},atlet:[{id:'1',nama:'Atlet',kelompok:'Prestasi Class',status:'Aktif'}]};
 request=async url=>url==='dashboard'?owners:[];await refresh();$('childSearch').value='Atlet';$('childFilter').value='prestasi';$('childSearch').focus();window.scrollY=810;await refresh();
 if($('childSearch').value!=='Atlet'||$('childFilter').value!=='prestasi'||window.scrollY!==810||document.activeElement!==$('childSearch'))throw Error('Owner preview refresh lost filters/focus/scroll');
 })()`);
 dom.window.close();console.log('PASS SWIM refresh: all parent tabs and open messages stay intact, timestamp-only checks are quiet, latest manual request wins, Owner search/filter/focus/scroll survive reloads.');
})().catch(e=>{console.error(e);process.exitCode=1;});
