// ui.js — owns every DOM control & readout; talks to main.js through handlers.
import { DEPTH_STOPS, GEO_LAYERS, EARTH_RADIUS } from './earthModel.js';

const $ = (s)=>document.querySelector(s);
const ANOM = {fast:'#6f9bff', slow:'#ff6b5a'};

export function initControls(h){
  const slider=$('#depth-slider');

  // depth slider
  slider.addEventListener('input', ()=>h.onDepth(+slider.value));

  // colour mode
  document.querySelectorAll('#colormode button').forEach(b=>{
    b.addEventListener('click',()=>h.onColorMode(b.dataset.mode));
  });

  // toggles
  const tog=(id,name)=>$(id).addEventListener('change',e=>h.onToggle(name,e.target.checked));
  tog('#t-scan','scan'); tog('#t-theory','theory'); tog('#t-coast','coast');
  tog('#t-markers','markers'); tog('#t-spin','spin');

  // sliders
  $('#scan-opacity').addEventListener('input',e=>h.onScanOpacity(+e.target.value/100));
  $('#blur-amount').addEventListener('input',e=>h.onBlur(+e.target.value/100));
  $('#gain').addEventListener('input',e=>h.onGain(+e.target.value/100));

  // dive + about
  $('#dive-btn').addEventListener('click',h.onDive);
  $('#about-btn').addEventListener('click',()=>$('#about').classList.remove('hidden'));
  $('#about-close').addEventListener('click',()=>$('#about').classList.add('hidden'));
  $('#about').addEventListener('click',e=>{if(e.target.id==='about')$('#about').classList.add('hidden');});

  // depth ticks
  const ticks=$('#depth-ticks');
  DEPTH_STOPS.forEach(s=>{
    const el=document.createElement('div');
    el.className='depth-tick'; el.dataset.d=s.d;
    el.style.top=(s.d/EARTH_RADIUS*100)+'%';
    el.innerHTML=`<span class="dot"></span><span class="tk-label">${s.label}</span><span class="tk-km">${s.d}</span>`;
    el.title=s.blurb;
    el.addEventListener('click',()=>h.onTickJump(s.d));
    ticks.appendChild(el);
  });

  // depth rail (a coloured cross-section of the whole planet)
  const rail=$('#depth-rail');
  const stops=GEO_LAYERS.map(L=>{
    const c='#'+L.color.toString(16).padStart(6,'0');
    return `${c} ${(L.d0/EARTH_RADIUS*100).toFixed(1)}%, ${c} ${(L.d1/EARTH_RADIUS*100).toFixed(1)}%`;
  }).join(', ');
  rail.innerHTML=`<div class="rail-fill" style="background:linear-gradient(180deg,${stops})"></div>
    <div class="rail-cursor" id="rail-cursor"></div>
    <div class="rail-cap" style="top:3px">0</div>
    <div class="rail-cap" style="bottom:3px">6371</div>`;
  const cursor=$('#rail-cursor');

  return {
    slider,
    depth(d, layerName){
      $('#depth-km').textContent=Math.round(d).toLocaleString();
      $('#depth-layer').textContent=layerName;
      if(+slider.value!==Math.round(d)) slider.value=Math.round(d);
      cursor.style.top=(d/EARTH_RADIUS*100)+'%';
      document.querySelectorAll('.depth-tick').forEach(t=>{
        t.classList.toggle('on', Math.abs(+t.dataset.d-d)<60);
      });
    },
    readout(o){
      $('#ro-layer').textContent=o.layer; $('#ro-state').textContent=o.state;
      $('#ro-vp').textContent=o.vp; $('#ro-vs').textContent=o.vs;
      $('#ro-rho').textContent=o.rho; $('#ro-p').textContent=o.p;
      $('#ro-temp').textContent=o.temp; $('#ro-cov').textContent=o.cov;
    },
    features(list){
      const ul=$('#feature-list');
      if(!list.length){ul.innerHTML='<li class="muted">average mantle / core — no strong anomalies</li>';return;}
      ul.innerHTML=list.map(f=>`<li><span class="swatch" style="color:${ANOM[f.anomaly]};background:${ANOM[f.anomaly]}"></span>${f.name}<span class="ftype">${f.type}</span></li>`).join('');
    },
    colorMode(m){
      document.querySelectorAll('#colormode button').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
      $('#legend-dvs').classList.toggle('hidden',m!=='dvs');
      $('#legend-feature').classList.toggle('hidden',m!=='feature');
    },
    dive(playing){ $('#dive-btn').textContent= playing?'❚❚ pause':'▶ dive'; },
  };
}
