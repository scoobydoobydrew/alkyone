/* ============================================================================
   Alkyone · infant-model.js            variant A — "sculpted rings"
   ----------------------------------------------------------------------------
   PURE GEOMETRY. No THREE, no DOM. Works unchanged in the browser
   (window.Alkyone.infant.model) and in Node (require('./infant-model.js')).

   What it builds
     · a low-poly infant TORSO lofted from 14 cross-section rings x 16 segments
       (superellipse profiles that follow a hand-tuned infant profile),
     · two tapered ARM stubs (lofted along a short curved path, rounded ends),
     · a flexible-circuit PATCH on the upper chest: a smooth pebble-shaped tray,
       layered interior (contact-pad ghosts, amber flex core, frosted lid), a
       conforming glow decal, and the 2D artwork those layers are painted with.

   Everything is deterministic (seeded PRNG): same input, same bytes.

   Conventions
     · +Y up, +Z is the front of the infant, +X is the infant's left (screen
       right when you look at the chest from the front). Torso is ~2 units wide.
     · parts[].positions are NON-INDEXED triangles (xyz), CCW = front face.
     · parts[].colors are sRGB 0..1 per vertex (the scene converts to linear).
     · Parts with `layer` are textured quads/grids (they also carry `uvs`).
     · Parts with `smooth` carry per-vertex `normals`; others are facet-flat.

   API   Alkyone.infant.model.build(opts?) ->
         { parts, patch, bounds, stats }
         Alkyone.infant.model.rig        light rig per backdrop (shared with SVG)
         Alkyone.infant.model.shade(...) CPU Lambert + rim, same maths as the scene
         Alkyone.infant.model.patchPoint(patch, ua, va, h)  art units -> xyz
   ========================================================================== */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.Alkyone = root.Alkyone || {};
  root.Alkyone.infant = root.Alkyone.infant || {};

  var PI = Math.PI, TAU = PI * 2;

  /* ------------------------------------------------------------------ math */
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function sstep(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function sgn(x) { return x < 0 ? -1 : 1; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function lerp3(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
  function round(x, d) { var k = Math.pow(10, d); return Math.round(x * k) / k; }

  /* ----------------------------------------------------------------- color */
  function hex(h) {
    h = h.charAt(0) === '#' ? h.slice(1) : h;
    return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
  }
  function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function l2s(c) { c = clamp(c, 0, 1); return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function toHex(rgb) {
    function h(v) { var s = Math.round(clamp(v, 0, 1) * 255).toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
  }
  function lin(rgb) { return [s2l(rgb[0]), s2l(rgb[1]), s2l(rgb[2])]; }
  function rampAt(stops, t) {            // stops: [[t, [r,g,b]], ...] ascending
    t = clamp(t, 0, 1);
    for (var i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i], k = (t - a[0]) / (b[0] - a[0] || 1);
        return lerp3(a[1], b[1], k);
      }
    }
    return stops[stops.length - 1][1].slice();
  }

  /* ------------------------------------------------------- light rig (shared)
     One definition drives BOTH the three.js lights and the CPU shading used for
     the SVG fallbacks, so the fallback has the same light as the 3D scene.
     k = multiplier of albedo for a surface facing the light; the scene uses
     intensity = PI * k (physically-correct lights divide Lambert by PI).      */
  var RIG = {
    mist: {
      hemi: { sky: '#EEF6FA', ground: '#5A93A8', k: 0.50 },
      lights: [
        { id: 'key',  color: '#FFFFFF', dir: [-0.52, 0.62, 0.58], k: 1.08 },   // dawn window, front-left, high: whiter, stronger
        { id: 'fill', color: '#A9D0E0', dir: [0.88, 0.04, 0.38],  k: 0.14 },   // cool bounce from the right
        { id: 'rim',  color: '#FFFFFF', dir: [0.62, 0.30, -0.72], k: 0.30 }    // edge light from behind
      ],
      fres: { color: '#255F76', dark: 0.30, add: 0.0, pow: 2.6 },              // soft contour on a pale ground
      tint: '#FFFFFF',
      halo: 0.74, coreGain: 1.0, edge: 0
    },
    night: {
      hemi: { sky: '#2B6178', ground: '#235F7A', k: 0.84 },
      lights: [
        { id: 'key',  color: '#DDF2F8', dir: [-0.50, 0.66, 0.56], k: 1.02 },   // moonlight through the window
        { id: 'fill', color: '#3F8FA3', dir: [0.88, 0.00, 0.40],  k: 0.40 },
        { id: 'rim',  color: '#8EE3DA', dir: [0.62, 0.34, -0.70], k: 0.80 }
      ],
      fres: { color: '#74D8CF', dark: 0.0, add: 0.40, pow: 2.3 },              // luminous teal edge
      tint: '#EEF8FB',
      halo: 0.92, coreGain: 1.12, edge: 0.17                                   // faint facet hairlines on night only
    }
  };
  function prepRig() {
    Object.keys(RIG).forEach(function (k) {
      var r = RIG[k];
      r.hemi.skyL = lin(hex(r.hemi.sky)); r.hemi.groundL = lin(hex(r.hemi.ground));
      r.lights.forEach(function (l) { l.colorL = lin(hex(l.color)); l.nd = norm(l.dir); });
      r.fres.colorL = lin(hex(r.fres.color));
    });
  }
  prepRig();

  /* CPU shading: linear albedo * (hemisphere + sum k*max(0,n.l)) with a fresnel rim.
     n: unit normal, albedoSrgb: [r,g,b], v: unit vector to the viewer (optional).
     Returns LINEAR rgb (may exceed 1). */
  function shade(rigName, n, albedoSrgb, v) {
    var rig = RIG[rigName] || RIG.mist, al = lin(albedoSrgb);
    var hw = 0.5 * n[1] + 0.5, h = rig.hemi, i, c;
    var ir = [0, 0, 0];
    for (c = 0; c < 3; c++) ir[c] = mix(h.groundL[c], h.skyL[c], hw) * h.k;
    for (i = 0; i < rig.lights.length; i++) {
      var L = rig.lights[i], d = Math.max(0, dot(n, L.nd)) * L.k;
      for (c = 0; c < 3; c++) ir[c] += L.colorL[c] * d;
    }
    var out = [al[0] * ir[0], al[1] * ir[1], al[2] * ir[2]];
    if (v) {
      var f = Math.pow(1 - clamp(dot(n, v), 0, 1), rig.fres.pow);
      for (c = 0; c < 3; c++) out[c] = out[c] * (1 - rig.fres.dark * f) + rig.fres.colorL[c] * rig.fres.add * f;
    }
    return out;
  }

  /* ------------------------------------------------------------- the profile
     Hand-tuned infant profile, neck (top) -> hips (bottom), 14 rings.
       y   height              a  half-width (x)     b  half-depth (z)
       cz  forward shift of the ring centre (rounded belly, softly arched back)
       n   superellipse exponent (2 = ellipse, higher = boxier)
     Stubby on purpose: ~2.0 wide at the chest, ~2.5 from neck cut to hip cut, a short thick
     neck, small sloping shoulders and a round belly that is the widest, deepest part.      */
  var STATIONS = [
    { y:  1.14, a: 0.320, b: 0.295, cz: 0.000, n: 2.1 },    // 0  neck cut
    { y:  1.04, a: 0.330, b: 0.305, cz: 0.005, n: 2.1 },    // 1  neck
    { y:  0.95, a: 0.375, b: 0.335, cz: 0.003, n: 2.1 },    // 2  neck base
    { y:  0.88, a: 0.470, b: 0.385, cz: -0.004, n: 2.1 },   // 3  trapezius, falling away
    { y:  0.81, a: 0.600, b: 0.440, cz: -0.010, n: 2.12 },  // 4
    { y:  0.73, a: 0.715, b: 0.495, cz: -0.012, n: 2.15 },  // 5  small sloping shoulders
    { y:  0.62, a: 0.790, b: 0.550, cz: -0.008, n: 2.2 },   // 6  shoulder line
    { y:  0.44, a: 0.810, b: 0.620, cz: 0.012, n: 2.25 },   // 7  upper chest
    { y:  0.20, a: 0.820, b: 0.690, cz: 0.050, n: 2.25 },   // 8  chest
    { y: -0.06, a: 0.820, b: 0.750, cz: 0.095, n: 2.2 },    // 9  lower ribs
    { y: -0.32, a: 0.800, b: 0.790, cz: 0.135, n: 2.2 },    // 10 belly
    { y: -0.56, a: 0.765, b: 0.790, cz: 0.145, n: 2.25 },   // 11 belly, roundest
    { y: -0.78, a: 0.700, b: 0.740, cz: 0.120, n: 2.35 },   // 12 lower belly, tapering
    { y: -0.97, a: 0.625, b: 0.670, cz: 0.090, n: 2.5 },    // 13 hip line
    { y: -1.10, a: 0.580, b: 0.620, cz: 0.070, n: 2.6 }     // 14 hip cut
  ];
  var SEGMENTS = 14;           // around each ring (vertex near the front midline)
  var JITTER = 0.026;         // hand-sculpted vertex wobble (world units)
  var TWIST = 0.09;            // shoulders turned ~4 deg relative to the hips (radians)
  var LEAN = -0.055;           // the chest sits a touch to the infant's right of the hips

  // arm stub: starts ON the torso surface (root ring projected onto it), curves softly, ends rounded
  var ARM = {
    root: [0.48, 0.60, -0.02],     // inside the torso; the visible tube begins where it clears the surface
    d0: [0.80, -0.60, 0.00],       // leaves the shoulder mostly outward (a round shoulder cap) ...
    d1: [0.26, -0.90, 0.30],       // ... then turns downward and a little forward
    length: 1.38,
    r0: 0.262, rMid: 0.240, r1: 0.192,
    rings: 9, around: 10,
    // per-side variation (+1 = infant's left): [d0.x scale, d1.x, d1.z, length scale]
    side: { 1: [1.03, 0.28, 0.38, 1.03], '-1': [0.95, 0.19, 0.24, 0.97] }
  };

  // patch placement on the upper chest (infant's left of the sternum)
  var PATCH = {
    x: 0.20, y: 0.36,
    halfW: 0.22,           // 0.40 wide = ~21% of the ~1.8 torso width (hero patch +16% over the first spike)
    aspect: 0.84,          // height / width
    n: 3.1                 // squircle exponent of the outline
  };
  var LAYER_H = { floor: 0.0105, ghost: 0.0125, core: 0.034, lid: 0.0615, glow: 0.0635 };
  var ART_A = PATCH.aspect;

  /* -------------------------------------------------------------- mesh kit */
  function IMesh() { this.v = []; this.t = []; }
  IMesh.prototype.vert = function (p) { this.v.push(p); return this.v.length - 1; };
  IMesh.prototype.tri = function (a, b, c) { this.t.push([a, b, c]); };
  IMesh.prototype.faceNormal = function (t) {
    var a = this.v[t[0]], b = this.v[t[1]], c = this.v[t[2]];
    return cross(sub(b, a), sub(c, a));            // length = 2*area
  };
  IMesh.prototype.smoothNormals = function () {
    var ns = this.v.map(function () { return [0, 0, 0]; }), i, f, t;
    for (i = 0; i < this.t.length; i++) {
      t = this.t[i]; f = this.faceNormal(t);
      for (var k = 0; k < 3; k++) { ns[t[k]][0] += f[0]; ns[t[k]][1] += f[1]; ns[t[k]][2] += f[2]; }
    }
    return ns.map(norm);
  };
  // orient a triangle so its normal agrees with `hint` (any vec3), then add it
  IMesh.prototype.triOut = function (a, b, c, hint) {
    var n = cross(sub(this.v[b], this.v[a]), sub(this.v[c], this.v[a]));
    if (dot(n, hint) < 0) { var t = b; b = c; c = t; }
    this.t.push([a, b, c]);
  };

  function se(phi, a, b, n) {           // superellipse point, phi=0 -> +z (front)
    var s = Math.sin(phi), c = Math.cos(phi), e = 2 / n;
    return [a * sgn(s) * Math.pow(Math.abs(s), e), b * sgn(c) * Math.pow(Math.abs(c), e)];
  }
  function superPoly(cu, cv, a, b, n, count) {   // closed polyline (u,v), starts on +u
    var pts = [];
    for (var i = 0; i < count; i++) {
      var th = TAU * i / count, c = Math.cos(th), s = Math.sin(th), e = 2 / n;
      pts.push([cu + a * sgn(c) * Math.pow(Math.abs(c), e), cv + b * sgn(s) * Math.pow(Math.abs(s), e)]);
    }
    return pts;
  }

  /* --------------------------------------------------------------- torso */
  function makeTorso(rng) {
    var m = new IMesh(), rings = [], N = SEGMENTS, i, j;
    for (i = 0; i < STATIONS.length; i++) {
      var s = STATIONS[i], ring = [], edge = (i === 0 || i === STATIONS.length - 1);
      // low-frequency sculpt wobble per ring (shift + a hair of twist) + per-vertex jitter; cuts stay planar
      var sx = edge ? 0 : (rng() - 0.5) * 0.012, sz = edge ? 0 : (rng() - 0.5) * 0.012;
      var phase = (i & 1 ? 0.5 : 0) * (TAU / N) + (edge ? 0 : (rng() - 0.5) * 0.16 * (TAU / N));
      for (j = 0; j < N; j++) {
        var q = se(TAU * j / N + phase, s.a, s.b, s.n);
        var tw = TWIST * sstep(-1.0, 0.9, s.y), ct = Math.cos(tw), st = Math.sin(tw);
        var p = [q[0] * ct + q[1] * st + sx + LEAN * sstep(-1.0, 1.1, s.y), s.y, -q[0] * st + q[1] * ct + s.cz + sz];
        if (!edge) {
          p[0] += (rng() * 2 - 1) * JITTER; p[1] += (rng() * 2 - 1) * JITTER * 1.1; p[2] += (rng() * 2 - 1) * JITTER;
        }
        ring.push(m.vert(p));
      }
      rings.push(ring);
    }
    // Staggered lattice: odd rings are shifted half a segment, so the strip reads as a brick-laid triangle
    // mesh (no horizontal bands, no 'quilting'). Winding: CCW seen from outside.
    for (i = 0; i < rings.length - 1; i++) {
      var odd = (i & 1) === 1;
      for (j = 0; j < N; j++) {
        var jn = (j + 1) % N, jp = (j + N - 1) % N;
        if (!odd) {            // ring i at j, ring i+1 at j+0.5
          m.tri(rings[i][j], rings[i + 1][j], rings[i][jn]);
          m.tri(rings[i][j], rings[i + 1][jp], rings[i + 1][j]);
        } else {               // ring i at j+0.5, ring i+1 at j
          m.tri(rings[i][jp], rings[i + 1][j], rings[i][j]);
          m.tri(rings[i][j], rings[i + 1][j], rings[i + 1][jn]);
        }
      }
    }
    // flat caps (tidy cuts)
    var top = STATIONS[0], bot = STATIONS[STATIONS.length - 1];
    var ct = m.vert([LEAN * sstep(-1.0, 1.1, top.y), top.y, top.cz]), cb = m.vert([LEAN * sstep(-1.0, 1.1, bot.y), bot.y, bot.cz]);
    for (j = 0; j < N; j++) {
      m.triOut(ct, rings[0][j], rings[0][(j + 1) % N], [0, 1, 0]);
      m.triOut(cb, rings[rings.length - 1][j], rings[rings.length - 1][(j + 1) % N], [0, -1, 0]);
    }
    m.rings = rings; m.capTop = ct; m.capBottom = cb; m.nRings = rings.length;
    return m;
  }

  /* ---------------------------------------------------------------- arms */
  function armPath(side) {
    var v = ARM.side[side], len = ARM.length * v[3];
    var d0 = norm([ARM.d0[0] * side * v[0], ARM.d0[1], ARM.d0[2]]);
    var d1 = norm([v[1] * side, ARM.d1[1], v[2]]);
    var P0 = [ARM.root[0] * side, ARM.root[1], ARM.root[2]];
    var P1 = add(P0, mul(d0, len * 0.5));
    var P2 = add(P1, mul(d1, len * 0.5));
    return { P0: P0, P1: P1, P2: P2 };
  }
  function bez(p, t) {
    var u = 1 - t;
    return [u * u * p.P0[0] + 2 * u * t * p.P1[0] + t * t * p.P2[0],
            u * u * p.P0[1] + 2 * u * t * p.P1[1] + t * t * p.P2[1],
            u * u * p.P0[2] + 2 * u * t * p.P1[2] + t * t * p.P2[2]];
  }
  function bezT(p, t) {
    var u = 1 - t;
    return norm([2 * u * (p.P1[0] - p.P0[0]) + 2 * t * (p.P2[0] - p.P1[0]),
                 2 * u * (p.P1[1] - p.P0[1]) + 2 * t * (p.P2[1] - p.P1[1]),
                 2 * u * (p.P1[2] - p.P0[2]) + 2 * t * (p.P2[2] - p.P1[2])]);
  }
  function insideSoup(soup, p) {          // parity of ray hits against the closed torso mesh
    var d = [0.5773, 0.5207, 0.6313], hits = 0;
    for (var i = 0; i < soup.length; i++) if (rayTri(p, d, soup[i][0], soup[i][1], soup[i][2]) > 0) hits++;
    return (hits & 1) === 1;
  }
  function makeArm(side, rng, soup) {
    var m = new IMesh(), path = armPath(side), R = ARM.rings, M = ARM.around, i, j;
    function radiusAt(s) { return s < 0.5 ? mix(ARM.r0, ARM.rMid, sstep(0, 0.5, s)) : mix(ARM.rMid, ARM.r1, sstep(0.5, 1, s)); }
    function frameAt(t) {
      var tan = bezT(path, t), n1 = norm(cross(tan, [0, 0, 1]));
      return { tan: tan, n1: n1, n2: cross(tan, n1), c: bez(path, t) };
    }
    function ringPts(t, rad) {
      var fr = frameAt(t), pts = [];
      for (var k = 0; k < M; k++) {
        var th = TAU * k / M;
        pts.push(add(fr.c, add(mul(fr.n1, rad * Math.cos(th)), mul(fr.n2, rad * Math.sin(th) * 0.93))));
      }
      return pts;
    }
    // The tube starts as a thin needle buried inside the torso and swells to full size as it
    // crosses the surface, so the z-buffer draws the exact intersection (no sleeve fin, no seam).
    var k, rings = [], axis = [];
    function addRing(pts, jit) {
      var r = [];
      for (var q = 0; q < pts.length; q++) {
        var p = pts[q];
        if (jit) p = add(p, [(rng() * 2 - 1) * JITTER * 0.7, (rng() * 2 - 1) * JITTER * 0.7, (rng() * 2 - 1) * JITTER * 0.7]);
        r.push(m.vert(p));
      }
      return r;
    }
    for (i = 0; i <= R; i++) {
      var s = i / R, rad = radiusAt(s) * mix(0.40, 1, sstep(0, 0.30, s)), pts = ringPts(s, rad);
      rings.push(addRing(pts, i > 0));
      axis.push({ c: bez(path, s), r: rad });
    }
    // rounded termination (3 cap rings + tip), tangent at the end
    var tEnd = bezT(path, 1), cEnd = bez(path, 1), rEnd = ARM.r1, K = 3, capRings = [];
    for (i = 1; i <= K; i++) {
      var al = (PI / 2) * i / (K + 0.55), fr = frameAt(1);
      var cc = add(cEnd, mul(tEnd, rEnd * Math.sin(al) * 0.92)), rr = rEnd * Math.cos(al), cp = [];
      for (k = 0; k < M; k++) { var th = TAU * k / M; cp.push(add(cc, add(mul(fr.n1, rr * Math.cos(th)), mul(fr.n2, rr * Math.sin(th) * 0.93)))); }
      capRings.push(addRing(cp, true));
    }
    var tip = m.vert(add(cEnd, mul(tEnd, rEnd * 0.98)));
    var all = rings.concat(capRings);
    function hintFor(a, b, c) {                    // outward = away from the arm axis
      var cen = lerp3(lerp3(m.v[a], m.v[b], 0.5), m.v[c], 1 / 3);
      var bestD = 1e9, bi = 0;
      for (var q = 0; q < axis.length; q++) { var d = len(sub(cen, axis[q].c)); if (d < bestD) { bestD = d; bi = q; } }
      return sub(cen, axis[bi].c);
    }
    for (i = 0; i < all.length - 1; i++) {
      for (j = 0; j < M; j++) {
        var A = all[i][j], B = all[i][(j + 1) % M], C = all[i + 1][(j + 1) % M], D = all[i + 1][j];
        if (len(sub(m.v[A], m.v[C])) <= len(sub(m.v[B], m.v[D]))) { m.triOut(A, D, C, hintFor(A, D, C)); m.triOut(A, C, B, hintFor(A, C, B)); }
        else { m.triOut(A, D, B, hintFor(A, D, B)); m.triOut(B, D, C, hintFor(B, D, C)); }
      }
    }
    var last = all[all.length - 1];
    for (j = 0; j < M; j++) m.triOut(tip, last[j], last[(j + 1) % M], tEnd);
    m.axis = axis; m.path = path;
    return m;
  }

  /* ------------------------------------------------------- ray casting kit */
  function rayTri(o, d, a, b, c) {
    var e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-10) return -1;
    var inv = 1 / det, s = sub(o, a), u = dot(s, p) * inv;
    if (u < 0 || u > 1) return -1;
    var q = cross(s, e1), v = dot(d, q) * inv;
    if (v < 0 || u + v > 1) return -1;
    var t = dot(e2, q) * inv;
    return t > 1e-7 ? t : -1;
  }
  function raycast(soup, o, d) {         // soup: [[a,b,c],...] ; nearest hit or null
    var best = null;
    for (var i = 0; i < soup.length; i++) {
      var t = rayTri(o, d, soup[i][0], soup[i][1], soup[i][2]);
      if (t > 0 && (!best || t < best.t)) best = { t: t, i: i };
    }
    if (!best) return null;
    var tr = soup[best.i], n = norm(cross(sub(tr[1], tr[0]), sub(tr[2], tr[0])));
    if (dot(n, d) > 0) n = mul(n, -1);
    return { t: best.t, p: add(o, mul(d, best.t)), n: n };
  }
  function solveLinear(Am, b) {          // Gauss-Jordan, small dense systems
    var n = b.length, i, j, k, M = Am.map(function (r, i2) { return r.concat([b[i2]]); });
    for (i = 0; i < n; i++) {
      var piv = i;
      for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[piv][i])) piv = j;
      var tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
      var d = M[i][i] || 1e-12;
      for (k = i; k <= n; k++) M[i][k] /= d;
      for (j = 0; j < n; j++) if (j !== i) { var f = M[j][i]; for (k = i; k <= n; k++) M[j][k] -= f * M[i][k]; }
    }
    return M.map(function (r) { return r[n]; });
  }

  /* ------------------------------------------------------------ patch kit */
  function patchW(c, u, v) {             // fitted chest surface above the tangent plane (world units)
    return c[0] + c[1] * u + c[2] * v + c[3] * u * u + c[4] * u * v + c[5] * v * v;
  }
  // art units (1 = patch half-width; v up) + height above the lid datum -> world xyz
  function patchPoint(patch, ua, va, h) {
    var W2 = patch.halfWidth, u = ua * W2, v = va * W2;
    var w = patchW(patch.bend, u, v) + h;
    return [patch.center[0] + patch.right[0] * u + patch.up[0] * v + patch.normal[0] * w,
            patch.center[1] + patch.right[1] * u + patch.up[1] * v + patch.normal[1] * w,
            patch.center[2] + patch.right[2] * u + patch.up[2] * v + patch.normal[2] * w];
  }

  function placePatch(soup, opts) {
    var cx = opts.patchX, cy = opts.patchY, W2 = PATCH.halfW, H2 = W2 * ART_A, i, j;
    var hit = raycast(soup, [cx, cy, 4], [0, 0, -1]);
    var C = hit.p, nsum = [0, 0, 0];
    for (i = -1; i <= 1; i++) for (j = -1; j <= 1; j++) {
      var hh = raycast(soup, [cx + i * 0.11, cy + j * 0.14, 4], [0, 0, -1]);
      if (hh) nsum = add(nsum, hh.n);
    }
    var N = norm(nsum);
    var U = norm(sub([0, 1, 0], mul(N, N[1])));
    var R = norm(cross(U, N));
    // sample the true (faceted) surface on a grid under the footprint
    var rows = [], rhs = [], samples = [];
    for (i = -3; i <= 3; i++) for (j = -4; j <= 4; j++) {
      var u = (i / 3) * W2 * 1.06, v = (j / 4) * H2 * 1.06;
      var o = add(add(add(C, mul(R, u)), mul(U, v)), mul(N, 0.6));
      var h2 = raycast(soup, o, mul(N, -1));
      if (h2) samples.push([u, v, 0.6 - h2.t]);
    }
    var ATA = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
    var ATb = [0, 0, 0, 0, 0, 0], k;
    samples.forEach(function (s) {
      var f = [1, s[0], s[1], s[0] * s[0], s[0] * s[1], s[1] * s[1]];
      for (var a = 0; a < 6; a++) { ATb[a] += f[a] * s[2]; for (var b = 0; b < 6; b++) ATA[a][b] += f[a] * f[b]; }
    });
    for (k = 0; k < 6; k++) ATA[k][k] += 1e-9;
    var coef = solveLinear(ATA, ATb);
    var lift = 0;
    samples.forEach(function (s) { lift = Math.max(lift, s[2] - patchW(coef, s[0], s[1])); });
    coef[0] += lift + 0.004;                       // never sink into a facet
    return { center: C, normal: N, up: U, right: R, bend: coef, halfWidth: W2, halfHeight: H2, lift: lift };
  }

  /* ---------------------------------------------------- patch 2D artwork
     ONE description, painted by canvas (3D textures) AND emitted as SVG.
     Coordinates: u in [-1,1] across the patch, v in [-A,A] up the patch
     (1 = half the patch width). Ops: path / circle / rrect with paint objects.
     Gradient paint: {g:'radial', c:[u,v], r, stops:[[o,'#hex',a?]...]}
                     {g:'linear', p0:[u,v], p1:[u,v], stops:[...]}            */
  var AMB = { deep: '#C4650F', mid: '#F0A04A', light: '#FFD7A4', hot: '#FFF2DE', glow: '#F6A95F' };
  var INK = '#12384A', INK2 = '#215669', MINT = '#A5D8DC';

  function fillet(pts, r, seg) {         // round the corners of a polyline
    seg = seg || 6;
    var out = [pts[0]];
    for (var i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      var ab = [a[0] - b[0], a[1] - b[1]], cb = [c[0] - b[0], c[1] - b[1]];
      var la = Math.hypot(ab[0], ab[1]), lc = Math.hypot(cb[0], cb[1]);
      var ua = [ab[0] / la, ab[1] / la], uc = [cb[0] / lc, cb[1] / lc];
      var th = Math.acos(clamp(ua[0] * uc[0] + ua[1] * uc[1], -1, 1));
      if (th < 1e-3 || Math.abs(th - PI) < 1e-3) { out.push(b); continue; }
      var t = Math.tan(th / 2), d = Math.min(r / t, la / 2, lc / 2), rad = d * t;
      var p0 = [b[0] + ua[0] * d, b[1] + ua[1] * d];
      var bis = [ua[0] + uc[0], ua[1] + uc[1]], lb = Math.hypot(bis[0], bis[1]);
      var dc = rad / Math.sin(th / 2), cen = [b[0] + bis[0] / lb * dc, b[1] + bis[1] / lb * dc];
      var p1 = [b[0] + uc[0] * d, b[1] + uc[1] * d];
      var a0 = Math.atan2(p0[1] - cen[1], p0[0] - cen[0]), a1 = Math.atan2(p1[1] - cen[1], p1[0] - cen[0]);
      var da = a1 - a0; while (da > PI) da -= TAU; while (da < -PI) da += TAU;
      for (var k = 0; k <= seg; k++) { var an = a0 + da * k / seg; out.push([cen[0] + rad * Math.cos(an), cen[1] + rad * Math.sin(an)]); }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function serpentine(p0, p1, amp, cycles, count) {   // sine meander between two points
    var d = [p1[0] - p0[0], p1[1] - p0[1]], L = Math.hypot(d[0], d[1]), ux = d[0] / L, uy = d[1] / L;
    var pts = [];
    for (var i = 0; i <= count; i++) {
      var s = i / count, env = Math.min(1, s / 0.16, (1 - s) / 0.16);
      env = env * env * (3 - 2 * env);
      var off = amp * env * Math.sin(TAU * cycles * s);
      pts.push([p0[0] + d[0] * s - uy * off, p0[1] + d[1] * s + ux * off]);
    }
    return pts;
  }
  function rrectPts(c, w, h, r, seg) {         // closed rounded-rect polyline, CCW from the right edge
    var hw = w / 2 - r, hh = h / 2 - r, pts = [], k, corners = [[hw, hh, 0], [-hw, hh, PI / 2], [-hw, -hh, PI], [hw, -hh, PI * 1.5]];
    corners.forEach(function (q) { for (k = 0; k <= seg; k++) { var a = q[2] + (PI / 2) * k / seg; pts.push([c[0] + q[0] + r * Math.cos(a), c[1] + q[1] + r * Math.sin(a)]); } });
    return pts;
  }
  function arcPts(c, r, a0, a1, count) {
    var pts = [];
    for (var i = 0; i <= count; i++) { var a = mix(a0, a1, i / count); pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
    return pts;
  }

  // component layout, art units (shared by the artwork, the anchors and the SVG hotspots)
  // The optical module is a flat disc OFF-centre (upper left) with two emitters stacked on one side and a
  // larger photodiode on the other: it reads as a sensor, never as a face.
  var LAYOUT = {
    optical: { c: [-0.50, 0.04], R: 0.33, win: 0.265, radii: [0.37, 0.37] },
    mic:     { c: [0.02, 0.43], R: 0.12, radii: [0.18, 0.18] },
    imu:     { c: [0.52, 0.04], w: 0.58, h: 0.54, radii: [0.34, 0.31] },
    temp:    { c: [0.02, -0.33], R: 0.12, radii: [0.18, 0.18] },
    wear:    { c: [0.00, -0.60], radii: [0.80, 0.18] },
    pads:    [{ c: [-0.42, -0.60], w: 0.50, h: 0.17 }, { c: [0.42, -0.60], w: 0.50, h: 0.17 }, { c: [0.0, -0.62], w: 0.16, h: 0.11 }]
  };

  function buildArt() {
    var ghost = [], core = [], lid = [], i;
    var L = LAYOUT, O = L.optical, MI = L.mic, IM = L.imu, TE = L.temp;
    var amberGrad = function (c, r) { return { g: 'radial', c: c, r: r, stops: [[0, '#FFE5C2'], [0.55, '#F7B568'], [1, '#EE9235']] }; };

    /* --- ghost layer: contact pads for wear detection, seen faintly through the body */
    L.pads.forEach(function (p) {
      ghost.push({ t: 'rrect', c: p.c, w: p.w, h: p.h, r: 0.07, fill: '#CFEBEE', alpha: 0.5, stroke: '#6FBEC8', sw: 0.024, dash: [0.06, 0.04] });
      ghost.push({ t: 'path', pts: [[p.c[0] - 0.05, p.c[1]], [p.c[0] + 0.05, p.c[1]]], stroke: '#6FBEC8', sw: 0.02, cap: 'round', alpha: 0.9 });
      if (p.w > 0.3) ghost.push({ t: 'path', pts: [[p.c[0], p.c[1] - 0.05], [p.c[0], p.c[1] + 0.05]], stroke: '#6FBEC8', sw: 0.02, cap: 'round', alpha: 0.9 });
    });

    /* --- core layer: amber flex circuit. Islands joined by long, confident serpentine traces */
    function trace(pts, w) {
      core.push({ t: 'path', pts: pts, stroke: AMB.deep, sw: w + 0.045, cap: 'round', join: 'round' });
      core.push({ t: 'path', pts: pts, stroke: AMB.mid, sw: w, cap: 'round', join: 'round' });
      core.push({ t: 'path', pts: pts, stroke: AMB.light, sw: w * 0.34, cap: 'round', join: 'round', alpha: 0.95 });
    }
    var TW = 0.056, MY = O.c[1];
    var main = serpentine([O.c[0] + O.R - 0.03, MY], [IM.c[0] - IM.w / 2 + 0.03, MY], 0.085, 3.5, 90);
    trace(main, TW);
    trace([[MI.c[0], MI.c[1] - MI.R + 0.02], [MI.c[0], MY + 0.085]], TW * 0.8);
    trace([[TE.c[0], TE.c[1] + TE.R - 0.02], [TE.c[0], MY - 0.085]], TW * 0.8);
    // contact traces run straight down to the pads (no dangling ends)
    trace([[IM.c[0] + 0.15, IM.c[1] - IM.h / 2 + 0.02], [IM.c[0] + 0.15, L.pads[1].c[1] + 0.085 - 0.02]], TW * 0.7);
    trace([[O.c[0] - 0.08, O.c[1] - O.R + 0.02], [O.c[0] - 0.08, L.pads[0].c[1] + 0.085 - 0.02]], TW * 0.7);

    // islands
    core.push({ t: 'circle', c: O.c, r: O.R, fill: amberGrad(O.c, O.R), stroke: AMB.deep, sw: 0.035 });
    core.push({ t: 'circle', c: MI.c, r: MI.R, fill: amberGrad(MI.c, MI.R), stroke: AMB.deep, sw: 0.03 });
    core.push({ t: 'rrect', c: IM.c, w: IM.w, h: IM.h, r: 0.1, fill: amberGrad(IM.c, 0.45), stroke: AMB.deep, sw: 0.034 });
    core.push({ t: 'circle', c: TE.c, r: TE.R, fill: amberGrad(TE.c, TE.R), stroke: AMB.deep, sw: 0.03 });
    // a few vias on the IMU pad (reads as a real board)
    [[IM.c[0] - 0.25, IM.c[1] + 0.21], [IM.c[0] + 0.25, IM.c[1] + 0.21], [IM.c[0] - 0.25, IM.c[1] - 0.21], [IM.c[0] + 0.25, IM.c[1] - 0.21]].forEach(function (c) {
      core.push({ t: 'circle', c: c, r: 0.02, fill: AMB.hot, stroke: AMB.deep, sw: 0.01 });
    });

    // optical window: a flat pale disc. Two small square emitters and the photodiode form a vertical column (a sensor, not a face).
    core.push({ t: 'circle', c: O.c, r: O.win, fill: { g: 'radial', c: O.c, r: O.win, stops: [[0, '#FFF7EA'], [0.75, '#FFE6C6'], [1, '#FBCB8F']] }, stroke: '#D9822B', sw: 0.022 });
    core.push({ t: 'circle', c: O.c, r: O.win - 0.04, stroke: '#FFF4E4', sw: 0.012, alpha: 0.9 });
    [-1, 1].forEach(function (sg) {
      var e = [O.c[0] + 0.0, O.c[1] + sg * 0.17];
      core.push({ t: 'circle', c: e, r: 0.09, fill: { g: 'radial', c: e, r: 0.09, stops: [[0, '#FFFFFF', 0.95], [0.5, '#FFE7C4', 0.55], [1, '#FFC98A', 0]] } });
      core.push({ t: 'rrect', c: e, w: 0.07, h: 0.07, r: 0.016, fill: '#FFFAF1', stroke: '#E0902F', sw: 0.014 });
    });
    core.push({ t: 'rrect', c: O.c, w: 0.17, h: 0.14, r: 0.03, fill: { g: 'linear', p0: [O.c[0] - 0.085, O.c[1] + 0.07], p1: [O.c[0] + 0.085, O.c[1] - 0.07], stops: [[0, INK2], [1, INK]] }, stroke: '#0B2634', sw: 0.012 });
    core.push({ t: 'rrect', c: [O.c[0] - 0.03, O.c[1] + 0.03], w: 0.07, h: 0.03, r: 0.012, fill: '#9FD3D9', alpha: 0.5 });

    // IMU chip with leg pins on the warm pad
    var cs = 0.3, hc = cs / 2;
    core.push({ t: 'rrect', c: IM.c, w: cs, h: cs, r: 0.04, fill: { g: 'linear', p0: [IM.c[0] - hc, IM.c[1] + hc], p1: [IM.c[0] + hc, IM.c[1] - hc], stops: [[0, INK2], [1, INK]] }, stroke: '#0B2634', sw: 0.012 });
    for (i = -1; i <= 1; i++) {
      var o = i * 0.085;
      [-1, 1].forEach(function (sd) { core.push({ t: 'rrect', c: [IM.c[0] + sd * (hc + 0.032), IM.c[1] + o], w: 0.075, h: 0.04, r: 0.012, fill: AMB.light, stroke: AMB.deep, sw: 0.009 }); });
      [-1, 1].forEach(function (sd) { core.push({ t: 'rrect', c: [IM.c[0] + o, IM.c[1] + sd * (hc + 0.032)], w: 0.04, h: 0.075, r: 0.012, fill: AMB.light, stroke: AMB.deep, sw: 0.009 }); });
    }
    core.push({ t: 'circle', c: [IM.c[0] - 0.09, IM.c[1] + 0.09], r: 0.02, fill: MINT, alpha: 0.9 });
    core.push({ t: 'path', pts: [[IM.c[0] - 0.03, IM.c[1] - 0.035], [IM.c[0] + 0.08, IM.c[1] - 0.035]], stroke: MINT, sw: 0.013, cap: 'round', alpha: 0.5 });
    core.push({ t: 'path', pts: [[IM.c[0] - 0.03, IM.c[1] - 0.075], [IM.c[0] + 0.05, IM.c[1] - 0.075]], stroke: MINT, sw: 0.01, cap: 'round', alpha: 0.35 });

    // temperature bead
    core.push({ t: 'circle', c: TE.c, r: 0.082, fill: { g: 'radial', c: [TE.c[0] - 0.03, TE.c[1] + 0.035], r: 0.12, stops: [[0, '#FFF6E8'], [0.45, '#F8BC76'], [1, '#D8801F']] }, stroke: '#B55A0B', sw: 0.014 });
    core.push({ t: 'circle', c: [TE.c[0] - 0.034, TE.c[1] + 0.038], r: 0.027, fill: '#FFFFFF', alpha: 0.85 });

    // microphone port: a perforated acoustic disc (centre hole + two rings of holes)
    core.push({ t: 'circle', c: MI.c, r: 0.092, fill: INK2, stroke: '#0B2634', sw: 0.012 });
    core.push({ t: 'circle', c: MI.c, r: 0.011, fill: '#08202C' });
    for (i = 0; i < 6; i++) { var an = TAU * i / 6; core.push({ t: 'circle', c: [MI.c[0] + 0.035 * Math.cos(an), MI.c[1] + 0.035 * Math.sin(an)], r: 0.0105, fill: '#08202C' }); }
    for (i = 0; i < 12; i++) { var an2 = TAU * (i + 0.5) / 12; core.push({ t: 'circle', c: [MI.c[0] + 0.068 * Math.cos(an2), MI.c[1] + 0.068 * Math.sin(an2)], r: 0.0088, fill: '#08202C' }); }
    core.push({ t: 'circle', c: MI.c, r: 0.092, stroke: MINT, sw: 0.009, alpha: 0.6 });

    /* --- lid layer: frosted translucent cover, thicker (more opaque) toward the edge,
           clear over the optical window, with a bevel line, a long glass sheen and a specular spot */
    var edge = superPoly(0, 0, 0.905, 0.905 * ART_A, PATCH.n, 72);
    var win = arcPts(O.c, O.win + 0.035, 0, TAU, 40); win.pop();
    lid.push({ t: 'path', pts: edge, holes: [win],
      fill: { g: 'radial', c: [0, 0.05], r: 1.55, stops: [[0, '#F4FAFC', 0.18], [0.55, '#EAF4F8', 0.28], [1, '#E2EFF4', 0.66]] } });
    lid.push({ t: 'path', pts: win, closed: true, stroke: '#FFFFFF', sw: 0.026, alpha: 0.85 });
    lid.push({ t: 'path', pts: arcPts(O.c, O.win + 0.035, 0.7, 1.45, 14), stroke: '#FFFFFF', sw: 0.045, cap: 'round', alpha: 0.5 });
    lid.push({ t: 'path', pts: superPoly(0, 0, 0.865, 0.865 * ART_A, PATCH.n, 72), closed: true, stroke: '#FFFFFF', sw: 0.022, alpha: 0.7 });
    // crescent sheen along the upper-left edge
    var outerArc = superPoly(0, 0, 0.84, 0.84 * ART_A, PATCH.n, 120).filter(function (p, k) { return k >= 34 && k <= 62; });
    var innerArc = superPoly(0, 0, 0.64, 0.64 * ART_A, PATCH.n, 120).filter(function (p, k) { return k >= 37 && k <= 59; }).reverse();
    lid.push({ t: 'path', pts: outerArc.concat(innerArc), closed: true,
      fill: { g: 'linear', p0: [-0.55, 0.8], p1: [-0.1, 0.3], stops: [[0, '#FFFFFF', 0.66], [1, '#FFFFFF', 0]] } });
    // soft diagonal glass streak across the lower right
    lid.push({ t: 'path', closed: true, pts: [[0.30, -0.36], [0.70, -0.05], [0.78, -0.10], [0.40, -0.42]],
      fill: { g: 'linear', p0: [0.3, -0.36], p1: [0.74, -0.07], stops: [[0, '#FFFFFF', 0], [0.5, '#FFFFFF', 0.22], [1, '#FFFFFF', 0]] } });
    // tiny specular dot on the bevel
    lid.push({ t: 'circle', c: [-0.70, 0.58], r: 0.03, fill: '#FFFFFF', alpha: 0.9 });
    // a tiny four-point star, the Alkyone mark, embossed quietly near the lower right of the lid
    var sc = [0.76, -0.42], sr = 0.07;
    lid.push({ t: 'path', closed: true, pts: [[sc[0], sc[1] + sr], [sc[0] + sr * 0.2, sc[1] + sr * 0.2], [sc[0] + sr, sc[1]], [sc[0] + sr * 0.2, sc[1] - sr * 0.2], [sc[0], sc[1] - sr], [sc[0] - sr * 0.2, sc[1] - sr * 0.2], [sc[0] - sr, sc[1]], [sc[0] - sr * 0.2, sc[1] + sr * 0.2]], fill: '#FFFFFF', alpha: 0.55 });

    return { A: ART_A, n: PATCH.n, outline: superPoly(0, 0, 1, ART_A, PATCH.n, 72), layout: LAYOUT, colors: AMB, ink: INK, ops: { ghost: ghost, core: core, lid: lid } };
  }

  /* ---------------------------------------------------------- grid builders */
  function layerGrid(patch, h, nu, nv) {      // flat grid following the chest curve; returns positions+uvs (non-indexed)
    var A = ART_A, pos = [], uv = [], i, j;
    function vtx(iu, iv) {
      var ua = -1 + 2 * iu / nu, va = -A + 2 * A * iv / nv;
      return { p: patchPoint(patch, ua, va, h), uv: [iu / nu, iv / nv] };
    }
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i + 1, j + 1), d = vtx(i, j + 1);
      [a, b, c, a, c, d].forEach(function (q) { pos.push(q.p[0], q.p[1], q.p[2]); uv.push(q.uv[0], q.uv[1]); });
    }
    return { positions: new Float32Array(pos), uvs: new Float32Array(uv) };
  }

  var TRAY_COLORS = {
    skirt: '#74A5B6', base: '#C2D9E3', wall: '#E4F1F6', shoulder: '#F3F9FC', top: '#FAFDFE', inner: '#C4DBE5', floor: '#E8F2F6'
  };
  // [scale of the outline, height above the fitted surface (null = sits on the true surface), color key]
  var TRAY_DEFS = [
    [1.000, null, 'skirt'], [1.000, 0.010, 'base'], [1.014, 0.031, 'wall'], [0.992, 0.049, 'shoulder'],
    [0.940, 0.0585, 'top'], [0.906, 0.0602, 'top'], [0.886, 0.040, 'inner'], [0.880, LAYER_H.floor, 'inner']
  ];
  var TRAY_SEGMENTS = 36;
  // outline ring of the tray in world space (fitted surface; used by the SVG fallback)
  function trayRing(patch, scale, h, count) {
    var out = [], W2 = patch.halfWidth, H2 = patch.halfHeight, n = PATCH.n;
    for (var j = 0; j < count; j++) {
      var th = TAU * j / count, c = Math.cos(th), s = Math.sin(th), e = 2 / n;
      var u = scale * W2 * sgn(c) * Math.pow(Math.abs(c), e), v = scale * H2 * sgn(s) * Math.pow(Math.abs(s), e);
      out.push(patchPoint(patch, u / W2, v / W2, h === null ? -0.012 : h));
    }
    return out;
  }

  function makeTray(soup, patch) {
    var m = new IMesh(), M = TRAY_SEGMENTS, W2 = patch.halfWidth, H2 = patch.halfHeight, n = PATCH.n, i, j;
    var cols = TRAY_COLORS, defs = TRAY_DEFS;
    var rings = [], colors = [];
    defs.forEach(function (d, ri) {
      var ring = [];
      for (j = 0; j < M; j++) {
        var th = TAU * j / M, c = Math.cos(th), s = Math.sin(th), e = 2 / n;
        var u = d[0] * W2 * sgn(c) * Math.pow(Math.abs(c), e), v = d[0] * H2 * sgn(s) * Math.pow(Math.abs(s), e);
        var p;
        if (d[1] === null) {                        // skirt: sit exactly on the true (faceted) surface
          var o = add(add(add(patch.center, mul(patch.right, u)), mul(patch.up, v)), mul(patch.normal, 0.6));
          var h = raycast(soup, o, mul(patch.normal, -1));
          p = h ? add(h.p, mul(patch.normal, -0.007)) : add(add(add(patch.center, mul(patch.right, u)), mul(patch.up, v)), mul(patch.normal, patchW(patch.bend, u, v) - 0.01));
        } else {
          p = add(add(add(patch.center, mul(patch.right, u)), mul(patch.up, v)), mul(patch.normal, patchW(patch.bend, u, v) + d[1]));
        }
        ring.push(m.vert(p)); colors.push(hex(cols[d[2]]));
      }
      rings.push(ring);
    });
    // Band orientation hints: [radial weight, normal weight]. Outer wall faces out, the bevel faces up-out,
    // the inner wall of the tray faces inward (toward the cavity), the floor faces up.
    var bandHint = [[1, 0], [1, 0.1], [1, 0.5], [0.7, 1], [0, 1], [-1, 0.3], [-1, 0.5]];
    function radial(p) {
      var d = sub(p, patch.center); d = sub(d, mul(patch.normal, dot(d, patch.normal)));
      return norm(d);
    }
    for (i = 0; i < rings.length - 1; i++) for (j = 0; j < M; j++) {
      var A = rings[i][j], B = rings[i][(j + 1) % M], C = rings[i + 1][(j + 1) % M], D = rings[i + 1][j];
      var bh = bandHint[i];
      var cen = lerp3(lerp3(m.v[A], m.v[C], 0.5), lerp3(m.v[B], m.v[D], 0.5), 0.5);
      var hint = add(mul(radial(cen), bh[0]), mul(patch.normal, bh[1]));
      m.triOut(A, B, C, hint); m.triOut(A, C, D, hint);
    }
    var fc = m.vert(add(patch.center, mul(patch.normal, patchW(patch.bend, 0, 0) + LAYER_H.floor))); colors.push(hex(cols.floor));
    var last = rings[rings.length - 1];
    for (j = 0; j < M; j++) m.triOut(fc, last[j], last[(j + 1) % M], patch.normal);
    return { mesh: m, colors: colors, rings: rings };
  }

  /* ------------------------------------------------------------------ build */
  function build(opts) {
    opts = opts || {};
    var seed = opts.seed != null ? opts.seed : 20240611;
    var rng = mulberry32(seed);
    var o = {
      patchX: opts.patchX != null ? opts.patchX : PATCH.x,
      patchY: opts.patchY != null ? opts.patchY : PATCH.y
    };
    var torso = makeTorso(rng);
    var soup = torso.t.map(function (t) { return [torso.v[t[0]], torso.v[t[1]], torso.v[t[2]]]; });
    var armPlus = makeArm(+1, rng, soup), armMinus = makeArm(-1, rng, soup);
    // +x is the infant's left; name arms by the infant's side
    var parts = [], i;

    // ---- orientation sanity for the torso lateral surface (outward normals) is verified in tests
    // ---- colors: tonal ramp by height + facing + a little baked occlusion + per-facet tint
    var yMin = STATIONS[STATIONS.length - 1].y, yMax = STATIONS[0].y;
    var BODY = [                                   // porcelain blue-grey -> saturated teal shadow (no skin tones)
      [0.00, hex('#F3F8FA')], [0.16, hex('#DCE8EE')], [0.36, hex('#B2CAD8')],
      [0.56, hex('#7FA6BB')], [0.76, hex('#4D7E96')], [1.00, hex('#285068')]
    ];

    var armAxes = armPlus.axis.slice(3).concat(armMinus.axis.slice(3));   // skip the buried root: it would darken the chest
    function occlusion(p, nrm) {
      var occ = 0;
      for (var q = 0; q < armAxes.length; q++) {
        var d = len(sub(p, armAxes[q].c)), r = armAxes[q].r;
        var w = sstep(r * 2.0, r * 0.95, d);
        if (w > 0) occ = Math.max(occ, 0.34 * w * (p[1] < armAxes[q].c[1] ? 1 : 0.35));
      }
      var neckCrease = sstep(0.30, 0.0, Math.abs(p[1] - 1.0)) * 0.20 * (Math.abs(p[0]) > 0.4 ? 1 : 0.4);
      var hipCrease = sstep(0.16, 0.0, Math.abs(p[1] + 0.90)) * 0.16;
      return clamp(Math.max(occ, neckCrease, hipCrease), 0, 0.6);
    }
    function toneFor(p, nrm, part) {
      var h01 = clamp((p[1] - yMin) / (yMax - yMin), 0, 1);
      var up = 0.5 + 0.5 * nrm[1];
      var t = 0.06 + 0.34 * (1 - h01) + 0.26 * (1 - up) + occlusion(p, nrm) * 0.9 - 0.04 * Math.max(0, nrm[2]);
      if (part === 'arm') t -= 0.02;
      return t;
    }
    function emitColored(mesh, part, caps) {
      var ns = mesh.smoothNormals(), pos = new Float32Array(mesh.t.length * 9), col = new Float32Array(mesh.t.length * 9);
      for (var f = 0; f < mesh.t.length; f++) {
        var tri = mesh.t[f], fd = (rng() - 0.5) * 0.11, k;
        // one tint per FACET (centroid + averaged normal): deliberate low-poly, no soft gradients inside a facet
        var cen = [0, 0, 0], nn = [0, 0, 0], isCap = false;
        for (k = 0; k < 3; k++) {
          var q = mesh.v[tri[k]]; cen = add(cen, q); nn = add(nn, ns[tri[k]]);
          if (caps && (tri[k] === mesh.capTop || tri[k] === mesh.capBottom)) isCap = true;
        }
        cen = mul(cen, 1 / 3); nn = norm(nn);
        var tone = isCap ? 0.04 : toneFor(cen, nn, part) + fd, c = rampAt(BODY, tone);
        for (k = 0; k < 3; k++) {
          var p = mesh.v[tri[k]];
          pos[f * 9 + k * 3] = p[0]; pos[f * 9 + k * 3 + 1] = p[1]; pos[f * 9 + k * 3 + 2] = p[2];
          col[f * 9 + k * 3] = c[0]; col[f * 9 + k * 3 + 1] = c[1]; col[f * 9 + k * 3 + 2] = c[2];
        }
      }
      return { positions: pos, colors: col };
    }
    var tp = emitColored(torso, 'torso', true);
    parts.push({ id: 'torso', positions: tp.positions, colors: tp.colors });
    var ap = emitColored(armPlus, 'arm', false);
    parts.push({ id: 'arm-l', positions: ap.positions, colors: ap.colors });      // +x = infant's left
    var ap2 = emitColored(armMinus, 'arm', false);
    parts.push({ id: 'arm-r', positions: ap2.positions, colors: ap2.colors });

    // cap colors: after the loop above vertex colors of cap triangles use 0.97 on the centre only;
    // darken the whole cut ring a touch so the cut reads as an intentional, shadowed section.
    function shadeCut(part, ys) {
      var pos = part.positions, col = part.colors;
      for (var v = 0; v < pos.length; v += 3) {
        for (var yi = 0; yi < ys.length; yi++) {
          if (Math.abs(pos[v + 1] - ys[yi]) < 1e-6) {
            var c = rampAt(BODY, 0.30);
            col[v] = c[0]; col[v + 1] = c[1]; col[v + 2] = c[2];
          }
        }
      }
    }
    shadeCut(parts[0], [STATIONS[0].y, STATIONS[STATIONS.length - 1].y]);

    // ---- patch ------------------------------------------------------------
    var pp = placePatch(soup, o);
    var art = buildArt();
    var patch = {
      center: pp.center, normal: pp.normal, up: pp.up, right: pp.right,
      width: round(pp.halfWidth * 2, 4), height: round(pp.halfHeight * 2, 4), depth: LAYER_H.lid,
      halfWidth: pp.halfWidth, halfHeight: pp.halfHeight, aspect: ART_A,
      bend: pp.bend, layers: LAYER_H, art: art, components: {}
    };
    // anchors (on top of the lid)
    var topH = LAYER_H.lid + 0.004;
    ['optical', 'temp', 'imu', 'mic', 'wear'].forEach(function (id) {
      var L = LAYOUT[id], pos = patchPoint(patch, L.c[0], L.c[1], topH);
      patch.components[id] = {
        pos: pos, normal: pp.normal.slice(), radius: round(Math.max(L.radii[0], L.radii[1]) * pp.halfWidth, 4),
        radii: [round(L.radii[0] * pp.halfWidth, 4), round(L.radii[1] * pp.halfWidth, 4)], uv: L.c.slice()
      };
    });

    // tray (smooth, pale)
    var tray = makeTray(soup, pp);
    var tnorm = tray.mesh.smoothNormals();
    var tpos = new Float32Array(tray.mesh.t.length * 9), tcol = new Float32Array(tray.mesh.t.length * 9), tnm = new Float32Array(tray.mesh.t.length * 9);
    tray.mesh.t.forEach(function (tri, f) {
      for (var k = 0; k < 3; k++) {
        var vi = tri[k], p = tray.mesh.v[vi], c = tray.colors[vi], n = tnorm[vi];
        for (var a = 0; a < 3; a++) { tpos[f * 9 + k * 3 + a] = p[a]; tcol[f * 9 + k * 3 + a] = c[a]; tnm[f * 9 + k * 3 + a] = n[a]; }
      }
    });
    parts.push({ id: 'patch-body', positions: tpos, colors: tcol, normals: tnm, smooth: true });

    // textured layers (white vertex colors; the scene supplies the textures)
    [['patch-ghost', LAYER_H.ghost], ['patch-core', LAYER_H.core], ['patch-lid', LAYER_H.lid], ['patch-glow', LAYER_H.glow]].forEach(function (L) {
      var g = layerGrid(patch, L[1], 6, 8), cols = new Float32Array(g.positions.length).fill(1);
      parts.push({ id: L[0], positions: g.positions, colors: cols, uvs: g.uvs, layer: true });
    });

    // glow decal hugging the real (faceted) chest around the patch
    (function () {
      var D = 0.46, G = 10, pos = [], uv = [], grid = [], gi, gj;
      for (gj = 0; gj <= G; gj++) { grid[gj] = []; for (gi = 0; gi <= G; gi++) {
        var u = (-1 + 2 * gi / G) * D, v = (-1 + 2 * gj / G) * D * 1.0;
        var oo = add(add(add(patch.center, mul(patch.right, u)), mul(patch.up, v)), mul(patch.normal, 0.7));
        var h = raycast(soup, oo, mul(patch.normal, -1));
        var p = h ? add(h.p, mul(h.n, 0.0075)) : add(add(patch.center, mul(patch.right, u)), mul(patch.up, v));
        grid[gj][gi] = { p: p, uv: [gi / G, gj / G] };
      } }
      for (gj = 0; gj < G; gj++) for (gi = 0; gi < G; gi++) {
        var a = grid[gj][gi], b = grid[gj][gi + 1], c = grid[gj + 1][gi + 1], d = grid[gj + 1][gi];
        [a, b, c, a, c, d].forEach(function (q) { pos.push(q.p[0], q.p[1], q.p[2]); uv.push(q.uv[0], q.uv[1]); });
      }
      parts.push({ id: 'patch-decal', positions: new Float32Array(pos), colors: new Float32Array(pos.length).fill(1), uvs: new Float32Array(uv), layer: true, decalSize: D * 2 });
    })();

    // ---- bounds + stats ---------------------------------------------------
    var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], tris = 0;
    parts.forEach(function (pt) {
      tris += pt.positions.length / 9;
      if (pt.id === 'patch-decal') return;
      for (var q = 0; q < pt.positions.length; q += 3) for (var a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pt.positions[q + a]); mx[a] = Math.max(mx[a], pt.positions[q + a]); }
    });
    return { parts: parts, patch: patch, bounds: { min: mn, max: mx }, stats: { triangles: tris, parts: parts.length, seed: seed } };
  }

  /* --------------------------------------------------------- camera frames
     Plain-array frames {position, target, fov} (vertical fov in degrees) for a
     given viewport aspect. The hero keeps ONE camera position and varies only
     the fov with the aspect ratio, so the 3D canvas and the SVG fallback (which
     scales with preserveAspectRatio "meet") frame the figure identically.     */
  function viewBasis(pos, target, up) {
    var f = norm(sub(target, pos)), r = norm(cross(f, up || [0, 1, 0]));
    return { f: f, r: r, u: cross(r, f) };
  }
  function orbitDir(azDeg, elDeg) {
    var az = azDeg * PI / 180, el = elDeg * PI / 180;
    return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  }
  // centre the projected extents of `pts` and return the fov (deg) that fits them
  function fitFrame(pts, dir, dist, target0, aspect, margin) {
    var pos = add(target0, mul(dir, dist)), b = viewBasis(pos, target0), i;
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (i = 0; i < pts.length; i++) {
      var v = sub(pts[i], pos), d = dot(v, b.f);
      var x = dot(v, b.r) / d, y = dot(v, b.u) / d;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    var shift = add(mul(b.r, (x0 + x1) / 2 * dist), mul(b.u, (y0 + y1) / 2 * dist));   // pure translation keeps the direction
    var half = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / aspect) / (1 - margin);
    return { position: add(pos, shift), target: add(target0, shift), fov: 2 * Math.atan(half) * 180 / PI };
  }
  function bodyPoints(built) {
    var pts = [];
    built.parts.forEach(function (pt) {
      if (/^(torso|arm)/.test(pt.id)) for (var i = 0; i < pt.positions.length; i += 3) pts.push([pt.positions[i], pt.positions[i + 1], pt.positions[i + 2]]);
    });
    return pts;
  }
  function projectY(fr, p) {                       // NDC y (up = +1) of a world point in a frame
    var b = viewBasis(fr.position, fr.target), v = sub(p, fr.position), d = dot(v, b.f);
    return dot(v, b.u) / d / Math.tan(fr.fov * PI / 360);
  }
  /* Where the planar neck and hip cuts sit on screen for a frame: {top, bottom} as fractions (0..1)
     of the viewport height. The page fades the cuts with a CSS mask between these lines.       */
  function cutLines(built, fr) {
    var yTop = STATIONS[0].y, yBot = STATIONS[STATIONS.length - 1].y, top = 1e9, bottom = -1e9;
    built.parts.forEach(function (pt) {
      if (pt.id !== 'torso') return;
      for (var i = 0; i < pt.positions.length; i += 3) {
        var y = pt.positions[i + 1], p, f;
        if (Math.abs(y - yTop) < 1e-6) { p = [pt.positions[i], y, pt.positions[i + 2]]; f = 0.5 - 0.5 * projectY(fr, p); if (f < top) top = f; }
        else if (Math.abs(y - yBot) < 1e-6) { p = [pt.positions[i], y, pt.positions[i + 2]]; f = 0.5 - 0.5 * projectY(fr, p); if (f > bottom) bottom = f; }
      }
    });
    return { top: top, bottom: bottom };
  }
  /* CSS mask that dissolves the planar neck and hip cuts. cut = {top,bottom} (fractions of the stage height, from
     cutLines()). The ramps are eased (smootherstep) and long, so the neck melts away instead of ending in a stump.
     Use as   el.style.webkitMaskImage = el.style.maskImage = model.maskGradient(cut)                          */
  function maskGradient(cut, o) {
    o = o || {};
    var h = Math.max(0.05, cut.bottom - cut.top), ft = h * (o.top != null ? o.top : 0.21), fb = h * (o.bottom != null ? o.bottom : 0.17), st = [], k, x, a;
    function pc(v) { return (clamp(v, 0, 1) * 100).toFixed(2) + '%'; }
    function ease(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    st.push('rgba(0,0,0,0) 0%', 'rgba(0,0,0,0) ' + pc(cut.top));
    for (k = 1; k <= 6; k++) { x = k / 6; a = ease(x); st.push('rgba(0,0,0,' + a.toFixed(3) + ') ' + pc(cut.top + ft * x)); }
    for (k = 1; k <= 6; k++) { x = k / 6; a = 1 - ease(1 - x); st.push('rgba(0,0,0,' + (1 - ease(x)).toFixed(3) + ') ' + pc(cut.bottom - fb + fb * x)); }
    st.push('rgba(0,0,0,0) 100%');
    return 'linear-gradient(180deg,' + st.join(',') + ')';
  }
  function frames(built, aspect, opts) {
    opts = opts || {};
    aspect = aspect || 0.8;
    var P = built.patch, N = P.normal, R = P.right, U = P.up, out = { component: {} };
    // hero: ONE camera position; the figure is framed to fit the reference 4:5 box (the SVG fallback's viewBox).
    // Wider viewports keep that vertical fov, narrower ones widen it, i.e. exactly CSS 'contain' - so the canvas and the
    // SVG (preserveAspectRatio meet) frame the figure identically at every aspect. heroFill fits the real aspect.
    var heroDir = orbitDir(opts.heroAz != null ? opts.heroAz : 31, opts.heroEl != null ? opts.heroEl : 8), pts = bodyPoints(built);
    var margin = opts.margin != null ? opts.margin : 0.06, REF = 0.8;
    var ref = fitFrame(pts, heroDir, 7.8, [0, -0.1, 0.1], REF, margin);
    var hero = { position: ref.position, target: ref.target, fov: aspect >= REF ? ref.fov : 2 * Math.atan(Math.tan(ref.fov * PI / 360) * REF / aspect) * 180 / PI };
    out.hero = hero;
    out.heroFill = fitFrame(pts, heroDir, 7.8, [0, -0.1, 0.1], aspect, margin);
    // upper chest: where the patch viewer starts before it dollies in
    var tc = add(P.center, mul(U, 0.10));
    out.chest = { position: add(tc, mul(norm(add(add(N, mul(R, 0.10)), mul(U, 0.05))), 3.1)), target: tc, fov: 34 };
    // the patch, slightly off-axis so the layered depth reads
    var tp = add(P.center, mul(N, 0.03));
    out.patch = { position: add(tp, mul(norm(add(add(N, mul(R, 0.16)), mul(U, 0.14))), 1.32)), target: tp, fov: 32 };
    // each component: fov follows the aspect so its ring takes ~half of the limiting dimension
    Object.keys(P.components).forEach(function (id) {
      var c = P.components[id], dist = id === 'wear' ? 0.62 : (id === 'optical' ? 0.58 : 0.46);
      var dir = norm(add(add(N, mul(R, 0.34)), mul(U, 0.22)));
      var half = Math.max(c.radii[1] * 1.9, c.radii[0] * 1.9 / aspect) / dist;
      out.component[id] = { position: add(c.pos, mul(dir, dist)), target: c.pos.slice(), fov: clamp(2 * Math.atan(half) * 180 / PI, 16, 52) };
    });
    return out;
  }

  root.Alkyone.infant.model = {
    build: build, frames: frames, cutLines: cutLines, maskGradient: maskGradient, fitFrame: fitFrame, viewBasis: viewBasis, orbitDir: orbitDir,
    rig: RIG, shade: shade, patchPoint: patchPoint, layout: LAYOUT, stations: STATIONS,
    tray: { defs: TRAY_DEFS, colors: TRAY_COLORS, ring: trayRing },
    art: { colors: AMB, ink: INK, superPoly: superPoly },
    util: { hex: hex, toHex: toHex, s2l: s2l, l2s: l2s, lin: lin, norm: norm, cross: cross, dot: dot, sub: sub, add: add, mul: mul, mulberry32: mulberry32, rayTri: rayTri },
    version: 'A-2-final'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Alkyone.infant.model;
})();
