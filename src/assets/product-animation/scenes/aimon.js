// AI monitoring: a coupling direct-drive centrifugal fan with three triaxial vibration sensors:
//   (1) impeller-side bearing housing, (2) motor-side bearing housing, (3) motor drive end,
//   all at the same height (centre of the impeller-side bearing housing), mounted horizontally on
//   the +Z side face: 5 rays at dx -0.05..0.05 shot in -Z, outermost hit wins, body protrudes +Z.
//   V/A/H arrows stay world-oriented (V +Y green, A +X red = shaft axis, H +Z blue).
// Asset: models/aimon.glb = machine parts + coupling halves and guard in the bearing-motor gap.
//   0-3 s    wide three-quarter orbit; orange pulse rings at all three sensors; an AI scan band sweeps
//   3-6 s    a vibration waveform floats above the drive train; ~4.5 s it spikes and turns red:
//            sensor (2) on the motor-side bearing raises the alarm (leader line to the panel)
//   6-8.4 s  housing, inlet and cabinet go x-ray; the camera pushes in on the drive train
//            (coupling + all three sensors in frame), then leans toward (2)
//   8.4-10 s back out to the wide shot, the waveform calms and turns blue; the loop is seamless
const DURATION = 10;

export default async function create(ctx) {
  const { THREE, camera, target } = ctx;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b);
  const deg = THREE.MathUtils.degToRad;

  const ORANGE = new THREE.Color(ctx.color.orange);
  const RED = lin(1.0, 0.09, 0.025);
  const COOL = new THREE.Color(0x3fa9f5);
  const SCAN = lin(0.05, 0.42, 1.0);

  const root = new THREE.Group();
  const fan = await ctx.loadGLB("models/aimon.glb");
  root.add(fan);
  fan.updateMatrixWorld(true);
  const byName = (n) => fan.getObjectByName(n);
  const box = (o) => new THREE.Box3().setFromObject(o);

  // ---------------------------------------------------------------- materials
  // scanInv maps world back to root space, so the band stays put when the root is moved or scaled.
  const scanUniforms = { scanPos: { value: -10 }, scanColor: { value: SCAN }, scanInv: { value: new THREE.Matrix4() } };
  const withScan = (m) => {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, scanUniforms);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vScanW; uniform mat4 scanInv;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvScanW = (scanInv * modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vScanW; uniform float scanPos; uniform vec3 scanColor;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float sd = abs(dot(vScanW, normalize(vec3(0.94, 0.34, 0.0))) - scanPos);
          totalEmissiveRadiance += scanColor * ((1.0 - smoothstep(0.0, 0.04, sd)) * 7.0 + (1.0 - smoothstep(0.0, 0.4, sd)) * 0.45);`);
    };
    m.customProgramCacheKey = () => "aimon-scan";
    return m;
  };
  const paint = (hex, rough = 0.4, cc = 0.5) => new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0, roughness: rough, clearcoat: cc, clearcoatRoughness: 0.12 });
  const M = {
    housing: withScan(ctx.mat.paint.clone()),
    base: withScan(ctx.mat.navy.clone()),
    bearing: withScan(paint(0x9aa6b2, 0.42, 0.35)),
    motor: withScan(paint(0x34506e, 0.38, 0.55)),
    cabinet: paint(0x7d8a97, 0.48, 0.3),
    dark: ctx.mat.rubber,
    brushed: ctx.mat.brushed,
    steel: ctx.mat.steel,
    chrome: ctx.mat.chrome,
    impeller: new THREE.MeshStandardMaterial({ color: 0xaeb8c2, metalness: 1, roughness: 0.32 }),
    guard: new THREE.MeshPhysicalMaterial({ color: 0xc4ccd4, metalness: 0.2, roughness: 0.3, transparent: true, opacity: 0.2,
      side: THREE.DoubleSide, depthWrite: false }),
  };
  M.housing.color.multiplyScalar(0.8); // keeps the blue saturated under the studio rig
  // x-ray set: ~0.3 opacity, double-sided, no depth write while faded
  const xray = [];
  const xr = (m) => { const c = m.clone(); c.transparent = true; c.side = THREE.DoubleSide; c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; xray.push(c); return c; };
  const galv = new THREE.MeshStandardMaterial({ color: 0xb4bcc4, metalness: 1, roughness: 0.55 });
  const X = { housing: xr(M.housing), brushed: xr(galv), cabinet: xr(M.cabinet), cabinetSteel: xr(M.brushed), dark: xr(M.dark) };

  const assign = (node, pick) => byName(node)?.traverse((o) => { if (o.isMesh) o.material = pick(o.material.name, o); });
  const byMat = (gray, galv, dark) => (n) => (/galvan/i.test(n) ? galv : /dark/i.test(n) ? dark : gray);
  assign("Housing", byMat(X.housing, X.brushed, X.dark));
  assign("Inlet", () => X.housing);
  assign("Base", byMat(M.base, M.brushed, M.dark));
  assign("Bearing_Fan", () => M.bearing);
  const hot = M.bearing.clone(); // only the alarming housing glows
  hot.onBeforeCompile = M.bearing.onBeforeCompile; hot.customProgramCacheKey = M.bearing.customProgramCacheKey;
  hot.emissive = RED.clone(); hot.emissiveIntensity = 0;
  assign("Bearing_Motor", () => hot);
  assign("Motor", byMat(M.motor, M.brushed, M.dark));
  assign("ElectricalCabinet", byMat(X.cabinet, X.cabinetSteel, X.dark));
  assign("ElectricalCable", () => X.dark);
  assign("Impeller", () => M.impeller);
  assign("Shaft", () => M.chrome);
  assign("coupling_a", () => M.steel);
  assign("coupling_b", () => M.steel);
  assign("guard", () => M.guard);
  byName("guard").traverse((o) => { o.userData.noShadow = true; o.castShadow = false; });

  // spinning parts (pivots on the shaft axis, rotation about local X)
  const spinners = ["Impeller", "Shaft", "coupling_a", "coupling_b"].map(byName).filter(Boolean);
  const spin0 = spinners.map((o) => o.rotation.x);

  // ---------------------------------------------------------------- three sensors
  const shell = new THREE.MeshStandardMaterial({ color: 0x17191b, metalness: 0.15, roughness: 0.55 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.85 });
  const bodyGeo = new THREE.CylinderGeometry(0.0416, 0.0416, 0.095, 24).translate(0, 0.048, 0);
  const capGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.032, 24).translate(0, 0.112, 0);
  const ledGeo = new THREE.CylinderGeometry(0.0446, 0.0446, 0.005, 24, 1, true).translate(0, 0.0985, 0);
  // arrows: origin 0.10 out, length 0.32, head 0.09 long x 0.055 wide
  const arrowGeo = (() => {
    const s = new THREE.CylinderGeometry(0.0045, 0.0045, 0.23, 8).translate(0, 0.115, 0);
    const h = new THREE.ConeGeometry(0.0275, 0.09, 16).translate(0, 0.275, 0);
    const pos = [...s.attributes.position.array, ...h.attributes.position.array];
    const off = s.attributes.position.count;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex([...s.index.array, ...Array.from(h.index.array, (i) => i + off)]);
    return g;
  })();
  const axisMat = [0x22c55e, 0xef4444, 0x3b82f6].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
  const AXES = [[V(0, 1, 0), axisMat[0]], [V(1, 0, 0), axisMat[1]], [V(0, 0, 1), axisMat[2]]];
  const UP = V(0, 1, 0);

  function makeSensor() {
    const g = new THREE.Group();                 // position only -> arrows keep world orientation
    const body3d = new THREE.Group();
    body3d.rotation.x = Math.PI / 2;             // cylinder axis +Y -> +Z, base on the side face
    g.add(body3d);
    body3d.add(new THREE.Mesh(bodyGeo, shell), new THREE.Mesh(capGeo, capMat));
    const led = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: ORANGE.clone().multiplyScalar(5) }));
    led.userData.noShadow = true;
    body3d.add(led);
    for (const [dir, m] of AXES) {
      const a = new THREE.Mesh(arrowGeo, m);
      a.position.set(0, 0, 0.1);
      a.quaternion.setFromUnitVectors(UP, dir);
      a.userData.noShadow = true;
      a.castShadow = false;
      g.add(a);
    }
    return { g, led };
  }

  const ray = new THREE.Raycaster();
  const DIR = V(0, 0, -1);
  const bearBox = box(byName("Bearing_Fan"));
  const MOUNT_Y = bearBox.getCenter(V()).y;       // all three at the impeller-side bearing height
  const ringGeo = new THREE.TorusGeometry(1, 0.035, 6, 72);
  const sensors = [["Bearing_Fan", 0.5], ["Bearing_Motor", 0.5], ["Motor", 0.12]].map(([nm, xFrac], i) => {
    const node = byName(nm);
    const b = box(node);
    const x0 = b.min.x + (b.max.x - b.min.x) * xFrac;
    const meshes = [];
    node.traverse((o) => { if (o.isMesh) meshes.push(o); });
    let best = null;
    for (const dx of [-0.05, -0.025, 0, 0.025, 0.05]) {
      ray.set(V(x0 + dx, MOUNT_Y, b.max.z + 2), DIR);
      const h = ray.intersectObjects(meshes, true)[0];
      if (h && (!best || h.point.z > best.point.z)) best = h;
    }
    const s = makeSensor();
    s.g.position.set(best ? best.point.x : x0, MOUNT_Y, (best ? best.point.z : b.max.z) + 0.002);
    root.add(s.g);
    const rings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ORANGE.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      r.position.copy(s.g.position).z += 0.012;
      r.userData.noShadow = true;
      root.add(r);
      return r;
    });
    return { ...s, p: s.g.position, tip: s.g.position.clone().add(V(0, 0, 0.13)), rings, phase: i * 0.29 };
  });
  const ALARM = 1; // motor-side bearing
  const alarm = sensors[ALARM];
  const sensorsC = sensors.reduce((a, s) => a.add(s.p), V()).multiplyScalar(1 / 3);

  // core box: housing + base + motor + cabinet, used for framing
  const core = new THREE.Box3();
  for (const n of ["Housing", "Base", "Motor", "ElectricalCabinet"]) core.union(box(byName(n)));
  const coreC = core.getCenter(V());

  // ---------------------------------------------------------------- alarm glow (kept subtle)
  const glow = new THREE.PointLight(RED, 0, 0.6, 2);
  glow.position.copy(alarm.p).add(V(0, 0.05, 0.12));
  root.add(glow);

  // ---------------------------------------------------------------- camera framing
  const FOV = THREE.MathUtils.radToDeg(2 * Math.atan(24 / (2 * 45))); // 45 mm
  // az measured from +Z (the sensor side) toward +X (the motor end)
  const orbit = (out, c, az, el, d) => out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(d).add(c);
  const look0 = V(coreC.x - 0.05, 1.06, coreC.z);
  const AZ0 = deg(12), EL0 = deg(13), DIST0 = 8.9;
  // sensors sit in the upper third of the close shot so they clear the desktop hero text
  const look3 = V(sensorsC.x + 0.12, MOUNT_Y - 0.24, sensorsC.z);
  const lookA = alarm.p.clone().add(V(0.05, -0.24, 0.05));

  // ---------------------------------------------------------------- waveform panel (above the drive train)
  const N = 180, W = 0.86, PH = 0.32;
  const panel = new THREE.Group();
  panel.position.set(coreC.x + 0.55, 2.62, 0.45);
  panel.lookAt(orbit(V(), panel.position, AZ0, deg(4), 1));
  panel.scale.setScalar(1.45);
  root.add(panel);
  const panelY = panel.position.y;

  function ribbon(width, intensity, opacity) {
    const pos = new Float32Array(N * 2 * 3);
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ color: COOL.clone(), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.userData = { noShadow: true, width, intensity, opacity };
    panel.add(mesh);
    return mesh;
  }
  const core1 = ribbon(0.005, 7, 1);
  const halo = ribbon(0.028, 1.0, 0.45);
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.12, PH + 0.08), new THREE.MeshBasicMaterial({ color: 0x06142a, transparent: true, depthWrite: false }));
  backing.position.z = -0.005;
  backing.userData.noShadow = true;
  panel.add(backing);
  const gridPts = [];
  for (const y of [-PH / 2, 0, PH / 2]) gridPts.push(-W / 2 - 0.04, y, 0, W / 2 + 0.04, y, 0);
  for (let i = 0; i < 7; i++) { const x = -W / 2 + (W * i) / 6; gridPts.push(x, -PH / 2, 0, x, -PH / 2 + 0.025, 0); }
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(0xa9c6e2).multiplyScalar(2.5), transparent: true, depthWrite: false }),
  );
  panel.add(grid);

  const leadPos = new Float32Array(9);
  const lead = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(leadPos, 3).setUsage(THREE.DynamicDrawUsage)),
    new THREE.LineBasicMaterial({ color: ORANGE.clone(), transparent: true, depthWrite: false }),
  );
  lead.frustumCulled = false;
  root.add(lead);

  const signal = (tau) => {
    const base = 0.04 * (Math.sin(tau * 29) + 0.55 * Math.sin(tau * 71 + 1.3) + 0.45 * Math.sin(tau * 13 + 0.4));
    const burst = smooth(4.4, 4.7, tau) * (1 - smooth(7.6, 8.6, tau));
    const spike = burst * 0.17 * Math.sin(tau * 38) * (0.7 + 0.3 * Math.sin(tau * 5));
    const calm = 1 - 0.45 * smooth(8.4, 9.2, tau);
    return base * calm * (1 + burst * 0.8) + spike;
  };

  // scratch objects (no per-frame allocation)
  const col = new THREE.Color(), wcol = new THREE.Color(), corner = V(), tmp = V();
  const pos = V(), close = V(), focus = V(), look = V();
  ctx.focus = focus;

  function update(time) {
    const t = time % DURATION;
    root.updateWorldMatrix(true, false);
    scanUniforms.scanInv.value.copy(root.matrixWorld).invert();

    // drive train: 1.5 rev/s -> 15 revolutions per loop (seamless)
    const ang = -2 * Math.PI * 1.5 * t;
    spinners.forEach((o, i) => { o.rotation.x = spin0[i] + ang; });

    // alert: a soft warm-red tint on the alarming housing
    const alert = smooth(4.45, 4.75, t) * (1 - smooth(8.3, 9.0, t));
    const flicker = 0.85 + 0.15 * Math.sin(t * 12);
    hot.emissiveIntensity = alert * 0.16 * flicker;
    glow.intensity = alert * 0.06 * flicker;

    // x-ray beat
    const xk = smooth(5.7, 6.5, t) * (1 - smooth(8.2, 9.0, t));
    const op = 1 - 0.7 * xk;
    for (const m of xray) { m.opacity = op; m.depthWrite = op > 0.97; }
    M.guard.opacity = 0.2 - 0.06 * xk;

    // AI scan band sweeps across the fan 0.6-2.6 s
    scanUniforms.scanPos.value = t > 0.5 && t < 2.8 ? -1.6 + 4.8 * smooth(0.6, 2.6, t) : -10;

    // pulse rings at every sensor (0.9 Hz -> 9 cycles per loop); sensor (2) turns red on alarm
    col.copy(ORANGE).lerp(RED, alert);
    for (const sn of sensors) {
      const isA = sn === alarm;
      const c = isA ? col : ORANGE;
      const on = isA ? 1 : 1 - 0.35 * alert;
      sn.rings.forEach((r, j) => {
        const p = (t * 0.9 + j / 3 + sn.phase) % 1;
        r.scale.setScalar(0.05 + p * (isA ? 0.24 + 0.04 * alert : 0.24));
        r.material.opacity = (1 - p) ** 1.6 * on * 0.9;
        r.material.color.copy(c).multiplyScalar(2.2);
      });
      sn.led.material.color.copy(c).multiplyScalar(isA ? 4 + 1.5 * alert : 4);
    }

    // waveform panel: 2.8-6.2 s (the alarm), back again calm at the end
    const show = Math.max(smooth(2.8, 3.6, t) * (1 - smooth(5.8, 6.3, t)), smooth(8.6, 9.1, t) * (1 - smooth(9.45, 9.95, t)));
    panel.visible = lead.visible = show > 0.002;
    wcol.copy(COOL).lerp(RED, alert);
    for (const rb of [core1, halo]) {
      const a = rb.geometry.attributes.position.array, hw = rb.userData.width / 2;
      for (let i = 0; i < N; i++) {
        const x = -W / 2 + (W * i) / (N - 1);
        const y = Math.max(-PH / 2 + 0.02, Math.min(PH / 2 - 0.02, signal(t - (1 - i / (N - 1)) * 2.4)));
        const j = i * 6;
        a[j] = a[j + 3] = x; a[j + 1] = y - hw; a[j + 4] = y + hw; a[j + 2] = a[j + 5] = 0;
      }
      rb.geometry.attributes.position.needsUpdate = true;
      rb.material.color.copy(wcol).multiplyScalar(rb.userData.intensity);
      rb.material.opacity = show * rb.userData.opacity;
    }
    backing.material.opacity = show * 0.4;
    grid.material.opacity = show * 0.35;
    panel.position.y = panelY - (1 - show) * 0.08;
    panel.updateMatrixWorld();
    // leader: from the alarming sensor tip straight up, then across to the panel's lower-left corner
    corner.set(-W / 2 - 0.04, -PH / 2 - 0.04, 0).applyMatrix4(panel.matrixWorld);
    tmp.set(alarm.tip.x, corner.y, alarm.tip.z);
    leadPos[0] = alarm.tip.x; leadPos[1] = alarm.tip.y + 0.06; leadPos[2] = alarm.tip.z;
    leadPos[3] = tmp.x; leadPos[4] = tmp.y; leadPos[5] = tmp.z;
    leadPos[6] = corner.x; leadPos[7] = corner.y; leadPos[8] = corner.z;
    lead.geometry.attributes.position.needsUpdate = true;
    lead.material.color.copy(col).multiplyScalar(3);
    lead.material.opacity = show * 0.85 * smooth(4.3, 4.8, t);

    // camera: wide periodic orbit, push in on the drive train, lean toward (2), back out
    const ph = (2 * Math.PI * t) / DURATION;
    orbit(pos, look0, AZ0 + deg(7) * Math.sin(ph), EL0 + deg(3) * Math.sin(ph + 0.8), DIST0);
    const push = smooth(5.6, 6.7, t) * (1 - smooth(8.3, 9.6, t));
    const lean = smooth(7.0, 8.1, t);
    look.copy(look3).lerp(lookA, lean * 0.35);
    orbit(close, look, deg(19) - deg(9) * smooth(5.6, 8.3, t), deg(15), 3.9 - 0.3 * lean);
    camera.position.copy(pos).lerp(close, push);
    target.copy(look0).lerp(look, push);
    focus.copy(target).lerp(alarm.p, push * lean);
    camera.fov = FOV;
  }

  return {
    root,
    duration: DURATION,
    stage: { center: [coreC.x, core.max.y * 0.45, coreC.z], size: 2.1, floorY: core.min.y },
    enter() { ctx.focus = focus; update(0); },
    update,
  };
}
