/* hero scrollytelling: window scroll -> 0..1 progress -> CSS variables.
 * Ported from Hero.tsx (windows and easing unchanged). */
(function () {
  var root = document.querySelector(".am-hero");
  if (!root) return;
  var stage = root.querySelector(".am-hero-stage");
  var steps = root.querySelectorAll(".am-hero-step");
  var video = root.querySelector(".am-hero-video");
  var cue = root.querySelector(".am-hero-cue");
  var mq = window.matchMedia("(prefers-reduced-motion: reduce)");

  var EXPAND_END = 0.22, FADE_END = 0.18, STEPS_START = 0.24, STEPS_END = 0.9;
  var clamp = function (v, lo, hi) { return Math.min(Math.max(v, lo), hi); };
  var smooth = function (e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  var raf = 0;

  function set(name, v) { root.style.setProperty(name, String(v)); }

  function apply(p, reduced) {
    var expandT = reduced ? 1 : smooth(0, EXPAND_END, p);
    var fadeT = reduced ? 0 : smooth(0, FADE_END, p);
    var perStep = (STEPS_END - STEPS_START) / steps.length;
    set("--am-expand", expandT.toFixed(4));
    set("--am-fade", fadeT.toFixed(4));
    set("--am-ul-top", (reduced ? 1 : expandT).toFixed(4));
    set("--am-ul-bottom", (reduced ? 1 : smooth(0.86, 1, p)).toFixed(4));
    stage.setAttribute("data-faded", fadeT > 0.5 ? "1" : "0");
    root.querySelector(".am-hero-gap").setAttribute("aria-hidden", expandT < 0.5 ? "true" : "false");
    for (var i = 0; i < steps.length; i++) {
      var r = reduced ? 1 : clamp((p - (STEPS_START + i * perStep)) / (perStep * 1.2), 0, 1);
      steps[i].style.setProperty("--r", r.toFixed(4));
    }
  }

  function compute() {
    raf = 0;
    if (mq.matches) return;
    var rect = root.getBoundingClientRect();
    var top = parseFloat(getComputedStyle(stage).top) || 0;
    var total = rect.height - stage.offsetHeight;
    var scrolled = clamp(top - rect.top, 0, Math.max(total, 1));
    apply(total > 0 ? scrolled / total : 0, false);
  }
  function onScroll() { if (!raf) raf = requestAnimationFrame(compute); }

  function sync() {
    var reduced = mq.matches;
    root.classList.toggle("is-static", reduced);
    if (video) {
      if (reduced) { video.pause(); } else { var pr = video.play(); if (pr && pr.catch) pr.catch(function () {}); }
    }
    if (reduced) apply(1, true); else compute();
  }

  if (cue) cue.addEventListener("click", function () {
    window.scrollBy({ top: window.innerHeight, behavior: mq.matches ? "auto" : "smooth" });
  });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  if (mq.addEventListener) mq.addEventListener("change", sync);
  sync();
})();
