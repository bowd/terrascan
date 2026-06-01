// databodies.js — STRUCTURAL representation of the REAL data, now REBUILDABLE.
//
// The ensemble is a continuous volume. We turn it into coherent 3-D structures via
// a small clustering pipeline (signed-field blur + agreement gate + iso-threshold)
// and then project it with one of three swappable STRATEGIES:
//   • 'surfaces' (default) — two translucent isosurfaces (fast/cold→blue slabs,
//                            slow/hot→red piles) meshed with table-free Surface Nets.
//   • 'points'             — an instanced blob cloud, one icosahedron per body cell.
//   • 'wire'               — the isosurfaces drawn as a faint wireframe skeleton.
//
// All strategies share a depth-band lit uniform (the band sweeps as you slide) and a
// radial CUTAWAY clip that discards everything shallower than the current depth.
//
//   makeDataBodies(field, params) -> bodies
//     field  = { nlon, nlat, ndep, depths:[km...], dvs:Float32Array, agree:Float32Array }
//     params = { threshold:0.55, smooth:1, agreeMin:0.4, strategy:'surfaces', opacity:1, band:0.016 }
//     cell index k = (di*nlat + j)*nlon + i
//
//   bodies.group / rebuild(field,params) / setStrategy / setCutaway / setCurDepth /
//   setBand / setOpacity
import * as THREE from 'three';
import { EARTH_RADIUS, depthToUnit } from './earthModel.js';
import { latLonToVec3 } from './geo.js';

const DEFAULTS = { threshold:0.55, smooth:1, agreeMin:0.4, strategy:'surfaces', opacity:1, band:0.016 };

// ---- naive Surface Nets (table-free) -----------------------------------------
const CORNER=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
const EDGE=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];

function surfaceNets(NX,NY,NZ, field, toWorld){
  const cellVert=new Int32Array(NX*NY*NZ).fill(-1);
  const idx=(x,y,z)=>(z*NY+y)*NX+x;
  const pos=[], dep=[], g=new Float64Array(8);
  for(let z=0;z<NZ-1;z++)for(let y=0;y<NY-1;y++)for(let x=0;x<NX-1;x++){
    let mask=0;
    for(let c=0;c<8;c++){ const o=CORNER[c]; const v=field(x+o[0],y+o[1],z+o[2]); g[c]=v; if(v<0) mask|=(1<<c); }
    if(mask===0||mask===255) continue;
    let sx=0,sy=0,sz=0,cnt=0;
    for(let e=0;e<12;e++){ const a=EDGE[e][0],b=EDGE[e][1],ga=g[a],gb=g[b];
      if((ga<0)===(gb<0)) continue;
      const t=ga/(ga-gb), ca=CORNER[a], cb=CORNER[b];
      sx+=ca[0]+(cb[0]-ca[0])*t; sy+=ca[1]+(cb[1]-ca[1])*t; sz+=ca[2]+(cb[2]-ca[2])*t; cnt++; }
    const w=toWorld(x+sx/cnt, y+sy/cnt, z+sz/cnt);
    cellVert[idx(x,y,z)]=pos.length/3; pos.push(w.x,w.y,w.z); dep.push(w.d);
  }
  const indices=[];
  const quad=(a,b,c,d)=>{ if(a<0||b<0||c<0||d<0) return; indices.push(a,b,d, b,c,d); };
  for(let z=1;z<NZ-1;z++)for(let y=1;y<NY-1;y++)for(let x=1;x<NX-1;x++){
    const v0=field(x,y,z)<0;
    if(v0!==(field(x+1,y,z)<0)) quad(cellVert[idx(x,y,z)],cellVert[idx(x,y-1,z)],cellVert[idx(x,y-1,z-1)],cellVert[idx(x,y,z-1)]);
    if(v0!==(field(x,y+1,z)<0)) quad(cellVert[idx(x,y,z)],cellVert[idx(x,y,z-1)],cellVert[idx(x-1,y,z-1)],cellVert[idx(x-1,y,z)]);
    if(v0!==(field(x,y,z+1)<0)) quad(cellVert[idx(x,y,z)],cellVert[idx(x-1,y,z)],cellVert[idx(x-1,y-1,z)],cellVert[idx(x,y-1,z)]);
  }
  return {pos,dep,indices};
}

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
    float a = uOpacity*(0.05 + 0.6*w);
    if(a<0.004) discard;
    gl_FragColor = vec4(uColor*(0.4+0.6*w), a);
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

export function makeDataBodies(field, params){
  let curField=null, curParams={...DEFAULTS};
  // live render state, re-applied to every freshly built material
  let state={ curDepth:0, band:DEFAULTS.band, opacity:DEFAULTS.opacity, clip:0 };
  const group=new THREE.Group();
  let meshes=[];   // current scene meshes (so we can dispose them)

  // ---- clustering pipeline: blur the signed field, then gate by agreement -------
  // Returns { sm, agreeArr, nlon, nlat, nd, depths } or null on an empty/invalid field.
  function cluster(f, p){
    if(!f || !f.dvs || !f.depths || !f.depths.length) return null;
    const nlon=f.nlon, nlat=f.nlat, nd=(f.ndep!=null?f.ndep:f.depths.length);
    if(!nlon||!nlat||!nd) return null;
    const N=nd*nlat*nlon;
    if(f.dvs.length < N) return null;
    // agreement may be 0..1 already; tolerate the legacy 0..255 form just in case.
    const rawAgree=f.agree;
    const agreeArr=new Float32Array(N);
    for(let k=0;k<N;k++){ let a=rawAgree?rawAgree[k]:1; if(a>1.0001) a/=255; agreeArr[k]=a; }
    // signed field in % (already mean %), light 3-D blur, `smooth` iterations
    const wrapJ=(j)=>(j+nlat)%nlat, wrapI=(i)=>((i%nlon)+nlon)%nlon;
    let src=new Float32Array(N);
    for(let k=0;k<N;k++) src[k]=f.dvs[k];
    const iters=Math.max(0, Math.round(p.smooth||0));
    for(let it=0; it<iters; it++){
      const dst=new Float32Array(N);
      const at=(di,j,i)=>src[(di*nlat+wrapJ(j))*nlon+wrapI(i)];
      for(let di=0;di<nd;di++)for(let j=0;j<nlat;j++)for(let i=0;i<nlon;i++){
        let s=at(di,j,i)*0.4, w=0.4;
        const nb=[[di-1,j,i],[di+1,j,i],[di,j-1,i],[di,j+1,i],[di,j,i-1],[di,j,i+1]];
        for(const [d,y,x] of nb){ if(d<0||d>=nd) continue; s+=at(d,y,x)*0.1; w+=0.1; }
        dst[(di*nlat+j)*nlon+i]=s/w;
      }
      src=dst;
    }
    return { sm:src, agreeArr, nlon, nlat, nd, depths:f.depths };
  }

  // ---- shared world warp + padded coord lookups (built per cluster) -------------
  function makeWarp(c){
    const {nlon,nlat,nd,depths}=c;
    const PLAT=[92]; for(let m=0;m<nlat;m++) PLAT.push(90-(m+0.5)/nlat*180); PLAT.push(-92);
    const PDEP=[depths[0]-80]; for(let m=0;m<nd;m++) PDEP.push(depths[m]); PDEP.push(depths[nd-1]+80);
    const interp=(arr,fr)=>{ const i0=Math.max(0,Math.min(arr.length-2,Math.floor(fr))); return arr[i0]+(arr[i0+1]-arr[i0])*(fr-i0); };
    const NX=nlon+1, NY=nlat+2, NZ=nd+2;
    const toWorld=(fx,fy,fz)=>{
      const lon=-180+(fx+0.5)/nlon*360;
      const lat=Math.max(-89.9,Math.min(89.9,interp(PLAT,fy)));
      const depth=Math.max(8,Math.min(2950,interp(PDEP,fz)));
      const pp=latLonToVec3(lat,lon,depthToUnit(depth));
      return {x:pp.x,y:pp.y,z:pp.z, d:depth/EARTH_RADIUS};
    };
    return {NX,NY,NZ,toWorld};
  }

  // signed iso field for Surface Nets: agreement-gated, threshold-shifted.
  function fieldFor(c,p,sign){
    const {sm,agreeArr,nlon,nlat,nd}=c, NX=nlon+1,NY=nlat+2,NZ=nd+2, agreeMin=p.agreeMin;
    return (x,y,z)=>{
      if(z===0||z===NZ-1||y===0||y===NY-1) return -1000;
      const di=z-1, j=y-1, i=x%nlon, k=(di*nlat+j)*nlon+i;
      if(agreeArr[k] < agreeMin) return -1000;
      return sign*sm[k] - p.threshold;
    };
  }

  // ---- isosurface geometry for one sign ----------------------------------------
  function isoGeom(c,p,sign){
    const w=makeWarp(c);
    const {pos,dep,indices}=surfaceNets(w.NX,w.NY,w.NZ, fieldFor(c,p,sign), w.toWorld);
    if(!indices.length) return null;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('aDepth',   new THREE.Float32BufferAttribute(dep,1));
    g.setIndex(indices); g.computeVertexNormals();
    return {geom:g, tris:indices.length/3};
  }

  // ---- strategy builders: each returns { meshes:[...], count } ------------------
  function buildSurfaces(c,p){
    const out=[]; let tris=0;
    const fast=isoGeom(c,p,+1), slow=isoGeom(c,p,-1);
    if(fast){ out.push(tagMesh(new THREE.Mesh(fast.geom, surfMaterial(FAST_COLOR)), 4.0)); tris+=fast.tris; }
    if(slow){ out.push(tagMesh(new THREE.Mesh(slow.geom, surfMaterial(SLOW_COLOR)), 4.1)); tris+=slow.tris; }
    return {meshes:out, count:tris, label:'isosurfaces', unit:'tris'};
  }

  function buildWire(c,p){
    const out=[]; let tris=0;
    const fast=isoGeom(c,p,+1), slow=isoGeom(c,p,-1);
    if(fast){ out.push(tagMesh(new THREE.Mesh(fast.geom, wireMaterial(FAST_COLOR)), 4.0)); tris+=fast.tris; }
    if(slow){ out.push(tagMesh(new THREE.Mesh(slow.geom, wireMaterial(SLOW_COLOR)), 4.1)); tris+=slow.tris; }
    return {meshes:out, count:tris, label:'wire', unit:'tris'};
  }

  function buildPoints(c,p){
    const {sm,agreeArr,nlon,nlat,nd,depths}=c, agreeMin=p.agreeMin, thr=p.threshold;
    const STEP=2; // subsample lat/lon to keep instance counts sane
    // collect per-sign instances
    const collect=(sign)=>{
      const mats=[], depA=[], magA=[];
      const dummy=new THREE.Object3D();
      for(let di=0;di<nd;di++){
        const depth=depths[di], r=depthToUnit(depth), ad=depth/EARTH_RADIUS;
        for(let j=0;j<nlat;j+=STEP)for(let i=0;i<nlon;i+=STEP){
          const k=(di*nlat+j)*nlon+i;
          const v=sm[k], ag=agreeArr[k];
          if(ag<agreeMin) continue;
          if(sign>0 ? v<=thr : v>=-thr) continue;   // |v|>thr with the right sign
          const lat=90-(j+0.5)/nlat*180, lon=-180+(i+0.5)/nlon*360;
          const pp=latLonToVec3(lat,lon,r);
          dummy.position.set(pp.x,pp.y,pp.z); dummy.scale.setScalar(1); dummy.rotation.set(0,0,0);
          dummy.updateMatrix();
          mats.push(dummy.matrix.clone());
          depA.push(ad);
          magA.push(Math.min(1, Math.abs(v)*ag));   // alpha ∝ |dvs|·agree
        }
      }
      return {mats,depA,magA};
    };
    const out=[]; let total=0;
    const mkInst=(data,color,order)=>{
      if(!data.mats.length) return;
      // Each InstancedMesh gets its OWN geometry: instanced attributes (aDepth/aMag)
      // live on the geometry, so a shared base would clobber the first instance's data.
      const geom=new THREE.IcosahedronGeometry(0.006, 0);
      const mat=ptsMaterial(color);
      const inst=new THREE.InstancedMesh(geom, mat, data.mats.length);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for(let n=0;n<data.mats.length;n++) inst.setMatrixAt(n, data.mats[n]);
      inst.instanceMatrix.needsUpdate=true;
      const depArr=new Float32Array(data.depA), magArr=new Float32Array(data.magA);
      geom.setAttribute('aDepth', new THREE.InstancedBufferAttribute(depArr,1));
      geom.setAttribute('aMag',   new THREE.InstancedBufferAttribute(magArr,1));
      total+=data.mats.length;
      out.push(tagMesh(inst, order));
    };
    const fast=collect(+1), slow=collect(-1);
    mkInst(fast, FAST_COLOR, 4.0);
    mkInst(slow, SLOW_COLOR, 4.1);
    return {meshes:out, count:total, unit:'points', label:'points'};
  }

  // ---- 'volume': fill the body with radially-stretched translucent blobs ---------
  function buildVolume(c,p){
    const {sm,agreeArr,nlon,nlat,nd,depths}=c, agreeMin=p.agreeMin, thr=p.threshold;
    const up=new THREE.Vector3(0,1,0), q=new THREE.Quaternion(), dir=new THREE.Vector3(), dummy=new THREE.Object3D();
    const collect=(sign)=>{
      const mats=[], depA=[], magA=[];
      for(let di=0;di<nd;di++){
        const depth=depths[di], r=depthToUnit(depth), ad=depth/EARTH_RADIUS;
        // radial half-height bridges to the neighbouring depth layers so columns fill solid
        const rUp = di<nd-1 ? depthToUnit(depths[di+1]) : r-0.012;
        const rDn = di>0    ? depthToUnit(depths[di-1]) : r+0.012;
        const radH = Math.abs(rDn-rUp)*0.62 + 0.006;
        for(let j=0;j<nlat;j++)for(let i=0;i<nlon;i++){
          const k=(di*nlat+j)*nlon+i, v=sm[k], ag=agreeArr[k];
          if(ag<agreeMin) continue;
          if(sign>0 ? v<=thr : v>=-thr) continue;
          const lat=90-(j+0.5)/nlat*180, lon=-180+(i+0.5)/nlon*360;
          const pp=latLonToVec3(lat,lon,r); dir.copy(pp).normalize();
          q.setFromUnitVectors(up, dir);                 // stand the blob up along the radius
          const latS=0.030 + 0.014*r;                    // wider lateral fill toward the surface
          dummy.position.copy(pp); dummy.quaternion.copy(q); dummy.scale.set(latS, radH, latS); dummy.updateMatrix();
          mats.push(dummy.matrix.clone()); depA.push(ad); magA.push(Math.min(1, Math.abs(v)*ag));
        }
      }
      return {mats,depA,magA};
    };
    const out=[]; let total=0;
    const mkInst=(data,color,order)=>{
      if(!data.mats.length) return;
      const geom=new THREE.IcosahedronGeometry(1,0);     // unit blob; instanceMatrix scales it
      const inst=new THREE.InstancedMesh(geom, volMaterial(color), data.mats.length);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for(let n=0;n<data.mats.length;n++) inst.setMatrixAt(n, data.mats[n]);
      inst.instanceMatrix.needsUpdate=true;
      geom.setAttribute('aDepth', new THREE.InstancedBufferAttribute(new Float32Array(data.depA),1));
      geom.setAttribute('aMag',   new THREE.InstancedBufferAttribute(new Float32Array(data.magA),1));
      total+=data.mats.length; out.push(tagMesh(inst, order));
    };
    mkInst(collect(+1), FAST_COLOR, 4.0);
    mkInst(collect(-1), SLOW_COLOR, 4.1);
    return {meshes:out, count:total, unit:'blobs', label:'volume'};
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

  const BUILDERS={ surfaces:buildSurfaces, points:buildPoints, wire:buildWire, volume:buildVolume };

  function build(){
    disposeMeshes();
    const c=cluster(curField, curParams);
    const strat=BUILDERS[curParams.strategy] ? curParams.strategy : 'surfaces';
    let res={meshes:[], count:0, unit:'tris', label:strat};
    if(c){ res=BUILDERS[strat](c, curParams); }
    meshes=res.meshes;
    for(const m of meshes){ applyState(m); group.add(m); }
    if(typeof console!=='undefined')
      console.log(`data bodies: ${res.label} — ${res.count} ${res.unit} (${meshes.length} mesh${meshes.length===1?'':'es'})`);
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
  function setCutaway(on){ state.clip=on?1:0; for(const m of meshes){ const u=m.material&&m.material.uniforms; if(u&&u.uClip) u.uClip.value=state.clip; } }
  function setCurDepth(frac){ state.curDepth=frac; for(const m of meshes){ const u=m.material&&m.material.uniforms; if(u&&u.uCurDepth) u.uCurDepth.value=frac; } }
  function setBand(frac){ state.band=frac; for(const m of meshes){ const u=m.material&&m.material.uniforms; if(u&&u.uBand) u.uBand.value=frac; } }
  function setOpacity(o){ state.opacity=o; for(const m of meshes){ const u=m.material&&m.material.uniforms; if(u&&u.uOpacity) u.uOpacity.value=o; } }

  // initial build
  curParams={...DEFAULTS, ...(params||{})};
  state.band=curParams.band; state.opacity=curParams.opacity;
  rebuild(field, null);

  return { group, rebuild, setStrategy, setCutaway, setCurDepth, setBand, setOpacity };
}
