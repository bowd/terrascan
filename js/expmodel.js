// expmodel.js — procedural 3-D models of what each experiment actually probes, so
// "zoom to target" drops you onto the Great Pyramid (with the muon-found Big Void),
// a volcano's plumbing, an underground neutrino detector, the IceCube array, etc.
// Geometry is built in LOCAL metres (x=east, y=north, z=up, z=0 = ground) and the
// group's matrix maps it to the site's surface point on the globe, scaled to view.
import * as THREE from 'three';
import { latLonToVec3 } from './geo.js';

const TARGET = 0.13;     // app-units the model's characteristic size maps to

// translucent fresnel shell — glows at grazing angles, see-through face-on
function shellMat(hex, opacity){
  return new THREE.ShaderMaterial({ transparent:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.NormalBlending,
    uniforms:{ uColor:{value:new THREE.Color(hex)}, uOpacity:{value:opacity} },
    vertexShader:`varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; vN=normalMatrix*normal; gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
      void main(){ vec3 N=normalize(vN); vec3 V=normalize(vV); float f=pow(1.0-abs(dot(N,V)),1.5);
        gl_FragColor=vec4(uColor*(0.5+0.9*f), uOpacity*(0.5+0.5*f)); }` });
}
const lineMat=(hex,op=0.7)=>new THREE.LineBasicMaterial({color:hex, transparent:true, opacity:op, depthWrite:false, blending:THREE.AdditiveBlending});
const glowMat=(hex,op=0.85)=>new THREE.MeshBasicMaterial({color:hex, transparent:true, opacity:op, depthWrite:false, blending:THREE.AdditiveBlending});

export function makeExpModel(exp){
  const m = exp.model || {type:'sphere', r:8};
  const [lat,lon] = [exp.lat, exp.lon];
  const anchor = latLonToVec3(lat, lon, 1.0);
  const up     = anchor.clone().normalize();
  const east   = latLonToVec3(lat, lon+0.02, 1).sub(latLonToVec3(lat, lon-0.02, 1)).normalize();
  const north  = latLonToVec3(lat+0.02, lon, 1).sub(latLonToVec3(lat-0.02, lon, 1)).normalize();

  const group=new THREE.Group(); group.renderOrder=7;
  const disposables=[];
  const track=(o)=>{ if(o.geometry) disposables.push(o.geometry); if(o.material) disposables.push(o.material); return o; };
  const add=(o)=>{ group.add(track(o)); return o; };
  const edges=(geo,hex,op)=>{ const e=new THREE.EdgesGeometry(geo); const l=new THREE.LineSegments(e, lineMat(hex,op)); disposables.push(e); return l; };

  let size=150;        // characteristic size (m) used to normalise the view scale

  if(m.type==='pyramid'){
    size=150;
    const half=115, h=146.6;
    // four translucent faces + edges
    const pg=new THREE.ConeGeometry(half*Math.SQRT2, h, 4, 1); pg.rotateX(Math.PI/2); pg.rotateZ(Math.PI/4); pg.translate(0,0,h/2);
    const faces=new THREE.Mesh(pg, shellMat(0xe9d6a8, 0.16)); faces.renderOrder=7.0; add(faces);
    const fe=edges(pg, 0xffe9bf, 0.5); fe.renderOrder=7.2; group.add(fe);
    // known chambers (approx), z up from base
    const box=(cx,cy,cz,sx,sy,sz,rotX,hex,op)=>{ const g=new THREE.BoxGeometry(sx,sy,sz); const me=new THREE.Mesh(g, shellMat(hex,op));
      me.position.set(cx,cy,cz); if(rotX) me.rotation.x=rotX; me.renderOrder=7.1; add(me);
      const le=edges(g, hex, 0.8); le.position.copy(me.position); le.rotation.copy(me.rotation); group.add(le); return me; };
    box(0,0,43, 10.5,5.2,5.8, 0, 0x8fd0ff, 0.5);                 // King's Chamber
    box(0,2,21, 5.7,5.2,6.0, 0, 0x8fd0ff, 0.4);                  // Queen's Chamber
    box(0,-6,32, 2.1,46,8.7, Math.PI/2-0.45, 0x9fe8c0, 0.35);    // Grand Gallery (inclined)
    const void_=box(0,-8,62, 3.5,32,7, Math.PI/2-0.45, 0xffd24a, 0.7); // the Big Void (muon discovery)
    // a few muon trajectories raining down through the void into a detector below
    const rv=[]; const det=[0,18,16];
    for(let i=0;i<7;i++){ const x=(i-3)*9, top=[x, det[1]-40+i*4, h+90];
      rv.push(top[0],top[1],top[2], det[0],det[1],det[2]); }
    const rays=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rv,3)), lineMat(0xffcf5a,0.28));
    disposables.push(rays.geometry, rays.material); rays.renderOrder=6.9; group.add(rays);
  }
  else if(m.type==='volcano'){
    size=Math.max(m.r, m.h);
    const cg=new THREE.ConeGeometry(m.r, m.h, 48, 1, true); cg.rotateX(Math.PI/2); cg.translate(0,0,m.h/2);
    add(new THREE.Mesh(cg, shellMat(0xc98b6a, 0.18)));
    group.add(edges(cg, 0xffb48a, 0.32));
    // crater rim ring + conduit + magma chamber
    const conduit=new THREE.CylinderGeometry(m.r*0.05, m.r*0.09, m.h+1500, 20, 1, true); conduit.rotateX(Math.PI/2); conduit.translate(0,0,(m.h-1500)/2);
    add(new THREE.Mesh(conduit, shellMat(0xff7a3a, 0.35)));
    const chamber=new THREE.SphereGeometry(m.r*0.4, 24, 16); chamber.translate(0,0,-1700);
    add(new THREE.Mesh(chamber, glowMat(0xff5a2a, 0.5)));
  }
  else if(m.type==='sphere'){
    size=(m.r||8)*5;
    const r=m.r||8, zc=-r*4;
    const cavern=new THREE.IcosahedronGeometry(r*2.2, 1); cavern.translate(0,0,zc);
    group.add(edges(cavern, 0x6b7790, 0.3));
    const vessel=new THREE.SphereGeometry(r, 32, 24); vessel.translate(0,0,zc);
    add(new THREE.Mesh(vessel, shellMat(0x6fe0ff, 0.18)));
    // PMT shell as a point cloud
    const pv=[]; const N=600; for(let i=0;i<N;i++){ const y=1-2*(i+0.5)/N, rr=Math.sqrt(1-y*y), ph=i*2.399963;
      pv.push(Math.cos(ph)*rr*r*1.35, Math.sin(ph)*rr*r*1.35, y*r*1.35+zc); }
    const pm=new THREE.PointsMaterial({color:0xbfeaff, size:0.0026, sizeAttenuation:true, transparent:true, opacity:0.5, depthWrite:false, blending:THREE.AdditiveBlending});
    const pmts=new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pv,3)), pm);
    disposables.push(pmts.geometry, pmts.material); group.add(pmts);
    // access shaft up to the surface
    const sv=[0,0,0, 0,0,zc+r*2.2];
    const shaft=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(sv,3)), lineMat(0x9aa6bd,0.4));
    disposables.push(shaft.geometry, shaft.material); group.add(shaft);
  }
  else if(m.type==='icecube'){
    size=1000;
    const s=500, top=-150, bot=-1150;                          // compressed depth
    const cube=new THREE.BoxGeometry(2*s,2*s,bot-top); cube.translate(0,0,(top+bot)/2);
    group.add(edges(cube, 0x8fd0ff, 0.45));
    const sv=[], dv=[];
    for(let i=-3;i<=3;i++) for(let j=-3;j<=3;j++){ const x=i*s/3.2, y=j*s/3.2;
      sv.push(x,y,top, x,y,bot);
      for(let k=0;k<=8;k++) dv.push(x,y, top+(bot-top)*k/8);
    }
    const strings=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(sv,3)), lineMat(0x7fc4ff,0.6));
    disposables.push(strings.geometry, strings.material); group.add(strings);
    const dm=new THREE.PointsMaterial({color:0xeaf6ff, size:0.0032, sizeAttenuation:true, transparent:true, opacity:0.95, depthWrite:false, blending:THREE.AdditiveBlending});
    const doms=new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(dv,3)), dm);
    disposables.push(doms.geometry, doms.material); group.add(doms);
  }
  else if(m.type==='building'){
    size=120;
    for(let i=0;i<4;i++){ const g=new THREE.BoxGeometry(40,40,45); const me=new THREE.Mesh(g, shellMat(0xbcc6d6,0.2));
      me.position.set((i-1.5)*48,0,22.5); add(me); const le=edges(g,0xd8e2f2,0.45); le.position.copy(me.position); group.add(le);
      const core=new THREE.CylinderGeometry(7,7,18,16); core.rotateX(Math.PI/2); core.translate((i-1.5)*48,0,14);
      add(new THREE.Mesh(core, glowMat(i<3?0xff7a3a:0x6fe0ff, 0.6))); }
  }

  // group matrix: local ENU metres → world, scaled so `size` ≈ TARGET app-units
  const scale=TARGET/size;
  const basisM=new THREE.Matrix4().makeBasis(east, north, up);
  const M=new THREE.Matrix4().multiplyMatrices(basisM, new THREE.Matrix4().makeScale(scale,scale,scale));
  M.setPosition(anchor);
  group.matrix.copy(M); group.matrixAutoUpdate=false;

  // framing: centre a bit above ground, radius from `size`
  const center=anchor.clone().addScaledVector(up, (m.type==='sphere'?-(m.r||8)*4: m.type==='icecube'?-650 : size*0.3)*scale);
  const radius=size*scale*0.9;
  function dispose(){ for(const d of disposables){ try{ d.dispose(); }catch(e){} } }
  return { group, center, radius, anchor, up, name:exp.name, dispose };
}
