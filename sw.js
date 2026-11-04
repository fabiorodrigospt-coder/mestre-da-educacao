// Versão do cache: atualizar ao publicar nova versão.
const CACHE = 'mestre-educacao-v2-sem-verificacao-20261104';
const ASSETS = ['./','./index.html','./config.js','./cloud.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', e => {e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); self.skipWaiting();});
self.addEventListener('activate', e => {e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k.startsWith('mestre-educacao-')&&k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim();});
self.addEventListener('fetch', e => {const url=new URL(e.request.url); if(e.request.method!=='GET'||url.origin!==self.location.origin) return; e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));});
