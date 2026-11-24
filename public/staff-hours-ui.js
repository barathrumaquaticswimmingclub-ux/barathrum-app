'use strict';
title.slipgaji='Slip Gaji Staf';icons.slipgaji='▤';descriptions.slipgaji='Rekap jam melatih staf per bulan.';
const hoursMenu=menuKeys;menuKeys=()=>{const keys=hoursMenu().filter(k=>k!=='slipgaji');return isOwner()?keys.flatMap(k=>k==='akun'?[k,'slipgaji']:[k]):keys;};
const hoursWrite=canWrite;canWrite=kind=>kind==='slipgaji'?false:hoursWrite(kind);
const hoursFilter=configureFilter;configureFilter=function(){hoursFilter();if(S.section==='slipgaji'){$('filter').classList.add('hidden');$('monthFilter').classList.add('hidden');$('search').placeholder='Cari nama staf…';}};
let staffHoursMonth='',staffHoursSequence=0,staffHoursData=null;
const staffHoursPdf=(id,month)=>'/api/owner/staff-hours/'+encodeURIComponent(id)+'/pdf?month='+encodeURIComponent(month);
const staffHoursFormat=n=>Number(n).toLocaleString('id-ID',{maximumFractionDigits:2})+' jam';
const hoursList=renderList;renderList=function(){if(S.section!=='slipgaji'){hoursList();return;}if(!isOwner())return;
 const month=staffHoursMonth||S.config.today.slice(0,7),q=$('search').value.trim().toLocaleLowerCase('id'),sequence=++staffHoursSequence;
 $('records').className='ops-records';
 $('sectionSummary').innerHTML='<label>Bulan rekap<input type="month" id="staffHoursMonth" value="'+esc(month)+'"></label><p id="staffHoursPeriod" class="muted"></p><p>Durasi latihan dihitung satu kali per pelatih pada jam yang sama, berdasarkan sesi dengan anak Hadir. Sabtu pagi masuk jam sore. Regular Senin–Sabtu sore mengikuti pelatih pencatat absensi Hadir; Regular Sabtu pagi dihitung untuk kedua pelatih.</p><p id="staffHoursWarning" class="muted"></p>';
 $('staffHoursMonth').onchange=e=>{if(e.target.value){staffHoursMonth=e.target.value;renderList();}};
 $('records').innerHTML='<p role="status">Memuat jam melatih…</p>';
 request('/api/owner/staff-hours?month='+encodeURIComponent(month)).then(data=>{
  if(S.section!=='slipgaji'||sequence!==staffHoursSequence)return;
  staffHoursData=data;const fmt=staffHoursFormat;
  $('staffHoursPeriod').textContent='Periode '+displayDate(data.start)+' – '+displayDate(data.end)+(data.asOf<data.end?' · Sementara sampai '+displayDate(data.asOf):'');
  $('records').innerHTML=grid(['Nama','Jumlah jam sore','Jumlah jam pagi','Rincian','PDF'],data.rows.filter(r=>r.nama.toLocaleLowerCase('id').includes(q)).map(r=>[esc(r.nama),fmt(r.jamSore),fmt(r.jamPagi),'<button type="button" data-hours-detail="'+esc(r.id)+'">Lihat rincian</button>','<a class="secondary download" href="'+esc(staffHoursPdf(r.id,data.month))+'" target="_blank" rel="noopener">PDF</a>']));
  $('staffHoursWarning').textContent=data.unassignedSessions?data.unassignedSessions+' sesi Regular memiliki absensi Hadir tanpa pencatat pelatih yang dapat dikenali; bagian tersebut belum dihitung.':'';
 }).catch(err=>{if(S.section==='slipgaji'&&sequence===staffHoursSequence)$('records').textContent=err.message;});
};

$('records').addEventListener('click',e=>{
 const b=e.target.closest('[data-hours-detail]');if(!b||S.section!=='slipgaji'||!isOwner()||!staffHoursData)return;
 const data=staffHoursData,r=data.rows.find(r=>r.id===b.dataset.hoursDetail);if(!r)return;
 const period=esc(displayDate(data.start))+' – '+esc(displayDate(data.end));
 modal('Rincian jam melatih · '+r.nama,'<div class="full"><p>'+period+(data.asOf<data.end?' · Sementara sampai '+esc(displayDate(data.asOf)):'')+'</p><p>Jam sore: <strong>'+staffHoursFormat(r.jamSore)+'</strong> · Jam pagi: <strong>'+staffHoursFormat(r.jamPagi)+'</strong></p><a class="secondary download" target="_blank" rel="noopener" href="'+esc(staffHoursPdf(r.id,data.month))+'">PDF</a></div>'+grid(['Tanggal','Hari','Jam','Hitungan','Kelas','Anak yang dilatih','Keterangan'],r.rincian.map(d=>[esc(displayDate(d.tanggal)),esc(d.hari),esc(d.mulai+'–'+d.selesai),esc(d.kategori)+' · '+staffHoursFormat(d.jam),d.kelas.map(k=>esc(k.nama)).join('<br>'),d.kelas.map(k=>k.atlet.map(a=>esc(a.nama)).join(', ')||'—').join('<br>'),esc(d.keterangan||d.status||'Melatih')]))+'<p class="full muted">Jam yang bersamaan dihitung satu kali per pelatih. Nama anak tidak menambah jumlah jam. Sesi libur, kosong, dan belum diabsen ditampilkan sebagai keterangan dengan 0 jam. Regular mengikuti aktivasi sesi fleksibel, bukan jadwal tetap anak.</p>',null);
});
