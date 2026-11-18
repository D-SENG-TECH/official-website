// 不鏽鋼管件與接頭 — 316L fittings for ultra-high-purity gas systems.
// All geometry is authored in millimetres inside an inner group scaled by 1e-3 (root is metres).
import { mergeGeometries, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

const TAU = Math.PI * 2;
const CREASE = 0.44; // ~25 deg: lathe/bend facets stay smooth, chamfers / thread flanks / hex edges stay crisp

function makeKit(THREE) {
  const Y = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _q = new THREE.Quaternion();

  // Generic (nu x nv) grid surface. Front face normal = d/dj x d/di (flip reverses it).
  function gridGeo(nu, nv, f, flip = false, diag = null) {
    const pos = new Float32Array((nu + 1) * (nv + 1) * 3), uv = new Float32Array((nu + 1) * (nv + 1) * 2);
    const o = [0, 0, 0]; let k = 0, q = 0;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      f(i, j, o); pos[k++] = o[0]; pos[k++] = o[1]; pos[k++] = o[2]; uv[q++] = i / nu; uv[q++] = j / nv;
    }
    const idx = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (diag && diag(i, j)) idx.push(a, c, b, b, c, d);
      else if (!flip) idx.push(a, d, b, a, c, d);
      else idx.push(a, b, d, a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // Surface of revolution about +Y. profile = [[r, y], ...] listed counter-clockwise in the (r, y) plane => outward normals.
  function rev(profile, segs = 40) {
    return gridGeo(segs, profile.length - 1, (i, j, o) => {
      const a = (i / segs) * TAU, p = profile[j];
      o[0] = p[0] * Math.cos(a); o[1] = p[1]; o[2] = p[0] * Math.sin(a);
    });
  }
  const arc = (cx, cy, rx, ry, a0, a1, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return out;
  };

  // Side surface of a hex prism with true 30-degree chamfers (cone/flat intersection arcs are exact).
  function hexSide(af, y0, y1, { r0 = af * 0.475, k = 0.577, c0 = true, c1 = true, per = 10 } = {}) {
    const ap = af / 2, segs = 6 * per, step = TAU / 6;
    return gridGeo(segs, 3, (i, j, o) => {
      const a = (i / segs) * TAU, m = a - Math.round(a / step) * step, hr = ap / Math.cos(m);
      const rb = c0 ? Math.min(r0, hr) : hr, rt = c1 ? Math.min(r0, hr) : hr;
      let r, y;
      if (j === 0) { r = rb; y = y0; } else if (j === 1) { r = hr; y = y0 + (hr - rb) * k; }
      else if (j === 2) { r = hr; y = y1 - (hr - rt) * k; } else { r = rt; y = y1; }
      o[0] = r * Math.cos(a); o[1] = y; o[2] = r * Math.sin(a);
    });
  }
  const hexR0 = (af) => af * 0.475;

  // Right-hand helical thread (truncated 60-degree form). rCrest < rRoot => internal thread.
  function thread(rRoot, rCrest, y0, len, pitch, { segs = 32, ch0 = true, ch1 = true, taper = 0 } = {}) {
    const F = [0, 0.125, 0.5, 0.625], turns = Math.ceil(len / pitch) + 1, nv = turns * 4, y1 = y0 + len;
    const dep = Math.abs(rCrest - rRoot);
    return gridGeo(segs, nv, (i, j, o) => {
      const f = F[j % 4] + Math.floor(j / 4), a = (i / segs) * TAU;
      let y = y0 + pitch * (f - 1 + i / segs);
      y = Math.min(y1, Math.max(y0, y));
      let h = j % 4 >= 2 ? 1 : 0, lim = 1;
      if (ch0) lim = Math.min(lim, (y - y0) / dep);
      if (ch1) lim = Math.min(lim, (y1 - y) / dep);
      h = Math.min(h, Math.max(lim, 0));
      const r = rRoot + (rCrest - rRoot) * h + taper * (y - y0);
      o[0] = r * Math.cos(a); o[1] = y; o[2] = -r * Math.sin(a);
    }, rCrest > rRoot);
  }

  // Diamond knurl band (real pyramids).
  function knurl(r, depth, y0, y1, teeth, rows) {
    const nu = teeth * 2;
    return gridGeo(nu, rows, (i, j, o) => {
      const a = (i / nu) * TAU, hi = (i + j) % 2 === 1 && j > 0 && j < rows, rr = hi ? r : r - depth;
      o[0] = rr * Math.cos(a); o[1] = y0 + ((y1 - y0) * j) / rows; o[2] = rr * Math.sin(a);
    }, false, (i, j) => (i + j) % 2 === 1);
  }

  // Orient a +Y-axis geometry along dir and move it to pos. Hex flats end up facing straight down/up for horizontal axes.
  function xf(g, pos, dir) {
    if (dir) {
      const d = _v.set(dir[0], dir[1], dir[2]).normalize();
      if (Math.abs(d.y) < 0.999) g.rotateY(-Math.atan2(d.z, d.x));
      _q.setFromUnitVectors(Y, d); g.applyQuaternion(_q);
    }
    if (pos) g.translate(pos[0], pos[1], pos[2]);
    return g;
  }

  function batch() {
    const map = new Map();
    const api = {
      add(mat, ...geos) {
        let l = map.get(mat); if (!l) map.set(mat, (l = []));
        for (const g of geos.flat()) l.push(g);
        return api;
      },
      // add +Y-axis geometries placed along an axis
      put(mat, pos, dir, ...geos) { for (const g of geos.flat()) api.add(mat, xf(g, pos, dir)); return api; },
      build(group) {
        for (const [mat, list] of map) {
          const norm = list.map((g) => {
            const n = g.index ? g.toNonIndexed() : g;
            n.deleteAttribute("normal");
            if (!n.attributes.uv) n.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
            for (const key of Object.keys(n.attributes)) if (key !== "position" && key !== "uv") n.deleteAttribute(key);
            return n;
          });
          const merged = toCreasedNormals(mergeGeometries(norm, false), CREASE);
          group.add(new THREE.Mesh(merged, mat));
        }
        return group;
      },
    };
    return api;
  }

  // Planar path in XZ: ops ["L", len] | ["A", radius, angle(+ turns from +x towards +z), steps]
  function mkPath(x, z, psi, ops) {
    const fr = [], push = () => fr.push({ x, z, tx: Math.cos(psi), tz: Math.sin(psi) });
    push();
    for (const op of ops) {
      if (op[0] === "L") { x += Math.cos(psi) * op[1]; z += Math.sin(psi) * op[1]; push(); }
      else {
        const R = op[1], ang = op[2], n = op[3] || Math.max(2, Math.ceil(Math.abs(ang) / (TAU / 60))), s = Math.sign(ang);
        const cx = x - s * Math.sin(psi) * R, cz = z + s * Math.cos(psi) * R;
        for (let i = 0; i < n; i++) { psi += ang / n; x = cx + s * R * Math.sin(psi); z = cz - s * R * Math.cos(psi); push(); }
      }
    }
    return fr;
  }
  // Tube with true wall thickness swept along a planar path at height h. Square-cut ends.
  function tubePath(fr, h, ro, ri, segs = 40) {
    const n = fr.length - 1;
    const P = (r, fi) => (i, j, o) => {
      const f = fr[fi == null ? j : fi], a = (i / segs) * TAU, c = Math.cos(a) * r, s = Math.sin(a) * r;
      o[0] = f.x + c * f.tz; o[1] = h - s; o[2] = f.z - c * f.tx;
    };
    const cap = (fi, rA, rB) => gridGeo(segs, 1, (i, j, o) => P(j ? rB : rA, fi)(i, 0, o));
    return [gridGeo(segs, n, P(ro)), gridGeo(segs, n, P(ri), true), cap(0, ri, ro), cap(n, ro, ri)];
  }
  const ringFace = (ri, ro, pos, dir, segs = 48) => xf(rev([[ro, 0], [ri, 0]], segs), pos, dir);

  // Straight tube along +Y with a small deburr chamfer on both ends.
  function tube(ro, ri, y0, y1, segs = 40) {
    const c = Math.min(0.12, (ro - ri) * 0.2);
    return rev([[ro - c, y0], [ro, y0 + c], [ro, y1 - c], [ro - c, y1], [ri, y1], [ri, y0], [ro - c, y0]], segs);
  }

  // Butt-weld tee / cross centred on the origin: run along x (+-A), branch along +z (to Ab), exact saddle intersection, real bore.
  function tee(ro, ri, A, Ab, { nphi = 40, nx = 4, nb = 40, cross = false } = {}) {
    const run = (rho, sign, flip) => gridGeo(nphi, nx, (i, j, o) => {
      const phi = -Math.PI + (i / nphi) * TAU, w = cross || Math.abs(phi) < Math.PI / 2 ? rho * Math.abs(Math.cos(phi)) : 0, u = j / nx;
      o[0] = sign < 0 ? -A + (A - w) * u : w + (A - w) * u; o[1] = rho * Math.sin(phi); o[2] = rho * Math.cos(phi);
    }, flip);
    const br = (rho, s, flip) => gridGeo(nb, 1, (i, j, o) => {
      const a = (i / nb) * TAU;
      o[0] = rho * Math.cos(a); o[1] = rho * Math.sin(a); o[2] = s * (j ? Ab : rho * Math.abs(Math.cos(a)));
    }, flip);
    const g = [run(ro, -1, false), run(ro, 1, false), run(ri, -1, true), run(ri, 1, true), br(ro, 1, true), br(ri, 1, false),
      ringFace(ri, ro, [A, 0, 0], [1, 0, 0], nphi), ringFace(ri, ro, [-A, 0, 0], [-1, 0, 0], nphi), ringFace(ri, ro, [0, 0, Ab], [0, 0, 1], nb)];
    if (cross) g.push(br(ro, -1, false), br(ri, -1, true), ringFace(ri, ro, [0, 0, -Ab], [0, 0, -1], nb));
    return g;
  }
  // Rigid move of a list of geometries: rotate about X, then Y, then translate.
  function move(geos, { rx = 0, ry = 0, pos = null } = {}) {
    for (const g of geos) { if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (pos) g.translate(pos[0], pos[1], pos[2]); }
    return geos;
  }
  // Extruded plan polygon (x, z) of height sec resting on y = 0, all edges rounded by bev.
  function slab(p, sec, bev) {
    const shape = new THREE.Shape(p.map((q) => new THREE.Vector2(q[0], q[1])));
    const g = new THREE.ExtrudeGeometry(shape, { depth: sec - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 4, steps: 1 });
    g.rotateX(Math.PI / 2); g.translate(0, sec - bev, 0);
    return g;
  }
  // Small-link chain along a 3D polyline (links alternate 90 degrees).
  function chain(points, wire = 0.55, linkR = 1.9) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const n = Math.max(2, Math.round(curve.getLength() / (linkR * 2.75))), pts = curve.getSpacedPoints(n), out = [];
    const X = new THREE.Vector3(1, 0, 0), t = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const g = new THREE.TorusGeometry(linkR, wire, 5, 10); g.scale(1.7, 1, 1); g.rotateX(i % 2 ? Math.PI / 2 : 0.25);
      t.subVectors(pts[i + 1], pts[i]).normalize(); q.setFromUnitVectors(X, t); g.applyQuaternion(q);
      g.translate((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2, (pts[i].z + pts[i + 1].z) / 2);
      out.push(g);
    }
    return out;
  }

  // Blocky forged body: L / T / X plan, flat top and bottom, rounded edges. Arms along +x,+z (L); +-x,+z (T); all (X).
  function forged(type, w, La, sec, bev) {
    const p = type === "L" ? [[-w, -w], [La, -w], [La, w], [w, w], [w, La], [-w, La]]
      : type === "T" ? [[-La, -w], [La, -w], [La, w], [w, w], [w, La], [-w, La], [-w, w], [-La, w]]
      : [[-La, -w], [-w, -w], [-w, -La], [w, -La], [w, -w], [La, -w], [La, w], [w, w], [w, La], [-w, La], [-w, w], [-La, w]];
    const shape = new THREE.Shape(p.map((q) => new THREE.Vector2(q[0], q[1])));
    const g = new THREE.ExtrudeGeometry(shape, { depth: sec - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 5, steps: 1 });
    g.rotateX(Math.PI / 2); g.translate(0, sec - bev, 0);
    return g;
  }
  const ARMS = { L: [[1, 0, 0], [0, 0, 1]], T: [[1, 0, 0], [-1, 0, 0], [0, 0, 1]], X: [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] };

  // Wrap an inner (mm) group in a metre-scale root, centred on x/z and resting on y = 0.
  function finish(inner) {
    const root = new THREE.Group();
    inner.scale.setScalar(1e-3); root.add(inner); root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner), c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    return root;
  }

  return { gridGeo, rev, arc, hexSide, hexR0, thread, knurl, xf, batch, mkPath, tubePath, ringFace, tube, forged, ARMS, finish, tee, move, slab, chain };
}

// ---------------------------------------------------------------- compression (double-ferrule) fitting parts
const C4 = { tr: 3.175, tw: 0.89, nutAF: 14.29, nutL: 12.7, nb: 3.32, thR: 4.9, thC: 5.55, p: 1.27, thL: 7.5, bodyAF: 12.7, hw: 3.2, sock: 3.25, bore: 2.4, neck: 0.8, nose: 1.1, show: 1.7 };
const C8 = { tr: 6.35, tw: 1.24, nutAF: 22.23, nutL: 17.5, nb: 6.55, thR: 8.55, thC: 9.5, p: 1.5875, thL: 10, bodyAF: 20.64, hw: 4, sock: 6.45, bore: 5.1, neck: 1.2, nose: 1.4, show: 2.8 };

function compKit(K) {
  const { rev, thread, hexSide, hexR0 } = K;
  // Threaded port starting at body face y = yb (outer radius of the face = rStart). visLen: only model this much thread.
  function port(C, yb, rStart, visLen) {
    const t0 = yb + C.neck, t1 = t0 + C.thL, top = t1 + C.nose, rs = C.thR - 0.55;
    return [
      rev([[rStart, yb], [C.thR, yb], [C.thR, t0]]),
      thread(C.thR, C.thC, t0, visLen || C.thL, C.p, { ch1: !visLen, segs: 28 }),
      rev([[C.thR, t1], [C.thR - 0.3, top], [rs, top], [C.sock, top - (rs - C.sock) * 2.7], [C.sock, yb + 1.5], [C.bore, yb + 1.5], [C.bore, 0]]),
    ];
  }
  // Nut with its front face at y0. detailed => internal thread + ferrule drive cone visible from the front.
  function nut(C, y0, detailed) {
    const r0 = hexR0(C.nutAF), L = C.nutL, ri = C.thC + 0.08;
    const g = [hexSide(C.nutAF, y0, y0 + L)];
    if (detailed) {
      const tl = L * 0.56;
      g.push(rev([[ri, y0 + 0.3], [ri + 0.3, y0], [r0, y0]]));
      g.push(thread(ri, C.thR + 0.08, y0 + 0.3, tl, C.p, { segs: 28 }));
      g.push(rev([[r0, y0 + L], [C.nb + 0.3, y0 + L], [C.nb, y0 + L - 0.3], [C.nb, y0 + tl + 2.0], [C.nb + 1.25, y0 + tl + 1.0], [ri, y0 + tl + 0.8], [ri, y0 + tl + 0.3]]));
    } else {
      g.push(rev([[ri, y0 + 2.5], [ri, y0 + 0.3], [ri + 0.3, y0], [r0, y0]]));
      g.push(rev([[r0, y0 + L], [C.nb + 0.3, y0 + L], [C.nb, y0 + L - 0.3], [C.nb, y0 + L * 0.74], [C.tr + 0.07, y0 + L * 0.74], [C.tr + 0.07, y0 + L * 0.2]]));
    }
    return g;
  }
  const frontFerrule = (C, y) => { const R = C.tr, s = C.tr / 3.175 * 0.8 + 0.2;
    return rev([[R + 0.06, 0], [R + 0.3 * s, 0], [R + 1.2 * s, 3.9 * s], [R + 1.2 * s, 4.4 * s], [R + 0.75 * s, 4.4 * s], [R + 0.15 * s, 3.5 * s], [R + 0.06, 3.5 * s], [R + 0.06, 0]].map((p) => [p[0], p[1] + y])); };
  const backFerrule = (C, y) => { const R = C.tr, s = C.tr / 3.175 * 0.8 + 0.2;
    return rev([[R + 0.06, 0], [R + 0.22 * s, 0], [R + 0.7 * s, 1.2 * s], [R + 1.2 * s, 1.6 * s], [R + 1.2 * s, 2.6 * s], [R + 0.9 * s, 3.0 * s], [R + 0.06, 3.0 * s], [R + 0.06, 0]].map((p) => [p[0], p[1] + y])); };
  // Finger-tight nut on a port (only the exposed thread is modelled), optional tube stub.
  function madeUp(B, mats, C, o, d, yb, rStart, stub) {
    B.put(mats.body, o, d, port(C, yb, rStart, C.show + 1.6));
    const ny = yb + C.neck + C.show;
    B.put(mats.nut, o, d, nut(C, ny, false));
    if (stub) B.put(mats.tube, o, d, K.tube(C.tr, C.tr - C.tw, yb + 2, ny + C.nutL + stub));
  }
  // 1/4" taper pipe thread male end
  function npt(yb, rStart) {
    return [rev([[rStart, yb], [6.3, yb], [6.3, yb + 1.2]]), thread(6.0, 6.8, yb + 1.2, 13, 1.411, { taper: -0.03, ch0: false, segs: 28 }),
      rev([[5.61, yb + 14.2], [5.3, yb + 14.6], [3.9, yb + 14.6], [3.6, yb + 14.3], [3.6, 0]])];
  }
  return { port, nut, frontFerrule, backFerrule, madeUp, npt };
}

// ================================================================= items
const DEG = Math.PI / 180;

export const items = [
  // ------------------------------------------------------------------------------------------------ 1
  {
    id: "bend_fittings", title: "彎頭與管配件",
    build(THREE, M) {
      const K = makeKit(THREE), B = K.batch(), inner = new THREE.Group(), EP = M.ss_ep;
      // [outer radius, wall]
      const D2 = [25.4, 1.65], D15 = [19.05, 1.65], D1 = [12.7, 1.65], D05 = [6.35, 1.24], D025 = [3.175, 0.89];
      const segOf = (s) => (s[0] > 20 ? 32 : s[0] > 10 ? 26 : s[0] > 5 ? 18 : 12);
      const bend = (s, x, z, deg, ops) => B.add(EP, K.tubePath(K.mkPath(x, z, deg * DEG, ops), s[0], s[0], s[0] - s[1], segOf(s)));
      const A = (R, deg) => ["A", R, deg * DEG, Math.max(3, Math.round(Math.abs(deg) / 10))];
      const tee = (s, x, z, a, ry, cross, up) => {
        const n = segOf(s);
        B.add(EP, K.move(K.tee(s[0], s[0] - s[1], a, a, { nphi: n, nb: n, nx: 3, cross }), { rx: up ? -Math.PI / 2 : 0, ry: ry * DEG, pos: [x, s[0], z] }));
      };
      const sm = (t) => t * t * (3 - 2 * t);
      const reducer = (s1, s2, x, z, H) => {
        const out = [], inn = [], y0 = H * 0.3, y1 = H * 0.72, n = 10;
        out.push([s1[0] - 0.15, 0], [s1[0], 0.15]);
        for (let i = 0; i <= n; i++) { const t = i / n, q = sm(t); out.push([s1[0] + (s2[0] - s1[0]) * q, y0 + (y1 - y0) * t]); inn.push([s1[0] - s1[1] + (s2[0] - s2[1] - s1[0] + s1[1]) * q, y0 + 0.4 + (y1 - y0) * t]); }
        out.push([s2[0], H - 0.15], [s2[0] - 0.15, H], [s2[0] - s2[1], H]);
        B.put(EP, [x, 0, z], null, K.rev([...out, ...inn.reverse(), [s1[0] - s1[1], 0], [s1[0] - 0.15, 0]], segOf(s1)));
      };
      const cap = (s, x, z) => {
        const r = s[0], w = s[1], sk = r * 0.45, hd = r * 0.5;
        B.put(EP, [x, 0, z], null, K.rev([[r - w, 0], [r, 0], ...K.arc(0, sk, r, hd, 0, Math.PI / 2, 8), ...K.arc(0, sk, r - w, hd - w, Math.PI / 2, 0, 8), [r - w, 0]], segOf(s)));
      };
      const stubEnd = (s, x, z, H) => {
        const r = s[0], w = s[1], f = r * 1.5;
        B.put(EP, [x, 0, z], null, K.rev([[r - w, 0], [f, 0], [f, w * 1.6], ...K.arc(r + 4, w * 1.6 + 4, 4, 4, -Math.PI / 2, -Math.PI, 5), [r, H - 0.15], [r - 0.15, H], [r - w, H], [r - w, 0]], segOf(s)));
      };
      // ---- back: large sanitary sizes
      tee(D2, -200, -180, 68, 0, false, true);
      bend(D15, -70, -125, -90, [["L", 30], A(58, 180), ["L", 30]]);
      bend(D1, -35, -125, -90, [["L", 30], A(23, 180), ["L", 30]]);
      bend(D2, 120, -125, -90, [["L", 18], A(62, 90), ["L", 18]]);
      reducer(D2, D1, 262, -175, 76); stubEnd(D2, 268, -95, 34);
      // ---- middle: caps, stub ends, reducers, 1.5" / 1" bends and tees
      cap(D2, -268, -80); cap(D1, -272, 12);
      tee(D15, -170, -66, 50, 0, false, false);
      stubEnd(D15, -70, -58, 30);
      bend(D15, 0, -90, 0, [["L", 10], A(45, 90), ["L", 10]]);
      tee(D1, 150, -58, 40, 0, true, false);
      reducer(D15, D05, 232, -30, 64);
      bend(D1, -228, 12, 0, [["L", 62], A(38, 90), ["L", 14]]);
      bend(D1, -95, 12, 0, [["L", 30], A(38, 60), ["L", 22]]);
      bend(D1, -5, 6, 0, [["L", 50], A(38, 90), ["L", 12]]);
      tee(D1, 150, 32, 42, 0, false, false);
      reducer(D1, D05, 232, 34, 44); reducer(D1, D025, 280, 30, 40);
      // ---- front: 1/2" and 1/4" tube sizes
      tee(D05, -240, 108, 30, 0, false, false);
      tee(D05, -168, 112, 26, 0, true, false);
      for (let i = 0; i < 3; i++) bend(D05, -118 + i * 20, 96 + i * 16, 0, [["L", 30 - i * 4], A(19, 90), ["L", 18]]);
      bend(D05, 2, 100, 0, [["L", 30], A(19, 45), ["L", 30]]);
      bend(D05, 96, 96, 0, [["L", 22], A(19, 90), ["L", 22]]);
      tee(D05, 192, 112, 28, 0, false, false);
      bend(D05, 240, 96, 0, [["L", 14], A(19, 180), ["L", 14]]);
      for (let i = 0; i < 4; i++) bend(D025, -236 + i * 13, 172 + i * 9, 0, [["L", 16], A(9.5, 90), ["L", 14]]);
      bend(D025, -150, 178, 0, [["L", 22], A(9.5, 45), ["L", 22]]);
      tee(D025, -62, 186, 22, 0, false, false);
      tee(D025, -6, 188, 20, 0, true, false);
      bend(D025, 40, 176, 0, [["L", 14], A(9.5, 180), ["L", 14]]);
      tee(D025, 104, 182, 22, 0, false, false);
      for (let i = 0; i < 3; i++) bend(D025, 150 + i * 13, 172 + i * 9, 0, [["L", 16], A(9.5, 90), ["L", 14]]);
      tee(D025, 240, 190, 20, 0, true, false);
      B.build(inner);
      return { root: K.finish(inner) };
    },
  },
  // ------------------------------------------------------------------------------------------------ 2
  {
    id: "forged_micro", title: "鍛造與微型管件",
    build(THREE, M) {
      const K = makeKit(THREE), B = K.batch(), inner = new THREE.Group(), EP = M.ss_ep;
      const BODY = M.ss_ep.clone(); BODY.roughness = 0.14;
      const X = [1, 0, 0], NX = [-1, 0, 0], Z = [0, 0, 1], NZ = [0, 0, -1], UP = [0, 1, 0];
      // block body + short weld stubs. a = distance from centre to the block face each stub leaves from.
      const micro = (cx, cz, od, wall, sec, A, dirs, poly, ry = 0) => {
        const ro = od / 2, ri = ro - wall, w = sec / 2;
        const gs = [K.slab(poly || [[-w, -w], [w, -w], [w, w], [-w, w]], sec, sec * 0.04)];
        B.add(BODY, K.move(gs, { ry, pos: [cx, 0, cz] }));
        for (const d of dirs) {
          const g = K.xf(K.rev([[ro, w - 0.6], [ro, A - 0.15], [ro - 0.15, A], [ri + 0.15, A], [ri, A - 0.15], [ri, 0]], 40), [0, w, 0], d);
          B.add(EP, K.move([g], { ry, pos: [cx, 0, cz] }));
        }
      };
      // cross
      micro(-30, -58, 12.7, 1.65, 14.4, 21, [X, NX, Z, NZ], null, 0.5);
      // 45-degree elbow: block follows both legs
      {
        const w = 7.2, a = 9.5, c = Math.SQRT1_2;
        const poly = [[a, -w], [a, w], [0.414 * w, w], [-c * a + c * w, c * a + c * w], [-c * a - c * w, c * a - c * w], [-0.414 * w, -w]];
        micro(-98, -48, 12.7, 1.65, 14.4, 22, [X, [-c, 0, c]], poly, 0.35);
      }
      // 90-degree elbow, small
      micro(-78, 0, 9.53, 1.25, 11.2, 15.5, [X, Z], null, 2.3);
      // large three-way (side-outlet) block
      micro(48, -28, 25.4, 3.0, 29.5, 37, [X, Z, UP], null, 0.42);
      // tee welded into a tube run (orbital weld seams)
      {
        const od = 9.53, ro = od / 2, wall = 0.89, sec = 11.2, A = 12.5, cx = -6, cz = 50, ry = 0.14;
        micro(cx, cz, od, wall, sec, A, [X, NX, Z], null, ry);
        for (const [d, L] of [[X, 96], [NX, 96], [Z, 52]]) {
          const g = K.xf(K.tube(ro, ro - wall, A, A + L, 32), [0, sec / 2, 0], d);
          const wb = new THREE.TorusGeometry(ro + 0.02, 0.3, 6, 32); wb.rotateX(Math.PI / 2); K.xf(wb, [d[0] * A, sec / 2, d[2] * A], d);
          B.add(EP, K.move([g, wb], { ry, pos: [cx, 0, cz] }));
        }
      }
      B.build(inner);
      return { root: K.finish(inner) };
    },
  },
  // ------------------------------------------------------------------------------------------------ 3
  {
    id: "vcr_compression", title: "VCR 接頭與壓接式接頭",
    build(THREE, M) {
      const K = makeKit(THREE), CK = compKit(K), inner = new THREE.Group();
      const EP = M.ss_ep, NUT = M.ss_machined, BODY = M.ss_ba;
      const GASKET = M.ss_ba.clone(); GASKET.color.set(0xd9d2c0); GASKET.roughness = 0.22;
      const HOLE = M.black.clone(); HOLE.roughness = 1; HOLE.metalness = 0; HOLE.color.set(0x050506);
      const DARK = M.ss_machined.clone(); DARK.color.set(0x6f7377);
      const X = [1, 0, 0], NX = [-1, 0, 0], Z = [0, 0, 1];

      // ---------- (a) metal-gasket face-seal assembly, 1/4". Local +Y of `asm` = world +X. Gasket plane at y = 0 when closed.
      const AX = 9.525, PITCH = 1.411;
      const asm = new THREE.Group(); asm.rotation.z = -Math.PI / 2; asm.position.set(-4, AX, -16); inner.add(asm);
      const gland = (GL) => K.rev([[2.3, 0.35], [3.35, 0.35], ...K.arc(3.9, 0.35, 0.55, 0.35, Math.PI, TAU, 6), [5.85, 0.35], [6.1, 0.6], [6.1, 3.35], [5.85, 3.6],
        [3.6, 3.6], [3.175, 4.0], [3.175, GL - 0.1], [3.075, GL], [2.3, GL], [2.3, 0.35]], 32);
      const gasket = () => K.rev([[2.8, -0.35], [5.95, -0.35], [5.95, 0.35], [2.8, 0.35], [2.8, -0.35]], 32);
      const GL = 28.6;
      { const g = gland(GL); g.rotateZ(Math.PI); g.translate(0, -0.35, 0); K.batch().add(EP, g).build(asm); }
      const gGlandR = new THREE.Group(); asm.add(gGlandR); K.batch().add(EP, gland(GL)).build(gGlandR);
      const gGasket = new THREE.Group(); asm.add(gGasket); K.batch().add(GASKET, gasket()).build(gGasket);
      // female nut: 3/4" hex, 9/16-18 internal thread, two leak-test ports
      const femaleNut = (b) => {
        const r0 = K.hexR0(19.05), L = 20.6, out = [];
        out.push([NUT, K.hexSide(19.05, 0, L), K.rev([[r0, L], [7.5, L], [7.15, L - 0.35]], 32),
          K.thread(7.15, 6.38, 7.6, L - 0.35 - 7.6, PITCH, { segs: 28 }),
          K.rev([[7.15, 7.6], [7.15, 7.1], [3.5, 7.1], [3.5, 0.3], [3.8, 0], [r0, 0]], 32)]);
        for (const ang of [120, 300]) {
          const a = ang * DEG, d = [Math.cos(a), 0, Math.sin(a)], ap = 9.525;
          out.push([HOLE, K.xf(K.rev([[1.45, 0], [0, 0]], 20), [d[0] * (ap + 0.02), 10.9, d[2] * (ap + 0.02)], d)]);
          out.push([DARK, K.xf(K.rev([[1.75, 0], [1.45, 0]], 20), [d[0] * (ap + 0.025), 10.9, d[2] * (ap + 0.025)], d)]);
        }
        return out;
      };
      const gFemale = new THREE.Group(); asm.add(gFemale);
      { const b = K.batch(); for (const [m, ...g] of femaleNut()) b.add(m, g); b.build(gFemale); }
      // male nut: 5/8" hex, 9/16-18 external thread
      const gMale = new THREE.Group(), gMaleSpin = new THREE.Group(); asm.add(gMale); gMale.add(gMaleSpin);
      {
        const r0 = K.hexR0(15.88);
        K.batch().add(NUT, K.rev([[3.5, 0.25], [3.75, 0], [6.0, 0], [6.3, 0.3]], 32), K.thread(6.3, 7.1, 0.3, 9.2, PITCH, { segs: 28 }),
          K.rev([[6.3, 9.5], [6.3, 10.4], [r0, 10.4]], 32), K.hexSide(15.88, 10.4, 18.3),
          K.rev([[r0, 18.3], [3.8, 18.3], [3.5, 18.0], [3.5, 0.25]], 32)).build(gMaleSpin);
      }
      const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
      const ENG = 5.6;
      const update = (t) => {
        const u = ((t % 12) + 12) % 12;
        let a, b; // a: thread disengaged 0..1, b: pulled apart 0..1
        if (u < 3) { a = 1; b = 1; } else if (u < 5.5) { a = 1; b = 1 - sm((u - 3) / 2.5); } else if (u < 7) { a = 1 - sm((u - 5.5) / 1.5); b = 0; }
        else if (u < 8) { a = 0; b = 0; } else if (u < 9.5) { a = sm((u - 8) / 1.5); b = 0; } else { a = 1; b = sm((u - 9.5) / 2.5); }
        gFemale.position.y = -11.05 - 14 * b;
        gGasket.position.y = 10 * b;
        gGlandR.position.y = 24 * b;
        gMale.position.y = 3.95 + ENG * a + 23.2 * b;
        gMaleSpin.rotation.y = (-TAU * ENG * a) / PITCH;
      };
      update(0);

      const b = K.batch();
      // ---------- loose face-seal parts (back row): double-male union body, short gland, gaskets
      {
        const r0 = K.hexR0(15.88), o = [-36, 15.88 / 2, -60], dir = [1, 0, -0.2];
        b.put(BODY, o, dir, K.hexSide(15.88, -4, 4));
        for (const s of [1, -1]) {
          const gs = [K.rev([[r0, 4], [6.3, 4], [6.3, 5]], 32), K.thread(6.3, 7.1, 5, 9.2, PITCH, { segs: 28 }),
            K.rev([[6.3, 14.2], [6.0, 14.5], [4.45, 14.5], ...K.arc(3.9, 14.5, 0.55, 0.35, 0, Math.PI, 6), [2.3, 14.5], [2.3, 0]], 32)];
          if (s < 0) gs.forEach((g) => g.rotateZ(Math.PI));
          b.put(BODY, o, dir, gs);
        }
        const g2 = gland(17); g2.rotateZ(Math.PI); b.put(EP, [20, 6.1, -62], [-1, 0, -0.45], g2);
        const k1 = gasket(); k1.translate(0, 0.35, 0); b.put(GASKET, [48, 0, -50], null, k1);
      }
      // ---------- (b) double-ferrule compression union, 1/4": left side made up, right side exploded
      const mats = { body: BODY, nut: NUT, tube: EP };
      {
        const C = C4, ax = C.nutAF / 2, o = [-10, ax, 18];
        b.put(BODY, o, X, K.hexSide(C.bodyAF, -C.hw, C.hw));
        b.put(BODY, o, X, CK.port(C, C.hw, K.hexR0(C.bodyAF)));
        CK.madeUp(b, mats, C, o, NX, C.hw, K.hexR0(C.bodyAF), 24);
        b.put(M.ss_ep, o, X, CK.frontFerrule(C, 17.5), CK.backFerrule(C, 25));
        b.put(NUT, o, X, CK.nut(C, 31.5, true));
        b.put(EP, o, X, K.tube(C.tr, C.tr - C.tw, 14.6, 60));
      }
      // ---------- compression tee and male elbow with forged bodies (front row)
      {
        const C = C4, ax = C.nutAF / 2;
        let sec = 11.8, La = 8.4, o = [-38, ax, 58];
        b.put(BODY, [o[0], ax - sec / 2, o[2]], null, K.forged("T", sec / 2, La, sec, 0.9));
        for (const d of K.ARMS.T) CK.madeUp(b, mats, C, o, d, La, C.thR + 0.4, 0);
        sec = 13.6; La = 8.6; o = [28, ax, 56];
        b.put(BODY, [o[0], ax - sec / 2, o[2]], null, K.forged("L", sec / 2, La, sec, 1.0));
        CK.madeUp(b, mats, C, o, Z, La, C.thR + 0.4, 0);
        b.put(BODY, o, X, CK.npt(La, 6.6));
      }
      b.build(inner);
      return { root: K.finish(inner), update };
    },
  },
  // ------------------------------------------------------------------------------------------------ 4
  {
    id: "cylinder_fittings", title: "鋼瓶接頭",
    build(THREE, M) {
      const K = makeKit(THREE), B = K.batch(), inner = new THREE.Group();
      const NUT = M.ss_machined, BODY = M.ss_ba, UP = [0, 1, 0], P = 2.117, S = 32;
      const WIRE = M.ss_ba.clone(); WIRE.roughness = 0.3;
      const HOLE = M.black.clone(); HOLE.roughness = 1; HOLE.metalness = 0; HOLE.color.set(0x050506);
      const AF = 32, R0 = K.hexR0(AF), TR = 14.2, TC = 13.25;   // connection nut hex / internal thread
      const MR = 12.25, MC = 13.2;                              // matching external thread
      // long connection nut, mouth at y = L
      const nutLong = (L, threaded) => [K.hexSide(AF, 0, L), K.rev([[R0, L], [TR + 0.4, L], [TR, L - 0.4]], S),
        threaded ? K.thread(TR, TC, 8, L - 8.4, P, { segs: S }) : K.rev([[TR, L - 0.4], [TR, 8]], S),
        K.rev([[TR, 8], [TR, 7], [9.3, 7], [9.3, 0.3], [9.6, 0], [R0, 0]], S)];
      // nipple matching nutLong coordinates: rounded nose inside the nut, hex, stepped weld stub to the rear (-y)
      const r0h = K.hexR0(19);
      const nipple = () => [K.rev([[3.4, -40], [4.76, -40], [4.76, -25], [7.6, -21], [7.6, -15], [r0h, -15]], S), K.hexSide(19, -15, -6),
        K.rev([[r0h, -6], [9, -6], [9, 7], [12.8, 7], [12.8, 12], ...K.arc(5.5, 12, 7.3, 8, 0, Math.PI / 2, 8), [3.9, 20], [3.4, 19.5], [3.4, -40]], S)];
      const ring = (x, z, r = 13) => { const g = new THREE.TorusGeometry(r, 0.75, 6, 36); g.rotateX(Math.PI / 2); g.translate(x, 0.75, z); return g; };
      const hole = (o, dir, y, side) => {
        const g1 = K.xf(K.rev([[1.0, 0], [0, 0]], 16), [side[0] * (AF / 2 + 0.03), y, side[2] * (AF / 2 + 0.03)], side);
        B.put(HOLE, o, dir, g1);
      };
      // -- 1: connection lying, nut + nipple (leak-check hole on a flat)
      {
        const o = [-95, AF / 2, -40], d = [-1, 0, 0.32];
        B.put(NUT, o, d, nutLong(30, false)); B.put(BODY, o, d, nipple());
        hole(o, d, 16, [-1, 0, 0]);
      }
      // -- 2: connection lying with a jam nut, retaining chain and ring
      {
        const o = [-110, AF / 2, 24], d = [-1, 0, 0.3];
        B.put(NUT, o, d, nutLong(30, false)); B.put(BODY, o, d, nipple());
        B.put(NUT, o, d, K.hexSide(27, -5.6, -0.6), K.rev([[K.hexR0(27), -0.6], [9.3, -0.6]], S), K.rev([[9.3, -5.6], [K.hexR0(27), -5.6]], S));
        B.add(WIRE, K.chain([[-107, 29.5, 26], [-106, 8, 42], [-108, 2, 58], [-96, 2, 76], [-76, 2, 84], [-58, 2, 80]]), ring(-45, 78));
      }
      // -- 3: standing connection (nut mouth down, weld stub up) and a bare nipple standing on its flange
      {
        const o = [-25, 30, -92], d = [0, -1, 0];
        B.put(NUT, o, d, nutLong(30, false)); B.put(BODY, o, d, nipple());
        const rh = K.hexR0(17);
        B.put(BODY, [28, 0, -100], null, K.rev([[3.4, 0], [12.6, 0], [13, 0.4], [13, 3.6], [12.6, 4], [8.5, 4], [8.5, 7], [rh, 7]], S), K.hexSide(17, 7, 15),
          K.rev([[rh, 15], [8, 15], [8, 18], [4.76, 23], [4.76, 43.85], [4.61, 44], [3.4, 44], [3.4, 0]], S));
      }
      // -- 4: hex cap with seat insert, retaining chain and ring
      {
        const o = [0, AF / 2, -22], d = [0.45, 0, 0.9], L = 24;
        B.put(NUT, o, d, K.hexSide(AF, 0, L), K.rev([[0, 0], [R0, 0]], S), K.rev([[R0, L], [TR + 0.4, L], [TR, L - 0.4]], S), K.thread(TR, TC, 10, L - 10.4, P, { segs: S }),
          K.rev([[TR, 10], [TR, 9], [8.5, 9], [8.5, 12.5], [8, 13]], S));
        B.put(BODY, o, d, K.rev([[8, 13], [5.2, 13], [5.2, 11], [0, 11]], S));
        B.add(WIRE, K.chain([[-2, 30.5, -26], [12, 16, -44], [30, 2, -42], [44, 2, -22], [42, 2, 2], [28, 2, 18]]), ring(15, 24));
      }
      // -- 5: loose hex nut, thread right through
      {
        const o = [76, AF / 2, -62], d = [0.35, 0, 0.94], L = 19;
        B.put(NUT, o, d, K.hexSide(AF, 0, L), K.rev([[R0, L], [TR + 0.4, L], [TR, L - 0.4]], S), K.thread(TR, TC, 0.4, L - 0.8, P, { segs: S }), K.rev([[TR, 0.4], [TR + 0.4, 0], [R0, 0]], S));
      }
      // -- 6: male-thread outlet adapters standing on their hex flange
      const adapter = (x, z, af, hh, tl, bore) => {
        const r0 = K.hexR0(af), y1 = hh + 2 + tl;
        B.put(BODY, [x, 0, z], null, K.rev([[bore, 0], [r0, 0]], S), K.hexSide(af, 0, hh), K.rev([[r0, hh], [MR, hh], [MR, hh + 2]], S), K.thread(MR, MC, hh + 2, tl, P, { segs: S }),
          K.rev([[MR, y1], [MR - 0.4, y1 + 0.5], [bore + 2.2, y1 + 0.5], [bore + 2.2, y1 - 5], [bore, y1 - 6], [bore, 0]], S));
      };
      adapter(138, -78, 36, 8, 11, 6.5); adapter(100, -6, 36, 9, 10, 6.5); adapter(156, -4, 34, 7, 11, 6);
      // -- 7: hex plugs lying (one solid end towards the viewer, one showing the bored thread end)
      const plug = (o, d, bored) => {
        const af = 30, r0 = K.hexR0(af);
        B.put(NUT, o, d, K.rev([[0, 0], [r0, 0]], S), K.hexSide(af, 0, 20), K.rev([[r0, 20], [MR, 20], [MR, 21.5]], S), K.thread(MR, MC, 21.5, 12, P, { segs: S }),
          K.rev(bored ? [[MR, 33.5], [MR - 0.4, 34], [9, 34], [9, 25], [0, 25]] : [[MR, 33.5], [MR - 0.4, 34], [0, 34]], S));
      };
      plug([46, 15, 96], [0.45, 0, -0.9], false);
      plug([118, 15, 66], [0.3, 0, 0.95], true);
      // small seal washer
      B.put(BODY, [72, 0, 30], null, K.rev([[3, 0], [6.6, 0], [6.6, 1.2], [3, 1.2], [3, 0]], 24));
      B.build(inner);
      return { root: K.finish(inner) };
    },
  },
  // ------------------------------------------------------------------------------------------------ 5
  {
    id: "presslok", title: "壓接管件",
    build(THREE, M) {
      const K = makeKit(THREE), B = K.batch(), inner = new THREE.Group();
      const SS = M.ss_mp, CAST = M.ss_cast, BAR = M.ss_machined, BLUE = M.blue, RUB = M.rubber;
      const wallOf = (d) => (d > 30 ? 1.5 : d > 20 ? 1.2 : 1.0), segOf = (d) => (d > 40 ? 32 : d > 20 ? 24 : 16);
      // press socket along +y starting at the body tube (y = 0); bulged O-ring bead near the mouth
      const sock = (d) => {
        const t = wallOf(d), R = d / 2, Rs = R + 0.15 + t, b = 0.05 * d + 1.5, f = 0.1 * d + 1, Ls = 0.45 * d + 12, yc = Ls - b - 1.6, n = segOf(d);
        const p = [[R, 0], [Rs, f], [Rs, yc - b]];
        for (let k = 1; k < 6; k++) { const a = (Math.PI * k) / 6; p.push([Rs + 0.85 * b * Math.sin(a), yc - b * Math.cos(a)]); }
        p.push([Rs, yc + b], [Rs, Ls - 0.3], [Rs - 0.3, Ls], [Rs - t, Ls], [Rs - t, f + t], [R - t, t], [R - t, 0]);
        return { g: [K.rev(p, n)], o: [K.rev([[Rs - t - 0.08, yc + b * 0.75], [Rs - t - 0.6, yc + b * 0.3], [Rs - t - 0.6, yc - b * 0.3], [Rs - t - 0.08, yc - b * 0.75]], n)], Ls, Ro: Rs + 0.85 * b };
      };
      const putSock = (d, pos, dir) => { const s = sock(d); B.put(SS, pos, dir, s.g); B.put(RUB, pos, dir, s.o); return s; };
      const info = (d) => { const t = wallOf(d), b = 0.05 * d + 1.5; return { t, R: d / 2, Ro: d / 2 + 0.15 + t + 0.85 * b, Ls: 0.45 * d + 12 }; };
      // coupling, optionally reducing; axis along dir, centred at pos
      const coupling = (d1, d2, pos, dir) => {
        const c = 0.12 * d1 + 3, i1 = info(d1), i2 = info(d2);
        const p = d1 === d2 ? [[i1.R, -c], [i1.R, -1.2], [i1.R - 0.8, -0.6], [i1.R - 0.8, 0.6], [i1.R, 1.2], [i1.R, c]]
          : [[i1.R, -c], [i1.R, -c * 0.6], [i2.R, c * 0.6], [i2.R, c]];
        const pin = d1 === d2 ? [[i1.R - i1.t, c], [i1.R - i1.t, -c]] : [[i2.R - i2.t, c], [i2.R - i2.t, c * 0.6], [i1.R - i1.t, -c * 0.6], [i1.R - i1.t, -c]];
        B.put(SS, pos, dir, K.rev(p, segOf(d1)), K.rev(pin, segOf(d1)));
        const up = [dir[0] * c, dir[1] * c, dir[2] * c];
        putSock(d2, [pos[0] + up[0], pos[1] + up[1], pos[2] + up[2]], dir);
        putSock(d1, [pos[0] - up[0], pos[1] - up[1], pos[2] - up[2]], [-dir[0], -dir[1], -dir[2]]);
        return c;
      };
      const standing = (d1, d2, x, z) => { const c = 0.12 * d1 + 3; coupling(d1, d2, [x, c + info(d1).Ls, z], [0, 1, 0]); };
      // elbow lying flat; plain > 0 leaves a plain spigot end of that length instead of the second socket
      const elbow = (d, x, z, deg, ang, plain = 0) => {
        const i = info(d), h = i.Ro, fr = K.mkPath(x, z, deg * DEG, [["L", 1.5], ["A", 1.15 * d, ang * DEG, Math.round(Math.abs(ang) / 7.5)], ["L", plain || 1.5]]);
        B.add(SS, K.tubePath(fr, h, i.R, i.R - i.t, segOf(d)));
        const a = fr[0], e = fr[fr.length - 1];
        putSock(d, [a.x, h, a.z], [-a.tx, 0, -a.tz]);
        if (!plain) putSock(d, [e.x, h, e.z], [e.tx, 0, e.tz]);
      };
      const teeP = (d, x, z, ry) => {
        const i = info(d), A = 0.85 * d, n = segOf(d), c = Math.cos(ry), s = Math.sin(ry);
        B.add(SS, K.move(K.tee(i.R, i.R - i.t, A, A, { nphi: n, nb: n, nx: 3 }), { ry, pos: [x, i.Ro, z] }));
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1]]) { const wx = dx * c + dz * s, wz = -dx * s + dz * c; putSock(d, [x + wx * A, i.Ro, z + wz * A], [wx, 0, wz]); }
      };
      // three-piece ball valve with blue lever handle; flow along local +x, then rotated by ry about Y
      const valve = (d, pos, ry, inletLen = 0) => {
        const s = d / 15, L = [], add = (m, ...g) => { for (const q of g.flat()) L.push([m, q]); }, X = [1, 0, 0];
        add(CAST, K.xf(K.rev([[0, -9 * s], [13 * s, -9 * s], [14 * s, -8 * s], [14 * s, 8 * s], [13 * s, 9 * s], [0, 9 * s]], 28), null, X));
        for (const sg of [1, -1]) {
          const dir = [sg, 0, 0];
          const pl = new THREE.BoxGeometry(4 * s, 30 * s, 30 * s); pl.translate(sg * 11 * s, 0, 0); add(CAST, pl);
          const r0 = K.hexR0(25 * s);
          add(CAST, K.xf(K.hexSide(25 * s, 13 * s, 21 * s, { per: 6 }), null, dir), K.xf(K.rev([[r0, 21 * s], [d / 2, 21 * s], [d / 2, 25 * s]], 24), null, dir));
          if (sg < 0 && inletLen) add(SS, K.xf(K.tube(d / 2, d / 2 - 1, 24 * s, 24 * s + inletLen, 20), null, dir));
          else { const k = sock(d); add(SS, K.xf(k.g[0].translate(0, 25 * s, 0), null, dir)); add(RUB, K.xf(k.o[0].translate(0, 25 * s, 0), null, dir)); }
          for (const y of [-11, 11]) {
            const nt = new THREE.CylinderGeometry(3.3 * s, 3.3 * s, 2.8 * s, 6); nt.rotateZ(Math.PI / 2); nt.translate(sg * 14.4 * s, y * s, sg * 11 * s); add(BAR, nt);
            const n2 = nt.clone(); n2.translate(0, 0, -sg * 22 * s); add(BAR, n2);
          }
        }
        for (const y of [-11, 11]) for (const z of [-11, 11]) { const bt = new THREE.CylinderGeometry(1.7 * s, 1.7 * s, 31 * s, 8); bt.rotateZ(Math.PI / 2); bt.translate(0, y * s, z * s); add(BAR, bt); }
        const stem = new THREE.CylinderGeometry(4.2 * s, 4.2 * s, 12 * s, 16); stem.translate(0, 19 * s, 0); add(BAR, stem);
        const pk = new THREE.CylinderGeometry(7.5 * s, 7.5 * s, 6 * s, 6); pk.translate(0, 16.5 * s, 0); add(CAST, pk);
        const bar = new THREE.BoxGeometry(34 * s, 2.4 * s, 11 * s); bar.translate(10 * s, 22.4 * s, 0); add(BAR, bar);
        const tn = new THREE.CylinderGeometry(4.8 * s, 4.8 * s, 3 * s, 6); tn.translate(0, 25 * s, 0); add(BAR, tn);
        const sl = K.slab([[0, -6.5 * s], [50 * s, -6.5 * s], [50 * s, 6.5 * s], [0, 6.5 * s]], 5 * s, 1.4 * s); sl.translate(18 * s, 20 * s, 0); add(BLUE, sl);
        for (const [m, g] of L) { g.rotateY(ry); g.translate(pos[0], pos[1], pos[2]); B.add(m, g); }
      };
      // ---- pipe run with a coupling pressed on each end and two branch valves
      {
        const d = 54, i = info(d), xp = -235, z0 = -230, z1 = 215;
        B.put(SS, [xp, i.Ro, z0], [0, 0, 1], K.tube(i.R, i.R - i.t, 0, z1 - z0, 36));
        for (const [z, sg] of [[z0, -1], [z1, 1]]) {
          const s = sock(d); const dir = [0, 0, -sg];
          B.put(SS, [xp, i.Ro, z + sg * 3], dir, s.g); B.put(SS, [xp, i.Ro, z + sg * 3], [0, 0, sg], K.rev([[i.R - i.t, 0], [i.R + 0.15 + i.t, 0]], 36));
        }
        for (const z of [-95, 45]) valve(15, [xp + i.R + 24 + 14, i.Ro, z], 0, 16);
      }
      // loose valves with press ends
      valve(28, [150, 28, -175], -0.5);
      valve(22, [30, 22, -120], -0.45);
      // elbows, tee
      elbow(42, -70, 30, 20, -45);
      teeP(22, 60, 40, 0.1);
      elbow(22, 120, 150, -90, 90);
      elbow(54, 195, 105, -90, 90);
      elbow(42, 335, -20, -90, 90, 34);
      // front row: couplings standing on end, largest to smallest, and a reducer
      standing(54, 54, -165, 195); standing(35, 35, -85, 205); standing(22, 22, -20, 210); standing(15, 15, 30, 212); standing(35, 22, 85, 220);
      B.build(inner);
      return { root: K.finish(inner) };
    },
  },
];

/* ---------------------------------------------------------------- weld fittings and cylinder connection for the assembled line (line.html)
   Returns the same geometry kit the catalogue items use plus single fittings. All geometries are in millimetres along +Y
   unless noted; place them with K.batch().put(material, pos, dir, geos). `items` above is untouched. */
export function lineFittings(THREE) {
  const K = makeKit(THREE), S = 32, P = 2.117;
  const AF = 32, R0 = K.hexR0(AF), TR = 14.2, r0h = K.hexR0(19);
  // Cylinder connection, nut mouth at y = 30 (towards the cylinder valve), 1/4" weld stub ending at y = -40.
  const cylinderNut = () => [K.hexSide(AF, 0, 30), K.rev([[R0, 30], [TR + 0.4, 30], [TR, 29.6]], S), K.rev([[TR, 29.6], [TR, 8]], S),
    K.rev([[TR, 8], [TR, 7], [9.3, 7], [9.3, 0.3], [9.6, 0], [R0, 0]], S)];
  const cylinderNipple = () => [K.rev([[2.3, -40], [3.175, -40], [3.175, -25], [7.6, -21], [7.6, -15], [r0h, -15]], S), K.hexSide(19, -15, -6),
    K.rev([[r0h, -6], [9, -6], [9, 7], [12.8, 7], [12.8, 12], ...K.arc(5.5, 12, 7.3, 8, 0, Math.PI / 2, 8), [3.9, 20], [3.4, 19.5], [3.4, -40]], S)];
  // Matching outlet thread on the cylinder valve: from y = y0 up to the nipple nose at y = 20.
  const outletThread = (y0) => [K.rev([[TR - 0.2, y0 + 12], [13.2, y0 + 12]], S), K.thread(12.25, 13.2, y0, 12, P, { segs: S })];
  // 90-degree elbow in the XY plane: enters at the origin heading +X (up = true: leaves heading +Y; up = false: enters heading +Y, leaves heading +X).
  function elbow(ro, ri, R, up, segs = 24) {
    const fr = up ? K.mkPath(0, 0, 0, [["A", R, Math.PI / 2, 10]]) : K.mkPath(0, 0, Math.PI / 2, [["A", R, -Math.PI / 2, 10]]);
    return K.move(K.tubePath(fr, 0, ro, ri, segs), { rx: -Math.PI / 2 });
  }
  const sm = (t) => t * t * (3 - 2 * t);
  // Concentric weld reducer from (r1, w1) at y = 0 to (r2, w2) at y = H.
  function reducer(r1, w1, r2, w2, H, segs = 28) {
    const out = [], inn = [], y0 = H * 0.3, y1 = H * 0.72, n = 10;
    out.push([r1 - 0.15, 0], [r1, 0.15]);
    for (let i = 0; i <= n; i++) { const t = i / n, q = sm(t); out.push([r1 + (r2 - r1) * q, y0 + (y1 - y0) * t]); inn.push([r1 - w1 + (r2 - w2 - r1 + w1) * q, y0 + 0.4 + (y1 - y0) * t]); }
    out.push([r2, H - 0.15], [r2 - 0.15, H], [r2 - w2, H]);
    return K.rev([...out, ...inn.reverse(), [r1 - w1, 0], [r1 - 0.15, 0]], segs);
  }
  function cap(r, w, segs = 28) {
    const sk = r * 0.45, hd = r * 0.5;
    return K.rev([[r - w, 0], [r, 0], ...K.arc(0, sk, r, hd, 0, Math.PI / 2, 8), ...K.arc(0, sk, r - w, hd - w, Math.PI / 2, 0, 8), [r - w, 0]], segs);
  }
  // Orbital weld bead ring around a tube of radius r at y = 0.
  const weld = (r) => { const g = new THREE.TorusGeometry(r + 0.02, 0.28, 6, 28); g.rotateX(Math.PI / 2); return g; };
  return { K, cylinderNut, cylinderNipple, outletThread, elbow, reducer, cap, weld };
}
