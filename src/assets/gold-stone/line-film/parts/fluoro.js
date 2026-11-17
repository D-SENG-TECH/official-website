// 氟素樹脂管材與管件 — procedural models. All modelling is done in millimetres inside a
// group scaled by 0.001, so the returned root is in metres at true scale.
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const TAU = Math.PI * 2;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function kit(THREE) {
  const Y = new THREE.Vector3(0, 1, 0);

  // Surface of revolution about +Y. pts: [r, y, w] rows, listed counter-clockwise in the
  // (r, y) plane (up the outside, down the inside). null = break (hard edge / new strip).
  // mod(theta, y, r, w) may reshape the radius for rows with w != 0 (ribs, flats, threads).
  function revolve(pts, segs, mod) {
    const pos = [], idx = [];
    let row = 0, prev = -1;
    for (const p of pts) {
      if (!p) { prev = -1; continue; }
      const r = p[0], y = p[1], w = p[2] || 0;
      for (let j = 0; j < segs; j++) {
        const th = (j / segs) * TAU;
        const rr = mod && w ? mod(th, y, r, w) : r;
        pos.push(rr * Math.cos(th), y, rr * Math.sin(th));
      }
      if (prev >= 0) for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs;
        const a = prev * segs + j, b = prev * segs + j1, c = row * segs + j, d = row * segs + j1;
        idx.push(a, c, b, b, c, d);
      }
      prev = row++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
  // Re-aim a +Y-built geometry along dir, starting at origin o.
  function orient(g, o, dir) {
    _q.setFromUnitVectors(Y, _v.set(dir[0], dir[1], dir[2]).normalize());
    g.applyQuaternion(_q);
    g.translate(o[0], o[1], o[2]);
    return g;
  }
  function merge(list) {
    const out = list.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
      return n;
    });
    return mergeGeometries(out, false);
  }
  function finish(root, g) {
    g.scale.setScalar(0.001);
    root.add(g);
    const box = new THREE.Box3().setFromObject(root);
    g.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    return root;
  }

  // ---------- flare connection (1/2" tube: 12.7 OD x 9.53 ID) ----------
  const RO = 6.35, RI = 4.76;        // tube
  const RB = 10.6;                    // body neck radius
  const RT = 9.4, LT = 13, PITCH = 3; // male thread
  const RN = 7.3;                     // nose the flared tube sits on
  const NUT_R = 13, NUT_BORE = 10.2, NUT_L = 27, NUT_HOLE = 6.75;
  const ribMod = (n, depth) => (th, y, r, w) => r - w * depth * sstep(0.25, 0.75, 0.5 + 0.5 * Math.cos(n * th));
  const threadMod = (pitch, amp) => (th, y, r, w) => r + w * amp * Math.sin((y / pitch) * TAU + th);
  const hexMod = (th, y, r, w) => Math.min(r, w / Math.cos((((th % (TAU / 6)) + TAU / 6) % (TAU / 6)) - TAU / 12));

  // Long cylindrical nut with fine shallow flutes, plain band at the body side, chamfered far end.
  function nutGeometry(full) {
    const R = NUT_R, L = NUT_L, B = NUT_BORE, H = NUT_HOLE;
    const p = [
      [R - 1.0, 0], [R - 0.3, 0.4], [R, 1.1], [R, 3.0, 0.3], [R, 4.4, 1],
      [R, L - 4.0, 1], [R - 0.9, L - 1.5, 0.6], [R - 2.2, L - 0.3], [R - 3.0, L],
      [H + 0.7, L], [H, L - 0.6], [H, L - 2.5], [B, L - 6.5],
    ];
    if (full) { p.unshift([B, 0]); p.push([B, 0]); } else p.unshift([RT + 0.3, 0]);
    return revolve(p, 72, ribMod(18, 0.75));
  }

  // Male port. Axis-local: y = 0 at the body centre/face, neck long. helix = real thread.
  function portBody(neck, helix) {
    const pts = [[RB, 0], [RB, neck - 1.0], [RB - 0.4, neck - 0.3], [RT + 0.4, neck]];
    const y0 = neck + 0.3, y1 = neck + LT;
    if (helix) {
      const n = Math.round((y1 - y0) / 0.42);
      for (let i = 0; i <= n; i++) {
        const y = y0 + ((y1 - y0) * i) / n;
        pts.push([RT, y, Math.max(0.001, Math.min(1, i / 3, (n - i) / 3))]);
      }
    } else pts.push([RT, y0], [RT, y1]);
    const a = y1 + 0.5;
    pts.push([RN + 0.6, a], [RN, a + 0.5], [RN, a + 7.5], [RN - 1.7, a + 11], [RI, a + 11], [RI, a + 3], [0, a + 3]);
    return revolve(pts, helix ? 40 : 20, helix ? threadMod(PITCH, 0.5) : null);
  }
  function flaredTube(neck, len) {
    const a = neck + LT + 1.0, f = RN + 0.1, t = RO - RI;
    return revolve([
      [f, a], [f + t, a], [f + t, a + 7.2], [RO, a + 11.2], [RO, a + len], null,
      [RO, a + len], [RI, a + len], null,
      [RI, a + len], [RI, a + 11.2], [f, a + 7.2], [f, a],
    ], 36);
  }
  const NUT_SEAT = 1.5; // nut face position past the neck when tightened

  // Adds a port to the geometry lists F. opt.len > 0 adds a flared tube stub.
  function port(F, o, dir, neck, opt = {}) {
    F.solid.push(orient(portBody(neck, opt.helix), o, dir));
    if (opt.len) F.tube.push(orient(flaredTube(neck, opt.len), o, dir));
    if (!opt.loose) {
      const n = F.nutGeo.clone();
      n.rotateY(opt.spin ?? 0); n.translate(0, neck + NUT_SEAT, 0);
      F.nut.push(orient(n, o, dir));
    }
  }
  const lists = () => ({ solid: [], tube: [], nut: [], nutGeo: nutGeometry(false) });
  function emit(F, mats, parent, matrix) {
    for (const k of ["solid", "tube", "nut"]) {
      if (!F[k].length) continue;
      const g = merge(F[k]);
      if (matrix) g.applyMatrix4(matrix);
      const m = new THREE.Mesh(g, mats[k]);
      if (k === "tube") m.renderOrder = 1;
      parent.add(m);
    }
  }
  // Rounded box sitting on y (bottom), centred on x/z.
  function box(w, h, d, r, x, y, z, seg = 3) {
    const b = new RoundedBoxGeometry(w, h, d, seg, r); b.translate(x, y + h / 2, z); return b;
  }

  return { revolve, orient, merge, finish, port, lists, emit, box, nutGeometry, ribMod, threadMod, hexMod, Y,
    RO, RI, RB, RT, NUT_R, NUT_L, NUT_SEAT, PITCH };
}

// Shared look: ivory moulded PFA nuts, milky slightly see-through bodies, clear-ish tube.
function looks(THREE, M) {
  const ivory = M.pfa_solid.clone(); ivory.color.set(0xe6d4a6); ivory.roughness = 0.5; ivory.clearcoat = 0.15;
  const milk = M.pfa_solid.clone(); milk.color.set(0xe6e7df); milk.roughness = 0.32;
  milk.transmission = 0.3; milk.thickness = 8; milk.ior = 1.35;
  const white = M.pfa_solid.clone(); white.color.set(0xe7e9e6);
  const tube = M.pfa.clone(); tube.color.set(0xcfe3f0); tube.thickness = 0; tube.roughness = 0.16;
  tube.transmission = 0.8; tube.clearcoat = 1; tube.clearcoatRoughness = 0.08; tube.opacity = 1; tube.transparent = false;
  const natural = M.pfa_solid.clone(); natural.color.set(0xe4d9b8); natural.roughness = 0.4; natural.clearcoat = 0;
  natural.transmission = 0.6; natural.thickness = 14; natural.ior = 1.35;
  return { ivory, milk, white, tube, natural };
}

// ======================================================================================
// 1. Tubing — loose curved lengths fanned out, a loose loop, plus black conductive tubes
// ======================================================================================
function buildTube(THREE, M) {
  const K = kit(THREE), L = looks(THREE, M);
  const root = new THREE.Group(), g = new THREE.Group();
  const blackMat = M.black.clone(); blackMat.color.set(0x23262c); blackMat.roughness = 0.28;

  // Flat curve on the ground: radius R0 growing by `grow` per turn (0 = plain arc).
  class Lay extends THREE.Curve {
    constructor(cx, cz, R0, a0, a1, y, grow = 0, wob = 0) { super(); Object.assign(this, { cx, cz, R0, a0, a1, y, grow, wob }); }
    getPoint(u, t = new THREE.Vector3()) {
      const a = this.a0 + (this.a1 - this.a0) * u, da = a - this.a0;
      const r = this.R0 + (this.grow * da) / TAU + this.wob * Math.sin(da * 1.7 + this.R0);
      return t.set(this.cx + r * Math.cos(a), this.y, this.cz + r * Math.sin(a));
    }
  }
  const clear = [], black = [];
  const D = Math.PI / 180;
  function lay(list, hollow, od, id, cx, cz, R0, a0, a1, grow = 0, wob = 0) {
    const c = new Lay(cx, cz, R0, a0 * D, a1 * D, od / 2, grow, wob);
    const len = Math.abs(a1 - a0) * D * R0;
    const segs = Math.max(24, Math.round(len / 9)), rad = od > 15 ? 16 : od > 8 ? 12 : 8;
    list.push(new THREE.TubeGeometry(c, segs, od / 2, rad, false));
    for (const u of [0, 1]) {
      const p = c.getPoint(u), t = c.getTangent(u).multiplyScalar(u ? 1 : -1);
      const ro = od / 2, ri = id / 2;
      const dp = hollow ? Math.min(16, od * 1.3) : 12;
      const cap = K.revolve([[ro, -0.2], [ro - 0.15, 0], [ri, 0], null, [ri, 0], [ri, -dp], hollow ? [ri, -dp] : [0, -dp]], rad * 2);
      list.push(K.orient(cap, [p.x, p.y, p.z], [t.x, t.y, t.z]));
    }
  }
  const C = [0, 0];
  // translucent fan: 1", 3/4", 1/2", 3/8", 1/4", 1/8" — cut ends staggered at the front
  lay(clear, true, 25.4, 22.2, ...C, 400, 158, 236);
  lay(clear, true, 19.05, 15.9, ...C, 364, 163, 238);
  lay(clear, true, 12.7, 9.53, ...C, 334, 169, 241);
  lay(clear, true, 9.53, 6.35, ...C, 308, 174, 243);
  lay(clear, true, 6.35, 3.95, ...C, 286, 180, 246);
  lay(clear, true, 3.18, 1.59, ...C, 268, 184, 248);
  // loose loop of 3/8" (2.3 turns, lying side by side)
  lay(clear, true, 9.53, 6.35, 5, -20, 150, 100, 100 + 830, 12.5, 1.2);
  // black conductive tubes: fan on the other side + a small loop inside
  lay(black, false, 9.53, 6.35, ...C, 262, 16, -62);
  lay(black, false, 6.35, 3.95, ...C, 284, 11, -66);
  lay(black, false, 6.35, 3.95, ...C, 303, 7, -64);
  lay(black, false, 3.18, 1.59, ...C, 319, 3, -69);
  lay(black, false, 6.35, 3.95, 5, -20, 92, 250, 250 + 800, 8.2, 0.8);

  const cm = new THREE.Mesh(K.merge(clear), L.tube); cm.renderOrder = 1; g.add(cm);
  g.add(new THREE.Mesh(K.merge(black), blackMat));
  K.finish(root, g);
  return { root };
}

// ======================================================================================
// 2. Flare fittings — tee, union, two elbows, male connector (as loose parts), plus one
//    union shown on tube with a nut backed off to explain the flare joint
// ======================================================================================
function buildFittings(THREE, M) {
  const K = kit(THREE), L = looks(THREE, M);
  const root = new THREE.Group(), g = new THREE.Group();
  const mats = { solid: L.milk, tube: L.tube, nut: L.ivory };
  const R = K.NUT_R, neck = 15, LEG = neck + K.NUT_SEAT + K.NUT_L;
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
  const xf = (x, y, z, ry = 0, rx = 0, rz = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s);
  const ball = () => new THREE.SphereGeometry(K.RB, 20, 12);

  // --- tee, lying flat, branch toward the viewer
  const T = K.lists();
  K.port(T, [0, 0, 0], [1, 0, 0], neck, { spin: 0.25 });
  K.port(T, [0, 0, 0], [-1, 0, 0], neck, { spin: 0.05 });
  K.port(T, [0, 0, 0], [0, 0, 1], neck, { spin: 0.4 });
  K.emit(T, mats, g, xf(-62, R, -42, 0.18));

  // --- union, standing on one nut: nut | hex flange | groove | ring | nut
  const U = K.lists(), nu = 10.5;
  U.solid.push(K.revolve([
    [K.RB, -nu], [K.RB, -8.6], [12.6, -8], [13.2, -7.2], [13.2, -3.2], [12.4, -2.4], [9, -2], [9, 1.6],
    [12.6, 2, 13.3], [15.3, 2.8, 13.3], [15.3, 7.2, 13.3], [12.6, 8, 13.3], [K.RB, 8.6], [K.RB, nu],
  ], 48, K.hexMod));
  K.port(U, [0, 0, 0], [0, 1, 0], nu, { spin: 0.3 });
  K.port(U, [0, 0, 0], [0, -1, 0], nu, {});
  K.emit(U, mats, g, xf(22, nu + K.NUT_SEAT + K.NUT_L, -58, 0.4));

  // --- elbow, standing on one nut
  const E1 = K.lists();
  E1.solid.push(ball());
  K.port(E1, [0, 0, 0], [0, -1, 0], neck, {});
  K.port(E1, [0, 0, 0], [1, 0, 0], neck, { spin: 0.2 });
  K.emit(E1, mats, g, xf(88, LEG, -30, 0.5));

  // --- elbow, lying flat
  const E2 = K.lists();
  E2.solid.push(ball());
  K.port(E2, [0, 0, 0], [1, 0, 0], neck, { spin: 0.1 });
  K.port(E2, [0, 0, 0], [0, 0, 1], neck, { spin: 0.3 });
  K.emit(E2, mats, g, xf(-78, R, 40, 0.95));

  // --- male connector, standing on its pipe thread
  const C = K.lists(), tl = 15;
  const tp = [[7.4, 0], [9.2, 0], [9.9, 0.8]];
  for (let i = 0; i <= 30; i++) tp.push([9.9 + i * 0.022, 1 + (i * (tl - 2.4)) / 30, Math.max(0.001, Math.min(1, i / 3, (30 - i) / 3))]);
  tp.push([10.4, tl - 1], [10.4, tl]);
  C.solid.push(K.revolve(tp, 40, K.threadMod(1.8, 0.42)));
  C.solid.push(K.revolve([
    [10.4, tl], [12.6, tl, 13.3], [15.3, tl + 0.8, 13.3], [15.3, tl + 6.2, 13.3], [12.6, tl + 7, 13.3], [K.RB, tl + 7],
  ], 48, K.hexMod));
  K.port(C, [0, tl + 7, 0], [0, 1, 0], 2.2, { spin: 0.2 });
  K.emit(C, mats, g, xf(22, 0, 22, 0.2));

  // --- union on tube, one nut backed off (animated)
  const X = K.lists(), xm = xf(45, R, 96, 0.12);
  X.solid.push(K.orient(K.revolve([
    [K.RB, -7], [12.6, -7, 13.3], [15.3, -6.2, 13.3], [15.3, 6.2, 13.3], [12.6, 7, 13.3], [K.RB, 7],
  ], 48, K.hexMod), [0, 0, 0], [1, 0, 0]));
  K.port(X, [0, 0, 0], [-1, 0, 0], nu, { spin: 0.2, len: 62 });
  K.port(X, [0, 0, 0], [1, 0, 0], nu, { helix: true, loose: true, len: 78 });
  K.emit(X, mats, g, xm);
  const xGroup = new THREE.Group(); xGroup.applyMatrix4(xm); g.add(xGroup);
  const axis = new THREE.Group(); axis.rotation.z = -Math.PI / 2; xGroup.add(axis); // +Y -> +X
  const nut = new THREE.Mesh(K.nutGeometry(true), mats.nut); axis.add(nut);

  K.finish(root, g);
  const TRAVEL = 21;
  function update(t) {
    const p = (t % 12) / 12;
    const s = sstep(0.12, 0.88, 0.5 + 0.5 * Math.cos(p * TAU)); // 1 = backed off (t = 0)
    nut.position.y = nu + K.NUT_SEAT + s * TRAVEL;
    nut.rotation.y = ((s * TRAVEL) / K.PITCH) * TAU;
  }
  update(0);
  return { root, update };
}

// ======================================================================================
// 3. Valves — manual diaphragm valves (round ribbed knob) and compact pneumatic valves
// ======================================================================================
function buildValve(THREE, M) {
  const K = kit(THREE), L = looks(THREE, M);
  const root = new THREE.Group(), g = new THREE.Group();
  const mats = { solid: L.white, tube: L.tube, nut: L.white };
  const red = M.red;
  const add = (parent, list, mat, order) => { const m = new THREE.Mesh(K.merge(list), mat); if (order) m.renderOrder = order; parent.add(m); return m; };
  const spigot = (r1, l1, L2) => K.revolve([
    [r1, 0], [r1, l1], [r1 - 0.5, l1 + 1.4], [K.RO + 0.3, l1 + 2.6], [K.RO, l1 + 3.6], [K.RO, L2 - 0.4], [K.RO - 0.4, L2],
    [K.RI + 0.3, L2], [K.RI, L2 - 0.3], [K.RI, L2 - 14], [0, L2 - 14],
  ], 28);

  // ---- manual valve A: inline spigot ports, conical body, union ring, wide ribbed knob
  const A = new THREE.Group(); A.position.set(-78, 0, 62); A.rotation.y = 0.12; g.add(A);
  {
    const s = [], AY = 22;
    const sh = new THREE.Shape(), w = 12, d = 25, r = 5;
    sh.moveTo(-w + r, -d); sh.lineTo(w - r, -d); sh.absarc(w - r, -d + r, r, -Math.PI / 2, 0, false);
    sh.lineTo(w, d - r); sh.absarc(w - r, d - r, r, 0, Math.PI / 2, false);
    sh.lineTo(-w + r, d); sh.absarc(-w + r, d - r, r, Math.PI / 2, Math.PI, false);
    sh.lineTo(-w, -d + r); sh.absarc(-w + r, -d + r, r, Math.PI, Math.PI * 1.5, false);
    for (const z of [-18.5, 18.5]) { const h = new THREE.Path(); h.absarc(0, z, 2.7, 0, TAU, true); sh.holes.push(h); }
    const base = new THREE.ExtrudeGeometry(sh, { depth: 2.8, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 2, curveSegments: 5 });
    base.rotateX(-Math.PI / 2); base.translate(0, 0.5, 0); s.push(base);
    s.push(K.box(13, 12, 20, 3, 0, 3, 0, 2));
    for (const sx of [-1, 1]) s.push(K.orient(spigot(8.8, 27, 57), [0, AY, 0], [sx, 0, 0]));
    s.push(K.revolve([
      [0, 11.5], [9, 11.5], [12.5, 13.5], [14.5, 20], [16.5, 30], [24.5, 41], [25.6, 42.4], [27.6, 43, 0.3], [27.6, 44, 1], [27.6, 48, 1],
      [27.2, 49, 0.3], [25, 49.8], [24.3, 50.8], [24.3, 63.5], [23.2, 65.6], [15, 66.6], [14.4, 67.2], [14.4, 72], [0, 72],
    ], 96, K.ribMod(32, 0.8)));
    add(A, s, L.white);
  }
  const knobA = new THREE.Group(); knobA.position.y = 68.5; A.add(knobA);
  knobA.add(new THREE.Mesh(K.revolve([
    [12, 0], [27, 0], [29.2, 1, 0.5], [30, 2.8, 1], [30, 12.2, 1], [29.2, 14.2, 0.6], [26.5, 15.6], [22.6, 15.9], [21.6, 16.8],
    [10, 17.4], [5.4, 17.4], [5, 17], [5, 14], [0, 14],
  ], 128, K.ribMod(32, 1.0)), L.ivory));
  const pinGeo = K.revolve([[4.4, 0], [4.4, 4.4], [3.6, 5.1], [0, 5.3]], 20);
  const pinA = new THREE.Mesh(pinGeo, red); knobA.add(pinA);

  // ---- manual valve B: square body, flare-nut ports on tube, cylindrical ribbed cap
  const B = new THREE.Group(); B.position.set(72, 0, 66); B.rotation.y = -0.1; g.add(B);
  {
    const F = K.lists(), AY = 20.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.solid.push(K.box(9, 4, 9, 1.5, sx * 14, 0, sz * 14, 1));
    F.solid.push(K.box(42, 34, 40, 4, 0, 3, 0));
    F.solid.push(K.revolve([[22, 36.5], [24.4, 37], [24.4, 40.2], [23.6, 41], [21, 41.4]], 48));
    K.port(F, [-21, AY, 0], [-1, 0, 0], 3.5, { len: 46, spin: 0.15 });
    K.port(F, [21, AY, 0], [1, 0, 0], 3.5, { len: 46, spin: 0.4 });
    K.emit(F, mats, B);
  }
  const knobB = new THREE.Group(); knobB.position.y = 41; B.add(knobB);
  knobB.add(new THREE.Mesh(K.revolve([
    [18, 0], [22.4, 0], [23, 0.8, 0.5], [23, 2, 1], [23, 19.5, 1], [22.2, 21.6, 0.5], [20.4, 22.6], [9, 23], [4.4, 23], [4, 22.6], [4, 20], [0, 20],
  ], 120, K.ribMod(40, 0.55)), L.white));
  const pinB = new THREE.Mesh(pinGeo, red); pinB.scale.setScalar(0.8); knobB.add(pinB);

  // ---- compact pneumatic valves: translucent base plate, white body with round ports,
  //      translucent natural actuator block, small cylindrical cap on top
  const whites = [], naturals = [], caps = [];
  const boss = (rb, l, rh) => K.revolve([
    [rb, 0], [rb, l - 3.2], [rb - 0.9, l - 1], [rb - 2.6, l], [rh + 0.6, l], [rh, l - 0.6], [rh, l - 10], [0, l - 10],
  ], 32);
  const thin = (l) => K.revolve([
    [7, 0], [7, 2.4], [6.6, 3], [K.RO, 3.6], [K.RO, l - 0.4], [K.RO - 0.4, l], [K.RI + 0.3, l], [K.RI, l - 0.3], [K.RI, l - 10], [0, l - 10],
  ], 24);
  function pneu(x, z, w, d, hB, hA, n, style, capR) {
    const W = w * n, y1 = 4.5, y2 = y1 + hB, y3 = y2 + hA, AY = y1 + hB * 0.5;
    naturals.push(K.box(W, 4.5, d, 1.2, x, 0, z, 1));
    whites.push(K.box(W, hB, d, 2.2, x, y1, z, 2));
    naturals.push(K.box(W, hA, d, 2.2, x, y2, z, 2));
    const pr = Math.min(hB * 0.42, d * 0.4);
    const portGeo = () => (style === "thin" ? thin(17) : boss(pr, pr * 0.95, pr * 0.5));
    for (const sx of n > 1 ? [1] : [-1, 1]) whites.push(K.orient(portGeo(), [x + sx * (W / 2 - 0.5), AY, z], [sx, 0, 0]));
    for (let i = 0; i < n; i++) {
      const cx = x - W / 2 + w * (i + 0.5);
      if (n > 1) whites.push(K.orient(boss(pr, pr * 0.95, pr * 0.5), [cx, AY, z + d / 2 - 0.5], [0, 0, 1]));
      // piston seen through the actuator block
      const pist = K.revolve([[0, 1], [w * 0.3, 1], [w * 0.3, hA * 0.5], [w * 0.12, hA * 0.52], [w * 0.12, hA - 1.5], [0, hA - 1.5]], 24);
      pist.translate(cx, y2, z); whites.push(pist);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const sc = K.revolve([[1.9, 0], [1.9, 0.7], [1.4, 1.1], [0, 1.2]], 10);
        sc.translate(cx + sx * (w / 2 - 3.6), y3 - 0.1, z + sz * (d / 2 - 3.6)); whites.push(sc);
      }
      const r1 = capR, cap = K.revolve([
        [r1, 0], [r1, capR * 0.75], [r1 - 0.6, capR * 0.75 + 0.6], [r1 * 0.68, capR * 0.75 + 0.7],
        [r1 * 0.68, capR * 1.5], [r1 * 0.68 - 0.6, capR * 1.5 + 0.6], [r1 * 0.3, capR * 1.5 + 0.6], [r1 * 0.3, capR * 1.5 - 2], [0, capR * 1.5 - 2],
      ], 28);
      cap.translate(cx, y3, z); caps.push(cap);
    }
  }
  pneu(-84, -52, 31, 36, 30, 30, 3, "boss", 5.2);   // 3-station manifold
  pneu(18, -56, 40, 40, 36, 44, 1, "boss", 8.5);    // large single
  pneu(86, -50, 28, 28, 26, 34, 1, "boss", 6.2);    // medium, round ports
  pneu(140, -6, 26, 26, 24, 30, 1, "thin", 6);      // small, tube-stub ports
  add(g, whites, L.white);
  add(g, naturals, L.natural, 2);
  const capMesh = add(g, caps, L.white);

  K.finish(root, g);
  function update(t) {
    const p = (t % 10) / 10;
    const open = sstep(0.1, 0.9, 0.5 - 0.5 * Math.cos(p * TAU)); // 0 closed, 1 open
    knobA.rotation.y = open * TAU * 1.25; knobA.position.y = 68.5 + open * 3;
    pinA.position.y = 12.6 + open * 3.2;
    knobB.rotation.y = open * TAU * 1.25; knobB.position.y = 41 + open * 2.5;
    pinB.position.y = 19.2 + open * 2.4;
    capMesh.position.y = sstep(0.42, 0.58, open) * 2.2;
  }
  update(0);
  return { root, update };
}

export const items = [
  { id: "fluoro_tube", title: "氟素樹脂管（PFA／FEP／NE）", build: buildTube },
  { id: "pfa_fittings", title: "PFA 管件", build: buildFittings },
  { id: "pfa_valve", title: "PFA 閥件", build: buildValve },
];

/* ---------------------------------------------------------------- single connectable units for the assembled line (line.html)
   Millimetres. Fittings are centred on the origin; every port carries a flared tube stub of the requested length,
   so two facing ports are joined by making their stubs meet. `reach` = distance from the unit centre to where the
   tube leaves the nut-side flare (stub length is measured from there). Materials here avoid transmission so the
   assembled scene needs no extra render pass. `items` above is untouched. */
export function lineFluoro(THREE, M) {
  const K = kit(THREE), std = (o) => new THREE.MeshStandardMaterial(o);
  const mats = {
    solid: std({ color: 0xe9eae4, roughness: 0.38 }), nut: std({ color: 0xe3cf9c, roughness: 0.5 }), white: std({ color: 0xeceeeb, roughness: 0.4 }),
    natural: std({ color: 0xe5d9b6, roughness: 0.42 }), black: std({ color: 0x23262c, roughness: 0.3 }),
    tube: new THREE.MeshPhysicalMaterial({ color: 0xc9dfee, roughness: 0.15, transparent: true, opacity: 0.62, clearcoat: 1, clearcoatRoughness: 0.1 }),
  };
  const add = (parent, list, mat) => { if (list.length) parent.add(new THREE.Mesh(K.merge(list), mat)); };
  // ports: [{ dir, len, black }]
  function ports(group, F, origin, neck, list, m = { solid: mats.solid, nut: mats.nut }) {
    const black = [];
    list.forEach((p, i) => {
      const o = origin(p.dir);
      if (p.black) { const F2 = K.lists(); K.port(F2, o, p.dir, neck, { len: p.len, loose: true }); black.push(...F2.tube); K.port(F, o, p.dir, neck, { spin: 0.2 * i }); }
      else K.port(F, o, p.dir, neck, { len: p.len, spin: 0.2 * i });
    });
    add(group, F.solid, m.solid); add(group, F.nut, m.nut); add(group, black, mats.black);
    if (F.tube.length) { const t = new THREE.Mesh(K.merge(F.tube), mats.tube); t.renderOrder = 1; group.add(t); }
  }
  const centre = () => [0, 0, 0];
  function union(lenA, lenB) {
    const group = new THREE.Group(), F = K.lists(), neck = 10.5;
    F.solid.push(K.orient(K.revolve([[K.RB, -7], [12.6, -7, 13.3], [15.3, -6.2, 13.3], [15.3, 6.2, 13.3], [12.6, 7, 13.3], [K.RB, 7]], 48, K.hexMod), [0, 0, 0], [1, 0, 0]));
    ports(group, F, centre, neck, [{ dir: [-1, 0, 0], len: lenA }, { dir: [1, 0, 0], len: lenB }]);
    return { group, reach: neck + 14 };
  }
  function elbow(list) {
    const group = new THREE.Group(), F = K.lists();
    F.solid.push(new THREE.SphereGeometry(K.RB, 20, 12));
    ports(group, F, centre, 15, list);
    return { group, reach: 29 };
  }
  function tee(list) {
    const group = new THREE.Group(), F = K.lists();
    ports(group, F, centre, 15, list);
    return { group, reach: 29 };
  }
  // Square-body valves with flare ports on +-X; port axis through the origin, feet 20.5 below it.
  function valveBody(group, lenA, lenB) {
    const F = K.lists(), y = -20.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.solid.push(K.box(9, 4, 9, 1.5, sx * 14, y, sz * 14, 1));
    F.solid.push(K.box(42, 34, 40, 4, 0, y + 3, 0));
    ports(group, F, (d) => [d[0] * 21, 0, 0], 3.5, [{ dir: [-1, 0, 0], len: lenA }, { dir: [1, 0, 0], len: lenB }], { solid: mats.white, nut: mats.white });
    return y;
  }
  function manualValve(lenA, lenB) {
    const group = new THREE.Group(), y = valveBody(group, lenA, lenB);
    const ring = K.revolve([[22, 36.5], [24.4, 37], [24.4, 40.2], [23.6, 41], [21, 41.4]], 48); ring.translate(0, y, 0);
    const knob = K.revolve([[18, 0], [22.4, 0], [23, 0.8, 0.5], [23, 2, 1], [23, 19.5, 1], [22.2, 21.6, 0.5], [20.4, 22.6], [9, 23], [4.4, 23], [4, 22.6], [4, 20], [0, 20]], 96, K.ribMod(40, 0.55)); knob.translate(0, y + 41, 0);
    add(group, [ring, knob], mats.white);
    const pin = K.revolve([[3.5, 0], [3.5, 3.5], [2.9, 4.1], [0, 4.2]], 20); pin.translate(0, y + 60.2, 0);
    add(group, [pin], M.red);
    return { group, reach: 38.5, base: -y, top: 64 + y };
  }
  function pneumaticValve(lenA, lenB) {
    const group = new THREE.Group(), y = valveBody(group, lenA, lenB);
    add(group, [K.box(42, 38, 40, 3, 0, y + 37.2, 0)], mats.natural);
    const cap = K.revolve([[8.5, 0], [8.5, 6.4], [7.9, 7], [5.8, 7.1], [5.8, 12.8], [5.2, 13.4], [2.6, 13.4], [2.6, 11], [0, 11]], 28); cap.translate(0, y + 75.2, 0);
    const screws = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const s = K.revolve([[1.9, 0], [1.9, 0.7], [1.4, 1.1], [0, 1.2]], 10); s.translate(sx * 16, y + 75.1, sz * 15); screws.push(s); }
    add(group, [cap, ...screws], mats.white);
    return { group, reach: 38.5, base: -y, top: 88.6 + y };
  }
  return { mats, union, elbow, tee, manualValve, pneumaticValve, RO: K.RO };
}
