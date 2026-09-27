// Monthly supermarket spending by category, from the receipts the PC has read (grocery/receipts.py):
// a receipt counts in the month of its date, its lines are summed by their category (a top-level
// category of the tree), and what the lines don't account for — bags, deposits, a discount on the whole
// purchase — is shown apart, so the categories and that line add up to the receipts' totals.
// A receipt photographed here ({kind: "spending"}) is counted, and the compare page lists it too ("השוואה");
// receipts from the compare page count too, and so do expenses added by hand ({kind: "manual"}, no
// photo). Receipts are cached per phone by their git sha, so only new or changed ones are downloaded.
(async function () {
  const { esc, money } = window.Render;
  const L = window.Basket, G = window.Basket.github, R = window.ReceiptUpload;
  const ICONS = JSON.parse(document.currentScript.dataset.icons);  // {category: svg inner markup}
  const BUILD = document.currentScript.dataset.build;
  const out = document.getElementById("spending");
  const status = document.getElementById("receipt-status");
  const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  const CHART_MONTHS = 6;
  const CACHE = "receiptCache";
  const OTHER = "לא מסווג";
  const POLL_MS = 15000;
  let months = new Map(), month = null, openCat = null, showReceipts = false, pollTimer = null, failed = [];
  // departments left out of the saving (per phone, localStorage "savingExclude"), and whether their buttons show
  const EXCLUDE = "savingExclude";
  let excluded = new Set(), pickExcluded = false, savingOpen = false;  // the saving's details: after a tap
  // one day of the month (YYYY-MM-DD) or null for all of it, chosen in the purchases list; the done receipts
  let day = null, done = [];
  const dayOf = (r) => (r.date || r.uploaded_at || "").slice(0, 10);
  try { excluded = new Set(JSON.parse(localStorage.getItem(EXCLUDE)) || []); } catch (e) { /* none */ }

  if (!L.configured()) {
    out.innerHTML = '<p class="empty">ההוצאות מחושבות מהקבלות שמצלמים, וכדי לצלם קבלות צריך קודם לחבר את הרשימה ל־GitHub: <a href="settings.html">הגדרות סנכרון</a>.</p>';
    document.querySelector(".spend-actions").hidden = true;
    return;
  }

  // every receipt, {id, ...its json}
  async function receipts() {
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE)) || {}; } catch (e) { /* none yet */ }
    const files = ((await R.api("receipts")) || []).filter((f) => f.name.endsWith(".json"));
    const fresh = {};
    const all = await Promise.all(files.map(async (f) => {
      let hit = cache[f.name];
      if (!hit || hit.sha !== f.sha) {
        const j = await R.api(`receipts/${f.name}`);
        hit = { sha: f.sha, data: j ? JSON.parse(G.decode(j.content)) : {} };
      }
      fresh[f.name] = hit;
      return { id: f.name.slice(0, -5), ...hit.data };
    }));
    try { localStorage.setItem(CACHE, JSON.stringify(fresh)); } catch (e) { /* storage full: fetch again next time */ }
    return all;
  }

  const storeName = (r) => {
    const st = window.Stores.list.find((s) => s.key === r.store_key);
    return st ? st.short : (r.store || "חנות אחרת");
  };
  const receiptsText = (n) => (n === 1 ? "קנייה אחת" : `${n} קניות`);
  const dayMonth = (d) => (d ? d.slice(8, 10) + "." + d.slice(5, 7) : "");

  // What a photographed receipt really cost: the user's card is prepaid (its 7% comes when it's loaded), so a
  // receipt from that store shows full prices; the share actually paid. Hand-typed expenses are already
  // what was paid. The saving uses the lines' shelf prices and takes the card off itself.
  function paidShare(r, total) {
    const st = window.Stores.list.find((s) => s.key === r.store_key);
    if (r.kind === "manual" || !st || !st.card_rate || total <= 0) return 1;
    return (total - st.card_rate * Math.min(total, st.card_cap || Infinity)) / total;
  }

  // {"2026-09": {total, count, cats: Map(category -> {sum, lines}), rest, stores: Map, receipts}}
  function byMonth(list) {
    const m = new Map();
    for (const r of list) {
      const key = (r.date || r.uploaded_at || "").slice(0, 7);
      if (!/^\d{4}-\d\d$/.test(key)) continue;
      if (!m.has(key)) m.set(key, { total: 0, count: 0, cats: new Map(), rest: 0, stores: new Map(), receipts: [],
                                    unmatched: { n: 0, paid: 0 }, manual: 0 });
      const x = m.get(key);
      const lines = r.items || [];
      const shelfLines = lines.reduce((s, i) => s + (i.paid || 0), 0);
      const shelfTotal = r.total || shelfLines;
      const f = paidShare(r, shelfTotal);  // < 1 at the prepaid card's store
      const lineSum = shelfLines * f, total = shelfTotal * f;
      x.total += total;
      x.count++;
      x.rest += total - lineSum;
      const rec = { id: r.id, date: r.date, store: storeName(r), storeKey: r.store_key, total, lines: [],
                    manual: r.kind === "manual" };
      x.receipts.push(rec);
      x.stores.set(storeName(r), (x.stores.get(storeName(r)) || 0) + total);
      for (const i of lines) {
        if (r.kind === "manual") {  // a hand entry counts when it was given a quantity (it then has `at`)
          if (i.at) rec.lines.push({ key: null, qty: i.qty, paid: i.paid || 0, at: i.at, cat: i.category || OTHER });
          else x.manual += i.paid || 0;
        } else if (i.skip) {  // the user said: no product (a bag, a deposit); in the total, not a line to compare
        } else if (i.key && ["barcode", "high", "manual", "learned"].includes(i.match)) {  // lines matched surely
          rec.lines.push({ key: i.key, qty: i.qty || 1, paid: i.paid || 0, at: i.at, cat: i.category || OTHER,
                           weighed: !!i.weighed });
        } else {
          x.unmatched.n++; x.unmatched.paid += (i.paid || 0) * f;
        }
        const c = i.category || OTHER;
        if (!x.cats.has(c)) x.cats.set(c, { sum: 0, lines: [] });
        const cat = x.cats.get(c);
        cat.sum += (i.paid || 0) * f;
        cat.lines.push({ name: i.name, paid: (i.paid || 0) * f, date: r.date, store: storeName(r) });
      }
    }
    return m;
  }

  const monthName = (key, short) => {
    const [y, mo] = key.split("-").map(Number);
    return short ? MONTHS[mo - 1] : `${MONTHS[mo - 1]} ${y}`;
  };
  const icon = (c) => (ICONS[c]
    ? `<svg class="spend-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[c]}</svg>`
    : '<span class="spend-icon"></span>');

  // the last CHART_MONTHS calendar months up to the latest receipt, empty ones included
  function chartKeys() {
    const latest = [...months.keys()].sort().pop();
    let [y, mo] = latest.split("-").map(Number);
    const keys = [];
    for (let n = 0; n < CHART_MONTHS; n++) {
      keys.unshift(`${y}-${String(mo).padStart(2, "0")}`);
      if (--mo === 0) { mo = 12; y--; }
    }
    return keys;
  }

  // ---- the potential saving: each receipt's lines, as bought, at each store ----
  // Lines matched to a product surely (barcode or a strong name match). Their price at each store is the
  // one the PC saved when it read the receipt (`at`: that day's prices, grocery/receipts.py prices_at);
  // a line matched or confirmed later gets them once (receipts.freeze), never today's prices here. A line
  // a store can't supply counts at what was paid; card discounts included. No AI. Unmatched lines and
  // expenses added by hand are left out, and the card says so.
  let prices = null, C = null;  // products.json and Compare, loaded once
  const loadPrices = () => window.Render.load(BUILD).then((d) => { prices = d; C = window.Compare(d); draw(); }).catch(() => {});

  // Each receipt is one trip to one store: its lines priced at each store (each line itself or its closest
  // equivalent; one a store can't supply at what was paid; card discounts), and its cheapest store. The
  // month's saving is the sum over its receipts (the user's idea: each trip at the store cheapest for it).
  function receiptSaving(rec, S, on) {
    const kept = rec.lines.filter((l) => !excluded.has(l.cat));
    // only lines with the prices of their day (`at`, saved once by the PC): a receipt never moves with today's
    // prices (the user). A line confirmed later gets its `at` from the PC within a minute or so.
    const lines = kept.filter((l) => l.at);
    if (!lines.length) return null;
    // The card is a prepaid one (the user): its 7% comes when it's loaded, so a receipt shows full prices.
    // What a receipt from that store really cost is its total less the card discount, and every store's
    // total gets its card discount, the receipt's own store too.
    const ownIndex = window.Render.shownAt(S, S.findIndex((st) => st.key === rec.storeKey));
    const shelfPaid = lines.reduce((sum, l) => sum + l.paid, 0);
    const paid = shelfPaid - (ownIndex >= 0 ? C.cardDiscount(ownIndex, shelfPaid) : 0);
    const perStore = on.map((s) => {
      let amount = 0, missing = 0;
      for (const l of lines) {
        const v = window.Render.atPrice(l.at, S[s]);
        if (typeof v === "number") amount += v; else { amount += l.paid; missing++; }
      }
      return { s, total: amount - C.cardDiscount(s, amount), missing };
    }).sort((a, b) => a.total - b.total);
    const best = perStore[0];
    return { rec, paid, best, saving: paid - best.total, lines: lines.length,
             gone: kept.length - lines.length };
  }

  function savingHtml(x) {
    const withLines = x.receipts.filter((r) => r.lines.length);
    if (!withLines.length) return "";
    if (!prices) { if (!C) { C = {}; loadPrices(); } return '<div class="saving-card"><p class="sub">מחשב חיסכון אפשרי…</p></div>'; }
    // every tracked store, also the ones this phone turned off (Render.allStores): the saving is about where
    // the trip could have been made, not about which stores the price lists show
    const S = window.Render.allStores(prices.stores), on = S.map((_, s) => s).filter((s) => S[s].on !== false);
    const each = withLines.map((r) => receiptSaving(r, S, on)).filter(Boolean)
      .sort((a, b) => (b.rec.date || "").localeCompare(a.rec.date || ""));
    // the departments this month's compared lines are in, for the include / leave-out buttons
    const cats = [...new Set(withLines.flatMap((r) => r.lines.map((l) => l.cat)))].sort();
    const picker = `<button type="button" class="link saving-cats-open" data-saving-cats>${pickExcluded ? "סגירה" : "קטגוריות בהשוואה"}</button>` +
      (pickExcluded ? `<div class="dept-chips saving-cats">${cats.map((c) =>
        `<button type="button" data-saving-cat="${esc(c)}" class="${excluded.has(c) ? "" : "on"}">${esc(c)}</button>`).join("")}</div>
        <p class="sub">הקטגוריות המסומנות נכללות בהשוואה; לחיצה מוציאה או מחזירה. נשמר בטלפון הזה.</p>` : "");
    if (!each.length) return `<div class="saving-card"><div class="saving-title">חיסכון אפשרי</div><p class="sub">כל הקטגוריות הוצאו מההשוואה.</p>${picker}</div>`;
    const total = each.reduce((sum, e) => sum + Math.max(0, e.saving), 0);
    let html = `<div class="saving-card"><button type="button" class="saving-head" data-saving-open aria-expanded="${savingOpen}">
      <span class="saving-title">חיסכון אפשרי <span class="saving-toggle">${savingOpen ? "הסתרת הפירוט ▴" : "פירוט ▾"}</span></span>` +
      (total > 0.5 ? `<span class="saving-main"><b>${money(total)}</b> אילו כל קנייה נעשתה בחנות הזולה לה</span>`
                   : '<span class="saving-main">כל הקניות נעשו בחנות הזולה להן.</span>') + "</button>";
    // the receipts compare page sits under the saving (the user moved it here), open or closed
    const compareLink = `<p class="sub saving-all">משווה לכל החנויות, גם לאלה שכבויות בהגדרות.</p>
      <a class="link saving-compare" href="receipt.html">השוואת קבלות בין החנויות ←</a>`;
    if (!savingOpen) return html + compareLink + "</div>";
    html += '<ul class="saving-list">' + each.map((e) => {
      const tag = `<span class="store-tag st-${e.best.s}">${esc(S[e.best.s].short)}</span>`;
      const what = e.saving > 0.5
        ? `${money(e.paid)} → ב${tag} ${money(e.best.total)} <b>(חיסכון ${money(e.saving)})</b>`
        : `${money(e.paid)} · נקנה בחנות הזולה`;
      return `<li><span>${dayMonth(e.rec.date)} · ${esc(e.rec.store)}</span><span>${what}</span></li>`;
    }).join("") + "</ul>";
    const gone = each.reduce((n, e) => n + e.gone, 0);
    const when = "לפי המחירים ביום הקנייה";
    const counted = each.reduce((n, e) => n + e.lines, 0);
    html += `<p class="sub">${when}, על ${counted === 1 ? "מוצר אחד שזוהה" : `${counted} מוצרים שזוהו`} בקבלות; מוצר שאין בחנות נספר במחיר ששולם.</p>`;
    const left = [x.unmatched.n && `${x.unmatched.n === 1 ? "שורה אחת שלא זוהתה" : `${x.unmatched.n} שורות שלא זוהו`} (${money(x.unmatched.paid)})`,
      gone && (gone === 1 ? "מוצר אחד שעוד לא תומחר" : `${gone} מוצרים שעוד לא תומחרו`),
      x.manual > 0.005 && `הוצאות ידניות בלי כמות (${money(x.manual)})`,
      ...cats.filter((c) => excluded.has(c))].filter(Boolean);
    if (left.length) html += `<p class="sub">לא כולל: ${left.join(" · ")}.</p>`;
    return html + picker + compareLink + "</div>";
  }

  function draw() {
    if (!months.size) {
      out.innerHTML = '<p class="empty">עוד אין קבלות שנקראו. צלמו קבלה והיא תיספר כאן.</p>';
      return;
    }
    const keys = chartKeys();
    const top = Math.max(...keys.map((k) => (months.get(k) || { total: 0 }).total), 1);
    let html = '<div class="spend-chart">' + keys.map((k) => {
      const t = (months.get(k) || { total: 0 }).total;
      return `<button type="button" class="spend-month${k === month ? " on" : ""}" data-month="${k}"${t ? "" : " disabled"}>
        <span class="amount">${t ? "₪" + Math.round(t) : ""}</span>
        <span class="col" style="height:${Math.max(2, Math.round((t / top) * 72))}px"></span>
        <span class="label">${monthName(k, true)}</span></button>`;
    }).join("") + "</div>";

    const whole = months.get(month);
    const days = [...new Set(whole.receipts.map((r) => r.date).filter(Boolean))].sort();
    if (day && !days.includes(day)) day = null;
    // a chosen day: everything below (total, categories, saving, purchases) for that day only
    const x = day ? byMonth(done.filter((r) => dayOf(r) === day)).get(month) : whole;
    const prev = months.get(keys[keys.indexOf(month) - 1]);
    const change = !day && prev && prev.total ? Math.round((x.total / prev.total - 1) * 100) : null;
    html += `<div class="spend-head"><div><b>${day ? `${dayMonth(day)} · ${monthName(month, true)}` : monthName(month)}</b><span class="sub">${receiptsText(x.count)}</span></div>
      <div class="spend-total">${money(x.total)}${change !== null ? `<small>${change > 0 ? "+" : ""}${change}% מהחודש הקודם</small>` : ""}</div></div>`;

    const cats = [...x.cats.entries()].sort((a, b) => b[1].sum - a[1].sum);
    const max = Math.max(...cats.map(([, c]) => c.sum), 1);
    html += '<ul class="spend-cats">' + cats.map(([name, c]) => {
      const open = openCat === name;
      const lines = open ? '<ul class="spend-lines">' + [...c.lines].sort((a, b) => b.paid - a.paid).map((l) =>
        `<li><span>${esc(l.name)}<small>${esc(l.store)}${l.date ? " · " + dayMonth(l.date) : ""}</small></span><span>${money(l.paid)}</span></li>`).join("") + "</ul>" : "";
      return `<li class="${open ? "open" : ""}"><button type="button" data-cat="${esc(name)}">
        ${icon(name)}<span class="spend-name">${esc(name)}<span class="spend-bar"><span style="width:${(c.sum / max) * 100}%"></span></span></span>
        <span class="spend-sum">${money(c.sum)}<small>${Math.round((c.sum / x.total) * 100)}%</small></span></button>${lines}</li>`;
    }).join("") + "</ul>";

    const notes = [];
    if (Math.abs(x.rest) >= 0.5) {
      notes.push(x.rest > 0 ? `שקיות, פיקדונות ושורות שלא נקראו: ${money(x.rest)}`
        : `הנחות על כל הקנייה: −${money(-x.rest)}`);
    }
    notes.push("לפי חנות: " + [...x.stores.entries()].sort((a, b) => b[1] - a[1]).map(([s, v]) => `${esc(s)} ${money(v)}`).join(" · "));
    html += savingHtml(x);
    html += notes.map((n) => `<p class="sub">${n}</p>`).join("");

    // the month's receipts, to delete one that was misread or sent twice
    html += `<button type="button" class="link" data-receipts>${showReceipts ? "הסתרת הקניות" : `הקניות של ${day ? dayMonth(day) : monthName(month, true)} (${x.count})`}</button>`;
    if (showReceipts) {
      // the days with purchases this month: one shows that day only
      if (days.length > 1) {
        html += `<div class="dept-chips spend-days">${[["", "הכול"], ...days.map((d) => [d, dayMonth(d)])].map(([d, label]) =>
          `<button type="button" data-day="${d}" class="${(day || "") === d ? "on" : ""}">${label}</button>`).join("")}</div>`;
      }
      html += '<ul class="receipt-unmatched spend-receipts">' + [...x.receipts].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((r) =>
        `<li><span>${dayMonth(r.date)} · ${esc(r.store)}</span><span>${money(r.total)}
          ${r.manual ? "" : `<a class="link" href="receipt.html#${encodeURIComponent(r.id)}">השוואה</a>`}
          <button type="button" class="link" data-delete="${esc(r.id)}">מחיקה</button></span></li>`).join("") + "</ul>";
    }
    out.innerHTML = html;
  }

  async function refresh() {
    const all = await receipts();
    done = all.filter((r) => r.status === "done");
    months = byMonth(done);
    if (!months.has(month)) month = [...months.keys()].sort().pop() || null;
    const waiting = all.filter((r) => r.status === "pending").length;
    failed = all.filter((r) => r.status === "failed" && r.kind === "spending").map((r) => r.id);
    status.innerHTML = [waiting && `${waiting === 1 ? "קבלה אחת ממתינה" : `${waiting} קבלות ממתינות`} לקריאה במחשב בבית…`,
      failed.length && `${failed.length === 1 ? "קבלה אחת לא נקראה" : `${failed.length} קבלות לא נקראו`}. <button type="button" class="link" data-drop-failed>למחוק ולצלם מחדש</button>`]
      .filter(Boolean).join(" ");
    draw();
    clearTimeout(pollTimer);
    if (waiting) pollTimer = setTimeout(reload, POLL_MS);
  }
  async function reload() {
    try {
      await refresh();
    } catch (err) {
      out.innerHTML = `<p class="empty">לא ניתן לטעון את הקבלות (${esc(err.message)}). כדאי לבדוק את החיבור ואת <a href="settings.html">הגדרות הסנכרון</a>.</p>`;
    }
  }

  document.getElementById("receipt-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    status.textContent = "מעלה את הצילום…";
    try {
      await R.upload(file, { kind: "spending" });
      await reload();
    } catch (err) {
      status.textContent = `ההעלאה נכשלה (${err.message}). כדאי לבדוק את החיבור ולנסות שוב.`;
    }
  });

  out.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.delete) {
      if (!confirm("למחוק? זה לא ייספר בהוצאות.")) return;
      await R.remove(t.dataset.delete);
      await reload();
      return;
    }
    if (t.dataset.month) { month = t.dataset.month; openCat = null; showReceipts = false; day = null; }
    else if (t.dataset.day !== undefined) { day = t.dataset.day || null; openCat = null; }
    else if (t.dataset.cat !== undefined) openCat = openCat === t.dataset.cat ? null : t.dataset.cat;
    else if ("receipts" in t.dataset) showReceipts = !showReceipts;
    else if ("savingCats" in t.dataset) pickExcluded = !pickExcluded;
    else if ("savingOpen" in t.dataset) savingOpen = !savingOpen;
    else if (t.dataset.savingCat !== undefined) {
      const c = t.dataset.savingCat;
      if (excluded.has(c)) excluded.delete(c); else excluded.add(c);
      try { localStorage.setItem(EXCLUDE, JSON.stringify([...excluded])); } catch (err) { /* private mode */ }
    }
    draw();
  });
  // ---- adding an expense by hand: saved like a read receipt ({kind: "manual"}, no photo) ----
  const form = document.getElementById("manual-form");
  const opener = document.getElementById("manual-open");
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  let guessData = null, pickedByHand = false, guessTimer = null;
  opener.addEventListener("click", () => {
    form.hidden = !form.hidden;
    if (!form.hidden) {
      form.reset();
      form.date.value = today();
      pickedByHand = false;
      syncUnit();
      form.name.focus();
    }
  });
  document.getElementById("manual-cancel").addEventListener("click", () => { form.hidden = true; });
  // bought by weight: produce, meat, chicken and fish are entered in kg and compared per kg
  const BY_WEIGHT = new Set(["ירקות ופירות", "בשר, עוף ודגים"]);
  function syncUnit() {
    const kg = BY_WEIGHT.has(form.category.value);
    form.unit.value = kg ? "kg" : "unit";
    form.qty.placeholder = kg ? "כמה ק״ג? להשוואה" : "כמה יחידות? להשוואה";
  }
  form.category.addEventListener("change", () => { pickedByHand = true; syncUnit(); });
  // the category the name's products are in (the shopping list's matching), unless chosen by hand
  form.name.addEventListener("input", () => {
    clearTimeout(guessTimer);
    guessTimer = setTimeout(async () => {
      if (pickedByHand || !form.name.value.trim()) return;
      try {
        if (!guessData) {
          const d = await window.Render.load(BUILD);
          guessData = { d, C: window.Compare(d) };
        }
        const m = guessData.C.generalMatch(form.name.value.trim());
        if (m && !pickedByHand) { form.category.value = guessData.d.categories[m.cat].top; syncUnit(); }
      } catch (err) { /* offline: the user picks */ }
    }, 400);
  });
  // A hand entry with a quantity, at each store: the cheapest product of that kind (the list's matching,
  // Compare.generalMatch: no AI), per kg when given in kg (products sold by weight or size), else per pack.
  // {store key: ₪ or null}, or null when nothing matches.
  async function manualPrices(name, qty, unit) {
    try {
      if (!guessData) {
        const d = await window.Render.load(BUILD);
        guessData = { d, C: window.Compare(d) };
      }
    } catch (err) { return null; }
    const { d, C: cmp } = guessData, m = cmp.generalMatch(name);
    if (!m) return null;
    const at = {};
    d.stores.forEach((st, s) => {
      let low = null;
      for (const it of m.cands) {
        const o = it.offers[s];
        if (!o) continue;
        const cost = unit === "kg" ? (o.base_unit === "kg" && o.unit_price !== null ? qty * o.unit_price : null) : qty * o.price;
        if (cost !== null && (low === null || cost < low)) low = cost;
      }
      at[st.key] = low === null ? null : Math.round(low * 100) / 100;
    });
    return Object.values(at).some((v) => v !== null) ? at : null;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const paid = Math.round(Number(form.paid.value) * 100) / 100;
    if (!(paid > 0)) return;
    const id = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 6);
    const qty = Number(form.qty.value) || 0;
    const item = { name: form.name.value.trim(), qty: qty || 1, paid, category: form.category.value };
    if (qty > 0) {  // with a quantity it can be compared: its price today at each store, saved with it
      item.unit = form.unit.value;
      item.at = await manualPrices(item.name, qty, item.unit);
      if (!item.at) delete item.at;
    }
    const entry = { status: "done", kind: "manual", added_at: new Date().toISOString(), date: form.date.value || today(),
      store: form.store.value.trim() || "ללא קבלה", total: paid, items: [item] };
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    try {
      await R.put(`receipts/${id}.json`, G.encode(JSON.stringify(entry)), "Expense added by hand");
      form.hidden = true;
      month = entry.date.slice(0, 7);
      await reload();
      status.textContent = `נוספה הוצאה: ${entry.items[0].name} ${money(paid)}`;
    } catch (err) {
      status.textContent = `השמירה נכשלה (${err.message}). כדאי לבדוק את החיבור ולנסות שוב.`;
    } finally {
      button.disabled = false;
    }
  });

  status.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-drop-failed]")) return;
    for (const id of failed) await R.remove(id);
    await reload();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) reload(); });

  await reload();
})();
