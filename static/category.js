// A category page: the name filter, and a redraw for phones that picked other stores.
// - Filter (#cat-filter): every typed word must be in the product's name or maker, singular = plural
//   (Render.hasStem); a word starting with "-" hides products that have it ("-לייט"). It hides rows
//   in place, so it works on the pre-built list and on the redrawn one alike.
// - The page is pre-built for the default stores (publish.py). When this phone picked other stores
//   (static/stores.js), its products are redrawn from data/products.json for those stores.
(function () {
  const { load, rowsHtml, norm, hasStem } = window.Render;
  const build = document.currentScript.dataset.build;
  const box = document.getElementById("cat-list");
  const count = document.getElementById("cat-count");
  const input = document.getElementById("cat-filter");
  // "סינון" (the user, 2026-10-07): a check list of what the subcategory's products are (grocery/facets.py); a
  // product stays when its NAME has every word of one of the ticked choices ("תות שדה" needs both words)
  const facetBtn = document.getElementById("facet-btn"), facetList = document.getElementById("facet-list");
  const facetBoxes = facetList ? [...facetList.querySelectorAll("#facet-kinds input[type=checkbox]")] : [];
  // and by shop (the user, 2026-10-07): the shops this phone has on (settings), by their short names (Osher Ad's
  // branches are one); a product stays when a ticked shop sells it. A row's shops: its own st-<n> and its ".other"s
  const S = window.Stores, storesOn = S.choice();
  const shopNames = [...new Set(S.list.filter((st) => storesOn[st.key]).map((st) => st.short))];
  const shopsEl = document.getElementById("facet-stores");
  let shopBoxes = [];
  if (shopsEl && shopNames.length > 1) {
    shopsEl.hidden = false;
    shopsEl.querySelector(".facet-items").innerHTML = shopNames.map((n) =>
      `<label class="facet"><input type="checkbox" value="${n.replace(/"/g, "&quot;")}"> <span>${n.replace(/</g, "&lt;")}</span> <small></small></label>`).join("");
    shopBoxes = [...shopsEl.querySelectorAll("input")];
  }
  const shopsOf = (li) => {
    const idx = [li, ...li.querySelectorAll(".stores .other")].map((el) => (/(?:^|\s)st-(\d+)/.exec(el.className) || [])[1]).filter((x) => x !== undefined);
    return new Set(idx.map((i) => (S.list[Number(i)] || {}).short));
  };
  // a choice may have forms apart by "|" ("גרון|גרונות", grocery/facets.py FIXED): any of them, each with all its words
  const facetWords = new Map(facetBoxes.map((b) => [b, b.value.split("|").map((alt) => norm(alt).split(/\s+/).filter(Boolean))]));
  const nameOf = (li) => { const n = li.querySelector(".name"); return norm((n ? n.textContent : "") + " " + (li.dataset.tags || "")); };
  const inFacet = (name, b) => facetWords.get(b).some((ws) => { const t = window.Render.dryFix(name, ws); return ws.every((w) => hasStem(t, w)); });
  // how many products each choice has here (this phone's stores); a choice with none is hidden
  function countFacets() {
    if (!facetBoxes.length) return;
    const names = [...box.querySelectorAll("li.product")].map(nameOf);
    let any = false;
    for (const b of facetBoxes) {
      const n = names.filter((x) => inFacet(x, b)).length;
      b.closest("label").hidden = !n;
      b.closest("label").querySelector("small").textContent = n;
      if (!n) b.checked = false;
      any = any || n > 0;
    }
    const rowShops = [...box.querySelectorAll("li.product")].map(shopsOf);
    for (const b of shopBoxes) b.closest("label").querySelector("small").textContent = rowShops.filter((s) => s.has(b.value)).length;
    document.getElementById("facet-kinds").hidden = !any;
    facetBtn.hidden = !any && !shopBoxes.length;
  }

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

  // ticks in the same group (colour / dryness on the wine page) are alternatives, groups must all fit; without groups
  // (the other pages) all ticks are alternatives
  const groupOf = (b) => b.closest("label").dataset.group || "";
  function groupsOk(li) {
    const ticked = facetBoxes.filter((b) => b.checked);
    if (!ticked.length) return true;
    const name = nameOf(li), by = new Map();
    for (const b of ticked) by.set(groupOf(b), [...(by.get(groupOf(b)) || []), b]);
    return [...by.values()].every((bs) => bs.some((b) => inFacet(name, b)));
  }
  function filter() {
    const rows = [...box.querySelectorAll("li.product")];
    const words = input ? norm(input.value).split(/\s+/).filter((w) => w && w !== "-") : [];
    const want = words.filter((w) => !w.startsWith("-")), hide = words.filter((w) => w.startsWith("-")).map((w) => w.slice(1));
    const ticked = facetBoxes.filter((b) => b.checked);
    const shops = shopBoxes.filter((b) => b.checked).map((b) => b.value);
    if (facetBtn) {
      const n = document.getElementById("facet-n");
      n.hidden = !(ticked.length + shops.length);
      n.textContent = ticked.length + shops.length;
      facetBtn.classList.toggle("on", ticked.length + shops.length > 0);
    }
    let shown = 0;
    for (const li of rows) {
      const name = li.querySelector(".name"), maker = li.querySelector(".meta span");
      const text = norm((name ? name.textContent : "") + " " + (maker ? maker.textContent : "") + " " + (li.dataset.tags || ""));
      const ok = want.every((w) => hasStem(window.Render.dryFix(text, want), w)) && !hide.some((w) => hasStem(text, w))
        && groupsOk(li)
        && (!shops.length || shops.some((n) => shopsOf(li).has(n)));
      li.hidden = !ok;
      if (ok) shown++;
    }
    // the "no size" divider only when products are shown on both sides of it
    for (const d of box.querySelectorAll("li.divider")) {
      const i = rows.findIndex((li) => d.compareDocumentPosition(li) & Node.DOCUMENT_POSITION_FOLLOWING);
      const after = i < 0 ? [] : rows.slice(i), before = i < 0 ? rows : rows.slice(0, i);
      d.hidden = !(before.some((li) => !li.hidden) && after.some((li) => !li.hidden));
    }
    count.textContent = words.length || ticked.length || shops.length ? `${shown} מתוך ${rows.length}` : rows.length;
    let none = box.querySelector(".filter-empty");
    if (!shown && rows.length) {
      if (!none) { none = document.createElement("p"); none.className = "empty filter-empty"; box.appendChild(none); }
      none.textContent = "אין מוצרים שמתאימים לסינון.";
    } else if (none) none.remove();
  }
  if (facetBtn) {
    const open = (yes) => { facetList.hidden = !yes; facetBtn.setAttribute("aria-expanded", yes ? "true" : "false"); };
    facetBtn.addEventListener("click", () => open(facetList.hidden));
    facetList.addEventListener("change", filter);
    document.getElementById("facet-clear").addEventListener("click", () => { for (const b of [...facetBoxes, ...shopBoxes]) b.checked = false; filter(); });
    document.getElementById("facet-done").addEventListener("click", () => open(false));
    countFacets();
    window.addEventListener("pageshow", () => { if (facetBoxes.some((b) => b.checked)) filter(); });
  }
  if (input) {
    input.addEventListener("input", filter);
    // "back" to this page may bring the typed words back
    window.addEventListener("pageshow", () => { if (input.value) filter(); });
    if (input.value) filter();
  }

  if (!window.Stores.custom()) return;
  const show = () => document.documentElement.classList.remove("stores-custom");
  load(build).then((data) => {
    const cat = data.categories.findIndex((c) => c.href === box.dataset.href);
    const here = data.items.filter((it) => it.cat === cat);  // already cheapest first
    const items = here.filter((it) => !window.Avoid.hides(it.kind));
    box.innerHTML = window.Avoid.note(here.length - items.length) + (items.length ? `<ol class="products">${rowsHtml(items, data.stores)}</ol>`
      : `<p class="empty">${here.length ? "אין מוצרים אחרים בקטגוריה הזו." : "אין מוצרים בקטגוריה הזו."}</p>`);
    count.textContent = items.length;
    countFacets();
    filter();
    if (window.Basket) window.Basket.update();
  }).catch((e) => console.error(e)).finally(show);  // offline: the pre-built list is better than none
})();
