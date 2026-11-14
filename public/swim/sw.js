'use strict';
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// Network only. Never cache dashboards, sessions, API responses or personal data.
self.addEventListener('fetch',()=>{});

async function showBrtmPush(d){
 let image;
 // Read protected media with the current parent session. Do not publish child photos.
 if(typeof d.image==='string'&&/^\/swim\/api\/announcements\/[1-9]\d*\/photo$/.test(d.image)){
  try{const r=await fetch(d.image,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(4000)});if(r.ok&&r.headers.get('content-type')?.startsWith('image/')){const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length<=2*1024*1024){let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));image='data:'+r.headers.get('content-type')+';base64,'+btoa(raw);}}}catch{}
 }
 const options={body:d.body||'Ada kabar terbaru dari BRTM.',icon:'/swim/icons/brtm-swim-20261114b-192.png',badge:'/swim/icons/brtm-swim-20261114b-192.png',tag:d.tag||'brtm',data:{url:'/swim/'}};
 if(image)options.image=image;
 try{await self.registration.showNotification('BRTM SWIM',options);}catch{delete options.image;await self.registration.showNotification('BRTM SWIM',options);}
}
self.addEventListener('push',event=>{
 let d={};try{d=event.data.json();}catch{}
 event.waitUntil(showBrtmPush(d));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});const page=list.find(c=>new URL(c.url).pathname.startsWith('/swim/'));if(page){await page.focus();page.postMessage({type:'BRTM_OPEN_NOTIFICATIONS'});}else await self.clients.openWindow('/swim/?notifications=1');})());});
