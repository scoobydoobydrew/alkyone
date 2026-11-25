// gen-hand.mjs - faceted blue-grey hand + chest hint for the ring plate.
// Usage: node gen-hand.mjs   (writes hand.svg.html, chest.svg.html and preview.html next to this file)
// Primitives (lofted tubes) -> rotation + orthographic projection -> back-face cull -> painter sort -> flat shading
// with a tonal blue ramp (same family as the hero torso). Deterministic, no randomness except a seeded jitter.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const D2R = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const f1 = (x) => { const s = x.toFixed(1); return s.replace(/\.0$/, ''); };

let seed = 7;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jit = (a) => (rnd() - 0.5) * 2 * a;

/* ---------------------------------------------------------------- lofted tube */
// spine: [[x,y,z]...]; rx, rz: per-station radii; opts: N sides, off (deg), e (superellipse exponent), capEnd, capStart, up
function tube(spine, rx, rz, o = {}) {
  const N = o.N || 6, off = (o.off ?? 30) * D2R, e = o.e || 2, up = o.up || [0, 0, 1];
  const rings = [], centers = [];
  for (let i = 0; i < spine.length; i++) {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(spine.length - 1, i + 1)];
    const t = norm(sub(b, a));
    let s = cross(up, t); if (len(s) < 1e-3) s = [1, 0, 0]; s = norm(s);
    const n = norm(cross(t, s));
    const ring = [];
    for (let k = 0; k < N; k++) {
      const th = off + (k / N) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / e), pz = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
      ring.push(add(spine[i], add(mul(s, rx[i] * px), mul(n, rz[i] * pz))));
    }
    rings.push(ring); centers.push({ c: spine[i], t });
  }
  const polys = [];
  const push = (pts, ctr) => polys.push({ pts, ctr });
  for (let i = 0; i < spine.length - 1; i++) {
    const ctr = mul(add(spine[i], spine[i + 1]), 0.5);
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      push([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]], ctr);
    }
  }
  const last = spine.length - 1;
  if (o.capEnd !== false) {
    const t = centers[last].t;
    const apex = add(spine[last], mul(t, (o.tip ?? 0.85) * Math.max(rx[last], rz[last])));
    if (o.tipDrop) apex[2] -= o.tipDrop;
    for (let k = 0; k < N; k++) push([rings[last][k], rings[last][(k + 1) % N], apex], spine[last]);
  }
  if (o.capStart) {
    const t = centers[0].t;
    const apex = sub(spine[0], mul(t, 0.8 * Math.max(rx[0], rz[0])));
    for (let k = 0; k < N; k++) push([rings[0][(k + 1) % N], rings[0][k], apex], spine[0]);
  }
  return polys;
}

/* ---------------------------------------------------------------- hand model */
const parts = []; // {name, order, polys}
function addPart(name, order, polys) { parts.push({ name, order, polys }); }

// forearm + palm: one loft (wrist narrower than the palm)
{
  const ys = [-30, -20, -13, -6, -2, 1.5, 4.5, 7.2, 9.4, 11, 12];
  const rxv = [4.1, 3.9, 3.6, 3.3, 3.2, 3.8, 4.5, 4.8, 4.9, 4.7, 3.9];
  const rzv = [2.2, 2.1, 1.9, 1.75, 1.65, 1.8, 1.8, 1.6, 1.45, 1.25, .95];
  const zv = ys.map((y) => 0.15 + 0.55 * Math.exp(-Math.pow((y - 6.5) / 6, 2)));
  addPart('palm', 1, tube(ys.map((y, i) => [0, y, zv[i]]), rxv, rzv, { N: 14, off: 12, e: 2.4, capEnd: true, tip: 0.2 }));
}

// fingers
const FINGERS = [
  { name: 'index',  x: -3.45, splay: -7, len: [3.6, 2.15, 1.8], pitch: [10, 28, 42], r0: 1.12 },
  { name: 'middle', x: -1.15, splay: -1.5, len: [3.95, 2.4, 1.9], pitch: [14, 34, 48], r0: 1.14 },
  { name: 'ring',   x: 1.15,  splay: 4,  len: [3.7, 2.25, 1.8], pitch: [18, 38, 52], r0: 1.08 },
  { name: 'little', x: 3.3,   splay: 10,    len: [2.95, 1.7, 1.55], pitch: [22, 42, 56], r0: .96 },
];
const fingerData = {};
FINGERS.forEach((F, idx) => {
  const sp = [[F.x - Math.sin(F.splay * D2R) * 0.8, 10.4, 0.3]];
  let pos = sp[0].slice(), ptc = 0;
  const lens = [F.len[0] + 0.8, F.len[1], F.len[2]];
  for (let s = 0; s < 3; s++) {
    ptc = F.pitch[s] * D2R;
    const a = F.splay * D2R;
    const d = [Math.sin(a) * Math.cos(ptc), Math.cos(a) * Math.cos(ptc), -Math.sin(ptc)];
    pos = add(pos, mul(d, lens[s]));
    sp.push(pos.slice());
  }
  const r = [F.r0, F.r0 * .93, F.r0 * .84, F.r0 * .72];
  const rzz = r.map((v) => v * .9);
  addPart(F.name, 2 + idx * 0.01, tube(sp, r, rzz, { N: 6, off: 30, tip: 0.6, tipDrop: 0.15 }));
  fingerData[F.name] = { sp, r };
});

// thumb: metacarpal + two phalanges, relaxed and set a little away from the palm
{
  const base = [-3.5, 2.6, -0.45];
  const segs = [
    { L: 4.2, ang: -50, pit: 10 },
    { L: 3.0, ang: -40, pit: 20 },
    { L: 2.4, ang: -30, pit: 30 },
  ];
  const sp = [[-2.4, 0.4, -0.35], base]; let pos = base.slice();
  for (const sg of segs) {
    const a = sg.ang * D2R, p = sg.pit * D2R;
    pos = add(pos, mul([Math.sin(a) * Math.cos(p), Math.cos(a) * Math.cos(p), -Math.sin(p)], sg.L));
    sp.push(pos.slice());
  }
  const r = [1.7, 1.5, 1.2, 1.02, .86];
  addPart('thumb', 0.5, tube(sp, r, r.map((v) => v * .88), { N: 6, off: 20, tip: 0.6, tipDrop: .1, capStart: true }));
}

/* ---------------------------------------------------------------- projection + shading */
const POSE = { twist: -4, tilt: 38, roll: 26 };   // deg: about y (hand axis), about x (camera pitch), in-plane rotation
function rot(p, pose) {
  const ty = pose.twist * D2R, tx = pose.tilt * D2R, tz = pose.roll * D2R;
  let [x, y, z] = p;
  [x, z] = [x * Math.cos(ty) + z * Math.sin(ty), -x * Math.sin(ty) + z * Math.cos(ty)];
  [y, z] = [y * Math.cos(tx) - z * Math.sin(tx), y * Math.sin(tx) + z * Math.cos(tx)];
  [x, y] = [x * Math.cos(tz) - y * Math.sin(tz), x * Math.sin(tz) + y * Math.cos(tz)];
  return [x, y, z];
}
const RAMP = ['#4F7088', '#668AA3', '#7FA3BA', '#9ABBCE', '#B4CFDE', '#CDE1EC', '#E1EEF5'];
const hex2 = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function ramp(t, R = RAMP) {
  t = Math.max(0, Math.min(1, t)) * (R.length - 1);
  const i = Math.min(R.length - 2, Math.floor(t)), u = t - i;
  const a = hex2(R[i]), b = hex2(R[i + 1]);
  return '#' + [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * u).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const LIGHT = norm([-0.55, 0.3, 0.8]);
const SCALE = 10;

function project(pose = POSE) {
  const out = [];
  for (const part of parts) {
    const items = [];
    for (const poly of part.polys) {
      const pts = poly.pts.map((p) => rot(p, pose));
      let n = cross(sub(pts[1], pts[0]), sub(pts[pts.length - 1], pts[0]));
      if (pts.length === 4) n = norm(add(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])), cross(sub(pts[2], pts[1]), sub(pts[2], pts[3])))); else n = norm(n);
      const cen = mul(pts.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / pts.length);
      const ctr = rot(poly.ctr, pose);
      if (dot(n, sub(cen, ctr)) < 0) n = mul(n, -1);
      if (n[2] <= -0.9) continue;
      const lam = dot(n, LIGHT);
      let t = 0.1 + 0.95 * Math.max(0, lam);
      t = Math.pow(Math.min(1, t), 0.9);
      t = Math.round(t * 12) / 12;
      items.push({ z: cen[2], pts, t });
    }
    items.sort((a, b) => a.z - b.z);
    out.push({ name: part.name, order: part.order, items });
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}

function handSvg(pose = POSE) {
  const proj = project(pose);
  // bounds
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  const P = (p) => [p[0] * SCALE, -p[1] * SCALE];
  // anchor: index finger proximal
  const idx = fingerData.index;
  const a0 = rot(idx.sp[0], pose), a1 = rot(idx.sp[1], pose);
  const am = [a0[0] * .5 + a1[0] * .5 * 1.0, 0, 0];
  const mid = rot([0, 0, 0], pose);
  const s0 = idx.sp[0], s1 = idx.sp[1];
  const mp = [s0[0] + (s1[0] - s0[0]) * 0.62, s0[1] + (s1[1] - s0[1]) * 0.62, s0[2] + (s1[2] - s0[2]) * 0.62];
  const anchor = P(rot(mp, pose));
  const tip = P(rot([s1[0] + (s1[0] - s0[0]) * 0.05, s1[1] + (s1[1] - s0[1]) * 0.05, s1[2]], pose));
  const base = P(rot(s0, pose));
  const ang = Math.atan2(base[1] - tip[1], base[0] - tip[0]) / D2R; // direction base->tip as screen angle
  const dir = Math.atan2(tip[1] - base[1], tip[0] - base[0]) / D2R;
  const bandW = idx.r[1] * 2 * SCALE;
  let body = '';
  for (const part of proj) {
    body += `<g data-p="${part.name}">`;
    for (const it of part.items) {
      const c = ramp(it.t);
      const pts = it.pts.map((p) => { const q = P(p); minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]); return `${f1(q[0])},${f1(q[1])}`; }).join(' ');
      body += `<polygon fill="${c}" points="${pts}"/>`;
    }
    body += '</g>';
  }
  return { body, anchor, dir, bandW, bounds: [minx, miny, maxx, maxy], count: proj.reduce((a, p) => a + p.items.length, 0) };
}

/* ---------------------------------------------------------------- chest hint (quarter dome) */
function chestSvg() {
  seed = 21;
  const R = 1, rings = [0, .2, .4, .6, .8, 1.0];
  const mesh = []; // rings of points
  mesh.push([[0, 0]]);
  for (let j = 1; j < rings.length; j++) {
    const m = 3 + j * 2, row = [];
    for (let k = 0; k < m; k++) {
      const a = (-8 + (k / (m - 1)) * 106) * D2R;
      const r = rings[j] * (1 + (j === rings.length - 1 ? jit(.03) : jit(.035)));
      const aa = a + jit(.04);
      row.push([Math.cos(aa) * r, Math.sin(aa) * r]);
    }
    mesh.push(row);
  }
  const H = (x, y) => Math.sqrt(Math.max(0, 1.15 - 0.9 * (x * x + y * y)));
  const tris = [];
  const tri = (a, b, c) => tris.push([a, b, c]);
  for (const p of mesh[1]) { /* fan from centre */ }
  for (let k = 0; k < mesh[1].length - 1; k++) tri(mesh[0][0], mesh[1][k], mesh[1][k + 1]);
  for (let j = 1; j < mesh.length - 1; j++) {
    const A = mesh[j], B = mesh[j + 1];
    let i = 0, k = 0;
    while (i < A.length - 1 || k < B.length - 1) {
      const fa = i / (A.length - 1), fb = k / (B.length - 1);
      if (i < A.length - 1 && (fa <= fb || k >= B.length - 1)) { tri(A[i], A[i + 1], B[k]); i++; }
      else { tri(A[i], B[k + 1], B[k]); k++; }
    }
  }
  const CL = norm([-0.5, -0.45, 0.7]); // light from upper-left (screen y is down here)
  const CR = ['#BDD3DF', '#CFE0E9', '#DCE9F0', '#E8F1F6', '#F2F8FB'];
  let s = '';
  for (const t of tris) {
    const p = t.map(([x, y]) => [x, y, H(x, y)]);
    let n = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    if (n[2] < 0) n = mul(n, -1);
    const lam = Math.max(0, dot(n, CL));
    const col = ramp(0.08 + lam * 0.95, CR);
    s += `<polygon fill="${col}" stroke="${col}" points="${t.map(([x, y]) => `${f1(x * 100)},${f1(y * 100)}`).join(' ')}"/>`;
  }
  const edge = mesh[mesh.length - 1].map(([x, y]) => `${f1(x * 100)},${f1(y * 100)}`).join(' ');
  return { body: s, edge };
}

/* ---------------------------------------------------------------- write */
const hand = handSvg();
const [minx, miny, maxx, maxy] = hand.bounds;
const handFile = `<!-- generated by gen-hand.mjs: ${hand.count} facets -->` +
  `<g id="ring-hand" class="ring-hand" data-anchor="${f1(hand.anchor[0])},${f1(hand.anchor[1])}" data-dir="${f1(hand.dir)}" data-bandw="${f1(hand.bandW)}" data-bounds="${[minx, miny, maxx, maxy].map(f1).join(',')}" stroke-linejoin="round" stroke-width=".5">` +
  hand.body.replace(/<polygon fill="(#[0-9A-F]{6})"/g, '<polygon fill="$1" stroke="$1"') + '</g>\n';
fs.writeFileSync(path.join(HERE, 'hand.svg.html'), handFile);
const chest = chestSvg();
fs.writeFileSync(path.join(HERE, 'chest.svg.html'), `<!-- generated by gen-hand.mjs -->` + `<g id="ring-chest" class="ring-chest" stroke-width=".4" stroke-linejoin="round">${chest.body}</g>\n`);
fs.writeFileSync(path.join(HERE, 'preview.html'), `<!doctype html><meta charset=utf-8><body style="margin:0;background:#F2F7F9"><svg viewBox="${f1(minx - 20)} ${f1(miny - 20)} ${f1(maxx - minx + 40)} ${f1(maxy - miny + 40)}" width="900" style="background:#fff">${handFile}<circle cx="${hand.anchor[0]}" cy="${hand.anchor[1]}" r="4" fill="red"/></svg><svg viewBox="-20 -20 140 140" width="500" style="background:#fff">${fs.readFileSync(path.join(HERE, 'chest.svg.html'), 'utf8')}</svg>`);
console.log('hand facets', hand.count, 'bytes', handFile.length, 'bounds', hand.bounds.map(f1).join(','), 'anchor', hand.anchor.map(f1).join(','), 'dir', f1(hand.dir), 'bandW', f1(hand.bandW), 'chest bytes', chest.body.length);
