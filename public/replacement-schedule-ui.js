'use strict';
async function openReplacementSchedule(athlete){
 if(!isOwner()||!athlete)return;
 const date=S.config.today,uid=S.user.id;
 const initial=await request('/api/owner/athlete/'+encodeURIComponent(athlete.id)+'/replacement-options?date='+encodeURIComponent(date));
 if(!isOwner()||S.user.id!==uid)return;if(!initial.coaches.length)throw Error('Belum ada pelatih aktif');
 const requestId=crypto.randomUUID();let options=initial,pending=false,sequence=0;
 modal('Jadwal pengganti · '+athlete.nama,'<p class="full">Berlaku satu kali pada tanggal yang dipilih.</p>'+field('tanggal','Tanggal','date',date)+field('coachId','Pelatih',initial.coaches.map(c=>[c.id,c.nama]),initial.coaches[0].id)+field('sessionId','Gabung sesi / buat jadwal',[['','Sesi baru / gabung otomatis sesuai jam']],'',{required:false,placeholder:false,full:true})+field('mulai','Jam mulai','time','15:00')+field('selesai','Jam selesai','time','16:00')+field('lokasi','Lokasi','text','Kolam Renang Pondok Selfie',{full:true,max:200})+field('catatan','Catatan','textarea','',{full:true,required:false,max:1000}),async d=>{
  if(pending)throw Error('Tunggu pilihan sesi selesai dimuat');
  return request('/api/owner/athlete/'+encodeURIComponent(athlete.id)+'/replacement',{method:'POST',body:JSON.stringify({...d,requestId})});
 });
 const applySession=()=>{const s=options.sessions.find(s=>s.id===$('f_sessionId').value);for(const key of ['mulai','selesai','lokasi']){$('f_'+key).readOnly=!!s;if(s)$('f_'+key).value=s[key];}};
 const renderOptions=()=>{const current=$('f_sessionId').value,coach=$('f_coachId').value,sessions=options.sessions.filter(s=>(s.coachIds||[s.coachId]).map(String).includes(coach));$('f_sessionId').innerHTML='<option value="">Sesi baru / gabung otomatis sesuai jam</option>'+sessions.map(s=>'<option value="'+esc(s.id)+'" '+(s.full?'disabled':'')+'>'+esc(s.mulai+'–'+s.selesai+' · '+s.lokasi+(s.full?' · Penuh':''))+'</option>').join('');if(sessions.some(s=>s.id===current&&!s.full))$('f_sessionId').value=current;applySession();};
 $('f_sessionId').onchange=applySession;$('f_coachId').onchange=renderOptions;
 $('f_tanggal').onchange=async()=>{const selectedDate=$('f_tanggal').value,seq=++sequence;pending=true;$('wfSave').disabled=true;
  try{const result=await request('/api/owner/athlete/'+encodeURIComponent(athlete.id)+'/replacement-options?date='+encodeURIComponent(selectedDate));if(seq!==sequence||!wfDialog.open||!isOwner()||S.user.id!==uid)return;options=result;renderOptions();$('wfError').textContent='';}catch(err){if(seq===sequence&&wfDialog.open)$('wfError').textContent=err.message;}finally{if(seq===sequence){pending=false;if(wfDialog.open)$('wfSave').disabled=false;}}
 };
 $('wfSave').textContent='Simpan jadwal satu kali';renderOptions();
}
