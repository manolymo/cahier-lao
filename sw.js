/* Hors ligne : l'app et les sons déjà écoutés restent disponibles sans réseau. */
const V = "cahier-lao-v7";
const SHELL = ["./", "index.html", "app.css", "app.js", "manifest.webmanifest", "icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  const fresh = /\.(json|html|js|css)$/.test(u.pathname) || u.pathname.endsWith("/");
  if (fresh) { // réseau d'abord : nouvelles leçons et mises à jour
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => { const c = r.clone(); caches.open(V).then((ca) => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
  } else { // sons et images : cache d'abord
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(V).then((ca) => ca.put(e.request, c)); } return r; })));
  }
});
