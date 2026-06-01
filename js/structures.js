// structures.js — each feature as ONE coherent, fuzzy 3D body (a noise-deformed
// ellipsoid with a soft glowing outline) rather than a scatter of points. Each
// mesh is pickable (carries its feature in userData) so it can be hovered and
// "extracted". The body brightens while the current depth is inside its range.
import * as THREE from 'three';
import { FEATURES, CATEGORY } from './tomography.js';
import { EARTH_RADIUS, depthToUnit } from './earthModel.js';
import { latLonToVec3 } from './geo.js';

const D2R = Math.PI/180;
const ANOM = { fast:[0.45,0.64,1.0], slow:[1.0,0.42,0.32] };
const catRGB = (id)=>{ const c=new THREE.Color(Object.values(CATEGORY).sort((a,b)=>a.id-b.id)[id].color); return [c.r,c.g,c.b]; };

function h3(x,y,z){ let n=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453; return n-Math.floor(n); }
function noise3(x,y,z){
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z), xf=x-xi,yf=y-yi,zf=z-zi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf), L=(a,b,t)=>a+(b-a)*t;
  return L(L(L(h3(xi,yi,zi),h3(xi+1,yi,zi),u),L(h3(xi,yi+1,zi),h3(xi+1,yi+1,zi),u),v),
           L(L(h3(xi,yi,zi+1),h3(xi+1,yi,zi+1),u),L(h3(xi,yi+1,zi+1),h3(xi+1,yi+1,zi+1),u),v),w);
}

const VERT=`
  varying vec3 vN; varying vec3 vV;
  void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0);
    vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz);
    gl_Position=projectionMatrix*mv; }`;
const FRAG=`
  precision highp float;
  varying vec3 vN; varying vec3 vV;
  uniform vec3 uColorA,uColorB; uniform float uMode,uHi,uConf,uSel,uFade,uOpacity;
  void main(){
    float ndv=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);
    float fres=pow(1.0-ndv,2.2);
    vec3 col=mix(uColorA,uColorB,uMode);
    col*=(0.45+0.6*uHi);
    col+=col*fres*0.9;                  // glowing soft rim => fuzzy outline
    float a=(0.12+0.40*ndv)*uHi*uFade*uOpacity;
    a*=(0.45+0.55*uConf);               // poorly-constrained bodies read fainter
    a+=uSel*fres*0.6;                   // selected: bright rim
    col*=(1.0+uSel*0.5);
    gl_FragColor=vec4(col,a);
  }`;

export function makeStructures(){
  const base=new THREE.IcosahedronGeometry(1,3);
  const group=new THREE.Group(); group.renderOrder=4;
  const meshes=[]; let fi=0;

  for(const f of FEATURES){
    fi++;
    const midD=(f.dTop+f.dBot)/2, rC=depthToUnit(midD);
    const center=latLonToVec3(f.lat,f.lon,rC);
    const maxE=Math.max(f.latExt,f.lonExt), minE=Math.min(f.latExt,f.lonExt);
    let sx=maxE*D2R*rC, sz=minE*D2R*rC, sy=Math.max(0.02,(f.dBot-f.dTop)/2/EARTH_RADIUS);
    let lump=0.32, tilt=0;
    if(f.type==='plume'){ sx=sz=Math.max(0.03,f.lonExt*D2R*rC*1.1); sy=Math.max(sy,0.12); lump=0.22; }
    else if(f.type==='slab'){ sz*=0.5; sy=Math.max(sy,0.05); lump=0.28; tilt=0.5; }
    else if(f.type==='llsvp'){ sy=Math.max(sy,0.10); lump=0.42; }
    else if(f.type==='ulvz'){ sy=Math.max(0.02,sy*0.6); lump=0.30; }
    else if(f.type==='craton'){ sy=Math.max(0.02,sy*0.7); lump=0.34; }
    else if(f.type==='ridge'){ sz*=0.4; lump=0.30; }

    const g=base.clone(), pos=g.attributes.position, seed=fi*3.7;
    for(let i=0;i<pos.count;i++){ const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      const d=1.0+lump*(noise3(x*1.6+seed,y*1.6+seed,z*1.6+seed)-0.5)*2.0
                 +0.12*(noise3(x*3.4+seed,y*3.4,z*3.4)-0.5)*2.0;
      pos.setXYZ(i,x*d,y*d,z*d); }
    g.computeVertexNormals();

    const aCol=ANOM[f.anomaly], bCol=catRGB(CATEGORY[f.type].id);
    const mat=new THREE.ShaderMaterial({ transparent:true, depthTest:false, depthWrite:false,
      side:THREE.DoubleSide, blending:THREE.NormalBlending, vertexShader:VERT, fragmentShader:FRAG,
      uniforms:{ uColorA:{value:new THREE.Vector3(...aCol)}, uColorB:{value:new THREE.Vector3(...bCol)},
        uMode:{value:0}, uHi:{value:0.5}, uConf:{value:f.conf||0.5}, uSel:{value:0}, uFade:{value:1}, uOpacity:{value:1} } });

    const mesh=new THREE.Mesh(g,mat);
    mesh.scale.set(sx,sy,sz);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), center.clone().normalize());
    if(tilt){ const ax=new THREE.Vector3(1,0,0).applyQuaternion(mesh.quaternion); mesh.rotateOnWorldAxis(ax,tilt); }
    mesh.position.copy(center);
    mesh.renderOrder=4;
    mesh.userData={ feature:f, center:center.clone(), radius:Math.max(sx,sy,sz) };
    group.add(mesh); meshes.push(mesh);
  }

  function setCurDepth(d){
    for(const m of meshes){ const f=m.userData.feature, feather=250;
      let hi=0.30;
      if(d>f.dTop-feather && d<f.dBot+feather){
        const a=Math.min(1,(d-(f.dTop-feather))/feather), b=Math.min(1,((f.dBot+feather)-d)/feather);
        hi=0.30+0.85*Math.min(a,b);
      }
      m.material.uniforms.uHi.value=hi; }
  }
  const setMode=(mo)=>meshes.forEach(m=>m.material.uniforms.uMode.value=mo);
  const setOpacity=(o)=>meshes.forEach(m=>m.material.uniforms.uOpacity.value=o);
  function focus(sel){ for(const m of meshes){
    m.material.uniforms.uSel.value = m===sel?1:0;
    m.material.uniforms.uFade.value = sel ? (m===sel?1:0.07) : 1; } }

  return { group, meshes, setCurDepth, setMode, setOpacity, focus };
}
