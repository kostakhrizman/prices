// Which kinds of processed food this phone hides (settings.html, card "מארזים ומעובדים"). Saved per phone in
// localStorage "avoidKinds" as {kind name: true}; nothing is hidden until a kind is ticked. A kind's number
// (1 chicken, 2 meat; grocery/processed.py KINDS) is the 7th value of a products.json row (it.kind in render.js),
// data-kind on a pre-built category page's rows and "kind" on a deals.json entry.
// Loaded in <head>: hides the ticked kinds' rows on a pre-built category page before it is drawn. What is already
// on the shopping list is never hidden (basket-page.js tags it "מעובד").
(function () {
  const kinds = JSON.parse(document.currentScript.dataset.kinds);  // names, in number order
  function saved() {
    try { return JSON.parse(localStorage.getItem("avoidKinds")) || {}; } catch (e) { return {}; }
  }
  // the numbers of the ticked kinds
  function on() {
    const s = saved();
    return new Set(kinds.map((k, i) => (s[k] ? i + 1 : 0)).filter(Boolean));
  }
  const hides = (kind) => Boolean(kind) && on().has(Number(kind));
  function set(name, value) {
    const s = saved();
    s[name] = Boolean(value);
    try { localStorage.setItem("avoidKinds", JSON.stringify(s)); } catch (e) { /* private mode */ }
  }
  // "הוסתרו 12 מוצרים מעובדים · הגדרות", for a page that left some out
  const note = (n) => (n ? `<p class="sub avoid-note">${n === 1 ? "הוסתר מוצר מעובד אחד" : `הוסתרו ${n} מוצרים מעובדים`} · <a href="settings.html#packs">הגדרות</a></p>` : "");
  const now = on();
  if (now.size) {
    const css = document.createElement("style");
    css.textContent = [...now].map((k) => `#cat-list li.product[data-kind="${k}"]`).join(",") + "{display:none}";
    document.head.appendChild(css);
  }
  window.Avoid = { kinds, on, hides, set, note };
})();
