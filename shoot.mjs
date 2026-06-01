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

const setDepth=async(d)=>{ await page.evaluate(d=>{
  const t=Math.pow(Math.max(0,Math.min(1,d/6371)),1/2.2);   // non-linear depth axis
  const s=document.querySelector('#depth-slider'); s.value=Math.round(t*1000); s.dispatchEvent(new Event('input',{bubbles:true}));
}, d); };
const click=async(sel)=>{ await page.click(sel); };
const setChk=async(sel,on)=>{ await page.evaluate(([sel,on])=>{const c=document.querySelector(sel); if(c.checked!==on){c.checked=on; c.dispatchEvent(new Event('change',{bubbles:true}));}}, [sel,on]); };

// intro overlay
await page.screenshot({path:'shots/00-guide.png'});
await click('#guide-explore');
await setChk('#t-spin', false);
await page.waitForTimeout(700);

await page.screenshot({path:'shots/01-surface.png'});
await page.click('#glossary-btn'); await page.waitForTimeout(400); await page.screenshot({path:'shots/18-glossary.png'});
console.log('glossary items:', await page.evaluate(()=>document.querySelectorAll('#glossary-body .gloss-item').length));
await page.click('#glossary-close');
await setChk('#t-foot', true); await setChk('#t-struct', false); await setDepth(660); await page.waitForTimeout(1300); await page.screenshot({path:'shots/19-footprints.png'}); await setChk('#t-struct', true); await setChk('#t-foot', false);
await setDepth(80); await page.waitForTimeout(1200); await page.screenshot({path:'shots/15-shallow.png'});
console.log('temp@80:', await page.evaluate(()=>document.querySelector('#ro-temp').textContent+' | '+document.querySelector('#temp-cap').textContent));
await setDepth(2891); await page.waitForTimeout(1400); await page.screenshot({path:'shots/02-cmb.png'});
console.log('CMB readout:', await page.evaluate(()=>({layer:document.querySelector('#depth-layer').textContent, vs:document.querySelector('#ro-vs').textContent, rho:document.querySelector('#ro-rho').textContent, p:document.querySelector('#ro-p').textContent})));
await setDepth(5800); await page.waitForTimeout(1400); await page.screenshot({path:'shots/03-innercore.png'});
await setDepth(660);  await page.waitForTimeout(1400); await page.screenshot({path:'shots/04-660.png'});

await click('#colormode button[data-mode="feature"]');
await setDepth(2700); await page.waitForTimeout(1400); await page.screenshot({path:'shots/05-feature.png'});
await click('#colormode button[data-mode="dvs"]');

await setChk('#t-theory', false); await page.waitForTimeout(700); await page.screenshot({path:'shots/06-scan-only.png'});
await setChk('#t-theory', true); await setChk('#t-scan', false); await setChk('#t-struct', false); await setChk('#t-relief', false); await page.waitForTimeout(700); await page.screenshot({path:'shots/07-model-only.png'});
await setChk('#t-scan', true); await setChk('#t-struct', true); await setChk('#t-relief', true);

// 3D structures + slice highlight at mid-mantle + data panel
await setDepth(1800); await page.waitForTimeout(1400); await page.screenshot({path:'shots/09-structures.png'});
await click('#data-btn'); await page.waitForTimeout(500); await page.screenshot({path:'shots/10-data.png'}); await click('#data-close');

// relief Earth + country borders at the surface
await setDepth(0); await setChk('#t-borders', true); await page.waitForTimeout(1000); await page.screenshot({path:'shots/11-relief-countries.png'});
console.log('temp@0:', await page.evaluate(()=>document.querySelector('#ro-temp').textContent), '| know:', (await page.evaluate(()=>document.querySelector('#know').textContent)).slice(0,60));
// relief alignment check (structures + model off)
await setChk('#t-struct', false); await setChk('#t-theory', false); await page.waitForTimeout(800);
await page.screenshot({path:'shots/12-relief-only.png'});
// drag-rotate to the western hemisphere (Americas/Pacific) for a second alignment check
const cx=344+(1500-344)/2, cy=460;
await page.mouse.move(cx,cy); await page.mouse.down();
await page.mouse.move(cx-430,cy,{steps:24}); await page.mouse.up();
await page.waitForTimeout(900); await page.screenshot({path:'shots/14-relief-west.png'});
await setChk('#t-struct', true); await setChk('#t-theory', true); await setChk('#t-borders', false);

// tour
await setDepth(2700); await page.waitForTimeout(600);
await click('#tour-btn'); await page.waitForTimeout(2600); await page.screenshot({path:'shots/08-tour.png'});
console.log('tour caption:', await page.evaluate(()=>document.querySelector('#tour-title')?.textContent));
await click('#tour-stop');

// theory-in-gaps hatch (3D bodies off so the slice is unobstructed)
await setChk('#t-struct', false); await setDepth(1500); await page.waitForTimeout(1400);
await page.screenshot({path:'shots/13-theory-gaps.png'});
await setChk('#t-struct', true);

// hover + extract test
await setDepth(1800); await page.waitForTimeout(1200);
const hx=344+(1500-344)/2, hy=460;
await page.mouse.move(hx,hy); await page.waitForTimeout(350);
await page.screenshot({path:'shots/16-hover.png'});
console.log('tip visible:', await page.evaluate(()=>!document.querySelector('#tip').classList.contains('hidden')));
await page.mouse.move(hx,hy); await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(1700); await page.screenshot({path:'shots/17-focus.png'});
console.log('focus:', await page.evaluate(()=>(!document.querySelector('#focus').classList.contains('hidden'))+' / '+document.querySelector('#focus-name').textContent));
await page.keyboard.press('Escape'); await page.waitForTimeout(700);

console.log('--- PAGE ERRORS ---'); console.log(errors.length?errors.join('\n'):'(none)');
console.log('--- CONSOLE errors/warnings ---');
console.log(logs.filter(l=>/error|warn|fail|exception/i.test(l)).slice(0,30).join('\n')||'(none)');
await browser.close();
console.log('DONE');
