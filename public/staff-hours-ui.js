'use strict';
title.slipgaji='Slip Gaji Staf';icons.slipgaji='▤';descriptions.slipgaji='Rekap jam melatih staf per bulan.';
const hoursMenu=menuKeys;menuKeys=()=>{const keys=hoursMenu().filter(k=>k!=='slipgaji');return isOwner()?keys.flatMap(k=>k==='akun'?[k,'slipgaji']:[k]):keys;};
const hoursWrite=canWrite;canWrite=kind=>kind==='slipgaji'?false:hoursWrite(kind);
const hoursFilter=configureFilter;configureFilter=function(){hoursFilter();if(S.section==='slipgaji'){$('filter').classList.add('hidden');$('monthFilter').classList.add('hidden');$('search').placeholder='Cari nama staf…';}};
let staffHoursMonth='',staffHoursSequence=0;
const hoursList=renderList;renderList=function(){if(S.section!=='slipgaji'){hoursList();return;}if(!isOwner())return;
 const month=staffHoursMonth||S.config.today.slice(0,7),q=$('search').value.trim().toLocaleLowerCase('id'),sequence=++staffHoursSequence;
 $('records').className='ops-records';
 $('sectionSummary').innerHTML='<label>Bulan rekap<input type="month" id="staffHoursMonth" value="'+esc(month)+'"></label><p>Durasi latihan dihitung satu kali per pelatih pada jam yang sama, berdasarkan sesi dengan anak Hadir. Sabtu pagi masuk jam sore. Regular Senin–Sabtu sore mengikuti pelatih pencatat absensi Hadir; Regular Sabtu pagi dihitung untuk kedua pelatih.</p><p id="staffHoursWarning" class="muted"></p>';
 $('staffHoursMonth').onchange=e=>{if(e.target.value){staffHoursMonth=e.target.value;renderList();}};
 $('records').innerHTML='<p role="status">Memuat jam melatih…</p>';
 request('/api/owner/staff-hours?month='+encodeURIComponent(month)).then(data=>{
  if(S.section!=='slipgaji'||sequence!==staffHoursSequence)return;
  const fmt=n=>Number(n).toLocaleString('id-ID',{maximumFractionDigits:2})+' jam';
  $('records').innerHTML=grid(['Nama','Jumlah jam sore','Jumlah jam pagi'],data.rows.filter(r=>r.nama.toLocaleLowerCase('id').includes(q)).map(r=>[esc(r.nama),fmt(r.jamSore),fmt(r.jamPagi)]));
  $('staffHoursWarning').textContent=data.unassignedSessions?data.unassignedSessions+' sesi Regular memiliki absensi Hadir tanpa pencatat pelatih yang dapat dikenali; bagian tersebut belum dihitung.':'';
 }).catch(err=>{if(S.section==='slipgaji'&&sequence===staffHoursSequence)$('records').textContent=err.message;});
};
