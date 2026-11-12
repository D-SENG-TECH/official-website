// Wrap-around butyl rubber duct flange gasket: procedural real-time scene.
//
// Beats (15 s loop):
//   0.0  the gasket alone turns slowly: six slotted bolt holes, the raised outer wrap lip and the
//        inner double sealing bead.
//   3.3  two round ducts with welded angle-ring flanges close in; the upper flange edge slides
//        under the lip hook (the lip flares and snaps back), six bolts drop in, the nuts rise and
//        the heads spin down while the rubber compresses.
//   7.5  a quarter of the joint lifts away and the cut faces show the section profile.
//   8.8  macro on the cut: the flange face is uneven, air leaks through the micro gaps, then the
//        rubber flows into every valley and the leak stops (orange seal line).
//  11.4  section view: the duct holds pressure, blue air stays inside.
//  12.7  the quarter returns, bolts and ducts withdraw, the gasket turns again (seamless loop).
//
// Everything is built here from 2D profiles revolved around the duct axis (Y). Each revolved part
// is split into a 270° main piece and a 90° wedge piece (the cut-away quarter, facing the camera);
// both carry end caps, so the section faces are real geometry. Bolt holes are cut in the shader
// (object-space slot SDF + discard) and lined with separate wall meshes. Units inside the assembly
// are millimetres; the assembly group is scaled to metres.

const TAU = Math.PI * 2, D2R = Math.PI / 180;

// ---- gasket dimensions (mm)
const RI = 101, T = 5, RLI = 146.6, RLO = 156, RF = 146, RB = 135;
const BAND_H = 0.8, RIB_H = 1.8, RIB_R = 2.4, RIBS = [106, 112];
const F_LO = [0.22, 0.4], F_HI = [0.6, 0.78], F_IN = [0.25, 0.5, 0.75];
const YC0 = T + BAND_H + RIB_H; // flange bottom height when it first touches the bead crests
const YCMIN = T - 0.7; // fully tightened
const AMP = 0.55, G0 = 0.15; // flange face unevenness, contact gap before the rubber flows
const FL_T = 3, HOOK_T = 3.6;
const SLOT_HL = 3.0, SLOT_HW = 5.8, HOLE_R = 4.6;
const NS = 200; // shared radial samples of the contact face (rubber top == flange bottom)
const RD_I = 98.8, RD_O = 100; // duct wall
const H_UP = 190, H_LOW = 115;
// ---- split: wedge = 45°..135° (centred on +Z, the camera side), main = 135°..405°
const PH_W0 = 45 * D2R, PH_W1 = 135 * D2R, PH_M0 = 135 * D2R, PH_M1 = 405 * D2R;
const HOLE_A0 = 90 * D2R; // first bolt sits in the wedge
const N_BOLT = 6;
const DUR = 15;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ramp = (t, a, b) => ease((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (e0, e1, x) => ease((x - e0) / (e1 - e0));
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const wav = (r) => 0.5 + 0.5 * (0.5 * Math.sin(r * TAU / 2.6 + 1.0) + 0.32 * Math.sin(r * TAU / 1.6 + 2.0) + 0.18 * Math.sin(r * TAU / 9.1 + 0.3));
const sampleR = (k) => RI + (RF - RI) * k / (NS - 1);
function freeTop(r) {
  let y = T + BAND_H * sstep(117, 115, r);
  for (const c of RIBS) { const d = (r - c) / RIB_R; if (d > -1 && d < 1) y += RIB_H * Math.sqrt(1 - d * d); }
  return y;
}
// rubber top surface under a flange whose (uneven) bottom sits at yc; fill = rubber flowed into the valleys
const rubberTop = (r, yc, fill) => Math.min(freeTop(r), yc - G0 * (1 - fill) + AMP * wav(r) * fill);

export default async function create(ctx) {
  const { THREE, camera, target } = ctx;
  const low = ctx.tier === "low";
  const STEPS_M = low ? 84 : 120, STEPS_W = low ? 28 : 40;
  const root = new THREE.Group();
  const asm = new THREE.Group();
  asm.scale.setScalar(0.001);
  root.add(asm);

  // ------------------------------------------------------------------ textures
  const canvasTex = (w, h, draw, repeat = true) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const rubberBump = canvasTex(256, 256, (g, w, h) => {
    // molded rubber: fine orange-peel grain plus a few soft flow marks
    const r = rng(11);
    g.fillStyle = "#808080"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = 100 + r() * 60 | 0;
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      g.beginPath(); g.arc(r() * w, r() * h, 0.6 + r() * 1.6, 0, TAU); g.fill();
    }
    g.strokeStyle = "rgba(150,150,150,.25)";
    for (let i = 0; i < 14; i++) {
      g.lineWidth = 1 + r() * 2;
      g.beginPath(); const x = r() * w, y = r() * h;
      g.moveTo(x, y); g.bezierCurveTo(x + 30, y + r() * 20, x + 60, y - r() * 20, x + 90 + r() * 40, y + 6); g.stroke();
    }
  });
  const rubberRough = canvasTex(256, 256, (g, w, h) => {
    // matte with faint dusty specks (as on the real part)
    const r = rng(5);
    g.fillStyle = "#d0d0d0"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 150 + r() * 90 | 0;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
  });
  const brush = canvasTex(512, 128, (g, w, h) => {
    const r = rng(3);
    g.fillStyle = "#8a8a8a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 105 + r() * 70 | 0;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, r() * h, w, r() < 0.9 ? 0.6 : 1.4);
    }
    g.strokeStyle = "rgba(225,225,225,.5)";
    for (let i = 0; i < 24; i++) {
      g.lineWidth = 0.6;
      g.beginPath(); const x = r() * w, y = r() * h;
      g.moveTo(x, y); g.lineTo(x + 20 + r() * 70, y + (r() - 0.5) * 10); g.stroke();
    }
  });
  const sprite = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }, false);

  // ------------------------------------------------------------------ materials
  // Holes are cut in the fragment shader from the object-space position (slots for the gasket,
  // round holes for the flanges), so the revolved meshes stay simple and deformable.
  const f5 = (x) => x.toFixed(5);
  function withHoles(mat, hl, hw, key) {
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
varying vec3 vObj;
float holeSdf(vec3 p) {
  float r = length(p.xz);
  float a = atan(p.z, p.x) - ${f5(HOLE_A0)};
  float st = ${f5(TAU / N_BOLT)};
  float da = a - st * floor(a / st + 0.5);
  vec2 q = vec2(max(abs(r * da) - ${f5(hl)}, 0.0), r - ${f5(RB)});
  return length(q) - ${f5(hw)};
}`)
        .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n  if (holeSdf(vObj) < 0.0) discard;");
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  }
  const rubberParams = {
    color: 0x1f2125, metalness: 0, roughness: 0.66, roughnessMap: rubberRough, envMapIntensity: 2.6,
    bumpMap: rubberBump, bumpScale: 0.35, sheen: 0.8, sheenColor: new THREE.Color(0x7a8592), sheenRoughness: 0.5,
    clearcoat: 0.1, clearcoatRoughness: 0.55,
  };
  const rubber = withHoles(new THREE.MeshPhysicalMaterial(rubberParams), SLOT_HL, SLOT_HW, "gasket-slot");
  const rubberWall = new THREE.MeshPhysicalMaterial(rubberParams);
  const rubberCut = new THREE.MeshPhysicalMaterial({
    color: 0x4a4e55, emissive: 0x202328, metalness: 0, roughness: 0.84, bumpMap: rubberBump, bumpScale: 0.2, envMapIntensity: 4,
    sheen: 0.3, sheenColor: new THREE.Color(0x4a525c), sheenRoughness: 0.6,
  });
  const steelParams = { color: 0xd3d9df, metalness: 1, roughness: 0.3, roughnessMap: brush };
  const steelFlange = withHoles(new THREE.MeshStandardMaterial({ ...steelParams, color: 0xa9b0b7, roughness: 0.56 }), 0, HOLE_R, "flange-hole");
  const steel = new THREE.MeshStandardMaterial(steelParams);
  const steelCut = new THREE.MeshStandardMaterial({ color: 0xe9edf1, metalness: 1, roughness: 0.42 });
  const zinc = new THREE.MeshStandardMaterial({ color: 0xd2d9e0, metalness: 1, roughness: 0.34 });

  // ------------------------------------------------------------------ revolved geometry
  // Profile P = closed CCW polygon in (r, y). Every segment gets its own vertex strip so sharp
  // profile corners stay crisp; smooth[i] averages the normals of the two segments at point i.
  function latheGeo(n, smooth, phi0, phi1, steps) {
    const vps = (steps + 1) * 2, nv = n * vps;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const idx = new Uint32Array(n * steps * 6);
    let q = 0;
    for (let s = 0; s < n; s++) {
      for (let j = 0; j < steps; j++) {
        const a = s * vps + j * 2, b = a + 1, c = a + 2, d = a + 3;
        idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c;
      }
    }
    const cs = new Float32Array(steps + 1), sn = new Float32Array(steps + 1), ph = new Float32Array(steps + 1);
    for (let j = 0; j <= steps; j++) { ph[j] = phi0 + (phi1 - phi0) * j / steps; cs[j] = Math.cos(ph[j]); sn[j] = Math.sin(ph[j]); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const segN = new Float32Array(2 * n), arc = new Float32Array(n + 1);
    const nrm = [0, 0];
    const pointN = (i, s) => {
      // normal of point i used by segment s
      if (!smooth[i]) { nrm[0] = segN[2 * s]; nrm[1] = segN[2 * s + 1]; return; }
      const p = (i - 1 + n) % n;
      let x = segN[2 * p] + segN[2 * i], y = segN[2 * p + 1] + segN[2 * i + 1];
      const l = Math.hypot(x, y) || 1;
      nrm[0] = x / l; nrm[1] = y / l;
    };
    function set(P) {
      for (let s = 0; s < n; s++) {
        const i1 = (s + 1) % n;
        const dr = P[2 * i1] - P[2 * s], dy = P[2 * i1 + 1] - P[2 * s + 1];
        const L = Math.hypot(dr, dy) || 1e-6;
        segN[2 * s] = dy / L; segN[2 * s + 1] = -dr / L;
        arc[s + 1] = arc[s] + L;
      }
      for (let s = 0; s < n; s++) {
        const i1 = (s + 1) % n;
        for (let e = 0; e < 2; e++) {
          const i = e ? i1 : s;
          const r = P[2 * i], y = P[2 * i + 1];
          pointN(i, s);
          const nr = nrm[0], ny = nrm[1];
          const v0 = arc[s + e] * 0.05;
          for (let j = 0; j <= steps; j++) {
            const v = s * vps + j * 2 + e;
            pos[3 * v] = r * cs[j]; pos[3 * v + 1] = y; pos[3 * v + 2] = r * sn[j];
            nor[3 * v] = nr * cs[j]; nor[3 * v + 1] = ny; nor[3 * v + 2] = nr * sn[j];
            uv[2 * v] = ph[j] * r * 0.05; uv[2 * v + 1] = v0;
          }
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
      geo.attributes.uv.needsUpdate = true;
    }
    return { geo, set };
  }
  // End caps (the section faces) at phi0 and phi1, triangulated once from the initial profile.
  function capGeo(n, P, phi0, phi1) {
    const contour = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(P[2 * i], P[2 * i + 1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const pos = new Float32Array(2 * n * 3), nor = new Float32Array(2 * n * 3), uv = new Float32Array(2 * n * 2);
    const idx = [];
    for (const [a, b, c] of tris) {
      const A2 = (P[2 * b] - P[2 * a]) * (P[2 * c + 1] - P[2 * a + 1]) - (P[2 * b + 1] - P[2 * a + 1]) * (P[2 * c] - P[2 * a]);
      // phi1 cap faces +tangent (needs A2 > 0), phi0 cap faces -tangent
      if (A2 > 0) idx.push(n + a, n + b, n + c, c, b, a); else idx.push(n + c, n + b, n + a, a, b, c);
    }
    const ends = [phi0, phi1];
    for (let e = 0; e < 2; e++) {
      const ph = ends[e], sgn = e ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const v = e * n + i;
        nor[3 * v] = -Math.sin(ph) * sgn; nor[3 * v + 1] = 0; nor[3 * v + 2] = Math.cos(ph) * sgn;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const c0 = Math.cos(phi0), s0 = Math.sin(phi0), c1 = Math.cos(phi1), s1 = Math.sin(phi1);
    function set(Q) {
      for (let i = 0; i < n; i++) {
        const r = Q[2 * i], y = Q[2 * i + 1];
        pos[3 * i] = r * c0; pos[3 * i + 1] = y; pos[3 * i + 2] = r * s0;
        pos[3 * (n + i)] = r * c1; pos[3 * (n + i) + 1] = y; pos[3 * (n + i) + 2] = r * s1;
        uv[2 * i] = uv[2 * (n + i)] = r * 0.05; uv[2 * i + 1] = uv[2 * (n + i) + 1] = y * 0.05;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.uv.needsUpdate = true;
    }
    set(P);
    return { geo, set };
  }
  // A revolved part = main piece + wedge piece, each with side surface and caps.
  function part(P, smooth, sideMat, capMat, parentMain, parentWedge) {
    const n = P.length / 2;
    const pieces = [
      [PH_M0, PH_M1, STEPS_M, parentMain],
      [PH_W0, PH_W1, STEPS_W, parentWedge],
    ].map(([a, b, steps, parent]) => {
      const side = latheGeo(n, smooth, a, b, steps);
      const cap = capGeo(n, P, a, b);
      side.set(P);
      side.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 600);
      cap.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 600);
      const ms = new THREE.Mesh(side.geo, sideMat), mc = new THREE.Mesh(cap.geo, capMat);
      parent.add(ms, mc);
      return { side, cap, ms, mc };
    });
    return { set(Q) { for (const p of pieces) { p.side.set(Q); p.cap.set(Q); } }, pieces };
  }

  // ------------------------------------------------------------------ profiles
  // gasket: bottom face -> outer wrap lip (with mould parting ridge) -> lip top -> hook over the
  // flange edge -> groove -> top face with inner raised band and double bead -> inner edge.
  const gP = new Float32Array(2 * 400), gS = new Uint8Array(400);
  let gN = 0;
  let k = 0;
  const put = (r, y, s = 1) => { gP[2 * k] = r; gP[2 * k + 1] = y; gS[k] = s; k++; };
  function gasketProfile(yc, fill, comp, flare) {
    k = 0;
    const ycs = Math.min(yc, YC0);
    const hookB = ycs + FL_T + 0.05, lipTop = hookB + HOOK_T;
    const bul = 0.7 * comp;
    const tip = 143.5 + 2.5 * flare;
    put(RI + 0.4, 0, 0);
    put(RLO - 1.2, 0, 1);
    for (let i = 1; i <= 3; i++) { const a = -Math.PI / 2 + i / 3 * Math.PI / 2; put(RLO - 1.2 + 1.2 * Math.cos(a), 1.2 + 1.2 * Math.sin(a)); }
    const y0 = 1.2, y1 = lipTop - 1.5, ym = (y0 + y1) / 2;
    for (const f of F_LO) put(RLO + bul * Math.sin(Math.PI * f), lerp(y0, y1, f));
    put(RLO + bul, ym - 0.22, 0); put(RLO + bul + 0.28, ym, 0); put(RLO + bul, ym + 0.22, 0); // parting line
    for (const f of F_HI) put(RLO + bul * Math.sin(Math.PI * f), lerp(y0, y1, f));
    put(RLO, y1);
    for (let i = 1; i <= 3; i++) { const a = i / 3 * Math.PI / 2; put(RLO - 1.5 + 1.5 * Math.cos(a), y1 + 1.5 * Math.sin(a)); }
    for (let i = 0; i <= 3; i++) { const a = Math.PI / 2 + i / 3 * Math.PI / 2; put(tip + 1.2 + 1.2 * Math.cos(a), lipTop - 1.2 + 1.2 * Math.sin(a)); }
    put(tip, hookB + 0.4); put(tip + 0.4, hookB, 0);
    put(RLI, hookB, 0);
    put(RLI, rubberTop(RLI, yc, fill), 0);
    for (let i = NS - 1; i >= 0; i--) { const r = sampleR(i); put(r, rubberTop(r, yc, fill), i === 0 ? 0 : 1); }
    const yt = gP[2 * (k - 1) + 1];
    for (const f of F_IN) put(RI - 0.9 * comp * Math.sin(Math.PI * f), lerp(yt, 0.4, f));
    put(RI, 0.4, 0);
    gN = k;
    return k;
  }
  gasketProfile(YC0 + 300, 0, 0, 0);
  const gProf = gP.subarray(0, 2 * gN), gSm = gS.slice(0, gN);

  // upper angle-ring flange (local y = 0 at the nominal contact plane), uneven contact face
  const upPts = [], upSm = [];
  const up = (r, y, s = 0) => { upPts.push(r, y); upSm.push(s); };
  up(RD_O, AMP * wav(RD_O), 0);
  for (let i = 0; i < NS; i++) { const r = sampleR(i); up(r, AMP * wav(r), i === NS - 1 ? 0 : 1); }
  up(RF, FL_T, 0);
  up(104.5, FL_T, 0);
  for (let i = 1; i < 3; i++) { const a = -Math.PI / 2 - i / 3 * Math.PI / 2; up(104.5 + 1.5 * Math.cos(a), FL_T + 1.5 + 1.5 * Math.sin(a), 1); }
  up(103, FL_T + 1.5, 0);
  up(103, 33, 0);
  up(100.2, 36, 1); // fillet weld to the duct
  up(RD_O, 36.4, 0);
  const upP = new Float32Array(upPts), upS = new Uint8Array(upSm);

  // lower angle-ring flange (top face at y = 0), extends under the gasket lip
  const loP = new Float32Array([RD_O, -36.4, 100.2, -36, 103, -33, 103, -4.5, 103.44, -3.44, 104.5, -3, 158, -3, 158, 0, RD_O, 0]);
  const loS = new Uint8Array([0, 1, 0, 0, 1, 0, 0, 0, 0]);
  const duP = new Float32Array([RD_I, 0, RD_O, 0, RD_O, H_UP, RD_I, H_UP]);
  const dlP = new Float32Array([RD_I, -H_LOW, RD_O, -H_LOW, RD_O, 0, RD_I, 0]);
  const d4 = new Uint8Array(4);

  // ------------------------------------------------------------------ assembly graph
  const gasket = new THREE.Group();           // spins in beat 1
  const gMain = new THREE.Group(), gWedge = new THREE.Group();
  gasket.add(gMain, gWedge);
  const upper = new THREE.Group(), lower = new THREE.Group();
  const upMain = new THREE.Group(), upWedge = new THREE.Group(), loMain = new THREE.Group(), loWedge = new THREE.Group();
  upper.add(upMain, upWedge); lower.add(loMain, loWedge);
  const wedgeParts = [gWedge, upWedge, loWedge];
  asm.add(gasket, upper, lower);

  const gPart = part(gProf, gSm, rubber, rubberCut, gMain, gWedge);
  part(upP, upS, steelFlange, steelCut, upMain, upWedge);
  part(duP, d4, steel, steelCut, upMain, upWedge);
  part(loP, loS, steelFlange, steelCut, loMain, loWedge);
  part(dlP, d4, steel, steelCut, loMain, loWedge);

  // hole walls: slot (gasket, height scaled to the body) and round (flanges)
  function holeWalls(angles, hl, hw, y0, y1) {
    const M = 14, out = [];
    for (let h = 0; h < 2; h++) for (let i = 0; i <= M; i++) {
      const th = (h ? Math.PI / 2 : -Math.PI / 2) + i / M * Math.PI;
      out.push([(h ? -hl : hl) + hw * Math.cos(th), hw * Math.sin(th), Math.cos(th), Math.sin(th)]);
    }
    const pos = [], nor = [];
    for (const al of angles) {
      const tx = -Math.sin(al), tz = Math.cos(al), rx = Math.cos(al), rz = Math.sin(al);
      const P = (s, d, y) => [RB * rx + s * tx + d * rx, y, RB * rz + s * tz + d * rz];
      const N = (ns, nd) => [-(ns * tx + nd * rx), 0, -(ns * tz + nd * rz)];
      for (let i = 0; i < out.length; i++) {
        const a = out[i], b = out[(i + 1) % out.length];
        const A0 = P(a[0], a[1], y0), A1 = P(a[0], a[1], y1), B0 = P(b[0], b[1], y0), B1 = P(b[0], b[1], y1);
        const na = N(a[2], a[3]), nb = N(b[2], b[3]);
        // wind so the face normal points into the hole
        const e1 = [B0[0] - A0[0], 0, B0[2] - A0[2]];
        const cross = [-(e1[2]) * (y1 - y0), 0, e1[0] * (y1 - y0)]; // e1 x up*(y1-y0)
        const inward = cross[0] * (na[0] + nb[0]) + cross[2] * (na[2] + nb[2]) > 0;
        const quad = inward ? [A0, B0, A1, B0, B1, A1] : [A0, A1, B0, B0, A1, B1];
        const qn = inward ? [na, nb, na, nb, nb, na] : [na, na, nb, nb, na, nb];
        for (const p of quad) pos.push(...p);
        for (const nn of qn) nor.push(...nn);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    return geo;
  }
  const boltAng = Array.from({ length: N_BOLT }, (_, i) => HOLE_A0 + i * TAU / N_BOLT);
  const restAng = boltAng.slice(1);
  const slotMain = new THREE.Mesh(holeWalls(restAng, SLOT_HL, SLOT_HW, 0, 1), rubberWall);
  const slotWedge = new THREE.Mesh(holeWalls([boltAng[0]], SLOT_HL, SLOT_HW, 0, 1), rubberWall);
  gMain.add(slotMain); gWedge.add(slotWedge);
  upMain.add(new THREE.Mesh(holeWalls(restAng, 0, HOLE_R, 0.6, FL_T), steel));
  upWedge.add(new THREE.Mesh(holeWalls([boltAng[0]], 0, HOLE_R, 0.6, FL_T), steel));
  loMain.add(new THREE.Mesh(holeWalls(restAng, 0, HOLE_R, -FL_T, 0), steel));
  loWedge.add(new THREE.Mesh(holeWalls([boltAng[0]], 0, HOLE_R, -FL_T, 0), steel));

  // ------------------------------------------------------------------ fasteners (zinc plated M8)
  const { mergeGeometries } = await import("three/addons/utils/BufferGeometryUtils.js");
  const hexShape = (R) => {
    const s = new THREE.Shape();
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + TAU / 12; i ? s.lineTo(R * Math.cos(a), R * Math.sin(a)) : s.moveTo(R * Math.cos(a), R * Math.sin(a)); }
    s.closePath();
    return s;
  };
  const head = new THREE.ExtrudeGeometry(hexShape(7.0), { depth: 4.5, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.45, bevelSegments: 2, curveSegments: 1 });
  head.translate(0, 0, 0.4).rotateX(-Math.PI / 2);
  const shank = new THREE.CylinderGeometry(4, 4, 35, low ? 16 : 22, low ? 70 : 110, true);
  {
    const p = shank.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const th = Math.atan2(x, z);
      const f = ((y / 1.25 + th / TAU) % 1 + 1) % 1;
      const thread = sstep(5, 2, y); // plain shank near the head, threads on the lower 25 mm
      const r = 4 - 0.65 * thread * Math.abs(2 * f - 1);
      const k = r / Math.hypot(x, z);
      p.setXYZ(i, x * k, y - 17.5, z * k);
    }
    shank.computeVertexNormals();
  }
  const tipCap = new THREE.CircleGeometry(3.5, 16).rotateX(Math.PI / 2).translate(0, -35, 0);
  const boltGeo = mergeGeometries([head, shank.toNonIndexed(), tipCap.toNonIndexed()]);
  const nutShape = hexShape(7.0);
  const bore = new THREE.Path(); bore.absarc(0, 0, 4, 0, TAU, true); nutShape.holes.push(bore);
  const nutGeo = new THREE.ExtrudeGeometry(nutShape, { depth: 5.7, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.45, bevelSegments: 2, curveSegments: 16 });
  nutGeo.translate(0, 0, 0.4).rotateX(-Math.PI / 2);
  const wasG = latheGeo(4, new Uint8Array(4), 0, TAU, 40);
  wasG.set(new Float32Array([4.4, 0, 7, 0, 7, 1.6, 4.4, 1.6]));
  const bolts = new THREE.InstancedMesh(boltGeo, zinc, N_BOLT);
  const nuts = new THREE.InstancedMesh(nutGeo, zinc, N_BOLT);
  const washers = new THREE.InstancedMesh(wasG.geo, zinc, N_BOLT * 2);
  for (const m of [bolts, nuts, washers]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; asm.add(m); }

  // ------------------------------------------------------------------ particles (world-size soft points)
  function makePoints(N, tint) {
    const pos = new Float32Array(N * 3), size = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: sprite }, scale: { value: 1 }, tint: { value: tint } },
      vertexShader: `attribute float aSize; uniform float scale; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = step(0.000001, aSize);
          gl_PointSize = aSize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 tint; varying float vA;
        void main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(tint * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.userData.noShadow = true;
    const vp = new THREE.Vector4();
    pts.onBeforeRender = (renderer, _s, cam) => {
      renderer.getCurrentViewport(vp);
      mat.uniforms.scale.value = vp.w / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    };
    asm.add(pts);
    return { pos, size, geo };
  }
  const N_AIR = low ? 220 : 420, N_LEAK = low ? 60 : 110;
  const air = makePoints(N_AIR, new THREE.Color(0.35, 1.0, 3.2));
  const leak = makePoints(N_LEAK, new THREE.Color(0.45, 1.25, 3.6));
  const rr = rng(21);
  const airP = Array.from({ length: N_AIR }, () => ({ a: rr() * TAU, r: 90 * Math.sqrt(rr()), y: rr(), v: 0.18 + rr() * 0.16, s: 0.0013 + rr() * 0.0016, w: rr() * TAU }));
  const leakP = Array.from({ length: N_LEAK }, () => ({ u: rr(), v: 0.16 + rr() * 0.1, s: 0.00022 + rr() * 0.0002, j: rr() - 0.5, dp: rr() }));

  // orange seal line along both cut faces at the rubber/flange interface
  const RIB_N = NS + 1;
  const ribPos = new Float32Array(2 * RIB_N * 2 * 3);
  const ribIdx = [];
  for (let c = 0; c < 2; c++) for (let i = 0; i < RIB_N - 1; i++) {
    const a = (c * RIB_N + i) * 2;
    ribIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute("position", new THREE.BufferAttribute(ribPos, 3).setUsage(THREE.DynamicDrawUsage));
  ribGeo.setIndex(ribIdx);
  const ribMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(ctx.color.orange).multiplyScalar(3.2), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const ribbon = new THREE.Mesh(ribGeo, ribMat);
  ribbon.frustumCulled = false;
  ribbon.userData.noShadow = true;
  asm.add(ribbon);
  const capEnds = [
    { ph: PH_M1, ox: -Math.sin(PH_M1), oz: Math.cos(PH_M1) },
    { ph: PH_M0, ox: Math.sin(PH_M0), oz: -Math.cos(PH_M0) },
  ];

  // ------------------------------------------------------------------ camera path
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const sph = (az, el, d, look) => {
    const a = az * D2R, e = el * D2R;
    return look.clone().add(V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(d));
  };
  const L0 = V(0, 0.004, 0);
  const macroP = V(121 * Math.cos(PH_W0), 4.2, 118 * Math.sin(PH_W0)).multiplyScalar(0.001);
  const macroDir = V(-Math.sin(PH_W0), 0.17, Math.cos(PH_W0)).normalize();
  const macroSide = V(Math.cos(PH_W0), 0, Math.sin(PH_W0));
  const keys = [
    { t: 0, pos: sph(36, 33, 0.58, L0), look: L0, lens: 50 },
    { t: 3.1, pos: sph(-6, 38, 0.55, L0), look: L0, lens: 50 },
    { t: 4.9, pos: sph(-16, 15, 0.98, V(0, 0.02, 0)), look: V(0, 0.02, 0), lens: 45 },
    { t: 6.3, pos: sph(8, 24, 0.66, V(0, 0.012, 0)), look: V(0, 0.012, 0), lens: 50 },
    { t: 7.5, pos: sph(16, 20, 0.6, V(0, 0.005, 0)), look: V(0, 0.005, 0), lens: 50 },
    { t: 8.3, pos: sph(0, 10, 0.5, V(0, 0.018, 0)), look: V(0, 0.018, 0), lens: 50 },
    { t: 9.1, pos: macroP.clone().addScaledVector(macroDir, 0.105).addScaledVector(macroSide, -0.003), look: macroP.clone(), lens: 80, focus: macroP },
    { t: 10.9, pos: macroP.clone().addScaledVector(macroDir, 0.092).addScaledVector(macroSide, 0.003), look: macroP.clone().addScaledVector(macroSide, 0.002), lens: 80, focus: macroP },
    { t: 12.0, pos: sph(-5, 12, 0.54, V(0, 0.0, 0)), look: V(0, 0.0, 0), lens: 50 },
    { t: 12.9, pos: sph(5, 15, 0.58, V(0, 0.004, 0)), look: V(0, 0.004, 0), lens: 50 },
    { t: 14.1, pos: sph(24, 21, 0.72, L0), look: L0, lens: 50 },
  ];
  keys.push({ ...keys[0], t: DUR });
  for (const k of keys) k.focusV = k.focus ? k.focus.clone() : k.look.clone();
  function sample(get, t) {
    const n = keys.length;
    if (t <= keys[0].t) return get(keys[0]);
    if (t >= keys[n - 1].t) return get(keys[n - 1]);
    let i = 0;
    while (keys[i + 1].t < t) i++;
    const val = (k) => get(keys[k]);
    const tan = (k) => {
      if (k === 0 || k === n - 1) return 0;
      const a = val(k - 1), b = val(k), c = val(k + 1);
      if ((b - a) * (c - b) <= 0) return 0;
      return (c - a) / (keys[k + 1].t - keys[k - 1].t);
    };
    const h = keys[i + 1].t - keys[i].t, u = (t - keys[i].t) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * val(i) + (u3 - 2 * u2 + u) * h * tan(i) + (-2 * u3 + 3 * u2) * val(i + 1) + (u3 - u2) * h * tan(i + 1);
  }
  const gx = (k) => k.pos.x, gy = (k) => k.pos.y, gz = (k) => k.pos.z;
  const lx = (k) => k.look.x, ly = (k) => k.look.y, lz = (k) => k.look.z;
  const fx = (k) => k.focusV.x, fy = (k) => k.focusV.y, fz = (k) => k.focusV.z, gl = (k) => k.lens;
  const focusPt = new THREE.Vector3();

  // ------------------------------------------------------------------ animation
  const m4 = new THREE.Matrix4(), qv = new THREE.Quaternion(), pv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  let last = { yc: NaN, fill: NaN, comp: NaN, flare: NaN };

  function update(t) {
    t = ((t % DUR) + DUR) % DUR;

    // --- joint state
    const dUp = 300 * (1 - ramp(t, 3.7, 4.9)) + 300 * ramp(t, 13.6, 14.3);
    const dLo = -190 * (1 - ramp(t, 3.3, 4.3)) - 190 * ramp(t, 13.7, 14.4);
    const release = 1 - ramp(t, 13.15, 13.65);
    const comp = (0.8 * ramp(t, 6.1, 7.4) + 0.2 * ramp(t, 9.9, 10.6)) * release;
    const fill = ramp(t, 9.9, 10.7) * release;
    const yc = YC0 + dUp - (YC0 - YCMIN) * comp;
    const flare = clamp01((8.5 - dUp) / 2) * clamp01(dUp / 0.3);
    upper.position.y = yc;
    lower.position.y = dLo;
    upper.visible = dUp < 299;
    lower.visible = dLo > -189;

    // --- gasket shape (rebuilt only while it changes)
    if (yc !== last.yc || fill !== last.fill || comp !== last.comp || flare !== last.flare) {
      last.yc = yc; last.fill = fill; last.comp = comp; last.flare = flare;
      gasketProfile(yc, fill, comp, flare);
      gPart.set(gProf);
      const hTop = rubberTop(RB, yc, fill);
      slotMain.scale.y = slotWedge.scale.y = hTop;
    }

    // --- spin while free (6-fold symmetric and uncut, so wrapping by 60° is invisible)
    const tt = t < 4.2 ? t + DUR : t;
    const u = (tt - 14.3) / 4.9;
    gasket.rotation.y = u > 0 && u < 1 ? (TAU / 3 * ease(u)) % (TAU / 6) : 0;

    // --- cut-away quarter: slides out toward the camera and lifts away, then comes back
    const wOut = ramp(t, 7.5, 8.0) * (1 - ramp(t, 13.05, 13.4));
    const wUp = ramp(t, 7.75, 8.35) * (1 - ramp(t, 12.7, 13.2));
    for (let i = 0; i < wedgeParts.length; i++) {
      const w = wedgeParts[i];
      w.position.set(0, 520 * wUp * wUp, 45 * wOut);
      w.visible = wUp < 0.98;
    }

    // --- fasteners
    const flTop = yc + FL_T;
    for (let i = 0; i < N_BOLT; i++) {
      const al = boltAng[i];
      const bx = RB * Math.cos(al), bz = RB * Math.sin(al);
      const inW = i === 0;
      const wz = inW ? 45 * wOut : 0, wy = inW ? 520 * wUp * wUp : 0;
      const drop = ramp(t, 5.0 + 0.11 * i, 5.6 + 0.11 * i) * (1 - ramp(t, 13.2 + 0.05 * i, 13.7 + 0.05 * i));
      const rise = ramp(t, 5.5 + 0.1 * i, 6.1 + 0.1 * i) * (1 - ramp(t, 13.2, 13.65));
      const turn = ramp(t, 6.1 + 0.06 * i, 7.4);
      const hide = drop <= 0.001 || (inW && wUp > 0.98);
      // head + upper washer
      const hb = flTop + 1.6 + 90 * (1 - drop) * (1 - drop);
      qv.setFromAxisAngle(yAxis, -turn * TAU * 4 - (1 - drop) * 3 + 0.3 * i);
      pv.set(bx, hb + wy, bz + wz);
      bolts.setMatrixAt(i, hide ? m4.makeScale(0, 0, 0) : m4.compose(pv, qv, one));
      pv.set(bx, hb - 1.6 + wy, bz + wz);
      washers.setMatrixAt(2 * i, hide ? m4.makeScale(0, 0, 0) : m4.compose(pv, qv, one));
      // nut + lower washer rise from below and spin up
      const nb = dLo - FL_T - 1.6 - 6.5 - 70 * (1 - rise) * (1 - rise);
      const hideN = rise <= 0.001 || (inW && wUp > 0.98);
      qv.setFromAxisAngle(yAxis, (1 - rise) * 9 + turn * 2 + 0.5 * i);
      pv.set(bx, nb + wy, bz + wz);
      nuts.setMatrixAt(i, hideN ? m4.makeScale(0, 0, 0) : m4.compose(pv, qv, one));
      pv.set(bx, nb + 6.5 + wy, bz + wz);
      washers.setMatrixAt(2 * i + 1, hideN ? m4.makeScale(0, 0, 0) : m4.compose(pv, qv, one));
    }
    bolts.instanceMatrix.needsUpdate = nuts.instanceMatrix.needsUpdate = washers.instanceMatrix.needsUpdate = true;

    // --- air inside the duct (blue): flows through the joint, presses on the seal, stays inside
    const airOn = ramp(t, 8.5, 9.1) * (1 - ramp(t, 12.9, 13.3));
    for (let i = 0; i < N_AIR; i++) {
      const p = airP[i];
      const k = (p.y + p.v * t) % 1;
      const y = -H_LOW + 30 + k * (H_LOW + 170);
      const near = Math.exp(-((y - yc * 0.5) ** 2) / 300);
      const r = Math.min(97.5, p.r + (97.5 - p.r) * near * (0.55 + 0.45 * Math.sin(t * 6 + p.w)));
      const a = p.a + 0.15 * Math.sin(t * 0.7 + p.w);
      air.pos[3 * i] = r * Math.cos(a); air.pos[3 * i + 1] = y; air.pos[3 * i + 2] = r * Math.sin(a);
      const edge = Math.min(1, k * 8, (1 - k) * 8);
      air.size[i] = airOn * edge * p.s;
    }
    air.geo.attributes.position.needsUpdate = air.geo.attributes.aSize.needsUpdate = true;

    // --- macro leak through the micro gaps between rubber and flange (blocked once filled)
    const leakOn = ramp(t, 8.9, 9.3) * (1 - ramp(t, 11.2, 11.6));
    let rStop = RF + 6;
    if (leakOn > 0) {
      for (let i = 0; i < NS; i++) {
        const r = sampleR(i);
        const gap = yc + AMP * wav(r) - rubberTop(r, yc, fill);
        if (gap < 0.06) { rStop = r; break; }
      }
    }
    const ph = PH_M1 + 0.0035;
    const cph = Math.cos(ph), sph2 = Math.sin(ph);
    for (let i = 0; i < N_LEAK; i++) {
      const p = leakP[i];
      const k = (p.u + p.v * t) % 1;
      let r = 86 + k * 66;
      let fade = Math.min(1, k * 6, (1 - k) * 6);
      if (r > rStop - 0.3) { // blocked: bounce back from the sealed face
        const over = r - (rStop - 0.3);
        r = rStop - 0.3 - over * 0.6;
        fade *= Math.max(0, 1 - over / 12);
      }
      let y;
      if (r < RI) {
        const gm = yc - G0 * (1 - fill) * 0.5;
        y = lerp(yc * 0.5 + p.j * 2.4, gm, sstep(93, RI, r));
      } else {
        const fb = yc + AMP * wav(r), rt = rubberTop(r, yc, fill);
        y = (fb + rt) * 0.5 + p.j * Math.max(0, fb - rt) * 0.6;
      }
      leak.pos[3 * i] = r * cph; leak.pos[3 * i + 1] = y; leak.pos[3 * i + 2] = r * sph2;
      leak.size[i] = leakOn * fade * p.s;
    }
    leak.geo.attributes.position.needsUpdate = leak.geo.attributes.aSize.needsUpdate = true;

    // --- orange seal line once the rubber has flowed into the face
    const glow = ramp(t, 10.35, 10.8) * (1 - ramp(t, 12.6, 13.0));
    ribbon.visible = glow > 0.001;
    if (ribbon.visible) {
      ribMat.opacity = glow * (0.75 + 0.25 * Math.sin(t * 5));
      for (let c = 0; c < 2; c++) {
        const e = capEnds[c], cc = Math.cos(e.ph), ss = Math.sin(e.ph);
        for (let i = 0; i < RIB_N; i++) {
          const r = i < NS ? sampleR(i) : RLI;
          const y = i < NS ? rubberTop(r, yc, fill) : rubberTop(RLI, yc, fill);
          const v = (c * RIB_N + i) * 2;
          for (let s = 0; s < 2; s++) {
            const o = 3 * (v + s);
            ribPos[o] = r * cc + e.ox * 0.25; ribPos[o + 1] = y + (s ? 0.11 : -0.11); ribPos[o + 2] = r * ss + e.oz * 0.25;
          }
        }
      }
      ribGeo.attributes.position.needsUpdate = true;
    }

    // --- camera
    camera.position.set(sample(gx, t), sample(gy, t), sample(gz, t));
    target.set(sample(lx, t), sample(ly, t), sample(lz, t));
    focusPt.set(sample(fx, t), sample(fy, t), sample(fz, t));
    ctx.focus = focusPt;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(24 / (2 * sample(gl, t))));
  }

  return {
    root,
    duration: DUR,
    stage: { center: [0, 0.0, 0], size: 0.34, floorY: -0.31 },
    enter() { update(0); },
    update,
  };
}
