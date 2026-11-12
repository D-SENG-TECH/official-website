// Nano crystal coating on a switchboard busbar joint.
//
// 0.0-2.2 s   establishing: a light-grey floor-standing distribution cabinet (pilot lamps, meter, window,
//             louvre, swing handle). The door swings open: busbars on red supports, incoming cables with
//             lugs, moulded-case breakers, two rows of miniature breakers, terminal blocks, cable ducts.
// 2.2-3.5 s   push in to the spliced phase busbar at the top; the bolted joint glows hot orange.
// 3.5-5.0 s   a brush lays a shimmering nano coating over the joint.
// 5.0-9.4 s   micro: oxidised contact faces touch at a few asperities, current is choked; nano crystals
//             fill the valleys, current flows evenly and the hot spots cool blue (nano-micro.glb/json).
// 9.4-12 s    back at the joint, the glow cools to blue; pull back while the door closes (seamless loop).
// The cabinet is built here procedurally (instanced breakers, merged static parts); only the micro set is a GLB.
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const DUR = 12, T_IN = 5.0, T_OUT = 9.4;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ramp = (t, a, b) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const lerp = (a, b, u) => a + (b - a) * u;
const fovOf = (lens) => (2 * Math.atan(12 / lens) * 180) / Math.PI; // 36x24 sensor, vertical

// C1 cubic Hermite through keys {t, v: number[]} with Catmull-Rom tangents; zero speed at both ends.
function hermite(keys, t) {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[n - 1].t) return keys[n - 1].v;
  let k = 0;
  while (k < n - 2 && keys[k + 1].t <= t) k++;
  // monotone tangents: zero where a component turns or holds (no overshoot on a fixed look-at)
  const tan = (i) => (i === 0 || i === n - 1 ? keys[i].v.map(() => 0) : keys[i].v.map((_, j) => {
    const d0 = (keys[i].v[j] - keys[i - 1].v[j]) / (keys[i].t - keys[i - 1].t);
    const d1 = (keys[i + 1].v[j] - keys[i].v[j]) / (keys[i + 1].t - keys[i].t);
    if (d0 * d1 <= 0) return 0;
    const m = (keys[i + 1].v[j] - keys[i - 1].v[j]) / (keys[i + 1].t - keys[i - 1].t);
    return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(d0), 3 * Math.abs(d1));
  }));
  const a = keys[k], b = keys[k + 1], h = b.t - a.t, u = (t - a.t) / h;
  const ma = tan(k), mb = tan(k + 1);
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
  return a.v.map((x, j) => h00 * x + h10 * h * ma[j] + h01 * b.v[j] + h11 * h * mb[j]);
}

function rng(seed) { // mulberry32
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(THREE, w, h, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export default async function create(ctx) {
  const { THREE, camera, target } = ctx;
  const root = new THREE.Group();
  const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  const noShadow = (o) => { o.userData.noShadow = true; o.castShadow = o.receiveShadow = false; return o; };

  const [micro, data] = await Promise.all([
    ctx.loadGLB("models/nano-micro.glb"),
    fetch(new URL("../models/nano-micro.json", import.meta.url)).then((r) => r.json()),
  ]);

  // ============================== materials ==============================
  const phys = (hex, o = {}) => new THREE.MeshPhysicalMaterial({ color: hex, ...o });
  const std = (hex, o = {}) => new THREE.MeshStandardMaterial({ color: hex, ...o });
  // heat on the spliced L1 joint: world-space falloff added to the copper and zinc emissive
  const heat = { uJ: { value: new THREE.Vector3() }, uHeat: { value: new THREE.Color(0, 0, 0) }, uRootInv: { value: new THREE.Matrix4() } }; // uRootInv: world -> root space
  const addHeat = (m) => {
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, heat);
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWp; uniform mat4 uRootInv;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWp = (uRootInv * modelMatrix * vec4(transformed, 1.0)).xyz;");
      s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWp; uniform vec3 uJ; uniform vec3 uHeat;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          vec3 hd = (vWp - uJ) / vec3(0.075, 0.022, 0.05);
          totalEmissiveRadiance += uHeat * exp(-dot(hd, hd));`);
    };
    m.customProgramCacheKey = () => "nano-heat";
    return m;
  };
  const M = {
    paint: phys(0xc9cbc7, { roughness: 0.52, clearcoat: 0.25, clearcoatRoughness: 0.35 }), // RAL 7035
    paintIn: phys(0xb9bbb7, { roughness: 0.6 }),
    plinth: std(0x2c3035, { roughness: 0.6 }),
    plate: std(0xc4cad0, { metalness: 0.75, roughness: 0.42 }), // galvanised mounting plate
    copper: addHeat(std(0xd27a4c, { metalness: 1, roughness: 0.24 })),
    zinc: addHeat(std(0xc8d0d8, { metalness: 1, roughness: 0.3 })),
    tin: std(0xb8c0c6, { metalness: 1, roughness: 0.35 }),
    insul: phys(0xa8381f, { roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.15 }),
    mccb: phys(0x2a2e33, { roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4 }),
    black: std(0x111316, { roughness: 0.55 }),
    mcb: phys(0xe9e9e5, { roughness: 0.45, clearcoat: 0.2 }),
    duct: std(0x9aa0a6, { roughness: 0.65 }),
    rail: std(0xaab3bb, { metalness: 1, roughness: 0.35 }),
    cable: phys(0xffffff, { vertexColors: true, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
    chrome: ctx.mat.chrome,
    glass: std(0x203242, { metalness: 0, roughness: 0.04, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
    mesh: std(0x24282d, { roughness: 0.8 }),
  };

  // Merge-by-material builder: each add() bakes a transform into a geometry copy.
  const geoM = new THREE.Matrix4(), geoQ = new THREE.Quaternion(), geoE = new THREE.Euler(), geoS = new THREE.Vector3(1, 1, 1), geoP = new THREE.Vector3();
  function builder() {
    const map = new Map();
    const add = (mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(geoM.compose(geoP.set(x, y, z), geoQ.setFromEuler(geoE.set(rx, ry, rz)), geoS));
      if (!map.has(mat)) map.set(mat, []);
      map.get(mat).push(g);
      return g;
    };
    const build = (parent) => {
      for (const [mat, list] of map) {
        const withColor = list.some((g) => g.attributes.color);
        for (const g of list) {
          if (withColor && !g.attributes.color) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
        }
        const mesh = new THREE.Mesh(mergeGeometries(list), mat);
        parent.add(mesh);
        list.forEach((g) => g.dispose());
      }
      map.clear();
    };
    return { add, build };
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const rbox = (w, h, d, r = 0.004) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
  const cylZ = (r, len, seg = 16) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2); // axis along z
  // box from min/max corners
  const B = (b, mat, x0, y0, z0, x1, y1, z1, round = 0) =>
    b.add(mat, round ? rbox(x1 - x0, y1 - y0, z1 - z0, round) : box(x1 - x0, y1 - y0, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

  // ============================== cabinet ==============================
  // 800 W x 2000 H x 500 D, floor at y = 0, front plane z = 0.25, door hinged on the left.
  const cab = new THREE.Group();
  root.add(cab);
  const S = builder();
  const W2 = 0.4, ZF = 0.25, ZB = -0.25;
  B(S, M.plinth, -W2, 0, ZB, W2, 0.1, ZF, 0.006);
  B(S, M.paint, -W2, 0.1, ZB, -W2 + 0.02, 1.985, ZF, 0.005); // sides
  B(S, M.paint, W2 - 0.02, 0.1, ZB, W2, 1.985, ZF, 0.005);
  B(S, M.paint, -W2, 0.1, ZB, W2, 1.985, ZB + 0.02, 0.005); // back
  B(S, M.paint, -W2 - 0.008, 1.975, ZB - 0.008, W2 + 0.008, 2.015, ZF + 0.008, 0.008); // roof
  B(S, M.paintIn, -W2 + 0.02, 0.1, ZB + 0.02, W2 - 0.02, 0.13, ZF - 0.02); // gland plate
  // front frame inside the door opening
  B(S, M.paint, -W2 + 0.02, 0.1, ZF - 0.03, -W2 + 0.045, 1.975, ZF - 0.002);
  B(S, M.paint, W2 - 0.045, 0.1, ZF - 0.03, W2 - 0.02, 1.975, ZF - 0.002);
  B(S, M.paint, -W2 + 0.02, 1.95, ZF - 0.03, W2 - 0.02, 1.975, ZF - 0.002);
  B(S, M.paint, -W2 + 0.02, 0.13, ZF - 0.03, W2 - 0.02, 0.155, ZF - 0.002);
  // lifting eyes on the roof
  const eye = new THREE.TorusGeometry(0.022, 0.0055, 8, 20);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    S.add(M.zinc, eye, sx * 0.33, 2.04, sz * 0.19, 0, Math.PI / 4 * sx * sz, 0);
    S.add(M.zinc, new THREE.CylinderGeometry(0.012, 0.014, 0.012, 12), sx * 0.33, 2.019, sz * 0.19);
  }

  // mounting plate
  const ZP = -0.215; // plate front face
  B(S, M.plate, -0.35, 0.17, ZP - 0.004, 0.35, 1.93, ZP, 0.002);

  // ---- busbars: L1 L2 L3 N, spliced at x = XJ with a bolted cover plate
  const BAR_Y = [1.84, 1.78, 1.72, 1.66], BAR_H = 0.032, BZ0 = -0.13, BZ1 = -0.122, XJ = -0.12;
  const hexHead = new THREE.CylinderGeometry(0.0075, 0.0075, 0.006, 6).rotateX(Math.PI / 2).rotateZ(Math.PI / 6);
  const washer = cylZ(0.0095, 0.0016, 20);
  const stud = cylZ(0.0042, 0.012, 10);
  const bolt = (b, x, y, z) => { b.add(M.zinc, washer, x, y, z + 0.0008); b.add(M.zinc, hexHead, x, y, z + 0.0046); b.add(M.zinc, stud, x, y, z + 0.008); };
  for (const y of BAR_Y) {
    B(S, M.copper, -0.29, y - BAR_H / 2, BZ0, XJ - 0.002, y + BAR_H / 2, BZ1, 0.0015);
    B(S, M.copper, XJ + 0.002, y - BAR_H / 2, BZ0, 0.34, y + BAR_H / 2, BZ1, 0.0015);
    B(S, M.copper, XJ - 0.06, y - 0.017, BZ1, XJ + 0.06, y + 0.017, BZ1 + 0.006, 0.0015); // splice plate
    bolt(S, XJ - 0.035, y, BZ1 + 0.006);
    bolt(S, XJ + 0.035, y, BZ1 + 0.006);
  }
  const J = new THREE.Vector3(XJ, BAR_Y[0], BZ1 + 0.006); // focus joint (front of the L1 splice plate)
  heat.uJ.value.copy(J);
  // red busbar supports
  for (const x of [-0.215, 0.29]) {
    B(S, M.insul, x - 0.016, 1.625, ZP, x + 0.016, 1.875, BZ0, 0.004);
    for (const y of BAR_Y) B(S, M.insul, x - 0.018, y - BAR_H / 2 - 0.006, BZ0, x + 0.018, y - BAR_H / 2 - 0.001, BZ1 + 0.002, 0.001);
  }
  // drops from L1/L2/L3 to the two feeder MCCBs
  const FEED_X = [0.035, 0.195];
  for (const cx of FEED_X) for (let p = 0; p < 3; p++) {
    const x = cx + (p - 1) * 0.034, y = BAR_Y[p];
    B(S, M.copper, x - 0.008, y - 0.008, BZ1, x + 0.008, y + 0.008, -0.1, 0.001); // standoff to the front layer
    B(S, M.copper, x - 0.008, 1.515, -0.1, x + 0.008, y + 0.009, -0.095, 0.0012);
    bolt(S, x, y, -0.095);
    B(S, M.copper, x - 0.008, 1.505, -0.15, x + 0.008, 1.52, -0.095, 0.0012); // dog-leg into the terminal
  }

  // ---- MCCBs (feeders)
  for (const cx of FEED_X) {
    const y0 = 1.3, y1 = 1.505, zf = ZP + 0.085;
    B(S, M.mccb, cx - 0.06, y0, ZP, cx + 0.06, y1, zf, 0.006);
    B(S, M.mccb, cx - 0.045, y0 + 0.055, zf, cx + 0.045, y1 - 0.055, zf + 0.018, 0.005); // raised front cover
    B(S, M.black, cx - 0.011, (y0 + y1) / 2 - 0.004, zf + 0.018, cx + 0.011, (y0 + y1) / 2 + 0.03, zf + 0.04, 0.004); // toggle
    B(S, M.mcb, cx + 0.022, y0 + 0.068, zf + 0.018, cx + 0.036, y0 + 0.078, zf + 0.0195); // abstract rating window
    S.add(M.insul, cylZ(0.0035, 0.004, 10), cx - 0.03, y0 + 0.073, zf + 0.019); // push-to-trip
    for (let p = 0; p < 3; p++) { // terminal shrouds + cable entries
      const x = cx + (p - 1) * 0.034;
      B(S, M.black, x - 0.011, y1 - 0.03, zf - 0.002, x + 0.011, y1 - 0.004, zf + 0.001);
      B(S, M.black, x - 0.011, y0 + 0.004, zf - 0.002, x + 0.011, y0 + 0.03, zf + 0.001);
    }
  }

  // ---- cable ducts (slotted trunking with a plain cover)
  const slotTex = canvasTex(THREE, 64, 64, (g, w, h) => {
    g.fillStyle = "#a3a9ae"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#3a3f44"; g.fillRect(24, 0, 16, h * 0.78);
  });
  slotTex.wrapS = slotTex.wrapT = THREE.RepeatWrapping;
  slotTex.repeat.set(1, 1);
  const ductSide = new THREE.MeshStandardMaterial({ color: 0xffffff, map: slotTex, roughness: 0.65 });
  function duct(x0, y0, x1, y1) {
    const hz = y1 - y0 < x1 - x0; // horizontal duct
    const len = hz ? x1 - x0 : y1 - y0, n = Math.round(len / 0.012);
    const g = box(x1 - x0, y1 - y0, 0.07);
    // repeat slots along the duct by scaling the uv on the side faces
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      if (hz) uv.setX(i, uv.getX(i) * n); else uv.setY(i, uv.getY(i) * n);
    }
    if (!hz) for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
    S.add(ductSide, g, (x0 + x1) / 2, (y0 + y1) / 2, ZP + 0.035);
    B(S, M.duct, x0 - 0.002, y0 - 0.002, ZP + 0.07, x1 + 0.002, y1 + 0.002, ZP + 0.078, 0.002);
  }
  duct(-0.345, 0.18, -0.285, 1.6); // left riser (incoming cables)
  duct(0.285, 0.18, 0.345, 1.27); // right riser
  duct(-0.28, 1.2, 0.28, 1.27);
  duct(-0.28, 0.97, 0.28, 1.04);
  duct(-0.28, 0.7, 0.28, 0.77);
  duct(-0.28, 0.4, 0.28, 0.47);

  // ---- DIN rails
  for (const y of [1.1, 0.87, 0.6]) B(S, M.rail, -0.28, y - 0.0175, ZP, 0.28, y + 0.0175, ZP + 0.0075);

  // ---- incoming cables with lugs bolted to the busbar ends (L1 brown, L2 black, L3 grey, N blue)
  const cableCol = { brown: 0x6b3a1e, black: 0x1a1b1d, grey: 0x7d8288, blue: 0x1f5fb0, gy: 0x5aa83a, white: 0xe0e0dc };
  const C = (hex) => new THREE.Color(hex);
  const tubeColored = (pts, r, hex, seg = 48) => {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 10, false);
    const col = C(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(a, i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g;
  };
  ["brown", "black", "grey", "blue"].forEach((name, i) => {
    const y = BAR_Y[i], x = -0.333 + i * 0.013, r = 0.0075;
    S.add(M.cable, tubeColored([[x, 0.2, -0.18], [x, 1.5, -0.18], [x, y - 0.035, -0.17], [x + 0.012, y - 0.004, -0.15], [-0.3, y, -0.118]], r, cableCol[name]));
    S.add(M.tin, new THREE.CylinderGeometry(0.0085, 0.0085, 0.03, 14).rotateZ(Math.PI / 2), -0.29, y, -0.118); // lug barrel
    B(S, M.tin, -0.278, y - 0.011, BZ1, -0.25, y + 0.011, BZ1 + 0.004, 0.0015); // lug palm
    bolt(S, -0.264, y, BZ1 + 0.004);
  });
  // outgoing feeder cables from the bottom duct down through the gland plate
  for (let i = 0; i < 7; i++) {
    const x = -0.21 + i * 0.07, hex = [cableCol.black, cableCol.grey, cableCol.black, cableCol.black, cableCol.grey, cableCol.black, cableCol.black][i];
    S.add(M.cable, tubeColored([[x, 0.4, ZP + 0.035], [x, 0.3, ZP + 0.04], [x * 0.9, 0.2, ZP + 0.06], [x * 0.85, 0.12, ZP + 0.07]], 0.011, hex, 16));
  }
  S.build(cab);

  // ---- instanced parts: MCBs, toggles, terminal blocks, straight wires
  const inst = (geo, mat, list, colors) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mx, i) => m.setMatrixAt(i, mx));
    if (colors) colors.forEach((c, i) => m.setColorAt(i, c));
    cab.add(m);
    return m;
  };
  const MOD = 0.018;
  const mcbGeo = mergeGeometries([
    box(0.0172, 0.09, 0.045).translate(0, 0, 0.0225),
    box(0.0172, 0.046, 0.022).translate(0, 0, 0.056),
  ]);
  const togGeo = box(0.0075, 0.016, 0.014).translate(0, 0.008, 0.071);
  const tbGeo = mergeGeometries([box(0.0058, 0.05, 0.03).translate(0, 0, 0.015), box(0.0058, 0.026, 0.014).translate(0, 0, 0.037)]);
  const wireGeo = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true).translate(0, 0.5, 0); // base at origin, +Y, unit length
  const mcbM = [], togM = [], tbM = [], tbC = [], wireM = [], wireC = [];
  const mm = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const wire = (x, y0, y1, z, r, hex) => {
    wireM.push(new THREE.Matrix4().compose(new THREE.Vector3(x, Math.min(y0, y1), z), new THREE.Quaternion(), new THREE.Vector3(r, Math.abs(y1 - y0), r)));
    wireC.push(C(hex));
  };
  const phaseCols = [cableCol.brown, cableCol.black, cableCol.grey];
  for (const [row, yc, yUp, yDn] of [[0, 1.1, 1.2, 1.04], [1, 0.87, 0.97, 0.77]]) {
    for (let i = 0; i < 30; i++) {
      if ((row === 0 && (i === 9 || i === 22)) || (row === 1 && (i === 14 || i === 27 || i === 28))) continue; // spare ways
      const x = -0.261 + i * MOD;
      mcbM.push(mm(x, yc, ZP));
      togM.push(mm(x, yc, ZP));
      const col = phaseCols[i % 3];
      wire(x, yc + 0.045, yUp, ZP + 0.03, 0.0026, col);
      wire(x, yc - 0.045, yDn, ZP + 0.03, 0.0026, col);
    }
  }
  // terminal blocks: grey phases, blue neutrals, green-yellow earths
  const tbCol = { g: C(0x8d9399), b: C(0x2a68c0), e: C(0x6fae3c) };
  for (let i = 0; i < 46; i++) {
    const x = -0.264 + i * 0.0116, k = i % 5, kind = k === 3 ? "b" : k === 4 ? "e" : "g";
    tbM.push(mm(x, 0.6, ZP + 0.0075));
    tbC.push(tbCol[kind]);
    const wc = kind === "b" ? cableCol.blue : kind === "e" ? cableCol.gy : phaseCols[k];
    wire(x, 0.625, 0.7, ZP + 0.035, 0.0022, wc);
    wire(x, 0.575, 0.47, ZP + 0.035, 0.0022, wc);
  }
  // MCCB outgoing cables into the duct below
  for (const cx of FEED_X) for (let p = 0; p < 3; p++) wire(cx + (p - 1) * 0.034, 1.27, 1.31, ZP + 0.045, 0.0075, phaseCols[p]);
  inst(mcbGeo, M.mcb, mcbM);
  inst(togGeo, M.black, togM);
  inst(tbGeo, phys(0xffffff, { roughness: 0.5, clearcoat: 0.2 }), tbM, tbC);
  inst(wireGeo, phys(0xffffff, { roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.2 }), wireM, wireC);

  // ---- interior lamp (LED strip under the roof), lit while the door is open
  const lampL = new THREE.RectAreaLight(0xfff3e2, 0, 0.6, 0.06);
  lampL.position.set(0, 1.94, 0.12);
  lampL.lookAt(0, 1.2, -0.2);
  root.add(lampL);
  const strip = noShadow(new THREE.Mesh(box(0.6, 0.012, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));
  strip.position.set(0, 1.955, 0.12);
  cab.add(strip);

  // ============================== door ==============================
  const door = new THREE.Group(); // pivot on the hinge line
  door.position.set(-W2 + 0.002, 0, ZF + 0.001);
  cab.add(door);
  const Dd = builder();
  const DW = 0.796, DY0 = 0.105, DY1 = 1.97;
  const rr = (s, x0, y0, x1, y1, r) => {
    s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r);
    s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
  };
  const WIN = [0.2, 1.22, 0.6, 1.58], LOU = [0.22, 0.24, 0.58, 0.44];
  const shape = new THREE.Shape(); rr(shape, 0, DY0, DW, DY1, 0.01);
  for (const [x0, y0, x1, y1] of [WIN, LOU]) { const h = new THREE.Path(); rr(h, x0, y0, x1, y1, 0.012); shape.holes.push(h); }
  const doorGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 4 });
  Dd.add(M.paint, doorGeo, 0, 0, 0.004);
  // window gasket + glass
  {
    const [x0, y0, x1, y1] = WIN, g = 0.008;
    for (const [a, b, c, d] of [[x0 - g, y0 - g, x1 + g, y0 + 0.004], [x0 - g, y1 - 0.004, x1 + g, y1 + g], [x0 - g, y0, x0 + 0.004, y1], [x1 - 0.004, y0, x1 + g, y1]]) {
      B(Dd, M.black, a, b, 0.012, c, d, 0.028, 0.002);
    }
  }
  // louvre: dark filter mat + angled slats
  {
    const [x0, y0, x1, y1] = LOU;
    B(Dd, M.mesh, x0, y0, 0.004, x1, y1, 0.008);
    for (let i = 0; i < 9; i++) Dd.add(M.paint, box(x1 - x0 - 0.004, 0.022, 0.0025), (x0 + x1) / 2, y0 + 0.012 + i * 0.0215, 0.016, -0.75, 0, 0);
  }
  // pilot lamps (abstract phase lamps) + analogue meter + hazard pictogram + swing handle
  const lampMats = [0xff3a22, 0xffb020, 0x3ce06a].map((c) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: 1.8, roughness: 0.2 }));
  [0.2, 0.28, 0.36].forEach((x, i) => {
    Dd.add(M.chrome, cylZ(0.016, 0.006, 24), x, 1.74, 0.025);
    const lens = new THREE.SphereGeometry(0.0115, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.55);
    Dd.add(lampMats[i], lens, x, 1.74, 0.028);
  });
  const meterTex = canvasTex(THREE, 256, 256, (g, w) => {
    g.fillStyle = "#f4f2ea"; g.fillRect(0, 0, w, w);
    g.strokeStyle = "#1b1d20"; g.lineWidth = 3;
    g.beginPath(); g.arc(128, 170, 110, -Math.PI * 0.82, -Math.PI * 0.18); g.stroke();
    for (let i = 0; i <= 20; i++) {
      const a = -Math.PI * 0.82 + (i / 20) * Math.PI * 0.64, l = i % 5 ? 10 : 22;
      g.lineWidth = i % 5 ? 2 : 4;
      g.beginPath(); g.moveTo(128 + Math.cos(a) * 110, 170 + Math.sin(a) * 110); g.lineTo(128 + Math.cos(a) * (110 - l), 170 + Math.sin(a) * (110 - l)); g.stroke();
    }
    g.strokeStyle = "#d33a1e"; g.lineWidth = 6; g.beginPath(); g.arc(128, 170, 104, -Math.PI * 0.3, -Math.PI * 0.18); g.stroke();
    g.strokeStyle = "#111"; g.lineWidth = 4; g.beginPath(); g.moveTo(128, 170); g.lineTo(128 + Math.cos(-1.9) * 100, 170 + Math.sin(-1.9) * 100); g.stroke();
    g.fillStyle = "#111"; g.beginPath(); g.arc(128, 170, 9, 0, Math.PI * 2); g.fill();
  });
  B(Dd, M.black, 0.47, 1.7, 0.022, 0.57, 1.8, 0.034, 0.004);
  const meterFace = new THREE.Mesh(new THREE.PlaneGeometry(0.084, 0.084), new THREE.MeshStandardMaterial({ map: meterTex, roughness: 0.35 }));
  meterFace.position.set(0.52, 1.75, 0.0345);
  const signTex = canvasTex(THREE, 256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = "#111"; g.beginPath(); g.moveTo(128, 14); g.lineTo(246, 230); g.lineTo(10, 230); g.closePath(); g.fill();
    g.fillStyle = "#f6c21c"; g.beginPath(); g.moveTo(128, 40); g.lineTo(224, 216); g.lineTo(32, 216); g.closePath(); g.fill();
    g.fillStyle = "#111"; g.beginPath();
    g.moveTo(140, 82); g.lineTo(104, 152); g.lineTo(130, 152); g.lineTo(112, 204); g.lineTo(156, 132); g.lineTo(130, 132); g.lineTo(150, 82); g.closePath(); g.fill();
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), new THREE.MeshStandardMaterial({ map: signTex, transparent: true, alphaTest: 0.5, roughness: 0.4 }));
  sign.position.set(0.4, 1.1, 0.0265);
  B(Dd, M.black, 0.725, 0.93, 0.022, 0.76, 1.09, 0.03, 0.006); // handle escutcheon
  Dd.add(M.chrome, rbox(0.018, 0.12, 0.012, 0.005), 0.742, 0.995, 0.042);
  Dd.add(M.chrome, cylZ(0.006, 0.014), 0.742, 1.045, 0.032);
  for (const y of [0.35, 1.05, 1.75]) Dd.add(M.plinth, new THREE.CylinderGeometry(0.008, 0.008, 0.07, 14), -0.004, y, 0.014);
  // inside of the door: document pocket
  B(Dd, M.paintIn, 0.25, 0.75, -0.012, 0.55, 1.0, 0.002, 0.003);
  Dd.build(door);
  const glass = noShadow(new THREE.Mesh(new THREE.PlaneGeometry(WIN[2] - WIN[0], WIN[3] - WIN[1]), M.glass));
  glass.position.set((WIN[0] + WIN[2]) / 2, (WIN[1] + WIN[3]) / 2, 0.02);
  door.add(glass, meterFace, sign);

  // ============================== joint heat, coating film, brush ==============================
  const glowTex = canvasTex(THREE, 128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,0.35)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  }, false);
  const haloMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = noShadow(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat));
  halo.scale.set(0.2, 0.09, 1);
  halo.position.copy(J).add(new THREE.Vector3(0, 0, 0.012));
  halo.renderOrder = 5;
  cab.add(halo);

  // film: front of the L1 splice plate and the bar faces either side; revealed along x behind the brush
  const filmGeo = mergeGeometries([
    new THREE.PlaneGeometry(0.124, 0.036).translate(XJ, BAR_Y[0], BZ1 + 0.0066),
    new THREE.PlaneGeometry(0.02, BAR_H + 0.001).translate(XJ - 0.072, BAR_Y[0], BZ1 + 0.0006),
    new THREE.PlaneGeometry(0.02, BAR_H + 0.001).translate(XJ + 0.072, BAR_Y[0], BZ1 + 0.0006),
  ]);
  const filmMat = new THREE.ShaderMaterial({
    uniforms: { uX: { value: -1 }, uTime: { value: 0 }, uAmt: { value: 1 }, uRootInv: heat.uRootInv },
    vertexShader: "uniform mat4 uRootInv; varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWp = (uRootInv * w).xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform float uX, uTime, uAmt; varying vec3 vWp;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float cover = 1.0 - smoothstep(uX - 0.004, uX + 0.002, vWp.x);
        if (cover < 0.01) discard;
        vec2 q = vWp.xy * vec2(900.0, 900.0);
        vec2 c = floor(q); vec2 f = fract(q) - 0.5 - (vec2(h(c + 3.1), h(c + 7.7)) - 0.5) * 0.6;
        float r = h(c), tw = pow(0.5 + 0.5 * sin(uTime * (3.0 + 6.0 * r) + r * 40.0), 6.0);
        float spark = smoothstep(0.32, 0.0, length(f)) * step(0.7, r) * tw;
        float band = 0.5 + 0.5 * sin(vWp.x * 260.0 + vWp.y * 420.0 - uTime * 2.5);
        vec3 film = mix(vec3(0.15, 0.45, 1.0), vec3(0.55, 0.75, 1.0), band) * 0.16;
        float edge = exp(-pow((uX - vWp.x) / 0.004, 2.0)) * 1.6;
        vec3 col = film + vec3(0.8, 0.9, 1.0) * spark * 2.2 + vec3(0.5, 0.75, 1.0) * edge;
        gl_FragColor = vec4(col * uAmt * cover, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const film = noShadow(new THREE.Mesh(filmGeo, filmMat));
  film.renderOrder = 4;
  cab.add(film);

  // applicator brush: tip at the group origin, handle along +Y
  const brush = new THREE.Group();
  const Bb = builder();
  Bb.add(new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.75 }), new THREE.CylinderGeometry(0.0055, 0.0032, 0.018, 16), 0, 0.009, 0);
  Bb.add(M.chrome, new THREE.CylinderGeometry(0.0062, 0.0058, 0.02, 20), 0, 0.027, 0);
  Bb.add(ctx.mat.paint, new THREE.CylinderGeometry(0.0055, 0.0062, 0.11, 20), 0, 0.092, 0);
  Bb.add(ctx.mat.paint, new THREE.SphereGeometry(0.0055, 16, 8), 0, 0.147, 0);
  Bb.build(brush);
  const wet = noShadow(new THREE.Mesh(new THREE.SphereGeometry(0.0045, 16, 8), new THREE.MeshBasicMaterial({ color: lin(0.4, 0.75, 2.2), toneMapped: false })));
  wet.scale.set(1, 0.6, 1);
  brush.add(wet);
  brush.visible = false;
  cab.add(brush);
  const brushDir = new THREE.Vector3(0.55, 0.75, 0.38).normalize();
  brush.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), brushDir);

  // ============================== micro: interface section ==============================
  const MO = new THREE.Vector3(0, 0.95, 0); // micro set offset: centred on the shared studio rig
  const microG = new THREE.Group();
  microG.position.copy(MO);
  root.add(microG);
  const HOT = lin(1, 0.09, 0.025), COOL = lin(0.05, 0.35, 1.0);
  const cuSection = new THREE.MeshPhysicalMaterial({ color: 0xb4683e, metalness: 1, roughness: 0.2, clearcoat: 0.3, clearcoatRoughness: 0.05 });
  const oxide = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.62 });
  oxide.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vObj;
      float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
      float nz = 0.55*vn(vObj*45.0) + 0.3*vn(vObj*110.0) + 0.15*vn(vObj*260.0);
      diffuseColor.rgb = mix(vec3(0.010, 0.0052, 0.0037), vec3(0.102, 0.025, 0.012), smoothstep(0.25, 0.8, nz));`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.5, 0.78, nz);");
  };
  micro.traverse((o) => { if (o.isMesh) o.material = o.name.startsWith("ox") ? oxide : cuSection; });
  microG.add(micro);
  // Filler copper above and below the section so tall (portrait) frames never reach the block edges.
  // Section face z = 0.6, footprint x +-1.9, blocks span y -0.95 .. 1.15.
  for (const [y0, y1] of [[1.15, 4.5], [-4.5, -0.95]]) {
    const f = new THREE.Mesh(box(3.8, y1 - y0, 1.5), cuSection);
    f.position.set(0, (y0 + y1) / 2, 0.6 - 0.75);
    microG.add(f);
  }
  const fx = new THREE.Group();
  microG.add(fx);

  // hot spots at the asperity contacts; their point lights stay in the scene (intensity 0 outside the
  // micro beat) so the light count never changes and no shader recompiles at the cuts
  const hotMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const sphere = new THREE.SphereGeometry(1, 24, 12);
  const hotLights = [];
  data.contacts.forEach((c) => {
    const s = noShadow(new THREE.Mesh(sphere, hotMat));
    s.position.fromArray(c.p);
    if (c.front) s.scale.set(0.022, 0.013, 0.008); else s.scale.set(0.04, 0.025, 0.04);
    fx.add(s);
    if (c.front) {
      const L = new THREE.PointLight(HOT, 0, 0, 2);
      L.position.fromArray(c.p).add(new THREE.Vector3(0, 0, 0.04)).add(MO);
      root.add(L);
      hotLights.push(L);
    }
  });

  // current streamlines on the section plane: ribbons + travelling streaks (long enough for portrait)
  const ZS = 0.606, LINES = 19, NP = 130, Z_TOP = 2.6, Z_BOT = -2.4, SPAN = Z_TOP - Z_BOT;
  const xStarts = Array.from({ length: LINES }, (_, i) => lerp(-1.35, 1.35, i / (LINES - 1)));
  const frontC = data.contacts.filter((c) => c.front).map((c) => [c.p[0], c.p[1]]);
  const nearest = xStarts.map((x0) => frontC.reduce((b, c) => (Math.abs(c[0] - x0) < Math.abs(b[0] - x0) ? c : b), frontC[0]));
  const out = new THREE.Vector3();
  function pathPoint(line, s, u) { // s: 0 top .. 1 bottom; u: constricted -> uniform; returns squeeze g
    const x0 = xStarts[line], [xc, yc] = nearest[line];
    const y = lerp(Z_TOP, Z_BOT, s);
    const g = Math.exp(-(((y - yc) / 0.34) ** 2));
    const xcon = x0 + (xc + (x0 - xc) * 0.05 - x0) * g;
    out.set(lerp(xcon, x0, u), y, ZS);
    return g;
  }
  const ribbonPos = new Float32Array(LINES * NP * 2 * 3);
  const ribbonIdx = [];
  for (let l = 0; l < LINES; l++) for (let k = 0; k < NP - 1; k++) {
    const a = (l * NP + k) * 2;
    ribbonIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute("position", new THREE.BufferAttribute(ribbonPos, 3));
  ribbonGeo.setIndex(ribbonIdx);
  const ribbonMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const ribbons = noShadow(new THREE.Mesh(ribbonGeo, ribbonMat));
  ribbons.frustumCulled = false;
  fx.add(ribbons);
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  let ribbonU = -1;
  function buildRibbons(u) {
    if (Math.abs(u - ribbonU) < 1e-4) return;
    ribbonU = u;
    const W = 0.0024;
    for (let l = 0; l < LINES; l++) for (let k = 0; k < NP; k++) {
      pathPoint(l, Math.max(0, (k - 0.5) / (NP - 1)), u); p0.copy(out);
      pathPoint(l, Math.min(1, (k + 0.5) / (NP - 1)), u); p1.copy(out);
      const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
      pathPoint(l, k / (NP - 1), u);
      const nx = (-dy / len) * W, ny = (dx / len) * W, a = ((l * NP + k) * 2) * 3;
      ribbonPos[a] = out.x + nx; ribbonPos[a + 1] = out.y + ny; ribbonPos[a + 2] = ZS;
      ribbonPos[a + 3] = out.x - nx; ribbonPos[a + 4] = out.y - ny; ribbonPos[a + 5] = ZS;
    }
    ribbonGeo.attributes.position.needsUpdate = true;
  }
  const r = rng(7);
  const PER = 46, NDOTS = LINES * PER;
  const dots = noShadow(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NDOTS));
  dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NDOTS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  dots.frustumCulled = false;
  fx.add(dots);
  const dotInfo = [];
  for (let l = 0; l < LINES; l++) for (let k = 0; k < PER; k++) dotInfo.push([l, (k + r() * 0.6) / PER, 0.85 + r() * 0.3]);

  // nano crystals: hex prisms, metallic with an inner glow (per-instance colour and strength)
  const D = data.D, R = D * 0.5;
  const hexGeo = new THREE.CylinderGeometry(R * 0.92, R * 0.92, data.layerH * 0.9, 6, 1);
  const NC = data.targets.length;
  const glow = new Float32Array(NC);
  const glowAttr = new THREE.InstancedBufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage);
  hexGeo.setAttribute("aGlow", glowAttr);
  const crystalMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  crystalMat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute float aGlow;\nvarying float vGlow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = aGlow;");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor * vGlow;");
  };
  const crystals = new THREE.InstancedMesh(hexGeo, crystalMat, NC);
  crystals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  crystals.frustumCulled = false;
  crystals.userData.noShadow = true;
  const GOLD = lin(1.0, 0.55, 0.08), BLUE = lin(0.05, 0.35, 1.0);
  const Cr = data.targets.map(([x, y, z, depth, midFront], i) => {
    const gold = r() < 0.62;
    crystals.setColorAt(i, gold ? GOLD : BLUE);
    return {
      T: new THREE.Vector3(x, y, z),
      S: new THREE.Vector3(x * 0.85 + (r() - 0.5) * 0.7, 0.85 + r() * 0.75, 1.25 + r() * 0.9),
      E: new THREE.Vector3(x + (r() - 0.5) * 0.1, midFront, 0.72),
      t0: 4.45 + 1.55 * (1 - depth) + (r() - 0.5) * 0.5,
      dur: 0.95 + r() * 0.4,
      spin: [(r() - 0.5) * 12, (r() - 0.5) * 12, (r() - 0.5) * 12],
      ph: r(),
    };
  });
  crystals.instanceColor.needsUpdate = true;
  fx.add(crystals);

  // camera-locked fade card: warm flash through the dive, dark dip around the return cut
  const cardMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, alpha: { value: 0 } },
    vertexShader: "void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 color; uniform float alpha; void main(){ gl_FragColor = vec4(color, alpha); }",
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const card = noShadow(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cardMat));
  card.frustumCulled = false;
  card.renderOrder = 999;
  card.matrixAutoUpdate = false;
  const cardM = new THREE.Matrix4(), cardS = new THREE.Matrix4();
  card.onBeforeRender = (_r, _s, cam) => {
    const d = Math.max(cam.near * 1.5, 0.003), hh = d * Math.tan((cam.fov * Math.PI) / 360) * 1.7;
    cardM.makeTranslation(0, 0, -d);
    cardS.makeScale(hh * cam.aspect, hh, 1);
    card.matrixWorld.copy(cam.matrixWorld).multiply(cardM).multiply(cardS);
  };
  halo.onBeforeRender = (_r, _s, cam) => { halo.quaternion.copy(cam.quaternion); halo.updateMatrixWorld(); };
  root.add(card);
  const FLASH = lin(3, 1.86, 1.08), DARK = new THREE.Color(0x071729);

  // ============================== camera ==============================
  const key = (t, pos, look, lens) => ({ t, v: [...pos, ...look, lens] });
  const Jt = [J.x, J.y, J.z];
  const P0 = [[1.55, 1.3, 3.15], [0.02, 1.02, 0], 36];
  const macroIn = [
    key(0, ...P0),
    key(1.0, [1.25, 1.27, 2.95], [0.0, 1.03, 0.0], 36),
    key(2.0, [0.66, 1.12, 3.35], [-0.02, 1.02, 0.0], 36),
    key(2.9, [0.12, 1.75, 0.75], [-0.1, 1.76, -0.13], 38),
    key(3.55, [-0.04, 1.872, 0.2], Jt, 46),
    key(4.6, [-0.07, 1.866, 0.14], Jt, 50),
    key(T_IN, [-0.11, 1.846, -0.04], [XJ + 0.004, J.y, J.z], 75),
  ];
  const macroOut = [
    key(T_OUT, [-0.05, 1.865, 0.13], Jt, 50),
    key(10.2, [0.03, 1.86, 0.3], Jt, 44),
    key(11.1, [0.75, 1.4, 2.3], [0.0, 1.12, 0.0], 36),
    key(DUR, ...P0),
  ];
  const yup = ([x, y, z]) => [x, z, -y]; // Blender -> here (micro keys from nano.py)
  const microKeys = [
    key(3.3, yup([-0.45, -2.0, 0.42]), yup([-0.3, -0.6, 0.1]), 50),
    key(4.6, yup([0.35, -2.95, 0.62]), yup([0.02, -0.6, 0.1]), 45),
    key(6.6, yup([-0.4, -2.75, 0.82]), yup([0.0, -0.55, 0.06]), 45),
    key(8.0, yup([-0.12, -2.25, 0.36]), yup([0.06, -0.6, 0.1]), 50),
    key(8.72, yup([-0.08, -2.75, 0.42]), yup([0.06, -0.6, 0.1]), 46),
  ];
  // micro clock: the micro beats were authored on 2.05..8.72 s; we enter at 3.5 (already hot)
  const microClock = (t) => 3.5 + (t - T_IN) * 1.1;

  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
  const WARM = lin(1.0, 0.82, 0.62), TRAIL_W = lin(1.0, 0.55, 0.3);
  const HEAT_HOT = lin(1.0, 0.36, 0.07), HEAT_COOL = lin(0.08, 0.35, 1.0);

  function updateMicro(m) {
    const hot = ramp(m, 2.05, 2.9) * (1 - ramp(m, 7.0, 8.1)), cool = ramp(m, 7.0, 8.1);
    const flick = 1 + 0.12 * Math.sin(m * 23) * Math.sin(m * 7.3);
    tmpC.copy(HOT).lerp(COOL, cool);
    hotMat.color.copy(tmpC).multiplyScalar(7 * hot * flick + 2 * cool);
    hotLights.forEach((L) => { L.color.copy(tmpC); L.intensity = 0.006 * hot * flick + 0.001 * cool; });

    const u = ramp(m, 7.0, 8.0);
    buildRibbons(u);
    ribbonMat.color.copy(TRAIL_W).lerp(COOL, u).multiplyScalar(0.5);
    dotInfo.forEach(([l, phase, speed], i) => {
      const s = (phase + m * 0.32 * speed * (2.07 / SPAN)) % 1;
      const g = pathPoint(l, s, u); pos.copy(out);
      pathPoint(l, Math.min(1, s + 0.002), u);
      dir.subVectors(out, pos);
      if (dir.lengthSq() < 1e-12) dir.set(0, -1, 0);
      q.setFromUnitVectors(yAxis, dir.normalize());
      const squeeze = g * (1 - u);
      const edge = Math.min(1, s * 25, (1 - s) * 25);
      sc.set(0.0055, 0.026 + 0.04 * squeeze, 0.0055).multiplyScalar(Math.max(edge, 0.001));
      dots.setMatrixAt(i, mtx.compose(pos, q, sc));
      tmpC2.copy(WARM).lerp(HOT, squeeze).lerp(COOL, u).multiplyScalar(1.3 * (0.7 + 1.8 * squeeze + 0.5 * u));
      dots.setColorAt(i, tmpC2);
    });
    dots.instanceMatrix.needsUpdate = dots.instanceColor.needsUpdate = true;

    const settle = 0.67 + 0.5 * ramp(m, 7.0, 7.5) * (1 - 0.6 * ramp(m, 7.5, 8.6));
    Cr.forEach((c, i) => {
      const p = (m - c.t0) / c.dur;
      if (p <= 0) { sc.setScalar(1e-4); mtx.compose(c.S, q.identity(), sc); glow[i] = 0; }
      else if (p >= 1) { sc.setScalar(1); mtx.compose(c.T, q.identity(), sc); glow[i] = settle * (1 + 0.25 * Math.sin(m * 5 + c.ph * 30)); }
      else {
        const k = 1 - (1 - p) ** 2.4;
        pos.lerpVectors(c.S, c.E, k);
        out.lerpVectors(c.E, c.T, k);
        pos.lerp(out, k);
        const w = (1 - k) ** 1.5;
        q.setFromEuler(e.set(c.spin[0] * w, c.spin[1] * w, c.spin[2] * w));
        sc.setScalar(Math.min(1, p * 5));
        mtx.compose(pos, q, sc);
        glow[i] = 1.3 * (1 - k) + settle * k;
      }
      crystals.setMatrixAt(i, mtx);
    });
    crystals.instanceMatrix.needsUpdate = true;
    glowAttr.needsUpdate = true;
  }

  const BRUSH_X0 = XJ - 0.075, BRUSH_X1 = XJ + 0.075;
  function update(t) {
    t = ((t % DUR) + DUR) % DUR;
    root.updateWorldMatrix(true, false);
    heat.uRootInv.value.copy(root.matrixWorld).invert();
    const inMicro = t >= T_IN && t < T_OUT;
    cab.visible = !inMicro;
    microG.visible = inMicro;

    // camera
    let v;
    if (inMicro) {
      const m = microClock(t);
      v = hermite(microKeys, m);
      camera.position.set(v[0] + MO.x, v[1] + MO.y, v[2] + MO.z);
      target.set(v[3] + MO.x, v[4] + MO.y, v[5] + MO.z);
    } else {
      v = t < T_IN ? hermite(macroIn, t) : hermite(macroOut, t);
      camera.position.set(v[0], v[1], v[2]);
      target.set(v[3], v[4], v[5]);
    }
    // portrait screens widen the vertical view (main.js keeps the horizontal framing); in the micro view
    // tighten the lens instead so the section, not acres of copper, fills the frame
    let lens = v[6];
    if (inMicro && camera.aspect < 1) lens *= Math.min(1.8, 1.15 / Math.max(camera.aspect, 0.3));
    camera.fov = fovOf(lens);
    ctx.focus = null;

    // fade card
    let flash = Math.abs(t - T_IN) < 0.07 ? 1 - Math.abs(t - T_IN) / 0.07 : 0;
    flash = Math.max(flash, ramp(t, T_IN - 0.25, T_IN - 0.02) * (1 - ramp(t, T_IN + 0.02, T_IN + 0.25)));
    const dark = ramp(t, T_OUT - 0.35, T_OUT - 0.02) * (1 - ramp(t, T_OUT + 0.02, T_OUT + 0.45));
    cardMat.uniforms.color.value.copy(flash >= dark ? FLASH : DARK);
    cardMat.uniforms.alpha.value = Math.max(flash, dark);
    card.visible = Math.max(flash, dark) > 0.002;

    if (inMicro) {
      lampL.intensity = 0;
      updateMicro(microClock(t));
      return;
    }
    for (const L of hotLights) L.intensity = 0;

    // door: opens 0.5-2.1 s, closes 10.7-11.9 s
    const open = ramp(t, 0.3, 1.7) * (1 - ramp(t, 10.6, 11.8));
    door.rotation.y = -1.85 * open;
    lampL.intensity = 6 * open;
    strip.material.color.setScalar(0.15 + 2.2 * open);

    // joint heat: orange before the coating, cooling to blue after the micro beat
    let hHot = 0, hCool = 0;
    if (t < T_IN) hHot = ramp(t, 2.5, 3.3) * (1 - 0.25 * ramp(t, 4.0, 4.9));
    else {
      hHot = 0.75 * (1 - ramp(t, T_OUT + 0.1, 10.0));
      hCool = ramp(t, 9.9, 10.4) * (1 - 0.7 * ramp(t, 10.6, 11.6)) * (1 - ramp(t, 11.6, 11.95));
    }
    const pulse = 1 + 0.08 * Math.sin(t * 9) * Math.sin(t * 3.7);
    heat.uHeat.value.copy(HEAT_HOT).multiplyScalar(1.1 * hHot * pulse).add(tmpC.copy(HEAT_COOL).multiplyScalar(0.6 * hCool));
    haloMat.color.copy(HEAT_HOT).multiplyScalar(0.3 * hHot * pulse).add(tmpC.copy(HEAT_COOL).multiplyScalar(0.2 * hCool));
    halo.visible = hHot + hCool > 0.01;

    // brush: flies in 3.35-3.75, sweeps 3.75-4.65, lifts away 4.65-5.0
    const sweep = ramp(t, 3.85, 4.6);
    const inB = ramp(t, 3.5, 3.85), outB = ramp(t, 4.6, 4.95);
    brush.visible = t > 3.45 && t < 4.97;
    if (brush.visible) {
      const bx = lerp(BRUSH_X0, BRUSH_X1, sweep), by = J.y + 0.009 * Math.sin(sweep * Math.PI * 7);
      const away = (1 - inB) * 0.16 + outB * 0.16;
      brush.position.set(bx, by, J.z + 0.0035).addScaledVector(brushDir, away);
      wet.material.color.copy(lin(0.4, 0.75, 2.2)).multiplyScalar(0.6 + 0.4 * Math.sin(t * 20));
    }
    // film follows the brush, then rests as a faint sheen
    film.visible = t > 3.85;
    filmMat.uniforms.uX.value = t < T_IN ? lerp(BRUSH_X0 - 0.01, BRUSH_X1 + 0.01, sweep) : 1;
    filmMat.uniforms.uTime.value = t;
    filmMat.uniforms.uAmt.value = t < T_IN ? 1 : 0.3 * (1 - ramp(t, 11.0, 11.9));
  }

  return {
    root,
    duration: DUR,
    stage: { center: [0, 1.0, 0], size: 1.25, floorY: 0 },
    update,
  };
}
