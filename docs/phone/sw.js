// EG GLASS PHONE - service worker: rende l'app installabile. Prima la rete (aggiornamenti subito), poi la copia salvata.
// Non conserva mai i dati dell'account (Appwrite e il sistema online passano sempre dalla rete).
const CACHE = "eg-phone-v1";
const FILES = ["./", "index.html", "phone.js", "phone.css", "manifest.webmanifest", "icon-192.png", "icon-512.png",
               "apple-touch-icon.png", "../eg.js", "../eg.css", "../remoto/cloud.js", "../remoto/cloud.json"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
