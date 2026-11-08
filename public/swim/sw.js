'use strict';
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// Network only. Never cache dashboards, sessions, API responses or personal data.
self.addEventListener('fetch',()=>{});
