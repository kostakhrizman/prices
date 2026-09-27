// Pricing across stores, shared by the list page and the receipt page: the cheapest same product
// (swaps), what an item costs at each store (itself or its closest equivalent), general items'
// automatic matches, the user's card discount, and the store comparison table.
// Compare(data) takes the loaded products (static/render.js) and returns these helpers.
(function () {
  const { esc, money, lineCost, sameKind, norm, words: nameWords, stem, hasStem, hasTerm, pieces, PROCESSED } = window.Render;
  const SWAP_MIN_SAVING = 0.05;  // suggest only alternatives at least 5% cheaper per kg / liter

  window.Compare = function (data) {
    const byCat = new Map();
    for (const it of data.items) {  // already cheapest-first within each category
      if (!byCat.has(it.cat)) byCat.set(it.cat, []);
      byCat.get(it.cat).push(it);
    }

    // The item's price per kg / liter at its cheapest store (null when its size is unknown).
    const unitOf = (it) => (it.best.base_unit === "unit" ? null : it.best.unit_price);

    // Cheapest same product in the same subcategory, per kg / liter, across all stores. Package sizes
    // differ, so it's shown as "X% cheaper per kg" plus the package price, not as a saving.
    // {it, percent, unit: its price per kg / l / piece, label}
    function bestSwap(it, inList) {
      const unit = unitOf(it);
      if (unit === null) return pieceSwap(it, inList);
      for (const c of byCat.get(it.cat) || []) {  // cheapest first
        const cu = unitOf(c);
        if (cu === null || c.best.base_unit !== it.best.base_unit) continue;
        if (cu > unit * (1 - SWAP_MIN_SAVING)) return null;
        if (inList.has(c.key) || !sameKind(it, c) || (window.Avoid.hides(c.kind) && !window.Avoid.hides(it.kind))) continue;
        return { it: c, percent: Math.round((1 - cu / unit) * 100), unit: cu, label: c.best.unit_label };
      }
      return null;
    }

    // Per-piece products (scouring pads, sponges...), by the price of one piece when both packs' counts
    // are known (Render.pieces: from the name, since the files' counts are often a default 1).
    const perPiece = (it) => {
      if (it.best.base_unit !== "unit") return null;
      const n = pieces(it);
      return n ? it.best.price / n : null;
    };
    // How many pieces a pack has: from the name, else the store's own count when it's more than 1 (Rami
    // Levy often files a pack of 6 as "1 יח׳"; Victory files the right count)
    const countOf = (it, o) => {
      const n = window.Render.nameCount(it.name);
      if (n) return n;
      const offer = o || it.best;
      return offer && offer.base_unit === "unit" && offer.size_num > 1 ? offer.size_num : null;
    };
    // A per-piece product's size: S/M/L letters and the numbers in its name other than its count
    // ("צלחת 10'" is not "צלחת 7", eggs L are not eggs M, nappies "מידה 4" not unmarked ones).
    const spec = (it) => {
      const n = pieces(it), t = it.name.toLowerCase().replace(/['"`׳״]/g, " ");
      const nums = (t.match(/\d+(?:\.\d+)?/g) || []).filter((x) => Number(x) !== n);
      const sizes = t.match(/(?<![a-z])(?:xxxl|xxl|xl|xs|s|m|l)(?![a-z])/g) || [];
      return [...new Set([...nums, ...sizes])].sort().join(" ");
    };
    function pieceSwap(it, inList) {
      const each = perPiece(it);
      if (each === null) return null;
      const size = spec(it);
      let best = null;
      for (const c of byCat.get(it.cat) || []) {
        if (c === it || inList.has(c.key) || (window.Avoid.hides(c.kind) && !window.Avoid.hides(it.kind))) continue;
        const ce = perPiece(c);
        if (ce === null || ce > each * (1 - SWAP_MIN_SAVING) || (best && ce >= best.unit)) continue;
        if (spec(c) !== size || !sameKind(it, c)) continue;
        best = { it: c, unit: ce };
      }
      return best && { ...best, percent: Math.round((1 - best.unit / each) * 100), label: "ליח׳" };
    }

    // What qty of `it` costs at store s: the product itself, else the closest equivalent there
    // (same subcategory and product, cheapest for the same amount per kg / liter, or per item when
    // the size is unknown), else null.
    // Vegetables sold by the head at one store and by weight at another (Victory's cauliflower ₪10.90 a
    // head, Rami Levy's ₪24.90 a kg): a head counts as this many kg (the user agreed to a guess), so the two
    // can be compared. By the name's first word.
    const HEAD_KG = { "כרובית": 1, "כרוב": 1, "חסה": 0.5, "ברוקולי": 0.5, "אננס": 1.5, "מלון": 1.5 };
    const HEAD_OF = new Map(Object.entries(HEAD_KG).map(([w, kg]) => [stem(w), kg]));
    const headKg = (it) => {
      const first = nameWords(it.name)[0];
      return (first && HEAD_OF.get(stem(first))) || null;
    };
    const byHead = (o) => !o.weighted && o.base_unit !== "kg";  // sold as a head, not priced per kg
    // What the till asks for the packs a line is priced from (a 7×72 pack of wipes is ₪14 even when it
    // counts as ₪2 for 72): shown next to the price when it's well above it. Weighed items: none.
    const till = (o, qty) => (o.weighted ? null : qty * o.price);

    function costAt(it, qty, s) {
      const own = it.offers[s];
      if (own) return { cost: lineCost(own, qty).cost, sub: null };
      const unit = unitOf(it), amount = it.best.weighted ? qty : qty * (it.best.size_num || 0);
      let best = null;
      for (const c of byCat.get(it.cat) || []) {
        const o = c.offers[s];
        if (!o || !sameKind(it, c)) continue;
        let cost;
        const n = pieces(it), m = pieces(c), head = headKg(c);
        if (head && it.best.base_unit === "kg" && byHead(o)) {
          cost = (it.best.weighted ? qty : amount) * o.price / head;  // a kg of it, from heads
        } else if (head && byHead(it.best) && o.base_unit === "kg" && o.unit_price !== null) {
          cost = qty * head * o.unit_price;  // a head, from the price per kg
        } else if (unit !== null && amount > 0) {
          if (o.unit_price === null || o.base_unit !== it.best.base_unit) continue;
          cost = amount * o.unit_price;
        } else if (n && m) {
          cost = qty * n * (o.price / m);  // 12 eggs against a pack of 18: the price of 12
        } else {
          cost = qty * o.price;
        }
        if (!best || cost < best.cost) best = { cost, sub: c, till: till(o, qty) };
      }
      return best;
    }

    // List words that stores write differently: pickles are "מלפפון במלח / בחומץ", not "חמוץ"; sizes below.
    const PICKLED = ["חמוץ", "חמוצים", "חמוצה", "חמוצות", "במלח", "בחומץ", "כבוש", "כבושים"];
    const SYNONYMS = Object.fromEntries(PICKLED.map((w) => [w, PICKLED]));
    // בננה finds בננות, בינוני finds "... M" (Render.hasTerm)
    const hasWord = (text, w) => (SYNONYMS[w] || [w]).some((x) => hasTerm(text, x));

    // A general item ("שמפו"): the products whose name has all its words, narrowed to the subcategory
    // most of them are in (shampoo, not dog shampoo) and the unit most of those are sold by. Stores are
    // compared on a typical package (the median size), so a 1 l bottle isn't set against a 400 ml one.
    const matchCache = new Map();
    const LEAD_SKIP = new Set(["פילה", "מנות", "מנה", "נתחי", "נתחים", "סטייק", "דג", "זוג"]);
    // Pack words ("שישיית מים" = a six-pack of water): not what the item is, so left out when matching, and never an
    // item of its own when splitting a line (the user, 2026-10-02)
    const PACK = new Set(["זוג", "צמד", "שלישיה", "שלישית", "רביעיה", "רביעית", "חמישיה", "חמישית", "שישיה", "שישית",
      "מארז", "מארזי", "חבילה", "חבילת", "ארגז", "קרטון", "שקית", "בקבוק", "בקבוקי", "פחית", "פחיות"].map((w) => norm(w)));
    const isPack = (w) => PACK.has(w) || (w.length > 3 && w.startsWith("ו") && PACK.has(w.slice(1)));
    // Multipacks (מארז) first (the user, 2026-10-04), by four groups of subcategories, a tick each in settings "מארזים"
    // (per phone, localStorage packGroups {name: bool}): חטיפים (the snack subcategories; on unless set off, or the
    // old snackPacks = "0"), שוקולד, מים, סבון (off unless ticked). A multipack = a name with a pack word or "10 * 25 גרם"
    // / "4*55" / "18X12"; not "48 יח" (Netto writes the carton's count on single bags), not a bag (שקית).
    const MULTI = new Set(["מארז", "מארזי", "מאגדת", "מאגד", "זוג", "צמד", "שלישיה", "שלישית", "רביעיה", "רביעית", "חמישיה",
      "חמישית", "שישיה", "שישית", "שמיניה", "שמינית", "עשיריה", "עשירית"].map((w) => norm(w)));
    const isMultipack = (it) => nameWords(it.name).some((w) => MULTI.has(norm(w)))
      || /(?:^|[^\d.])([2-9]|[1-4]\d)\s*[*xX×]\s*\d/.test(it.name) || /\d\s*[*xX×]\s*([2-9]|[1-4]\d)(?![\d.])/.test(it.name);
    const packLead = (w) => isPack(w) || MULTI.has(w) || /^\d+(?:יח\S*)?$/.test(w) || /^יח/.test(w);
    const PACK_GROUPS = [
      { name: "חטיפים", on: true, test: (c) => c.top === "חטיפים ומתוקים" && /חטיפ/.test(c.leaf) },
      { name: "שוקולד", on: false, test: (c) => c.top === "חטיפים ומתוקים" && c.leaf === "שוקולד" },
      { name: "מים", on: false, test: (c) => c.top === "משקאות" && c.leaf === "מים" },
      { name: "סבון", on: false, test: (c) => /^סבון/.test(c.leaf) },
    ];
    const packChoice = (() => {
      try {
        const own = JSON.parse(localStorage.getItem("packGroups")) || {};
        if (!("חטיפים" in own) && localStorage.getItem("snackPacks") === "0") own["חטיפים"] = false;
        return own;
      } catch (e) { return {}; }
    })();
    const packWanted = (c) => {
      const g = c && PACK_GROUPS.find((x) => x.test(c));
      return Boolean(g && (g.name in packChoice ? packChoice[g.name] : g.on));
    };
    const PIECE_ITEMS = new Set(["פיתה", "לחמניה", "לאפה", "טורטיה", "בייגל", "קרואסון", "ביצה"].map((w) => stem(norm(w))));
    function generalMatch(text) {
      const key = norm(text);
      if (matchCache.has(key)) return matchCache.get(key);
      const said = key.split(/\s+/).filter(Boolean);
      const words = said.some((w) => !isPack(w)) ? said.filter((w) => !isPack(w)) : said;
      const found = words.length ? data.items.filter((it) => words.every((w) => hasWord(norm(it.name + " " + it.maker), w))) : [];
      // processed kinds this phone hides (static/avoid.js) are left out, unless they are all there is: an item
      // already on the list ("נקניקיות") is never dropped, basket-page.js tags it "מעובד"
      const kept = found.filter((it) => !window.Avoid.hides(it.kind));
      const all = kept.length ? kept : found;
      // "מלפפון" means cucumbers, not pickles: drop processed variants unless the item names them
      const asked = new Set(words.flatMap((w) => SYNONYMS[w] || [w]));
      const plain0 = all.filter((it) => nameWords(it.name).every((w) => !PROCESSED.has(w) || asked.has(w)));
      // and not the frozen departments when a fresh one has it (the user: "סלמון" is fresh salmon, frozen
      // isn't fresh), unless the item says frozen; "פיצה" (no fresh pizza) still finds frozen pizza
      const leafOf = (it) => (data.categories[it.cat] || {}).leaf || "";
      const wantsFrozen = [...asked].some((w) => /קפוא|מוקפא/.test(w));
      const hasFresh = plain0.some((it) => /טרי/.test(leafOf(it)));
      const thawed = wantsFrozen || !hasFresh ? plain0 : plain0.filter((it) => !/קפוא/.test(leafOf(it)));
      const plain = thawed.length ? thawed : plain0;
      const hits = plain.length ? plain : all;
      let m = null;
      if (hits.length) {
        // names that start with the item's words ("בננות ישראל", "שמן זית כתית") choose the subcategory
        // when there are any, so the many "משקה בננה" drinks don't outvote the bananas; and when a few
        // of them are there, they alone are compared ("שמן זית" is not "שמן קנולה ... עץ הזית")
        const starts = hits.filter((it) => {
          // a leading cut word doesn't count: "פילה סלמון טרי" starts with סלמון
          const lead = norm(it.name).split(/\s+/);
          // and a leading pack: "מארז תפוציפס", "מארז 4 יח תפוציפס" (the user, 2026-10-04)
          while (lead.length > 1 && (LEAD_SKIP.has(lead[0]) || packLead(lead[0]))) lead.shift();
          return words.every((x, i) => lead[i] !== undefined && stem(lead[i]) === stem(x));
        });
        const score = new Map();
        for (const it of starts.length ? starts : hits) score.set(it.cat, (score.get(it.cat) || 0) + 1);
        const cat = [...score.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
        const startsHere = starts.filter((it) => it.cat === cat);
        const inCat = hits.filter((it) => it.cat === cat);
        let cands = startsHere.length >= 3 ? startsHere : inCat;
        // a kind ticked for multipacks (snacks by default): the multipacks, when at least two stores have one (a store
        // without one is compared on the rest, `wider`)
        let packsOnly = false;
        const packsFirst = packWanted(data.categories[cat]);
        if (packsFirst) {
          const multi = cands.filter(isMultipack);
          if (new Set(multi.flatMap((it) => it.offers.map((o, i) => (o ? i : -1)).filter((i) => i >= 0))).size >= 2) {
            cands = multi;
            packsOnly = true;
          }
        }
        const bases = new Map();
        for (const it of cands) if (unitOf(it) !== null) bases.set(it.best.base_unit, (bases.get(it.best.base_unit) || 0) + 1);
        const base = bases.size ? [...bases.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0] : null;
        const sizes = cands.filter((it) => base && it.best.base_unit === base && (it.best.weighted || it.best.size_num))
          .map((it) => (it.best.weighted ? 1 : it.best.size_num)).sort((a, b) => a - b);
        // compared by size only when enough of the matches give one (the user, 2026-10-02: of 32 toilet papers only the
        // 73 g Shabbat paper had a size, so "per 73 g" made it the cheapest); else by packs
        const ref = sizes.length && sizes.length >= Math.max(2, cands.length / 3) ? sizes[Math.floor(sizes.length / 2)] : null;
        // Per-piece things (scouring pads, sponges): when most matches say how many pieces a pack has, a
        // pack is priced by its count, for the median count (a 9-pad pack for ₪9.90 beats 2 pads for ₪8.90)
        const counts = cands.map((it) => countOf(it, null)).filter(Boolean).sort((a, b) => a - b);
        // things bought by the piece (pitas, rolls, eggs...) go by the piece whenever a few matches give a count, even
        // when they give weights too (the user, 2026-10-04: pitas "per 450 g" made no sense)
        const byPiece = words.some((w) => PIECE_ITEMS.has(stem(w))) && counts.length >= Math.max(3, cands.length / 4);
        const perPieceRef = ((!ref || base === "unit") && counts.length * 2 >= cands.length) || byPiece
          ? counts[Math.floor(counts.length / 2)] : null;
        // a store none of whose names start with the words ("האגיס מגבונים ...") is compared on all its
        // matches in the department (generalAt), not left out
        // a typical pack's price (the median), for comparing by packs: a mini pack doesn't stand for the item
        const prices = cands.map((it) => it.best.price).sort((a, b) => a - b);
        const typical = prices.length ? prices[Math.floor(prices.length / 2)] : null;
        m = { cat, cands, wider: cands === inCat ? null : inCat, base: ref && !perPieceRef ? base : null, ref, pieces: perPieceRef, typical,
          packsOnly, packsFirst };
      }
      matchCache.set(key, m);
      return m;
    }

    // The cheapest match of a general item at store s, for qty typical packages. When none of the store's
    // matches has a size (Osher Ad's "אורז לבן עגול לסושי"), the cheapest pack there, rather than "לא נמכר".
    function generalAt(m, qty, s) {
      let best = null, unsized = null;
      const list = m.wider && !m.cands.some((it) => it.offers[s]) ? m.wider : m.cands;
      // Compared by packs (no size to go by): packs under half the typical price (single rolls, a Shabbat pack, travel
      // sizes) are left out when the store has a normal one; the user: "the default should be the big ones"
      const MINI = 0.5;
      const byPack = !m.base && !m.pieces;
      // by item count: a count far from the usual one isn't the same thing ("נייר טואלט חתוך": 100 sheets, not rolls)
      // (only a count from the file's field: one written in the name, "10 יח", is trusted, a 10-pack of pads is real)
      const usualCount = (it, o) => {
        if (window.Render.nameCount(it.name)) return true;
        const n = countOf(it, o);
        return !n || (n >= m.pieces / 4 && n <= m.pieces * 2.5);
      };
      const normal = (o, it) => (m.pieces ? usualCount(it, o) : !byPack || !m.typical || o.price >= MINI * m.typical);
      const anyNormal = list.some((it) => it.offers[s] && normal(it.offers[s], it));
      for (const it of list) {
        const o = it.offers[s];
        if (!o) continue;
        if (anyNormal && !normal(o, it)) continue;
        let cost;
        const head = m.base === "kg" && byHead(o) ? headKg(it) : null;
        if (head) {
          cost = qty * m.ref * o.price / head;
        } else if (m.pieces) {
          const n = countOf(it, o);
          if (!n) {
            if (!unsized || qty * o.price < unsized.cost) unsized = { cost: qty * o.price, pick: it };
            continue;
          }
          cost = qty * m.pieces * o.price / n;
        } else if (m.base) {
          if (o.unit_price === null || o.base_unit !== m.base) {
            if (o.unit_price === null && (!unsized || qty * o.price < unsized.cost)) unsized = { cost: qty * o.price, pick: it };
            continue;
          }
          cost = qty * m.ref * o.unit_price;
        } else {
          cost = qty * o.price;
        }
        if (!best || cost < best.cost) best = { cost, pick: it, till: till(o, qty) };
      }
      return best || unsized;
    }

    // The user's payment-card discount at store s on `amount` spent there (e.g. Victory: 7% of at
    // most ₪750; spending above the cap gets nothing).
    function cardDiscount(s, amount) {
      const st = data.stores[s];
      return st.card_rate ? st.card_rate * Math.min(amount, st.card_cap || Infinity) : 0;
    }
    const cardNote = (s) => {
      const st = data.stores[s];
      return st.card_rate ? `${Math.round(st.card_rate * 100)}% הנחת כרטיס עד ₪${st.card_cap}` : "";
    };

    // Where to shop: the whole list at each store that's on (each line itself or its closest equivalent,
    // card discounts included), and the best split between two stores (the user: never more than two in
    // one trip), each line at the one of the pair where it costs less. Shown only for a real saving, or, whatever
    // the saving, when the cheapest single store doesn't sell some of the list and the pair sells more of it (the
    // user, 2026-10-05; that store's total leaves those items out, so the "saving" there means little).
    // ₪, set per phone in settings.html "השוואה בין חנויות" (localStorage splitMin; the user chose 40, was 10), and a
    // share of the one-store total
    let SPLIT_MIN = 40;
    try { const v = JSON.parse(localStorage.getItem("splitMin")); if (typeof v === "number" && v >= 0) SPLIT_MIN = v; } catch (e) { /* default */ }
    const SPLIT_MIN_SHARE = 0.03;
    function planHtml(lines, generals) {
      const S = data.stores, on = S.map((_, s) => s).filter((s) => S[s].on !== false);
      const rows = lines.map(({ it, qty }) => ({ label: it.name, cells: S.map((_, s) => costAt(it, qty, s)) }))
        .concat(generals.map(({ e, m }) => ({ label: e.text, cells: S.map((_, s) => (m ? generalAt(m, e.qty, s) : null)) })));
      if (on.length < 2 || rows.length < 2) return "";
      const priced = (stores) => {  // each row at the cheapest of `stores` (card rate counted), totals after card discounts
        const amounts = S.map(() => 0), pay = (r, s) => r.cells[s].cost * (1 - S[s].card_rate);
        const where = rows.map((r) => {
          const at = stores.filter((s) => r.cells[s]);
          if (!at.length) return -1;
          const low = Math.min(...at.map((s) => pay(r, s)));
          const cheapest = at.filter((s) => pay(r, s) - low < 0.01);
          return cheapest.length === 1 ? cheapest[0] : null;  // a tie: decided below
        });
        // a line that costs the same at both goes to the store most of the list goes to (fewer lines to
        // fetch at the second one)
        const main = stores.reduce((a, b) => (where.filter((w) => w === b).length > where.filter((w) => w === a).length ? b : a));
        where.forEach((w, k) => { if (w === null) where[k] = rows[k].cells[main] ? main : stores.find((s) => rows[k].cells[s]); });
        let missing = 0;
        where.forEach((w, k) => { if (w < 0) missing++; else amounts[w] += rows[k].cells[w].cost; });
        const total = amounts.reduce((sum, a, s) => sum + a - cardDiscount(s, a), 0);
        return { stores, total, missing, where, amounts };
      };
      const better = (a, b) => (a.missing - b.missing) || (a.total - b.total);
      const singles = on.map((s) => priced([s])).sort(better);
      const best = singles[0];
      let html = `<div class="plan"><div class="plan-best">הכי משתלם בחנות אחת: <b class="st-${best.stores[0]}">${esc(S[best.stores[0]].short)} ${money(best.total)}</b>` +
        (best.missing ? ` <small>(${best.missing} פריטים לא נמכרים שם)</small>` : "") + "</div>";
      const others = singles.slice(1).map((x) => `${esc(S[x.stores[0]].short)} ${x.missing > best.missing ? `(חסרים ${x.missing})` : `+${money(x.total - best.total)}`}`);
      if (others.length) html += `<div class="sub">${others.join(" · ")}</div>`;
      let pair = null;
      for (let i = 0; i < on.length; i++) {
        for (let j = i + 1; j < on.length; j++) {
          const p = priced([on[i], on[j]]);
          if (p.where.every((w) => w === on[i]) || p.where.every((w) => w === on[j])) continue;  // not a split
          if (!pair || better(p, pair) < 0) pair = p;
        }
      }
      const saving = pair ? best.total - pair.total : 0;
      // lines the cheapest single store doesn't sell and the pair does
      const filled = pair ? rows.filter((_, k) => best.where[k] < 0 && pair.where[k] >= 0) : [];
      const fills = Boolean(pair) && pair.missing < best.missing;
      if (pair && pair.missing <= best.missing && (fills || saving >= Math.max(SPLIT_MIN, best.total * SPLIT_MIN_SHARE))) {
        // name the lines that go to the store with fewer of them
        const [a, b] = pair.stores, count = (s) => pair.where.filter((w) => w === s).length;
        const minor = count(a) <= count(b) ? a : b, major = minor === a ? b : a;
        // the lines the cheapest store lacks come first
        const moved = rows.filter((r, k) => pair.where[k] === minor).sort((x, y) => filled.includes(y) - filled.includes(x)).map((r) => r.label);
        const about = !fills ? `, חיסכון של ${money(saving)}`
          : `, כולל ${filled.length === 1 ? "פריט אחד" : `${filled.length} פריטים`} שאין ב${esc(S[best.stores[0]].short)}` +
            (saving >= 0.005 ? `, חיסכון של ${money(saving)}` : "");
        // a tap opens the whole split: each store's lines with their prices
        const list = (s) => {
          const items = rows.map((r, k) => ({ r, k })).filter(({ k }) => pair.where[k] === s);
          return `<div class="split-store"><span class="store-tag st-${s}">${esc(S[s].short)}</span>
            ${items.length} פריטים, ${money(pair.amounts[s] - cardDiscount(s, pair.amounts[s]))}<ul>${items.map(({ r }) => {
              const c = r.cells[s], name = c.pick && c.pick.name !== r.label ? `${esc(r.label)} <small>(${esc(c.pick.name)})</small>`
                : c.sub ? `${esc(r.label)} <small>(חלופה: ${esc(c.sub.name)})</small>` : esc(r.label);
              return `<li><span>${name}</span><b>${money(c.cost)}</b></li>`;
            }).join("")}</ul></div>`;
        };
        const gone = rows.filter((_, k) => pair.where[k] < 0).map((r) => esc(r.label));
        html += `<details class="plan-split"><summary>בשתי חנויות: <b>${money(pair.total)}</b>${about}<br>
          <span class="store-tag st-${major}">${esc(S[major].short)}</span> רוב הרשימה,
          <span class="store-tag st-${minor}">${esc(S[minor].short)}</span> ${moved.length > 4
            ? `${moved.slice(0, 4).map(esc).join(", ")} ועוד ${moved.length - 4}` : moved.map(esc).join(", ")}
          <span class="split-more">הצג פריטים</span></summary>${list(minor)}${list(major)}${gone.length
            ? `<div class="sub">לא נמכרים באף אחת: ${gone.join(", ")}</div>` : ""}</details>`;
      }
      return html + "</div>";
    }

    // receipt (the receipt page): the same rules as the spending page's saving (spending.js receiptSaving),
    // so both name the same cheapest store: a line's prices from the day of the receipt when saved (`at`), a
    // line a store doesn't sell counted at what was paid, and the card discount at every store (it's a
    // prepaid card, so the receipt shows full prices).
    function compareHtml(lines, generals, receipt) {
      const S = data.stores;
      const on = S.map((_, s) => s).filter((s) => S[s].on !== false);  // columns: the stores that are on
      const totals = S.map(() => ({ total: 0, subs: 0, missing: 0 }));
      const splitAt = S.map(() => 0);
      const dayPrice = (line, s, c) => {  // the saved price of that day at store s, else today's (c)
        const v = line.at ? window.Render.atPrice(line.at, S[s]) : undefined;
        if (v === null || (line.at && v === undefined)) return null;  // a store added since: not priced then
        return typeof v === "number" ? { ...(c || {}), cost: v, till: null } : c;
      };
      const all = lines.map((line) => ({ it: line.it, qty: line.qty, paid: line.paid || 0, label: line.it.name,
        cells: S.map((_, s) => (receipt ? dayPrice(line, s, costAt(line.it, line.qty, s)) : costAt(line.it, line.qty, s))) }))
        .concat(generals.map(({ e, m }) => ({ it: null, qty: e.qty, label: e.text,
          cells: S.map((_, s) => (m ? generalAt(m, e.qty, s) : null)) })));
      const rows = all.map(({ it, qty, paid, label, cells }) => {
        on.forEach((s) => {
          const c = cells[s];
          if (!c) { totals[s].missing++; if (receipt) totals[s].total += paid; }
          else { totals[s].total += c.cost; if (c.sub) totals[s].subs++; }
        });
        // split basket: each item where it's cheapest, counting card discounts at their rate
        let pick = -1;
        on.forEach((s) => {
          const c = cells[s];
          if (c && (pick < 0 || c.cost * (1 - S[s].card_rate) < cells[pick].cost * (1 - S[pick].card_rate))) pick = s;
        });
        if (pick >= 0) splitAt[pick] += cells[pick].cost;
        return { it, qty, paid, label, cells };
      });
      totals.forEach((t, s) => { t.discount = cardDiscount(s, t.total); t.final = t.total - t.discount; });
      const split = splitAt.reduce((sum, amount, s) => sum + amount - cardDiscount(s, amount), 0);
      // the cheapest store among those that have (an equivalent of) everything, if any does; for a receipt,
      // among all (a missing line already counts at what was paid)
      const ranked = on.map((s) => ({ ...totals[s], s }));
      const complete = receipt ? ranked : ranked.filter((t) => !t.missing);
      const cheapest = (complete.length ? complete : ranked).reduce((a, b) => (b.final < a.final ? b : a));

      let html = '<div class="compare"><div class="totals">';
      on.forEach((s) => {
        const t = totals[s];
        const notes = [t.discount > 0.005 && `כולל ${cardNote(s)}: −${money(t.discount)}`,
                       t.subs && `${t.subs} חלופות`,
                       t.missing && `${t.missing} לא נמכרים${receipt ? " (במחיר ששולם)" : ""}`].filter(Boolean).join(" · ");
        html += `<div class="store-total st-${s}${s === cheapest.s ? " cheapest" : ""}">
          <div class="store-name">${esc(S[s].short)}</div><div class="amount">${money(t.final)}</div>
          <div class="notes">${notes || "כל המוצרים"}</div></div>`;
      });
      html += "</div>";
      const saving = cheapest.final - split;
      if (saving > 0.5) {
        html += `<p class="split">קנייה מפוצלת, כל מוצר בחנות הזולה לו: <b>${money(split)}</b>
          (חיסכון של ${money(saving)} מול ${esc(S[cheapest.s].short)})</p>`;
      }
      html += `<table class="compare-table"><tr><th></th>${receipt ? '<th class="paid-col">שילמתי</th>' : ""}${on.map((s) => `<th>${esc(S[s].short)}</th>`).join("")}</tr>`;
      // Photos: one next to the name when every store has the very same product; otherwise a quiet grey
      // icon in each store's cell for the product priced there (the user asked for both, unobtrusive)
      const P = window.Photo;
      for (const { it, qty, paid, label, cells } of rows) {
        const costs = cells.map((c) => (c ? c.cost : Infinity));
        const min = Math.min(...on.map((s) => costs[s]));
        const same = it && on.every((s) => !cells[s] || !cells[s].sub);
        const mini = (p) => (P && !same ? P.mini(p.key, p.name, esc, p.food) : "");
        // bought by weight (a receipt's 0.280 kg of deli mozzarella): the weight, and each store's price per kg
        const kg = it && it.best.weighted;
        const amount = kg ? ` · ${qty.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} ק״ג` : qty !== 1 ? ` × ${qty}` : "";
        const perKg = (c) => (kg && qty > 0 ? `<div class="per-kg">${money(c.cost / qty)} לק״ג</div>` : "");
        // what was paid for the line: marked when every store is cheaper, or when it was the cheapest
        const paidCell = !receipt ? "" : `<td class="paid-col${paid > min + 0.005 ? " paid-more" : " paid-ok"}">${money(paid || 0)}</td>`;
        html += `<tr><td>${same && P ? P.thumb(it.key, it.name, esc, it.food) : ""}${esc(label)}${amount}</td>${paidCell}` + on.map((s) => {
          const c = cells[s];
          if (!c) return '<td class="na">לא נמכר</td>';
          const bn = window.Render.branchNote(((c.pick || c.sub || it || {}).offers || [])[s]);
          const branch = bn ? `<div class="branch">${bn}</div>` : "";
          const tillNote = c.till && c.till > c.cost * 1.3 ? `<div class="till">בקופה ${money(c.till)}</div>` : "";
          if (c.pick) return `<td class="st-${s}${costs[s] === min ? " low" : ""}">${money(c.cost)}${mini(c.pick)}${perKg(c)}${tillNote}${branch}<div class="auto-name">${esc(c.pick.name)}</div></td>`;
          const sub = c.sub ? `<div class="sub-name">חלופה: ${esc(c.sub.name)}
            <button type="button" class="no-match" data-block="${esc(it.key)}" data-other="${esc(c.sub.key)}"
              aria-label="לא מתאים" title="לא מתאים">✕</button></div>` : "";
          return `<td class="st-${s}${costs[s] === min ? " low" : ""}">${money(c.cost)}${mini(c.sub || it)}${perKg(c)}${tillNote}${branch}${sub}</td>`;
        }).join("") + "</tr>";
      }
      html += "</table>";
      const notes = [];
      if (generals.length) notes.push("פריט כללי: המוצר הזול ביותר מהסוג הזה בכל חנות, במחיר של אריזה טיפוסית.");
      if (on.some((s) => totals[s].subs)) notes.push("חלופה: המוצר לא נמכר בחנות, והמחיר הוא של המוצר הדומה הזול ביותר שם לאותה כמות.");
      if (on.some((s) => totals[s].discount > 0.005)) notes.push("המחירים בטבלה לפני הנחת הכרטיס; הסכומים למעלה כוללים אותה.");
      if (receipt && lines.some((l) => l.at)) {
        notes.push("המחירים לפי יום הקנייה, כמו בחיסכון האפשרי בדף ההוצאות.");
      }
      return html + notes.map((n) => `<p class="sub">${n}</p>`).join("") + "</div>";
    }



    // An item that matches nothing (no AI, on the phone; used by the cart and the notes list): a typo in a
    // word no product has ("כרובת") gets the closest word the products do have ("כרובית"), and a line of
    // several items ("עגבניות מלפפון כרובית", "כרובית, תפוזים", "כרובית ותפוזים": each word a product, the
    // whole none) can be split. Words the products know are never changed (the user's rule).
    let vocab = null;  // norm'd word -> [how many product names have it, how many start with it]
    function vocabulary() {
      if (vocab) return vocab;
      vocab = new Map();
      for (const it of data.byKey.values()) {
        const ws = norm(it.name).split(/[^א-תa-z]+/).filter((w) => w.length >= 2);
        for (const w of new Set(ws)) {
          const v = vocab.get(w) || [0, 0];
          v[0]++;
          if (w === ws[0]) v[1]++;
          vocab.set(w, v);
        }
      }
      return vocab;
    }
    const FINAL = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
    const lastOf = (w) => FINAL[w[w.length - 1]] || w[w.length - 1];
    function distance(a, b, max) {  // edit distance, or max + 1 when it's more
      if (Math.abs(a.length - b.length) > max) return max + 1;
      let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
      for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let low = i;
        for (let j = 1; j <= b.length; j++) {
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
          low = Math.min(low, cur[j]);
        }
        if (low > max) return max + 1;
        prev = cur;
      }
      return prev[b.length];
    }
    const known = (w) => Boolean(generalMatch(w));
    function closest(w) {  // fewest edits, then the same last letter ("כרובת" -> "כרובית", not "כרוב"), then
      const max = w.length >= 6 ? 2 : 1;  // a word products start with, then the most common
      let best = null, bestKey = null;
      for (const [v, [n, first]] of vocabulary()) {
        const d = distance(w, v, max);
        if (d > max) continue;
        const key = [d, lastOf(v) === lastOf(w) ? 0 : 1, -first, -n];
        const i = bestKey ? key.findIndex((x, j) => x !== bestKey[j]) : 0;
        if (!bestKey || (i >= 0 && key[i] < bestKey[i])) { best = v; bestKey = key; }
      }
      return best;
    }
    function typoFix(text) {  // the item with its unknown words corrected, when that matches products
      const ws = norm(text).split(/[\s,]+/).filter(Boolean);
      if (!ws.length || ws.every(known)) return null;
      const fixed = ws.map((w) => (known(w) || w.length < 3 ? w : closest(w)));
      if (fixed.some((w) => !w)) return null;
      const t = fixed.join(" ");
      return t !== ws.join(" ") && generalMatch(t) ? t : null;
    }
    // An item of its own, for splitting: products are named after it (some name starts with it: "שעון", not
    // "דיגיטלי"), and it isn't a pack word ("שישיית"); the user: "שעון דיגיטלי" and "שישיית מים" are single items
    const startsWith = new Map();
    function itemWord(w) {
      if (isPack(w)) return false;
      if (!startsWith.has(w)) {
        startsWith.set(w, Boolean(generalMatch(w)) && data.items.some((it) => {
          const lead = norm(it.name).split(/\s+/);
          while (lead.length > 1 && LEAD_SKIP.has(lead[0])) lead.shift();
          return stem(lead[0] || "") === stem(w);
        }));
      }
      return startsWith.get(w);
    }
    function splitOf(text) {  // the separate items of a line, or null
      if (generalMatch(text)) return null;
      const ws = text.trim().split(/[\s,]+/).filter((w) => w && w !== "ו")
        .map((w) => (!itemWord(norm(w)) && w.startsWith("ו") && itemWord(norm(w.slice(1))) ? w.slice(1) : w));
      return ws.length >= 2 && ws.every((w) => itemWord(norm(w))) ? ws : null;
    }

    return { byCat, unitOf, bestSwap, costAt, hasWord, generalMatch, generalAt, cardDiscount, cardNote, compareHtml, planHtml, isMultipack,
             typoFix, splitOf };
  };
})();
