// Service worker de Cheaster: permite instalarlo y jugar sin conexión.
const VERSION = "cheaster-v3-1";
const ARCHIVOS = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Primero la red (así siempre hay la última versión) y, si no hay conexión, lo guardado.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/socket.io/")) return; // las partidas online no se guardan
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)).catch(() => {}); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
