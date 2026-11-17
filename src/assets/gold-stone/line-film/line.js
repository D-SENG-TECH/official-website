// A self-running 20 s film of one installation: an ultra-high-purity gas line (cylinder to tool) and a chemical
// supply line beside it. Every labelled part is a product family the distributor supplies. No interaction needed.
// Scene units: metres, Y up. Line components are authored in real millimetres inside `L`, which is scaled by SCALE / 1000.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LABELS, LOCALES } from "./line-data.js";

// All styles live under the .lf root class; sizes use container query units, so the film scales with its host element.
const CSS = `
.lf{position:relative;width:100%;height:100%;overflow:hidden;background:#fff;color:#1b2538;container-type:size;line-height:1.3;
  font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","PingFang SC","Hiragino Sans","Noto Sans TC","Noto Sans SC","Noto Sans JP","Microsoft JhengHei","Microsoft YaHei",sans-serif;
  --lf-navy:#0f2c4a;--lf-muted:#566472;--lf-line:#d6dde5;--lf-orange:#f0954a;--lf-orange-ink:#a9540c;--lf-green:#1f9d78;--u:1cqh;-webkit-tap-highlight-color:transparent}
.lf *{box-sizing:border-box}
.lf.lf-portrait{--u:min(.58cqw,.268cqh);--pw:min(1cqw,.462cqh)}
.lf-gl,.lf-xfade,.lf-leaders,.lf-tags,.lf-title,.lf-closing{position:absolute;inset:0;width:100%;height:100%}
.lf-gl{display:block;cursor:pointer}
.lf-xfade,.lf-leaders,.lf-tags,.lf-title,.lf-closing{pointer-events:none}
.lf-xfade{opacity:0}
.lf-leaders g{opacity:0}
.lf-leaders path{fill:none;stroke:#5b6b7d;stroke-width:1.5;stroke-linejoin:round}
.lf-leaders circle{fill:var(--lf-navy);stroke:#fff;stroke-width:1.5}
.lf-tag{position:absolute;left:0;top:0;display:flex;flex-direction:column;justify-content:center;max-width:calc(31*var(--u));padding:calc(.7*var(--u)) calc(1.4*var(--u)) calc(.75*var(--u));border-radius:calc(.8*var(--u));background:rgba(255,255,255,.95);border:1px solid var(--lf-line);border-left:calc(.5*var(--u)) solid var(--lf-orange);box-shadow:0 2px 10px rgba(15,44,74,.12);opacity:0;will-change:transform,opacity}
.lf-tag.lf-chem{border-left-color:var(--lf-green)}
.lf-tag b{display:block;font-size:max(15px,calc(2.8*var(--u)));line-height:1.2;font-weight:700;color:var(--lf-navy);letter-spacing:.02em;text-wrap:balance}
.lf-tag i{display:block;margin-top:calc(.25*var(--u));font-style:normal;font-size:max(10px,calc(1.5*var(--u)));line-height:1.2;color:var(--lf-muted);letter-spacing:.02em;white-space:nowrap}
.lf[lang="en"] .lf-tag b{font-size:max(14px,calc(2.3*var(--u)));letter-spacing:0}
.lf[lang="ja"] .lf-tag b{font-size:max(14px,calc(2.5*var(--u)));letter-spacing:0;word-break:keep-all;overflow-wrap:anywhere}
.lf-legend{position:absolute;left:0;top:0;opacity:0;font-size:max(10px,calc(1.5*var(--u)));font-weight:700;letter-spacing:.08em;color:var(--lf-orange-ink);white-space:nowrap;display:flex;align-items:center;gap:.5em}
.lf-legend::before{content:"";width:.75em;height:.75em;border-radius:50%;background:var(--lf-orange)}
.lf-legend.lf-chem{color:#12775a}.lf-legend.lf-chem::before{background:var(--lf-green)}
.lf-corner{position:absolute;left:3cqw;top:3.2cqh;margin:0;font-size:max(12px,calc(2*var(--u)));color:var(--lf-navy);letter-spacing:.04em;pointer-events:none}
.lf-corner b{font-weight:800;margin-right:.8em;padding-right:.8em;border-right:2px solid var(--lf-orange)}
.lf-title,.lf-closing{opacity:0}
.lf-msg{position:absolute;left:3cqw;top:31cqh;width:29cqw}
.lf-msg p,.lf-msg h2,.lf-msg ul{margin:0;padding:0}
.lf-msg .lf-k{margin:0 0 1.2cqh;font-size:calc(2.4*var(--u));font-weight:800;color:var(--lf-orange-ink);letter-spacing:.12em}
.lf-msg h2{font-size:calc(5.4*var(--u));line-height:1.3;font-weight:700;color:var(--lf-navy);letter-spacing:.01em;white-space:pre-line;text-wrap:balance}
.lf[lang="en"] .lf-msg h2{font-size:calc(4.6*var(--u));line-height:1.2}
.lf[lang="ja"] .lf-msg h2{font-size:calc(3.9*var(--u));text-wrap:wrap}
.lf-msg p{margin-top:1.8cqh;font-size:calc(2.3*var(--u));line-height:1.6}
.lf-msg ul{margin-top:2.6cqh;list-style:none;font-size:calc(2.3*var(--u));line-height:1.8}
.lf-msg li{padding-left:1.1em;position:relative}
.lf-msg li::before{content:"";position:absolute;left:0;top:.72em;width:.45em;height:.45em;border-radius:50%;background:var(--lf-orange)}
.lf-msg .lf-also{margin-top:1cqh;font-size:calc(1.9*var(--u));color:var(--lf-muted)}
.lf-brands{position:absolute;left:3cqw;right:3cqw;bottom:2.6cqh;margin:0;font-size:max(9px,calc(1.3*var(--u)));line-height:1.5;color:var(--lf-muted);letter-spacing:.02em}
.lf-brands b{margin-right:.8em;color:var(--lf-navy)}.lf-brands i{font-style:normal;margin-left:1em;opacity:.85}
.lf-bar{position:absolute;left:0;right:0;bottom:0;height:4px;background:var(--lf-orange);transform-origin:left center;transform:scaleX(0);opacity:.85;pointer-events:none}
.lf-pause{position:absolute;right:3cqw;top:2.4cqh;font:inherit;font-size:max(13px,1.7cqh);font-weight:600;min-height:36px;padding:6px 14px;border-radius:18px;border:1px solid var(--lf-line);background:rgba(255,255,255,.9);color:var(--lf-navy);cursor:pointer;opacity:0;transition:opacity .25s}
.lf.lf-show-ui .lf-pause,.lf.lf-paused .lf-pause,.lf-pause:focus-visible{opacity:1}
.lf-pause:focus-visible,.lf:focus-visible{outline:3px solid #2f7fd0;outline-offset:-3px}
.lf.lf-kiosk,.lf.lf-kiosk *{cursor:none}
.lf.lf-kiosk .lf-pause{display:none}
.lf-portrait .lf-msg{left:6cqw;right:6cqw;width:auto;top:var(--lf-msg-top,69.5cqh)}
.lf-portrait .lf-title .lf-msg{top:44cqh}
.lf-portrait .lf-msg h2{font-size:calc(6*var(--pw));line-height:1.25}
.lf-portrait .lf-title .lf-msg h2{font-size:calc(7.4*var(--pw))}
.lf-portrait[lang="en"] .lf-msg h2,.lf-portrait[lang="ja"] .lf-msg h2{font-size:calc(5*var(--pw))}
.lf-portrait[lang="en"] .lf-msg p,.lf-portrait[lang="ja"] .lf-msg p{font-size:calc(2.9*var(--pw));line-height:1.45}
.lf-portrait[lang="en"] .lf-corner,.lf-portrait[lang="ja"] .lf-corner{font-size:calc(2.7*var(--pw));line-height:1.35;right:16cqw}
.lf-portrait[lang="en"] .lf-msg .lf-also,.lf-portrait[lang="ja"] .lf-msg .lf-also{font-size:calc(2.5*var(--pw))}
.lf-portrait .lf-msg .lf-k{font-size:calc(3.6*var(--pw));margin-bottom:.6cqh}
.lf-portrait .lf-msg p{font-size:calc(3.3*var(--pw));margin-top:.7cqh}
.lf-portrait .lf-msg ul{display:grid;grid-template-columns:1fr 1fr;column-gap:3cqw;margin-top:1.1cqh;font-size:calc(3*var(--pw));line-height:1.6}
.lf-portrait[lang="en"] .lf-msg ul,.lf-portrait[lang="ja"] .lf-msg ul{font-size:calc(2.5*var(--pw));line-height:1.45;margin-top:.7cqh}
.lf-portrait .lf-msg li:last-child{grid-column:1/3}
.lf-portrait .lf-msg .lf-also{font-size:calc(2.8*var(--pw));margin-top:.4cqh}
.lf-portrait .lf-corner{left:5cqw;top:1.8cqh;right:22cqw;font-size:calc(3.1*var(--pw));line-height:1.5}
.lf-portrait .lf-corner b{display:block;border:0;margin:0;padding:0}
.lf-portrait .lf-brands{left:6cqw;right:6cqw;bottom:1.4cqh;font-size:calc(2.2*var(--pw));line-height:1.4}
.lf-portrait .lf-tag{padding:.45cqh 2cqw .5cqh;max-width:47cqw}
.lf-portrait .lf-tag b{font-size:calc(4*var(--pw))}
.lf-portrait[lang="en"] .lf-tag b,.lf-portrait[lang="ja"] .lf-tag b{font-size:calc(3*var(--pw));line-height:1.15}
.lf-portrait[lang="en"] .lf-tag,.lf-portrait[lang="ja"] .lf-tag{padding:.3cqh 1.8cqw .35cqh}
.lf-portrait[lang="ja"] .lf-tag i{font-size:calc(2.1*var(--pw));margin-top:0}
.lf-portrait .lf-tag i{font-size:calc(2.4*var(--pw))}
.lf-portrait .lf-pause{top:1.4cqh;right:4cqw}
`;
const TEMPLATE = `<canvas class="lf-gl" role="img"></canvas><canvas class="lf-xfade" aria-hidden="true"></canvas>
<svg class="lf-leaders" aria-hidden="true"></svg><div class="lf-tags"></div>
<div class="lf-title"><div class="lf-msg"><p class="lf-k"></p><h2></h2><p class="lf-sub"></p></div></div>
<div class="lf-closing"><div class="lf-msg"><h2></h2><p class="lf-offer"></p><ul></ul><p class="lf-also"></p></div><p class="lf-brands"></p></div>
<p class="lf-corner"><b></b><span></span></p><button class="lf-pause" type="button" aria-pressed="false"></button><div class="lf-bar"></div>`;

/**
 * Mount the film inside `host` (any sized block element). Returns { pause(), play(), seek(seconds), destroy() }.
 *   lang  - "zh-tw" | "zh-cn" | "en" | "ja"
 *   base  - where mats.js and parts/ live, relative to this module (or an absolute URL)
 *   kiosk - hide the pause control and the cursor
 * The film only renders while it is on screen and the tab is visible. It never captures wheel or touch scrolling.
 */
export async function mountLineFilm(host, { lang = "zh-tw", base = "./", kiosk = false } = {}) {
const B = new URL(base, import.meta.url);
const [{ makeMats }, { lineUnits: IU, HALF_JOINT }, { lineUnits: VU }, { lineFittings }, { lineFluoro }] = await Promise.all(
  ["mats.js", "parts/instruments.js", "parts/valves.js", "parts/fittings.js", "parts/fluoro.js"].map((f) => import(new URL(f, B).href)));
const T = LOCALES[lang] ?? LOCALES["zh-tw"];
const UI = T.ui;
if (!document.getElementById("lf-style")) { const st = document.createElement("style"); st.id = "lf-style"; st.textContent = CSS; document.head.append(st); }
const root = document.createElement("div"); root.className = "lf" + (kiosk ? " lf-kiosk" : ""); root.lang = T.lang; root.tabIndex = 0; root.innerHTML = TEMPLATE; host.append(root);
const $ = (s) => root.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ renderer / scene */
const SCALE = 2;                 // components are shown at twice real size; cylinder, frames and tool are 1:1
const k = SCALE / 1000;          // line millimetres -> metres
const YP = 1.42;                 // height of the panel axis (= cylinder valve outlet)
const HI = 0xf0954a, LO = 0x2f7fd0;

const wrap = root, canvas = $(".lf-gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
    view.purge_check = { anchor: W(xt + 12, yc, 0) };
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
const LOOP = 20;
const TL = { titleOut: 1.7, toNear: [1.8, 4.2], glide: [2.4, 14.6], toWide: [13.4, 16.2], closeIn: 16.0, slotIn: 15.75, fadeOut: 19.4, first: 3.0, every: 1.1 };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * t * (t * (t * 6 - 15) + 10); };
// trapezoid-velocity ease: constant speed with short eased ends
const trap = (u, e = 0.14) => { u = Math.min(1, Math.max(0, u)); const v = 1 / (1 - e); return u < e ? (v * u * u) / (2 * e) : u > 1 - e ? 1 - (v * (1 - u) * (1 - u)) / (2 * e) : v * (u - e / 2); };
const portrait = () => camera.aspect < 0.9;
const NDIR = new THREE.Vector3(0.2, 0.17, 1).normalize(), NDIR_P = new THREE.Vector3(0.18, 0.42, 1).normalize();
const WDIR = new THREE.Vector3(0.1, 0.105, 1).normalize();   // closing shot: lower and more frontal, two clear horizontal runs
const wideBox = () => new THREE.Box3(new THREE.Vector3(-0.64, 0, -0.1), new THREE.Vector3(info.xT * k + 0.62, 2.1, 0.62));
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), widePos = new THREE.Vector3(), wideTgt = new THREE.Vector3(), nearPos = new THREE.Vector3(), nearTgt = new THREE.Vector3();
let wideDist = 10;
function fitWide() {
  const b = wideBox(), c = b.getCenter(wideTgt), p = portrait();
  const fw = p ? 0.95 : 0.645, fh = p ? 0.235 : 0.6;
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th = tv * camera.aspect * fw, tvv = tv * fh;
  const cam = new THREE.PerspectiveCamera(); cam.position.copy(c).addScaledVector(WDIR, 30); cam.lookAt(c); cam.updateMatrixWorld();
  const inv = cam.matrixWorld.clone().invert(); let d = 0;
  for (let i = 0; i < 8; i++) {
    tmpA.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(inv);
    d = Math.max(d, -tmpA.z - 30 + Math.abs(tmpA.x) / th, -tmpA.z - 30 + Math.abs(tmpA.y) / tvv);
  }
  wideDist = d;
}
// where the subject sits on screen (fractions of the viewport): wide shot leaves room for the message and the labels
const wideCentre = () => (portrait() ? [0.5, 0.178] : [0.659, 0.568]);
const nearCentre = () => (portrait() ? [0.5, 0.5] : [0.5, 0.54]);
function setCamera(t) {
  const p = portrait();
  const b = sm(TL.toNear[0], TL.toNear[1], t) * (1 - sm(TL.toWide[0], TL.toWide[1], t));   // 0 wide, 1 near
  // wide pose with a slow continuous push-in that carries across the loop seam (16 s -> 20 s -> 1.8 s)
  const tau = t >= TL.toWide[1] ? t - TL.toWide[1] : t + LOOP - TL.toWide[1], span = LOOP - TL.toWide[1] + TL.toNear[0];
  const push = t > TL.toNear[0] && t < TL.toWide[1] ? 1 - (t - TL.toNear[0]) / (TL.toWide[1] - TL.toNear[0]) : Math.min(1, tau / span);
  widePos.copy(wideTgt).addScaledVector(WDIR, wideDist * (1 - 0.03 * push));
  // near pose: glide along the line
  const s = trap((t - TL.glide[0]) / (TL.glide[1] - TL.glide[0])), x = -0.3 + (info.xT * k + 0.08 + 0.3) * s;
  const rise = sm(1.25, 1.95, x);
  // portrait looks down more steeply and crops tighter, so the two runs spread over the tall frame instead of drum and floor
  nearTgt.set(x, (p ? 1.26 : 1.31) + (p ? 0.3 : 0.22) * rise, p ? 0.25 : 0.18);
  const vf = THREE.MathUtils.degToRad(camera.fov / 2), hf = Math.atan(Math.tan(vf) * camera.aspect);
  const d = Math.max((1.36 + 0.12 * rise) / 2 / Math.tan(vf), (p ? 0.82 : 1.2) / 2 / Math.tan(hf));
  nearPos.copy(nearTgt).addScaledVector(p ? NDIR_P : NDIR, d);
  camera.position.lerpVectors(widePos, nearPos, b);
  tmpB.lerpVectors(wideTgt, nearTgt, b); camera.lookAt(tmpB);
  const wc = wideCentre(), nc = nearCentre(), fx = wc[0] + (nc[0] - wc[0]) * b, fy = wc[1] + (nc[1] - wc[1]) * b;
  const Wp = wrap.clientWidth, Hp = wrap.clientHeight;
  camera.setViewOffset(Wp, Hp, (0.5 - fx) * Wp, (0.5 - fy) * Hp, Wp, Hp);
  camera.updateMatrixWorld();
  return b;
}

/* ------------------------------------------------------------------ DOM: labels pinned to parts, title, closing, frame */
const $tags = $(".lf-tags"), svg = $(".lf-leaders"), NS = "http://www.w3.org/2000/svg";
const gasLabels = LABELS.filter((l) => l.row === "gas"), chemLabels = LABELS.filter((l) => l.row === "chem");
const labels = LABELS.map((l) => {
  // a zero-width space after each middle dot is the only place a long name may wrap
  const copy = T.labels[l.id], tag = el("div", "lf-tag lf-" + l.row);
  tag.append(el("b", null, copy.name.replace(/・/g, "・\u200b"))); if (copy.sub) tag.append(el("i", null, copy.sub)); $tags.append(tag);
  const anchors = l.at.map((id) => view[id].anchor), wideAnchor = view[l.wideAt ?? l.at[0]].anchor;
  const mk = () => { const g = document.createElementNS(NS, "g"); const ln = document.createElementNS(NS, "path"), dot = document.createElementNS(NS, "circle"); dot.setAttribute("r", "4.5"); g.append(ln, dot); svg.append(g); return { g, ln, dot }; };
  const gi = gasLabels.indexOf(l), ci = chemLabels.indexOf(l);
  const on = l.row === "gas" ? TL.first + gi * TL.every : TL.first + 0.55 + [1, 3, 5][ci] * TL.every;
  // every anchor of the label, the wide-shot one first; in the wide shot only that one gets a leader, the rest keep a dot
  const all = [wideAnchor, ...anchors.filter((a) => a !== wideAnchor)];
  return { ...l, tag, anchors, wideAnchor, all, lines: all.map(mk), gi, ci, on, w: 0, h: 0, sx: [], sy: [] };
});
const legends = [["gas", UI.legend_gas], ["chem", UI.legend_chem]].map(([row, text]) => { const e = el("div", "lf-legend lf-" + row, text); $tags.append(e); return { row, e, w: 0, h: 0 }; });
function measure() {
  const step = Math.max(18, wrap.clientHeight * 0.03);   // card widths snap to steps so the bands look regular
  let hMax = 0;
  for (const l of labels) { l.tag.style.width = ""; l.tag.style.height = ""; const w = l.tag.getBoundingClientRect().width; l.w = Math.ceil((w + 1.5) / step) * step; l.tag.style.width = l.w + "px"; hMax = Math.max(hMax, l.tag.offsetHeight); }
  for (const l of labels) { l.h = hMax; l.tag.style.height = hMax + "px"; }   // every card the same height, whatever the language
  // portrait closing: the headline block starts right under the two-column label list
  root.style.setProperty("--lf-msg-top", (portraitGrid().bottom + wrap.clientHeight * 0.012).toFixed(1) + "px");
  for (const g of legends) { g.w = g.e.offsetWidth; g.h = g.e.offsetHeight; }
}
const proj = new THREE.Vector3();
const clamp01 = (x) => Math.min(1, Math.max(0, x));
// Pack boxes of width w[i] centred as close as possible to want[i] inside [x0, x1], keeping their order and a minimum gap.
function packRow(want, w, x0, x1, gap) {
  const n = want.length, x = want.slice();
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) x[i] = Math.max(x[i], (i ? x[i - 1] + w[i - 1] / 2 + gap : x0) + w[i] / 2);
    for (let i = n - 1; i >= 0; i--) x[i] = Math.min(x[i], (i < n - 1 ? x[i + 1] - w[i + 1] / 2 - gap : x1) - w[i] / 2);
  }
  return x;
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
// Callout layout for the wide shot, solved from the projected anchors. Returns per label: x, y (card centre) and a leader path.
function wideSlots(Wp, Hp) {
  const out = new Map(), X0 = 0.335 * Wp, X1 = 0.978 * Wp, cardH = labels[0].h, gapRow = Math.round(Hp * 0.011);
  const scr = (l) => { proj.copy(l.wideAnchor).project(camera); return { l, ax: (proj.x + 1) / 2 * Wp, ay: (1 - proj.y) / 2 * Hp }; };
  // ---- gas: two rows above the rig. The lower row sits over its anchors; upper-row leaders rise through the gaps between
  // lower-row cards. Rows alternate along the line starting with the upper row, so both ends of the lower row are free.
  const G = gasLabels.map((l) => scr(labels[LABELS.indexOf(l)])).sort((a, b) => a.ax - b.ax);
  const up = G.filter((_, i) => i % 2 === 0), low = G.filter((_, i) => i % 2 === 1);
  const yUp = Hp * 0.076 + cardH / 2, yLow = yUp + cardH + gapRow, gapLow = Math.max(26, Hp * 0.03), inset = 14;
  // 1. upper row: packed on its own, as close to its anchors as the card widths allow
  const XL = 0.2 * Wp, clear = gapLow / 2;
  let upX1 = X1;
  for (let iter = 0; iter < 3; iter++) {
  let overflow = 0;
  const xu = packRow(up.map((d) => d.ax), up.map((d) => d.l.w), XL, upX1, 10);
  up.forEach((d, i) => { d.x = xu[i]; d.y = yUp; d.pMin = d.x - d.l.w / 2 + inset; d.pMax = d.x + d.l.w / 2 - inset; d.port = Math.min(d.pMax, Math.max(d.pMin, d.ax)); });
  // 2. lower card i sits between the leaders of upper cards i and i + 1: slide those ports apart (inside their own cards) until it fits
  low.forEach((d, i) => {
    const a = up[i], b = up[i + 1], need = d.l.w + 2 * clear;
    if (b && b.port - a.port < need) {
      const want = (need - (b.port - a.port)) / 2, da = Math.min(want, a.port - a.pMin), db = Math.min(2 * want - da, b.pMax - b.port);
      a.port -= Math.min(a.port - a.pMin, da + (want - Math.min(want, db) > 0 ? 2 * want - da - db : 0)); b.port += db;
    }
    const l0 = a.port + clear + d.l.w / 2, l1 = (b ? b.port - clear : X1) - d.l.w / 2;
    if (l1 < l0) overflow = Math.max(overflow, l0 - l1);
    d.x = l1 < l0 ? (l0 + l1) / 2 : Math.min(l1, Math.max(l0, d.ax)); d.y = yLow;
    d.port = Math.min(d.x + d.l.w / 2 - inset, Math.max(d.x - d.l.w / 2 + inset, d.ax));
  });
  if (overflow < 0.5) break;
  upX1 -= overflow + 2;   // not enough room at the end of the lower row: pull the upper row in and solve again
  }
  const nG = assignTracks(G), zTop = yLow + cardH / 2 + 9, stepG = Math.max(7, Math.min(12, (Math.min(...G.map((d) => d.ay)) - 8 - zTop) / Math.max(1, nG)));
  for (const d of G) {
    const yb = d.y + cardH / 2, yt = d.level ? zTop + (nG - d.level + 0.5) * stepG : 0;
    d.path = d.level ? `M${d.ax.toFixed(1)} ${d.ay.toFixed(1)}V${yt.toFixed(1)}H${d.port.toFixed(1)}V${yb.toFixed(1)}` : `M${d.ax.toFixed(1)} ${d.ay.toFixed(1)}V${yb.toFixed(1)}`;
    out.set(d.l, d);
  }
  // ---- chemical: one row below the rig, leaders drop straight down through clear floor
  const C = chemLabels.map((l) => scr(labels[LABELS.indexOf(l)])).sort((a, b) => a.ax - b.ax);
  const yC = Hp * 0.9, xc = packRow(C.map((d) => d.ax), C.map((d) => d.l.w), X0, X1, 12);
  C.forEach((d, i) => { d.x = xc[i]; d.y = yC; d.port = Math.min(d.x + d.l.w / 2 - 14, Math.max(d.x - d.l.w / 2 + 14, d.ax)); });
  const nC = assignTracks(C), zBot = yC - cardH / 2 - 9;
  for (const d of C) {
    const yt = d.y - cardH / 2, yk = d.level ? zBot - (nC - d.level + 0.5) * 10 : 0;
    d.path = d.level ? `M${d.ax.toFixed(1)} ${d.ay.toFixed(1)}V${yk.toFixed(1)}H${d.port.toFixed(1)}V${yt.toFixed(1)}` : `M${d.ax.toFixed(1)} ${d.ay.toFixed(1)}V${yt.toFixed(1)}`;
    out.set(d.l, d);
  }
  [...G, ...C].forEach((d, i) => { d.order = i; });
  out.legend = { gas: [up[0].x - up[0].l.w / 2 - 16, yUp], chem: [C[0].x - C[0].l.w / 2 - 16, yC] };
  return out;
}
function portraitGrid() {
  const Hp = wrap.clientHeight, cardH = labels[0].h, pitch = cardH + Math.round(Hp * 0.005), y0 = Hp * 0.31 + cardH / 2;
  return { pitch, y0, bottom: y0 + Math.floor((labels.length - 1) / 2) * pitch + cardH / 2 };
}
function portraitSlots(Wp, Hp) {
  const out = new Map(), { pitch, y0 } = portraitGrid();
  labels.forEach((l, i) => out.set(l, { x: (i % 2 ? 0.745 : 0.255) * Wp, y: y0 + Math.floor(i / 2) * pitch, order: i, path: null }));
  out.legend = null;
  return out;
}
function layoutLabels(t, b) {
  const Wp = wrap.clientWidth, Hp = wrap.clientHeight, p = portrait(), u = p ? Wp / 700 : Hp / 1080, wide = 1 - b;
  const fade = 1 - clamp01((t - TL.fadeOut) / 0.3);   // closing and labels leave first, then the title comes in
  const inWide = t >= TL.slotIn - 0.05, slots = inWide ? (p ? portraitSlots(Wp, Hp) : wideSlots(Wp, Hp)) : null;
  const nearOut = 1 - sm(0.04, 0.3, wide);   // labels beside the parts fade as the pull-back starts
  for (const l of labels) {
    // every anchor on screen
    l.all.forEach((a, i) => { proj.copy(a).project(camera); l.sx[i] = (proj.x + 1) / 2 * Wp; l.sy[i] = (1 - proj.y) / 2 * Hp; });
    let x, y, alpha, lineAlpha, path = null;
    if (inWide) {
      // slotted callouts fade in once the camera has nearly settled, left to right, 60 ms apart
      const s = slots.get(l);
      x = s.x; y = s.y; alpha = clamp01((t - TL.slotIn - s.order * 0.06) / 0.3) * fade; lineAlpha = p ? 0 : alpha; path = s.path;
    } else {
      const ni = l.all.indexOf(l.anchors[0]), ax = l.sx[ni], ay = l.sy[ni];
      const off = l.near ?? (l.row === "gas" ? [0, [-100, -180, -260][l.gi % 3]] : [0, -105]);
      x = ax + off[0] * u; y = Math.min(Hp - l.h / 2 - 8, Math.max(l.h / 2 + 8 + (p ? 56 : 44 * u), ay + off[1] * u));
      const inFrame = sm(-0.02 * Wp, 0.05 * Wp, Math.min(ax, Wp - ax)) * sm(-0.02 * Hp, 0.04 * Hp, Math.min(ay, Hp - ay));
      alpha = clamp01((t - l.on) / 0.3) * inFrame * nearOut; lineAlpha = alpha;
    }
    Object.assign(l, { x, y, alpha, lineAlpha, path });
  }
  if (!inWide) {
    // cards beside the parts: push later ones away from earlier ones if a longer language makes them collide
    const vis = labels.filter((l) => l.alpha > 0.01).sort((a, b) => a.on - b.on);
    const top = (c) => c.h / 2 + 8 + (p ? 56 : 44 * u);
    const hits = (c, x, y, n) => { for (let i = 0; i < n; i++) { const a = vis[i]; if (Math.abs(a.x - x) < (a.w + c.w) / 2 + 6 && Math.abs(a.y - y) < a.h + 6) return a; } return null; };
    for (let j = 1; j < vis.length; j++) {
      const c = vis[j];
      for (let tries = 0; tries < 3; tries++) {
        const a = hits(c, c.x, c.y, j); if (!a) break;
        // try the four smallest moves that clear this neighbour; take the first that is on screen and clear of all earlier cards
        const dx = (a.w + c.w) / 2 + 8, dy = a.h + 8;
        const cand = [[c.x, a.y - dy], [c.x, a.y + dy], [a.x + dx, c.y], [a.x - dx, c.y]].sort((m, n) => Math.hypot(m[0] - c.x, m[1] - c.y) - Math.hypot(n[0] - c.x, n[1] - c.y));
        const ok = cand.find(([x, y]) => y >= top(c) && y <= Hp - c.h / 2 - 8 && x >= c.w / 2 + 4 && x <= Wp - c.w / 2 - 4 && !hits(c, x, y, j));
        if (!ok) break;
        c.x = ok[0]; c.y = ok[1];
      }
    }
  }
  for (const l of labels) {
    const { x, y, alpha, lineAlpha, path } = l;
    l.tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    l.tag.style.opacity = alpha.toFixed(3);
    l.all.forEach((a, i) => {
      const L1 = l.lines[i], px = l.sx[i], py = l.sy[i];
      const isNearAnchor = l.anchors.includes(a);
      let d = "", show = lineAlpha;
      if (inWide) { if (i === 0 && path) d = path; else if (!path) show = 0; }
      else if (!isNearAnchor) show = 0;
      else {
        // straight leader clipped at the edge of the card
        const dx = px - x, dy = py - y, hw = l.w / 2 + 2, hh = l.h / 2 + 2;
        const f = Math.min(1, Math.abs(dx) * hh > Math.abs(dy) * hw ? hw / Math.max(1e-6, Math.abs(dx)) : hh / Math.max(1e-6, Math.abs(dy)));
        if (f >= 1) show = 0; else d = `M${(x + dx * f).toFixed(1)} ${(y + dy * f).toFixed(1)}L${px.toFixed(1)} ${py.toFixed(1)}`;
      }
      L1.ln.setAttribute("d", d || "M0 0");
      L1.ln.style.display = d ? "" : "none";
      L1.dot.setAttribute("cx", px.toFixed(1)); L1.dot.setAttribute("cy", py.toFixed(1));
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

// static copy
canvas.setAttribute("aria-label", UI.canvas_label);
$(".lf-corner b").textContent = UI.company; $(".lf-corner span").textContent = UI.offer;
$(".lf-title .lf-k").textContent = UI.company; $(".lf-title h2").textContent = UI.title; $(".lf-title .lf-sub").textContent = UI.title_sub;
$(".lf-closing h2").textContent = UI.close_h; $(".lf-closing .lf-offer").textContent = UI.offer;
for (const key of Object.keys(T.groups)) $(".lf-closing ul").append(el("li", null, T.groups[key].title));
$(".lf-closing .lf-also").textContent = UI.close_also;
const allBrands = [...new Set(Object.values(T.groups).flatMap((g) => g.brands))];
$(".lf-brands").append(el("b", null, UI.brands_h), document.createTextNode(allBrands.join(" · ")), el("i", null, UI.brand_note));
const pauseBtn = $(".lf-pause");

/* ------------------------------------------------------------------ playback */
const film = { t: 0, playing: true, idle: 0, last: 0, seeking: false, raf: 0, onScreen: false, dead: false };
const STILLS = [0.9, 5.4, 9.0, 12.4, 17.8];   // reduced motion: five stills cross-fading over the same 20 s
const stillTime = (t) => STILLS[Math.min(STILLS.length - 1, Math.floor((t / LOOP) * STILLS.length))];
const shade = $(".lf-xfade"), shadeCtx = shade.getContext("2d");
let shownStill = -1;
function draw(t) {
  const b = setCamera(t);
  gasFlow.update(t / LOOP * 2); chemFlow.update(t / LOOP * 3);   // whole turns per loop: no jump at the seam
  renderer.render(scene, camera);
  layoutLabels(t, b);
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
  pauseBtn.textContent = v ? UI.pause : UI.play; pauseBtn.setAttribute("aria-pressed", String(!v));
  root.classList.toggle("lf-paused", !v);
}
setPlaying(true);
pauseBtn.addEventListener("click", (e) => { e.stopPropagation(); setPlaying(!film.playing); });
canvas.addEventListener("click", () => setPlaying(!film.playing));
root.addEventListener("keydown", (e) => { if (e.target === root && (e.key === " " || e.code === "Space")) { e.preventDefault(); setPlaying(!film.playing); } });
let hideTimer = 0;
root.addEventListener("pointermove", () => { root.classList.add("lf-show-ui"); clearTimeout(hideTimer); hideTimer = setTimeout(() => root.classList.remove("lf-show-ui"), 2500); });

function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.clearViewOffset(); camera.updateProjectionMatrix();
  root.classList.toggle("lf-portrait", portrait());
  const px = renderer.getPixelRatio() * Math.max(3, Math.min(9, Math.min(w, h) / 135));
  gasFlow.obj.material.size = px; chemFlow.obj.material.size = px;
  fitWide(); measure(); shownStill = -1;
  if (!film.raf) draw(reduced ? stillTime(film.t) : film.t);   // keep the still picture correct while the loop is parked
}
const ro = new ResizeObserver(resize); ro.observe(wrap);
const io = new IntersectionObserver((es) => { film.onScreen = es[es.length - 1].isIntersecting; syncLoop(); }, { threshold: 0.05 });
io.observe(root);
const onVis = () => syncLoop();
document.addEventListener("visibilitychange", onVis);
resize();
(document.fonts?.ready ?? Promise.resolve()).then(() => { if (!film.dead) measure(); });
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
};
}
