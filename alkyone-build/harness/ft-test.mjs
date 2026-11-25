import { launch, open, shot, scrollToSel } from './lib.mjs';
const out='C:/Users/Master/AppData/Local/Temp/claude/429a84bea591d46a/b48aeb0d-536f-4789-9554-0e0ca3e4d48c/scratchpad/shots/future-team/';
const file='C:/Users/Master/AppData/Local/Temp/claude/429a84bea591d46a/b48aeb0d-536f-4789-9554-0e0ca3e4d48c/scratchpad/build/dev/future-team.html';
for (const [preset,rm] of [['phone',false],['desktop',false],['small',true],['pixel',false],['tablet',false],['desktop',true]]) {
  const env = await launch({preset, reducedMotion: rm}); const {page,log}=env;
  await open(page,file,{settle:1200});
  await scrollToSel(page,'#future','start',900);
  const btns = await page.$$('.future-btn');
  // click each (mouse/tap), check state
  for (let i=0;i<btns.length;i++){
    await btns[i].scrollIntoViewIfNeeded(); 
    if (preset==='phone') await btns[i].tap(); else await btns[i].click();
    await page.waitForTimeout(700);
    const ex = await btns[i].getAttribute('aria-expanded');
    const vis = await page.$eval('#'+await btns[i].getAttribute('aria-controls'), e=>getComputedStyle(e).visibility);
    if (ex!=='true'||vis!=='visible') console.log('FAIL open',preset,i,ex,vis);
  }
  await page.waitForTimeout(500);
  await scrollToSel(page,'#future','start',900);
  await shot(page,`${out}open-${preset}${rm?'-rm':''}.png`,{fullPage:false});
  await page.evaluate(()=>document.querySelector('#future').scrollIntoView());
  await shot(page,`${out}open-full-${preset}${rm?'-rm':''}.png`,{fullPage:true});
  // keyboard
  await page.focus('.future-btn');
  for (let i=0;i<btns.length;i++){ await page.keyboard.press('Enter'); }
  await page.waitForTimeout(600);
  const st = await page.$$eval('.future-btn',b=>b.map(x=>x.getAttribute('aria-expanded')).join());
  console.log(preset,rm,'after enter toggle:',st);
  await page.focus('.future-btn:nth-of-type(1)'); 
  await page.keyboard.press('Space'); await page.waitForTimeout(500);
  console.log('errors',log.filter?.(l=>/error/i.test(JSON.stringify(l))).length);
  await env.close();
}
