'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const rupiah = value => 'Rp' + Number(value || 0).toLocaleString('id-ID');
const displayDate = value => { if(!value)return '—';const d=new Date(value+'T12:00:00+07:00');return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(d):String(value); };
const canonical = value => String(value || '').replace(/^Reguler Class/, 'Regular Class');
const title = { dashboard:'Ringkasan klub', atlet:'Data atlet', jadwal:'Jadwal latihan', absensi:'Absensi sesi', pembayaran:'SPP & paket', perkembangan:'Perkembangan atlet', catatanwaktu:'Catatan waktu', program:'Program & event', akun:'Akun tim', pelatih:'Direktori pelatih', laporan:'Laporan klub', audit:'Riwayat aktivitas', orangtua:'Akses orang tua', pendaftaran:'Data formulir', formulir:'Google Form' };
const icons = { dashboard:'◫', atlet:'♧', jadwal:'▦', absensi:'✓', pembayaran:'↗', perkembangan:'≋', catatanwaktu:'◷', program:'⚑', akun:'◎', pelatih:'♙', laporan:'▤', audit:'↺', orangtua:'◎', pendaftaran:'▤', formulir:'↗' };
const descriptions = { dashboard:'Pantau latihan, atlet, dan aktivitas klub dalam satu tempat.', atlet:'Identitas, kelas, dan perjalanan latihan setiap atlet.', jadwal:'Tentukan sesi, peserta, lokasi, serta pelatih yang bertugas.', absensi:'Catat kehadiran satu kali per atlet pada setiap sesi.', pembayaran:'Tagihan penuh, masa berlaku, dan sisa pertemuan.', perkembangan:'Catatan teknik, fisik, attitude, dan evaluasi sesi.', catatanwaktu:'Catat hasil latihan atau lomba dan pantau personal best.', program:'Program latihan Prestasi dan informasi keberangkatan event.', akun:'Tujuh akun Coach individual dan akses tim Prestasi.', pelatih:'Kontak pelatih yang tersimpan dari aplikasi sebelumnya.', laporan:'Rekap penerimaan, tagihan, kehadiran, dan cadangan data.', audit:'Jejak aktivitas akun dan perubahan data klub.', orangtua:'Akun anak untuk membuka dashboard BRTM SWIM.', pendaftaran:'Jawaban formulir dan pencocokan atlet lama.', formulir:'Dua formulir yang sama untuk atlet aktif dan peserta baru.' };
const S = { user:null, config:null, records:{}, section:'dashboard', edit:null, formKind:null, busy:false, viewToken:0 };
const isOwner = () => S.user?.role === 'owner';
const roleName = role => ({ owner:'Owner', coach:'Coach', prestasi:'Prestasi' }[role] || role);
async function request(url, options = {}) {
  const headers = { 'X-BRTM-Request':'1', ...(options.body ? { 'Content-Type':'application/json' } : {}), ...options.headers };
  let response;
  try { response = await fetch(url, { credentials:'same-origin', ...options, headers }); }
  catch { throw new Error('Koneksi terputus. Periksa internet lalu muat ulang data sebelum mencoba lagi.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401 && !url.endsWith('/login')) showLogin(); throw new Error(data.pesan || 'Permintaan belum dapat diproses.'); }
  return data;
}
function notice(message, error = false) { $('notice').textContent = message; $('notice').classList.remove('hidden'); $('notice').classList.toggle('error', error); }
function showLogin() {
  S.user = null; S.records = {}; S.config = null; S.viewToken++;
  $('app').classList.add('hidden'); $('loginView').classList.remove('hidden');
  $('dashboard').replaceChildren(); $('records').replaceChildren(); $('sectionSummary').replaceChildren();
  if ($('editor').open) $('editor').close();
}
function menuKeys() { return isOwner() ? Object.keys(title) : S.user.role === 'coach' ? ['dashboard','atlet','jadwal','absensi','perkembangan','program'] : ['dashboard','atlet','absensi','perkembangan','catatanwaktu','program']; }
function renderNav() {
  $('nav').innerHTML = menuKeys().map(k => `<button type="button" data-menu="${k}" class="${S.section===k?'active':''}"><span aria-hidden="true">${icons[k]}</span>${esc(k === 'dashboard' ? 'Dashboard' : title[k])}</button>`).join('');
  const active = $('nav').querySelector('.active'); if (active) active.setAttribute('aria-current','page');
}
async function load() {
  const uid = S.user?.id; if (!uid) return;
  $('loading').classList.remove('hidden');
  const kinds = isOwner() ? ['atlet','jadwal','absensi','pembayaran','perkembangan','catatanwaktu','program','akun','pelatih','audit','orangtua','pendaftaran','formulir'] : ['atlet','jadwal','absensi','perkembangan','program', ...(S.user.role==='prestasi'?['catatanwaktu']:[])];
  try {
    const results = await Promise.all(kinds.map(async kind => [kind, await request(isOwner()&&['perkembangan','absensi','pembayaran'].includes(kind)?'/api/owner/activity/'+kind:'/api/'+kind)]));
    if (S.user?.id !== uid) return;
    S.records = Object.fromEntries(results); renderCurrent();
  } finally { $('loading').classList.add('hidden'); }
}
async function start(user) {
  S.user = user; $('loginView').classList.add('hidden');
  if (user.mustChangePassword) { $('app').classList.add('hidden'); openPassword(true); return; }
  S.config = await request('/api/config'); $('app').classList.remove('hidden');
  $('userName').textContent = user.nama; $('roleBadge').textContent = roleName(user.role); $('accountButton').textContent = user.nama.slice(0,1).toUpperCase();
  $('dateLabel').textContent = new Intl.DateTimeFormat('id-ID',{ weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Jakarta' }).format(new Date()).toUpperCase();
  S.section = 'dashboard'; $('notice').classList.add('hidden'); renderNav(); await load();
}
function canWrite(kind) { return isOwner() ? !['dashboard','laporan','audit','orangtua','pendaftaran','formulir'].includes(kind) : S.user?.role==='coach' ? ['absensi','perkembangan'].includes(kind) : ['absensi','perkembangan','catatanwaktu','program'].includes(kind); }
function badge(value) { const good=['Lunas','Aktif','Hadir','Bulanan'].includes(value), bad=['Nonaktif','Kedaluwarsa','Habis','Alpa'].includes(value); return `<span class="tag ${good?'good':bad?'bad':'warn'}">${esc(value||'—')}</span>`; }
function mini(titleText, detail, right = '', bottom='') { return `<div class="mini-row"><div><strong>${esc(titleText)}</strong><small>${esc(detail)}</small></div><div class="right">${right}<br><small>${esc(bottom)}</small></div></div>`; }
function empty(heading, detail = '') { return `<div class="empty"><strong>${esc(heading)}</strong>${esc(detail)}</div>`; }
function stat(label, value, detail, mint=false) { return `<div class="stat ${mint?'mint':''}"><span class="label">${esc(label)}</span><strong class="${String(value).startsWith('Rp')?'money':''}">${esc(value)}</strong><small>${esc(detail)}</small></div>`; }
function renderDashboard() {
  const r = S.records, athletes = r.atlet || [], schedules = r.jadwal || [], attendance = r.absensi || [], today = S.config.today;
  const active = athletes.filter(a => a.status !== 'Nonaktif'); const sessions = schedules.filter(s => s.tanggal === today);
  const next = schedules.filter(s => s.tanggal >= today).sort((a,b) => (a.tanggal+a.mulai).localeCompare(b.tanggal+b.mulai)).slice(0,5);
  const paid = (r.pembayaran || []).filter(p => p.status === 'Lunas');
  const income = paid.filter(p => (p.dibayarPada || p.tanggal)?.slice(0,7) === today.slice(0,7)).reduce((n,p) => n + p.totalTagihan, 0);
  const due = active.filter(a => a.statusSPP && a.statusSPP !== 'Lunas');
  $('dashboard').innerHTML = `<div class="hero"><div><p class="eyebrow">${isOwner()?'PUSAT PENGELOLAAN KLUB':'RUANG KERJA '+roleName(S.user.role).toUpperCase()}</p><h2>Siap untuk sesi berikutnya.</h2><p>${sessions.length ? `${sessions.length} sesi terjadwal hari ini. Selamat mendampingi atlet BRTM.` : 'Atur setiap sesi, catat perkembangannya, dan terus bergerak maju.'}</p></div><div class="hero-mark" aria-hidden="true"><img src="/brand/barathrum-logo.png" alt="" width="1536" height="1404"></div></div><div class="stats">${stat('Atlet aktif',active.length,'Dari '+athletes.length+' atlet terdaftar')}${stat('Sesi hari ini',sessions.length,displayDate(today))}${stat('Kehadiran hari ini',attendance.filter(a=>a.tanggal===today&&a.status==='Hadir').length,'Atlet tercatat hadir')}${isOwner()?stat('Penerimaan bulan ini',rupiah(income),'Hanya pembayaran berstatus Lunas',true):stat('Catatan perkembangan',(r.perkembangan||[]).length,'Evaluasi yang tersimpan',true)}</div><div class="dashboard-grid"><div class="panel"><div class="panel-head"><h3>Sesi mendatang</h3><button data-go="jadwal">Lihat jadwal →</button></div>${next.map(s=>mini(s.nama,`${displayDate(s.tanggal)} · ${s.jam||''} · ${s.lokasi||''}`,badge(s.tanggal===today?'Hari ini':'Terjadwal'),s.pelatih||'')).join('')||empty('Belum ada jadwal mendatang',isOwner()?'Tambah jadwal dan tugaskan pelatih pada menu Jadwal latihan.':'Owner akan menugaskan sesi latihan Anda.')}</div><div class="panel"><div class="panel-head"><h3>${isOwner()?'Pantauan SPP':'Atlet & paket'}</h3><button data-go="atlet">Lihat atlet →</button></div>${(isOwner()?due:active).slice(0,5).map(a=>mini(a.nama,a.kelompok,badge(isOwner()?a.statusSPP:a.statusPaket),a.jatuhTempo?displayDate(a.jatuhTempo):a.sisaPertemuan!=null?a.sisaPertemuan+' sesi tersisa':'Bulanan')).join('')||empty(isOwner()?'Tidak ada SPP yang perlu ditinjau':'Belum ada atlet ditugaskan',isOwner()?'Pantauan mengikuti paket dan pembayaran yang tercatat.':'Atlet tampil setelah Owner memasukkannya ke jadwal Anda.')}<p class="muted">${isOwner()?'Prestasi jatuh tempo akhir bulan. Paket nonprestasi mengikuti masa berlaku dan kuota pertemuan.':'Hadir mengurangi kuota paket. Izin, Sakit, dan Alpa tidak mengurangi kuota.'}</p></div></div>`;
}
function navigate(kind) {
  if (!menuKeys().includes(kind)) return;
  S.section=kind; $('search').value=''; $('filter').innerHTML=''; $('monthFilter').value='';
  renderNav(); configureFilter(); renderCurrent();
  window.scrollTo({top:0,behavior:'smooth'});
}
function configureFilter() {
  const k=S.section; let values=[];
  if(k==='atlet')values=['Aktif','Nonaktif',...Object.keys(S.config.classes)];
  if(k==='jadwal')values=['Hari ini','Mendatang','Sudah lewat'];
  if(k==='absensi')values=['Hadir','Izin','Sakit','Alpa'];
  if(k==='pembayaran')values=['Lunas','Belum Lunas','Aktif','Kedaluwarsa','Habis'];
  if(k==='catatanwaktu')values=['Bebas','Punggung','Dada','Kupu-kupu','Ganti'];
  if(k==='program')values=['Program','Event'];
  $('filter').innerHTML='<option value="">Semua</option>'+values.map(v=>`<option>${esc(v)}</option>`).join(''); $('filter').classList.toggle('hidden',!values.length);
  $('monthFilter').classList.toggle('hidden',!['laporan','pembayaran','absensi','program'].includes(k));
}
function renderCurrent() {
  if (!S.user || !S.config) return;
  const k=S.section; $('pageTitle').textContent=title[k]; $('pageDescription').textContent=descriptions[k];
  $('dashboard').classList.toggle('hidden',k!=='dashboard'); $('listSection').classList.toggle('hidden',k==='dashboard');
  $('addButton').classList.toggle('hidden',!canWrite(k)||k==='akun'); $('addButton').textContent='＋ '+(k==='absensi'?'Catat kehadiran':k==='pembayaran'?'Tambah tagihan':'Tambah');
  $('search').classList.toggle('hidden',k==='laporan');
  if(k==='dashboard')renderDashboard();else renderList();
}
function filteredRows() {
  const k=S.section,q=$('search').value.toLowerCase(),f=$('filter').value,m=$('monthFilter').value;
  return (S.records[k]||[]).filter(x=>{
    const names=k==='jadwal'?(x.atletIds||[]).map(id=>(S.records.atlet||[]).find(a=>a.id===String(id))?.nama||'').join(' '):'';
    if(q&&!(Object.values(x).filter(v=>typeof v!=='object').join(' ')+' '+names).toLowerCase().includes(q))return false;
    if(m&&['absensi','pembayaran','program'].includes(k)&&x.tanggal?.slice(0,7)!==m)return false;
    if(!f)return true;
    if(k==='jadwal')return f==='Hari ini'?x.tanggal===S.config.today:f==='Mendatang'?x.tanggal>=S.config.today:x.tanggal<S.config.today;
    return [x.status,x.kelompok,x.statusMasaBerlaku,x.gaya,x.jenis].includes(f);
  });
}
function details(entries) { return '<dl>'+entries.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([label,value])=>`<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')+'</dl>'; }
function actions(kind,row) {
  const editable=canWrite(kind)&&(isOwner()||String(row.dibuatOlehId||row.coachId||'')===S.user.id||row.dibuatOleh===S.user.username);
  let html=editable?`<button class="secondary" data-edit="${esc(row.id)}">Edit</button>`:'';
  if(isOwner()&&kind!=='akun')html+=`<button class="danger" data-delete="${esc(row.id)}">Hapus</button>`;
  if(isOwner()&&kind==='pembayaran'&&row.jenisKelas!=='Prestasi Class')html+=`<button class="secondary" data-exception="${esc(row.id)}">Perpanjang khusus</button>`;
  if(isOwner()&&kind==='akun'&&row.id!==S.user.id)html+=`<button class="secondary" data-reset="${esc(row.id)}">Buat kata sandi awal</button>`;
  if(isOwner()&&kind==='atlet'&&row.noHpOrtu&&row.statusSPP!=='Lunas'){
    let phone=row.noHpOrtu.replace(/\D/g,'');if(phone.startsWith('0'))phone='62'+phone.slice(1);
    const msg=`Halo, Bapak/Ibu orang tua ${row.nama}. Kami dari BRTM mengingatkan SPP/paket ${row.kelompok}${row.jatuhTempo?' dengan tanggal batas '+displayDate(row.jatuhTempo):''}. Mohon menghubungi admin kami untuk konfirmasi pembayaran. Terima kasih🙏🏻`;
    html+=`<a ${/Android/i.test(navigator.userAgent)?'':'target="_blank" rel="noopener"'} href="${esc(whatsappReminderLink(phone,msg))}">Ingatkan via WA Business</a>`;
  }
  return html?`<div class="actions">${html}</div>`:'';
}
function whatsappReminderLink(phone, message, android = /Android/i.test(navigator.userAgent)) {
  const query = 'phone=' + encodeURIComponent(phone) + '&text=' + encodeURIComponent(message);
  if (!android) return 'https://wa.me/' + encodeURIComponent(phone) + '?text=' + encodeURIComponent(message);
  const fallback = encodeURIComponent('https://play.google.com/store/apps/details?id=com.whatsapp.w4b');
  return 'intent://send?' + query + '#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=' + fallback + ';end;';
}
function card(row) {
  const k=S.section;let name='',sub='',tag='',content='';
  if(k==='atlet') {name=row.nama;sub=row.kelompok;tag=badge(row.status);content=details([['Sekolah',row.sekolah],['Kelas',row.kelasSekolah],['Paket',row.statusPaket],['Sisa sesi',row.sisaPertemuan??(row.kelompok==='Prestasi Class'?'Bulanan':'Belum ada paket')],['Berlaku s.d.',row.berlakuSampai?displayDate(row.berlakuSampai):'—'],...(isOwner()?[['SPP',row.statusSPP],['WhatsApp',row.noHpOrtu],['Tanggal lahir',row.tanggalLahir?displayDate(row.tanggalLahir):''],['Alamat',row.alamat],['Tujuan',row.tujuan]]:[])]);}
  if(k==='jadwal'){name=row.nama;sub=row.jenisKelas||'Jadwal lama';tag=badge(row.statusSesi==='Libur'?'Libur':row.tanggal===S.config.today?'Hari ini':row.tanggal<S.config.today?'Selesai':'Terjadwal');content=details([['Tanggal',row.tanggal?displayDate(row.tanggal):row.hari],['Jam',row.jam],['Pelatih',row.pelatih],['Lokasi',row.lokasi],['Peserta',(row.atletIds||[]).map(id=>(S.records.atlet||[]).find(a=>a.id===String(id))?.nama||'Atlet #'+id).join(', ')]])+(row.alasanPerubahan?`<p class="detail">Jadwal pengganti: ${esc(row.alasanPerubahan)}</p>`:'');}
  if(k==='absensi'){name=row.namaAtlet;sub=displayDate(row.tanggal);tag=badge(row.status);content=details([['Sesi',(S.records.jadwal||[]).find(s=>s.id===row.jadwalId)?.nama||'Catatan lama'],['Pelatih',row.pelatih||row.dibuatOleh],['Paket',row.paketId?'1 pertemuan tercatat':'Tanpa pengurangan paket']]);}
  if(k==='pembayaran'){name=row.namaAtlet;sub=row.jenisKelas;tag=badge(row.status);content=`<div class="total">${esc(rupiah(row.totalTagihan))}</div>`+details([['Mulai',displayDate(row.tanggal)],['Berlaku s.d.',row.berlakuSampai?displayDate(row.berlakuSampai):'Perlu diperiksa'],['Sisa sesi',row.sisaPertemuan===null?'Bulanan':`${row.sisaPertemuan} / ${row.totalPertemuan}`],['Status paket',row.statusMasaBerlaku],['Pendaftaran',rupiah(row.biayaPendaftaran)],['Diskon',rupiah(row.potonganDiskon)],...(row.pengecualian?[['Pengecualian',row.pengecualian.alasan]]:[])]);}
  if(k==='perkembangan'){name=row.namaAtlet;sub=displayDate(row.tanggal);tag=`<span class="tag">${esc(row.pelatih||row.dibuatOleh||'Evaluasi')}</span>`;content=details([['Teknik',row.teknik],['Fisik',row.fisik],['Attitude',row.attitude]]);}
  if(k==='catatanwaktu'){
    name=row.namaAtlet;sub=`${row.jarak} m ${row.gaya} · Kolam ${row.kolam} m`;
    const group=(S.records.catatanwaktu||[]).filter(x=>x.atletId===row.atletId&&x.gaya===row.gaya&&x.jarak===row.jarak&&x.kolam===row.kolam);
    const best=Math.min(...group.map(x=>Number(x.detik)));tag=Number(row.detik)===best?'<span class="pb">PERSONAL BEST</span>':'';
    content=`<div class="total">${esc(formatTime(row.detik))}</div>`+details([['Tanggal',displayDate(row.tanggal)],['Event',row.event||'Latihan'],['Pencatat',row.dibuatOleh]]);
  }
  if(k==='program'){name=row.judul||row.jenis+' Prestasi';sub=displayDate(row.tanggal);tag=badge(row.jenis);content=details([['Kelas / grup',row.grup],['Lokasi',row.lokasi],['Pencatat',row.dibuatOleh]])+[['Dryland',row.dryland],['Swimming',row.swimming],['Evaluasi',row.evaluasi],['Informasi',row.detail]].filter(([,v])=>v).map(([k,v])=>`<h4>${k}</h4><p class="detail">${esc(v)}</p>`).join('')+(row.grupProgram||[]).map(g=>`<section class="program-group-view"><h4>Grup ${esc(g.nomor)}</h4>${g.swimming?`<p class="detail">${esc(g.swimming)}</p>`:''}${g.adaFoto&&['owner','prestasi'].includes(S.user.role)?`<a href="/api/prestasi/program/${row.id}/photo/${g.nomor}" target="_blank" rel="noopener"><img class="program-group-photo" src="/api/prestasi/program/${row.id}/photo/${g.nomor}" alt="Foto program Grup ${g.nomor}" loading="lazy"></a>`:''}</section>`).join('')+(['owner','prestasi'].includes(S.user.role)?`<div class="actions"><a href="/api/prestasi/program/${row.id}/word" download>Unduh Word</a></div>`:'');}
  if(k==='akun'){name=row.nama;sub='@'+row.username;tag=badge(row.active?'Aktif':'Nonaktif');content=details([['Akses',roleName(row.role)],['Kata sandi',row.mustChangePassword?'Wajib ganti saat masuk':'Sudah diganti']]);}
  if(k==='pelatih'){name=row.nama;sub=row.spesialisasi||'Pelatih BRTM';tag='';content=details([['Telepon',row.noHp]]);}
  if(k==='audit'){name=({tambah:'Tambah data',ubah:'Ubah data',hapus:'Hapus data',masuk:'Masuk ke akun','reset-kata-sandi':'Reset kata sandi','ubah-kata-sandi':'Ganti kata sandi',aktivasi:'Aktivasi klub','ubah-akun':'Ubah akun'}[row.action]||row.action);sub='@'+row.username;tag=`<span class="tag">${esc(row.jenis||'Akun')}</span>`;content=details([['Waktu',new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(row.created_at))],['ID data',row.record_id]]);}
  return `<article class="record"><div class="record-head"><div><h3>${esc(name||'Data lama')}</h3><p>${esc(sub)}</p></div>${tag}</div>${k==='atlet'&&row.foto?`<a href="${esc(row.foto)}" target="_blank" rel="noopener"><img class="athlete-photo" src="${esc(row.foto)}" alt="Foto ${esc(row.nama)}" loading="lazy"></a>`:''}${content}${row.catatan?`<p class="detail">${esc(row.catatan)}</p>`:''}${actions(k,row)}<p class="code">#${esc(row.id)}</p></article>`;
}
function formatTime(v) {const n=Number(v);return n>=60?Math.floor(n/60)+':'+(n%60).toFixed(2).padStart(5,'0'):n.toFixed(2)+' detik';}
function renderList() {
  const k=S.section;
  if(['orangtua','pendaftaran','formulir'].includes(k)){renderIntake();return;}
  if(k==='laporan'){renderReports();return;}
  const list=filteredRows();
  const banners={jadwal:'Jadwal dibuat per tanggal. Coach pengganti ditentukan Owner melalui Edit. Memindah jadwal tidak menambah kuota paket.',absensi:'Hanya Hadir yang mengurangi kuota. Paket nonprestasi harus tercatat, belum habis, dan berlaku pada tanggal sesi. Tagihan Belum Lunas tetap dapat digunakan; status pembayaran tidak berubah. Prestasi menggunakan SPP bulanan.',pembayaran:'Tarif dan diskon dihitung server. Tidak ada DP/cicilan. Status Belum Lunas berarti tagihan belum dibayar. Masa paket satu bulan; sisa hangus setelah berakhir.',akun:'Coach 1–7 dapat bergantian mengajar atlet yang sama sesuai penugasan jadwal. Ubah nama akun lalu buat kata sandi awal untuk diberikan kepada pelatih.',pelatih:'Data kontak dari aplikasi lama. Penugasan jadwal memakai akun individual pada menu Akun tim.',catatanwaktu:'Personal best dibandingkan untuk atlet, gaya, jarak, dan panjang kolam yang sama.',audit:'Menampilkan 200 aktivitas terbaru. Riwayat lengkap ikut dalam unduhan cadangan.'};
  $('sectionSummary').innerHTML=banners[k]?`<div class="section-banner">${esc(banners[k])}</div>`:'';
  $('records').className='record-list';$('records').innerHTML=list.map(card).join('')||empty('Belum ada data yang ditampilkan',canWrite(k)?'Gunakan tombol Tambah untuk memulai.':'Data muncul setelah tersimpan dan sesuai akses akun Anda.');
}
function renderReports(){
  const month=$('monthFilter').value,payments=(S.records.pembayaran||[]).filter(p=>!month||(p.dibayarPada||p.tanggal)?.slice(0,7)===month),attendance=(S.records.absensi||[]).filter(a=>!month||a.tanggal?.slice(0,7)===month);
  const total=payments.reduce((n,p)=>n+p.totalTagihan,0),income=payments.filter(p=>p.status==='Lunas').reduce((n,p)=>n+p.totalTagihan,0);
  $('sectionSummary').innerHTML=`<div class="stats">${stat('Uang diterima',rupiah(income),'Pembayaran berstatus Lunas',true)}${stat('Belum dibayar',rupiah(total-income),'Tagihan berstatus Belum Lunas')}${stat('Total tagihan',rupiah(total),'Seluruh transaksi pada periode')}${stat('Kehadiran',attendance.filter(a=>a.status==='Hadir').length,'Dari '+attendance.length+' catatan absensi')}</div><div class="account-actions"><button class="primary" data-export="csv">Unduh laporan CSV</button><a href="/api/backup" class="secondary download" download>Unduh cadangan lengkap</a></div><div class="section-banner">Filter bulan memakai tanggal pembayaran untuk transaksi lunas dan tanggal mulai untuk tagihan belum lunas. Cadangan lengkap mencakup seluruh data dan riwayat, tanpa kata sandi akun. SPP Prestasi yang belum dibuat tagihannya terlihat di pantauan atlet.</div>`;
  $('sectionSummary').innerHTML+='<div class="account-actions"><button id="resetTester" class="danger">Arsipkan semua data tester</button><button id="restoreTester">Pulihkan arsip tester terakhir</button></div>';
  $('resetTester').onclick=async()=>{try{const p=await request('/api/tester/preview');if(!confirm('Arsipkan '+p.jumlahAtlet+' atlet dan '+p.jumlahRiwayat+' riwayat tester? Data aktif dikosongkan. Akun tim dan pengaturan formulir tetap tersedia. Arsip dapat dipulihkan sebelum ada data baru.'))return;await request('/api/tester/reset',{method:'POST',body:JSON.stringify({fingerprint:p.fingerprint,confirmation:'ARSIPKAN SEMUA DATA TESTER'})});await load();}catch(e){notice(e.message,true);}};
  $('restoreTester').onclick=async()=>{try{const all=await request('/api/tester/arsip'),a=all.find(x=>!x.restored_at);if(!a)throw Error('Belum ada arsip tester.');if(!confirm('Pulihkan arsip tester terakhir? Hanya tersedia jika belum ada data latihan baru.'))return;await request('/api/tester/restore/'+a.id,{method:'POST',body:'{}'});await load();}catch(e){notice(e.message,true);}};
  $('records').className='record-list';const active=(S.records.atlet||[]).filter(a=>a.status!=='Nonaktif'),due=active.filter(a=>a.statusSPP!=='Lunas');
  $('records').innerHTML=`<div class="panel"><h3>Ringkasan atlet</h3>${mini('Atlet aktif',active.length+' atlet',badge('Aktif'))}${mini('Perlu ditinjau SPP',due.length+' atlet',badge('Pantauan'))}${mini('Paket kedaluwarsa',(S.records.pembayaran||[]).filter(p=>p.statusMasaBerlaku==='Kedaluwarsa').length+' paket',badge('Kedaluwarsa'))}</div><div class="panel"><h3>Rekap kehadiran</h3>${['Hadir','Izin','Sakit','Alpa'].map(s=>mini(s,attendance.filter(a=>a.status===s).length+' catatan',badge(s))).join('')}</div>`;
}
function field(name,label,type='text',value='',options={}) {
  const required=options.required!==false,req=required?' required':'',full=options.full?' full':''; let input;
  if(Array.isArray(type))input=`<select id="f_${name}" name="${name}"${req}${options.disabled?' disabled':''}>${options.placeholder!==false?'<option value="">Pilih…</option>':''}${type.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}"${String(v)===String(value)?' selected':''}>${esc(l)}</option>`}).join('')}</select>`;
  else if(type==='textarea')input=`<textarea id="f_${name}" name="${name}"${req} maxlength="${options.max||2000}">${esc(value)}</textarea>`;
  else input=`<input id="f_${name}" name="${name}" type="${type}" value="${esc(value)}"${req}${options.readonly?' readonly':''}${type==='number'?' min="0.01" step="0.01"':''}${type==='password'?' minlength="5" maxlength="128" autocomplete="new-password"':''}${options.max?' maxlength="'+options.max+'"':''}>`;
  return `<div class="field${full}"><label for="f_${name}">${esc(label)}${required?' *':''}</label>${input}${options.help?'<small>'+esc(options.help)+'</small>':''}</div>`;
}
function check(name,label,checked=false){return `<label class="check"><input type="checkbox" name="${name}" id="f_${name}"${checked?' checked':''}>${esc(label)}</label>`;}
function athleteOptions(items=S.records.atlet||[]){return items.filter(a=>a.status!=='Nonaktif'||a.id===S.edit?.atletId).map(a=>[a.id,a.nama+' · '+a.kelompok]);}
function openForm(kind, row = null){
  if(!canWrite(kind))return; if(kind==='perkembangan'&&row&&!row.jadwalId)return openNoteEditor(row); if(S.user.role==='prestasi'&&!row&&['absensi','perkembangan','catatanwaktu'].includes(kind))return openTeamEntry(kind); S.formKind=kind;S.edit=row;let f='',v=row||{};
  $('dialogEyebrow').textContent='BARATHRUM • '+roleName(S.user.role).toUpperCase();$('dialogTitle').textContent=(row?'Edit ':'Tambah ')+title[kind].toLowerCase();$('saveButton').textContent='Simpan data';$('formMessage').textContent='';$('cancelDialog').textContent='Batal';
  if(kind==='atlet'){
    f=field('nama','Nama lengkap','text',v.nama,{full:true})+field('namaPanggilan','Nama panggilan','text',v.namaPanggilan,{required:false})+field('namaOrtu','Nama orang tua / wali','text',v.namaOrtu,{required:false})+field('riwayatRenang','Riwayat latihan renang','textarea',v.riwayatRenang,{required:false,full:true,max:500})+field('tempatLahir','Tempat lahir','text',v.tempatLahir,{required:false})+field('tanggalLahir','Tanggal lahir','date',v.tanggalLahir,{required:false})+field('jk','Jenis kelamin',['Laki-laki','Perempuan'],v.jk,{required:false})+field('noHpOrtu','WhatsApp orang tua','tel',v.noHpOrtu,{required:false,help:'Contoh: 081234567890'})+field('sekolah','Sekolah','text',v.sekolah,{required:false,help:'Untuk diskon gunakan: DBS, ABA 5, Ebenhaezer, atau TEC.'})+field('kelasSekolah','Kelas sekolah','text',v.kelasSekolah,{required:false})+field('kelompok','Jenis kelas',Object.keys(S.config.classes),canonical(v.kelompok))+field('status','Status',['Aktif','Nonaktif'],v.status||'Aktif')+field('alamat','Alamat','textarea',v.alamat,{required:false,full:true,max:500})+field('tujuan','Tujuan latihan','textarea',v.tujuan,{required:false,full:true,max:500})+field('catatan','Catatan khusus','textarea',v.catatan,{required:false,full:true});
  }
  if(kind==='jadwal'){
    f=field('nama','Nama sesi','text',v.nama,{full:true})+field('tanggal','Tanggal sesi','date',v.tanggal||S.config.today)+field('jenisKelas','Jenis kelas',Object.keys(S.config.classes),canonical(v.jenisKelas))+field('mulai','Jam mulai','time',v.mulai||'15:00')+field('selesai','Jam selesai','time',v.selesai||'16:00')+field('statusSesi','Status sesi',['Terjadwal','Libur'],v.statusSesi||'Terjadwal')+field('alasanLibur','Alasan libur','textarea',v.alasanLibur,{required:false,full:true,max:500,help:'Wajib saat memilih Libur. Kuota tetap; paket yang terkait diperpanjang 7 hari.'})+field('lokasi','Lokasi','text',v.lokasi||'Hotel Grand Wahid Salatiga')+field('coachId','Pelatih bertugas',(S.records.akun||[]).filter(u=>u.active&&u.role!=='owner').map(u=>[u.id,u.nama]),v.coachId)+`<div class="field full"><label>Peserta sesi *</label><input id="athleteSearch" type="search" placeholder="Cari atlet kelas ini…" aria-label="Cari peserta"><div id="athleteChecks" class="athlete-checks"></div><small>Pilih jenis kelas dahulu, lalu centang atlet yang akan mengikuti sesi.</small></div>`+field('catatan','Catatan sesi','textarea',v.catatan,{required:false,full:true})+(row?field('alasanPerubahan','Alasan perubahan jadwal/pelatih','textarea','',{required:false,full:true,max:500,help:'Wajib jika tanggal, jam mulai, pelatih, atau peserta diubah.'}):'');
  }
  if(kind==='pembayaran'){
    const matched=v.atletId||(S.records.atlet||[]).filter(a=>a.nama===v.namaAtlet).length===1&&(S.records.atlet||[]).find(a=>a.nama===v.namaAtlet)?.id||'';
    f=field('atletId','Atlet',athleteOptions(),matched,{full:true})+field('jenisKelas','Jenis kelas',Object.keys(S.config.classes),canonical(v.jenisKelas),{help:'Mengikuti kelas atlet.'})+field('tanggal','Tanggal mulai paket / bulan SPP','date',v.tanggal||S.config.today)+field('status','Status pembayaran',['Lunas','Belum Lunas'],v.status||'Lunas')+`<div class="field">${check('anggotaBaru','Anggota baru: pendaftaran Rp50.000',v.biayaPendaftaran>0)}${check('diskonSekolah','Gunakan diskon sekolah Rp25.000',v.potonganDiskon>0)}</div><div class="estimate" id="estimate"></div>`+`<div class="field full">${check('paketKhusus','Gunakan kuota dan biaya khusus (Owner)',v.paketKhusus)}</div>`+field('kuotaKhusus','Jumlah pertemuan khusus','number',v.paketKhusus?v.totalPertemuan:'',{required:false})+field('biayaKhusus','Biaya paket khusus (Rp)','number',v.paketKhusus?v.jumlah:'',{required:false})+field('alasanKhusus','Keterangan paket khusus','text',v.alasanKhusus,{required:false,full:true,max:500,help:'Contoh: Private 2x seminggu, 8 pertemuan per bulan.'})+field('catatan','Catatan pembayaran','textarea',v.catatan,{required:false,full:true,max:1000});
  }
  if(['absensi','perkembangan'].includes(kind)){
    const schedules=(S.records.jadwal||[]).filter(s=>s.statusSesi!=='Libur'&&s.tanggal&&s.tanggal<=S.config.today);
    f=field('jadwalId','Sesi latihan',schedules.map(s=>[s.id,displayDate(s.tanggal)+' · '+s.nama+' · '+s.jam]),v.jadwalId,{full:true,disabled:!!row?.jadwalId})+field('atletId','Atlet',athleteOptions(),v.atletId,{disabled:!!row?.atletId})+field('tanggal','Tanggal sesi','date',v.tanggal||S.config.today,{readonly:true});
    if(kind==='absensi')f+=field('status','Kehadiran',['Hadir','Izin','Sakit','Alpa'],v.status||'Hadir');
    else f+=field('teknik','Perkembangan teknik','textarea',v.teknik,{required:false,full:true,max:1000})+field('fisik','Kondisi fisik','textarea',v.fisik,{required:false,max:1000})+field('attitude','Attitude','textarea',v.attitude,{required:false,max:1000});
    f+=field('catatan','Catatan khusus','textarea',v.catatan,{required:false,full:true});
    if(!schedules.length)f='<div class="readonly-notice">Belum ada sesi yang dapat diisi. Owner perlu menambahkan jadwal bertanggal hari ini atau sebelumnya dan menentukan pesertanya.</div>'+f;
  }
  if(kind==='catatanwaktu')f=field('atletId','Atlet Prestasi',athleteOptions((S.records.atlet||[]).filter(a=>a.kelompok==='Prestasi Class')),v.atletId,{full:true,disabled:!!row?.atletId})+field('tanggal','Tanggal','date',v.tanggal||S.config.today,{readonly:!!row})+field('gaya','Gaya',['Bebas','Punggung','Dada','Kupu-kupu','Ganti'],v.gaya)+field('jarak','Jarak (meter)',[25,50,100,200,400,800,1500,2000],v.jarak||50)+field('kolam','Panjang kolam (meter)',[25],v.kolam||25)+field('detik','Waktu total (detik)','number',v.detik,{help:'Contoh: 65,42 detik untuk 1 menit 5,42 detik.'})+field('event','Nama event / latihan','text',v.event,{required:false})+field('catatan','Catatan evaluasi','textarea',v.catatan,{required:false,full:true,max:1000});
  if(kind==='program')f=field('jenis','Jenis',['Program','Event'],v.jenis||'Program')+'<div class="field"><label>Tanggal otomatis (WIB)</label><p id="programDate">Memeriksa tanggal server…</p></div>'+field('lokasi','Lokasi','text',v.lokasi,{required:false,full:true,max:300})+field('detail','Informasi tambahan / detail event','textarea',v.detail,{required:false,full:true,max:10000,help:'Untuk event: tulis peserta, waktu kumpul, kendaraan, bekal, dan catatan keberangkatan.'});
  if(kind==='akun')f=field('nama','Nama pelatih / akun','text',v.nama,{full:true,max:100})+field('username','ID login','text',v.username,{max:40,help:'3–40 huruf kecil atau angka; boleh titik, garis bawah, dan tanda hubung.'})+(v.id!==S.user.id?field('password','Kata sandi baru','password','',{required:false,help:'Kosongkan jika tidak ingin mengganti kata sandi. Minimal 5 karakter.'}):'')+`<div class="field full">${check('active','Akun aktif',v.active)}</div><div class="readonly-notice">Akses: ${roleName(v.role)}. Mengganti ID atau kata sandi mengakhiri sesi login akun ini.</div>`;
  if(kind==='pelatih')f=field('nama','Nama pelatih','text',v.nama,{full:true})+field('noHp','Telepon','tel',v.noHp,{required:false})+field('spesialisasi','Spesialisasi','text',v.spesialisasi,{required:false});
  $('formFields').innerHTML=f;
  if(kind==='jadwal'){updateAthleteChecks(v.atletIds||[]);$('f_jenisKelas').onchange=()=>updateAthleteChecks([]);$('athleteSearch').oninput=()=>{const q=$('athleteSearch').value.toLowerCase();$('athleteChecks').querySelectorAll('label').forEach(l=>l.classList.toggle('hidden',!l.textContent.toLowerCase().includes(q)));};}
  if(kind==='pembayaran'){$('f_atletId').onchange=()=>updateEstimate(true);$('f_jenisKelas').onchange=()=>updateEstimate(false);$('f_anggotaBaru').onchange=()=>updateEstimate(false);$('f_diskonSekolah').onchange=()=>updateEstimate(false);for(const n of ['paketKhusus','kuotaKhusus','biayaKhusus'])$('f_'+n).oninput=()=>updateEstimate(false);updateEstimate(!row);}
  if(['absensi','perkembangan'].includes(kind)){$('f_jadwalId').onchange=()=>syncAttendance();if(v.jadwalId)syncAttendance(v.atletId);else syncAttendance();}
  if(!$('editor').open)$('editor').showModal();
}
function updateAthleteChecks(selected){const kind=$('f_jenisKelas').value,list=(S.records.atlet||[]).filter(a=>a.kelompok===kind&&a.status!=='Nonaktif');$('athleteChecks').innerHTML=list.map(a=>`<label class="check"><input type="checkbox" name="atletIds" value="${a.id}"${selected.map(String).includes(a.id)?' checked':''}>${esc(a.nama)}</label>`).join('')||'<small>Tidak ada atlet aktif untuk kelas ini.</small>';}
function syncAttendance(selected){const sid=$('f_jadwalId').value,sch=(S.records.jadwal||[]).find(s=>s.id===sid);if(!sch){$('f_atletId').innerHTML='<option value="">Pilih sesi terlebih dahulu</option>';return;}$('f_tanggal').value=sch.tanggal;const opts=athleteOptions((S.records.atlet||[]).filter(a=>sch.atletIds?.map(String).includes(a.id)));$('f_atletId').innerHTML='<option value="">Pilih atlet…</option>'+opts.map(([v,l])=>`<option value="${v}"${v===selected?' selected':''}>${esc(l)}</option>`).join('');}
function updateEstimate(syncClass){const a=(S.records.atlet||[]).find(a=>a.id===$('f_atletId').value);if(syncClass&&a)$('f_jenisKelas').value=a.kelompok;const c=S.config.classes[$('f_jenisKelas').value],reg=$('f_anggotaBaru').checked?50000:0,disc=$('f_diskonSekolah').checked?25000:0;const custom=$('f_paketKhusus').checked;const tarif=custom?Number($('f_biayaKhusus').value):c?.tarif,kuota=custom?Number($('f_kuotaKhusus').value):c?.sesi;if(!c){$('estimate').textContent='Pilih atlet untuk melihat tagihan.';return;}$('estimate').innerHTML=`Tarif ${esc(rupiah(tarif))} + pendaftaran ${esc(rupiah(reg))} − diskon ${esc(rupiah(disc))}<strong>${esc(rupiah((tarif||0)+reg-disc))}</strong>${kuota?kuota+' pertemuan · masa berlaku satu bulan':'SPP Prestasi · jatuh tempo akhir bulan'}<br>Sekolah atlet: ${esc(a?.sekolah||'belum diisi')}. Nilai akhir diverifikasi server.`;}
function openPassword(forced=false){S.formKind='password';S.edit=null;$('dialogTitle').textContent=forced?'Buat kata sandi pribadi':'Pengaturan akun';$('dialogEyebrow').textContent='AKUN '+roleName(S.user.role).toUpperCase();$('formMessage').textContent='';$('formFields').innerHTML=`<div class="readonly-notice">${forced?'Sebelum mengakses data klub, ganti kata sandi awal dengan kata sandi pribadi minimal 5 karakter.':'Kata sandi baru akan mengeluarkan akun dari semua perangkat.'}</div>`+field('currentPassword','Kata sandi saat ini','password','',{full:true})+field('password','Kata sandi baru','password','',{full:true})+field('confirmPassword','Ulangi kata sandi baru','password','',{full:true})+`<div class="field full"><button type="button" class="danger" id="logoutInside">Keluar dari akun</button></div>`;$('saveButton').textContent='Ganti kata sandi';$('cancelDialog').textContent=forced?'Keluar':'Batal';$('logoutInside').onclick=logout;$('f_currentPassword').autocomplete='current-password';if(!$('editor').open)$('editor').showModal();}
function openException(row){S.formKind='exception';S.edit=row;$('dialogTitle').textContent='Pengecualian masa berlaku';$('dialogEyebrow').textContent='KHUSUS OWNER';$('formMessage').textContent='';$('formFields').innerHTML=`<div class="readonly-notice">${esc(row.namaAtlet)} · ${esc(row.jenisKelas)}<br>Batas asli: ${esc(displayDate(row.tanggalBerakhir))}. Kuota pertemuan tetap.</div>`+field('berlakuSampai','Berlaku sampai','date',row.pengecualian?.berlakuSampai||'',{full:true})+field('alasan','Alasan pengecualian','textarea','',{full:true,max:1000,help:'Minimal 8 karakter. Disimpan dalam riwayat Owner.'});$('saveButton').textContent='Simpan pengecualian';$('cancelDialog').textContent='Batal';$('editor').showModal();}
function formPayload(){const form=$('editForm'),body=Object.fromEntries(new FormData(form));if(S.formKind==='jadwal')body.atletIds=[...form.querySelectorAll('[name=atletIds]:checked')].map(x=>x.value);for(const n of ['active','anggotaBaru','diskonSekolah','paketKhusus'])if(form.elements.namedItem(n))body[n]=form.elements.namedItem(n).checked;return body;}
async function submitForm(event){event.preventDefault();if(S.busy)return;S.busy=true;$('saveButton').disabled=true;$('formMessage').textContent='';
  try{const body=formPayload(),kind=S.formKind;
    if(kind==='password'){if(body.password!==body.confirmPassword)throw Error('Pengulangan kata sandi tidak sama.');const d=await request('/auth/password',{method:'POST',body:JSON.stringify(body)});$('editor').close();showLogin();$('loginMessage').textContent=d.pesan;$('password').value='';return;}
    let url='/api/'+kind+(S.edit?'/'+S.edit.id:''),method=S.edit?'PUT':'POST';
    if(kind==='program')Object.assign(body,await programPayload());
    if(kind==='exception'){url='/api/pembayaran/'+S.edit.id+'/pengecualian';method='POST';}
    const d=await request(url,{method,body:JSON.stringify(body)});$('editor').close();if(kind==='akun'&&d.sessionRevoked){showLogin();$('username').value=d.username;$('password').value='';$('loginMessage').textContent='ID akun diperbarui. Silakan masuk kembali.';return;}notice(d.pesan||'Perubahan tersimpan.');try{await load();}catch(e){notice('Data sudah tersimpan, tetapi daftar belum termuat ulang. '+e.message,true);}
  }catch(e){$('formMessage').textContent=e.message;}finally{S.busy=false;$('saveButton').disabled=false;}
}
async function logout(){try{await request('/auth/logout',{method:'POST'});if($('editor').open)$('editor').close();showLogin();$('password').value='';$('loginMessage').textContent='Anda sudah keluar.';}catch(e){if($('editor').open)$('formMessage').textContent=e.message;else notice(e.message,true);}}
function closeEditor(){if(S.busy)return;if(S.user?.mustChangePassword){logout();return;}$('editor').close();}
async function listAction(event){const button=event.target.closest('button');if(!button)return;const k=S.section,id=button.dataset.edit||button.dataset.delete||button.dataset.exception||button.dataset.reset;const row=(S.records[k]||[]).find(r=>String(r.id)===id);
  if(button.dataset.edit&&row)return openForm(k,row);if(button.dataset.exception&&row)return openException(row);if(!row)return;
  if(button.dataset.delete){if(!confirm('Hapus data '+(row.nama||row.namaAtlet||row.judul||'#'+id)+'? Perubahan dicatat dalam riwayat.'))return;button.disabled=true;try{const d=await request('/api/'+k+'/'+id,{method:'DELETE'});notice(d.pesan);await load();}catch(e){notice(e.message,true);}finally{button.disabled=false;}}
  if(button.dataset.reset){if(!confirm('Buat kata sandi awal baru untuk '+row.nama+'? Sesi login akun ini akan diakhiri.'))return;button.disabled=true;try{const d=await request('/api/akun/'+id+'/reset',{method:'POST'});$('secretUser').textContent='Nama pengguna: '+d.user.username+' · '+d.user.nama;$('secretValue').value=d.password;$('secretDialog').showModal();await load();}catch(e){notice(e.message,true);}finally{button.disabled=false;}}
}
function exportCsv(){const month=$('monthFilter').value,payments=(S.records.pembayaran||[]).filter(p=>!month||(p.dibayarPada||p.tanggal)?.slice(0,7)===month);const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const data=[['Nama atlet','Kelas','Tanggal mulai','Tanggal dibayar','Status','Tarif','Pendaftaran','Diskon','Total tagihan','Sisa sesi','Berlaku sampai'],...payments.map(p=>[p.namaAtlet,p.jenisKelas,p.tanggal,p.dibayarPada,p.status,p.jumlah,p.biayaPendaftaran,p.potonganDiskon,p.totalTagihan,p.sisaPertemuan??'Bulanan',p.berlakuSampai])];const url=URL.createObjectURL(new Blob(['\ufeff'+data.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='BRTM-laporan-'+(month||S.config.today)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('loginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;$('loginMessage').textContent='';try{const d=await request('/auth/login',{method:'POST',body:JSON.stringify({username:$('username').value.trim(),password:$('password').value})});$('password').value='';await start(d.user);}catch(err){if(S.user){notice(err.message,true);$('app').classList.remove('hidden');}else $('loginMessage').textContent=err.message;}finally{b.disabled=false;}};
$('nav').onclick=e=>{const b=e.target.closest('[data-menu]');if(b)navigate(b.dataset.menu);};
$('dashboard').onclick=e=>{const b=e.target.closest('[data-go]');if(b)navigate(b.dataset.go);};
$('sectionSummary').onclick=e=>{if(e.target.closest('[data-export]'))exportCsv();};
$('records').onclick=listAction;$('search').oninput=renderList;$('filter').onchange=renderList;$('monthFilter').onchange=renderList;
$('addButton').onclick=()=>openForm(S.section);$('editForm').onsubmit=submitForm;$('closeDialog').onclick=closeEditor;$('cancelDialog').onclick=closeEditor;$('accountButton').onclick=()=>openPassword();
$('refreshButton').onclick=async()=>{const b=$('refreshButton');b.disabled=true;try{await load();notice('Data klub sudah diperbarui.');}catch(e){notice(e.message,true);}finally{b.disabled=false;}};
$('editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});$('secretDialog').addEventListener('close',()=>{$('secretValue').value='';});$('closeSecret').onclick=()=>$('secretDialog').close();$('copySecret').onclick=async()=>{try{await navigator.clipboard.writeText($('secretValue').value);$('copySecret').textContent='Tersalin';setTimeout(()=>$('copySecret').textContent='Salin kata sandi',2000);}catch{$('secretValue').select();}};
document.querySelector('.brand').onclick=e=>{e.preventDefault();navigate('dashboard');};
(async()=>{try{const d=await request('/auth/me');await start(d.user);}catch(e){if(S.user)notice(e.message,true);else showLogin();}})();

$('records').addEventListener('error',e=>{if(e.target.matches('.athlete-photo'))e.target.closest('a').hidden=true;},true);
