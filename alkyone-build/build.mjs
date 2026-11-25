#!/usr/bin/env node
/* build.mjs - Alkyone page assembler (CONTRACT section 3; reference in FOUNDATION.md)

   node build.mjs [--only hero,ring] [--out path] [--inject file.html] [--src dir] [--quiet]

   Inputs   src/template.html  src/fonts.css  src/base.css  src/core.js
            src/sections/shared/*.js            (lexical order, before section scripts)
            src/sections/<id>/section.{html,css,js}
   Output   ONE self-contained html file (default dist/index.html, relative to this script).
   Sections hero, patch, ring, app, sleep, future, team (in that order). A section without section.html, or one that is
            excluded by --only, becomes a tall visible PLACEHOLDER so nav, rail, theme-follow and seams can be tested.
   Extras   <!--@include relative/path--> inside section.html (path relative to that file).
            --inject file.html inserts that file (+ <basename>.css, <basename>.js beside it) at the start of <main>.
            --src dir builds from another source tree (used by the validator tests).
   Seams    every depth-0 <section class="sec" data-theme> and the footer get data-prev / data-next when the neighbour
            has a different theme; base.css turns those into gradient blends (no JS, no layout shift).
   Validation (exit 1, nothing written) forbidden external URLs, @import, <link rel=stylesheet>, external <script src>,
            local file references, inline event handlers, <style>/<script> inside section.html, a section root that is
            not exactly one <section id=ID class="sec ..." data-theme>.
   Lint (warnings only)  section.css selectors outside #ID / .ID-*, !important outside reduced-motion, console.* / eval in js.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORDER = ['hero', 'loop', 'patch', 'ring', 'app', 'sleep', 'future', 'team'];
const RHYTHM = { hero: 'mist', loop: 'mist', patch: 'night', ring: 'mist', app: 'mist-teal', sleep: 'night', future: 'mist', team: 'mist-teal' };
const FOOTER_THEME = 'night';
const THEMES = ['mist', 'mist-teal', 'night'];
const TITLES = { hero: 'Hero', loop: 'The system', patch: 'The patch', ring: 'The ring', app: 'The app', sleep: 'Sleep position', future: 'What comes next', team: 'The team' };
const ALLOWED_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];
const W3C_NS = /^http:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink|1999\/xhtml|1998\/Math\/MathML|XML\/1998\/namespace)\/?$/;
const SIZE_WARN = 600 * 1024;

// ------------------------------------------------------------------------------------------------ cli
const argv = process.argv.slice(2);
const opts = { only: null, out: null, inject: null, src: null, quiet: false };
function usage(code) {
  (code ? console.error : console.log)('usage: node build.mjs [--only hero,ring] [--out path] [--inject file.html] [--src dir] [--quiet]');
  process.exit(code);
}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const val = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) { console.error(`option ${a} needs a value`); usage(2); } return v; };
  if (a === '--only') opts.only = val().split(',').map((s) => s.trim()).filter(Boolean);
  else if (a === '--out') opts.out = val();
  else if (a === '--inject') opts.inject = val();
  else if (a === '--src') opts.src = val();
  else if (a === '--quiet') opts.quiet = true;
  else if (a === '-h' || a === '--help') usage(0);
  else { console.error(`unknown option ${a}`); usage(2); }
}
if (opts.only) {
  const bad = opts.only.filter((id) => !ORDER.includes(id));
  if (bad.length) { console.error(`--only: unknown section id(s): ${bad.join(', ')} (valid: ${ORDER.join(', ')})`); process.exit(2); }
}
const SRC = opts.src ? path.resolve(opts.src) : path.join(HERE, 'src');
const OUT = opts.out ? path.resolve(opts.out) : path.join(HERE, 'dist', 'index.html');

// ------------------------------------------------------------------------------------------------ helpers
const errors = [];
const warnings = [];
const rel = (f) => { const r = path.relative(HERE, f).replace(/\\/g, '/'); return r.startsWith('..') ? f.replace(/\\/g, '/') : r; };
const err = (file, line, msg) => errors.push({ file: file ? rel(file) : '', line, msg });
const warn = (file, line, msg) => warnings.push({ file: file ? rel(file) : '', line, msg });
const lineOf = (text, index) => { let n = 1; for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++; return n; };
const norm = (s) => s.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const exists = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
function readText(f, required = true) {
  if (!exists(f)) { if (required) err(f, 0, 'file not found'); return null; }
  return norm(fs.readFileSync(f, 'utf8'));
}
const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';
const banner = (kind, name) => (kind === 'css' || kind === 'js') ? `\n/* ===== ${name} ===== */\n` : `\n<!-- ===== ${name} ===== -->\n`;

// html tag tokenizer: comments | tags (quotes respected)
const TAG_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const getAttr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
};

// top-level <section> elements of an html string (depth tracked on <section> tags only)
function scanTopSections(html) {
  const out = [];
  let depth = 0, cur = null;
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(html))) {
    if (!m[2] || m[2].toLowerCase() !== 'section') continue;
    if (m[1]) { depth--; if (depth === 0 && cur) { cur.end = m.index + m[0].length; out.push(cur); cur = null; } }
    else if (!/\/\s*$/.test(m[3])) { if (depth === 0) cur = { start: m.index, openEnd: m.index + m[0].length, open: m[0] }; depth++; }
  }
  return { sections: out, balanced: depth === 0 };
}

// ------------------------------------------------------------------------------------------------ includes
function expandIncludes(text, file, stack = [], root = path.dirname(file)) {
  if (stack.length > 8) { err(file, 0, 'include nesting deeper than 8'); return text; }
  return text.replace(/<!--\s*@include\s+([^\s>]+?)\s*-->/g, (all, p, idx) => {
    const target = path.resolve(path.dirname(file), p);
    const within = (r) => { const x = path.relative(r, target); return x && !x.startsWith('..') && !path.isAbsolute(x); };
    if (!within(SRC) && !within(root)) { err(file, lineOf(text, idx), `include outside the source tree: ${p}`); return ''; }
    if (stack.includes(target) || target === file) { err(file, lineOf(text, idx), `include cycle: ${p}`); return ''; }
    const inc = readText(target, false);
    if (inc === null) { err(file, lineOf(text, idx), `include not found: ${p}`); return ''; }
    return expandIncludes(inc, target, [...stack, file], root);
  });
}

// ------------------------------------------------------------------------------------------------ section loading
const parts = []; // { name, file, kind: 'html'|'css'|'js', text } -> everything that ends up in the output (validated below)

function validateSectionRoot(id, file, html) {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
  const { sections, balanced } = scanTopSections(stripped);
  if (!balanced) err(file, 0, '<section> tags are not balanced');
  if (sections.length !== 1) { err(file, 0, `section.html must contain exactly ONE root <section>, found ${sections.length}`); return; }
  const root = sections[0];
  const before = stripped.slice(0, root.start).trim();
  const after = stripped.slice(root.end).trim();
  if (before) err(file, lineOf(stripped, 0), `content before the root <section>: "${before.slice(0, 40)}"`);
  if (after) err(file, lineOf(stripped, root.end), `content after the root </section>: "${after.slice(0, 40)}"`);
  const open = root.open;
  const rid = getAttr(open, 'id');
  if (rid !== id) err(file, lineOf(stripped, root.start), `root id must be "${id}", found ${rid === null ? 'none' : `"${rid}"`}`);
  const cls = (getAttr(open, 'class') || '').split(/\s+/);
  if (!cls.includes('sec')) err(file, lineOf(stripped, root.start), 'root must carry class "sec"');
  const theme = getAttr(open, 'data-theme');
  if (!theme) err(file, lineOf(stripped, root.start), 'root needs data-theme="mist|mist-teal|night"');
  else if (!THEMES.includes(theme)) err(file, lineOf(stripped, root.start), `unknown data-theme "${theme}"`);
  else if (theme !== RHYTHM[id]) warn(file, lineOf(stripped, root.start), `data-theme="${theme}" differs from the theme rhythm (${id} should be "${RHYTHM[id]}")`);
  const lab = getAttr(open, 'aria-labelledby');
  if (!lab) warn(file, lineOf(stripped, root.start), `root has no aria-labelledby (expected "${id}-title")`);
  else if (!new RegExp(`\\sid\\s*=\\s*["']${lab}["']`).test(stripped)) warn(file, lineOf(stripped, root.start), `aria-labelledby points at #${lab}, which is not in the section`);
  // forbidden constructs
  const noComments = stripped;
  let m;
  const reTag = /<\s*(style|script)\b/gi;
  while ((m = reTag.exec(noComments))) err(file, lineOf(noComments, m.index), `<${m[1].toLowerCase()}> is not allowed inside section.html (use section.${m[1].toLowerCase() === 'style' ? 'css' : 'js'})`);
}

function loadSection(id) {
  const dir = path.join(SRC, 'sections', id);
  const htmlFile = path.join(dir, 'section.html');
  if (!exists(htmlFile)) return null;
  const raw = readText(htmlFile);
  if (raw === null) return null;
  const html = expandIncludes(raw, htmlFile);
  validateSectionRoot(id, htmlFile, html);
  const cssFile = path.join(dir, 'section.css'), jsFile = path.join(dir, 'section.js');
  const css = readText(cssFile, false), js = readText(jsFile, false);
  if (css !== null) lintCss(id, cssFile, css);
  if (js !== null) lintJs(id, jsFile, js);
  return { id, html, css, js, htmlFile, cssFile, jsFile };
}

// ------------------------------------------------------------------------------------------------ lint (warnings only)
function lintJs(id, file, js, { isSection = true } = {}) {
  const code = js.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
  let m;
  const re = /\bconsole\s*\.\s*\w+|\beval\s*\(|new\s+Function\s*\(|\bdebugger\b/g;
  while ((m = re.exec(code))) warn(file, lineOf(code, m.index), `${path.basename(file)} uses "${m[0].replace(/\s+/g, '')}" (not allowed by the contract)`);
  if (!/^\s*(?:;|!)?\s*(?:\(\s*(?:async\s*)?(?:function|\(\s*\)\s*=>)|(?:async\s+)?function\b)/.test(code)) warn(file, 0, `${path.basename(file)} should be wrapped in an IIFE (no globals)`);
  if (isSection && !new RegExp(`Alkyone\\s*\\.\\s*section\\(\\s*['"]${id}['"]`).test(code)) warn(file, 0, `section.js never calls Alkyone.section('${id}', ...)`);
}

function lintCss(id, file, css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const n = text.length;
  const ok = (sel) => new RegExp(`^(?:#${id}(?![\\w-])|\\.${id}(?![a-z0-9])|\\.${id}-)`).test(sel.trim());
  function skipBlock(i) { // i at '{' -> index after matching '}'
    let d = 0, q = null;
    for (; i < n; i++) {
      const c = text[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === '{') d++;
      else if (c === '}') { d--; if (d === 0) return i + 1; }
    }
    return n;
  }
  function walk(i, end, ctx) {
    while (i < end) {
      // prelude up to '{' or ';' (respect quotes and parens)
      let j = i, q = null, par = 0;
      for (; j < end; j++) {
        const c = text[j];
        if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
        if (c === '"' || c === "'") q = c;
        else if (c === '(') par++;
        else if (c === ')') par--;
        else if (par === 0 && (c === '{' || c === ';' || c === '}')) break;
      }
      const prelude = text.slice(i, j).trim();
      if (j >= end || text[j] !== '{') { i = j + 1; continue; }
      const close = skipBlock(j);
      const body = text.slice(j + 1, close - 1);
      const line = lineOf(text, i + (text.slice(i).length - text.slice(i).trimStart().length));
      if (/^@(media|supports|container|layer|scope)\b/i.test(prelude)) {
        walk(j + 1, close - 1, { reduced: ctx.reduced || /prefers-reduced-motion\s*:\s*reduce/i.test(prelude) });
      } else if (/^@keyframes\b/i.test(prelude)) {
        const name = prelude.replace(/^@keyframes\s+/i, '').trim();
        if (!new RegExp(`^${id}[-_A-Z]`).test(name)) warn(file, line, `@keyframes "${name}" should be prefixed "${id}-"`);
      } else if (/^@(font-face|property|counter-style|page|view-transition)\b/i.test(prelude)) {
        // allowed, nothing to check
      } else if (prelude) {
        const sels = []; let cur = '', pd = 0, bd = 0;
        for (const c of prelude) { if (c === '(') pd++; else if (c === ')') pd--; else if (c === '[') bd++; else if (c === ']') bd--; if (c === ',' && !pd && !bd) { sels.push(cur); cur = ''; } else cur += c; }
        sels.push(cur);
        for (const s of sels) if (s.trim() && !ok(s)) warn(file, line, `selector "${s.trim().slice(0, 60)}" must start with #${id} or .${id}-`);
        if (/!important/i.test(body) && !ctx.reduced) warn(file, line, '!important is only allowed inside @media (prefers-reduced-motion)');
      }
      i = close;
    }
  }
  walk(0, n, { reduced: false });
}

// ------------------------------------------------------------------------------------------------ placeholders
function placeholder(id) {
  const theme = RHYTHM[id];
  const label = id === 'hero'
    ? `<h1 class="ph__title">${TITLES[id]} <span>(placeholder)</span></h1>`
    : `<p class="ph__title">${TITLES[id]} <span>(placeholder)</span></p>`;
  return `<section id="${id}" class="sec" data-theme="${theme}" data-placeholder aria-label="${TITLES[id]} (placeholder)">
  <div class="container ph">
    <p class="ph__tag"><span class="placeholder">Placeholder</span> <code>#${id}</code> &middot; ${theme}</p>
    ${label}
    <p class="ph__note">This scene has no section.html yet. The foundation shows this block so the nav, the scene rail, theme-follow and the seams can be tested.</p>
  </div>
</section>`;
}

// ------------------------------------------------------------------------------------------------ seams
// A scene that mentions the --p custom property (in its CSS or JS) gets data-p, and only those scenes get --p written on every
// scroll frame: --p inherits, so each write restyles the scene's whole subtree. Scenes that only use the progress() callback pay nothing.
const USES_P = /(?<![\w-])--p(?![\w-])/;
function annotateSeams(html, pIds = new Set()) {
  // blocks = depth-0 <section class="sec"> + <footer id="footer"> in document order
  const { sections } = scanTopSections(html);
  const blocks = sections
    .filter((s) => (getAttr(s.open, 'class') || '').split(/\s+/).includes('sec'))
    .map((s) => ({ start: s.start, end: s.openEnd, open: s.open, theme: getAttr(s.open, 'data-theme') || 'mist' }));
  const fm = /<footer\b[^>]*\bid\s*=\s*["']footer["'][^>]*>/i.exec(html);
  if (fm) blocks.push({ start: fm.index, end: fm.index + fm[0].length, open: fm[0], theme: getAttr(fm[0], 'data-theme') || FOOTER_THEME });
  blocks.sort((a, b) => a.start - b.start);
  let out = '', pos = 0;
  blocks.forEach((b, i) => {
    const prev = blocks[i - 1], next = blocks[i + 1];
    let open = b.open.replace(/\sdata-(prev|next)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g, '');
    const add = [];
    if (prev && prev.theme !== b.theme) add.push(`data-prev="${prev.theme}"`);
    if (next && next.theme !== b.theme) add.push(`data-next="${next.theme}"`);
    if (pIds.has(getAttr(open, 'id')) && !/\sdata-p(?=[\s=>/])/.test(open)) add.push('data-p');
    if (add.length) open = open.replace(/\s*\/?>$/, (end) => ` ${add.join(' ')}${end.trim() === '/>' ? ' />' : '>'}`);
    out += html.slice(pos, b.start) + open;
    pos = b.end;
  });
  return out + html.slice(pos);
}

// ------------------------------------------------------------------------------------------------ validation of the final parts
function validateParts() {
  for (const p of parts) {
    const t = p.text;
    let m;
    // 1. external URLs
    const re = /https?:\/\/[^\s"'<>)\\`]+/gi;
    while ((m = re.exec(t))) {
      let u; try { u = new URL(m[0]); } catch { u = null; }
      const host = u ? u.host : '?';
      const okCdn = ALLOWED_HOSTS.includes(host);
      const okNs = host === 'www.w3.org' && W3C_NS.test(m[0].replace(/[.,;]+$/, ''));
      if (!okCdn && !okNs) err(p.file, lineOf(t, m.index), `forbidden external URL "${m[0].slice(0, 90)}"`);
      else if (okCdn && p.kind !== 'js') err(p.file, lineOf(t, m.index), `CDN URLs are only allowed in JavaScript (Three.js): "${m[0].slice(0, 90)}"`);
    }
    // protocol-relative URLs in attributes / url() / import
    const re2 = /(?:\b(?:src|href|action|poster|srcset|data|content)\s*=\s*["']?\s*|url\(\s*["']?\s*|import\s*\(?\s*["'])\/\/[a-z0-9.-]+/gi;
    while ((m = re2.exec(t))) err(p.file, lineOf(t, m.index), `protocol-relative URL "${m[0].slice(-40)}"`);
    if (p.kind === 'js' && p.name !== 'core.js') {
      const noJsCom = t.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
      const rn = /\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|new\s+Worker\s*\(|import\s*\()/g;
      while ((m = rn.exec(noJsCom))) err(p.file, lineOf(noJsCom, m.index), `network or dynamic-load API "${m[0].trim()}" is not allowed in section code`);
    }
    if (p.kind === 'css') {
      const noCom = t.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
      const ri = /@import\b/gi;
      while ((m = ri.exec(noCom))) err(p.file, lineOf(noCom, m.index), '@import is not allowed');
      const rim = /image-set\(\s*["']/gi;
      while ((m = rim.exec(noCom))) err(p.file, lineOf(noCom, m.index), 'image-set() with a file reference is not allowed');
      const ru = /url\(\s*(["']?)([^"')]*)\1\s*\)/gi; // local file references
      while ((m = ru.exec(noCom))) {
        const v = m[2].trim();
        if (v && !/^(data:|#|blob:)/i.test(v)) err(p.file, lineOf(noCom, m.index), `url(${v.slice(0, 50)}) references a file (everything must be inline: data: URIs only)`);
      }
    }
    if (p.kind === 'html') {
      const noCom = t.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
      const rl = /<link\b[^>]*>/gi;
      while ((m = rl.exec(noCom))) {
        if (/\brel\s*=\s*["']?[^"'>]*stylesheet/i.test(m[0])) err(p.file, lineOf(noCom, m.index), '<link rel="stylesheet"> is not allowed (inline the CSS)');
        else if (/\brel\s*=\s*["']?(?:[^"'>]*\s)?(preload|prefetch|modulepreload|preconnect|dns-prefetch)/i.test(m[0])) err(p.file, lineOf(noCom, m.index), `<link rel=${/preload|prefetch|modulepreload|preconnect|dns-prefetch/i.exec(m[0])[0]}> is not allowed`);
      }
      const rs = /<script\b[^>]*\bsrc\s*=/gi;
      while ((m = rs.exec(noCom))) err(p.file, lineOf(noCom, m.index), 'external <script src> is not allowed (inline the script)');
      const rb = /<base\b|<meta\b[^>]*http-equiv/gi;
      while ((m = rb.exec(noCom))) err(p.file, lineOf(noCom, m.index), `${m[0]} is not allowed`);
      const rsu = /\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi;
      while ((m = rsu.exec(noCom))) { const u = /url\(\s*["']?\s*(?!data:|#|blob:)[^"')\s]/i.exec(m[0]); if (u) err(p.file, lineOf(noCom, m.index), 'style attribute references a file with url()'); }
      const rf = /<(?:iframe|object|embed|frame)\b/gi;
      while ((m = rf.exec(noCom))) err(p.file, lineOf(noCom, m.index), `<${m[0].slice(1)}> is not allowed`);
      const rsrc = /<(?:img|source|video|audio|track|image|use|input|link)\b[^>]*?\s(?:src|srcset|poster|href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
      while ((m = rsrc.exec(noCom))) {
        const v = (m[1] ?? m[2] ?? '').trim();
        if (v && !/^(data:|#|blob:)/i.test(v)) err(p.file, lineOf(noCom, m.index), `resource reference "${v.slice(0, 50)}" (everything must be inline: data: URIs only)`);
      }
      const ra = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
      while ((m = ra.exec(noCom))) {
        const v = (m[1] ?? m[2] ?? '').trim();
        if (v && !/^(#|mailto:|tel:|https?:)/i.test(v)) warn(p.file, lineOf(noCom, m.index), `link target "${v.slice(0, 40)}" will not exist in the single-file page`);
      }
      const rh = /\son[a-z]+\s*=\s*(?:"|')/gi; // inline event handlers, only inside tags
      const tagRe = /<[a-zA-Z][^>]*>/g;
      let tm;
      while ((tm = tagRe.exec(noCom))) { rh.lastIndex = 0; const hm = rh.exec(tm[0]); if (hm) err(p.file, lineOf(noCom, tm.index), `inline event handler attribute "${hm[0].trim().slice(0, 12)}" is not allowed`); }
      const rj = /\s(?:href|src|action)\s*=\s*["']\s*javascript:/gi;
      while ((m = rj.exec(noCom))) err(p.file, lineOf(noCom, m.index), 'javascript: URLs are not allowed');
    }
  }
}

function dupIds(html) {
  const seen = new Map();
  const noCom = html.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
  let m; const re = /<[a-zA-Z][^>]*?\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
  while ((m = re.exec(noCom))) { const id = m[1] ?? m[2]; if (seen.has(id)) warn(null, lineOf(noCom, m.index), `duplicate id "${id}" (first at line ${seen.get(id)})`); else seen.set(id, lineOf(noCom, m.index)); }
}

// ------------------------------------------------------------------------------------------------ main
const templateFile = path.join(SRC, 'template.html');
const templateRaw = readText(templateFile);
const template = templateRaw === null ? null : expandIncludes(templateRaw, templateFile);
const fontsCss = readText(path.join(SRC, 'fonts.css'));
const baseCss = readText(path.join(SRC, 'base.css'));
const coreJs = readText(path.join(SRC, 'core.js'));
if (template === null || fontsCss === null || baseCss === null || coreJs === null) fail();

const sharedDir = path.join(SRC, 'sections', 'shared');
const sharedFiles = fs.existsSync(sharedDir) ? fs.readdirSync(sharedDir).filter((f) => f.endsWith('.js')).sort() : [];
const sharedJs = sharedFiles.map((f) => ({ file: path.join(sharedDir, f), text: readText(path.join(sharedDir, f)) })).filter((s) => s.text !== null);
sharedJs.forEach((s) => lintJs('shared', s.file, s.text, { isSection: false }));

const only = opts.only ? new Set(opts.only) : null;
const loaded = {};
for (const id of ORDER) {
  if (only && !only.has(id)) continue;
  const s = loadSection(id);
  if (s) loaded[id] = s;
}

let inject = null;
if (opts.inject) {
  const f = path.resolve(opts.inject);
  const html = readText(f);
  const base = f.replace(/\.html?$/i, '');
  inject = { file: f, html: html === null ? '' : expandIncludes(html, f), css: readText(base + '.css', false), js: readText(base + '.js', false), cssFile: base + '.css', jsFile: base + '.js' };
}

// ---- compose html
let doc = template;
for (const slot of ['STYLES', 'INJECT', 'SCRIPTS']) if (!doc.includes(`<!--@${slot}-->`)) err(templateFile, 0, `template.html is missing the <!--@${slot}--> slot`);
for (const id of ORDER) if (!doc.includes(`<!--@SECTION:${id}-->`)) err(templateFile, 0, `template.html is missing the <!--@SECTION:${id}--> slot`);
if (errors.length) fail();

const kinds = {};
for (const id of ORDER) {
  const s = loaded[id];
  kinds[id] = s ? 'section' : 'placeholder';
  const html = s ? s.html.trim() : placeholder(id);
  doc = doc.replace(`<!--@SECTION:${id}-->`, () => (s ? `<!-- ===== section: ${id} ===== -->\n` : `<!-- ===== placeholder: ${id} ===== -->\n`) + html);
}
doc = doc.replace('<!--@INJECT-->', () => (inject ? `<!-- ===== injected: ${path.basename(inject.file)} ===== -->\n${inject.html.trim()}\n` : ''));
const pIds = new Set(ORDER.filter((id) => loaded[id] && (USES_P.test(loaded[id].css || '') || USES_P.test(loaded[id].js || ''))));
doc = annotateSeams(doc, pIds);

// ---- css
const cssChunks = [];
const jsChunks = [];
cssChunks.push({ name: 'fonts.css', file: path.join(SRC, 'fonts.css'), text: fontsCss, kind: 'fonts' });
cssChunks.push({ name: 'base.css', file: path.join(SRC, 'base.css'), text: baseCss, kind: 'base' });
for (const id of ORDER) if (loaded[id] && loaded[id].css !== null && loaded[id].css.trim()) cssChunks.push({ name: `sections/${id}/section.css`, file: loaded[id].cssFile, text: loaded[id].css, kind: 'section' });
if (inject && inject.css) cssChunks.push({ name: path.basename(inject.cssFile), file: inject.cssFile, text: inject.css, kind: 'inject' });
jsChunks.push({ name: 'core.js', file: path.join(SRC, 'core.js'), text: coreJs, kind: 'core' });
sharedJs.forEach((s) => jsChunks.push({ name: `sections/shared/${path.basename(s.file)}`, file: s.file, text: s.text, kind: 'shared' }));
for (const id of ORDER) if (loaded[id] && loaded[id].js !== null && loaded[id].js.trim()) jsChunks.push({ name: `sections/${id}/section.js`, file: loaded[id].jsFile, text: loaded[id].js, kind: 'section' });
if (inject && inject.js) jsChunks.push({ name: path.basename(inject.jsFile), file: inject.jsFile, text: inject.js, kind: 'inject' });

const styleTag = `<style>${cssChunks.map((c) => banner('css', c.name) + c.text.trim() + '\n').join('')}</style>`;
const scriptTags = jsChunks.map((c) => `<script>${banner('js', c.name)}${c.text.trim()}\n</script>`).join('\n');
doc = doc.replace('<!--@STYLES-->', () => styleTag);
doc = doc.replace('<!--@SCRIPTS-->', () => scriptTags);

// ---- validate what actually ships (per source file, for useful line numbers)
parts.push({ name: 'template.html', file: templateFile, kind: 'html', text: template.replace(/<!--@[A-Za-z:]+-->/g, '') });
for (const id of ORDER) if (loaded[id]) parts.push({ name: `${id}/section.html`, file: loaded[id].htmlFile, kind: 'html', text: loaded[id].html });
if (inject) parts.push({ name: 'inject.html', file: inject.file, kind: 'html', text: inject.html });
cssChunks.forEach((c) => parts.push({ name: c.name, file: c.file, kind: 'css', text: c.text }));
jsChunks.forEach((c) => parts.push({ name: c.name, file: c.file, kind: 'js', text: c.text }));
validateParts();
dupIds(doc.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, ''));

if (errors.length) fail();

// ---- write
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, doc);

// ---- report
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const total = bytes(doc);
const cssBytes = cssChunks.filter((c) => c.kind !== 'fonts').reduce((a, c) => a + bytes(c.text), 0);
const fontBytes = bytes(fontsCss);
const jsBytes = jsChunks.reduce((a, c) => a + bytes(c.text), 0);
const htmlBytes = total - cssBytes - fontBytes - jsBytes;
if (!opts.quiet) {
  console.log(`Alkyone build -> ${rel(OUT)}`);
  console.log(`  scenes: ${ORDER.map((id) => `${id}${kinds[id] === 'placeholder' ? '*' : ''}`).join('  ')}${inject ? `  | injected ${path.basename(inject.file)}` : ''}   (* = placeholder)`);
  console.log(`  html  ${kb(htmlBytes)}\n  css   ${kb(cssBytes)}\n  fonts ${kb(fontBytes)}\n  js    ${kb(jsBytes)}\n  total ${kb(total)}`);
  for (const id of ORDER) if (loaded[id]) console.log(`    ${id.padEnd(7)} html ${kb(bytes(loaded[id].html)).trim()}  css ${kb(bytes(loaded[id].css || '')).trim()}  js ${kb(bytes(loaded[id].js || '')).trim()}`);
}
if (total > SIZE_WARN) warn(null, 0, `total size ${kb(total).trim()} exceeds the ${kb(SIZE_WARN).trim()} budget`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w.file}${w.line ? ':' + w.line : ''} ${w.msg}`);
}

function fail() {
  console.error(`\nbuild FAILED - ${errors.length} problem(s), nothing written:`);
  for (const e of errors) console.error(`  x ${e.file}${e.line ? ':' + e.line : ''} ${e.msg}`);
  if (warnings.length) { console.error(`\n${warnings.length} warning(s):`); for (const w of warnings) console.error(`  ! ${w.file}${w.line ? ':' + w.line : ''} ${w.msg}`); }
  process.exit(1);
}
