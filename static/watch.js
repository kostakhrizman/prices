// "המעקב שלי", a tab of the deals page: general words the user watches ("סטייק"), kept per phone
// (localStorage "watch": [{text, added, seen: [alert ids]}]). For each word, every product whose name has
// it — whatever else its name says (see matches for which ones) — and its alerts: below its own regular
// price (a deal, or a shelf-price drop this month, data/changes.json) or clearly below the competitors (the
// same product CHEAPER_PCT under every other store that's on). Only NEW ones show (the user: not the sales
// already running): when a word is added, its current alerts are recorded as seen, and "ראיתי" adds the
// shown ones. An alert's id carries its price, so a new price is a new alert. Name matching only, no AI.
// Each word may also have conditions (the user's: "entrecote under ₪90 a kg", "25% under the rest"), which
// show whatever meets them, already-cheap ones too: `max` (₪, per kg / l or per unit: `maxUnit`) and `pct`
// (% under the median per kg / l of the word's products at the other stores; the products differ per store:
// a weighed entrecote has no shared barcode).
(function () {
  const { esc, money, load, norm, words: nameWords, stem, sameWord, PROCESSED } = window.Render;
  const KEY = "watch";
  const SHOW = 8;  // products shown per word before "ועוד"
  const CHEAPER_PCT = 0.10;
  const newText = (n) => (n === 1 ? "חדש אחד" : `${n} חדשים`);
  let data = null, C = null, changes = {}, loading = null, el = null, editRules = null;  // the word whose conditions are open

  const read = () => {
    try { return (JSON.parse(localStorage.getItem(KEY)) || []).filter((w) => w.text); } catch (e) { return []; }
  };
  const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* private mode */ } };
  const day = (d) => `${Number(d.slice(6, 8))}.${Number(d.slice(4, 6))}`;

  // per kg / l (or per item when sold by the item) at store s
  const unitOf = (o) => (o.base_unit !== "unit" && o.unit_price !== null ? { v: o.unit_price, label: o.unit_label, kg: true }
                                                                           : { v: o.price, label: "ליח׳", kg: false });
  const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
  // the word's products' prices per kg / l at each store that's on, for its "% under the rest" condition
  function pricesByStore(found) {
    const by = data.stores.map(() => []);
    for (const it of found) it.offers.forEach((o, s) => { if (o && data.stores[s].on && unitOf(o).kg) by[s].push(unitOf(o).v); });
    return by;
  }

  // a product's alerts at the stores that are on, biggest first: {id, s, pct, text}; w: the watched word
  function alertsOf(it, w = {}, by = null) {
    const out = [], on = (s) => data.stores[s].on;
    it.offers.forEach((o, s) => {
      if (!o || !on(s)) return;
      const u = unitOf(o);
      if (w.max && (w.maxUnit === "unit" ? o.price <= w.max : u.kg && u.v <= w.max)) {  // the user's maximum
        out.push({ id: `${it.key}|${s}|m|${o.price}`, s, pct: 100, rule: true,
                   text: `<b>עומד במחיר המרבי</b>: ${money(u.v)} ${u.label} (עד ${money(w.max)})` });
      }
      if (w.pct && by && u.kg) {  // the user's "% under the rest"
        const rest = median(by.flatMap((xs, t) => (t === s ? [] : xs)));
        if (rest && u.v <= rest * (1 - w.pct / 100)) {
          const under = Math.round((1 - u.v / rest) * 100);
          out.push({ id: `${it.key}|${s}|r|${o.price}`, s, pct: 100 + under, rule: true,
                     text: `<b>זול ב־${under}% מהשאר</b>: ${money(u.v)} ${u.label}, בשאר החנויות בדרך כלל ${money(rest)}` });
        }
      }
    });
    it.offers.forEach((o, s) => {
      if (!o || !on(s)) return;
      if (o.deal && o.shelf && o.price < o.shelf) {  // below its regular price: a deal
        out.push({ id: `${it.key}|${s}|d|${o.price}`, s, pct: Math.round((1 - o.price / o.shelf) * 100),
                   text: `<span class="badge">${esc(o.deal)}</span> ${esc(o.deal_conditions || "")} · במקום ${money(o.shelf)}` });
      }
      const others = it.offers.map((x, t) => (x && t !== s && on(t) ? { x, t } : null)).filter(Boolean);
      if (others.length) {  // below the competitors: the same product, clearly cheaper here than anywhere else
        const low = others.reduce((a, b) => (b.x.price < a.x.price ? b : a));
        if (o.price <= low.x.price * (1 - CHEAPER_PCT)) {
          const pct = Math.round((1 - o.price / low.x.price) * 100);
          out.push({ id: `${it.key}|${s}|c|${o.price}`, s, pct,
                     text: `זול ב־${pct}% מ${esc(data.stores[low.t].short)} (${money(low.x.price)})` });
        }
      }
    });
    const ch = changes[it.key];
    if (ch) {  // below its regular price: a shelf-price drop this month that still holds
      const [raw, old, now, when] = ch, s = window.Render.shownAt(data.stores, raw), o = it.offers[s];
      if (o && on(s) && now < old && Math.abs((o.shelf || o.price) - now) < 0.005) {
        out.push({ id: `${it.key}|${s}|p|${now}`, s, pct: Math.round((1 - now / old) * 100),
                   text: `ירד מ־${money(old)} ל־${money(now)} ב־${day(when)}` });
      }
    }
    return out.sort((a, b) => b.pct - a.pct);
  }
  function allAlerts(w) {
    const found = matches(w.text), by = pricesByStore(found);
    return found.flatMap((it) => alertsOf(it, w, by));
  }

  // Every product with all the words as whole words (singular = plural), in the departments where
  // products are named after them ("סטייק ..." is in the meat departments, so a deodorant "סטיק" and
  // "החלב החדש מושלם לקפה" stay out); a plain word skips processed variants unless it names them.
  function matches(text) {
    const ws = norm(text).split(/\s+/).filter(Boolean);
    if (!ws.length) return [];
    let hits = data.items.filter((it) => {
      const own = nameWords(it.name + " " + it.maker);
      return ws.every((w) => own.some((x) => sameWord(x, w)));
    });
    // Matching drops a double yod ("עגבנייה" = "עגבניה", the chains differ), which makes "סטייק" (steak)
    // "סטיק" (a deodorant stick). For a word typed with יי, a name without it counts only in a
    // department where names with it are too: Rami Levy's "עגבניה" stays, the deodorant goes.
    const doubled = text.split(/\s+/).filter((w) => w.includes("יי")).map((w) => stem(w.replace(/['"`׳״]/g, "")));
    const withDoubled = hits.filter((it) => doubled.length && doubled.every((d) => it.name.includes(d)));
    if (withDoubled.length) {
      const tops = new Set(withDoubled.map((it) => data.categories[it.cat].top));
      hits = hits.filter((it) => tops.has(data.categories[it.cat].top));
    }
    const named = hits.filter((it) => {
      const lead = nameWords(it.name);
      return ws.every((w, i) => lead[i] !== undefined && sameWord(lead[i], w));
    });
    const tops = new Set((named.length ? named : hits).map((it) => data.categories[it.cat].top));
    const inTops = hits.filter((it) => tops.has(data.categories[it.cat].top));
    const asked = new Set(ws);
    const plain = inTops.filter((it) => nameWords(it.name).every((w) => !PROCESSED.has(w) || asked.has(w)));
    return plain.length ? plain : inTops;
  }

  function rowHtml(it, news) {
    const o = it.best;
    const unit = o.unit_price !== null && o.base_unit !== "unit" ? ` · ${money(o.unit_price)} ${o.unit_label}` : "";
    return `<li><div class="info"><div class="name">${esc(it.name)} ${window.Photo ? window.Photo.button(it.key, it.name, esc, it.food) : ""}</div>
      <div class="meta">${money(o.price)}${unit} · <span class="store-tag st-${o.store}">${esc(data.stores[o.store].short)}</span>${
        window.Render.branchNote(o) ? ` <span class="only">${window.Render.branchNote(o)}</span>` : ""}</div>
      ${news.map((n) => `<div class="deal st-${n.s}">${n.text}${n.s !== o.store ? ` · ${esc(data.stores[n.s].short)}` : ""}</div>`).join("")}</div>
      <button class="add" type="button" data-add="${esc(it.key)}" data-name="${esc(it.name)}" aria-label="הוספה לרשימה">+</button></li>`;
  }

  function entryHtml(w) {
    const found = matches(w.text);
    const seen = new Set(w.seen || []);
    // the new alerts, per product, the biggest first
    const by = pricesByStore(found);
    const hot = found.map((it) => ({ it, news: alertsOf(it, w, by).filter((a) => !seen.has(a.id)) }))
      .filter((x) => x.news.length).sort((a, b) => b.news[0].pct - a.news[0].pct);
    const remove = `<button type="button" class="link watch-remove" data-unwatch="${esc(w.text)}" aria-label="הסרה מהמעקב">הסרה</button>`;
    let body;
    if (!found.length) body = '<p class="sub">אין מוצרים עם השם הזה.</p>';
    else if (!hot.length) body = `<p class="sub">אין חדש. ${found.length} מוצרים במעקב; נראה כאן כשאחד מהם ייכנס למבצע, יירד במחיר או יהיה זול בבירור מהמתחרים.</p>`;
    else {
      body = `<ul>${hot.slice(0, SHOW).map((x) => rowHtml(x.it, x.news)).join("")}</ul>` +
        (hot.length > SHOW ? `<p class="sub">ועוד ${hot.length - SHOW} מוצרים עם עדכון</p>` : "") +
        `<button type="button" class="link" data-seen="${esc(w.text)}">ראיתי, לנקות</button>`;
    }
    const rules = [w.max && `עד ${money(w.max)} ${w.maxUnit === "unit" ? "ליח׳" : "לק״ג"}`, w.pct && `זול ב־${w.pct}% מהשאר`].filter(Boolean);
    const editing = editRules === w.text;
    const rulesHtml = `<div class="watch-rules">${rules.length ? `תנאים: ${rules.join(" · ")} · ` : ""}` +
      `<button type="button" class="link" data-rules="${esc(w.text)}">${editing ? "סגירה" : rules.length ? "שינוי" : "הוספת תנאי"}</button></div>` +
      (editing ? `<form class="watch-rule-form" data-rules-form="${esc(w.text)}">
        <label>מחיר מרבי ₪<input name="max" type="number" inputmode="decimal" step="0.1" min="0" value="${w.max || ""}"></label>
        <select name="maxUnit"><option value="kg"${w.maxUnit !== "unit" ? " selected" : ""}>לק״ג / ליטר</option><option value="unit"${w.maxUnit === "unit" ? " selected" : ""}>ליחידה</option></select>
        <label>זול לפחות ב־<input name="pct" type="number" inputmode="numeric" min="0" max="90" value="${w.pct || ""}">% מהשאר</label>
        <p class="sub">מה שעומד בתנאי יופיע תמיד, גם אם הוא כבר זול היום. שדה ריק: בלי התנאי.</p></form>` : "");
    return { hot: hot.length, html: `<div class="watch-item${hot.length ? " has-news" : ""}"><div class="watch-head">
      <b>${esc(w.text)}</b><small>${hot.length ? newText(hot.length) : ""}</small>${remove}</div>${rulesHtml}${body}</div>` };
  }

  // a word's alerts as they are now become "seen": when it's added (the sales already running aren't
  // news) and on "ראיתי"; a word added before the prices were loaded is done once they are (baseline)
  function markSeen(text) {
    const list = read(), w = list.find((x) => x.text === text);
    if (!w || !data) return;
    w.seen = [...new Set([...(w.seen || []), ...allAlerts(w).map((a) => a.id)])];
    delete w.baseline;
    save(list);
  }

  function draw() {
    if (!el) return;
    const list = read();
    const count = document.querySelector('[data-tab="watch"] small');  // the tab's count (deals.js)
    if (count) count.textContent = list.length;
    let html = `<form id="watch-add" class="watch-add"><input name="text" placeholder="מה לעקוב, למשל סטייק" autocomplete="off" enterkeyhint="done">
      <button type="submit">מעקב</button></form>`;
    if (!list.length) {
      el.innerHTML = html + '<p class="empty">כתבו מוצר כללי, למשל ״סטייק״ או ״קפה״. מעכשיו נראה כאן כל מוצר כזה, בכל שם שהוא, שנכנס למבצע, ירד במחיר או זול בבירור מהמתחרים.</p>';
      return;
    }
    if (!data) {
      el.innerHTML = html + '<p class="sub">טוען…</p>';
      loading = loading || Promise.all([
        load(document.querySelector("script[data-build]").dataset.build),
        fetch("data/changes.json?v=" + document.querySelector("script[data-build]").dataset.build)
          .then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      ]).then(([d, ch]) => { data = d; C = window.Compare(d); changes = ch; draw(); })
        .catch(() => { el.insertAdjacentHTML("beforeend", '<p class="empty">לא ניתן לטעון את המחירים.</p>'); });
      return;
    }
    for (const w of list) if (w.baseline || !w.seen) markSeen(w.text);  // !seen: watched before alerts had one
    const entries = read().slice().reverse().map(entryHtml).sort((a, b) => (b.hot > 0) - (a.hot > 0));
    const fresh = entries.reduce((n, e) => n + e.hot, 0);
    if (count) count.textContent = fresh ? newText(fresh) : list.length;
    el.innerHTML = html + entries.map((e) => e.html).join("");
    if (window.Basket) window.Basket.update();
  }

  // a condition is saved as it's typed, and the list redrawn once the typing stops
  let rulesTimer = null;
  document.addEventListener("input", (e) => {
    const f = e.target.closest("[data-rules-form]");
    if (!f) return;
    const list = read(), w = list.find((x) => x.text === f.dataset.rulesForm);
    if (!w) return;
    const max = Number(f.max.value), pct = Number(f.pct.value);
    if (max > 0) w.max = max; else delete w.max;
    w.maxUnit = f.maxUnit.value;
    if (pct > 0) w.pct = Math.min(pct, 90); else delete w.pct;
    save(list);
    clearTimeout(rulesTimer);
    rulesTimer = setTimeout(() => {
      const focus = document.activeElement && document.activeElement.name;
      draw();
      const again = el && el.querySelector(`[data-rules-form] [name="${focus}"]`);
      if (again) { again.focus(); if (again.setSelectionRange && again.type !== "number") again.setSelectionRange(again.value.length, again.value.length); }
    }, 700);
  });
  document.addEventListener("change", (e) => { if (e.target.closest("[data-rules-form]") && e.target.name === "maxUnit") e.target.dispatchEvent(new Event("input", { bubbles: true })); });
  document.addEventListener("submit", (e) => {
    if (e.target.closest("[data-rules-form]")) { e.preventDefault(); return; }
    if (e.target.id !== "watch-add") return;
    e.preventDefault();
    const text = e.target.text.value.trim(), list = read();
    if (text && !list.some((w) => w.text === text)) {
      list.push({ text, added: Date.now(), seen: [], baseline: true });
      save(list);
      markSeen(text);
    }
    draw();
  });
  document.addEventListener("click", (e) => {
    const seen = e.target.closest("[data-seen]");
    if (seen) { markSeen(seen.dataset.seen); draw(); return; }
    const rules = e.target.closest("[data-rules]");
    if (rules) { editRules = editRules === rules.dataset.rules ? null : rules.dataset.rules; draw(); return; }
    const t = e.target.closest("[data-unwatch]");
    if (!t) return;
    save(read().filter((w) => w.text !== t.dataset.unwatch));
    draw();
  });

  // deals.js draws the tab into `container`
  window.WatchView = { count: () => read().length, draw: (container) => { el = container; draw(); } };
})();
