// The fruits and vegetables offered for a "פירות" / "ירקות" line of the notes list (notes.js), editable in
// settings.html ("פירות וירקות לבחירה"). The defaults are what the stores sold fresh on 2026-09-30. Edited
// lists are shared by both phones: they live in the list's list.json ("groups", basket.js groupGet /
// groupSet, synced with the same GitHub key; the newer edit wins).
(function () {
  const DEFAULTS = {
    "פירות": ["תפוחים", "בננות", "תפוזים", "קלמנטינות", "אגסים", "נקטרינות", "אפרסקים", "שזיפים", "ענבים",
              "תותים", "אבטיח", "מלון", "מנגו", "קיווי", "אבוקדו", "רימונים", "אשכוליות", "לימונים", "פומלות",
              "דובדבנים", "תאנים", "אפרסמון", "אננס"],
    "ירקות": ["עגבניות", "עגבניות שרי", "מלפפונים", "פלפלים", "בצל", "תפוחי אדמה", "בטטות", "גזר", "חסה",
              "כרוב", "כרובית", "ברוקולי", "קישואים", "שום", "שעועית ירוקה", "פטריות", "סלק",
              "דלעת", "צנוניות", "בצל ירוק", "פטרוזיליה", "כוסברה", "שמיר", "נענע"],
    "פיצוחים": ["גרעינים שחורים", "גרעינים לבנים", "גרעיני חמנייה", "גרעיני דלעת", "בוטנים", "בוטנים אמריקאים",
                "שקדים", "קשיו", "פיסטוקים", "אגוזי מלך", "אגוזי לוז", "אגוזי פקאן", "אגוזי ברזיל", "מקדמיה",
                "צנוברים", "תערובת פיצוחים"],
  };
  const B = () => window.Basket;
  function get(group) {
    const own = B() && B().groupGet(group);
    return own && Array.isArray(own.items) ? own.items.slice() : DEFAULTS[group].slice();
  }
  const set = (group, list) => B().groupSet(group, list);
  const reset = (group) => B().groupSet(group, null);
  window.Groups = { names: Object.keys(DEFAULTS), get, set, reset };
})();
