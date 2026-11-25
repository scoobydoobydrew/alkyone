// lib.mjs - shared Playwright helpers for the Alkyone build (Chrome/Edge via playwright-core, headless)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

export const PRESETS = {
  phone:     { w: 390,  h: 844,  dpr: 3,     mobile: true,  label: 'iPhone-class 390x844' },
  small:     { w: 360,  h: 640,  dpr: 2,     mobile: true,  label: 'small Android 360x640' },
  se:        { w: 375,  h: 667,  dpr: 2,     mobile: true,  label: 'iPhone SE 375x667' },
  tiny:      { w: 320,  h: 568,  dpr: 2,     mobile: true,  label: 'very small 320x568' },
  pixel:     { w: 412,  h: 915,  dpr: 2.625, mobile: true,  label: 'Pixel-class 412x915' },
  landscape: { w: 844,  h: 390,  dpr: 3,     mobile: true,  label: 'phone landscape 844x390' },
  tablet:    { w: 820,  h: 1180, dpr: 2,     mobile: true,  label: 'tablet 820x1180' },
  desktop:   { w: 1440, h: 900,  dpr: 1,     mobile: false, label: 'desktop 1440x900' },
  wide:      { w: 1920, h: 1080, dpr: 1,     mobile: false, label: 'wide 1920x1080' },
};

// Words/patterns the honesty rules make suspicious. Matches are NOT automatically wrong
// (e.g. the footer disclaimer may legitimately say "does not diagnose"), they must be reviewed.
export const BANNED = [
  /clinical(ly)?/i, /\bproven\b/i, /accura/i, /certif/i, /\bFDA\b/, /\bCE[ -]?mark/i, /validated?/i,
  /trusted/i, /award/i, /patent/i, /partner/i, /hospital/i, /saves? (a )?li(fe|ves)/i, /peace of mind/i,
  /never miss/i, /guarantee/i, /\bsaf(e|er|ely|ety)\b/i, /prevent/i, /\bSIDS\b/, /diagnos/i, /apn(o)?ea/i,
  /breath/i, /breathing/i, /\b\d+(\.\d+)?\s?%/, /\b(hours?|days?|weeks?)\s+(of\s+)?battery/i, /real[- ]time/i,
  /instant(ly)?/i, /within (a )?(second|seconds|minute|minutes)/i, /testimonial/i, /\bstudy\b|\bstudies\b/i,
  /doctor[- ]recommended|pediatrician[- ]recommended/i, /medical[- ]grade/i, /lifesaving|life-saving/i,
];

export function resolveUrl(input) {
  if (/^(https?|file|data|about):/i.test(input)) return input;
  return pathToFileURL(path.resolve(input)).href;
}

export async function launch(opts = {}) {
  const {
    preset = 'phone', reducedMotion = false, blockThree = false, blockAll = false, offline = false,
    cpu = 1, colorScheme = 'light', headed = false, dpr, width, height, touch,
  } = opts;
  const p = PRESETS[preset] ?? PRESETS.phone;
  const exe = fs.existsSync(CHROME) ? CHROME : EDGE;
  const browser = await chromium.launch({
    executablePath: exe,
    headless: !headed,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling', '--hide-scrollbars'],
  });
  const context = await browser.newContext({
    viewport: { width: width ?? p.w, height: height ?? p.h },
    deviceScaleFactor: dpr ?? p.dpr,
    isMobile: p.mobile,
    hasTouch: touch ?? p.mobile,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    colorScheme,
    offline,
    ...(p.mobile ? { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36' } : {}),
  });
  if (blockThree) {
    await context.route(/(three(\.module)?(\.min)?\.js|\/npm\/three@|\/three\.js\/)/i, (route) => route.abort('blockedbyclient'));
  }
  if (blockAll) {
    // allow file:// only (simulates fully offline visitor)
    await context.route(/^https?:/i, (route) => route.abort('blockedbyclient'));
  }
  const page = await context.newPage();
  const log = { console: [], pageerrors: [], requestfailed: [], badresponses: [], hosts: {} };
  page.on('console', (m) => {
    const loc = m.location();
    log.console.push({ type: m.type(), text: m.text().slice(0, 400), at: loc && loc.url ? `${path.basename(loc.url)}:${loc.lineNumber}` : '' });
  });
  page.on('pageerror', (e) => log.pageerrors.push(String((e && e.stack) || e).slice(0, 800)));
  page.on('requestfailed', (r) => log.requestfailed.push({ url: r.url().slice(0, 200), err: r.failure() && r.failure().errorText }));
  page.on('response', (r) => { if (r.status() >= 400) log.badresponses.push({ url: r.url().slice(0, 200), status: r.status() }); });
  page.on('request', (r) => { try { const u = new URL(r.url()); if (u.protocol.startsWith('http')) log.hosts[u.host] = (log.hosts[u.host] || 0) + 1; } catch {} });
  if (cpu > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  return { browser, context, page, log, preset: p, close: async () => { await browser.close(); } };
}

export async function open(page, target, { settle = 1200, waitUntil = 'load' } = {}) {
  await page.goto(resolveUrl(target), { waitUntil });
  await page.evaluate(() => (document.fonts && document.fonts.ready) || null).catch(() => {});
  await page.waitForTimeout(settle);
}

export async function scrollToY(page, y, settle = 450) {
  await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
  await page.waitForTimeout(settle);
}
export async function scrollToFrac(page, f, settle = 450) {
  await page.evaluate((ff) => { const m = document.documentElement.scrollHeight - innerHeight; window.scrollTo({ top: Math.max(0, m * ff), behavior: 'instant' }); }, f);
  await page.waitForTimeout(settle);
}
// align: 'start' | 'center' | 'end'
export async function scrollToSel(page, sel, align = 'start', settle = 600) {
  const ok = await page.evaluate(({ sel, align }) => { const el = document.querySelector(sel); if (!el) return false; el.scrollIntoView({ block: align, behavior: 'instant' }); return true; }, { sel, align });
  await page.waitForTimeout(settle);
  return ok;
}

export async function shot(page, file, { fullPage = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage, caret: 'hide' });
  return file;
}

// Real touch gestures through CDP
export async function swipe(page, x1, y1, x2, y2, steps = 14, delay = 14) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps }] });
    await page.waitForTimeout(delay);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
}
export async function pinch(page, cx, cy, d1, d2, steps = 12, delay = 14) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (d) => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d1) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d1 + ((d2 - d1) * i) / steps) });
    await page.waitForTimeout(delay);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
}
export async function webglInfo(page) {
  return page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2') || c.getContext('webgl');
      if (!g) return null;
      const ext = g.getExtension('WEBGL_debug_renderer_info');
      return { version: g.getParameter(g.VERSION), renderer: ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a' };
    } catch (e) { return { error: String(e) }; }
  });
}

// Structural/a11y/honesty report computed inside the page.
export async function report(page) {
  const banned = BANNED.map((r) => ({ s: r.source, f: r.flags }));
  return page.evaluate((banned) => {
    const out = {};
    const root = document.documentElement;
    const vw = root.clientWidth;
    out.viewport = { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, scrollW: root.scrollWidth, scrollH: root.scrollHeight };
    out.title = document.title; out.lang = root.lang;
    out.hasHScroll = root.scrollWidth > vw + 1;
    const clippedByScroller = (el) => {
      let p = el.parentElement;
      while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; p = p.parentElement; }
      return false;
    };
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el); if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (r.right > vw + 1 || r.left < -1) { if (!clippedByScroller(el)) offenders.push({ el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), left: Math.round(r.left), right: Math.round(r.right) }); }
      if (offenders.length > 25) break;
    }
    out.overflowOffenders = offenders;
    const accName = (el) => ((el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((i) => (document.getElementById(i) || {}).textContent || '').join(' ') || el.textContent || el.getAttribute('title') || el.getAttribute('alt') || el.value || '') + '').trim();
    const sel = 'a[href],button,[role=button],[role=tab],[role=switch],[role=slider],input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    const small = [], noName = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (!accName(el)) noName.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''));
      if (r.width < 2 || r.height < 2) continue; // visually-hidden helpers
      const inline = cs.display === 'inline';
      const min = Math.min(r.width, r.height);
      if (min < (inline ? 20 : 44)) small.push({ el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''), text: accName(el).slice(0, 28), w: Math.round(r.width), h: Math.round(r.height), inline });
    }
    out.smallTapTargets = small.slice(0, 40);
    out.controlsWithoutAccessibleName = noName.slice(0, 30);
    const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
    out.duplicateIds = Object.entries(ids).filter(([, n]) => n > 1).map(([k]) => k);
    out.headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => h.tagName + ': ' + h.textContent.trim().replace(/\s+/g, ' ').slice(0, 60));
    out.landmarks = { main: document.querySelectorAll('main').length, nav: document.querySelectorAll('nav,[role=navigation]').length, header: document.querySelectorAll('header').length, footer: document.querySelectorAll('footer').length };
    out.imgsWithoutAlt = [...document.querySelectorAll('img:not([alt])')].length;
    out.positiveTabindex = [...document.querySelectorAll('[tabindex]')].filter((e) => parseInt(e.getAttribute('tabindex'), 10) > 0).length;
    out.fonts = document.fonts ? [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.style} ${f.status}`) : [];
    out.canvases = [...document.querySelectorAll('canvas')].map((c) => ({ id: c.id, w: c.width, h: c.height, cssW: Math.round(c.getBoundingClientRect().width), cssH: Math.round(c.getBoundingClientRect().height) }));
    out.domNodes = document.getElementsByTagName('*').length;
    out.htmlBytes = new Blob([root.outerHTML]).size;
    const text = (document.body.innerText || '');
    out.textLength = text.length;
    const hits = [];
    for (const b of banned) { const re = new RegExp(b.s, b.f.includes('g') ? b.f : b.f + 'g'); let m; while ((m = re.exec(text)) && hits.length < 80) { hits.push({ rule: b.s, match: m[0], context: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ') }); if (m[0].length === 0) re.lastIndex++; } }
    out.honestyLintHits = hits;
    return out;
  }, banned);
}

export function summarizeLog(log) {
  const errs = log.console.filter((c) => c.type === 'error');
  const warns = log.console.filter((c) => c.type === 'warning');
  return {
    consoleErrors: errs, consoleWarnings: warns,
    otherConsole: log.console.filter((c) => !['error', 'warning'].includes(c.type)).slice(0, 15),
    pageerrors: log.pageerrors, requestfailed: log.requestfailed, badresponses: log.badresponses, hosts: log.hosts,
  };
}
