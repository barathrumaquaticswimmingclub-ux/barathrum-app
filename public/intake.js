'use strict';
function renderIntake(){
  const k=S.section,q=$('search').value.toLowerCase();$('records').className='record-list';
  $('sectionSummary').innerHTML='';
  if(k==='orangtua'){
    $('sectionSummary').innerHTML=`<div class="section-banner">BRTM SWIM menampilkan data anak terkait. ID mengikuti nama lengkap anak; nama yang sama memiliki tambahan nomor. Kata sandi tetap <b>brtm</b> sesuai pengaturan klub. Orang yang mengetahui nama dan sandi dapat mencoba mengakses data anak.</div><div class="account-actions"><button class="primary" data-intake="parents">Siapkan akun atlet aktif</button><a class="secondary download" href="/swim/" target="_blank" rel="noopener">Buka BRTM SWIM ↗</a></div>`;
    $('records').innerHTML=(S.records.orangtua||[]).filter(a=>[a.nama,a.username].join(' ').toLowerCase().includes(q)).map(a=>`<article class="record"><div class="record-head"><div><h3>${esc(a.nama)}</h3><p>${esc(a.status)}</p></div>${badge(a.username?a.active?'Aktif':'Nonaktif':'Belum disiapkan')}</div>${details([['ID BRTM SWIM',a.username||'Belum disiapkan'],['Kata sandi',a.username?'brtm':'—']])}<div class="record-actions"><button class="secondary" data-parent="${esc(a.id)}" data-active="${!a.active}">${a.active?'Nonaktifkan akses':'Aktifkan akses'}</button></div></article>`).join('')||empty('Belum ada atlet');
  }
  if(k==='pendaftaran'){
    $('sectionSummary').innerHTML='<div class="section-banner">Identitas yang cocok terhubung otomatis. Jika nama sudah ada tetapi identitas atau kelas berbeda, pilih atlet yang benar di bawah. Menghubungkan ke atlet lama mengisi profil yang masih kosong dan mempertahankan kelas, status, paket serta seluruh riwayatnya.</div>';
    $('records').innerHTML=(S.records.pendaftaran||[]).filter(r=>JSON.stringify(r.payload).toLowerCase().includes(q)).map(r=>`<article class="record"><div class="record-head"><div><h3>${esc(r.payload.nama)}</h3><p>${r.kind==='prestasi'?'Form Prestasi':'Form selain Prestasi'}</p></div>${badge(r.status)}</div>${details([['Tanggal lahir',displayDate(r.payload.tanggalLahir)],['WhatsApp',r.payload.noHpOrtu],['Kelas',r.payload.kelompok],['Status',r.note],['ID atlet tersambung',r.athlete_id||'']])}${r.status==='Perlu diperiksa'?`<div class="field full"><label for="match_${esc(r.id)}">Hubungkan data ini ke</label><select id="match_${esc(r.id)}"><option value="">Pilih atlet…</option>${(S.records.atlet||[]).map(a=>`<option value="${esc(a.id)}">${esc(a.nama)} · ${esc(a.kelompok)} · #${esc(a.id)}</option>`).join('')}<option value="new">Buat atlet berbeda dengan nama yang sama</option></select></div><div class="record-actions"><button class="primary" data-match="${esc(r.id)}">Hubungkan identitas</button></div>`:''}</article>`).join('')||empty('Belum ada jawaban formulir','Jawaban akan tampil setelah integrasi Google Form diaktifkan.');
  }
  if(k==='formulir'){
    $('sectionSummary').innerHTML=`<div class="section-banner">Gunakan satu Form Prestasi dan satu Form selain Prestasi untuk semua atlet aktif maupun peserta baru. Tidak ada pertanyaan “atlet lama atau baru”. Pengisian tidak membuat tagihan atau mencatat pembayaran.</div><div class="account-actions"><button class="primary" data-intake="forms">Unduh penghubung Google Form</button></div>`;
    $('records').innerHTML=['prestasi','nonprestasi'].map(kind=>{const r=(S.records.formulir||[]).find(x=>x.kind===kind);return `<article class="record"><h3>${kind==='prestasi'?'Form Prestasi':'Form selain Prestasi'}</h3><p>${r?.form_url?'<a href="'+esc(r.form_url)+'" target="_blank" rel="noopener">Buka formulir ↗</a>':'Belum diaktifkan di akun Google.'}</p><p class="muted">${r?.last_received_at?'Jawaban terakhir: '+esc(new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(r.last_received_at))):'Belum menerima jawaban.'}</p></article>`;}).join('')+`<article class="record"><h3>Pengaktifan satu kali</h3><ol><li>Unduh penghubung di atas. File berisi kunci privat; jangan dibagikan kepada orang tua.</li><li>Buka Google Apps Script di akun Google Owner. Buat proyek dan masukkan isi file.</li><li>Jalankan fungsi <b>siapkanBRTM</b>, lalu berikan izin Google untuk membuat formulir dan meneruskan jawaban ke aplikasi BRTM.</li><li>Dua tautan formulir muncul di halaman ini setelah berhasil. Kirim tautan yang sesuai kelas kepada orang tua.</li></ol><p class="muted">Penghubung mengirim jawaban saat formulir diisi dan mencoba kembali secara berkala jika koneksi terputus. Mengunduh penghubung baru mengganti kunci; kode Apps Script lama perlu diperbarui. Simpan proyek Google tersebut agar formulir yang sama dapat dipakai kembali.</p></article>`;
  }
}
async function intakeAction(e){
  const b=e.target.closest('[data-intake],[data-parent],[data-match]');if(!b||!isOwner())return;
  b.disabled=true;
  try{
    if(b.dataset.intake==='parents'){const d=await request('/api/orangtua/siapkan',{method:'POST'});notice(d.pesan);await load();}
    if(b.dataset.parent){const d=await request('/api/orangtua/'+b.dataset.parent,{method:'PUT',body:JSON.stringify({active:b.dataset.active==='true'})});notice(d.pesan);await load();}
    if(b.dataset.match){const aid=$('match_'+b.dataset.match).value;if(!aid)throw Error('Pilih atlet tujuan dahulu.');if(!confirm('Hubungkan identitas ini ke pilihan tersebut? Periksa nama, tanggal lahir, dan nomor orang tua.'))return;const d=await request('/api/pendaftaran/'+b.dataset.match+'/hubungkan',{method:'POST',body:JSON.stringify({atletId:aid})});notice(d.pesan);await load();}
    if(b.dataset.intake==='forms'){
      if(!confirm('Buat penghubung untuk dua formulir? Jika sudah terpasang, kunci lama akan diganti dan kode Apps Script perlu diperbarui.'))return;
      const r=await fetch('/api/formulir/siapkan',{method:'POST',headers:{'X-BRTM-Request':'1'},credentials:'same-origin'});if(!r.ok)throw Error('Penghubung belum dapat dibuat. Muat ulang dan coba lagi.');
      const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='BRTM-Google-Forms.gs';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Penghubung diunduh. Aktifkan satu kali di akun Google Owner.');await load();
    }
  }catch(err){notice(err.message,true);}finally{b.disabled=false;}
}
$('records').addEventListener('click',intakeAction);$('sectionSummary').addEventListener('click',intakeAction);
