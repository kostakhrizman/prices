// Offline support and fast loads. Pages (navigations) come from the network when possible (fresh), and from the
// cache when there's no reception. Everything with a ?v= in its URL — scripts, styles, data — is served from the
// cache FIRST (the user, 2026-10-26): those URLs never change under the same name, so there's no need to ask the
// network. Each big data file is versioned by its own content hash (window.DATA_V / publish.py), so a publish only
// makes a phone re-download the files that actually changed, and the cache is kept across publishes.
const CACHE = "prices";                 // one cache, kept across builds (unchanged files stay)
const BUILD = "20261106211606";
const DATA_V = {"data/c-index.json": "579627f33f", "data/changes.json": "fe28e066f9", "data/deals.json": "72321615bd", "data/p-netto-052.json": "3f2338d766", "data/p-osherad-003.json": "8aa1467d00", "data/p-osherad-026.json": "92f3ed3896", "data/p-ramilevy-007.json": "978a4a24b3", "data/p-victory-038.json": "b6def70b1a", "data/products.json": "d67669d979"};     // {"data/products.json": "<hash>", ...}: the content-hashed data files
const CAT_V = {"data/c/0.json": "932cbdd9fc", "data/c/1.json": "77ff898766", "data/c/10.json": "b2e9ac41f8", "data/c/100.json": "b87fd02742", "data/c/101.json": "20f16f114b", "data/c/102.json": "fe6cac779c", "data/c/103.json": "679eade2f0", "data/c/104.json": "63b58c6440", "data/c/105.json": "29945be9ec", "data/c/106.json": "8efd4d967e", "data/c/107.json": "bcfa4c9a09", "data/c/108.json": "d5b685e659", "data/c/109.json": "8f704afceb", "data/c/11.json": "f2c3107745", "data/c/110.json": "c4442fa601", "data/c/111.json": "f8d097935d", "data/c/112.json": "917f46b5f0", "data/c/113.json": "f74ecc2793", "data/c/114.json": "98551d1335", "data/c/115.json": "473a72fc60", "data/c/116.json": "a8ee64bd5c", "data/c/117.json": "17b891b454", "data/c/118.json": "2e47bd4ce2", "data/c/119.json": "72d1a183c3", "data/c/12.json": "9dc90d449f", "data/c/120.json": "1ab00d0c4f", "data/c/121.json": "5d706f6eeb", "data/c/122.json": "f6110587f7", "data/c/123.json": "6361bcb144", "data/c/124.json": "ae67d02b60", "data/c/125.json": "2982fbdeb1", "data/c/126.json": "48533daa80", "data/c/127.json": "b37f14e218", "data/c/128.json": "a40623eab0", "data/c/129.json": "f1b1bdfcde", "data/c/13.json": "6a87798f5b", "data/c/130.json": "26212658f9", "data/c/131.json": "47167b7c0b", "data/c/132.json": "58ee5d13a6", "data/c/133.json": "87e84261d8", "data/c/134.json": "2ed5349f9a", "data/c/135.json": "06bff4e0fc", "data/c/136.json": "18b773a9c3", "data/c/137.json": "79feefdf2b", "data/c/138.json": "dfa2808633", "data/c/139.json": "b6cc3a9bf7", "data/c/14.json": "8861c032f2", "data/c/15.json": "7a7e59f25c", "data/c/16.json": "f523f9b9f4", "data/c/17.json": "a8cd38b506", "data/c/18.json": "2895b293e1", "data/c/19.json": "db8759867c", "data/c/2.json": "2b275c000c", "data/c/20.json": "24265a343f", "data/c/21.json": "55bab4c850", "data/c/22.json": "0b5220d453", "data/c/23.json": "1e587fefe0", "data/c/24.json": "7fa255638f", "data/c/25.json": "a755349ac5", "data/c/26.json": "57457e24eb", "data/c/27.json": "c06abd5384", "data/c/28.json": "5ccd85fe26", "data/c/29.json": "896c0c4be3", "data/c/3.json": "bd706ed7bf", "data/c/30.json": "e55e224fcf", "data/c/31.json": "e84858f54d", "data/c/32.json": "8bb11d719d", "data/c/33.json": "b519350ac5", "data/c/34.json": "a96bdc774c", "data/c/35.json": "b6f8c782cb", "data/c/36.json": "f4362c3262", "data/c/37.json": "45e7cd7765", "data/c/38.json": "e1868c45cb", "data/c/39.json": "d112b41a85", "data/c/4.json": "8c66b7f2ce", "data/c/40.json": "02e9c39c0f", "data/c/41.json": "d70acbc308", "data/c/42.json": "34276c3332", "data/c/43.json": "3549e12a83", "data/c/44.json": "e73a941d2f", "data/c/45.json": "df9d361565", "data/c/46.json": "635aeb42a8", "data/c/47.json": "13a1fe3ba9", "data/c/48.json": "399e833fda", "data/c/49.json": "4f73f641ac", "data/c/5.json": "ea72c7a647", "data/c/50.json": "df3913f08e", "data/c/51.json": "ad95fbc62b", "data/c/52.json": "5a8f413f56", "data/c/53.json": "4d2493ed3b", "data/c/54.json": "20e50d37db", "data/c/55.json": "10047a6391", "data/c/56.json": "eb9de3c6e9", "data/c/57.json": "678ac2cd88", "data/c/58.json": "930da51c60", "data/c/59.json": "4e1db0c3ac", "data/c/6.json": "14caaf61df", "data/c/60.json": "e458665d76", "data/c/61.json": "5ce43e5529", "data/c/62.json": "e5ea9d55b1", "data/c/63.json": "024a281ef8", "data/c/64.json": "8fa4cf95dd", "data/c/65.json": "fa9ba76e12", "data/c/66.json": "d96dd0f1c6", "data/c/67.json": "87253dc36b", "data/c/68.json": "de1f4067da", "data/c/69.json": "37e2206c4f", "data/c/7.json": "30835bde68", "data/c/70.json": "fbe488759b", "data/c/71.json": "648bd6f19b", "data/c/72.json": "66948cb706", "data/c/73.json": "b6379804f2", "data/c/74.json": "a86a99c2d7", "data/c/75.json": "196a579a9b", "data/c/76.json": "512461b714", "data/c/77.json": "471ba4b454", "data/c/78.json": "b7fa4721e7", "data/c/79.json": "a81f6e76fa", "data/c/8.json": "cae57a0195", "data/c/80.json": "0a179708aa", "data/c/81.json": "1f0a12033e", "data/c/82.json": "dc7a5169d2", "data/c/83.json": "3b1d6c4ef7", "data/c/84.json": "e64018da7f", "data/c/85.json": "09e909342f", "data/c/86.json": "3c8185b5bf", "data/c/87.json": "1ba4699937", "data/c/88.json": "2de3594767", "data/c/89.json": "60d2854b9f", "data/c/9.json": "b5edde0c6e", "data/c/90.json": "dd1d3201bb", "data/c/91.json": "76ce1d0e25", "data/c/92.json": "b92e3e806b", "data/c/93.json": "d8ea58a50d", "data/c/94.json": "aac51b9c8c", "data/c/95.json": "3f686e073c", "data/c/96.json": "01b78512cc", "data/c/97.json": "daa5654db0", "data/c/98.json": "9d513334ba", "data/c/99.json": "a1abf0b735"};       // {"data/c/12.json": "<hash>", ...}: one subcategory's prices each
// The shell: pages, scripts, styles, and the data a phone needs offline. ?v= makes each cache entry immutable.
const CORE = ["./", "index.html", "search.html", "basket.html", "settings.html", "scan.html", "receipt.html",
  "spending.html", "notes.html", "review.html", "deals.html", "butcher.html", "hishook.html",
  "static/scan.js?v=20261106211606", "static/receipt.js?v=20261106211606", "static/review.js?v=20261106211606",
  "static/notes.js?v=20261106211606", "static/groups.js?v=20261106211606", "static/spending.js?v=20261106211606",
  "static/receipt-upload.js?v=20261106211606", "static/compare.js?v=20261106211606", "static/avoid.js?v=20261106211606",
  "static/style.css?v=20261106211606", "static/basket.js?v=20261106211606", "static/render.js?v=20261106211606",
  "static/photo.js?v=20261106211606", "static/catpick.js?v=20261106211606", "static/basket-page.js?v=20261106211606",
  "static/search.js?v=20261106211606", "static/watch.js?v=20261106211606", "static/deals.js?v=20261106211606",
  "static/stores.js?v=20261106211606", "static/category.js?v=20261106211606",
  "data/changes.json?v=fe28e066f9", "data/deals.json?v=72321615bd",
  "data/products.json?v=d67669d979", "data/c-index.json?v=579627f33f"];
// (the per-store and per-subcategory price files are cached the first time a page asks for them)

// the version in a ?v= URL, and the path without it
function ver(url) {
  const m = url.match(/([^?]*)(?:\?|&)v=([^&]+)/);
  return m ? { path: m[1].replace(/^.*\/prices\//, "").replace(/^\//, ""), v: m[2] } : null;
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  // fetch only the shell files this cache doesn't already have: an unchanged file keeps the same ?v= URL, so
  // it is already cached and isn't downloaded again (the user: don't re-download what didn't change)
  e.waitUntil(caches.open(CACHE).then((c) =>
    Promise.all(CORE.map((u) => {
      const put = () => fetch(u).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null);
      // a ?v= asset is immutable: fetch it only when it isn't cached yet. A page (no ?v=) is refreshed so the
      // offline copy stays current after a publish.
      return /[?&]v=/.test(u) ? c.match(u).then((hit) => hit || put()) : put();
    }))));
});

self.addEventListener("activate", (e) => {
  // keep the cache; drop only stale versions of a file (an old ?v= of one that's now at another hash / build)
  e.waitUntil(caches.open(CACHE).then((c) => c.keys().then((reqs) => Promise.all(reqs.map((req) => {
    const u = ver(req.url);
    if (!u) return null;
    const current = DATA_V[u.path] || CAT_V[u.path] || BUILD;  // the version this build serves for that path
    return u.v === current ? null : c.delete(req);  // an older copy: remove it
  })))).then(() => self.clients.claim()));
});

// a navigation (page) can't be answered with a followed redirect ("/prices" -> "/prices/"); copy it
function page(request) {
  return fetch(request.url, { cache: "no-cache", credentials: "same-origin" }).then((res) =>
    (res.redirected ? res.blob().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers })) : res));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {  // pages: network first (fresh), cache when offline
    e.respondWith(page(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  if (/[?&]v=/.test(req.url)) {  // a versioned asset: cache first, the network only when it's not cached yet
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) =>
      hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  e.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true })));  // anything else: network, cache fallback
});