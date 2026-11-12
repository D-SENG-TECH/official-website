// Homepage hero, "showroom" mode: every product scene lives in ONE continuous Three.js scene.
//
// Idle: all products on the studio floor, camera on a very slow turntable orbit (drag to orbit, eases back).
// Play: product 1 steps forward to the hero spot H and plays its own authored film (its camera path,
// beats and effects). When it ends it slides aside and dims while the next product glides in from far
// behind it to H; the camera never cuts. After the last one the camera pulls back to the showroom.
//
// Scenes keep the contract of main.js (create(ctx) -> { root, duration, stage, update, enter? }).
// Each product gets its own ctx (private camera, target, focus and material set), so a scene drives
// its private camera in its own coordinates; the showroom maps that pose into the world through the
// product's slot (translation + uniform scale, never rotation). Lights, shadows, floor and the post
// chain are owned here.
import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { color, VignetteShader, gradientTexture, floorAlpha, makeMaterials, makeLoader } from "./main.js";

// ---------------------------------------------------------------- layout and timing (world units ~ metres)
const ZS = 1.6;                                   // normalised product size (stage.size after scaling)
const H = new THREE.Vector3(0, 0, 0);             // hero spot where the playing product stands
// showroom line: a staggered row receding gently to the right, behind the hero spot
const V3 = ([x, z]) => new THREE.Vector3(x, 0, z);
const LINE = [[-4.9, -2.2], [-2.2, -3.7], [0.35, -2.8], [2.75, -4.3], [4.95, -3.4]].map(V3);
// portrait screens: two rows (two in front, three behind) so the products stay large
const LINE_P = [[-1.2, -1.8], [1.3, -2.0], [-1.95, -6.2], [0.15, -6.6], [2.1, -6.1]].map(V3);
const FAR_D = 10;                                 // the next product starts this far behind H, on the view axis
const EXIT = new THREE.Vector3(-3.4, 0, -1.2);    // the finished product slides here (aside and back)
const T_INTRO = 3.2, T_HAND = 6.4, T_OUTRO = 4.2;
// hand-over beats (s): camera reaches the shared hand-over pose, B appears behind A, A slides away, B arrives
const HAND = { camOut: 1.6, bIn: 1.35, aGo: 1.7, aGone: 4.1, camIn0: 4.8, arrive: 5.0 };
// per-product tuning: k = visual size factor, floorY = override of stage.floorY (scene units),
// floorOff = product-time windows where the floor is hidden (scene-built worlds that reach below it)
const TUNE = {
  aimon: { k: 0.86 },
  compressor: { k: 1.2 },
  welding: { k: 1.1, tilt: [0, 1, 0, 0.95] }, // turned on display so the header no longer hides the arm
  // a flat ring: tilted toward the viewer and lowered while on display; authored floor height so the
  // lower duct never reaches below the floor while it slides in
  gasket: { k: 0.93, floorY: -0.315, tilt: [1, 0, 0, 1.0], lineY: -0.62 },
  nano: { k: 0.87, floorOff: [[4.96, 9.42]] },
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (t, a, b) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const ease = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;

// Optional black mirror floor (floor: "mirror"): blurred planar reflection, darkened, fading with distance.
const MirrorShader = {
  name: "MirrorShader",
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uCenter: { value: new THREE.Vector3() }, uR: { value: new THREE.Vector2(4, 12) },
    uStrength: { value: 0.5 }, uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) }, uBlur: { value: 2.0 },
  },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
    void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; uniform vec3 uCenter; uniform vec2 uR, uTexel;
    uniform float uStrength, uBlur; varying vec4 vUv; varying vec3 vW;
    void main(){
      float d = length(vW.xz - uCenter.xz);
      float fade = 1.0 - smoothstep(uR.x, uR.y, d);
      vec2 uv = vUv.xy / vUv.w;
      vec3 r = vec3(0.0); float wsum = 0.0;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996, rad = sqrt((float(i) + 0.5) / 12.0);
        vec2 o = vec2(cos(a), sin(a)) * rad * uBlur * uTexel;
        float w = 1.0 - 0.5 * rad;
        r += texture2D(tDiffuse, uv + o).rgb * w; wsum += w;
      }
      r /= wsum;
      vec3 V = normalize(cameraPosition - vW);
      float fres = 0.35 + 0.65 * pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
      gl_FragColor = vec4(color + r * uStrength * fres * (0.25 + 0.75 * fade), fade);
    }`,
};

// Per-product dim and dissolve: appended to every material of a product (materials are never shared).
const DIM_HEAD = `uniform float srDim; uniform float srFade;
float srIgn(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;
const DIM_TAIL = `  if (srFade < 0.999 && srIgn(gl_FragCoord.xy) > srFade) discard;
  gl_FragColor.rgb *= srDim;
`;
function patchMaterial(m, U) {
  if (m.userData.srPatched) return;
  m.userData.srPatched = true;
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r);
    sh.uniforms.srDim = U.srDim;
    sh.uniforms.srFade = U.srFade;
    const f = sh.fragmentShader, i = f.lastIndexOf("}");
    sh.fragmentShader = DIM_HEAD + f.slice(0, i) + DIM_TAIL + f.slice(i);
  };
  m.customProgramCacheKey = () => key + "|sr";
  m.needsUpdate = true;
}

export async function startShowroom(el, items, { base = "./", tier: forceTier, onUI, shift, reduced, floor: floorMode = "studio" } = {}) {
  const useMirror = floorMode === "mirror";
  const coarse = matchMedia("(pointer: coarse)").matches || el.clientWidth < 700;
  let tier = forceTier || (coarse ? "low" : "high");
  const reduce = reduced ?? matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  el.appendChild(renderer.domElement);
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = gradientTexture();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdrP = new RGBELoader().loadAsync(base + "env/studio_small_08_1k.hdr").then((hdr) => {
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
  });
  scene.environmentIntensity = 0.45;

  // ---------------------------------------------------------------- studio rig (follows the active product)
  const rig = new THREE.Group();
  const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(tier === "high" ? 2048 : 1024);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const rim = new THREE.RectAreaLight(0x6fb4ff, 9, 2, 1.2);
  const top = new THREE.RectAreaLight(0xffffff, 1.2, 2.8, 1.6);
  const kick = new THREE.PointLight(0xffb070, 1.2, 0, 2);
  rig.add(key, key.target, rim, top, kick);
  scene.add(rig);
  const rv = new THREE.Vector3();
  function placeStage(c, s) {
    key.position.copy(c).add(rv.set(2.2, 2.6, 2.0).multiplyScalar(s));
    key.target.position.copy(c);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -s * 1.4; sc.right = sc.top = s * 1.4;
    sc.near = 0.1; sc.far = s * 10;
    sc.updateProjectionMatrix();
    rim.position.copy(c).add(rv.set(-1.8, 1.4, -2.4).multiplyScalar(s));
    rim.width = 1.6 * s; rim.height = 1.0 * s; rim.lookAt(c);
    top.position.copy(c).add(rv.set(0.2, 3, 0.2).multiplyScalar(s));
    top.width = 2.8 * s; top.height = 1.6 * s; top.lookAt(c);
    kick.position.copy(c).add(rv.set(-2.6, 0.4, 1.2).multiplyScalar(s));
    kick.intensity = 1.2 * s * s;
    floor.position.set(c.x, 0, c.z);
    floor.scale.setScalar(s * 6);
  }

  // studio floor (as in main.js): dark disc with a soft alpha edge that follows the active stage
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.MeshStandardMaterial({ color: 0x050f1c, roughness: 0.45, metalness: 0, transparent: true, alphaMap: floorAlpha(), depthWrite: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.renderOrder = -1;
  scene.add(floor);
  // optional black mirror floor + a shadow-only plane for contact shadows
  let mirror = null, shadowFloor = null, mU = null;
  if (useMirror) {
    floor.visible = false;
    mirror = new Reflector(new THREE.PlaneGeometry(400, 400), {
      color: 0x02060c, textureWidth: 512, textureHeight: 512, shader: MirrorShader, multisample: tier === "high" ? 4 : 0,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.material.transparent = true;
    mirror.renderOrder = -2;
    mU = mirror.material.uniforms;
    const reflect = mirror.onBeforeRender;
    mirror.onBeforeRender = function (r, sc, c, ...rest) { if (!sc.overrideMaterial) reflect.call(this, r, sc, c, ...rest); }; // skip the depth-of-field depth pass
    shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.5, depthWrite: false }));
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.position.y = 0.002;
    shadowFloor.receiveShadow = true;
    shadowFloor.renderOrder = -1;
    scene.add(mirror, shadowFloor);
  }

  // ---------------------------------------------------------------- camera + post
  const camera = new THREE.PerspectiveCamera(30, 3 / 2, 0.01, 400);
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.35, 1.3);
  composer.addPass(bloom);
  const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.0018, maxblur: 0.006 });
  composer.addPass(bokeh);
  composer.addPass(new OutputPass());
  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);

  const products = [];
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, tier === "high" ? 2 : 1.5));
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (mirror) {
      const f = tier === "high" ? 0.5 : 0.33, pr = renderer.getPixelRatio();
      const rw = Math.max(64, Math.round(w * pr * f)), rh = Math.max(64, Math.round(h * pr * f));
      mirror.getRenderTarget().setSize(rw, rh);
      mU.uTexel.value.set(1 / rw, 1 / rh);
    }
    for (const p of products) { p.cam.aspect = camera.aspect; p.cam.updateProjectionMatrix(); }
  }
  const applyTier = () => { bokeh.enabled = tier === "high"; resize(); };
  new ResizeObserver(resize).observe(el);
  applyTier();

  // ---------------------------------------------------------------- drag to orbit (eases back, never stops the film)
  const orbit = { yaw: 0, pitch: 0, dragging: false, idle: 9 };
  let px = 0, py = 0;
  el.style.touchAction = "pan-y";
  el.addEventListener("pointerdown", (e) => { if (e.target !== renderer.domElement) return; orbit.dragging = true; px = e.clientX; py = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!orbit.dragging) return;
    orbit.yaw -= (e.clientX - px) * 0.008;
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + (e.clientY - py) * 0.005, -0.5, 0.6);
    px = e.clientX; py = e.clientY; orbit.idle = 0;
  });
  const release = () => { orbit.dragging = false; };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  const off = new THREE.Vector3(), sph = new THREE.Spherical();
  function applyOrbit(dt) {
    if (!orbit.dragging) {
      orbit.idle += dt;
      if (orbit.idle > 2.5) { const k = 1 - Math.exp(-dt * 1.5); orbit.yaw -= orbit.yaw * k; orbit.pitch -= orbit.pitch * k; }
    }
    if (Math.abs(orbit.yaw) + Math.abs(orbit.pitch) < 1e-4) return;
    off.subVectors(camera.position, pose.tgt);
    sph.setFromVector3(off);
    sph.theta += orbit.yaw;
    sph.phi = THREE.MathUtils.clamp(sph.phi - orbit.pitch, 0.15, Math.PI / 2 - 0.03);
    camera.position.copy(pose.tgt).add(off.setFromSpherical(sph));
  }

  // ---------------------------------------------------------------- products
  const loadGLB = makeLoader(base);
  await Promise.all([hdrP, ...items.map(async (it, i) => {
    const cam = new THREE.PerspectiveCamera(30, camera.aspect, 0.01, 200);
    const pctx = { THREE, camera: cam, target: new THREE.Vector3(), focus: null, loadGLB, mat: makeMaterials(), color, get tier() { return tier; } };
    const mod = await import(`${base}scenes/${it.id}.js`);
    const sc = await mod.default(pctx);
    products[i] = { ...it, i, cam, ctx: pctx, sc };
  })]);

  const U = [];
  products.forEach((p, i) => {
    const tune = TUNE[p.id] || {};
    const st = p.sc.stage;
    p.s = (ZS * (tune.k ?? 1)) / st.size;
    p.c0 = new THREE.Vector3(st.center[0], tune.floorY ?? st.floorY ?? 0, st.center[2]);
    p.stageC = new THREE.Vector3(...st.center);
    p.floorOff = tune.floorOff || [];
    p.dur = p.sc.duration;
    p.slot = new THREE.Group();
    p.slot.add(p.sc.root);
    p.slot.scale.setScalar(p.s);
    scene.add(p.slot);
    p.lineL = LINE[i % LINE.length].clone();
    p.lineP = LINE_P[i % LINE_P.length].clone();
    for (const v of [p.lineL, p.lineP]) v.y = tune.lineY || 0;
    Object.defineProperty(p, "line", { get: () => (portrait() ? p.lineP : p.lineL) });
    p.tilt = tune.tilt ? new THREE.Vector3(...tune.tilt).normalize() : null;
    p.tiltA = tune.tilt?.[3] || 0;
    p.spot = new THREE.Vector3();
    p.U = U[i] = { srDim: { value: 1 }, srFade: { value: 1 } };
    p.lights = [];
    p.sc.root.traverse((o) => {
      if (o.name === "floor_patch") o.visible = false; // the shared studio floor is used here
      if (o.isLight) {
        p.lights.push(o);
        if (o.isRectAreaLight) { o.width *= p.s; o.height *= p.s; } else if (o.isPointLight || o.isSpotLight) { if (o.distance > 0) o.distance *= p.s; }
        o.userData.srK = o.isRectAreaLight || o.isDirectionalLight ? 1 : p.s * p.s;
      }
      if (o.isMesh && o.castShadow === false && !o.userData.noShadow) o.castShadow = o.receiveShadow = true;
      if (o.isPoints) {
        const m = o.material;
        if (m.uniforms?.scale && o.onBeforeRender) {
          const f = o.onBeforeRender, s = p.s;
          o.onBeforeRender = function (...a) { f.apply(this, a); m.uniforms.scale.value *= s; };
        } else if (m.isPointsMaterial && m.sizeAttenuation) m.size *= p.s;
      }
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) patchMaterial(m, p.U);
    });
    p.shown = true;
    p.t = 0;
    p.sc.enter?.();
    step(p, 0);
  });

  // run a product's update at product time t; point-light intensities are compensated for the slot scale
  function step(p, t) {
    p.t = t;
    for (const L of p.lights) if (L.userData.srA !== undefined) L.intensity = L.userData.srA;
    p.slot.updateMatrixWorld(true);
    p.sc.update(t, 1 / 60);
    for (const L of p.lights) { L.userData.srA = L.intensity; L.intensity *= L.userData.srK; }
  }
  function setShown(p, on) {
    if (p.shown === on) return;
    p.shown = on;
    p.sc.root.traverse((o) => { if (!o.isLight) o.layers.set(on ? 0 : 1); }); // lights stay: no shader recompiles
  }
  const qx = new THREE.Quaternion(), XA = new THREE.Vector3(1, 0, 0), pv = new THREE.Vector3();
  // rot = 0..1 share of the display tilt (pivot: the stage centre); 0 at the hero spot
  function place(p, spot, dim, fade, rot = 0) {
    p.spot.copy(spot);
    p.slot.position.copy(spot).addScaledVector(p.c0, -p.s);
    if (p.tilt) {
      p.slot.quaternion.setFromAxisAngle(p.tilt, p.tiltA * rot);
      pv.copy(p.stageC).multiplyScalar(p.s);
      p.slot.position.add(pv).sub(pv.applyQuaternion(p.slot.quaternion));
    }
    p.U.srDim.value = dim;
    p.U.srFade.value = fade;
    setShown(p, fade > 0.002);
  }
  const N = products.length;
  const centre = (L) => L.slice(0, N).reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / N);
  const lineCL = centre(LINE), lineCP = centre(LINE_P);

  // ---------------------------------------------------------------- camera poses
  const mkPose = () => ({ pos: new THREE.Vector3(), tgt: new THREE.Vector3(), focus: new THREE.Vector3(), fov: 30, s: 1, stageC: new THREE.Vector3(), stageS: 1 });
  const pose = mkPose(), pA = mkPose(), pB = mkPose(), pT = mkPose();
  const toWorld = (p, v, anchor, out) => out.copy(v).sub(p.c0).multiplyScalar(p.s).add(anchor);
  function prodPose(p, anchor, out) {
    toWorld(p, p.cam.position, anchor, out.pos);
    toWorld(p, p.ctx.target, anchor, out.tgt);
    toWorld(p, p.ctx.focus ?? p.ctx.target, anchor, out.focus);
    out.fov = p.cam.fov;
    out.s = p.s;
    toWorld(p, p.stageC, anchor, out.stageC);
    out.stageS = p.sc.stage.size * p.s;
    return out;
  }
  const portrait = () => camera.aspect < 0.9;
  // idle: a very slow turntable around the line (u = idle seconds; one turn per TURN_S)
  const TURN_S = 120;
  function idlePose(u, out) {
    const por = portrait();
    const az = THREE.MathUtils.degToRad(por ? -6 : -8) + (u / TURN_S) * Math.PI * 2;
    const el = THREE.MathUtils.degToRad(por ? 25 : 13);
    const d = por ? 17.5 : 17.5;
    const c = por ? lineCP : lineCL;
    out.tgt.copy(c).add(rv.set(por ? 0 : 0.2, por ? 1.05 : 0.95, por ? 0.2 : 0));
    out.pos.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(d).add(out.tgt);
    out.focus.copy(c).setY(0.9);
    out.fov = por ? 18 : 30;
    out.s = 4.5; // only drives depth of field here: a gentle blur over the whole line
    out.stageC.copy(c).setY(1.0);
    out.stageS = por ? 4.2 : 6.2;
    return out;
  }
  // the shared hand-over shot: every product's run ends here, so B always comes from straight behind A
  const handDir = new THREE.Vector3();
  function handPose(out) {
    out.tgt.copy(H).add(rv.set(0, 0.55 * ZS, 0));
    const az = THREE.MathUtils.degToRad(14), el = THREE.MathUtils.degToRad(5);
    out.pos.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(4.3 * ZS).add(out.tgt);
    out.focus.copy(out.tgt);
    out.fov = 30;
    out.s = 1;
    out.stageC.copy(H).setY(0.5 * ZS);
    out.stageS = 2.4 * ZS;
    handDir.subVectors(out.tgt, out.pos).setY(0).normalize();
    return out;
  }
  const lv = new THREE.Vector3();
  function blendPose(a, b, w, lift, out) {
    const d = a.pos.distanceTo(b.pos);
    out.pos.lerpVectors(a.pos, b.pos, w).y += Math.sin(Math.PI * w) * lift * d;
    out.tgt.lerpVectors(a.tgt, b.tgt, w);
    out.focus.lerpVectors(a.focus, b.focus, w);
    out.fov = lerp(a.fov, b.fov, w);
    out.s = Math.exp(lerp(Math.log(a.s), Math.log(b.s), w));
    out.stageC.lerpVectors(a.stageC, b.stageC, w);
    out.stageS = lerp(a.stageS, b.stageS, w);
    return out;
  }
  const copyPose = (a, out) => blendPose(a, a, 0, 0, out);

  // ---------------------------------------------------------------- sequence state machine
  // idle -> intro(b) -> play(a) -> hand(a -> b) -> play(b) ... -> outro(a) -> idle
  const seq = { mode: "idle", tau: 0, u: 0, a: -1, b: -1, reveal: reduce ? 1 : 0 };
  let paused = false, pending = null;
  const idleDim = (i) => 1 - 0.05 * i;

  function startIntro(k) {
    seq.mode = "intro"; seq.tau = 0; seq.b = k; seq.a = -1;
    seq.introU = seq.u;
    products[k].sc.enter?.();
    step(products[k], 0);
  }
  function startHand(a, b) {
    seq.mode = "hand"; seq.tau = 0; seq.a = a; seq.b = b;
    products[b].sc.enter?.();
    step(products[b], 0);
  }
  function startOutro(a) { seq.mode = "outro"; seq.tau = 0; seq.a = a; seq.b = -1; seq.outroT = products[a].t; }
  function toPlay(k, t) {
    seq.mode = "play"; seq.a = k; seq.b = -1; seq.tau = 0; seq.ta = t;
    if (pending !== null && pending !== k) { const j = pending; pending = null; startHand(k, j); } else pending = null;
  }

  function advance(dt) {
    seq.tau += dt;
    if (seq.mode === "idle") { if (!reduce) seq.u += dt; seq.reveal = Math.min(1, seq.reveal + dt / 1.4); return; }
    if (seq.mode === "intro") {
      if (seq.tau >= T_INTRO) toPlay(seq.b, seq.tau - (T_INTRO - 1.2));
      return;
    }
    if (seq.mode === "play") {
      seq.ta += dt;
      const p = products[seq.a];
      if (seq.ta >= p.dur) {
        if (pending !== null && pending !== seq.a) { const j = pending; pending = null; startHand(seq.a, j); }
        else if (seq.a < N - 1) startHand(seq.a, seq.a + 1);
        else startOutro(seq.a);
      }
      return;
    }
    if (seq.mode === "hand") {
      seq.ta += dt;
      if (seq.tau >= T_HAND) toPlay(seq.b, seq.tau - HAND.arrive);
      return;
    }
    if (seq.mode === "outro" && seq.tau >= T_OUTRO) {
      seq.mode = "idle"; seq.tau = 0; seq.u = seq.outroU0 ?? 0; seq.a = seq.b = -1;
      if (pending !== null) { const j = pending; pending = null; startIntro(j); }
    }
  }

  // Lay out every slot and compute the camera pose for the current state.
  const tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3();
  let floorOn = true;
  function layout() {
    floorOn = true;
    const m = seq.mode;
    if (m === "idle") {
      for (const p of products) {
        if (p.t !== 0) step(p, 0);
        place(p, p.line, idleDim(p.i), ease(seq.reveal * 1.6 - p.i * 0.15), 1);
      }
      idlePose(seq.u, pose);
      return;
    }
    if (m === "intro") {
      const b = products[seq.b], tau = seq.tau;
      const tb = Math.max(0, tau - (T_INTRO - 1.2));
      step(b, tb);
      for (const p of products) {
        if (p === b) {
          const g = ease(ramp(tau, 0.2, T_INTRO - 1.0));
          place(p, tmpV.lerpVectors(p.line, H, g), lerp(idleDim(p.i), 1, ramp(tau, 0, 1.6)), 1, 1 - g);
        } else place(p, p.line, idleDim(p.i) * (1 - 0.6 * ramp(tau, 0, 1.0)), 1 - ramp(tau, 0.45, 1.5), 1);
      }
      idlePose(seq.introU, pA);
      prodPose(b, H, pB);
      blendPose(pA, pB, ease(tau / T_INTRO), 0.12, pose);
      return;
    }
    if (m === "play") {
      const a = products[seq.a];
      step(a, seq.ta % a.dur);
      for (const p of products) if (p !== a) place(p, p.line, 0.3, 0);
      place(a, H, 1, 1);
      prodPose(a, H, pose);
      for (const [x0, x1] of a.floorOff) if (a.t >= x0 && a.t < x1) floorOn = false;
      return;
    }
    if (m === "hand") {
      const a = products[seq.a], b = products[seq.b], tau = seq.tau;
      const outOn = tau < HAND.aGone;
      if (outOn) step(a, seq.ta % a.dur);
      const tb = Math.max(0, tau - HAND.arrive);
      step(b, tb);
      for (const p of products) if (p !== a && p !== b) place(p, p.line, 0.3, 0);
      handPose(pT);
      // 1) the camera settles on the shared hand-over pose while A keeps playing at H
      // 2) B fades in far away on the view axis, i.e. straight behind A on screen
      // 3) A slides aside and back, dims and dissolves; B glides in to H
      const go = ease(ramp(tau, HAND.aGo, HAND.aGone - 0.3));
      tmpV.copy(H).addScaledVector(EXIT, go);
      place(a, tmpV, lerp(1, 0.22, ramp(tau, HAND.aGo, HAND.aGone - 0.5)), 1 - ramp(tau, HAND.aGone - 0.75, HAND.aGone), go); // back to its display tilt
      const gi = ease(ramp(tau, HAND.bIn + 0.2, HAND.arrive));
      tmpW.copy(H).addScaledVector(handDir, FAR_D * (1 - gi));
      place(b, tmpW, lerp(0.25, 1, ramp(tau, HAND.bIn + 0.3, HAND.arrive - 0.4)), ramp(tau, HAND.bIn, HAND.bIn + 0.5), 1 - gi);
      if (tau < HAND.camIn0) {
        prodPose(a, H, pA);
        blendPose(pA, pT, ease(tau / HAND.camOut), 0.06, pose);
      } else {
        prodPose(b, H, pB);
        blendPose(pT, pB, ease((tau - HAND.camIn0) / (T_HAND - HAND.camIn0)), 0.04, pose);
      }
      return;
    }
    if (m === "outro") {
      const a = products[seq.a], tau = seq.tau;
      if (a.t !== seq.outroT) step(a, seq.outroT);
      const g = ease(ramp(tau, 0.4, T_OUTRO - 0.3));
      place(a, tmpV.lerpVectors(H, a.line, g), lerp(1, idleDim(a.i), g), 1, g);
      for (const p of products) {
        if (p === a) continue;
        if (p.t !== 0) step(p, 0);
        place(p, p.line, idleDim(p.i) * lerp(0.3, 1, ramp(tau, 1.2, 3.6)), ramp(tau, 0.9, 2.4), 1);
      }
      seq.outroU0 = 0;
      prodPose(a, H, pA);
      idlePose(0, pB);
      blendPose(pA, pB, ease(tau / T_OUTRO), 0.1, pose);
    }
  }

  // ---------------------------------------------------------------- frame
  let elapsed = 0;
  function frame(dt) {
    renderer.info.reset();
    layout();
    camera.position.copy(pose.pos);
    camera.fov = pose.fov;
    applyOrbit(dt);
    if (camera.aspect < 1.5) {
      const h = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.5;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / camera.aspect));
    }
    camera.near = 0.01 * Math.min(pose.s, 1.5);
    const playing = seq.mode === "idle" ? 0 : seq.mode === "intro" ? ease(seq.tau / T_INTRO) : seq.mode === "outro" ? 1 - ease(seq.tau / T_OUTRO) : 1;
    const [sx, sy] = shift?.(camera.aspect, playing) ?? [0, 0];
    if (sx || sy) { const w = el.clientWidth, h = el.clientHeight; camera.setViewOffset(w, h, -sx * w, sy * h, w, h); }
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.lookAt(pose.tgt);
    camera.updateMatrixWorld();
    placeStage(pose.stageC, pose.stageS);
    if (mirror) {
      mirror.visible = shadowFloor.visible = floorOn;
      mU.uCenter.value.copy(pose.stageC);
      mU.uR.value.set(pose.stageS * 1.6, pose.stageS * 4.5);
    } else floor.visible = floorOn;
    bokeh.uniforms.focus.value = camera.position.distanceTo(pose.focus);
    bokeh.uniforms.aperture.value = 0.0018 / pose.s;
    vignette.uniforms.time.value = elapsed;
    composer.render(dt);
  }

  // ---------------------------------------------------------------- UI state
  function ui() {
    const m = seq.mode;
    let index = -1, prog = 0, captionK = 0;
    if (m === "play") { index = seq.a; prog = seq.ta / products[seq.a].dur; captionK = 1; }
    else if (m === "intro") { index = seq.b; captionK = ramp(seq.tau, T_INTRO - 1.2, T_INTRO - 0.2); }
    else if (m === "hand") {
      const first = seq.tau < 3.0;
      index = first ? seq.a : seq.b;
      prog = first ? 1 : Math.max(0, seq.tau - HAND.arrive) / products[seq.b].dur;
      captionK = first ? 1 - ramp(seq.tau, 0.4, 1.4) : ramp(seq.tau, HAND.arrive - 0.6, HAND.arrive + 0.4);
    } else if (m === "outro") { index = seq.a; prog = 1; captionK = 1 - ramp(seq.tau, 0, 0.8); }
    return { mode: m, index, prog: clamp01(prog), captionK, paused, playing: m !== "idle" && !(m === "outro" && seq.tau > T_OUTRO - 1.4) };
  }

  // auto-downgrade to the low tier when the GPU can't keep up (sustained > 28 ms frames)
  let slow = 0, last = performance.now(), visible = true;
  const frameMs = [];
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(el);
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!visible || document.hidden) return;
    if (tier === "high" && !hero.noDowngrade) { slow = dt > 0.028 ? slow + dt : Math.max(0, slow - dt); if (slow > 2) { tier = "low"; applyTier(); } }
    if (!paused) advance(dt);
    elapsed += dt;
    const t0 = performance.now();
    frame(dt);
    frameMs.push(dt * 1000, performance.now() - t0);
    if (frameMs.length > 1200) frameMs.splice(0, 2);
    onUI?.(ui());
  }

  // first frames: compile every program before the products fade in
  for (const p of products) place(p, p.line, 1, 1, 1);
  idlePose(0, pose);
  camera.position.copy(pose.pos); camera.lookAt(pose.tgt); camera.updateMatrixWorld();
  await renderer.compileAsync(scene, camera);
  renderer.setAnimationLoop(loop);

  const hero = {
    play() { paused = false; if (seq.mode === "idle") startIntro(0); },
    jump(k) {
      paused = false;
      if (seq.mode === "idle") startIntro(k);
      else if (seq.mode === "play") { if (k !== seq.a) startHand(seq.a, k); }
      else pending = k;
    },
    pause() { paused = true; },
    resume() { paused = false; },
    toggle() { paused = !paused; },
    get state() { return ui(); },
    get tier() { return tier; },
    setTier(t) { tier = t; applyTier(); },
    noDowngrade: false,
    // screenshots: freeze the idle turntable at u seconds
    idleAt(u) { seq.mode = "idle"; seq.tau = 0; seq.u = u; seq.reveal = 1; pending = null; paused = true; orbit.yaw = orbit.pitch = 0; },
    // deterministic scrub for screenshots: T seconds after pressing Play from a fresh showroom
    seek(T) {
      seq.mode = "idle"; seq.tau = 0; seq.u = 0; seq.reveal = 1; pending = null;
      startIntro(0);
      for (let x = 0; x < T; x += 1 / 60) advance(Math.min(1 / 60, T - x));
      paused = true;
      orbit.yaw = orbit.pitch = 0;
    },
    stats() {
      const ft = frameMs.filter((_, i) => i % 2 === 0), cpu = frameMs.filter((_, i) => i % 2 === 1);
      const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      const p95 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)] ?? 0;
      return { tier, frameAvg: avg(ft), frameP95: p95(ft), cpuAvg: avg(cpu), tris: renderer.info.render.triangles, calls: renderer.info.render.calls,
        programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, mode: seq.mode };
    },
    // world-space boxes of what is visible per product (layout tuning)
    boxes() {
      return products.map((p) => {
        const bx = new THREE.Box3(), tb = new THREE.Box3();
        p.slot.updateMatrixWorld(true);
        p.sc.root.traverse((o) => {
          let v = true; for (let q = o; q; q = q.parent) if (!q.visible) { v = false; break; }
          if (v && o.isMesh && !o.isInstancedMesh && o.geometry) { o.geometry.computeBoundingBox(); tb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); bx.union(tb); }
        });
        const sz = bx.getSize(new THREE.Vector3());
        return { id: p.id, s: +p.s.toFixed(3), min: bx.min.toArray().map((x) => +x.toFixed(2)), size: sz.toArray().map((x) => +x.toFixed(2)) };
      });
    },
    durations: products.map((p) => p.dur),
    timing: { T_INTRO, T_HAND, T_OUTRO, arrive: HAND.arrive },
  };
  return hero;
}
