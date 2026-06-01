// main.js — wires the scene, the layered pipeline, and the controls together.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import {
  EARTH_RADIUS, premAt, geoLayerAt, depthToUnit,
} from './earthModel.js';
import { makeScanField, activeFeatures, dominantFeatures } from './tomography.js';
import { loadGeo, rasterizeLand, buildCoastlines, buildGraticule, latLonToVec3 } from './geo.js';
import { makeTheoryShells, makeScanShell } from './shells.js';
import { makePipeline } from './postfx.js';
import { initControls } from './ui.js';

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

const camera=new THREE.PerspectiveCamera(40, container.clientWidth/container.clientHeight, 0.02, 300);
camera.position.set(0.2, 0.9, 3.0);

const controls=new OrbitControls(camera, renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=0.06;
controls.minDistance=1.28; controls.maxDistance=7.5;
controls.autoRotate=true; controls.autoRotateSpeed=0.32;
controls.rotateSpeed=0.85; controls.zoomSpeed=0.9;

// ---------- scenes ----------
const theoryScene=new THREE.Scene();
const scanScene=new THREE.Scene();
const pipeline=makePipeline(renderer);

const theoryShells=makeTheoryShells();
theoryScene.add(theoryShells);

// ---------- state ----------
const state={
  depth:0, mode:0, gain:1.0, scanOpacity:0.92, blur:0.62,
  showScan:true, showTheory:true, showCoast:true, showMarkers:true, spin:true,
  diving:false,
};

let scanField, scan, markers=[], markerGroup, ui, coastObj, gratObj;
const DOT_GEO=new THREE.SphereGeometry(0.012, 12, 12);

// ---------- boot ----------
init();

async function init(){
  let coastlines, land;
  try { ({coastlines, land}=await loadGeo()); }
  catch(e){ fail('Could not load map data — serve this folder over HTTP (e.g. <code>python3 -m http.server</code>), not file://'); return; }
  const landMask=rasterizeLand(land, TEX_W, TEX_H);

  scanField=makeScanField(landMask);
  scan=makeScanShell(scanField.texture);
  scanScene.add(scan.mesh);

  gratObj=buildGraticule(0.999); scanScene.add(gratObj);
  coastObj=buildCoastlines(coastlines, 1.001); scanScene.add(coastObj);

  markerGroup=new THREE.Group();
  scanScene.add(markerGroup);

  ui=initControls(handlers);
  ui.colorMode('dvs');

  scanField.update(0);
  setDepth(0);
  onResize();
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);

  // reveal
  const ov=document.getElementById('loading');
  ov.classList.add('hide'); setTimeout(()=>ov.remove(), 900);
  animate();
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
  onDepth:(d)=>{ stopDive(); setDepth(d); },
  onColorMode:(m)=>{ state.mode=(m==='feature')?1:0; scan.setMode(state.mode); ui.colorMode(m);
    refreshFeaturePanel(); },
  onToggle:(name,v)=>{
    if(name==='scan') state.showScan=v;
    else if(name==='theory') state.showTheory=v;
    else if(name==='coast'){ state.showCoast=v; coastObj&&(coastObj.visible=v); gratObj&&(gratObj.visible=v); }
    else if(name==='markers'){ state.showMarkers=v; markerGroup.visible=v; }
    else if(name==='spin'){ state.spin=v; controls.autoRotate=v; }
  },
  onScanOpacity:(v)=>{ state.scanOpacity=v; scan.setOpacity(v); },
  onBlur:(v)=>{ state.blur=v; },
  onGain:(v)=>{ state.gain=v; scan.setGain(v); refreshFeaturePanel(); },
  onDive:()=>{ state.diving?stopDive():startDive(); },
  onTickJump:(d)=>{ stopDive(); animateTo(d); },
};

// ---------- depth ----------
let pendingDepth=0, builtDepth=-999, lastBuild=0, lastReadout={};
function setDepth(d){
  d=Math.max(0,Math.min(EARTH_RADIUS,d));
  state.depth=d; pendingDepth=d;
  scan.setRadius(depthToUnit(d));
  // sample a hair below so velocities agree with the (deeper) layer label at a discontinuity
  const gl=geoLayerAt(d), p=premAt(Math.min(d+0.5, EARTH_RADIUS));
  ui.depth(d, gl.name+' · '+gl.state);
  lastReadout={
    layer:gl.name, state:gl.state,
    vp:p.vp.toFixed(2)+' km/s',
    vs:(gl.state==='liquid'?'0 — no S':p.vs.toFixed(2)+' km/s'),
    rho:p.rho.toFixed(2)+' g/cm³',
    p:(p.pressure>=10?p.pressure.toFixed(0):p.pressure.toFixed(1))+' GPa',
    temp:'≈ '+(Math.round(p.temp/10)*10).toLocaleString()+' K',
    cov:Math.round(scanField.coverageMean*100)+' %',
  };
  ui.readout(lastReadout);
  refreshFeaturePanel();
  positionMarkers(d);
}
function refreshFeaturePanel(){ ui.features(dominantFeatures(state.depth, 7)); }

// ---------- markers (built from the live feature list) ----------
function positionMarkers(d){
  const active=activeFeatures(d, 16);
  // hide all
  for(const m of markers){ m.visible=false; }
  const rad=depthToUnit(d);
  for(const a of active){
    let m=markers.find(x=>x.name===a.f.name);
    if(!m){ m=spawnMarker(a.f); markers.push(m); }
    m.visible=true;
    const p=latLonToVec3(a.f.lat, a.f.lon, rad);
    m.dot.position.copy(p);
    m.label.position.copy(p.clone().multiplyScalar(1.0+0.045/Math.max(rad,0.2)));
    m.group.visible=true;
  }
  for(const m of markers){ m.group.visible=m.visible; }
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

// ---------- dive ----------
let diveTarget=null;
function startDive(){ state.diving=true; ui.dive(true); if(state.depth>=EARTH_RADIUS-5) setDepth(0); }
function stopDive(){ if(state.diving){ state.diving=false; ui.dive(false);} diveTarget=null; }
function animateTo(d){ diveTarget=d; }

// ---------- loop ----------
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05);
  const t=clock.elapsedTime;

  // dive / glide
  if(state.diving){
    let d=state.depth + (EARTH_RADIUS/22)*dt;
    if(d>=EARTH_RADIUS){ d=EARTH_RADIUS; stopDive(); }
    setDepth(d);
  } else if(diveTarget!==null){
    const d=state.depth + (diveTarget-state.depth)*Math.min(1, dt*4.5);
    if(Math.abs(d-diveTarget)<2){ setDepth(diveTarget); diveTarget=null; } else setDepth(d);
  }

  // throttled scan rebuild
  const now=performance.now();
  if(Math.round(pendingDepth)!==builtDepth && now-lastBuild>35){
    scanField.update(pendingDepth); builtDepth=Math.round(pendingDepth); lastBuild=now;
    ui.readout({...lastReadout, cov:Math.round(scanField.coverageMean*100)+' %'});
  }

  theoryShells.userData.tick(t);
  controls.update();
  fadeMarkers();

  // Where the scan resolves the Earth, the model recedes to a faint haze behind it.
  // Where coverage collapses (the deep core), the blurry estimate brightens to take over.
  const fillIn=1-THREE.MathUtils.smoothstep(scanField?scanField.coverageMean:0.4, 0.05, 0.30);
  pipeline.render(theoryScene, scanScene, camera, {
    showTheory:state.showTheory, showScan:state.showScan,
    blur:state.blur,
    theoryIntensity:(state.showScan ? 0.32+fillIn*0.5 : 0.74)+state.blur*0.12,
  });
}

// fade markers / coastlines by which hemisphere faces the camera
const _c=new THREE.Vector3();
function fadeMarkers(){
  if(!markerGroup.visible) return;
  camera.getWorldPosition(_c); _c.normalize();
  for(const m of markers){
    if(!m.visible) continue;
    const f=m.dot.position.clone().normalize().dot(_c);
    const o=THREE.MathUtils.smoothstep(f, -0.1, 0.35);
    m.labelMat.opacity=o; m.dotMat.opacity=Math.max(o,0.15);
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
  if(e.key==='ArrowDown'){ stopDive(); setDepth(state.depth+Math.max(20,EARTH_RADIUS*0.01)); e.preventDefault(); }
  else if(e.key==='ArrowUp'){ stopDive(); setDepth(state.depth-Math.max(20,EARTH_RADIUS*0.01)); e.preventDefault(); }
  else if(e.code==='Space'){ handlers.onDive(); e.preventDefault(); }
}
function fail(msg){
  const ov=document.getElementById('loading');
  if(ov) ov.innerHTML='<div class="loading-text">'+msg+'</div>';
}

// expose coast/grat refs for toggles
// (assigned after build)
