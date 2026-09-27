// Product details sheet, opened by the ⓘ button on barcoded products: photo, barcode, red warning labels,
// ingredients and nutrition. Photo: Rami Levy's, else Pricez's (m.pricez.co.il/ProductPictures/<barcode>.jpg:
// 1000 px, any chain, a clean 404 when it has none; the user's tip), else Shufersal's (collected by the PC,
// grocery/shufersal.py, in the shards), else Victory's, else a web search's (electrical products). Details: the shards (Rami Levy's, else Shufersal's), else Victory's online
// shop (victoryonline.co.il, which answers the phone directly). Ingredients and nutrition only
// for food (the button's data-food: info.wanted on the PC); anything else gets its photo only. Photos come from Rami Levy's online-shop image server by barcode; the
// details from data/info/<last two digits>.json (grocery/info.py), loaded only when needed.
// Loaded on every page.
(function () {
  const build = document.currentScript.src.split("v=")[1] || "";
  const photoUrl = (barcode) => `https://img.rami-levy.co.il/product/${barcode}/large.jpg`;
  const pricezUrl = (barcode) => `https://m.pricez.co.il/ProductPictures/${barcode}.jpg`;
  // Rami Levy's image server sometimes hangs on a barcode it has no photo for instead of answering 404, so
  // an image not loaded within this long counts as missing and the next source is tried
  const PHOTO_WAIT_MS = 4000;
  // each image counts its attempts: a timer (or an error) only moves on from the attempt it belongs to, so a
  // slow answer (Victory's shop on a phone) can't be overtaken by an older attempt's timer
  function setSrc(img, src, next) {
    const attempt = (img._attempt = (img._attempt || 0) + 1);
    img.hidden = false;
    img.onerror = () => { if (img._attempt === attempt) next(); };
    img.src = src;
    setTimeout(() => { if (img._attempt === attempt && !(img.complete && img.naturalWidth)) next(); }, PHOTO_WAIT_MS);
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const shards = new Map();
  // Victory's shop answers the published site (github.io) with a refusal, so the PC fetches its photos and
  // details (grocery/victory.py) and publishes them in the shards: entry[7] the photo, entry[0..2] the
  // details with source "v"
  const fromVictory = async (barcode) => { const e = (await shard(barcode))[barcode]; return e && e[7] ? { img: e[7] } : null; };
  let box = null;

  function shard(barcode) {
    const key = barcode.slice(-2);
    if (!shards.has(key)) {
      shards.set(key, fetch(`data/info/${key}.json?v=${build}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
    }
    return shards.get(key);
  }

  // Additives: E-numbers and the Hebrew words labels use for them. Longest first, so
  // "חומרי טעם וריח" wins over "טעם".
  const ADDITIVE_WORDS = ["חומרי טעם וריח", "חומר טעם וריח", "חומרים משמרים", "חומר משמר", "ממתיק מלאכותי",
    "מונוסודיום גלוטמט", "מווסתי חומציות", "מווסת חומציות", "נוגדי חמצון", "נוגד חמצון", "נוגד התגבשות",
    "חומרי תפיחה", "חומר תפיחה", "משפרי טעם", "משפר טעם", "מעצים טעם", "צבעי מאכל", "צבע מאכל",
    "סירופ גלוקוזה", "סירופ תירס", "שמן מוקשה", "שומן מוקשה", "סודיום בנזואט", "נתרן בנזואט", "אשלגן סורבט",
    "מלטודקסטרין", "מתחלבים", "מתחלב", "מייצבים", "מייצב", "מסמיכים", "מסמיך", "ממתיקים", "ממתיק",
    "אספרטם", "סוכרלוז", "אצסולפם", "סכרין", "ציקלמט", "ניטריט", "ניטרט", "קרגינן", "גלוטמט", "שמן דקלים"];
  const ADDITIVES = new RegExp(`(\\b[EΕ]\\s?-?\\d{3,4}[a-z]?\\b|${ADDITIVE_WORDS.join("|")})`, "gi");

  // ingredients with additives marked, and how many different ones there are
  function markAdditives(text) {
    const found = new Set();
    const html = esc(text).replace(ADDITIVES, (m) => {
      found.add(m.replace(/[\s-]/g, "").toUpperCase());
      const ltr = /\d/.test(m) ? ' dir="ltr"' : "";  // keep "E-450" in order inside Hebrew text
      return `<mark class="additive"${ltr}>${m}</mark>`;
    });
    return { html, count: found.size };
  }

  function close() { if (box) box.hidden = true; }

  // The department, at the bottom of the sheet (the user: change it here when it's wrong). Loaded on "שינוי
  // מחלקה" only (products.json is big): the current one and a list of all; a choice goes to the private list
  // repo as review/<key>.json (the list's GitHub key), and the PC saves it as a manual category and
  // republishes (grocery/review.py), like review.html.
  let catalog = null;
  const loadCatalog = () => (catalog = catalog || fetch(`data/products.json?v=${build}`).then((r) => r.json())
    .then((d) => ({ cats: d.categories, byKey: new Map(d.products.map((p) => [p[1], p[0]])) })));
  async function saveCategory(key, path) {
    const G = window.Basket.github, file = `review/${key.replace(/:/g, "_")}.json`;
    const get = await fetch(G.url(file), { headers: G.headers(), cache: "no-store" });
    const sha = get.ok ? (await get.json()).sha : undefined;
    const r = await fetch(G.url(file), { method: "PUT", headers: G.headers(), body: JSON.stringify({
      message: "Department decision", content: G.encode(JSON.stringify({ key, category: path, at: new Date().toISOString() })),
      ...(sha ? { sha } : {}) }) });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
  }
  async function showCategory(el, key) {
    if (!window.Basket || !window.Basket.configured()) {
      el.innerHTML = '<span class="sub">כדי לשנות מחלקה צריך לחבר את הרשימה ל־GitHub: <a href="settings.html">הגדרות</a>.</span>';
      return;
    }
    el.innerHTML = '<span class="sub">טוען…</span>';
    const { cats, byKey } = await loadCatalog();
    const i = byKey.get(key), now = cats[i];
    const pathOf = (c) => `${c.top} > ${c.leaf}`;
    const idle = `<div class="sub">המחלקה עכשיו: <b>${now ? `${esc(now.top)} › ${esc(now.leaf)}` : "לא ידועה"}</b></div>
      <button type="button" class="link" data-pick-cat>בחירת מחלקה אחרת</button>`;
    // the chooser (static/catpick.js): departments, then a department's subcategories, with a search box
    const choose = async () => {
      const path = await window.CatPick.open(cats.map(pathOf), now ? pathOf(now) : null);
      if (!path) return;
      el.innerHTML = '<span class="sub">שומר…</span>';
      try {
        await saveCategory(key, path);
        el.innerHTML = `<span class="sub">נשמר: ${esc(path.replace(" > ", " › "))}. המחשב בבית יעדכן את האתר תוך כמה דקות.</span>`;
      } catch (err) {
        el.innerHTML = `<span class="warn">השמירה נכשלה (${esc(err.message)})</span>`;
      }
    };
    el.innerHTML = idle;
    el.querySelector("[data-pick-cat]").addEventListener("click", choose);
    choose();
  }

  // ---- price history (the user, 2026-10-01): every store's shelf price since tracking began, in one chart ----
  // data/history/<last 2 characters of the key>.json (publish.write_history): {since, items: {key: [[store index,
  // price before, [[YYYYMMDD, new price], ...]]]}}; a product that isn't there didn't change.
  const histories = new Map();
  const history = (key) => {
    const k = key.slice(-2);
    if (!histories.has(k)) histories.set(k, fetch(`data/history/${k}.json?v=${build}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    return histories.get(k);
  };
  const dayOf = (d) => new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
  const shortDate = (d) => `${+d.slice(6, 8)}.${+d.slice(4, 6)}`;
  const money = (n) => "₪" + n.toFixed(2);
  async function drawHistory(el, key) {
    const h = await history(key);
    const since = (h && h.since) || "20260927";
    const series = h && h.items && h.items[key];
    const stores = (window.Stores && window.Stores.list) || [];
    if (!series || !series.length) {
      el.innerHTML = `<div class="ph-title">היסטוריית מחיר</div><p class="sub">המחיר לא השתנה מאז ${shortDate(since)} (מאז שמתחילים לעקוב).</p>`;
      return;
    }
    // x: days from `since` to today; y: the prices' range; a step line per store, in its colour
    const start = dayOf(since), today = new Date(), span = Math.max(1, (today - start) / 864e5);
    const all = series.flatMap(([, old, steps]) => [old, ...steps.map((s) => s[1])]);
    let lo = Math.min(...all), hi = Math.max(...all);
    if (hi - lo < 0.01) { lo -= 1; hi += 1; }
    const W = 300, H = 110, L = 44, R = 8, T = 8, B = 18;
    const x = (d) => L + ((d - start) / 864e5 / span) * (W - L - R);
    const y = (p) => T + (1 - (p - lo) / (hi - lo)) * (H - T - B);
    // a second line in the same colour (Osher Ad's two branches) is dashed
    const dashed = (s) => series.some(([t]) => t < s && stores[t] && stores[s] && stores[t].short === stores[s].short);
    const lines = series.map(([s, old, steps]) => {
      let pts = `${x(start).toFixed(1)},${y(old).toFixed(1)}`, last = old;
      for (const [d, p] of steps) {
        const xd = x(dayOf(d)).toFixed(1);
        pts += ` ${xd},${y(last).toFixed(1)} ${xd},${y(p).toFixed(1)}`;
        last = p;
      }
      pts += ` ${x(today).toFixed(1)},${y(last).toFixed(1)}`;
      return `<polyline class="st-${s}${dashed(s) ? " dashed" : ""}" points="${pts}" />`;
    }).join("");
    // drawn left to right in time, whatever the page's direction (RTL flipped the labels' anchors)
    const svg = `<svg class="ph-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="גרף מחיר" style="direction: ltr">
      <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="ph-axis" />
      <text x="${L - 4}" y="${y(hi) + 4}" class="ph-label" text-anchor="end">${money(hi)}</text>
      <text x="${L - 4}" y="${y(lo) + 4}" class="ph-label" text-anchor="end">${money(lo)}</text>
      <text x="${L}" y="${H - 4}" class="ph-label" text-anchor="start">${shortDate(since)}</text>
      <text x="${W - R}" y="${H - 4}" class="ph-label" text-anchor="end">היום</text>${lines}</svg>`;
    // a store's short name, or its full one when two lines share it (Osher Ad's two branches)
    const shared = (s) => series.filter(([t]) => stores[t] && stores[s] && stores[t].short === stores[s].short).length > 1;
    const rows = series.map(([s, old, steps]) => {
      const st = stores[s], name = st ? (shared(s) ? st.name : st.short) : "";
      const sample = `<svg class="ph-key" viewBox="0 0 20 6"><line x1="0" y1="3" x2="20" y2="3"${dashed(s) ? ' class="dashed"' : ""} /></svg>`;
      return `<li class="st-${s}">${sample}<span class="store-tag">${esc(name)}</span> ${money(old)} ${steps.map(([d, p]) =>
        `→ <b>${money(p)}</b> <small>(${shortDate(d)})</small>`).join(" ")}</li>`;
    }).join("");
    el.innerHTML = `<div class="ph-title">היסטוריית מחיר</div>${svg}<ul class="ph-list">${rows}</ul>
      <p class="sub">מחיר המדף מאז ${shortDate(since)}${series.length < stores.length ? "; בשאר החנויות לא השתנה" : ""}.</p>`;
  }

  // Electrical products (the user, 2026-10-02: in the ⓘ sheet, not on every row): a Google and a Zap search for the name
  const webCompare = (name) => {
    const q = encodeURIComponent(name || "");
    return `<div class="web-compare">השוואה ברשת: <a href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">Google</a>
      · <a href="https://www.zap.co.il/search.aspx?keyword=${q}" target="_blank" rel="noopener">זאפ</a></div>`;
  };

  // "סקירת AI" for electrical products (the user, 2026-10-03): the phone asks Gemini itself (Google allows calls
  // from a web page), free, WITHOUT web search (a new key's free tier has no Google Search quota; the user chose
  // this over paying), so it answers from what it knows and is told to say so when it doesn't know the model.
  // The key: config/gemini-key.json in the private list repository (pasted once in settings, read by both phones
  // with the list's GitHub key, kept in memory only). The review is saved as reviews/<key>.json {status: "done",
  // review, model, at}, so the other phone sees it without asking again.
  const reviewPath = (key) => `reviews/${String(key).replace(/:/g, "_")}.json`;
  const GEMINI = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];  // the second when the first is busy (503 / 429)
  async function repoGet(path) {
    const G = window.Basket.github;
    const r = await fetch(G.url(path), { headers: G.headers(), cache: "no-store" });
    if (r.status === 404) return { data: null, sha: null };
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const j = await r.json();
    return { data: JSON.parse(G.decode(j.content)), sha: j.sha };
  }
  async function repoPut(path, data, sha, message) {
    const G = window.Basket.github;
    const body = { message, content: G.encode(JSON.stringify(data)), ...(sha ? { sha } : {}) };
    const r = await fetch(G.url(path), { method: "PUT", headers: G.headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
  }
  let geminiKey = null;
  const PROMPT = (name, barcode) => `מוצר חשמלי שנמכר בסופרמרקט בישראל:
שם: ${name}
ברקוד: ${barcode || "אין"}

כתוב סקירה קצרה בעברית לפי מה שאתה יודע על הדגם הזה (אין לך חיפוש ברשת). אל תמציא: אם אינך מכיר את הדגם המדויק
או את המותג, קבע known=false, ובסיכום כתוב רק מה סוג המוצר ומה כדאי לבדוק לפני שקונים מוצר כזה. ציון רק אם אתה
באמת מכיר ביקורות על הדגם.`;
  const SCHEMA = {
    type: "OBJECT",
    properties: {
      known: { type: "BOOLEAN" }, model: { type: "STRING", nullable: true }, rating: { type: "NUMBER", nullable: true },
      summary: { type: "STRING" }, pros: { type: "ARRAY", items: { type: "STRING" } }, cons: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["known", "summary", "pros", "cons"],
  };
  async function askGemini(name, barcode) {
    let last = "";
    for (const model of GEMINI) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT(name, barcode) }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA } }),
      });
      if (r.status === 503 || r.status === 429) { last = r.status === 429 ? "limit" : "busy"; continue; }
      if (!r.ok) throw new Error(r.status === 400 || r.status === 403 ? "key" : `Gemini ${r.status}`);
      const d = await r.json();
      const text = ((d.candidates || [])[0]?.content?.parts || []).map((x) => x.text || "").join("");
      const v = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const rating = Number(v.rating);
      return { review: { known: Boolean(v.known), model: v.model || null, rating: rating > 0 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
        summary: String(v.summary || "").slice(0, 600), pros: (v.pros || []).slice(0, 4).map(String), cons: (v.cons || []).slice(0, 4).map(String) }, model };
    }
    throw new Error(last || "busy");
  }
  const ERRORS = {
    nokey: "צריך מפתח Gemini פעם אחת: הגדרות ← סקירות AI למוצרי חשמל.",
    key: "מפתח Gemini לא התקבל. אפשר להדביק מפתח חדש בהגדרות ← סקירות AI.",
    limit: "הגענו למכסה החינמית של Gemini. אפשר לנסות שוב מאוחר יותר.",
    busy: "Gemini עמוס כרגע. נסו שוב בעוד דקה.",
  };
  function reviewHtml(d) {
    const v = d.review || {};
    const when = d.at ? new Date(d.at).toLocaleDateString("he-IL") : "";
    const list = (xs, cls) => (xs && xs.length ? `<ul class="${cls}">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
    return `${v.known === false ? '<p class="sub">Gemini לא מכיר את הדגם הזה מקרוב, אז זו הערכה כללית:</p>' : ""}
      ${v.rating ? `<div class="ai-rating">★ ${esc(v.rating)}/5</div>` : ""}
      ${v.model ? `<div class="sub">${esc(v.model)}</div>` : ""}
      <p>${esc(v.summary || "")}</p>${list(v.pros, "ai-pros")}${list(v.cons, "ai-cons")}
      <p class="ai-meta">Gemini, לפי הידע שלו (בלי חיפוש ברשת) · ${esc(when)}</p>`;
  }
  async function showReview(el, key, name, barcode) {
    if (!el) return;
    if (!window.Basket || !window.Basket.configured()) {
      el.innerHTML = '<p class="sub">סקירת AI זמינה אחרי חיבור הרשימה (הגדרות ← סנכרון).</p>';
      return;
    }
    let sha = null;
    const button = (label, note) => `${note ? `<p class="sub">${esc(note)}</p>` : ""}<button type="button" class="link" data-ai-ask>${label}</button>`;
    const bind = () => {
      const b = el.querySelector("[data-ai-ask]");
      if (b) b.addEventListener("click", ask);
    };
    async function ask() {
      el.innerHTML = '<p class="sub">✨ כותב סקירה… (כ־10 שניות)</p>';
      try {
        if (!geminiKey) geminiKey = ((await repoGet("config/gemini-key.json")).data || {}).key || null;
        if (!geminiKey) throw new Error("nokey");
        const { review, model } = await askGemini(name, barcode);
        const d = { key, name, status: "done", review, model, at: new Date().toISOString() };
        el.innerHTML = `<div class="ai-title">✨ סקירת AI</div>${reviewHtml(d)}`;
        repoPut(reviewPath(key), d, sha, "AI review").catch(() => {});  // shared with the other phone; shown anyway
      } catch (e) {
        if (e.message === "key") geminiKey = null;
        el.innerHTML = button("לנסות שוב", ERRORS[e.message] || "הסקירה נכשלה: " + e.message);
        bind();
      }
    }
    el.innerHTML = '<p class="sub">טוען סקירה…</p>';
    try {
      const got = await repoGet(reviewPath(key));
      sha = got.sha;
      if (got.data && got.data.status === "done" && got.data.review && "known" in got.data.review) {
        el.innerHTML = `<div class="ai-title">✨ סקירת AI</div>${reviewHtml(got.data)}`;
        return;
      }
    } catch (e) { /* not saved yet, or offline: offer it anyway */ }
    el.innerHTML = button("✨ סקירת AI (חינם)");
    bind();
  }
  async function open(barcode, name, food, victoryFirst, key, elec) {
    if (!box) {
      box = document.createElement("div");
      box.className = "photo-box";
      box.addEventListener("click", (e) => { if (e.target === box || e.target.closest(".photo-close")) close(); });
      document.body.appendChild(box);
    }
    box.innerHTML = `<div class="photo-card" role="dialog" aria-label="${esc(name || "")}">
      <button type="button" class="photo-close" aria-label="סגירה">✕</button>
      <img alt="" referrerpolicy="no-referrer"><div class="photo-missing" hidden>אין תמונה למוצר הזה</div>
      <div class="photo-name">${esc(name || "")}</div>
      ${barcode ? `<div class="photo-barcode">ברקוד <span dir="ltr">${esc(barcode)}</span></div>` : ""}
      ${elec ? webCompare(name) : ""}
      ${elec && key ? '<div class="ai-review"></div>' : ""}
      <div class="info-body"><p class="sub">טוען…</p></div>
      ${key ? '<div class="price-history"></div>' : ""}
      ${key ? '<div class="photo-cat"><button type="button" class="link" data-change-cat>המחלקה לא נכונה? שינוי מחלקה</button></div>' : ""}</div>`;
    if (key) drawHistory(box.querySelector(".price-history"), key);
    if (elec && key) showReview(box.querySelector(".ai-review"), key, name, barcode);
    if (key) box.querySelector("[data-change-cat]").addEventListener("click", (e) => showCategory(e.target.parentNode, key));
    const img = box.querySelector("img");
    // Photo sources in order: Rami Levy, Pricez, Shufersal (the shards), Victory, a web search; a Victory
    // product (its own code, or sold only there) asks Victory's shop first (the user: it has their photos)
    const sources = {
      r: async () => photoUrl(barcode),
      p: async () => pricezUrl(barcode),
      s: async () => { const e = (await shard(barcode))[barcode]; return e && e[3]; },
      v: async () => { const v = await fromVictory(barcode); return v && v.img; },
    };
    const order = victoryFirst ? ["v", "r", "p", "s"] : ["r", "p", "s", "v"];
    const tried = new Set();
    const next = async () => {
      img._attempt = (img._attempt || 0) + 1;  // while looking, no older attempt may move on
      for (const k of order) {
        if (tried.has(k)) continue;
        tried.add(k);
        const src = await sources[k]();
        if (src) { setSrc(img, src, next); return; }
      }
      const web = await webPhoto(barcode, tried);
      if (web) { setSrc(img, web, next); return; }
      img.hidden = true;
      box.querySelector(".photo-missing").hidden = false;
    };
    if (barcode) next();
    else {  // no barcode: only a web photo saved under the product's own key (fresh fruit and vegetables)
      const web = key ? await webPhoto(key, tried) : null;
      const none = () => { img.hidden = true; box.querySelector(".photo-missing").hidden = false; };
      if (web) setSrc(img, web, none); else none();
    }
    box.hidden = false;

    const body = box.querySelector(".info-body");
    if (!food || !barcode) { body.innerHTML = ""; return; }  // not food: the photo only; no barcode: nothing to look up
    const entry = (await shard(barcode))[barcode];
    let info = entry && (entry[0] || entry[1].length) ? entry : null;
    const source = !info ? "" : info[4] === "s" ? "המידע מאתר שופרסל" : info[4] === "v" ? "המידע מאתר ויקטורי" : "";
    if (!box.querySelector(".info-body")) return;  // closed and reopened meanwhile
    if (!info) {
      body.innerHTML = '<p class="sub">אין מידע על רכיבים וערכים תזונתיים למוצר הזה.</p>';
      return;
    }
    const [ingredients, nutrition, red] = info;
    const marked = markAdditives(ingredients || "");
    const additives = ingredients
      ? `<span class="${marked.count ? "additive-count" : "additive-none"}">${marked.count ? (marked.count === 1 ? "תוסף אחד" : `${marked.count} תוספים`) : "ללא תוספים מזוהים"}</span>` : "";
    body.innerHTML =
      `<div class="red-labels">${red.map((r) => `<span class="red-label">${esc(r)}</span>`).join("")}${additives}</div>` +
      (ingredients ? `<h3>רכיבים</h3><p class="ingredients">${marked.html}</p>` : "") +
      (nutrition.length ? `<h3>ערכים תזונתיים ל־100 גרם / מ״ל</h3><table class="nutrition">${nutrition
        .map(([label, value]) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`).join("")}</table>` : "") +
      (source ? `<p class="sub">${source}</p>` : "");
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-photo]");
    if (!btn) return;
    e.preventDefault();
    open(btn.dataset.photo, btn.dataset.name, btn.dataset.food === "1", btn.dataset.first === "v", btn.dataset.key,
         btn.dataset.elec === "1");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  // the button for a product key; only barcodes have photos and details; food: show ingredients too
  // A small photo for a list or table (the compare): Rami Levy's, else Shufersal's, else Victory's, else
  // nothing (the button goes); a tap opens the sheet.
  // The last resort (electrical products only, grocery/webimages.py): the first Google image, then
  // Google's thumbnail of it when the image's own site refuses it.
  async function webPhoto(barcode, tried) {
    const entry = (await shard(barcode))[barcode];
    for (const [k, i] of [["w", 5], ["t", 6]]) {
      if (tried.has(k)) continue;
      tried.add(k);
      if (entry && entry[i]) return entry[i];
    }
    return null;
  }
  async function thumbFallback(img) {  // each failed image tries the next source: Pricez, Shufersal, Victory, web
    if (img._looking) return;  // one lookup at a time (an error and a timer can both call)
    img._looking = true;
    img._attempt = (img._attempt || 0) + 1;
    img.dataset.tried = img.dataset.tried || "r";  // the on-screen watcher leaves it alone from now on
    const key = img.dataset.key, tried = new Set((img.dataset.tried || "").split(",").filter(Boolean));
    let src = null;
    if (!tried.has("p")) { tried.add("p"); src = pricezUrl(key); }
    if (!src && !tried.has("s")) {
      tried.add("s");
      const entry = (await shard(key))[key];
      if (entry && entry[3]) src = entry[3];
    }
    if (!src && !tried.has("v")) {
      tried.add("v");
      const v = await fromVictory(key);
      if (v && v.img) src = v.img;
    }
    if (!src) src = await webPhoto(key, tried);
    img.dataset.tried = [...tried].join(",");
    img._looking = false;
    if (src) setSrc(img, src, () => thumbFallback(img));
    else if (img.closest("button")) img.closest("button").remove();
  }
  // thumbnails start at Rami Levy from their HTML: one on screen that hasn't loaded after PHOTO_WAIT_MS moves on
  // too (the next sources then have setSrc's own wait)
  setInterval(() => {
    for (const img of document.querySelectorAll(".photo-thumb img:not([data-tried])")) {
      if (img.complete && img.naturalWidth) continue;
      const r = img.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;  // not on screen (lazy): not asked for yet
      if (!img.dataset.seen) { img.dataset.seen = Date.now(); continue; }
      if (Date.now() - img.dataset.seen > PHOTO_WAIT_MS) thumbFallback(img);
    }
  }, 1000);
  // The barcode to look a product up by: its key, or a chain's "internal" code that is really a 12-13 digit
  // barcode (Victory files its Ninja appliances as its own items under their UPC: "7290696200003:622356270373")
  const codeOf = (key) => { const m = /^(?:\d+:)?(\d{12,13})$/.exec(key) || /^(\d{12,})$/.exec(key); return m ? m[1] : null; };
  // Victory first: Victory's own code (its chain id before the colon), or the caller says only Victory sells it
  const VICTORY_CHAIN = "7290696200003:";
  const attrs = (key, name, escape, food, victory, elec) => `data-photo="${codeOf(key) || ""}" data-key="${escape(key)}" data-name="${escape(name)}"${food ? ' data-food="1"' : ""}${
    victory || String(key).startsWith(VICTORY_CHAIN) ? ' data-first="v"' : ""}${elec ? ' data-elec="1"' : ""}`;

  window.Photo = {
    codeOf,
    // on every product (the user, 2026-10-07: the department is changed from the sheet), also one without a barcode
    // (no photo then); elec: an electrical product, whose sheet compares it on the web
    button: (key, name, escape, food, victory, elec) => (key
      ? `<button type="button" class="photo-btn" ${attrs(key, name, escape, food, victory, elec)} aria-label="פרטי המוצר">ⓘ</button>` : ""),
    thumb: (key, name, escape, food) => (codeOf(key)
      ? `<button type="button" class="photo-thumb" ${attrs(key, name, escape, food)} aria-label="תמונת המוצר"><img alt="" loading="lazy"
          referrerpolicy="no-referrer" data-key="${codeOf(key)}" src="${photoUrl(codeOf(key))}" onerror="Photo.fallback(this)"></button>` : ""),
    // a quiet grey photo icon for a product among others (a store's own product in the compare)
    mini: (key, name, escape, food) => (codeOf(key)
      ? `<button type="button" class="photo-mini" ${attrs(key, name, escape, food)} aria-label="תמונת ${escape(name)}" title="תמונה">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg></button>` : ""),
    fallback: thumbFallback,
  };
})();
