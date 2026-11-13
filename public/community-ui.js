'use strict';
const communityDialog=document.createElement('dialog');communityDialog.innerHTML='<div class="dialog-head"><h2 id="communityTitle"></h2><button id="closeCommunity" aria-label="Tutup">×</button></div><div id="communityBody"></div><p id="communityError" class="error" role="alert"></p>';document.body.append(communityDialog);$('closeCommunity').onclick=()=>communityDialog.close();
let communityRequestId;
const communityDashboard=renderDashboard;
renderDashboard=function(){
 communityDashboard();
 const panel=document.createElement('section');panel.className='panel';panel.innerHTML=`<h3>Komunikasi klub</h3><div class="actions">${isOwner()?'<button id="announceClass" class="primary">Kirim pengumuman kelas</button><button id="memberReport">Rekap anggota & ID</button>':''}<button id="staffFeedback">Kritik & saran orang tua <span id="feedbackBadge"></span></button><button id="staffPush">Aktifkan notifikasi HP</button></div><p id="communityStatus" role="status"></p>`;$('dashboard').prepend(panel);
 if(isOwner()){$('announceClass').onclick=openAnnouncement;$('memberReport').onclick=()=>openMembers().catch(e=>notice(e.message,true));}
 $('staffFeedback').onclick=()=>openFeedback().catch(e=>notice(e.message,true));$('staffPush').onclick=()=>staffPush().catch(e=>notice(e.message,true));refreshStaffBadge();
};
async function refreshStaffBadge(){
 const uid=S.user?.id;if(!uid)return;
 try{const ns=await request('/api/community/notifications');if(S.user?.id!==uid)return;const count=ns.filter(n=>!n.read_at).length;if($('feedbackBadge'))$('feedbackBadge').textContent=count?'('+count+' baru)':'';if($('communityStatus'))$('communityStatus').textContent=count?count+' masukan orang tua belum dibuka.':'';}catch{}
}
setInterval(()=>{if(!document.hidden&&S.user)refreshStaffBadge();},30000);
function openCommunity(title,html){$('communityTitle').textContent=title;$('communityBody').innerHTML=html;$('communityError').textContent='';if(!communityDialog.open)communityDialog.showModal();}
function openAnnouncement(){
 communityRequestId=crypto.randomUUID();let selectedPhoto=null,approvedPayload=null;
 const types=[['libur','Libur latihan'],['speed-test','Speed test Prestasi'],['doa-restu','Mohon doa restu'],['hasil-lomba','Hasil lomba & terima kasih'],['selamat','Ucapan selamat'],['umum','Informasi / promosi lainnya']];
 openCommunity('Pengumuman & kabar BRTM',`<form id="announcementForm" class="fields"><label>Jenis pengumuman<select name="kind" id="announcementKind">${types.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>Penerima<select name="className" id="announcementClass">${['Semua kelas',...Object.keys(S.config.classes)].map(c=>`<option${c==='Prestasi Class'?' selected':''}>${esc(c)}</option>`).join('')}</select></label><div class="full"><p>Tanggal kegiatan (maksimal 12 tanggal)</p><div id="announcementDates"></div><button type="button" id="addAnnouncementDate">＋ Tambah tanggal</button><small>Nama hari dihitung otomatis dari tanggal yang dipilih. Tanggal ini adalah tanggal kegiatan; pesan dikirim saat tombol Kirim ditekan.</small></div><label>Nama atlet (untuk pesan lomba)<input id="announcementAthletes" maxlength="300" placeholder="Contoh: Andi dan Sinta"></label><label>Nama event<input id="announcementEvent" maxlength="300" placeholder="Nama kejuaraan"></label><label>Juara / medali<input id="announcementResultName" maxlength="150" placeholder="Contoh: Juara 1 / Medali emas"></label><label>Nomor lomba<input id="announcementRace" maxlength="200" placeholder="Contoh: 50 m gaya bebas putra"></label><button type="button" id="composeAnnouncement">Susun contoh pesan</button><label>Judul<input name="title" id="announcementTitle" maxlength="150" value="Informasi libur latihan" required></label><label class="full">Pesan<textarea name="body" id="announcementText" maxlength="2000" required>Latihan pada tanggal tersebut diliburkan. Terima kasih atas perhatian Ayah dan Bunda.</textarea></label><label class="full">Foto / poster (opsional, maksimal 5 MB)<input id="announcementPhoto" type="file" accept="image/jpeg,image/png,image/gif,image/webp"></label><p class="muted full">Speed test khusus orang tua Prestasi Class. Pesan dan foto tersimpan di BRTM SWIM. Tampilan foto pada notifikasi HP bergantung dukungan perangkat; foto lengkap tetap tersedia di aplikasi. Untuk mencatat sesi libur dan penyesuaian paket, gunakan Jadwal latihan.</p><button type="button" id="previewAnnouncement">Lihat pratinjau</button><section class="panel full" id="announcementPreview" hidden></section><button type="submit" id="sendAnnouncement" class="primary" disabled>Kirim notifikasi sekarang</button><p id="announcementResult" class="full" role="status"></p></form>`);
 const day=d=>d?new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(d+'T12:00:00+07:00')):'';
 const dates=()=>[...new Set([...$('announcementDates').querySelectorAll('input')].map(i=>i.value).filter(Boolean))].sort();
 const invalidate=()=>{approvedPayload=null;$('sendAnnouncement').disabled=true;$('announcementPreview').hidden=true;};
 function addDate(value=''){
  if($('announcementDates').children.length>=12)return;
  const row=document.createElement('div');row.className='announcement-date';row.innerHTML=`<input type="date" aria-label="Tanggal kegiatan" value="${value}" required><span></span><button type="button" aria-label="Hapus tanggal">×</button>`;
  const input=row.querySelector('input'),label=row.querySelector('span');input.min=['speed-test','libur'].includes($('announcementKind').value)?S.config.today:'';
  const update=()=>{label.textContent=input.validity.valid&&input.value?day(input.value):'';};input.oninput=update;update();row.querySelector('button').onclick=()=>{if($('announcementDates').children.length>1){row.remove();invalidate();}};$('announcementDates').append(row);invalidate();
 }
 addDate(S.config.today);$('addAnnouncementDate').onclick=()=>addDate();
 $('announcementKind').onchange=()=>{const speed=$('announcementKind').value==='speed-test';if(speed)$('announcementClass').value='Prestasi Class';$('announcementClass').disabled=speed;$('announcementDates').querySelectorAll('input').forEach(i=>i.min=['speed-test','libur'].includes($('announcementKind').value)?S.config.today:'');invalidate();};
 $('composeAnnouncement').onclick=()=>{
  const kind=$('announcementKind').value,n=$('announcementAthletes').value.trim()||'[nama atlet]',event=$('announcementEvent').value.trim()||'[nama event]',result=$('announcementResultName').value.trim()||'[juara / medali]',race=$('announcementRace').value.trim()||'[nomor lomba]';
  const messages={libur:['Informasi libur latihan','Latihan pada tanggal tersebut diliburkan. Terima kasih atas perhatian Ayah dan Bunda.'],'speed-test':['Jadwal speed test Prestasi','Akan diadakan speed test untuk atlet Prestasi Class pada tanggal yang tercantum. Mohon Ayah dan Bunda mempersiapkan anak dan mengikuti jadwal latihan BRTM.'],'doa-restu':['Mohon doa restu untuk atlet BRTM',`Mohon doa restu untuk anak-anak kita, ${n}, yang akan bertanding pada event ${event} pada tanggal yang tercantum. Semoga dapat tampil maksimal dan membawa hasil terbaik.`],'hasil-lomba':['Terima kasih atas doa dan dukungannya',`Terima kasih atas doa dan dukungan Ayah dan Bunda. Atlet kita, ${n}, berhasil meraih ${result} pada nomor ${race} dalam event ${event}. Terus berlatih dan berkembang bersama BRTM!`],selamat:['Selamat atas prestasinya!',`Selamat kepada ${n} atas raihan ${result} pada nomor ${race} dalam event ${event}. Semoga menjadi semangat untuk prestasi berikutnya.`],umum:['Kabar terbaru dari BRTM','Tuliskan informasi atau promosi BRTM di sini.']};
  [$('announcementTitle').value,$('announcementText').value]=messages[kind];invalidate();
 };
 $('announcementPhoto').onchange=async()=>{selectedPhoto=null;invalidate();const file=$('announcementPhoto').files[0];if(!file)return;if(file.size>5*1024*1024){$('communityError').textContent='Foto maksimal 5 MB.';$('announcementPhoto').value='';return;}try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});if($('announcementPhoto').files[0]!==file)return;selectedPhoto={mime:file.type,base64:data.split(',')[1]};$('communityError').textContent='';}catch{$('communityError').textContent='Foto belum berhasil dibaca.';}};
 const payload=()=>({requestId:communityRequestId,kind:$('announcementKind').value,className:$('announcementClass').value,dates:dates(),title:$('announcementTitle').value.trim(),body:$('announcementText').value.trim(),photo:selectedPhoto});
 $('announcementForm').addEventListener('input',invalidate);
 $('previewAnnouncement').onclick=()=>{
  if(!$('announcementForm').reportValidity())return;
  if($('announcementPhoto').files.length&&!selectedPhoto){$('communityError').textContent='Tunggu foto selesai dibaca sebelum melanjutkan.';return;}
  const d=payload();approvedPayload=JSON.stringify(d);$('announcementPreview').innerHTML=`<small>Penerima: ${esc(d.className)}</small><h3>${esc(d.title)}</h3><p>${esc(d.dates.map(day).join(' • '))}</p><p class="announcement-body">${esc(d.body)}</p>${d.photo?`<img class="announcement-image" src="data:${esc(d.photo.mime)};base64,${d.photo.base64}" alt="Pratinjau foto pengumuman">`:''}`;$('announcementPreview').hidden=false;$('sendAnnouncement').disabled=false;$('communityError').textContent='';
 };
 $('announcementForm').onsubmit=async e=>{
  e.preventDefault();const b=$('sendAnnouncement');b.disabled=true;$('communityError').textContent='';
  try{const d=payload();if(JSON.stringify(d)!==approvedPayload)throw Error('Periksa pratinjau kembali sebelum mengirim.');const r=await request('/api/community/announcements',{method:'POST',body:JSON.stringify(d)});$('announcementResult').textContent='Pengumuman tersimpan untuk '+r.recipient_count+' atlet. Notifikasi HP yang aktif masuk antrean pengiriman.';e.target.querySelectorAll('input,textarea,select,button').forEach(x=>x.disabled=true);}catch(err){$('communityError').textContent=err.message;b.disabled=false;}
 };
}
async function openMembers(year){
 const r=await request('/api/community/members'+(year?'?year='+year:''));
 openCommunity('Nomor anggota BRTM',`<label>Tahun <input id="memberYear" type="number" min="2000" max="2100" value="${r.year}"></label><button id="applyMemberYear">Tampilkan</button><div class="stats">${stat('Pernah terdaftar',r.total,'Seluruh ID unik sejak pencatatan')}${stat('Aktif sekarang',r.active,'Status saat ini')}${stat('Terdaftar pada '+r.year,r.newInYear,'Tanggal masuk sistem')}</div><p>Nomor anggota dapat dikoreksi oleh Owner dengan alasan tercatat. Untuk menukar nomor, ubah kedua atlet sebelum menyimpan. Tanggal pendaftaran dan seluruh riwayat atlet tetap mengikuti profil masing-masing.</p><form id="memberNumberForm"><div class="ops-scroll"><table class="ops-table"><thead><tr><th>Nama</th><th>ID anggota saat ini</th><th>Nomor urut</th><th>Status</th></tr></thead><tbody>${r.members.slice().sort((a,b)=>Number(a.member_number)-Number(b.member_number)).map(m=>`<tr><td>${esc(m.nama)}</td><td>${esc(m.member_id)}</td><td><input type="number" min="1" max="99999" step="1" required data-member-athlete="${m.athlete_id}" value="${m.member_number}" aria-label="Nomor anggota ${esc(m.nama)}"${m.status==='Diarsipkan'?' disabled':''}></td><td>${esc(m.status)}</td></tr>`).join('')}</tbody></table></div><label>Alasan koreksi<input id="memberNumberReason" minlength="8" maxlength="500" required></label><button id="saveMemberNumbers" type="submit" class="primary">Simpan nomor anggota</button></form>`);
 $('applyMemberYear').onclick=()=>openMembers($('memberYear').value).catch(e=>$('communityError').textContent=e.message);
 $('memberNumberForm').onsubmit=async e=>{
  e.preventDefault();const button=$('saveMemberNumbers');button.disabled=true;$('communityError').textContent='';
  try{
   const changes=[...$('memberNumberForm').querySelectorAll('[data-member-athlete]:not(:disabled)')].map(input=>{const m=r.members.find(m=>String(m.athlete_id)===input.dataset.memberAthlete);return {athleteId:String(m.athlete_id),memberNumber:Number(input.value),expectedMemberId:m.member_id};}).filter(x=>x.memberNumber!==Number(r.members.find(m=>String(m.athlete_id)===x.athleteId).member_number));
   if(!changes.length)throw Error('Belum ada perubahan nomor anggota.');
   await request('/api/community/members/renumber',{method:'POST',body:JSON.stringify({changes,reason:$('memberNumberReason').value})});
   communityDialog.close();await load();notice('Nomor anggota berhasil diperbarui.');
  }catch(error){$('communityError').textContent=error.message;}finally{button.disabled=false;}
 };
}

async function openFeedback(){
 const uid=S.user.id;const [list,ns]=await Promise.all([request('/api/community/feedback'),request('/api/community/notifications')]);if(S.user?.id!==uid)return;
 openCommunity('Kritik & saran orang tua',list.map(f=>`<article class="panel"><p>${esc(f.athlete_name)} · Pelatih ${esc(f.coach_name)}</p><small>${esc(stamp(f.created_at))} · ${esc(f.status)}</small><p>${esc(f.body)}</p>${f.replies.map(r=>`<div class="parent-copy"><b>${esc(r.staff_name)}</b><p>${esc(r.body)}</p><small>${esc(stamp(r.created_at))}</small></div>`).join('')}<form data-reply="${f.id}"><label>Tanggapan untuk orang tua<textarea name="body" required maxlength="2000"></textarea></label><label>Status<select name="status"><option>Ditanggapi</option><option>Selesai</option></select></label><button type="submit">Kirim tanggapan</button></form></article>`).join('')||'<p>Belum ada masukan.</p>');
 $('communityBody').querySelectorAll('[data-reply]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;try{await request('/api/community/feedback/'+form.dataset.reply+'/reply',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});await openFeedback();}catch(err){$('communityError').textContent=err.message;b.disabled=false;}});
 const visible=new Set(list.map(f=>String(f.id)));await Promise.all(ns.filter(n=>!n.read_at&&visible.has(String(n.feedback_id))).map(n=>request('/api/community/notifications/'+n.id+'/read',{method:'POST',body:'{}'})));refreshStaffBadge();
}
async function staffPush(){
 if(!('Notification' in window)||!('PushManager' in window)||!('serviceWorker' in navigator))throw Error('Gunakan Chrome Android untuk mengaktifkan notifikasi HP.');
 if(await Notification.requestPermission()!=='granted')throw Error('Izin notifikasi belum diberikan.');
 const reg=await navigator.serviceWorker.getRegistration('/club/');if(!reg)throw Error('Muat ulang BRTM di /club/ lalu coba kembali.');
 const key=await request('/api/community/push/key');const raw=atob(key.publicKey.replace(/-/g,'+').replace(/_/g,'/'));
 let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});
 await request('/api/community/push/subscribe',{method:'POST',body:JSON.stringify({subscription:sub.toJSON()})});notice('Notifikasi HP untuk akun ini aktif.');
}
// Unique member number is visible on athlete lists and searchable through the API projection.
const communityList=renderList;
renderList=function(){communityList();if(S.section==='atlet'&&isOwner()){$('sectionSummary').innerHTML='<button id=\"editMemberNumbers\">Atur nomor anggota</button>';$('editMemberNumbers').onclick=()=>openMembers().catch(e=>notice(e.message,true));}if(S.section==='atlet')$('records').querySelectorAll('[data-child]').forEach(b=>{const a=(S.records.atlet||[]).find(a=>a.id===b.dataset.child);if(a){const small=document.createElement('small');small.textContent=a.memberId;b.after(small);}});};
const communityLogin=showLogin;showLogin=function(){communityDialog.close();$('communityBody').replaceChildren();communityLogin();};
