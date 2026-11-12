/* AI monitoring showcase — screens: card animations.
 * Ported from deckEightViewsAnim (ES5-style, mostly verbatim). Differences:
 * scoped to .am-screens, strings come from the embedded i18n JSON, intervals
 * run only while the section is on screen, reduced-motion respected. */
(function () {
  "use strict";
  var root = document.getElementById("am-screens");
  if (!root || root.__amScreens) return;
  root.__amScreens = true;

  var I = {};
  try { I = JSON.parse(root.querySelector(".am-screens-i18n").textContent); } catch (e) { return; }

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* noop */ }

  // Pausable interval registry: all periodic work stops when off screen.
  var tasks = [], handles = [], running = false;
  function setInterval(fn, ms) {
    var t = { fn: fn, ms: ms, id: 0 };
    tasks.push(t);
    if (running) t.id = window.setInterval(fn, ms);
    return t;
  }
  function resume() { if (running) return; running = true; tasks.forEach(function (t) { t.id = window.setInterval(t.fn, t.ms); }); }
  function pause() { running = false; tasks.forEach(function (t) { window.clearInterval(t.id); }); }

  function init() {
    var setTimeout = window.setTimeout.bind(window);
    function $(id) { return root.querySelector("#" + id); }
    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
    function rand(min, max) { return min + Math.random() * (max - min); }

    // ---------------------------------------------------------------
    // 02 RMS ticking + matching bar width (7 fans, FAN-01..07)
    // ---------------------------------------------------------------
    (function liveMonitor() {
      var rows = [
        { hzId: "hz1", barId: "hzBar1", min: 2.0, max: 3.5, val: 2.8 },
        { hzId: "hz2", barId: "hzBar2", min: 2.0, max: 3.5, val: 2.5 },
        { hzId: "hz3", barId: "hzBar3", min: 8.0, max: 10.0, val: 9.2 },
        { hzId: "hz4", barId: "hzBar4", min: 5.0, max: 6.5, val: 5.5 },
        { hzId: "hz5", barId: "hzBar5", min: 2.0, max: 3.5, val: 3.1 },
        { hzId: "hz6", barId: "hzBar6", min: 5.0, max: 6.5, val: 5.8 },
        { hzId: "hz7", barId: "hzBar7", min: 2.0, max: 3.5, val: 2.9 }
      ];
      var have = rows.some(function (r) { return $(r.hzId) || $(r.barId); });
      if (!have || reduceMotion) return;

      setInterval(function () {
        rows.forEach(function (r) {
          var next = parseFloat((r.val + (Math.random() * 0.3 - 0.15)).toFixed(1));
          next = Math.min(Math.max(next, r.min), r.max);
          r.val = next;
          var hzEl = $(r.hzId);
          var barEl = $(r.barId);
          if (hzEl) hzEl.textContent = next + " mm/s";
          if (barEl) barEl.style.width = ((next / 10) * 100).toFixed(1) + "%";
        });
      }, 1500);
    })();

    // ---------------------------------------------------------------
    // 03 Vibration time-series — scrolling trend line
    // ---------------------------------------------------------------
    (function trendChart() {
      var line = $("trendLine");
      var dot = $("trendDot");
      if (!line || reduceMotion) return;

      var W = 360, H = 220;
      var padL = 30, padR = 10, padT = 30, padB = 24;
      var innerW = W - padL - padR, innerH = H - padT - padB;
      var yMax = 7.5;
      var N = 30;

      function xPos(i) { return padL + (i / (N - 1)) * innerW; }
      function yPos(v) { return padT + innerH - (Math.min(v, yMax) / yMax) * innerH; }

      // Seed from the current polyline points so the first tick continues smoothly.
      var values = [];
      var raw = line.getAttribute("points");
      if (raw) {
        raw.trim().split(/\s+/).forEach(function (pair) {
          var parts = pair.split(",");
          var y = parseFloat(parts[1]);
          if (!isNaN(y)) {
            // invert yPos to recover the underlying value
            var v = ((padT + innerH - y) / innerH) * yMax;
            values.push(v);
          }
        });
      }
      if (values.length !== N) {
        values = [];
        for (var i = 0; i < N; i++) values.push(3.0);
      }

      function render() {
        var pts = values.map(function (v, i) {
          return xPos(i).toFixed(1) + "," + yPos(v).toFixed(1);
        }).join(" ");
        line.setAttribute("points", pts);
        var lastV = values[values.length - 1];
        if (dot) {
          dot.setAttribute("cx", xPos(N - 1).toFixed(1));
          dot.setAttribute("cy", yPos(lastV).toFixed(1));
        }
      }

      setInterval(function () {
        values.shift();
        var prev = values[values.length - 1];
        var next = clamp(prev + rand(-0.35, 0.35), 1.6, 6.8);
        values.push(next);
        render();
      }, 650);
    })();


    // ---------------------------------------------------------------
    // ---------------------------------------------------------------
    (function lockDynamicHeights() {
      setTimeout(function () {
        [".pv-tl-wrap", ".pv-wo-box"].forEach(function (sel) {
          var el = root.querySelector(sel);
          if (!el) return;
          var h = el.getBoundingClientRect().height;
          if (h > 0) { el.style.height = h + "px"; el.style.overflow = "hidden"; }
        });
      }, 600);
    })();

    // ---------------------------------------------------------------
    // 04 Alert notifications — live feed: prepend a new alert every ~3.5s as a
    // real DOM insert, animate it open (height 0 -> natural) so the
    // existing rows are visibly pushed down by the layout change
    // itself. When more than 3 rows exist, the oldest (last) row is
    // animated closed (height -> 0) and removed once the transition
    // ends. Ages refresh in place every 20s (no re-render).
    //
    // Requires the .pv-al-row CSS addition (box-sizing: border-box;
    // overflow: hidden;) — see alert_pushdown_css.txt — so the
    // height-transition math (via scrollHeight) lines up exactly with
    // the row's padding. box-sizing is also set inline as a fallback
    // in case that CSS isn't picked up.
    // ---------------------------------------------------------------
    (function alertFeed() {
      var list = root.querySelector(".pv-al-list");
      if (!list || reduceMotion) return;

      var pool = I.alerts.map(function (f, k) {
        return { fan: "FAN-0" + (k + 1), fault: f, sev: [0, 4, 5].indexOf(k) >= 0 ? "high" : "medium" };
      });

      var EASE = "cubic-bezier(.22,1,.36,1)";
      var MAX_ROWS = 3;

      function sevColor(s) { return s === "high" ? "#ef4444" : "#f59e0b"; }

      function ageLabel(bornAt) {
        var mins = Math.floor((Date.now() - bornAt) / 60000);
        if (mins < 1) return I.now;
        if (mins < 60) return mins + I.min;
        return Math.floor(mins / 60) + I.hr;
      }

      function iconSvg(color) {
        return '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">'
          + '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>'
          + '<path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>';
      }

      // Build a fresh row DOM node (not attached) for alert `a`.
      function buildRow(a) {
        var row = document.createElement("div");
        row.className = "pv-al-row pv-al-row--" + a.sev + (a.sev === "high" ? " pv-pulse-row" : "");
        row.innerHTML = iconSvg(sevColor(a.sev))
          + '<span class="pv-al-fan">' + a.fan + '</span>'
          + '<span class="pv-al-fault">' + a.fault + '</span>'
          + '<span class="pv-al-age">' + ageLabel(a.bornAt) + '</span>';
        row._alert = a; // stash for the in-place age refresh below
        return row;
      }

      // Insert `a` as a new top row, animating it from height 0/opacity 0
      // up to its natural size. Because it's a real inserted DOM node,
      // the flex-column layout pushes every row below it down as the
      // height grows — that reflow *is* the push-down animation.
      function addAlert(a) {
        var row = buildRow(a);
        row.style.boxSizing = "border-box"; // fallback if CSS addition is missing
        row.style.overflow = "hidden";
        row.style.height = "0px";
        row.style.opacity = "0";
        row.style.transform = "translateY(-6px)";
        list.insertBefore(row, list.firstChild);

        // scrollHeight reports the full natural content height even
        // while visually clamped to 0 by the inline height + overflow.
        var targetH = row.scrollHeight;

        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            row.style.transition = "height .45s " + EASE + ", opacity .45s " + EASE + ", transform .45s " + EASE;
            row.style.height = targetH + "px";
            row.style.opacity = "1";
            row.style.transform = "translateY(0)";
          });
        });

        var cleaned = false;
        function cleanup() {
          if (cleaned) return;
          cleaned = true;
          row.removeEventListener("transitionend", onEnd);
          // Release the fixed height back to auto once settled, so it
          // isn't left pinned to a stale px value.
          row.style.height = "";
          row.style.overflow = "";
          row.style.transition = "";
          row.style.transform = "";
        }
        function onEnd(e) {
          if (e.target === row && e.propertyName === "height") cleanup();
        }
        row.addEventListener("transitionend", onEnd);
        setTimeout(cleanup, 550); // safety net if transitionend doesn't fire
      }

      // Animate the oldest (last) row closed, then remove it from the DOM.
      function animateOut(row) {
        var h = row.scrollHeight;
        row.style.boxSizing = "border-box";
        row.style.overflow = "hidden";
        row.style.height = h + "px";
        void row.offsetHeight; // force reflow so the start height is registered

        var done = false;
        function finish() {
          if (done) return;
          done = true;
          row.removeEventListener("transitionend", onEnd);
          if (row.parentNode) row.parentNode.removeChild(row);
        }
        function onEnd(e) {
          if (e.target === row && e.propertyName === "height") finish();
        }
        row.addEventListener("transitionend", onEnd);
        setTimeout(finish, 500); // safety net

        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            row.style.transition = "height .4s " + EASE + ", opacity .35s ease";
            row.style.height = "0px";
            row.style.opacity = "0";
          });
        });
      }

      // After a new row lands, drop anything beyond MAX_ROWS (oldest first).
      function trimExcess() {
        if (list.children.length <= MAX_ROWS) return;
        var last = list.lastElementChild;
        if (!last || last._removing) return;
        last._removing = true;
        animateOut(last);
      }

      // Seed from whatever is already server-rendered in the DOM so the
      // very first tick doesn't jump; tag each existing row with its
      // alert data so the 20s age refresh can update it in place.
      var seeded = 0;
      Array.prototype.forEach.call(list.children, function (row) {
        var fanEl = row.querySelector(".pv-al-fan");
        var faultEl = row.querySelector(".pv-al-fault");
        if (!fanEl || !faultEl) return;
        var sev = row.classList.contains("pv-al-row--high") ? "high" : "medium";
        row._alert = { fan: fanEl.textContent, fault: faultEl.textContent, sev: sev, bornAt: Date.now() - 4 * 60000 };
        seeded++;
      });
      if (!seeded) {
        list.innerHTML = "";
        [pool[0], pool[1], pool[2]].forEach(function (p) {
          var a = { fan: p.fan, fault: p.fault, sev: p.sev, bornAt: Date.now() };
          list.appendChild(buildRow(a));
        });
      }

      requestAnimationFrame(function () {
        var h = list.getBoundingClientRect().height;
        if (h > 0) { list.style.height = h + "px"; list.style.flex = "0 0 auto"; list.style.overflow = "hidden"; }
      });

      setInterval(function () {
        var pick = pool[Math.floor(Math.random() * pool.length)];
        addAlert({ fan: pick.fan, fault: pick.fault, sev: pick.sev, bornAt: Date.now() });
        trimExcess();
      }, 3500);

      // Let ages progress (I.now -> "N min ago") without re-rendering rows.
      setInterval(function () {
        Array.prototype.forEach.call(list.children, function (row) {
          if (!row._alert) return;
          var ageEl = row.querySelector(".pv-al-age");
          if (ageEl) ageEl.textContent = ageLabel(row._alert.bornAt);
        });
      }, 20000);
    })();

    // ---------------------------------------------------------------
    // 05 Work orders — cycle the featured ticket every ~5s, fading
    // the ticket box on swap.
    // ---------------------------------------------------------------
    (function workOrder() {
      var pill = $("woPill");
      var headerRow = pill ? pill.parentElement : null;
      var ticketEl = headerRow ? headerRow.querySelector(".pv-eyebrow--orange") : null;
      var box = root.querySelector(".pv-wo-box");
      var fieldGrid = root.querySelector(".pv-field-grid--push");
      if (!ticketEl || !box || !fieldGrid || reduceMotion) return;

      var titleEl = box.querySelector(".pv-wo-title");
      var faultEl = box.querySelector(".pv-wo-fault");
      var descEl = box.querySelector(".pv-wo-desc");
      var values = fieldGrid.querySelectorAll(".pv-field-value");
      if (!titleEl || !faultEl || !descEl || values.length < 4) return;

      var meta = [
        { fan: "FAN-03", date: "2026-05-09", priority: "Level 1", hi: true },
        { fan: "FAN-06", date: "2026-05-13", priority: "Level 2", hi: false },
        { fan: "FAN-02", date: "2026-05-16", priority: "Level 1", hi: true }
      ];
      var tickets = I.tickets.map(function (t, k) {
        return { oc: t.id, fan: meta[k].fan, fault: t.fault, desc: t.desc, team: values[0].textContent,
                 date: meta[k].date, priority: meta[k].priority, hi: meta[k].hi, est: t.est };
      });

      var idx = 0;

      function apply(t) {
        ticketEl.textContent = I.ticket + t.oc;
        Array.prototype.forEach.call(titleEl.childNodes, function (n) {
          if (n.nodeType === 3) n.textContent = t.fan + " ";
        });
        faultEl.textContent = t.fault;
        descEl.textContent = t.desc;
        values[0].textContent = t.team;
        values[1].textContent = t.date;
        values[2].textContent = t.priority;
        values[2].classList.toggle("pv-field-value--hi", !!t.hi);
        values[3].textContent = t.est;
      }

      box.style.transition = "opacity .35s ease";

      setInterval(function () {
        idx = (idx + 1) % tickets.length;
        box.style.opacity = "0";
        setTimeout(function () {
          apply(tickets[idx]);
          box.style.opacity = "1";
        }, 350);
      }, 5000);
    })();

    // ---------------------------------------------------------------
    // 06 Lifetime history — grow the timeline: append a new lifecycle event
    // every ~6s, keep the newest 4, last stays the pulsing "current".
    // ---------------------------------------------------------------
    (function historyTimeline() {
      var wrap = root.querySelector(".pv-tl-wrap");
      if (!wrap || reduceMotion) return;
      var line = wrap.querySelector(".pv-tl-line");

      var events = [];
      Array.prototype.forEach.call(wrap.querySelectorAll(".pv-tl-event"), function (ev) {
        var dateEl = ev.querySelector(".pv-tl-date");
        var headEl = ev.querySelector(".pv-tl-head");
        var bodyEl = ev.querySelector(".pv-tl-body");
        events.push({
          date: dateEl ? dateEl.textContent : "",
          head: headEl ? headEl.textContent : "",
          body: bodyEl ? bodyEl.textContent : ""
        });
      });
      if (!events.length) return;

      var pool = I.tl;

      var poolIdx = 0;
      var month = 6; // continues on from the 2026.05 seed event

      function render() {
        var html = events.map(function (e, i) {
          var isLast = i === events.length - 1;
          var dotCls = "pv-tl-dot" + (isLast ? " pv-tl-dot--last pv-pulse-dot" : "");
          var dotId = isLast ? ' id="tlLastDot"' : "";
          var dotStyle = isLast ? "" : ' style="background:#60a5fa"';
          var dateColor = isLast ? "#fb923c" : "rgba(96,165,250,0.85)";
          var evCls = "pv-tl-event" + (isLast ? " pv-tl-event--last" : "");
          return '<div class="' + evCls + '">'
            + '<span class="' + dotCls + '"' + dotId + dotStyle + '></span>'
            + '<div class="pv-tl-date" style="color:' + dateColor + '">' + e.date + '</div>'
            + '<div class="pv-tl-head">' + e.head + '</div>'
            + '<div class="pv-tl-body">' + e.body + '</div>'
            + '</div>';
        }).join("");
        wrap.innerHTML = "";
        if (line) wrap.appendChild(line);
        wrap.insertAdjacentHTML("beforeend", html);
      }

      setInterval(function () {
        var next = pool[poolIdx % pool.length];
        poolIdx++;
        month++;
        var y = 2026 + Math.floor((month - 1) / 12);
        var m = ((month - 1) % 12) + 1;
        var dateStr = y + "." + (m < 10 ? "0" + m : m);
        events.push({ date: dateStr, head: next.head, body: next.body });
        if (events.length > 4) events.shift();
        render();
      }, 6000);
    })();

    // ---------------------------------------------------------------
    // 07 Parts inventory — live stock: every ~3s one part drifts toward its
    // min (then "restocks"); rows under min flip to amber/low + pulse.
    // ---------------------------------------------------------------
    (function inventory() {
      var list = root.querySelector(".pv-inv-list");
      if (!list) return;
      var rows = Array.prototype.slice.call(list.querySelectorAll(".pv-inv-row"));
      if (!rows.length) return;

      var state = rows.map(function (row) {
        var stockEl = row.querySelector(".pv-inv-stock");
        var stock = parseInt((stockEl && stockEl.textContent) || "0", 10) || 0;
        return { row: row, stockEl: stockEl, stock: stock, shown: stock, raf: 0 };
      });

      function colorFor(v) { return v < 3 ? "#ef4444" : v < 5 ? "#f59e0b" : "#34d399"; }
      function paint(s) {
        var crit = s.stock < 3, low = !crit && s.stock < 5;
        s.row.classList.toggle("pv-inv-row--crit", crit);
        s.row.classList.toggle("pv-inv-row--low", low);
        s.row.classList.toggle("pv-inv-row--ok", !crit && !low);
        if (s.stockEl) { s.stockEl.style.color = colorFor(s.stock); s.stockEl.classList.remove("pv-pulse-amber"); s.stockEl.classList.toggle("pv-inv-blink", crit || low); }
      }
      state.forEach(paint);

      function rollTo(s, target) {
        var from = s.shown, start = Date.now(), dur = 480;
        cancelAnimationFrame(s.raf);
        (function step() {
          var t = Math.min(1, (Date.now() - start) / dur);
          var e = 1 - Math.pow(1 - t, 3);
          s.shown = Math.round(from + (target - from) * e);
          if (s.stockEl) { s.stockEl.textContent = s.shown; s.stockEl.style.color = colorFor(s.shown); }
          if (t < 1) s.raf = requestAnimationFrame(step); else { s.shown = target; if (s.stockEl) s.stockEl.textContent = target; paint(s); }
        })();
      }

      if (reduceMotion) return;
      setInterval(function () {
        var s = state[Math.floor(Math.random() * state.length)];
        if (s.stock <= 0 || (s.stock < 3 && Math.random() < 0.3)) s.stock = 9 + Math.floor(Math.random() * 6);
        else s.stock = Math.max(0, s.stock - (1 + Math.floor(Math.random() * 3)));
        s.row.classList.remove("pv-inv-flash"); void s.row.offsetWidth; s.row.classList.add("pv-inv-flash");
        paint(s); rollTo(s, s.stock);
      }, 500);
    })();

    // ---------------------------------------------------------------
    // 08 Budget analysis — grow bars in on first paint, then keep them
    // gently live; ROI ticks within a small band.
    // ---------------------------------------------------------------
    (function costBars() {
      var wrap = $("costBars");
      if (!wrap) return;
      var bars = Array.prototype.slice.call(wrap.querySelectorAll(".pv-cost-bar"));
      if (!bars.length) return;
      var vals = bars.map(function (b) { var h = parseFloat(b.getAttribute("data-height")); return isNaN(h) ? 50 : h; });

      if (reduceMotion) { bars.forEach(function (b, i) { b.style.height = vals[i] + "%"; }); return; }

      requestAnimationFrame(function () { requestAnimationFrame(function () {
        bars.forEach(function (b, i) { b.style.height = vals[i] + "%"; });
      }); });

      var card = wrap.closest ? wrap.closest(".dcard") : null;
      var roiEl = card ? card.querySelector(".pv-eyebrow--green") : null;

      setTimeout(function () {
        bars.forEach(function (b, i) {
          b.style.height = clamp(vals[i], 30, 100) + "%";
          b.style.transition = "none";
          b.style.transformOrigin = "bottom";
          b.style.animation = "pvCostFlow 1.4s ease-in-out infinite alternate";
          b.style.animationDelay = (-i * 0.11) + "s";
        });
      }, 1100);

      if (roiEl) setInterval(function () { roiEl.textContent = "ROI " + Math.round(rand(91, 95)) + "%"; }, 1500);
    })();

  }

  root.classList.add("am-js");
  var inited = false;
  if (!("IntersectionObserver" in window)) {
    root.classList.add("is-in", "is-active"); init(); inited = true; resume();
    return;
  }
  new IntersectionObserver(function (es) {
    var vis = es[0].isIntersecting;
    root.classList.toggle("is-active", vis);
    if (vis) {
      root.classList.add("is-in");
      if (!inited) { inited = true; init(); }
      resume();
    } else if (inited) {
      pause();
    }
  }, { rootMargin: "120px 0px", threshold: 0 }).observe(root);
})();
