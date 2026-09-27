// Shared by search and the basket: decoding data/products.json, drawing product rows (mirrors
// templates/_products.html), and the pricing rules the basket and compare use.
// products.json row: [category index, product key, name, manufacturer, offers], where offers has one
// entry per store (data.stores order): null, or the data.offer_fields values in order.
// Stores the user turned off (static/stores.js) are dropped here: their offers become null, so every
// page only sees the stores that are on (data.stores[i].on). Store indices stay as in products.json
// (the .st-<index> colors). A product sold only at stores that are off keeps its offers but is left
// out of data.items (browsing, search, swaps); data.byKey still finds it for the list and receipts.
// Branches of one chain (stores with the same short name: Osher Ad's two) are shown as one store, at
// the first branch that's on: a product's offer there is the cheaper branch's, with `branch` ("תלפיות")
// when only one of the branches that are on has it; the other branches count as off.
(function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (n) => "₪" + n.toFixed(2);

  // Cheapest per kg / liter first, then per-unit items, then unknown sizes by price (publish.sort_key).
  function cheaper(a, b) {
    const x = a.best, y = b.best;
    return (x.unit_price === null) - (y.unit_price === null) ||
      (x.base_unit === "unit") - (y.base_unit === "unit") ||
      (x.unit_price || 0) - (y.unit_price || 0) || x.price - y.price;
  }

  function load(build) {
    return fetch("data/products.json?v=" + build).then((r) => r.json()).then((data) => {
      const F = data.offer_fields;
      const choice = window.Stores ? window.Stores.choice() : {};
      const stores = data.stores.map((st) => ({ ...st, on: choice[st.key] !== false }));
      stores.forEach((st) => { st.chain = stores.filter((x) => x.short === st.short).map((x) => x.key); });
      const groups = new Map();  // short name -> indices of its branches that are on
      stores.forEach((st, i) => { if (st.on) groups.set(st.short, [...(groups.get(st.short) || []), i]); });
      const merged = [...groups.values()].filter((g) => g.length > 1);
      for (const g of merged) {
        stores[g[0]].branches = g.map((i) => stores[i].key);
        for (const i of g.slice(1)) { stores[i].on = false; stores[i].mergedInto = g[0]; }
      }
      const branchOf = (i) => stores[i].name.replace(stores[i].short, "").trim();
      const bestOf = (present) => present.reduce((a, b) => (b.price < a.price ? b : a));
      const toOffer = (o, s) => {
        if (!o) return null;
        const x = { store: s };
        F.forEach((f, i) => { x[f] = o[i]; });
        return x;
      };
      const all = data.products.map(([cat, key, name, maker, offers, processed]) => {
        let list = offers.map((o, i) => (stores[i].on ? toOffer(o, i) : null));
        for (const g of merged) {  // one chain's branches: the cheaper one's offer, at the first branch
          const have = g.map((i) => { const x = toOffer(offers[i], g[0]); if (x) x.at = branchOf(i); return x; }).filter(Boolean);
          const pick = have.length ? bestOf(have) : null;
          if (pick && have.length < g.length) pick.branch = pick.at;  // only this branch has it
          else if (pick) {  // both have it: the other branch's price when it differs (12% of them, 2026-10-01)
            const alt = have.find((x) => x !== pick && Math.abs(x.price - pick.price) >= 0.005);
            if (alt) pick.alt = { at: alt.at, price: alt.price };
          }
          list[g[0]] = pick;
        }
        const hidden = !list.some(Boolean);
        if (hidden) list = offers.map((o, i) => toOffer(o, i));  // only at stores that are off
        const present = list.filter(Boolean), best = bestOf(present);
        return { cat, key, name, maker, offers: list, best, others: present.filter((o) => o !== best), hidden,
                 food: !!(data.categories[cat] && data.categories[cat].food), processed: !!processed };
      });
      // category order, then cheapest first among the stores that are on
      const items = all.filter((it) => !it.hidden).sort((a, b) => a.cat - b.cat || cheaper(a, b));
      FRESH_CATS = new Set(data.categories.map((c, i) => (/טרי/.test(c.leaf) ? i : -1)).filter((i) => i >= 0));
      ELECTRIC_CATS = new Set(data.categories.map((c, i) => (c.leaf === ELECTRIC_LEAF ? i : -1)).filter((i) => i >= 0));
      return { stores, categories: data.categories, items,
               byKey: new Map(all.map((it) => [it.key, it])) };
    });
  }

  // Electrical products (the user, 2026-10-02): "השוואה ברשת" opens a Google search and a Zap (zap.co.il, the Israeli
  // comparison site) search for the product's name, in a new tab. Keep in sync with _products.html.
  const ELECTRIC_LEAF = "מוצרי חשמל";
  function webCompareHtml(name) {
    const q = encodeURIComponent(name);
    return `<div class="web-compare">השוואה ברשת: <a href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">Google</a>
      · <a href="https://www.zap.co.il/search.aspx?keyword=${q}" target="_blank" rel="noopener">זאפ</a></div>`;
  }

  // processed meat / chicken / fish (grocery/processed.py; the flag comes in products.json)
  const PROC = `<span class="proc" title="מעובד" aria-label="מעובד"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21V11l5 3V11l5 3V8l5 3v10z"/><path d="M18 11V4h2v8"/></svg></span>`;
  function productHtml(it, stores, first) {
    const o = it.best, multi = stores.filter((st) => st.on !== false).length > 1;
    const meta = [it.maker && `<span>${esc(it.maker)}</span>`,
                  o.doubtful && '<span class="warn">גודל לא ודאי</span>'].filter(Boolean).join("");
    let extra = (o.deal ? `<div class="deal"><span class="badge">${esc(o.deal)}</span> ${esc(o.deal_conditions)}</div>` : "") +
                (o.club_note ? `<div class="club">${esc(o.club_note)}</div>` : "");
    if (multi) {
      const short = (x) => esc(stores[x.store].short), branch = (x) => branchNote(x);
      extra += `<div class="stores"><span class="store-tag">${short(o)}</span>` +
        it.others.map((x) => `<span class="other st-${x.store}">${short(x)} ${money(x.price)}${x.deal ? ` (${esc(x.deal)})` : ""}${
          branch(x) ? ` · ${branch(x)}` : ""}</span>`).join("") +
        (it.others.length ? (branch(o) ? `<span class="only">${branch(o)}</span>` : "")
          : `<span class="only">רק ב${short(o)}${o.branch ? " " + esc(o.branch) : ""}${o.alt ? " · " + branch(o) : ""}</span>`) + "</div>";
    }
    const was = o.shelf !== null ? `<s>${money(o.shelf)}</s> ` : "";
    const on = o.deal ? " on-deal" : "";
    let prices;
    if (o.unit_price !== null) {
      prices = `<div class="unit${on}">${money(o.unit_price)} <small>${o.unit_label}</small></div>` +
        (o.weighted ? `<div class="shelf">${was}במשקל</div>`
                    : `<div class="shelf">${was}${money(o.price)}${o.size ? " · " + esc(o.size) : ""}</div>`);
    } else {
      prices = `<div class="unit${on}">${money(o.price)}</div><div class="shelf">${was}${esc(o.size)}</div>`;
    }
    return `<li class="product st-${o.store}${first && o.unit_price !== null ? " best" : ""}"><div class="info">` +
      `<div class="name">${it.processed ? PROC : ""}${esc(it.name)} ${window.Photo ? window.Photo.button(it.key, it.name, esc, it.food,
        it.offers.filter(Boolean).every((x) => stores[x.store].key === "victory-038"), ELECTRIC_CATS.has(it.cat)) : ""}</div>` +
      `<div class="meta">${meta}</div>${extra}</div>` +
      `<div class="prices">${prices}</div>` +
      `<button class="add" type="button" data-add="${esc(it.key)}" data-name="${esc(it.name)}" aria-label="הוספה לרשימה">+</button></li>`;
  }

  // One category's rows, cheapest first, with the "no size" divider (templates/_products.html).
  function rowsHtml(items, stores) {
    let html = "", divided = false;
    items.forEach((it, i) => {
      if (it.best.unit_price === null && !divided) {
        divided = true;
        if (i) html += '<li class="divider">ללא מחיר לק״ג (גודל לא ידוע)</li>';
      }
      html += productHtml(it, stores, i === 0);
    });
    return html;
  }

  // Cost of qty items at one store: the deal price for whole deal sets, shelf price for the rest.
  function lineCost(o, qty) {
    if (o.shelf === null || o.buy <= 1) return { cost: qty * o.price, short: 0 };
    const sets = Math.floor(qty / o.buy);
    return { cost: sets * o.buy * o.price + (qty - sets * o.buy) * o.shelf,
             short: qty % o.buy ? o.buy - (qty % o.buy) : 0 };
  }

  // Text for matching: no quotes or geresh ("קוטג'" = "קוטג"), and double yod / vav as single, the
  // usual spelling difference between the chains ("עגבנייה" = "עגבניה"). Names people and stores
  // write differently are made one: "תפוחי אדמה" = "תפוח אדמה" = "תפו״א", "סבון כלים" = "נוזל כלים",
  // "סקוטשים" = "סקווש" = "סקוצ'ים" = "סקוטץ" = "סקאץ'" = "כריות קרצוף" (scouring pads; Osher Ad says the
  // last; its "נסקוטש" is a candy).
  const norm = (s) => s.toLowerCase().replace(/['"`׳״]/g, "").replace(/יי/g, "י").replace(/וו/g, "ו")
    .replace(/תפוחי? אדמה/g, "תפוא").replace(/סבון כלים/g, "נוזל כלים")
    // the user's words: "גבנצ" / "גבנץ" = yellow cheese; "חמודים" (and a receipt's "חפודים") = oranges
    .replace(/(^|[^א-ת])גבנ[צץ](?![א-ת])/g, "$1גבינה צהובה").replace(/(^|[^א-ת])ח[מפ]ודים(?![א-ת])/g, "$1תפוזים")
    .replace(/(^|[^א-ת])זבל(?![א-ת])/g, "$1אשפה")  // "שקיות זבל" = "שקיות אשפה", "פח זבל" = "פח אשפה"
    // plant milks: the stores say "משקה שיבולת שועל", people "חלב שיבולת שועל" (the user, 2026-10-03: it found Gad's
    // "מעדן שיבולת שועל וחלב"); not milk chocolate ("שוקולד חלב שקדים"), not coconut milk (sold as "חלב קוקוס")
    .replace(/(^|[^א-ת])(?<!שוקולד )חלב (?=(?:שיבולת שועל|שבולת שועל|סויה|שקדים|אורז|כוסמין|קשיו)(?![א-ת]))/g, "$1משקה ")
    .replace(/סק[וא]ט?[שצץ]קוצ/g, "סקוטש קוצ")  // Osher Ad glues "סקוטץ`קוצים"
    .replace(/(^|[^א-ת])סק[וא](?:טש|טץ|טצ|צ|ץ|ש)(?:ים)?(?![א-ת])/g, "$1סקוטש")
    .replace(/כרי(?:ת|ות) קרצוף/g, "סקוטש קרצוף");  // Osher Ad's name for them

  // Name words without punctuation and numbers; skipping words that don't say what the product is
  // ("בשר מס 3 חזה" is about "חזה"), the first remaining word is the product type.
  const GENERIC = new Set(["בשר", "מס", "משקה", "מארז", "בטעם", "מיני", "טרי", "טריה", "ארוז", "קפוא",
    "מוכשר", "יבוא", "חלק", "פרוס", "מיקס", "חטיף", "סט", "זוג", "צמד", "שקית", "קופסא", "ויקטורי",
    "ללא", "עם", "של", "חדש", "פרימיום", "עוף", "הודו", "בקר", "עגל", "עגלה", "כבש", "טלה",
    "שלם", "שלמה", "מחפוד", "מוביל", "רמי", "לוי", "בריט", "לסר",  // brands in many names: מחפוד, מוביל, רמי לוי, (סקוטש) ברייט, (מ.)לסר
    // produce growers, packing and kashrut words ("ברוקולי ארוז א.אדמה" = "ברוקולי תקומה"); not colours
    "אדמה", "ערוגות", "מרינה", "מהדרין", "חות", "חוות", "יבולי", "ברכת", "חסלט", "הכפר", "תקומה", "קטיף", "הטבע", "תקוע", "שדות", "בעמק", "המשק", "תפזורת", "בתפזורת", "בשקית", "אריזה", "ארוזה", "ארוזים", "ארוזות", "בדץ", "גלאט"]);
  const words = (name) => norm(name).replace(/[.,()\-\/+*%&]/g, " ").split(/\s+/)
    .filter((w) => w.length >= 2 && !/\d/.test(w));
  // the product type: the first word that is neither generic nor a form word (see FORM below)
  const kind = (ws) => ws.find((w) => !GENERIC.has(w) && !FORM.has(w));

  // Words for how a product is cut, prepared or made "light". Two products are only
  // interchangeable when they have the same ones: a whole entrecote steak is not "דק דק אנטריקוט",
  // Coke is not Coke Zero.
  const FORM = new Set(["דק", "דקיק", "פרוס", "פרוסה", "פרוסות", "פרוסים", "טחון", "טחונה", "קצוץ",
    "קצוצה", "קוביות", "רצועות", "נתחי", "נתחים", "שניצל", "שניצלים", "קבב", "המבורגר", "בורגר",
    "מעושן", "מעושנת", "מתובל", "מתובלת", "ממולא", "ממולאים", "מבושל", "מבושלת", "אפוי", "אפויה",
    "מטוגן", "מפורק", "כתוש", "כתושה", "גרוס", "גרוסה", "מגורד", "סטייק", "סטייקים", "שיפוד",
    "שיפודים", "קציצות", "כבוש", "כבושים", "מיובש", "מיובשים", "ללא", "נטול", "נטולת", "מופחת",
    "מופחתת", "דל", "לייט", "זירו", "דיאט", "אורגני", "אורגנית"]);
  const forms = (ws) => ws.filter((w) => FORM.has(w)).map(stem).sort().join(" ");

  // Singular and plural as one word, by turning plurals into the singular: ות -> ה ("בננות" = "בננה",
  // "עגבניות" = "עגבניה"), ים dropped ("מלפפונים" = "מלפפון"), final letters as regular ones. A feminine
  // word never meets a masculine one this way: "לבנה" stays apart from "לבן".
  const FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  function stem(w) {
    w = w.replace(/[ךםןףץ]/g, (c) => FINALS[c]);
    if (w.length >= 4 && w.endsWith("ות")) return w.slice(0, -2) + "ה";
    if (w.length >= 4 && w.endsWith("ימ")) return w.slice(0, -2);
    return w;
  }
  // A plural in ות has two possible singulars: "עגבניות" -> "עגבניה", but "שקיות" -> "שקית".
  const stems = (w) => {
    const s = stem(w);
    return s !== w && s.endsWith("ה") && w.endsWith("ות") ? [s, s.slice(0, -1) + "ת"] : [s];
  };
  // the word x is w, in singular or plural, maybe after a one-letter prefix: "לקפה" is "קפה", "אייסקפה"
  // is not. Whole words only (the price watch; hasStem also finds a word inside another).
  const sameWord = (x, w) => {
    const want = stems(w), is = (y) => stems(y).some((s) => want.includes(s));
    return is(x) || (x.length > w.length && "הובלמשכ".includes(x[0]) && is(x.slice(1)));
  };
  // text (already norm'ed) has the word w, as part of a word or as the same word in singular / plural
  const hasStem = (text, w) => {
    if (text.includes(w)) return true;
    const want = stems(w);
    return words(text).some((x) => stems(x).some((s) => want.includes(s)));
  };

  // Words that turn a basic product into a processed one: pickled, canned, dried, frozen, flavoured,
  // spreads, sauces. A plain list item ("מלפפון", "עגבניות") skips products with these unless the
  // item itself says so ("מלפפון חמוץ").
  const PROCESSED = new Set([...FORM, "חמוץ", "חמוצים", "חמוצה", "חמוצות", "מלח", "במלח", "חומץ", "בחומץ",
    "בעישון", "עישון", "מעושנים", "מעושנות", "גרבלקס", "גרבדלקס", "מומלח", "מומלחת", "מלוח", "מלוחה",  // smoked / cured fish
    "משומר", "משומרים", "משומרת", "משומרות", "שימורי", "קפוא", "קפואה", "קפואים", "קפואות", "מוקפא",
    "מוקפאת", "מוקפאים", "מוקפאות", "מיובשת", "מיובשות", "בשמן", "ברוטב", "במיץ", "רוטב", "רסק", "מחית",
    "מרוסקות", "מרוסק", "חתוכות", "חתוכים", "קצוצות", "מיץ", "נקטר", "תרכיז", "ממרח", "סלט", "מטבל",
    "בטעם", "טעם", "חטיף", "חטיפי", "אבקת", "מרק", "ציפס", "ריבת", "ריבה", "קרם", "גל", "תחליב", "ספריי"]);

  // Words that don't describe the product itself: packaging, units, origin.
  const FILLER = new Set(["שומן", "גר", "גרם", "קג", "ליטר", "מל", "יח", "יחידות", "ישראל", "כרית", "כריות", "פיקוח",
    "שתיים", "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה", "תשע", "עשר"]);

  // How many pieces a pack has, from its name ("שש כריות", "6 יח'", "זוג", "שלישיית ..."), else from the
  // file when it says more than one ("1 יחידות" is a default); null when unknown. For per-piece swaps.
  const COUNT_WORDS = { "זוג": 2, "צמד": 2, "שתיים": 2, "שלישיה": 3, "שלישית": 3, "שלוש": 3, "רביעיה": 4,
    "רביעית": 4, "ארבע": 4, "חמישיה": 5, "חמישית": 5, "חמש": 5, "שישיה": 6, "שישית": 6, "שש": 6, "שבע": 7,
    "שמונה": 8, "תשע": 9, "עשר": 10 };
  // words for a pack of packs (a number word like "שלוש" is a count itself, not a multiplier)
  const PACK_WORDS = { "זוג": 2, "צמד": 2, "שלישיה": 3, "שלישית": 3, "רביעיה": 4, "רביעית": 4, "חמישיה": 5, "חמישית": 5,
    "שישיה": 6, "שישית": 6 };
  // The count a name gives: "6 יח'", "9 יחידות", and packs of packs "7*72 יח" = 504 (Osher Ad's wipes)
  function nameCount(name) {
    const t = name.toLowerCase().replace(/['"`׳״]/g, "");  // not norm: it turns "6 כריות קרצוף" into "6 סקוטש ..."
    const m = t.match(/(?:(\d+)\s*[*x×]\s*)?(\d+)\s*(?:יח|יחידות|כריות|כרית|גלילים|שקיות|ספוגים|ספוגיות|מטליות|זוגות)(?![א-ת])/);
    if (m && Number(m[2]) > 0) {
      const n = Number(m[2]) * (m[1] ? Number(m[1]) || 1 : 1);
      // a pack of packs said in words: "רביעייה 56 יח" is 4 x 56 (not when "4*56" already said it)
      if (!m[1]) for (const w of words(name)) if (PACK_WORDS[w]) return n * PACK_WORDS[w];
      return n;
    }
    for (const w of words(name)) if (COUNT_WORDS[w]) return COUNT_WORDS[w];
    return null;
  }
  function pieces(it) {
    const n = nameCount(it.name);
    if (n) return n;
    return it.best.base_unit === "unit" && it.best.size_num > 1 ? it.best.size_num : null;
  }

  // The first two words that say what the product is: not generic, form, filler or brand words
  // ("קמח לפיצה שטיבל" -> קמח, לפיצה).
  function keyWords(it) {
    // the maker's words are brand words, except the name's first word: Osher Ad's maker "קמח עץ השדה"
    // must not take "קמח" out of "קמח לבן מנופה הנחתום"
    const ws = words(it.name), brand = new Set(words(it.maker || ""));
    brand.delete(ws[0]);
    return ws.filter((w) => !GENERIC.has(w) && !FORM.has(w) && !FILLER.has(w) && !brand.has(w)).slice(0, 2);
  }

  // (grocery/matching.py is a Python copy of these rules for the deals page: keep the two in step.)
  // Same product for swaps and compare equivalents: one name's two key words both appear in the
  // other (pizza flour only matches pizza flour; never "סינטה" -> "גחנון", even if a category is
  // wrong), the same form words, and the user hasn't marked the pair "not a match".
  // Sizes (eggs, clothes, bags): Victory writes only M / L / XL, Rami Levy "בינוני M" or "בנוני", Osher Ad
  // "בינוני" or cut to "בינונ". A Latin letter counts only as a whole token (the M in "XL" doesn't).
  const SIZES = [["בינוני", "בינונית", "בינוניים", "בינוניות", "בנוני", "בינונ", "m"],
                 ["גדול", "גדולה", "גדולים", "גדולות", "l"],
                 ["ענק", "ענקית", "ענקיים", "ענקיות", "xl"],
                 ["קטן", "קטנה", "קטנים", "קטנות", "s"]];
  const SIZE_OF = new Map(SIZES.flatMap((g, i) => g.map((w) => [w, i])));
  const hasToken = (text, x) => new RegExp(`(^|[^a-z])${x}(?![a-z])`).test(text);
  // text (norm'ed) has w: hasStem, and a size word also as its letter ("בינוני" in "... M")
  function hasTerm(text, w) {
    const g = SIZE_OF.get(w);
    if (g === undefined) return /^[a-z]+$/.test(w) ? hasToken(text, w) : hasStem(text, w);
    return SIZES[g].some((x) => (/^[a-z]+$/.test(x) ? hasToken(text, x) : hasStem(text, x)));
  }
  // the size groups a name has (Hebrew words or Latin letters)
  const sizesOf = (text) => new Set(SIZES.map((g, i) => (g.some((x) => (/^[a-z]+$/.test(x) ? hasToken(text, x) : text.split(/\s+/).includes(x))) ? i : -1)).filter((i) => i >= 0));

  // Frozen is not fresh (the user): in a fresh department ("עוף טרי", "דגים טריים"), a name that says it's
  // frozen never stands for one that doesn't, or back. Elsewhere frozen words are ignored, since frozen
  // departments' names often don't say "קפוא".
  let FRESH_CATS = new Set(), ELECTRIC_CATS = new Set();
  const FROZEN = /(^|[^א-ת])(?:קפוא|קפואה|קפואים|קפואות|מוקפא|מוקפאת|מוקפאים|מוקפאות)(?![א-ת])/;
  const frozenName = (it) => FROZEN.test(norm(it.name));
  function sameKind(a, b) {
    if ((FRESH_CATS.has(a.cat) || FRESH_CATS.has(b.cat)) && frozenName(a) !== frozenName(b)) return false;
    const ka = keyWords(a), kb = keyWords(b), ta = norm(a.name), tb = norm(b.name);
    const covers = (ks, t) => ks.length > 0 && ks.every((w) => hasTerm(t, w));
    if (!(covers(ka, tb) || covers(kb, ta))) return false;
    // a name with a single key word may only have its brand left ("עוף שלם טרי קהילות" -> קהילות): then
    // both names' first key words must be in the other ("חזה עוף ... קהילות" is not a whole chicken)
    if ((ka.length === 1 || kb.length === 1) && !(hasTerm(tb, ka[0] || "") && hasTerm(ta, kb[0] || ""))) return false;
    if (forms(words(a.name)) !== forms(words(b.name))) return false;
    // when both say a size, it's the same one (M eggs are not L eggs)
    const sa = sizesOf(ta), sb = sizesOf(tb);
    if (sa.size && sb.size && ![...sa].some((i) => sb.has(i))) return false;
    return !(window.Basket && window.Basket.isBlocked(a.key, b.key));
  }

  // a store index as shown: a merged branch's is its chain's first branch that's on
  const shownAt = (stores, i) => (i >= 0 && stores[i].mergedInto !== undefined ? stores[i].mergedInto : i);
  // a receipt line's saved price that day ({store key: ₪ or null}) at a shown store: the cheaper branch's.
  // A branch added after the receipt was read (Givat Shaul, 2026-10-01) has no price there: the chain's other
  // branch's stands for it (87% of products are at both, 88% of those at the same price).
  function atPrice(at, st) {
    let v = (st.branches || [st.key]).map((k) => at[k]);
    if (v.every((x) => x === undefined) && st.chain) v = st.chain.map((k) => at[k]);
    const nums = v.filter((x) => typeof x === "number");
    return nums.length ? Math.min(...nums) : v.every((x) => x === null) ? null : undefined;
  }
  // a store tag, with the branch when only one of a chain's branches has the product ("אושר עד · רק בתלפיות")
  // Which branch, when a chain's branches are merged: "רק בתלפיות" (the other lacks it), or "בגבעת שאול;
  // בתלפיות ₪7.90" (the price shown is the cheaper branch's). Empty when the branches agree.
  function branchNote(o) {
    if (!o) return "";
    if (o.branch) return `רק ב${esc(o.branch)}`;
    if (o.alt) return `ב${esc(o.at)}; ב${esc(o.alt.at)} ${money(o.alt.price)}`;
    return "";
  }
  const storeTag = (stores, o) => `<span class="store-tag">${esc(stores[o.store].short)}</span>` +
    (branchNote(o) ? ` <span class="only">${branchNote(o)}</span>` : "");
  window.Render = { esc, money, load, webCompareHtml, shownAt, atPrice, storeTag, branchNote, productHtml, rowsHtml, lineCost, sameKind, norm, words, stem, hasStem, hasTerm, sameWord, pieces, nameCount, PROCESSED };
})();
