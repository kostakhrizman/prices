// Receipts: the photo goes to the private list repository (receipts/<id>.jpg + receipts/<id>.json,
// status "pending"); the home PC reads it (grocery/receipts.py) and writes back the lines matched to
// products; this page shows what the same products cost at each store (static/compare.js). Uploading:
// static/receipt-upload.js. Receipts taken on the spending page ({kind: "spending"}) are listed too (the
// user wanted their prices); expenses typed by hand ({kind: "manual"}) aren't. receipt.html#<id> opens one
// (the spending page's "השוואה").
(async function () {
  const { esc, money, load } = window.Render;
  const L = window.Basket, G = window.Basket.github;
  const build = document.currentScript.dataset.build;
  const out = document.getElementById("receipts");
  const status = document.getElementById("receipt-status");
  const SHOW = 10;         // most recent receipts listed
  const POLL_MS = 15000;
  let receipts = [], open = decodeURIComponent(location.hash.slice(1)) || null, C = null, data = null, pollTimer = null;

  if (!L.configured()) {
    out.innerHTML = '<p class="empty">כדי לשלוח קבלות צריך קודם לחבר את הרשימה ל־GitHub: <a href="settings.html">הגדרות סנכרון</a>.</p>';
    document.querySelector(".receipt-shot").hidden = true;
    return;
  }

  const { api, put } = window.ReceiptUpload;

  document.getElementById("receipt-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    status.textContent = "מעלה את הצילום…";
    try {
      open = await window.ReceiptUpload.upload(file);
      status.textContent = "נשלח. המחשב בבית יקרא את הקבלה בדקה הקרובה.";
      await refresh();
    } catch (err) {
      status.textContent = `ההעלאה נכשלה (${err.message}). כדאי לבדוק את החיבור ולנסות שוב.`;
    }
  });

  // ---- the receipts list ----
  // refresh, reporting failures on the page (it runs from timers and events too)
  async function reload() {
    try {
      await refresh();
    } catch (err) {
      out.innerHTML = `<p class="empty">לא ניתן לטעון את הקבלות (${esc(err.message)}). כדאי לבדוק את החיבור ואת <a href="settings.html">הגדרות הסנכרון</a>.</p>`;
    }
  }

  async function refresh() {
    const files = (await api("receipts")) || [];
    // the latest few (hand-typed expenses left out afterwards, so a few more are read), plus one asked for
    const json = files.filter((f) => f.name.endsWith(".json")).sort((a, b) => b.name.localeCompare(a.name));
    const metas = json.slice(0, SHOW * 2);
    const asked = open && json.find((f) => f.name === `${open}.json`);
    if (asked && !metas.includes(asked)) metas.push(asked);
    receipts = (await Promise.all(metas.map(async (f) => {
      const j = await api(`receipts/${f.name}`);
      return { id: f.name.slice(0, -5), sha: j.sha, ...JSON.parse(G.decode(j.content)) };
    }))).filter((r) => r.kind !== "manual").filter((r, i) => i < SHOW || r.id === open);
    draw();
    clearTimeout(pollTimer);
    if (receipts.some((r) => r.status === "pending")) pollTimer = setTimeout(reload, POLL_MS);
  }

  const when = (r) => (r.date || r.uploaded_at || "").slice(0, 10).split("-").reverse().join(".");

  function detailHtml(r) {
    if (r.status === "pending") return '<p class="sub">ממתין לקריאה במחשב בבית…</p>';
    if (r.status === "failed") return `<p class="sub">הקריאה נכשלה: ${esc(r.error || "")}</p>
      <button type="button" data-retry="${r.id}">לנסות שוב</button>`;
    // sure matches only (barcode / high / fixed here / learned from a fix), as the spending page's saving: a
    // weak match isn't compared; a line the user said is no product (a bag) is left out
    const sure = (i) => i.key && data.byKey.has(i.key) && SURE.includes(i.match);
    const matched = r.items.filter(sure);
    const unmatched = r.items.filter((i) => !sure(i) && !i.skip);
    const paid = matched.reduce((sum, i) => sum + i.paid, 0);
    // a weighed line (qty in kg) matched to a product sold in packs (455 g of potatoes, a 2.5 kg bag): the
    // share of a pack, so it's priced per kg, as receipts.prices_at does
    const packs = (i, it) => (i.weighed && !it.best.weighted && it.best.base_unit === "kg" && it.best.size_num
      ? i.qty / it.best.size_num : i.qty);
    const lines = matched.map((i) => { const it = data.byKey.get(i.key); return { it, qty: packs(i, it), at: i.at, paid: i.paid }; });
    // the card is prepaid: the receipt shows full prices, and the 7% came when the card was loaded
    const own = window.Render.shownAt(data.stores, data.stores.findIndex((st) => st.key === r.store_key));
    const card = own >= 0 ? C.cardDiscount(own, paid) : 0;
    let html = `<p class="receipt-paid">שולם על ${matched.length} המוצרים שזוהו: <b>${money(paid)}</b>
      ${r.store ? `ב${esc(r.store)}` : ""}${card > 0.005 ? ` (${money(paid - card)} אחרי הנחת הכרטיס הנטען)` : ""}</p>`;
    if (lines.length) html += C.compareHtml(lines, [], { own });
    html += linesHtml(r);
    if (unmatched.length) {
      html += `<h3 class="section">לא זוהו בוודאות (${unmatched.length})</h3>
        <p class="sub">אפשר לתקן: המחשב יזכור את השם הזה מהחנות הזאת, וקבלות הבאות יזוהו לבד.</p><ul class="receipt-unmatched fixable">` +
        unmatched.map((i) => fixRowHtml(r, i)).join("") + "</ul>";
    }
    // a misread line shows up as lines that don't add up to the receipt's total
    const lineSum = r.items.reduce((sum, i) => sum + i.paid, 0);
    if (r.total && Math.abs(lineSum - r.total) > Math.max(1, r.total * 0.03)) {
      html += `<p class="hint">שימו לב: השורות שנקראו מסתכמות ב־${money(lineSum)} וסה״כ הקבלה ${money(r.total)}; ייתכן ששורה נקראה לא נכון (הצילום מצורף במאגר).</p>`;
    }
    const unsure = matched.filter((i) => i.match === "low").length;
    if (unsure) html += `<p class="sub">${unsure} מוצרים זוהו בביטחון נמוך; שווה להציץ בטבלה.</p>`;
    return html;
  }

  // ---- fixing a line that wasn't recognised (the user: so it's learned for the next receipts) ----
  // The phone writes corrections/<receipt>-<line>.json {receipt, index, name, store_key, key or null}; the PC's
  // receipt watcher (receipts.apply_corrections) sets the line, remembers the name for that store, fixes the same
  // line in other receipts, and deletes the file: within a minute or so.
  const SURE = ["barcode", "high", "manual", "learned"];
  let fixing = null, query = "";   // the line whose product search is open ("<receipt>:<index>")
  const fixed = new Map();         // fixed here, until the PC has applied it: id -> {key}
  const lineId = (r, i) => `${r.id}:${r.items.indexOf(i)}`;
  function fixRowHtml(r, i) {
    const id = lineId(r, i), done = fixed.get(id);
    let actions;
    if (done) {
      const it = done.key && data.byKey.get(done.key);
      actions = `<div class="fix-done">${it ? `תוקן: ${esc(it.name)}` : "סומן: לא מוצר"} · יתעדכן בעוד דקה</div>`;
    } else {
      const guess = i.key && data.byKey.get(i.key);
      actions = `<div class="fix-actions">${guess
        ? `<button type="button" class="link" data-fix-confirm="${id}" data-key="${esc(i.key)}">האם זה ${esc(guess.name)}? ✓</button>` : ""}
        <button type="button" class="link" data-fix-open="${id}">${fixing === id ? "סגירה" : "תיקון"}</button>
        <button type="button" class="link" data-fix-skip="${id}">לא מוצר</button></div>`;
      if (fixing === id) {
        actions += `<div class="fix-picker"><input type="search" class="fix-search" value="${esc(query)}" placeholder="חיפוש מוצר" enterkeyhint="search">
          <ul class="fix-results">${resultsHtml(r, "fix")}</ul></div>`;
      }
    }
    return `<li><div class="fix-line"><span>${esc(i.name)}</span><span>${money(i.paid)}</span></div>${actions}</li>`;
  }
  // products with every word of the search (singular = plural), the receipt's store first, then shorter names
  function resultsHtml(r, mode) {  // mode "fix": a tap saves at once; "edit": it goes into the line's editor
    const R = window.Render, ws = R.words(query);
    if (!ws.length) return '<li class="sub">כתבו שם מוצר</li>';
    const s = data.stores.findIndex((st) => st.key === r.store_key);
    const hits = [...data.byKey.values()].filter((it) => ws.every((w) => R.hasStem(R.norm(it.name + " " + it.maker), w)));
    hits.sort((a, b) => (s >= 0 ? (!b.offers[s] - !a.offers[s]) * -1 : 0) || a.name.length - b.name.length);
    if (!hits.length) return '<li class="sub">לא נמצאו מוצרים</li>';
    return hits.slice(0, 8).map((it) => {
      const o = s >= 0 && it.offers[s] ? it.offers[s] : it.best;
      const attr = mode === "edit" ? `data-edit-pick="${editing}"` : `data-fix-pick="${fixing}"`;
      return `<li><button type="button" class="fix-pick" ${attr} data-key="${esc(it.key)}">
        <span>${esc(it.name)}</span><small>${esc(data.stores[o.store].short)} ${money(o.price)}</small></button></li>`;
    }).join("");
  }
  // ---- every line, editable (the user: a recognised line can be wrong too, "לימון" as pickled lemon; and the
  // amount, a 50 g bag read as 10 g) ----
  let editing = null, edit = null;  // the line being edited, and its draft {key, qty, weighed, searching}
  const linesOpen = new Set();      // receipts whose line list is open (stays open while fixing several lines)
  const qtyLabel = (i) => (i.pieces ? `${i.pieces} פריטים` : i.weighed
    ? `${Number(i.qty || 0).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} ק״ג` : `×${i.qty || 1}`);
  const unitOf = (i) => (i.pieces ? "pieces" : i.weighed ? "kg" : "units");
  function linesHtml(r) {
    const rows = r.items.map((i, idx) => {
      const id = `${r.id}:${idx}`, done = fixed.get(id);
      const shown = done ? { ...i, key: done.key, skip: done.key === null, qty: done.qty ?? i.qty,
                             weighed: done.weighed ?? i.weighed, pieces: done.pieces === undefined ? i.pieces : done.pieces } : i;
      const it = shown.key && data.byKey.get(shown.key);
      const what = shown.skip ? "לא מוצר" : it ? esc(it.name) : "לא זוהה";
      const sure = shown.skip || (it && (done || SURE.includes(i.match)));
      let html = `<li class="${sure ? "" : "unsure"}"><div class="line-row"><div><div>${esc(i.name)}</div>
        <div class="sub">→ ${what} · ${qtyLabel(shown)}${done ? " · נשמר, יתעדכן בעוד דקה" : ""}</div></div>
        <div class="line-end"><span>${money(i.paid)}</span>
        <button type="button" class="link" data-edit="${id}">${editing === id ? "סגירה" : "עריכה"}</button></div></div>`;
      if (editing === id) html += editorHtml(r, shown, id);
      return html + "</li>";
    });
    return `<details class="receipt-lines" data-lines="${r.id}"${linesOpen.has(r.id) ? " open" : ""}>
      <summary>כל השורות (${r.items.length}) · עריכה</summary>
      <p class="sub">שינוי מוצר נלמד: אותו שם מאותה חנות יזוהה כך גם בקבלות אחרות. שינוי כמות או משקל רק לקבלה הזאת.</p>
      <ul class="receipt-unmatched line-list">${rows.join("")}</ul></details>`;
  }
  function editorHtml(r, i, id) {
    const it = edit.key && data.byKey.get(edit.key);
    return `<div class="line-editor">
      <div class="line-product">מוצר: <b>${edit.key === null ? "לא מוצר" : it ? esc(it.name) : "לא זוהה"}</b>
        <button type="button" class="link" data-edit-search>${edit.searching ? "סגירת החיפוש" : "שינוי"}</button>
        ${edit.key !== null ? '<button type="button" class="link" data-edit-skip>לא מוצר</button>' : ""}</div>
      ${edit.searching ? `<div class="fix-picker"><input type="search" class="fix-search" value="${esc(query)}" placeholder="חיפוש מוצר" enterkeyhint="search">
        <ul class="fix-results">${resultsHtml(r, "edit")}</ul></div>` : ""}
      <div class="line-qty"><label>כמות <input type="number" class="edit-qty" inputmode="decimal" min="0" step="${edit.unit === "kg" ? "0.005" : "1"}"
        value="${edit.qty}"></label>
        <select class="edit-unit"><option value="units"${edit.unit === "units" ? " selected" : ""}>אריזות</option>
          <option value="kg"${edit.unit === "kg" ? " selected" : ""}>ק״ג</option>
          <option value="pieces"${edit.unit === "pieces" ? " selected" : ""}>פריטים</option></select>
        ${edit.unit === "kg" ? '<span class="sub">50 גרם = 0.05</span>' : edit.unit === "pieces"
          ? '<span class="sub">מספר הפריטים (15 ביצים): המחיר לפריט בכל חנות</span>' : ""}</div>
      <div class="line-save"><button type="button" data-edit-save="${id}">שמירה</button>
        <button type="button" class="link" data-edit-cancel>ביטול</button></div></div>`;
  }

  // changes: {key: product key | null (no product)} to set the product, and/or {qty, weighed} for the amount
  async function saveFix(id, changes) {
    const [rid, idx] = id.split(":");
    const r = receipts.find((x) => x.id === rid), line = r && r.items[Number(idx)];
    if (!line) return;
    const path = `corrections/${rid}-${idx}.json`;
    const body = { receipt: rid, index: Number(idx), name: line.name, store_key: r.store_key || null,
                   ...changes, at: new Date().toISOString() };
    if ("key" in changes) body.key = changes.key || null;
    fixed.set(id, { key: "key" in changes ? changes.key : line.key, qty: changes.qty, weighed: changes.weighed,
                    pieces: "pieces" in changes ? changes.pieces || null : undefined });
    fixing = null;
    editing = null;
    draw();
    try {
      const old = await api(path);  // fixed twice before the PC took the first: replace it
      await put(path, G.encode(JSON.stringify(body)), "Receipt line fixed", old && old.sha);
    } catch (e) {
      fixed.delete(id);
      draw();
      alert("לא נשמר: " + (e.message || e));
    }
  }

  function draw() {
    if (!receipts.length) {
      out.innerHTML = '<p class="empty">עוד אין קבלות. צלמו קבלה כדי להתחיל.</p>';
      return;
    }
    out.innerHTML = receipts.map((r) => {
      const label = r.status === "done" ? `${esc(r.store || "קבלה")} · ${money(r.total || 0)}`
        : r.status === "pending" ? "ממתינה לקריאה…" : "הקריאה נכשלה";
      return `<div class="receipt-card${open === r.id ? " open" : ""}">
        <button type="button" class="receipt-head" data-open="${r.id}"><span>${when(r)}</span><span>${label}</span></button>
        ${open === r.id ? `<div class="receipt-body">${detailHtml(r)}
          <button type="button" class="link" data-delete="${r.id}">מחיקת הקבלה</button></div>` : ""}
      </div>`;
    }).join("");
  }

  out.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.open) {
      open = open === t.dataset.open ? null : t.dataset.open;
      draw();
    } else if (t.dataset.fixOpen) {
      if (fixing === t.dataset.fixOpen) fixing = null;
      else {
        fixing = t.dataset.fixOpen;
        const [rid, idx] = fixing.split(":");
        const r = receipts.find((x) => x.id === rid);
        query = r ? r.items[Number(idx)].name : "";
      }
      draw();
      const box = out.querySelector(".fix-search");
      if (box) box.focus();
    } else if (t.dataset.edit) {
      if (editing === t.dataset.edit) { editing = null; edit = null; }
      else {
        editing = t.dataset.edit;
        fixing = null;
        const [rid, idx] = editing.split(":");
        const r = receipts.find((x) => x.id === rid), i = r.items[Number(idx)], done = fixed.get(editing);
        const cur = done ? { key: done.key, qty: done.qty ?? i.qty, weighed: done.weighed ?? i.weighed,
                             pieces: done.pieces === undefined ? i.pieces : done.pieces } : i;
        edit = { key: cur.skip ? null : cur.key || "", unit: unitOf(cur), qty: cur.pieces || cur.qty || 1, searching: false };
        query = i.name;
      }
      draw();
    } else if ("editSearch" in t.dataset) {
      edit.searching = !edit.searching;
      draw();
      const box = out.querySelector(".line-editor .fix-search");
      if (box) box.focus();
    } else if (t.dataset.editPick) {
      edit.key = t.dataset.key;
      edit.searching = false;
      draw();
    } else if ("editSkip" in t.dataset) {
      edit.key = null;
      edit.searching = false;
      draw();
    } else if ("editCancel" in t.dataset) {
      editing = null;
      edit = null;
      draw();
    } else if (t.dataset.editSave) {
      const [rid, idx] = t.dataset.editSave.split(":");
      const r = receipts.find((x) => x.id === rid), i = r.items[Number(idx)];
      const qty = Number(String(edit.qty).replace(",", "."));
      if (!(qty > 0)) { alert("כמות לא תקינה"); return; }
      const changes = {};
      const was = i.skip ? null : i.key || "";
      if (edit.key !== was) changes.key = edit.key || null;
      if (edit.unit === "pieces") {
        if (qty !== Number(i.pieces || 0)) changes.pieces = qty;
      } else {
        if (i.pieces) changes.pieces = 0;  // back to packs / kg
        const weighed = edit.unit === "kg";
        if (qty !== Number(i.qty || 1) || weighed !== Boolean(i.weighed)) { changes.qty = qty; changes.weighed = weighed; }
      }
      if (!Object.keys(changes).length) { editing = null; edit = null; draw(); return; }
      await saveFix(t.dataset.editSave, changes);
    } else if (t.dataset.fixPick) {
      await saveFix(t.dataset.fixPick, { key: t.dataset.key });
    } else if (t.dataset.fixConfirm) {
      await saveFix(t.dataset.fixConfirm, { key: t.dataset.key });
    } else if (t.dataset.fixSkip) {
      await saveFix(t.dataset.fixSkip, { key: null });
    } else if (t.dataset.block) {
      L.block(t.dataset.block, t.dataset.other);
      draw();
    } else if (t.dataset.retry) {
      const r = receipts.find((x) => x.id === t.dataset.retry);
      const meta = { status: "pending", uploaded_at: r.uploaded_at };
      await put(`receipts/${r.id}.json`, G.encode(JSON.stringify(meta)), "Receipt to read again", r.sha);
      await refresh();
    } else if (t.dataset.delete) {
      if (!confirm("למחוק את הקבלה?")) return;
      await window.ReceiptUpload.remove(t.dataset.delete);
      await refresh();
    }
  });

  // typing in a line's product search redraws only its results (the box keeps the focus)
  out.addEventListener("input", (e) => {
    const t = e.target, line = fixing || editing;
    if (t.classList.contains("edit-qty") && edit) { edit.qty = t.value; return; }
    if (!t.classList.contains("fix-search") || !line) return;
    query = t.value;
    const r = receipts.find((x) => x.id === line.split(":")[0]);
    if (r) t.parentElement.querySelector(".fix-results").innerHTML = resultsHtml(r, fixing ? "fix" : "edit");
  });
  out.addEventListener("toggle", (e) => {  // remember an opened line list across redraws
    const id = e.target.dataset && e.target.dataset.lines;
    if (id) { if (e.target.open) linesOpen.add(id); else linesOpen.delete(id); }
  }, true);
  out.addEventListener("change", (e) => {
    if (!e.target.classList.contains("edit-unit") || !edit) return;
    edit.unit = e.target.value;
    draw();
  });

  document.addEventListener("visibilitychange", () => { if (!document.hidden && !fixing && !editing) reload(); });
  window.Receipts = { reload };  // lets the page be re-read on demand

  data = await load(build);
  C = window.Compare(data);
  await reload();
})();
