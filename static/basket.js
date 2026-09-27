// The shopping list, shared by both phones. Loaded on every page.
//
// Items live in localStorage and, once a GitHub key is set up (settings.html), in list.json of a
// private GitHub repository. Every change is saved locally at once and pushed a moment later; on
// open and when the app comes back to the foreground the other phone's changes are pulled and
// merged per item (newer `updated` wins; deletions are kept as tombstones for a while so they
// don't come back). An item is general ("שמפו") until a product is chosen for it.
//
// list.json: {"items": {id: {text, product, qty, done, deleted, updated, note}}}
// One list, two views (the user, 2026-10-01): "רשימת קניות" (notes.html) is the clean one, text and tick boxes;
// "עגלת קניות" (basket.html) is the same items with products, prices and the store comparison. Every item is in
// both; a tick (done) is the same in both (and in the Android widget). `note` only says where an item was
// added; nothing moves between them any more. A group line ("פירות") is in the list only, until its items are
// picked. A quantity typed in the list ("2 חלב", "חלב x2") is the item's qty.
(function () {
  const LIST = "list", DIRTY = "listDirty", SETTINGS = "sync", OLD_BASKET = "basket", BLOCKED = "notAMatch";
  const TOMBSTONE_DAYS = 30;
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* keep going */ } };

  let list = read(LIST, { items: {} });
  const listeners = [];
  let status = "local", sha = null, pushTimer = null, pushing = false, pushAgain = false;

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function addRaw(fields, id = newId()) {
    list.items[id] = { text: "", product: null, qty: 1, done: false, deleted: false, ...fields, updated: Date.now() };
  }

  // one-time move of the old per-phone basket ({product_key: qty}) into the list
  const oldBasket = read(OLD_BASKET, null);
  if (oldBasket) {
    for (const [key, qty] of Object.entries(oldBasket)) addRaw({ product: key, qty });
    try { localStorage.removeItem(OLD_BASKET); } catch (e) { /* keep going */ }
    write(LIST, list);
    write(DIRTY, true);
  }

  // ---- list operations ----
  // a group line of the list ("פירות", "ירקות לרון"): a placeholder for picking, not something to price
  const GROUP_LINE = /^(?:פרי|פירות|ירק|ירקות|פיצוח|פיצוחים)(?:\s+ל\S+)?$/;
  const isGroup = (it) => GROUP_LINE.test(String(it.text || "").trim());
  // "2 חלב" / "חלב x2" / "3 יח' חלב" -> {text: "חלב", qty: 2}
  function quantity(line) {
    let m;
    if ((m = line.match(/^(\d+(?:\.\d+)?)\s*(?:x|×|יח['׳]?)?\s+(.+)$/))) return { text: m[2].trim(), qty: Number(m[1]) };
    if ((m = line.match(/^(.+?)\s*[x×]\s*(\d+(?:\.\d+)?)$/))) return { text: m[1].trim(), qty: Number(m[2]) };
    return { text: line, qty: 1 };
  }
  // the cart: every item but group lines
  const items = () => Object.entries(list.items).filter(([, it]) => !it.deleted && !isGroup(it)).map(([id, it]) => ({ id, ...it }));
  // the list: every item, oldest first (ids start with the time they were made)
  const notes = () => Object.entries(list.items).filter(([, it]) => !it.deleted)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, it]) => ({ id, ...it }));
  const open = () => items().filter((it) => !it.done);

  function changed() {
    write(LIST, list);
    write(DIRTY, true);
    notify();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 800);
  }
  // No duplicates in the cart (the user): one key per thing, spelled any way: Render's spelling rules
  // (norm: יי/וו, quotes, synonyms) and singular stems, word order ignored; numbers kept ("חלב 1%" ≠ "חלב 3%").
  // "עגבניות" = "עגבניה" = "עגבנייה".
  function keyOf(text) {
    const R = window.Render, t = String(text || "").toLowerCase();
    if (!R) return t.trim().replace(/\s+/g, " ");
    return R.norm(t).replace(/[.,()\-\/+*&!?:;"'׳״`]/g, " ").split(/\s+/).filter(Boolean)
      .map((w) => (/\d/.test(w) ? w : R.stem(w))).sort().join(" ");
  }
  const sameAs = (text) => { const k = keyOf(text); return k ? items().find((it) => keyOf(it.text) === k) : null; };
  // a cart item; one already there isn't added again (a ticked one comes back): "added" / "revived" / "had"
  function addOne(text, qty) {
    const old = sameAs(text);
    if (!old) { addRaw({ text, qty: qty || 1 }); return "added"; }
    if (!old.done) return "had";
    Object.assign(list.items[old.id], { done: false, updated: Date.now() });
    return "revived";
  }
  function add(text) {  // returns false when the cart already had it
    const r = addOne(text.trim());
    if (r !== "had") changed();
    return r === "added";
  }
  function addMany(entries) {  // [{text, qty}], saved as one change; returns the texts the cart already had
    const r = entries.map((e) => addOne(e.text, e.qty));
    if (r.some((x) => x !== "had")) changed();
    return entries.filter((e, i) => r[i] !== "added").map((e) => e.text);
  }
  // Duplicates already in the cart (added before this rule, or by the two phones at once): one stays (an
  // open one, with a chosen product if any, else the oldest), with the larger quantity. Returns whether any.
  function mergeDuplicates() {
    if (!window.Render) return false;
    const groups = new Map();
    for (const it of items()) {
      const k = keyOf(it.text);
      if (k) groups.set(k, [...(groups.get(k) || []), it]);
    }
    const now = Date.now();
    let any = false;
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const products = new Set(g.map((it) => it.product).filter(Boolean));
      if (products.size > 1) continue;  // two different chosen products: the user meant both
      g.sort((a, b) => (a.done - b.done) || (!a.product - !b.product) || (a.id < b.id ? -1 : 1));
      const keep = list.items[g[0].id];
      keep.qty = Math.max(...g.map((it) => it.qty || 1));
      keep.updated = now;
      for (const it of g.slice(1)) Object.assign(list.items[it.id], { deleted: true, updated: now });
      any = true;
    }
    if (any) changed();
    return any;
  }
  function addNotes(texts) {
    const t = Date.now().toString(36);  // ids in the order pasted (the list sorts by id)
    texts.forEach((line, i) => {
      const { text, qty } = quantity(line);
      addRaw({ text, qty, note: true }, t + String(i).padStart(3, "0") + Math.random().toString(36).slice(2, 5));
    });
    if (texts.length) changed();
  }
  // Lines written before the list and the cart became one kept their quantity in the text ("2 חלב"): made the
  // item's qty once, so the cart counts it.
  function normalizeQuantities() {
    const now = Date.now(), fix = [];
    for (const [id, it] of Object.entries(list.items)) {
      if (it.deleted || it.product || isGroup(it) || (it.qty && it.qty !== 1)) continue;
      const q = quantity(String(it.text || ""));
      if (q.qty !== 1 || q.text !== it.text) fix.push([id, q]);
    }
    for (const [id, q] of fix) Object.assign(list.items[id], { text: q.text, qty: q.qty, updated: now });
    if (fix.length) changed();
  }
  function setMany(changes) {  // [[id, fields]], saved as one change
    const now = Date.now();
    for (const [id, fields] of changes) if (list.items[id]) Object.assign(list.items[id], fields, { updated: now });
    if (changes.length) changed();
  }
  function set(id, fields) {
    const it = list.items[id];
    if (!it) return;
    Object.assign(it, fields, { updated: Date.now() });
    changed();
  }
  const remove = (id) => set(id, { deleted: true });
  const productItem = (key) => open().find((it) => it.product === key);
  function toggleProduct(key, name) {
    const it = productItem(key);
    if (it) remove(it.id);
    else { addRaw({ product: key, text: name || "" }); changed(); }
  }

  // header count and the +/✓ state of every add button on the page
  // ids of lines no store sells ("לא בסופר"): the cart leaves them out (basket-page.js / notes.js tell, once the
  // products are loaded; kept per phone so the count on every page skips them)
  let away = new Set(read("notInStore", []));
  function setAway(ids) {
    const next = new Set(ids);
    if (next.size === away.size && [...next].every((id) => away.has(id))) return;
    away = next;
    write("notInStore", [...away]);
    update();
  }
  function update() {
    const n = open().filter((it) => !away.has(it.id)).length;
    const count = document.getElementById("cart-count");
    if (count) count.textContent = n ? String(n) : "";
    const inList = new Set(open().map((it) => it.product));
    document.querySelectorAll("[data-add]").forEach((btn) => {
      const on = inList.has(btn.dataset.add);
      btn.classList.toggle("in", on);
      btn.textContent = on ? "✓" : "+";
      btn.setAttribute("aria-label", on ? "הסרה מהעגלה" : "הוספה לעגלה");
    });
  }
  function notify() { update(); listeners.forEach((f) => f()); }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (btn) toggleProduct(btn.dataset.add, btn.dataset.name);
  });

  // ---- sync with GitHub ----
  const settings = () => read(SETTINGS, {});
  const configured = () => { const s = settings(); return Boolean(s.token && s.repo); };
  const url = (s) => `https://api.github.com/repos/${s.repo}/contents/list.json`;
  const headers = (s) => ({ Authorization: `Bearer ${s.token}`, Accept: "application/vnd.github+json" });

  function decode(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function merge(remote) {
    for (const [id, r] of Object.entries(remote.items || {})) {
      const mine = list.items[id];
      if (!mine || r.updated > mine.updated) list.items[id] = r;
    }
    // the fruit / vegetable lists (static/groups.js), shared by both phones: the newer one wins
    for (const [g, r] of Object.entries(remote.groups || {})) {
      list.groups = list.groups || {};
      const mine = list.groups[g];
      if (!mine || r.updated > mine.updated) list.groups[g] = r;
    }
  }
  // {items: [...] or null (= the defaults), updated} for a group, or null when never edited
  const groupGet = (g) => (list.groups && list.groups[g]) || null;
  function groupSet(g, items) {
    list.groups = list.groups || {};
    list.groups[g] = { items, updated: Date.now() };
    changed();
  }
  function prune() {
    const cutoff = Date.now() - TOMBSTONE_DAYS * 864e5;
    for (const [id, it] of Object.entries(list.items)) if (it.deleted && it.updated < cutoff) delete list.items[id];
  }
  let lastError = null, lastDetail = "";  // GitHub's HTTP status and message for the last failure
  function setStatus(s) {
    status = s;
    if (s !== "error") { lastError = null; lastDetail = ""; }
    listeners.forEach((f) => f());
  }
  const failed = (e) => {
    lastError = e && e.status ? e.status : null;
    lastDetail = (e && e.detail) || (e && !e.status ? String(e.message || e) : "");
    setStatus(navigator.onLine ? "error" : "offline");
  };
  async function httpError(r, step) {
    let detail = "";
    try { detail = (await r.json()).message || ""; } catch (e) { /* no body */ }
    return Object.assign(new Error(`GitHub ${r.status}`), { status: r.status, detail: `${step}: ${detail}` });
  }

  // A renamed repository answers 301 with its numeric id; the browser won't follow that redirect
  // with our key attached. Look up the new name, store it in the settings and report whether it did.
  async function followRename(r, s) {
    if (![301, 307, 308].includes(r.status)) return false;
    let id = null;
    try { id = ((await r.json()).url || "").match(/repositories\/(\d+)/); } catch (e) { /* no body */ }
    if (!id) return false;
    const repo = await fetch(`https://api.github.com/repositories/${id[1]}`, { headers: headers(s), cache: "no-store" });
    if (!repo.ok) return false;
    const name = (await repo.json()).full_name;
    if (!name || name === s.repo) return false;
    write(SETTINGS, { ...s, repo: name });
    return true;
  }

  async function pull(renamed = false) {
    if (!configured()) { setStatus("unconfigured"); return false; }
    const s = settings();
    try {
      const r = await fetch(url(s), { headers: headers(s), cache: "no-store" });
      if (!renamed && await followRename(r, s)) return pull(true);
      if (r.status === 404) {
        // no list yet (the first push creates it), unless the repository itself is out of reach
        const repo = await fetch(`https://api.github.com/repos/${s.repo}`, { headers: headers(s), cache: "no-store" });
        if (!renamed && await followRename(repo, s)) return pull(true);
        if (!repo.ok) throw await httpError(repo, "repository");
        sha = null;
      }
      else if (!r.ok) throw await httpError(r, "read list");
      else {
        const j = await r.json();
        sha = j.sha;
        merge(JSON.parse(decode(j.content)));
        write(LIST, list);
      }
      setStatus(read(DIRTY, false) ? "saving" : "synced");
      notify();
      return true;
    } catch (e) {
      failed(e);
      return false;
    }
  }

  async function push() {
    if (!configured() || !read(DIRTY, false)) return;
    if (pushing) { pushAgain = true; return; }
    pushing = true;
    setStatus("saving");
    const s = settings();
    try {
      for (let attempt = 0; ; attempt++) {
        prune();
        const body = { message: "Update shopping list", content: encode(JSON.stringify(list)) };
        if (sha) body.sha = sha;
        const r = await fetch(url(s), { method: "PUT", headers: headers(s), body: JSON.stringify(body) });
        if (r.ok) {
          sha = (await r.json()).content.sha;
          write(DIRTY, false);
          setStatus("synced");
          break;
        }
        // 409 / 422: the file changed since we read it (the other phone saved first): merge and retry
        if ((r.status === 409 || r.status === 422) && attempt < 3 && await pull()) continue;
        throw await httpError(r, "save list");
      }
    } catch (e) {
      failed(e);
    }
    pushing = false;
    if (pushAgain) { pushAgain = false; push(); }
  }

  async function sync() {
    if (await pull()) await push();
  }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
  window.addEventListener("online", sync);

  function saveSettings(s) { write(SETTINGS, s); sha = null; return sync(); }

  // ---- pairs the user marked "not a match" (swaps, compare equivalents); stay on this phone ----
  let blockedPairs = null;  // read once: the compare checks thousands of pairs
  function blocked() {
    if (blockedPairs === null) blockedPairs = read(BLOCKED, {});
    return blockedPairs;
  }
  function isBlocked(a, b) {
    const x = blocked();
    return Boolean((x[a] && x[a].includes(b)) || (x[b] && x[b].includes(a)));
  }
  function block(a, b) {
    const x = blocked();
    (x[a] = x[a] || []).push(b);
    write(BLOCKED, x);
  }
  function unblock(a, b) {
    const x = blocked();
    for (const [p, q] of [[a, b], [b, a]]) {
      if (x[p]) x[p] = x[p].filter((k) => k !== q);
      if (x[p] && !x[p].length) delete x[p];
    }
    write(BLOCKED, x);
  }
  const blockedList = () => Object.entries(blocked()).flatMap(([a, bs]) => bs.map((b) => [a, b]));
  function clearBlocked() { blockedPairs = {}; write(BLOCKED, {}); }

  window.Basket = {
    items, notes, addNotes, setMany, add, addMany, keyOf, mergeDuplicates, quantity, isGroup, setAway, set, remove, groupGet, groupSet, toggleProduct, update, sync, settings, saveSettings, configured,
    status: () => status, lastError: () => lastError, lastDetail: () => lastDetail, onChange: (f) => listeners.push(f),
    isBlocked, block, unblock, blockedList, clearBlocked,
    // the list repository, for other pages that store files there (receipts)
    github: {
      url: (path) => `https://api.github.com/repos/${settings().repo}/contents/${path}`,
      headers: () => headers(settings()),
      encode, decode,
    },
  };
  // Inside the Android app (the TWA opens pages with the referrer android-app://<package>; remembered for the
  // tab), the links to the shopping list and the cart go through the app (OpenActivity), which first saves what
  // the home-screen widget holds: the user wants that done when entering these two pages, not when opening the
  // app. In a browser the links stay as they are.
  const APP = "io.github.kostakhrizman.prices";
  try { if (document.referrer.startsWith("android-app://" + APP)) sessionStorage.setItem("inApp", "1"); } catch (e) { /* none */ }
  const inApp = () => { try { return sessionStorage.getItem("inApp") === "1"; } catch (e) { return false; } };
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || !inApp() || e.defaultPrevented) return;
    const page = (a.getAttribute("href").match(/(?:^|\/)(notes|basket)\.html(?:[?#].*)?$/) || [])[1];
    if (!page) return;
    e.preventDefault();
    // an app older than version 13 has no such link: Chrome then opens the page itself (browser_fallback_url),
    // not the Play Store ("Item not found", seen on 2026-10-01)
    const fallback = encodeURIComponent(new URL(`${page}.html`, location.href).href);
    location.href = `intent://open#Intent;scheme=mechiron;package=${APP};S.page=${page}.html;S.browser_fallback_url=${fallback};end`;
  });

  update();
  sync().then(normalizeQuantities);
})();
