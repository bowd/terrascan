// cavemodel.js — turn a baked real cave survey (data/caves/<id>.json) into a 3-D
// passage model, anchored + oriented at the cave's surface point on the globe and
// blown up to a visible size. Two layers: the centreline skeleton (glowing lines)
// and lofted LRUD passage walls (the "tubes" — real surveyed cross-sections).
//
// Baked JSON shape (all coords are local ENU centimetres relative to the top station):
//   { name, dot:[lat,lon], altTop, depthM, lengthKm,
//     segs:[e0,n0,u0,e1,n1,u1, …],            // centreline leg endpoints
//     walls:[ run, … ], run=[ ring, … ], ring=[Lx,Ly,Lz,Ux,Uy,Uz,Rx,Ry,Rz,Dx,Dy,Dz] }
import * as THREE from 'three';
import { latLonToVec3 } from './geo.js';

const TARGET = 0.135;   // app-units the cave's largest dimension maps to (Earth radius = 1)

export function makeCaveModel(model){
  const [lat,lon] = model.dot;
  const anchor = latLonToVec3(lat, lon, 1.0);                 // entrance ≈ surface point
  const up     = anchor.clone().normalize();
  const east   = latLonToVec3(lat, lon+0.02, 1).sub(latLonToVec3(lat, lon-0.02, 1)).normalize();
  const north  = latLonToVec3(lat+0.02, lon, 1).sub(latLonToVec3(lat-0.02, lon, 1)).normalize();

  // normalise size: largest centreline offset (m) -> TARGET app-units
  let maxr = 1;
  for(let i=0;i<model.segs.length;i+=3){
    const r=Math.hypot(model.segs[i]/100, model.segs[i+1]/100, model.segs[i+2]/100);
    if(r>maxr) maxr=r;
  }
  const scale = TARGET/maxr;                                  // app-units per metre
  const toW=(ecm,ncm,ucm)=>{
    const e=ecm/100*scale, n=ncm/100*scale, u=ucm/100*scale;
    return new THREE.Vector3(
      anchor.x + east.x*e + north.x*n + up.x*u,
      anchor.y + east.y*e + north.y*n + up.y*u,
      anchor.z + east.z*e + north.z*n + up.z*u);
  };

  const group=new THREE.Group(); group.renderOrder=7;

  // ---- centreline skeleton --------------------------------------------------
  const lv=[]; let cx=0,cy=0,cz=0,nc=0;
  for(let i=0;i<model.segs.length;i+=6){
    const a=toW(model.segs[i],model.segs[i+1],model.segs[i+2]);
    const b=toW(model.segs[i+3],model.segs[i+4],model.segs[i+5]);
    lv.push(a.x,a.y,a.z, b.x,b.y,b.z);
    cx+=a.x+b.x; cy+=a.y+b.y; cz+=a.z+b.z; nc+=2;
  }
  const lg=new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lv,3));
  const lineMat=new THREE.LineBasicMaterial({color:0xbfeaff, transparent:true, opacity:0.55,
    depthTest:true, depthWrite:false, blending:THREE.AdditiveBlending});
  const lines=new THREE.LineSegments(lg, lineMat); lines.renderOrder=7.3; group.add(lines);

  // ---- lofted LRUD passage walls -------------------------------------------
  const wv=[];
  const pt=(ring,k)=>toW(ring[k*3], ring[k*3+1], ring[k*3+2]);   // k: 0=L 1=U 2=R 3=D
  const EDGES=[[0,1],[1,2],[2,3],[3,0]];
  for(const run of model.walls){
    for(let i=0;i<run.length-1;i++){
      const A=run[i], B=run[i+1];
      for(const [p,q] of EDGES){
        const a0=pt(A,p), a1=pt(A,q), b0=pt(B,p), b1=pt(B,q);
        wv.push(a0.x,a0.y,a0.z, a1.x,a1.y,a1.z, b1.x,b1.y,b1.z);
        wv.push(a0.x,a0.y,a0.z, b1.x,b1.y,b1.z, b0.x,b0.y,b0.z);
      }
    }
  }
  const wg=new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wv,3));
  wg.computeVertexNormals();
  const wallMat=new THREE.ShaderMaterial({
    transparent:true, depthTest:true, depthWrite:true, side:THREE.DoubleSide, blending:THREE.NormalBlending,
    uniforms:{ uColor:{value:new THREE.Color(0xf0c98a)}, uEdge:{value:new THREE.Color(0xfff1d6)}, uOpacity:{value:0.66} },
    vertexShader:`varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; vN=normalMatrix*normal; gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`uniform vec3 uColor; uniform vec3 uEdge; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
      void main(){ vec3 N=normalize(vN); vec3 V=normalize(vV); float f=pow(1.0-abs(dot(N,V)),1.4);
        vec3 col=mix(uColor*0.55, uEdge, f); float a=uOpacity*(0.55+0.45*f); gl_FragColor=vec4(col,a); }`,
  });
  const walls=new THREE.Mesh(wg, wallMat); walls.renderOrder=7.1; group.add(walls);

  // ---- framing helpers ------------------------------------------------------
  const center = nc ? new THREE.Vector3(cx/nc, cy/nc, cz/nc) : anchor.clone();
  let radius=0.06;
  for(let i=0;i<lv.length;i+=3){ const d=center.distanceTo(new THREE.Vector3(lv[i],lv[i+1],lv[i+2])); if(d>radius) radius=d; }

  function setOpacity(v){ wallMat.uniforms.uOpacity.value=v; lineMat.opacity=Math.min(0.8,v*0.85); }
  function dispose(){ lg.dispose(); lineMat.dispose(); wg.dispose(); wallMat.dispose(); }

  return { group, center, radius, anchor, up,
    name:model.name, depthM:model.depthM, lengthKm:model.lengthKm,
    setOpacity, dispose };
}
