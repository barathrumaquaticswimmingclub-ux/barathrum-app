'use strict';
const familyDialog=document.createElement('dialog');
familyDialog.innerHTML='<form id="familyForm"><h2>Tambah Anak</h2><p>Masukkan nama lengkap anak sesuai data BRTM. Nomor WhatsApp orang tua yang terdaftar harus sama.</p><label for="familyName">Nama lengkap anak</label><input id="familyName" name="nama" required maxlength="200" autocomplete="off"><p id="familyMessage" role="alert"></p><div class="owner-actions"><button type="button" id="familyCancel">Batal</button><button class="primary" id="familySubmit">Tautkan Anak</button></div></form>';
document.body.append(familyDialog);
$('familyCancel').onclick=()=>familyDialog.close();
function familyPanel(d){return '<section class="panel family-panel" aria-label="Anak Saya"><h2>Anak Saya</h2><div class="family-children">'+(d.familia||[]).map(a=>'<button type="button" data-family-child="'+esc(a.id)+'" aria-pressed="'+(a.id===d.profil.id)+'"><span class="family-initial" aria-hidden="true">'+esc(a.nama.slice(0,1))+'</span><span>'+esc(a.nama)+'<small>'+esc(a.kelompok)+(a.id===d.profil.id?' · Sedang dipilih':'')+'</small></span></button>').join('')+'<button type="button" id="familyAdd">+ Tambah Anak</button></div><p>Informasi dan Hadir Hari Ini untuk <b>'+esc(d.profil.nama)+'</b>.</p>'+((d.familia||[]).some(a=>a.id===d.profil.id&&!a.utama)?'<button type="button" id="familyUnlink">Lepas tautan anak ini</button>':'')+'</section>';}
const familyDraw=drawParentPortal;
drawParentPortal=function(){familyDraw();if(parentSnapshot){$('content').insertAdjacentHTML('afterbegin',familyPanel(parentSnapshot));scopeFamilyLinks();}};
// Scope document links to the child visible when they were rendered, including new tabs.
function scopeFamilyLinks(){if(!parentSnapshot||ownerMode)return;for(const node of document.querySelectorAll('a[href^="/swim/api/"]')){const u=new URL(node.getAttribute('href'),location.origin);if(!u.searchParams.has('child')){u.searchParams.set('child',parentSnapshot.profil.id);node.setAttribute('href',u.pathname+u.search);}}}
new MutationObserver(scopeFamilyLinks).observe(document.body,{childList:true,subtree:true});
function resetFamilyView(){
 swimViewVersion++;swimRefreshSequence++;renderedSnapshot=null;pendingSwim=null;loading=false;
 parentPage='dashboard';parentNotificationFilter='all';parentSnapshot=null;currentProfile=null;
 inboxNotifications=[];activeNotificationId=null;inboxOpen=false;olderNotificationsAvailable=true;
 parentInbox.close();coachProfileDialog.close();$('profileDialog').close();familyDialog.close();
 $('notificationList').replaceChildren();$('parentInboxList').replaceChildren();$('notificationPanel').hidden=true;
 $('content').innerHTML='<section class="panel"><p>Memuat informasi anak…</p></section>';
}
async function selectFamilyChild(id){
 if(!parentSnapshot?.familia?.some(a=>a.id===id))return;
 familyChild=id;try{sessionStorage.setItem('brtm-family-child',id);}catch{}
 resetFamilyView();
 try{await refresh();}catch(e){$('statusMessage').textContent=e.message;}
}
$('content').addEventListener('click',async e=>{
 const select=e.target.closest('[data-family-child]');
 if(select){if(select.dataset.familyChild!==parentSnapshot?.profil.id)await selectFamilyChild(select.dataset.familyChild);return;}
 if(e.target.closest('#familyAdd')){$('familyForm').reset();$('familyMessage').textContent='';familyDialog.showModal();return;}
 if(e.target.closest('#familyUnlink')){
  const id=parentSnapshot?.profil.id;if(!id)return;
  const b=e.target.closest('button');b.disabled=true;
  try{await request('children/'+id,{},'DELETE');familyChild=null;try{sessionStorage.removeItem('brtm-family-child');}catch{}resetFamilyView();await refresh();$('statusMessage').textContent='Tautan dilepas. Data latihan anak tetap tersimpan.';}catch(err){b.disabled=false;$('statusMessage').textContent=err.message;}
 }
});
$('familyForm').onsubmit=async e=>{e.preventDefault();const b=$('familySubmit');b.disabled=true;try{const r=await request('children',{nama:$('familyName').value.trim()});familyDialog.close();await refresh();$('statusMessage').textContent=r.pesan;}catch(err){$('familyMessage').textContent=err.message;}finally{b.disabled=false;}};
const familyRender=render;render=function(d){familyRender(d);if(d.role==='parent'&&!document.querySelector('.family-panel')){$('content').insertAdjacentHTML('afterbegin',familyPanel(d));scopeFamilyLinks();}};
const familyLogin=showLogin;showLogin=function(){familyDialog.close();familyLogin();};
if(parentSnapshot)drawParentPortal();
