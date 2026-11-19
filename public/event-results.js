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
// A published meet period groups its daily result sheets without changing source dates.
function meetingPeriod(r){
 if(/krapprov/i.test(r.event||'')&&/magelang/i.test((r.event||'')+' '+(r.lokasi||''))&&r.tanggal>='2026-11-12'&&r.tanggal<='2026-11-14')return {start:'2026-11-12',end:'2026-11-14',label:'12–14 November 2026'};
 return null;
}
function groups(records,pool){const result=new Map();for(const r of records.filter(r=>Number(r.kolam)===Number(pool))){const period=meetingPeriod(r),key=period?meetingKey(r)+'|'+r.ronde:r.eventId;if(!result.has(key))result.set(key,{...r,period,records:[],sourceEvents:[]});const group=result.get(key);group.records.push(r);if(!group.sourceEvents.some(e=>e.eventId===r.eventId))group.sourceEvents.push(r);}return [...result.values()].sort(order);}
const validTime=r=>r.statusHasil!=='DQ'&&Number.isFinite(r.detik)&&r.detik>0;
const resultText=r=>r.statusHasil==='DQ'?'DQ':format(r.detik);
function progress(records,pool){return events.map(e=>{const history=records.filter(r=>Number(r.kolam)===Number(pool)&&r.gaya===e.gaya&&Number(r.jarak)===e.jarak).slice().sort(order);let previous=null;return {...e,history,last:history.at(-1),best:history.filter(validTime).reduce((a,b)=>!a||b.detik<a.detik?b:a,null),cells:history.map(r=>{const delta=validTime(r)&&previous?Math.round((r.detik-previous.detik)*100):null;if(validTime(r))previous=r;return {record:r,delta,cls:delta===null?'race-baseline':delta<0?'race-faster':delta>0?'race-slower':'race-same'};})};});}
const date=v=>{const [y,m,d]=String(v).split('-');return d+'/'+m+'/'+y;};
function change(delta){return delta===null?'Catatan awal':delta===0?'Tetap':(delta<0?'Lebih cepat ':'Lebih lambat ')+(Math.abs(delta)/100).toFixed(2)+' dtk';}
const meetingKey=r=>JSON.stringify([r.event,meetingPeriod(r)?.start||r.tanggal,r.lokasi]);
function meetings(records){const result=new Map();for(const r of records){const key=meetingKey(r);if(!result.has(key))result.set(key,{key,...r});}return [...result.values()].sort((a,b)=>order(b,a));}
function meetingOptions(records,selected='all'){return '<option value="all">Semua event · Tabel umum</option>'+meetings(records).map(r=>'<option value="'+esc(r.key)+'"'+(r.key===selected?' selected':'')+'>'+esc(r.event+' · '+(meetingPeriod(r)?.label||new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(r.tanggal+'T12:00:00+07:00'))))+' · '+esc(r.lokasi)+'</option>').join('');}
const medalIcon=r=>({Emas:'🥇',Perak:'🥈',Perunggu:'🥉'}[r.medali]||'');
const rankText=r=>r.statusHasil==='DQ'?'DQ · Tidak berperingkat':r.peringkat&&r.jumlahAtlet?('Peringkat '+r.peringkat+' dari '+r.jumlahAtlet+' atlet'):'Belum ada data peringkat';
function rankingTable(records,pool,category,meeting){
 const rows=records.filter(r=>Number(r.kolam)===Number(pool)&&(meeting==='all'||meetingKey(r)===meeting)&&events.some(e=>e.gaya===r.gaya&&e.jarak===Number(r.jarak)&&(category==='all'||e.category===category))).slice().sort(order);
 if(!rows.length)return '';
 return '<section class="race-rankings"><h3>Peringkat lomba</h3><div class="race-scroll" tabindex="0" aria-label="Tabel peringkat lomba, geser ke samping"><table class="race-table"><thead><tr><th scope="col">Tanggal / Event</th><th scope="col">Nomor</th><th scope="col">Kelompok / Babak</th><th scope="col">Hasil</th><th scope="col">Peringkat</th><th scope="col">Medali</th></tr></thead><tbody>'+rows.map(r=>'<tr><th scope="row">'+esc(date(r.tanggal))+'<small>'+esc(r.event)+'</small></th><td>'+esc(events.find(e=>e.gaya===r.gaya&&e.jarak===Number(r.jarak))?.label||r.gaya)+'</td><td>'+esc(r.kelompokLomba||'—')+'<small>'+esc(r.ronde)+'</small></td><td>'+esc(resultText(r))+'</td><td>'+esc(rankText(r))+'</td><td>'+esc(medalIcon(r))+(r.medali?' '+esc(r.medali):'—')+'</td></tr>').join('')+'</tbody></table></div><p class="race-help">Peringkat mengikuti kelompok umur/jenjang, jenis kelamin, nomor dan babak pada hasil resmi. Jumlah atlet adalah peserta yang tercantum pada kelompok hasil tersebut, termasuk DQ/DNS. Medali hanya ditandai jika tercantum atau terkonfirmasi pada hasil resmi.</p></section>';
}
function table(records,pool,owner=false,category="all",meeting="all"){const cols=groups(records,pool).filter(r=>meeting==="all"||meetingKey(r)===meeting);const ids=new Set(cols.flatMap(r=>r.sourceEvents.map(e=>e.eventId)));const rows=progress(records,pool).map(e=>({...e,cells:e.cells.filter(c=>ids.has(c.record.eventId))})).map(e=>({...e,last:e.cells.at(-1)?.record})).filter(e=>(category==="all"||e.category===category)&&((owner&&meeting==="all")||e.cells.length));return '<p class="race-legend"><span class="race-faster">Lebih cepat</span><span class="race-same">Tetap</span><span class="race-slower">Lebih lambat</span><span>Catatan pertama: pembanding awal.</span></p><div class="race-scroll" tabindex="0" aria-label="Tabel perkembangan waktu lomba, geser ke samping"><table class="race-table"><thead><tr><th scope="col">Nomor renang</th>'+cols.map(c=>'<th scope="col">'+esc(c.period?.label||date(c.tanggal))+'<small>'+esc(c.event)+' · '+esc(c.ronde)+'</small>'+(owner?c.sourceEvents.map(e=>'<div class="race-actions"><button type="button" data-race-edit="'+esc(e.eventId)+'">Edit'+(c.sourceEvents.length>1?' '+esc(date(e.tanggal)):'')+'</button><button type="button" data-race-delete="'+esc(e.eventId)+'">Hapus'+(c.sourceEvents.length>1?' '+esc(date(e.tanggal)):'')+'</button></div>').join(''):'')+'</th>').join('')+'<th scope="col">Perubahan terakhir</th></tr></thead><tbody>'+rows.map(r=>'<tr><th scope="row">'+esc(r.label)+'</th>'+cols.map(c=>{const matches=r.cells.filter(x=>c.sourceEvents.some(e=>e.eventId===x.record.eventId));return matches.length?'<td class="'+matches.at(-1).cls+'">'+matches.map(found=>'<button type="button" class="race-time" data-race-result="'+esc(found.record.id)+'" aria-label="'+esc(r.label+' '+resultText(found.record)+'; '+(found.record.statusHasil==='DQ'?'Diskualifikasi':change(found.delta))+'; lihat event dan tanggal')+'">'+resultText(found.record)+'</button>').join('<br>')+'</td>':'<td>—</td>';}).join('')+'<td class="'+(r.cells.at(-1)?.cls||'')+'">'+(r.last?esc(r.last.statusHasil==='DQ'?'DQ · Diskualifikasi':change(r.cells.at(-1).delta)):'Belum ada hasil')+'</td></tr>').join('')+'</tbody></table></div><p class="race-help">Tekan waktu untuk melihat nama event, tempat, tanggal dan babak. Perubahan dibanding hasil sebelumnya pada nomor, jenis alat dan kolam yang sama; waktu lebih kecil berarti lebih cepat. DQ berarti diskualifikasi, tetap tercatat sebagai keikutsertaan dan tidak dihitung sebagai waktu sah atau personal best.</p>'+rankingTable(records,pool,category,meeting)+(!rows.length?'<p>Belum ada hasil lomba sesuai pilihan pada kolam '+Number(pool)+' m.</p>':'');}
const api={events,categories,categoryOptions,rounds,parse,format,order,groups,progress,table,change,resultText,meetingKey,meetings,meetingOptions,rankText,medalIcon,rankingTable};if(typeof module==='object'&&module.exports)module.exports=api;else root.BRTMRace=api;
})(typeof globalThis!=='undefined'?globalThis:this);
