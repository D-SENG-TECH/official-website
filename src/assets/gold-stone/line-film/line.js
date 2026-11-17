// A self-running 20 s film of one installation: an ultra-high-purity gas line (cylinder to tool) and a chemical
// supply line beside it. Every labelled part is a product family the distributor supplies. No interaction needed.
// Scene units: metres, Y up. Line components are authored in real millimetres inside `L`, which is scaled by SCALE / 1000.
//
// Layout: the film fills its host element edge to edge and adapts to any aspect ratio. Type sizes, safe margins and the
// text blocks are laid out first (layoutDom, plain DOM, written to CSS variables on the .lf root); what is left over is
// the rectangle the rig may use, and the wide-shot camera is fitted to that rectangle from the projected bounds.
//   "side"  (aspect >= 1.2): message column on the left, rig on the right with callout cards and orthogonal leaders.
//   "stack" (aspect <  1.2): rig on top, product names as a wrapped list in normal document flow, message and brands below.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LABELS, LOCALES } from "./line-data.js";

// All styles live under the .lf root class. Sizes come from CSS variables that layoutDom() sets in pixels.
const CSS = `
.lf{position:relative;width:100%;height:100%;overflow:hidden;background:#fff;color:#1b2538;line-height:1.3;
  font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","PingFang SC","Hiragino Sans","Noto Sans TC","Noto Sans SC","Noto Sans JP","Microsoft JhengHei","Microsoft YaHei",sans-serif;
  --lf-navy:#0f2c4a;--lf-muted:#566472;--lf-line:#d6dde5;--lf-orange:#f0954a;--lf-orange-ink:#a9540c;--lf-green:#1f9d78;
  --pl:32px;--pr:32px;--pt:18px;--pb:14px;--col:400px;--fh:40px;--fht:40px;--fb:16px;--fs:12px;--ft:20px;--fi:12px;--fc:14px;--fbr:12px;--tagmax:300px;
  -webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.lf *{box-sizing:border-box}
.lf-probe{position:absolute;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}
.lf-gl,.lf-xfade,.lf-leaders,.lf-tags,.lf-title,.lf-closing{position:absolute;left:0;top:0;width:100%;height:100%}
.lf-gl{display:block;cursor:pointer;opacity:0;transition:opacity .6s ease}
.lf.lf-ready .lf-gl{opacity:1}
.lf-xfade,.lf-leaders,.lf-tags,.lf-title,.lf-closing{pointer-events:none}
.lf-xfade{opacity:0}
.lf-leaders g{opacity:0}
.lf-leaders path{fill:none;stroke:#5b6b7d;stroke-width:1.5;stroke-linejoin:round}
.lf-leaders circle{fill:var(--lf-navy);stroke:#fff;stroke-width:1.5}
.lf-tag{position:absolute;left:0;top:0;display:flex;flex-direction:column;justify-content:center;max-width:var(--tagmax);font-size:var(--ftg,var(--ft));padding:.3em .66em .34em .58em;border-radius:6px;background:rgba(255,255,255,.96);border:1px solid var(--lf-line);border-left:4px solid var(--lf-orange);box-shadow:0 2px 10px rgba(15,44,74,.12);opacity:0;will-change:transform,opacity}
.lf-tag.lf-chem{border-left-color:var(--lf-green)}
.lf-tag b{display:block;font-size:1em;line-height:1.2;font-weight:700;color:var(--lf-navy);letter-spacing:.02em;text-wrap:balance}
.lf-tag i{display:block;margin-top:.12em;font-style:normal;font-size:var(--fig,var(--fi));line-height:1.2;color:var(--lf-muted);letter-spacing:.02em;white-space:nowrap}
.lf.lf-d1 .lf-tag i{display:none}
.lf[lang="en"] .lf-tag b{letter-spacing:0}
.lf[lang="ja"] .lf-tag b{letter-spacing:0;word-break:keep-all;overflow-wrap:anywhere}
.lf-legend{position:absolute;left:0;top:0;opacity:0;font-size:var(--fs);font-weight:700;letter-spacing:.08em;color:var(--lf-orange-ink);white-space:nowrap;display:flex;align-items:center;gap:.5em}
.lf-legend::before,.lf-chips-h::before{content:"";flex:none;width:.7em;height:.7em;border-radius:50%;background:var(--lf-orange)}
.lf-legend.lf-chem,.lf-chips-h.lf-chem{color:#12775a}.lf-legend.lf-chem::before,.lf-chips-h.lf-chem::before{background:var(--lf-green)}
.lf-corner{position:absolute;left:var(--pl);top:var(--pt);max-width:calc(100% - var(--pl) - var(--pr) - 120px);margin:0;font-size:var(--fc);line-height:1.4;color:var(--lf-navy);letter-spacing:.04em;pointer-events:none}
.lf-corner b{font-weight:800;margin-right:.8em;padding-right:.8em;border-right:2px solid var(--lf-orange)}
.lf-title,.lf-closing{opacity:0}
.lf-msg{position:absolute;left:var(--pl);top:var(--msg-top,30%);width:var(--col)}
.lf-title .lf-msg{top:var(--title-top,30%)}
.lf-msg p,.lf-msg h2,.lf-msg ul{margin:0;padding:0}
.lf-msg .lf-k{margin:0 0 .5em;font-size:var(--fb);font-weight:800;color:var(--lf-orange-ink);letter-spacing:.12em}
.lf-msg h2{font-size:var(--fh);line-height:1.28;font-weight:700;color:var(--lf-navy);letter-spacing:.01em}
.lf-title .lf-msg h2{font-size:var(--fht);text-wrap:balance;word-break:keep-all;overflow-wrap:anywhere}
.lf-closing .lf-msg h2{white-space:pre}
.lf-msg .lf-sub,.lf-msg .lf-offer{margin-top:.75em;font-size:var(--fb);line-height:1.55}
.lf-msg ul{margin-top:1em;list-style:none;font-size:var(--fb);line-height:1.72}
.lf-msg li{padding-left:1.1em;position:relative}
.lf-msg li::before{content:"";position:absolute;left:0;top:.72em;width:.42em;height:.42em;margin-top:-.21em;border-radius:50%;background:var(--lf-orange)}
.lf-msg .lf-also{margin-top:.55em;font-size:var(--fs);line-height:1.45;color:var(--lf-muted)}
.lf.lf-flow .lf-msg ul{display:flex;flex-wrap:wrap;column-gap:1.1em;line-height:1.5;margin-top:.6em}
.lf-brands{position:absolute;left:var(--pl);right:var(--pr);bottom:var(--pb);margin:0;font-size:var(--fbr);line-height:1.5;color:var(--lf-muted);letter-spacing:.02em}
.lf-brands b{margin-right:.8em;color:var(--lf-navy)}.lf-brands i{font-style:normal;opacity:.9;white-space:nowrap}.lf-brands .lf-sp{letter-spacing:1.2em}
.lf-rigslot,.lf-chips{display:none}
.lf-bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--lf-orange);transform-origin:left center;transform:scaleX(0);opacity:.9;pointer-events:none;transition:background-color .25s}
.lf.lf-paused .lf-bar{background:#7d8a99}
.lf-pause{position:absolute;right:var(--pr);top:calc(var(--pt) - 6px);display:flex;align-items:center;justify-content:center;gap:7px;height:34px;min-width:34px;padding:0;border-radius:17px;border:1px solid var(--lf-line);background:rgba(255,255,255,.88);color:var(--lf-navy);font:inherit;font-size:13px;font-weight:600;line-height:1;cursor:pointer;opacity:0;transition:opacity .25s,background-color .2s,color .2s}
.lf-pause::after{content:"";position:absolute;inset:-7px}
.lf-pause svg{display:block;width:12px;height:12px;fill:currentColor}
.lf-pause .lf-i-play,.lf-pause span{display:none}
.lf.lf-show-ui .lf-pause,.lf-pause:focus-visible{opacity:1}
@media (pointer:coarse){.lf-pause{opacity:.62}}
.lf.lf-paused .lf-pause{opacity:1;background:var(--lf-navy);border-color:var(--lf-navy);color:#fff;padding:0 14px 0 12px}
.lf.lf-paused .lf-pause .lf-i-play{display:block}.lf.lf-paused .lf-pause .lf-i-pause{display:none}
.lf.lf-paused .lf-pause span{display:inline}
.lf-pause:focus-visible,.lf:focus-visible{outline:3px solid #2f7fd0;outline-offset:-3px}
.lf.lf-kiosk,.lf.lf-kiosk *{cursor:none}
.lf.lf-kiosk .lf-pause{display:none}
.lf.lf-stack .lf-corner{max-width:none;right:calc(var(--pr) + 46px);line-height:1.35}
.lf.lf-stack .lf-corner b{display:block;border:0;margin:0;padding:0}
.lf.lf-stack.lf-paused .lf-pause{padding:0}.lf.lf-stack.lf-paused .lf-pause span{display:none}
.lf.lf-stack .lf-closing{display:flex;flex-direction:column;padding:var(--stack-top,60px) var(--pr) var(--pb) var(--pl)}
.lf.lf-stack .lf-closing>*{position:static;flex:none;width:auto}
.lf.lf-stack .lf-closing .lf-rigslot{display:block;flex:1 1 0;min-height:var(--rigmin,120px)}
.lf.lf-stack .lf-chips{display:flex;flex-wrap:wrap;align-items:center;gap:.38em .36em;margin:0 0 .9em;font-size:var(--ft)}
.lf-chip{display:block;max-width:100%;padding:.2em .5em .22em .46em;border-radius:5px;border:1px solid var(--lf-line);border-left:3px solid var(--lf-orange);background:#fff;font-weight:700;line-height:1.2;color:var(--lf-navy);letter-spacing:.02em;opacity:0}
.lf-chip.lf-chem{border-left-color:var(--lf-green)}
.lf[lang="en"] .lf-chip,.lf[lang="ja"] .lf-chip{letter-spacing:0}
.lf-chips-h{display:flex;align-items:center;gap:.45em;margin-right:.15em;font-size:var(--fs);font-weight:700;letter-spacing:.06em;color:var(--lf-orange-ink);white-space:nowrap}
.lf-chips-br{flex:0 0 100%;height:0}
.lf.lf-stack .lf-closing .lf-offer{display:none}
.lf.lf-stack .lf-msg ul{display:flex;flex-wrap:wrap;column-gap:1.1em;line-height:1.5;margin-top:.5em}
.lf.lf-stack .lf-msg .lf-also{margin-top:.25em}
.lf.lf-stack .lf-brands{margin-top:.9em;line-height:1.45}
.lf.lf-stack .lf-brands i{display:block;white-space:normal;margin-top:.15em}
.lf.lf-stack .lf-title .lf-msg{left:var(--pl);right:var(--pr);width:auto}
.lf.lf-stack.lf-c1 .lf-chips{gap:.26em .3em;margin-bottom:.6em}
.lf.lf-stack.lf-c1 .lf-chip{padding:.12em .42em .14em .4em}
.lf.lf-stack.lf-c1 .lf-msg h2{line-height:1.18}
.lf.lf-stack.lf-c1 .lf-msg ul{line-height:1.36;margin-top:.35em}
.lf.lf-stack.lf-c1 .lf-msg .lf-also{margin-top:.1em;line-height:1.36}
.lf.lf-stack.lf-c1 .lf-brands{margin-top:.55em;line-height:1.34}
.lf.lf-stack.lf-c2 .lf-chips{gap:.2em .28em;margin-bottom:.45em}
.lf.lf-stack.lf-c2 .lf-chip{line-height:1.12;padding:.1em .4em .12em .38em}
.lf.lf-stack.lf-c2 .lf-msg{font-size:var(--fb);line-height:1.36}
.lf.lf-stack.lf-c2 .lf-msg ul{display:inline;line-height:1.36}
.lf.lf-stack.lf-c2 .lf-msg li{display:inline-block;margin-right:1em}
.lf.lf-stack.lf-c2 .lf-msg .lf-also{display:inline;margin:0}
.lf.lf-stack.lf-c2 .lf-msg h2{margin-bottom:.2em}
.lf.lf-stack.lf-c2 .lf-brands{margin-top:.4em}
.lf.lf-stack.lf-c2 .lf-brands i{display:inline}
`;
const ICONS = `<svg class="lf-i-pause" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1h3v10H2zM7 1h3v10H7z"/></svg><svg class="lf-i-play" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1l8 5-8 5z"/></svg><span></span>`;
const TEMPLATE = `<div class="lf-probe"></div><canvas class="lf-gl" role="img"></canvas><canvas class="lf-xfade" aria-hidden="true"></canvas>
<svg class="lf-leaders" aria-hidden="true"></svg><div class="lf-tags"></div>
<div class="lf-title"><div class="lf-msg"><p class="lf-k"></p><h2></h2><p class="lf-sub"></p></div></div>
<div class="lf-closing"><div class="lf-rigslot"></div><div class="lf-chips"></div><div class="lf-msg"><h2></h2><p class="lf-offer"></p><ul></ul><p class="lf-also"></p></div><p class="lf-brands"></p></div>
<p class="lf-corner"><b></b><span></span></p><button class="lf-pause" type="button" aria-pressed="false">${ICONS}</button><div class="lf-bar"></div>`;

/**
 * Mount the film inside `host` (any sized block element; it may be full-bleed). Returns { pause(), play(), seek(seconds), destroy() }.
 *   lang  - "zh-tw" | "zh-cn" | "en" | "ja"
 *   base  - where mats.js and parts/ live, relative to this module (or an absolute URL)
 *   kiosk - hide the pause control and the cursor
 * The film only renders while it is on screen and the tab is visible. It never captures wheel or touch scrolling.
 * The title frame (plain DOM) is on screen as soon as this function is called; the 3D picture fades in when its first frame is drawn.
 */
export async function mountLineFilm(host, { lang = "zh-tw", base = "./", kiosk = false } = {}) {
const T = LOCALES[lang] ?? LOCALES["zh-tw"];
const UI = T.ui;
if (!document.getElementById("lf-style")) { const st = document.createElement("style"); st.id = "lf-style"; st.textContent = CSS; document.head.append(st); }
const root = document.createElement("div"); root.className = "lf" + (kiosk ? " lf-kiosk" : ""); root.lang = T.lang; root.tabIndex = 0; root.innerHTML = TEMPLATE; host.append(root);
const $ = (s) => root.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), clamp01 = (x) => Math.min(1, Math.max(0, x));

/* ------------------------------------------------------------------ static copy and label elements (no 3D needed) */
const canvas = $(".lf-gl"), $tags = $(".lf-tags"), svg = $(".lf-leaders"), NS = "http://www.w3.org/2000/svg";
const corner = $(".lf-corner"), brandsEl = $(".lf-brands"), pauseBtn = $(".lf-pause"), titleMsg = $(".lf-title .lf-msg"), closeMsg = $(".lf-closing .lf-msg"), chipsEl = $(".lf-chips"), rigSlot = $(".lf-rigslot");
canvas.setAttribute("aria-label", UI.canvas_label);
$(".lf-corner b").textContent = UI.company; $(".lf-corner span").textContent = UI.offer;
$(".lf-title .lf-k").textContent = UI.company; $(".lf-title .lf-sub").textContent = UI.title_sub;
$(".lf-title h2").textContent = UI.title.replace(/([，、])/g, "$1\u200b");   // CJK title lines break after the comma, not mid-phrase
$(".lf-closing h2").textContent = UI.close_h; $(".lf-closing .lf-offer").textContent = UI.offer;
for (const key of Object.keys(T.groups)) $(".lf-closing ul").append(el("li", null, T.groups[key].title));
$(".lf-closing .lf-also").textContent = UI.close_also;
const allBrands = [...new Set(Object.values(T.groups).flatMap((g) => g.brands))];
brandsEl.append(el("b", null, UI.brands_h), document.createTextNode(allBrands.join(" · ")), el("span", "lf-sp", " "), el("i", null, UI.brand_note));
const gasLabels = LABELS.filter((l) => l.row === "gas"), chemLabels = LABELS.filter((l) => l.row === "chem");
const labels = LABELS.map((l) => {
  // a zero-width space after each middle dot is the only place a long name may wrap
  const copy = T.labels[l.id], tag = el("div", "lf-tag lf-" + l.row), chip = el("span", "lf-chip lf-" + l.row, copy.name.replace(/・/g, "・​"));
  tag.append(el("b", null, copy.name.replace(/・/g, "・​"))); if (copy.sub) tag.append(el("i", null, copy.sub)); $tags.append(tag);
  const mk = () => { const g = document.createElementNS(NS, "g"); g.dataset.l = l.id; const ln = document.createElementNS(NS, "path"), dot = document.createElementNS(NS, "circle"); dot.setAttribute("r", "4.5"); g.append(ln, dot); svg.append(g); return { g, ln, dot }; };
  return { ...l, tag, chip, lines: [mk(), mk()], gi: gasLabels.indexOf(l), ci: chemLabels.indexOf(l), on: 0, off: Infinity, w: 0, h: 0, minW: 0, x: 0, y: 0, alpha: 0, draws: [] };
});
const legends = [["gas", UI.legend_gas], ["chem", UI.legend_chem]].map(([row, text]) => { const e = el("div", "lf-legend lf-" + row, text); $tags.append(e); return { row, e, w: 0, h: 0 }; });
// stack layout: the same names as a wrapped list in document flow, gas line first, then the chemical line on a new row
for (const [row, text] of [["gas", UI.legend_gas], ["chem", UI.legend_chem]]) {
  if (row === "chem") chipsEl.append(el("span", "lf-chips-br"));
  chipsEl.append(el("span", "lf-chips-h lf-" + row, text)); for (const l of labels) if (l.row === row) chipsEl.append(l.chip);
}

/* ------------------------------------------------------------------ layout: type scale, safe margins, text blocks */
const lay = { W: 0, H: 0, stack: false, rig: { x: 0, y: 0, w: 1, h: 1 }, side: null, top: 0, pl: 0, pr: 0, pb: 0, legendW: { gas: 0, chem: 0 }, u: 1 };
const setV = (o) => { for (const key in o) root.style.setProperty("--" + key, o[key].toFixed(2) + "px"); };
const rel = (e) => { const r = e.getBoundingClientRect(), o = root.getBoundingClientRect(); return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, r: r.right - o.left, b: r.bottom - o.top }; };
const tagK = T.lang === "en" ? 0.84 : T.lang === "ja" ? 0.9 : 1;   // long Latin / kana names: slightly smaller cards in the side layout
// headline lines never wrap by themselves: shrink the type until the longest line fits the column
function fitHeadline(size, maxW) {
  const h2 = $(".lf-closing h2"); root.style.setProperty("--fh", size.toFixed(2) + "px");
  const w = h2.scrollWidth; if (w > maxW + 0.5) { size = Math.floor(size * (maxW / w) * 50) / 50; root.style.setProperty("--fh", size.toFixed(2) + "px"); }
  return size;
}
function measureTags(step) {
  let hMax = 0;
  for (const l of labels) { l.tag.style.width = ""; l.tag.style.height = ""; }
  for (const l of labels) l.w0 = Math.ceil((l.tag.getBoundingClientRect().width + 1.5) / step) * step;   // fractional width plus slack: a rounded-down width re-wraps the text
  for (const l of labels) { l.w = Math.max(l.w0, l.minW); l.tag.style.width = l.w + "px"; }
  for (const l of labels) hMax = Math.max(hMax, l.tag.offsetHeight);
  for (const l of labels) { l.h = hMax; l.tag.style.height = hMax + "px"; }   // every card the same height, whatever the language
  for (const g of legends) { g.w = g.e.offsetWidth; g.h = g.e.offsetHeight; lay.legendW[g.row] = g.w + 14; }
}
// density (side layout): 0 = cards with their secondary line, 1 = names only, 2 = narrower cards (long names wrap to two
// lines), 3 = a size smaller as well, 4 = narrower still
function layoutDom(density = 0) {
  const W = root.clientWidth, H = root.clientHeight; if (!W || !H) return false;
  const stack = W / H < 1.2, rr = root.getBoundingClientRect(), ps = getComputedStyle($(".lf-probe")), sa = (k) => parseFloat(ps[k]) || 0;
  // safe margins scale with the width; device insets are added where the film actually touches that screen edge
  const m = clamp(W * 0.035, 16, 110), bar = 3;
  const pl = m + sa("paddingLeft"), pr = m + sa("paddingRight"), pt = clamp(H * 0.03, 12, 34) + (rr.top < 1 ? sa("paddingTop") : 0), pb = clamp(H * 0.02, 8, 22) + bar + (rr.bottom > innerHeight - 1 ? sa("paddingBottom") : 0);
  Object.assign(lay, { W, H, stack, pl, pr, pb });
  root.classList.toggle("lf-stack", stack); root.classList.remove("lf-flow", "lf-c1", "lf-c2"); root.style.removeProperty("--ftg"); root.style.removeProperty("--fig"); root.classList.toggle("lf-d1", !stack && density >= 1);
  setV({ pl, pr, pt, pb });
  if (stack) layoutStack(W, H); else layoutSide(W, H, density);
  return true;
}
function layoutSide(W, H, density) {
  const s = clamp(Math.min(W / 1920, H / 1000), 0.4, 1.22), { pl, pr } = lay;
  let col = clamp(W * 0.285, 250, 600), fh = clamp(56 * s, 26, 66), fb = clamp(22 * s, 13, 26), fs = clamp(15 * s, 12, 17);
  const ft = Math.max(13, clamp(27 * s, 14, 32) * tagK * (density > 2 ? 0.9 : 1)), gapS = clamp(H * 0.012, 6, 14);
  setV({ ft, fi: clamp(14.5 * s, 11, 17), fc: clamp(19 * s, 12, 23), fbr: clamp(13.5 * s, 11, 16) });
  const top = Math.max(rel(corner).b, rel(pauseBtn).b) + gapS, brandsTop = rel(brandsEl).y, avail = brandsTop - top - 2 * gapS;
  // the message column: shrink (and let the family list flow) only if a very short container cannot hold it
  let mh = 0;
  for (let i = 0; i < 3; i++) {
    setV({ fb, fs, col, fht: fh }); fh = fitHeadline(fh, col); mh = closeMsg.offsetHeight;
    if (mh <= avail || i === 2) break;
    const kf = Math.max(0.8, avail / mh); fh = Math.max(20, fh * kf); fb = Math.max(12, fb * kf); fs = Math.max(11, fs * kf); col = Math.min(col * 1.18, W * 0.42); root.classList.add("lf-flow");
  }
  const msgTop = top + gapS + Math.max(0, (avail - mh) * 0.46);
  setV({ "msg-top": msgTop, "title-top": top + gapS + Math.max(0, (avail - titleMsg.offsetHeight) * 0.42) });
  const colGap = clamp(W * 0.02, 16, 44), xL = pl + col + colGap, xR = W - pr;
  setV({ tagmax: Math.max(96, clamp((xR - xL) / 3.8, 120, 340) / [1, 1, 1.35, 1.35, 1.8][density]) });
  measureTags(clamp(H * 0.02, 8, 20));
  const cardH = labels[0].h, rowGap = clamp(H * 0.009, 4, 10), yUp = top + cardH / 2, yLow = yUp + cardH + rowGap, trackTop = yLow + cardH / 2 + 8, trackZone = clamp(H * 0.055, 30, 56);
  const yC = brandsTop - gapS - cardH / 2, drop = clamp(H * 0.022, 10, 22), y0 = trackTop + trackZone, free = (yb) => (yb + 10 <= msgTop ? pl : xL);
  lay.top = top; lay.u = ft / (27 * tagK);
  lay.rig = { x: xL, y: y0, w: xR - xL, h: Math.max(40, yC - cardH / 2 - drop - y0) };
  // a row of cards may run left over the message column only where it clears the message block
  lay.side = { xL, xR, yUp, yLow, yC, cardH, trackTop, upLeft: free(yUp + cardH / 2), lowLeft: free(yLow + cardH / 2), chemLeft: yC - cardH / 2 - 10 >= msgTop + mh ? pl : xL, full: { x: xL, y: top + gapS, w: xR - xL, h: brandsTop - top - 3 * gapS } };
}
function layoutStack(W, H) {
  const tiny = W < 380, { pl, pr } = lay, cw = W - pl - pr, closing = $(".lf-closing");
  const base = { fh: clamp(W * 0.072, 24, 60), fb: clamp(W * 0.031, 12, 22), fs: clamp(W * 0.031, 12, 18), ft: clamp(W * 0.0395, tiny ? 14 : 15, 24), fi: clamp(W * 0.03, 12, 16), fc: clamp(W * 0.031, 12, 18), fbr: clamp(W * 0.03, 12, 15) };
  const floor = { fh: 22, fb: 12, fs: 12, ft: tiny ? 14 : 15, fi: 12, fc: 12, fbr: 12 };
  // returns [overflow of the closing column, height the rig slot got]
  const apply = (z, level) => {
    const o = {}; for (const key in base) o[key] = level >= 2 ? floor[key] * z : Math.max(floor[key], base[key] * z);
    root.classList.toggle("lf-c1", level >= 1);
    root.classList.toggle("lf-c2", level >= 2);
    setV({ ...o, fht: Math.max(o.fh, base.fh) * 1.06, ftg: Math.max(base.ft, o.ft), fig: Math.max(base.fi, o.fi), rigmin: level >= 2 ? Math.min(W * 0.25, H * 0.16) : clamp(W * 0.4, 100, H * 0.3) });
    setV({ "stack-top": rel(corner).b + 6 }); fitHeadline(o.fh, cw);
    return [closing.scrollHeight - closing.clientHeight, rigSlot.offsetHeight];
  };
  let [over, slot] = apply(1, 0);
  if (over > 0.5) {
    // too much copy for the height: tighter spacing, then the minimum sizes, and only then smaller than that
    let level = 1, z = 1; [over] = apply(1, 1);
    if (over > 0.5) { level = 2; [over] = apply(1, 2); }
    while (over > 0.5 && z > 0.72) { z -= 0.04; [over] = apply(z, level); }
  } else if (slot > W * 0.78) {
    // a tall container with room to spare: larger type instead of empty bands above and below the rig
    let z = 1;
    while (z < 1.3) { const [o2, s2] = apply(z + 0.05, 0); if (o2 > 0.5 || s2 < W * 0.7) { apply(z, 0); break; } z += 0.05; }
  }
  const r = rel(rigSlot), top = rel(corner).b + 6;
  lay.top = top; lay.u = 1; lay.side = null;
  lay.rig = { x: 6, y: r.y + 6, w: W - 12, h: Math.max(40, r.h - 12) };
  const below = H - lay.pb - r.b;
  setV({ "title-top": r.b + Math.max(0, (below - titleMsg.offsetHeight) * 0.3), tagmax: clamp(W * 0.62, 200, 340) });
  measureTags(1);
}
layoutDom();
$(".lf-title").style.opacity = 1;   // the title frame is readable before any 3D exists

const B = new URL(base, import.meta.url);
const [{ makeMats }, { lineUnits: IU, HALF_JOINT }, { lineUnits: VU }, { lineFittings }, { lineFluoro }] = await Promise.all(
  ["mats.js", "parts/instruments.js", "parts/valves.js", "parts/fittings.js", "parts/fluoro.js"].map((f) => import(new URL(f, B).href)));

/* ------------------------------------------------------------------ renderer / scene */
const SCALE = 2;                 // components are shown at twice real size; cylinder, frames and tool are 1:1
const k = SCALE / 1000;          // line millimetres -> metres
const YP = 1.42;                 // height of the panel axis (= cylinder valve outlet)
const HI = 0xf0954a, LO = 0x2f7fd0;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.Fog(0xffffff, 16, 46);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
scene.environmentIntensity = 0.8;
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 120);
const M = makeMats(THREE);
// This page owns its material set: in a white studio the mirror finishes need a slightly deeper base tone and a touch
// more roughness, otherwise polished tube reads as flat white.
for (const [key, color, rough] of [["ss_ep", 0xc9ced4, 0.13], ["ss_ba", 0xc4c9ce, 0.2], ["ss_mp", 0xbcc1c6, 0.3]]) { M[key] = M[key].clone(); M[key].color.set(color); M[key].roughness = rough; }

const L = new THREE.Group(); L.position.set(0, YP, 0); L.scale.setScalar(k); scene.add(L);
const stopG = {};
for (const id of ["cyl_conn", "pigtail", "purge", "hp_valve", "transducer", "regulator", "gauge", "filter", "check", "bellows", "vcr", "tube", "elbow", "tee", "pneumatic", "chem"]) { const g = new THREE.Group(); g.name = id; stopG[id] = g; L.add(g); }
const W = (x, y, z) => new THREE.Vector3(x * k, YP + y * k, z * k);   // line mm -> world

/* ------------------------------------------------------------------ assembly */
const view = {};       // part id -> { anchor: Vector3 } where a label leader lands
const flowPts = [], chemPts = [];   // polylines of the gas and chemical paths in world space
let regS = 0;          // arc length at the regulator
const info = {};       // layout numbers the context builders need

function buildLine() {
  const F = lineFittings(THREE), K = F.K, EP = M.ss_ep, X = new THREE.Vector3(1, 0, 0);
  const joints = [];   // half face-seal joints: { p: [x, y, z] tip of the male port, d: direction the port points }
  const J = 2 * HALF_JOINT;
  const batch = {};    // one geometry batch per stop for welded parts
  const B = (id) => (batch[id] ??= K.batch());
  const put = (id, unit, x, y, z, quat) => { unit.group.position.set(x, y, z); if (quat) unit.group.quaternion.copy(quat); stopG[id].add(unit.group); return unit; };
  const qz = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
  const qx = (a) => new THREE.Quaternion().setFromAxisAngle(X, a);
  const standoffs = [];  // [x, y, zBack] in line mm: spacer from the panel plate to the back of a body
  const PLATE_Z = -44;
  const R4 = 3.175, W4 = 0.89, R8 = 6.35, W8 = 1.24;   // 1/4" and 1/2" tube: outer radius, wall

  /* ---- panel: components in a row, face-seal joints between them */
  const seq = [["vcr", IU.tee(M)], ["hp_valve", VU.diaphragm(THREE, M)], ["transducer", IU.transducer(M)], ["regulator", IU.regulator(M)],
    ["gauge", IU.gauge(M)], ["filter", IU.filter(M)], ["check", VU.check(THREE, M)], ["bellows", VU.bellows(THREE, M)]];
  let cx = 0; const centre = {};
  for (const [id, u] of seq) {
    const xc = cx + u.len / 2;
    put(id, u, xc, 0, 0);
    joints.push({ p: [cx, 0, 0], d: [-1, 0, 0] }, { p: [cx + u.len, 0, 0], d: [1, 0, 0] });
    standoffs.push([xc, 0, -u.back + 0.6]);
    centre[id] = xc;
    if (id !== "vcr") view[id] = { anchor: W(xc, u.top + 3, 0), c: W(xc, u.top * 0.35, 0), r: Math.max(u.len * 0.62, u.top * 0.75) * k };
    cx += u.len + J;
  }
  const xE = cx - J, xt = centre.vcr, tee = seq[0][1];
  view.gauge.c = W(centre.gauge, 45, 0); view.gauge.r = 62 * k;
  view.bellows.dir = [0.5, 0.3, 1];

  /* ---- N2 purge branch on the first tee: check valve, then ball valve (closed), supply tube over the top of the plate */
  {
    const y0 = tee.upTip, chk = VU.check(THREE, M), ball = VU.ball(THREE, M);
    const yc = y0 + J + chk.len / 2, yTop = yc + chk.len / 2, yb = yTop + HALF_JOINT + 12 + ball.len / 2, yBend = 262;
    put("check", chk, xt, yc, 0, qz(-Math.PI / 2));
    put("purge", ball, xt, yb, 0, qz(Math.PI / 2).multiply(qx(Math.PI / 2)));
    ball.handle.rotation.y = Math.PI / 2;   // closed: lever across the pipe
    joints.push({ p: [xt, y0, 0], d: [0, 1, 0] }, { p: [xt, yc - chk.len / 2, 0], d: [0, -1, 0] }, { p: [xt, yTop, 0], d: [0, 1, 0] });
    B("purge").put(EP, [xt, yTop + HALF_JOINT, 0], [0, 1, 0], K.tube(R4, R4 - W4, 0, yb - 28 - yTop - HALF_JOINT, 20));
    B("purge").put(EP, [xt, yb + 28, 0], [0, 1, 0], K.tube(R4, R4 - W4, 0, yBend - yb - 28, 20));
    B("purge").add(EP, K.move(F.elbow(R4, R4 - W4, 19, false, 16), { ry: Math.PI / 2, pos: [xt, yBend, 0] }));
    B("purge").put(EP, [xt, yBend + 19, -19], [0, 0, -1], K.tube(R4, R4 - W4, 0, 60, 20), F.cap(R4, W4, 20).translate(0, 60, 0));
    standoffs.push([xt, yc, -11.4], [xt, yb, -12.4]);
    view.purge = { anchor: W(xt - 14, yb, 13), c: W(xt, yb - 30, 0), r: 105 * k, dir: [0.55, 0.22, 1] };
    view.purge_check = { anchor: W(xt + 12, yc, 0), via: W(xt + 46, yb, 0) };   // via: where the wide-shot fork clears the ball valve
    info.n2 = W(xt, yBend + 34, -40);
  }

  /* ---- upstream: pigtail and cylinder connection */
  const ZC = -16, XS = -HALF_JOINT - 80, XO = XS - 40, XV = XO - 34 - 24;
  {
    const L1 = 40, R = 45, Lc = 2 * Math.PI * R, tot = 2 * L1 + Lc;
    class Pigtail extends THREE.Curve {
      getPoint(t, o = new THREE.Vector3()) {
        const s = t * tot;
        if (s < L1) return o.set(XS + s, 0, ZC);
        if (s < L1 + Lc) { const u = (s - L1) / Lc, th = -Math.PI / 2 + u * 2 * Math.PI, w = u * u * (3 - 2 * u); return o.set(XS + L1 + R * Math.cos(th), R + R * Math.sin(th), ZC * (1 - w)); }
        return o.set(XS + L1 + (s - L1 - Lc), 0, 0);
      }
    }
    const curve = new Pigtail();
    stopG.pigtail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 180, R4, 14, false), EP));
    B("cyl_conn").put(M.ss_machined, [XO, 0, ZC], [-1, 0, 0], F.cylinderNut());
    B("cyl_conn").put(M.ss_ba, [XO, 0, ZC], [-1, 0, 0], F.cylinderNipple());
    view.cyl_conn = { anchor: W(XO - 8, 18, ZC), c: W(XO - 6, 4, ZC), r: 62 * k, dir: [-0.12, 0.3, 1] };
    view.pigtail = { anchor: W(XS + L1, 2 * R + 4, ZC / 2), c: W(XS + L1, R, ZC / 2), r: 80 * k, dir: [0.35, 0.25, 1] };
    flowPts.push(W(XV + 10, 0, ZC), W(XS, 0, ZC));
    for (let i = 1; i <= 60; i++) { const p = curve.getPoint(i / 60); flowPts.push(W(p.x, p.y, p.z)); }
    info.XV = XV; info.ZC = ZC; info.XO = XO;
    info.outletThread = K.batch().put(M.ss_machined, [XO, 0, ZC], [-1, 0, 0], F.outletThread(22));
  }

  /* ---- downstream: reducer, 1/2" distribution run with two elbows and a tee, drop to the valve box and the tool */
  const xA = xE + 50, xB = xA + 30 + 40, xR = xB + 19, H = 310, xT = xR + 19 + 300;
  {
    joints.push({ p: [xT, 168, 0], d: [0, 1, 0] }, { p: [xT, 105.5, 0], d: [0, -1, 0] }, { p: [xT, 77.5, 0], d: [0, 1, 0] });
    const r8 = [R8, R8 - W8], t4 = (len) => K.tube(R4, R4 - W4, 0, len, 20), t8 = (len) => K.tube(R8, R8 - W8, 0, len, 28);
    B("tube").put(EP, [xE + HALF_JOINT, 0, 0], [1, 0, 0], t4(xA - xE - HALF_JOINT));
    B("tee").put(EP, [xA, 0, 0], [1, 0, 0], F.reducer(R4, W4, R8, W8, 30), F.weld(R4), F.weld(R8).translate(0, 30, 0));
    B("tube").put(EP, [xA + 30, 0, 0], [1, 0, 0], t8(40));
    B("elbow").add(EP, K.move(F.elbow(...r8, 19, true), { pos: [xB, 0, 0] }));
    B("elbow").put(EP, [xB, 0, 0], [1, 0, 0], F.weld(R8)); B("elbow").put(EP, [xR, 19, 0], [0, 1, 0], F.weld(R8));
    B("tube").put(EP, [xR, 19, 0], [0, 1, 0], t8(H - 38));
    B("elbow").add(EP, K.move(F.elbow(...r8, 19, false), { pos: [xR, H - 19, 0] }));
    B("elbow").put(EP, [xR, H - 19, 0], [0, 1, 0], F.weld(R8)); B("elbow").put(EP, [xR + 19, H, 0], [1, 0, 0], F.weld(R8));
    B("tube").put(EP, [xR + 19, H, 0], [1, 0, 0], t8(xT - 22 - xR - 19));
    B("tee").add(EP, K.move(K.tee(...r8, 22, 22, { nphi: 28, nb: 28, nx: 3 }), { rx: Math.PI / 2, pos: [xT, H, 0] }));
    B("tee").put(EP, [xT - 22, H, 0], [1, 0, 0], F.weld(R8)); B("tee").put(EP, [xT + 22, H, 0], [1, 0, 0], F.weld(R8)); B("tee").put(EP, [xT, H - 22, 0], [0, 1, 0], F.weld(R8));
    B("tube").put(EP, [xT + 22, H, 0], [1, 0, 0], t8(48));
    B("tee").put(EP, [xT + 70, H, 0], [1, 0, 0], F.cap(R8, W8), F.weld(R8));
    B("tube").put(EP, [xT, H - 22, 0], [0, -1, 0], t8(60));
    B("tee").put(EP, [xT, H - 82, 0], [0, -1, 0], F.reducer(R8, W8, R4, W4, 30), F.weld(R8), F.weld(R4).translate(0, 30, 0));
    B("tube").put(EP, [xT, H - 112, 0], [0, -1, 0], t4(16));
    const pv = put("pneumatic", VU.pneumatic(THREE, M), xT, 168 - 31.25, 0, qz(-Math.PI / 2));
    standoffs.push([xT, 168 - 31.25, -13.4]);
    put("vcr", IU.inletPort(M), xT, 77.5 - 17.9, 0);
    view.pneumatic = { anchor: W(xT, 137 + 16, 0), c: W(xT + 30, 137, 0), r: 105 * k, dir: [0.3, 0.2, 1] };
    view.tube_w = { anchor: W((xR + xT) / 2 - 30, H + R8, 0) };   // wide shot: on the top run, between the elbow and the tee
    view.tube = { anchor: W(xR, H * 0.62, 0), c: W((xR + xT) / 2 - 40, H - 90, 0), r: 300 * k, dir: [0.3, 0.22, 1] };
    view.elbow = { anchor: W(xR + 4, H + 4, 0), c: W(xR + 10, H - 30, 0), r: 85 * k, dir: [0.4, 0.25, 1] };
    view.tee = { anchor: W(xT, H + 7, 0), c: W(xT, H - 40, 0), r: 110 * k, dir: [0.35, 0.25, 1] };
    view.vcr = { anchor: W(xE - 59.5 - HALF_JOINT, 10, 0), c: W(xE - 10, 0, 0), r: 75 * k, dir: [0.45, 0.3, 1] };
    // gas path
    flowPts.push(W(xB, 0, 0));
    const arc = (cxm, cym, a0, a1) => { for (let i = 1; i <= 8; i++) { const a = a0 + ((a1 - a0) * i) / 8; flowPts.push(W(cxm + 19 * Math.cos(a), cym + 19 * Math.sin(a), 0)); } };
    arc(xB, 19, -Math.PI / 2, 0); flowPts.push(W(xR, H - 19, 0)); arc(xR + 19, H - 19, Math.PI, Math.PI / 2);
    flowPts.push(W(xT - 8, H, 0), W(xT, H - 8, 0), W(xT, 66, 0));
    Object.assign(info, { xE, xR, xT, H, PLATE_Z, regX: centre.regulator, vmb: { yTop: H - 120, yBot: 91.5 } });
  }

  for (const id in batch) batch[id].build(stopG[id]);

  /* ---- face-seal joints: one instanced set */
  {
    const hj = IU.halfJoint(M), m = new THREE.Matrix4(), qq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), d = new THREE.Vector3();
    for (const mesh of hj.group.children) {
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, joints.length);
      joints.forEach((j, i) => { qq.setFromUnitVectors(X, d.set(...j.d)); im.setMatrixAt(i, m.compose(p.set(...j.p), qq, one)); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox();
      stopG.vcr.add(im);
    }
  }

  /* ---- spacers between the plate and each body (line mm) */
  {
    const gs = standoffs.map(([x, y, zb]) => { const len = zb - PLATE_Z, g = new THREE.CylinderGeometry(4.5, 4.5, len, 14); g.rotateX(Math.PI / 2); g.translate(x, y, PLATE_Z + len / 2); return g; });
    const spacer = new THREE.Mesh(mergeGeometries(gs), M.ss_machined); L.add(spacer);
  }
}

/* ------------------------------------------------------------------ context: cylinder, cabinet frame, plate, posts, valve box, tool, floor */
function buildContext() {
  const ctx = new THREE.Group(); scene.add(ctx);
  const paint = new THREE.MeshStandardMaterial({ color: 0xc3cad2, metalness: 0.15, roughness: 0.6 });       // powder-coated steel
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xd3d9df, metalness: 0.35, roughness: 0.5 });
  const cylMat = new THREE.MeshPhysicalMaterial({ color: 0x77838f, metalness: 0.2, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x8b97a4, metalness: 0.3, roughness: 0.4 });
  const toolMat = new THREE.MeshStandardMaterial({ color: 0xe3e7eb, metalness: 0.1, roughness: 0.55 });
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const frame = [], plates = [];
  const { xE, xR, xT, H, XV, ZC, PLATE_Z } = info, zP = PLATE_Z * k;

  // gas cylinder (1:1) with its valve (component scale, in line mm)
  const cx = XV * k, cz = ZC * k, top = YP - 0.062;
  const prof = [[0, 0.012], [0.1, 0], [0.115, 0.014], [0.115, top - 0.19]];
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; prof.push([0.036 + 0.079 * Math.cos(a), top - 0.19 + 0.15 * Math.sin(a)]); }
  prof.push([0.036, top - 0.012], [0.044, top - 0.012], [0.044, top], [0, top]);
  const cyl = new THREE.Mesh(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 56), cylMat);
  cyl.position.set(cx, 0, cz); ctx.add(cyl);
  {
    const g = new THREE.Group(); g.position.set(XV, 0, ZC); L.add(g);
    const body = [box(40, 52, 40, 0, -2, 0), new THREE.CylinderGeometry(15, 15, 5, 28).rotateZ(Math.PI / 2).translate(21.5, 0, 0),
      new THREE.CylinderGeometry(13, 16, 8, 28).translate(0, -27.5, 0), new THREE.CylinderGeometry(9, 9, 14, 20).translate(0, 31, 0)];
    g.add(new THREE.Mesh(mergeGeometries(body), M.ss_cast));
    const wheel = [new THREE.CylinderGeometry(30, 30, 12, 9).translate(0, 44, 0), new THREE.CylinderGeometry(12, 12, 15, 20).translate(0, 44, 0)];
    g.add(new THREE.Mesh(mergeGeometries(wheel), M.black));
    info.outletThread.build(L);
  }

  // open cabinet frame around the cylinder
  const fx0 = cx - 0.24, fx1 = cx + 0.24, fz0 = cz - 0.25, fz1 = cz + 0.25, FH = 1.95, t = 0.03;
  for (const x of [fx0, fx1]) for (const z of [fz0, fz1]) frame.push(box(t, FH, t, x, FH / 2, z));
  for (const y of [t / 2 + 0.006, FH - t / 2]) {
    for (const z of [fz0, fz1]) frame.push(box(fx1 - fx0 - t, t, t, cx, y, z));
    for (const x of [fx0, fx1]) frame.push(box(t, t, fz1 - fz0 - t, x, y, cz));
  }
  frame.push(box(fx1 - fx0 - t, t, t, cx, 1.0, fz0), box(t, t, fz1 - fz0 - t, fx0, 1.0, cz), box(t, t, fz1 - fz0 - t, fx1, 1.0, cz));
  frame.push(box(fx1 - fx0 + t, 0.006, fz1 - fz0 + t, cx, 0.003, cz));
  // cylinder restraint: strap round the front, two bars back to the rear rail
  const strap = [new THREE.TorusGeometry(0.121, 0.005, 8, 40, Math.PI).rotateX(Math.PI / 2).translate(cx, 1.0, cz)];
  for (const s of [-1, 1]) strap.push(new THREE.CylinderGeometry(0.005, 0.005, cz - fz0 - t / 2, 8).rotateX(Math.PI / 2).translate(cx + s * 0.121, 1.0, (cz + fz0 + t / 2) / 2));
  ctx.add(new THREE.Mesh(mergeGeometries(strap), M.ss_machined));

  // panel plate on two posts
  const px0 = -0.035, px1 = xE * k + 0.035, py0 = YP - 0.13, py1 = YP + 0.5, post = 0.04, zPost = zP - 0.005 - post / 2;
  plates.push(box(px1 - px0, py1 - py0, 0.005, (px0 + px1) / 2, (py0 + py1) / 2, zP - 0.0025));
  const postAt = (x, h) => { frame.push(box(post, h, post, x, h / 2, zPost), box(0.14, 0.008, 0.14, x, 0.004, zPost)); };
  postAt(px0 + 0.09, py1); postAt(px1 - 0.09, py1);
  // riser post and run post with pipe clamps
  const yRun = YP + H * k, rT = 6.35 * k;
  const clamp = (x, y, vertical) => {
    frame.push(box(0.034, 0.03, -rT - 0.0005 - (zP - 0.005), x, y, (zP - 0.005 - rT - 0.0005) / 2));
    const ring = new THREE.TorusGeometry(rT + 0.0032, 0.003, 8, 28); if (vertical) ring.rotateX(Math.PI / 2); else ring.rotateY(Math.PI / 2);
    plates.push(ring.translate(x, y, 0));
  };
  const xPostD = xR * k, xPostC = xT * k - 0.17;
  postAt(xPostD, yRun + 0.06); postAt(xPostC, yRun + 0.06);
  clamp(xPostD, YP + 0.2, true); clamp(xPostD, YP + 0.45, true); clamp(xPostC, yRun, false);
  // valve box: back plate and four walls, open front, grommets where the tube passes
  const vb = { x0: xT * k - 0.19, x1: xT * k + 0.27, y0: YP + info.vmb.yBot * k, y1: YP + info.vmb.yTop * k, z1: 0.05 }, wt = 0.003;
  plates.push(box(vb.x1 - vb.x0, vb.y1 - vb.y0, wt, (vb.x0 + vb.x1) / 2, (vb.y0 + vb.y1) / 2, zP - wt / 2));
  for (const y of [vb.y0, vb.y1]) plates.push(box(vb.x1 - vb.x0, wt, vb.z1 - zP, (vb.x0 + vb.x1) / 2, y, (vb.z1 + zP) / 2));
  for (const x of [vb.x0, vb.x1]) plates.push(box(wt, vb.y1 - vb.y0 - wt, vb.z1 - zP, x, (vb.y0 + vb.y1) / 2, (vb.z1 + zP) / 2));
  const grom = [vb.y0, vb.y1].map((y) => new THREE.TorusGeometry(3.175 * k + 0.004, 0.004, 8, 24).rotateX(Math.PI / 2).translate(xT * k, y, 0));
  ctx.add(new THREE.Mesh(mergeGeometries(grom), M.rubber));

  ctx.add(new THREE.Mesh(mergeGeometries(frame), paint));
  ctx.add(new THREE.Mesh(mergeGeometries(plates), plateMat));

  // process tool: plain block with a dark front window and a plinth
  const tTop = YP + (77.5 - 17.9) * k, tx0 = xT * k - 0.1, tx1 = tx0 + 0.82, tz0 = -0.5, tz1 = 0.3;
  const tool = new THREE.Mesh(new RoundedBoxGeometry(tx1 - tx0, tTop - 0.08, tz1 - tz0, 3, 0.012).translate((tx0 + tx1) / 2, 0.08 + (tTop - 0.08) / 2, (tz0 + tz1) / 2), toolMat);
  const win = new THREE.Mesh(mergeGeometries([box(0.36, 0.3, 0.006, tx0 + 0.5, tTop - 0.36, tz1 + 0.001), box(tx1 - tx0 - 0.04, 0.08, tz1 - tz0 - 0.04, (tx0 + tx1) / 2, 0.04, (tz0 + tz1) / 2)]), dark);
  ctx.add(tool, win);
  info.toolLabel = new THREE.Vector3(tx0 + 0.45, tTop - 0.85, tz1);
  info.cylLabel = new THREE.Vector3(cx, 0.62, cz + 0.12);

  // floor: flat light concrete grey, fades into the white studio
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd6d9dc, roughness: 0.92, metalness: 0 }));
  floor.receiveShadow = true; floor.userData.floor = true; scene.add(floor);
  info.bounds = new THREE.Box3(new THREE.Vector3(fx0 - 0.03, 0, -0.3), new THREE.Vector3(tx1 + 0.02, yRun + 0.1, 0.3));
}

/* ------------------------------------------------------------------ chemical supply line (fluoropolymer), parallel to the gas line and in front of it */
function buildChem() {
  const F = lineFluoro(THREE, M), g = stopG.chem;
  const YC = (1.05 - YP) / k, ZC = 250, xT = info.xT;
  const X0 = 125, XV = 330, XU = 540, XT = 770, XP = 1010, X1 = xT + 60, ZTOOL = 150;
  const put = (u, x, y = YC, z = ZC) => { u.group.position.set(x, y, z); g.add(u.group); return u; };
  const half = (xa, ra, xb, rb) => (xb - xa - ra - rb) / 2;
  const l01 = half(X0, 29, XV, 38.5), l12 = half(XV, 38.5, XU, 24.5), l23 = half(XU, 24.5, XT, 29), l34 = half(XT, 29, XP, 38.5), l45 = half(XP, 38.5, X1, 29);
  const DIP = 60, DROP = (1.05 - 0.13) / k - 29;
  put(F.elbow([{ dir: [0, -1, 0], len: DIP }, { dir: [1, 0, 0], len: l01 }]), X0);
  const mv = put(F.manualValve(l01, l12), XV);
  put(F.union(l12, l23), XU);
  put(F.tee([{ dir: [-1, 0, 0], len: l23 }, { dir: [1, 0, 0], len: l34 }, { dir: [0, -1, 0], len: DROP, black: true }]), XT);
  const pv = put(F.pneumaticValve(l34, l45), XP);
  put(F.elbow([{ dir: [-1, 0, 0], len: l45 }, { dir: [0, 0, -1], len: ZC - 29 - ZTOOL + 8 }]), X1);
  view.c_valve = { anchor: W(XV, YC + mv.top + 2, ZC) };
  view.c_tube = { anchor: W((XV + XU) / 2 + 8, YC + F.RO, ZC) };
  view.c_fit = { anchor: W(XT, YC + 14, ZC) };
  view.c_valve_w = { anchor: W(XV - 46, YC - 12, ZC) };
  view.c_union_w = { anchor: W(XU, YC - 14, ZC) };
  view.c_tube_w = { anchor: W((XT + XP) / 2, YC - F.RO, ZC) };
  chemPts.push(W(X0, YC - 29 - DIP, ZC), W(X0, YC - 6, ZC), W(X0 + 6, YC, ZC), W(X1 - 6, YC, ZC), W(X1, YC, ZC - 6), W(X1, YC, ZTOOL));
  Object.assign(info, { chem: { X0, XV, XP, XU, XT, X1, YC, ZC, ZTOOL, RO: F.RO, base: mv.base, yDip: YC - 29 - DIP } });
}
function buildChemContext() {
  const ctx = new THREE.Group(); scene.add(ctx);
  const c = info.chem, yAx = YP + c.YC * k, z = c.ZC * k;
  const paint = new THREE.MeshStandardMaterial({ color: 0xc3cad2, metalness: 0.15, roughness: 0.6 });
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x8fa6bd, metalness: 0, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x59626c, metalness: 0.1, roughness: 0.6 });
  const box = (w, h, d, x, y, zz) => new THREE.BoxGeometry(w, h, d).translate(x, y, zz);
  // supply drum on a spill tray; the dip tube enters through the bung
  const top = YP + c.yDip * k + 0.012, dx = c.X0 * k, R = 0.2;
  const prof = [[0, 0.05], [R - 0.02, 0.05], [R, 0.07]];
  for (const y of [0.3, 0.56]) prof.push([R, y - 0.02], [R + 0.008, y - 0.008], [R + 0.008, y + 0.008], [R, y + 0.02]);
  prof.push([R, top - 0.07], [R - 0.02, top - 0.05], [R - 0.02, top - 0.03], [0.035, top - 0.03], [0.035, top], [0, top]);
  const drum = new THREE.Mesh(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 48), drumMat);
  drum.position.set(dx, 0, z); ctx.add(drum);
  const stands = [box(0.56, 0.05, 0.56, dx, 0.025, z)];
  // drain point for the conductive branch, bulkhead ring on the tool front
  stands.push(box(0.12, 0.13, 0.12, c.XT * k, 0.065, z));
  ctx.add(new THREE.Mesh(mergeGeometries(stands), dark));
  const ring = new THREE.TorusGeometry(c.RO * k + 0.006, 0.005, 8, 24).translate(c.X1 * k, yAx, c.ZTOOL * k + 0.001);
  ctx.add(new THREE.Mesh(ring, M.rubber));
  // pedestals under the two valves, saddle posts under the tube
  const post = [];
  for (const x of [c.XV, c.XP]) { const h = yAx - c.base * k; post.push(box(0.04, h - 0.006, 0.04, x * k, (h - 0.006) / 2, z), box(0.1, 0.006, 0.1, x * k, h - 0.003, z), box(0.12, 0.008, 0.12, x * k, 0.004, z)); }
  for (const x of [c.XU - 70, c.XP + 95]) { const h = yAx - c.RO * k; post.push(box(0.025, h - 0.0005, 0.025, x * k, (h - 0.0005) / 2, z), box(0.09, 0.008, 0.09, x * k, 0.004, z)); }
  ctx.add(new THREE.Mesh(mergeGeometries(post), paint));
  info.bounds.max.z = 0.72;
}

buildLine();
buildContext();
buildChem();
buildChemContext();

/* ------------------------------------------------------------------ lights, shadows */
{
  const c = info.bounds.getCenter(new THREE.Vector3());
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(c.x - 2.2, 6.5, 5.5); key.target.position.set(c.x, 0.9, 0);
  key.castShadow = true; key.shadow.mapSize.set(4096, 4096);
  Object.assign(key.shadow.camera, { left: -3.2, right: 3.2, top: 2.6, bottom: -2.6, near: 1, far: 16 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.006;
  const fill = new THREE.DirectionalLight(0xdfe9ff, 0.5); fill.position.set(c.x + 4, 3, 3);
  scene.add(key, key.target, fill);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.floor && !o.material.transparent) o.castShadow = true;
    o.receiveShadow = true;
  });
  renderer.shadowMap.needsUpdate = true;
}

/* ------------------------------------------------------------------ flow cue: dots travelling cylinder -> tool (orange high side, blue low side) and drum -> tool (green) */
// Dots are depth-tested (so the frame, drum and posts in front hide them) and lifted towards the camera by a little
// more than a nut radius, so they ride on the tube instead of being buried in it; inside valve bodies they disappear.
const FLOW_LIFT = 0.032;
function makeFlow(pts, n, colorAt) {
  const len = [0]; let acc = 0;
  for (let i = 1; i < pts.length; i++) { acc += pts[i].distanceTo(pts[i - 1]); len.push(acc); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ size: 8, sizeAttenuation: false, map: dotTex, vertexColors: true, transparent: true, depthTest: true, depthWrite: false, toneMapped: false, fog: false });
  const obj = new THREE.Points(geo, mat); obj.frustumCulled = false; obj.renderOrder = 10; scene.add(obj);
  const v = new THREE.Vector3(), c = new THREE.Color(), toCam = new THREE.Vector3();
  return { obj, total: acc, len, update(phase) {
    const pos = geo.attributes.position, col = geo.attributes.color;
    for (let i = 0; i < n; i++) {
      const s = ((i / n + phase) % 1) * acc;
      let lo = 0, hi = len.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (len[m] <= s) lo = m; else hi = m; }
      v.lerpVectors(pts[lo], pts[hi], (s - len[lo]) / Math.max(1e-9, len[hi] - len[lo]));
      toCam.subVectors(camera.position, v).normalize(); v.addScaledVector(toCam, FLOW_LIFT);
      pos.setXYZ(i, v.x, v.y, v.z); colorAt(s, c); col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  } };
}
const dotTex = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const g = cv.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.45, "rgba(255,255,255,1)"); gr.addColorStop(0.62, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();
const cHi = new THREE.Color(HI), cLo = new THREE.Color(LO), cChem = new THREE.Color(0x1f9d78);
const gasFlow = makeFlow(flowPts, 44, (s, c) => c.copy(cHi).lerp(cLo, THREE.MathUtils.smoothstep(s, regS - 0.03, regS + 0.03)));
{
  const regX = info.regX * k, i = flowPts.findIndex((p) => p.x >= regX && Math.abs(p.y - YP) < 1e-4 && Math.abs(p.z) < 1e-4);
  regS = gasFlow.len[i] ?? gasFlow.total / 2;
}
const chemFlow = makeFlow(chemPts, 26, (s, c) => c.copy(cChem));

/* ------------------------------------------------------------------ film: one 20 s loop, a pure function of time */
// 0.0-1.5 title on the wide shot | 1.5-3.6 push in | 2.2-14.4 glide cylinder -> tool, slow over the panel, faster along the
// distribution run | 13.8-16.1 pull back | 15.7 callouts in, 16.0 closing message | 19.4 closing out, 19.7 title in | 20.0 = 0.0
const LOOP = 20;
const TL = { titleOut: 1.45, toNear: [1.5, 3.6], toWide: [13.8, 16.1], slotIn: 15.7, closeIn: 16.0, fadeOut: 19.4,
  // product families are revealed in groups as the camera reaches them: connection | valves | regulation, gauging, filtration |
  // bellows valve and face-seal fittings | tube and weld fittings; the three chemical-line labels fall between the gas groups
  gas: [2.7, 4.4, 6.6, 9.4, 11.2], within: 0.3, chem: [5.5, 8.2, 10.3] };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * t * (t * (t * 6 - 15) + 10); };
const mix = (a, b, t) => a + (b - a) * t;
// camera travel along the line (world x of the look-at point) as monotone cubic through these keys: [time, x]
const X_END = info.xT * k + 0.08;
const KEYS = [[2.2, -0.3], [3.6, -0.22], [5.0, 0.05], [6.2, 0.3], [7.6, 0.6], [8.8, 0.8], [10.0, 1.02], [11.2, 1.35], [12.4, 1.75], [13.4, 2.15], [14.4, X_END]];
const camX = (() => {
  const n = KEYS.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((KEYS[i + 1][1] - KEYS[i][1]) / (KEYS[i + 1][0] - KEYS[i][0]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);   // harmonic mean: no overshoot; ends at rest
  return (t) => {
    if (t <= KEYS[0][0]) return KEYS[0][1]; if (t >= KEYS[n - 1][0]) return KEYS[n - 1][1];
    let i = 0; while (t > KEYS[i + 1][0]) i++;
    const h = KEYS[i + 1][0] - KEYS[i][0], u = (t - KEYS[i][0]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * KEYS[i][1] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * KEYS[i + 1][1] + (u3 - u2) * h * m[i + 1];
  };
})();
const NDIR = new THREE.Vector3(0.2, 0.17, 1).normalize(), NDIR_P = new THREE.Vector3(0.18, 0.42, 1).normalize();
const WDIR = new THREE.Vector3(0.1, 0.105, 1).normalize();     // closing shot in a wide rectangle: low and frontal, two clear horizontal runs
const WDIR_T = new THREE.Vector3(0.3, 0.4, 1).normalize();     // closing shot in a squarer rectangle: higher three-quarter view, the rig fills more of it
const wideBox = new THREE.Box3(new THREE.Vector3(-0.64, 0, -0.1), new THREE.Vector3(info.xT * k + 0.62, 2.1, 0.62));
const boxPts = [...Array(8)].map((_, i) => new THREE.Vector3(i & 1 ? wideBox.max.x : wideBox.min.x, i & 2 ? wideBox.max.y : wideBox.min.y, i & 4 ? wideBox.max.z : wideBox.min.z));
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), widePos = new THREE.Vector3(), wideTgt = wideBox.getCenter(new THREE.Vector3()), nearPos = new THREE.Vector3(), nearTgt = new THREE.Vector3(), wDir = new THREE.Vector3(), nDir = new THREE.Vector3();
const probe = new THREE.PerspectiveCamera();
let wideDist = 10, wideOff = [0, 0], nearK = 1;   // nearK: 0 tall container .. 1 wide container
const PUSH = 0.03;   // slow push-in on the wide shot, carried across the loop seam
// Fit the wide shot to the free rectangle: distance from the projected bounds, then a view offset that moves the picture's
// bounding box onto the rectangle's centre. Fitted at the closest point of the push-in, so the rig never outgrows its area.
function fitWide() {
  const r = lay.rig, F = lay.H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  wDir.copy(WDIR).lerp(WDIR_T, clamp01((1.95 - r.w / r.h) / 0.8)).normalize();
  let d = 9, bx = 0, by = 0;
  for (let i = 0; i < 7; i++) {
    probe.position.copy(wideTgt).addScaledVector(wDir, d); probe.lookAt(wideTgt); probe.updateMatrixWorld();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of boxPts) { tmpA.copy(p).applyMatrix4(probe.matrixWorldInverse); const X = (tmpA.x / -tmpA.z) * F, Y = (-tmpA.y / -tmpA.z) * F; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
    bx = (x0 + x1) / 2; by = (y0 + y1) / 2;
    d *= Math.max((x1 - x0) / r.w, (y1 - y0) / r.h);
  }
  wideDist = d / (1 - PUSH);
  wideOff = [r.x + r.w / 2 - (lay.W / 2 + bx), r.y + r.h / 2 - (lay.H / 2 + by)];
  nearK = sm(0.75, 1.5, camera.aspect);
  nDir.copy(NDIR_P).lerp(NDIR, nearK).normalize();
}
// half of the width the close shot shows at the line, in metres
function nearHalfWidth() { return Math.max(1.36 / 2 * camera.aspect, mix(0.85, 1.2, nearK) / 2); }
function setCamera(t) {
  const b = sm(TL.toNear[0], TL.toNear[1], t) * (1 - sm(TL.toWide[0], TL.toWide[1], t));   // 0 wide, 1 near
  const tau = t >= TL.toWide[1] ? t - TL.toWide[1] : t + LOOP - TL.toWide[1], span = LOOP - TL.toWide[1] + TL.toNear[0];
  const push = t > TL.toNear[0] && t < TL.toWide[1] ? 1 - (t - TL.toNear[0]) / (TL.toWide[1] - TL.toNear[0]) : Math.min(1, tau / span);
  widePos.copy(wideTgt).addScaledVector(wDir, wideDist * (1 - PUSH * push));
  // near pose: glide along the line. A tall container looks down more steeply and crops tighter, so the two runs spread
  // over the height instead of drum and floor; everything in between is interpolated from the aspect ratio.
  const x = camX(t), rise = sm(1.25, 1.95, x);
  nearTgt.set(x, mix(1.26, 1.31, nearK) + mix(0.3, 0.22, nearK) * rise, mix(0.25, 0.18, nearK));
  const vf = THREE.MathUtils.degToRad(camera.fov / 2), hf = Math.atan(Math.tan(vf) * camera.aspect);
  const d = Math.max((1.36 + 0.12 * rise) / 2 / Math.tan(vf), mix(0.85, 1.2, nearK) / 2 / Math.tan(hf));
  nearPos.copy(nearTgt).addScaledVector(nDir, d);
  camera.position.lerpVectors(widePos, nearPos, b);
  tmpB.lerpVectors(wideTgt, nearTgt, b); camera.lookAt(tmpB);
  const ny = (0.5 - mix(0.55, 0.54, nearK)) * lay.H;
  camera.setViewOffset(lay.W, lay.H, -wideOff[0] * (1 - b), mix(-wideOff[1], ny, b), lay.W, lay.H);
  camera.updateMatrixWorld();
  return b;
}

/* ------------------------------------------------------------------ labels: anchors, reveal times */
const PANEL = new Set(["hp_valve", "transducer", "regulator", "gauge", "filter", "bellows", "vcr"]);
for (const l of labels) {
  l.na = l.at.map((id) => view[id].anchor);                                           // beside the part, close shot
  l.ua = l.at.map((id) => (PANEL.has(id) ? new THREE.Vector3(view[id].anchor.x, YP - 0.03, 0.03) : view[id].anchor));   // under the part, for a card below the line
  l.wa = l.wideAt ? [view[l.wideAt].anchor] : l.na;                                    // wide shot callout
  if (l.id === "c_valve") l.ua = [view.c_valve_w.anchor];
  if (l.id === "c_fit") l.ua = [view.c_fit.anchor.clone().add(new THREE.Vector3(0, -0.07, 0))];
  l.via = l.id === "ball_check" ? view.purge_check.via : null;
}
// When each label comes on. Wide containers see most of the line at once, so labels arrive in their groups. Narrow ones
// only see a stretch of it, so a label also waits until the camera has brought its part into the frame, later labels keep a
// minimum spacing, and the oldest card of a line leaves when the next-but-one arrives.
function schedule() {
  const lead = nearHalfWidth() * 0.5, narrow = lay.stack;
  const reach = (x) => { if (camX(KEYS[0][0]) >= x) return 0; let lo = KEYS[0][0], hi = KEYS[KEYS.length - 1][0]; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (camX(m) >= x) hi = m; else lo = m; } return hi; };
  const inGroup = {};
  for (const l of labels) {
    const base = l.row === "gas" ? TL.gas[l.g] + (inGroup[l.g] = (inGroup[l.g] ?? -1) + 1) * TL.within : TL.chem[l.ci];
    l.on = Math.max(base, reach(l.na[0].x - lead));
  }
  for (const row of ["gas", "chem"]) {
    const list = labels.filter((l) => l.row === row).sort((a, b) => a.on - b.on), cap = narrow ? 2 : Infinity;
    list.forEach((l, i) => { if (narrow && i) l.on = Math.max(l.on, list[i - 1].on + 0.8); });
    list.forEach((l, i) => { l.off = i + cap < list.length ? list[i + cap].on : Infinity; });
  }
}

/* ------------------------------------------------------------------ wide shot callouts (side layout) */
const proj = new THREE.Vector3();
const P2 = (v) => { proj.copy(v).project(camera); return [(proj.x + 1) / 2 * lay.W, (1 - proj.y) / 2 * lay.H]; };
// Which row each gas callout sits in, and which two-anchor callouts fork. This depends only on the left-to-right order of
// the anchors. A label whose two anchors have another label's anchor between them goes in the upper row and brackets that
// label's card with one leader on each side of it; that card goes in the lower row. A two-anchor label with nothing in
// between forks instead: one leader, and a short branch to the second part.
let WS = null;
const WS_INSET = () => clamp(lay.side.cardH * 0.24, 9, 14), WS_CLEAR = () => clamp(lay.side.cardH * 0.15, 6, 11);
function wideStructure() {
  setCamera(0);
  const mk = (l) => ({ l, a: l.wa.map((v) => ({ v, x: P2(v)[0] })).sort((p, q) => p.x - q.x), inside: [], host: null, row: 0, fork: false });
  const G = gasLabels.map((l) => mk(labels[LABELS.indexOf(l)])).sort((p, q) => p.a.at(-1).x - q.a.at(-1).x);
  for (const d of G) if (d.a.length > 1) { d.inside = G.filter((o) => o !== d && o.a.every((p) => p.x > d.a[0].x && p.x < d.a.at(-1).x)); d.fork = !d.inside.length; for (const o of d.inside) o.host = d; }
  const C = chemLabels.map((l) => mk(labels[LABELS.indexOf(l)])).sort((p, q) => p.a[0].x - q.a[0].x);
  // a bracketing card has to be wide enough to hold the card it brackets between its two leaders
  for (const d of G) d.l.minW = d.inside.length ? d.inside.reduce((s, o) => s + o.l.w0 + 10, -10) + 2 * WS_CLEAR() + 2 * WS_INSET() + 4 : 0;
  for (const l of labels) { l.w = Math.max(l.w0, l.minW); l.tag.style.width = l.w + "px"; }
  // the other cards are free to take either row: try every split and keep the one that fits with the cards closest to their parts
  const freeSet = G.filter((d) => !d.inside.length && !d.host);
  let best = null;
  for (let mask = 0; mask < 1 << freeSet.length; mask++) {
    for (const d of G) d.row = d.inside.length ? 0 : d.host ? 1 : (mask >> freeSet.indexOf(d)) & 1;
    WS = { G, C };
    const r = wideSlots();
    const score = (r.ok ? 0 : 1e6 + r.short * 100) + r.cost;
    if (!best || score < best.score) best = { score, ok: r.ok, rows: G.map((d) => d.row) };
  }
  G.forEach((d, i) => { d.row = best.rows[i]; });
  WS = { G, C, ok: best.ok };
}
// Orthogonal leaders anchor -> track -> port without crossings: ports and anchors are in the same left-to-right order,
// so right-going leaders nest with the rightmost on the track nearest the anchors, left-going ones mirrored.
function assignTracks(list) {
  const R = list.filter((d) => d.port - d.ax > 1.5).sort((a, b) => b.ax - a.ax), Lf = list.filter((d) => d.ax - d.port > 1.5).sort((a, b) => a.ax - b.ax);
  let max = 0;
  for (const set of [R, Lf]) set.forEach((d, i) => {
    const lo = Math.min(d.ax, d.port) - 8, hi = Math.max(d.ax, d.port) + 8; let lv = 1;
    for (let j = 0; j < i; j++) { const o = set[j]; if (Math.min(o.ax, o.port) < hi && Math.max(o.ax, o.port) > lo) lv = Math.max(lv, o.level + 1); }
    d.level = lv; max = Math.max(max, lv);
  });
  return max;
}
// Callout layout for the wide shot, solved from the projected anchors: card positions and leader ports are the unknowns of
// a set of "b is at least c to the right of a" constraints, started at the anchor positions and relaxed right, then left.
// Returns per label { x, y, order, draws: [{ d, px, py }] }, plus .legend and .ok (false if the cards cannot fit).
function wideSlots() {
  const S = lay.side, out = new Map(), V = [], C = [], inset = WS_INSET(), clear = WS_CLEAR(), gap = 10;
  const nv = (x, fixed = false) => V.push({ x, fixed }) - 1, wallL = nv(0, true), wallR = nv(S.xR, true);
  const band = (list, rowLeft, legendW) => {
    const leaders = [];
    for (const d of list) {
      const pts = d.a.map((a) => P2(a.v));
      d.pi = d.fork ? (pts[0][1] <= pts[1][1] ? 0 : 1) : -1;   // a fork runs its leader from the upper anchor
      const src = d.fork ? [pts[d.pi]] : pts;
      d.pts = pts; d.L = nv(src.reduce((s, p) => s + p[0], 0) / src.length - d.l.w / 2);
      d.ports = src.map(([ax, ay]) => { const p = { d, ax, ay, v: nv(ax), level: 0, port: ax }; C.push([d.L, p.v, inset], [p.v, d.L, inset - d.l.w], [wallL, p.v, S.xL + 6]); leaders.push(p); return p; });
      C.push([d.L, wallR, d.l.w]);
    }
    for (const r of [0, 1]) { const row = list.filter((d) => d.row === r); row.forEach((d, i) => C.push(i ? [row[i - 1].L, d.L, row[i - 1].l.w + gap] : [wallL, d.L, rowLeft[r] + (r ? 0 : legendW)])); }
    leaders.sort((p, q) => p.ax - q.ax);
    // a lower card stays between the upper leaders on either side of its own
    for (const d of list) if (d.row === 1) {
      let a = leaders.indexOf(d.ports[0]) - 1, b = leaders.indexOf(d.ports.at(-1)) + 1;
      while (a >= 0 && leaders[a].d.row !== 0) a--;
      while (b < leaders.length && leaders[b].d.row !== 0) b++;
      if (a >= 0) C.push([leaders[a].v, d.L, clear]);
      if (b < leaders.length) C.push([d.L, leaders[b].v, d.l.w + clear]);
    }
    return leaders;
  };
  const gl = band(WS.G, [S.upLeft, S.lowLeft], lay.legendW.gas), cl = band(WS.C, [S.chemLeft, 0], lay.legendW.chem);
  for (let it = 0, ch = true; ch && it < 200; it++) { ch = false; for (const [a, b, c] of C) if (!V[b].fixed && V[b].x < V[a].x + c - 1e-3) { V[b].x = V[a].x + c; ch = true; } }
  for (let it = 0, ch = true; ch && it < 200; it++) { ch = false; for (const [a, b, c] of C) if (!V[a].fixed && V[a].x > V[b].x - c + 1e-3) { V[a].x = V[b].x - c; ch = true; } }
  out.short = 0; for (const [a, b, c] of C) out.short = Math.max(out.short, V[a].x + c - V[b].x);   // how far the worst constraint is from holding
  out.ok = out.short < 0.75;
  out.cost = 0; for (const d of [...WS.G, ...WS.C]) for (const p of d.ports) out.cost += Math.abs(V[d.L].x + d.l.w / 2 - p.ax) + 0.5 * Math.abs(V[p.v].x - p.ax);
  for (const p of [...gl, ...cl]) p.port = V[p.v].x;
  const f = (n) => n.toFixed(1), order = new Map();
  // gas: cards above the rig, tracks between the lower row and the highest anchor
  const nG = assignTracks(gl), minAy = Math.min(...gl.map((p) => p.ay - (p.d.fork ? 22 : 0)));
  const stepG = clamp((minAy - 10 - S.trackTop) / Math.max(1, nG), 3, 12);
  for (const p of gl) {
    const yb = (p.d.row ? S.yLow : S.yUp) + S.cardH / 2, yt = S.trackTop + (nG - p.level + 0.5) * stepG;
    p.path = p.level ? `M${f(p.ax)} ${f(p.ay)}V${f(yt)}H${f(p.port)}V${f(yb)}` : `M${f(p.ax)} ${f(p.ay)}V${f(yb)}`;
  }
  // chemical: one row below the rig, leaders drop through clear floor
  const nC = assignTracks(cl), zBot = S.yC - S.cardH / 2 - 8;
  for (const p of cl) {
    const yt = S.yC - S.cardH / 2, yk = zBot - (nC - p.level + 0.5) * 7;
    p.path = p.level ? `M${f(p.ax)} ${f(p.ay)}V${f(yk)}H${f(p.port)}V${f(yt)}` : `M${f(p.ax)} ${f(p.ay)}V${f(yt)}`;
  }
  [...gl, ...cl].forEach((p, i) => { if (!order.has(p.d)) order.set(p.d, i); });
  for (const d of [...WS.G, ...WS.C]) {
    const draws = d.ports.map((p) => ({ d: p.path, px: p.ax, py: p.ay }));
    if (d.fork) {
      // second anchor of a fork: out sideways past the part, up, and into the main leader just above the first anchor
      const [sx, sy] = d.pts[1 - d.pi], [px, py] = d.pts[d.pi], vx = d.l.via ? P2(d.l.via)[0] : sx, yj = Math.min(py, sy) - 12;
      draws.push({ d: `M${f(sx)} ${f(sy)}H${f(vx)}V${f(yj)}H${f(px)}`, px: sx, py: sy });
    }
    const isChem = d.l.row === "chem";
    out.set(d.l, { x: V[d.L].x + d.l.w / 2, y: isChem ? S.yC : d.row ? S.yLow : S.yUp, order: order.get(d), draws });
  }
  const up0 = WS.G.find((d) => d.row === 0), c0 = WS.C[0];
  out.legend = { gas: [V[up0.L].x - 14, S.yUp], chem: [V[c0.L].x - 14, S.yC] };
  return out;
}

/* ------------------------------------------------------------------ per-frame label placement */
// Stack layout, close shot: where a card sits relative to its part. At most two cards of a line are up at a time and
// consecutive ones use different sides, so they cannot collide and no leader has to pass another card.
function zonePos(l, lead) {
  const down = l.pz === "down" || l.pz === "down2", a = P2(down ? l.ua[0] : l.na[0]);
  if (down) return [a[0], a[1] + l.h / 2 + lead + (l.pz === "down2" ? l.h + 8 : 0)];   // down2: one card height lower, clear of a neighbour that is also below the line
  if (l.pz === "left" || l.pz === "right") { const b = l.na[1] ? P2(l.na[1]) : a; return [a[0] + (l.pz === "left" ? -1 : 1) * (l.w / 2 + lead * 1.2), (a[1] + b[1]) / 2]; }
  if (l.pz === "upR") return [a[0] + l.w / 2 - 18, a[1] - l.h / 2 - lead];
  return [a[0], a[1] - l.h / 2 - lead];
}
function layoutLabels(t, b) {
  const Wp = lay.W, Hp = lay.H, stack = lay.stack, u = lay.u, wide = 1 - b;
  const fade = 1 - clamp01((t - TL.fadeOut) / 0.3);   // closing and labels leave first, then the title comes in
  const inWide = t >= TL.slotIn - 0.05, slots = inWide && !stack && !lay.bare ? wideSlots() : null;
  const nearOut = 1 - sm(0.006, 0.07, wide);   // cards beside the parts only exist while the camera is close
  const yMin = (l) => lay.top + l.h / 2, yMax = (l) => Hp - lay.pb - l.h / 2 - 4, xMin = (l) => lay.pl * 0.5 + l.w / 2, xMax = (l) => Wp - lay.pr * 0.5 - l.w / 2;
  for (const l of labels) {
    let x = 0, y = 0, alpha = 0, chip = 0, draws = [];
    if (inWide) {
      if (stack) chip = clamp01((t - TL.closeIn - labels.indexOf(l) * 0.05) / 0.3);
      else if (slots) { const s = slots.get(l); x = s.x; y = s.y; draws = s.draws; alpha = clamp01((t - TL.slotIn - s.order * 0.05) / 0.3) * fade; }
    } else {
      const down = stack ? l.pz === "down" || l.pz === "down2" : !!l.under, pts = (down ? l.ua : l.na).map(P2), [ax, ay] = pts[0];
      if (stack) [x, y] = zonePos(l, clamp(Wp * 0.07, 24, 44));
      else { const off = l.near ?? (l.row === "gas" ? [0, [-100, -180, -260][l.gi % 3]] : [0, -105]); x = ax + off[0] * u; y = ay + off[1] * u; }
      // a card that the frame edge has to push more than a little off its place is on its way out: it fades instead of piling up at the edge
      const cx = clamp(x, xMin(l), Math.max(xMin(l), xMax(l))), edge = 1 - sm(0.04, 0.3, Math.abs(cx - x) / l.w);
      x = cx; y = clamp(y, yMin(l), yMax(l));
      const inFrame = sm(0, 0.09 * Wp, Math.min(ax, Wp - ax)) * sm(-0.02 * Hp, 0.04 * Hp, Math.min(ay, Hp - ay)) * edge;
      alpha = clamp01((t - l.on) / 0.3) * (1 - clamp01((t - l.off + 0.2) / 0.3)) * inFrame * nearOut;
      draws = pts.map(([px, py]) => ({ px, py, d: null }));
    }
    Object.assign(l, { x, y, alpha, draws });
    l.chip.style.opacity = chip.toFixed(3);
  }
  if (!inWide && !stack) {
    // cards beside the parts: push later ones away from earlier ones if a longer language makes them collide
    const vis = labels.filter((l) => l.alpha > 0.01).sort((a, b) => a.on - b.on);
    const hits = (c, x, y, n) => { for (let i = 0; i < n; i++) { const a = vis[i]; if (Math.abs(a.x - x) < (a.w + c.w) / 2 + 6 && Math.abs(a.y - y) < a.h + 6) return a; } return null; };
    for (let j = 1; j < vis.length; j++) {
      const c = vis[j];
      for (let tries = 0; tries < 3; tries++) {
        const a = hits(c, c.x, c.y, j); if (!a) break;
        // try the four smallest moves that clear this neighbour; take the first that is on screen and clear of all earlier cards
        const dx = (a.w + c.w) / 2 + 8, dy = a.h + 8;
        const cand = [[c.x, a.y - dy], [c.x, a.y + dy], [a.x + dx, c.y], [a.x - dx, c.y]].sort((m, n) => Math.hypot(m[0] - c.x, m[1] - c.y) - Math.hypot(n[0] - c.x, n[1] - c.y));
        const ok = cand.find(([x, y]) => y >= yMin(c) && y <= yMax(c) && x >= xMin(c) && x <= xMax(c) && !hits(c, x, y, j));
        if (!ok) break;
        c.x = ok[0]; c.y = ok[1];
      }
    }
  }
  for (const l of labels) {
    const { x, y, alpha } = l;
    l.tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    l.tag.style.opacity = alpha.toFixed(3);
    l.lines.forEach((L1, i) => {
      const w = l.draws[i]; let d = w?.d ?? "", show = w ? alpha : 0;
      if (w && w.d === null) {
        // straight leader clipped at the edge of the card
        const dx = w.px - x, dy = w.py - y, hw = l.w / 2 + 2, hh = l.h / 2 + 2;
        const f = Math.min(1, Math.abs(dx) * hh > Math.abs(dy) * hw ? hw / Math.max(1e-6, Math.abs(dx)) : hh / Math.max(1e-6, Math.abs(dy)));
        const on = sm(-0.02 * Wp, 0.04 * Wp, Math.min(w.px, Wp - w.px)) * sm(-0.02 * Hp, 0.04 * Hp, Math.min(w.py, Hp - w.py));   // a second anchor that is still outside the frame gets no line yet
        if (f >= 1) show = 0; else { d = `M${(x + dx * f).toFixed(1)} ${(y + dy * f).toFixed(1)}L${w.px.toFixed(1)} ${w.py.toFixed(1)}`; show *= on; }
      }
      L1.ln.setAttribute("d", d || "M0 0");
      L1.ln.style.display = d ? "" : "none";
      if (w) { L1.dot.setAttribute("cx", w.px.toFixed(1)); L1.dot.setAttribute("cy", w.py.toFixed(1)); }
      L1.g.style.opacity = show.toFixed(3);
    });
  }
  for (const g of legends) {
    const pos = slots?.legend?.[g.row];
    g.e.style.opacity = pos ? (clamp01((t - TL.slotIn) / 0.3) * fade).toFixed(3) : 0;
    if (pos) g.e.style.transform = `translate(${(pos[0] - g.w).toFixed(1)}px, ${(pos[1] - g.h / 2).toFixed(1)}px)`;
  }
  $(".lf-title").style.opacity = t >= TL.fadeOut ? sm(TL.fadeOut + 0.3, LOOP, t) : 1 - sm(TL.titleOut - 0.4, TL.titleOut + 0.3, t);
  $(".lf-closing").style.opacity = sm(TL.closeIn, TL.closeIn + 0.6, t) * fade;
  $(".lf-bar").style.transform = `scaleX(${(t / LOOP).toFixed(4)})`;
}

/* ------------------------------------------------------------------ playback */
const film = { t: 0, playing: true, idle: 0, last: 0, seeking: false, raf: 0, onScreen: false, dead: false, ready: false };
const STILLS = [0.9, 5.2, 8.7, 12.6, 17.8];   // reduced motion: five stills cross-fading over the same 20 s
const stillTime = (t) => STILLS[Math.min(STILLS.length - 1, Math.floor((t / LOOP) * STILLS.length))];
const shade = $(".lf-xfade"), shadeCtx = shade.getContext("2d");
let shownStill = -1;
function draw(t) {
  if (!lay.W) return;
  const b = setCamera(t);
  gasFlow.update(t / LOOP * 2); chemFlow.update(t / LOOP * 3);   // whole turns per loop: no jump at the seam
  renderer.render(scene, camera);
  layoutLabels(t, b);
  if (!film.ready) { film.ready = true; requestAnimationFrame(() => root.classList.add("lf-ready")); }   // the canvas fades in over the title frame
}
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - film.last) / 1000)); film.last = now;
  if (film.playing) film.t = (film.t + dt) % LOOP;
  else if (!film.seeking && (film.idle += dt) > 10) setPlaying(true);
  if (reduced && !film.seeking) {
    const st = stillTime(film.t);
    if (st !== shownStill) {
      if (shownStill >= 0) { draw(shownStill); shade.width = canvas.width; shade.height = canvas.height; shadeCtx.drawImage(canvas, 0, 0); shade.style.transition = "none"; shade.style.opacity = 1; void shade.offsetWidth; shade.style.transition = "opacity 1.2s linear"; shade.style.opacity = 0; }
      shownStill = st; draw(st);
    }
    $(".lf-bar").style.transform = `scaleX(${(film.t / LOOP).toFixed(4)})`;
  } else draw(film.t);
  film.raf = requestAnimationFrame(frame);
}
// The render loop only exists while the film is on screen and the tab is visible.
function syncLoop() {
  const want = film.onScreen && !document.hidden && !film.dead;
  if (want && !film.raf) { film.last = performance.now(); film.raf = requestAnimationFrame(frame); }
  else if (!want && film.raf) { cancelAnimationFrame(film.raf); film.raf = 0; }
}
function setPlaying(v) {
  film.playing = v; film.idle = 0; film.seeking = false;
  pauseBtn.querySelector("span").textContent = UI.play; pauseBtn.setAttribute("aria-label", v ? UI.pause : UI.play); pauseBtn.title = v ? UI.pause : UI.play; pauseBtn.setAttribute("aria-pressed", String(!v));
  root.classList.toggle("lf-paused", !v);
}
setPlaying(true);
pauseBtn.addEventListener("click", (e) => { e.stopPropagation(); setPlaying(!film.playing); });
canvas.addEventListener("click", () => setPlaying(!film.playing));
root.addEventListener("keydown", (e) => { if (e.target === root && (e.key === " " || e.code === "Space")) { e.preventDefault(); setPlaying(!film.playing); } });
let hideTimer = 0;
root.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; root.classList.add("lf-show-ui"); clearTimeout(hideTimer); hideTimer = setTimeout(() => root.classList.remove("lf-show-ui"), 2500); });

const MAX_PIXELS = 2560 * 1440;   // never render more than this many pixels, whatever the canvas size and device pixel ratio
function resize() {
  const w = root.clientWidth, h = root.clientHeight;
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / (w * h))));
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.clearViewOffset(); camera.updateProjectionMatrix();
  const px = renderer.getPixelRatio() * clamp(Math.min(w, h) / 135, w < 500 ? 2.4 : 3, 9);
  gasFlow.obj.material.size = px; chemFlow.obj.material.size = px;
  for (const l of labels) l.minW = 0;
  // side layout: drop the cards' secondary line, then a size, until both rows fit beside the message column
  for (let den = 0; den < 5; den++) {
    layoutDom(den); fitWide();
    if (lay.stack) break;
    wideStructure();
    if (WS.ok && (lay.rig.h >= h * 0.34 || den >= 1)) break;
    for (const l of labels) l.minW = 0;
  }
  // a container too short for two rows of callouts above the rig and one below (a phone held sideways): the closing
  // shot keeps the message and the brands and gives the whole free area to the rig; the names were shown during the glide
  lay.bare = !lay.stack && (!WS.ok || lay.rig.h < h * 0.3);
  if (lay.bare) { lay.rig = lay.side.full; fitWide(); }
  schedule(); shownStill = -1;
  if (!film.raf) draw(reduced ? stillTime(film.t) : film.t);   // keep the still picture correct while the loop is parked
}
const ro = new ResizeObserver(resize); ro.observe(root);
const io = new IntersectionObserver((es) => { film.onScreen = es[es.length - 1].isIntersecting; syncLoop(); }, { threshold: 0.05 });
io.observe(root);
const onVis = () => syncLoop();
document.addEventListener("visibilitychange", onVis);
resize();
(document.fonts?.ready ?? Promise.resolve()).then(() => { if (!film.dead) resize(); });
draw(reduced ? stillTime(0) : 0);   // first picture is there before the element scrolls into view

return {
  pause() { setPlaying(false); film.idle = -Infinity; },
  play() { setPlaying(true); },
  seek(seconds) { film.playing = false; film.seeking = true; film.t = ((seconds % LOOP) + LOOP) % LOOP; shownStill = -1; if (!film.raf) draw(film.t); },
  destroy() {
    film.dead = true; syncLoop(); clearTimeout(hideTimer);
    ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onVis);
    scene.traverse((o) => { o.geometry?.dispose(); for (const m of [].concat(o.material ?? [])) { m.map?.dispose(); m.dispose(); } });
    scene.environment?.dispose(); renderer.dispose(); root.remove();
  },
  // for the capture script: where things are right now
  _state() {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of boxPts) { const [x, y] = P2(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const b = sm(TL.toNear[0], TL.toNear[1], film.t) * (1 - sm(TL.toWide[0], TL.toWide[1], film.t));
    return { t: film.t, wide: 1 - b, stack: lay.stack, rig: [x0, y0, x1, y1].map(Math.round), free: lay.rig, pixelRatio: renderer.getPixelRatio(), on: Object.fromEntries(labels.map((l) => [l.id, +l.on.toFixed(2)])), density: root.classList.contains("lf-d1") ? 1 : 0 };
  },
};
}
