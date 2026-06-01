// tomography.js — the *scan*: a geographically-faithful synthesis of the major
// features global seismic tomography resolves, baked per-depth into a texture.
//   R = shear-velocity anomaly ΔVs  (0.5 = neutral, >0.5 fast/cold, <0.5 slow/hot)
//   G = resolution / confidence     (drives transparency — sparse coverage fades)
//   B = feature class id            (for the categorical colour mode)
// The radial model is real (PREM); these lateral features are an illustrative
// map of what we know is down there, not a pixel-exact re-render of one model.
import * as THREE from 'three';

export const TEX_W = 1024, TEX_H = 512;
const SAT = 2.2; // ΔVs (%) mapped to full colour saturation

export const CATEGORY = {
  none:  {id:0, color:0x202833, label:'—'},
  slab:  {id:1, color:0x5a8bff, label:'subducted slab'},
  llsvp: {id:2, color:0xff4d3d, label:'LLSVP'},
  ulvz:  {id:3, color:0xff8a1f, label:'ULVZ'},
  plume: {id:4, color:0xffc21f, label:'mantle plume'},
  craton:{id:5, color:0x62c4ff, label:'cratonic root'},
  ridge: {id:6, color:0x33ffa6, label:'ridge / rift'},
};
const CAT_BY_ID = Object.values(CATEGORY).sort((a,b)=>a.id-b.id);

// anomaly: 'fast' (cold/sinking, blue) or 'slow' (hot/rising, red)
// lat/lon = centre °, latExt/lonExt = ~1σ half-width °, dTop/dBot = depth km,
// mag = |ΔVs| %, conf = how confidently it is resolved (0..1)
export const FEATURES = [
  // ---- LLSVPs (the two great deep piles) ----
  {name:'African LLSVP (Tuzo)', type:'llsvp', lat:-10, lon:8, latExt:32, lonExt:44, dTop:1700, dBot:2891, anomaly:'slow', mag:2.4, conf:0.9},
  {name:'Pacific LLSVP (Jason)', type:'llsvp', lat:-6,lon:-168,latExt:30, lonExt:52, dTop:1700, dBot:2891, anomaly:'slow', mag:2.4, conf:0.85},
  // ---- ULVZs (thin, extreme patches hugging the core) ----
  {name:'Hawaiian mega-ULVZ', type:'ulvz', lat:17, lon:-161, latExt:6, lonExt:8, dTop:2840, dBot:2891, anomaly:'slow', mag:3.0, conf:0.5},
  {name:'Samoa mega-ULVZ', type:'ulvz', lat:-15, lon:-171, latExt:5, lonExt:7, dTop:2840, dBot:2891, anomaly:'slow', mag:3.0, conf:0.45},
  {name:'African-margin ULVZ', type:'ulvz', lat:6, lon:20, latExt:5, lonExt:8, dTop:2840, dBot:2891, anomaly:'slow', mag:2.8, conf:0.4},
  // ---- subducted / subducting slabs (fast) ----
  {name:'Farallon slab', type:'slab', lat:38, lon:-92, latExt:20, lonExt:26, dTop:700, dBot:2400, anomaly:'fast', mag:1.3, conf:0.85},
  {name:'Nazca slab (Andes)', type:'slab', lat:-20, lon:-69, latExt:24, lonExt:9, dTop:80, dBot:1500, anomaly:'fast', mag:1.6, conf:0.8},
  {name:'Cocos slab', type:'slab', lat:13, lon:-90, latExt:9, lonExt:8, dTop:80, dBot:1200, anomaly:'fast', mag:1.4, conf:0.6},
  {name:'Cascadia slab', type:'slab', lat:45, lon:-122, latExt:7, lonExt:5, dTop:40, dBot:500, anomaly:'fast', mag:1.0, conf:0.5},
  {name:'Aleutian slab', type:'slab', lat:53, lon:-174, latExt:7, lonExt:20, dTop:80, dBot:800, anomaly:'fast', mag:1.3, conf:0.6},
  {name:'Kuril–Japan slab', type:'slab', lat:43, lon:144, latExt:11, lonExt:7, dTop:80, dBot:1100, anomaly:'fast', mag:1.6, conf:0.8},
  {name:'Izu–Bonin–Marianas slab', type:'slab', lat:22, lon:143, latExt:16, lonExt:6, dTop:80, dBot:1100, anomaly:'fast', mag:1.6, conf:0.8},
  {name:'Tonga–Kermadec slab', type:'slab', lat:-23, lon:-176, latExt:16, lonExt:6, dTop:80, dBot:1500, anomaly:'fast', mag:1.9, conf:0.85},
  {name:'Sunda (Java) slab', type:'slab', lat:-7, lon:112, latExt:8, lonExt:24, dTop:80, dBot:1300, anomaly:'fast', mag:1.5, conf:0.75},
  {name:'Philippine slab', type:'slab', lat:10, lon:126, latExt:12, lonExt:6, dTop:80, dBot:900, anomaly:'fast', mag:1.3, conf:0.6},
  {name:'Hellenic (Aegean) slab', type:'slab', lat:36, lon:24, latExt:6, lonExt:9, dTop:80, dBot:900, anomaly:'fast', mag:1.3, conf:0.6},
  {name:'Tethyan slab (Zagros)', type:'slab', lat:34, lon:52, latExt:10, lonExt:18, dTop:300, dBot:1800, anomaly:'fast', mag:1.2, conf:0.55},
  {name:'India–Asia slab', type:'slab', lat:31, lon:84, latExt:8, lonExt:20, dTop:100, dBot:1100, anomaly:'fast', mag:1.2, conf:0.55},
  {name:'Calabrian slab', type:'slab', lat:39, lon:15, latExt:5, lonExt:5, dTop:80, dBot:700, anomaly:'fast', mag:1.1, conf:0.45},
  // ---- mantle plumes (slow, narrow conduits) ----
  {name:'Hawai‘i plume', type:'plume', lat:19, lon:-155, latExt:5, lonExt:5, dTop:0, dBot:2891, anomaly:'slow', mag:1.6, conf:0.6},
  {name:'Iceland plume', type:'plume', lat:65, lon:-18, latExt:5, lonExt:5, dTop:0, dBot:2400, anomaly:'slow', mag:1.5, conf:0.55},
  {name:'Afar plume', type:'plume', lat:11, lon:42, latExt:6, lonExt:6, dTop:0, dBot:2891, anomaly:'slow', mag:1.6, conf:0.6},
  {name:'Yellowstone plume', type:'plume', lat:44, lon:-110, latExt:4, lonExt:4, dTop:0, dBot:800, anomaly:'slow', mag:1.2, conf:0.4},
  {name:'Réunion plume', type:'plume', lat:-21, lon:56, latExt:5, lonExt:5, dTop:0, dBot:2891, anomaly:'slow', mag:1.5, conf:0.55},
  {name:'Samoa plume', type:'plume', lat:-14, lon:-172, latExt:5, lonExt:5, dTop:0, dBot:2891, anomaly:'slow', mag:1.4, conf:0.5},
  {name:'Galápagos plume', type:'plume', lat:0, lon:-91, latExt:4, lonExt:4, dTop:0, dBot:1000, anomaly:'slow', mag:1.1, conf:0.4},
  {name:'Tahiti (Society) plume', type:'plume', lat:-18, lon:-148, latExt:4, lonExt:4, dTop:0, dBot:2891, anomaly:'slow', mag:1.4, conf:0.45},
  {name:'Louisville plume', type:'plume', lat:-51, lon:-138, latExt:4, lonExt:4, dTop:0, dBot:2000, anomaly:'slow', mag:1.2, conf:0.4},
  {name:'Kerguelen plume', type:'plume', lat:-49, lon:69, latExt:5, lonExt:5, dTop:0, dBot:2400, anomaly:'slow', mag:1.3, conf:0.45},
  {name:'Tristan plume', type:'plume', lat:-37, lon:-12, latExt:4, lonExt:4, dTop:0, dBot:2400, anomaly:'slow', mag:1.2, conf:0.4},
  {name:'Cape Verde plume', type:'plume', lat:16, lon:-24, latExt:4, lonExt:4, dTop:0, dBot:2000, anomaly:'slow', mag:1.2, conf:0.4},
  {name:'Easter plume', type:'plume', lat:-27, lon:-109, latExt:4, lonExt:4, dTop:0, dBot:1500, anomaly:'slow', mag:1.2, conf:0.4},
  // ---- cratonic roots (fast, shallow) ----
  {name:'Canadian Shield root', type:'craton', lat:55, lon:-90, latExt:17, lonExt:26, dTop:0, dBot:300, anomaly:'fast', mag:2.4, conf:0.8},
  {name:'Greenland craton', type:'craton', lat:73, lon:-42, latExt:11, lonExt:16, dTop:0, dBot:250, anomaly:'fast', mag:2.1, conf:0.55},
  {name:'Fennoscandian (Baltic) root', type:'craton', lat:63, lon:26, latExt:10, lonExt:17, dTop:0, dBot:280, anomaly:'fast', mag:2.3, conf:0.7},
  {name:'Siberian craton', type:'craton', lat:64, lon:105, latExt:13, lonExt:28, dTop:0, dBot:300, anomaly:'fast', mag:2.4, conf:0.7},
  {name:'West African craton', type:'craton', lat:18, lon:-5, latExt:15, lonExt:20, dTop:0, dBot:250, anomaly:'fast', mag:2.2, conf:0.6},
  {name:'Congo craton', type:'craton', lat:-3, lon:23, latExt:12, lonExt:15, dTop:0, dBot:250, anomaly:'fast', mag:2.0, conf:0.5},
  {name:'Kaapvaal craton', type:'craton', lat:-28, lon:26, latExt:9, lonExt:12, dTop:0, dBot:300, anomaly:'fast', mag:2.5, conf:0.7},
  {name:'West Australian craton', type:'craton', lat:-25, lon:121, latExt:14, lonExt:18, dTop:0, dBot:300, anomaly:'fast', mag:2.4, conf:0.7},
  {name:'Amazonian craton', type:'craton', lat:-6, lon:-60, latExt:14, lonExt:20, dTop:0, dBot:250, anomaly:'fast', mag:2.0, conf:0.5},
  {name:'East Antarctic craton', type:'craton', lat:-78, lon:60, latExt:11, lonExt:40, dTop:0, dBot:250, anomaly:'fast', mag:1.9, conf:0.35},
  // ---- ridges / rifts (slow, very shallow) ----
  {name:'Mid-Atlantic Ridge (N)', type:'ridge', lat:38, lon:-30, latExt:18, lonExt:5, dTop:0, dBot:180, anomaly:'slow', mag:1.5, conf:0.5},
  {name:'Mid-Atlantic Ridge (S)', type:'ridge', lat:-25, lon:-13, latExt:24, lonExt:5, dTop:0, dBot:180, anomaly:'slow', mag:1.5, conf:0.5},
  {name:'East Pacific Rise', type:'ridge', lat:-18, lon:-110, latExt:28, lonExt:5, dTop:0, dBot:180, anomaly:'slow', mag:1.6, conf:0.5},
  {name:'East African Rift', type:'ridge', lat:0, lon:36, latExt:14, lonExt:5, dTop:0, dBot:200, anomaly:'slow', mag:1.4, conf:0.5},
  {name:'SW/Central Indian Ridge', type:'ridge', lat:-35, lon:55, latExt:18, lonExt:8, dTop:0, dBot:180, anomaly:'slow', mag:1.3, conf:0.4},
];

// ---------- helpers ----------
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const smooth=(x)=>{x=clamp(x,0,1);return x*x*(3-2*x);};
// cheap deterministic value noise
function hash(x,y){let n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);}
function vnoise(x,y){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const a=hash(xi,yi),b=hash(xi+1,yi),c=hash(xi,yi+1),d=hash(xi+1,yi+1);
  const u=smooth(xf),v=smooth(yf);
  return a*(1-u)*(1-v)+b*u*(1-v)+c*(1-u)*v+d*u*v;
}
function fbm(x,y){return vnoise(x,y)*0.6+vnoise(x*2.3+9,y*2.3+4)*0.3+vnoise(x*4.7+2,y*4.7+7)*0.12;}

function depthFalloff(d, dTop, dBot){
  const span=dBot-dTop, edge=clamp(span*0.25,40,260);
  if(d<=dTop-edge || d>=dBot+edge) return 0;
  if(d<dTop) return smooth((d-(dTop-edge))/edge);
  if(d>dBot) return smooth((dBot+edge-d)/edge);
  return 1;
}
// resolution as a function of depth — good shallow & at the CMB, poor mid & in core
function depthResolution(d){
  if(d<660)  return 0.92 - d/660*0.18;            // 0.92 -> 0.74
  if(d<2400) return 0.74 - (d-660)/1740*0.30;     // 0.74 -> 0.44
  if(d<2891) return 0.44 + (d-2400)/491*0.34;     // 0.44 -> 0.78 (LLSVPs well imaged)
  return 0.26 - clamp((d-2891)/3480,0,1)*0.08;    // core: little lateral resolution
}

export function makeScanField(landMask){
  const N=TEX_W*TEX_H;
  const data=new Uint8Array(N*4);
  const tex=new THREE.DataTexture(data, TEX_W, TEX_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace=THREE.NoColorSpace; // holds raw data, not colour
  tex.needsUpdate=true;
  tex.minFilter=THREE.LinearFilter; tex.magFilter=THREE.LinearFilter;
  tex.wrapS=THREE.RepeatWrapping; tex.wrapT=THREE.ClampToEdgeWrapping;

  // static per-texel coverage base (instrumentation + latitude bias + texture)
  const covStatic=new Float32Array(N);
  const mottle=new Float32Array(N);
  for(let py=0;py<TEX_H;py++){
    const lat=90-(py+0.5)/TEX_H*180;
    const northBias=smooth((lat+65)/150);          // more stations in N hemisphere
    for(let px=0;px<TEX_W;px++){
      const i=py*TEX_W+px;
      const land=landMask?landMask[i]:0;
      const nz=fbm(px/TEX_W*7, py/TEX_H*4);
      covStatic[i]=clamp(0.16 + land*0.46 + northBias*0.16 + nz*0.12, 0, 1);
      mottle[i]=(fbm(px/TEX_W*22+3, py/TEX_H*12+5)-0.5);
    }
  }

  const dvs=new Float32Array(N);
  const covBoost=new Float32Array(N);
  const catId=new Uint8Array(N);
  const catStr=new Float32Array(N);

  let coverageMean=0;

  function update(depth){
    dvs.fill(0); covBoost.fill(0); catId.fill(0); catStr.fill(0);
    const sat=SAT; // gain is applied live in the shader

    for(const f of FEATURES){
      const w=depthFalloff(depth,f.dTop,f.dBot);
      if(w<=0.001) continue;
      const sign=f.anomaly==='fast'?1:-1;
      const cid=CATEGORY[f.type].id;
      const latMargin=f.latExt*2.6, lonMargin=f.lonExt*2.6;
      const py0=Math.max(0,Math.floor((90-(f.lat+latMargin))/180*TEX_H));
      const py1=Math.min(TEX_H-1,Math.ceil((90-(f.lat-latMargin))/180*TEX_H));
      const pxc=(f.lon+180)/360*TEX_W;
      const pxr=Math.ceil(lonMargin/360*TEX_W);
      for(let py=py0;py<=py1;py++){
        const lat=90-(py+0.5)/TEX_H*180;
        const dLat=(lat-f.lat)/f.latExt;
        for(let k=-pxr;k<=pxr;k++){
          let px=Math.round(pxc)+k;
          const lon=(px+0.5)/TEX_W*360-180;
          let dLon=lon-f.lon; if(dLon>180)dLon-=360; if(dLon<-180)dLon+=360;
          const gx=dLon/f.lonExt, gy=dLat;
          const r2=gx*gx+gy*gy;
          if(r2>6.8) continue;
          const g=Math.exp(-r2*0.8);
          let pxi=((px%TEX_W)+TEX_W)%TEX_W;
          const i=py*TEX_W+pxi;
          const amp=f.mag*w*g;
          dvs[i]+=sign*amp;
          const cb=f.conf*g*w;
          if(cb>covBoost[i]) covBoost[i]=cb;
          if(amp>catStr[i]){catStr[i]=amp;catId[i]=cid;}
        }
      }
    }

    // encode
    const dres=depthResolution(depth);
    const mott=clamp((660-depth)/660,0,1)*0.18; // faint mantle mottling, fades with depth
    let covSum=0;
    for(let i=0;i<N;i++){
      let v=dvs[i] + mottle[i]*mott;
      const r=clamp(0.5+0.5*(v/sat),0,1);
      const cov=clamp(covStatic[i]*dres + covBoost[i], 0, 1);
      covSum+=cov;
      const j=i*4;
      data[j]  = (r*255)|0;
      data[j+1]= (cov*255)|0;
      data[j+2]= (catId[i]*40)|0;
      data[j+3]= 255;
    }
    coverageMean=covSum/N;
    tex.needsUpdate=true;
  }

  return {
    texture:tex,
    update,
    get coverageMean(){return coverageMean;},
  };
}

// features present near a depth, strongest first (full objects + weight)
export function activeFeatures(depth, limit){
  const out=[];
  for(const f of FEATURES){
    const w=depthFalloff(depth,f.dTop,f.dBot);
    if(w<=0.12) continue;
    out.push({f, w, score:f.mag*w*(0.5+f.conf)});
  }
  out.sort((a,b)=>b.score-a.score);
  return limit?out.slice(0,limit):out;
}
// compact version for the readout panel
export function dominantFeatures(depth, limit=6){
  return activeFeatures(depth, limit).map(({f})=>({name:f.name,type:f.type,anomaly:f.anomaly}));
}

export const catColorHex = (id)=> '#'+CAT_BY_ID[id].color.toString(16).padStart(6,'0');
export const catLabel = (id)=> CAT_BY_ID[id].label;
