// Hero scene: one vision-guided robot arm, two jobs (18 s loop).
//   A  0.0–8.7 s   saddle welds: three branch nozzles onto a header pipe (Blender look-dev port)
//   ↔  8.7–10.0 s  the header fixture shuttles out (−X) while a turning-roll positioner carrying two
//                  butted stainless exhaust-duct sections shuttles in (+X → 0); the camera sweeps wide
//   B  10.0–17.0 s circumferential duct weld: approach, laser-stripe seam scan, the duct turns one
//                  revolution under a fixed torch, bead cools from orange-white to blue-grey heat tint
//   ↔  17.0–18.0 s the duct shuttles out and a fresh header shuttles in → frame 18 s == frame 0
//
// Assets: models/welding.glb (arm joint chain K1..K6, rest = identity; workpiece wp_A with beads) and
// models/welding-ik.json (segment-A joint angles at 60 Hz, joint axes, torch-tip offset, Y-up).
// The duct, rollers and positioner are procedural (below). Segment-B joint angles are solved at load
// with the same damped-least-squares IK the Blender script uses (warm-started, ~5 ms).
// A geometry is Blender Z-up (b2t converts); B geometry is authored directly in three.js Y-up.
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---------------------------------------------------------------- segment A (Blender port)
const R_HEAD = 0.30, Z_HEAD = 0.43, R_NOZ = 0.112, NOZ_X = [-0.66, 0.0, 0.66];
const T_FIRST = 0.15, T_NOZ = 2.85, T_MOVE = 0.55, T_SCAN = 0.40, T_DESC = 0.20, T_WELD = 1.50;
const PHI0 = Math.PI / 2, TILT_A = (38 * Math.PI) / 180, A_TABLE_END = 9.2;

// ---------------------------------------------------------------- segment B (duct)
const ZC = 0.46, RD = 0.275, LD = 0.80;          // duct axis height, radius, section length
const RR = 0.075, ROLL_A = (35 * Math.PI) / 180;  // roller radius, contact angle from bottom
const STAND_X = 0.42;                              // roller stands at ±STAND_X
const PSI = (4 * Math.PI) / 180;                   // torch azimuth from top, toward the robot (−z)
const LEAN = (20 * Math.PI) / 180;                 // torch lean back toward the robot
const STANDOFF = 0.024;
const B_APP = [10.0, 10.65], B_SCAN = [10.65, 11.4], B_DESC = [11.4, 11.65];
const WS = 11.65, T_WELD_B = 5.0, WE = WS + T_WELD_B, B_LIFT = [WE, WE + 0.25], B_HOME = [WE + 0.25, 17.35];
const REVS = 0.8, OMEGA = (2 * Math.PI * REVS) / T_WELD_B, SPIN_RAMP = 0.3;
const SLIDE_A = [8.85, 9.95], SLIDE_IN = [8.85, 9.95], SLIDE_OUT = [16.95, 18.0], SLIDE_DIST = 3.1;
const DURATION = 18;

const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const ramp = (t, a, b) => ease((t - a) / (b - a));
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function seamB(k, phi, offR = 0, offZ = 0) {
  const r = R_NOZ + offR, y = r * Math.sin(phi);
  return [NOZ_X[k] + r * Math.cos(phi), y, Z_HEAD + Math.sqrt(Math.max(R_HEAD * R_HEAD - y * y, 0)) + offZ];
}
const b2t = ([x, y, z]) => [x, z, -y];
const weldWindow = (k) => { const t0 = T_FIRST + k * T_NOZ, ws = t0 + T_MOVE + T_SCAN + T_DESC; return [t0, ws, ws + T_WELD]; };

function phaseA(t) {
  for (let k = 0; k < 3; k++) {
    const [t0, ws, we] = weldWindow(k);
    if (t >= t0 && t < t0 + T_NOZ) {
      const u = t - t0;
      if (u >= T_MOVE && u < T_MOVE + T_SCAN) return { scan: [k, (u - T_MOVE) / T_SCAN] };
      if (t >= ws && t < we) return { weld: [k, PHI0 + 2 * Math.PI * (t - ws) / T_WELD] };
      return {};
    }
  }
  return {};
}

// duct-local point at angle a (0 = top, + toward the robot), axial x, radius r (three.js, axis along X at y=ZC)
const ductP = (a, x, r, out) => out.set(x, ZC + r * Math.cos(a), -r * Math.sin(a));

// Camera path (seconds, Blender coordinates, lens in mm). A keys are the Blender cut's frames / 30.
const LOOP = { t: 0, pos: [1.35, -3.55, 0.5], look: [0.0, 0.55, 1.12], lens: 52 };
const POOL_B = [0, RD * Math.sin(PSI) - 0.012, ZC + RD * Math.cos(PSI) + 0.004];
const KEYS = [
  LOOP,
  { t: 61 / 30, pos: [0.35, -2.55, 0.95], look: [-0.55, 0.25, 0.92], lens: 60, focus: seamB(0, -Math.PI / 2, 0.02, 0.02) },
  { t: 134 / 30, pos: [0.95, -1.25, 1.05], look: [0.0, -0.05, 0.80], lens: 85, focus: seamB(1, -Math.PI / 2, 0.02, 0.01) },
  { t: 167 / 30, pos: [0.62, -1.38, 0.98], look: [0.0, -0.05, 0.79], lens: 90, focus: seamB(1, -Math.PI / 2, 0.02, 0.01) },
  { t: 209 / 30, pos: [2.9, 2.2, 1.6], look: [0.3, 0.45, 0.95], lens: 42 },
  { t: 251 / 30, pos: [2.6, -1.45, 0.88], look: [0.55, 0.15, 0.92], lens: 62, focus: seamB(2, 0.0, 0.02, 0.02) },
  // transition: crane up and out while the fixtures swap
  { t: 9.45, pos: [2.75, -3.05, 1.35], look: [0.25, 0.3, 0.55], lens: 36 },
  // B: low three-quarter hero of arm + duct on the rolls
  { t: 10.9, pos: [1.5, -2.1, 0.5], look: [0.05, 0.3, 0.84], lens: 38 },
  { t: 11.85, pos: [0.85, -1.4, 1.32], look: [0.0, 0.08, 0.74], lens: 58, focus: POOL_B },
  // macro on the torch tip and the fresh bead turning toward the lens
  { t: 12.9, pos: [0.42, -0.8, 1.12], look: [0.0, 0.04, 0.74], lens: 68, focus: POOL_B },
  { t: 14.7, pos: [0.2, -0.8, 1.07], look: [0.0, 0.01, 0.735], lens: 74, focus: [0, -0.01, 0.74] },
  // pull back
  { t: 16.3, pos: [2.25, -2.45, 1.3], look: [0.1, 0.25, 0.62], lens: 40 },
  { ...LOOP, t: DURATION },
].map((k) => ({ t: k.t, pos: k.pos, look: k.look, lens: k.lens, focus: k.focus ?? k.look }));

// Monotone cubic (Fritsch–Carlson) per channel ≈ Blender's auto-clamped bezier keys.
function monotone(ts, ys) {
  const n = ts.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (ts[i + 1] - ts[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (ts[i + 1] - ts[i - 1])) / ((2 * ts[i + 1] - ts[i] - ts[i - 1]) / d[i - 1] + (ts[i + 1] + ts[i] - 2 * ts[i - 1]) / d[i]);
  return (t) => {
    if (t <= ts[0]) return ys[0];
    if (t >= ts[n - 1]) return ys[n - 1];
    let i = 0;
    while (t > ts[i + 1]) i++;
    const h = ts[i + 1] - ts[i], s = (t - ts[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

const NOISE_GLSL = `
  float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }`;

// ---------------------------------------------------------------- small 3×3 / 6×6 linear algebra for the IK
const m3mul = (A, B) => { const C = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return C; };
const m3v = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const m3tv = (A, v) => [A[0] * v[0] + A[3] * v[1] + A[6] * v[2], A[1] * v[0] + A[4] * v[1] + A[7] * v[2], A[2] * v[0] + A[5] * v[1] + A[8] * v[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const nrm = (a) => scl(a, 1 / Math.hypot(...a));
function rotM(a, q) {
  const s = Math.sin(q), c = 1 - Math.cos(q), [x, y, z] = a;
  const K = [0, -z, y, z, 0, -x, -y, x, 0], KK = m3mul(K, K);
  return K.map((k, i) => (i % 4 === 0 ? 1 : 0) + s * k + c * KK[i]);
}
function inv6(M) { // Gauss-Jordan on a 6×6 (row-major array of arrays)
  const n = 6, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((r) => r.slice(n));
}

class Arm { // port of blender/scenes/welding.py Arm (world-aligned joint frames, rest = identity)
  constructor(P, A, tip, v0) { Object.assign(this, { P, A, tip, v0 }); }
  frames(q) {
    let R = [1, 0, 0, 0, 1, 0, 0, 0, 1], pos = this.P[0].slice(), prev = this.P[0];
    const ws = [], ps = [];
    for (let i = 0; i < 6; i++) {
      if (i) { pos = add(pos, m3v(R, sub(this.P[i], prev))); prev = this.P[i]; }
      ws.push(m3v(R, this.A[i])); ps.push(pos);
      R = m3mul(R, rotM(this.A[i], q[i]));
    }
    return { R, pos, ws, ps };
  }
  fk(q) {
    const f = this.frames(q);
    return { ...f, tipW: add(f.pos, m3v(f.R, sub(this.tip, this.P[5]))), d: m3v(f.R, this.v0) };
  }
  solve(q, tp, td, iters = 40, lam = 0.04, wd = 0.35, qRef = null, kNull = 0.15) {
    q = q.slice();
    for (let it = 0; it < iters; it++) {
      const { tipW, d, ws, ps } = this.fk(q);
      const e = [...sub(tp, tipW), ...scl(cross(d, td), wd)];
      if (Math.hypot(...e) < 1e-5) break;
      const J = Array.from({ length: 6 }, () => new Array(6).fill(0));
      for (let i = 0; i < 6; i++) {
        const lin = cross(ws[i], sub(tipW, ps[i])), ang = scl(sub(ws[i], scl(d, dot(ws[i], d))), wd);
        for (let r = 0; r < 3; r++) { J[r][i] = lin[r]; J[r + 3][i] = ang[r]; }
      }
      const JJt = J.map((r, i) => J.map((s, j) => r.reduce((acc, v, k) => acc + v * s[k], 0) + (i === j ? lam * lam : 0)));
      const Inv = inv6(JJt);
      const Jp = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => J.reduce((acc, row, k) => acc + row[i] * Inv[k][j], 0)));
      const dq = Jp.map((row) => row.reduce((acc, v, k) => acc + v * e[k], 0));
      if (qRef) {
        const z = qRef.map((v, i) => kNull * (v - q[i]));
        const JpJ = Jp.map((row) => Array.from({ length: 6 }, (_, j) => row.reduce((acc, v, k) => acc + v * J[k][j], 0)));
        for (let i = 0; i < 6; i++) dq[i] += z[i] - JpJ[i].reduce((acc, v, k) => acc + v * z[k], 0);
      }
      for (let i = 0; i < 6; i++) q[i] += Math.max(-0.25, Math.min(0.25, dq[i]));
    }
    return q;
  }
}

// ---------------------------------------------------------------- procedural geometry helpers
// Surface of revolution about the X axis from a list of profile segments [x0, r0, x1, r1]; flat normals per band.
function revolve(THREE, bands, seg) {
  const geos = bands.map(([x0, r0, x1, r1]) => {
    const pos = [], nor = [], uv = [], idx = [];
    const dx = x1 - x0, dr = r1 - r0, L = Math.hypot(dx, dr);
    const nx = -dr / L, nr = dx / L; // left normal of the profile direction (outward for +x along the outside)
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (const [x, r, v] of [[x0, r0, 0], [x1, r1, 1]]) {
        pos.push(x, r * c, -r * s); nor.push(nx, nr * c, -nr * s); uv.push(i / seg, v);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = 2 * i, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, d, a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    // make the winding agree with the authored normal
    const p = g.attributes.position, n = g.attributes.normal, va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    va.fromBufferAttribute(p, 0); vb.fromBufferAttribute(p, 1); vc.fromBufferAttribute(p, 3);
    const fn = vb.sub(va).cross(vc.sub(va));
    if (fn.dot(new THREE.Vector3().fromBufferAttribute(n, 0)) < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); }
    return g;
  });
  return mergeGeometries(geos);
}

function brushedTexture(THREE) {
  // longitudinal brushing: streaks vary around the circumference (u), constant along the length (v)
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 4;
  const g = c.getContext("2d"), r = rng(42);
  g.fillStyle = "#d8d8d8"; g.fillRect(0, 0, 1024, 4);
  for (let i = 0; i < 2600; i++) {
    const x = r() * 1024, l = 185 + r() * 70;
    g.fillStyle = `rgba(${l | 0},${l | 0},${l | 0},${0.2 + 0.3 * r()})`;
    g.fillRect(x, 0, 0.6 + r() * 1.6, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.anisotropy = 4;
  return t;
}

export default async function create(ctx) {
  const { THREE, camera, target, loadGLB, mat } = ctx;
  const [root, ik] = await Promise.all([
    loadGLB("models/welding.glb"),
    fetch(new URL("../models/welding-ik.json", import.meta.url)).then((r) => r.json()),
  ]);
  const low = ctx.tier === "low";

  // ---- materials (by Blender material name)
  const rust = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.6 });
  rust.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vObj;" + NOISE_GLSL)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float big = fbm(vObj * 2.2), fine = fbm(vObj * 60.0);
        vec3 c0 = vec3(0.0242, 0.0185, 0.0152), c1 = vec3(0.0666, 0.0331, 0.0203), c2 = vec3(0.195, 0.0513, 0.0160);
        vec3 rc = big < 0.52 ? mix(c0, c1, smoothstep(0.38, 0.52, big)) : mix(c1, c2, smoothstep(0.52, 0.66, big));
        diffuseColor.rgb = rc * (0.75 + 0.5 * fine);`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.42, 0.85, fbm(vObj * 2.2));");
  };
  const progU = [{ value: -1 }, { value: -1 }, { value: -1 }];
  const beadMat = (k) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x6f747a, metalness: 1, roughness: 0.32 });
    m.onBeforeCompile = (s) => {
      s.uniforms.prog = progU[k];
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute float beadU; varying float vU;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvU = beadU;");
      s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform float prog; varying float vU;")
        .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nfloat age = prog - vU; if (age <= 0.0) discard;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float heat = min(exp(-3.2 * age), 1.0);
          vec3 hc = heat < 0.45 ? mix(vec3(0.25, 0.02, 0.0), vec3(1.0, 0.144, 0.010), heat / 0.45) : mix(vec3(1.0, 0.144, 0.010), vec3(1.0, 0.85, 0.6), (heat - 0.45) / 0.55);
          totalEmissiveRadiance = hc * 9.0 * heat * heat;
          diffuseColor.rgb *= 0.9 + 0.1 * sin(vU * 6.2832 * 110.0);`);
    };
    m.customProgramCacheKey = () => "bead";
    return m;
  };
  const M = {
    paint: mat.paint,
    paint_light: new THREE.MeshPhysicalMaterial({ color: 0x2a74b8, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.08 }),
    dark_metal: new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.9, roughness: 0.35 }),
    brushed: new THREE.MeshStandardMaterial({ color: 0xc4ccd4, metalness: 1, roughness: 0.24 }),
    rubber: mat.rubber,
    copper: mat.copper,
    chrome: mat.chrome,
    ivory: new THREE.MeshPhysicalMaterial({ color: 0xe9e6dd, roughness: 0.4, clearcoat: 0.3 }),
    lens_glass: new THREE.MeshPhysicalMaterial({ color: 0x0c1622, metalness: 0, roughness: 0.02, clearcoat: 1 }),
    band_scale: new THREE.MeshStandardMaterial({ color: 0x3a2a22, metalness: 0.9, roughness: 0.4 }),
    pipe_rust: rust,
  };
  const named = {};
  root.traverse((o) => {
    named[o.name] = o;
    if (!o.isMesh) return;
    const base = o.material.name.split(".")[0];
    if (base === "weld_bead") o.material = beadMat(Number(o.name.slice(-1)) || Number(o.parent.name.slice(-1)) || 0);
    else if (M[base]) o.material = M[base];
  });
  for (let k = 0; k < 3; k++) {
    named[`bead_${k}`].traverse((o) => {
      if (!o.isMesh) return;
      const uv = o.geometry.attributes.uv, u = new Float32Array(uv.count);
      for (let i = 0; i < uv.count; i++) u[i] = uv.getX(i);
      o.geometry.setAttribute("beadU", new THREE.BufferAttribute(u, 1));
      o.material = beadMat(k);
      o.userData.noShadow = true;
    });
  }

  // ---- arm joints + IK tables
  const K = [1, 2, 3, 4, 5, 6].map((i) => named[`K${i}`]);
  const axes = ik.axes.map((a) => new THREE.Vector3(...a).normalize());
  root.updateMatrixWorld(true);
  const arm = new Arm(K.map((k) => k.getWorldPosition(new THREE.Vector3()).toArray()), ik.axes.map(nrm), ik.tip.map((v, i) => v + K[5].getWorldPosition(new THREE.Vector3()).getComponent(i)), [0, 0, 1]);
  const qA = (t) => {
    const x = Math.min(Math.max(t, 0), (ik.q.length - 1) / ik.hz) * ik.hz, i = Math.floor(x), f = x - i;
    const a = ik.q[i], b = ik.q[Math.min(i + 1, ik.q.length - 1)];
    return a.map((v, j) => v * (1 - f) + b[j] * f);
  };
  {
    // torch direction in the flange frame, recovered from segment A (tool direction is known while welding)
    const [, ws0] = weldWindow(0), phi = PHI0 + 2 * Math.PI * 0.3;
    const dB = [-Math.cos(phi) * Math.sin(TILT_A), -Math.sin(phi) * Math.sin(TILT_A), -Math.cos(TILT_A)];
    arm.v0 = nrm(m3tv(arm.frames(qA(ws0 + 0.3 * T_WELD)).R, b2t(dB)));
  }
  const homeTip = b2t([-0.15, 0.30, 1.32]), homeDir = nrm(b2t([0, -0.30, -1.0]));
  const seamTop = [0, ZC + RD * Math.cos(PSI), -RD * Math.sin(PSI)];
  const torchDir = [0, -Math.cos(PSI + LEAN), Math.sin(PSI + LEAN)];
  const weldTip = sub(seamTop, scl(torchDir, STANDOFF));
  const aboveTip = add(weldTip, [0, 0.13, -0.02]);
  const lerpPose = (a, b, s) => { s = ease(s); return [add(scl(a[0], 1 - s), scl(b[0], s)), nrm(add(scl(a[1], 1 - s), scl(b[1], s)))]; };
  function poseB(t) {
    const home = [homeTip, homeDir], above = [aboveTip, torchDir], at = [weldTip, torchDir];
    if (t < B_APP[0]) return home;
    if (t < B_APP[1]) return lerpPose(home, above, (t - B_APP[0]) / (B_APP[1] - B_APP[0]));
    if (t < B_SCAN[1]) return above;
    if (t < B_DESC[1]) return lerpPose(above, at, (t - B_DESC[0]) / (B_DESC[1] - B_DESC[0]));
    if (t < WE) { // weave across the joint + slow seam-tracking correction
      const w = 0.0012 * Math.sin(2 * Math.PI * 2.4 * t) + 0.0015 * Math.sin(1.1 * t);
      return [add(weldTip, [w, 0, 0]), torchDir];
    }
    if (t < B_LIFT[1]) return lerpPose(at, above, (t - B_LIFT[0]) / (B_LIFT[1] - B_LIFT[0]));
    return lerpPose(above, home, (t - B_HOME[0]) / (B_HOME[1] - B_HOME[0]));
  }
  // approach and return are joint-space (PTP) moves like a real controller; scan → weld → lift are IK (linear)
  const HZ = 60, B0 = A_TABLE_END, qHome = qA(0);
  const qAbove = arm.solve(qHome, aboveTip, torchDir, 400, 0.04, 0.35, qHome);
  const qB = [];
  {
    let q = qAbove, qLift = null;
    for (let i = 0; i <= Math.ceil((DURATION - B0) * HZ); i++) {
      const t = B0 + i / HZ;
      let out;
      if (t < B_APP[1]) { const s = ramp(t, B_APP[0], B_APP[1]); out = qHome.map((v, j) => v + (qAbove[j] - v) * s); }
      else if (t < B_LIFT[1]) { const [p, d] = poseB(t); q = arm.solve(q, p, d, 60, 0.04, 0.35, qHome); out = q; }
      else { qLift ??= q; const s = ramp(t, B_HOME[0], B_HOME[1]); out = qLift.map((v, j) => v + (qHome[j] - v) * s); }
      qB.push(out);
    }
  }
  const qOut = new Array(6);
  const qAt = (t) => {
    if (t < B0) return qA(t);
    const x = Math.min((t - B0) * HZ, qB.length - 1), i = Math.floor(x), f = x - i, a = qB[i], b = qB[Math.min(i + 1, qB.length - 1)];
    for (let j = 0; j < 6; j++) qOut[j] = a[j] * (1 - f) + b[j] * f;
    return qOut;
  };

  // ---- workpiece A: header + its supports form one fixture; B (fresh, unwelded) shuttles in at the end
  const wpA = named.wp_A;
  for (const n of ["pipe_support_1", "support_saddle_pad_1", "pipe_support_2", "support_saddle_pad_2"]) if (named[n]) wpA.attach(named[n]);
  const wpB = wpA.clone();
  wpB.children.filter((o) => o.name.startsWith("bead_")).forEach((o) => wpB.remove(o));
  root.add(wpB);

  // ---- segment B: turning-roll positioner carrying two butted stainless duct sections
  const carriage = new THREE.Group();
  const duct = new THREE.Group();
  duct.position.y = ZC;
  carriage.add(duct);
  root.add(carriage);

  const SEG = low ? 128 : 192, RI = RD - 0.003, RF = RD + 0.032, XG = 0.0012;
  const half = (s) => [ // one section on the +x side (s = 1) or mirrored (s = -1); [x0, r0, x1, r1] bands, outside first
    [XG, RD - 0.0022, XG + 0.003, RD],                 // bevel of the butt joint (V groove)
    [XG + 0.003, RD, LD - 0.006, RD],                   // shell
    [LD - 0.006, RD, LD - 0.006, RF],                   // flange inner face
    [LD - 0.006, RF, LD, RF],                           // flange rim
    [LD, RF, LD, RI],                                   // end face
    [LD, RI, XG, RI],                                   // bore
    [XG, RI, XG, RD - 0.0022],                          // joint land
  ].map(([x0, r0, x1, r1]) => (s > 0 ? [x0, r0, x1, r1] : [-x1, r1, -x0, r0]));
  const shellGeo = revolve(THREE, [...half(1), ...half(-1)], SEG);
  const brushedTex = brushedTexture(THREE);
  const ductU = { prog: { value: -1 }, now: { value: -10 }, arc: { value: 0 }, a0: { value: PSI } };
  // duct rotation: spins up just before the arc strikes, constant during the weld, spins down after
  const TH_HZ = 240, thTab = new Float32Array(Math.ceil(DURATION * TH_HZ) + 2);
  for (let i = 1; i < thTab.length; i++) {
    const t = (i - 0.5) / TH_HZ, rate = OMEGA * (ramp(t, WS - SPIN_RAMP, WS) - ramp(t, WE, WE + SPIN_RAMP));
    thTab[i] = thTab[i - 1] + rate / TH_HZ;
  }
  const thetaAt = (t) => { const x = Math.min(Math.max(t, 0) * TH_HZ, thTab.length - 1), i = Math.floor(x), f = x - i; return thTab[i] * (1 - f) + thTab[Math.min(i + 1, thTab.length - 1)] * f; };
  const thWS = thetaAt(WS);
  ductU.a0.value = PSI + thWS;
  const steel = new THREE.MeshStandardMaterial({ color: 0xd2d7dc, metalness: 1, roughness: 0.3, roughnessMap: brushedTex, map: brushedTex });
  const HEAT_GLSL = `
    uniform float uProg, uNow, uArc, uA0; varying vec3 vObj;
    const float TAU = 6.2831853, OMEGA = ${OMEGA.toFixed(6)}, RD = ${RD.toFixed(4)};
    float weldU(vec3 p){ return mod(atan(-p.z, p.y) - uA0, TAU) / TAU; }`;
  steel.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uProg: ductU.prog, uNow: ductU.now, uArc: ductU.arc, uA0: ductU.a0 });
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\n" + HEAT_GLSL)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float dx = abs(vObj.x), rr = length(vObj.yz), u = weldU(vObj);
        float outside = step(RD - 0.0015, rr) * step(rr, RD + 0.002);
        float welded = outside * step(u, uProg);
        float age = uNow - u * TAU / OMEGA;
        float cool = 1.0 - exp(-max(age, 0.0) / 0.45);
        // heat tint across the heat-affected zone: grey at the toe, blue/violet, then straw, fading out
        vec3 straw = vec3(1.05, 0.78, 0.42), blue = vec3(0.42, 0.45, 0.85), grey = vec3(0.55, 0.56, 0.62);
        vec3 tint = mix(straw, blue, smoothstep(0.024, 0.014, dx));
        tint = mix(tint, grey, smoothstep(0.012, 0.007, dx));
        float band = smoothstep(0.046, 0.022, dx) * welded * cool;
        diffuseColor.rgb *= mix(vec3(1.0), tint, band);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.42, band);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        float s = (u - uProg) * TAU * RD;
        float hot = welded * exp(-max(age, 0.0) / 0.25) * exp(-dx * dx / 0.00012);
        float halo = outside * uArc * exp(-(s * s + dx * dx) / 0.00012);
        totalEmissiveRadiance += vec3(1.0, 0.28, 0.05) * 2.0 * hot + vec3(1.0, 0.55, 0.25) * 1.2 * halo;`);
  };
  steel.customProgramCacheKey = () => "duct-steel";
  const shell = new THREE.Mesh(shellGeo, steel);
  duct.add(shell);

  // longitudinal seams (one per section, different clock positions) — they make the rotation readable
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x9a9da3, metalness: 1, roughness: 0.42 });
  const seamGeos = [[1, 2.2], [-1, -1.9]].map(([s, a]) => {
    const g = new THREE.CylinderGeometry(0.0042, 0.0042, LD - 0.03, 8, 1).rotateZ(Math.PI / 2).scale(1, 0.45, 1);
    g.translate(s * (LD / 2 + 0.006), RD, 0).rotateX(a);
    return g;
  });
  const seams = new THREE.Mesh(mergeGeometries(seamGeos), seamMat);
  duct.add(seams);

  // circumferential bead: u = 0..REVS along the joint, starting under the torch at weld start
  const NB = low ? 320 : 480, NP = 9, BW = 0.0075, BH = 0.0042;
  let beadGeo;
  {
    const pos = new Float32Array((NB + 1) * NP * 3), bu = new Float32Array((NB + 1) * NP), idx = [];
    for (let i = 0; i <= NB; i++) {
      const u = (i / NB) * REVS, a = ductU.a0.value + 2 * Math.PI * u, lift = 0;
      const taper = Math.min(1, u / 0.012, (REVS - u) / 0.008);
      for (let j = 0; j < NP; j++) {
        const th = (j / (NP - 1)) * Math.PI, x = BW * Math.cos(th) * (0.6 + 0.4 * taper), r = RD - 0.0012 + lift + BH * Math.sin(th) * taper;
        const k = i * NP + j;
        pos[k * 3] = x; pos[k * 3 + 1] = r * Math.cos(a); pos[k * 3 + 2] = -r * Math.sin(a);
        bu[k] = u;
      }
    }
    for (let i = 0; i < NB; i++) for (let j = 0; j < NP - 1; j++) {
      const a = i * NP + j, b = a + 1, c = a + NP, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    beadGeo = new THREE.BufferGeometry();
    beadGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    beadGeo.setAttribute("beadU", new THREE.BufferAttribute(bu, 1));
    beadGeo.setIndex(idx);
    beadGeo.computeVertexNormals();
    const mid = ((NB >> 1) * NP + (NP >> 1)) * 3, nn = beadGeo.attributes.normal.array, pp = pos;
    if (nn[mid + 1] * pp[mid + 1] + nn[mid + 2] * pp[mid + 2] < 0) { // flip so normals face out
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      beadGeo.setIndex(idx); beadGeo.computeVertexNormals();
    }
  }
  const beadBMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.34 });
  beadBMat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uProg: ductU.prog, uNow: ductU.now, uArc: ductU.arc, uA0: ductU.a0 });
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute float beadU; varying float vU; varying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvU = beadU; vObj = position;");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vU;\n" + HEAT_GLSL)
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (vU > uProg) discard;\nfloat age = uNow - vU * TAU / OMEGA;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float cool = smoothstep(0.1, 0.9, age);
        vec3 bc = mix(vec3(0.70, 0.58, 0.40), vec3(0.50, 0.53, 0.62), cool);
        bc = mix(bc, vec3(0.36, 0.38, 0.62), smoothstep(0.0040, 0.0072, abs(vObj.x)) * cool);
        diffuseColor.rgb = bc * (0.86 + 0.14 * sin(vU * TAU * 260.0));`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        float heat = min(exp(-age / 0.3), 1.0);
        vec3 hc = heat < 0.45 ? mix(vec3(0.25, 0.02, 0.0), vec3(1.0, 0.144, 0.010), heat / 0.45) : mix(vec3(1.0, 0.144, 0.010), vec3(1.0, 0.85, 0.6), (heat - 0.45) / 0.55);
        totalEmissiveRadiance = hc * 8.0 * heat * heat;`);
  };
  beadBMat.customProgramCacheKey = () => "duct-bead";
  const beadB = new THREE.Mesh(beadGeo, beadBMat);
  beadB.userData.noShadow = true;
  beadB.receiveShadow = true;
  duct.add(beadB);

  // turning-roll bed: two stands joined by rails, two polyurethane-tyred rollers each, gearmotor on one stand
  const frameMat = mat.navy, darkMat = M.dark_metal;
  const tyreMat = new THREE.MeshPhysicalMaterial({ color: 0xe0762c, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, metalness: 1, roughness: 0.3 });
  const rollY = ZC - (RD + RR) * Math.cos(ROLL_A), rollZ = (RD + RR) * Math.sin(ROLL_A);
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const frameGeos = [], darkGeos = [];
  for (const xs of [-STAND_X, STAND_X]) {
    frameGeos.push(box(0.2, 0.07, 0.7, xs, 0.035, 0));                // cross beam
    for (const zs of [-rollZ, rollZ]) for (const bx of [-0.056, 0.056]) frameGeos.push(box(0.026, 0.13, 0.085, xs + bx, 0.07 + 0.065, zs)); // bearing pedestals
    for (const zs of [-rollZ, rollZ]) darkGeos.push(new THREE.CylinderGeometry(0.016, 0.016, 0.15, 16).rotateZ(Math.PI / 2).translate(xs, rollY, zs)); // axles
  }
  for (const zs of [-0.29, 0.29]) darkGeos.push(box(2 * STAND_X + 0.2, 0.04, 0.05, 0, 0.02, zs));   // side rails
  frameGeos.push(box(0.13, 0.12, 0.14, STAND_X + 0.15, 0.13, -rollZ));                                 // gearbox
  frameGeos.push(new THREE.CylinderGeometry(0.052, 0.052, 0.17, 24).rotateX(Math.PI / 2).translate(STAND_X + 0.15, 0.14, -rollZ - 0.15)); // motor
  darkGeos.push(new THREE.CylinderGeometry(0.056, 0.056, 0.02, 24).rotateX(Math.PI / 2).translate(STAND_X + 0.15, 0.14, -rollZ - 0.24)); // fan cover
  darkGeos.push(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 12).rotateZ(Math.PI / 2).translate(STAND_X + 0.065, rollY, -rollZ)); // drive shaft
  const frame = new THREE.Mesh(mergeGeometries(frameGeos), frameMat);
  const dark = new THREE.Mesh(mergeGeometries(darkGeos), darkMat);
  carriage.add(frame, dark);
  const tyreGeo = new THREE.CylinderGeometry(RR, RR, 0.062, 48, 1).rotateZ(Math.PI / 2);
  const hubGeos = [new THREE.CylinderGeometry(0.05, 0.05, 0.072, 32).rotateZ(Math.PI / 2)];
  for (let b = 0; b < 6; b++) { const a = (b / 6) * Math.PI * 2; hubGeos.push(new THREE.CylinderGeometry(0.0055, 0.0055, 0.08, 6).rotateZ(Math.PI / 2).translate(0, 0.034 * Math.cos(a), 0.034 * Math.sin(a))); }
  const hubGeo = mergeGeometries(hubGeos);
  const rollers = [];
  for (const xs of [-STAND_X, STAND_X]) for (const zs of [-rollZ, rollZ]) {
    const g = new THREE.Group();
    g.position.set(xs, rollY, zs);
    const tyre = new THREE.Mesh(tyreGeo, tyreMat), hub = new THREE.Mesh(hubGeo, hubMat);
    for (const m of [tyre, hub]) { m.userData.noShadow = true; m.receiveShadow = true; }
    g.add(tyre, hub);
    carriage.add(g);
    rollers.push(g);
  }
  for (const m of [seams]) { m.userData.noShadow = true; m.receiveShadow = true; }


  // ---- weld effects (shared by both segments)
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: true });
  const pool = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 8), glow(4, 2.8, 1.6));
  const arc = new THREE.PointLight(0xffb880, 0, 0.7, 2);
  const NS = 160, WIN = [0, 1, 2].map((k) => weldWindow(k).slice(1)).concat([[WS, WE]]);
  const sparkGeo = new THREE.CylinderGeometry(0.0013, 0.0013, 1, 5, 1, true).rotateX(Math.PI / 2);
  const sparks = new THREE.InstancedMesh(sparkGeo, glow(5, 2.3, 0.8), NS);
  sparks.frustumCulled = false;
  const sp = Array.from({ length: NS }, (_, i) => { const r = rng(7000 + i); return { ph: (i / NS) * 0.45, life: 0.18 + 0.24 * r() }; });
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  const fanMat = new THREE.MeshBasicMaterial({ color: 0x0a5aff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.frustumCulled = false;
  const laserCol = new THREE.Color(0.45, 0.8, 1).multiplyScalar(5);
  const ringMat = new THREE.MeshBasicMaterial({ color: laserCol, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R_NOZ + 0.02, 0.0018, 6, 96), ringMat);
  ring.rotation.x = -Math.PI / 2;
  // laser stripe across the duct joint (follows the shell and dips into the V groove)
  const NL = 40, stripePos = new Float32Array((NL + 1) * 2 * 3);
  const stripeGeo = new THREE.BufferGeometry();
  stripeGeo.setAttribute("position", new THREE.BufferAttribute(stripePos, 3));
  { const idx = []; for (let i = 0; i < NL; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } stripeGeo.setIndex(idx); }
  const stripeMat = new THREE.MeshBasicMaterial({ color: laserCol, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.frustumCulled = false;
  // faint fume rising off the pool (segment B only)
  const NF = 28, fumePos = new Float32Array(NF * 3), fumeCol = new Float32Array(NF * 4);
  const fumeGeo = new THREE.BufferGeometry();
  fumeGeo.setAttribute("position", new THREE.BufferAttribute(fumePos, 3));
  fumeGeo.setAttribute("color", new THREE.BufferAttribute(fumeCol, 4));
  const puff = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.5, "rgba(255,255,255,0.35)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const fumeMat = new THREE.PointsMaterial({ size: 0.06, map: puff, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
  const fume = new THREE.Points(fumeGeo, fumeMat);
  fume.frustumCulled = false;
  const fp = Array.from({ length: NF }, (_, i) => { const r = rng(900 + i); return { ph: (i / NF) * 1.6, dx: (r() - 0.5) * 0.05, dz: 0.02 + 0.05 * r(), rise: 0.09 + 0.06 * r() }; });

  // floor patch under the cell: rougher than the shared studio floor so grazing views don't catch a hot specular sheet
  const fa = document.createElement("canvas"); fa.width = fa.height = 128;
  { const g = fa.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "#fff"); r.addColorStop(0.72, "#fff"); r.addColorStop(1, "#000"); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }
  const floorPatch = new THREE.Mesh(new THREE.CircleGeometry(9, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x040c17, roughness: 0.92, metalness: 0, transparent: true, alphaMap: new THREE.CanvasTexture(fa), depthWrite: false }));
  floorPatch.name = "floor_patch";
  floorPatch.position.set(0, 0.0008, -0.3);
  floorPatch.renderOrder = -0.5;
  floorPatch.receiveShadow = true;

  for (const o of [pool, sparks, fan, ring, stripe, fume, floorPatch]) o.userData.noShadow = true;
  root.add(pool, arc, sparks, fan, ring, stripe, fume, floorPatch);
  const lens = named.camera_lens;
  lens.geometry.computeBoundingBox();
  const lensC = lens.geometry.boundingBox.getCenter(new THREE.Vector3());

  // ---- camera channels
  const ts = KEYS.map((k) => k.t);
  const ch = (get) => [0, 1, 2].map((i) => monotone(ts, KEYS.map((k) => b2t(get(k))[i])));
  const camPos = ch((k) => k.pos), camLook = ch((k) => k.look), camFocus = ch((k) => k.focus);
  const camLens = monotone(ts, KEYS.map((k) => k.lens));
  const focus = new THREE.Vector3();

  // scratch objects (no per-frame allocation)
  const tip = new THREE.Vector3(), v = new THREE.Vector3(), o3 = new THREE.Vector3();
  const rootInv = new THREE.Matrix4(); // world -> root space (the root may sit anywhere in a larger scene)
  const dummy = new THREE.Object3D(), zero = new THREE.Matrix4().makeScale(0, 0, 0), fwd = new THREE.Vector3(0, 0, 1);
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3(), pd = new THREE.Vector3();
  const poolB = new THREE.Vector3();
  ductP(PSI, 0, RD + 0.003, poolB);
  const setV = (out, arr) => out.set(...b2t(arr));
  const stripeBase = new THREE.Vector3(), stripeDir = new THREE.Vector3();

  function layStripe(a) { // world positions on the shell at azimuth a, across the joint
    const da = 0.0016 / RD;
    for (let i = 0; i <= NL; i++) {
      const x = -0.07 + (0.14 * i) / NL, groove = Math.max(0, 0.0024 * (1 - Math.abs(x) / 0.0042));
      const r = RD + 0.0009 - groove;
      ductP(a - da, x, r, pa); ductP(a + da, x, r, pb);
      const o = i * 6;
      stripePos[o] = pa.x; stripePos[o + 1] = pa.y; stripePos[o + 2] = pa.z; stripePos[o + 3] = pb.x; stripePos[o + 4] = pb.y; stripePos[o + 5] = pb.z;
    }
    stripeGeo.attributes.position.needsUpdate = true;
  }
  const fanTo = (p, q) => {
    o3.copy(lensC).applyMatrix4(lens.matrixWorld).applyMatrix4(rootInv);
    const pos = fanGeo.attributes.position;
    pos.setXYZ(0, o3.x, o3.y, o3.z); pos.setXYZ(1, p.x, p.y, p.z); pos.setXYZ(2, q.x, q.y, q.z);
    pos.needsUpdate = true;
  };

  function update(time) {
    const t = time % DURATION;
    const flick = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 91) * Math.sin(t * 57 + 1.3));

    // arm
    const q = qAt(t);
    for (let i = 0; i < 6; i++) K[i].quaternion.setFromAxisAngle(axes[i], q[i]);

    // fixtures: header out, duct in, duct out, fresh header in
    const sA = ramp(t, SLIDE_A[0], SLIDE_A[1]), sIn = ramp(t, SLIDE_IN[0], SLIDE_IN[1]), sOut = ramp(t, SLIDE_OUT[0], SLIDE_OUT[1]);
    wpA.visible = t < SLIDE_A[1];
    wpA.position.x = -SLIDE_DIST * sA;
    carriage.visible = t >= SLIDE_IN[0] && t < SLIDE_OUT[1];
    carriage.position.x = SLIDE_DIST * (1 - sIn) - SLIDE_DIST * sOut;
    wpB.visible = t >= SLIDE_OUT[0];
    wpB.position.x = SLIDE_DIST * (1 - sOut);
    for (let k = 0; k < 3; k++) progU[k].value = Math.min(Math.max((t - weldWindow(k)[1]) / T_WELD, 0), 3.9);
    const th = thetaAt(t);
    duct.rotation.x = th;
    for (const r of rollers) r.rotation.x = -th * (RD / RR);
    const weldingB = t >= WS && t < WE;
    ductU.prog.value = t < WS ? -1 : (thetaAt(Math.min(t, WE)) - thWS) / (2 * Math.PI);
    ductU.now.value = t - WS;
    ductU.arc.value = weldingB ? flick : 0;
    root.updateMatrixWorld(true);
    rootInv.copy(root.matrixWorld).invert();
    tip.set(ik.tip[0], ik.tip[1], ik.tip[2]).applyMatrix4(K[5].matrixWorld).applyMatrix4(rootInv);

    // arc + pool
    const ph = phaseA(t);
    const macroB = ramp(t, 12.2, 12.9) * (1 - ramp(t, 15.2, 16.0));
    pool.visible = !!ph.weld || weldingB;
    if (ph.weld) { pool.position.copy(tip).y -= 0.008; arc.position.copy(tip).y += 0.03; arc.intensity = 1.3 * flick; }
    else if (weldingB) { pool.position.copy(poolB); arc.position.copy(poolB).y += 0.03; arc.intensity = (1.0 - 0.6 * macroB) * flick; }
    else arc.intensity = 0;
    pool.scale.setScalar(weldingB ? 0.6 : 1);

    // sparks
    for (let i = 0; i < NS; i++) {
      let placed = false;
      for (let k = 0; k < 4 && !placed; k++) {
        const ws = WIN[k][0], we = WIN[k][1];
        if (t < ws || t > we + 0.45) continue;
        const n = Math.floor((t - ws - sp[i].ph) / 0.45), b = ws + sp[i].ph + n * 0.45, tau = t - b;
        if (b < ws || b > we || tau > sp[i].life) continue;
        const r = rng((i * 73856093) ^ (k * 19349663) ^ (n * 83492791));
        const fade = 1 - tau / sp[i].life;
        if (k < 3) {
          const phi = PHI0 + 2 * Math.PI * (b - ws) / T_WELD;
          const [ox, oy, oz] = seamB(k, phi, 0.016, 0.010);
          const ang = r() * 2 * Math.PI, a1 = 0.6 + r(), a2 = 0.3 + 0.9 * r(), a3 = 0.4 + 1.4 * r(), sc = 0.9 + 0.7 * r();
          const vx = (Math.cos(phi) * a1 + Math.cos(ang) * a2) * sc, vy = (Math.sin(phi) * a1 + Math.sin(ang) * a2) * sc, vz = a3 * sc;
          const pz = oz + vz * tau - 4.9 * tau * tau;
          if (pz < 0.02) continue;
          dummy.position.set(...b2t([ox + vx * tau, oy + vy * tau, pz]));
          v.set(...b2t([vx, vy, vz - 9.8 * tau])).normalize();
        } else {
          // duct: spray mostly sideways along the joint and forward with the turning surface
          const ang = r() * 2 * Math.PI, sc = 0.7 + 0.9 * r();
          const vx = Math.cos(ang) * (0.5 + 0.9 * r()) * sc, vz = (0.35 + 0.8 * r() + 0.4 * Math.sin(ang)) * sc, vy = (0.5 + 1.2 * r()) * sc;
          const px = poolB.x + vx * tau, py = poolB.y + vy * tau - 4.9 * tau * tau, pz = poolB.z + vz * tau;
          if (py < 0.02) continue;
          if (Math.abs(px) < LD && (py - ZC) ** 2 + pz * pz < (RD + 0.004) ** 2) continue; // hidden inside the shell
          dummy.position.set(px, py, pz);
          v.set(vx, vy - 9.8 * tau, vz).normalize();
        }
        dummy.quaternion.setFromUnitVectors(fwd, v);
        if (k < 3) dummy.scale.set(1, 1, 0.012 + 0.03 * fade);
        else dummy.scale.set(0.6, 0.6, 0.005 + 0.016 * fade);
        dummy.updateMatrix();
        sparks.setMatrixAt(i, dummy.matrix);
        placed = true;
      }
      if (!placed) sparks.setMatrixAt(i, zero);
    }
    sparks.instanceMatrix.needsUpdate = true;

    // fume (B)
    let anyFume = false;
    for (let i = 0; i < NF; i++) {
      const n = Math.floor((t - WS - fp[i].ph) / 1.6), b = WS + fp[i].ph + n * 1.6, tau = t - b;
      const live = b >= WS && b <= WE && tau >= 0 && tau < 1.6;
      const a = live ? Math.sin((Math.PI * tau) / 1.6) * 0.09 * (1 - 0.6 * macroB) : 0;
      fumePos[i * 3] = poolB.x + fp[i].dx * tau * 2; fumePos[i * 3 + 1] = poolB.y + 0.01 + fp[i].rise * tau; fumePos[i * 3 + 2] = poolB.z + fp[i].dz * tau;
      fumeCol[i * 4] = 0.62; fumeCol[i * 4 + 1] = 0.66; fumeCol[i * 4 + 2] = 0.74; fumeCol[i * 4 + 3] = a;
      anyFume ||= live;
    }
    fume.visible = anyFume;
    fumeGeo.attributes.position.needsUpdate = fumeGeo.attributes.color.needsUpdate = true;

    // vision: A = blue fan + laser ring around the nozzle; B = fan + laser stripe across the duct joint
    stripe.visible = false;
    ring.visible = false;
    fanMat.opacity = 0;
    if (ph.scan) {
      const [k, f] = ph.scan;
      const strength = Math.sin(Math.PI * clamp01(f));
      const sweep = (f - 0.5) * 1.4;
      setV(pa, seamB(k, PHI0 + 0.9 + sweep, 0.02, 0));
      setV(pb, seamB(k, PHI0 - 0.9 + sweep, 0.02, 0));
      fanTo(pa, pb);
      fanMat.opacity = 0.55 * strength;
      ring.visible = true;
      ring.position.set(NOZ_X[k], Z_HEAD + R_HEAD - 0.01 + 0.06 * (1 - f), 0);
      ringMat.opacity = strength;
    } else if (t >= B_SCAN[0] && t < WE) {
      let a, strength, fanK;
      if (t < B_SCAN[1]) { // sweep from upstream across the torch position and back
        const f = (t - B_SCAN[0]) / (B_SCAN[1] - B_SCAN[0]);
        a = PSI + 0.1 - 0.28 * Math.sin(Math.PI * f);
        strength = ramp(f, 0, 0.15) * (0.75 + 0.25 * Math.sin(Math.PI * f));
        fanK = 0.55;
      } else { // tracking ahead of the pool while welding
        a = PSI + 0.1;
        strength = t < WS ? 0.9 : 0.75 + 0.1 * flick;
        fanK = t < WS ? 0.4 : 0.08;
      }
      layStripe(a);
      stripe.visible = true;
      stripeMat.opacity = strength;
      ductP(a, -0.07, RD, pc); ductP(a, 0.07, RD, pd);
      fanTo(pc, pd);
      fanMat.opacity = fanK * strength;
    }

    // camera
    camera.position.set(camPos[0](t), camPos[1](t), camPos[2](t));
    target.set(camLook[0](t), camLook[1](t), camLook[2](t));
    camera.fov = (2 * Math.atan(24 / (2 * camLens(t))) * 180) / Math.PI;
    focus.set(camFocus[0](t), camFocus[1](t), camFocus[2](t));
    ctx.focus = focus;
  }

  return {
    root,
    duration: DURATION,
    stage: { center: b2t([0.0, 0.45, 0.75]), size: 1.7, floorY: 0 },
    enter() { update(0); },
    update,
  };
}
