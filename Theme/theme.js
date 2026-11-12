/*
 * Liquidify — theme.js
 * Runs very early (Spicetify inject_theme_js). Its only job is to avoid a flash
 * of un-styled UI: it applies the *saved* glass settings synchronously, before the
 * extensions (which own the real settings store) have finished loading.
 */
(function () {
  "use strict";
  try {
    var s = JSON.parse(localStorage.getItem("liquidify:settings:v1") || "{}");
    var r = document.documentElement;
    r.classList.add("liquidify");
    if (s.lite) r.classList.add("liquidify-lite");
    if (typeof s.panelBlur === "number") r.style.setProperty("--lq-blur", s.panelBlur + "px");
    if (typeof s.glassTint === "number") r.style.setProperty("--lq-tint", (s.glassTint / 100).toFixed(3));
  } catch (e) { /* first run / storage unavailable: CSS defaults apply */ }
})();
