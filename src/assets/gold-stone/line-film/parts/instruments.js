// 調壓、壓力儀表與過濾器 — UHP gas line instrumentation, 1/4" face-seal class.
// All geometry is authored in millimetres and scaled to metres in finish().
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const TAU = Math.PI * 2, RAD = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);

/* ---------- low-level geometry helpers ---------- */
function geo(P, N) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  return g;
}
function prim(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  return g;
}
function tri(P, N, a, b, c, na, nb, nc) {
  P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  N.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
}
// a->b runs along the profile, a->d runs with increasing angle
function quad(P, N, a, b, c, d, na, nb, nc, nd) {
  tri(P, N, a, d, b, na, nd, nb);
  tri(P, N, b, d, c, nb, nd, nc);
}
function flatTri(P, N, a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-12) return;
  const n = [nx / l, ny / l, nz / l];
  tri(P, N, a, b, c, n, n, n);
}
function quadFlat(P, N, a, b, c, d) { flatTri(P, N, a, d, b); flatTri(P, N, b, d, c); }

function arc(cx, cy, rx, ry, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * RAD; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}

// Revolve a profile of [r, y] points about Y. Profile runs counter-clockwise in the (r, y) plane
// (bottom centre -> out -> up -> in). Edges sharper than `smooth` degrees stay crisp.
function revolve(pts, o = {}) {
  const seg = o.seg ?? 64, th0 = o.th0 ?? 0, thL = o.thLen ?? TAU, sm = Math.cos((o.smooth ?? 35) * RAD), closed = !!o.closed;
  const n = pts.length, ns = closed ? n : n - 1, sn = [];
  for (let i = 0; i < ns; i++) {
    const a = pts[i], b = pts[(i + 1) % n], dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1;
    sn.push([dy / l, -dr / l]);
  }
  const vn = (i, j) => {
    if (j < 0 || j >= ns) { if (!closed) return sn[i]; j = (j + ns) % ns; }
    const a = sn[i], b = sn[j];
    if (a[0] * b[0] + a[1] * b[1] < sm) return a;
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const P = [], N = [], cs = [], ss = [];
  for (let j = 0; j <= seg; j++) { const t = th0 + thL * j / seg; cs.push(Math.cos(t)); ss.push(Math.sin(t)); }
  for (let i = 0; i < ns; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (a[0] < 1e-9 && b[0] < 1e-9) continue;
    const na = vn(i, i - 1), nb = vn(i, i + 1);
    for (let j = 0; j < seg; j++) {
      const s0 = ss[j], c0 = cs[j], s1 = ss[j + 1], c1 = cs[j + 1];
      const a0 = [a[0] * s0, a[1], a[0] * c0], a1 = [a[0] * s1, a[1], a[0] * c1];
      const b0 = [b[0] * s0, b[1], b[0] * c0], b1 = [b[0] * s1, b[1], b[0] * c1];
      const na0 = [na[0] * s0, na[1], na[0] * c0], na1 = [na[0] * s1, na[1], na[0] * c1];
      const nb0 = [nb[0] * s0, nb[1], nb[0] * c0], nb1 = [nb[0] * s1, nb[1], nb[0] * c1];
      if (a[0] > 1e-9) tri(P, N, a0, a1, b0, na0, na1, nb0);
      if (b[0] > 1e-9) tri(P, N, b0, a1, b1, nb0, na1, nb1);
    }
  }
  return geo(P, N);
}
// Flat section faces for a partial revolve of a closed profile.
function cutCaps(pts, th0, thL) {
  const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  const a = prim(new THREE.ShapeGeometry(sh)).rotateY(th0 - Math.PI / 2);
  const b = prim(new THREE.ShapeGeometry(sh)).rotateY(th0 + thL - Math.PI / 2);
  return mergeGeometries([a, b]);
}

// True hexagon prism (across-flats af) along Y from 0..h with 30 degree chamfer cones on the corners.
function hexPrism(af, h, o = {}) {
  const a = af / 2, rc = o.rc ?? a * 0.965, rb = o.bore ?? 0, rbT = o.boreTop ?? rb, K = o.sub ?? 6, tn = Math.tan(30 * RAD);
  const rMax = o.rMax ?? 1e9, cbOn = o.chamBottom !== false, ctOn = o.chamTop !== false, P = [], N = [];
  for (let f = 0; f < 6; f++) {
    const phi = f * 60 * RAD, fn = [Math.sin(phi), 0, Math.cos(phi)];
    const col = (k) => {
      const d = (-30 + 60 * k / K) * RAD, th = phi + d, rh = a / Math.cos(d), clip = rh > rMax, r = clip ? rMax : rh, dep = Math.max(0, r - rc) * tn;
      return { s: Math.sin(th), c: Math.cos(th), r, clip, db: cbOn ? dep : 0, dt: ctOn ? dep : 0, rB: cbOn ? Math.min(rc, r) : r, rT: ctOn ? Math.min(rc, r) : r };
    };
    const pt = (c, r, y) => [r * c.s, y, r * c.c];
    for (let k = 0; k < K; k++) {
      const A = col(k), B = col(k + 1);
      const band = (f0, f1, nf) => { const nA = nf(A), nB = nf(B); quad(P, N, f0(A), f1(A), f1(B), f0(B), nA, nA, nB, nB); };
      const dn = () => [0, -1, 0], up = () => [0, 1, 0];
      band((c) => pt(c, rb, 0), (c) => pt(c, c.rB, 0), dn);
      if (cbOn) band((c) => pt(c, c.rB, 0), (c) => pt(c, c.r, c.db), (c) => [c.s * 0.5, -0.866, c.c * 0.5]);
      band((c) => pt(c, c.r, c.db), (c) => pt(c, c.r, h - c.dt), (c) => (c.clip ? [c.s, 0, c.c] : fn));
      if (ctOn) band((c) => pt(c, c.r, h - c.dt), (c) => pt(c, c.rT, h), (c) => [c.s * 0.5, 0.866, c.c * 0.5]);
      band((c) => pt(c, c.rT, h), (c) => pt(c, rbT, h), up);
      if (rb > 0 && o.wall !== false) band((c) => pt(c, rbT, h), (c) => pt(c, rb, 0), (c) => [-c.s, 0, -c.c]);
    }
  }
  return geo(P, N);
}

// Helical V thread along Y from 0..L.
function thread(rM, rm, p, L, seg = 40) {
  const P = [], N = [], nb = Math.ceil(L / p * 2) + 1, dr = rM - rm, l = Math.hypot(p / 2, dr), nR = (p / 2) / l, nY = dr / l;
  const vert = (j, t) => {
    const r0 = j & 1 ? rm : rM, r1 = j & 1 ? rM : rm;
    let y0 = (j / 2 + t) * p, y1 = y0 + p / 2, ra = r0, rb = r1;
    if (y1 <= 0) { y0 = y1 = 0; ra = rb = r1; } else if (y0 >= L) { y0 = y1 = L; ra = rb = r0; } else {
      if (y0 < 0) { ra = r0 + (r1 - r0) * (-y0) / (p / 2); y0 = 0; }
      if (y1 > L) { rb = r0 + (r1 - r0) * (L - (j / 2 + t) * p) / (p / 2); y1 = L; }
    }
    const a = t * TAU, s = Math.sin(a), c = Math.cos(a);
    return [[ra * s, y0, ra * c], [rb * s, y1, rb * c], s, c];
  };
  for (let j = -2; j < nb; j++) {
    const ny = j & 1 ? -nY : nY;
    for (let i = 0; i < seg; i++) {
      const A = vert(j, i / seg), B = vert(j, (i + 1) / seg);
      if (A[1][1] - A[0][1] < 1e-9 && B[1][1] - B[0][1] < 1e-9) continue;
      const nA = [nR * A[2], ny, nR * A[3]], nB = [nR * B[2], ny, nR * B[3]];
      quad(P, N, A[0], A[1], B[1], B[0], nA, nA, nB, nB);
    }
  }
  return geo(P, N);
}

// Straight-knurl / pleat prism: 2N-gon alternating rOut / rIn, optional bevelled ends.
function starPrism(rIn, rOut, y0, y1, n, bev = 0) {
  const P = [], N = [], K = 2 * n;
  const pt = (k, r, y) => { const t = k / K * TAU; return [r * Math.sin(t), y, r * Math.cos(t)]; };
  for (let k = 0; k < K; k++) {
    const r0 = k & 1 ? rIn : rOut, r1 = k & 1 ? rOut : rIn;
    quadFlat(P, N, pt(k, r0, y0 + bev), pt(k, r0, y1 - bev), pt(k + 1, r1, y1 - bev), pt(k + 1, r1, y0 + bev));
    if (bev > 0) {
      quadFlat(P, N, pt(k, rIn, y0), pt(k, r0, y0 + bev), pt(k + 1, r1, y0 + bev), pt(k + 1, rIn, y0));
      quadFlat(P, N, pt(k, r0, y1 - bev), pt(k, rIn, y1), pt(k + 1, rIn, y1), pt(k + 1, r1, y1 - bev));
    }
  }
  return geo(P, N);
}

/* ---------- assembly helpers ---------- */
class Bag {
  constructor() { this.m = new Map(); }
  add(mat, g, mx) { if (mx) g.applyMatrix4(mx); let a = this.m.get(mat); if (!a) this.m.set(mat, a = []); a.push(g); return this; }
  build(group) { for (const [mat, a] of this.m) group.add(new THREE.Mesh(a.length > 1 ? mergeGeometries(a) : a[0], mat)); return group; }
}
function along(dir, x, y, z) {
  const q = new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(...dir).normalize());
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
}
const off = (mx, d) => mx.clone().multiply(new THREE.Matrix4().makeTranslation(0, d, 0));
function finish(inner) {
  const root = new THREE.Group();
  inner.scale.setScalar(0.001); root.add(inner);
  const b = new THREE.Box3().setFromObject(root);
  inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  return root;
}
function noShadow(mesh) { Object.defineProperty(mesh, "castShadow", { get: () => false, set() {} }); return mesh; }

// Fluted body of revolution: profile [r, y] rows, n grooves of depthFn(y) cut into it. Smooth normals.
function lobed(pts, n, depthFn, cols, pow = 2.5) {
  const rows = pts.length, P = [], idx = [];
  for (let i = 0; i < rows; i++) {
    const r = pts[i][0], y = pts[i][1], d = depthFn(y);
    for (let j = 0; j < cols; j++) { const t = j / cols * TAU, rr = r - d * Math.pow(0.5 + 0.5 * Math.cos(n * t), pow); P.push(rr * Math.sin(t), y, rr * Math.cos(t)); }
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols; j++) {
    const a = i * cols + j, b = a + cols, d = i * cols + (j + 1) % cols, c = d + cols;
    idx.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g.toNonIndexed();
}
// Curved decal cells wrapped on a cylinder of radius R about Y (u along the axis, v along the arc, mm).
function wrap(R, psi, yc, cells) {
  const P = [], N = [];
  const pt = (u, v) => { const a = psi + v / R; return [R * Math.sin(a), yc + u, R * Math.cos(a)]; };
  const nr = (v) => { const a = psi + v / R; return [Math.sin(a), 0, Math.cos(a)]; };
  for (const [v0, v1, a0, a1, b0, b1] of cells) quad(P, N, pt(a0, v0), pt(a1, v0), pt(b1, v1), pt(b0, v1), nr(v0), nr(v0), nr(v1), nr(v1));
  return geo(P, N);
}
function arrowCells(len, sw, hw, hl) {
  const cells = [], base = len / 2 - hl, tip = len / 2;
  for (let i = 0; i < 4; i++) { const v0 = -sw + sw * i / 2; cells.push([v0, v0 + sw / 2, -len / 2, base + 0.1, -len / 2, base + 0.1]); }
  const xe = (v) => tip - hl * Math.abs(v) / hw;
  for (let i = 0; i < 12; i++) { const v0 = -hw + hw * i / 6, v1 = v0 + hw / 6; cells.push([v0, v1, base, xe(v0), base, xe(v1)]); }
  return cells;
}
function rectCells(u0, u1, v0, v1, n = 8) {
  const cells = [];
  for (let i = 0; i < n; i++) cells.push([v0 + (v1 - v0) * i / n, v0 + (v1 - v0) * (i + 1) / n, u0, u1, u0, u1]);
  return cells;
}
const FLIP = new THREE.Matrix4().makeRotationX(Math.PI);
const tr = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

/* ---------- 1/4" face-seal fitting parts (local +Y = outward) ---------- */
const BEAD = (y) => arc(3.9, y, 0.45, 0.45, 0, 180, 6);
// Integral male connector: optional hex, relief, 9/16-18 thread, sealing nose. Returns its length.
function maleEnd(bag, M, mx, hexH = 5.5, hexAF = 15.875) {
  const t0 = hexH + 1, t1 = t0 + 9.5;
  if (hexH > 0) bag.add(M.ss_ba, hexPrism(hexAF, hexH), mx.clone());
  bag.add(M.ss_machined, revolve([[6.2, hexH - 0.1], [6.2, t0 + 0.1]], { seg: 40 }), mx.clone());
  bag.add(M.ss_machined, thread(7.14, 6.3, 1.411, 9.5), off(mx, t0));
  bag.add(M.ss_ba, revolve([[6.0, t1], [7.14, t1], [7.14, t1 + 0.05], [6.1, t1 + 0.95], [4.5, t1 + 0.95], ...BEAD(t1 + 0.95), [3.3, t1 + 0.95], [2.3, t1 + 0.95], [2.3, t1 - 8], [0, t1 - 8]], { seg: 48 }), mx.clone());
  return t1 + 1.4;
}
// Gland: tube with flange and bead; sealing face at local y = 0, tube runs back to -len.
function gland(bag, M, mx, len) {
  bag.add(M.ss_ep, revolve([[3.175, -len], [3.175, -1.8], [5.4, -1.8], [5.4, -0.3], [5.1, 0], [4.5, 0], ...BEAD(0), [3.3, 0], [2.3, 0], [2.3, -7], [0, -7]], { seg: 48 }), mx.clone());
}
// Male nut: hex (back) + thread (front). Length ~19.3; gland face sits at 21.4.
function maleNut(bag, M, mx) {
  bag.add(M.ss_ba, hexPrism(15.875, 8, { bore: 3.4 }), mx.clone());
  bag.add(M.ss_machined, revolve([[6.2, 7.9], [6.2, 9.1]], { seg: 40 }), mx.clone());
  bag.add(M.ss_machined, thread(7.14, 6.3, 1.411, 9.5), off(mx, 9));
  bag.add(M.ss_ba, revolve([[6.0, 18.5], [7.14, 18.5], [7.14, 18.55], [6.3, 19.3], [5.6, 19.3], [5.6, 16]], { seg: 48 }), mx.clone());
}
// Female nut: 3/4" hex, 17.5 long; local y = 0 is the back (tube side), y = 17.5 the open end.
// A mating gland face sits at local y = 8.1.
function femaleNut(bag, M, mx) {
  const L = 17.5, a = 19.05 / 2;
  bag.add(M.ss_ba, hexPrism(19.05, L, { bore: 3.4, boreTop: 6.7, wall: false }), mx.clone());
  bag.add(M.ss_machined, revolve([[6.7, L], [6.7, 4.5], [3.4, 4.5], [3.4, 0]], { seg: 40 }), mx.clone());
  for (const f of [0, 3]) bag.add(M.black, prim(new THREE.CircleGeometry(1.0, 20)).translate(0, 6.2, a + 0.05).rotateY(f * 60 * RAD), mx.clone());
  return L;
}

/* ---------- pressure gauge ---------- */
function dialTexture() {
  const S = 1024, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const c = cv.getContext("2d"), C = S / 2, RED = "#a50a06", BLK = "#111";
  c.fillStyle = "#fbfbf8"; c.fillRect(0, 0, S, S);
  const PMAX = 150, ang = (psi) => (135 + 270 * psi / PMAX) * RAD;
  const tick = (a, r0, r1, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(C + r0 * Math.cos(a), C + r0 * Math.sin(a)); c.lineTo(C + r1 * Math.cos(a), C + r1 * Math.sin(a)); c.stroke(); };
  c.textAlign = "center"; c.textBaseline = "middle"; c.lineCap = "butt";
  // outer black scale: psi
  c.strokeStyle = c.fillStyle = BLK;
  c.lineWidth = 7; c.beginPath(); c.arc(C, C, 418, ang(0), ang(PMAX)); c.stroke();
  for (let i = 0; i <= 50; i++) { const a = ang(i * 3), major = i % 10 === 0, mid = i % 5 === 0; tick(a, 418, major ? 476 : mid ? 462 : 448, major ? 20 : mid ? 10 : 6.5); }
  c.font = "bold 78px Helvetica, Arial, sans-serif";
  for (let i = 0; i <= 5; i++) { const a = ang(i * 30); c.fillText(String(i * 30), C + 352 * Math.cos(a), C + 352 * Math.sin(a) + 3); }
  c.font = "bold 64px Helvetica, Arial, sans-serif"; c.fillText("psi", C + 120, C + 372);
  // inner red scale: MPa
  c.strokeStyle = c.fillStyle = RED;
  const am = (mpa) => ang(mpa * 145.04);
  c.lineWidth = 11; c.beginPath(); c.arc(C, C, 292, am(0), am(1)); c.stroke();
  for (let i = 0; i <= 20; i++) { const major = i % 4 === 0, mid = i % 2 === 0; tick(am(i * 0.05), major ? 246 : mid ? 260 : 270, 294, major ? 16 : mid ? 10 : 8); }
  c.font = "900 66px Helvetica, Arial, sans-serif";
  for (let i = 0; i <= 5; i++) { const a = am(i * 0.2); c.fillText(i === 0 ? "0" : (i * 0.2).toFixed(1), C + 192 * Math.cos(a), C + 192 * Math.sin(a) + 3); }
  c.font = "bold 64px Helvetica, Arial, sans-serif"; c.fillText("MPa", C - 110, C + 372);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// Gauge facing +Z, case centre at origin. conn: "stem" (lower mount, long stem + female nut, -Y) or "back" (centre back mount, -Z).
function makeGauge(M, D, conn) {
  const group = new THREE.Group(), bag = new Bag(), s = D / 53, R = D / 2, Tk = 29 * s, Rg = R - 4.2 * s;
  const toZ = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const casePts = [[0, -Tk], [R - 2.5 * s, -Tk], ...arc(R - 2.5 * s, -Tk + 2.5 * s, 2.5 * s, 2.5 * s, -90, 0, 5).slice(1),
    [R, -8.5 * s], [R + 1.7 * s, -8.5 * s], [R + 1.7 * s, 0.4 * s], ...arc(R - 0.5 * s, 0.4 * s, 2.2 * s, 2.2 * s, 0, 90, 6).slice(1),
    [Rg + 0.7 * s, 2.6 * s], [Rg, 1.9 * s], [Rg, -4.5 * s]];
  bag.add(M.ss_ep, revolve(casePts, { seg: 96 }), toZ);
  bag.add(M.ss_ba, starPrism(R + 1.65 * s, R + 2.0 * s, -8.5 * s, -2.6 * s, Math.round(150 * Math.sqrt(s)), 0.3 * s), toZ);
  let drop;
  if (conn === "back") {
    const mxS = along([0, 0, -1], 0, 0, -Tk);
    bag.add(M.ss_ba, revolve([[7.5, -0.5], [7.5, 2.2], [6.8, 3.1]], { seg: 40 }), mxS.clone());
    bag.add(M.ss_ba, hexPrism(14, 5.2), off(mxS, 3));
    gland(bag, M, off(mxS, 16.1), 8.5);
    femaleNut(bag, M, off(mxS, 8));
    drop = Tk + 25.5;
  } else {
    const mxS = along([0, -1, 0], 0, -R + s, -Tk * 0.5);
    bag.add(M.ss_ba, revolve([[6.6, -1], [6.6, 3.2], [5.9, 4]], { seg: 40 }), mxS.clone());
    bag.add(M.ss_ep, revolve([[4.76, 3.5], [4.76, 24.1]], { seg: 40 }), mxS.clone());
    bag.add(M.ss_ba, revolve([[4.7, 24], [7.6, 24], [8.6, 25], [8.6, 26.1]], { seg: 40 }), mxS.clone());
    gland(bag, M, off(mxS, 34.1), 8);
    femaleNut(bag, M, off(mxS, 26));
    drop = R - s + 43.5;
  }
  bag.build(group);
  const dial = new THREE.Mesh(new THREE.CircleGeometry(Rg, 72), new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.7, metalness: 0 }));
  dial.position.z = -4.5 * s + 0.03; group.add(dial);
  // needle with teardrop counterweight
  const needle = new THREE.Group(), Ln = Rg * 0.86, nb = new Bag();
  const half = [[Ln, 0.2], [0, 1.0], [-0.13 * Ln / s, 2.0], [-0.22 * Ln / s, 3.3], [-0.3 * Ln / s, 3.4], [-0.36 * Ln / s, 2.5], [-0.39 * Ln / s, 1.2]];
  const outline = [...half.map((p, i) => [i ? p[0] * s : p[0], -p[1] * s]), ...half.slice().reverse().map((p, i, a) => [i === a.length - 1 ? p[0] : p[0] * s, p[1] * s])];
  const sh = new THREE.Shape(outline.map((p) => new THREE.Vector2(p[0], p[1])));
  nb.add(M.black, prim(new THREE.ExtrudeGeometry(sh, { depth: 0.45 * s, bevelEnabled: false })).translate(0, 0, 0.9 * s));
  nb.add(M.black, revolve([[0, 0], [2.7 * s, 0], [2.7 * s, 1.5 * s], [2.3 * s, 1.9 * s], [0, 1.9 * s]], { seg: 32 }), toZ);
  nb.build(needle);
  needle.position.z = -4.5 * s + 0.05; group.add(needle);
  const pinA = (225 + 8) * RAD, pin = new THREE.Mesh(prim(new THREE.CylinderGeometry(0.5 * s, 0.5 * s, 1.6 * s, 10)).rotateX(Math.PI / 2), M.black);
  pin.position.set(Math.cos(pinA) * Rg * 0.93, Math.sin(pinA) * Rg * 0.93, -4.5 * s + 0.8 * s); group.add(pin);
  // glass: slightly crowned window
  const gp = []; for (let i = 0; i <= 8; i++) { const r = Rg * (1 - i / 8); gp.push([r, 0.9 * s + 0.7 * s * (1 - (r / Rg) ** 2)]); }
  const glass = noShadow(new THREE.Mesh(revolve(gp, { seg: 64, smooth: 60 }).applyMatrix4(toZ), M.glass));
  glass.renderOrder = 2; group.add(glass);
  const set = (v) => { needle.rotation.z = (225 - 270 * v) * RAD; };
  set(0.4);
  return { group, set, drop, Tk };
}

/* ---------- items ---------- */
function buildRegulator(M) {
  const inner = new THREE.Group(), bag = new Bag();
  const py = 23, Rb = 26;
  const knobMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.15 });
  const capMat = M.white.clone(); capMat.roughness = 0.3;
  // body (lower) + bonnet (upper, with wrench flats)
  bag.add(M.ss_ba, revolve([[0, 0], [Rb - 1.5, 0], [Rb, 1.5], [Rb, 30.6], [Rb - 0.5, 31.1], [Rb - 1.4, 31.1], [Rb - 1.4, 32.4]], { seg: 96 }));
  bag.add(M.ss_ep, revolve([[Rb - 1.4, 32.4], [25, 32.4], [25, 44.02], [18, 44.02]], { seg: 96 }));
  bag.add(M.ss_ep, hexPrism(46.5, 13, { rMax: 25, rc: 22.4, chamBottom: false, sub: 14 }), tr(0, 44, 0));
  bag.add(M.ss_ep, revolve([[13.2, 56.9], [13.2, 63.5], [12.4, 64.3], [8, 64.3], [8, 68]], { seg: 64 }));
  bag.add(M.ss_ba, revolve([[13.2, 59.4], [13.6, 59.6], [13.6, 60.6], [13.2, 60.8]], { seg: 64 }));
  // inlet: tube stub + gland + female nut; outlet: tube stub + male nut
  for (const sx of [-1, 1]) bag.add(M.ss_ba, revolve([[8, 0], [8, Rb - 21.5], [6.6, Rb - 20.6], [3.1, Rb - 20.6]], { seg: 48 }), along([sx, 0, 0], sx * 24, py, 0));
  const mL = along([-1, 0, 0], -Rb, py, 0), mR = along([1, 0, 0], Rb, py, 0);
  gland(bag, M, off(mL, 20.1), 16); femaleNut(bag, M, off(mL, 12));
  bag.add(M.ss_ep, revolve([[3.175, 4], [3.175, 28]], { seg: 32 }), mR.clone());
  maleNut(bag, M, off(mR, 8.5)); gland(bag, M, off(mR, 29.9), 3);
  // gauge port (front): integral male connector
  const mG = along([0, 0, 1], 0, py, 24);
  bag.add(M.ss_ba, revolve([[8, 0], [8, 4.5], [6.6, 5.4], [3, 5.4]], { seg: 48 }), mG.clone());
  const portEnd = 24 + 5 + maleEnd(bag, M, off(mG, 5), 5);
  bag.build(inner);
  // knob: glossy black, nine flutes, white cap
  const knob = new THREE.Group(), kb = new Bag(), ky = 66.5, kp = [];
  for (let i = 0; i <= 12; i++) { const y = 1 + 24 * i / 12; kp.push([17 + 4.6 * Math.pow(i / 12, 1.15), y]); }
  kp.push(...arc(15.6, 25, 6, 7.6, 0, 90, 10).slice(1));
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  kb.add(knobMat, lobed(kp, 9, (y) => 2.5 * ss(0.5, 3.5, y) * (1 - ss(27, 31.5, y)), 144, 3));
  kb.add(knobMat, revolve([[10, 0.6], [10, 0], [16.2, 0], [17, 1]], { seg: 72 }));
  kb.add(knobMat, revolve([[15.6, 32.6], [12.6, 32.9], [12.6, 32.2]], { seg: 72 }));
  kb.add(capMat, revolve([[12.55, 32.2], [12.55, 32.9], [12, 33.3], [0, 33.6]], { seg: 64 }));
  kb.build(knob);
  knob.position.y = ky; inner.add(knob);
  // small gauge, centre-back mounted on the front port
  const G = makeGauge(M, 42, "back");
  G.group.position.set(0, py, portEnd - 9.4 + G.drop);
  inner.add(G.group);
  const root = finish(inner);
  const update = (t) => {
    const k = Math.sin(t * 0.7);
    knob.rotation.y = -k * 1.4; knob.position.y = ky - 0.8 * k;
    G.set(0.42 + 0.2 * Math.sin(t * 0.7 - 0.35));
  };
  update(0);
  return { root, update };
}

function buildGauge(M) {
  const inner = new THREE.Group();
  const G = makeGauge(M, 53, "stem");
  inner.add(G.group);
  const root = finish(inner);
  const update = (t) => G.set(0.46 + 0.27 * Math.sin(t * 0.8 + 0.4) + 0.012 * Math.sin(t * 5.3));
  update(0);
  return { root, update };
}

function displayTexture() {
  const W = 512, H = 544, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  c.fillStyle = "#e9e9e6"; c.fillRect(0, 0, W, H);
  const rr = (x, y, w, h, r, fill) => { c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
  rr(14, 14, W - 28, 92, 10, "#1b1c1e");
  c.fillStyle = "#5a1512"; c.beginPath(); c.arc(70, 60, 13, 0, TAU); c.fill();
  c.fillStyle = "#d8a21e"; c.beginPath(); c.arc(150, 60, 13, 0, TAU); c.fill();
  c.fillStyle = "#d9d9d4"; c.beginPath(); c.arc(430, 60, 24, 0, TAU); c.fill();
  rr(14, 118, W - 28, 176, 10, "#0a0a0b");
  // seven-segment 0.000
  const seg = { a: [0, 0, 1, 0], b: [1, 0, 1, 1], c: [1, 1, 1, 2], d: [0, 2, 1, 2], e: [0, 1, 0, 2], f: [0, 0, 0, 1], g: [0, 1, 1, 1] };
  const digit = (x, y, w, h, on) => {
    c.lineCap = "round"; c.lineWidth = 15;
    for (const k of Object.keys(seg)) {
      const [x0, y0, x1, y1] = seg[k], sk = (yy) => (2 - yy) * 9, p = 9;
      c.strokeStyle = on.includes(k) ? "#ff3524" : "#2a0705";
      const ax = x + x0 * w + sk(y0), ay = y + y0 * h / 2, bx = x + x1 * w + sk(y1), by = y + y1 * h / 2, dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
      c.beginPath(); c.moveTo(ax + dx / l * p, ay + dy / l * p); c.lineTo(bx - dx / l * p, by - dy / l * p); c.stroke();
    }
  };
  c.shadowColor = "#ff2a1a"; c.shadowBlur = 14;
  for (let i = 0; i < 4; i++) digit(58 + i * 104, 150, 58, 112, "abcdef");
  c.fillStyle = "#ff3524"; c.beginPath(); c.arc(146, 264, 8, 0, TAU); c.fill();
  c.shadowBlur = 0;
  rr(390, 312, 96, 44, 8, "#1b1c1e");
  c.fillStyle = "#f2f2ee"; c.font = "bold 30px Helvetica, Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("MPa", 438, 335);
  rr(14, 372, W - 28, 158, 10, "#1b1c1e");
  rr(52, 408, 96, 76, 8, "#ecece8");
  for (const [x, up] of [[270, false], [410, true]]) {
    c.fillStyle = "#ecece8"; c.beginPath(); c.arc(x, 446, 42, 0, TAU); c.fill();
    c.fillStyle = "#1b1c1e"; c.beginPath(); c.arc(x, 446, 34, 0, TAU); c.fill();
    c.strokeStyle = "#ecece8"; c.lineWidth = 7; c.lineJoin = "round"; c.beginPath();
    const d = up ? -1 : 1; c.moveTo(x - 20, 446 - d * 13); c.lineTo(x + 20, 446 - d * 13); c.lineTo(x, 446 + d * 19); c.closePath(); c.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Square-flange circular connector on top of a transmitter housing (base at local y = 0).
function topConnector(bag, M, mx, w) {
  bag.add(M.ss_ba, prim(new THREE.BoxGeometry(w, 2, w)).translate(0, 1, 0), mx.clone());
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    bag.add(M.ss_machined, revolve([[1.5, 2], [1.5, 2.7], [1.1, 3], [0, 3]], { seg: 14 }), mx.clone().multiply(tr(sx * (w / 2 - 2.6), 0, sz * (w / 2 - 2.6))));
  }
  bag.add(M.ss_ba, revolve([[7.6, 2], [7.6, 3.6], [7.1, 4.1]], { seg: 40 }), mx.clone());
  bag.add(M.ss_machined, thread(7.5, 6.8, 1, 8, 36), off(mx, 4));
  bag.add(M.ss_ba, revolve([[6.8, 12], [7.2, 12], [7.2, 12.5], [5.9, 12.5], [5.9, 8]], { seg: 40 }), mx.clone());
  bag.add(M.black, revolve([[5.9, 8], [0, 8]], { seg: 32 }), mx.clone());
  for (let i = 0; i < 4; i++) { const a = (45 + i * 90) * RAD; bag.add(M.brass, prim(new THREE.CylinderGeometry(0.55, 0.55, 3.2, 10)).translate(3 * Math.cos(a), 9.6, 3 * Math.sin(a)), mx.clone()); }
}

function buildTransducer(M) {
  const inner = new THREE.Group(), bag = new Bag();
  const label = M.white.clone(); label.roughness = 0.6;
  const ink = M.black.clone(); ink.side = THREE.DoubleSide;
  const band = (x, r, y0, y1, yWin) => {
    const c = tr(x, 0, 0), h = y1 - y0;
    bag.add(label, revolve([[r + 0.06, y0], [r + 0.06, y1]], { seg: 72 }), c.clone());
    bag.add(M.black, revolve([[r + 0.1, y1 - h * 0.2], [r + 0.1, y1 - h * 0.04]], { seg: 72 }), c.clone());
    bag.add(M.black, revolve([[r + 0.1, y0 + h * 0.03], [r + 0.1, y0 + h * 0.12]], { seg: 72 }), c.clone());
    if (yWin != null) bag.add(ink, wrap(r + 0.08, 20 * RAD, yWin, rectCells(-1.6, 1.6, -6.5, 6.5)), c.clone());
  };
  /* --- hero: slim transmitter, stem + female face-seal nut below, connector above --- */
  {
    femaleNut(bag, M, along([0, -1, 0], 0, 17.5, 0));
    gland(bag, M, along([0, -1, 0], 0, 9.4, 0), 9);
    bag.add(M.ss_ep, revolve([[4, 17.4], [4, 40.1]], { seg: 40 }));
    bag.add(M.ss_ba, revolve([[3.9, 40], [9.2, 40], [10, 40.8], [10, 46.5], [9.4, 46.8], [9.4, 47.8], [10, 48.1], [10, 51.5], [14, 62.5], [14, 121], [13, 122], [9, 122]], { seg: 72, smooth: 20 }));
    band(0, 14, 86, 111, 74);
    topConnector(bag, M, tr(0, 122, 0), 20);
  }
  /* --- flow-through: square block with two male face-seal ports --- */
  {
    const x0 = -56, c = tr(x0, 0, 0);
    bag.add(M.ss_machined, prim(new RoundedBoxGeometry(22, 22, 22, 2, 0.5)).translate(x0, 11, 0));
    for (const sx of [-1, 1]) {
      const m = along([sx, 0, 0], x0 + sx * 11, 11, 0);
      bag.add(M.ss_ba, revolve([[7.6, -0.5], [7.6, 1.2], [6.9, 1.9], [6.2, 1.9]], { seg: 40 }), m.clone());
      maleEnd(bag, M, off(m, 1.2), 0);
    }
    bag.add(M.ss_ba, revolve([[10, 21.5], [10, 34], [15.2, 34], [16, 34.8], [16, 77], [15, 78], [10, 78]], { seg: 72 }), c.clone());
    band(x0, 16, 44, 68, null);
    topConnector(bag, M, tr(x0, 78, 0), 21);
  }
  /* --- digital display type: male thread, hex, square indicator housing --- */
  {
    const x0 = 58, c = tr(x0, 0, 0);
    bag.add(M.ss_machined, thread(6.6, 5.8, 1.337, 12), c.clone());
    bag.add(M.ss_ba, revolve([[0, 0.02], [5.2, 0.02], [5.9, 0.6]], { seg: 32 }).rotateX(0), c.clone());
    bag.add(M.ss_ba, revolve([[6.7, 11.5], [6.7, 13.1]], { seg: 32 }), c.clone());
    bag.add(M.ss_ba, hexPrism(24, 9.5), tr(x0, 13, 0));
    bag.add(M.ss_ba, revolve([[10.5, 22.4], [10.5, 37]], { seg: 64 }), c.clone());
    bag.add(M.ss_ba, revolve([[13.5, 34.5], [13.5, 36.2]], { seg: 64 }), c.clone());
    const hy = 36, hh = 38, hw = 36, hd = 42;
    bag.add(label, prim(new RoundedBoxGeometry(hw, hh, hd, 3, 1.6)).translate(x0, hy + hh / 2, 0));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(hw - 3.4, hh - 3.4), new THREE.MeshStandardMaterial({ map: displayTexture(), roughness: 0.45, metalness: 0 }));
    panel.position.set(x0, hy + hh / 2, hd / 2 + 0.05); inner.add(panel);
    // cable out of the back
    bag.add(M.rubber, revolve([[4.2, 0], [4.2, 4], [3.2, 6.5], [2.6, 6.5]], { seg: 24 }), along([0, 0, -1], x0, hy + 12, -hd / 2 + 0.2));
    const curve = new THREE.CatmullRomCurve3([[x0, hy + 12, -hd / 2 - 4], [x0, hy + 12, -hd / 2 - 13], [x0 + 1, hy + 5, -hd / 2 - 24], [x0 + 4, 14, -hd / 2 - 31], [x0 + 10, 4, -hd / 2 - 38], [x0 + 22, 2.6, -hd / 2 - 46]].map((p) => new THREE.Vector3(...p)));
    bag.add(M.black, prim(new THREE.TubeGeometry(curve, 48, 2.5, 14)));
    const e = curve.getPoint(1), tg = curve.getTangent(1);
    bag.add(M.black, prim(new THREE.CircleGeometry(2.5, 14)), new THREE.Matrix4().compose(e, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tg), new THREE.Vector3(1, 1, 1)));
  }
  bag.build(inner);
  return { root: finish(inner) };
}

// Inline filter along local +Y: end, hex, body, hex, end. Returns total length.
function inlineFilter(bag, M, mx, o) {
  const { mat, thr, hexAF, hexH, R, L, npt } = o;
  let y = 0;
  const end = (m) => {
    if (!npt) return maleEnd(bag, M, m, 0);
    bag.add(thr, thread(6.6, 5.85, 1.411, 12), m.clone());
    bag.add(mat, revolve([[5, 12], [6.6, 12], [6.6, 12.02], [5.8, 12.7], [3.6, 12.7], [3.6, 5], [0, 5]], { seg: 40 }), m.clone());
    return 12.7;
  };
  const eL = npt ? 12.7 : 11.9;
  end(off(mx, eL).multiply(FLIP)); y = eL;
  bag.add(mat, hexPrism(hexAF, hexH), off(mx, y)); y += hexH;
  bag.add(mat, revolve([[R - 1.2, y - 0.1], [R - 1.2, y + 1.2], [R - 0.6, y + 1.2], [R, y + 1.8], [R, y + L - 1.8], [R - 0.6, y + L - 1.2], [R - 1.2, y + L - 1.2], [R - 1.2, y + L + 0.1]], { seg: 72 }), mx.clone()); y += L;
  bag.add(mat, hexPrism(hexAF, hexH), off(mx, y)); y += hexH;
  end(off(mx, y));
  return y + eL;
}

function buildFilter(M) {
  const inner = new THREE.Group(), bag = new Bag();
  const etch = new THREE.MeshStandardMaterial({ color: 0x6f757b, metalness: 0.6, roughness: 0.55, side: THREE.DoubleSide });
  const gold = M.brass.clone(); gold.color.set(0xdcb75e); gold.roughness = 0.2;
  const goldThr = M.brass.clone(); goldThr.color.set(0xd2ab52); goldThr.roughness = 0.32;
  const etchG = etch.clone(); etchG.color.set(0x8a6c2a);
  // hero: stainless inline filter, standing
  inlineFilter(bag, M, tr(0, 0, 0), { mat: M.ss_ba, hexAF: 27, hexH: 9, R: 12.7, L: 48 });
  bag.add(etch, wrap(12.76, 28 * RAD, 11.9 + 9 + 24, arrowCells(12, 0.8, 2.5, 4.6)));
  // brass variant, smaller, pipe-thread ends
  inlineFilter(bag, M, tr(-40, 0, 14), { mat: gold, thr: goldThr, hexAF: 19, hexH: 7, R: 8.6, L: 27, npt: true });
  bag.add(etchG, wrap(8.66, 28 * RAD, 12.7 + 7 + 13.5, arrowCells(8, 0.55, 1.7, 3.2)), tr(-40, 0, 14));
  // bell-shaped large-area housing, lying on its side
  {
    const a = 28 * RAD, dir = [Math.cos(a), 0, Math.sin(a)], mx = along(dir, 38, 30, 4);
    maleEnd(bag, M, off(mx, 17.45).multiply(FLIP), 6);
    bag.add(M.ss_ba, revolve([[7, 17.3], [9.5, 17.3], [9.5, 21], [28.6, 21], [30, 22.4], [30, 50], [29, 51], [26, 51], [10.5, 64], [9, 64], [9, 66.1]], { seg: 96 }), mx.clone());
    maleEnd(bag, M, off(mx, 66), 7, 17.46);
  }
  bag.build(inner);
  return { root: finish(inner) };
}

export const items = [
  { id: "pressure_regulator", title: "調壓閥", build(_T, M) { return buildRegulator(M); } },
  { id: "pressure_gauge", title: "壓力錶", build(_T, M) { return buildGauge(M); } },
  { id: "pressure_transducer", title: "壓力傳送器", build(_T, M) { return buildTransducer(M); } },
  { id: "gas_filter", title: "過濾器", build(_T, M) { return buildFilter(M); } },
];

/* ---------- single connectable units for the assembled gas line (line.html) ----------
   Contract: unit(M) -> { group, len, back, top }. Geometry in millimetres, flow axis = +X through the origin,
   male face-seal port tips (bead crown) at x = -len/2 and x = +len/2. back = body extent towards -Z,
   top = highest point above the axis. `items` above is untouched. */
// Male port leaving a body face d0 from the origin along dir. Returns the distance of its tip from the origin.
function portOn(bag, M, dir, d0, lo) {
  const m = along(dir, dir[0] * d0, dir[1] * d0, dir[2] * d0);
  bag.add(M.ss_ba, revolve([[7.6, -0.5], [7.6, 1.2], [6.9, 1.9], [6.2, 1.9]], { seg: lo ? 24 : 40 }), m.clone());
  return d0 + 1.2 + maleEnd(bag, M, off(m, 1.2), 0);
}
// Half of a face-seal joint: gland + female nut made up on a male port whose tip is at the origin pointing +X.
// The gland tube tail runs on to x = HALF_JOINT (butt-weld end).
export const HALF_JOINT = 14;
function unitHalfJoint(M) {
  const group = new THREE.Group(), bag = new Bag(), m = along([-1, 0, 0], 0.45, 0, 0);
  gland(bag, M, m, HALF_JOINT - 0.45);
  femaleNut(bag, M, along([-1, 0, 0], 0.45 + 8.1, 0, 0));
  bag.build(group);
  return { group, len: HALF_JOINT };
}
// Flow-through block: ports on +-X, optional third port up (+Y). Also the base of the gauge and purge tees.
function teeBody(bag, M, up) {
  bag.add(M.ss_machined, prim(new RoundedBoxGeometry(22, 22, 22, 2, 0.5)));
  let tip = 0;
  for (const sx of [-1, 1]) tip = portOn(bag, M, [sx, 0, 0], 11);
  if (up) portOn(bag, M, [0, 1, 0], 11);
  return tip;
}
function unitTee(M) {
  const group = new THREE.Group(), bag = new Bag(), tip = teeBody(bag, M, true);
  bag.build(group);
  return { group, len: tip * 2, back: 11, top: tip, upTip: tip };
}
function unitTransducer(M) {
  const group = new THREE.Group(), bag = new Bag(), c = tr(0, -11, 0);
  const label = M.white.clone(); label.roughness = 0.6;
  const tip = teeBody(bag, M, false);
  bag.add(M.ss_ba, revolve([[10, 21.5], [10, 34], [15.2, 34], [16, 34.8], [16, 77], [15, 78], [10, 78]], { seg: 56 }), c.clone());
  bag.add(label, revolve([[16.06, 44], [16.06, 68]], { seg: 56 }), c.clone());
  bag.add(M.black, revolve([[16.1, 63.2], [16.1, 67.04]], { seg: 56 }), c.clone());
  bag.add(M.black, revolve([[16.1, 44.72], [16.1, 46.88]], { seg: 56 }), c.clone());
  topConnector(bag, M, tr(0, 67, 0), 21);
  bag.build(group);
  return { group, len: tip * 2, back: 16, top: 79.5 };
}
function unitRegulator(M) {
  const group = new THREE.Group(), bag = new Bag(), py = 23, Rb = 26, c = tr(0, -py, 0);
  const knobMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.15 });
  const capMat = M.white.clone(); capMat.roughness = 0.3;
  bag.add(M.ss_ba, revolve([[0, 0], [Rb - 1.5, 0], [Rb, 1.5], [Rb, 30.6], [Rb - 0.5, 31.1], [Rb - 1.4, 31.1], [Rb - 1.4, 32.4]], { seg: 72 }), c.clone());
  bag.add(M.ss_ep, revolve([[Rb - 1.4, 32.4], [25, 32.4], [25, 44.02], [18, 44.02]], { seg: 72 }), c.clone());
  bag.add(M.ss_ep, hexPrism(46.5, 13, { rMax: 25, rc: 22.4, chamBottom: false, sub: 10 }), tr(0, 44 - py, 0));
  bag.add(M.ss_ep, revolve([[13.2, 56.9], [13.2, 63.5], [12.4, 64.3], [8, 64.3], [8, 68]], { seg: 48 }), c.clone());
  bag.add(M.ss_ba, revolve([[13.2, 59.4], [13.6, 59.6], [13.6, 60.6], [13.2, 60.8]], { seg: 48 }), c.clone());
  let tip = 0;
  for (const sx of [-1, 1]) {
    const m = along([sx, 0, 0], sx * 24, 0, 0);
    bag.add(M.ss_ba, revolve([[8, 0], [8, Rb - 21.5], [6.6, Rb - 20.6], [6.2, Rb - 20.6]], { seg: 40 }), m.clone());
    tip = 24 + 5.2 + maleEnd(bag, M, off(m, 5.2), 0);
  }
  bag.build(group);
  const knob = new THREE.Group(), kb = new Bag(), kp = [];
  for (let i = 0; i <= 12; i++) { const y = 1 + 24 * i / 12; kp.push([17 + 4.6 * Math.pow(i / 12, 1.15), y]); }
  kp.push(...arc(15.6, 25, 6, 7.6, 0, 90, 10).slice(1));
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  kb.add(knobMat, lobed(kp, 9, (y) => 2.5 * ss(0.5, 3.5, y) * (1 - ss(27, 31.5, y)), 108, 3));
  kb.add(knobMat, revolve([[10, 0.6], [10, 0], [16.2, 0], [17, 1]], { seg: 54 }));
  kb.add(knobMat, revolve([[15.6, 32.6], [12.6, 32.9], [12.6, 32.2]], { seg: 54 }));
  kb.add(capMat, revolve([[12.55, 32.2], [12.55, 32.9], [12, 33.3], [0, 33.6]], { seg: 48 }));
  kb.build(knob);
  knob.position.y = 66.5 - py; group.add(knob);
  return { group, len: tip * 2, back: Rb, top: 66.5 - py + 33.6 };
}
// Gauge on a tee: lower-mount gauge made up on the tee's upward port, dial facing +Z.
function unitGauge(M) {
  const group = new THREE.Group(), bag = new Bag(), tip = teeBody(bag, M, true);
  bag.build(group);
  const M2 = Object.create(M);
  M2.glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.14, clearcoat: 1, depthWrite: false });
  const G = makeGauge(M2, 53, "stem");
  G.set(0.3);
  G.group.position.set(0, tip + 60.05, 14.5);
  group.add(G.group);
  return { group, len: tip * 2, back: 14.5, top: tip + 60.05 + 28.5, set: G.set };
}
function unitFilter(M) {
  const group = new THREE.Group(), bag = new Bag(), o = { mat: M.ss_ba, hexAF: 22, hexH: 8, R: 12.7, L: 40 };
  const len = 2 * 11.9 + 2 * o.hexH + o.L, mx = along([1, 0, 0], -len / 2, 0, 0);
  const etch = new THREE.MeshStandardMaterial({ color: 0x6f757b, metalness: 0.6, roughness: 0.55, side: THREE.DoubleSide });
  inlineFilter(bag, M, mx, o);
  bag.add(etch, wrap(12.76, 0, len / 2, arrowCells(12, 0.8, 2.5, 4.6)), mx.clone());
  bag.build(group);
  return { group, len, back: 12.7, top: 12.7 };
}
// Bulkhead-style male port standing on a surface at y = 0 (tip at y = len).
function unitInletPort(M) {
  const group = new THREE.Group(), bag = new Bag();
  const len = maleEnd(bag, M, tr(0, 0, 0), 6, 19.05);
  bag.build(group);
  return { group, len };
}
export const lineUnits = { halfJoint: unitHalfJoint, tee: unitTee, transducer: unitTransducer, regulator: unitRegulator, gauge: unitGauge, filter: unitFilter, inletPort: unitInletPort };
