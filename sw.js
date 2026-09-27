// Offline support and fast loads. Pages (navigations) come from the network when possible (fresh), and from the
// cache when there's no reception. Everything with a ?v= in its URL — scripts, styles, data — is served from the
// cache FIRST (the user, 2026-10-26): those URLs never change under the same name, so there's no need to ask the
// network. Each big data file is versioned by its own content hash (window.DATA_V / publish.py), so a publish only
// makes a phone re-download the files that actually changed, and the cache is kept across publishes.
const CACHE = "prices";                 // one cache, kept across builds (unchanged files stay)
const BUILD = "20261120211611";
const DATA_V = {"data/c-index.json": "356e081cae", "data/changes.json": "8cb357bb88", "data/deals.json": "f2f8ee24c4", "data/p-netto-052.json": "9768ea3ad4", "data/p-osherad-003.json": "15e834f04a", "data/p-osherad-026.json": "c0d9761602", "data/p-ramilevy-007.json": "7c762c111e", "data/p-victory-038.json": "466262d456", "data/products.json": "23b2cc5aea"};     // {"data/products.json": "<hash>", ...}: the content-hashed data files
const CAT_V = {"data/c/0.json": "592b63d0be", "data/c/1.json": "baa62c3423", "data/c/10.json": "55021650ec", "data/c/100.json": "223b01ff35", "data/c/101.json": "31343a941c", "data/c/102.json": "51ab3fb088", "data/c/103.json": "1938d7537f", "data/c/104.json": "e648a2039e", "data/c/105.json": "8e23a3a109", "data/c/106.json": "e7584d1e8c", "data/c/107.json": "56292b71f0", "data/c/108.json": "81955d4387", "data/c/109.json": "04c0c4d725", "data/c/11.json": "689e48afae", "data/c/110.json": "3dca7d4c28", "data/c/111.json": "d24f5f6971", "data/c/112.json": "1e86fa6218", "data/c/113.json": "a15658a980", "data/c/114.json": "1534df1253", "data/c/115.json": "6184d36f4a", "data/c/116.json": "875781ef21", "data/c/117.json": "ed2ed20955", "data/c/118.json": "0bd23b31ee", "data/c/119.json": "1f28c4604b", "data/c/12.json": "071be0a085", "data/c/120.json": "3b9e080ce6", "data/c/121.json": "d1766ebfc8", "data/c/122.json": "24cc0071e6", "data/c/123.json": "9ca3f0361e", "data/c/124.json": "2b8997f457", "data/c/125.json": "1d1bd6b3fa", "data/c/126.json": "3c6666c7c9", "data/c/127.json": "e654eebc1a", "data/c/128.json": "3af2e83e8c", "data/c/129.json": "65a271d348", "data/c/13.json": "41a1b1df7f", "data/c/130.json": "816fc3ed10", "data/c/131.json": "f58e6b6125", "data/c/132.json": "dcfa695afb", "data/c/133.json": "0a841c830e", "data/c/134.json": "14ffb9f514", "data/c/135.json": "eb241df9e3", "data/c/136.json": "f3056defdb", "data/c/137.json": "9544ac849e", "data/c/138.json": "d10493c707", "data/c/139.json": "f786c257bf", "data/c/14.json": "0e13e76926", "data/c/15.json": "ecb5aa31ce", "data/c/16.json": "5fec6023ef", "data/c/17.json": "1be3db1ed7", "data/c/18.json": "fd581f714a", "data/c/19.json": "d1fdae868a", "data/c/2.json": "3aaf5992a2", "data/c/20.json": "57bb9c9118", "data/c/21.json": "0ba5865209", "data/c/22.json": "70da670b31", "data/c/23.json": "dd351d5b2d", "data/c/24.json": "394d82a79e", "data/c/25.json": "11a77c76e1", "data/c/26.json": "31315081ed", "data/c/27.json": "87297c2ca4", "data/c/28.json": "021e68efe5", "data/c/29.json": "11d3e50dab", "data/c/3.json": "3592b38d89", "data/c/30.json": "b717b959ee", "data/c/31.json": "7763649390", "data/c/32.json": "06ba0a8494", "data/c/33.json": "049bf4e1a4", "data/c/34.json": "ad65e8205a", "data/c/35.json": "5b10d7a3af", "data/c/36.json": "98224b202f", "data/c/37.json": "6a80e9008d", "data/c/38.json": "f5ac3f0bd5", "data/c/39.json": "e690ff035e", "data/c/4.json": "d8f97ece18", "data/c/40.json": "c3043bd3e2", "data/c/41.json": "f761282c0d", "data/c/42.json": "e61a5dd8ce", "data/c/43.json": "a7cdf000a7", "data/c/44.json": "2fc6e63314", "data/c/45.json": "6fcdfad372", "data/c/46.json": "6318778c7d", "data/c/47.json": "49523e6677", "data/c/48.json": "82e2956e57", "data/c/49.json": "581fbd1aff", "data/c/5.json": "7659a1869c", "data/c/50.json": "de3e0812b5", "data/c/51.json": "9ef7829b35", "data/c/52.json": "584d6ec506", "data/c/53.json": "c97ecfa33a", "data/c/54.json": "20f2779c19", "data/c/55.json": "a476f131d2", "data/c/56.json": "5f9f4b3fdb", "data/c/57.json": "a03ffd1a2d", "data/c/58.json": "8d58919658", "data/c/59.json": "56fb80759b", "data/c/6.json": "5840eb8325", "data/c/60.json": "00505333d0", "data/c/61.json": "dc960dfca3", "data/c/62.json": "dcb187343a", "data/c/63.json": "1a740809fa", "data/c/64.json": "31196186ac", "data/c/65.json": "fedd838802", "data/c/66.json": "79ffdbd7d3", "data/c/67.json": "b3e3b3de09", "data/c/68.json": "bac94d08ef", "data/c/69.json": "d512d044ba", "data/c/7.json": "0d17969119", "data/c/70.json": "f9a173c45b", "data/c/71.json": "fd01362aa4", "data/c/72.json": "feb17e91ca", "data/c/73.json": "ba967e89f7", "data/c/74.json": "832078a1c2", "data/c/75.json": "5f1662b860", "data/c/76.json": "cbd2ed0a75", "data/c/77.json": "cb70515afb", "data/c/78.json": "a3226b6fd6", "data/c/79.json": "119215c93f", "data/c/8.json": "745300fe74", "data/c/80.json": "b74bb877f7", "data/c/81.json": "316d6afeb7", "data/c/82.json": "dfd19159b5", "data/c/83.json": "801d31beb8", "data/c/84.json": "bce1161c2a", "data/c/85.json": "b6fa816310", "data/c/86.json": "4c85d8777b", "data/c/87.json": "0cb5893c30", "data/c/88.json": "1b51a3e847", "data/c/89.json": "86094378ed", "data/c/9.json": "3b61e11145", "data/c/90.json": "cd2f52c3da", "data/c/91.json": "443b03ce35", "data/c/92.json": "2ef0c44ed1", "data/c/93.json": "9e824badf2", "data/c/94.json": "5837162c0a", "data/c/95.json": "f0fc102edf", "data/c/96.json": "0544458553", "data/c/97.json": "c9cd65a38d", "data/c/98.json": "4467d04467", "data/c/99.json": "5a0aa4393c"};       // {"data/c/12.json": "<hash>", ...}: one subcategory's prices each
// The shell: pages, scripts, styles, and the data a phone needs offline. ?v= makes each cache entry immutable.
const CORE = ["./", "index.html", "search.html", "basket.html", "settings.html", "scan.html", "receipt.html",
  "spending.html", "notes.html", "review.html", "deals.html", "butcher.html", "hishook.html",
  "static/scan.js?v=20261120211611", "static/receipt.js?v=20261120211611", "static/review.js?v=20261120211611",
  "static/notes.js?v=20261120211611", "static/groups.js?v=20261120211611", "static/spending.js?v=20261120211611",
  "static/receipt-upload.js?v=20261120211611", "static/compare.js?v=20261120211611", "static/avoid.js?v=20261120211611",
  "static/style.css?v=20261120211611", "static/basket.js?v=20261120211611", "static/render.js?v=20261120211611",
  "static/photo.js?v=20261120211611", "static/catpick.js?v=20261120211611", "static/basket-page.js?v=20261120211611",
  "static/search.js?v=20261120211611", "static/watch.js?v=20261120211611", "static/deals.js?v=20261120211611",
  "static/stores.js?v=20261120211611", "static/category.js?v=20261120211611",
  "data/changes.json?v=8cb357bb88", "data/deals.json?v=f2f8ee24c4",
  "data/products.json?v=23b2cc5aea", "data/c-index.json?v=356e081cae"];
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