/*
 * Liquidify — liquidify-core.js
 * Shared foundation for the other Liquidify extensions:
 *   - Liquidify.store     small persistent settings store (localStorage, JSON only)
 *   - Liquidify.idb       IndexedDB blob storage (used for the wallpaper image)
 *   - Liquidify.computeFit / refSize   pure fit-mode maths
 *   - Liquidify.notify    toast helper
 *
 * Persistence notes
 *  - Spicetify extensions all run inside the same Spotify "xpui" page, so they share
 *    one localStorage / IndexedDB origin. Settings written here survive restarts.
 *  - The wallpaper image itself is NEVER put in localStorage (size limit); it is stored
 *    as a Blob in IndexedDB. localStorage only holds the numbers (zoom, x, y, ...).
 */
(function () {
  "use strict";
  if (window.Liquidify && window.Liquidify.store) return;

  const KEY = "liquidify:settings:v1";

  const DEFAULTS = {
    v: 1,
    dynamicAccent: true,
    lite: false,        // performance mode: disables backdrop-filter
    panelBlur: 24,      // px, backdrop blur of glass panels
    glassTint: 7,       // % white sheen of glass panels
    wallpaper: {
      has: false, name: "", nw: 0, nh: 0, rev: 0, url: "",   // url = hotlinked image (only used when it could not be saved locally)
      // Placement is stored in absolute CSS pixels, measured from the window's top-left.
      // Nothing recomputes it on resize (unless autoRefit is explicitly enabled).
      sx: 1, sy: 1, x: 0, y: 0,
      mode: "cover",    // cover | contain | stretch | width | height | original | custom
      ref: "screen",    // size the fit modes are computed against: screen | window
      autoRefit: false,
      brightness: 100, contrast: 100, blur: 0, opacity: 100, overlay: 25
    }
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  function merge(a, b) {
    const out = Object.assign({}, a);
    for (const k of Object.keys(b || {})) out[k] = isObj(b[k]) && isObj(a[k]) ? merge(a[k], b[k]) : b[k];
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return merge(clone(DEFAULTS), raw ? JSON.parse(raw) : {});
    } catch (e) {
      return clone(DEFAULTS);
    }
  }

  let state = load();
  const subs = new Set();

  const store = {
    get: () => state,
    set(patch) {
      state = merge(state, patch);
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) { console.warn("[Liquidify] could not persist settings", e); }
      subs.forEach((fn) => { try { fn(state, patch); } catch (e) { console.error("[Liquidify]", e); } });
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  };

  // ---- global glass settings -> <html> classes / CSS variables -------------------------
  function applyGlobals() {
    const r = document.documentElement;
    r.classList.add("liquidify");
    r.classList.toggle("liquidify-lite", !!state.lite);
    r.style.setProperty("--lq-blur", state.panelBlur + "px");
    r.style.setProperty("--lq-tint", (state.glassTint / 100).toFixed(3));
  }
  applyGlobals();
  store.subscribe((s, patch) => {
    if ("lite" in patch || "panelBlur" in patch || "glassTint" in patch) applyGlobals();
  });

  // ---- IndexedDB blob store -----------------------------------------------------------
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open("liquidify", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("blobs");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function run(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction("blobs", mode);
      const rq = fn(t.objectStore("blobs"));
      t.oncomplete = () => resolve(rq && rq.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("IndexedDB transaction aborted"));
    });
  }
  const idb = {
    put: (key, blob) => run("readwrite", (s) => s.put(blob, key)),
    get: (key) => run("readonly", (s) => s.get(key)),
    del: (key) => run("readwrite", (s) => s.delete(key))
  };

  // ---- fit maths (pure) ---------------------------------------------------------------
  // Reference rectangle the fit modes are computed against. "screen" (default) uses the
  // monitor size so a fitted wallpaper still covers the window after you maximise it.
  function refSize(ref) {
    const w = window.innerWidth, h = window.innerHeight;
    if (ref === "window") return { w, h };
    return { w: Math.max((window.screen && screen.width) || 0, w), h: Math.max((window.screen && screen.height) || 0, h) };
  }

  // Returns the absolute placement {sx, sy, x, y} of an nw x nh image inside rw x rh.
  function computeFit(mode, nw, nh, rw, rh, ax, ay) {
    ax = ax == null ? 0.5 : ax; ay = ay == null ? 0.5 : ay;
    let sx, sy;
    switch (mode) {
      case "contain": sx = sy = Math.min(rw / nw, rh / nh); break;
      case "stretch": sx = rw / nw; sy = rh / nh; break;
      case "width": sx = sy = rw / nw; break;
      case "height": sx = sy = rh / nh; break;
      case "original": sx = sy = 1; break;
      case "cover": default: sx = sy = Math.max(rw / nw, rh / nh);
    }
    return { sx, sy, x: (rw - nw * sx) * ax, y: (rh - nh * sy) * ay };
  }

  function notify(msg) {
    try {
      if (window.Spicetify && Spicetify.showNotification) return Spicetify.showNotification(msg);
    } catch (e) { /* ignore */ }
    console.log("[Liquidify]", msg);
  }

  window.Liquidify = Object.assign(window.Liquidify || {}, {
    version: "1.0.0", defaults: DEFAULTS, store, idb, computeFit, refSize, notify, clone
  });
})();
