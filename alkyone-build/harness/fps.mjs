// fps.mjs - frame pacing + main-thread cost while scrolling the whole page under CPU throttling
// node fps.mjs <file|url> [--preset phone] [--cpu 4] [--speed 900] [--reduced-motion]
// NOTE: WebGL here is software-rendered (SwiftShader), so GPU-bound frames are pessimistic. Trust the
// main-thread numbers (ScriptDuration/LayoutDuration/RecalcStyle) and long tasks more than raw FPS.
import { launch, open, webglInfo } from './lib.mjs';
const argv = process.argv.slice(2);
const target = argv[0];
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 || argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? d : argv[i + 1]; };
const cpu = Number(opt('cpu', 4));
const env = await launch({ preset: opt('preset', 'phone'), cpu, reducedMotion: flag('reduced-motion') });
const { page, context } = env;
try {
  await open(page, target, { settle: 2500 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const speed = Number(opt('speed', 900));
  const res = await page.evaluate(async (speed) => {
    const frames = []; let long = 0, longMax = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { long++; longMax = Math.max(longMax, e.duration); } }).observe({ entryTypes: ['longtask'] }); } catch {}
    let cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
    const max = document.documentElement.scrollHeight - innerHeight;
    await new Promise((res) => { let y = 0, last = performance.now(); const step = (t) => { const dt = (t - last) / 1000; last = t; frames.push(t); y += speed * dt; window.scrollTo({ top: y, behavior: 'instant' }); if (y < max) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
    const d = []; for (let i = 1; i < frames.length; i++) d.push(frames[i] - frames[i - 1]);
    d.sort((a, b) => a - b);
    const sum = d.reduce((a, b) => a + b, 0);
    return { frames: frames.length, pageHeight: document.documentElement.scrollHeight, avgFrameMs: +(sum / d.length).toFixed(1), p50: +d[Math.floor(d.length * 0.5)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), worst: +d[d.length - 1].toFixed(1), framesOver50ms: d.filter((x) => x > 50).length, longTasks: long, longestTaskMs: Math.round(longMax), cls: +cls.toFixed(4) };
  }, speed);
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const delta = (k) => +(((m1[k] || 0) - (m0[k] || 0)) * 1000).toFixed(0);
  console.log(JSON.stringify({ cpuThrottle: cpu, webgl: await webglInfo(page), scroll: res, mainThreadMsDuringScroll: { script: delta('ScriptDuration'), layout: delta('LayoutDuration'), recalcStyle: delta('RecalcStyleDuration'), task: delta('TaskDuration') }, layoutCount: (m1.LayoutCount || 0) - (m0.LayoutCount || 0), jsHeapMB: +((m1.JSHeapUsedSize || 0) / 1048576).toFixed(1), domNodes: m1.Nodes }, null, 1));
} finally { await env.close(); }
