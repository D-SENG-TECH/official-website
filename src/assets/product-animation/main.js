// Homepage hero: a carousel of real-time 3D product scenes with a shared studio look.
//
// Scene contract (scenes/<id>.js):
//   export default async function create(ctx) -> {
//     root:     THREE.Object3D            // added to the shared scene while active
//     duration: number                    // seconds before the carousel advances
//     stage:    { center: [x,y,z], size, floorY? }   // where the studio rig, shadows and floor go
//     update(t, dt)                       // t = seconds since this scene started; sets ctx.camera
//                                         // position/fov, ctx.target, and optionally ctx.focus
//     enter?()                            // called when the scene becomes active (reset state)
//   }
//   ctx = { THREE, camera, target (Vector3 look-at), focus (Vector3|null: depth-of-field point,
//           null = target), loadGLB(url) -> Promise<Object3D with .animations>, mat, color, tier ("high"|"low") }
// Scenes own geometry, materials and animation only. Lights, environment, shadows, floor and
// post-processing live here so every scene shares one look. Emissive materials with
// emissiveIntensity > 1 bloom. Visitors can drag to orbit; the scene's camera path resumes
// after they let go.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export const CDN = "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/";
export const color = {
  navy: 0x0f2c4a, blue: 0x1c5f9e, orange: 0xf0954a, sky: 0xa9c6e2,
  steel: 0xc4ccd4, dark: 0x1e2a36, hot: 0xff2e08, cool: 0x0a5aff, gold: 0xff8c14,
};

export const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.55 }, grain: { value: 0.025 }, time: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount, grain, time; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; d.x *= 1.25;
      c.rgb *= mix(1.0, smoothstep(0.85, 0.2, length(d)), amount);
      c.rgb += (rnd(vUv) - 0.5) * grain; gl_FragColor = c; }`,
};

export function gradientTexture() {
  // Same backdrop as the offline look-dev: lighter navy glow upper-right, deep navy edges.
  const c = document.createElement("canvas");
  c.width = 512; c.height = 342;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(300, 140, 0, 300, 140, 420);
  r.addColorStop(0, "#1f5488"); r.addColorStop(0.45, "#0f2c4a"); r.addColorStop(1, "#061426");
  g.fillStyle = r; g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function floorAlpha() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, "#fff"); r.addColorStop(0.55, "#fff"); r.addColorStop(1, "#000");
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// Shared PBR material set. Call once per scene context so materials are never shared between products.
export function makeMaterials() {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: color.blue, metalness: 0, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.08 }),
    navy: new THREE.MeshPhysicalMaterial({ color: color.navy, metalness: 0, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.15 }),
    steel: new THREE.MeshStandardMaterial({ color: color.steel, metalness: 1, roughness: 0.28 }),
    brushed: new THREE.MeshStandardMaterial({ color: color.steel, metalness: 1, roughness: 0.25 }), // anisotropy + RectAreaLight blows out to NaN
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1, roughness: 0.06 }),
    rubber: new THREE.MeshPhysicalMaterial({ color: 0x141619, metalness: 0, roughness: 0.7, clearcoat: 0.2, clearcoatRoughness: 0.4 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xd8875a, metalness: 1, roughness: 0.25 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 1, thickness: 0.02, ior: 1.45, transparent: true }),
  };
}

// GLB loader (Draco + meshopt) resolving urls against base.
export function makeLoader(base = "./") {
  const draco = new DRACOLoader().setDecoderPath(CDN + "libs/draco/gltf/");
  const gltf = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  return (url) => gltf.loadAsync(base + url).then((g) => Object.assign(g.scene, { animations: g.animations }));
}

export async function startHero(el, ids, { base = "./", onScene, freeze, tier: forceTier, auto = true, shift } = {}) {
  // auto: true = carousel (advance after each scene's duration); false = the page picks the scene
  // with show(i) (e.g. one full-screen section per product) and the active scene loops.
  // shift(aspect) -> [x, y]: move the subject by a fraction of the view (x > 0 right, y > 0 up) to
  // leave room for text laid over the canvas.
  // freeze: { index, t } renders one frozen frame (used for screenshots / tests).
  const coarse = matchMedia("(pointer: coarse)").matches || el.clientWidth < 700;
  let tier = forceTier || (coarse ? "low" : "high");

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: !!freeze });
  renderer.setPixelRatio(Math.min(devicePixelRatio, tier === "high" ? 2 : 1.5));
  renderer.toneMapping = THREE.NeutralToneMapping; // AgX washed the brand blue out to grey-blue
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = gradientTexture();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdr = await new RGBELoader().loadAsync(base + "env/studio_small_08_1k.hdr");
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.45;
  hdr.dispose();

  // Studio rig: soft key with shadows, cool rim, top softbox, faint warm kicker.
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

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.MeshStandardMaterial({ color: 0x050f1c, roughness: 0.45, metalness: 0, transparent: true, alphaMap: floorAlpha(), depthWrite: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.renderOrder = -1;
  scene.add(floor);

  function placeStage({ center = [0, 0, 0], size = 2, floorY = 0 } = {}) {
    const c = new THREE.Vector3(...center), s = size;
    key.position.copy(c).add(new THREE.Vector3(2.2, 2.6, 2.0).multiplyScalar(s));
    key.target.position.copy(c);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -s * 1.4; sc.right = sc.top = s * 1.4;
    sc.near = 0.1; sc.far = s * 10;
    sc.updateProjectionMatrix();
    rim.position.copy(c).add(new THREE.Vector3(-1.8, 1.4, -2.4).multiplyScalar(s));
    rim.width = 1.6 * s; rim.height = 1.0 * s; rim.lookAt(c);
    top.position.copy(c).add(new THREE.Vector3(0.2, 3, 0.2).multiplyScalar(s));
    top.width = 2.8 * s; top.height = 1.6 * s; top.lookAt(c);
    kick.position.copy(c).add(new THREE.Vector3(-2.6, 0.4, 1.2).multiplyScalar(s));
    kick.intensity = 1.2 * s * s;
    floor.position.set(c.x, floorY, c.z);
    floor.scale.setScalar(s * 6);
  }

  const camera = new THREE.PerspectiveCamera(32, 3 / 2, 0.01, 200);
  const target = new THREE.Vector3();

  const loadGLB = makeLoader(base);
  const mat = makeMaterials();
  const ctx = { THREE, camera, target, focus: null, loadGLB, mat, color, get tier() { return tier; } };

  // Post-processing: bloom on emissive, depth of field, AgX output, vignette.
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // No GTAO: it darkens large grazing-angle planes (the fading floor) into a slab; soft shadow maps ground the models instead.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.35, 1.3);
  composer.addPass(bloom);
  const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.0018, maxblur: 0.006 });
  composer.addPass(bokeh);
  composer.addPass(new OutputPass());
  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);
  const applyTier = () => {
    bokeh.enabled = tier === "high";
    renderer.setPixelRatio(Math.min(devicePixelRatio, tier === "high" ? 2 : 1.5));
    resize();
  };

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(el);
  applyTier();

  // Drag to orbit around the scene's look-at point; eases back to the authored camera path.
  const orbit = { yaw: 0, pitch: 0, dragging: false, idle: 0 };
  let px = 0, py = 0;
  el.style.touchAction = "pan-y";
  el.addEventListener("pointerdown", (e) => { orbit.dragging = true; px = e.clientX; py = e.clientY; el.setPointerCapture(e.pointerId); });
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
    off.subVectors(camera.position, target);
    sph.setFromVector3(off);
    sph.theta += orbit.yaw;
    sph.phi = THREE.MathUtils.clamp(sph.phi - orbit.pitch, 0.15, Math.PI / 2 - 0.02);
    camera.position.copy(target).add(off.setFromSpherical(sph));
  }
  const interacting = () => orbit.dragging || orbit.idle < 2.5;

  // Load scenes lazily; the next one preloads while the current one plays.
  const slots = ids.map((id) => ({ id, ready: null }));
  const load = (s) => (s.ready ??= import(`${base}scenes/${s.id}.js`).then((m) => m.default(ctx)));

  let index = -1, active = null, t = 0, switching = false;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let wanted = 0;
  async function show(i) {
    wanted = (i + slots.length) % slots.length;
    if (switching || (active && wanted === index)) return;
    switching = true;
    index = wanted;
    const next = await load(slots[index]);
    load(slots[(index + 1) % slots.length]);
    el.classList.add("is-switching");
    await new Promise((r) => setTimeout(r, active ? 350 : 0));
    if (active) scene.remove(active.root);
    active = next;
    scene.add(active.root);
    active.root.traverse((o) => { if (o.isMesh && o.castShadow === false && !o.userData.noShadow) { o.castShadow = o.receiveShadow = true; } });
    placeStage(active.stage);
    ctx.focus = null;
    active.enter?.();
    t = 0;
    el.classList.remove("is-switching");
    switching = false;
    onScene?.(slots[index].id, index);
    if (wanted !== index) show(wanted); // the visitor scrolled on while this scene was loading
  }

  const fv = new THREE.Vector3();
  function frame(dt) {
    active.update(t, dt);
    applyOrbit(dt);
    // Scenes are framed for 3:2. On narrower screens (portrait phones) widen the vertical FOV so the
    // authored horizontal framing survives; wider screens keep the vertical FOV and crop top/bottom.
    if (camera.aspect < 1.5) {
      const h = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.5;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / camera.aspect));
    }
    const [sx, sy] = shift?.(camera.aspect) ?? [0, 0];
    if (sx || sy) {
      const w = el.clientWidth, hgt = el.clientHeight;
      camera.setViewOffset(w, hgt, -sx * w, sy * hgt, w, hgt);
    } else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    bokeh.uniforms.focus.value = camera.position.distanceTo(ctx.focus ?? target);
    vignette.uniforms.time.value = t;
    composer.render(dt);
  }

  // Drop to the low tier (no depth of field, lower resolution) if the GPU can't keep up (sustained > 28 ms frames).
  let slow = 0;
  let last = performance.now(), visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(el);
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!active || !visible || document.hidden || switching) return;
    if (tier === "high") { slow = dt > 0.028 ? slow + dt : Math.max(0, slow - dt); if (slow > 2) { tier = "low"; applyTier(); } }
    if (!(reduce && t > active.duration * 0.5)) t += dt;
    frame(dt);
    if (reduce || t <= active.duration) return;
    if (!auto) { t = 0; active.enter?.(); }
    else if (!interacting()) show(index + 1);
  };

  if (freeze) {
    await show(freeze.index);
    // Step the scene from 0 to t so stateful scenes (particles, trails) reach a realistic frame.
    for (t = 0; t < freeze.t; t += 1 / 30) active.update(t, 1 / 30);
    t = freeze.t;
    frame(1 / 30);
    frame(1 / 30);
    document.title = "frozen";
    return;
  }
  await show(0);
  renderer.setAnimationLoop(loop);
  return { show: (i) => show(i), get index() { return index; } };
}
