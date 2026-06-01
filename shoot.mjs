import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', {recursive:true});
const URL='http://127.0.0.1:8123/';
const errors=[], logs=[];

const browser=await chromium.launch({
  headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'],
});
const page=await browser.newPage({viewport:{width:1500,height:920,deviceScaleFactor:1}});
page.on('console', m=>logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e=>errors.push('PAGEERROR: '+e.message));

await page.goto(URL, {waitUntil:'load', timeout:30000});
const gl=await page.evaluate(()=>{const c=document.createElement('canvas');const g=c.getContext('webgl2')||c.getContext('webgl');return g?(g.getParameter(g.VERSION)):'NO WEBGL';});
console.log('WEBGL:', gl);
await page.waitForTimeout(4200);

const setDepth=async(d)=>{ await page.evaluate(d=>{const s=document.querySelector('#depth-slider'); s.value=d; s.dispatchEvent(new Event('input',{bubbles:true}));}, d); };
const click=async(sel)=>{ await page.click(sel); };
const setChk=async(sel,on)=>{ await page.evaluate(([sel,on])=>{const c=document.querySelector(sel); if(c.checked!==on){c.checked=on; c.dispatchEvent(new Event('change',{bubbles:true}));}}, [sel,on]); };

// intro overlay
await page.screenshot({path:'shots/00-guide.png'});
await click('#guide-explore');
await setChk('#t-spin', false);
await page.waitForTimeout(700);

await page.screenshot({path:'shots/01-surface.png'});
await setDepth(2891); await page.waitForTimeout(1400); await page.screenshot({path:'shots/02-cmb.png'});
console.log('CMB readout:', await page.evaluate(()=>({layer:document.querySelector('#depth-layer').textContent, vs:document.querySelector('#ro-vs').textContent, rho:document.querySelector('#ro-rho').textContent, p:document.querySelector('#ro-p').textContent})));
await setDepth(5800); await page.waitForTimeout(1400); await page.screenshot({path:'shots/03-innercore.png'});
await setDepth(660);  await page.waitForTimeout(1400); await page.screenshot({path:'shots/04-660.png'});

await click('#colormode button[data-mode="feature"]');
await setDepth(2700); await page.waitForTimeout(1400); await page.screenshot({path:'shots/05-feature.png'});
await click('#colormode button[data-mode="dvs"]');

await setChk('#t-theory', false); await page.waitForTimeout(700); await page.screenshot({path:'shots/06-scan-only.png'});
await setChk('#t-theory', true); await setChk('#t-scan', false); await page.waitForTimeout(700); await page.screenshot({path:'shots/07-model-only.png'});
await setChk('#t-scan', true);

// tour
await setDepth(2700); await page.waitForTimeout(600);
await click('#tour-btn'); await page.waitForTimeout(2600); await page.screenshot({path:'shots/08-tour.png'});
console.log('tour caption:', await page.evaluate(()=>document.querySelector('#tour-title')?.textContent));
await click('#tour-stop');

console.log('--- PAGE ERRORS ---'); console.log(errors.length?errors.join('\n'):'(none)');
console.log('--- CONSOLE errors/warnings ---');
console.log(logs.filter(l=>/error|warn|fail|exception/i.test(l)).slice(0,30).join('\n')||'(none)');
await browser.close();
console.log('DONE');
