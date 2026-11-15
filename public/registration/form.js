'use strict';
(()=>{
 const $=id=>document.getElementById(id),form=$('registrationForm'),select=$('classSelect'),submit=$('submitButton');let config=null,busy=false;
 const newId=()=>crypto.randomUUID();let requestId=newId();
 const option=(value,label)=>{const e=document.createElement('option');e.value=value;e.textContent=label;return e;};
 const birth=form.elements.tanggalLahir;birth.max=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 form.addEventListener('input',()=>{if(!busy)requestId=newId();});form.addEventListener('change',()=>{if(!busy)requestId=newId();});
 function drawSchedules(){
  $('schedules').replaceChildren();$('scheduleStatus').textContent='';const c=config?.classes[select.value];
  $('scheduleNote').textContent=c?.sessions===2?'Regular 2×: pilih dua hari berbeda, lalu tentukan jam pada masing-masing hari.':'Pilih hari, lalu tentukan jam latihan sesuai diskusi dengan admin.';
  if(!c)return;if(!c.schedules.length){$('scheduleStatus').textContent='Belum ada jadwal yang tersedia untuk kelas ini. Hubungi admin atau muat ulang pilihan jadwal.';submit.disabled=true;return;}
  submit.disabled=false;
  for(let i=0;i<c.sessions;i++){
   for(const [type,title] of [['day','Hari latihan'],['time','Jam & lokasi']]){const label=document.createElement('label');label.textContent=title+(c.sessions===2?' '+(i+1):'');const s=document.createElement('select');s.id=type+i;s.name=type+i;s.required=true;s.append(option('',type==='day'?'Pilih hari':'Pilih hari terlebih dahulu'));label.append(s);$('schedules').append(label);}
   $('day'+i).addEventListener('change',()=>{refreshTimes(i);if(i===0&&c.sessions===2)refreshDays(1);});
  }
  refreshDays(0);if(c.sessions===2)refreshDays(1);
 }
 function refreshDays(i){const c=config.classes[select.value],s=$('day'+i),previous=s.value;s.replaceChildren(option('','Pilih hari'));for(const day of [...new Set(c.schedules.map(x=>x.day))]){if(i===1&&String(day)===$('day0').value)continue;const a=c.schedules.find(x=>x.day===day);s.append(option(String(day),a.dayLabel));}if([...s.options].some(o=>o.value===previous))s.value=previous;refreshTimes(i);}
 function refreshTimes(i){const c=config.classes[select.value],s=$('time'+i),day=$('day'+i).value,previous=s.value;s.replaceChildren(option('',day?'Pilih jam latihan':'Pilih hari terlebih dahulu'));s.disabled=!day;for(const a of c.schedules.filter(x=>String(x.day)===day))s.append(option(a.value,a.start+'–'+a.end+' · '+a.place));if([...s.options].some(o=>o.value===previous))s.value=previous;}
 async function load(){const previous=select.value;select.disabled=true;submit.disabled=true;$('scheduleStatus').textContent='Memuat jadwal yang tersedia…';try{const r=await fetch('/registration/api/options',{cache:'no-store'});if(!r.ok)throw Error('Pilihan jadwal belum dapat dimuat. Coba lagi.');config=await r.json();select.replaceChildren(option('','Pilih kelas renang'));for(const name of Object.keys(config.classes))select.append(option(name,name));select.value=previous;select.disabled=false;drawSchedules();submit.disabled=!select.value||!config.classes[select.value]?.schedules.length;}catch(e){$('scheduleStatus').textContent=e.message;}}
 select.onchange=drawSchedules;$('refreshSchedules').onclick=()=>load();
 form.elements.foto.addEventListener('change',()=>{const f=form.elements.foto.files[0];$('photoStatus').classList.toggle('error',!!f&&f.size>20*1024*1024);$('photoStatus').textContent=f?(f.size>20*1024*1024?'Foto maksimal 20 MB. Pilih foto yang lebih kecil.':f.name+' · '+(f.size/1048576).toFixed(2)+' MB. Akan diperkecil sebelum disimpan.'):'Pilih satu foto anak.';});
 const read=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Foto belum dapat dibaca. Pilih ulang fotonya.'));r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(file);});
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!form.reportValidity())return;const file=form.elements.foto.files[0];if(!file||file.size>20*1024*1024){$('formStatus').textContent='Pilih foto anak maksimal 20 MB.';return;}
  const c=config?.classes[select.value];if(!c?.schedules.length){$('formStatus').textContent='Pilih kelas dan jadwal yang tersedia.';return;}
  const data=Object.fromEntries(new FormData(form));delete data.foto;data.consent=form.elements.consent.checked;data.version=config.version;data.requestId=requestId;data.schedules=Array.from({length:c.sessions},(_,i)=>$('time'+i).value);
  busy=true;submit.disabled=true;submit.textContent='Mengirim data & memperkecil foto…';$('formStatus').textContent='Tetap di halaman ini sampai pengiriman selesai.';form.setAttribute('aria-busy','true');
  try{data.foto={mime:file.type||'application/octet-stream',base64:await read(file)};const r=await fetch('/registration/api/submit',{method:'POST',headers:{'Content-Type':'application/json','X-BRTM-Request':'1'},body:JSON.stringify(data)});let result;try{result=await r.json();}catch{throw Error('Pengiriman belum dapat dipastikan. Coba kirim kembali tanpa mengubah isian.');}if(!r.ok)throw Error(result.pesan||'Data belum dapat dikirim. Coba lagi.');form.hidden=true;document.querySelector('.intro').hidden=true;$('success').hidden=false;$('success').focus();$('success').scrollIntoView({behavior:'smooth',block:'start'});}
  catch(error){$('formStatus').textContent=error.message||'Koneksi terputus. Coba kirim kembali tanpa mengubah isian.';}
  finally{busy=false;submit.disabled=false;submit.innerHTML='Kirim pendaftaran <span>→</span>';form.removeAttribute('aria-busy');}
 });
 load();
})();
