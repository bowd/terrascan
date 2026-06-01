// main.js — wires the scene, the layered pipeline, and the controls together.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import {
  EARTH_RADIUS, premAt, geoLayerAt, depthToUnit, tempUncertainty,
} from './earthModel.js';
import { makeScanField, activeFeatures, dominantFeatures, TYPE_INFO } from './tomography.js';
import { loadGeo, rasterizeLand, buildCoastlines, buildGraticule, latLonToVec3 } from './geo.js';
import { makeTheoryShells, makeScanShell } from './shells.js';
import { makeStructures } from './structures.js';
import { makeReliefEarth } from './surface.js';
import { makePipeline } from './postfx.js';
import { initControls } from './ui.js';
import { DATA_GROUPS, dataSourcesHTML } from './datasources.js';

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
  showBorders:false, showMarkers:true, showFoot:false, spin:true,
  diving:false, touring:false, contextLost:false, focused:null,
};

let scanField, scan, structures, relief, markers=[], markerGroup, ui, coastObj, gratObj, bordersObj;
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
  scan=makeScanShell(scanField.texture);
  scan.setOpacity(state.scanOpacity);
  scanScene.add(scan.mesh);

  structures=makeStructures();
  structures.setOpacity(0.9);
  scanScene.add(structures.group);
  structures.footGroup.visible=state.showFoot; scanScene.add(structures.footGroup);

  relief=makeReliefEarth();
  relief.setOpacity(state.reliefOpacity); relief.mesh.visible=state.showRelief;
  scanScene.add(relief.mesh);

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
  let seen=false; try{ seen=!!localStorage.getItem('terrascan_seen'); }catch(e){}
  if(!seen) ui.guide(true); // show the intro once; the ⓘ button reopens it

  scanField.update(0);
  setDepth(0);
  initPicking();
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
  onDepth:(d)=>{ stopTour(); stopDive(); setDepth(d); },
  onColorMode:(m)=>{ state.mode=(m==='feature')?1:0; scan.setMode(state.mode); structures.setMode(state.mode); ui.colorMode(m);
    refreshFeaturePanel(); },
  onToggle:(name,v)=>{
    if(name==='struct'){ state.showStruct=v; structures.group.visible=v; }
    else if(name==='foot'){ state.showFoot=v; structures.footGroup.visible=v; }
    else if(name==='scan'){ state.showScan=v; scan.mesh.visible=v; }
    else if(name==='infer'){ state.showInfer=v; scan.setInfer(v?1:0); }
    else if(name==='theory') state.showTheory=v;
    else if(name==='relief'){ state.showRelief=v; relief.mesh.visible=v; }
    else if(name==='coast'){ state.showCoast=v; coastObj&&(coastObj.visible=v); gratObj&&(gratObj.visible=v); }
    else if(name==='borders'){ state.showBorders=v; bordersObj&&(bordersObj.visible=v); }
    else if(name==='markers'){ state.showMarkers=v; markerGroup.visible=v; }
    else if(name==='spin'){ state.spin=v; if(!state.touring) controls.autoRotate=v; }
  },
  onScanOpacity:(v)=>{ state.scanOpacity=v; scan.setOpacity(v); },
  onReliefOpacity:(v)=>{ state.reliefOpacity=v; relief.setOpacity(v); },
  onBlur:(v)=>{ state.blur=v; },
  onGain:(v)=>{ state.gain=v; scan.setGain(v); refreshFeaturePanel(); },
  onDive:()=>{ stopTour(); state.diving?stopDive():startDive(); },
  onTickJump:(d)=>{ stopTour(); stopDive(); animateTo(d); },
  onStep:(dz)=>{ stopTour(); stopDive(); setDepth(state.depth+dz); },
  onTour:()=>{ state.touring?stopTour():startTour(); },
  onTourStop:()=>stopTour(),
  onExitFocus:()=>exitFocus(),
};

// ---------- depth ----------
let pendingDepth=0, builtDepth=-999, lastBuild=0, lastReadout={};
function setDepth(d){
  d=Math.max(0,Math.min(EARTH_RADIUS,d));
  state.depth=d; pendingDepth=d;
  scan.setRadius(depthToUnit(d));
  structures.setCurDepth(d/EARTH_RADIUS);
  // sample a hair below so velocities agree with the (deeper) layer label at a discontinuity
  const gl=geoLayerAt(d), p=premAt(Math.min(d+0.5, EARTH_RADIUS));
  ui.depth(d, gl.name+(gl.state==='liquid'?' · liquid':''));
  lastReadout={
    vs:(gl.state==='liquid'?'0 (liquid)':p.vs.toFixed(2)+' km/s'),
    temp:'≈ '+(Math.round(p.temp/10)*10).toLocaleString()+' K · '+(Math.round((p.temp-273.15)/10)*10).toLocaleString()+' °C',
    tempNote:'model estimate · ±'+tempUncertainty(d)+' K · not measured',
    rho:p.rho.toFixed(2)+' g/cm³',
    p:(p.pressure>=10?p.pressure.toFixed(0):p.pressure.toFixed(1))+' GPa',
    covPct:scanField.coverageMean*100,
  };
  ui.readout(lastReadout);
  ui.know(gl.note);
  refreshFeaturePanel();
  positionMarkers(d);
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

// ---------- dive ----------
let diveTarget=null;
function startDive(){ stopTour(); state.diving=true; ui.dive(true); if(state.depth>=EARTH_RADIUS-5) setDepth(0); }
function stopDive(){ if(state.diving){ state.diving=false; ui.dive(false);} diveTarget=null; }
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
    if(state.focused || !structures.group.visible){ return; }
    const f=pickAt(e.clientX,e.clientY); hovered=f;
    structures.setFootHover(f);
    if(f){ ui.tip(f, e.clientX, e.clientY); el.style.cursor='pointer'; }
    else { ui.tip(null); el.style.cursor=''; }
  });
  el.addEventListener('pointerleave',()=>{ ui.tip(null); structures.setFootHover(null); });
  el.addEventListener('click',e=>{
    if(downPos && Math.hypot(e.clientX-downPos.x,e.clientY-downPos.y)>6) return; // was a drag
    if(state.focused || !structures.group.visible) return;
    const f=pickAt(e.clientX,e.clientY); if(f) enterFocus(f);
  });
}
function enterFocus(f){
  stopTour(); stopDive(); ui.tip(null);
  const inf=structures.infoFor(f);
  state.focused=f; structures.focus(f); earthWire.visible=true; controls.autoRotate=false;
  scan.mesh.visible=false; markerGroup.visible=false; relief.setOpacity(0.10); // declutter around the isolated body
  savedCam=camera.position.clone(); savedTarget=controls.target.clone();
  const c=inf.center, dist=Math.max(0.55, Math.min(3.2, inf.radius*5.0));
  const dir=camera.position.clone().sub(controls.target).normalize();
  glideTarget=c.clone(); glideCam=c.clone().add(dir.multiplyScalar(dist));
  ui.focusPanel(f);
}
function exitFocus(){
  if(!state.focused) return;
  structures.focus(null); earthWire.visible=false; ui.focusPanel(null);
  scan.mesh.visible=state.showScan; markerGroup.visible=state.showMarkers; relief.setOpacity(state.reliefOpacity);
  glideTarget=new THREE.Vector3(0,0,0);                 // the globe pivot is always the origin
  glideCam=savedCam?savedCam.clone():new THREE.Vector3(0.2,0.9,3.0);
  state.focused=null; controls.autoRotate=state.spin;
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
    let d=state.depth + (EARTH_RADIUS/22)*dt;
    if(d>=EARTH_RADIUS){ d=EARTH_RADIUS; stopDive(); }
    setDepth(d);
  } else if(diveTarget!==null){
    const d=state.depth + (diveTarget-state.depth)*Math.min(1, dt*4.5);
    if(Math.abs(d-diveTarget)<2){ setDepth(diveTarget); diveTarget=null; } else setDepth(d);
  }

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

  theoryShells.userData.tick(t);
  controls.update();
  fadeMarkers();

  // Where the scan resolves the Earth, the model recedes to a faint haze behind it.
  // Where coverage collapses (the deep core), the blurry estimate brightens to take over.
  const fillIn=1-THREE.MathUtils.smoothstep(scanField?scanField.coverageMean:0.4, 0.05, 0.30);
  pipeline.render(theoryScene, scanScene, camera, {
    showTheory:state.showTheory, showScan:true,
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
  if(e.key==='ArrowDown'){ stopTour(); stopDive(); setDepth(state.depth+Math.max(20,EARTH_RADIUS*0.01)); e.preventDefault(); }
  else if(e.key==='ArrowUp'){ stopTour(); stopDive(); setDepth(state.depth-Math.max(20,EARTH_RADIUS*0.01)); e.preventDefault(); }
  else if(e.code==='Space'){ handlers.onDive(); e.preventDefault(); }
  else if(e.key==='Escape'){ exitFocus(); }
}
function fail(msg){
  const ov=document.getElementById('loading');
  if(ov) ov.innerHTML='<div class="loading-text">'+msg+'</div>';
}

// expose coast/grat refs for toggles
// (assigned after build)
