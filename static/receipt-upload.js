// Sending a receipt photo to the private list repository, shared by the compare page (receipt.js) and
// the spending page (spending.js): receipts/<id>.jpg plus receipts/<id>.json {status: "pending", ...};
// the home PC reads it (grocery/receipts.py). `extra` goes into the json, e.g. {kind: "spending"} for a
// receipt taken only to count spending (the compare page leaves those out).
(function () {
  const G = window.Basket.github;
  const MAX_SIDE = 1800;  // px; enough for Claude to read small print, small enough to upload fast

  async function api(path, options = {}) {
    const r = await fetch(G.url(path), { ...options, headers: G.headers(), cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return r.json();
  }
  const put = (path, content, message, sha) =>
    api(path, { method: "PUT", body: JSON.stringify({ message, content, ...(sha ? { sha } : {}) }) });

  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        resolve(canvas.toDataURL("image/jpeg", 0.82).split(",")[1]);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // returns the new receipt's id
  async function upload(file, extra = {}) {
    const jpeg = await shrink(file);
    const now = new Date();
    const id = now.toISOString().replace(/[-:T]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 6);
    await put(`receipts/${id}.jpg`, jpeg, "Receipt photo");
    await put(`receipts/${id}.json`, G.encode(JSON.stringify({ status: "pending", uploaded_at: now.toISOString(), ...extra })),
      "Receipt to read");
    return id;
  }

  // deletes the photo and the reading
  async function remove(id) {
    for (const name of [`${id}.json`, `${id}.jpg`]) {
      const f = await api(`receipts/${name}`);
      if (f) await api(`receipts/${name}`, { method: "DELETE", body: JSON.stringify({ message: "Delete receipt", sha: f.sha }) });
    }
  }

  window.ReceiptUpload = { api, put, upload, remove };
})();
