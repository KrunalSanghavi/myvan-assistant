// MyVan Assistant offline cache. Bump VERSION when you upload a new index.html.
const VERSION = "myvan-assistant-v2.11";
const CORE = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./fonts/inter-latin.woff2", "./fonts/space-grotesk-latin.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The app page: try the network first so updates arrive, fall back to the saved copy offline.
  if (req.mode === "navigate" && url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put("./index.html", copy));
        return res;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Icons, manifest and fonts: use the saved copy, refresh it in the background.
  if (url.origin === location.origin) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
