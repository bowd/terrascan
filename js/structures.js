// structures.js — interpolate the point/surface features into translucent 3D
// bodies inside the volume, so you read the interior as anatomy rather than a
// flat slice: plumes = rising conduits, slabs = dipping sheets, LLSVPs = basal
// piles, cratons = shallow keels, ULVZs = patches on the core. One instanced
// blob cloud; the band at the current depth lights up as you dive.
import * as THREE from 'three';
import { FEATURES, CATEGORY } from './tomography.js';
import { EARTH_RADIUS, depthToUnit } from './earthModel.js';
import { latLonToVec3 } from './geo.js';

const ANOM = { fast:[0.42,0.62,1.0], slow:[1.0,0.36,0.28] };
const catRGB = (id)=>{ const c=new THREE.Color(Object.values(CATEGORY).sort((a,b)=>a.id-b.id)[id].color); return [c.r,c.g,c.b]; };

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// sample a feature's 3D envelope into points {lat,lon,depth,scale,alpha}
function sampleFeature(f, rnd){
  const pts=[], span=f.dBot-f.dTop;
  const push=(lat,lon,depth,scale,alpha)=>pts.push([lat,lon,depth,scale,alpha]);
  if(f.type==='plume'){
    const N=36;
    for(let i=0;i<N;i++){ const t=i/(N-1), depth=f.dBot+(f.dTop-f.dBot)*t;
      push(f.lat+Math.cos(t*7+f.lat)*1.5, f.lon+Math.sin(t*8+f.lon)*1.6, depth, 0.015+0.012*t, 0.55); }
    for(let i=0;i<12;i++){ const a=rnd()*6.283, rr=rnd()*f.lonExt*0.9;       // mushroom head
      push(f.lat+Math.sin(a)*rr*0.6, f.lon+Math.cos(a)*rr, f.dTop+span*0.05*rnd(), 0.022, 0.42); }
  } else if(f.type==='slab'){
    const strikeLat=f.latExt>=f.lonExt, along=20, down=8;
    for(let a=0;a<along;a++) for(let d=0;d<down;d++){
      const ta=a/(along-1)*2-1, td=d/(down-1), depth=f.dTop+span*td;
      let lat=f.lat, lon=f.lon;
      if(strikeLat){ lat+=ta*f.latExt; lon+=(td-0.4)*f.lonExt*1.3; }
      else { lon+=ta*f.lonExt; lat+=(td-0.4)*f.latExt*1.3; }
      push(lat+(rnd()-0.5)*1.6, lon+(rnd()-0.5)*1.6, depth, 0.02, 0.42); }
  } else if(f.type==='llsvp'){
    const N= span>1500?240:120;
    for(let i=0;i<N;i++){ let x,y,z,r2; do{x=rnd()*2-1;y=rnd()*2-1;z=rnd()*2-1;r2=x*x+y*y+z*z;}while(r2>1);
      const depth=Math.max(f.dTop, f.dBot-Math.abs(z)*span);            // dense at the base
      push(f.lat+x*f.latExt, f.lon+y*f.lonExt, depth, 0.038, 0.32); }
  } else if(f.type==='ulvz'){
    for(let i=0;i<16;i++){ const a=rnd()*6.283, rr=rnd();
      push(f.lat+Math.sin(a)*rr*f.latExt, f.lon+Math.cos(a)*rr*f.lonExt, f.dBot-rnd()*span, 0.024, 0.62); }
  } else if(f.type==='craton'){
    for(let i=0;i<72;i++){ const a=rnd()*6.283, rr=Math.sqrt(rnd());
      push(f.lat+Math.sin(a)*rr*f.latExt, f.lon+Math.cos(a)*rr*f.lonExt, f.dTop+span*rnd()*0.92, 0.022, 0.34); }
  } else if(f.type==='ridge'){
    const strikeLat=f.latExt>=f.lonExt;
    for(let i=0;i<32;i++){ const t=i/31*2-1;
      const lat=f.lat+(strikeLat?t*f.latExt:(rnd()-0.5)*f.lonExt);
      const lon=f.lon+(strikeLat?(rnd()-0.5)*f.lonExt:t*f.lonExt);
      push(lat, lon, f.dTop+span*rnd()*0.85, 0.015, 0.42); }
  } else { push(f.lat,f.lon,(f.dTop+f.dBot)/2,0.02,0.4); }
  return pts;
}

export function makeStructures(){
  const rnd=mulberry32(20260601);
  const off=[], scl=[], ca=[], cb=[], dep=[], alp=[];
  for(const f of FEATURES){
    const aCol=ANOM[f.anomaly], bCol=catRGB(CATEGORY[f.type].id);
    for(const [lat,lon,depth,scale,alpha] of sampleFeature(f,rnd)){
      const p=latLonToVec3(lat,lon, depthToUnit(depth));
      off.push(p.x,p.y,p.z); scl.push(scale);
      ca.push(aCol[0],aCol[1],aCol[2]); cb.push(bCol[0],bCol[1],bCol[2]);
      dep.push(depth/EARTH_RADIUS); alp.push(alpha*(0.55+0.55*(f.conf||0.5)));
    }
  }
  const count=scl.length;

  const base=new THREE.IcosahedronGeometry(1,1);
  const geo=new THREE.InstancedBufferGeometry();
  geo.index=base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(off),3));
  geo.setAttribute('aScale',  new THREE.InstancedBufferAttribute(new Float32Array(scl),1));
  geo.setAttribute('aColorA', new THREE.InstancedBufferAttribute(new Float32Array(ca),3));
  geo.setAttribute('aColorB', new THREE.InstancedBufferAttribute(new Float32Array(cb),3));
  geo.setAttribute('aDepth',  new THREE.InstancedBufferAttribute(new Float32Array(dep),1));
  geo.setAttribute('aAlpha',  new THREE.InstancedBufferAttribute(new Float32Array(alp),1));
  geo.instanceCount=count;

  const mat=new THREE.RawShaderMaterial({
    transparent:true, depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ uCurDepth:{value:0}, uFocus:{value:0.022}, uMode:{value:0}, uOpacity:{value:1} },
    vertexShader:`precision highp float;
      uniform mat4 modelViewMatrix, projectionMatrix;
      uniform float uCurDepth, uFocus, uMode;
      attribute vec3 position, aOffset, aColorA, aColorB;
      attribute float aScale, aDepth, aAlpha;
      varying vec3 vColor; varying float vHi; varying float vAlpha; varying vec3 vL;
      void main(){
        float prox = 1.0 - smoothstep(0.0, uFocus, abs(aDepth-uCurDepth));
        vHi = 0.24 + 1.10*prox;   // off-band bodies fade to faint ghosts; the current depth blazes
        vColor = mix(aColorA, aColorB, uMode);
        vAlpha = aAlpha; vL = position;
        vec3 wp = aOffset + position*aScale*(1.0+0.5*prox);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(wp,1.0);
      }`,
    fragmentShader:`precision highp float;
      uniform float uOpacity;
      varying vec3 vColor; varying float vHi; varying float vAlpha; varying vec3 vL;
      void main(){
        float edge = 0.55 + 0.45*pow(clamp(vL.z*0.5+0.5,0.0,1.0),1.5); // faux lighting
        gl_FragColor = vec4(vColor*vHi*edge*vAlpha*uOpacity, 1.0);     // additive
      }`,
  });

  const mesh=new THREE.Mesh(geo, mat);
  mesh.frustumCulled=false;
  mesh.renderOrder=4;
  return {
    mesh,
    setCurDepth:(u)=>mat.uniforms.uCurDepth.value=u,
    setMode:(m)=>mat.uniforms.uMode.value=m,
    setOpacity:(o)=>mat.uniforms.uOpacity.value=o,
  };
}
