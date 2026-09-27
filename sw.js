// Offline support and fast loads. Pages (navigations) come from the network when possible (fresh), and from the
// cache when there's no reception. Everything with a ?v= in its URL — scripts, styles, data — is served from the
// cache FIRST (the user, 2026-10-26): those URLs never change under the same name, so there's no need to ask the
// network. Each big data file is versioned by its own content hash (window.DATA_V / publish.py), so a publish only
// makes a phone re-download the files that actually changed, and the cache is kept across publishes.
const CACHE = "prices";                 // one cache, kept across builds (unchanged files stay)
const BUILD = "20261113211601";
const DATA_V = {"data/c-index.json": "288b45964a", "data/changes.json": "4f4a5308e7", "data/deals.json": "5b860b5f7d", "data/p-netto-052.json": "1d93e6c4e2", "data/p-osherad-003.json": "5ff4859812", "data/p-osherad-026.json": "c4a4c9b1ef", "data/p-ramilevy-007.json": "3ab40d205a", "data/p-victory-038.json": "f97dbc0fee", "data/products.json": "680ac37f51"};     // {"data/products.json": "<hash>", ...}: the content-hashed data files
const CAT_V = {"data/c/0.json": "ead183534e", "data/c/1.json": "28a4dc168b", "data/c/10.json": "8cffbeb2f5", "data/c/100.json": "4979459b9d", "data/c/101.json": "af8c9d46db", "data/c/102.json": "3dd44e37bc", "data/c/103.json": "4a7b7a87e8", "data/c/104.json": "5230103dc7", "data/c/105.json": "96a63b6bbd", "data/c/106.json": "df07b20307", "data/c/107.json": "81b7b4e9e0", "data/c/108.json": "7e5b774a84", "data/c/109.json": "11cca9a245", "data/c/11.json": "d47b75982d", "data/c/110.json": "59963e621b", "data/c/111.json": "dd02aeb09f", "data/c/112.json": "6c6ac4f081", "data/c/113.json": "04ec522e10", "data/c/114.json": "b20f456547", "data/c/115.json": "26310936bf", "data/c/116.json": "8bd064a2f3", "data/c/117.json": "d7cfea3383", "data/c/118.json": "878b1edcee", "data/c/119.json": "c6f1a03708", "data/c/12.json": "c29d978a46", "data/c/120.json": "ded19e9225", "data/c/121.json": "f15fff7bd7", "data/c/122.json": "147c378469", "data/c/123.json": "c68001e71a", "data/c/124.json": "a33cd6aa6f", "data/c/125.json": "033c8228b6", "data/c/126.json": "b9a8e313ab", "data/c/127.json": "5597eb26e4", "data/c/128.json": "b2b35e1b6f", "data/c/129.json": "cd8d3c4a32", "data/c/13.json": "94fda143f2", "data/c/130.json": "39f18cb4ea", "data/c/131.json": "d262385df8", "data/c/132.json": "a021777aba", "data/c/133.json": "2c6da5510f", "data/c/134.json": "f160694ce4", "data/c/135.json": "4368dff378", "data/c/136.json": "2d8e4ed9d9", "data/c/137.json": "7d07078097", "data/c/138.json": "9675d5e104", "data/c/139.json": "608b167261", "data/c/14.json": "6469072070", "data/c/15.json": "f42eecd50e", "data/c/16.json": "1b20389293", "data/c/17.json": "c5e410abf4", "data/c/18.json": "1b3de9047a", "data/c/19.json": "cfc8b128e1", "data/c/2.json": "e13d4e8f96", "data/c/20.json": "1edf3bf9e6", "data/c/21.json": "82236cdb19", "data/c/22.json": "4acfe16ab4", "data/c/23.json": "db4a6816bc", "data/c/24.json": "aab562dad2", "data/c/25.json": "1b482fef12", "data/c/26.json": "33e45ad623", "data/c/27.json": "05d3b07eda", "data/c/28.json": "8919f4a342", "data/c/29.json": "9333a28888", "data/c/3.json": "a682e65171", "data/c/30.json": "a6a52bb222", "data/c/31.json": "cd1e78fe5e", "data/c/32.json": "1b21adc99b", "data/c/33.json": "f2e7c1386c", "data/c/34.json": "aab89c62be", "data/c/35.json": "9c799c6962", "data/c/36.json": "cfcfed9bba", "data/c/37.json": "3caf24267a", "data/c/38.json": "2bbe26ca8c", "data/c/39.json": "73591a4b25", "data/c/4.json": "4c951f11ab", "data/c/40.json": "1e86802dc6", "data/c/41.json": "6a8d85b755", "data/c/42.json": "562b452c6c", "data/c/43.json": "ba7cd9fa45", "data/c/44.json": "c936026026", "data/c/45.json": "588a7af649", "data/c/46.json": "d87d768b1f", "data/c/47.json": "4f54d2c62b", "data/c/48.json": "23a9db5ee5", "data/c/49.json": "cc3dff9d46", "data/c/5.json": "e58be45143", "data/c/50.json": "17ef1a0075", "data/c/51.json": "1073f9e501", "data/c/52.json": "fca0641afd", "data/c/53.json": "f46dcb3b4b", "data/c/54.json": "4b08467c1b", "data/c/55.json": "d372352f3f", "data/c/56.json": "0dec96976a", "data/c/57.json": "c95daccdca", "data/c/58.json": "8489e45982", "data/c/59.json": "da894d05a2", "data/c/6.json": "d72b34fef2", "data/c/60.json": "553a172536", "data/c/61.json": "5e3a9c4e0b", "data/c/62.json": "aef4244336", "data/c/63.json": "908033cde3", "data/c/64.json": "17c9d1bdcb", "data/c/65.json": "250021753c", "data/c/66.json": "30bd0f5f0a", "data/c/67.json": "7fb63c6bfe", "data/c/68.json": "d96df087e5", "data/c/69.json": "50aa2108d9", "data/c/7.json": "96614b970b", "data/c/70.json": "425c9e7468", "data/c/71.json": "6f3f5ed61a", "data/c/72.json": "c3f03923c8", "data/c/73.json": "4c56ca2971", "data/c/74.json": "657b4d1b19", "data/c/75.json": "9235497f88", "data/c/76.json": "2141542b44", "data/c/77.json": "70b56a5921", "data/c/78.json": "942c53877d", "data/c/79.json": "fe862b7d20", "data/c/8.json": "9db13deaf7", "data/c/80.json": "69675d87fe", "data/c/81.json": "9b0da97e0d", "data/c/82.json": "7c905681e8", "data/c/83.json": "7b2e179c4d", "data/c/84.json": "e8f85dd09e", "data/c/85.json": "745a4a4a27", "data/c/86.json": "6bfdff09d1", "data/c/87.json": "ee0021294f", "data/c/88.json": "4bd0468bef", "data/c/89.json": "f73510955c", "data/c/9.json": "4ca0a4f690", "data/c/90.json": "5a12451d0f", "data/c/91.json": "4b7d34b56b", "data/c/92.json": "652131c653", "data/c/93.json": "2a0e672bed", "data/c/94.json": "6935715e64", "data/c/95.json": "be4be9844b", "data/c/96.json": "ef5da9542c", "data/c/97.json": "7a967f09d5", "data/c/98.json": "4885f73d27", "data/c/99.json": "c45eb2ca48"};       // {"data/c/12.json": "<hash>", ...}: one subcategory's prices each
// The shell: pages, scripts, styles, and the data a phone needs offline. ?v= makes each cache entry immutable.
const CORE = ["./", "index.html", "search.html", "basket.html", "settings.html", "scan.html", "receipt.html",
  "spending.html", "notes.html", "review.html", "deals.html", "butcher.html", "hishook.html",
  "static/scan.js?v=20261113211601", "static/receipt.js?v=20261113211601", "static/review.js?v=20261113211601",
  "static/notes.js?v=20261113211601", "static/groups.js?v=20261113211601", "static/spending.js?v=20261113211601",
  "static/receipt-upload.js?v=20261113211601", "static/compare.js?v=20261113211601", "static/avoid.js?v=20261113211601",
  "static/style.css?v=20261113211601", "static/basket.js?v=20261113211601", "static/render.js?v=20261113211601",
  "static/photo.js?v=20261113211601", "static/catpick.js?v=20261113211601", "static/basket-page.js?v=20261113211601",
  "static/search.js?v=20261113211601", "static/watch.js?v=20261113211601", "static/deals.js?v=20261113211601",
  "static/stores.js?v=20261113211601", "static/category.js?v=20261113211601",
  "data/changes.json?v=4f4a5308e7", "data/deals.json?v=5b860b5f7d",
  "data/products.json?v=680ac37f51", "data/c-index.json?v=288b45964a"];
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