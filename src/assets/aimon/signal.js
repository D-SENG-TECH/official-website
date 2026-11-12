/* THE SIGNAL: draw -> unread (1.2s) -> read (2.0s). Forward-only. */
(function () {
  var el = document.querySelector('[data-am-signal]');
  if (!el) return;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var started = false;
  function start() {
    if (started) return;
    started = true;
    el.classList.add('is-in');
    if (reduced) { el.classList.add('is-draw', 'is-unread', 'is-read'); return; }
    el.classList.add('is-draw');
    setTimeout(function () { el.classList.add('is-unread'); }, 1200);
    setTimeout(function () { el.classList.add('is-read'); }, 2000);
  }
  if (!('IntersectionObserver' in window)) { start(); return; }
  var io = new IntersectionObserver(function (es) {
    if (es[0] && es[0].isIntersecting) { io.disconnect(); start(); }
  }, { threshold: 0.1, rootMargin: '0px 0px -10% 0px' });
  io.observe(el);
})();
