// Oil-free two-stage rotary screw compressor package on an open skid.
// (geometry: blender/scenes/compressor.py -> models/compressor.glb; airflow path: models/compressor.json).
// Black open-frame package, closed control cabinet on the left end, off-white airend in the middle.
// Stage 1 (right of the gearbox): rotors stacked one above the other. Stage 2 (left): rotors upright,
// side by side. Beats (12 s loop): 3/4 front-left hero dolly -> push in through the open front ->
// casings lift off, rotors spin, air flows filter -> stage 1 -> cooler -> stage 2 -> silencer
// (blue = cool, orange = hot) -> reassemble and pull back to the hero angle.
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const TAU = Math.PI * 2;
const LOOP = 12;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const easeOutBack = (x, s = 1.2) => { x = clamp01(x); return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2; };

// camera keys (seconds, three.js Y-up metres). First == last so the loop is seamless.
// t = 0: 3/4 view from the front-right corner, cabinet at the far left.
const CAM = [
  { t: 0.0, pos: [3.55, 1.45, 4.75], look: [0.15, 0.88, 0.0], lens: 48 },
  { t: 2.9, pos: [3.15, 1.52, 4.95], look: [0.2, 0.88, 0.0], lens: 48 },
  { t: 4.7, pos: [2.35, 1.5, 3.0], look: [0.68, 0.78, 0.3], lens: 40 },
  { t: 6.2, pos: [1.65, 1.55, 1.95], look: [0.74, 0.8, 0.3], lens: 35 },
  { t: 8.2, pos: [1.25, 2.2, 1.6], look: [0.76, 0.78, 0.12], lens: 35 },
  { t: 9.8, pos: [2.7, 1.7, 4.1], look: [0.35, 0.86, 0.1], lens: 42 },
  { t: 12.0, pos: [3.55, 1.45, 4.75], look: [0.15, 0.88, 0.0], lens: 48 },
];
// stage-head parts that come off (three.js space): offset, rotation axis + angle about their own centre
const EXPLODE = [
  { name: "s1_shell_front", off: [0.04, -0.12, 0.5], axis: [1, 0, 0], ang: 1.9, delay: 0, stage: 0 },
  { name: "s2_shell_front", off: [0.0, 0.5, -0.3], axis: [1, 0, 0], ang: -0.5, delay: 0.2, stage: 1 },
  { name: "s1_cap", off: [0.3, 0, 0], axis: [0, 1, 0], ang: 0, delay: 0.1, stage: -1 },
  { name: "s2_cap", off: [0.26, 0, 0], axis: [0, 1, 0], ang: 0, delay: 0.3, stage: -1 },
];
const T_OPEN = 5.0, T_CLOSE = 8.7;

// Hermite through keys with clamped Catmull-Rom tangents (no overshoot on monotone runs).
function keyTrack(ts, vs) {
  const n = ts.length, m = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const a = vs[i - 1], b = vs[i], c = vs[i + 1];
    m[i] = (b >= a && b >= c) || (b <= a && b <= c) ? 0 : (c - a) / (ts[i + 1] - ts[i - 1]);
  }
  return (f) => {
    if (f <= ts[0]) return vs[0];
    if (f >= ts[n - 1]) return vs[n - 1];
    let i = 0;
    while (f > ts[i + 1]) i++;
    const h = ts[i + 1] - ts[i], s = (f - ts[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * vs[i] + (s3 - 2 * s2 + s) * h * m[i]
      + (-2 * s3 + 3 * s2) * vs[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

function softSprite(THREE) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.35, "rgba(255,255,255,0.75)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Braided insulation sleeve: woven diamond pattern used as colour and bump.
function braidTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const u = (x + y) / 8, w = (x - y + 128) / 8;
      const over = (Math.floor(u) + Math.floor(w)) & 1;
      const f = over ? w - Math.floor(w) : u - Math.floor(u);
      const v = Math.round(255 * (0.35 + 0.6 * Math.sin(Math.PI * f)));
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Merge static meshes that share a material under the same animated anchor.
function mergeStatic(THREE, root, anchors) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || anchors.has(o)) return;
    let a = o.parent;
    while (a && !anchors.has(a)) a = a.parent;
    a ??= root;
    const key = a.uuid + "|" + o.material.uuid;
    if (!groups.has(key)) groups.set(key, { anchor: a, material: o.material, meshes: [] });
    groups.get(key).meshes.push(o);
  });
  for (const { anchor, material, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    const keepUV = !!(material.map || material.bumpMap) && meshes.every((m) => m.geometry.attributes.uv);
    const inv = new THREE.Matrix4().copy(anchor.matrixWorld).invert();
    const geos = meshes.map((m) => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && !(keepUV && k === "uv")) g.deleteAttribute(k);
      return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    });
    const merged = new THREE.Mesh(mergeGeometries(geos), material);
    merged.name = meshes[0].name + "_merged";
    merged.userData.noShadow = meshes[0].userData.noShadow;
    anchor.add(merged);
    for (const m of meshes) m.removeFromParent();
  }
}

export default async function create(ctx) {
  const { THREE, camera, target } = ctx;
  const [model, data] = await Promise.all([
    ctx.loadGLB("models/compressor.glb"),
    fetch(new URL("../models/compressor.json", import.meta.url)).then((r) => r.json()),
  ]);
  const root = new THREE.Group();
  root.add(model);

  // ---------------------------------------------------------------- materials
  const braid = braidTexture(THREE);
  const M = {
    pkg_black: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.62, metalness: 0.1 }),
    frame_black: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.5, metalness: 0.35 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x060707, roughness: 0.8, metalness: 0 }),
    alu_cast: new THREE.MeshStandardMaterial({ color: 0xc6c8c5, roughness: 0.52, metalness: 0.08 }),
    bolt: new THREE.MeshStandardMaterial({ color: 0x8c939a, roughness: 0.35, metalness: 1 }),
    rotor: new THREE.MeshStandardMaterial({ color: 0xc2cad2, roughness: 0.2, metalness: 1, envMapIntensity: 1.3 }),
    rotor_f: new THREE.MeshStandardMaterial({ color: 0x9aa4b0, roughness: 0.26, metalness: 1, envMapIntensity: 1.3 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a157, roughness: 0.32, metalness: 1 }),
    stainless: new THREE.MeshStandardMaterial({ color: 0xbfc4c9, roughness: 0.3, metalness: 1 }),
    polished: new THREE.MeshStandardMaterial({ color: 0xdde1e5, roughness: 0.15, metalness: 1 }),
    braid: new THREE.MeshStandardMaterial({ color: 0xb4b7bb, map: braid, bumpMap: braid, bumpScale: 4, roughness: 0.62, metalness: 0.25 }),
    rubber: ctx.mat.rubber,
    cooler_fin: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.42, metalness: 0.7 }),
    motor: new THREE.MeshStandardMaterial({ color: 0x1f2225, roughness: 0.5, metalness: 0.25 }),
    hmi_bezel: new THREE.MeshStandardMaterial({ color: 0x9a9ea2, roughness: 0.45, metalness: 0.1 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x0a0f14, emissive: 0x2a4a6a, emissiveIntensity: 0.55, roughness: 0.2 }),
    estop: new THREE.MeshPhysicalMaterial({ color: 0xc8221c, roughness: 0.3, clearcoat: 0.5 }),
    canister: new THREE.MeshStandardMaterial({ color: 0xe4e4e1, roughness: 0.4, metalness: 0 }),
  };
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = M[o.material.name];
    if (m) o.material = m;
    if (m === M.screen) o.userData.noShadow = true;
  });

  // ---------------------------------------------------------------- animated parts
  const byName = (n) => model.getObjectByName(n);
  const rotors = [
    { o: byName("s1_male"), male: true }, { o: byName("s1_female"), male: false },
    { o: byName("s2_male"), male: true }, { o: byName("s2_female"), male: false },
  ];
  for (const r of rotors) r.q0 = r.o.quaternion.clone();
  const shells = EXPLODE.map((e) => {
    const o = byName(e.name);
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    o.parent.worldToLocal(c);
    return { ...e, o, c, pos0: o.position.clone(), q0: o.quaternion.clone(),
      offV: new THREE.Vector3(...e.off), axisV: new THREE.Vector3(...e.axis).normalize() };
  });
  // casing volumes: particles inside only show while that casing is open
  const casing = ["s1", "s2"].map((k) => ["_shell_back", "_shell_front", "_cap"]
    .reduce((b, n) => b.union(new THREE.Box3().setFromObject(byName(k + n))), new THREE.Box3()).expandByScalar(0.01));
  mergeStatic(THREE, model, new Set([...rotors.map((r) => r.o), ...shells.map((s) => s.o)]));

  // interior practicals: only while the camera is inside the package
  const inCool = new THREE.PointLight(0xdcEAff, 0, 2.4, 2);
  inCool.position.set(0.25, 1.35, 0.75);
  const inWarm = new THREE.PointLight(0xffc08a, 0, 1.8, 2);
  inWarm.position.set(-0.2, 0.35, 0.95);
  root.add(inCool, inWarm);

  // ---------------------------------------------------------------- airflow particles
  const flow = data.flow, T = data.flowT;
  const fT = flow.map((s) => s.t);
  const stageOpen = [0, 0];
  const low = ctx.tier === "low";
  const N = low ? 300 : 460, TRAIL = 3, COUNT = N * TRAIL;
  const pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3), size = new Float32Array(COUNT);
  const parts = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const g = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(Math.sqrt(rnd()));
    parts.push({ phase: (i + rnd()) / N, jit: g, sc: 0.75 + rnd() * 0.5 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.5);
  const sprite = softSprite(THREE);
  const pointsMat = (gain) => new THREE.ShaderMaterial({
    uniforms: { map: { value: sprite }, scale: { value: 1 }, gain: { value: gain } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vColor; uniform float scale;
      void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale * 0.5 * projectionMatrix[1][1] / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform float gain; varying vec3 vColor;
      void main(){ float a = texture2D(map, gl_PointCoord).a; if (a < 0.01) discard; gl_FragColor = vec4(vColor * a * gain, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const pm = pointsMat(1, true);
  const points = new THREE.Points(geo, pm);
  points.userData.noShadow = true;
  points.frustumCulled = false;
  points.renderOrder = 3;
  const buf = new THREE.Vector2();
  points.onBeforeRender = (renderer) => { pm.uniforms.scale.value = renderer.getDrawingBufferSize(buf).y; };
  root.add(points);

  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  const c3 = [0, 0, 0];
  function sample(tau, out) {
    let lo = 1, hi = fT.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (fT[mid] <= tau) lo = mid + 1; else hi = mid; }
    const a = flow[lo - 1], b = flow[lo];
    const u = clamp01((tau - a.t) / Math.max(1e-9, b.t - a.t));
    out.set(a.p[0], a.p[1], a.p[2]).lerp(pb.set(b.p[0], b.p[1], b.p[2]), u);
    for (let k = 0; k < 3; k++) c3[k] = a.c[k] + (b.c[k] - a.c[k]) * u;
    return a.w + (b.w - a.w) * u;
  }
  function updateFlow(ph, vis) {
    const glow = 1.6 * vis;
    for (let i = 0; i < N; i++) {
      const p = parts[i];
      for (let k = 0; k < TRAIL; k++) {
        const x = ((p.phase + ph * 2 - k * 0.0018) % 1 + 1) % 1;
        const w = sample(x * T, pa);
        pa.addScaledVector(p.jit, w);
        const j = (i * TRAIL + k) * 3;
        pos[j] = pa.x; pos[j + 1] = pa.y; pos[j + 2] = pa.z;
        let fade = ramp(x, 0, 0.04) * (1 - ramp(x, 0.95, 1)) * (1 - k / TRAIL) ** 1.5;
        for (let q = 0; q < 2; q++) if (casing[q].containsPoint(pa)) fade *= stageOpen[q]; // hidden while the casing is shut
        col[j] = c3[0] * glow * fade; col[j + 1] = c3[1] * glow * fade; col[j + 2] = c3[2] * glow * fade;
        size[i * TRAIL + k] = 0.024 * p.sc * (1 - k * 0.22);
      }
    }
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.size.needsUpdate = true;
  }

  // ---------------------------------------------------------------- camera
  const kt = CAM.map((k) => k.t);
  const tr = (get) => [0, 1, 2].map((i) => keyTrack(kt, CAM.map((k) => get(k)[i])));
  const camPos = tr((k) => k.pos), camLook = tr((k) => k.look);
  const camLens = keyTrack(kt, CAM.map((k) => k.lens));
  const focus = new THREE.Vector3(0.78, 0.8, 0.35);

  const qSpin = new THREE.Quaternion(), qR = new THREE.Quaternion(), tmp = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);

  function update(t) {
    const tt = ((t % LOOP) + LOOP) % LOOP;
    const ph = tt / LOOP;
    // rotors: male 18 / female 12 turns per loop (3:2), opposite directions; integer turns loop cleanly
    for (const r of rotors) {
      const a = r.male ? TAU * 18 * ph : -TAU * 12 * ph + 0.2618;
      r.o.quaternion.copy(r.q0).multiply(qSpin.setFromAxisAngle(X, a));
    }
    // casing halves lift off, hold, settle back
    shells.forEach((s, q) => {
      let e = easeOutBack((tt - T_OPEN - s.delay) / 1.1);
      e *= 1 - smooth((tt - T_CLOSE + s.delay) / 1.0);
      if (s.stage >= 0) stageOpen[s.stage] = clamp01(e * 2);
      qR.setFromAxisAngle(s.axisV, s.ang * e);
      tmp.copy(s.pos0).sub(s.c).applyQuaternion(qR).add(s.c).addScaledVector(s.offV, e);
      s.o.position.copy(tmp);
      s.o.quaternion.copy(qR).multiply(s.q0);
    });
    const inside = ramp(tt, 3.6, 4.8) * (1 - ramp(tt, 9.0, 10.2));
    inCool.intensity = 0.9 * inside;
    inWarm.intensity = 0.7 * inside;
    updateFlow(ph, 0.55 + 0.45 * inside);
    camera.position.set(camPos[0](tt), camPos[1](tt), camPos[2](tt));
    target.set(camLook[0](tt), camLook[1](tt), camLook[2](tt));
    ctx.focus = inside > 0.5 ? focus : null;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(24 / (2 * camLens(tt))));
  }

  return {
    root,
    duration: LOOP,
    stage: { center: [0, 1.0, 0], size: 2.3, floorY: 0 },
    update,
  };
}
