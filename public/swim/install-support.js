'use strict';
(() => {
  const button=document.getElementById('install');
  if(!button)return;
  const dialog=document.getElementById('installHelp'),guide=document.getElementById('installGuide');
  const status=document.getElementById('installStatus');
  const staff=document.body.dataset.installApp==='staff',appName=staff?'BRTM':'BRTM SWIM';
  const apple=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  let promptEvent=null,platform=apple?'ios':'android',installComplete=false;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const say=text=>{if(status)status.textContent=text;};
  function choose(value){
    platform=value;
    for(const name of ['android','ios']){const panel=document.getElementById(name+'Help');if(panel)panel.hidden=name!==platform;}
    document.querySelectorAll('[data-install-platform]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab.dataset.installPlatform===platform)));
    const title=document.getElementById('guideTitle');if(title)title.textContent=platform==='ios'?'Pasang di iPhone':'Pasang di Android';
  }
  function sync(){
    const installed=standalone()||installComplete;
    button.hidden=installed;if(guide)guide.hidden=installed;
    if(installed)say(appName+' siap dibuka dari ikon aplikasi Anda.');
    else button.textContent=platform==='ios'?'Lihat cara pasang di iPhone':'Pasang '+appName;
  }
  function help(){
    if(dialog&&!dialog.open)dialog.showModal();
    if(guide)guide.scrollIntoView?.({behavior:'smooth',block:'nearest'});
    say(platform==='ios'?'Di Safari: Bagikan → Tambah ke Layar Utama → Tambah.':'Di Chrome: ketuk menu ⋮ → Instal aplikasi atau Tambahkan ke layar utama.');
  }
  document.querySelectorAll('[data-install-platform]').forEach(tab=>tab.addEventListener('click',()=>{choose(tab.dataset.installPlatform);sync();}));
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;sync();});
  window.addEventListener('appinstalled',()=>{installComplete=true;promptEvent=null;if(dialog?.open)dialog.close();sync();});
  button.addEventListener('click',async()=>{
    if(standalone()||installComplete)return;
    if(!promptEvent||platform==='ios'){help();return;}
    const event=promptEvent;promptEvent=null;button.disabled=true;
    try{
      await event.prompt();const choice=await event.userChoice;
      if(choice?.outcome==='accepted')say('Pemasangan disetujui. Buka ikon '+appName+' setelah pemasangan selesai.');
      else say('Pemasangan dibatalkan. Anda tetap bisa membuka '+appName+' melalui browser.');
    }catch{help();}
    finally{button.disabled=false;sync();}
  });
  document.getElementById('closeInstallHelp')?.addEventListener('click',()=>dialog.close());
  choose(platform);sync();
  if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register(staff?'/club/sw.js':'/swim/sw.js',{scope:staff?'/club/':'/swim/',updateViaCache:'none'}).catch(()=>{});
})();
