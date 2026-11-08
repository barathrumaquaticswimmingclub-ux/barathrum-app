(function(root){
'use strict';
const events=[];
for(const [gaya,label] of [['Kupu-kupu','Kupu-kupu'],['Punggung','Punggung'],['Dada','Dada'],['Bebas','Bebas']])for(const jarak of [50,100,200])events.push({gaya,jarak,label:jarak+' m '+label});
for(const jarak of [100,200,400])events.push({gaya:'Ganti',jarak,label:jarak+' m Ganti perorangan (IM)'});
for(const jarak of [400,2000])events.push({gaya:'Bebas',jarak,label:jarak+' m Bebas'});
function parse(value){
 const s=String(value??'').trim().replace(',','.');
 if(/^\d+(\.\d{1,2})?$/.test(s))return Number(s)>0?Number(s):null;
 const m=s.match(/^(\d+)[:.](\d{2})[.:](\d{2})$/);
 if(!m||Number(m[2])>59)return null;
 const n=Number(m[1])*60+Number(m[2])+Number(m[3])/100;return n>0?n:null;
}
function format(n){if(n==null)return '—';const cs=Math.round(Number(n)*100);return Math.floor(cs/6000)+':'+String(Math.floor(cs/100)%60).padStart(2,'0')+'.'+String(cs%100).padStart(2,'0');}
const order=(a,b)=>String(a.tanggal).localeCompare(String(b.tanggal))||Number(a.id||0)-Number(b.id||0);
function report(records,pool=25){return events.map(e=>{
 const history=records.filter(r=>r.gaya===e.gaya&&Number(r.jarak)===e.jarak&&Number(r.kolam)===Number(pool)&&Number(r.detik)>0).sort(order);
 const base=history[0]||null,last=history.at(-1)||null,previous=history.at(-2)||null;
 const best=history.reduce((a,b)=>!a||Number(b.detik)<Number(a.detik)?b:a,null);
 const delta=last&&previous?Math.round((Number(last.detik)-Number(previous.detik))*100)/100:null;
 return {...e,base,last,best,previous,delta,history};
});}
const api={events,parse,format,report,order};if(typeof module==='object'&&module.exports)module.exports=api;else root.BRTMTime=api;
})(typeof globalThis!=='undefined'?globalThis:this);
