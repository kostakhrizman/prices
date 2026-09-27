// The deals page: the watch tab (static/watch.js), then data/deals.json (grocery/deals.py) in four tabs, leaving out stores this phone
// turned off (static/stores.js). An entry: {key, name, store, price, deal, conditions, was?, pct?,
// other?, similar?: {name, store, unit_price}, unit_price?, unit_label?, note?, variants?}; price is
// what you pay, was the price it's set against (shelf, the other store, or the price before a drop),
// similar the cheapest similar product elsewhere for a product only one store sells.
(function () {
  const { esc, money } = window.Render;
  const build = document.currentScript.dataset.build;
  const out = document.getElementById("deals"), tabs = document.getElementById("deal-tabs");
  const SUSPECT_PCT = 80;  // this far below: maybe a typo in the chain's file
  const TABS = [
    ["watch", "המעקב שלי", "מוצרים כלליים שאתם עוקבים אחריהם: רק מה שחדש מאז שהוספתם, כשמוצר כזה נכנס למבצע, יורד במחיר או זול בבירור מהמתחרים."],
    ["electric", "חשמל", "כל מוצרי החשמל שנמכרו בשבועיים האחרונים, החדשים למעלה. מה שלא נמכר ביממה האחרונה מסומן ״אולי אזל״."],
    ["home", "לבית", "כל כלי הבית שנמכרו בחמשת הימים האחרונים, החדשים למעלה. מה שלא נמכר ביממה האחרונה מסומן ״אולי אזל״."],
    ["big", "הנחות ענק", "מבצעים של 40% ומעלה שחוסכים לפחות ₪8, ומוצרים זולים מאוד מלכתחילה: חצי מחיר מבחנות אחרות, או רבע ממחיר הדומה הזול בשאר החנויות."],
    ["drops", "ירידות מחיר", "מחירי מדף שירדו ב־20% ומעלה בחודש האחרון."],
  ];
  const TAB_KEY = "dealsTab";
  let data = null, tab = null, dept = "";  // dept: the department shown in הנחות ענק ("" = all)
  // the name filter (the user, 2026-10-02), as the category pages' (static/category.js): every word in the name
  // (singular = plural), "-word" hides; it hides cards in place, so typing keeps the focus; kept across tabs
  let query = "";
  // "סינון" on the חשמל / לבית tabs (the user, 2026-10-07), as the subcategory pages': ticked kinds (data.facets, from
  // grocery/facets.py; a card stays when its name has every word of one of them) and ticked shops
  const FACET_TABS = new Set(["electric", "home"]);
  const kinds = new Set(), shops = new Set();
  let facetOpen = false;
  function facetHtml(list) {
    if (!FACET_TABS.has(tab)) return null;
    const { norm, hasStem } = window.Render;
    const names = list.map((e) => norm(e.name));
    const rows = ((data.facets || {})[tab] || []).map((f) => {
      const ws = norm(f).split(/\s+/).filter(Boolean);
      return [f, names.filter((n) => ws.every((w) => hasStem(n, w))).length];
    }).filter(([, n]) => n);
    const shopRows = [...new Set(list.map((e) => shortOf(e.store)))].map((s) => [s, list.filter((e) => shortOf(e.store) === s).length]);
    if (!rows.length && shopRows.length < 2) return null;
    const box = (group, [label, n], set) => `<label class="facet"><input type="checkbox" data-facet="${group}" value="${esc(label)}"${
      set.has(label) ? " checked" : ""}> <span>${esc(label)}</span> <small>${n}</small></label>`;
    const n = kinds.size + shops.size;
    return { btn: `<button type="button" class="facet-btn${n ? " on" : ""}" data-facet-open aria-expanded="${facetOpen}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>
        <span>סינון</span><b class="facet-n"${n ? "" : " hidden"}>${n}</b></button>`,
      list: `<div class="facet-list"${facetOpen ? "" : " hidden"}>
        ${rows.length ? `<div class="facet-items">${rows.map((r) => box("kind", r, kinds)).join("")}</div>` : ""}
        ${shopRows.length > 1 ? `<div class="facet-title">חנויות</div><div class="facet-items">${shopRows.map((r) => box("shop", r, shops)).join("")}</div>` : ""}
        <div class="facet-actions"><button type="button" class="link" data-facet-clear>ניקוי</button>
          <button type="button" data-facet-done>הצגה</button></div></div>` };
  }
  function applyFilter() {
    const { norm, hasStem } = window.Render;
    const kindWords = [...kinds].map((k) => norm(k).split(/\s+/).filter(Boolean));
    const words = norm(query).split(/\s+/).filter((w) => w && w !== "-");
    const want = words.filter((w) => !w.startsWith("-")), hide = words.filter((w) => w.startsWith("-")).map((w) => w.slice(1));
    let shown = 0;
    out.querySelectorAll(".deal-card").forEach((li) => {
      const text = norm(li.dataset.text || "");
      const ok = want.every((w) => hasStem(text, w)) && !hide.some((w) => hasStem(text, w))
        && (!kindWords.length || kindWords.some((ws) => ws.every((w) => hasStem(text, w))))
        && (!shops.size || shops.has(li.dataset.shop));
      li.hidden = !ok;
      shown += ok;
    });
    const none = out.querySelector(".deal-none");
    if (none) none.hidden = !((words.length || kinds.size || shops.size) && !shown && out.querySelector(".deal-card"));
    const n = out.querySelector(".facet-n"), btn = out.querySelector(".facet-btn");
    if (n) { n.hidden = !(kinds.size + shops.size); n.textContent = kinds.size + shops.size; btn.classList.toggle("on", kinds.size + shops.size > 0); }
  }
  try { tab = localStorage.getItem(TAB_KEY); } catch (e) { /* private mode */ }

  const storesOn = () => {
    const on = window.Stores.choice();
    return window.Stores.list.map((s) => on[s.key]);
  };
  const shortOf = (i) => window.Stores.list[i].short;

  function cardHtml(e) {
    const pct = e.pct ? `<span class="deal-pct">−${e.pct}%</span>` : "";
    const was = e.was ? `<s>${money(e.was)}</s>` : "";
    const lines = [];
    if (e.deal) lines.push(`<span class="badge">${esc(e.deal)}</span> ${esc(e.conditions || "")}`);
    if (e.other !== undefined) lines.push(`ב${esc(shortOf(e.other))}: ${money(e.was)}`);
    if (e.similar) {
      lines.push(`${money(e.unit_price)} ${esc(e.unit_label)}; הדומה הזול ב${esc(shortOf(e.similar.store))}: ` +
        `${esc(e.similar.name)}, ${money(e.similar.unit_price)} ${esc(e.unit_label)}`);
    }
    if (e.note) lines.push(esc(e.note));
    if (e.variants) lines.push(`ועוד ${e.variants === 1 ? "צבע או דגם אחד" : `${e.variants} צבעים או דגמים`} באותו מחיר`);
    if (e.pct >= SUSPECT_PCT) lines.push('<span class="hint">מחיר חריג, כדאי לוודא בחנות</span>');
    return `<li class="product deal-card st-${e.store}" data-text="${esc(e.name)}" data-shop="${esc(shortOf(e.store))}">
      <div class="info"><div class="name">${esc(e.name)}${window.Render.soldMark(e)} ${window.Photo.button(e.key, e.name, esc, e.food, false,
        tab === "electric" || e.cat === "שונות > מוצרי חשמל")}</div>
        <div class="meta"><span class="store-tag">${esc(shortOf(e.store))}</span></div>
        ${lines.map((l) => `<div class="deal-line">${l}</div>`).join("")}</div>
      <div class="prices"><div class="deal-price">${money(e.price)}</div><div class="shelf">${e.other === undefined ? was : ""} ${pct}</div></div>
      <button class="add" type="button" data-add="${esc(e.key)}" data-name="${esc(e.name)}" aria-label="הוספה לרשימה">+</button></li>`;
  }

  function draw() {
    const on = storesOn();
    const shortList = window.Stores.list.map((s) => s.short);
    const oneEach = (list) => {  // Osher Ad's two branches: the cheaper entry of a product
      const keep = new Map();
      for (const e of list) {
        const id = e.key + "|" + shortList[e.store], had = keep.get(id);
        if (!had || e.price < had.price) keep.set(id, e);
      }
      return list.filter((e) => keep.get(e.key + "|" + shortList[e.store]) === e);
    };
    const lists = Object.fromEntries(TABS.map(([k]) => [k, oneEach((data[k] || []).filter((e) => on[e.store] && !window.Avoid.hides(e.kind)))]));
    if (!TABS.some(([k]) => k === tab)) tab = window.WatchView.count() ? "watch" : "home";
    tabs.innerHTML = TABS.map(([k, label]) => {
      const n = k === "watch" ? window.WatchView.count() : lists[k].length;  // watched words / deals
      return `<button type="button" role="tab" class="${k === tab ? "on" : ""}" data-tab="${k}">${label} <small>${n}</small></button>`;
    }).join("");
    const [, , about] = TABS.find(([k]) => k === tab);
    if (tab === "watch") {  // static/watch.js draws it
      out.innerHTML = `<p class="sub">${about}</p><div id="watch-view"></div>`;
      window.WatchView.draw(document.getElementById("watch-view"));
      return;
    }
    let list = lists[tab], chips = "";
    if (tab === "big" && list.length) {  // departments, the biggest first
      const counts = new Map();
      for (const e of list) counts.set(e.cat, (counts.get(e.cat) || 0) + 1);
      if (!counts.has(dept)) dept = "";
      chips = `<div class="dept-chips">${[["", "הכול", list.length], ...[...counts].sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, c, n])]
        .map(([c, label, n]) => `<button type="button" data-dept="${esc(c)}" class="${c === dept ? "on" : ""}">${esc(label)} <small>${n}</small></button>`).join("")}</div>`;
      if (dept) list = list.filter((e) => e.cat === dept);
    }
    const search = `<input type="search" class="deal-search cat-filter-input" value="${esc(query)}"
      placeholder="סינון לפי שם, למשל שעועית (מינוס לפני מילה מסתיר)" aria-label="סינון לפי שם">`;
    const facet = facetHtml(list);
    out.innerHTML = `<p class="sub">${about}</p>` + (facet ? `<div class="deal-filter-row">${search}${facet.btn}</div>${facet.list}` : search) + chips + (list.length
      ? `<ol class="products deal-list">${list.map(cardHtml).join("")}</ol><p class="empty deal-none" hidden>אין מוצרים כאלה בלשונית הזאת.</p>`
      : `<p class="empty">${tab === "drops" ? "עוד אין. המחשב מתחיל לעקוב אחרי שינויי מחיר מהיום, והרשימה תתמלא בימים הקרובים." : "אין כרגע מבצעים כאלה בחנויות שבחרת."}</p>`);
    applyFilter();
    if (window.Basket) window.Basket.update();
  }
  out.addEventListener("input", (e) => {
    if (!e.target.classList.contains("deal-search")) return;
    query = e.target.value;
    applyFilter();
  });

  out.addEventListener("change", (e) => {
    const g = e.target.dataset && e.target.dataset.facet;
    if (!g) return;
    const set = g === "kind" ? kinds : shops;
    if (e.target.checked) set.add(e.target.value); else set.delete(e.target.value);
    applyFilter();
  });
  out.addEventListener("click", (e) => {
    const f = e.target.closest("[data-facet-open], [data-facet-done], [data-facet-clear]");
    if (f) {
      const list = out.querySelector(".facet-list");
      if ("facetClear" in f.dataset) {
        kinds.clear(); shops.clear();
        list.querySelectorAll("input").forEach((b) => { b.checked = false; });
        applyFilter();
      } else {
        facetOpen = "facetOpen" in f.dataset ? list.hidden : false;
        list.hidden = !facetOpen;
      }
      return;
    }
    const t = e.target.closest("[data-dept]");
    if (!t) return;
    dept = t.dataset.dept;
    draw();
  });

  tabs.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (!t) return;
    tab = t.dataset.tab;
    kinds.clear(); shops.clear(); facetOpen = false;  // another tab has other kinds
    try { localStorage.setItem(TAB_KEY, tab); } catch (err) { /* private mode */ }
    draw();
  });

  fetch("data/deals.json?v=" + build).then((r) => r.json()).then((d) => { data = d; draw(); })
    .catch(() => { out.innerHTML = '<p class="empty">לא ניתן לטעון את המבצעים.</p>'; });
})();
