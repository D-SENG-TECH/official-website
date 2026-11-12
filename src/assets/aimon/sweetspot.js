/* sweetspot — operating point walks the rising limb of the curve, readouts follow */
(function () {
  var root = document.querySelector("[data-am-sweetspot]");
  if (!root) return;
  var q = function (s) { return root.querySelector(s); };
  var curve = q("[data-ss-curve]");
  var el = {
    dot: q("[data-ss-dot]"), ring: q("[data-ss-ring]"), line: q("[data-ss-margin-line]"),
    chip1: q("[data-ss-chip1]"), chip2: q("[data-ss-chip2]"),
    label: q("[data-ss-label]"), read: q("[data-ss-read]"),
    bep: q("[data-ss-bep]"), margin: q("[data-ss-margin]"), badge: q("[data-ss-margin-badge]")
  };
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var onScreen = false, timer = null, started = false;

  root.classList.add("is-armed");
  if (!("IntersectionObserver" in window)) { root.classList.add("in"); onScreen = true; }

  function render(x, y, m, dist, eta, vib) {
    var right = x < 320, below = y < 180, chipW = 150;
    var tx = right ? x + 14 : x - 14;
    var ly = below ? y + 15 : y - 8;
    var ry = below ? y + 33 : y - 26;
    var cx = right ? tx - 5 : tx - chipW + 5;
    var anchor = right ? "start" : "end";
    el.dot.setAttribute("cx", x); el.dot.setAttribute("cy", y);
    el.ring.setAttribute("cx", x); el.ring.setAttribute("cy", y);
    el.line.setAttribute("x2", x); el.line.setAttribute("y1", y); el.line.setAttribute("y2", y);
    el.chip1.setAttribute("x", cx); el.chip1.setAttribute("y", ly - 11);
    el.chip2.setAttribute("x", cx); el.chip2.setAttribute("y", ry - 11);
    el.label.setAttribute("x", tx); el.label.setAttribute("y", ly); el.label.setAttribute("text-anchor", anchor);
    el.read.setAttribute("x", tx); el.read.setAttribute("y", ry); el.read.setAttribute("text-anchor", anchor);
    el.read.textContent = "η " + eta + "% · " + vib + " mm/s";
    el.bep.textContent = "−" + dist;
    el.margin.textContent = m;
    el.badge.classList.toggle("warn", m < 10);
  }

  function staticState() { render(236, 150, 8, 12, 78, "3.0"); }

  function start() {
    if (started) return;
    started = true;
    var L = curve.getTotalLength(), i, j, p;
    var fPeak = 0.4, yMin = Infinity;
    for (i = 0; i <= 200; i++) { p = curve.getPointAtLength(L * i / 200); if (p.y < yMin) { yMin = p.y; fPeak = i / 200; } }
    var fValley = 0.08, yMax = -Infinity;
    for (j = 0; j <= Math.round(fPeak * 200); j++) { p = curve.getPointAtLength(L * j / 200); if (p.y > yMax) { yMax = p.y; fValley = j / 200; } }
    var t = 0;
    timer = window.setInterval(function () {
      if (!onScreen || mq.matches) return;
      t += 0.035;
      var back = 0.15 + 0.47 * (0.5 + 0.5 * Math.sin(t));
      var pt = curve.getPointAtLength(L * (fPeak - (fPeak - fValley) * back));
      var m = Math.max(1, Math.min(14, Math.round(2 + ((pt.x - 186) / 60) * 12)));
      var dist = Math.round(Math.max(0, ((250 - pt.x) / 64) * 30));
      render(pt.x, pt.y, m, dist, Math.round(84 - dist * 0.72), (1.8 + dist * 0.18).toFixed(1));
    }, 60);
  }

  function applyMotionPref() { if (mq.matches) staticState(); }
  if (mq.addEventListener) mq.addEventListener("change", applyMotionPref);
  if (mq.matches) staticState();
  start();

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      var e = entries[0];
      onScreen = e.isIntersecting && e.intersectionRatio > 0.05;
      if (e.isIntersecting) root.classList.add("in");
    }, { threshold: [0, 0.05, 0.5] }).observe(root);
  }
})();
