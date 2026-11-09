'use strict';
// Only public offline-page assets are cached. Club data and credentials always use the network.
const CACHE = 'brtm-offline-v3';
const OFFLINE_ASSETS = ['/offline.html', '/offline.css', '/icons/brtm-brand-192.png', '/icons/brtm-brand-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('brtm-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/^\/(api|auth)(\/|$)/.test(url.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }
  if (OFFLINE_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});

self.addEventListener('push',event=>{let data={};try{data=event.data?.json()||{};}catch{}event.waitUntil(self.registration.showNotification('BRTM',{body:data.body||'Ada masukan baru dari orang tua.',tag:data.tag||'brtm-feedback',data:{url:'/club/'},icon:'/icons/brtm-brand-192.png'}));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});const page=list.find(c=>new URL(c.url).pathname.startsWith('/club/'));if(page){await page.focus();await page.navigate('/club/');}else await self.clients.openWindow('/club/');})());});
