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
 communityRequestId=crypto.randomUUID();
 openCommunity('Kirim pengumuman kelas',`<form id="announcementForm" class="fields"><label>Kelas<select name="className">${Object.keys(S.config.classes).map(c=>`<option${c==='Prestasi Class'?' selected':''}>${esc(c)}</option>`).join('')}</select></label><label>Tanggal latihan<input type="date" name="trainingDate" min="${S.config.today}" value="${S.config.today}" required></label><label>Judul<input name="title" maxlength="150" value="Informasi libur latihan" required></label><label>Pesan<textarea name="body" maxlength="2000" required>Latihan pada tanggal tersebut diliburkan. Terima kasih atas perhatian Ayah dan Bunda.</textarea></label><p class="muted">Dikirim ke kabar BRTM SWIM seluruh atlet aktif di kelas yang dipilih. Notifikasi HP diterima pada perangkat yang sudah mengaktifkannya. Untuk mencatat sesi libur dan penyesuaian paket, ubah status sesi melalui Jadwal latihan.</p><button type="submit" class="primary">Kirim notifikasi</button><p id="announcementResult" role="status"></p></form>`);
 $('announcementForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;$('communityError').textContent='';try{const d=Object.fromEntries(new FormData(e.target));const r=await request('/api/community/announcements',{method:'POST',body:JSON.stringify({...d,requestId:communityRequestId})});$('announcementResult').textContent='Pengumuman tersimpan untuk '+r.recipient_count+' atlet. Notifikasi HP yang aktif masuk antrean pengiriman.';e.target.querySelectorAll('input,textarea,select').forEach(x=>x.disabled=true);}catch(err){$('communityError').textContent=err.message;b.disabled=false;}};
}
async function openMembers(year){
 const r=await request('/api/community/members'+(year?'?year='+year:''));
 openCommunity('Rekap anggota & ID permanen',`<label>Tahun <input id="memberYear" type="number" min="2000" max="2100" value="${r.year}"></label><button id="applyMemberYear">Tampilkan</button><div class="stats">${stat('Pernah terdaftar',r.total,'Seluruh ID unik sejak pencatatan')}${stat('Aktif sekarang',r.active,'Status saat ini')}${stat('Terdaftar pada '+r.year,r.newInYear,'Tanggal masuk sistem')}${stat('Terdaftar s.d. '+r.year,r.throughYear,'Akumulasi anggota unik')}${stat('Berlatih pada '+r.year,r.trainedInYear,'Anak unik dengan absensi Hadir')}</div><p class="muted">Satu anak memakai satu ID sepanjang keanggotaan. Aktifkan kembali profil lama saat bergabung kembali. Nomor ID bukan jumlah anggota; nomor dapat melompat. Untuk data lama, tanggal terdaftar mengikuti tanggal pertama masuk database, bukan tanggal pertama bergabung sebelum sistem tersedia.</p><div class="ops-scroll"><table class="ops-table"><thead><tr><th>ID anggota</th><th>Nama</th><th>Status sekarang</th></tr></thead><tbody>${r.members.map(m=>`<tr><td>${esc(m.member_id)}</td><td>${esc(m.nama)}</td><td>${esc(m.status)}</td></tr>`).join('')}</tbody></table></div>`);
 $('applyMemberYear').onclick=()=>openMembers($('memberYear').value).catch(e=>$('communityError').textContent=e.message);
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
renderList=function(){communityList();if(S.section==='atlet')$('records').querySelectorAll('[data-child]').forEach(b=>{const a=(S.records.atlet||[]).find(a=>a.id===b.dataset.child);if(a){const small=document.createElement('small');small.textContent=a.memberId;b.after(small);}});};
const communityLogin=showLogin;showLogin=function(){communityDialog.close();$('communityBody').replaceChildren();communityLogin();};
