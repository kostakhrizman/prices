// Deciding unsure departments on the phone (review.html, from settings): data/unsure.json lists the products
// whose AI department is unsure; "נכון" keeps it, the menu picks another. Each decision goes to the private
// list repository as review/<product key>.json {category, at} (the list's GitHub key); the PC's receipt
// watcher saves it as a manual category and republishes (grocery/review.py). Decided products are hidden at
// once (localStorage "reviewDone") until the new site no longer lists them. Several at once (the user): tick
// them, or "בחירת כולם", then "✓ אישור הנבחרים": their current departments, in one file review/batch-<time>.json.
(function () {
  const L = window.Basket, out = document.getElementById("review");
  const build = document.currentScript.dataset.build;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DONE = "reviewDone", SHOW = 30;
  let data = null, top = "", done = {};
  const picked = new Set();  // ticked for approving together
  try { done = JSON.parse(localStorage.getItem(DONE)) || {}; } catch (e) { done = {}; }
  const saveDone = () => { try { localStorage.setItem(DONE, JSON.stringify(done)); } catch (e) { /* private mode */ } };

  if (!L.configured()) {
    out.innerHTML = '<p class="empty">כדי לשמור החלטות צריך קודם לחבר את הרשימה ל־GitHub: <a href="settings.html">הגדרות סנכרון</a>.</p>';
    return;
  }
  const { api, put } = window.ReceiptUpload, G = L.github;
  const topOf = (i) => data.cats[i].split(" > ")[0], leafOf = (i) => data.cats[i].split(" > ")[1];

  function options(current) {
    const groups = new Map();
    data.cats.forEach((p, i) => { const t = p.split(" > ")[0]; if (!groups.has(t)) groups.set(t, []); groups.get(t).push(i); });
    return '<option value="">שינוי מחלקה…</option>' + [...groups].map(([t, list]) => `<optgroup label="${esc(t)}">${
      list.map((i) => `<option value="${i}" ${i === current ? "disabled" : ""}>${esc(leafOf(i))}</option>`).join("")}</optgroup>`).join("");
  }

  function draw() {
    const left = data.items.filter(([key]) => !done[key]);
    const tops = [...new Set(left.map((x) => topOf(x[3])))];
    const shown = left.filter((x) => !top || topOf(x[3]) === top), page = shown.slice(0, SHOW);
    for (const k of [...picked]) if (!page.some(([key]) => key === k)) picked.delete(k);  // only what's on screen
    out.innerHTML = `<p class="sub">${left.length} מוצרים לבדיקה${Object.keys(done).length ? ` · ${Object.keys(done).length} החלטות נשלחו` : ""}</p>
      <div class="dept-chips">${[["", "הכול"], ...tops.map((t) => [t, t])].map(([t, label]) =>
        `<button type="button" data-top="${esc(t)}" class="${top === t ? "on" : ""}">${esc(label)}</button>`).join("")}</div>
      ${page.length ? `<div class="review-bulk">
        <button type="button" class="link" data-all>${picked.size === page.length ? "ניקוי הבחירה" : `בחירת כולם (${page.length})`}</button>
        <button type="button" class="review-ok" data-approve ${picked.size ? "" : "disabled"}>✓ אישור הנבחרים (${picked.size})</button></div>` : ""}
      <ul class="review-list">${page.map(([key, name, maker, cat, hint]) => `<li class="review-item${picked.has(key) ? " picked" : ""}" data-key="${esc(key)}">
        <label class="review-name"><input type="checkbox" class="review-tick" ${picked.has(key) ? "checked" : ""} aria-label="בחירה">
          <span>${esc(name)}</span> ${window.Photo ? window.Photo.button(key, name, esc, false) : ""}</label>
        ${maker ? `<div class="sub">${esc(maker)}</div>` : ""}
        <div class="review-cat">עכשיו: <b>${esc(topOf(cat))} › ${esc(leafOf(cat))}</b></div>
        ${hint !== undefined ? `<div class="review-hint">מוצרים דומים נמצאים ב: <b>${esc(topOf(hint))} › ${esc(leafOf(hint))}</b>
          <button type="button" class="review-ok" data-ok="${hint}">להעביר לשם</button></div>` : ""}
        <div class="review-actions"><button type="button" class="review-ok" data-ok="${cat}">✓ נכון</button>
          <select class="review-pick" aria-label="מחלקה אחרת">${options(cat)}</select></div></li>`).join("")}</ul>
      ${shown.length > SHOW ? `<p class="sub">מוצגים ${SHOW} ראשונים; אחרי ההחלטות יופיעו הבאים.</p>` : ""}
      ${left.length ? "" : '<p class="empty">אין מוצרים לא בטוחים. 🎉</p>'}`;
  }

  async function decide(li, index) {
    const key = li.dataset.key;
    li.classList.add("saving");
    try {
      // a file per product; ":" (a chain's own code) isn't allowed in a Windows file name, so "_", and the key inside
      const path = `review/${key.replace(/:/g, "_")}.json`, now = new Date().toISOString();
      const old = await api(path);
      await put(path, G.encode(JSON.stringify({ key, category: data.cats[index], at: now })), "Department decision", old && old.sha);
      done[key] = data.cats[index];
      saveDone();
      draw();
    } catch (e) {
      li.classList.remove("saving");
      alert("השמירה נכשלה: " + e.message);
    }
  }

  // the ticked products, each in its current department, in one file (one upload, one commit)
  async function approvePicked(button) {
    const now = new Date().toISOString();
    const decisions = data.items.filter(([key]) => picked.has(key)).map(([key, , , cat]) => ({ key, category: data.cats[cat], at: now }));
    if (!decisions.length) return;
    button.disabled = true;
    button.textContent = "שומר…";
    try {
      const path = `review/batch-${Date.now().toString(36)}.json`;
      await put(path, G.encode(JSON.stringify({ decisions })), `Department decisions: ${decisions.length} approved`);
      for (const d of decisions) done[d.key] = d.category;
      picked.clear();
      saveDone();
      draw();
    } catch (e) {
      alert("השמירה נכשלה: " + e.message);
      draw();
    }
  }

  out.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if ("all" in b.dataset) {
      const page = [...out.querySelectorAll(".review-item")].map((li) => li.dataset.key);
      if (picked.size === page.length) picked.clear(); else page.forEach((k) => picked.add(k));
      draw();
    }
    else if ("approve" in b.dataset) approvePicked(b);
    else if (b.dataset.top !== undefined) { top = b.dataset.top; picked.clear(); draw(); }
    else if (b.dataset.ok) decide(b.closest("[data-key]"), Number(b.dataset.ok));
  });
  out.addEventListener("change", (e) => {
    if (e.target.classList.contains("review-tick")) {
      const key = e.target.closest("[data-key]").dataset.key;
      if (e.target.checked) picked.add(key); else picked.delete(key);
      draw();
      return;
    }
    if (e.target.classList.contains("review-pick") && e.target.value) decide(e.target.closest("[data-key]"), Number(e.target.value));
  });

  fetch(`data/unsure.json?v=${build}`).then((r) => r.json()).then((d) => {
    data = d;
    // forget decisions the site already reflects (the product left the list)
    const listed = new Set(d.items.map((x) => x[0]));
    for (const k of Object.keys(done)) if (!listed.has(k)) delete done[k];
    saveDone();
    draw();
  }).catch(() => { out.innerHTML = '<p class="empty">לא ניתן לטעון את הרשימה.</p>'; });
})();
