// Barcode scanning: the rear camera plus Chrome's built-in BarcodeDetector (Android), or typing the
// digits. A scanned product shows its price at every store; a store that doesn't sell it shows its
// cheapest same product in the same subcategory, like the compare. Data layout: static/render.js.
(async function () {
  const { esc, money, load, sameKind } = window.Render;
  const build = document.currentScript.dataset.build;
  const video = document.getElementById("video");
  const status = document.getElementById("scan-status");
  const out = document.getElementById("scan-result");
  const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
  const SCAN_EVERY_MS = 250;

  const data = await load(build);
  const byCat = new Map();
  for (const it of data.items) {  // cheapest first within each category
    if (!byCat.has(it.cat)) byCat.set(it.cat, []);
    byCat.get(it.cat).push(it);
  }

  // A UPC-A barcode scans as EAN-13 with a leading 0, and some chains store it either way.
  function find(code) {
    const digits = code.replace(/\D/g, "");
    for (const v of [digits, digits.replace(/^0+/, ""), "0" + digits]) {
      if (data.byKey.has(v)) return data.byKey.get(v);
    }
    return null;
  }

  // cheapest same product at store s in the same subcategory, per kg / liter when both have a size
  function equivalentAt(it, s) {
    const unit = it.best.base_unit !== "unit" ? it.best.unit_price : null;
    for (const c of byCat.get(it.cat) || []) {  // cheapest first
      const o = c.offers[s];
      if (!o || c.key === it.key || !sameKind(it, c)) continue;
      if (unit !== null && (o.unit_price === null || o.base_unit !== it.best.base_unit)) continue;
      return { it: c, o };
    }
    return null;
  }

  const priceText = (o) => (o.unit_price !== null ? `${money(o.unit_price)} ${o.unit_label}` : "");

  function card(it, code) {
    // what you'd pay, with the user's payment card where it applies (Victory 7%)
    const present = it.offers.map((o, s) => o && { o, s, pay: o.price * (1 - data.stores[s].card_rate) }).filter(Boolean);
    const cheapest = present.reduce((a, b) => (b.pay < a.pay ? b : a));
    let rows = "";
    data.stores.forEach((st, s) => {
      const o = it.offers[s];
      if (!st.on && !o) return;  // a store that is off shows only when it's the one selling this
      if (o) {
        const was = o.shelf !== null ? `<s>${money(o.shelf)}</s> ` : "";
        const card = st.card_rate ? `<div class="sub">עם הכרטיס: ${money(o.price * (1 - st.card_rate))}</div>` : "";
        rows += `<div class="scan-store st-${s}${present.length > 1 && s === cheapest.s ? " cheapest" : ""}">
          <div class="store-name">${esc(st.short)}${window.Render.branchNote(o) ? ` <small>${window.Render.branchNote(o)}</small>` : ""}</div>
          <div class="amount">${was}${money(o.price)}</div>
          <div class="sub">${esc(o.size || "")} ${priceText(o)}</div>
          ${o.deal ? `<div class="deal"><span class="badge">${esc(o.deal)}</span> ${esc(o.deal_conditions)}</div>` : ""}
          ${o.club_note ? `<div class="club">${esc(o.club_note)}</div>` : ""}${card}</div>`;
      } else {
        const eq = equivalentAt(it, s);
        rows += `<div class="scan-store st-${s} missing"><div class="store-name">${esc(st.short)}</div>
          <div class="sub">לא נמכר כאן</div>
          ${eq ? `<div class="sub">דומה: ${esc(eq.it.name)}<br>${money(eq.o.price)} · ${esc(eq.o.size || "")} ${priceText(eq.o)}</div>` : ""}</div>`;
      }
    });
    const verdict = present.length > 1
      ? (() => {
          const other = present.filter((p) => p !== cheapest).reduce((a, b) => (b.pay < a.pay ? b : a));
          const diff = other.pay - cheapest.pay;
          const withCard = data.stores[cheapest.s].card_rate || data.stores[other.s].card_rate ? " (כולל הנחת הכרטיס)" : "";
          return diff > 0.005 ? `זול יותר ב${esc(data.stores[cheapest.s].short)} ב־${money(diff)}${withCard}`
            : `אותו מחיר ${present.length === 2 ? "בשתי החנויות" : "בכל החנויות"}`;
        })()
      : `נמכר רק ב${esc(data.stores[cheapest.s].short)}`;
    return `<div class="scan-card">
      <div class="name">${esc(it.name)} ${window.Photo.button(it.key, it.name, esc, it.food)}</div>
      <div class="meta"><span>${esc(it.maker)}</span><span dir="ltr">${esc(code)}</span></div>
      <div class="scan-verdict">${verdict}</div>
      <div class="scan-stores">${rows}</div>
      <button class="add scan-add" type="button" data-add="${esc(it.key)}" data-name="${esc(it.name)}" aria-label="הוספה לרשימה">+</button>
    </div>`;
  }

  let lastCode = null, lastAt = 0;
  function show(code) {
    if (code === lastCode && Date.now() - lastAt < 3000) return;  // the same barcode keeps being seen
    lastCode = code;
    lastAt = Date.now();
    if (navigator.vibrate) navigator.vibrate(80);
    const it = find(code);
    out.innerHTML = it ? card(it, code)
      : `<div class="scan-card"><div class="name" dir="ltr">${esc(code)}</div>
          <p class="sub">הברקוד לא נמצא במחירון. אולי המוצר לא נמכר באף אחת מהחנויות, או שזו מדבקת משקל של החנות.</p></div>`;
    window.Basket.update();
  }

  document.getElementById("manual").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = e.target.code.value.trim();
    if (code) { lastCode = null; show(code); }
  });

  // ---- camera ----
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices) {
    status.textContent = "הדפדפן הזה לא יודע לסרוק. בכרום באנדרואיד זה עובד; כאן אפשר להקליד את מספר הברקוד.";
    document.getElementById("scanner").hidden = true;
    return;
  }
  const supported = await BarcodeDetector.getSupportedFormats();
  const detector = new BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
  let stream = null, timer = null;

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    } catch (e) {
      status.textContent = "אין גישה למצלמה. אפשר לאשר אותה בהגדרות האתר בכרום, או להקליד את מספר הברקוד.";
      return;
    }
    video.srcObject = stream;
    await video.play();
    status.textContent = "כוונו את המצלמה לברקוד";
    timer = setInterval(async () => {
      if (video.readyState < 2) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) show(codes[0].rawValue);
      } catch (e) { /* a frame that couldn't be read */ }
    }, SCAN_EVERY_MS);
  }

  function stop() {
    clearInterval(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  // don't keep the camera on in the background
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  window.addEventListener("pagehide", stop);
  start();
})();
