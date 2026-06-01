// geo.js — geographic reference: coastlines, a land mask for the coverage field,
// a graticule, and the single lat/lon -> 3D mapping everything shares.
import * as THREE from 'three';

const D2R = Math.PI/180;

// The one true mapping. Inverse of the shader's texture sampling, so coastlines,
// markers and the baked scan texture all line up on the sphere.
export function latLonToVec3(lat, lon, r=1){
  const la=lat*D2R, lo=lon*D2R, cl=Math.cos(la);
  return new THREE.Vector3(-Math.cos(lo)*cl*r, Math.sin(la)*r, Math.sin(lo)*cl*r);
}

export async function loadGeo(){
  const [coastlines, land, borders] = await Promise.all([
    fetch('./data/coastlines.json').then(r=>r.json()),
    fetch('./data/land.json').then(r=>r.json()),
    fetch('./data/borders.json').then(r=>r.json()),
  ]);
  return {coastlines, land, borders};
}

// Rasterise land polygons to an equirectangular 0..1 mask (W*H, row 0 = north).
export function rasterizeLand(land, W, H){
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#fff';
  for(const poly of land){
    ctx.beginPath();
    for(const ring of poly){
      for(let i=0;i<ring.length;i++){
        const x=(ring[i][0]+180)/360*W;
        const y=(90-ring[i][1])/180*H;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  const img=ctx.getImageData(0,0,W,H).data;
  const mask=new Float32Array(W*H);
  for(let i=0;i<W*H;i++) mask[i]=img[i*4]/255;
  return mask;
}

// Coastlines as LineSegments at a given radius.
export function buildCoastlines(coastlines, radius, color=0x8fd0ff, opacity=0.42){
  const verts=[];
  for(const line of coastlines){
    for(let i=0;i<line.length-1;i++){
      const a=latLonToVec3(line[i][1], line[i][0], radius);
      const b=latLonToVec3(line[i+1][1], line[i+1][0], radius);
      verts.push(a.x,a.y,a.z, b.x,b.y,b.z);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
  const m=new THREE.LineBasicMaterial({color, transparent:true, opacity,
    depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending});
  const seg=new THREE.LineSegments(g,m);
  seg.renderOrder=6;
  return seg;
}

// Faint lat/lon graticule.
export function buildGraticule(radius, color=0x3a5074, opacity=0.28){
  const verts=[];
  const arc=(la0,lo0,la1,lo1,steps)=>{
    let pa=latLonToVec3(la0,lo0,radius);
    for(let s=1;s<=steps;s++){
      const t=s/steps;
      const pb=latLonToVec3(la0+(la1-la0)*t, lo0+(lo1-lo0)*t, radius);
      verts.push(pa.x,pa.y,pa.z, pb.x,pb.y,pb.z); pa=pb;
    }
  };
  for(let lat=-60;lat<=60;lat+=30) arc(lat,-180,lat,180,180);
  for(let lon=-180;lon<180;lon+=30) arc(-85,lon,85,lon,120);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
  const m=new THREE.LineBasicMaterial({color, transparent:true, opacity, depthWrite:false, depthTest:false});
  const seg=new THREE.LineSegments(g,m);
  seg.renderOrder=5;
  return seg;
}
