'use strict';
title.slipgaji='Slip Gaji Staf';icons.slipgaji='▤';descriptions.slipgaji='Rekap kehadiran dan jam staf per bulan.';
const hoursMenu=menuKeys;menuKeys=()=>{const keys=hoursMenu().filter(k=>k!=='slipgaji');return isOwner()?keys.flatMap(k=>k==='akun'?[k,'slipgaji']:[k]):keys;};
const hoursWrite=canWrite;canWrite=kind=>kind==='slipgaji'?false:hoursWrite(kind);
const hoursFilter=configureFilter;configureFilter=function(){hoursFilter();if(S.section==='slipgaji'){$('filter').classList.add('hidden');$('monthFilter').classList.add('hidden');$('search').placeholder='Cari nama staf…';}};
let staffHoursMonth='',staffHoursSequence=0,staffHoursData=null,staffSelfData=null,staffSelfSequence=0;
const hoursLogin=showLogin;showLogin=function(){staffHoursData=null;staffSelfData=null;staffHoursSequence++;staffSelfSequence++;staffHoursMonth='';if(/kehadiran staf/.test($('wfTitle')?.textContent||''))$('wfBody')?.replaceChildren();hoursLogin();};
const staffHoursPdf=(id,month)=>'/api/owner/staff-hours/'+encodeURIComponent(id)+'/pdf?month='+encodeURIComponent(month);
const staffHoursFormat=n=>Number(n||0).toLocaleString('id-ID',{maximumFractionDigits:2})+' jam';
const hoursList=renderList;renderList=function(){if(S.section!=='slipgaji'){hoursList();return;}if(!isOwner()){$('records').textContent='Khusus Owner';return;}
 const month=staffHoursMonth||S.config.today.slice(0,7),q=$('search').value.trim().toLocaleLowerCase('id'),sequence=++staffHoursSequence;
 $('records').className='ops-records';
 $('sectionSummary').innerHTML='<label>Bulan rekap<input type="month" id="staffHoursMonth" value="'+esc(month)+'"></label><button type="button" id="staffHoursAdd">Tambah absensi pelatih (tanpa foto)</button>';
 $('staffHoursMonth').onchange=e=>{if(e.target.value){staffHoursMonth=e.target.value;renderList();}};
 $('staffHoursAdd').onclick=()=>openOwnerStaffAttendance();
 $('records').innerHTML='<p role="status">Memuat rekap staf…</p>';
 request('/api/owner/staff-hours?month='+encodeURIComponent(month)).then(data=>{
  if(!isOwner()||S.section!=='slipgaji'||sequence!==staffHoursSequence)return;
  staffHoursData=data;const fmt=staffHoursFormat;
  $('records').innerHTML=grid(['Nama','Jam sore','Jam pagi','Rincian','PDF'],data.rows.filter(r=>r.nama.toLocaleLowerCase('id').includes(q)).map(r=>[esc(r.nama),fmt(r.jamSore),fmt(r.jamPagi),'<button type="button" data-hours-detail="'+esc(r.id)+'">Lihat rincian</button>','<a class="secondary download" href="'+esc(staffHoursPdf(r.id,data.month))+'" target="_blank" rel="noopener">PDF</a>']));
  const reports=data.rows.flatMap(r=>(r.laporanPelatih||[]).map(m=>({...m,nama:r.nama,personId:r.id})));
  $('sectionSummary').insertAdjacentHTML('beforeend','<details class="panel"><summary>Absensi pelatih ('+reports.length+')</summary>'+grid(['Tanggal','Pelatih','Jam','Kehadiran','Bukti absensi','Catatan / pengganti','Status','Tindakan'],reports.map(m=>[esc(displayDate(m.tanggal)),esc(m.nama),esc(m.mulai+'–'+m.selesai),esc(m.status),m.checkInId?'<button type="button" data-check-in-proof="'+esc(m.checkInId)+'">Foto, waktu & lokasi</button>':'—',esc(m.catatan||'—')+(m.replacementId?'<small>Usulan pengganti: '+esc((S.workspace?.staff||[]).find(u=>String(u.id)===m.replacementId)?.nama||m.replacementId)+'</small>':''),esc(m.review),'<button type="button" data-hours-report="'+esc(m.id)+'" data-hours-staff="'+esc(m.personId)+'">Edit / hapus</button>']))+'</details>');
 }).catch(err=>{if(S.section==='slipgaji'&&sequence===staffHoursSequence)$('records').textContent=err.message;});
};
function openStaffHoursVerification(staffId='',detail=null){
 if(!isOwner()||!staffHoursData)return;
 const requestId=crypto.randomUUID(),data=staffHoursData,selected=new Set((detail?.kelas||[]).flatMap(k=>k.atlet||[]).map(a=>a.id));
 const children=(S.records?.atlet||[]).slice().sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
 modal('Verifikasi kehadiran staf',field('staffId','Staf',data.rows.map(r=>[r.id,r.nama]),staffId||data.rows[0]?.id)+field('tanggal','Tanggal','date',detail?.tanggal||data.start)+field('mulai','Mulai','time',detail?.recordStart||detail?.mulai||'15:00')+field('selesai','Selesai','time',detail?.recordEnd||detail?.selesai||'16:00')+field('status','Kehadiran staf',['Hadir melatih','Hadir menunggu murid','Tidak hadir','Izin','Sakit','Libur'],detail?.ownerVerified||detail?.coachReported?detail.status:'Hadir melatih')+field('kelas','Kelas / tugas','text',(detail?.kelas||[]).map(k=>k.nama).join(', ')||'Jam tugas staf',{full:true,max:200})+'<label class="full">Anak yang dilatih (opsional)<select name="staffAthlete" multiple size="5">'+children.map(a=>'<option value="'+esc(a.id)+'"'+(selected.has(a.id)?' selected':'')+'>'+esc(a.nama)+'</option>').join('')+'</select></label>'+field('alasan','Dasar verifikasi / alasan koreksi','textarea',detail?.coachReported?'Konfirmasi laporan pelatih: '+(detail.alasan||detail.status):detail?.alasan||'',{full:true,max:1000})+'<label class="check full"><input type="checkbox" name="confirmed" required><span>Saya memastikan tanggal, jam, dan kehadiran staf ini berdasarkan catatan saya.</span></label><p class="full">Khusus rekap staf. Absensi, kuota, dan laporan orang tua tidak diubah. Jam yang bertumpuk tidak dihitung dua kali.</p>',async(d,form)=>{
  const response=await request('/api/owner/staff-hours/verify',{method:'POST',body:JSON.stringify({...d,confirmed:form.elements.confirmed.checked,sourceId:detail?.sourceId||detail?.recordSourceId||'',requestId,expectedRevision:detail?.expectedRevision,atletIds:Array.from(form.elements.staffAthlete.selectedOptions).map(o=>o.value)})});return response;
 });$('f_alasan').minLength=8;$('wfSave').textContent='Simpan verifikasi';
}
$('records').addEventListener('click',e=>{
 const b=e.target.closest('[data-hours-detail]');if(!b||S.section!=='slipgaji'||!isOwner()||!staffHoursData)return;
 const data=staffHoursData,r=data.rows.find(r=>r.id===b.dataset.hoursDetail);if(!r)return;
 const period=esc(displayDate(data.start))+' – '+esc(displayDate(data.end));
 const coverage=r.cakupanBelumLengkap&&r.dataPertama?'Data sesi pertama yang tersimpan: '+displayDate(r.dataPertama)+'. Jam sebelum tanggal tersebut belum terbukti lengkap.':'';
 modal('Rincian kehadiran staf · '+r.nama,'<div class="full"><p>'+period+'</p><p>Jam sore terkonfirmasi: <strong>'+staffHoursFormat(r.jamSore)+'</strong> · Jam pagi terkonfirmasi: <strong>'+staffHoursFormat(r.jamPagi)+'</strong></p><p>Jadwal tersimpan: '+staffHoursFormat(r.jamTerjadwalTerdeteksi)+' · Sesi ditelusuri termasuk keterangan kosong: '+staffHoursFormat(r.jamCakupanSesi)+' · Perlu verifikasi: '+staffHoursFormat(r.jamPerluVerifikasi)+'</p><p class="error">'+esc(coverage)+'</p><a class="secondary download" target="_blank" rel="noopener" href="'+esc(staffHoursPdf(r.id,data.month))+'">PDF</a><button type="button" data-hours-add="'+esc(r.id)+'">Tambah absensi tanpa foto</button></div>'+grid(['Tanggal','Hari','Jam','Hitungan','Kelas','Anak / peserta','Keterangan','Verifikasi'],r.rincian.map((d,i)=>[esc(displayDate(d.tanggal)),esc(d.hari),esc(d.mulai+'–'+d.selesai),d.perluVerifikasi?'Belum diverifikasi':esc(d.kategori)+' · '+staffHoursFormat(d.jam),d.kelas.map(k=>esc(k.nama)).join('<br>'),d.kelas.map(k=>k.atlet.map(a=>esc(a.nama)).join(', ')||'—').join('<br>'),esc(d.keterangan||d.status||'Melatih'),'<button type="button" data-hours-verify="'+i+'" data-hours-staff="'+esc(r.id)+'">'+(d.staffReportId?'Edit / hapus':d.ownerVerified?'Koreksi':'Verifikasi')+'</button>']))+(r.tanpaJam?.length?'<h3 class="full">Absensi Hadir tanpa jam sesi</h3>'+grid(['Tanggal','Kelas','Keterangan','Tindakan'],r.tanpaJam.map((d,i)=>[esc(displayDate(d.tanggal)),d.kelas.map(k=>esc(k.nama)).join(', '),esc(d.keterangan),'<button type="button" data-hours-untimed="'+i+'" data-hours-staff="'+esc(r.id)+'">Lengkapi jam</button>'])):'')+'<p class="full muted">Jumlah anak tidak menggandakan jam. Jadwal, sesi kosong, dan absensi yang belum diisi tidak otomatis membuktikan kehadiran atau ketidakhadiran staf. Periksa sesi yang belum jelas sebelum memakai rekap untuk gaji dan bonus.</p>',null);
});
function openReportedStaffHours(b){const r=staffHoursData?.rows.find(r=>r.id===b.dataset.hoursStaff),m=r?.laporanPelatih?.find(m=>m.id===b.dataset.hoursReport);if(m)openOwnerStaffAttendance(r.id,m);}
function openOwnerStaffAttendance(staffId='',record=null){
 if(!isOwner()||!staffHoursData)return;
 const requestId=crypto.randomUUID(),data=staffHoursData,today=S.config.today,date=record?.tanggal||(data.month===today.slice(0,7)?today:data.start);
 modal(record?'Edit absensi pelatih':'Tambah absensi pelatih tanpa foto',field('staffId','Pelatih',data.rows.map(r=>[r.id,r.nama]),record?.staffId||staffId||data.rows[0]?.id)+field('tanggal','Tanggal','date',date)+field('mulai','Jam mulai','time',record?.mulai||'06:00')+field('selesai','Jam selesai','time',record?.selesai||'07:00')+field('status','Kehadiran',['Hadir melatih','Hadir menunggu murid','Tidak hadir','Izin','Sakit','Libur'],record?.status||'Hadir melatih')+field('kelas','Kelas / kegiatan','text',record?.kelas||'Latihan tambahan',{full:true,max:200})+field('catatan','Catatan','textarea',record?.catatan||'',{full:true,required:false,max:1000})+(record?.checkInId?'<p class="full">Foto, lokasi, dan waktu pengambilan asli tetap tersimpan.</p>':'')+(record?'<div class="full"><button type="button" id="staffOwnerDelete" class="danger">Hapus absensi</button></div>':''),d=>request('/api/owner/staff-attendance'+(record?'/'+encodeURIComponent(record.id):''),{method:record?'PUT':'POST',body:JSON.stringify({...d,requestId,expectedRevision:record?.revision})}));
 $('wfSave').textContent='Simpan';$('f_tanggal').max=today;
 if(record){const deleteId=crypto.randomUUID();$('staffOwnerDelete').onclick=async()=>{if($('wfForm').dataset.submitting==='1')return;if(!confirm('Hapus absensi ini? Sesi ini tidak akan dihitung dalam jam mengajar.'))return;
  const button=$('staffOwnerDelete');button.disabled=true;$('wfSave').disabled=true;$('wfForm').dataset.submitting='1';
  try{const result=await request('/api/owner/staff-attendance/'+encodeURIComponent(record.id),{method:'DELETE',body:JSON.stringify({requestId:deleteId,expectedRevision:record.revision})});wfDialog.close();await load();notice(result.pesan);}catch(err){$('wfError').textContent=err.message;}finally{button.disabled=false;$('wfSave').disabled=false;delete $('wfForm').dataset.submitting;}
 };}
}
$('sectionSummary').addEventListener('click',e=>{const b=e.target.closest('[data-hours-report]');if(b&&isOwner())openReportedStaffHours(b);});
$('wfBody').addEventListener('click',e=>{
 const add=e.target.closest('[data-hours-add]');if(add){openOwnerStaffAttendance(add.dataset.hoursAdd);return;}
 const untimed=e.target.closest('[data-hours-untimed]');if(untimed){const r=staffHoursData.rows.find(r=>r.id===untimed.dataset.hoursStaff),d=r?.tanpaJam[Number(untimed.dataset.hoursUntimed)];if(d)openStaffHoursVerification(r.id,d);return;}
 const b=e.target.closest('[data-hours-verify]');if(!b||!staffHoursData)return;
 const r=staffHoursData.rows.find(r=>r.id===b.dataset.hoursStaff),d=r?.rincian[Number(b.dataset.hoursVerify)];if(d){const report=r.laporanPelatih?.find(m=>m.id===d.staffReportId);if(report)openOwnerStaffAttendance(r.id,report);else openStaffHoursVerification(r.id,d);}
});
function isStaffSelf(){return ['coach','prestasi'].includes(S.user?.role);}

if(S.user&&typeof renderNav==='function'){renderNav();renderCurrent();}
