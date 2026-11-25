// gen-fallback.mjs  (variant A, "sculpted rings")
// Usage: node gen-fallback.mjs
// Imports the PURE geometry model and writes, next to this file:
//   hero-fallback.svg.html   the torso + patch from the hero three-quarter camera, projected and
//                            flat-shaded into <polygon>s (painter's algorithm), same light rig as the 3D scene
//   patch-fallback.svg.html  a large front view of the patch alone, same visual language
//   patch-hotspots.json      the five hotspot anchors as fractions (0..1) of the patch SVG viewBox
// It also refreshes the marked regions of proto.html so the page shows the current fragments inline.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const M = require('../infant-model.js');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const U = M.util;
const { add, sub, mul, dot, cross, norm } = U;

/* ------------------------------------------------------------------ helpers */
const f = (x, d = 1) => { const s = x.toFixed(d); return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, ''); };
const srgbHex = (lin) => U.toHex([U.l2s(lin[0]), U.l2s(lin[1]), U.l2s(lin[2])]);

class Defs {
  constructor(prefix) { this.p = prefix; this.items = []; this.n = 0; this.pathIds = new Map(); }
  gradient(g) {
    const id = `${this.p}g${++this.n}`;
    const stops = g.stops.map(([o, c, a]) => `<stop offset="${f(o, 3)}" stop-color="${c}"${a != null && a < 1 ? ` stop-opacity="${f(a, 3)}"` : ''}/>`).join('');
    if (g.g === 'radial') this.items.push(`<radialGradient id="${id}" cx="${f(g.c[0], 3)}" cy="${f(g.c[1], 3)}" r="${f(g.r, 3)}" gradientUnits="userSpaceOnUse">${stops}</radialGradient>`);
    else this.items.push(`<linearGradient id="${id}" x1="${f(g.p0[0], 3)}" y1="${f(g.p0[1], 3)}" x2="${f(g.p1[0], 3)}" y2="${f(g.p1[1], 3)}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>`);
    return `url(#${id})`;
  }
  paint(p) { return typeof p === 'string' ? p : this.gradient(p); }
  pathId(pts, closed, holes) {
    // identical point arrays (the three-pass traces share one) are emitted once and <use>d
    if (this.pathIds.has(pts)) return this.pathIds.get(pts);
    const id = `${this.p}p${++this.n}`;
    this.items.push(`<path id="${id}" d="${pathD(pts, closed, holes)}"/>`);
    this.pathIds.set(pts, id);
    return id;
  }
}
function pathD(pts, closed, holes) {
  let d = 'M' + pts.map((p) => f(p[0], 3) + ' ' + f(p[1], 3)).join('L');
  if (closed || holes) d += 'Z';
  if (holes) holes.forEach((h) => { d += 'M' + h.map((p) => f(p[0], 3) + ' ' + f(p[1], 3)).join('L') + 'Z'; });
  return d;
}

// ops (art units) -> SVG elements. `minSize` drops invisibly small detail for the tiny hero patch.
function opsToSvg(ops, defs, minSize = 0) {
  const out = [];
  for (const op of ops) {
    const size = op.t === 'circle' ? op.r : op.t === 'rrect' ? Math.min(op.w, op.h) / 2 : (op.sw || 0);
    if (size < minSize) continue;
    const a = [];
    if (op.t === 'path') {
      const closed = op.closed || !!op.holes;
      if (op.fill) a.push(`fill="${defs.paint(op.fill)}"`); else a.push('fill="none"');
      if (op.holes) a.push('fill-rule="evenodd"');
      if (op.stroke) a.push(`stroke="${op.stroke}" stroke-width="${f(op.sw, 3)}"`);
      if (op.cap) a.push(`stroke-linecap="${op.cap}"`);
      if (op.join) a.push(`stroke-linejoin="${op.join}"`);
      if (op.dash) a.push(`stroke-dasharray="${op.dash.map((x) => f(x, 3)).join(' ')}"`);
      if (op.alpha != null && op.alpha < 1) a.push(`opacity="${f(op.alpha, 2)}"`);
      if (!op.fill && !op.holes && !op.closed && op.pts.length > 12) out.push(`<use href="#${defs.pathId(op.pts, false)}" ${a.join(' ')}/>`);
      else out.push(`<path d="${pathD(op.pts, closed, op.holes)}" ${a.join(' ')}/>`);
      continue;
    }
    if (op.fill) a.push(`fill="${defs.paint(op.fill)}"`); else a.push('fill="none"');
    if (op.stroke) a.push(`stroke="${op.stroke}" stroke-width="${f(op.sw, 3)}"`);
    if (op.dash) a.push(`stroke-dasharray="${op.dash.map((x) => f(x, 3)).join(' ')}"`);
    if (op.alpha != null && op.alpha < 1) a.push(`opacity="${f(op.alpha, 2)}"`);
    if (op.t === 'circle') out.push(`<circle cx="${f(op.c[0], 3)}" cy="${f(op.c[1], 3)}" r="${f(op.r, 3)}" ${a.join(' ')}/>`);
    else if (op.t === 'rrect') out.push(`<rect x="${f(op.c[0] - op.w / 2, 3)}" y="${f(op.c[1] - op.h / 2, 3)}" width="${f(op.w, 3)}" height="${f(op.h, 3)}" rx="${f(op.r, 3)}" ${a.join(' ')}/>`);
  }
  return out.join('');
}

/* ---------------------------------------------------------------- the model */
const built = M.build();
const art = built.patch.art;
const P = built.patch;

/* =========================================================================
   (a) HERO: torso + patch from the hero camera, painter's algorithm
   - parts are painted far arm -> torso -> near arm (no cross-part sorting errors)
   - arm triangles are clipped against the torso volume, so the embedded shoulder root that the
     z-buffer hides in 3D does not show up in the SVG
   - polygons are inflated by a fraction of a pixel instead of stroked (hairline seams, fewer bytes)
   ========================================================================= */
function heroSvg(rigName = 'mist') {
  const W = 800, H = 1000, ASPECT = W / H, INFL = 0.55;
  const fr = M.frames(built, ASPECT).hero;
  const cuts = M.cutLines(built, fr);
  const basis = M.viewBasis(fr.position, fr.target);
  const tanH = Math.tan(fr.fov * Math.PI / 360);
  const proj = (p) => {
    const v = sub(p, fr.position), z = dot(v, basis.f), x = dot(v, basis.r), y = dot(v, basis.u);
    return [(x / (z * tanH * ASPECT) * 0.5 + 0.5) * W, (0.5 - y / (z * tanH) * 0.5) * H, z];
  };
  const tris = (part) => {
    const pos = part.positions, col = part.colors, out = [];
    for (let i = 0; i < pos.length; i += 9) {
      out.push({
        p: [[pos[i], pos[i + 1], pos[i + 2]], [pos[i + 3], pos[i + 4], pos[i + 5]], [pos[i + 6], pos[i + 7], pos[i + 8]]],
        alb: [(col[i] + col[i + 3] + col[i + 6]) / 3, (col[i + 1] + col[i + 4] + col[i + 7]) / 3, (col[i + 2] + col[i + 5] + col[i + 8]) / 3]
      });
    }
    return out;
  };
  const cen3 = (p) => [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3, (p[0][2] + p[1][2] + p[2][2]) / 3];
  const mid3 = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

  // inside-the-torso test: parity of ray hits against the closed torso mesh
  const torsoTris = tris(built.parts.find((p) => p.id === 'torso'));
  const RAYD = norm([0.5773, 0.5207, 0.6313]);
  const inside = (pt) => { let hits = 0; for (const t of torsoTris) if (U.rayTri(pt, RAYD, t.p[0], t.p[1], t.p[2]) > 0) hits++; return (hits & 1) === 1; };
  function clipOutside(p, depth) {                       // -> list of triangles outside the torso
    const ins = [inside(p[0]), inside(p[1]), inside(p[2]), inside(cen3(p))];
    const n = ins.filter(Boolean).length;
    if (n === 0) return [p];
    if (n === 4) return [];
    if (depth === 0) return ins[3] ? [] : [p];
    const m01 = mid3(p[0], p[1]), m12 = mid3(p[1], p[2]), m20 = mid3(p[2], p[0]);
    return [[p[0], m01, m20], [m01, p[1], m12], [m20, m12, p[2]], [m01, m12, m20]].flatMap((q) => clipOutside(q, depth - 1));
  }

  // ---- shade + project every front-facing facet (arms optionally clipped into sub-triangles)
  const items = { 'arm-l': [], 'arm-r': [], torso: [] };
  const addPart = (id, clip) => {
    for (const t of tris(built.parts.find((p) => p.id === id))) {
      const [a, b, c] = t.p, cen = cen3(t.p), toV = norm(sub(fr.position, cen));
      const n = norm(cross(sub(b, a), sub(c, a)));
      if (dot(n, toV) <= 0) continue;
      const color = srgbHex(M.shade(rigName, n, t.alb, toV));
      const subs = clip ? clipOutside(t.p, 5) : [t.p];
      if (!subs.length) continue;
      items[id].push({ d: proj(cen)[2], color, tris: subs.map((q) => q.map(proj)) });
    }
    items[id].sort((p, q) => q.d - p.d);
  };
  addPart('torso', false); addPart('arm-l', true); addPart('arm-r', true);
  const meanDepth = (id) => items[id].length ? items[id].reduce((s, it) => s + it.d, 0) / items[id].length : 1e9;
  const order = meanDepth('arm-l') < meanDepth('arm-r') ? ['arm-r', 'torso', 'arm-l'] : ['arm-l', 'torso', 'arm-r'];

  const inflate = (q) => {                               // push the vertices out of the centroid by INFL px
    const cx = (q[0][0] + q[1][0] + q[2][0]) / 3, cy = (q[0][1] + q[1][1] + q[2][1]) / 3;
    return q.map((v) => { const dx = v[0] - cx, dy = v[1] - cy, l = Math.hypot(dx, dy) || 1; return [v[0] + dx / l * INFL, v[1] + dy / l * INFL]; });
  };
  const pts = (q, d) => q.map((v) => f(v[0], d) + ',' + f(v[1], d)).join(' ');
  const facet = (it) => (it.tris.length === 1
    ? `<polygon fill="${it.color}" points="${pts(inflate(it.tris[0]), 0)}"/>`
    : `<path fill="${it.color}" d="${it.tris.map((q) => 'M' + inflate(q).map((v) => f(v[0], 0) + ' ' + f(v[1], 0)).join('L') + 'Z').join('')}"/>`);
  const partSvg = order.map((id) => items[id].map(facet).join(''));
  const nPolys = order.reduce((s, id) => s + items[id].length, 0);

  // ---- patch tray: rings -> quads with smoothed normals (outer wall + bevel only); the cavity is one polygon
  const L = P.layers, SEG = 24, defs = M.tray.defs, ringsN = 6;
  const R = [];
  for (let i = 0; i < ringsN; i++) R.push(M.tray.ring(P, defs[i][0], defs[i][1], SEG));
  const hintW = [[1, 0], [1, 0.1], [1, 0.5], [0.7, 1], [0, 1], [0, 1]];
  const radial = (pt) => { let d = sub(pt, P.center); d = sub(d, mul(P.normal, dot(d, P.normal))); return norm(d); };
  const vn = R.map((ring, i) => ring.map((pt, j) => {     // per-vertex normals from the neighbouring ring/segment
    const a = ring[(j + 1) % SEG], b = ring[(j + SEG - 1) % SEG];
    const up = R[Math.min(i + 1, ringsN - 1)][j], dn = R[Math.max(i - 1, 0)][j];
    let n = norm(cross(sub(a, b), sub(up, dn)));
    const h = hintW[i];
    const hint = add(mul(radial(pt), h[0]), mul(P.normal, h[1]));
    if (dot(n, hint) < 0) n = mul(n, -1);
    return n;
  }));
  const trayQuads = [];
  for (let i = 0; i < ringsN - 1; i++) for (let j = 0; j < SEG; j++) {
    const k = (j + 1) % SEG, q = [R[i][j], R[i][k], R[i + 1][k], R[i + 1][j]];
    const cen = [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4, (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4];
    const toV = norm(sub(fr.position, cen));
    const n = norm(add(add(vn[i][j], vn[i][k]), add(vn[i + 1][k], vn[i + 1][j])));
    if (dot(n, toV) <= 0) continue;
    const ca = U.hex(M.tray.colors[defs[i][2]]), cb = U.hex(M.tray.colors[defs[i + 1][2]]);
    const alb = [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2, (ca[2] + cb[2]) / 2];
    trayQuads.push({ d: proj(cen)[2], color: srgbHex(M.shade(rigName, n, alb, toV)), pts: q.map(proj) });
  }
  trayQuads.sort((p, q) => q.d - p.d);
  const quad = (q) => {
    const cx = q.pts.reduce((s, v) => s + v[0], 0) / 4, cy = q.pts.reduce((s, v) => s + v[1], 0) / 4;
    const pp = q.pts.map((v) => { const dx = v[0] - cx, dy = v[1] - cy, l = Math.hypot(dx, dy) || 1; return [v[0] + dx / l * 0.35, v[1] + dy / l * 0.35]; });
    return `<polygon fill="${q.color}" points="${pts(pp, 1)}"/>`;
  };
  const cav = M.tray.ring(P, 0.906, 0.0602, SEG).map(proj);

  // art layers as affine maps: art (u,v) -> screen
  const affine = (h) => {
    const o = proj(M.patchPoint(P, 0, 0, h)), ux = proj(M.patchPoint(P, 1, 0, h)), uy = proj(M.patchPoint(P, 0, 1, h));
    return `matrix(${f(ux[0] - o[0], 3)} ${f(ux[1] - o[1], 3)} ${f(uy[0] - o[0], 3)} ${f(uy[1] - o[1], 3)} ${f(o[0], 2)} ${f(o[1], 2)})`;
  };
  const defsX = new Defs('fbh-');
  const halo = defsX.gradient({ g: 'radial', c: [0, 0], r: 2.5, stops: [[0, '#F6A95F', 0.8], [0.38, '#F6A95F', 0.42], [0.7, '#F6A95F', 0.12], [1, '#F6A95F', 0]] });
  const ghost = opsToSvg(art.ops.ghost, defsX, 0.02);
  const core = opsToSvg(art.ops.core, defsX, 0.05);
  const lid = opsToSvg(art.ops.lid, defsX, 0.02);
  const patchG =
    `<g class="fb-patch"><g transform="${affine(0.004)}"><ellipse class="fb-glow" cx="0" cy="-0.05" rx="2.5" ry="2.5" fill="${halo}"/></g>` +
    `<g class="fb-tray">${trayQuads.map(quad).join('')}<polygon fill="#E6F1F6" points="${pts(cav, 1)}"/></g>` +
    `<g transform="${affine(L.ghost)}" class="fb-ghost">${ghost}</g>` +
    `<g transform="${affine(L.core)}"><g class="fb-pulse">${core}</g></g>` +
    `<g transform="${affine(L.lid)}" class="fb-lid">${lid}</g></g>`;

  // painted: far arm, torso, patch, near arm
  const night = rigName === 'night';
  // night: the same faint facet hairlines the 3D scene draws (drawn as a hair of stroke on every facet)
  const nightStyle = night ? `<style>.hero-fallback--night .fb-body polygon,.hero-fallback--night .fb-body path{stroke:#8EE3DA;stroke-opacity:.17;stroke-width:.5}</style>` : '';
  const svg =
    `<svg class="hero-fallback${night ? ' hero-fallback--night' : ''}" data-cut-top="${cuts.top.toFixed(4)}" data-cut-bottom="${cuts.bottom.toFixed(4)}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${nightStyle}<defs>${defsX.items.join('')}</defs>` +
    `<g class="fb-body">${partSvg[0]}${partSvg[1]}</g>${patchG}<g class="fb-body">${partSvg[2]}</g></svg>`;
  return { svg, stats: { polygons: nPolys, trayQuads: trayQuads.length, bytes: Buffer.byteLength(svg) } };
}

/* =========================================================================
   (b) PATCH: large front view, art drawn directly (no projection)
   ========================================================================= */
function patchSvg() {
  const W = 800, H = 1000, S = 300, CX = 400, CY = 500, A = art.A, n = art.n;
  const defs = new Defs('fbp-');
  const sp = (s) => M.art.superPoly(0, 0, s, s * A, n, 72);
  const body = [];
  // contact shadow, body, bevel, cavity (the glow is a separate group so CSS can pulse it)
  body.push({ t: 'path', closed: true, pts: sp(1.0).map((p) => [p[0] + 0.05, p[1] - 0.09]), fill: { g: 'radial', c: [0.05, -0.09], r: 1.45, stops: [[0.7, '#06161F', 0.34], [1, '#06161F', 0]] } });
  body.push({ t: 'path', closed: true, pts: sp(1.0), fill: { g: 'linear', p0: [-0.7, 1.2], p1: [0.8, -1.2], stops: [[0, '#FAFDFE'], [0.55, '#E3F0F5'], [1, '#B6D0DB']] }, stroke: '#9DBFCD', sw: 0.012 });
  body.push({ t: 'path', closed: true, pts: sp(0.968), stroke: '#FFFFFF', sw: 0.034, alpha: 0.9 });
  body.push({ t: 'path', closed: true, pts: sp(0.936), stroke: '#9FBFCC', sw: 0.016, alpha: 0.55 });
  body.push({ t: 'path', closed: true, pts: sp(0.906), fill: { g: 'linear', p0: [-0.7, 1.2], p1: [0.8, -1.2], stops: [[0, '#BFD8E2'], [0.18, '#E4F1F6'], [1, '#EEF6F9']] }, stroke: '#8DB2C2', sw: 0.012 });
  const glowOp = { t: 'circle', c: [0, -0.04], r: 2.15, fill: { g: 'radial', c: [0, -0.04], r: 2.15, stops: [[0, '#F6A95F', 0.55], [0.5, '#F6A95F', 0.16], [1, '#F6A95F', 0]] } };
  const glow = opsToSvg([glowOp], defs, 0);
  const bodySvg = opsToSvg(body, defs, 0);
  const ghost = opsToSvg(art.ops.ghost, defs, 0);
  const core = opsToSvg(art.ops.core, defs, 0);
  const lid = opsToSvg(art.ops.lid, defs, 0);
  const svg =
    `<svg class="patch-fallback" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><defs>${defs.items.join('')}</defs>` +
    `<g transform="translate(${CX} ${CY}) scale(${S} ${-S})" stroke-linejoin="round">` +
    `<g class="fb-glow">${glow}</g><g class="fb-body">${bodySvg}</g><g class="fb-ghost">${ghost}</g><g class="fb-pulse">${core}</g><g class="fb-lid">${lid}</g></g></svg>`;
  // hotspots, as fractions of the viewBox
  const Lyt = M.layout, hs = {};
  ['optical', 'temp', 'imu', 'mic', 'wear'].forEach((id) => {
    const c = Lyt[id].c, r = Lyt[id].radii;
    hs[id] = { x: +((CX + c[0] * S) / W).toFixed(4), y: +((CY - c[1] * S) / H).toFixed(4), rx: +(r[0] * S / W).toFixed(4), ry: +(r[1] * S / H).toFixed(4) };
  });
  return { svg, hotspots: { viewBox: [W, H], note: 'Fractions (0..1) of the patch-fallback viewBox. x,y = anchor centre; rx,ry = suggested ring radii.', ...hs }, stats: { bytes: Buffer.byteLength(svg) } };
}

/* ------------------------------------------------------------------- write */
const hero = heroSvg('mist');
const heroNight = heroSvg('night');
const patch = patchSvg();
fs.writeFileSync(path.join(HERE, 'hero-fallback.svg.html'), hero.svg);
fs.writeFileSync(path.join(HERE, 'hero-fallback.night.svg.html'), heroNight.svg);
fs.writeFileSync(path.join(HERE, 'patch-fallback.svg.html'), patch.svg);
fs.writeFileSync(path.join(HERE, 'patch-hotspots.json'), JSON.stringify(patch.hotspots, null, 2) + '\n');
console.log('hero-fallback.svg.html  ', hero.stats.bytes, 'bytes', JSON.stringify(hero.stats));
console.log('hero-fallback.night.svg.html', heroNight.stats.bytes, 'bytes');
console.log('patch-fallback.svg.html ', patch.stats.bytes, 'bytes');
console.log('patch-hotspots.json     ', JSON.stringify(patch.hotspots));

// refresh proto.html inline regions: <!--FB-HERO-->...<!--/FB-HERO--> and <!--FB-PATCH-->...<!--/FB-PATCH-->
const protoPath = path.join(HERE, '..', '..', '..', '..', 'dev', 'infant-proto.html');
if (fs.existsSync(protoPath)) {
  let html = fs.readFileSync(protoPath, 'utf8');
  const inject = (tag, svg) => {
    const re = new RegExp(`<!--${tag}-->[\\s\\S]*?<!--/${tag}-->`, 'g');
    html = html.replace(re, () => `<!--${tag}-->${svg}<!--/${tag}-->`);
  };
  inject('FB-HERO', hero.svg);
  inject('FB-HERO-NIGHT', heroNight.svg);
  inject('FB-PATCH', patch.svg);
  html = html.replace(/\/\*HOTSPOTS\*\/[\s\S]*?\/\*\/HOTSPOTS\*\//, () => `/*HOTSPOTS*/${JSON.stringify(patch.hotspots)}/*/HOTSPOTS*/`);
  fs.writeFileSync(protoPath, html);
  console.log('proto.html refreshed');
}
