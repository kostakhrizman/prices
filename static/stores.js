// Which stores this phone shows (settings.html). Saved per phone in localStorage "storesOn" as
// {store key: true/false}; a store never chosen follows its default (config.Store.default_on), so a
// store added later appears only if it is on by default. At least one store always stays on.
// Loaded in <head>: marks <html class="stores-custom"> when the choice differs from the defaults, so a
// pre-built category page (drawn for the default stores) hides its list until it is redrawn.
(function () {
  const list = JSON.parse(document.currentScript.dataset.stores);  // [{key, short, default, card_rate, card_cap}]
  function saved() {
    try { return JSON.parse(localStorage.getItem("storesOn")) || {}; } catch (e) { return {}; }
  }
  // is each store on: {key: bool}
  function choice() {
    const s = saved(), on = {};
    for (const st of list) on[st.key] = st.key in s ? !!s[st.key] : st.default;
    if (!Object.values(on).some(Boolean)) for (const st of list) on[st.key] = st.default;
    return on;
  }
  const custom = () => { const on = choice(); return list.some((st) => on[st.key] !== st.default); };
  function set(key, value) {
    const s = saved();
    s[key] = value;
    try { localStorage.setItem("storesOn", JSON.stringify(s)); } catch (e) { /* private mode */ }
  }
  if (custom()) document.documentElement.classList.add("stores-custom");

  // "חנויות: ויקטורי · רמי לוי" on the home page
  document.addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("stores-on");
    if (el) { const on = choice(); el.textContent = [...new Set(list.filter((st) => on[st.key]).map((st) => st.short))].join(" · "); }
  });

  window.Stores = { list, choice, custom, set };
})();
