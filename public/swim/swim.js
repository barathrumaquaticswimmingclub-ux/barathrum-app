'use strict';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = v => v ? new Intl.DateTimeFormat('id-ID', {day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(v+'T12:00:00+07:00')) : 'Belum tercatat';
let swimViewVersion=0;
let loading = false, ownerMode=false, selectedId=null, ownerData=null;
const profileLabels={nama:'Nama lengkap',namaPanggilan:'Nama panggilan',tanggalLahir:'Tanggal lahir',jk:'Jenis kelamin',namaOrtu:'Nama orang tua / wali',noHpOrtu:'Nomor WhatsApp',sekolah:'Nama sekolah',kelasSekolah:'Kelas sekolah',alamat:'Alamat rumah',tujuan:'Tujuan latihan',riwayatRenang:'Riwayat latihan renang'};
async function request(url, body, method) {
  const r = await fetch('/swim/api/'+url, { credentials:'same-origin', ...(body ? {method:method||'POST',headers:{'Content-Type':'application/json','X-BRTM-Request':'1'},body:JSON.stringify(body)} : {}), cache:'no-store' });
  const d = await r.json(); if(!r.ok){const e=Error(d.pesan||'Data belum bisa dimuat.');e.status=r.status;throw e;} return d;
}
function showLogin(){swimViewVersion++; ownerMode=false;selectedId=null;ownerData=null; $('login').hidden=false;$('dashboard').hidden=true;$('logout').hidden=true;$('content').replaceChildren();$('password').value='';$('notificationPanel').hidden=true; }
const metric = (label,value,detail) => `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`;
function render(d){
  ownerMode=d.role==='owner';
  if(ownerMode && d.atlet) {ownerData=d;renderOwner(d);return;}
  const a=d.profil,l=d.latihan,p=d.pembayaran;
  $('dateLabel').textContent=new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(d.today+'T12:00:00+07:00')).toUpperCase();
  $('content').innerHTML=`${ownerMode?'<div class="owner-toolbar"><button data-action="back">← Semua atlet</button><button data-action="edit">Edit biodata & foto</button></div>':''}<div class="profile"><div class="initial" aria-hidden="true">${a.foto?`<img class="child-photo" data-initial="${esc(a.nama.slice(0,1).toUpperCase())}" src="${esc(a.foto)}" alt="Foto ${esc(a.nama)}">`:esc(a.nama.slice(0,1).toUpperCase())}</div><div><p class="eyebrow">PROFIL ATLET</p><h2>${esc(a.nama)}</h2><p>${esc(a.kelompok)} · ${esc(a.status)}</p><p>${a.tanggalLahir?'Lahir '+esc(date(a.tanggalLahir)):''}${a.sekolah?' · '+esc(a.sekolah):''}</p></div></div><section class="panel biodata"><h3>Biodata anak</h3><dl>${Object.entries(profileLabels).filter(([k])=>k!=='nama').map(([k,label])=>`<div><dt>${esc(label)}</dt><dd>${esc(k==='tanggalLahir'?date(a[k]):a[k]||'Belum diisi')}</dd></div>`).join('')}</dl></section><div class="metrics">${metric(l.prestasi?'Latihan bulan ini':'Latihan paket ini',l.prestasi?l.hadirBulanIni:l.terpakaiPaket??'—',l.prestasi?'Kehadiran fleksibel':l.kuota!=null?'Dari '+l.kuota+' pertemuan':'Belum ada paket tercatat')}${metric('Sisa latihan',l.prestasi?'Fleksibel':l.sisaPertemuan??'—',l.prestasi?'Tidak memakai kuota pertemuan':l.statusPaket)}${metric('Terakhir bayar',p.terakhirBayar?date(p.terakhirBayar):'—',p.status)}${metric('Bayar berikutnya',p.bayarBerikutnya?date(p.bayarBerikutnya):l.prestasi?'Belum ada tagihan':'Konfirmasi admin',p.adaTunggakan?'Ada tagihan belum lunas':l.prestasi?p.bayarBerikutnya?'Batas bayar mengikuti pembayaran pertama':'0 hadir: tidak ada SPP bulan ini':'Perpanjang saat kuota habis atau masa berlaku berakhir')}</div><div class="grid"><section class="panel"><h3>Jadwal latihan</h3>${d.jadwal.length?d.jadwal.map(x=>`<div class="entry"><strong>${esc(date(x.tanggal))} <span class="tag">${esc(x.mulai)}–${esc(x.selesai)}</span></strong><p>${esc(x.lokasi)}</p>${x.statusSesi==='Libur'?`<p class="error">LIBUR · ${esc(x.alasanLibur)}</p>`:''}<small>Pelatih: ${esc(x.pelatih)}</small></div>`).join(''):'<p class="subtle">Belum ada jadwal mendatang. Jadwal akan muncul setelah ditentukan oleh BRTM.</p>'}</section><section class="panel"><h3>Riwayat kehadiran</h3><p class="subtle">${esc(l.hadirBulanIni)} kali hadir bulan ini · ${esc(l.hadirTotal)} kali hadir tercatat seluruhnya.</p>${l.berlakuSampai?`<p class="subtle">Batas paket: ${esc(date(l.berlakuSampai))}. Sisa paket yang kedaluwarsa tidak dapat digunakan.</p>`:''}${d.absensi.length?d.absensi.map(x=>`<div class="entry"><strong>${esc(date(x.tanggal))} <span class="tag">${esc(x.status)}</span></strong></div>`).join(''):'<p class="subtle">Belum ada kehadiran yang tercatat.</p>'}</section></div><section class="panel"><h3>SPP & paket</h3>${l.prestasi?`<p>Saldo kredit: <b>Rp${Number(p.saldoKredit||0).toLocaleString('id-ID')}</b></p>${p.sppMenungguOwner?'<p>Koreksi keuangan sedang menunggu persetujuan Owner.</p>':''}`:''}${(d.tagihan||[]).map(x=>`<article class="entry"><strong>${esc(x.jenisKelas)} · ${esc(x.status)}</strong><p>Rp${Number(x.totalTagihan).toLocaleString('id-ID')} · Mulai ${esc(date(x.tanggal))}</p><small>${x.berlakuSampai?'Berlaku sampai '+esc(date(x.berlakuSampai)):''}${x.sisaPertemuan!=null?' · Sisa '+esc(x.sisaPertemuan)+' pertemuan':''}${x.sppMetode?' · Pelunasan '+esc(x.sppMetode):''}</small></article>`).join('')||'<p>Belum ada tagihan tercatat.</p>'}</section><section class="panel evaluation"><h3>Evaluasi pelatih</h3>${d.evaluasi.length?d.evaluasi.map(x=>`<article class="entry"><strong>${esc(date(x.tanggal))}</strong><small>Pelatih ${esc(x.pelatih||'BRTM')}</small>${[['Teknik',x.teknik],['Fisik',x.fisik],['Sikap',x.attitude],['Catatan',x.catatan]].filter(([,v])=>v).map(([k,v])=>`<p><b>${esc(k)}:</b> ${esc(v)}</p>`).join('')}</article>`).join(''):'<p class="subtle">Evaluasi akan muncul setelah dicatat oleh pelatih.</p>'}</section>`;
  $('updated').textContent='Diperbarui '+new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(d.updatedAt))+' WIB';
}
async function refresh(){
  if(loading)return;const viewVersion=swimViewVersion;loading=true;$('refresh').disabled=true;$('statusMessage').textContent='Memuat data terbaru…';$('statusMessage').className='';
  try{const d=await request(selectedId?'owner/atlet/'+selectedId:'dashboard');if(viewVersion!==swimViewVersion)return;render(d);$('login').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;$('statusMessage').textContent='';if(!ownerMode&&d.viewRefs?.length&&!document.hidden)await request('viewed',{entries:typeof visibleParentRefs==='function'?visibleParentRefs(d):d.viewRefs});await refreshNotifications();}
  catch(e){if(e.status===401){showLogin();throw e;}$('statusMessage').textContent='Data belum diperbarui. Periksa koneksi lalu coba lagi.';$('statusMessage').className='error';throw e;}
  finally{loading=false;$('refresh').disabled=false;}
}
$('loginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;$('loginMessage').textContent='';try{await request('login',{username:$('username').value,password:$('password').value});$('password').value='';await refresh();}catch(err){$('loginMessage').textContent=err.message;}finally{b.disabled=false;}};
$('refresh').onclick=()=>refresh().catch(()=>{});
$('logout').onclick=async()=>{try{await disablePush();await request('logout',{});showLogin();}catch{$('statusMessage').textContent='Belum berhasil keluar. Periksa koneksi dan coba lagi.';}};
let installEvent;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;$('install').hidden=false;});
$('install').onclick=async()=>{if(installEvent){await installEvent.prompt();installEvent=null;}else $('installHelp').showModal();};
$('closeInstallHelp').onclick=()=>$('installHelp').close();
const installed=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
$('install').hidden=installed();
window.addEventListener('appinstalled',()=>{$('install').hidden=true;installEvent=null;});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/swim/sw.js',{scope:'/swim/'}).catch(()=>{});
// Live data while open; no personal data is written to browser storage or offline cache.
setInterval(()=>{if(!document.hidden&&!$('dashboard').hidden)refresh().catch(()=>{});},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('dashboard').hidden)refresh().catch(()=>{});});
refresh().catch(e=>{if(e.status!==401)$('loginMessage').textContent='Belum terhubung. Periksa koneksi internet.';});

$('content').addEventListener('error',e=>{if(e.target.matches('.child-photo'))e.target.replaceWith(document.createTextNode(e.target.dataset.initial||'•'));},true);
function renderOwner(d){
  $('dateLabel').textContent='BRTM SWIM • OWNER';
  document.querySelector('.page-head h1').textContent='Pantauan seluruh atlet.';
  document.querySelector('.page-head p:not(.eyebrow)').textContent='Biodata anak, akun orang tua, dan dashboard latihan.';
  $('content').innerHTML=`<div class="metrics owner-metrics">${metric('Prestasi aktif',d.counts.prestasi,'Atlet kelas Prestasi')}${metric('Pemula aktif',d.counts.pemula,'Seluruh kelas selain Prestasi')}</div><section class="panel"><div class="owner-filters"><label for="childSearch">Cari nama anak</label><input id="childSearch" placeholder="Nama lengkap atau panggilan"><label for="childFilter">Tampilkan</label><select id="childFilter"><option value="all">Semua dashboard</option><option value="prestasi">Prestasi</option><option value="pemula">Pemula</option><option value="deleted">Akun yang dihapus</option></select></div><div id="childList" class="child-list"></div></section>`;
  $('childSearch').oninput=renderChildList;$('childFilter').onchange=renderChildList;renderChildList();
  $('updated').textContent='Data langsung dari BRTM • '+d.atlet.length+' atlet terdaftar';
}
function renderChildList(){
 const q=$('childSearch').value.toLowerCase(),f=$('childFilter').value;
 const list=ownerData.atlet.filter(a=>(a.nama+' '+a.namaPanggilan).toLowerCase().includes(q)&&(f==='deleted'?a.deleted:!a.deleted)&&(f==='prestasi'?a.kelompok==='Prestasi Class':f==='pemula'?a.kelompok!=='Prestasi Class':true));
 $('childList').innerHTML=list.map(a=>`<article class="child-card"><div><h3>${esc(a.nama)}</h3><p>${esc(a.kelompok)} · ${esc(a.status)}</p><small>ID: ${esc(a.username||'Belum dibuat')} · Akses ${a.deleted?'dihapus':a.active?'aktif':'nonaktif'}</small></div><div class="owner-actions"><button data-action="open" data-id="${a.id}">Lihat dashboard</button><button data-action="account" data-id="${a.id}" data-active="${!a.active||a.deleted}">${a.deleted?'Pulihkan akun':a.active?'Nonaktifkan akun':'Aktifkan akun'}</button>${a.deleted?'':`<button class="danger" data-action="remove" data-id="${a.id}">Hapus dashboard & akun</button>`}</div></article>`).join('')||'<p class="subtle">Tidak ada anak sesuai pencarian.</p>';
}
let currentProfile=null;
const originalRender=render;
render=function(d){currentProfile=d.profil||null;originalRender(d);if(ownerMode&&d.profil)document.querySelector('.page-head h1').textContent='Dashboard '+d.profil.nama;if(!ownerMode){document.querySelector('.page-head h1').textContent='Halo, Ayah & Bunda.';document.querySelector('.page-head p:not(.eyebrow)').textContent='Perjalanan berenang anak bersama BARATHRUM.';}};
$('content').onclick=async e=>{
 const b=e.target.closest('button[data-action]');if(!b)return;
 b.disabled=true;try{
 const action=b.dataset.action,aid=b.dataset.id;
 if(action==='open'){selectedId=aid;await refresh();}
 if(action==='back'){selectedId=null;await refresh();}
 if(action==='edit')openProfileEditor(currentProfile);
 if(action==='account'){await request('owner/akun/'+aid,{active:b.dataset.active==='true'},'PUT');await refresh();}
 if(action==='remove'){
   const a=ownerData.atlet.find(a=>a.id===aid);
   $('removeText').textContent='Hapus dashboard dan akun '+a.nama+' dari BRTM SWIM? Riwayat latihan dan pembayaran di BRTM tetap tersimpan. Akses dapat dipulihkan oleh Owner.';
   $('removeConfirm').dataset.id=aid;$('removeDialog').showModal();
 }
 }catch(err){$('statusMessage').textContent=err.message;}finally{b.disabled=false;}
};
$('cancelRemove').onclick=()=>$('removeDialog').close();
$('removeConfirm').onclick=async()=>{const b=$('removeConfirm');b.disabled=true;try{await request('owner/akun/'+b.dataset.id,{},'DELETE');$('removeDialog').close();await refresh();}catch(e){$('statusMessage').textContent=e.message;}finally{b.disabled=false;}};
function openProfileEditor(a){
 $('profileFields').innerHTML=Object.entries(profileLabels).map(([k,l])=>`<label>${esc(l)}${k==='jk'?`<select name="jk"><option value="">Pilih</option>${['Laki-laki','Perempuan'].map(v=>`<option${a[k]===v?' selected':''}>${v}</option>`).join('')}</select>`:['alamat','tujuan','riwayatRenang'].includes(k)?`<textarea name="${k}" maxlength="1000">${esc(a[k])}</textarea>`:`<input name="${k}" type="${k==='tanggalLahir'?'date':'text'}" value="${esc(a[k])}" maxlength="${k==='nama'?150:1000}"${k==='nama'?' required':''}>`}</label>`).join('')+'<label>Ganti foto anak (opsional)<input name="foto" type="file" accept="image/jpeg,image/png,image/webp"></label>';
 $('profileMessage').textContent='';$('profileDialog').showModal();
}
$('cancelProfile').onclick=()=>$('profileDialog').close();
$('profileForm').onsubmit=async e=>{e.preventDefault();const b=$('saveProfile');b.disabled=true;try{
 const form=new FormData(e.target),body={};for(const k of Object.keys(profileLabels))body[k]=String(form.get(k)||'');
 const file=form.get('foto');if(file?.size){if(file.size>5*1024*1024)throw Error('Foto maksimal 5 MB.');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});body.foto={mime:file.type,base64:data.split(',')[1]};}
 await request('owner/atlet/'+selectedId,body,'PUT');$('profileDialog').close();await refresh();
 }catch(err){$('profileMessage').textContent=err.message;}finally{b.disabled=false;}};

let parentTab='dashboard',reportPool=25;
const photoDialog=document.createElement('dialog');photoDialog.id='photoViewer';photoDialog.innerHTML='<button id="closePhoto" aria-label="Tutup foto">× Tutup</button><img id="fullPhoto" alt=""><p>Foto anak</p>';document.body.append(photoDialog);
$('closePhoto').onclick=()=>{photoDialog.close();$('fullPhoto').removeAttribute('src');};photoDialog.addEventListener('close',()=>$('fullPhoto').removeAttribute('src'));
function openPhoto(image){if(!image?.matches('.child-photo'))return;$('fullPhoto').src=image.src;$('fullPhoto').alt=image.alt;photoDialog.showModal();}
$('content').addEventListener('click',e=>openPhoto(e.target));
$('content').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('.child-photo')){e.preventDefault();openPhoto(e.target);}});
const renderWithProfile=render;
render=function(d){
 renderWithProfile(d);if(!d.profil)return;
 const img=$('content').querySelector('.child-photo');if(img){img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Lihat foto '+d.profil.nama+' satu layar');img.closest('.initial').removeAttribute('aria-hidden');}
 if(!d.latihan.prestasi)return;
 const body=document.createElement('div');body.id='parentDashboard';while($('content').firstChild)body.append($('content').firstChild);$('content').append(body);
 const nav=document.createElement('nav');nav.className='parent-tabs';nav.setAttribute('aria-label','Laporan anak');nav.innerHTML='<button data-parent-tab="dashboard">Dashboard</button><button data-parent-tab="times">Laporan waktu pribadi</button>';$('content').prepend(nav);
 const report=document.createElement('section');report.id='parentTimes';report.className='panel';$('content').append(report);
 const draw=()=>{
 body.hidden=parentTab!=='dashboard';report.hidden=parentTab!=='times';nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.parentTab===parentTab)));
 const records=d.catatanwaktu||[];
 report.innerHTML=`<p class="eyebrow">PRESTASI • LAPORAN PRIBADI</p><h2>Setiap detik, ada kemajuan.</h2><p>Base time adalah hasil pertama yang tercatat. Personal best adalah waktu tercepat pada nomor dan panjang kolam yang sama. Hasil tes terakhir ditampilkan per nomor karena tes dapat berlangsung beberapa hari.</p><label>Panjang kolam <select id="reportPool"><option value="25">25 m</option><option value="50">50 m</option></select></label><p>Format menit:detik.sentidetik. Tanda — berarti belum ada hasil tes.</p><div class="time-scroll" tabindex="0" aria-label="Laporan waktu, geser ke samping"><table class="time-table"><thead><tr><th>Nomor renang</th><th>Base time</th><th>Personal best</th><th>Tes terakhir</th><th>Perubahan</th></tr></thead><tbody>${BRTMTime.report(records,reportPool).map(r=>`<tr><th>${esc(r.label)}</th><td>${BRTMTime.format(r.base?.detik)}<small>${r.base?date(r.base.tanggal):'Belum tes'}</small></td><td>${BRTMTime.format(r.best?.detik)}<small>${r.best?date(r.best.tanggal):'Belum tes'}</small></td><td>${BRTMTime.format(r.last?.detik)}<small>${r.last?date(r.last.tanggal):'Belum tes'}</small></td><td class="${r.delta===null?'':r.delta<0?'faster':r.delta>0?'slower':'same'}">${r.delta===null?'Belum pembanding':r.delta===0?'Tetap':(r.delta<0?'Lebih cepat ':'Lebih lambat ')+Math.abs(r.delta).toFixed(2)+' dtk'}</td></tr>`).join('')}</tbody></table></div><p>Perubahan dibanding hasil tes sebelumnya, pada nomor dan kolam yang sama.</p><details><summary>Riwayat lengkap tes</summary>${records.length?[...records].sort((a,b)=>BRTMTime.order(b,a)).map(x=>`<div class="entry"><strong>${esc(date(x.tanggal))} • ${x.jarak} m ${esc(x.gaya)}</strong><p>${BRTMTime.format(x.detik)} • Kolam ${x.kolam} m${x.testName?' • '+esc(x.testName):''}</p></div>`).join(''):'<p>Pelatih belum mencatat hasil tes.</p>'}</details>`;
 $('reportPool').value=String(reportPool);$('reportPool').onchange=e=>{reportPool=Number(e.target.value);draw();};
 };
 nav.onclick=e=>{const b=e.target.closest('[data-parent-tab]');if(b){parentTab=b.dataset.parentTab;draw();}};draw();
};

let pushChecked=false;
async function refreshNotifications(){
 $('notificationPanel').hidden=ownerMode;if(ownerMode)return;
 try{const list=await request('notifications');$('notificationList').innerHTML=list.slice(0,20).map(n=>`<article class="entry"><strong>${esc(n.title)}</strong><p class="announcement-body">${esc(n.body)}</p>${n.photo_id?`<a href="/swim/api/announcements/${n.photo_id}/photo" target="_blank" rel="noopener"><img class="announcement-image" src="/swim/api/announcements/${n.photo_id}/photo" alt="Foto pengumuman ${esc(n.title)}" loading="lazy"></a>`:''}<small>${esc(new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(n.created_at)))} WIB</small></article>`).join('')||'<p class="subtle">Belum ada kabar terbaru.</p>';
 if(!pushChecked&&'Notification' in window&&Notification.permission==='granted'){pushChecked=true;await registerPush(false);}
 }catch{$('pushMessage').textContent='Kabar belum dapat dimuat. Coba perbarui data.';}
}
function vapidBytes(key){const raw=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function registerPush(ask){
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Notifikasi HP belum didukung browser ini. Gunakan Chrome di Android.');
 if(ask&&await Notification.requestPermission()!=='granted')throw Error('Izin notifikasi belum diberikan. Atur izin BRTM SWIM di pengaturan browser.');
 if(Notification.permission!=='granted')return;
 const reg=await navigator.serviceWorker.ready,key=await request('push/key');
 let sub=await reg.pushManager.getSubscription();if(!sub&&!ask)return;if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidBytes(key.publicKey)});
 await request('push/subscribe',{subscription:sub.toJSON()});$('enablePush').textContent='Nonaktifkan notifikasi HP';$('enablePush').dataset.active='true';$('pushMessage').textContent='Notifikasi HP aktif pada perangkat ini.';
}
async function disablePush(){
 if(!('serviceWorker' in navigator))return;const reg=await navigator.serviceWorker.getRegistration('/swim/');const sub=await reg?.pushManager.getSubscription();
 if(sub){await request('push/unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}
 $('enablePush').textContent='Aktifkan notifikasi HP';delete $('enablePush').dataset.active;
}
$('enablePush').onclick=async()=>{const b=$('enablePush');b.disabled=true;try{if(b.dataset.active){await disablePush();$('pushMessage').textContent='Notifikasi HP dinonaktifkan.';}else await registerPush(true);}catch(e){$('pushMessage').textContent=e.message;}finally{b.disabled=false;}};
