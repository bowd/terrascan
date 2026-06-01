// earthModel.js — the *theoretical* Earth: PREM radial reference model.
// Radial profiles (Vp, Vs, density) are the real Preliminary Reference Earth
// Model (Dziewonski & Anderson, 1981). Pressure & temperature are standard
// approximations for the readout (PREM itself is purely elastic).

export const EARTH_RADIUS = 6371; // km

// Piecewise-linear nodes: [depthKm, value]. Discontinuities are represented by
// two nodes at (almost) the same depth.
const VP = [ // P-wave velocity, km/s  (PREM)
  [0,1.45],[3,1.45],[3,5.8],[15,5.8],[15,6.8],[24.4,6.8],
  [24.4,8.11],[80,8.08],[220,7.99],[220,8.56],[410,8.91],[410,9.13],
  [660,10.27],[660,10.75],[1000,11.42],[1500,12.07],[2000,12.78],
  [2500,13.29],[2741,13.69],[2891,13.72],
  [2891,8.06],[3500,9.13],[4500,10.05],[5149.5,10.36],
  [5149.5,11.03],[5800,11.19],[6371,11.26],
];
const VS = [ // S-wave velocity, km/s (0 in the liquid outer core)  (PREM)
  [0,0],[3,0],[3,3.2],[15,3.2],[15,3.9],[24.4,3.9],
  [24.4,4.49],[80,4.47],[220,4.42],[220,4.64],[410,4.77],[410,4.93],
  [660,5.57],[660,5.95],[1000,6.24],[1500,6.58],[2000,6.93],
  [2500,7.18],[2741,7.27],[2891,7.26],
  [2891,0],[5149.5,0],
  [5149.5,3.50],[5800,3.60],[6371,3.67],
];
const RHO = [ // density, g/cm³  (PREM)
  [0,1.02],[3,1.02],[3,2.6],[15,2.6],[15,2.9],[24.4,2.9],
  [24.4,3.38],[80,3.37],[220,3.36],[220,3.44],[410,3.54],[410,3.72],
  [660,3.99],[660,4.38],[1000,4.58],[1500,4.90],[2000,5.13],
  [2500,5.40],[2741,5.49],[2891,5.57],
  [2891,9.90],[3500,10.6],[4500,11.76],[5149.5,12.17],
  [5149.5,12.76],[5800,12.98],[6371,13.09],
];
const PRESSURE = [ // GPa (approx, hydrostatic)
  [0,0],[24.4,0.6],[220,7.4],[400,13.4],[670,23.8],
  [1000,38.9],[1500,60.6],[2000,83.5],[2500,112],[2891,135.8],
  [3500,180],[4500,265],[5150,328.9],[5800,355],[6371,363.9],
];
const TEMP = [ // K (approximate geotherm — illustrative)
  [0,288],[100,1600],[220,1700],[410,1750],[670,1900],
  [1500,2200],[2700,2900],[2891,3000],
  [2891,3850],[4000,4400],[5150,5000],[5800,5400],[6371,5600],
];

function interp(nodes, depth){
  if(depth<=nodes[0][0]) return nodes[0][1];
  const last=nodes[nodes.length-1];
  if(depth>=last[0]) return last[1];
  for(let i=1;i<nodes.length;i++){
    const [d1,v1]=nodes[i], [d0,v0]=nodes[i-1];
    if(depth<=d1){
      if(d1===d0) return v1;            // discontinuity: take the deeper side
      const t=(depth-d0)/(d1-d0);
      return v0+(v1-v0)*t;
    }
  }
  return last[1];
}

export function premAt(depth){
  return {
    vp: interp(VP,depth),
    vs: interp(VS,depth),
    rho: interp(RHO,depth),
    pressure: interp(PRESSURE,depth),
    temp: interp(TEMP,depth),
  };
}

// ---- geological layers (for labels + state) ----
export const GEO_LAYERS = [
  {name:'Crust',                d0:0,    d1:24.4, state:'solid',  color:0x6b7689, note:'Thin brittle skin — oceanic & continental.'},
  {name:'Lithospheric mantle',  d0:24.4, d1:80,   state:'solid',  color:0x8a6f57, note:'Rigid uppermost mantle, welded to the crust.'},
  {name:'Asthenosphere (LVZ)',  d0:80,   d1:220,  state:'solid',  color:0xb5552e, note:'Weak, partially-molten low-velocity zone the plates ride on.'},
  {name:'Upper mantle',         d0:220,  d1:410,  state:'solid',  color:0xbb5a2c, note:'Convecting silicate mantle above the transition zone.'},
  {name:'Transition zone',      d0:410,  d1:660,  state:'solid',  color:0xc4642f, note:'Olivine phase changes at 410 & 660 km — where slabs stall.'},
  {name:'Lower mantle',         d0:660,  d1:2741, state:'solid',  color:0x9e3b22, note:'Bridgmanite-dominated; hosts sinking slabs & rising piles.'},
  {name:'D″ layer',             d0:2741, d1:2891, state:'solid',  color:0xff7a3c, note:'Thermal boundary layer at the base of the mantle.'},
  {name:'Outer core',           d0:2891, d1:5150, state:'liquid', color:0xffb43a, note:'Swirling liquid iron–nickel — the geodynamo. No S-waves.'},
  {name:'Inner core',           d0:5150, d1:6371, state:'solid',  color:0xffeccf, note:'Solid iron sphere, growing as Earth slowly cools.'},
];

export function geoLayerAt(depth){
  for(const L of GEO_LAYERS) if(depth>=L.d0 && depth<L.d1) return L;
  return GEO_LAYERS[GEO_LAYERS.length-1];
}

// ---- theoretical shells to render (blurry onion) ----
// Outer radius (km) of each rendered shell, inner -> outer color tint.
export const THEORY_SHELLS = [
  {name:'mantle',     rOuterKm:6371, rInnerKm:3480, cInner:0xd2622a, cOuter:0x7a2a18, glow:0.40},
  {name:'lowermantle',rOuterKm:5711, rInnerKm:3480, cInner:0xb83a1e, cOuter:0x6e2414, glow:0.38},
  {name:'outercore',  rOuterKm:3480, rInnerKm:1221, cInner:0xffc24a, cOuter:0xff7e22, glow:0.85},
  {name:'innercore',  rOuterKm:1221, rInnerKm:0,    cInner:0xfff3d8, cOuter:0xffcf86, glow:1.10},
];

// ---- depth stops shown on the rail ----
export const DEPTH_STOPS = [
  {d:0,    label:'Surface',              blurb:'The crust — where every map you have ever seen lives.'},
  {d:80,   label:'Lithosphere base',     blurb:'Plates detach from the convecting mantle below.'},
  {d:220,  label:'Asthenosphere',        blurb:'The soft low-velocity zone the plates glide over.'},
  {d:410,  label:'410 km discontinuity', blurb:'Olivine → wadsleyite. Top of the transition zone.'},
  {d:660,  label:'660 km discontinuity', blurb:'Ringwoodite breaks down — many slabs pile up here.'},
  {d:1000, label:'Upper lower-mantle',   blurb:'Slabs that punch through 660 keep sinking.'},
  {d:1500, label:'Mid lower-mantle',     blurb:'Cold slab graveyards & the flanks of the hot piles.'},
  {d:2200, label:'Deep lower-mantle',    blurb:'The two great LLSVPs dominate the deep mantle.'},
  {d:2741, label:'D″ layer',             blurb:'Ultra-low velocity zones hug the core boundary.'},
  {d:2891, label:'Core–mantle boundary', blurb:'Rock meets liquid iron — a 1000 K thermal cliff.'},
  {d:4000, label:'Outer core',           blurb:'Convecting liquid iron generates the magnetic field.'},
  {d:5150, label:'Inner-core boundary',  blurb:'Liquid iron freezes onto the solid inner core.'},
  {d:5800, label:'Inner core',           blurb:'A hot iron crystal, ~70% the size of the Moon.'},
  {d:6371, label:"Earth's centre",       blurb:'~5700 K and 364 GPa. The end of the dive.'},
];

export const DISCONTINUITIES = [
  {name:'Moho', depth:24.4}, {name:'LAB', depth:80}, {name:'220', depth:220}, {name:'410', depth:410},
  {name:'660', depth:660}, {name:'D″', depth:2741}, {name:'CMB', depth:2891},
  {name:'ICB', depth:5149.5},
];

// ---- conversions (scene units: Earth radius = 1) ----
export const depthToUnit  = (d)=> (EARTH_RADIUS - d)/EARTH_RADIUS;
export const kmToUnit     = (km)=> km/EARTH_RADIUS;
export const unitToDepth  = (u)=> EARTH_RADIUS*(1-u);

// ---- non-linear depth axis: t in [0,1] -> depth, expanding the shallow zone ----
// so the crust/lithosphere/asthenosphere get a usable share of the slider.
const DEXP = 2.2;
// the scroll stops at the core-mantle boundary — the mantle (and all the tomographic
// data) ends here; below is the structureless liquid outer core.
export const MAX_DEPTH = 2891;   // core-mantle boundary (km)
export const sliderToDepth = (t)=> MAX_DEPTH*Math.pow(Math.max(0,Math.min(1,t)), DEXP);
export const depthToSlider = (d)=> Math.pow(Math.max(0,Math.min(1,d/MAX_DEPTH)), 1/DEXP);

// ---- relief / elevation axis (peel mode) ----
// Topography is exaggerated so it reads as real 3-D structure; the cut radius lives
// in that same exaggerated space so the peel cleanly slices through the mountains.
export const RELIEF_EXAG    = 72;    // vertical exaggeration for display
export const RELIEF_MAXELEV = 9.3;   // km mapped to a full (white) topo sample (~Everest)
export const ELEV_TOP       = 10;    // km above sea level the peel axis starts (above all peaks)
const ELEV_FRAC = 0.16;              // top 16% of the slider covers +ELEV_TOP -> sea level
// peel-mode slider mapping: the upper band is elevation ABOVE sea level (negative depth)
export const reliefSliderToDepth = (t)=>{ t=Math.max(0,Math.min(1,t));
  if(t < ELEV_FRAC) return -ELEV_TOP*(1 - t/ELEV_FRAC);              // +ELEV_TOP .. 0 (sea level)
  return sliderToDepth((t-ELEV_FRAC)/(1-ELEV_FRAC)); };             // 0 .. centre, below sea
export const reliefDepthToSlider = (d)=> d<=0
  ? ELEV_FRAC*(1 - Math.min(1,(-d)/ELEV_TOP))
  : ELEV_FRAC + (1-ELEV_FRAC)*depthToSlider(d);
// cut radius (scene units) for a given depth/elevation, in the exaggerated relief space
export const reliefCutRadius = (d)=> d<=0
  ? 1 + (-d)/EARTH_RADIUS*RELIEF_EXAG     // above sea: exaggerated elevation
  : depthToUnit(d);                       // below sea: physical depth (continuous at d=0 -> 1.0)

// rough temperature uncertainty (K) — temperature is modelled, never measured;
// the error is largest in the thermal boundary layers (lithosphere, D″) and the core.
export function tempUncertainty(d){
  if(d<100) return 150; if(d<660) return 120; if(d<2400) return 150;
  if(d<2891) return 400; if(d<5150) return 500; return 600;
}
