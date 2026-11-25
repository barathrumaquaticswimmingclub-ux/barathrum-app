'use strict';
// Collect once from an authenticated parent; a stored email suppresses the screen.
let collectingParentEmail=false;
const renderBeforeEmail=render;
render=function(d){
 if(d.role!=='parent'||d.emailRequired!==true){collectingParentEmail=false;if(d.role==='parent')document.querySelector('.page-head p:not(.eyebrow)').textContent='Pantau perkembangan latihan, kehadiran, dan administrasi putra/putri Anda di BRTM.';return renderBeforeEmail(d);}
 collectingParentEmail=true;ownerMode=false;currentProfile=d.profil;parentSnapshot=d;
 if($('profileDialog').open)$('profileDialog').close();
 if(typeof parentInbox!=='undefined'&&parentInbox.open)parentInbox.close();
 if(typeof parentBell!=='undefined')parentBell.hidden=true;
 $('notificationPanel').hidden=true;
 document.querySelector('.page-head h1').textContent='Lengkapi email orang tua';
 document.querySelector('.page-head p:not(.eyebrow)').textContent='Satu kali pengisian untuk invoice dan kuitansi BRTM.';
 if($('requiredEmailForm'))return;
 $('content').innerHTML='<section class="panel"><h2>Email aktif Ayah / Bunda</h2><p>Untuk akun '+esc(d.profil.nama)+'. Invoice dan kuitansi akan dikirim ke email ini. Setelah tersimpan, permintaan ini tidak muncul lagi.</p><form id="requiredEmailForm"><label for="requiredParentEmail">Email aktif</label><input id="requiredParentEmail" name="emailOrtu" type="email" autocomplete="email" maxlength="254" required placeholder="nama@email.com"><p id="requiredEmailError" role="alert"></p><button class="primary" type="submit">Simpan dan lanjutkan</button></form></section>';
 $('requiredEmailForm').onsubmit=async e=>{e.preventDefault();if(!e.target.reportValidity())return;const b=e.target.querySelector('button');b.disabled=true;$('requiredEmailError').textContent='';try{await request('email',{emailOrtu:$('requiredParentEmail').value.trim()});collectingParentEmail=false;await refresh();}catch(err){$('requiredEmailError').textContent=err.message;}finally{b.disabled=false;}};
};
const notificationsBeforeEmail=refreshNotifications;
refreshNotifications=async function(options={}){if(collectingParentEmail)return;return notificationsBeforeEmail(options);};
