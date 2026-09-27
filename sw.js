// Offline support and fast loads. Pages (navigations) come from the network when possible (fresh), and from the
// cache when there's no reception. Everything with a ?v= in its URL — scripts, styles, data — is served from the
// cache FIRST (the user, 2026-10-26): those URLs never change under the same name, so there's no need to ask the
// network. Each big data file is versioned by its own content hash (window.DATA_V / publish.py), so a publish only
// makes a phone re-download the files that actually changed, and the cache is kept across publishes.
const CACHE = "prices";                 // one cache, kept across builds (unchanged files stay)
const BUILD = "20261030211605";
const DATA_V = {"data/c-index.json": "09b19d6312", "data/changes.json": "017efaea37", "data/deals.json": "2a7bb1cb90", "data/p-netto-052.json": "faa4a6b3dd", "data/p-osherad-003.json": "5fd1455e9c", "data/p-osherad-026.json": "06a0e30055", "data/p-ramilevy-007.json": "30feb55407", "data/p-victory-038.json": "961bf2722f", "data/products.json": "eb98dfa8bd"};     // {"data/products.json": "<hash>", ...}: the content-hashed data files
const CAT_V = {"data/c/0.json": "3ce0d8d816", "data/c/1.json": "391e9bbc44", "data/c/10.json": "f7ac733568", "data/c/100.json": "5deddd0c81", "data/c/101.json": "543d7cb565", "data/c/102.json": "8b08b6a2b3", "data/c/103.json": "bdc913b0f9", "data/c/104.json": "e4034d47c6", "data/c/105.json": "66e4696b20", "data/c/106.json": "d932aa46b6", "data/c/107.json": "45095346aa", "data/c/108.json": "ee931d7791", "data/c/109.json": "f87e9fac8e", "data/c/11.json": "646e295373", "data/c/110.json": "1619367ad5", "data/c/111.json": "c83c8c0dbe", "data/c/112.json": "51502b3d95", "data/c/113.json": "a3e2a01d53", "data/c/115.json": "f4179cc84d", "data/c/116.json": "bc9b4eb4f5", "data/c/117.json": "5f1f1c2040", "data/c/118.json": "814879b1c4", "data/c/119.json": "5a4b471993", "data/c/12.json": "dc7ad9d820", "data/c/120.json": "843826685b", "data/c/121.json": "33ebb4bd91", "data/c/122.json": "062b07f952", "data/c/123.json": "3bf96d9b49", "data/c/124.json": "868bfa80ae", "data/c/125.json": "b4b8ec58e2", "data/c/126.json": "4217e0bfe4", "data/c/127.json": "f59fd1f4b3", "data/c/128.json": "b6eec07e2b", "data/c/129.json": "470e0856f9", "data/c/13.json": "4aa930f7c5", "data/c/130.json": "45906d397a", "data/c/131.json": "95828b1ce6", "data/c/132.json": "3cd3716c98", "data/c/133.json": "4281c6b062", "data/c/134.json": "f51088dd01", "data/c/135.json": "00517cd725", "data/c/136.json": "64cc78f7d1", "data/c/137.json": "2484ff4a1f", "data/c/138.json": "a579747959", "data/c/139.json": "3666630e5b", "data/c/14.json": "cf9cf3bed7", "data/c/15.json": "82f1fa4355", "data/c/16.json": "a46e7201f2", "data/c/17.json": "4b81359105", "data/c/18.json": "e0ccaa8796", "data/c/19.json": "adfc9c5472", "data/c/2.json": "cae198b5a3", "data/c/20.json": "50dcf377f0", "data/c/21.json": "f79b9e7c63", "data/c/22.json": "db88131853", "data/c/23.json": "29354f30d9", "data/c/24.json": "b6fb624873", "data/c/25.json": "035cbed3ec", "data/c/26.json": "43327d3872", "data/c/27.json": "721381a75c", "data/c/28.json": "1983bb1c4b", "data/c/29.json": "0c27cfb867", "data/c/3.json": "c173a6bf74", "data/c/30.json": "a5e10d6d3d", "data/c/31.json": "57c6e7e9b9", "data/c/32.json": "2b45031524", "data/c/33.json": "61e3a43787", "data/c/34.json": "76528ee47a", "data/c/35.json": "1cab1814bd", "data/c/36.json": "c32b528745", "data/c/37.json": "3fd9a282a0", "data/c/38.json": "df7bfb7d4f", "data/c/39.json": "09d81e4f58", "data/c/4.json": "4d12e20928", "data/c/40.json": "efa3e0b15f", "data/c/41.json": "6a5e53798d", "data/c/42.json": "61cbb0fdcd", "data/c/43.json": "9c2fb9234d", "data/c/44.json": "ccf6e5e1be", "data/c/45.json": "2d51cf28a1", "data/c/46.json": "ce4acaf9bf", "data/c/47.json": "cdcd2cba97", "data/c/48.json": "81ae58e886", "data/c/49.json": "3fb0e0360b", "data/c/5.json": "55ab444f77", "data/c/50.json": "cb7871caad", "data/c/51.json": "0023322ce6", "data/c/52.json": "5a48c694e3", "data/c/53.json": "63834d985d", "data/c/54.json": "7534e68afa", "data/c/55.json": "129c72a7da", "data/c/56.json": "8437e1d4c3", "data/c/57.json": "31ea5a9fb5", "data/c/58.json": "a095f23ff4", "data/c/59.json": "71ba3a860f", "data/c/6.json": "3fb9de9900", "data/c/60.json": "539e2699d4", "data/c/61.json": "a0b35816db", "data/c/62.json": "38fc4b5ca6", "data/c/63.json": "0ec0b9f92d", "data/c/64.json": "c3305b342d", "data/c/65.json": "aa9acf8c1e", "data/c/66.json": "35c458a0fc", "data/c/67.json": "80a1354fb8", "data/c/68.json": "a83f4ccd1f", "data/c/69.json": "156544baae", "data/c/7.json": "9376f971e3", "data/c/70.json": "910e6d5624", "data/c/71.json": "f1ff7ee741", "data/c/72.json": "336c5766ac", "data/c/73.json": "530dcebc02", "data/c/74.json": "05685aab9a", "data/c/75.json": "d51e7419ad", "data/c/76.json": "35a52d80d9", "data/c/77.json": "fdb16eaf75", "data/c/78.json": "97f0b2d400", "data/c/79.json": "5264dbaf04", "data/c/8.json": "51153e80ef", "data/c/80.json": "ffbd47c6ec", "data/c/81.json": "53534b83b8", "data/c/82.json": "dd02c89474", "data/c/83.json": "e51ae1dd50", "data/c/84.json": "58ab7722be", "data/c/85.json": "6c9271f58e", "data/c/86.json": "52b52edb5d", "data/c/87.json": "7576cb6380", "data/c/88.json": "26176f96d3", "data/c/89.json": "c8ecfd1e03", "data/c/9.json": "88428aa14c", "data/c/90.json": "eb982f4452", "data/c/91.json": "461569e338", "data/c/92.json": "7cd588ad22", "data/c/93.json": "7d69ae4571", "data/c/94.json": "d7c7582d2e", "data/c/95.json": "423f3bdcaf", "data/c/96.json": "24fc10e306", "data/c/97.json": "e53726f5e8", "data/c/98.json": "58a1c76e22", "data/c/99.json": "8387bf137a"};       // {"data/c/12.json": "<hash>", ...}: one subcategory's prices each
// The shell: pages, scripts, styles, and the data a phone needs offline. ?v= makes each cache entry immutable.
const CORE = ["./", "index.html", "search.html", "basket.html", "settings.html", "scan.html", "receipt.html",
  "spending.html", "notes.html", "review.html", "deals.html", "butcher.html", "hishook.html",
  "static/scan.js?v=20261030211605", "static/receipt.js?v=20261030211605", "static/review.js?v=20261030211605",
  "static/notes.js?v=20261030211605", "static/groups.js?v=20261030211605", "static/spending.js?v=20261030211605",
  "static/receipt-upload.js?v=20261030211605", "static/compare.js?v=20261030211605", "static/avoid.js?v=20261030211605",
  "static/style.css?v=20261030211605", "static/basket.js?v=20261030211605", "static/render.js?v=20261030211605",
  "static/photo.js?v=20261030211605", "static/catpick.js?v=20261030211605", "static/basket-page.js?v=20261030211605",
  "static/search.js?v=20261030211605", "static/watch.js?v=20261030211605", "static/deals.js?v=20261030211605",
  "static/stores.js?v=20261030211605", "static/category.js?v=20261030211605",
  "data/changes.json?v=017efaea37", "data/deals.json?v=2a7bb1cb90",
  "data/products.json?v=eb98dfa8bd", "data/c-index.json?v=09b19d6312"];
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