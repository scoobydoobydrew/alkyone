// axe.mjs - run axe-core (from cdnjs) against a page and print violations
// node axe.mjs <file|url> [--preset phone] [--reduced-motion] [--scroll-all]
import { launch, open, scrollToFrac } from './lib.mjs';
const argv = process.argv.slice(2);
const target = argv[0];
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 || argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? d : argv[i + 1]; };
const env = await launch({ preset: opt('preset', 'phone'), reducedMotion: flag('reduced-motion') });
const { page } = env;
try {
  await open(page, target, { settle: 1500 });
  if (flag('scroll-all')) { for (const f of [0.2, 0.4, 0.6, 0.8, 1, 0]) await scrollToFrac(page, f, 300); await page.waitForTimeout(Number(process.env.AXE_SETTLE || 0)); }
  await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js' });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations', 'incomplete'] });
    const slim = (v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 6).map((n) => ({ target: n.target.join(' '), html: (n.html || '').slice(0, 160), why: (n.any[0] || n.all[0] || n.none[0] || {}).message })) , count: v.nodes.length });
    return { violations: r.violations.map(slim), incomplete: r.incomplete.map(slim) };
  });
  console.log(JSON.stringify(res, null, 1));
  console.log(`AXE SUMMARY: violations=${res.violations.length} (critical/serious=${res.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).length}) incomplete=${res.incomplete.length}`);
} finally { await env.close(); }
