(function(root){
'use strict';
// Shared by Owner input, parent tables and API validation. Keep stored stroke identities.
const events=[];
function add(gaya,jarak,label,category='normal'){events.push({gaya,jarak,label:jarak+'m '+label,category});}
for(const [gaya,label] of [['Kupu-kupu','fly'],['Punggung','back']]){
 for(const jarak of [25,50,100]){add(gaya,jarak,label);add(gaya+' Fins',jarak,label+' fins','fins');}
 add(gaya,200,label);
}
for(const jarak of [25,50,100,200])add('Dada',jarak,'breast');
for(const jarak of [25,50])add('Kaki Dada',jarak,'kick breast','kick');
for(const jarak of [25,50,100]){add('Bebas',jarak,'free');add('Bebas Fins',jarak,'free fins','fins');}
for(const jarak of [200,400,800,1200,1500])add('Bebas',jarak,'free');
for(const jarak of [25,50])add('Kaki Bebas',jarak,'kick free','kick');
const categories=[['all','Semua nomor'],['normal','Tanpa alat'],['fins','Fins'],['kick','Kaki / Board']];
const categoryOptions=(selected='all')=>categories.map(([value,label])=>'<option value="'+value+'"'+(selected===value?' selected':'')+'>'+label+'</option>').join('');
const rounds=['Hasil','Seri','Semifinal','Final','Swim-off'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=n=>{if(n==null)return '—';const cs=Math.round(Number(n)*100);return Math.floor(cs/6000)+':'+String(Math.floor(cs/100)%60).padStart(2,'0')+'.'+String(cs%100).padStart(2,'0');};
function parse(v){const s=String(v??'').trim().replace(',','.');if(/^\d+(\.\d{1,2})?$/.test(s)){const n=Number(s);return n>0&&n<=86400?n:null;}const m=s.match(/^(\d+)[:.](\d{2})[.:](\d{2})$/);if(!m||+m[2]>59)return null;const n=+m[1]*60 + +m[2]+ +m[3]/100;return n>0&&n<=86400?n:null;}
const order=(a,b)=>String(a.tanggal).localeCompare(String(b.tanggal))||rounds.indexOf(a.ronde)-rounds.indexOf(b.ronde)||Number(a.id)-Number(b.id);
function groups(records,pool){const result=new Map();for(const r of records.filter(r=>Number(r.kolam)===Number(pool))){if(!result.has(r.eventId))result.set(r.eventId,{...r,records:[]});result.get(r.eventId).records.push(r);}return [...result.values()].sort(order);}
const validTime=r=>r.statusHasil!=='DQ'&&Number.isFinite(r.detik)&&r.detik>0;
const resultText=r=>r.statusHasil==='DQ'?'DQ':format(r.detik);
function progress(records,pool){return events.map(e=>{const history=records.filter(r=>Number(r.kolam)===Number(pool)&&r.gaya===e.gaya&&Number(r.jarak)===e.jarak).slice().sort(order);let previous=null;return {...e,history,last:history.at(-1),best:history.filter(validTime).reduce((a,b)=>!a||b.detik<a.detik?b:a,null),cells:history.map(r=>{const delta=validTime(r)&&previous?Math.round((r.detik-previous.detik)*100):null;if(validTime(r))previous=r;return {record:r,delta,cls:delta===null?'race-baseline':delta<0?'race-faster':delta>0?'race-slower':'race-same'};})};});}
const date=v=>{const [y,m,d]=String(v).split('-');return d+'/'+m+'/'+y;};
function change(delta){return delta===null?'Catatan awal':delta===0?'Tetap':(delta<0?'Lebih cepat ':'Lebih lambat ')+(Math.abs(delta)/100).toFixed(2)+' dtk';}
const meetingKey=r=>JSON.stringify([r.event,r.tanggal,r.lokasi]);
function meetings(records){const result=new Map();for(const r of records){const key=meetingKey(r);if(!result.has(key))result.set(key,{key,...r});}return [...result.values()].sort((a,b)=>order(b,a));}
function meetingOptions(records,selected='all'){return '<option value="all">Semua event · Tabel umum</option>'+meetings(records).map(r=>'<option value="'+esc(r.key)+'"'+(r.key===selected?' selected':'')+'>'+esc(r.event+' · '+new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(r.tanggal+'T12:00:00+07:00')))+' · '+esc(r.lokasi)+'</option>').join('');}
function table(records,pool,owner=false,category="all",meeting="all"){const cols=groups(records,pool).filter(r=>meeting==="all"||meetingKey(r)===meeting);const ids=new Set(cols.map(r=>r.eventId));const rows=progress(records,pool).map(e=>({...e,cells:e.cells.filter(c=>ids.has(c.record.eventId))})).map(e=>({...e,last:e.cells.at(-1)?.record})).filter(e=>(category==="all"||e.category===category)&&((owner&&meeting==="all")||e.cells.length));return '<p class="race-legend"><span class="race-faster">Lebih cepat</span><span class="race-same">Tetap</span><span class="race-slower">Lebih lambat</span><span>Catatan pertama: pembanding awal.</span></p><div class="race-scroll" tabindex="0" aria-label="Tabel perkembangan waktu lomba, geser ke samping"><table class="race-table"><thead><tr><th scope="col">Nomor renang</th>'+cols.map(c=>'<th scope="col">'+esc(date(c.tanggal))+'<small>'+esc(c.event)+' · '+esc(c.ronde)+'</small>'+(owner?'<div class="race-actions"><button type="button" data-race-edit="'+esc(c.eventId)+'">Edit</button><button type="button" data-race-delete="'+esc(c.eventId)+'">Hapus</button></div>':'')+'</th>').join('')+'<th scope="col">Perubahan terakhir</th></tr></thead><tbody>'+rows.map(r=>'<tr><th scope="row">'+esc(r.label)+'</th>'+cols.map(c=>{const found=r.cells.find(x=>x.record.eventId===c.eventId);return found?'<td class="'+found.cls+'"><button type="button" class="race-time" data-race-result="'+esc(found.record.id)+'" aria-label="'+esc(r.label+' '+resultText(found.record)+'; '+(found.record.statusHasil==='DQ'?'Diskualifikasi':change(found.delta))+'; lihat event dan tanggal')+'">'+resultText(found.record)+'</button></td>':'<td>—</td>';}).join('')+'<td class="'+(r.cells.at(-1)?.cls||'')+'">'+(r.last?esc(r.last.statusHasil==='DQ'?'DQ · Diskualifikasi':change(r.cells.at(-1).delta)):'Belum ada hasil')+'</td></tr>').join('')+'</tbody></table></div><p class="race-help">Tekan waktu untuk melihat nama event, tempat, tanggal dan babak. Perubahan dibanding hasil sebelumnya pada nomor, jenis alat dan kolam yang sama; waktu lebih kecil berarti lebih cepat. DQ berarti diskualifikasi, tetap tercatat sebagai keikutsertaan dan tidak dihitung sebagai waktu sah atau personal best.</p>'+(!rows.length?'<p>Belum ada hasil lomba sesuai pilihan pada kolam '+Number(pool)+' m.</p>':'');}
const api={events,categories,categoryOptions,rounds,parse,format,order,groups,progress,table,change,resultText,meetingKey,meetings,meetingOptions};if(typeof module==='object'&&module.exports)module.exports=api;else root.BRTMRace=api;
})(typeof globalThis!=='undefined'?globalThis:this);
