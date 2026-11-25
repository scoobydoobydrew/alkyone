// Generates stars.svg.html: a faint, static star field with a small Pleiades-like cluster.
// Deterministic. Run: node gen-stars.mjs
import fs from 'node:fs';
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = mulberry32(5551212), W = 1000, H = 800;
const f = (x) => (Math.round(x * 10) / 10).toString();
let out = '';
// scattered field: tiny, faint; kept out of the top-left (the label sits there)
for (let i = 0; i < 64; i++) {
  const x = r() * W, y = r() * H * 0.9;
  if (x < 470 && y < 120) continue;
  const big = r() > 0.88;
  const rad = big ? 1.5 + r() * 0.5 : 0.55 + r() * 0.65;
  const op = big ? 0.5 + r() * 0.2 : 0.16 + r() * 0.3;
  out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}" fill-opacity="${op.toFixed(2)}"/>`;
}
// the cluster: seven stars, one clearly brightest
const cx = 818, cy = 168, k = 1.55;
const star = [[0, 0, 2.7, 0.95], [-26, -30, 2.0, 0.8], [-44, -6, 1.9, 0.75], [-18, 22, 1.7, 0.7], [-36, -54, 1.35, 0.6], [22, -26, 1.5, 0.65], [-56, -26, 1.45, 0.6]];
let cl = '';
for (const [dx, dy, rad, op] of star) cl += `<circle cx="${f(cx + dx * k)}" cy="${f(cy + dy * k)}" r="${rad}" fill-opacity="${op}"/>`;
// four-point glint on the brightest only
const g = `<path d="M${cx} ${cy - 11}L${cx + 1.6} ${cy - 1.6}L${cx + 11} ${cy}L${cx + 1.6} ${cy + 1.6}L${cx} ${cy + 11}L${cx - 1.6} ${cy + 1.6}L${cx - 11} ${cy}L${cx - 1.6} ${cy - 1.6}Z" fill-opacity=".55"/>`;
const svg = `<svg class="sleep-stars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs><radialGradient id="sleep-halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#8ED8D0" stop-opacity=".2"/><stop offset=".55" stop-color="#5A94C8" stop-opacity=".07"/><stop offset="1" stop-color="#5A94C8" stop-opacity="0"/></radialGradient></defs><ellipse cx="${cx - 34}" cy="${cy - 18}" rx="150" ry="120" fill="url(#sleep-halo)"/><g class="sleep-stars__field">${out}</g><g class="sleep-stars__cluster">${cl}${g}</g></svg>`;
fs.writeFileSync(new URL('./stars.svg.html', import.meta.url), svg);
console.log('stars.svg.html', svg.length, 'bytes');
