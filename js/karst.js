// karst.js — the shallowest layer: the planet's soluble-rock skin.
//
// Two things, both about the top few km of crust (so they ride on the surface,
// like coastlines, not in the deep-mantle slices):
//   • KARST BELTS  — outcrops of carbonate/evaporite rock where caves dissolve out.
//     Drawn as faint glowing patches + outlines, tinted by regime (flooded-coastal /
//     alpine / continental). These stand in for the *unmapped* frontier: caves almost
//     certainly thread this rock, but only a sliver has ever been surveyed.
//   • CAVE SYSTEMS — the *mapped* part: real surveyed long/deep caves and flooded
//     systems (cenotes, blue holes, sumps, springs). Dots sized by magnitude, tinted
//     by whether they're water-filled. Hover for stats + source, click to open it.
import * as THREE from 'three';
import { latLonToVec3 } from './geo.js';

const D2R = Math.PI/180;

// radii just above the 1.0 surface so karst sits on the skin, over coast/borders
const R_FILL = 1.0016, R_LINE = 1.0021, R_DOT = 1.0040;
// base opacities for the belt wash + outline (fade() scales these by hemisphere facing)
const FILL_OP = 0.12, LINE_OP = 0.52;

// cave dot tint: flooded (water-filled) vs dry passage vs depth-record
const CAVE_COL = { water:0x3fd6e6, dry:0xffb24d, deep:0xc792ff };
// karst-belt tint by hydrological regime
const REGION_COL = { 'flooded-coastal':0x35c6dc, 'alpine':0x93a8e0, 'continental':0x8fcf93 };

const SHORT = (n)=>String(n||'').replace(/\s*\(.*?\)\s*/g,' ').trim();

// classify a merged cave record into a colour bucket
function bucket(c){
  if(c.flooded) return 'water';
  if(c.cat==='deep' || (c.depth_m && c.depth_m>=1500 && !c.len_km)) return 'deep';
  return 'dry';
}
// visual weight 0..1 from length (km) and depth (m), whichever is more impressive
function weight(c){
  const byLen = c.len_km ? Math.min(1, c.len_km/686) : 0;     // Mammoth ~686 km == 1
  const byDep = c.depth_m ? Math.min(1, c.depth_m/2212) : 0;  // Veryovkina ~2212 m == 1
  return Math.max(byLen, byDep);
}

function makeLabel(text, hexColor){
  const cv=document.createElement('canvas'); cv.width=320; cv.height=64;
  const ctx=cv.getContext('2d');
  ctx.font='600 26px ui-monospace, Menlo, monospace';
  ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,0.92)'; ctx.shadowBlur=7;
  ctx.fillStyle=hexColor; ctx.beginPath(); ctx.arc(13,32,5.5,0,7); ctx.fill();
  ctx.shadowBlur=9; ctx.fillStyle='#eaf6ff'; ctx.fillText(text, 26, 34);
  const tex=new THREE.CanvasTexture(cv); tex.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.SpriteMaterial({map:tex, transparent:true, depthTest:false, depthWrite:false});
  const sp=new THREE.Sprite(mat);
  const w=0.34; sp.scale.set(w, w*cv.height/cv.width, 1);
  sp.center.set(0.04,0.5);
  return sp;
}

export function makeKarst(data){
  const group=new THREE.Group(); group.renderOrder=6;
  const regions=[];     // {centre, fillMat, lineMat}
  const pins=[];        // {cave, dot, label, dotMat, labelMat, centre}
  const pickDots=[];

  const D = data || {};
  const REG = Array.isArray(D.regions) ? D.regions : [];
  const CAV = Array.isArray(D.caves)   ? D.caves   : [];

  // ---- karst belts: a faint additive wash + an outline, per region -------------
  for(const r of REG){
    const poly = Array.isArray(r.poly) ? r.poly.filter(p=>Array.isArray(p)&&p.length>=2) : [];
    if(poly.length<3) continue;
    const col = REGION_COL[r.regime] || 0x8fcf93;
    const centre = latLonToVec3(r.lat, r.lon, 1).normalize();

    // fan-fill from the centroid (star-shaped belts → no self-overlap)
    const fv=[];
    const cVec=latLonToVec3(r.lat, r.lon, R_FILL);
    for(let i=0;i<poly.length;i++){
      const a=poly[i], b=poly[(i+1)%poly.length];
      const va=latLonToVec3(a[1], a[0], R_FILL), vb=latLonToVec3(b[1], b[0], R_FILL);
      fv.push(cVec.x,cVec.y,cVec.z, va.x,va.y,va.z, vb.x,vb.y,vb.z);
    }
    const fg=new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fv,3));
    const fillMat=new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:FILL_OP,
      depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide});
    const fill=new THREE.Mesh(fg, fillMat); fill.renderOrder=4.5; group.add(fill);

    // outline: densify each edge along the sphere so the belt curves cleanly
    const lv=[]; const STEPS=10;
    for(let i=0;i<poly.length;i++){
      const a=poly[i], b=poly[(i+1)%poly.length];
      for(let s=0;s<STEPS;s++){
        const t0=s/STEPS, t1=(s+1)/STEPS;
        const p0=latLonToVec3(a[1]+(b[1]-a[1])*t0, a[0]+(b[0]-a[0])*t0, R_LINE);
        const p1=latLonToVec3(a[1]+(b[1]-a[1])*t1, a[0]+(b[0]-a[0])*t1, R_LINE);
        lv.push(p0.x,p0.y,p0.z, p1.x,p1.y,p1.z);
      }
    }
    const lg=new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lv,3));
    const lineMat=new THREE.LineBasicMaterial({color:col, transparent:true, opacity:LINE_OP,
      depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending});
    const line=new THREE.LineSegments(lg, lineMat); line.renderOrder=5.4; group.add(line);

    regions.push({centre, fillMat, lineMat});
  }

  // ---- mapped caves: dots sized by magnitude, tinted by flooded/dry/deep --------
  const DOT=new THREE.SphereGeometry(1, 12, 12);
  for(const c of CAV){
    if(typeof c.lat!=='number' || typeof c.lon!=='number') continue;
    const b=bucket(c), col=CAVE_COL[b];
    const hex='#'+col.toString(16).padStart(6,'0');
    const centre=latLonToVec3(c.lat, c.lon, 1).normalize();
    const pos=latLonToVec3(c.lat, c.lon, R_DOT);
    const rad=0.006 + 0.012*Math.sqrt(weight(c));
    const dotMat=new THREE.MeshBasicMaterial({color:col, transparent:true,
      depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending});
    const dot=new THREE.Mesh(DOT, dotMat);
    dot.position.copy(pos); dot.scale.setScalar(rad); dot.renderOrder=7.5;
    dot.userData={cave:c};
    group.add(dot); pickDots.push(dot);

    let label=null, labelMat=null;
    if(c.label){                                  // only the marquee systems get a standing label
      label=makeLabel(SHORT(c.name), hex);
      label.position.copy(pos).addScaledVector(centre, 0.045); label.renderOrder=8.5;
      group.add(label); labelMat=label.material;
    }
    // caves with a real 3-D survey get a ring — a "click to enter" affordance
    let ringMat=null;
    if(c.model){
      const t1=new THREE.Vector3(0,1,0).cross(centre); if(t1.lengthSq()<1e-6) t1.set(1,0,0); t1.normalize();
      const t2=centre.clone().cross(t1).normalize();
      const rv=[]; const RN=44, rr=Math.max(0.018, rad*2.6);
      for(let i=0;i<=RN;i++){ const a=i/RN*Math.PI*2;
        const pp=pos.clone().addScaledVector(t1,Math.cos(a)*rr).addScaledVector(t2,Math.sin(a)*rr);
        rv.push(pp.x,pp.y,pp.z); }
      const rg=new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rv,3));
      ringMat=new THREE.LineBasicMaterial({color:col, transparent:true, opacity:0.85,
        depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending});
      const ring=new THREE.Line(rg, ringMat); ring.renderOrder=7.6; group.add(ring);
    }
    pins.push({cave:c, dot, label, dotMat, labelMat, ringMat, centre});
  }

  // hemisphere fade: hide what's on the back of the globe (called from the render loop)
  const _n=new THREE.Vector3();
  function fade(camDirNorm){
    for(const p of pins){
      const f=p.centre.dot(camDirNorm);
      const o=THREE.MathUtils.smoothstep(f, -0.05, 0.35);
      p.dotMat.opacity=Math.max(o*0.95, 0.10);
      if(p.labelMat) p.labelMat.opacity=o;
      if(p.ringMat) p.ringMat.opacity=o*0.85;
    }
    for(const r of regions){
      const f=r.centre.dot(camDirNorm);
      const o=THREE.MathUtils.smoothstep(f, -0.15, 0.45);
      r.fillMat.opacity=FILL_OP*o;
      r.lineMat.opacity=LINE_OP*o;
    }
  }

  // tooltip markup for a cave (matches the experiment-pin tooltip style)
  function infoHTML(c){
    const stats=[];
    if(c.len_km)  stats.push(`${c.len_km>=10?Math.round(c.len_km):c.len_km} km surveyed`);
    if(c.depth_m) stats.push(`−${c.depth_m} m deep`);
    const kind = c.flooded ? 'flooded / underwater' : 'dry passage';
    return `<b>${c.name}</b>`+
      `<span class="tip-type">${(c.type||'cave').replace(/-/g,' ')} · ${kind}</span>`+
      `<span class="tip-d">${[c.country, stats.join(' · ')].filter(Boolean).join(' — ')}`+
      `${c.note?'<br>'+c.note:''}${c.source?'<br>'+c.source:''}`+
      `<br>${c.model?'click to fly into the 3-D survey ↘':'click to look it up ↗'}</span>`;
  }

  return { group, pins, pickDots, regions, fade, infoHTML };
}
