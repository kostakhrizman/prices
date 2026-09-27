// The shopping list (notes.html; the header's "רשימת קניות"): the clean view of the one list (basket.js):
// lines of text with a tick box, like Google Keep. The cart (basket.html) is the same items with products and
// prices; nothing is moved between them (the user, 2026-10-01). A tick here is the cart's tick. "2 חלב" /
// "חלב x2" is the item's quantity, shown as ×2. Once the products are loaded (in the background), a line that
// matches nothing gets the cart's offers (compare.js splitOf / typoFix, no AI): "לפצל" for several items on one
// line, "האם התכוונת…?" for a typo; lines no store sells sit under "לא בסופר".
(function () {
  const L = window.Basket, out = document.getElementById("notes");
  const build = document.currentScript.dataset.build;
  let helpers = null;  // {splitOf, typoFix, topOf, sold, tops}: remembered ones at first, then from the products

  // Each line's department (and whether a store sells it, its split, its typo fix) is remembered per phone
  // (localStorage notesMeta {tops, lines: {text: {t, s, p, f}}}; the user, 2026-10-03: the list waited for the
  // ~6 MB of products every time before grouping). The list is drawn grouped at once from it, and checked
  // against the products when they've loaded. A line not seen before waits under "אחר" until then.
  const META_KEY = "notesMeta";
  let meta = null;
  try { meta = JSON.parse(localStorage.getItem(META_KEY)); } catch (e) { /* private mode */ }
  const metaOf = (text) => (meta && meta.lines && meta.lines[text.trim()]) || null;
  if (meta && Array.isArray(meta.tops) && meta.tops.length) helpers = {
    cached: true, tops: meta.tops,
    topOf: (t) => (metaOf(t) || {}).t || null,
    sold: (t) => { const m = metaOf(t); return !m || Boolean(m.s); },  // not known yet: a store line
    splitOf: (t) => (metaOf(t) || {}).p || null,
    typoFix: (t) => (metaOf(t) || {}).f || null,
  };
  // the products' answers, worked out once per text in a visit and kept for the next one
  const live = {};
  const memo = (field, fn) => (text) => {
    const k = text.trim(), m = live[k] || (live[k] = {});
    if (!(field in m)) m[field] = fn(text) || null;
    return m[field];
  };
  let saved = "";
  function remember() {
    if (!helpers || helpers.cached) return;
    const lines = {};
    for (const n of L.notes()) {
      const k = quantity(n.text).text.trim();
      if (live[k]) lines[k] = live[k];
    }
    const json = JSON.stringify({ tops: helpers.tops, lines });
    if (json === saved) return;
    saved = json;
    try { localStorage.setItem(META_KEY, json); } catch (e) { /* private mode, or full */ }
  }

  // A line that is just a group ("פירות", "ירקות"): tapping it opens the common ones to tick (the user's
  // idea), and they replace the line. Fixed lists (checking the stores live made the box lag), editable
  // in settings.
  // the lists: static/groups.js (defaults, editable in settings)
  const GROUPS_OF = (g) => window.Groups.get(g);
  const ALIAS = { "פרי": "פירות", "פירות": "פירות", "ירק": "ירקות", "ירקות": "ירקות", "פיצוחים": "פיצוחים", "פיצוח": "פיצוחים",
    "חטיפים": "חטיפים", "חטיף": "חטיפים" };
  // the department a group line sits under in "לפי מחלקות"
  const GROUP_TOP = { "פירות": "ירקות ופירות", "ירקות": "ירקות ופירות", "פיצוחים": "מזווה", "חטיפים": "חטיפים ומתוקים" };
  // "פירות", or for someone: "פירות לרון" (Ron, the baby); the items are added plainly, so the cart prices them
  const groupOf = (n) => {
    const m = quantity(n.text).text.trim().match(/^(\S+)(?:\s+ל\S+)?$/);
    return (m && ALIAS[m[1]]) || null;
  };
  // "לפי מחלקות" (default): lines under their department, in the walk through a store, like the cart
  // (the user: then "פירות" needn't be written); "לפי הוספה": as added. Per phone.
  const ORDER_KEY = "notesOrder";
  let order = "aisle";
  try { order = localStorage.getItem(ORDER_KEY) || "aisle"; } catch (e) { /* private mode */ }
  let openGroup = null;           // the line whose box is open
  const picked = new Set();       // ticked in that box
  function groupBox(n) {
    const g = groupOf(n);
    if (!g) return "";
    if (openGroup !== n.id) return "";  // closed: its button sits in the line itself (groupButton)
    const choices = GROUPS_OF(g);
    return `<div class="group-box">
        <div class="group-chips">${choices.map((x) => `<button type="button" data-pick="${esc(x)}" class="${picked.has(x) ? "on" : ""}">${esc(x)}</button>`).join("")}</div>
        <div class="group-actions"><button type="button" data-group-add="${n.id}" ${picked.size ? "" : "disabled"}>הוספה (${picked.size})</button>
          <button type="button" class="link" data-group-close>ביטול</button></div></div>`;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TICKED = /^\s*(\[[xX✓✔]\]|☑|✅|✓|✔)/;
  const BULLET = /^\s*(\[\s?\]|[-–—•*·●○◦▪☐□■]|\d+[.)](?=\s))\s*/;

  // pasted text: one line per item, bullets and tick boxes stripped, ticked lines skipped
  const lines = (text) => text.split(/\r?\n/).filter((l) => !TICKED.test(l)).map((l) => l.replace(BULLET, "").trim()).filter(Boolean);

  function quantity(line) {
    let m;
    if ((m = line.match(/^(\d+(?:\.\d+)?)\s*(?:x|×|יח['׳]?)?\s+(.+)$/))) return { text: m[2], qty: Number(m[1]) };
    if ((m = line.match(/^(.+?)\s*[x×]\s*(\d+(?:\.\d+)?)$/))) return { text: m[1], qty: Number(m[2]) };
    return { text: line, qty: 1 };
  }

  function offer(n) {
    if (n.done) return "";
    if (groupOf(n)) return groupBox(n);
    if (!helpers) return "";
    const { text } = quantity(n.text);
    const parts = helpers.splitOf(text);
    if (parts) return `<button type="button" class="link note-offer" data-split="${n.id}">לפצל ל־${parts.length}: ${esc(parts.join(" · "))}</button>`;
    const fix = helpers.typoFix(text);
    return fix ? `<button type="button" class="link note-offer" data-fix="${n.id}" data-text="${esc(fix)}">האם התכוונת ל"${esc(fix)}"?</button>` : "";
  }
  // "בחירת פירות ▾" on the same line as the word (the user), between it and ✕
  const groupButton = (n) => (!n.done && groupOf(n) && openGroup !== n.id
    ? `<button type="button" class="link note-group-btn" data-group="${n.id}">בחירת ${groupOf(n)} ▾</button>` : "");
  const qtyText = (q) => (Number.isInteger(q) ? String(q) : q.toFixed(1));
  const row = (n) => `<li class="note${n.done ? " done" : ""}" data-id="${n.id}">
      <input type="checkbox" class="note-tick" ${n.done ? "checked" : ""} aria-label="סימון">
      ${n.qty && n.qty !== 1 ? `<span class="note-qty">×${qtyText(n.qty)}</span>` : ""}
      <input type="text" class="note-text" value="${esc(n.text)}" enterkeyhint="next" aria-label="פריט">
      ${groupButton(n)}<button type="button" class="note-del" aria-label="מחיקה">✕</button>${offer(n)}</li>`;

  function draw() {
    const all = L.notes(), open = all.filter((n) => !n.done), ticked = all.filter((n) => n.done);
    // keep the cursor where it was: redrawing (a change from the other phone) mustn't interrupt typing
    const focus = document.activeElement, fid = focus && focus.closest && focus.closest("[data-id]"),
      isNew = focus && focus.id === "note-new", pos = focus && focus.selectionStart, typed = isNew ? focus.value : "";
    // the new-item box stays at the top; new lines join the bottom of the list (the user's layout)
    out.innerHTML = `<form id="note-add" class="note-add"><span class="note-plus">＋</span>
        <textarea id="note-new" rows="1" placeholder="פריט חדש" enterkeyhint="enter" aria-label="פריט חדש"></textarea></form>
      ${open.length > 1 ? `<div class="list-order" role="group" aria-label="סדר הרשימה">${[["aisle", "לפי מחלקות"], ["added", "לפי הוספה"]]
        .map(([k, label]) => `<button type="button" data-order="${k}" class="${order === k ? "on" : ""}">${label}</button>`).join("")}</div>` : ""}
      ${openHtml(open)}
      ${ticked.length ? `<details class="notes-ticked" ${ticked.length <= 5 ? "open" : ""}><summary>${ticked.length} מסומנים</summary>
        <ul class="notes">${ticked.map(row).join("")}</ul>
        <button type="button" class="link" data-clear>מחיקת המסומנים</button></details>` : ""}
      ${all.length ? "" : '<p class="empty">רשימה ריקה. כתבו פריט בכל שורה, או הדביקו רשימה.</p>'}`;
    const neu = out.querySelector("#note-new");
    neu.value = typed;
    if (isNew) { neu.focus(); neu.setSelectionRange(pos, pos); }
    // only a line's text field gets the focus back: on a phone a tapped button has it too, and a button
    // without a class made the selector invalid, so the redraw threw (and "הוספה" never removed "פירות")
    else if (fid && focus.classList && focus.classList.contains("note-text")) {
      const el = out.querySelector(`[data-id="${fid.dataset.id}"] .note-text`);
      if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    }
    remember();
  }

  // Lines no store sells ("לאסוף חבילה", "תרופות בבית מרקחת": things to do or buy elsewhere, the user) sit in
  // their own part at the bottom, "לא בסופר". A group line ("פירות") and a line that splits into products count
  // as store lines. Known once the products load.
  // a line with a typo fix on offer ("עדבניות") is a store line too (the user)
  const inStore = (n) => !helpers || Boolean(groupOf(n)) || helpers.sold(quantity(n.text).text)
    || Boolean(helpers.splitOf(quantity(n.text).text)) || Boolean(helpers.typoFix(quantity(n.text).text));
  function openHtml(all) {
    const open = all.filter(inStore), elsewhere = all.filter((n) => !inStore(n));
    if (helpers && !helpers.cached) L.setAway(elsewhere.map((n) => n.id));  // not in the cart, nor in its count
    const rest = elsewhere.length
      ? `<div class="notes-sep"><span>לא בסופר</span></div><ul class="notes">${elsewhere.map(row).join("")}</ul>` : "";
    return storeHtml(open) + rest;
  }
  function storeHtml(open) {
    if (order !== "aisle" || !helpers) return `<ul class="notes">${open.map(row).join("")}</ul>`;
    const OTHER = "אחר", groups = new Map();
    for (const n of open) {
      const top = groupOf(n) ? GROUP_TOP[groupOf(n)] : helpers.topOf(quantity(n.text).text) || OTHER;
      if (!groups.has(top)) groups.set(top, []);
      groups.get(top).push(row(n));
    }
    return [...helpers.tops, OTHER].filter((t) => groups.has(t))
      .map((t) => `<h2 class="section notes-dept">${esc(t)}</h2><ul class="notes">${groups.get(t).join("")}</ul>`).join("");
  }

  // No duplicates (the user): a line already on the list isn't added again, spelled differently or not
  // ("עגבניה" = "עגבניות", "קוטג'" = "קוטג": Render's words and singular stems); one already ticked comes back
  // unticked instead. A short note names what was skipped.
  const keyOf = (text) => L.keyOf(quantity(text).text);  // as the cart (basket.js keyOf)
  function addUnique(texts, exceptId) {
    const have = new Map(L.notes().filter((n) => n.id !== exceptId).map((n) => [keyOf(n.text), n]));
    const add = [], skipped = [];
    for (const t of texts) {
      const k = keyOf(t), old = have.get(k);
      if (old) {
        skipped.push(t);
        if (old.done) L.set(old.id, { done: false });
        continue;
      }
      have.set(k, { id: null, text: t });
      add.push(t);
    }
    if (add.length) L.addNotes(add);  // redraws, keeping the focus in the new line
    if (skipped.length) {
      out.querySelector(".note-dup")?.remove();
      out.insertAdjacentHTML("afterbegin", `<p class="note-moved note-dup">כבר ברשימה: ${esc(skipped.join(", "))}</p>`);
      setTimeout(() => out.querySelector(".note-dup")?.remove(), 4000);
    }
  }

  function addTyped() {
    const neu = out.querySelector("#note-new"), texts = lines(neu.value);
    neu.value = "";
    if (texts.length) addUnique(texts);
  }

  out.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.target.id === "note-new") { e.preventDefault(); addTyped(); }
    else if (e.target.classList.contains("note-text")) { e.preventDefault(); out.querySelector("#note-new").focus(); }
  });
  out.addEventListener("input", (e) => {  // a pasted list becomes one line per item at once
    if (e.target.id === "note-new" && /\n/.test(e.target.value)) addTyped();
  });
  out.addEventListener("change", (e) => {
    const li = e.target.closest("[data-id]");
    if (!li) return;
    if (e.target.classList.contains("note-tick")) {
      // a group word ("פירות") ticked is done with: it goes, its items stay (the user)
      const n = L.notes().find((x) => x.id === li.dataset.id);
      if (e.target.checked && n && groupOf(n)) { if (openGroup === n.id) openGroup = null; L.remove(n.id); }
      else L.set(li.dataset.id, { done: e.target.checked });
    }
    else if (e.target.classList.contains("note-text")) {
      const typed = e.target.value.trim();
      if (!typed) { L.remove(li.dataset.id); return; }
      const q = L.quantity(typed);  // "3 חלב" typed over a line: its quantity too
      L.set(li.dataset.id, q.qty !== 1 || q.text !== typed ? { text: q.text, qty: q.qty } : { text: typed });
    }
  });
  out.addEventListener("submit", (e) => { e.preventDefault(); addTyped(); });
  out.addEventListener("click", async (e) => {
    // tapping a group line ("פירות") opens its box, without the keyboard
    const text = e.target.closest(".note-text"), li = text && text.closest("[data-id]");
    const n = li && L.notes().find((x) => x.id === li.dataset.id);
    if (n && !n.done && groupOf(n) && openGroup !== n.id) { text.blur(); openGroup = n.id; picked.clear(); draw(); return; }
    const t = e.target.closest("button");
    if (!t) return;
    if (t.classList.contains("note-del")) L.remove(t.closest("[data-id]").dataset.id);
    else if (t.dataset.fix) L.set(t.dataset.fix, { text: t.dataset.text });
    else if (t.dataset.order) {
      order = t.dataset.order;
      try { localStorage.setItem(ORDER_KEY, order); } catch (err) { /* private mode */ }
      draw();
    }
    else if (t.dataset.group) { openGroup = t.dataset.group; picked.clear(); draw(); }
    else if (t.dataset.pick) { picked.has(t.dataset.pick) ? picked.delete(t.dataset.pick) : picked.add(t.dataset.pick); draw(); }
    else if ("groupClose" in t.dataset) { openGroup = null; draw(); }
    else if (t.dataset.groupAdd) {
      const chosen = [...picked];
      openGroup = null; picked.clear();
      L.remove(t.dataset.groupAdd);  // the group word first: it goes even if something after fails
      addUnique(chosen);
    }
    else if (t.dataset.split) {
      const n = L.notes().find((x) => x.id === t.dataset.split), parts = n && helpers.splitOf(quantity(n.text).text);
      if (!parts) return;
      L.remove(n.id);
      addUnique(parts);
    }
    else if ("clear" in t.dataset) L.setMany(L.notes().filter((n) => n.done).map((n) => [n.id, { deleted: true }]));
  });

  L.onChange(draw);
  draw();
  // the products, for the offers (cached by the service worker after the first time)
  let ready = Promise.resolve();
  if (window.Render && window.Compare) {
    ready = window.Render.load(build).then((d) => {
      const C = window.Compare(d);
      const topOf = (text) => { const m = C.generalMatch(text); return m && d.categories[m.cat] ? d.categories[m.cat].top : null; };
      helpers = { splitOf: memo("p", C.splitOf), typoFix: memo("f", C.typoFix), topOf: memo("t", topOf),
        sold: memo("s", (w) => Boolean(C.generalMatch(w))), tops: [...new Set(d.categories.map((c) => c.top))] };
      draw();
    }).catch(() => {});
  }
})();
