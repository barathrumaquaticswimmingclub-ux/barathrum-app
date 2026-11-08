'use strict';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = v => v ? new Intl.DateTimeFormat('id-ID', {day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(v+'T12:00:00+07:00')) : 'Belum tercatat';
let loading = false;
async function request(url, body) {
  const r = await fetch('/swim/api/'+url, { credentials:'same-origin', ...(body ? {method:'POST',headers:{'Content-Type':'application/json','X-BRTM-Request':'1'},body:JSON.stringify(body)} : {}), cache:'no-store' });
  const d = await r.json(); if(!r.ok){const e=Error(d.pesan||'Data belum bisa dimuat.');e.status=r.status;throw e;} return d;
}
function showLogin(){ $('login').hidden=false;$('dashboard').hidden=true;$('logout').hidden=true;$('content').replaceChildren();$('password').value=''; }
const metric = (label,value,detail) => `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`;
function render(d){
  const a=d.profil,l=d.latihan,p=d.pembayaran;
  $('dateLabel').textContent=new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(d.today+'T12:00:00+07:00')).toUpperCase();
  $('content').innerHTML=`<div class="profile"><div class="initial" aria-hidden="true">${esc(a.nama.slice(0,1).toUpperCase())}</div><div><p class="eyebrow">PROFIL ATLET</p><h2>${esc(a.nama)}</h2><p>${esc(a.kelompok)} · ${esc(a.status)}</p><p>${a.tanggalLahir?'Lahir '+esc(date(a.tanggalLahir)):''}${a.sekolah?' · '+esc(a.sekolah):''}</p></div></div><div class="metrics">${metric(l.prestasi?'Latihan bulan ini':'Latihan paket ini',l.prestasi?l.hadirBulanIni:l.terpakaiPaket??'—',l.prestasi?'Kehadiran fleksibel':l.kuota!=null?'Dari '+l.kuota+' pertemuan':'Belum ada paket tercatat')}${metric('Sisa latihan',l.prestasi?'Fleksibel':l.sisaPertemuan??'—',l.prestasi?'Tidak memakai kuota pertemuan':l.statusPaket)}${metric('Terakhir bayar',p.terakhirBayar?date(p.terakhirBayar):'—',p.status)}${metric('Bayar berikutnya',p.bayarBerikutnya?date(p.bayarBerikutnya):'Konfirmasi admin',p.adaTunggakan?'Ada tagihan belum lunas':l.prestasi?'Batas SPP akhir bulan':'Perpanjang saat kuota habis atau masa berlaku berakhir')}</div><div class="grid"><section class="panel"><h3>Jadwal latihan</h3>${d.jadwal.length?d.jadwal.map(x=>`<div class="entry"><strong>${esc(date(x.tanggal))} <span class="tag">${esc(x.mulai)}–${esc(x.selesai)}</span></strong><p>${esc(x.lokasi)}</p><small>Pelatih: ${esc(x.pelatih)}</small></div>`).join(''):'<p class="subtle">Belum ada jadwal mendatang. Jadwal akan muncul setelah ditentukan oleh BRTM.</p>'}</section><section class="panel"><h3>Riwayat kehadiran</h3><p class="subtle">${esc(l.hadirBulanIni)} kali hadir bulan ini · ${esc(l.hadirTotal)} kali hadir tercatat seluruhnya.</p>${l.berlakuSampai?`<p class="subtle">Batas paket: ${esc(date(l.berlakuSampai))}. Sisa paket yang kedaluwarsa tidak dapat digunakan.</p>`:''}${d.absensi.length?d.absensi.map(x=>`<div class="entry"><strong>${esc(date(x.tanggal))} <span class="tag">${esc(x.status)}</span></strong></div>`).join(''):'<p class="subtle">Belum ada kehadiran yang tercatat.</p>'}</section></div><section class="panel evaluation"><h3>Evaluasi pelatih</h3>${d.evaluasi.length?d.evaluasi.map(x=>`<article class="entry"><strong>${esc(date(x.tanggal))}</strong><small>Pelatih ${esc(x.pelatih||'BRTM')}</small>${[['Teknik',x.teknik],['Fisik',x.fisik],['Sikap',x.attitude],['Catatan',x.catatan]].filter(([,v])=>v).map(([k,v])=>`<p><b>${esc(k)}:</b> ${esc(v)}</p>`).join('')}</article>`).join(''):'<p class="subtle">Evaluasi akan muncul setelah dicatat oleh pelatih.</p>'}</section>`;
  $('updated').textContent='Diperbarui '+new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(d.updatedAt))+' WIB';
}
async function refresh(){
  if(loading)return;loading=true;$('refresh').disabled=true;$('statusMessage').textContent='Memuat data terbaru…';$('statusMessage').className='';
  try{const d=await request('dashboard');render(d);$('login').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;$('statusMessage').textContent='';}
  catch(e){if(e.status===401){showLogin();throw e;}$('statusMessage').textContent='Data belum diperbarui. Periksa koneksi lalu coba lagi.';$('statusMessage').className='error';throw e;}
  finally{loading=false;$('refresh').disabled=false;}
}
$('loginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;$('loginMessage').textContent='';try{await request('login',{username:$('username').value,password:$('password').value});$('password').value='';await refresh();}catch(err){$('loginMessage').textContent=err.message;}finally{b.disabled=false;}};
$('refresh').onclick=()=>refresh().catch(()=>{});
$('logout').onclick=async()=>{try{await request('logout',{});showLogin();}catch{$('statusMessage').textContent='Belum berhasil keluar. Periksa koneksi dan coba lagi.';}};
let installEvent;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;$('install').hidden=false;});
$('install').onclick=async()=>{if(installEvent){await installEvent.prompt();installEvent=null;$('install').hidden=true;}};
if('serviceWorker' in navigator)navigator.serviceWorker.register('/swim/sw.js',{scope:'/swim/'}).catch(()=>{});
// Live data while open; no personal data is written to browser storage or offline cache.
setInterval(()=>{if(!document.hidden&&!$('dashboard').hidden)refresh().catch(()=>{});},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('dashboard').hidden)refresh().catch(()=>{});});
refresh().catch(e=>{if(e.status!==401)$('loginMessage').textContent='Belum terhubung. Periksa koneksi internet.';});
