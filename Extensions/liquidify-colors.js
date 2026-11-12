/*
 * Liquidify — liquidify-colors.js  (dynamic accent from album artwork)
 *
 * Flow: songchange -> artwork URL -> 48x48 canvas sample -> hue-bucket weighting ->
 *       tuned accent palette -> CSS custom properties on <html>.
 * The CSS properties are registered with @property in user.css, so changing them
 * animates smoothly with a plain CSS transition (no JS animation loop).
 *
 * Fallbacks, in order: canvas extraction -> Spicetify.colorExtractor (if present in this
 * build) -> built-in purple palette. Results are cached per artwork URL.
 */
(function () {
  "use strict";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h /= 6; if (h < 0) h += 1;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 1) + 1) % 1;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h * 6) % 2) - 1)), m = l - c / 2;
    const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h * 6) % 6];
    return t.map((v) => Math.round((v + m) * 255));
  }
  // Relative luminance + contrast helpers (WCAG).
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const BG_LUM = lum([11, 11, 16]);                     // approx. darkest UI surface
  // Keep colours calm (saturation capped), light enough for >= 4.5:1 contrast on the dark UI.
  function tune(rgb, lift, hueShift) {
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const h = hsl[0] + (hueShift || 0), s = clamp(hsl[1] * 0.9, 0.3, 0.62);
    let l = clamp(hsl[2] * 0.5 + 0.33 + (lift || 0), 0.58, 0.76), out = hslToRgb(h, s, l);
    while ((lum(out) + 0.05) / (BG_LUM + 0.05) < 4.5 && l < 0.9) { l += 0.02; out = hslToRgb(h, s, l); }
    return out;
  }

  const NEUTRAL = { accent: [201, 201, 209], secondary: [226, 226, 232] };
  const FALLBACK = { accent: [139, 124, 246], secondary: [180, 156, 255] };

  // data = RGBA bytes (canvas getImageData). Returns {accent, secondary}.
  function paletteFromPixels(data) {
    const BINS = 24, bins = [];
    for (let i = 0; i < BINS; i++) bins.push({ i, w: 0, r: 0, g: 0, b: 0 });
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      n++;
      const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (hsl[1] < 0.15 || hsl[2] < 0.12 || hsl[2] > 0.9) continue;       // ignore near-grey / near-black / near-white
      const w = hsl[1] * (1 - Math.abs(2 * hsl[2] - 1)) + 0.01;            // vivid mid-tones count most
      const b = bins[Math.min(BINS - 1, Math.floor(hsl[0] * BINS))];
      b.w += w; b.r += data[i] * w; b.g += data[i + 1] * w; b.b += data[i + 2] * w;
    }
    const ranked = bins.filter((b) => b.w > 0).sort((a, b) => b.w - a.w);
    const total = ranked.reduce((a, b) => a + b.w, 0);
    if (!ranked.length || total < n * 0.02) return NEUTRAL;                // essentially greyscale artwork
    const avg = (b) => [b.r / b.w, b.g / b.w, b.b / b.w];
    const p = ranked[0];
    const second = ranked.find((b) => {
      const d = Math.abs(b.i - p.i); return Math.min(d, BINS - d) >= 3 && b.w >= p.w * 0.35;
    });
    return {
      accent: tune(avg(p), 0),
      secondary: second ? tune(avg(second), 0.06) : tune(avg(p), 0.08, 0.05)
    };
  }

  const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  const onAccent = (c) => (1.05 / (lum(c) + 0.05) >= (lum(c) + 0.05) / 0.05 ? "#ffffff" : "#0b0b10"); // best of white/near-black

  window.Liquidify = window.Liquidify || {};
  window.Liquidify.__colors = { paletteFromPixels, tune, rgbToHsl, hslToRgb, onAccent };

  function when(test, cb) {
    if (test()) return cb();
    let n = 0;
    const t = setInterval(() => { if (test()) { clearInterval(t); cb(); } else if (++n > 300) clearInterval(t); }, 100);
  }
  when(() => window.Liquidify.store && window.Spicetify && Spicetify.Player && Spicetify.Player.addEventListener, init);

  function init() {
    const store = window.Liquidify.store;
    const cache = new Map();           // artwork URL -> palette (LRU-ish, max 60)
    let lastUrl = null, token = 0;

    function apply(p) {
      const s = document.documentElement.style, a = p.accent, b = p.secondary;
      const sheen = a.map((v) => Math.round(v + (255 - v) * 0.85));   // accent mixed 85% toward white
      s.setProperty("--liquid-accent", hex(a));
      s.setProperty("--liquid-accent-secondary", hex(b));
      s.setProperty("--liquid-accent-rgb", a.join(", "));
      s.setProperty("--liquid-glow", "rgba(" + a.join(",") + ",0.25)");
      s.setProperty("--liquid-glass", "rgba(" + sheen.join(",") + ",0.085)");
      s.setProperty("--liquid-on-accent", onAccent(a));
    }

    function artUrl() {
      const d = Spicetify.Player.data, m = (d && d.item && d.item.metadata) || {};
      let u = m.image_url || m.image_large_url || m.image_xlarge_url ||
        (d && d.item && d.item.album && d.item.album.images && d.item.album.images[0] && d.item.album.images[0].url);
      if (!u) return null;
      if (u.indexOf("spotify:image:") === 0) return "https://i.scdn.co/image/" + u.slice(14);
      return /^https:\/\//.test(u) ? u : null;       // local files etc. have no usable artwork
    }

    function viaCanvas(url) {
      return new Promise((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = "anonymous";
        im.onload = () => {
          try {
            const S = 48, c = document.createElement("canvas");
            c.width = c.height = S;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(im, 0, 0, S, S);
            resolve(paletteFromPixels(ctx.getImageData(0, 0, S, S).data));
          } catch (e) { reject(e); }                    // tainted canvas etc.
        };
        im.onerror = () => reject(new Error("artwork load failed"));
        im.src = url;
      });
    }

    async function viaSpicetify() {
      const d = Spicetify.Player.data, uri = d && d.item && d.item.uri;
      if (!uri || typeof Spicetify.colorExtractor !== "function") return null;
      const c = await Spicetify.colorExtractor(uri);
      const h = c && (c.VIBRANT || c.PROMINENT || c.LIGHT_VIBRANT || c.DESATURATED);
      const m = h && /^#?([0-9a-f]{6})/i.exec(h);
      if (!m) return null;
      const n = parseInt(m[1], 16), base = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return { accent: tune(base, 0), secondary: tune(base, 0.08, 0.05) };
    }

    async function update() {
      if (!store.get().dynamicAccent) { lastUrl = null; token++; return apply(FALLBACK); }
      const url = artUrl();
      if (url === lastUrl) return;                      // same artwork: nothing to do
      lastUrl = url;
      const my = ++token;
      if (!url) return apply(FALLBACK);
      let p = cache.get(url);
      if (!p) {
        try { p = await viaCanvas(url); }
        catch (e) { try { p = await viaSpicetify(); } catch (e2) { p = null; } }
        p = p || FALLBACK;
        cache.set(url, p);
        if (cache.size > 60) cache.delete(cache.keys().next().value);
      }
      if (my === token) apply(p);                       // ignore results for a track we already skipped
    }

    Spicetify.Player.addEventListener("songchange", update);
    store.subscribe((s, patch) => { if ("dynamicAccent" in patch) { lastUrl = null; update(); } });
    update();
    setTimeout(update, 1500);                           // Player.data can be empty right at startup
  }
})();
