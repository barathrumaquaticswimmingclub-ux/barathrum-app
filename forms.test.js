'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
let itemId=0;const typedItems=new WeakMap();
function specific(item){let proxy;proxy=new Proxy(item,{get(target,key){if(typeof key==='string'&&/^as[A-Z]/.test(key))return undefined;const value=target[key];return typeof value==='function'?function(...args){const result=value(...args);return result===target?proxy:result;}:value;}});typedItems.set(proxy,item);return proxy;}
const props=new Map(),forms=new Map(),triggers=[],posts=[];let failures=false;
function item(type='TEXT'){const iid=++itemId;const out={getId:()=>iid,type,title:'',required:false,getTitle:()=>out.title,getType:()=>type,getIndex:()=>0};for(const n of ['setHelpText','setValidation','setChoiceValues','setImage','setWidth'])out[n]=()=>out;out.setChoiceValues=v=>{out.choices=v.map(value=>({value}));return out;};out.createChoice=(value,page)=>({value,page});out.setChoices=v=>{out.choices=v;return out;};out.setHelpText=v=>{out.help=v;return out;};out.setGoToPage=v=>{out.navigation=v;return out;};out.asPageBreakItem=()=>out;out.setTitle=v=>{out.title=v;return out;};out.setRequired=v=>{out.required=v;return out;};for(const n of ['asTextItem','asParagraphTextItem','asListItem','asCheckboxItem','asMultipleChoiceItem','asSectionHeaderItem'])out[n]=()=>out;return out;}
function form(id){const out={responses:[],items:[],getItems:()=>out.items,getId:()=>id,getPublishedUrl:()=>`https://docs.google.com/forms/d/e/${id}/viewform`,getResponses:since=>since?out.responses.filter(r=>r.getTimestamp()>since):out.responses,moveItem(i,n){i=typeof i==='number'?out.items[i]:typedItems.get(i)||i;out.items.splice(out.items.indexOf(i),1);out.items.splice(n,0,i);},deleteItem(i){i=typedItems.get(i)||i;out.items.splice(out.items.indexOf(i),1);}};for(const n of ['setProgressBar','setTitle','setDescription','setConfirmationMessage','setCollectEmail','setLimitOneResponsePerUser','setPublishingSummary','setAllowResponseEdits'])out[n]=()=>out;for(const [n,t] of Object.entries({addTextItem:'TEXT',addMultipleChoiceItem:'MULTIPLE_CHOICE',addListItem:'LIST',addParagraphTextItem:'PARAGRAPH_TEXT',addImageItem:'IMAGE',addSectionHeaderItem:'SECTION_HEADER',addCheckboxItem:'CHECKBOX',addPageBreakItem:'PAGE_BREAK'}))out[n]=()=>{const i=item(t);i.getIndex=()=>out.items.indexOf(i);out.items.push(i);return specific(i);};return out;}
const context={DriveApp:{createFile(){}},console:{log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty(k,v){props.set(k,v);}})},FormApp:{PageNavigationType:{SUBMIT:'SUBMIT'},create(){const id='form_'+forms.size;const f=form(id);forms.set(id,f);return f;},openById:id=>forms.get(id),createTextValidation:()=>({requireTextMatchesPattern:()=>({build:()=>({})})})},ScriptApp:{getProjectTriggers:()=>triggers,newTrigger:handler=>{const t={handler,form:null,getHandlerFunction:()=>handler,getTriggerSourceId:()=>t.form?.getId()};for(const n of ['onFormSubmit','timeBased','everyMinutes'])t[n]=()=>t;t.forForm=f=>{t.form=f;return t;};t.create=()=>triggers.push(t);return t;}},UrlFetchApp:{fetch(url,o){if(!o)return {getBlob:()=>({setContentType(){return this;}})};if(failures)throw Error('network down');posts.push({url,body:JSON.parse(o.payload),headers:o.headers});return {getResponseCode:()=>200};}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})}};
vm.createContext(context);vm.runInContext(fs.readFileSync('scripts/google-forms.gs','utf8').replace('__BRTM_CONFIG__',JSON.stringify({base:'https://brtm.test',keys:{prestasi:'p',nonprestasi:'n'}})).replace('__BRTM_RULES__',fs.readFileSync('scripts/form-rules.json','utf8')),context);
vm.runInContext('siapkanBRTM();siapkanBRTM();',context);assert.equal(forms.size,2);assert.equal(triggers.length,3);assert.equal(posts.length,4);for(const f of forms.values()){assert.equal(f.items[0].type,'IMAGE');assert.equal(f.items[1].title,'KETENTUAN & PERSETUJUAN ORANG TUA/WALI');assert.equal(f.items.at(-1).type,'CHECKBOX');assert(f.items.filter(i=>!['IMAGE','SECTION_HEADER'].includes(i.type)).every(i=>i.required));assert(f.items.some(i=>i.title==='Tempat lahir'));}assert(forms.get('form_0').items.some(i=>i.title==='Pernah latihan renang di mana saja'));assert(!forms.get('form_0').items.some(i=>i.title==='Tujuan latihan'));assert(forms.get('form_1').items.some(i=>i.title==='Kelas yang dipilih'));
function response(id,time){return {getId:()=>id,getTimestamp:()=>new Date(time),getItemResponses:()=>[{getItem:()=>({getTitle:()=> 'Nama lengkap anak'}),getResponse:()=> 'Contoh'}]};}
// More than one batch with identical timestamps must drain completely.
forms.get('form_0').responses=Array.from({length:120},(_,i)=>response('response_'+i,1000));posts.length=0;
vm.runInContext('ulangKirimBRTM();ulangKirimBRTM();ulangKirimBRTM();ulangKirimBRTM();',context);assert.equal(posts.length,120);assert.equal(new Set(posts.map(x=>x.body.responseId)).size,120);
forms.get('form_0').responses.push(response('recover',2000));failures=true;assert.throws(()=>vm.runInContext('ulangKirimBRTM()',context),/network down/);failures=false;vm.runInContext('ulangKirimBRTM()',context);assert.equal(posts.at(-1).body.responseId,'recover');
assert.throws(()=>vm.runInContext('kirimBRTM({})',context),/otomatis/);
// Unused legacy questions stay recoverable but are skipped after current final consent.
const legacy=forms.get('form_0').addTextItem().setTitle('Tujuan mengikuti latihan');props.set('schema_prestasi','old');
vm.runInContext('siapkanBRTM()',context);
const upgraded=forms.get('form_0').items,archiveIndex=upgraded.findIndex(i=>i.type==='PAGE_BREAK');
assert(archiveIndex>0);assert.equal(upgraded[archiveIndex].navigation,'SUBMIT');assert.equal(upgraded[archiveIndex-1].type,'CHECKBOX');assert.equal(upgraded[archiveIndex+1].title,'Tujuan mengikuti latihan');
// Exercise every native branch using PageBreakItem's previous-page semantics.
const registration=forms.get('form_1'),retained=registration.items.slice();
vm.runInContext(fs.readFileSync('scripts/google-form-schedule.gs','utf8').replace('1Zup98fj8v48JFzw8kLXKB0XUTm9_sxmOTiAFWi9VIVA','form_1'),context);
vm.runInContext('aturJadwalPendaftaranBRTM()',context);const count=registration.items.length;
vm.runInContext('aturJadwalPendaftaranBRTM()',context);assert.equal(registration.items.length,count);
assert(retained.every(i=>registration.items.includes(i)));
const classQuestion=registration.items.find(i=>i.title==='Kelas yang dipilih');
function pathFor(className,days){
 let page=classQuestion.choices.find(c=>c.value===className).page,dayIndex=0,trace=[];
 for(let guard=0;guard<15;guard++){
  let i=registration.items.indexOf(typedItems.get(page)||page)+1,next=null;
  for(;i<registration.items.length&&registration.items[i].type!=='PAGE_BREAK';i++){
   const q=registration.items[i];trace.push(q);
   if(q.title.startsWith('Hari yang dipilih')){assert(q.required);const day=days[dayIndex++],c=q.choices.find(c=>c.value===day);assert(c,className+' '+days+' '+q.title+' '+dayIndex+' '+trace.map(x=>x.title).join('|'));if(c.page)next=c.page;}
   if(q.title.startsWith('Jam yang dipilih'))assert(q.required);
  }
  const boundary=registration.items[i];
  if(!boundary)return trace;
  page=next||boundary.navigation;
  if(!page||page==='CONTINUE')page=boundary;
  if(page==='SUBMIT')return trace;
 }
 throw Error('Native form loop');
}
const days=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
function verifyTimes(trace,expectedDays){const times=trace.filter(q=>q.title.startsWith('Jam yang dipilih'));assert.equal(times.length,expectedDays.length);times.forEach((q,i)=>assert.deepEqual(Array.from(q.choices,c=>c.value),expectedDays[i]==='Sabtu'?['08.00–09.00','09.00–10.00','15.00–16.00','16.00–17.00']:['15.00–16.00','16.00–17.00']));assert.equal(trace.at(-1).title,'Persetujuan orang tua / wali');}
for(const day of days)verifyTimes(pathFor('Regular Class (1x Seminggu)',[day]),[day]);
for(const first of days)for(const second of days)verifyTimes(pathFor('Regular Class (2x Seminggu)',[first,second]),[first,second]);
for(const name of ['Private Class','Semi Private Class','Group Class','Private Couple Class','Hydro Terapi Class'])for(const day of days){const t=pathFor(name,[day]);assert.equal(t.filter(q=>q.title.startsWith('Hari yang dipilih')).length,1);assert.deepEqual(Array.from(t.find(q=>q.title.startsWith('Jam yang dipilih')).choices,c=>c.value),['07.00–08.00','08.00–09.00','09.00–10.00','14.00–15.00','15.00–16.00','16.00–17.00']);assert.equal(t.at(-1).title,'Persetujuan orang tua / wali');}
const sampleResponse={getItemResponses:()=>[{getItem:()=>({getTitle:()=> 'Hari yang dipilih — Regular 2× (pilihan 1)'}),getResponse:()=> 'Senin'},{getItem:()=>({getTitle:()=> 'Jam yang dipilih — Regular 2× (pilihan 1, Senin–Jumat)'}),getResponse:()=> '15.00–16.00'},{getItem:()=>({getTitle:()=> 'Jam yang dipilih — Regular 2× (pilihan 1, Sabtu)'}),getResponse:()=> ''}]};context.sampleResponse=sampleResponse;
assert.equal(vm.runInContext('ringkasJadwalBRTM(sampleResponse)',context),'Hari yang dipilih — Regular 2× (pilihan 1): Senin; Jam yang dipilih — Regular 2× (pilihan 1, Senin–Jumat): 15.00–16.00');
console.log('PASS Google Forms installer/retry and 72 schedule paths: stable questions, retained answers, required choices, weekday/Saturday hours, two regular sessions and answered-only sender mapping.');
