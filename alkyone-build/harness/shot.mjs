// shot.mjs - screenshot + report CLI
// node shot.mjs <file|url> --out <dir> [--preset phone|small|se|tiny|pixel|landscape|tablet|desktop|wide]
//    [--at 0,0.25,#patch,.hero]   scroll stops: 0..1 fraction of page, or a CSS selector (scrolled to top of viewport)
//    [--full] [--reduced-motion] [--block-three] [--block-all] [--offline] [--cpu 4] [--wait 1500] [--label name] [--dpr 2] [--dark]
import { launch, open, shot, report, summarizeLog, scrollToFrac, scrollToSel, webglInfo } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const target = argv[0];
if (!target || target.startsWith('--')) { console.error('usage: node shot.mjs <file|url> --out <dir> [--preset phone] [--at 0,0.5,#ring]'); process.exit(2); }
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 || argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? d : argv[i + 1]; };

const preset = opt('preset', 'phone');
const out = path.resolve(opt('out', './shots'));
const label = opt('label', 'page');
const at = String(opt('at', '0')).split(',').map((s) => s.trim()).filter(Boolean);
const cpu = Number(opt('cpu', 1));
const wait = Number(opt('wait', 1500));

const env = await launch({
  preset, cpu, reducedMotion: flag('reduced-motion'), blockThree: flag('block-three'), blockAll: flag('block-all'),
  offline: flag('offline'), colorScheme: flag('dark') ? 'dark' : 'light', dpr: opt('dpr', undefined) ? Number(opt('dpr')) : undefined,
});
const { page, log } = env;
const files = [];
try {
  await open(page, target, { settle: wait });
  let i = 0;
  for (const stop of at) {
    i++;
    const slug = stop.replace(/[^a-z0-9.]+/gi, '_').replace(/^_+|_+$/g, '') || 'top';
    if (/^[0-9.]+$/.test(stop)) await scrollToFrac(page, Number(stop), 700);
    else await scrollToSel(page, stop, 'start', 900);
    files.push(await shot(page, path.join(out, `${label}-${preset}-${String(i).padStart(2, '0')}-${slug}.png`), { fullPage: false }));
  }
  if (flag('full')) files.push(await shot(page, path.join(out, `${label}-${preset}-full.png`), { fullPage: true }));
  const rep = await report(page);
  const sum = summarizeLog(log);
  const gl = await webglInfo(page);
  const all = { preset: env.preset.label, flags: argv.filter((a) => a.startsWith('--')), webgl: gl, ...rep, log: sum };
  fs.mkdirSync(out, { recursive: true });
  const rf = path.join(out, `${label}-${preset}-report.json`);
  fs.writeFileSync(rf, JSON.stringify(all, null, 2));
  console.log('SCREENSHOTS:\n' + files.join('\n'));
  console.log('REPORT: ' + rf);
  console.log(`SUMMARY: consoleErrors=${sum.consoleErrors.length} warnings=${sum.consoleWarnings.length} pageerrors=${sum.pageerrors.length} requestfailed=${sum.requestfailed.length} bad=${sum.badresponses.length} hScroll=${rep.hasHScroll} offenders=${rep.overflowOffenders.length} smallTargets=${rep.smallTapTargets.length} noName=${rep.controlsWithoutAccessibleName.length} dupIds=${rep.duplicateIds.length} honestyHits=${rep.honestyLintHits.length} webgl=${gl ? gl.renderer : 'NONE'} hosts=${Object.keys(sum.hosts).join('|') || '-'}`);
  if (sum.consoleErrors.length) console.log('CONSOLE ERRORS:\n' + JSON.stringify(sum.consoleErrors, null, 1));
  if (sum.pageerrors.length) console.log('PAGE ERRORS:\n' + sum.pageerrors.join('\n---\n'));
} finally { await env.close(); }
