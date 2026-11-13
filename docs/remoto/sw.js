// EG Remoto - service worker: rende l'app installabile e la apre anche con rete lenta.
// Conserva solo i file dell'app (mai i dati dell'account: quelli passano sempre dalla rete).
const CACHE = "eg-remoto-v2";
const FILES = ["./", "index.html", "remoto.js", "remoto.css", "manifest.webmanifest", "icon-192.png", "icon-512.png",
               "../eg.js", "../eg.css"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;   // Appwrite: sempre rete
  // prima la rete (cosi' gli aggiornamenti arrivano subito), se non c'e' la copia salvata
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
