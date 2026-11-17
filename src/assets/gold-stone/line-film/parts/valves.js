// 不鏽鋼閥件 — 316L UHP valves (1/4" class). All geometry is procedural, authored in millimetres
// inside a group scaled to metres. Shared profile convention: [r, y] points traced counter-clockwise
// (outer wall ascending, bore descending) and swept about the Y axis as (r cos a, y, r sin a).
import { mergeGeometries, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

const TAU = Math.PI * 2, D = Math.PI / 180;

function norm(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  g.clearGroups?.();
  return g;
}

// Sweep a (possibly angle-dependent) profile about Y. Crisp edges via creased normals.
function sweep(THREE, fn, o = {}) {
  const a0 = o.a0 ?? 0, a1 = o.a1 ?? TAU;
  const segs = o.segs ?? Math.max(2, Math.round((a1 - a0) / (5 * D)));
  const pos = [], idx = [];
  let n = 0;
  for (let k = 0; k <= segs; k++) {
    const a = a0 + ((a1 - a0) * k) / segs, c = Math.cos(a), s = Math.sin(a);
    const pts = typeof fn === "function" ? fn(a) : fn;
    n = pts.length;
    for (const p of pts) pos.push(p[0] * c, p[1], p[0] * s);
  }
  for (let k = 0; k < segs; k++) for (let i = 0; i < n - 1; i++) {
    const a = k * n + i, b = a + 1, d = (k + 1) * n + i, c = d + 1;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return toCreasedNormals(g, o.crease ?? 0.4);
}

// Flat section face of a profile at sweep angle a (for cutaways).
function capGeo(THREE, pts, a) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))));
  const p = g.attributes.position, nn = g.attributes.normal, c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setXYZ(i, x * c, y, x * s);
    nn.setXYZ(i, -s, 0, c);
  }
  return norm(g);
}

// Hex section with 30° chamfer cones (true nut form): 4 points, depends on angle.
function hexPts(a, af, y0, y1, o = {}) {
  const ap = af / 2, rt = ap * (o.f ?? 0.96), sixth = Math.PI / 3;
  let m = (a - (o.rot ?? 0)) % sixth;
  if (m < 0) m += sixth;
  const rh = ap / Math.cos(m - sixth / 2), d = (rh - rt) / 1.732;
  const cb = o.chB ?? 1, ct = o.chT ?? 1;
  return [[cb ? rt : rh, y0], [rh, y0 + (cb ? d : 0)], [rh, y1 - (ct ? d : 0)], [ct ? rt : rh, y1]];
}

// Helical V-thread flank points between y0 and y1 (fixed count, ascending).
function threadPts(a, rMaj, depth, pitch, y0, y1) {
  const n = Math.ceil((y1 - y0) / pitch) * 2 + 3, f = a / TAU, sh = (f - Math.floor(f)) * pitch, out = [];
  for (let j = -2; j < n - 2; j++) {
    let y = y0 + (j * pitch) / 2 + sh;
    y = y < y0 ? y0 : y > y1 ? y1 : y;
    const u = (y - y0 - sh) / pitch, fr = u - Math.floor(u);
    out.push([rMaj - depth * (1 - Math.abs(2 * fr - 1)), y]);
  }
  return out;
}

// Male face-seal port: outer path from base y0 to the bore mouth (neck, thread, nose, sealing bead).
function portPts(a, y0, o = {}) {
  const rn = o.rn ?? 6.2, rb = o.rb ?? 2.3, t0 = y0 + (o.neck ?? 3), t1 = t0 + (o.thread ?? 9), e = t1 + 2.4;
  return [[rn, y0], [rn, t0 - 0.5], [6.6, t0], ...threadPts(a, 7.14, 0.76, 1.411, t0, t1),
    [5.3, t1], [5.3, e - 0.4], [4.9, e], [4.25, e], [4.0, e + 0.35], [3.3, e + 0.35], [3.05, e], [rb + 0.3, e], [rb, e - 0.3]];
}
const portLen = (o = {}) => (o.neck ?? 3) + (o.thread ?? 9) + 2.4 + 0.35;

// Re-orient a Y-axis part onto the X axis (dir +1: a=0 is down, 90° is +z, 180° is up).
function X(g, x, y, z, dir = 1) {
  g.rotateZ(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
const T = (g, x, y, z) => (g.translate(x, y, z), g);

function blockGeo(THREE, w, h, d, c, cc) {
  const x = w / 2, z = d / 2, s = new THREE.Shape();
  s.moveTo(-x + cc, -z); s.lineTo(x - cc, -z); s.lineTo(x, -z + cc); s.lineTo(x, z - cc);
  s.lineTo(x - cc, z); s.lineTo(-x + cc, z); s.lineTo(-x, z - cc); s.lineTo(-x, -z + cc); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelOffset: -c, bevelSegments: 1, steps: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, c, 0);
  return norm(g);
}

// Extrude a plan outline (array of [x, z]) upward from y0 by h with a bevel.
function extrudeY(THREE, pts, y0, h, bevel, bs = 2, crease = 0.5) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  let g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: bs, steps: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0 + bevel, 0);
  g = norm(g); g.deleteAttribute("normal");
  return toCreasedNormals(g, crease);
}

function arrowGeo(THREE, L, w, hw, hl) {
  const s = new THREE.Shape();
  s.moveTo(-L / 2, -w / 2); s.lineTo(L / 2 - hl, -w / 2); s.lineTo(L / 2 - hl, -hw / 2); s.lineTo(L / 2, 0);
  s.lineTo(L / 2 - hl, hw / 2); s.lineTo(L / 2 - hl, w / 2); s.lineTo(-L / 2, w / 2); s.closePath();
  return norm(new THREE.ShapeGeometry(s));
}

function batcher(THREE) {
  const m = new Map();
  return {
    add(mat, ...gs) { let a = m.get(mat); if (!a) m.set(mat, (a = [])); a.push(...gs); return this; },
    into(group) {
      for (const [mat, gs] of m) group.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], mat));
      m.clear();
      return group;
    },
  };
}

function mkRoot(THREE) {
  const root = new THREE.Group(), g = new THREE.Group();
  g.scale.setScalar(0.001); root.add(g);
  return { root, g };
}

function extraMats(THREE, M) {
  const cut = new THREE.MeshStandardMaterial({ color: 0xaab3bd, metalness: 0.25, roughness: 0.62, side: THREE.DoubleSide });
  const engrave = new THREE.MeshStandardMaterial({ color: 0x555a61, metalness: 0.4, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const thin = M.ss_ba.clone(); thin.side = THREE.DoubleSide;
  return { cut, engrave, thin };
}

// dwell-at-both-ends ease, 0 at t=0, period T
function cyc(t, period) {
  let u = 0.5 - 0.5 * Math.cos((TAU * t) / period);
  u = (u - 0.15) / 0.7; u = u < 0 ? 0 : u > 1 ? 1 : u;
  return u * u * (3 - 2 * u);
}

const hexNut = (THREE, af, y0, y1, r0, o, so) => sweep(THREE, (a) => [[r0, y0], ...hexPts(a, af, y0, y1, o), [r0, y1], [r0, y0]], so);
const disc = (THREE, r, x, y, z) => T(norm(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2)), x, y, z);

// centre on x/z and rest on y = 0
function settle(THREE, root, g) {
  root.updateMatrixWorld(true);
  const bx = new THREE.Box3().setFromObject(root);
  g.position.set(-(bx.min.x + bx.max.x) / 2, -bx.min.y, -(bx.min.z + bx.max.z) / 2);
}

function lobes(n, R, e, p, N = 280) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, r = R - e * Math.pow(0.5 + 0.5 * Math.cos(n * a), p);
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}

/* ------------------------------------------------------------------ 伸縮囊閥 */
// Hero: Y-pattern weld-end bellows valve with black spoked handwheel (bonnet at 45°).
// Variant: slim angled valve with tube stubs and a white lobed knob.
// A window in the back of the hero bonnet (not visible from the front) shows the bellows.
function buildBellows(THREE, M) {
  const { root, g } = mkRoot(THREE), X_ = extraMats(THREE, M), b = batcher(THREE);
  const satin = new THREE.MeshStandardMaterial({ color: 0xb6babf, metalness: 0.92, roughness: 0.52 });
  const gloss = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const AY = 30, OX = -18;
  // body barrel + weld stubs
  b.add(satin, X(sweep(THREE, [[19.05, -62], [23, -62], [23, -57], [26.5, -55.5], [30, -51], [30, 56], [26.5, 60.5], [23, 62], [23, 67], [19.05, 67]]), 0, AY, 0));
  for (const [x0, x1] of [[-100, -55], [60, 105]])
    b.add(M.ss_ba, X(sweep(THREE, [[17.4, x0], [19.05, x0], [19.05, x1], [17.4, x1], [17.4, x0]]), 0, AY, 0));
  // flat pad on the front of the body (plain, no marking)
  b.add(satin, T(blockGeo(THREE, 30, 13, 5, 0.6, 1.2), -22, AY - 20, 28));
  b.into(g);

  const bon = new THREE.Group(); bon.position.set(OX, AY, 0); bon.rotation.z = -Math.PI / 4; g.add(bon);
  const W0 = 305 * D, W1 = 575 * D;
  b.add(satin, sweep(THREE, [[26, 0], [26, 32], [22, 32], [22, 27], [6.5, 27]]));
  const ring = [[22, 32], [26, 32], [26, 78], [22, 78], [22, 32]];
  b.add(satin, sweep(THREE, ring, { a0: W0, a1: W1 }));
  for (const a of [W0, W1]) b.add(X_.cut, capGeo(THREE, ring, a));
  b.add(satin, sweep(THREE, [[6.5, 78], [26, 78], [26, 82], [34, 82], [34, 90], [24.5, 90]]));
  b.add(M.ss_ba, sweep(THREE, [[23, 90], [24.5, 90], [24.5, 93], [15, 97], [15, 110], [13, 112], [6.6, 112], [6.6, 105]]));
  for (let i = 0; i < 6; i++) {
    const a = (i + 0.5) * 60 * D;
    b.add(M.ss_ba, T(hexNut(THREE, 8, 90, 94, 0, {}, { segs: 12 }), 29.3 * Math.cos(a), 0, 29.3 * Math.sin(a)));
  }
  b.add(M.red, T(sweep(THREE, [[0, 92], [3.6, 92], [3.6, 101], [2.8, 102], [0, 102]], { segs: 20 }), -6, 0, 19));
  b.into(bon);
  const BT = 78, L0 = BT - 31, NC = 14, bp = [];
  for (let i = 0; i <= NC * 10; i++) {
    const s = i / (NC * 10), w = -Math.cos(TAU * NC * s);
    bp.push([14 + 3.4 * Math.sign(w) * Math.pow(Math.abs(w), 0.75), -L0 * s]);
  }
  const bel = new THREE.Mesh(sweep(THREE, bp, { segs: 40, crease: 1.3 }), X_.thin);
  bel.position.y = BT; bon.add(bel);

  const stem = new THREE.Group(); bon.add(stem);
  b.add(M.ss_ep, sweep(THREE, [[6, 24], [6, 28.2], [17.6, 28.2], [17.6, 31], [6, 31], [6, 117]]));
  b.add(gloss, sweep(THREE, [[0, 115], [11, 115], [15.5, 119], [15.5, 131], [13.5, 133], [0, 133]]));
  b.add(gloss, T(norm(new THREE.TorusGeometry(62, 7.5, 14, 72).rotateX(Math.PI / 2)), 0, 126, 0));
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.CylinderGeometry(1, 1, 46, 18, 1);
    sp.scale(4.6, 1, 8.5); sp.rotateZ(Math.PI / 2); sp.translate(37, 0, 0); sp.rotateY(i * 120 * D + 0.5); sp.translate(0, 126, 0);
    sp.computeVertexNormals();
    b.add(gloss, norm(sp));
  }
  b.add(M.blue, sweep(THREE, [[0, 133], [13.2, 133], [13.2, 135], [11.5, 136.6], [0, 137]]));
  b.into(stem);

  // ---- small variant
  const sv = new THREE.Group(); sv.position.set(28, 9, 84); sv.rotation.y = 0.5; g.add(sv);
  b.add(satin, X(sweep(THREE, [[6.35, -15], [7.6, -15], [9, -13.5], [9, 13.5], [7.6, 15], [6.35, 15]]), 0, 0, 0));
  for (const [x0, x1] of [[-56, -14], [14, 56]])
    b.add(M.ss_ba, X(sweep(THREE, [[5.45, x0], [6.35, x0], [6.35, x1], [5.45, x1], [5.45, x0]]), 0, 0, 0));
  b.into(sv);
  const sb = new THREE.Group(); sb.position.set(4, 0, 0); sb.rotation.z = Math.PI / 4; sv.add(sb);
  b.add(satin, sweep(THREE, [[8.5, 0], [8.5, 21], [7, 21]]));
  b.add(M.ss_ba, hexNut(THREE, 19, 20, 28.5, 0), sweep(THREE, [[0, 28.5], [6.2, 28.5], [6.2, 34.6], [0, 34.6]]));
  b.into(sb);
  const knob = new THREE.Group(); sb.add(knob);
  b.add(M.white, extrudeY(THREE, lobes(8, 17.5, 1.8, 1.4), 35, 14, 2.2, 2, 0.5));
  b.add(M.blue, sweep(THREE, [[0, 49], [10.5, 49], [10.5, 49.6], [0, 49.6]]));
  b.into(knob);

  settle(THREE, root, g);
  return {
    root,
    update(t) {
      const s = cyc(t, 8);
      stem.position.y = 6 * s;
      stem.rotation.y = s * TAU * 1.25;
      bel.scale.y = (L0 - 6 * s) / L0;
      knob.rotation.y = s * TAU;
    },
  };
}

/* ------------------------------------------------------------------ 隔膜閥 */
// Hero: block body, face-seal ports, black lobed handle with a plain metal disc.
// Variants: pneumatic actuator on a surface-mount base; blue wing-handle quarter-turn valve.
function buildDiaphragm(THREE, M) {
  const { root, g } = mkRoot(THREE), X_ = extraMats(THREE, M), b = batcher(THREE);
  const alu = new THREE.MeshStandardMaterial({ color: 0xd4d6d8, metalness: 0.85, roughness: 0.42 });
  const unit = (x, z) => { const u = new THREE.Group(); u.position.set(x, 0, z); u.rotation.y = Math.PI / 2; g.add(u); return u; };
  const ports = (hw, py, o) => {
    for (const dir of [1, -1])
      b.add(M.ss_ba, X(sweep(THREE, (a) => [[2.3, 0], ...portPts(a, 0, o), [2.3, 0]]), dir * hw, py, 0, dir));
  };

  // ---- A: hero
  const A = unit(36.3, 13.7);
  b.add(M.ss_mp, blockGeo(THREE, 28, 26, 28, 0.9, 1.4));
  ports(14, 11, { neck: 4.5, thread: 10 });
  b.add(M.ss_machined, sweep(THREE, (a) => [[6, 26], ...threadPts(a, 10.4, 0.7, 1.25, 26, 30), [6, 30], [6, 26]]));
  b.add(M.ss_ba, hexNut(THREE, 24, 27.6, 36.6, 0), sweep(THREE, [[0, 36.6], [8.6, 36.6], [8.6, 41.5], [0, 41.5]]));
  b.into(A);
  const hA = new THREE.Group(); A.add(hA);
  b.add(M.black, extrudeY(THREE, lobes(7, 23.5, 4.2, 1.15), 41, 17, 2.6, 2, 0.5));
  b.add(alu, sweep(THREE, [[0, 58], [15.5, 58], [15.5, 58.7], [0, 58.7]]));
  b.into(hA);

  // ---- B: pneumatic
  const B = unit(-23.7, -20);
  b.add(M.ss_mp, blockGeo(THREE, 38, 7, 38, 0.8, 3.5));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(M.black, disc(THREE, 2.7, sx * 13.8, 7.03, sz * 13.8));
  b.add(M.ss_mp, sweep(THREE, [[0, 7], [13, 7], [13, 19], [17, 19.6], [17, 31], [15, 31], [15, 33.2], [0, 33.2]]));
  b.add(M.black, T(norm(new THREE.CircleGeometry(1, 16)), 0, 13, 13.03));
  b.add(M.ss_ba, hexNut(THREE, 37, 33.2, 40.2, 0, { f: 0.985 }));
  b.add(M.ss_ba, sweep(THREE, [[0, 40.2], [13, 40.2], [13, 46], [18.3, 46], [19, 46.8], [19, 91.6], [18.5, 92], [18.5, 92.8], [19, 93.2], [19, 101], [17.6, 102.5], [0, 102.5]]));
  b.add(M.black, disc(THREE, 3.2, 0, 102.53, 0), disc(THREE, 1.2, 0, 102.53, 9.5));
  b.into(B);

  // ---- C: blue wing handle
  const C = unit(-45.3, 36.3);
  b.add(M.ss_mp, blockGeo(THREE, 25, 30, 25, 0.9, 1.4));
  ports(12.5, 10, { neck: 4, thread: 10 });
  b.add(X_.engrave, T(arrowGeo(THREE, 13, 1.4, 4.4, 4.4), 0, 20, 12.52));
  b.add(M.ss_machined, sweep(THREE, (a) => [[6, 30], ...threadPts(a, 10, 0.7, 1.25, 30, 38), [6, 38], [6, 30]]));
  b.add(M.ss_ba, hexNut(THREE, 26, 31, 35, 0));
  b.add(M.ss_ba, sweep(THREE, [[0, 38], [9, 38], [9, 41.5], [8.3, 41.9], [8.3, 42.7], [9, 43.1], [9, 47], [8, 48], [0, 48]]));
  b.into(C);
  const hC = new THREE.Group(); C.add(hC);
  const wing = [], HL = 13, w = (x) => 4.2 + 2.6 * Math.pow(Math.abs(x) / HL, 1.5);
  for (let i = 0; i <= 20; i++) { const x = -HL + (2 * HL * i) / 20; wing.push([x, w(x)]); }
  for (let i = 1; i < 12; i++) { const a = 90 * D - (i / 12) * Math.PI; wing.push([HL + 6.8 * Math.cos(a), 6.8 * Math.sin(a)]); }
  for (let i = 0; i <= 20; i++) { const x = HL - (2 * HL * i) / 20; wing.push([x, -w(x)]); }
  for (let i = 1; i < 12; i++) { const a = -90 * D - (i / 12) * Math.PI; wing.push([-HL + 6.8 * Math.cos(a), 6.8 * Math.sin(a)]); }
  b.add(M.blue, extrudeY(THREE, wing, 48, 8.5, 1.8, 2, 0.5), sweep(THREE, [[0, 47], [7.5, 47], [7.5, 49], [0, 49]]));
  b.add(alu, sweep(THREE, [[0, 56.5], [4.6, 56.5], [4.6, 57], [0, 57]]));
  b.into(hC);

  settle(THREE, root, g);
  return {
    root,
    update(t) {
      hA.rotation.y = cyc(t, 7) * TAU * 0.75;
      hC.rotation.y = (cyc(t, 5) * Math.PI) / 2;
    },
  };
}

/* ------------------------------------------------------------------ 球閥 */
// Hero: block-body instrumentation ball valve, compression ends, red lever handle.
// Variant: 3-way valve with a green lever.
function buildBall(THREE, M) {
  const { root, g } = mkRoot(THREE), b = batcher(THREE);
  const R30 = 30 * D, AY = 13;
  const endGeos = () => [
    [M.ss_ba, sweep(THREE, (a) => [[4.85, 11.5], ...hexPts(a, 22, 11.5, 20, { rot: R30 }), ...threadPts(a, 7.9, 0.68, 1.27, 20, 25.5), [4.85, 25.5], [4.85, 11.5]])],
    [M.ss_ba, sweep(THREE, (a) => [[7.9, 22.6], ...hexPts(a, 19, 22.6, 36, { rot: R30 }), [4.9, 36], [4.9, 31], [7.9, 31], [7.9, 22.6]])],
    [M.rubber, T(norm(new THREE.CircleGeometry(4.9, 28).rotateX(-Math.PI / 2)), 0, 30, 0)],
  ];
  const lever = (mat) => {
    const pts = [], seg = (cx, cz, r, a0, a1) => { for (let i = 0; i <= 8; i++) { const a = (a0 + ((a1 - a0) * i) / 8) * D; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } };
    seg(52, -3.2, 3.8, -90, 0); seg(52, 3.2, 3.8, 0, 90); seg(-17, 4.6, 4.2, 90, 180); seg(-17, -4.6, 4.2, 180, 270);
    b.add(mat, extrudeY(THREE, pts, 41.5, 7, 1.6, 2, 0.5), sweep(THREE, [[0, 34], [8.6, 34], [8.6, 42.5], [0, 42.5]]));
    b.add(M.rubber, T(norm(new THREE.CircleGeometry(1.5, 16)), 0, 38, 8.63));
  };
  const valve = (x, z, ry, mat, third) => {
    const v = new THREE.Group(); v.position.set(x, 0, z); v.rotation.y = ry; g.add(v);
    b.add(M.ss_mp, blockGeo(THREE, 24, 26, 24, 0.8, 1.2));
    for (const dir of [1, -1]) for (const [m, ge] of endGeos()) b.add(m, X(ge, 0, AY, 0, dir));
    if (third) for (const [m, ge] of endGeos()) b.add(m, X(ge, 0, AY, 0, 1).rotateY(-Math.PI / 2));
    b.add(M.ss_machined, sweep(THREE, (a) => [[4.1, 26], ...threadPts(a, 8, 0.6, 1.25, 26, 33.5), [4.1, 33.5], [4.1, 26]]));
    b.add(M.ss_ba, hexNut(THREE, 22, 27.2, 31.4, 8));
    b.into(v);
    const h = new THREE.Group(); v.add(h);
    b.add(M.ss_ep, sweep(THREE, [[0, 30], [4, 30], [4, 35], [0, 35]]));
    lever(mat);
    b.into(h);
    return h;
  };
  const h1 = valve(-46, -12, 0.2, M.red, false), h2 = valve(44, 14, -0.5, M.green, true);
  settle(THREE, root, g);
  return {
    root,
    update(t) {
      const s = cyc(t, 6);
      h1.rotation.y = (s * Math.PI) / 2;
      h2.rotation.y = (-s * Math.PI) / 2;
    },
  };
}

/* ------------------------------------------------------------------ 逆止閥 */
// Hero: inline check valve, cylindrical body between two hexes, compression-nut ends.
// A window in the back of the body shows poppet, O-ring and spring; the poppet cycles.
// Variant: compact male-threaded check valve with a central hex.
function buildCheck(THREE, M) {
  const { root, g } = mkRoot(THREE), X_ = extraMats(THREE, M), b = batcher(THREE);
  const satin = new THREE.MeshStandardMaterial({ color: 0xcdd0d3, metalness: 1, roughness: 0.36 });
  const AY = 12.7, R30 = 30 * D, W0 = 325 * D, W1 = 565 * D;
  const left = (a) => [[5.2, -32], ...threadPts(a, 9.5, 0.8, 1.59, -32, -25), ...hexPts(a, 25.4, -25, -15, { rot: R30 }), [5.9, -15], [5.2, -15.9], [5.2, -32]];
  const right = (a) => [[5.2, 15], ...hexPts(a, 25.4, 15, 25, { rot: R30 }), ...threadPts(a, 9.5, 0.8, 1.59, 25, 32), [5.2, 32], [5.2, 15]];
  const nut = (a) => [[9.5, 27.6], ...hexPts(a, 23.8, 27.6, 45, { rot: R30 }), [6.45, 45], [6.45, 40], [9.5, 40], [9.5, 27.6]];
  const ring = [[9.5, -15], [12.5, -15], [12.5, 15], [9.5, 15], [9.5, -15]];
  b.add(M.ss_ba, X(sweep(THREE, left), 0, AY, 0), X(sweep(THREE, right), 0, AY, 0));
  b.add(M.ss_ba, X(sweep(THREE, nut), 0, AY, 0), X(sweep(THREE, nut), 0, AY, 0, -1));
  for (const dir of [1, -1]) b.add(M.rubber, X(T(norm(new THREE.CircleGeometry(6.45, 28).rotateX(-Math.PI / 2)), 0, 39, 0), 0, AY, 0, dir));
  b.add(satin, X(sweep(THREE, ring, { a0: W0, a1: W1 }), 0, AY, 0));
  for (const a of [W0, W1]) b.add(X_.cut, X(capGeo(THREE, ring, a), 0, AY, 0));
  // flow arrow wrapped on the cylinder (front) — shape only
  const ag = arrowGeo(THREE, 17, 1.6, 5.2, 5.5), ap = ag.attributes.position, an = ag.attributes.normal;
  for (let i = 0; i < ap.count; i++) {
    const a = 112 * D + ap.getY(i) / 12.5, x = ap.getX(i);
    ap.setXYZ(i, x, AY - 12.62 * Math.cos(a), 12.62 * Math.sin(a));
    an.setXYZ(i, 0, -Math.cos(a), Math.sin(a));
  }
  b.add(X_.engrave, ag);
  b.into(g);

  const pop = new THREE.Group(); pop.position.set(-15, AY, 0); g.add(pop);
  b.add(M.ss_ep, X(sweep(THREE, [[0, -2.4], [3.6, -2.4], [4.4, -1.4], [4.4, 1.4], [8.2, 1.4], [8.2, 6], [7.4, 7], [3.5, 7], [3.5, 15], [2.8, 16], [0, 16]]), 0, 0, 0));
  b.add(M.rubber, T(norm(new THREE.TorusGeometry(6.4, 1.1, 12, 48).rotateY(Math.PI / 2)), 1.1, 0, 0));
  b.into(pop);
  const SL = 15 - -8, turns = 6.5;
  class Helix extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const a = t * turns * TAU;
      return target.set(-SL * (0.03 + 0.94 * (t - (0.55 * Math.sin(TAU * t)) / TAU)), 6.3 * Math.cos(a), 6.3 * Math.sin(a));
    }
  }
  const spring = new THREE.Mesh(norm(new THREE.TubeGeometry(new Helix(), 156, 0.75, 8, false)), M.ss_ba);
  spring.position.set(15, AY, 0); g.add(spring);

  // ---- compact male-threaded variant
  const v = new THREE.Group(); v.position.set(6, 9.5, 36); v.rotation.y = -0.35; g.add(v);
  b.add(M.ss_ep, X(sweep(THREE, (a) => [[3.4, -20], [5.6, -20], ...threadPts(a, 6.85, 0.75, 1.41, -19.3, -9), [9.3, -9], [9.3, -5.2],
    ...hexPts(a, 19, -5, 5, { rot: R30 }), ...threadPts(a, 6.85, 0.75, 1.41, 5, 19.3), [5.6, 20], [3.4, 20], [3.4, -20]]), 0, 0, 0));
  b.into(v);

  const LIFT = 4.5;
  const set = (s) => { pop.position.x = -15 + LIFT * s; spring.scale.x = (SL - LIFT * s) / SL; };
  set(0);
  settle(THREE, root, g);
  return { root, update(t) { set(cyc(t, 4)); } };
}

export const items = [
  { id: "bellows_valve", title: "伸縮囊閥", build: buildBellows },
  { id: "diaphragm_valve", title: "隔膜閥", build: buildDiaphragm },
  { id: "ball_valve", title: "球閥", build: buildBall },
  { id: "check_valve", title: "逆止閥", build: buildCheck },
];

/* ------------------------------------------------------------------ single connectable units (line.html)
   Contract: unit(THREE, M) -> { group, len, back, top }. Millimetres, flow axis = +X through the origin,
   male face-seal port tips at x = -len/2 and x = +len/2. `items` above is untouched. */
const portGeo = (THREE, o) => sweep(THREE, (a) => [[2.3, 0], ...portPts(a, 0, o), [2.3, 0]], { segs: 40 });
function blockValveBody(THREE, M, b) {
  const o = { neck: 4.5, thread: 10 };
  b.add(M.ss_mp, T(blockGeo(THREE, 28, 26, 28, 0.9, 1.4), 0, -11, 0));
  for (const dir of [1, -1]) b.add(M.ss_ba, X(portGeo(THREE, o), dir * 14, 0, 0, dir));
  return 2 * (14 + portLen(o));
}
// Manual diaphragm valve: block body, bonnet nut, black lobed handle with a plain metal disc.
function unitDiaphragm(THREE, M) {
  const group = new THREE.Group(), b = batcher(THREE);
  const alu = new THREE.MeshStandardMaterial({ color: 0xd4d6d8, metalness: 0.85, roughness: 0.42 });
  const len = blockValveBody(THREE, M, b), y = -11;
  b.add(M.ss_machined, T(sweep(THREE, (a) => [[6, 26], ...threadPts(a, 10.4, 0.7, 1.25, 26, 30), [6, 30], [6, 26]], { segs: 40 }), 0, y, 0));
  b.add(M.ss_ba, T(hexNut(THREE, 24, 27.6, 36.6, 0), 0, y, 0), T(sweep(THREE, [[0, 36.6], [8.6, 36.6], [8.6, 41.5], [0, 41.5]], { segs: 32 }), 0, y, 0));
  b.into(group);
  const handle = new THREE.Group(); handle.position.y = y; group.add(handle);
  b.add(M.black, extrudeY(THREE, lobes(7, 23.5, 4.2, 1.15, 140), 41, 17, 2.6, 2, 0.5));
  b.add(alu, sweep(THREE, [[0, 58], [15.5, 58], [15.5, 58.7], [0, 58.7]], { segs: 40 }));
  b.into(handle);
  return { group, len, back: 14, top: 58.7 + y, handle };
}
// Pneumatic diaphragm valve: same block body, cylindrical actuator with a pilot-air port on top.
function unitPneumatic(THREE, M) {
  const group = new THREE.Group(), b = batcher(THREE);
  const len = blockValveBody(THREE, M, b), y = -11;
  b.add(M.ss_ba, T(hexNut(THREE, 30, 26, 33, 0, { f: 0.985 }), 0, y, 0));
  b.add(M.ss_ba, T(sweep(THREE, [[0, 33], [13, 33], [13, 38.8], [18.3, 38.8], [19, 39.6], [19, 84.4], [18.5, 84.8], [18.5, 85.6], [19, 86], [19, 93.8], [17.6, 95.3], [0, 95.3]], { segs: 56 }), 0, y, 0));
  b.add(M.black, disc(THREE, 3.2, 0, 95.33 + y, 0), disc(THREE, 1.2, 0, 95.33 + y, 9.5));
  b.into(group);
  return { group, len, back: 19, top: 95.3 + y };
}
// Bellows-sealed valve: slim barrel body, bonnet at 45 degrees, white lobed knob.
function unitBellows(THREE, M) {
  const group = new THREE.Group(), b = batcher(THREE);
  const satin = new THREE.MeshStandardMaterial({ color: 0xb6babf, metalness: 0.92, roughness: 0.52 });
  b.add(satin, X(sweep(THREE, [[2.3, -15], [7.6, -15], [9, -13.5], [9, 13.5], [7.6, 15], [2.3, 15]], { segs: 48 }), 0, 0, 0));
  for (const dir of [1, -1]) b.add(M.ss_ba, X(portGeo(THREE), dir * 15, 0, 0, dir));
  b.into(group);
  const sb = new THREE.Group(); sb.position.set(4, 0, 0); sb.rotation.z = Math.PI / 4; group.add(sb);
  b.add(satin, sweep(THREE, [[8.5, 0], [8.5, 21], [7, 21]], { segs: 40 }));
  b.add(M.ss_ba, hexNut(THREE, 19, 20, 28.5, 0), sweep(THREE, [[0, 28.5], [6.2, 28.5], [6.2, 34.6], [0, 34.6]], { segs: 32 }));
  b.into(sb);
  const knob = new THREE.Group(); sb.add(knob);
  b.add(M.white, extrudeY(THREE, lobes(8, 17.5, 1.8, 1.4, 140), 35, 14, 2.2, 2, 0.5));
  b.add(M.blue, sweep(THREE, [[0, 49], [10.5, 49], [10.5, 49.6], [0, 49.6]], { segs: 40 }));
  b.into(knob);
  return { group, len: 2 * (15 + portLen()), back: 14, top: 50, knob };
}
// Inline check valve: cylindrical body between two hexes, flow arrow on the front.
function unitCheck(THREE, M) {
  const group = new THREE.Group(), X_ = extraMats(THREE, M), b = batcher(THREE);
  const satin = new THREE.MeshStandardMaterial({ color: 0xcdd0d3, metalness: 1, roughness: 0.36 });
  const R30 = 30 * D, R = 12;
  const side = (a) => [[2.3, 12], ...hexPts(a, 22, 12, 20, { rot: R30 }), ...portPts(a, 20), [2.3, 20]];
  for (const dir of [1, -1]) b.add(M.ss_ba, X(sweep(THREE, side, { segs: 48 }), 0, 0, 0, dir));
  b.add(satin, X(sweep(THREE, [[8, -12], [R, -12], [R, 12], [8, 12]], { segs: 48 }), 0, 0, 0));
  const ag = arrowGeo(THREE, 14, 1.5, 4.8, 5), ap = ag.attributes.position, an = ag.attributes.normal;
  for (let i = 0; i < ap.count; i++) {
    const a = 90 * D + ap.getY(i) / R, x = ap.getX(i);
    ap.setXYZ(i, x, -(R + 0.08) * Math.cos(a), (R + 0.08) * Math.sin(a));
    an.setXYZ(i, 0, -Math.cos(a), Math.sin(a));
  }
  b.add(X_.engrave, ag);
  b.into(group);
  return { group, len: 2 * (20 + portLen()), back: 12.7, top: 12.7 };
}
// Block-body ball valve with 1/4" tube-fitting ends and a red lever. Tube enters to x = +-len/2.
function unitBall(THREE, M) {
  const group = new THREE.Group(), b = batcher(THREE), R30 = 30 * D, y = -13;
  b.add(M.ss_mp, T(blockGeo(THREE, 24, 26, 24, 0.8, 1.2), 0, y, 0));
  for (const dir of [1, -1]) {
    b.add(M.ss_ba, X(sweep(THREE, (a) => [[3.3, 11.5], ...hexPts(a, 19, 11.5, 19, { rot: R30 }), ...threadPts(a, 6.9, 0.6, 1.27, 19, 24.5), [3.3, 24.5], [3.3, 11.5]], { segs: 40 }), 0, 0, 0, dir));
    b.add(M.ss_ba, X(sweep(THREE, (a) => [[6.9, 21.6], ...hexPts(a, 16, 21.6, 34, { rot: R30 }), [3.3, 34], [3.3, 30], [6.9, 30], [6.9, 21.6]], { segs: 36 }), 0, 0, 0, dir));
  }
  b.add(M.ss_machined, T(sweep(THREE, (a) => [[4.1, 26], ...threadPts(a, 8, 0.6, 1.25, 26, 33.5), [4.1, 33.5], [4.1, 26]], { segs: 36 }), 0, y, 0));
  b.add(M.ss_ba, T(hexNut(THREE, 22, 27.2, 31.4, 8), 0, y, 0));
  b.into(group);
  const handle = new THREE.Group(); handle.position.y = y; group.add(handle);
  const pts = [], seg = (cx, cz, r, a0, a1) => { for (let i = 0; i <= 8; i++) { const a = (a0 + ((a1 - a0) * i) / 8) * D; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } };
  seg(52, -3.2, 3.8, -90, 0); seg(52, 3.2, 3.8, 0, 90); seg(-17, 4.6, 4.2, 90, 180); seg(-17, -4.6, 4.2, 180, 270);
  b.add(M.ss_ep, sweep(THREE, [[0, 30], [4, 30], [4, 35], [0, 35]], { segs: 24 }));
  b.add(M.red, extrudeY(THREE, pts, 41.5, 7, 1.6, 2, 0.5), sweep(THREE, [[0, 34], [8.6, 34], [8.6, 42.5], [0, 42.5]], { segs: 32 }));
  b.into(handle);
  return { group, len: 68, back: 12, top: 48.5 + y, handle };
}
export const lineUnits = { diaphragm: unitDiaphragm, pneumatic: unitPneumatic, bellows: unitBellows, check: unitCheck, ball: unitBall };
