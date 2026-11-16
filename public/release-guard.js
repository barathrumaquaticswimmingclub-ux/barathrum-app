'use strict';
(()=>{
 const meta=name=>document.querySelector('meta[name="'+name+'"]')?.content;
 const current=meta('brtm-release'),kind=meta('brtm-app');if(!current||!['staff','swim'].includes(kind))return;
 const nativeFetch=window.fetch.bind(window),root=document.documentElement,storageKey='brtm-icon-revision-'+kind;
 let phase='checking',latest=null,pending=null,iconConfirmed=null;const waiting=[];
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
 const stored=()=>{try{return localStorage.getItem(storageKey);}catch{return null;}};
 const remember=value=>{iconConfirmed=value;try{localStorage.setItem(storageKey,value);}catch{}};
 const isApi=url=>url.origin===location.origin&&(/^\/(api|auth)(\/|$)/.test(url.pathname)||url.pathname.startsWith('/swim/api/'));
 function gate(){
  if(!document.body)return;let el=document.getElementById('brtm-release-gate');if(!el){el=document.createElement('dialog');el.id='brtm-release-gate';el.addEventListener('cancel',e=>e.preventDefault());el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','release-title');document.body.append(el);}
  el.hidden=phase==='ready';if(el.hidden){if(el.open)el.close();return;}if(!el.open){if(typeof el.showModal==='function')el.showModal();else el.setAttribute('open','');}el.replaceChildren();
  const card=document.createElement('div');card.className='release-card';el.append(card);
  const add=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;card.append(node);return node;};
  const img=add('img');img.src=phase==='icon'&&latest?.apps[kind].icon?latest.apps[kind].icon:'/brand/barathrum-logo.png';img.alt='BRTM';
  const h=add('h1',phase==='checking'?'Memeriksa pembaruan…':phase==='offline'?'Hubungkan ke internet':phase==='icon'?'Samakan ikon aplikasi':'Pembaruan aplikasi wajib');h.id='release-title';
  if(phase==='checking'){add('p','Sebentar, kami memastikan aplikasi dan peraturan yang Anda buka sudah terbaru.');return;}
  if(phase==='offline'){add('p','Versi aplikasi belum dapat diperiksa. Periksa koneksi internet, lalu coba lagi sebelum melanjutkan.');const button=add('button','Coba lagi');button.onclick=()=>check();return;}
  if(phase==='update'){
   add('p','Ada pembaruan BRTM. Perbarui terlebih dahulu agar tampilan, sistem, dan peraturan yang digunakan sama dengan versi terbaru klub.');
   const button=add('button','Perbarui aplikasi');button.onclick=async()=>{button.disabled=true;button.textContent='Memuat versi terbaru…';try{const scope=kind==='staff'?'/club/':'/swim/';const job=navigator.serviceWorker?.getRegistration(scope).then(r=>r?.update()).catch(()=>{});await Promise.race([job||Promise.resolve(),new Promise(resolve=>setTimeout(resolve,2500))]);}finally{const url=new URL(location.href);url.searchParams.set('brtm_release',latest?.id||current);location.replace(url.href);}};
   const rules=add('a','Baca peraturan terbaru');rules.href='/rules/parent/';rules.target='_blank';rules.rel='noopener';add('small','Pembaruan memuat ulang halaman. Isian yang belum dikirim tidak tersimpan. Data yang sudah tersimpan di klub tetap ada.');return;
  }
  add('p','Ikon pada layar utama HP diperbarui oleh Android/iPhone. Ikuti panduan di bawah bila ikon yang terpasang belum sesuai; aplikasi tidak dapat memeriksanya otomatis.');
  const ol=add('ol');for(const text of ['Android: buka menu aplikasi → Review app update / Tinjau pembaruan jika tersedia.','Jika ikon belum berubah, pasang kembali melalui panduan pemasangan.','iPhone: hapus ikon lama, buka panduan di Safari, lalu Bagikan → Tambah ke Layar Utama.']){const li=document.createElement('li');li.textContent=text;ol.append(li);}
  const install=add('a','Buka panduan pemasangan');install.href=latest?.apps[kind].install||(kind==='staff'?'/club/install/':'/swim/install/');install.target='_blank';install.rel='noopener';
  const button=add('button','Ikon sudah sesuai — lanjutkan');button.onclick=()=>{remember(latest.apps[kind].iconRevision);setPhase('ready');};
  add('small','Ini konfirmasi Anda, bukan pemeriksaan otomatis ikon HP. Memasang ulang dapat meminta login dan izin notifikasi lagi; data anak tetap tersimpan di klub.');
 }
 function setPhase(value){phase=value;root.classList.toggle('brtm-release-locked',phase!=='ready');gate();if(phase==='ready')waiting.splice(0).forEach(w=>w.resolve());if(phase==='update')waiting.splice(0).forEach(w=>w.reject(Error('Perbarui aplikasi terlebih dahulu.')));}
 async function check(silent=false){
  if(pending)return pending;if(!silent||phase!=='ready')setPhase('checking');
  pending=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
   try{const r=await nativeFetch('/app-release',{cache:'no-store',credentials:'same-origin',signal:controller.signal});if(!r.ok)throw Error();const data=await r.json();if(!data.id||!data.apps?.[kind]?.iconRevision)throw Error();latest=data;
    if(data.id!==current)setPhase('update');
    else if(standalone()&&(iconConfirmed||stored())!==data.apps[kind].iconRevision)setPhase('icon');
    else{if(standalone())remember(data.apps[kind].iconRevision);setPhase('ready');}
   }catch{if(!silent||phase!=='ready')setPhase('offline');}finally{clearTimeout(timer);}
   return phase==='ready';
  })();try{return await pending;}finally{pending=null;}
 }
 window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,location.href);if(!isApi(url))return nativeFetch(input,init);
  if(pending)await pending;const method=String(init.method||(typeof input==='object'&&input.method)||'GET').toUpperCase();if(['GET','HEAD'].includes(method)&&['icon','offline','checking'].includes(phase))await new Promise((resolve,reject)=>waiting.push({resolve,reject}));if(phase!=='ready')throw Error('Perbarui aplikasi terlebih dahulu sebelum melanjutkan.');
  const headers=new Headers(typeof input==='object'&&input.headers?input.headers:undefined);new Headers(init.headers).forEach((v,k)=>headers.set(k,v));headers.set('X-BRTM-Release',current);
  const response=await nativeFetch(input,{...init,headers,cache:'no-store'});
  if(response.status===428){try{const d=await response.clone().json();if(d.code==='BRTM_UPDATE_REQUIRED'){latest={...(latest||{}),id:d.releaseId};setPhase('update');}}catch{}}
  return response;
 };
 document.addEventListener('DOMContentLoaded',gate);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check(true);});
 window.addEventListener('pageshow',()=>check(true));window.addEventListener('focus',()=>check(true));
 setInterval(()=>{if(!document.hidden)check(true);},60000);check();
})();
