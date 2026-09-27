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
      const ok = want.every((w) => hasStem(text, w)) && !hide.some((w) => hasStem(text, w));
      li.hidden = !ok;
      if (ok) shown++;
    }
    // the "no size" divider only when products are shown on both sides of it
    for (const d of box.querySelectorAll("li.divider")) {
      const i = rows.findIndex((li) => d.compareDocumentPosition(li) & Node.DOCUMENT_POSITION_FOLLOWING);
      const after = i < 0 ? [] : rows.slice(i), before = i < 0 ? rows : rows.slice(0, i);
      d.hidden = !(before.some((li) => !li.hidden) && after.some((li) => !li.hidden));
    }
    count.textContent = words.length ? `${shown} מתוך ${rows.length}` : rows.length;
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
    filter();
    if (window.Basket) window.Basket.update();
  }).catch((e) => console.error(e)).finally(show);  // offline: the pre-built list is better than none
})();
