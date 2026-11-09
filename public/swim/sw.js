'use strict';
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// Network only. Never cache dashboards, sessions, API responses or personal data.
self.addEventListener('fetch',()=>{});

self.addEventListener('push',event=>{
 let d={};try{d=event.data.json();}catch{}
 event.waitUntil(self.registration.showNotification('BRTM SWIM',{body:d.body||'Ada kabar terbaru dari BRTM.',icon:'/swim/icons/swim-192.png',badge:'/swim/icons/swim-192.png',tag:d.tag||'brtm',data:{url:'/swim/'}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});const page=list.find(c=>new URL(c.url).pathname.startsWith('/swim/'));if(page){await page.focus();await page.navigate('/swim/');}else await self.clients.openWindow('/swim/');})());});
