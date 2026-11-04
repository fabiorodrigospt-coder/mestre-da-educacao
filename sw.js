// Versão do cache: atualizar ao publicar nova versão.
const CACHE = 'mestre-educacao-v4-pvp-20261104-r2';
const ASSETS = ['./','./index.html','./config.js','./cloud.js','./pvp.js','./pvp.css','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', e => {e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); self.skipWaiting();});
self.addEventListener('activate', e => {e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k.startsWith('mestre-educacao-')&&k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim();});
self.addEventListener('fetch', e => {const url=new URL(e.request.url); if(e.request.method!=='GET'||url.origin!==self.location.origin) return; e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));});

