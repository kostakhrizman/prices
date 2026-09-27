// The shopping list page (shared list: static/basket.js). Sections: add a general item; general
// items waiting for a product ("בחירת מוצר" shows matches from all stores, cheapest first);
// chosen products with deal-aware prices at their cheapest store, cheaper swaps and a compare of
// everything chosen between stores; ticked-off items. Open items are grouped by department (the
// category tree's order) or listed as added, per phone. Data layout and shared rules: render.js.
(function () {
  const { esc, money, load, lineCost, norm } = window.Render;
  const L = window.Basket;
  const build = document.currentScript.dataset.build;
  const out = document.getElementById("basket");
  const PICK_LIMIT = 40;
  let data, byCat, showCompare = false, picking = null;
  // "aisle": grouped by department, in the walk through a store; "added": general items, then products
  const ORDER_KEY = "listOrder";
  let order = "aisle";
  try { order = localStorage.getItem(ORDER_KEY) || "aisle"; } catch (e) { /* private mode */ }
  // text shared from a notes app (manifest share_target) or pasted; shown for confirmation first
  const shared = new URLSearchParams(location.search).get("text");
  let importText = shared || null;
  if (shared) history.replaceState(null, "", location.pathname);  // a reload won't import again


  // pricing and comparison helpers (static/compare.js), set once the products are loaded
  let unitOf, bestSwap, costAt, hasWord, generalMatch, generalAt, cardDiscount, compareHtml, planHtml, typoFix, splitOf, isMultipack;

  // One general item per line of a note. Bullets and checkboxes are dropped, ticked lines are
  // skipped, "2 חלב" / "חלב x2" set the quantity, and lines already on the list are skipped.
  const TICKED = /^\s*(\[[xX✓✔]\]|☑|✅|✓|✔)/;
  const BULLET = /^\s*(\[\s?\]|[-–—•*·●○◦▪☐□■]|\d+[.)](?=\s))\s*/;
  function parseNote(text) {
    const have = new Set(L.items().filter((x) => !x.done && !x.product).map((x) => norm(x.text)));
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
      if (TICKED.test(raw)) continue;
      let line = raw.replace(BULLET, "").trim(), qty = 1, m;
      if (!line) continue;
      if ((m = line.match(/^(\d+(?:\.\d+)?)\s*(?:x|×|יח['׳]?)?\s+(.+)$/))) { qty = Number(m[1]); line = m[2]; }
      else if ((m = line.match(/^(.+?)\s*[x×]\s*(\d+(?:\.\d+)?)$/))) { line = m[1]; qty = Number(m[2]); }
      const key = norm(line);
      if (have.has(key)) continue;
      have.add(key);
      out.push({ text: line, qty });
    }
    return out;
  }

  function importHtml() {
    if (importText === null) return `<div class="list-links">
      <button type="button" class="link" data-import-open>הדבקת רשימה מהפתקים</button></div>`;
    const preview = parseNote(importText);
    return `<div class="import">
      <textarea id="import-text" rows="6" placeholder="הדביקו כאן רשימה, פריט בכל שורה">${esc(importText)}</textarea>
      <div class="actions">
        <button type="button" data-import-add ${preview.length ? "" : "disabled"}>הוספת ${preview.length} פריטים</button>
        <button type="button" class="link" data-import-cancel>ביטול</button>
      </div></div>`;
  }

  // An item's first line, from the right (the user's choice): a small quantity stepper, the name (cut to
  // one line; a tap shows it whole), `after` (ⓘ), `extra` (a general item's "בחירת מוצר") and ✕.
  const headHtml = (entry, name, weighted, extra = "", after = "") => `<div class="name item-head">
      <span class="stepper"><button type="button" data-qty="${entry.id}" data-step="1" aria-label="עוד אחד">＋</button>
      <span>${entry.qty}${weighted ? " ק״ג" : ""}</span>
      <button type="button" data-qty="${entry.id}" data-step="-1" aria-label="אחד פחות">−</button></span>
      <span class="item-name">${name}</span>${after}
      ${extra}<button type="button" class="remove" data-remove="${entry.id}" aria-label="הסרה" title="הסרה">✕</button></div>`;
  // ticked = already in the shopping cart (the user): the row stays where it is, struck through, and still
  // counts in the total and the compare; "ניקוי המסומנים" at the bottom removes them after shopping
  const doneToggle = (entry) =>
    `<button type="button" class="done-toggle" data-done="${entry.id}" aria-label="${entry.done ? "ביטול הסימון" : "סימון שכבר בעגלה"}">${entry.done ? "✓" : ""}</button>`;
  const doneClass = (e) => (e.done ? " done" : "");
  // a product of a processed kind this phone hides elsewhere (static/avoid.js): it stays on the list, tagged
  const procTag = (it) => (window.Avoid.hides(it.kind) ? '<span class="proc-tag">מעובד</span> ' : "");

  // The product picker for a general item: a search box (starting with the item's own text) and the
  // matching products from all stores, grouped by subcategory, cheapest first. For the item's own text
  // the subcategory the automatic match chose comes first (fresh cucumbers before pickles).
  const pickQuery = new Map();  // entry id -> what's typed in its picker's search box

  function pickResultsHtml(entry, query) {
    const words = norm(query).split(/\s+/).filter(Boolean);
    let hits = words.length ? data.items.filter((it) => !window.Avoid.hides(it.kind) && (() => { const t = window.Render.dryFix(norm(it.name + " " + it.maker + " " + it.tags), words); return words.every((w) => hasWord(t, w)); })()) : [];
    if (!hits.length) return `<p class="sub">${words.length ? "לא נמצאו מוצרים. אפשר לנסות מילה אחרת, או להשאיר כפריט כללי." : "הקלידו שם מוצר."}</p>`;
    const m = norm(query) === norm(entry.text) ? generalMatch(entry.text) : null;
    if (m) hits = hits.filter((it) => it.cat === m.cat).concat(hits.filter((it) => it.cat !== m.cat));
    // a kind ticked for multipacks (snacks by default): the multipacks (מארז) first (the user, 2026-10-04)
    if (m && m.packsFirst) hits = hits.filter(isMultipack).concat(hits.filter((it) => !isMultipack(it)));
    let html = "", cat = -1;
    for (const it of hits.slice(0, PICK_LIMIT)) {
      if (it.cat !== cat) { cat = it.cat; html += `<div class="pick-cat">${esc(data.categories[cat].leaf)}</div>`; }
      const o = it.best;
      const price = o.unit_price !== null ? `${money(o.unit_price)} ${o.unit_label}` : money(o.price);
      html += `<div class="pick-row st-${o.store}"><div class="pick-info"><div>${esc(it.name)}</div>
        <div class="meta">${data.stores.filter((st) => st.on).length > 1 ? window.Render.storeTag(data.stores, o) : ""}
        <span>${esc(o.size || "")}</span>${o.deal ? `<span class="badge">${esc(o.deal)}</span>` : ""}</div></div>
        ${window.Photo.button(it.key, it.name, esc, it.food)}
        <div class="pick-price">${price}</div>
        <button type="button" data-pick="${entry.id}" data-key="${esc(it.key)}">בחירה</button></div>`;
    }
    if (hits.length > PICK_LIMIT) html += `<p class="sub">מוצגים ${PICK_LIMIT} מתוך ${hits.length}. אפשר לדייק בחיפוש.</p>`;
    return html;
  }

  function pickerHtml(entry) {
    const query = pickQuery.has(entry.id) ? pickQuery.get(entry.id) : entry.text;
    return `<div class="picker">
      <input type="search" class="pick-search" data-pick-search="${entry.id}" value="${esc(query)}"
        placeholder="חיפוש מוצר" enterkeyhint="search" autocomplete="off">
      <div class="pick-results">${pickResultsHtml(entry, query)}</div></div>`;
  }

  function syncStatusHtml() {
    const s = L.status();
    const text = { synced: "מסונכרן", saving: "שומר…", offline: "אין חיבור — יסונכרן בהמשך",
                   error: "הסנכרון נכשל", unconfigured: "הרשימה נשמרת רק בטלפון הזה" }[s] || "";
    const link = s === "unconfigured" || s === "error" ? ' · <a href="settings.html">הגדרות סנכרון</a>' : "";
    return `<p class="sync-status">${text}${link}</p>`;
  }

  // Redraws happen on every sync status change too, so keep what's being typed in the add box.
  function render() {
    if (!data) return;
    if (L.mergeDuplicates()) return;  // duplicates from before (or both phones at once): merged, then drawn again
    const input = out.querySelector("#add-item input");
    const typed = input ? input.value : "", focused = input && document.activeElement === input;
    const active = document.activeElement;
    const pickId = active && active.dataset ? active.dataset.pickSearch : null;
    draw();
    if (pickId) {
      const again = out.querySelector(`[data-pick-search="${pickId}"]`);
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    }
    const again = out.querySelector("#add-item input");
    if (again) { again.value = typed; if (focused) again.focus(); }
  }

  // "לא בסופר" (the user): a line no store sells (an errand, another shop) is in the list only, not the cart; as
  // notes.js inStore: a product chosen, or a match, or a line that splits into products, or a typo with a fix
  const inStore = (e) => Boolean(e.product || generalMatch(e.text) || splitOf(e.text) || typoFix(e.text));

  function draw() {
    const all = L.items(), entries = all.filter(inStore);
    L.setAway(all.filter((e) => !inStore(e)).map((e) => e.id));  // the cart's count leaves them out too
    const general = entries.filter((e) => !e.product);
    const chosen = entries.filter((e) => e.product);
    const done = entries.filter((e) => e.done);
    const multi = data.stores.filter((st) => st.on).length > 1;
    const inList = new Set(entries.map((e) => e.product));

    let html = syncStatusHtml() + `<form class="add-item" id="add-item">
      <input name="text" placeholder="הוספת פריט, למשל שמפו" enterkeyhint="done" autocomplete="off">
      <button type="submit">הוספה</button></form>` + importHtml();

    if (!entries.length) {
      out.innerHTML = html + '<p class="empty">הרשימה ריקה. הוסיפו פריט כללי כאן, או מוצר עם הכפתור ＋ ליד כל מוצר.</p>';
      return;
    }

    html += `<div class="list-order" role="group" aria-label="סדר הרשימה">${[["aisle", "לפי מחלקות"], ["added", "לפי הוספה"]]
      .map(([k, label]) => `<button type="button" data-order="${k}" class="${order === k ? "on" : ""}">${label}</button>`).join("")}</div>`;

    // each open item's row, with its subcategory (for the departments order); totals add up as they're drawn
    const lines = [], generals = [], byStore = {}, generalRows = [], chosenRows = [];
    let total = 0;
    for (const e of general) {
      let row = "";
      const m = generalMatch(e.text);
      generals.push({ e, m });
      let hint = '<div class="meta"><span class="warn">לא נמצאו מוצרים תואמים</span></div>';
      if (!m) {
        const parts = splitOf(e.text), fix = !parts && typoFix(e.text);
        const offer = parts ? `<button type="button" class="link" data-split="${e.id}">לפצל ל־${parts.length} פריטים: ${esc(parts.join(" · "))}</button>`
          : fix ? `<button type="button" class="link" data-fix="${e.id}" data-text="${esc(fix)}">האם התכוונת ל"${esc(fix)}"?</button>` : "";
        if (offer) hint = `<div class="meta"><span class="warn">לא נמצאו מוצרים תואמים</span> ${offer}</div>`;
      }
      if (m) {
        const cells = data.stores.map((_, s) => generalAt(m, e.qty, s)).map((c, s) => c && { ...c, s }).filter(Boolean);
        if (cells.length) {
          const low = cells.reduce((a, b) => (b.cost < a.cost ? b : a));
          total += low.cost;
          byStore[low.s] = (byStore[low.s] || 0) + low.cost;
          const o = low.pick.offers[low.s];
          // per-piece things: the price for the usual count ("₪2.00 ל־72 יח׳"), since the pack may be bigger
          const unit = m.pieces ? `${money(low.cost / e.qty)} ל־${m.pieces} יח׳`
            : o.unit_price !== null ? `${money(o.unit_price)} ${o.unit_label}` : money(o.price);
          const tillNote = low.till && low.till > low.cost * 1.3 ? ` · מארז ${money(low.till)} בקופה` : "";
          // the department it was matched in, so a wrong one ("סלמון" in canned fish) is easy to see
          const dept = data.categories[m.cat] ? `<span class="auto-dept">${esc(data.categories[m.cat].leaf)}</span>` : "";
          hint = `<div class="auto st-${low.s}">${procTag(low.pick)}הזול: ${esc(low.pick.name)} · ${unit}${tillNote}${multi ? ` · <span class="store-tag">${esc(data.stores[low.s].short)}</span>` : ""}${dept}</div>`;
        }
      }
      row += `<li class="product general${doneClass(e)}"><div class="info">${headHtml(e, esc(e.text), false,
          `<button type="button" class="link" data-picker="${e.id}">${picking === e.id ? "סגירה" : "בחירת מוצר"}</button>`)}
        ${hint}
        ${picking === e.id ? pickerHtml(e) : ""}</div>${doneToggle(e)}</li>`;
      generalRows.push({ html: row, cat: m ? m.cat : null });
    }

    for (const e of chosen) {
      let row = "";
      const it = data.byKey.get(e.product);
      if (!it) {
        row += `<li class="product item${doneClass(e)}"><div class="info">${headHtml(e, esc(e.text || "מוצר"), false)}
          <div class="meta"><span class="warn">לא נמצא במחירון היום</span></div></div>${doneToggle(e)}</li>`;
        chosenRows.push({ html: row, cat: null });
        continue;
      }
      lines.push({ it, qty: e.qty });
      const o = it.best;
      const { cost, short } = lineCost(o, e.qty);
      total += cost;
      byStore[o.store] = (byStore[o.store] || 0) + cost;
      const swap = e.done ? null : bestSwap(it, inList);  // already in the cart: no swap
      const unitText = o.unit_price !== null ? `${money(o.unit_price)} ${o.unit_label}` : "";
      const where = multi ? window.Render.storeTag(data.stores, o) : "";
      const orig = e.text && e.text !== it.name ? ` <span class="orig">(${esc(e.text)})</span>` : "";
      row += `<li class="product item st-${o.store}${doneClass(e)}">
        <div class="info">
          ${headHtml(e, `${esc(it.name)}${orig}`, o.weighted, "", window.Photo.button(it.key, it.name, esc, it.food))}
          <div class="meta">${procTag(it)}${where}<span>${esc(o.size || "")}</span><span>${unitText}</span><b class="line-cost">${money(cost)}</b></div>
          ${o.deal ? `<div class="deal"><span class="badge">${esc(o.deal)}</span> ${esc(o.deal_conditions)}</div>` : ""}
          ${short ? `<div class="hint">הוסיפו עוד ${short} למבצע</div>` : ""}
          ${swap ? `<div class="swap">
            <div>זול ב־${swap.percent}% ${esc(swap.label)}: <b>${esc(swap.it.name)}</b></div>
            <div>${money(swap.unit)} ${esc(swap.label)} · ${swap.it.best.weighted ? "במשקל" : `${esc(swap.it.best.size || "")} ב־${money(swap.it.best.price)}`}${multi ? ` ב${esc(data.stores[swap.it.best.store].short)}` : ""}${swap.it.best.deal ? ` (${esc(swap.it.best.deal)})` : ""}</div>
            <button type="button" data-swap="${e.id}" data-to="${esc(swap.it.key)}">החלפה</button>
            <button type="button" class="link" data-block="${esc(it.key)}" data-other="${esc(swap.it.key)}">לא מתאים</button>
          </div>` : ""}
        </div>
        ${doneToggle(e)}
      </li>`;
      chosenRows.push({ html: row, cat: it.cat });
    }

    html += branchSwitch() + planHtml(lines, generals);  // where to shop: one store, or a split between two

    if (order === "aisle") {
      // one heading per department, in the category tree's order (roughly the walk through a store)
      const OTHER = "אחר", groups = new Map();
      for (const r of generalRows.concat(chosenRows)) {
        const top = r.cat !== null && data.categories[r.cat] ? data.categories[r.cat].top : OTHER;
        if (!groups.has(top)) groups.set(top, []);
        groups.get(top).push(r.html);
      }
      for (const top of [...new Set(data.categories.map((c) => c.top)), OTHER]) {
        if (groups.has(top)) html += `<h2 class="section">${esc(top)}</h2><ol class="products basket">${groups.get(top).join("")}</ol>`;
      }
    } else {
      if (generalRows.length) html += `<h2 class="section">פריטים כלליים</h2><ol class="products">${generalRows.map((r) => r.html).join("")}</ol>`;
      if (chosenRows.length) html += `<h2 class="section">מוצרים</h2><ol class="products basket">${chosenRows.map((r) => r.html).join("")}</ol>`;
    }

    if (general.length || chosen.length) {
      const discount = Object.entries(byStore).reduce((sum, [st, amount]) => sum + cardDiscount(Number(st), amount), 0);
      html += `<div class="total"><span>סה״כ משוער${multi ? ", כל מוצר בחנות הזולה לו" : ""}</span><b>${money(total - discount)}</b></div>`;
      if (discount > 0.005) html += `<p class="sub">כולל הנחת כרטיס: −${money(discount)}</p>`;
      if (generals.some((g) => g.m)) html += '<p class="sub">פריטים כלליים לפי המוצר הזול ביותר שנמצא; אפשר לבחור מוצר מדויק.</p>';
      if (multi && (lines.length || generals.length)) {
        html += `<button type="button" class="compare-btn" data-compare>${showCompare ? "הסתרת ההשוואה" : "השוואה בין החנויות"}</button>`;
        if (showCompare) html += compareHtml(lines, generals);
      }
    }

    if (done.length) {
      html += `<p class="sub done-count">${done.length === 1 ? "פריט אחד כבר בעגלה" : `${done.length} פריטים כבר בעגלה`} ·
        <button type="button" class="link" data-clear-done>ניקוי המסומנים</button></p>`;
    }

    html += `<div class="actions">
      <button type="button" data-share>שיתוף הרשימה</button>
      <a class="link" href="settings.html">הגדרות סנכרון</a>
    </div>`;
    out.innerHTML = html;
  }

  out.addEventListener("input", (e) => {
    const box = e.target.closest("[data-pick-search]");
    if (box) {
      const entry = L.items().find((x) => x.id === box.dataset.pickSearch);
      if (!entry) return;
      pickQuery.set(entry.id, box.value);
      box.parentElement.querySelector(".pick-results").innerHTML = pickResultsHtml(entry, box.value);
      return;
    }
    if (e.target.id !== "import-text") return;
    importText = e.target.value;
    const btn = out.querySelector("[data-import-add]"), n = parseNote(importText).length;
    btn.textContent = `הוספת ${n} פריטים`;
    btn.disabled = !n;
  });

  out.addEventListener("submit", (e) => {
    if (e.target.id !== "add-item") return;
    e.preventDefault();
    const text = e.target.text.value.trim();
    e.target.text.value = "";
    if (text && !L.add(text)) note(`כבר בעגלה: ${text}`);
    out.querySelector("#add-item input").focus();
  });

  // A chain with two branches (Osher Ad): which one you're going to. Both = the cheaper branch's price, with
  // the branch named; one = only its prices and products (the other is turned off, as in settings).
  function branchSwitch() {
    const list = window.Stores.list, on = window.Stores.choice(), byShort = new Map();
    list.forEach((st) => byShort.set(st.short, [...(byShort.get(st.short) || []), st]));
    return [...byShort.values()].filter((g) => g.length > 1 && g.some((st) => on[st.key])).map((g) => {
      const all = g.every((st) => on[st.key]);
      const chip = (val, label, sel) => `<button type="button" class="${sel ? "on" : ""}" data-branch="${esc(val)}" data-chain="${esc(g[0].short)}">${esc(label)}</button>`;
      return `<div class="branch-switch"><span>${esc(g[0].short)}, לאיזה סניף?</span>` +
        chip("*", "שניהם", all) + g.map((st) => chip(st.key, st.name.replace(st.short, "").trim(), !all && on[st.key])).join("") + "</div>";
    }).join("");
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-branch]");
    if (!b) return;
    for (const st of window.Stores.list.filter((x) => x.short === b.dataset.chain)) {
      window.Stores.set(st.key, b.dataset.branch === "*" || b.dataset.branch === st.key);
    }
    location.reload();
  });
  out.addEventListener("click", (e) => {
    const cut = e.target.closest(".item-name");
    if (cut) { cut.classList.toggle("full"); return; }  // a long name: the whole of it, or cut again
    const t = e.target.closest("button");
    if (!t) return;
    const entry = (id) => L.items().find((x) => x.id === id);
    if (t.dataset.qty) {
      const x = entry(t.dataset.qty), it = x && x.product && data.byKey.get(x.product);
      if (!x) return;
      const step = Number(t.dataset.step) * (it && it.best.weighted ? 0.5 : 1);
      const qty = Math.round((x.qty + step) * 10) / 10;
      if (qty <= 0) L.remove(x.id); else L.set(x.id, { qty });
    } else if (t.dataset.fix) {
      L.set(t.dataset.fix, { text: t.dataset.text });
    } else if (t.dataset.split) {
      const x = entry(t.dataset.split);
      if (!x) return;
      L.remove(x.id);
      const had = L.addMany(splitOf(x.text).map((text) => ({ text, qty: 1 })));
      if (had.length) note(`כבר בעגלה: ${had.join(", ")}`);
    } else if (t.dataset.remove) {
      L.remove(t.dataset.remove);
    } else if (t.dataset.done) {
      const x = entry(t.dataset.done);
      if (x) L.set(x.id, { done: !x.done });
    } else if (t.dataset.picker) {
      picking = picking === t.dataset.picker ? null : t.dataset.picker;
      render();
    } else if (t.dataset.pick) {
      picking = null;
      L.set(t.dataset.pick, { product: t.dataset.key });
    } else if (t.dataset.swap) {
      L.set(t.dataset.swap, { product: t.dataset.to });
    } else if (t.dataset.block) {
      const [a, b] = [t.dataset.block, t.dataset.other];
      L.block(a, b);  // then the next-best is suggested
      render();
      undoBar("סומן כ״לא מתאים״", () => { L.unblock(a, b); render(); });
    } else if ("compare" in t.dataset) {
      showCompare = !showCompare;
      render();
    } else if (t.dataset.order) {
      order = t.dataset.order;
      try { localStorage.setItem(ORDER_KEY, order); } catch (err) { /* private mode */ }
      render();
    } else if ("clearDone" in t.dataset) {
      for (const x of L.items()) if (x.done) L.remove(x.id);
    } else if ("importOpen" in t.dataset) {
      importText = "";
      render();
      out.querySelector("#import-text").focus();
    } else if ("importAdd" in t.dataset) {
      const entries = parseNote(out.querySelector("#import-text").value);
      importText = null;
      const had = L.addMany(entries);
      if (had.length) note(`כבר בעגלה: ${had.join(", ")}`);
    } else if ("importCancel" in t.dataset) {
      importText = null;
      render();
    } else if ("share" in t.dataset) {
      const text = L.items().filter((x) => !x.done).map((x) => {
        const it = x.product && data.byKey.get(x.product);
        return `• ${it ? it.name : x.text}${x.qty !== 1 ? ` × ${x.qty}` : ""}`;
      }).join("\n");
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else navigator.clipboard.writeText(text).then(() => alert("הרשימה הועתקה"), () => {});
    }
  });

  // A bar at the bottom with "ביטול" for a few seconds after a tap that's easy to hit by mistake.
  let undoTimer = null;
  // a short message at the bottom (no undo): "כבר בעגלה: עגבניות"
  function note(text) {
    let bar = document.getElementById("note-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "note-bar";
      bar.className = "undo-bar";
      document.body.appendChild(bar);
    }
    bar.innerHTML = `<span>${esc(text)}</span>`;
    bar.hidden = false;
    clearTimeout(note.timer);
    note.timer = setTimeout(() => { bar.hidden = true; }, 4000);
  }
  function undoBar(text, undo) {
    let bar = document.getElementById("undo-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "undo-bar";
      bar.className = "undo-bar";
      document.body.appendChild(bar);
    }
    bar.innerHTML = `<span>${esc(text)}</span><button type="button">ביטול</button>`;
    bar.hidden = false;
    bar.querySelector("button").onclick = () => { bar.hidden = true; undo(); };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { bar.hidden = true; }, 8000);
  }

  L.onChange(render);
  load(build).then((d) => {
    data = d;
    ({ byCat, unitOf, bestSwap, costAt, hasWord, generalMatch, generalAt, cardDiscount, compareHtml, planHtml, typoFix, splitOf, isMultipack } = window.Compare(d));
    render();
  }).catch((e) => { console.error(e); out.innerHTML = '<p class="empty">לא ניתן לטעון את המחירון.</p>'; });
})();
