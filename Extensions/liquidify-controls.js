/*
 * Liquidify — liquidify-controls.js  (Wallpaper Studio UI)
 *
 * Entry points: a top-bar button (Spicetify.Topbar.Button) and a profile-menu item
 * (Spicetify.Menu.Item). Both are optional-guarded in case a Spotify build lacks them.
 *
 * Wallpaper edits happen on a *draft* copy shown in a live preview; nothing touches the real
 * wallpaper until "Apply". Interface options (glass blur, lite mode, dynamic accent) apply instantly.
 */
(function () {
  "use strict";
  const ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9zm1.5-.5a.5.5 0 0 0-.5.5v6.8l2.6-2.7a.8.8 0 0 1 1.1 0l1.8 1.8 1.2-1.2a.8.8 0 0 1 1.1 0L13 10.6V3.5a.5.5 0 0 0-.5-.5h-9zM10.5 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>';

  const SLIDERS = [
    ["brightness", "Brightness", 20, 160, "%"],
    ["contrast", "Contrast", 50, 150, "%"],
    ["blur", "Blur", 0, 40, "px"],
    ["opacity", "Opacity", 0, 100, "%"],
    ["overlay", "Dark overlay", 0, 90, "%"]
  ];
  const row = (k, label, min, max, unit) =>
    '<label class="lq-row"><span>' + label + '</span><input type="range" data-k="' + k + '" min="' + min + '" max="' + max + '" step="1"><output data-o="' + k + '" data-u="' + unit + '"></output></label>';

  function template(WP_INNER) {
    return '' +
      '<div class="lq-panel" role="dialog" aria-label="Wallpaper Studio">' +
      '<header class="lq-head"><div><h2>Wallpaper Studio</h2><p>Position, scale and tune your wallpaper. Changes preview here until you press Apply.</p></div>' +
      '<button class="lq-x" data-act="close" aria-label="Close">\u00d7</button></header>' +
      '<section class="lq-left"><div class="lq-pvwrap"><div class="lq-pv" data-el="pv">' +
      '<div class="lq-wp lq-pv-stage" data-el="stage">' + WP_INNER +
      '<div class="lq-pv-ui"><div class="lq-pv-g lq-pv-side"></div><div class="lq-pv-g lq-pv-main"></div><div class="lq-pv-g lq-pv-bar"></div></div></div>' +
      '<div class="lq-pv-empty" data-el="empty">Upload or drop an image</div></div></div>' +
      '<p class="lq-hint">Drag to move \u00b7 scroll to zoom \u00b7 drop an image to replace</p></section>' +
      '<section class="lq-right">' +
      '<div class="lq-sec"><h3>Image</h3><div class="lq-line"><button class="lq-btn pri" data-act="upload">Upload wallpaper</button><span class="lq-name" data-el="name">No image</span></div>' +
      '<div class="lq-line" style="flex-wrap:nowrap"><input type="url" data-el="url" placeholder="\u2026or paste an image URL (https://)" spellcheck="false" style="flex:1;min-width:0;background:rgba(255,255,255,.10);color:#f5f5f7;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:8px 12px;font:inherit;font-size:12.5px;outline:none"><button class="lq-btn" data-act="url">Load</button></div>' +
      '<input type="file" hidden data-el="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"></div>' +
      '<div class="lq-sec"><h3>Fit</h3>' +
      '<label class="lq-row"><span>Mode</span><select data-k="mode"><option value="cover">Cover \u2013 fill screen</option><option value="contain">Contain \u2013 fit to screen</option><option value="stretch">Stretch</option><option value="width">Fit width</option><option value="height">Fit height</option><option value="original">Original size</option><option value="custom">Custom</option></select></label>' +
      '<label class="lq-row"><span>Fit to</span><select data-k="ref"><option value="screen">Monitor size</option><option value="window">Current window size</option></select></label>' +
      '<label class="lq-check"><input type="checkbox" data-k="autoRefit"><span>Re-fit automatically when the window is resized <em>(off = wallpaper never moves)</em></span></label></div>' +
      '<div class="lq-sec"><h3>Position &amp; zoom</h3>' +
      '<div class="lq-align" data-el="align">' + [[0, 0], [.5, 0], [1, 0], [0, .5], [.5, .5], [1, .5], [0, 1], [.5, 1], [1, 1]].map((a) => '<button data-ax="' + a[0] + '" data-ay="' + a[1] + '" aria-label="Align"></button>').join("") + '</div>' +
      '<label class="lq-row"><span>X offset</span><input type="range" data-k="x" min="-3000" max="3000" step="1"><input type="number" class="lq-num" data-k="x" step="1"></label>' +
      '<label class="lq-row"><span>Y offset</span><input type="range" data-k="y" min="-3000" max="3000" step="1"><input type="number" class="lq-num" data-k="y" step="1"></label>' +
      '<div class="lq-row"><span>Zoom</span><input type="range" data-zoom min="5" max="400" step="1"><output data-o="zoom" data-u="%"></output></div>' +
      '<div class="lq-line"><button class="lq-btn" data-act="zoomout">\u2212 Zoom out</button><button class="lq-btn" data-act="zoomin">+ Zoom in</button></div></div>' +
      '<div class="lq-sec"><h3>Appearance</h3>' + SLIDERS.map((s) => row(s[0], s[1], s[2], s[3], s[4])).join("") + '</div>' +
      '<div class="lq-sec"><h3>Interface <small>applies instantly</small></h3>' +
      '<label class="lq-check"><input type="checkbox" data-g="dynamicAccent"><span>Dynamic accent from album artwork</span></label>' +
      '<label class="lq-check"><input type="checkbox" data-g="lite"><span>Lite mode <em>(no backdrop blur, best performance)</em></span></label>' +
      '<label class="lq-row"><span>Glass blur</span><input type="range" data-g="panelBlur" min="0" max="60" step="1"><output data-og="panelBlur" data-u="px"></output></label>' +
      '<label class="lq-row"><span>Glass sheen</span><input type="range" data-g="glassTint" min="0" max="25" step="1"><output data-og="glassTint" data-u="%"></output></label></div>' +
      '</section>' +
      '<footer class="lq-foot"><div><button class="lq-btn" data-act="resetpos">Reset position</button><button class="lq-btn" data-act="resetall">Reset all</button><button class="lq-btn danger" data-act="remove">Remove wallpaper</button></div>' +
      '<div><button class="lq-btn" data-act="close">Cancel</button><button class="lq-btn pri" data-act="apply">Apply</button></div></footer></div>';
  }

  function when(test, cb, max) {
    if (test()) return cb();
    let n = 0;
    const t = setInterval(() => { if (test()) { clearInterval(t); cb(); } else if (++n > (max || 300)) { clearInterval(t); cb(); } }, 100);
  }
  when(() => window.Liquidify && Liquidify.wallpaper && document.body, init, 300);

  function init() {
    const L = window.Liquidify;
    if (!L || !L.wallpaper) { console.error("[Liquidify] wallpaper engine did not load; Wallpaper Studio disabled."); return; }
    const store = L.store;
    let root = null, el = {}, d = null, dBlob = null, dRevoke = null, k = 1, align = { ax: 0.5, ay: 0.5 }, drag = null, raf = 0, removeArmed = false;

    // ---------- build ----------
    function build() {
      root = document.createElement("div");
      root.id = "lq-studio";
      root.innerHTML = template(L.wallpaper.WP_INNER);
      document.body.appendChild(root);
      el.pv = root.querySelector('[data-el="pv"]'); el.stage = root.querySelector('[data-el="stage"]');
      el.img = el.stage.querySelector(".lq-wp-img"); el.empty = root.querySelector('[data-el="empty"]');
      el.name = root.querySelector('[data-el="name"]'); el.file = root.querySelector('[data-el="file"]');
      bind();
    }

    function bind() {
      root.addEventListener("click", (e) => {
        if (e.target === root) return close();
        const b = e.target.closest("[data-act]"); if (b) return act(b.dataset.act, b);
        const a = e.target.closest("[data-ax]"); if (a) return setAlign(+a.dataset.ax, +a.dataset.ay);
      });
      root.querySelector(".lq-right").addEventListener("input", (e) => {
        const t = e.target;
        if (t.dataset.k) return field(t.dataset.k, t);
        if (t.hasAttribute("data-zoom")) return zoomTo(+t.value / 100);
        if (t.dataset.g) { store.set({ [t.dataset.g]: t.type === "checkbox" ? t.checked : +t.value }); syncGlobals(); }
      });
      el.url = root.querySelector('[data-el="url"]');
      el.url.addEventListener("keydown", (e) => { if (e.key === "Enter") loadUrl(); e.stopPropagation(); });
      el.file.addEventListener("change", () => { if (el.file.files[0]) loadFile(el.file.files[0]); el.file.value = ""; });
      // drag to move
      el.pv.addEventListener("pointerdown", (e) => { if (!d.has) return; drag = { x: e.clientX, y: e.clientY, ox: d.x, oy: d.y }; el.pv.setPointerCapture(e.pointerId); el.pv.classList.add("drag"); });
      el.pv.addEventListener("pointermove", (e) => { if (!drag) return; d.x = Math.round(drag.ox + (e.clientX - drag.x) / k); d.y = Math.round(drag.oy + (e.clientY - drag.y) / k); d.mode = "custom"; sync(); });
      const end = () => { drag = null; el.pv.classList.remove("drag"); };
      el.pv.addEventListener("pointerup", end); el.pv.addEventListener("pointercancel", end);
      // wheel zoom around cursor
      el.pv.addEventListener("wheel", (e) => {
        if (!d.has) return; e.preventDefault();
        const r = el.pv.getBoundingClientRect();
        zoomBy(Math.exp(-e.deltaY * 0.0015), (e.clientX - r.left) / k, (e.clientY - r.top) / k);
      }, { passive: false });
      // drop an image onto the preview
      el.pv.addEventListener("dragover", (e) => e.preventDefault());
      el.pv.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });
    }

    // ---------- draft operations ----------
    function applyFit(mode) {
      const r = L.refSize(d.ref);
      Object.assign(d, L.computeFit(mode, d.nw, d.nh, r.w, r.h, align.ax, align.ay));
      d.mode = mode; sync();
    }
    function setAlign(ax, ay) {
      if (!d.has) return;
      const r = L.refSize(d.ref); align = { ax, ay };
      d.x = Math.round((r.w - d.nw * d.sx) * ax); d.y = Math.round((r.h - d.nh * d.sy) * ay); sync();
    }
    function zoomBy(r, cx, cy) {
      const big = Math.max(d.sx, d.sy) * r, small = Math.min(d.sx, d.sy) * r;
      if (big > 8 || small < 0.02) return;
      d.sx *= r; d.sy *= r; d.x = Math.round(cx - (cx - d.x) * r); d.y = Math.round(cy - (cy - d.y) * r); d.mode = "custom"; sync();
    }
    function zoomTo(target) { if (d.has) zoomBy(target / d.sx, window.innerWidth / 2, window.innerHeight / 2); }
    function field(key, t) {
      if (key === "mode") { if (t.value === "custom") return; align = { ax: 0.5, ay: 0.5 }; return d.has ? applyFit(t.value) : (d.mode = t.value, sync()); }
      if (key === "ref") { d.ref = t.value; return d.has && d.mode !== "custom" ? applyFit(d.mode) : sync(); }
      if (key === "autoRefit") { d.autoRefit = t.checked; return sync(); }
      const v = parseFloat(t.value); if (isNaN(v)) return;
      d[key] = v; if (key === "x" || key === "y") d.mode = "custom";
      sync();
    }
    async function loadFile(file) {
      try {
        const info = await L.wallpaper.readImage(file);
        if (dRevoke) dRevoke();
        dBlob = info.blob; dRevoke = info.revoke; el.img.src = info.url;
        d.has = true; d.nw = info.nw; d.nh = info.nh; d.name = info.name; d.url = "";
        align = { ax: 0.5, ay: 0.5 }; applyFit("cover");
      } catch (e) { L.notify(e.message || "Could not load image"); }
    }
    async function loadUrl() {
      const v = el.url.value.trim(); if (!v) return;
      const btn = root.querySelector('[data-act="url"]'); btn.textContent = "Loading\u2026";
      try {
        const info = await L.wallpaper.readUrl(v);
        if (dRevoke) dRevoke();
        dBlob = info.blob; dRevoke = info.revoke; el.img.src = info.url;
        d.has = true; d.nw = info.nw; d.nh = info.nh; d.name = info.name; d.url = info.remote ? info.url : "";
        align = { ax: 0.5, ay: 0.5 }; applyFit("cover");
        if (info.remote) L.notify("Image is linked, not saved: it will disappear if the link breaks.");
        el.url.value = "";
      } catch (e) { L.notify(e.message || "Could not load image"); }
      btn.textContent = "Load";
    }

    function act(a) {
      if (a !== "remove") removeArmed = false;
      if (a === "close") return close();
      if (a === "upload") return el.file.click();
      if (a === "url") return loadUrl();
      if (a === "zoomin") return d.has && zoomBy(1.1, window.innerWidth / 2, window.innerHeight / 2);
      if (a === "zoomout") return d.has && zoomBy(1 / 1.1, window.innerWidth / 2, window.innerHeight / 2);
      if (a === "resetpos") { align = { ax: 0.5, ay: 0.5 }; return d.has && applyFit(d.mode === "custom" ? "cover" : d.mode); }
      if (a === "resetall") {
        const keep = { has: d.has, name: d.name, nw: d.nw, nh: d.nh, rev: d.rev };
        d = Object.assign(L.clone(L.defaults.wallpaper), keep, { url: d.url }); align = { ax: 0.5, ay: 0.5 };
        return d.has ? applyFit("cover") : sync();
      }
      if (a === "remove") {
        const btn = root.querySelector('[data-act="remove"]');
        if (!removeArmed) { removeArmed = true; btn.textContent = "Click again to confirm"; return; }
        removeArmed = false; btn.textContent = "Remove wallpaper";
        return L.wallpaper.remove().then(() => { L.notify("Wallpaper removed"); close(); });
      }
      if (a === "apply") {
        return L.wallpaper.commit(d, dBlob).then(() => { dBlob = null; L.notify("Wallpaper applied"); close(); })
          .catch((e) => L.notify("Could not save wallpaper: " + (e && e.message)));
      }
    }

    // ---------- view ----------
    function layout() {
      const box = root.querySelector(".lq-pvwrap"), W = window.innerWidth, H = window.innerHeight;
      k = Math.min(box.clientWidth / W, (window.innerHeight * 0.58) / H);
      el.pv.style.width = Math.round(W * k) + "px"; el.pv.style.height = Math.round(H * k) + "px";
      el.stage.style.width = W + "px"; el.stage.style.height = H + "px"; el.stage.style.transform = "scale(" + k + ")";
    }
    function sync() {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); });
    }
    function fmt(key, v) { return key === "zoom" ? Math.round(v * 100) : Math.round(v); }
    function render() {
      L.wallpaper.paint(el.stage, d);
      el.empty.style.display = d.has ? "none" : "flex";
      el.name.textContent = d.has ? d.name + " (" + d.nw + "\u00d7" + d.nh + ")" : "No image";
      root.querySelectorAll(".lq-right [data-k]").forEach((t) => {
        const key = t.dataset.k; if (document.activeElement === t) return;
        if (t.type === "checkbox") t.checked = !!d[key]; else t.value = key === "x" || key === "y" ? Math.round(d[key]) : d[key];
      });
      root.querySelectorAll(".lq-right [data-o]").forEach((o) => {
        const key = o.dataset.o; o.textContent = (key === "zoom" ? fmt("zoom", d.sx) : fmt(key, d[key])) + o.dataset.u;
      });
      const z = root.querySelector("[data-zoom]"); if (document.activeElement !== z) z.value = Math.round(d.sx * 100);
    }
    function syncGlobals() {
      const s = store.get();
      root.querySelectorAll(".lq-right [data-g]").forEach((t) => { if (document.activeElement === t) return; if (t.type === "checkbox") t.checked = !!s[t.dataset.g]; else t.value = s[t.dataset.g]; });
      root.querySelectorAll("[data-og]").forEach((o) => { o.textContent = s[o.dataset.og] + o.dataset.u; });
    }

    // ---------- open / close ----------
    function onKey(e) { if (e.key === "Escape") close(); }
    function open() {
      if (!root) build();
      d = L.clone(store.get().wallpaper); dBlob = null; align = { ax: 0.5, ay: 0.5 };
      const src = L.wallpaper.currentSrc();
      if (src) el.img.src = src; else el.img.removeAttribute("src");
      root.classList.add("open"); layout(); syncGlobals(); render();
      window.addEventListener("resize", onResize); document.addEventListener("keydown", onKey);
    }
    function close() {
      if (!root) return;
      root.classList.remove("open");
      if (dRevoke) { dRevoke(); dRevoke = null; }
      dBlob = null; removeArmed = false;
      window.removeEventListener("resize", onResize); document.removeEventListener("keydown", onKey);
    }
    function onResize() { layout(); sync(); }

    // ---------- entry points ----------
    try {
      if (window.Spicetify && Spicetify.Topbar && Spicetify.Topbar.Button) new Spicetify.Topbar.Button("Wallpaper Studio", ICON, open);
    } catch (e) { console.warn("[Liquidify] Topbar button unavailable", e); }
    try {
      if (window.Spicetify && Spicetify.Menu && Spicetify.Menu.Item) new Spicetify.Menu.Item("Wallpaper Studio", false, open, ICON);
    } catch (e) { console.warn("[Liquidify] Menu item unavailable", e); }
    L.openStudio = open;   // also callable from the devtools console: Liquidify.openStudio()
  }
})();
