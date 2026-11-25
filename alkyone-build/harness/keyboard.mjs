// keyboard.mjs - press Tab repeatedly and report the focus order, focus-ring visibility and traps
// node keyboard.mjs <file|url> [--preset desktop] [--max 150]
import { launch, open } from './lib.mjs';
const argv = process.argv.slice(2);
const target = argv[0];
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 || argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? d : argv[i + 1]; };
const env = await launch({ preset: opt('preset', 'desktop') });
const { page } = env;
const max = Number(opt('max', 150));
try {
  await open(page, target, { settle: 1500 });
  const seen = []; const seenKeys = new Set(); let repeats = 0;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    const d = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return { body: true };
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
      return { tag: el.tagName.toLowerCase(), id: el.id, cls: typeof el.className === 'string' ? el.className.split(/\s+/)[0] : '', name, role: el.getAttribute('role') || '', ring, inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, w: Math.round(r.width), h: Math.round(r.height), vis: cs.visibility !== 'hidden' && cs.opacity !== '0' };
    });
    const key = JSON.stringify([d.tag, d.id, d.cls, d.name]);
    if (seenKeys.has(key)) { repeats++; if (repeats > 2) { seen.push({ note: 'focus cycled back to ' + key + ' after ' + i + ' tabs' }); break; } } else seenKeys.add(key);
    seen.push(d);
  }
  const noRing = seen.filter((s) => s.tag && !s.ring);
  const offscreen = seen.filter((s) => s.tag && !s.inView);
  const invisible = seen.filter((s) => s.tag && !s.vis);
  console.log(seen.map((s, i) => `${String(i + 1).padStart(3)} ${s.note || (s.body ? '(body)' : `${s.tag}${s.id ? '#' + s.id : ''}${s.cls ? '.' + s.cls : ''} [${s.name}] ${s.role} ring=${s.ring} inView=${s.inView} ${s.w}x${s.h}`)}`).join('\n'));
  console.log(`KEYBOARD SUMMARY: stops=${seen.length} withoutVisibleRing=${noRing.length} offscreenAfterFocus=${offscreen.length} invisibleFocused=${invisible.length}`);
  if (noRing.length) console.log('NO RING: ' + noRing.map((s) => `${s.tag}#${s.id}.${s.cls}[${s.name}]`).join(' | '));
  if (offscreen.length) console.log('OFFSCREEN: ' + offscreen.map((s) => `${s.tag}#${s.id}.${s.cls}[${s.name}]`).join(' | '));
  if (invisible.length) console.log('INVISIBLE: ' + invisible.map((s) => `${s.tag}#${s.id}.${s.cls}[${s.name}]`).join(' | '));
} finally { await env.close(); }
