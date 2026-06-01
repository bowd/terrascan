// ui.js — owns the left-rail DOM: depth controls, the scan legend, the readout
// (with the colour↔baseline bridge), the guided intro, and the tour caption.
import { GEO_LAYERS, EARTH_RADIUS, DEPTH_STOPS, sliderToDepth, depthToSlider } from './earthModel.js';
import { TYPE_INFO, CATEGORY } from './tomography.js';

const $ = (s)=>document.querySelector(s);
const ANOM = {fast:'#6f9bff', slow:'#ff6b5a'};

// curated jump points shown as chips under the depth bar
const JUMPS = [
  {d:0,label:'surface'}, {d:150,label:'150'}, {d:410,label:'410'}, {d:660,label:'660'},
  {d:1500,label:'1500'}, {d:2741,label:'D″'}, {d:2891,label:'CMB'}, {d:5150,label:'ICB'}, {d:6371,label:'centre'},
];

export function initControls(h){
  const slider=$('#depth-slider'); // 0..1000 on a non-linear axis (shallow expanded)
  slider.addEventListener('input', ()=>h.onDepth(sliderToDepth(+slider.value/1000)));

  document.querySelectorAll('#colormode button').forEach(b=>
    b.addEventListener('click', ()=>h.onColorMode(b.dataset.mode)));
  document.querySelectorAll('#datasrc button').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('#datasrc button').forEach(x=>x.classList.toggle('active',x===b));
    h.onSource(b.dataset.src);
  }));

  const tog=(id,name)=>$(id).addEventListener('change',e=>h.onToggle(name,e.target.checked));
  tog('#t-struct','struct'); tog('#t-scan','scan'); tog('#t-infer','infer'); tog('#t-theory','theory');
  tog('#t-relief','relief'); tog('#t-coast','coast'); tog('#t-borders','borders');
  tog('#t-markers','markers'); tog('#t-foot','foot'); tog('#t-exp','exp'); tog('#t-spin','spin'); tog('#t-drill','drill');

  $('#focus-blend').addEventListener('input',e=>h.onFocus(+e.target.value/100));
  document.querySelectorAll('.dial').forEach(s=>s.addEventListener('input',()=>h.onDial(s.dataset.dial, +s.value/100)));

  $('#dive-btn').addEventListener('click',h.onDive);
  $('#up-btn').addEventListener('click',()=>h.onStep(-100));
  $('#down-btn').addEventListener('click',()=>h.onStep(100));

  // guide modal
  const guide=$('#guide');
  const openGuide=()=>guide.classList.remove('hidden');
  const closeGuide=()=>{ guide.classList.add('hidden'); try{localStorage.setItem('terrascan_seen','1');}catch(e){} };
  $('#guide-btn').addEventListener('click',openGuide);
  $('#guide-link').addEventListener('click',openGuide);
  $('#guide-close').addEventListener('click',closeGuide);
  $('#guide-explore').addEventListener('click',closeGuide);
  guide.addEventListener('click',e=>{if(e.target===guide)closeGuide();});
  $('#guide-tour').addEventListener('click',()=>{closeGuide();h.onTour();});

  // tour + extract
  $('#tour-btn').addEventListener('click',h.onTour);
  $('#tour-stop').addEventListener('click',h.onTourStop);
  $('#focus-back').addEventListener('click',h.onExitFocus);

  // data sources modal
  const data=$('#data');
  $('#data-btn').addEventListener('click',()=>data.classList.remove('hidden'));
  $('#data-close').addEventListener('click',()=>data.classList.add('hidden'));
  data.addEventListener('click',e=>{if(e.target===data)data.classList.add('hidden');});

  // glossary modal (taxonomy of feature types)
  const gloss=$('#glossary');
  $('#glossary-btn').addEventListener('click',()=>gloss.classList.remove('hidden'));
  $('#glossary-close').addEventListener('click',()=>gloss.classList.add('hidden'));
  gloss.addEventListener('click',e=>{if(e.target===gloss)gloss.classList.add('hidden');});
  $('#glossary-body').innerHTML=Object.entries(TYPE_INFO).map(([k,t])=>{
    const c='#'+((CATEGORY[k]&&CATEGORY[k].color||0x888888)).toString(16).padStart(6,'0');
    return `<div class="gloss-item"><span class="gloss-dot" style="background:${c};color:${c}"></span>`+
      `<div class="gloss-txt"><div class="gloss-head"><b>${t.label}</b><span class="gloss-nat">${t.nature||''}</span></div>`+
      `<div class="gloss-depth">${t.depth||''}</div><div class="gloss-mean">${t.meaning}</div></div></div>`;
  }).join('');

  // depth rail (coloured cross-section of the whole planet)
  const rail=$('#depth-rail');
  const stops=GEO_LAYERS.map(L=>{
    const c='#'+L.color.toString(16).padStart(6,'0');
    return `${c} ${(depthToSlider(L.d0)*100).toFixed(1)}%, ${c} ${(depthToSlider(L.d1)*100).toFixed(1)}%`;
  }).join(', ');
  rail.innerHTML=`<div class="rail-fill" style="background:linear-gradient(90deg,${stops})"></div><div class="rail-cursor" id="rail-cursor"></div>`;
  const cursor=$('#rail-cursor');

  // jump chips
  const ticks=$('#depth-ticks');
  ticks.innerHTML=JUMPS.map(j=>`<span class="tick" data-d="${j.d}">${j.label}</span>`).join('');
  ticks.querySelectorAll('.tick').forEach(t=>t.addEventListener('click',()=>h.onTickJump(+t.dataset.d)));

  const covWords=(p)=> p>=55?'richly scanned — trust the colours':p>=32?'decent coverage':p>=16?'patchy — the model is filling in':'almost no scan — you are seeing the model';

  return {
    depth(d, layerName){
      const r=Math.round(d).toLocaleString();
      $('#depth-km').textContent=r; $('#sd-km').textContent=r;
      $('#depth-layer').textContent=layerName; $('#sd-layer').textContent=layerName;
      const sv=Math.round(depthToSlider(d)*1000);
      if(+slider.value!==sv) slider.value=sv;
      cursor.style.left=(depthToSlider(d)*100)+'%';
      ticks.querySelectorAll('.tick').forEach(t=>t.classList.toggle('on',Math.abs(+t.dataset.d-d)<70));
      const stop=DEPTH_STOPS.reduce((a,b)=>Math.abs(b.d-d)<Math.abs(a.d-d)?b:a);
      $('#depth-note').textContent='“'+stop.label+'” — '+stop.blurb;
    },
    dataBody(html){ $('#data-body').innerHTML=html; },
    know(text){ $('#know').textContent=text; },
    sourceNote(t){ $('#scan-source-note').textContent=t; },
    drillStatus(t){ const e=$('#drill-status'); if(e){ e.textContent=t||''; e.classList.toggle('on', !!t); } },
    reflectDials(norms){ document.querySelectorAll('.dial').forEach(s=>{ const v=norms[s.dataset.dial]; if(v!=null) s.value=Math.round(Math.max(0,Math.min(1,v))*100); }); },
    tip(f, x, y){
      if(!f){ $('#tip').classList.add('hidden'); return; }
      const ti=TYPE_INFO[f.type]||{};
      this.tipHTML(`<b>${f.name}</b>`+
        `<span class="tip-type">${ti.label||f.type} · ${f.anomaly==='fast'?'fast = cold':'slow = hot'}</span>`+
        `<span class="tip-d">${f.dTop.toLocaleString()}–${f.dBot.toLocaleString()} km · click to isolate</span>`, x, y);
    },
    tipHTML(html, x, y){
      const el=$('#tip'); el.innerHTML=html;
      el.style.left=Math.min(window.innerWidth-232, x+15)+'px';
      el.style.top=Math.min(window.innerHeight-80, y+15)+'px';
      el.classList.remove('hidden');
    },
    focusPanel(f){
      const el=$('#focus');
      if(!f){ el.classList.add('hidden'); return; }
      const ti=TYPE_INFO[f.type]||{};
      $('#focus-type').textContent=ti.label||f.type;
      $('#focus-name').textContent=f.name;
      $('#focus-meaning').textContent=ti.meaning||'';
      $('#focus-depth').textContent=f.dTop.toLocaleString()+'–'+f.dBot.toLocaleString()+' km';
      $('#focus-anom').textContent= f.anomaly==='fast'?'fast → cold / sinking':'slow → hot / rising';
      const links=ti.links||[];
      $('#focus-src').innerHTML = links.length
        ? links.map(l=>`<a href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join('')
        : (ti.src||'—');
      el.classList.remove('hidden');
    },
    readout(o){
      $('#ro-vs').textContent=o.vs; $('#ro-temp').textContent=o.temp;
      $('#ro-rho').textContent=o.rho; $('#ro-p').textContent=o.p;
      if(o.tempNote) $('#temp-cap').textContent=o.tempNote;
      const p=Math.max(0,Math.min(100,o.covPct));
      $('#ro-cov').textContent=Math.round(p)+' %';
      $('#cov-fill').style.width=p+'%';
      $('#cov-foot').textContent=covWords(p);
    },
    features(list){
      const ul=$('#feature-list');
      if(!list.length){ul.innerHTML='<li class="muted">average mantle/core — no strong anomalies here</li>';return;}
      ul.innerHTML=list.map(f=>`<li><span class="swatch" style="color:${ANOM[f.anomaly]};background:${ANOM[f.anomaly]}"></span>${f.name}<span class="ftype">${f.anomaly==='fast'?'cold':'hot'} · ${f.type}</span></li>`).join('');
    },
    colorMode(m){
      document.querySelectorAll('#colormode button').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
      $('#legend-dvs').classList.toggle('hidden',m!=='dvs');
      $('#legend-feature').classList.toggle('hidden',m!=='feature');
    },
    dive(playing){ $('#dive-btn').textContent= playing?'❚❚ pause dive':'▶ dive to core'; },
    guide(show){ guide.classList.toggle('hidden',!show); },
    tour(playing){
      $('#tour').classList.toggle('hidden',!playing);
      $('#tour-btn').textContent= playing?'❚❚ stop tour':'▶ Take the tour';
      $('#tour-btn').classList.toggle('primary',!playing);
    },
    caption(c){
      $('#tour-step').textContent=`${c.i} / ${c.total}`;
      $('#tour-title').textContent=c.title;
      $('#tour-text').textContent=c.text;
    },
  };
}
