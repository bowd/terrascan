// structures.js — "Extracted features": the hand-curated named structures (slabs, LLSVPs,
// plumes, cratons, ridges) rendered as smooth translucent SURFACES — one oriented ellipsoid
// per feature, sized to its published extent and aligned tangent to the globe. Deliberately
// a DIFFERENT palette from the measured data bodies (azure / amber vs deep blue / red) so the
// interpretation reads distinctly from the data. Footprints + invisible pick proxies as before.
import * as THREE from 'three';
import { FEATURES, CATEGORY } from './tomography.js';
import { EARTH_RADIUS, depthToUnit } from './earthModel.js';
import { latLonToVec3 } from './geo.js';

// distinct shades from the data bodies' deep blue/red — keep cold/hot coding, shift hue:
const ANOM = { fast:[0.45,0.82,1.0], slow:[1.0,0.62,0.28] };   // azure (cold) · amber (hot)
const catRGB = (id)=>{ const c=new THREE.Color(Object.values(CATEGORY).sort((a,b)=>a.id-b.id)[id].color); return [c.r,c.g,c.b]; };
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// per-type DETAIL sampling: points in (lat,lon,depth) — used to build the surface footprints
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

// ---- per-feature ellipsoid SURFACE shader (instanced) --------------------------
const VERT=`
  attribute float aDepth, aAlpha, aFeature, aSupport;
  attribute vec3 aColorA, aColorB;
  uniform float uCurDepth,uFocus,uMode,uSelFeature,uFocusing,uHoverFeature,uSize;
  varying float vAD; varying float vSup; varying float vHi; varying float vA;
  varying vec3 vColor; varying vec3 vN; varying vec3 vView;
  void main(){
    vAD = aDepth; vSup = aSupport;
    float prox = 1.0 - smoothstep(0.0, uFocus, abs(aDepth-uCurDepth));
    float sel  = (uFocusing>0.5 && abs(aFeature-uSelFeature)<0.5) ? 1.0 : 0.0;
    float hov  = (abs(aFeature-uHoverFeature)<0.5) ? 1.0 : 0.0;
    vHi = mix(0.5 + 0.5*prox, 1.2, sel) + hov*0.35;
    vColor = mix(aColorA, aColorB, uMode);
    float vis = uFocusing<0.5 ? 1.0 : (sel>0.5 ? 1.3 : 0.04);
    vA = aAlpha*vis*(1.0 + hov*0.4);
    vec3 lp = position*uSize;                                  // uSize = global body-size dial
    vec4 mv = modelViewMatrix*instanceMatrix*vec4(lp,1.0);
    vN = normalize(normalMatrix*mat3(instanceMatrix)*normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix*mv;
  }`;
const FRAG=`
  uniform float uOpacity, uGlow, uDataLink, uClip, uCurDepth;
  varying float vAD; varying float vSup; varying float vHi; varying float vA;
  varying vec3 vColor; varying vec3 vN; varying vec3 vView;
  void main(){
    if(uClip>0.5 && vAD < uCurDepth - 0.001) discard;          // cutaway: drop above the cut
    float ndv = abs(dot(normalize(vN), normalize(vView)));
    float fres = pow(1.0-ndv, 2.5);                            // bright rim -> reads as a surface/membrane
    float link = mix(1.0, vSup, uDataLink);                    // survey link: fade toward measured support
    vec3 col = vColor*(0.34*vHi) + vColor*fres*0.95;
    float a  = (0.085 + 0.55*fres) * vHi * vA * uOpacity * uGlow * link;
    if(a < 0.004) discard;
    gl_FragColor = vec4(col, a);
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
    const col=f.anomaly==='fast'?0x6fd0ff:0xffae5a;   // match the azure/amber feature palette
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
  function setFootSolo(f){   // for focus: show only this feature's footprint
    for(const [feat,m] of byFeature){ const on=feat===f; m.lmat.opacity=on?1.0:0.0; m.smat.opacity=on?0.6:0.0; }
  }
  return {group, setFootHover, setFootSolo};
}

export function makeStructures(){
  const rnd=mulberry32(20260601);
  const N=FEATURES.length;
  const aDep=new Float32Array(N), aCa=new Float32Array(N*3), aCb=new Float32Array(N*3),
        aAl=new Float32Array(N), aFe=new Float32Array(N), aSup=new Float32Array(N).fill(1);
  const llt=new Float32Array(N), lln=new Float32Array(N), ldp=new Float32Array(N);
  const mats=[]; const pickProxies=[]; const info=new Map(); const footData=[];
  const proxyGeo=new THREE.SphereGeometry(1,8,6), proxyMat=new THREE.MeshBasicMaterial();
  const east=new THREE.Vector3(), north=new THREE.Vector3(), radial=new THREE.Vector3(), up=new THREE.Vector3();
  const DEG=Math.PI/180;

  FEATURES.forEach((f, fi)=>{
    const midD=(f.dTop+f.dBot)/2, rC=depthToUnit(midD);
    const p=latLonToVec3(f.lat,f.lon,rC);
    radial.copy(p).normalize();
    up.set(0,1,0); if(Math.abs(radial.y)>0.98) up.set(1,0,0);
    east.crossVectors(up,radial).normalize();
    north.crossVectors(radial,east).normalize();
    // half-extents (tangential from the published angular size; radial from the depth span)
    let sRad=Math.max(0.012,(f.dBot-f.dTop)/2/EARTH_RADIUS);
    if(rC+sRad>0.985) sRad=Math.max(0.008,0.985-rC);                 // keep the body inside the globe
    const sEast=Math.max(0.02, f.lonExt*DEG*rC);
    const sNorth=Math.max(0.02, f.latExt*DEG*rC);
    const m=new THREE.Matrix4().makeBasis(east,north,radial);
    m.setPosition(p); m.scale(new THREE.Vector3(sEast,sNorth,sRad));
    mats.push(m);
    aDep[fi]=midD/EARTH_RADIUS;
    const ac=ANOM[f.anomaly], bc=catRGB(CATEGORY[f.type].id);
    aCa[fi*3]=ac[0]; aCa[fi*3+1]=ac[1]; aCa[fi*3+2]=ac[2];
    aCb[fi*3]=bc[0]; aCb[fi*3+1]=bc[1]; aCb[fi*3+2]=bc[2];
    aAl[fi]=1.0; aFe[fi]=fi; llt[fi]=f.lat; lln[fi]=f.lon; ldp[fi]=midD;
    const pr=new THREE.Mesh(proxyGeo,proxyMat); pr.position.copy(p);
    pr.scale.setScalar(Math.max(sEast,sNorth,sRad)*0.9); pr.userData={feature:f}; pr.updateMatrixWorld(); pickProxies.push(pr);
    info.set(f,{ center:p.clone(), index:fi, radius:Math.max(sEast,sNorth,sRad) });
    footData.push({f, dirs:sampleDetail(f,rnd).map(([la,lo])=>latLonToVec3(la,lo,1)), midR:rC});
  });

  const base=new THREE.IcosahedronGeometry(1,3);   // smooth ellipsoid
  base.setAttribute('aDepth',  new THREE.InstancedBufferAttribute(aDep,1));
  base.setAttribute('aColorA', new THREE.InstancedBufferAttribute(aCa,3));
  base.setAttribute('aColorB', new THREE.InstancedBufferAttribute(aCb,3));
  base.setAttribute('aAlpha',  new THREE.InstancedBufferAttribute(aAl,1));
  base.setAttribute('aFeature',new THREE.InstancedBufferAttribute(aFe,1));
  base.setAttribute('aSupport',new THREE.InstancedBufferAttribute(aSup,1));

  const mat=new THREE.ShaderMaterial({ transparent:true, depthTest:false, depthWrite:false,
    side:THREE.DoubleSide, blending:THREE.NormalBlending, vertexShader:VERT, fragmentShader:FRAG,
    uniforms:{ uCurDepth:{value:0}, uFocus:{value:0.03}, uMode:{value:0}, uOpacity:{value:0.9},
      uGlow:{value:0.7}, uSize:{value:0.9}, uDataLink:{value:0},
      uSelFeature:{value:-1}, uFocusing:{value:0}, uHoverFeature:{value:-1}, uClip:{value:0} } });

  const mesh=new THREE.InstancedMesh(base, mat, N); mesh.frustumCulled=false; mesh.renderOrder=4;
  for(let i=0;i<N;i++) mesh.setMatrixAt(i, mats[i]);
  mesh.instanceMatrix.needsUpdate=true;
  const foot=buildFootprints(footData);

  return {
    group:mesh, pickProxies, footGroup:foot.group, setFootHover:foot.setFootHover, setFootSolo:foot.setFootSolo,
    setCurDepth:(u)=>mat.uniforms.uCurDepth.value=u,
    setCutaway:(on)=>mat.uniforms.uClip.value = on?1:0,
    setMode:(m)=>mat.uniforms.uMode.value=m,
    setOpacity:(o)=>mat.uniforms.uOpacity.value=o,
    setGlow:(v)=>mat.uniforms.uGlow.value=v,
    setSize:(v)=>mat.uniforms.uSize.value=v,
    setDataLink:(v)=>mat.uniforms.uDataLink.value=v,
    setDataSupport:(fn)=>{ if(!fn) return; const a=base.getAttribute('aSupport');
      for(let i=0;i<N;i++) a.array[i]=fn(llt[i],lln[i],ldp[i]); a.needsUpdate=true; },
    setFocusBand:(v)=>mat.uniforms.uFocus.value=v,
    setHover:(f)=>{ mat.uniforms.uHoverFeature.value = f ? info.get(f).index : -1; },
    focus:(f)=>{ if(!f){ mat.uniforms.uFocusing.value=0; } else { mat.uniforms.uFocusing.value=1; mat.uniforms.uSelFeature.value=info.get(f).index; } },
    infoFor:(f)=>info.get(f),
  };
}
