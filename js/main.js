// main.js — wires the scene, the layered pipeline, and the controls together.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import {
  EARTH_RADIUS, premAt, geoLayerAt, depthToUnit, tempUncertainty, reliefCutRadius, ELEV_TOP, MAX_DEPTH,
} from './earthModel.js';
import { makeScanField, activeFeatures, dominantFeatures, TYPE_INFO } from './tomography.js';
import { loadGeo, rasterizeLand, buildCoastlines, buildGraticule, latLonToVec3 } from './geo.js';
import { makeTheoryShells, makeScanShell } from './shells.js';
import { makeStructures } from './structures.js';
import { makeReliefEarth } from './surface.js';
import { makePipeline } from './postfx.js';
import { initControls } from './ui.js';
import { DATA_GROUPS, dataSourcesHTML } from './datasources.js';
import { EXPERIMENTS, EXP_KIND } from './experiments.js';
import { makeDataBodies } from './databodies.js';
import { makeDataEngine } from './dataengine.js';
import { makePresets } from './presets.js';

const TEX_W=1024, TEX_H=512;
const PIX=Math.min(window.devicePixelRatio||1, 2);
const container=document.getElementById('scene');

// ---------- renderer / camera / controls ----------
let renderer;
try{
  renderer=new THREE.WebGLRenderer({antialias:true, alpha:false, powerPreference:'high-performance'});
}catch(e){ fail('WebGL is not available in this browser.'); throw e; }
renderer.setPixelRatio(PIX);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.autoClear=false;
renderer.outputColorSpace=THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', (e)=>{ e.preventDefault(); state.contextLost=true; fail('WebGL context lost — please reload the page.'); });
renderer.domElement.addEventListener('webglcontextrestored', ()=>{ state.contextLost=false; });

const camera=new THREE.PerspectiveCamera(40, container.clientWidth/container.clientHeight, 0.02, 300);
camera.position.set(0.2, 0.9, 3.0);

const controls=new OrbitControls(camera, renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=0.06;
controls.minDistance=1.28; controls.maxDistance=7.5;
controls.autoRotate=true; controls.autoRotateSpeed=0.32;
controls.rotateSpeed=0.85; controls.zoomSpeed=0.9;
controls.addEventListener('start', ()=>{        // any manual grab takes over cleanly
  if(state.touring) stopTour();
  if(glideCam){ if(glideTarget) controls.target.copy(glideTarget); glideCam=null; glideTarget=null; }
});
// drill-zoom: rotating updates the current tape waypoint so rewinding restores orientation too
controls.addEventListener('end', ()=>{ if(state.drillNav && !navCam && tape[navIdx]) tape[navIdx]={target:controls.target.clone(), camPos:camera.position.clone()}; });

// ---------- scenes ----------
const theoryScene=new THREE.Scene();
const scanScene=new THREE.Scene();
const pipeline=makePipeline(renderer);

const theoryShells=makeTheoryShells();
theoryScene.add(theoryShells);

// ---------- state ----------
const state={
  depth:0, mode:0, gain:1.0, scanOpacity:0.58, blur:0.62, reliefOpacity:0.72,
  showStruct:true, showScan:true, showInfer:true, showTheory:true, showRelief:true, showCoast:true,
  showBorders:false, showMarkers:true, showFoot:false, showExp:false, spin:true,
  diving:false, touring:false, contextLost:false, focused:null, focusBlend:0.4, source:'synth', drillNav:false, cutaway:false, reliefPeel:true,
};
// drill-zoom navigation "tape": waypoints of {orbit target, camera position}
let tape=[], navIdx=0, navCam=null, navTarget=null;

// ---------- live data pipeline (per-model volumes combined in the browser) ----------
let engine=null, gridScale=16, nModels=0, refreshTimer=null;
// the knobs between raw data and the projection (sliders in the Data-pipeline panel)
const clusterParams={ threshold:0.55, smooth:1, agreeMin:0.4, strategy:'surfaces', opacity:0.9, band:0.016 };
const CLUS_RANGE={ threshold:[0.1,1.0], smooth:[0,3], agreeMin:[0,0.9] };
// velocity-coupled depth band + accelerating dive
let velEMA=0, prevDepthForVel=0, diveVel=0;
const DIVE_V0=55, DIVE_ACCEL=150, DIVE_VMAX=900;   // km/s of depth: slow start, accelerating
const BAND_NARROW=35, BAND_WIDE=640, BAND_VREF=720; // km band width vs descent speed

// ---------- tunable dials (every magic number, live) ----------
const DIAL_RANGE={ reliefOpacity:[0,1], reliefBright:[0.6,1.8], coastOpacity:[0,0.9],
  scanStrength:[0,1], scanGain:[0.4,1.8], scanFloor:[0,0.5],
  modelGain:[0,2], modelHaze:[0,1], bodyOpacity:[0,1.2], focusBand:[0.008,0.12] };
const dials={ reliefOpacity:0.88, reliefBright:1.12, coastOpacity:0.42,
  scanStrength:0.8, scanGain:1.2, scanFloor:0.16,
  modelGain:1.0, modelHaze:0.62, bodyOpacity:0.9, focusBand:0.03 };
function applyDial(name,v){ dials[name]=v;
  if(name==='reliefOpacity') setReliefOpacity();
  else if(name==='reliefBright') relief&&relief.setBright(v);
  else if(name==='coastOpacity'){ coastObj&&(coastObj.material.opacity=v); bordersObj&&(bordersObj.material.opacity=Math.min(0.9,v*1.15)); }
  else if(name==='scanStrength') scan&&scan.setOpacity(v);
  else if(name==='scanGain') scan&&scan.setGain(v);
  else if(name==='scanFloor') scan&&scan.setCovFloor(v);
  else if(name==='bodyOpacity'){ structures&&structures.setOpacity(v); dataBodies&&dataBodies.setOpacity(v); clusterParams.opacity=v; }
  else if(name==='focusBand') structures&&structures.setFocusBand(v);
  // modelGain & modelHaze are read live in the render loop
}
function dialNorms(){ const o={}; for(const k in dials){ const r=DIAL_RANGE[k]; o[k]=(dials[k]-r[0])/(r[1]-r[0]); } return o; }
// the "smart" rack: one control shifts emphasis surface -> interior across many dials
function applyFocus(t){
  state.focusBlend=t;
  applyDial('reliefOpacity', 0.88*(1-t)+0.05);   // surface skin fades as you go in
  applyDial('coastOpacity', 0.55*(1-0.7*t)+0.03);
  applyDial('scanStrength', 0.62+0.3*t);
  applyDial('modelGain', 0.5+1.1*t);             // the fuzzy subsurface brightens
  applyDial('modelHaze', 0.35+0.5*t);            // ...and gets hazier/fuzzier
  applyDial('bodyOpacity', 0.65+0.4*t);
  ui&&ui.reflectDials(dialNorms());
}
// peel-back: the relief skin is opaque at the surface and fades as you descend,
// so driving the depth slider feels like peeling the crust off to reveal the inside.
const smooth01=(x)=>{ x=x<0?0:x>1?1:x; return x*x*(3-2*x); };
const peelFactor=(d)=> 1 - 0.86*smooth01((d-50)/520);   // 1 @50km → ~0.14 by ~570km
function setReliefOpacity(){ if(!relief) return;
  // peel mode keeps the current surface STRONG (the cut, not opacity, hides what's above)
  relief.setOpacity(state.reliefPeel ? 0.95 : dials.reliefOpacity*peelFactor(state.depth)); }

// ---- data pipeline: combine enabled models -> scan slice + 3-D bodies ----------
function toScanEns(c){                                    // engine float field -> scan's Int8/Uint8 shape
  const N=c.ndep*c.nlat*c.nlon, dvs=new Int8Array(N), agree=new Uint8Array(N);
  for(let k=0;k<N;k++){ let d=Math.round(c.dvs[k]*gridScale); dvs[k]=d<-127?-127:d>127?127:d;
    let a=Math.round(c.agree[k]*255); agree[k]=a<0?0:a>255?255:a; }
  return { depths:c.depths, nlon:c.nlon, nlat:c.nlat, dvsScale:gridScale, dvs, agree };
}
function refreshFromEngine(){                             // recompute ensemble + rebuild slice & bodies
  if(!engine) return;
  const c=engine.combined();
  scanField.setEnsemble(toScanEns(c)); builtDepth=-999;
  if(dataBodies) dataBodies.rebuild(c, clusterParams);
}
function scheduleRefresh(){ if(refreshTimer) clearTimeout(refreshTimer); refreshTimer=setTimeout(refreshFromEngine, 130); }
function applyCluster(name,t){
  const r=CLUS_RANGE[name]; if(!r) return;
  let v=r[0]+(r[1]-r[0])*t; if(name==='smooth') v=Math.round(v);
  clusterParams[name]=v; reflectClusterReadouts(); scheduleRefresh();
}
function reflectClusterReadouts(){
  ui.clusterValue('threshold', clusterParams.threshold.toFixed(2)+' %');
  ui.clusterValue('smooth', clusterParams.smooth+'×');
  ui.clusterValue('agreeMin', clusterParams.agreeMin.toFixed(2));
}
function syncClusterFromUI(){                             // adopt the sliders' initial positions
  document.querySelectorAll('.clus').forEach(s=>{ const r=CLUS_RANGE[s.dataset.clus]; if(!r) return;
    let v=r[0]+(r[1]-r[0])*(+s.value/100); if(s.dataset.clus==='smooth') v=Math.round(v);
    clusterParams[s.dataset.clus]=v; });
  reflectClusterReadouts();
}
function applyPeel(){                                     // peel: bring the surface to the FRONT; model stays visible behind it
  const on=state.reliefPeel;
  if(relief){ relief.mesh.renderOrder = on?6:1; relief.water.renderOrder = on?6.05:2; }
  // keep the rest of the model present — you see it through the translucent surface and the cut
  if(scan) scan.mesh.visible      = state.showScan;
  if(structures) structures.group.visible = (state.source==='real') ? false : state.showStruct;
  if(dataBodies) dataBodies.group.visible  = (state.source==='real');
  if(coastObj) coastObj.visible   = state.showCoast;
  if(gratObj)  gratObj.visible    = state.showCoast;
}
function applyCutaway(){                                  // drop everything shallower than the current depth
  const on=state.cutaway;
  if(dataBodies) dataBodies.setCutaway(on);
  structures.setCutaway(on);
  relief && (relief.mesh.visible = on ? false : state.showRelief);     // the surface skin is "above" the cut
  coastObj && (coastObj.visible = on ? false : state.showCoast);
  gratObj  && (gratObj.visible  = on ? false : state.showCoast);
  bordersObj && (bordersObj.visible = on ? false : state.showBorders);
}

let scanField, scan, structures, relief, markers=[], markerGroup, ui, coastObj, gratObj, bordersObj, expObj, dataBodies;
let earthWire, hovered=null, glideCam=null, glideTarget=null, savedCam=null, savedTarget=null;
const raycaster=new THREE.Raycaster(), ptr=new THREE.Vector2(); let downPos=null;
const DOT_GEO=new THREE.SphereGeometry(0.012, 12, 12);

// ---------- boot ----------
init().catch(e=>{ console.error(e); fail('Initialisation failed — see console.'); });

async function init(){
  let coastlines, land, borders;
  try { ({coastlines, land, borders}=await loadGeo()); }
  catch(e){ fail('Could not load map data — serve this folder over HTTP (e.g. <code>python3 -m http.server</code>), not file://'); return; }
  const landMask=rasterizeLand(land, TEX_W, TEX_H);

  scanField=makeScanField(landMask);
  const ensembleReady=loadEnsemble();
  scan=makeScanShell(scanField.texture);
  scan.setOpacity(dials.scanStrength);
  scanScene.add(scan.mesh);

  structures=makeStructures();
  structures.setOpacity(0.9);
  scanScene.add(structures.group);
  structures.footGroup.visible=state.showFoot; scanScene.add(structures.footGroup);

  expObj=buildExperimentPins(); expObj.group.visible=state.showExp; scanScene.add(expObj.group);

  relief=makeReliefEarth();
  relief.setOpacity(dials.reliefOpacity); relief.setBright(dials.reliefBright); relief.mesh.visible=state.showRelief;
  scanScene.add(relief.mesh); scanScene.add(relief.water);

  // faint globe outline shown only while a feature is "extracted", for context
  earthWire=new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 30, 18)),
    new THREE.LineBasicMaterial({color:0x3b5f86, transparent:true, opacity:0.22, depthTest:false, depthWrite:false}));
  earthWire.visible=false; earthWire.renderOrder=5; scanScene.add(earthWire);

  gratObj=buildGraticule(0.999); scanScene.add(gratObj);
  coastObj=buildCoastlines(coastlines, 1.001); scanScene.add(coastObj);
  bordersObj=buildCoastlines(borders, 1.0016, 0xffe0b0, 0.5);
  bordersObj.visible=state.showBorders; scanScene.add(bordersObj);

  markerGroup=new THREE.Group();
  scanScene.add(markerGroup);

  ui=initControls(handlers);
  ui.colorMode('dvs');
  ui.dataBody(dataSourcesHTML(DATA_GROUPS));
  ui.reflectDials(dialNorms());
  let seen=false; try{ seen=!!localStorage.getItem('terrascan_seen'); }catch(e){}
  if(!seen) ui.guide(true); // show the intro once; the ⓘ button reopens it

  scanField.update(0);
  // default to Relief-peel: open above the peaks and let the relief be the subject
  ui.reliefAxis(true); relief.setPeel(true); applyPeel();
  setDepth(-ELEV_TOP*0.55);
  initPicking();
  onResize();
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);

  // reveal
  const ov=document.getElementById('loading');
  ov.classList.add('hide'); setTimeout(()=>ov.remove(), 900);
  animate();

  // presets: paint the list, then auto-apply the default once the engine is ready
  // (so model toggles / clustering restore too). Guard everything — never block boot.
  renderPresets();
  try{ await ensembleReady; }catch(e){}
  try{ presets.applyDefault(); }catch(e){ console.warn('preset default failed', e); }
  renderPresets();
}

// ---------- markers ----------
const shortName=(n)=>n.replace(/\s*\(.*?\)\s*/g,' ').trim();
function makeLabel(text, color){
  const cv=document.createElement('canvas'); cv.width=320; cv.height=72;
  const ctx=cv.getContext('2d');
  ctx.font='600 30px ui-monospace, Menlo, monospace';
  ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=8;
  ctx.fillStyle=color; ctx.beginPath(); ctx.arc(16,36,7,0,7); ctx.fill();
  ctx.shadowBlur=10; ctx.fillStyle='#eaf3ff'; ctx.fillText(text, 32, 38);
  const tex=new THREE.CanvasTexture(cv); tex.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.SpriteMaterial({map:tex, transparent:true, depthTest:false, depthWrite:false});
  const sp=new THREE.Sprite(mat);
  const w=0.42; sp.scale.set(w, w*cv.height/cv.width, 1);
  sp.center.set(0.05,0.5);
  return sp;
}

// ---------- handlers ----------
const handlers={
  onDepth:(d)=>{ stopTour(); stopDive(); setDepth(d); },
  onColorMode:(m)=>{ state.mode=(m==='feature')?1:0; scan.setMode(state.mode); structures.setMode(state.mode); ui.colorMode(m);
    refreshFeaturePanel(); },
  onToggle:(name,v)=>{
    if(name==='struct'){ state.showStruct=v; structures.group.visible=v; }
    else if(name==='foot'){ state.showFoot=v; structures.footGroup.visible=v; }
    else if(name==='exp'){ state.showExp=v; expObj.group.visible=v; }
    else if(name==='scan'){ state.showScan=v; scan.mesh.visible=v; }
    else if(name==='infer'){ state.showInfer=v; scan.setInfer(v?1:0); }
    else if(name==='theory') state.showTheory=v;
    else if(name==='relief'){ state.showRelief=v; relief.mesh.visible=v; }
    else if(name==='coast'){ state.showCoast=v; coastObj&&(coastObj.visible=v); gratObj&&(gratObj.visible=v); }
    else if(name==='borders'){ state.showBorders=v; bordersObj&&(bordersObj.visible=v); }
    else if(name==='markers'){ state.showMarkers=v; markerGroup.visible=v; }
    else if(name==='spin'){ state.spin=v; if(!state.touring) controls.autoRotate=v; }
    else if(name==='drill'){ state.drillNav=v; controls.enableZoom=!v; controls.minDistance=v?0.06:1.28;
      tape=[{target:controls.target.clone(), camPos:camera.position.clone()}]; navIdx=0; navCam=null; navTarget=null;
      ui.drillStatus(v?'drill ▾ scroll in to dive · out to rewind':''); }
    else if(name==='cutaway'){ state.cutaway=v; applyCutaway(); }
    else if(name==='normalize'){ engine&&engine.setNormalize(v); scheduleRefresh(); }
    else if(name==='peel'){ state.reliefPeel=v; ui.reliefAxis(v); relief&&relief.setPeel(v);
      if(v){ state.showRelief=true; relief.mesh.visible=true; const cb=document.querySelector('#t-relief'); if(cb) cb.checked=true; }
      applyPeel();                                        // surface takes over; interior clutter steps back
      if(v) setDepth(-ELEV_TOP*0.55); else setDepth(Math.max(0,state.depth)); // start partway above the peaks
      setReliefOpacity(); }
  },
  onModelToggle:(name,on)=>{ engine&&engine.setEnabled(name,on); scheduleRefresh(); },
  onModelKind:(kind,on)=>{ engine&&engine.enableKind(kind,on); engine&&ui.setModels(engine.list()); scheduleRefresh(); },
  onCluster:(name,t)=>applyCluster(name,t),
  onVizStrategy:(name)=>{ clusterParams.strategy=name; if(dataBodies) dataBodies.setStrategy(name); },
  onDial:(name,t)=>{ const r=DIAL_RANGE[name]; if(r) applyDial(name, r[0]+(r[1]-r[0])*t); },
  onFocus:(t)=>applyFocus(t),
  onSource:(s)=>{ state.source=s; scanField.setSource(s); builtDepth=-999;
    structures.group.visible = (s==='real') ? false : state.showStruct;  // hand-built bodies step aside
    if(dataBodies) dataBodies.group.visible = (s==='real');               // real data shown AS structures
    ui.sourceNote(s==='real'
      ? nModels+' real tomography models combined live (toggle models & tune clustering in the Data-pipeline panel), meshed into 3-D structures — blue = fast/cold (slabs), red = slow/hot (LLSVP piles, plumes). Built only where models agree.'
      : 'A hand-built, geographically-faithful synthesis of published features.'); },
  onDive:()=>{ stopTour(); state.diving?stopDive():startDive(); },
  onTickJump:(d)=>{ stopTour(); stopDive(); animateTo(d); },
  onStep:(dz)=>{ stopTour(); stopDive(); setDepth(state.depth+dz); },
  onTour:()=>{ state.touring?stopTour():startTour(); },
  onTourStop:()=>stopTour(),
  onExitFocus:()=>exitFocus(),
  onPresetSave:(name)=>{ presets.save(name); renderPresets(); },
  onPresetLoad:(id)=>{ if(presets.load(id)){ renderPresets(); ui.presetPulse&&ui.presetPulse(); } },
  onPresetDelete:(id)=>{ presets.remove(id); renderPresets(); },
  onPresetDefault:(id)=>{ presets.setDefault(id); renderPresets(); },
};

// ---------- depth ----------
let pendingDepth=0, builtDepth=-999, lastBuild=0, lastReadout={};
function setDepth(d){
  const floor = state.reliefPeel ? -ELEV_TOP : 0;          // peel lets the cut rise above sea level
  d=Math.max(floor,Math.min(MAX_DEPTH,d));      // scroll stops at the core-mantle boundary
  state.depth=d; pendingDepth=d;
  const dd=Math.max(0,d);                                  // physical sampling never goes above sea level
  scan.setRadius(depthToUnit(dd));
  structures.setCurDepth(dd/EARTH_RADIUS);
  if(dataBodies) dataBodies.setCurDepth(dd/EARTH_RADIUS);
  if(state.reliefPeel && relief) relief.setCut(reliefCutRadius(d));   // slice the relief at this elevation/depth
  setReliefOpacity();
  if(d<0){                                                 // above sea level: report elevation, not interior
    ui.depth(d, '+'+(-d).toFixed(1)+' km · above sea level');
    lastReadout={ vs:'—', temp:'— (atmosphere)', tempNote:'above the solid Earth', rho:'—', p:'—', covPct:scanField.coverageMean*100 };
    ui.readout(lastReadout); ui.know('Cutting down through the topography. Land elevation is measured; the ocean floor below sea level is not in this dataset (shown faint = estimated).');
  } else {
    // sample a hair below so velocities agree with the (deeper) layer label at a discontinuity
    const gl=geoLayerAt(dd), p=premAt(Math.min(dd+0.5, EARTH_RADIUS));
    ui.depth(d, gl.name+(gl.state==='liquid'?' · liquid':''));
    lastReadout={
      vs:(gl.state==='liquid'?'0 (liquid)':p.vs.toFixed(2)+' km/s'),
      temp:'≈ '+(Math.round(p.temp/10)*10).toLocaleString()+' K · '+(Math.round((p.temp-273.15)/10)*10).toLocaleString()+' °C',
      tempNote:'model estimate · ±'+tempUncertainty(dd)+' K · not measured',
      rho:p.rho.toFixed(2)+' g/cm³',
      p:(p.pressure>=10?p.pressure.toFixed(0):p.pressure.toFixed(1))+' GPa',
      covPct:scanField.coverageMean*100,
    };
    ui.readout(lastReadout);
    ui.know(gl.note);
  }
  refreshFeaturePanel();
  positionMarkers(dd);
}
function refreshFeaturePanel(){ ui.features(dominantFeatures(state.depth, 7)); }

// ---------- markers (built from the live feature list) ----------
function positionMarkers(d){
  const active=activeFeatures(d, 16);
  // hide all
  for(const m of markers){ m.visible=false; m.group.visible=false; }
  const rad=depthToUnit(d);
  for(const a of active){
    let m=markers.find(x=>x.name===a.f.name);
    if(!m){ m=spawnMarker(a.f); markers.push(m); }
    m.visible=true;
    const p=latLonToVec3(a.f.lat, a.f.lon, rad);
    m.dot.position.copy(p);
    m.label.position.copy(p).addScaledVector(p.clone().normalize(), 0.05);
    m.group.visible=true;
  }
}
function spawnMarker(f){
  const color = f.anomaly==='fast' ? '#6f9bff' : '#ff6b5a';
  const g=new THREE.Group();
  const dotMat=new THREE.MeshBasicMaterial({color, transparent:true, depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending});
  const dot=new THREE.Mesh(DOT_GEO, dotMat); dot.renderOrder=8;
  const label=makeLabel(shortName(f.name), color); label.renderOrder=9;
  g.add(dot); g.add(label);
  markerGroup.add(g);
  return {name:f.name, group:g, dot, label, dotMat, labelMat:label.material, visible:true};
}

// ---------- experiment pins (muography / neutrino / geoneutrino) ----------
const EXP_GEO=new THREE.OctahedronGeometry(0.017, 0);
function buildExperimentPins(){
  const group=new THREE.Group(); group.renderOrder=9;
  const pins=[], pickDots=[];
  for(const e of EXPERIMENTS){
    const k=EXP_KIND[e.kind], colHex='#'+k.color.toString(16).padStart(6,'0');
    const p=latLonToVec3(e.lat, e.lon, 1.02);
    const dotMat=new THREE.MeshBasicMaterial({color:k.color, transparent:true, depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending});
    const dot=new THREE.Mesh(EXP_GEO, dotMat); dot.position.copy(p); dot.renderOrder=9; dot.userData={exp:e};
    const label=makeLabel(e.name, colHex); label.position.copy(p).addScaledVector(p.clone().normalize(),0.045); label.renderOrder=10;
    group.add(dot); group.add(label);
    pins.push({exp:e, dot, label, dotMat, labelMat:label.material}); pickDots.push(dot);
  }
  return {group, pins, pickDots};
}
function pickExp(cx,cy){
  const r=renderer.domElement.getBoundingClientRect();
  ptr.set(((cx-r.left)/r.width)*2-1, -((cy-r.top)/r.height)*2+1);
  raycaster.setFromCamera(ptr,camera);
  const h=raycaster.intersectObjects(expObj.pickDots,false);
  return h.length?h[0].object.userData.exp:null;
}
function expTipHTML(e){
  const k=EXP_KIND[e.kind];
  return `<b>${e.name}</b><span class="tip-type">${k.label}${e.year?' · '+e.year:''}</span>`+
    `<span class="tip-d">${e.reveals}<br>${e.reach}${e.src?' · click for source ↗':''}</span>`;
}

// per-model volumes (baked by build-tomo.mjs) combined live in the browser, so models
// can be toggled and the clustering re-tuned on the fly between raw data and projection
async function loadEnsemble(){
  try{
    const j=await fetch('./data/tomo-models.json').then(r=>r.json());
    gridScale=j.grid.dvsScale;
    const models=j.models.map(m=>({ name:m.name, kind:m.kind,
      dvs:new Int8Array(Uint8Array.from(atob(m.dvs),c=>c.charCodeAt(0)).buffer) }));
    nModels=models.length;
    engine=makeDataEngine({ grid:j.grid, models });
    syncClusterFromUI();                                      // adopt the panel's slider positions
    const c=engine.combined();
    scanField.setEnsemble(toScanEns(c));
    dataBodies=makeDataBodies(c, clusterParams);              // 3-D structures from the live ensemble (rebuilt in a Web Worker)
    window.__dataBodies=dataBodies;                           // debug/verification hook (forceSync, group introspection)
    dataBodies.group.visible=(state.source==='real');
    dataBodies.setCurDepth(state.depth/EARTH_RADIUS);
    dataBodies.setCutaway(state.cutaway);
    scanScene.add(dataBodies.group);
    ui.setModels(engine.list());
    const rb=document.querySelector('#datasrc button[data-src="real"]'); if(rb) rb.textContent='real · '+nModels+' models';
  }catch(e){ console.warn('models load failed', e); }
}

// ---------- dive ----------
let diveTarget=null;
function startDive(){ stopTour(); state.diving=true; diveVel=DIVE_V0; ui.dive(true); if(state.depth>=MAX_DEPTH-5) setDepth(0); }
function stopDive(){ if(state.diving){ state.diving=false; ui.dive(false);} diveVel=0; diveTarget=null; }
function animateTo(d){ diveTarget=d; }

// ---------- guided tour ----------
const TOUR=[
  {d:0,    lat:58, lon:-100, title:'The surface you know',           text:'Every map you have seen stops here. The blue patches are cratons — ancient, cold continental keels. Now we go straight down.'},
  {d:150,  lat:62, lon:100,  title:'Lithosphere → asthenosphere',    text:'Near 80 km the rigid plates give way to mantle soft enough to slowly flow. Cold cratonic roots still read blue and fast.'},
  {d:660,  lat:-22,lon:-178, title:'Slabs stalling at 660 km',        text:'Old sea floor sinks in cold blue sheets around the Pacific rim. Many slabs pile up at this boundary; some punch through.'},
  {d:1800, lat:6,  lon:150,  title:'The deep mantle',                 text:'Cold slab graveyards keep sinking. Watch the colour thin out — where it fades, you are seeing the model guess, not real data.'},
  {d:2800, lat:-8, lon:18,   title:'Two giant hot piles — the LLSVPs',text:'Just above the core sit two continent-sized blobs of hot, slow rock: one under Africa, one under the Pacific. Plumes rise off their edges.'},
  {d:2891, lat:-8, lon:18,   title:'The core–mantle boundary',        text:'Rock meets liquid iron — a ~1000° cliff. Shear waves stop dead here, because the outer core is liquid.'},
  {d:5800, lat:0,  lon:30,   title:'Inner core — where we go blind',  text:'We have almost no lateral scan of the core, so the sharp layer fades and the blurry model takes over. That hand-off is the whole point.'},
];
let tourTimer=null, tourCamPos=null;
function startTour(){ stopDive(); state.touring=true; controls.autoRotate=false; ui.tour(true); ui.guide(false); tourChapter(0); }
function stopTour(){
  if(!state.touring) return;
  state.touring=false; if(tourTimer){ clearTimeout(tourTimer); tourTimer=null; }
  tourCamPos=null; ui.tour(false); controls.autoRotate=state.spin;
}
function tourChapter(i){
  const c=TOUR[i];
  ui.caption({i:i+1, total:TOUR.length, title:c.title, text:c.text});
  animateTo(c.d);
  tourCamPos=latLonToVec3(c.lat, c.lon, 2.7);
  if(tourTimer) clearTimeout(tourTimer);
  tourTimer=setTimeout(()=>{ if(i+1<TOUR.length) tourChapter(i+1); else stopTour(); }, 8500);
}

// ---------- picking + extract / focus ----------
function pickAt(cx,cy){
  const r=renderer.domElement.getBoundingClientRect();
  ptr.set(((cx-r.left)/r.width)*2-1, -((cy-r.top)/r.height)*2+1);
  raycaster.setFromCamera(ptr,camera);
  const hit=raycaster.intersectObjects(structures.pickProxies,false);
  return hit.length?hit[0].object.userData.feature:null;
}
function initPicking(){
  const el=renderer.domElement;
  el.addEventListener('pointerdown',e=>{ downPos={x:e.clientX,y:e.clientY}; });
  el.addEventListener('pointermove',e=>{
    if(state.focused){ return; }
    const exp=(expObj && expObj.group.visible)?pickExp(e.clientX,e.clientY):null;
    if(exp){ ui.tipHTML(expTipHTML(exp), e.clientX, e.clientY); el.style.cursor='pointer'; structures.setHover(null); structures.setFootHover(null); hovered=null; return; }
    const f=structures.group.visible?pickAt(e.clientX,e.clientY):null; hovered=f;
    structures.setFootHover(f); structures.setHover(f);
    if(f){ ui.tip(f, e.clientX, e.clientY); el.style.cursor='pointer'; }
    else { ui.tip(null); el.style.cursor=''; }
  });
  el.addEventListener('pointerleave',()=>{ ui.tip(null); structures.setFootHover(null); structures.setHover(null); });
  el.addEventListener('wheel', drillWheel, {passive:false});
  tape=[{target:controls.target.clone(), camPos:camera.position.clone()}]; navIdx=0;
  el.addEventListener('click',e=>{
    if(downPos && Math.hypot(e.clientX-downPos.x,e.clientY-downPos.y)>6) return; // was a drag
    if(state.focused) return;
    const exp=(expObj && expObj.group.visible)?pickExp(e.clientX,e.clientY):null;
    if(exp){ if(exp.src) window.open(exp.src,'_blank','noopener'); return; }
    if(!structures.group.visible) return;
    const f=pickAt(e.clientX,e.clientY); if(f) enterFocus(f);
  });
}
function enterFocus(f){
  stopTour(); stopDive(); ui.tip(null);
  const inf=structures.infoFor(f);
  document.body.classList.add('focusing');
  state.focused=f; structures.focus(f); structures.setHover(null);
  structures.footGroup.visible=true; structures.setFootSolo(f);   // light only this body's surface footprint
  earthWire.visible=true; controls.autoRotate=false;
  scan.mesh.visible=false; markerGroup.visible=false; relief.setOpacity(0.10); // declutter around the isolated body
  savedCam=camera.position.clone(); savedTarget=controls.target.clone();
  const c=inf.center, dist=Math.max(0.55, Math.min(3.2, inf.radius*5.0));
  const dir=camera.position.clone().sub(controls.target).normalize();
  glideTarget=c.clone(); glideCam=c.clone().add(dir.multiplyScalar(dist));
  ui.focusPanel(f);
}
function exitFocus(){
  if(!state.focused) return;
  document.body.classList.remove('focusing');
  structures.focus(null); structures.setFootHover(null); structures.footGroup.visible=state.showFoot;
  earthWire.visible=false; ui.focusPanel(null);
  scan.mesh.visible=state.showScan; markerGroup.visible=state.showMarkers; setReliefOpacity();
  glideTarget=new THREE.Vector3(0,0,0);                 // the globe pivot is always the origin
  glideCam=savedCam?savedCam.clone():new THREE.Vector3(0.2,0.9,3.0);
  state.focused=null; controls.autoRotate=state.spin;
}

// ---------- drill-zoom navigator (experimental) ----------
// Scrolling IN walks the orbit pivot from the Earth's centre toward the surface point
// under the camera (along the view normal), recording a "tape" of waypoints; you can
// rotate around each subsurface pivot. Scrolling OUT rewinds the tape, restoring each
// prior pivot AND the orientation you left it at — so the journey unwinds like a reel.
function drillWheel(e){
  if(!state.drillNav || state.focused) return;
  e.preventDefault();
  tape[navIdx]={target:controls.target.clone(), camPos:camera.position.clone()};   // sync current view
  if(e.deltaY<0){                                          // dive: new, deeper waypoint
    const surf=camera.position.clone().normalize().multiplyScalar(0.92);           // surface point facing camera
    let nt=controls.target.clone().lerp(surf,0.4); if(nt.length()>0.92) nt.setLength(0.92);
    const viewDir=camera.position.clone().sub(controls.target).normalize();
    const nd=Math.max(0.22, camera.position.distanceTo(controls.target)*0.66);     // dolly closer
    const nc=nt.clone().add(viewDir.multiplyScalar(nd));
    tape=tape.slice(0,navIdx+1); tape.push({target:nt,camPos:nc}); navIdx++;
    navCam=nc.clone(); navTarget=nt.clone();
  } else {                                                 // rewind one step along the tape
    if(navIdx>0){ navIdx--; navCam=tape[navIdx].camPos.clone(); navTarget=tape[navIdx].target.clone(); }
    else { const vd=camera.position.clone().sub(controls.target).normalize();      // at base: plain dolly out
      const d=Math.min(7, camera.position.distanceTo(controls.target)*1.3);
      navCam=controls.target.clone().add(vd.multiplyScalar(d)); navTarget=controls.target.clone(); }
  }
  ui.drillStatus(navIdx>0 ? ('drill ▾ '+navIdx+' · scroll out to rewind') : '');
}

// ---------- loop ----------
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  if(state.contextLost) return;
  const dt=Math.min(clock.getDelta(),0.05);
  const t=clock.elapsedTime;

  // dive / glide
  if(state.diving){
    diveVel = Math.min(DIVE_VMAX, diveVel + DIVE_ACCEL*dt);   // slow start, accelerating descent
    let d=state.depth + diveVel*dt;
    if(d>=MAX_DEPTH){ d=MAX_DEPTH; stopDive(); }
    setDepth(d);
  } else if(diveTarget!==null){
    const d=state.depth + (diveTarget-state.depth)*Math.min(1, dt*4.5);
    if(Math.abs(d-diveTarget)<2){ setDepth(diveTarget); diveTarget=null; } else setDepth(d);
  }

  // velocity-coupled depth band: narrow & crisp when still/slow, widening with descent speed
  const instV=Math.abs(state.depth-prevDepthForVel)/Math.max(dt,1e-3); prevDepthForVel=state.depth;
  velEMA += (instV-velEMA)*Math.min(1, dt*3.5);
  const bandKm=BAND_NARROW + (BAND_WIDE-BAND_NARROW)*smooth01(velEMA/BAND_VREF);
  const bandFrac=bandKm/EARTH_RADIUS;
  // wire decay is depth-based (fixed scale) so it doesn't flare/thin with scroll speed;
  // the solid strategies keep the velocity-coupled band
  if(dataBodies) dataBodies.setBand(clusterParams.strategy==='wire' ? 0.05 : bandFrac);
  if(ui) ui.bandReadout(`band ≈ ${Math.round(bandKm)} km wide${state.cutaway?'  ·  cutaway':''}`);

  // throttled scan rebuild
  const now=performance.now();
  if(Math.abs(pendingDepth-builtDepth)>=1 && now-lastBuild>35){
    scanField.update(pendingDepth); builtDepth=pendingDepth; lastBuild=now;
    ui.readout({...lastReadout, covPct:scanField.coverageMean*100});
  }
  if(state.touring && tourCamPos) camera.position.lerp(tourCamPos, Math.min(1, dt*1.7));
  if(glideCam){
    camera.position.lerp(glideCam, Math.min(1,dt*2.4));
    controls.target.lerp(glideTarget, Math.min(1,dt*2.4));
    if(camera.position.distanceTo(glideCam)<0.03){ controls.target.copy(glideTarget); glideCam=null; glideTarget=null; }
  }
  if(navCam){                                            // drill-zoom: glide to a tape waypoint
    camera.position.lerp(navCam, Math.min(1,dt*3.4));
    controls.target.lerp(navTarget, Math.min(1,dt*3.4));
    if(camera.position.distanceTo(navCam)<0.015){ controls.target.copy(navTarget); navCam=null; navTarget=null; }
  }

  theoryShells.userData.tick(t);
  controls.update();
  fadeMarkers();

  // Where the scan resolves the Earth, the model recedes to a faint haze behind it.
  // Where coverage collapses (the deep core), the blurry estimate brightens to take over.
  const fillIn=1-THREE.MathUtils.smoothstep(scanField?scanField.coverageMean:0.4, 0.05, 0.30);
  pipeline.render(theoryScene, scanScene, camera, {
    showTheory:state.showTheory, showScan:true,
    blur:dials.modelHaze,
    theoryIntensity:((state.showScan ? 0.32+fillIn*0.5 : 0.74)+dials.modelHaze*0.12)*dials.modelGain,
  });
}

// fade markers / coastlines by which hemisphere faces the camera
const _c=new THREE.Vector3();
function fadeMarkers(){
  camera.getWorldPosition(_c); _c.normalize();
  if(markerGroup.visible) for(const m of markers){
    if(!m.visible) continue;
    const f=m.dot.position.clone().normalize().dot(_c);
    const o=THREE.MathUtils.smoothstep(f, -0.1, 0.35);
    m.labelMat.opacity=o; m.dotMat.opacity=Math.max(o,0.15);
  }
  if(expObj && expObj.group.visible) for(const m of expObj.pins){
    const f=m.dot.position.clone().normalize().dot(_c);
    const o=THREE.MathUtils.smoothstep(f, -0.05, 0.4);
    m.labelMat.opacity=o; m.dotMat.opacity=Math.max(o*0.9,0.12);
  }
}

// ---------- misc ----------
function onResize(){
  const w=container.clientWidth, h=container.clientHeight;
  renderer.setSize(w,h);
  camera.aspect=w/h; camera.updateProjectionMatrix();
  pipeline.setSize(w*PIX, h*PIX, PIX);
}
function onKey(e){
  if(e.key==='ArrowDown'){ stopTour(); stopDive(); setDepth(state.depth+Math.max(20,EARTH_RADIUS*0.01)); e.preventDefault(); }
  else if(e.key==='ArrowUp'){ stopTour(); stopDive(); setDepth(state.depth-Math.max(20,EARTH_RADIUS*0.01)); e.preventDefault(); }
  else if(e.code==='Space'){ handlers.onDive(); e.preventDefault(); }
  else if(e.key==='Escape'){ exitFocus(); }
}
function fail(msg){
  const ov=document.getElementById('loading');
  if(ov) ov.innerHTML='<div class="loading-text">'+msg+'</div>';
}

// ---------- settings presets (capture / restore the whole configuration) ----------
// The toggle name <-> state field map, so capture & restore stay in lock-step with
// the handlers above. Names match handlers.onToggle(name,...) and the #t-* checkboxes.
const TOGGLE_MAP = {
  struct:'showStruct', scan:'showScan', infer:'showInfer', theory:'showTheory',
  relief:'showRelief', coast:'showCoast', borders:'showBorders', markers:'showMarkers',
  foot:'showFoot', exp:'showExp', spin:'spin', drill:'drillNav', cutaway:'cutaway',
  peel:'reliefPeel',
};
const TOGGLE_DOM = {  // checkbox id per toggle name (note #t-cut, not #t-cutaway)
  struct:'#t-struct', scan:'#t-scan', infer:'#t-infer', theory:'#t-theory',
  relief:'#t-relief', coast:'#t-coast', borders:'#t-borders', markers:'#t-markers',
  foot:'#t-foot', exp:'#t-exp', spin:'#t-spin', drill:'#t-drill', cutaway:'#t-cut',
  peel:'#t-peel',
};

function captureSettings(){
  const toggles={};
  for(const name in TOGGLE_MAP) toggles[name]=!!state[TOGGLE_MAP[name]];
  // cluster slider t-values (0..1), inverse of applyCluster's range mapping
  const clus={};
  for(const k in CLUS_RANGE){ const r=CLUS_RANGE[k]; clus[k]=(clusterParams[k]-r[0])/(r[1]-r[0]); }
  return {
    v:1,
    depth:state.depth,
    colorMode:(state.mode===1)?'feature':'dvs',
    source:state.source,
    focusBlend:state.focusBlend,
    toggles,
    dials:dialNorms(),                                   // normalized 0..1 per dial
    cluster:{ ...clus, strategy:clusterParams.strategy },
    normalize: engine ? !!engine.params().normalize : true,
    models: engine ? engine.list().map(m=>({name:m.name, enabled:!!m.enabled})) : [],
  };
}

function applySettings(s){
  if(!s || typeof s!=='object') return;
  // 1) source + data pipeline (models / normalize / cluster / strategy) FIRST
  if(s.source==='synth'||s.source==='real'){ handlers.onSource(s.source); ui.segmented('datasrc','src',s.source); }
  if(engine){
    if(typeof s.normalize==='boolean'){ engine.setNormalize(s.normalize); ui.setChecked('#t-normalize', s.normalize); }
    if(Array.isArray(s.models)){
      for(const m of s.models){ if(m&&m.name!=null) engine.setEnabled(m.name, !!m.enabled); }
      ui.setModels(engine.list());                       // re-render rows with restored checks
      // reflect the "all S/all P" master toggles
      const ls=engine.list();
      const allS=ls.filter(m=>m.kind==='S'), allP=ls.filter(m=>m.kind==='P');
      ui.setChecked('#t-all-s', allS.length>0 && allS.every(m=>m.enabled));
      ui.setChecked('#t-all-p', allP.length>0 && allP.every(m=>m.enabled));
    }
    if(s.cluster){
      for(const k in CLUS_RANGE){ const t=s.cluster[k];
        if(typeof t==='number'){ applyCluster(k, t);     // updates clusterParams + readouts + schedules refresh
          const sl=document.querySelector('.clus[data-clus="'+k+'"]'); if(sl) sl.value=Math.round(Math.max(0,Math.min(1,t))*100); } }
      if(typeof s.cluster.strategy==='string'){ handlers.onVizStrategy(s.cluster.strategy); ui.segmented('vizmode','viz',s.cluster.strategy); }
    }
    scheduleRefresh();
  }
  // 2) dials + the focus master rack
  if(typeof s.focusBlend==='number'){ applyFocus(s.focusBlend); const fb=document.querySelector('#focus-blend'); if(fb) fb.value=Math.round(s.focusBlend*100); }
  if(s.dials){ for(const name in DIAL_RANGE){ const t=s.dials[name];
    if(typeof t==='number'){ const r=DIAL_RANGE[name]; applyDial(name, r[0]+(r[1]-r[0])*t); } } ui.reflectDials(dialNorms()); }
  // 3) colour mode
  if(s.colorMode==='dvs'||s.colorMode==='feature'){ handlers.onColorMode(s.colorMode); }
  // 4) layer toggles — drive both state (via handler) and the checkboxes
  if(s.toggles){ for(const name in TOGGLE_MAP){ const v=s.toggles[name];
    if(typeof v==='boolean'){ handlers.onToggle(name, v); const cb=document.querySelector(TOGGLE_DOM[name]); if(cb) cb.checked=v; } } }
  // 5) depth LAST (peel handler may have moved it; restore the saved value, slider follows via ui.depth)
  if(typeof s.depth==='number'){ stopTour(); stopDive(); setDepth(s.depth); }
}

const presets = makePresets({ capture: captureSettings, apply: applySettings });
function renderPresets(){ if(ui) ui.renderPresets(presets.list(), presets.getDefaultId()); }

// expose coast/grat refs for toggles
// (assigned after build)
