// Offline support: serve the app from cache, update in the background.
// The Firebase scripts and font CSS load without CORS, so they come back "opaque" (no status): keep those too, or a signed-in phone opened offline lost sync.
const C="exam-journal-v13";const FILES=["./","index.html","config.js","manifest.json","icon.svg","icon-192.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:"reload"})))));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET")return;
 const own=u.origin===location.origin,lib=u.hostname==="www.gstatic.com"||u.hostname.endsWith("fonts.googleapis.com")||u.hostname==="fonts.gstatic.com";
 if(!own&&!lib)return;
 // The page itself: network first (3s), so a new build shows on the next open instead of one open later; cache when offline or slow.
 if(own&&(e.request.mode==="navigate"||/\/(index\.html|config\.js)?$/.test(u.pathname))){e.respondWith(caches.open(C).then(async c=>{
  const net=fetch(e.request,{cache:"no-cache"}).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;});
  net.catch(()=>{});const slow=new Promise(res=>setTimeout(res,3000)).then(()=>c.match(e.request));
  try{const r=await Promise.race([net,slow]);if(r)return r;return await net;}catch(x){return (await c.match(e.request))||(await c.match("index.html"))||Response.error();}}));return;}
 e.respondWith(caches.open(C).then(async c=>{const hit=await c.match(e.request);const net=fetch(e.request).then(r=>{if(r.ok||(lib&&r.type==="opaque"))c.put(e.request,r.clone());return r;}).catch(()=>hit);return hit||net;}));});
