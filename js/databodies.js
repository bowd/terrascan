// databodies.js — STRUCTURAL representation of the REAL data. The ensemble is a
// continuous volume, so we extract coherent 3-D SURFACES from it (not a scatter of
// spheres): an isosurface wrapping the fast/cold anomalies (subducted slabs, blue)
// and one wrapping the slow/hot anomalies (LLSVP piles & plumes, red). Surfaces are
// meshed with naive Surface Nets in (lon,lat,depth) grid space, then each vertex is
// warped onto the globe. Opacity is gated to the depth you're peeled to, so the lit
// band sweeps through the bodies as you slide — but the whole shape stays visible.
import * as THREE from 'three';
import { EARTH_RADIUS, depthToUnit } from './earthModel.js';
import { latLonToVec3 } from './geo.js';

const THRESH=0.55;     // |ΔVs| % iso-level for a body surface
const AGREE_MIN=0.4;   // models must agree this much or the cell is "outside"

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

// ---- shader: translucent fresnel body, brightest at the lit depth band ---------
const VERT=`
  attribute float aDepth;
  uniform float uCurDepth,uBand;
  varying float vProx; varying vec3 vN; varying vec3 vView;
  void main(){
    vProx = 1.0 - smoothstep(0.0, uBand, abs(aDepth-uCurDepth));
    vec4 mv = modelViewMatrix*vec4(position,1.0);
    vN = normalize(normalMatrix*normal); vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix*mv;
  }`;
const FRAG=`
  uniform vec3 uColor; uniform float uOpacity;
  varying float vProx; varying vec3 vN; varying vec3 vView;
  void main(){
    float fres = pow(1.0-abs(dot(normalize(vN),normalize(vView))), 2.0);
    vec3 col = uColor*(0.42+0.58*vProx) + uColor*fres*0.7;
    float a  = uOpacity*(0.16+0.62*vProx) + fres*0.18*uOpacity;
    gl_FragColor = vec4(col, a);
  }`;

function bodyMesh(geom, color){
  const mat=new THREE.ShaderMaterial({ vertexShader:VERT, fragmentShader:FRAG,
    transparent:true, depthWrite:false, depthTest:true, side:THREE.DoubleSide,
    uniforms:{ uColor:{value:new THREE.Color(...color)}, uCurDepth:{value:0}, uBand:{value:0.07}, uOpacity:{value:1} } });
  const m=new THREE.Mesh(geom,mat); m.frustumCulled=false; m.renderOrder=4; return m;
}

export function makeDataBodies(ens){
  const {depths,nlon,nlat,dvsScale,dvs,agree}=ens, nd=depths.length;
  // smoothed signed field + agreement gate (light 3-D blur merges specks into bodies)
  const N=nd*nlat*nlon, sm=new Float32Array(N);
  const at=(di,j,i)=>dvs[(di*nlat+((j+nlat)%nlat))*nlon+((i%nlon)+nlon)%nlon]/dvsScale;
  for(let di=0;di<nd;di++)for(let j=0;j<nlat;j++)for(let i=0;i<nlon;i++){
    let s=at(di,j,i)*0.4, w=0.4;
    const nb=[[di-1,j,i],[di+1,j,i],[di,j-1,i],[di,j+1,i],[di,j,i-1],[di,j,i+1]];
    for(const [d,y,x] of nb){ if(d<0||d>=nd) continue; s+=at(d,y,x)*0.1; w+=0.1; }
    sm[di*nlat*nlon+j*nlon+i]=s/w;
  }
  // padded coord lookups (sentinels at poles & depth ends → surfaces close cleanly)
  const PLAT=[92]; for(let m=0;m<nlat;m++) PLAT.push(90-(m+0.5)/nlat*180); PLAT.push(-92);
  const PDEP=[depths[0]-80]; for(let m=0;m<nd;m++) PDEP.push(depths[m]); PDEP.push(depths[nd-1]+80);
  const interp=(arr,f)=>{ const i0=Math.max(0,Math.min(arr.length-2,Math.floor(f))); return arr[i0]+(arr[i0+1]-arr[i0])*(f-i0); };
  const NX=nlon+1, NY=nlat+2, NZ=nd+2;
  const toWorld=(fx,fy,fz)=>{
    const lon=-180+(fx+0.5)/nlon*360;
    const lat=Math.max(-89.9,Math.min(89.9,interp(PLAT,fy)));
    const depth=Math.max(8,Math.min(2950,interp(PDEP,fz)));
    const p=latLonToVec3(lat,lon,depthToUnit(depth));
    return {x:p.x,y:p.y,z:p.z, d:depth/EARTH_RADIUS};
  };
  const fieldFor=(sign)=>(x,y,z)=>{
    if(z===0||z===NZ-1||y===0||y===NY-1) return -1000;
    const di=z-1, j=y-1, i=x%nlon;
    if(agree[(di*nlat+j)*nlon+i]/255 < AGREE_MIN) return -1000;
    return sign*sm[di*nlat*nlon+j*nlon+i] - THRESH;
  };
  const build=(sign,color)=>{
    const {pos,dep,indices}=surfaceNets(NX,NY,NZ, fieldFor(sign), toWorld);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('aDepth',   new THREE.Float32BufferAttribute(dep,1));
    g.setIndex(indices); g.computeVertexNormals();
    return {mesh:bodyMesh(g,color), tris:indices.length/3};
  };
  const fast=build(+1,[0.42,0.62,1.0]);   // cold/fast → blue (slabs)
  const slow=build(-1,[1.0,0.40,0.32]);   // hot/slow  → red  (LLSVPs, plumes)
  const group=new THREE.Group(); group.add(fast.mesh, slow.mesh);
  if(typeof console!=='undefined') console.log('data bodies: isosurfaces', fast.tris+slow.tris, 'tris (fast',fast.tris,'slow',slow.tris,')');
  const each=(fn)=>{ fn(fast.mesh.material.uniforms); fn(slow.mesh.material.uniforms); };
  return {
    group,
    setCurDepth:(u)=>each(uu=>uu.uCurDepth.value=u),
    setOpacity:(o)=>each(uu=>uu.uOpacity.value=o),
  };
}
