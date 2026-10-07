// A category page: the name filter, and a redraw for phones that picked other stores.
// - Filter (#cat-filter): every typed word must be in the product's name or maker, singular = plural
//   (Render.hasStem); a word starting with "-" hides products that have it ("-לייט"). It hides rows
//   in place, so it works on the pre-built list and on the redrawn one alike.
// - Chips under it (the user, 2026-10-07): one per store on the page (sold there, cheapest or not) and the
//   page's most frequent name words ("סטייק", "כתף" in beef), counted from the rows shown, so they follow
//   the store choice. Within a row of chips any chip may match (סטייק or כתף); the rows and the typed
//   words must all match. The choice stays for this page while the tab is open (sessionStorage).
// - The page is pre-built for the default stores (publish.py). When this phone picked other stores
//   (static/stores.js), its products are redrawn from data/products.json for those stores.
(function () {
  const { load, rowsHtml, norm, words, stem, hasStem, esc } = window.Render;
  const build = document.currentScript.dataset.build;
  const box = document.getElementById("cat-list");
  const count = document.getElementById("cat-count");
  const input = document.getElementById("cat-filter");

  // Words that say nothing about which product it is: how it's sold, kosher marks, "fresh" on a fresh page,
  // units, small words. A word in 60% of the page's products (עוף in chicken) is left out too.
  const PLAIN = new Set(["טרי", "טריה", "טריים", "קפוא", "קפואה", "קפואים", "מחיר", "משקל", "לפי", "במשקל", "ארוז", "ארוזה",
    "מס", "מספר", "עם", "ללא", "בלי", "של", "על", "או", "גרם", "גר", "מל", "ליטר", "קג", "קילו", "יח", "יחידות", "יחידה",
    "מארז", "אריזה", "מוכשר", "כשר", "גלאט", "מהדרין", "בדצ", "צרכני", "יבוא", "חלק", "מבצע", "חדש", "ישראל", "איכות"]);
  const SAY = { "תפוא": "תפוחי אדמה" };
  // the stores' own names, which some write into their products' names ("אטריות דקות רמילוי")
  const own = new Set(window.Stores.list.flatMap((st) => words(st.name)).concat(["רמילוי"]));
  const MOST = 0.6, MIN = 3, TOP = 12, MORE = 30;
  const chips = document.createElement("div");
  chips.className = "cat-chips";
  (input ? input.closest(".cat-filter") : box).insertAdjacentElement(input ? "afterend" : "beforebegin", chips);
  let pick = { stores: [], words: [] }, open = false;
  const memo = "catChips:" + box.dataset.href;
  try { pick = JSON.parse(sessionStorage.getItem(memo)) || pick; } catch (e) { /* none yet */ }
  const keep = () => { try { sessionStorage.setItem(memo, JSON.stringify(pick)); } catch (e) { /* private mode */ } };

  const nameOf = (li) => { const n = li.querySelector(".name"); return n ? n.firstChild.textContent : ""; };
  // the stores a row is sold at, by short name ("אושר עד" for both branches)
  function storesOf(li) {
    const list = window.Stores.list, at = new Set();
    const add = (el) => { const m = /(?:^|\s)st-(\d+)(?:\s|$)/.exec(el.className); if (m && list[+m[1]]) at.add(list[+m[1]].short); };
    add(li);
    li.querySelectorAll(".stores .other").forEach(add);
    return at;
  }
  function wordsOf(rows) {
    const seen = new Map();  // stem -> {label: count of products, n}
    for (const li of rows) {
      const mine = new Map();
      // matched as the search normalizes it (סטיק, תפוא), shown as the stores write it (סטייק, תפוחי אדמה)
      const name = nameOf(li), shown = new Map();
      for (const raw of name.replace(/[.,()\-\/+*%&'"`׳״]/g, " ").split(/\s+/)) { const w = words(raw)[0]; if (w) shown.set(w, raw); }
      for (const w of words(name)) if (!PLAIN.has(w) && !own.has(w) && !mine.has(stem(w))) mine.set(stem(w), SAY[w] || shown.get(w) || w);
      for (const [s, w] of mine) {
        const e = seen.get(s) || { n: 0, forms: new Map() };
        e.n++; e.forms.set(w, (e.forms.get(w) || 0) + 1);
        seen.set(s, e);
      }
    }
    // "פרגיות" stems to "פרגיה", but its singular is "פרגית": one chip when the page has both
    for (const [s, e] of seen) {
      const t = s.slice(0, -1) + "ת";
      if (s.endsWith("ה") && seen.has(t) && [...e.forms.keys()].every((w) => w.endsWith("ות"))) {
        const into = seen.get(t);
        into.n += e.n;
        for (const [w, c] of e.forms) into.forms.set(w, c);
        seen.delete(s);
      }
    }
    return [...seen.values()].filter((e) => e.n >= MIN && e.n < rows.length * MOST)
      .sort((a, b) => b.n - a.n)
      .map((e) => ({ word: [...e.forms].sort((a, b) => b[1] - a[1])[0][0], n: e.n }));
  }
  function drawChips() {
    const rows = [...box.querySelectorAll("li.product")];
    if (rows.length < 2) { chips.innerHTML = ""; return; }
    const here = new Set(rows.flatMap((li) => [...storesOf(li)]));
    const shorts = [...new Set(window.Stores.list.map((st) => st.short))].filter((s) => here.has(s));
    const tops = wordsOf(rows);
    // a chosen word stays, even when it's no longer among the top ones
    const shown = tops.slice(0, open ? MORE : TOP);
    for (const w of pick.words) if (!shown.some((x) => x.word === w)) shown.push({ word: w, n: 0 });
    pick.stores = pick.stores.filter((s) => shorts.includes(s));
    const btn = (kind, v, label) => `<button type="button" data-${kind}="${esc(v)}" class="${pick[kind === "store" ? "stores" : "words"].includes(v) ? "on" : ""}">${label}</button>`;
    // a store chip in the store's colour (the page's .st-N rules)
    const tint = (s) => `st-${window.Stores.list.findIndex((st) => st.short === s)}`;
    chips.innerHTML = (shorts.length > 1 ? `<div class="dept-chips stores">${shorts.map((s) => btn("store", s, esc(s)).replace('class="', `class="${tint(s)} `)).join("")}</div>` : "") +
      (shown.length ? `<div class="dept-chips">${shown.map((x) => btn("word", x.word, `${esc(x.word)}${x.n ? ` <small>${x.n}</small>` : ""}`)).join("")}` +
        (tops.length > TOP ? `<button type="button" class="link" data-more>${open ? "פחות" : "עוד…"}</button>` : "") + "</div>" : "") +
      (pick.stores.length || pick.words.length ? '<button type="button" class="link" data-clear>ניקוי הבחירה</button>' : "");
  }
  chips.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const flip = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    if (b.dataset.store !== undefined) pick.stores = flip(pick.stores, b.dataset.store);
    else if (b.dataset.word !== undefined) pick.words = flip(pick.words, b.dataset.word);
    else if (b.dataset.more !== undefined) open = !open;
    else if (b.dataset.clear !== undefined) pick = { stores: [], words: [] };
    keep();
    drawChips();
    filter();
  });

  // processed kinds this phone hides (static/avoid.js): out of the list, with a line saying how many
  function dropAvoided() {
    let n = 0;
    for (const li of box.querySelectorAll("li.product[data-kind]")) if (window.Avoid.hides(li.dataset.kind)) { li.remove(); n++; }
    if (!n) return;
    const list = box.querySelector("ol.products");
    if (list && !list.querySelector("li.product")) list.outerHTML = '<p class="empty">אין מוצרים אחרים בקטגוריה הזו.</p>';
    else if (list && list.firstElementChild.classList.contains("divider")) list.firstElementChild.remove();
    box.insertAdjacentHTML("afterbegin", window.Avoid.note(n));
    count.textContent = box.querySelectorAll("li.product").length;
  }
  dropAvoided();

  function filter() {
    const rows = [...box.querySelectorAll("li.product")];
    const words = input ? norm(input.value).split(/\s+/).filter((w) => w && w !== "-") : [];
    const want = words.filter((w) => !w.startsWith("-")), hide = words.filter((w) => w.startsWith("-")).map((w) => w.slice(1));
    let shown = 0;
    for (const li of rows) {
      const name = li.querySelector(".name"), maker = li.querySelector(".meta span");
      const text = norm((name ? name.textContent : "") + " " + (maker ? maker.textContent : ""));
      const ok = want.every((w) => hasStem(text, w)) && !hide.some((w) => hasStem(text, w)) &&
        (!pick.words.length || pick.words.some((w) => hasStem(norm(nameOf(li)), norm(w)))) &&
        (!pick.stores.length || [...storesOf(li)].some((s) => pick.stores.includes(s)));
      li.hidden = !ok;
      if (ok) shown++;
    }
    // the "no size" divider only when products are shown on both sides of it
    for (const d of box.querySelectorAll("li.divider")) {
      const i = rows.findIndex((li) => d.compareDocumentPosition(li) & Node.DOCUMENT_POSITION_FOLLOWING);
      const after = i < 0 ? [] : rows.slice(i), before = i < 0 ? rows : rows.slice(0, i);
      d.hidden = !(before.some((li) => !li.hidden) && after.some((li) => !li.hidden));
    }
    count.textContent = words.length || pick.words.length || pick.stores.length ? `${shown} מתוך ${rows.length}` : rows.length;
    let none = box.querySelector(".filter-empty");
    if (!shown && rows.length) {
      if (!none) { none = document.createElement("p"); none.className = "empty filter-empty"; box.appendChild(none); }
      none.textContent = "אין מוצרים שמתאימים לסינון.";
    } else if (none) none.remove();
  }
  if (input) {
    input.addEventListener("input", filter);
    // "back" to this page may bring the typed words back
    window.addEventListener("pageshow", () => { if (input.value) filter(); });
  }
  drawChips();
  filter();

  if (!window.Stores.custom()) return;
  const show = () => document.documentElement.classList.remove("stores-custom");
  load(build).then((data) => {
    const cat = data.categories.findIndex((c) => c.href === box.dataset.href);
    const here = data.items.filter((it) => it.cat === cat);  // already cheapest first
    const items = here.filter((it) => !window.Avoid.hides(it.kind));
    box.innerHTML = window.Avoid.note(here.length - items.length) + (items.length ? `<ol class="products">${rowsHtml(items, data.stores)}</ol>`
      : `<p class="empty">${here.length ? "אין מוצרים אחרים בקטגוריה הזו." : "אין מוצרים בקטגוריה הזו."}</p>`);
    count.textContent = items.length;
    drawChips();
    filter();
    if (window.Basket) window.Basket.update();
  }).catch((e) => console.error(e)).finally(show);  // offline: the pre-built list is better than none
})();
