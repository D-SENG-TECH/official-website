/* THE ANSWER: reveal the narrative layer when the section enters view. */
(function () {
  var el = document.querySelector('[data-am-answer]');
  if (!el) return;
  function go() { el.classList.add('is-in'); }
  if (!('IntersectionObserver' in window) ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) { go(); return; }
  var io = new IntersectionObserver(function (es) {
    if (es[0] && es[0].isIntersecting) { io.disconnect(); go(); }
  }, { threshold: 0.15 });
  io.observe(el);
})();
