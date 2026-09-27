// Search over data/products.json in the browser (see static/render.js for the data layout).
(function () {
  const LIMIT = 300;
  const { esc, load, productHtml, norm } = window.Render;
  const build = document.currentScript.dataset.build;
  const out = document.getElementById("results");
  const q = (new URLSearchParams(location.search).get("q") || "").trim();
  const box = document.querySelector(".search input");
  box.value = q;
  if (!q) box.focus();


  function render(data) {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.innerHTML = '<p class="empty">הקלידו שם מוצר, למשל ״שעועית״.</p>';
      return;
    }
    const hits = [];
    let avoided = 0;  // processed kinds this phone hides (static/avoid.js)
    for (const it of data.items) {
      const text = window.Render.dryFix(norm(it.name + " " + it.maker + " " + it.tags), words);
      if (words.every((w) => text.includes(w))) {
        if (window.Avoid.hides(it.kind)) { avoided++; continue; }
        hits.push(it);
        if (hits.length > LIMIT) break;
      }
    }
    if (!hits.length) {
      out.innerHTML = `<p class="empty">לא נמצאו מוצרים עבור ״${esc(q)}״.</p>` + window.Avoid.note(avoided);
      return;
    }
    const truncated = hits.length > LIMIT;
    if (truncated) hits.length = LIMIT;
    // items are already in category order, then cheapest first
    let html = `<p class="sub">${hits.length} מוצרים עבור ״${esc(q)}״${truncated ? " (מוצגים הראשונים — כדאי לדייק)" : ""}</p>` + window.Avoid.note(avoided);
    let cat = -1, first = false, divided = false;
    for (const it of hits) {
      if (it.cat !== cat) {
        if (cat !== -1) html += "</ol>";
        cat = it.cat;
        const c = data.categories[cat];
        html += `<h2 class="group"><a href="${c.href}">${esc(c.leaf)}</a><small>${esc(c.top)}</small></h2><ol class="products">`;
        first = true; divided = false;
      }
      if (it.best.unit_price === null && !divided) {
        divided = true;
        if (!first) html += '<li class="divider">ללא מחיר לק״ג (גודל לא ידוע)</li>';
      }
      html += productHtml(it, data.stores, first);
      first = false;
    }
    out.innerHTML = html + "</ol>";
    if (window.Basket) window.Basket.update();
  }

  load(build).then(render)
    .catch(() => { out.innerHTML = '<p class="empty">לא ניתן לטעון את רשימת המוצרים.</p>'; });
})();
