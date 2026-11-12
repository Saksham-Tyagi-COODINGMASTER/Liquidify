/*
 * Liquidify — liquidify-wallpaper.js  (wallpaper engine)
 *
 * Renders the wallpaper in its OWN layer: <div id="liquidify-wallpaper"> fixed to the
 * viewport, behind every Spotify element (z-index:-1). The <img> inside it is sized to
 * its natural pixel size and placed with   transform: translate(x px, y px) scale(sx, sy)
 * measured from the window's top-left corner.
 *
 * Because x / y / scale are absolute numbers (not percentages, not "cover"), resizing the
 * Spotify window just reveals or crops more of the same image — it never moves or rescales.
 * The only code that recomputes placement is (a) an explicit user action in Wallpaper
 * Studio, and (b) the opt-in "auto re-fit" checkbox (off by default).
 */
(function () {
  "use strict";
  function when(test, cb) {
    if (test()) return cb();
    let n = 0;
    const t = setInterval(() => { if (test()) { clearInterval(t); cb(); } else if (++n > 300) clearInterval(t); }, 100);
  }
  when(() => window.Liquidify && window.Liquidify.store && document.body, init);

  function init() {
    const L = window.Liquidify, store = L.store;
    const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];
    const OK_EXT = /\.(jpe?g|png|webp)$/i;
    let layer, img, live = null; // live = { url, revoke }

    const WP_INNER = '<div class="lq-wp-base"></div><img class="lq-wp-img" alt="" draggable="false"><div class="lq-wp-overlay"></div>';

    function ensureLayer() {
      if (layer && layer.isConnected) return;
      layer = document.createElement("div");
      layer.id = "liquidify-wallpaper";
      layer.className = "lq-wp";
      layer.setAttribute("aria-hidden", "true");
      layer.innerHTML = WP_INNER;
      document.body.insertBefore(layer, document.body.firstChild);
      img = layer.querySelector(".lq-wp-img");
    }

    // Paint a wallpaper description into any ".lq-wp" root (the live layer AND the Studio preview).
    function paint(root, wp) {
      const im = root.querySelector(".lq-wp-img");
      const ov = root.querySelector(".lq-wp-overlay");
      const show = wp.has && wp.nw > 0 && im.getAttribute("src");
      im.style.display = show ? "block" : "none";
      if (show) {
        const avg = Math.max(0.01, (wp.sx + wp.sy) / 2);
        im.style.width = wp.nw + "px";
        im.style.height = wp.nh + "px";
        im.style.transform = "translate3d(" + wp.x + "px," + wp.y + "px,0) scale(" + wp.sx + "," + wp.sy + ")";
        im.style.opacity = String(wp.opacity / 100);
        // Blur is divided by the scale so the on-screen blur radius equals the slider value.
        im.style.filter = "brightness(" + wp.brightness / 100 + ") contrast(" + wp.contrast / 100 + ")" +
          (wp.blur > 0 ? " blur(" + (wp.blur / avg).toFixed(2) + "px)" : "");
      }
      ov.style.background = "rgba(0,0,0," + (wp.overlay / 100) + ")";
    }

    // blob -> a URL the page is actually allowed to load (blob: first, data: as fallback).
    async function usableUrl(blob) {
      const u = URL.createObjectURL(blob);
      const ok = await new Promise((res) => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = u; });
      if (ok) return { url: u, revoke: () => URL.revokeObjectURL(u) };
      URL.revokeObjectURL(u);
      const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
      return { url: data, revoke() {} };
    }
    const dims = (url) => new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => rej(new Error("decode failed"));
      i.src = url;
    });

    async function readImage(file) {
      if (!(OK_TYPES.includes(file.type) || OK_EXT.test(file.name || ""))) throw new Error("Unsupported file type. Use JPG, PNG or WEBP.");
      const u = await usableUrl(file);
      try {
        const d = await dims(u.url);
        return { blob: file, url: u.url, revoke: u.revoke, nw: d.w, nh: d.h, name: file.name || "wallpaper" };
      } catch (e) {
        u.revoke();
        throw new Error("That file could not be decoded as an image.");
      }
    }

    const nameFromUrl = (u) => { try { return decodeURIComponent(new URL(u).pathname.split("/").pop()) || "web-image"; } catch (e) { return "web-image"; } };
    const loadImg = (url, cors) => new Promise((res, rej) => {
      const i = new Image(); if (cors) i.crossOrigin = "anonymous";
      i.onload = () => res(i); i.onerror = () => rej(new Error("load failed")); i.src = url;
    });

    // Import by URL. Tries, in order:
    //  1. fetch() -> Blob            (saved locally; needs CORS + Spotify's CSP to allow it)
    //  2. <img crossorigin> -> canvas -> Blob   (saved locally; needs CORS headers on the image)
    //  3. plain <img> hotlink        (always displays, but only the URL is saved, not the image)
    async function readUrl(raw) {
      let url;
      try { url = new URL(String(raw).trim()); } catch (e) { throw new Error("That is not a valid URL."); }
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) image URLs are supported.");
      url = url.href;
      const name = nameFromUrl(url);
      try {                                                            // 1
        const r = await fetch(url, { mode: "cors", cache: "force-cache" });
        if (!r.ok) throw new Error("http " + r.status);
        const b = await r.blob();
        if (!/^image\/(jpeg|png|webp)/.test(b.type)) throw new Error("type");
        const u = await usableUrl(b), d = await dims(u.url);
        return { blob: b, url: u.url, revoke: u.revoke, nw: d.w, nh: d.h, name, remote: false };
      } catch (e1) { /* fall through */ }
      try {                                                            // 2
        const i = await loadImg(url, true);
        const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight;
        c.getContext("2d").drawImage(i, 0, 0);
        const png = /\.png(\?|$)/i.test(url);
        const b = await new Promise((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error("toBlob"))), png ? "image/png" : "image/jpeg", 0.95));
        const u = await usableUrl(b);
        return { blob: b, url: u.url, revoke: u.revoke, nw: i.naturalWidth, nh: i.naturalHeight, name, remote: false };
      } catch (e2) { /* fall through */ }
      try {                                                            // 3
        const i = await loadImg(url, false);
        return { blob: null, url, revoke() {}, nw: i.naturalWidth, nh: i.naturalHeight, name, remote: true };
      } catch (e3) { throw new Error("Could not load an image from that URL."); }
    }

    async function showBlob(blob) {
      const u = await usableUrl(blob);
      if (live) live.revoke();
      live = u;
      img.src = u.url;
    }

    // Persist (image -> IndexedDB, numbers -> settings store) and display.
    async function commit(wp, blob) {
      const next = Object.assign({}, wp);
      if (blob) {
        await L.idb.put("wallpaper", blob);
        next.rev = (store.get().wallpaper.rev || 0) + 1;
        next.url = "";
        await showBlob(blob);                    // set <img> first so there is no flash
      } else if (next.url) {                     // hotlinked image: remember only the URL
        await L.idb.del("wallpaper");
        if (live) { live.revoke(); live = null; }
        img.src = next.url;
      }
      store.set({ wallpaper: next });            // -> subscriber repaints
    }

    async function remove() {
      await L.idb.del("wallpaper");
      if (live) { live.revoke(); live = null; }
      img.removeAttribute("src");
      store.set({ wallpaper: { has: false, name: "", nw: 0, nh: 0, url: "" } });
    }

    async function loadSaved() {
      const wp = store.get().wallpaper;
      if (!wp.has) return paint(layer, wp);
      if (wp.url) {                                // hotlinked wallpaper
        img.onerror = () => L.notify("Liquidify: the wallpaper URL could not be loaded. Re-import it in Wallpaper Studio.");
        img.src = wp.url; paint(layer, wp); return;
      }
      try {
        const blob = await L.idb.get("wallpaper");
        if (!blob) throw new Error("missing");
        await showBlob(blob);
        paint(layer, store.get().wallpaper);
      } catch (e) {
        store.set({ wallpaper: { has: false } });
        L.notify("Liquidify: saved wallpaper could not be loaded. Re-import it in Wallpaper Studio.");
      }
    }

    ensureLayer();
    paint(layer, store.get().wallpaper);
    loadSaved();
    store.subscribe((s, patch) => { if (patch.wallpaper) { ensureLayer(); paint(layer, s.wallpaper); } });

    // Opt-in only: re-fit on resize. With autoRefit off (default) this does nothing at all.
    let rt = null;
    window.addEventListener("resize", () => {
      const wp = store.get().wallpaper;
      if (!wp.has || !wp.autoRefit || wp.mode === "custom") return;
      clearTimeout(rt);
      rt = setTimeout(() => {
        const r = L.refSize(wp.ref);
        store.set({ wallpaper: L.computeFit(wp.mode, wp.nw, wp.nh, r.w, r.h) });
      }, 150);
    }, { passive: true });

    L.wallpaper = { paint, readImage, readUrl, usableUrl, commit, remove, WP_INNER, currentSrc: () => (img ? img.getAttribute("src") : null) };
    window.dispatchEvent(new Event("liquidify:wallpaper-ready"));
  }
})();
