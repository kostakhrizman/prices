// The department chooser (the user, 2026-10-07), one for every place a product's department is changed (the ⓘ sheet,
// review.html): a sheet with a search box, the departments first, and a department's subcategories after a tap on it
// (← back to the departments). Typing searches every subcategory, shown as "department › subcategory".
// CatPick.open(paths, current) -> a promise of the chosen "top > leaf" path, or null when closed.
(function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => (window.Render ? window.Render.norm(s) : String(s).toLowerCase().replace(/['"`׳״]/g, ""));
  let box = null;

  function open(paths, current) {
    return new Promise((resolve) => {
      const cats = paths.map((p) => { const [top, leaf] = p.split(" > "); return { path: p, top, leaf }; });
      const tops = [...new Set(cats.map((c) => c.top))];
      const now = cats.find((c) => c.path === current);
      let top = null, query = "";
      if (!box) {
        box = document.createElement("div");
        box.className = "catpick-box";
        document.body.appendChild(box);
      }
      const done = (path) => { box.hidden = true; box.onclick = null; box.oninput = null; resolve(path); };
      const leafRow = (c, withTop) => `<button type="button" class="catpick-row${c.path === current ? " now" : ""}" data-path="${esc(c.path)}"${
        c.path === current ? " disabled" : ""}>${withTop ? `<small>${esc(c.top)} ›</small> ` : ""}${esc(c.leaf)}${c.path === current ? " <small>(עכשיו)</small>" : ""}</button>`;
      function listHtml() {
        const words = norm(query).split(/\s+/).filter(Boolean);
        if (words.length) {
          const hits = cats.filter((c) => words.every((w) => norm(c.top + " " + c.leaf).includes(w)));
          return hits.length ? hits.map((c) => leafRow(c, true)).join("") : '<p class="sub">אין מחלקה כזאת.</p>';
        }
        if (top) return `<button type="button" class="catpick-back" data-back>→ ${esc(top)}</button>` + cats.filter((c) => c.top === top).map((c) => leafRow(c, false)).join("");
        return tops.map((t) => `<button type="button" class="catpick-row catpick-top${now && now.top === t ? " now" : ""}" data-top="${esc(t)}">${esc(t)}<span>‹</span></button>`).join("");
      }
      box.innerHTML = `<div class="catpick-card" role="dialog" aria-label="בחירת מחלקה">
        <div class="catpick-head"><b>בחירת מחלקה</b><button type="button" class="photo-close" data-close aria-label="סגירה">✕</button></div>
        ${now ? `<div class="sub">עכשיו: ${esc(now.top)} › ${esc(now.leaf)}</div>` : ""}
        <input type="search" class="catpick-search" placeholder="חיפוש מחלקה" autocomplete="off" enterkeyhint="search" aria-label="חיפוש מחלקה">
        <div class="catpick-list">${listHtml()}</div></div>`;
      const list = box.querySelector(".catpick-list");
      box.oninput = (e) => { if (e.target.classList.contains("catpick-search")) { query = e.target.value; list.innerHTML = listHtml(); } };
      box.onclick = (e) => {
        if (e.target === box || e.target.closest("[data-close]")) return done(null);
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.path) done(b.dataset.path);
        else if (b.dataset.top) { top = b.dataset.top; list.innerHTML = listHtml(); list.scrollTop = 0; }
        else if ("back" in b.dataset) { top = null; list.innerHTML = listHtml(); }
      };
      box.hidden = false;
    });
  }
  window.CatPick = { open };
})();
