// structures.js — features as a blob FIELD placed in true (lat,lon,depth) space
// so it always hugs the globe (never tangential / never pokes out). Each feature
// is drawn at two scales at once: many small blobs (raw resolution) + a sparse
// set of big soft blobs (the low-res "cluster" / rough shape). One additive
// instanced cloud for looks; light invisible proxies for hover/extract picking.
import * as THREE from 'three';
import { FEATURES, CATEGORY } from './tomography.js';
import { EARTH_RADIUS, depthToUnit } from './earthModel.js';
import { latLonToVec3 } from './geo.js';

const ANOM = { fast:[0.42,0.62,1.0], slow:[1.0,0.38,0.30] };
const catRGB = (id)=>{ const c=new THREE.Color(Object.values(CATEGORY).sort((a,b)=>a.id-b.id)[id].color); return [c.r,c.g,c.b]; };
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// per-type DETAIL sampling: points in (lat,lon,depth) — the raw resolution
function sampleDetail(f, rnd){
  const pts=[], span=f.dBot-f.dTop, push=(lat,lon,depth,scale)=>pts.push([lat,lon,depth,scale]);
  if(f.type==='plume'){
    const N=40;
    for(let i=0;i<N;i++){ const t=i/(N-1), depth=f.dBot+(f.dTop-f.dBot)*t;
      push(f.lat+Math.cos(t*7+f.lat)*1.5, f.lon+Math.sin(t*8+f.lon)*1.6, depth, 0.013+0.011*t); }
    for(let i=0;i<14;i++){ const a=rnd()*6.283, rr=rnd()*f.lonExt*0.9;
      push(f.lat+Math.sin(a)*rr*0.6, f.lon+Math.cos(a)*rr, f.dTop+span*0.05*rnd(), 0.018); }
  } else if(f.type==='slab'){
    const strikeLat=f.latExt>=f.lonExt, along=22, down=9;
    for(let a=0;a<along;a++) for(let d=0;d<down;d++){
      const ta=a/(along-1)*2-1, td=d/(down-1), depth=f.dTop+span*td;
      let lat=f.lat, lon=f.lon;
      if(strikeLat){ lat+=ta*f.latExt; lon+=(td-0.4)*f.lonExt*1.2; } else { lon+=ta*f.lonExt; lat+=(td-0.4)*f.latExt*1.2; }
      push(lat+(rnd()-0.5)*1.4, lon+(rnd()-0.5)*1.4, depth, 0.018); }
  } else if(f.type==='llsvp'){
    const N= span>1500?260:130;
    for(let i=0;i<N;i++){ let x,y,z,r2; do{x=rnd()*2-1;y=rnd()*2-1;z=rnd()*2-1;r2=x*x+y*y+z*z;}while(r2>1);
      const depth=Math.max(f.dTop, f.dBot-Math.abs(z)*span);
      push(f.lat+x*f.latExt, f.lon+y*f.lonExt, depth, 0.03); }
  } else if(f.type==='ulvz'){
    for(let i=0;i<18;i++){ const a=rnd()*6.283, rr=rnd();
      push(f.lat+Math.sin(a)*rr*f.latExt, f.lon+Math.cos(a)*rr*f.lonExt, f.dBot-rnd()*span, 0.02); }
  } else if(f.type==='craton'){
    for(let i=0;i<80;i++){ const a=rnd()*6.283, rr=Math.sqrt(rnd());
      push(f.lat+Math.sin(a)*rr*f.latExt, f.lon+Math.cos(a)*rr*f.lonExt, f.dTop+span*rnd()*0.92, 0.02); }
  } else if(f.type==='ridge'){
    const strikeLat=f.latExt>=f.lonExt;
    for(let i=0;i<34;i++){ const t=i/33*2-1;
      const lat=f.lat+(strikeLat?t*f.latExt:(rnd()-0.5)*f.lonExt);
      const lon=f.lon+(strikeLat?(rnd()-0.5)*f.lonExt:t*f.lonExt);
      push(lat, lon, f.dTop+span*rnd()*0.85, 0.014); }
  } else push(f.lat,f.lon,(f.dTop+f.dBot)/2,0.02);
  return pts;
}

const VERT=`precision highp float;
  uniform mat4 modelViewMatrix, projectionMatrix;
  uniform float uCurDepth,uFocus,uMode,uSelFeature,uFocusing;
  attribute vec3 position, aOffset, aColorA, aColorB;
  attribute float aScale, aDepth, aAlpha, aFeature;
  varying vec3 vColor; varying float vHi; varying float vA; varying vec3 vL;
  void main(){
    float prox = 1.0 - smoothstep(0.0, uFocus, abs(aDepth-uCurDepth));
    float sel = (uFocusing>0.5 && abs(aFeature-uSelFeature)<0.5) ? 1.0 : 0.0;
    vHi = mix(0.30 + 1.05*prox, 1.35, sel);          // isolated feature is fully lit, any depth
    vColor = mix(aColorA, aColorB, uMode);
    float vis = uFocusing<0.5 ? 1.0 : (sel>0.5 ? 1.4 : 0.05);
    vA = aAlpha*vis; vL = position;
    vec3 wp = aOffset + position*aScale*(1.0+0.5*prox);
    gl_Position = projectionMatrix*modelViewMatrix*vec4(wp,1.0);
  }`;
const FRAG=`precision highp float;
  uniform float uOpacity;
  varying vec3 vColor; varying float vHi; varying float vA; varying vec3 vL;
  void main(){
    float edge=0.5+0.5*pow(clamp(vL.z*0.5+0.5,0.0,1.0),1.5);
    gl_FragColor=vec4(vColor*vHi*edge*vA*uOpacity, 1.0);
  }`;

export function makeStructures(){
  const rnd=mulberry32(20260601);
  const off=[],scl=[],ca=[],cb=[],dep=[],alp=[],fea=[];
  const pickProxies=[]; const info=new Map();
  const proxyGeo=new THREE.SphereGeometry(1,8,6), proxyMat=new THREE.MeshBasicMaterial();
  let fi=0;

  function add(lat,lon,depth,scale,alpha,fidx,aCol,bCol){
    let p=latLonToVec3(lat,lon,depthToUnit(depth));
    const maxR=0.985-scale; if(p.length()>maxR) p.setLength(Math.max(0.05,maxR)); // keep blobs inside the globe
    off.push(p.x,p.y,p.z); scl.push(scale);
    ca.push(aCol[0],aCol[1],aCol[2]); cb.push(bCol[0],bCol[1],bCol[2]);
    dep.push(1.0-p.length()); alp.push(alpha); fea.push(fidx);
    return p;
  }

  for(const f of FEATURES){
    const midD=(f.dTop+f.dBot)/2, rC=depthToUnit(midD);
    const aCol=ANOM[f.anomaly], bCol=catRGB(CATEGORY[f.type].id);
    const det=sampleDetail(f,rnd);
    const bigR=Math.max(0.05, Math.min(0.12, Math.max(f.latExt,f.lonExt)*Math.PI/180*rC*0.42));
    const stride=Math.max(2, Math.floor(det.length/12));
    for(let i=0;i<det.length;i++){
      const [lat,lon,depth,scale]=det[i];
      add(lat,lon,depth,scale,0.55,fi,aCol,bCol);                 // raw-resolution detail
      if(i%stride===0){                                           // sparse low-res cluster blob
        const p=add(lat,lon,depth,bigR,0.26,fi,aCol,bCol);
        const pr=new THREE.Mesh(proxyGeo,proxyMat); pr.position.copy(p); pr.scale.setScalar(bigR*1.15);
        pr.userData={feature:f}; pr.updateMatrixWorld(); pickProxies.push(pr);
      }
    }
    info.set(f,{ center:latLonToVec3(f.lat,f.lon,rC), index:fi,
      radius:Math.max(bigR, Math.max(f.latExt,f.lonExt)*Math.PI/180*rC, (f.dBot-f.dTop)/2/EARTH_RADIUS*0.7) });
    fi++;
  }

  const base=new THREE.IcosahedronGeometry(1,1);
  const g=new THREE.InstancedBufferGeometry();
  g.index=base.index; g.setAttribute('position', base.attributes.position);
  g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(off),3));
  g.setAttribute('aScale',  new THREE.InstancedBufferAttribute(new Float32Array(scl),1));
  g.setAttribute('aColorA', new THREE.InstancedBufferAttribute(new Float32Array(ca),3));
  g.setAttribute('aColorB', new THREE.InstancedBufferAttribute(new Float32Array(cb),3));
  g.setAttribute('aDepth',  new THREE.InstancedBufferAttribute(new Float32Array(dep),1));
  g.setAttribute('aAlpha',  new THREE.InstancedBufferAttribute(new Float32Array(alp),1));
  g.setAttribute('aFeature',new THREE.InstancedBufferAttribute(new Float32Array(fea),1));
  g.instanceCount=scl.length;

  const mat=new THREE.RawShaderMaterial({ transparent:true, depthTest:false, depthWrite:false,
    blending:THREE.AdditiveBlending, vertexShader:VERT, fragmentShader:FRAG,
    uniforms:{ uCurDepth:{value:0}, uFocus:{value:0.03}, uMode:{value:0}, uOpacity:{value:1},
      uSelFeature:{value:-1}, uFocusing:{value:0} } });

  const mesh=new THREE.Mesh(g,mat); mesh.frustumCulled=false; mesh.renderOrder=4;

  return {
    group:mesh, pickProxies,
    setCurDepth:(u)=>mat.uniforms.uCurDepth.value=u,
    setMode:(m)=>mat.uniforms.uMode.value=m,
    setOpacity:(o)=>mat.uniforms.uOpacity.value=o,
    focus:(f)=>{ if(!f){ mat.uniforms.uFocusing.value=0; } else { mat.uniforms.uFocusing.value=1; mat.uniforms.uSelFeature.value=info.get(f).index; } },
    infoFor:(f)=>info.get(f),
  };
}
