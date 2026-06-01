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

// 2D convex hull (monotone chain)
function convexHull(pts){
  const p=pts.slice().sort((a,b)=>a.x-b.x||a.y-b.y); if(p.length<3) return p;
  const cr=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lo=[]; for(const q of p){ while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0) lo.pop(); lo.push(q); }
  const up=[]; for(let i=p.length-1;i>=0;i--){ const q=p[i]; while(up.length>=2&&cr(up[up.length-2],up[up.length-1],q)<=0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
// each feature's points projected radially to the surface -> footprint outline + a stem
function buildFootprints(footData){
  const group=new THREE.Group(); group.renderOrder=6; group.visible=false;
  const byFeature=new Map();
  for(const {f,dirs,midR} of footData){
    const com=new THREE.Vector3(); dirs.forEach(d=>com.add(d)); if(com.lengthSq()<1e-6) continue; com.normalize();
    const ref=Math.abs(com.y)<0.95?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
    const u=new THREE.Vector3().crossVectors(ref,com).normalize();
    const v=new THREE.Vector3().crossVectors(com,u).normalize();
    let hull=convexHull(dirs.map(d=>({x:d.dot(u),y:d.dot(v)}))); if(hull.length<3) continue;
    const cx=hull.reduce((s,p)=>s+p.x,0)/hull.length, cy=hull.reduce((s,p)=>s+p.y,0)/hull.length;
    hull=hull.map(p=>({x:cx+(p.x-cx)*1.12, y:cy+(p.y-cy)*1.12}));   // small outward margin
    const verts=[];
    for(const p of hull){
      const k=Math.max(0,1-p.x*p.x-p.y*p.y);
      const dir=com.clone().multiplyScalar(Math.sqrt(k)).addScaledVector(u,p.x).addScaledVector(v,p.y).normalize();
      verts.push(dir.x*1.002, dir.y*1.002, dir.z*1.002);
    }
    const col=f.anomaly==='fast'?0x6f9bff:0xff6b5a;
    const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
    const lmat=new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.55,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending});
    const loop=new THREE.LineLoop(lg,lmat); loop.renderOrder=6; group.add(loop);
    const a=com.clone().multiplyScalar(midR), b=com.clone().multiplyScalar(1.002);   // stem: feature -> surface
    const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.Float32BufferAttribute([a.x,a.y,a.z,b.x,b.y,b.z],3));
    const smat=new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.15,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending});
    group.add(new THREE.Line(sg,smat));
    byFeature.set(f,{lmat,smat});
  }
  function setFootHover(f){
    for(const [,m] of byFeature){ m.lmat.opacity=0.55; m.smat.opacity=0.15; }
    if(f && byFeature.has(f)){ const m=byFeature.get(f); m.lmat.opacity=0.95; m.smat.opacity=0.5; }
  }
  return {group, setFootHover};
}

export function makeStructures(){
  const rnd=mulberry32(20260601);
  const off=[],scl=[],ca=[],cb=[],dep=[],alp=[],fea=[];
  const pickProxies=[]; const info=new Map(); const footData=[];
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
    footData.push({f, dirs:det.map(([la,lo])=>latLonToVec3(la,lo,1)), midR:rC});
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
  const foot=buildFootprints(footData);

  return {
    group:mesh, pickProxies, footGroup:foot.group, setFootHover:foot.setFootHover,
    setCurDepth:(u)=>mat.uniforms.uCurDepth.value=u,
    setMode:(m)=>mat.uniforms.uMode.value=m,
    setOpacity:(o)=>mat.uniforms.uOpacity.value=o,
    focus:(f)=>{ if(!f){ mat.uniforms.uFocusing.value=0; } else { mat.uniforms.uFocusing.value=1; mat.uniforms.uSelFeature.value=info.get(f).index; } },
    infoFor:(f)=>info.get(f),
  };
}
