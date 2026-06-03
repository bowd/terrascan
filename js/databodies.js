// databodies.js — STRUCTURAL representation of the REAL data, now REBUILDABLE
// and OFF the main thread.
//
// The ensemble is a continuous volume. We turn it into coherent 3-D structures via
// a small clustering pipeline (signed-field blur + agreement gate + iso-threshold)
// and then project it with one of several swappable STRATEGIES:
//   • 'surfaces' (default) — two translucent isosurfaces (fast/cold→blue slabs,
//                            slow/hot→red piles) meshed with table-free Surface Nets.
//   • 'points'             — an instanced blob cloud, one icosahedron per body cell.
//   • 'wire'               — the isosurfaces drawn as a faint wireframe skeleton.
//   • 'volume'             — radially-stretched blobs that fill the body solid.
//
// All strategies share a depth-band lit uniform (the band sweeps as you slide) and a
// radial CUTAWAY clip that discards everything shallower than the current depth.
//
// PERFORMANCE: the heavy numeric work (cluster blur + Surface Nets / instance-matrix
// build) lives in the pure-numeric `bodies-kernels.js` and runs in a Web Worker
// (`bodies-worker.js`) with transferable TypedArrays — so a model toggle or a cluster
// slider no longer freezes orbit/UI. This module only assembles THREE objects from the
// arrays the worker returns. If Workers are unavailable, the SAME kernels run
// synchronously on the main thread (fallback) so the app never breaks.
//
//   makeDataBodies(field, params) -> bodies
//     field  = { nlon, nlat, ndep, depths:[km...], dvs:Float32Array, agree:Float32Array }
//     params = { threshold:0.55, smooth:1, agreeMin:0.4, strategy:'surfaces', opacity:1, band:0.016 }
//     cell index k = (di*nlat + j)*nlon + i
//
//   bodies.group / rebuild(field,params) / setStrategy / setCutaway / setCurDepth /
//   setBand / setOpacity
import * as THREE from 'three';
import * as kernels from './bodies-kernels.js';

const DEFAULTS = { threshold:0.55, smooth:1, agreeMin:0.4, strategy:'surfaces', opacity:1, band:0.016 };

// ---- shared shader chunks: depth-band lighting + radial cutaway ----------------
// Every strategy threads a per-vertex/instance aDepth (= depthKm/EARTH_RADIUS) to
// the fragment shader as varying vAD. uClip toggles the cutaway; uCurDepth/uBand
// drive both the lit band and the clip plane.
const CLIP_FRAG=`
  if(uClip>0.5 && vAD < uCurDepth - 0.001) discard;
`;

// ---- isosurface shader: translucent fresnel body, brightest at the lit band ----
const SURF_VERT=`
  attribute float aDepth;
  uniform float uCurDepth,uBand;
  varying float vProx; varying float vAD; varying vec3 vN; varying vec3 vView;
  void main(){
    vAD = aDepth;
    vProx = 1.0 - smoothstep(0.0, uBand, abs(aDepth-uCurDepth));
    vec4 mv = modelViewMatrix*vec4(position,1.0);
    vN = normalize(normalMatrix*normal); vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix*mv;
  }`;
const SURF_FRAG=`
  uniform vec3 uColor; uniform float uOpacity; uniform float uClip,uCurDepth;
  varying float vProx; varying float vAD; varying vec3 vN; varying vec3 vView;
  void main(){
    ${CLIP_FRAG}
    float fres = pow(1.0-abs(dot(normalize(vN),normalize(vView))), 2.0);
    vec3 col = uColor*(0.42+0.58*vProx) + uColor*fres*0.7;
    float a  = uOpacity*(0.16+0.62*vProx) + fres*0.18*uOpacity;
    gl_FragColor = vec4(col, a);
  }`;

// ---- wireframe shader: faint skeleton, still band-lit & clippable ---------------
const WIRE_FRAG=`
  uniform vec3 uColor; uniform float uOpacity; uniform float uClip,uCurDepth,uBand;
  varying float vProx; varying float vAD; varying vec3 vN; varying vec3 vView;
  void main(){
    ${CLIP_FRAG}
    // brightness decays EXPONENTIALLY downward from the current depth (not a binary band):
    // brightest at the cut depth, fading deeper with a scale tied to the band width;
    // lines shallower than the current depth fade out quickly.
    float below = vAD - uCurDepth;                       // >0 = deeper than current depth
    float decay = exp(-max(below,0.0)/max(uBand*1.6,1e-4));
    float up    = smoothstep(-uBand*0.5, 0.0, below);    // hide what's above the current depth
    float w = decay*up;
    float a = uOpacity*(0.12 + 0.9*w);
    if(a<0.004) discard;
    gl_FragColor = vec4(uColor*(0.55+0.6*w), a);
  }`;

// ---- points shader: instanced blobs, opacity & size collapse off the band ------
const PTS_VERT=`
  attribute float aDepth; attribute float aMag;
  uniform float uCurDepth,uBand;
  varying float vProx; varying float vAD; varying float vMag; varying vec3 vN; varying vec3 vView;
  void main(){
    vAD = aDepth; vMag = aMag;
    vProx = 1.0 - smoothstep(0.0, uBand, abs(aDepth-uCurDepth));
    // collapse the blob toward its instance origin as it leaves the lit band
    float scale = 0.28 + 0.72*vProx;
    vec3 p = position*scale;
    vec4 mv = modelViewMatrix*instanceMatrix*vec4(p,1.0);
    vN = normalize(normalMatrix*mat3(instanceMatrix)*normal); vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix*mv;
  }`;
const PTS_FRAG=`
  uniform vec3 uColor; uniform float uOpacity; uniform float uClip,uCurDepth;
  varying float vProx; varying float vAD; varying float vMag; varying vec3 vN; varying vec3 vView;
  void main(){
    ${CLIP_FRAG}
    float fres = pow(1.0-abs(dot(normalize(vN),normalize(vView))), 1.5);
    vec3 col = uColor*(0.5+0.5*vProx) + uColor*fres*0.5;
    float a  = uOpacity*vMag*(0.12+0.7*vProx);
    if(a<0.01) discard;
    gl_FragColor = vec4(col, a);
  }`;

// ---- volume shader: filled translucent mass; whole body visible, band-brightened --
// Unlike 'points', blobs DON'T collapse off the band — they stay, and each is stretched
// radially to bridge the depth-layer gap, so overlapping cells accumulate into a solid
// 3-D volume (we trade vertical precision — "height confidence" — for a filled body).
const VOL_VERT=`
  attribute float aDepth; attribute float aMag;
  uniform float uCurDepth,uBand;
  varying float vProx; varying float vAD; varying float vMag; varying vec3 vN; varying vec3 vView;
  void main(){
    vAD = aDepth; vMag = aMag;
    vProx = 1.0 - smoothstep(0.0, uBand, abs(aDepth-uCurDepth));
    vec4 mv = modelViewMatrix*instanceMatrix*vec4(position,1.0);
    vN = normalize(normalMatrix*mat3(instanceMatrix)*normal); vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix*mv;
  }`;
const VOL_FRAG=`
  uniform vec3 uColor; uniform float uOpacity; uniform float uClip,uCurDepth;
  varying float vProx; varying float vAD; varying float vMag; varying vec3 vN; varying vec3 vView;
  void main(){
    ${CLIP_FRAG}
    float fres = pow(1.0-abs(dot(normalize(vN),normalize(vView))), 1.4);
    vec3 col = uColor*(0.5+0.5*vProx) + uColor*fres*0.4;
    float a  = uOpacity*vMag*(0.07 + 0.20*vProx);   // faint everywhere -> volume; brighter at the band
    if(a<0.006) discard;
    gl_FragColor = vec4(col, a);
  }`;

function makeUniforms(color){
  return {
    uColor:   {value:new THREE.Color(...color)},
    uCurDepth:{value:0}, uBand:{value:DEFAULTS.band}, uOpacity:{value:1},
    uClip:    {value:0},
  };
}

function surfMaterial(color){
  return new THREE.ShaderMaterial({ vertexShader:SURF_VERT, fragmentShader:SURF_FRAG,
    transparent:true, depthWrite:false, depthTest:false, side:THREE.DoubleSide,
    blending:THREE.NormalBlending, uniforms:makeUniforms(color) });
}
function wireMaterial(color){
  return new THREE.ShaderMaterial({ vertexShader:SURF_VERT, fragmentShader:WIRE_FRAG,
    transparent:true, depthWrite:false, depthTest:false, side:THREE.DoubleSide,
    blending:THREE.NormalBlending, wireframe:true, uniforms:makeUniforms(color) });
}
function ptsMaterial(color){
  return new THREE.ShaderMaterial({ vertexShader:PTS_VERT, fragmentShader:PTS_FRAG,
    transparent:true, depthWrite:false, depthTest:false, side:THREE.DoubleSide,
    blending:THREE.NormalBlending, uniforms:makeUniforms(color) });
}
function volMaterial(color){
  return new THREE.ShaderMaterial({ vertexShader:VOL_VERT, fragmentShader:VOL_FRAG,
    transparent:true, depthWrite:false, depthTest:false, side:THREE.DoubleSide,
    blending:THREE.NormalBlending, uniforms:makeUniforms(color) });
}

// The two surface bodies are origin-centred global surfaces, so their transparent-
// sort z-keys tie; with equal renderOrder the painter order flips as the camera
// orbits (red-over-blue ⇄ blue-over-red) and the overlap colour flickers. Distinct
// renderOrders pin one camera-independent order — KEEP THEM DIFFERENT (4.0 / 4.1).
function tagMesh(m, order){ m.frustumCulled=false; m.renderOrder=order; return m; }

const FAST_COLOR=[0.42,0.62,1.0];  // cold/fast → blue (slabs)
const SLOW_COLOR=[1.0,0.40,0.32];  // hot/slow  → red  (LLSVPs/plumes)

// ---- assemble THREE objects from the worker's raw typed arrays -------------------
// One isosurface mesh from {pos,dep,idx}. Returns {mesh,tris} or null when empty.
function isoMesh(pos, dep, idx, material, order){
  if(!idx || !idx.length) return null;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('aDepth',   new THREE.Float32BufferAttribute(dep,1));
  // BufferGeometry.setIndex accepts a typed array directly (chooses Uint16/Uint32 attr).
  g.setIndex(new THREE.BufferAttribute(idx,1));
  g.computeVertexNormals();
  return { mesh:tagMesh(new THREE.Mesh(g, material), order), tris:idx.length/3 };
}

// One InstancedMesh from a flat 16N matrix array + per-instance aDepth/aMag.
// baseGeom is created per call (instanced attributes live on the geometry).
function instMesh(makeGeom, mat, dep, mag, material, order){
  const n = dep.length;
  if(!n) return null;
  const geom = makeGeom();
  const inst = new THREE.InstancedMesh(geom, material, n);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // copy the flat matrices straight into the instanceMatrix buffer (no per-instance Matrix4)
  inst.instanceMatrix.array.set(mat);
  inst.instanceMatrix.needsUpdate=true;
  geom.setAttribute('aDepth', new THREE.InstancedBufferAttribute(dep,1));
  geom.setAttribute('aMag',   new THREE.InstancedBufferAttribute(mag,1));
  return { mesh:tagMesh(inst, order), count:n };
}

export function makeDataBodies(field, params){
  let curField=null, curParams={...DEFAULTS};
  // live render state, re-applied to every freshly built material
  let state={ curDepth:0, band:DEFAULTS.band, opacity:DEFAULTS.opacity, clip:0 };
  const group=new THREE.Group();
  let meshes=[];   // current scene meshes (so we can dispose them)

  // ---- worker plumbing ----------------------------------------------------------
  let worker=null, usingWorker=false;
  let jobId=0;          // incrementing tag; only the latest reply is assembled
  let latestId=0;       // id of the most recent job we posted (the one we want)
  let loggedWorker=false, loggedFallback=false;
  let forceSync=false;  // test hook: force the synchronous fallback path

  function initWorker(){
    if(typeof Worker==='undefined') return;
    try{
      worker=new Worker(new URL('./bodies-worker.js', import.meta.url), {type:'module'});
      worker.onmessage=(e)=>onWorkerReply(e.data);
      worker.onerror=(e)=>{ // worker died mid-flight: fall back to sync for everything
        if(typeof console!=='undefined') console.warn('data bodies: worker error, switching to sync', e.message||e);
        try{ worker.terminate(); }catch(_){}
        worker=null; usingWorker=false;
      };
      usingWorker=true;
    }catch(e){
      if(typeof console!=='undefined') console.warn('data bodies: Worker unavailable, using sync fallback', e&&e.message);
      worker=null; usingWorker=false;
    }
  }

  // ---- apply current render state to a freshly built material -------------------
  function applyState(m){
    const u=m.material && m.material.uniforms; if(!u) return;
    if(u.uCurDepth) u.uCurDepth.value=state.curDepth;
    if(u.uBand)     u.uBand.value=state.band;
    if(u.uOpacity)  u.uOpacity.value=state.opacity;
    if(u.uClip)     u.uClip.value=state.clip;
  }

  function disposeMeshes(){
    const seenGeom=new Set(), seenMat=new Set();
    for(const m of meshes){
      group.remove(m);
      if(m.geometry && !seenGeom.has(m.geometry)){ seenGeom.add(m.geometry); m.geometry.dispose(); }
      if(m.material && !seenMat.has(m.material)){ seenMat.add(m.material); m.material.dispose(); }
      if(typeof m.dispose==='function') m.dispose(); // InstancedMesh internal buffers
    }
    meshes=[];
  }

  // ---- assemble the new meshes from a kernel result, swap them in ---------------
  function assemble(res){
    disposeMeshes();
    const out=[]; let count=0, unit='tris', label=res.strategy;
    if(res.ok){
      if(res.strategy==='surfaces' || res.strategy==='wire'){
        const matF = res.strategy==='wire' ? wireMaterial : surfMaterial;
        const fast=isoMesh(res.posFast, res.depFast, res.idxFast, matF(FAST_COLOR), 4.0);
        const slow=isoMesh(res.posSlow, res.depSlow, res.idxSlow, matF(SLOW_COLOR), 4.1);
        if(fast){ out.push(fast.mesh); count+=fast.tris; }
        if(slow){ out.push(slow.mesh); count+=slow.tris; }
        unit='tris'; label = res.strategy==='wire' ? 'wire' : 'isosurfaces';
      } else if(res.strategy==='points'){
        const mk=()=>new THREE.IcosahedronGeometry(0.006, 0);
        const fast=instMesh(mk, res.matFast, res.depFast, res.magFast, ptsMaterial(FAST_COLOR), 4.0);
        const slow=instMesh(mk, res.matSlow, res.depSlow, res.magSlow, ptsMaterial(SLOW_COLOR), 4.1);
        if(fast){ out.push(fast.mesh); count+=fast.count; }
        if(slow){ out.push(slow.mesh); count+=slow.count; }
        unit='points'; label='points';
      } else if(res.strategy==='volume'){
        const mk=()=>new THREE.IcosahedronGeometry(1, 0);
        const fast=instMesh(mk, res.matFast, res.depFast, res.magFast, volMaterial(FAST_COLOR), 4.0);
        const slow=instMesh(mk, res.matSlow, res.depSlow, res.magSlow, volMaterial(SLOW_COLOR), 4.1);
        if(fast){ out.push(fast.mesh); count+=fast.count; }
        if(slow){ out.push(slow.mesh); count+=slow.count; }
        unit='blobs'; label='volume';
      }
    }
    meshes=out;
    for(const m of meshes){ applyState(m); group.add(m); }
    if(typeof console!=='undefined')
      console.log(`data bodies: ${label} — ${count} ${unit} (${meshes.length} mesh${meshes.length===1?'':'es'})`);
  }

  // ---- worker reply handler: coalesce by id (drop stale replies) ----------------
  function onWorkerReply(msg){
    if(!msg || msg.id==null) return;
    if(msg.id!==latestId) return;        // a newer rebuild superseded this one — drop it
    if(msg.error){
      if(typeof console!=='undefined') console.warn('data bodies: worker job failed, retrying sync', msg.error);
      runSync();                          // recover on the main thread
      return;
    }
    if(!loggedWorker && typeof console!=='undefined'){ console.log('data bodies: rebuild via worker'); loggedWorker=true; }
    assemble(msg.result);
  }

  // ---- build a transferable COPY of the field (dataengine reuses its buffers) ----
  function snapshotField(){
    const f=curField;
    const ndep=(f.ndep!=null?f.ndep:f.depths.length);
    // copy dvs/agree into fresh typed arrays we own and can transfer away
    const dvs=Float32Array.from(f.dvs);
    const agree=f.agree?Float32Array.from(f.agree):null;
    const depths=Array.isArray(f.depths)?f.depths.slice():Array.from(f.depths);
    return { field:{ nlon:f.nlon, nlat:f.nlat, ndep, depths, dvs, agree }, dvs, agree };
  }

  // ---- run the rebuild synchronously on the main thread (fallback / recovery) ----
  function runSync(){
    if(!loggedFallback && typeof console!=='undefined'){ console.log('data bodies: rebuild via sync fallback'); loggedFallback=true; }
    const out=kernels.buildBodies(
      { nlon:curField.nlon, nlat:curField.nlat, ndep:(curField.ndep!=null?curField.ndep:curField.depths.length),
        depths:curField.depths, dvs:curField.dvs, agree:curField.agree },
      curParams, curParams.strategy);
    assemble(out.result);
  }

  // ---- kick off a rebuild (worker if available, else sync) ----------------------
  function build(){
    if(!curField){ disposeMeshes(); return; }
    if(usingWorker && worker && !forceSync){
      latestId=++jobId;
      const snap=snapshotField();
      const transfers=[snap.dvs.buffer];
      if(snap.agree) transfers.push(snap.agree.buffer);
      try{
        worker.postMessage({ id:latestId, field:snap.field, params:{...curParams}, strategy:curParams.strategy }, transfers);
        return;
      }catch(e){
        if(typeof console!=='undefined') console.warn('data bodies: postMessage failed, using sync', e&&e.message);
        worker=null; usingWorker=false;
        // fall through to sync
      }
    }
    runSync();
  }

  // ---- public API ---------------------------------------------------------------
  function rebuild(f, p){
    if(f) curField=f;
    if(p) curParams={...DEFAULTS, ...curParams, ...p};
    // keep render state in sync with any band/opacity passed via params
    if(p && p.band!=null) state.band=p.band;
    if(p && p.opacity!=null) state.opacity=p.opacity;
    build();
  }
  function setStrategy(name){
    if(name && name!==curParams.strategy){ curParams={...curParams, strategy:name}; }
    build();
  }
  // synchronous setters act on the CURRENT meshes instantly — even while a rebuild is
  // in flight — so dragging cutaway / depth / band / opacity never waits on the worker.
  function setCutaway(on){ state.clip=on?1:0; for(const m of meshes){ const u=m.material&&m.material.uniforms; if(u&&u.uClip) u.uClip.value=state.clip; } }
  function setCurDepth(frac){ state.curDepth=frac; for(const m of meshes){ const u=m.material&&m.material.uniforms; if(u&&u.uCurDepth) u.uCurDepth.value=frac; } }
  function setBand(frac){ state.band=frac; for(const m of meshes){ const u=m.material&&m.material.uniforms; if(u&&u.uBand) u.uBand.value=frac; } }
  function setOpacity(o){ state.opacity=o; for(const m of meshes){ const u=m.material&&m.material.uniforms; if(u&&u.uOpacity) u.uOpacity.value=o; } }

  // test hook (not part of the public contract): force the synchronous path.
  function _setForceSync(on){ forceSync=!!on; }

  // ---- boot ----------------------------------------------------------------------
  initWorker();
  curParams={...DEFAULTS, ...(params||{})};
  state.band=curParams.band; state.opacity=curParams.opacity;
  rebuild(field, null);

  return { group, rebuild, setStrategy, setCutaway, setCurDepth, setBand, setOpacity, _setForceSync };
}
