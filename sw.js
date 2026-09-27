// Offline support: pages and data come from the network when possible (fresh
// prices), and from this cache when the phone has no reception.
const CACHE = "prices-20261007061534";
const CORE = ["./", "index.html", "search.html", "basket.html", "settings.html", "scan.html", "static/scan.js?v=20261007061534", "receipt.html", "static/receipt.js?v=20261007061534", "spending.html", "notes.html", "review.html", "static/review.js?v=20261007061534", "static/notes.js?v=20261007061534", "static/groups.js?v=20261007061534", "static/spending.js?v=20261007061534", "static/receipt-upload.js?v=20261007061534",
              "static/compare.js?v=20261007061534", "static/avoid.js?v=20261007061534", "static/style.css?v=20261007061534",
              "static/basket.js?v=20261007061534", "static/render.js?v=20261007061534", "static/photo.js?v=20261007061534", "static/basket-page.js?v=20261007061534",
              "static/search.js?v=20261007061534", "static/watch.js?v=20261007061534", "data/changes.json?v=20261007061534", "deals.html", "static/deals.js?v=20261007061534", "data/deals.json?v=20261007061534", "static/stores.js?v=20261007061534", "static/category.js?v=20261007061534", "data/products.json?v=20261007061534"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Pages are asked for with "no-cache": the browser checks with GitHub Pages every time (a quick
// "not modified" when nothing changed) instead of reusing a copy for up to 10 minutes, which showed
// pages from before an update. Scripts, styles and data carry ?v=<build>, so they can't be stale.
function get(request) {
  if (request.mode !== "navigate") return fetch(request);
  return fetch(request.url, { cache: "no-cache", credentials: "same-origin" }).then((res) =>
    // a navigation can't be answered with a followed redirect ("/prices" -> "/prices/"); copy it
    (res.redirected ? res.blob().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers })) : res));
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    get(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});