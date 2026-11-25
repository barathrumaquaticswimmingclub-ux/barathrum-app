'use strict';
const checkInLogin=showLogin;showLogin=function(){if(wfDialog.open)wfDialog.close();checkInLogin();};
const checkInDashboard=renderDashboard;
renderDashboard=function(){checkInDashboard();if(!isStaffSelf())return;
 const data=S.staffAttendance,today=data?.today||S.config.today,records=(data?.records||[]).filter(r=>r.tanggal===today);
 $('dashboard').insertAdjacentHTML('afterbegin','<section class="panel"><h3>Absensi pelatih</h3><p>'+esc(displayDate(today))+'</p><button type="button" class="primary" data-check-in-open style="width:100%;min-height:56px;font-size:1.1rem">Hadir Hari Ini</button><p>Pilih sesi, ambil foto, lalu simpan dengan lokasi/GPS aktif.</p>'+records.map(r=>'<div class="mini-row"><div><strong>'+esc(r.mulai+'–'+r.selesai)+'</strong><small>'+esc(r.status)+' · '+esc(r.review)+'</small>'+(r.reportedAt?'<small>Dicatat '+esc(new Date(r.reportedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}))+' WIB</small>':'')+'</div></div>').join('')+'</section>');
};
$('dashboard').addEventListener('click',e=>{if(e.target.closest('[data-check-in-open]'))openCoachCheckIn();});
async function openCoachCheckIn(){
 if(!isStaffSelf())return;const uid=S.user.id;
 try{const data=await request('/api/coach/staff-attendance');if(!isStaffSelf()||S.user.id!==uid)return;
 const slots=data.slots.filter(s=>s.tanggal===data.today&&!s.libur&&!data.records.some(r=>r.tanggal===data.today&&r.mulai<s.selesai&&r.selesai>s.mulai));
 if(!slots.length){notice('Tidak ada jadwal hari ini yang belum diisi. Hubungi Owner jika jadwal perlu diperbaiki.',true);return;}
 let stream=null,picture='',submission=null;const requestId=crypto.randomUUID();
 const stop=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;};
 modal('Hadir Hari Ini','<p class="full"><strong>'+esc(data.nama)+'</strong> · '+esc(displayDate(data.today))+'<br>Centang satu atau semua sesi yang Anda ikuti. Waktu pencatatan disimpan otomatis (WIB).</p><div class="full">'+slots.map((s,i)=>'<label class="check"><input type="checkbox" name="checkInSlot" value="'+i+'"><span>'+esc(s.mulai+'–'+s.selesai+' · '+s.kelas)+'</span></label>').join('')+'</div><div class="full"><video id="checkInCamera" autoplay muted playsinline style="width:100%;max-height:320px;border-radius:12px"></video><img id="checkInPhoto" alt="Foto absensi" hidden style="width:100%;max-height:320px;object-fit:contain"><button type="button" id="checkInCapture">Ambil foto</button><p id="checkInCameraStatus" role="status">Mengaktifkan kamera depan…</p><p id="checkInLocationStatus" role="status">Lokasi/GPS wajib aktif. Izin lokasi diminta saat menyimpan.</p></div>',async(d,form)=>{
  if(!submission){const selected=Array.from(form.querySelectorAll('[name="checkInSlot"]:checked')).map(e=>slots[Number(e.value)].key);if(!selected.length)throw Error('Pilih minimal satu sesi');if(!picture)throw Error('Ambil foto terlebih dahulu');
   if(!navigator.geolocation)throw Error('Lokasi tidak tersedia. Buka aplikasi melalui HTTPS dan aktifkan GPS');
   $('checkInLocationStatus').textContent='Mengambil lokasi…';
   const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,()=>reject(Error('Aktifkan lokasi/GPS HP dan izinkan akses lokasi aplikasi, lalu simpan kembali')),{enableHighAccuracy:true,maximumAge:0,timeout:20000}));
   submission={requestId,slotKeys:selected,photo:picture,location:{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp}};
  }
  try{return await request('/api/coach/check-in',{method:'POST',body:JSON.stringify(submission)});}catch(err){if(err.status&&err.status<500)submission=null;throw err;}
 });
 $('wfSave').textContent='Simpan';
 wfDialog.addEventListener('close',stop,{once:true});
 $('checkInCapture').onclick=()=>{if(!stream)return;const video=$('checkInCamera');if(!video.videoWidth){$('checkInCameraStatus').textContent='Kamera belum siap. Coba lagi.';return;}const canvas=document.createElement('canvas'),scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);picture=canvas.toDataURL('image/jpeg',0.65);submission=null;$('checkInPhoto').src=picture;$('checkInPhoto').hidden=false;$('checkInCapture').textContent='Ambil ulang foto';$('checkInCameraStatus').textContent='Foto siap disimpan.';};
 try{const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:640}},audio:false});if(!wfDialog.open||S.user?.id!==uid){media.getTracks().forEach(t=>t.stop());return;}stream=media;$('checkInCamera').srcObject=stream;$('checkInCameraStatus').textContent='Kamera siap. Tekan Ambil foto.';}catch(e){if(wfDialog.open)$('checkInCameraStatus').textContent='Kamera belum diizinkan. Izinkan kamera lalu buka kembali Hadir Hari Ini.';}
 }catch(e){notice(e.message,true);}
}
$('sectionSummary').addEventListener('click',async e=>{const b=e.target.closest('[data-check-in-proof]');if(!b||!isOwner())return;try{const p=await request('/api/owner/staff-check-in/'+encodeURIComponent(b.dataset.checkInProof));if(!isOwner())return;const l=p.location,url='https://www.google.com/maps?q='+l.latitude+','+l.longitude;modal('Bukti absensi pelatih','<div class="full"><p><strong>'+esc(p.reportedName)+'</strong></p><p>'+esc(new Date(p.reportedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}))+' WIB</p><img src="'+esc(p.photo)+'" alt="Foto absensi pelatih" style="width:100%;max-height:400px;object-fit:contain"><p>Koordinat: '+esc(l.latitude+', '+l.longitude)+' · Akurasi ±'+Math.round(l.accuracy)+' meter</p><a class="secondary" href="'+esc(url)+'" target="_blank" rel="noopener">Lihat di Google Maps</a></div>',null);}catch(err){notice(err.message,true);}});
if(S.user&&typeof renderCurrent==='function')renderCurrent();
