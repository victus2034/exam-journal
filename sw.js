// Offline support: serve the app from cache, update in the background.
const C="exam-journal-v4";const FILES=["./","index.html","config.js","manifest.json","icon.svg","icon-192.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET")return;
 const own=u.origin===location.origin,lib=u.hostname==="www.gstatic.com"||u.hostname.endsWith("fonts.googleapis.com")||u.hostname==="fonts.gstatic.com";
 if(!own&&!lib)return;
 e.respondWith(caches.open(C).then(async c=>{const hit=await c.match(e.request);const net=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;}).catch(()=>hit);return hit||net;}));});
