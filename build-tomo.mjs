// build-tomo.mjs — ingest several REAL public shear-velocity tomography models,
// resample them onto a common grid, and bake (a) the ensemble-mean dVs and
// (b) the cross-model AGREEMENT (our honest "mapped vs estimated"): where the
// models agree we trust it; where they disagree it's an estimate.
// Output: data/tomo-ensemble.json  (compact, base64 Int8/Uint8).
import { NetCDFReader } from 'netcdfjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const MODELS = [
  { name:'SGLOBE-rani', file:'SGLOBE-rani.nc', url:'https://ds.iris.edu/files/products/emc/emc-files/SGLOBE-rani-voigt_percent.nc' },
  { name:'SEISGLOB2',   file:'SEISGLOB2.nc',   url:'https://raw.githubusercontent.com/shuleyu/seismic-tomography-models/master/SEISGLOB2_dvs.nc' },
  { name:'TX2011',      file:'TX2011.nc',      url:'https://raw.githubusercontent.com/shuleyu/seismic-tomography-models/master/TX2011_dvs.nc' },
  { name:'S40RTS',      file:'S40RTS.nc',      url:'https://raw.githubusercontent.com/shuleyu/seismic-tomography-models/master/S40RTS_dvs.nc' },
  { name:'SEMUCB-WM1',  file:'SEMUCB.nc',      url:'https://raw.githubusercontent.com/shuleyu/seismic-tomography-models/master/SEMUCB-WM1_dvs.nc' },
];
const DIR='/tmp/tomo';

function nameLike(s,...keys){ s=s.toLowerCase(); return keys.some(k=>s.includes(k)); }

function loadModel(m){
  const path=`${DIR}/${m.file}`;
  if(!existsSync(path)) execSync(`curl -sL -o "${path}" "${m.url}"`);
  const r=new NetCDFReader(readFileSync(path));
  const dims=r.dimensions; // [{name,size}]
  const coordName={}; for(const v of r.variables){ if(v.dimensions.length===1){
    const dn=dims[v.dimensions[0]].name;
    if(nameLike(v.name,'dep')||nameLike(dn,'dep')) coordName.depth=v.name;
    else if(nameLike(v.name,'lat')||nameLike(dn,'lat')) coordName.lat=v.name;
    else if(nameLike(v.name,'lon')||nameLike(dn,'lon')) coordName.lon=v.name;
  }}
  const dataVar=r.variables.find(v=>v.dimensions.length===3);
  const dimNames=dataVar.dimensions.map(i=>dims[i].name);
  const sizeOf=(nm)=>dims.find(d=>d.name===nm).size;
  const depths=Array.from(r.getDataVariable(coordName.depth));
  const lats=Array.from(r.getDataVariable(coordName.lat));
  const lons=Array.from(r.getDataVariable(coordName.lon));
  const data=r.getDataVariable(dataVar.name);
  // strides for [depth,lat,lon] in the file's actual dim order
  const dimIdx={depth:dimNames.findIndex(n=>nameLike(n,'dep')), lat:dimNames.findIndex(n=>nameLike(n,'lat')), lon:dimNames.findIndex(n=>nameLike(n,'lon'))};
  const shape=dimNames.map(sizeOf);
  const strides=shape.map((_,i)=>shape.slice(i+1).reduce((a,b)=>a*b,1));
  const at=(di,lai,loi)=>{ const idx=[]; idx[dimIdx.depth]=di; idx[dimIdx.lat]=lai; idx[dimIdx.lon]=loi;
    return data[idx[0]*strides[0]+idx[1]*strides[1]+idx[2]*strides[2]]; };
  const lon360 = Math.max(...lons) > 181;             // 0..360 domain?
  console.log(`  ${m.name}: var=${dataVar.name} dims=${dimNames.join(',')} depth[${depths.length}] ${depths[0]}..${depths[depths.length-1]} lat[${lats.length}] lon[${lons.length}] ${lon360?'(0-360)':'(-180..180)'}`);
  // monotonic-array bracket (handles ascending or descending)
  const brk=(arr,x)=>{ const asc=arr[arr.length-1]>=arr[0];
    if(asc){ if(x<=arr[0])return[0,0,0]; if(x>=arr[arr.length-1])return[arr.length-1,arr.length-1,0];
      let i=0; while(arr[i+1]<x) i++; return [i,i+1,(x-arr[i])/(arr[i+1]-arr[i])]; }
    else { if(x>=arr[0])return[0,0,0]; if(x<=arr[arr.length-1])return[arr.length-1,arr.length-1,0];
      let i=0; while(arr[i+1]>x) i++; return [i,i+1,(x-arr[i])/(arr[i+1]-arr[i])]; } };
  function sample(qd,qla,qlo){
    if(qd<depths[0]-30 || qd>depths[depths.length-1]+30) return null;
    let lo=qlo; if(lon360){ lo=((qlo%360)+360)%360; } // to model domain
    const [la0,la1,fa]=brk(lats,qla);
    const [lo0,lo1,fo]=brk(lons,lo);
    const [d0,d1,fd]=brk(depths,qd);
    const bil=(di)=>{ const v00=at(di,la0,lo0),v01=at(di,la0,lo1),v10=at(di,la1,lo0),v11=at(di,la1,lo1);
      const a=v00+(v01-v00)*fo, b=v10+(v11-v10)*fo; return a+(b-a)*fa; };
    let v=bil(d0)*(1-fd)+bil(d1)*fd;
    if(!isFinite(v) || Math.abs(v)>40) return null;     // fill/missing guard
    return v;
  }
  return { name:m.name, sample, dmin:depths[0], dmax:depths[depths.length-1] };
}

console.log('loading models...');
const mods = MODELS.map(loadModel);

// common output grid
const NLON=144, NLAT=72, NDEP=32, SCALE=16;
const depthLayers=Array.from({length:NDEP},(_,i)=>Math.round(40+i*(2850-40)/(NDEP-1)));
const dvs=new Int8Array(NDEP*NLAT*NLON);
const agree=new Uint8Array(NDEP*NLAT*NLON);
let mn=99,mx=-99;

for(let di=0; di<NDEP; di++){
  const d=depthLayers[di];
  for(let j=0; j<NLAT; j++){
    const lat=90-(j+0.5)/NLAT*180;
    for(let i=0; i<NLON; i++){
      const lon=-180+(i+0.5)/NLON*360;
      const vals=[]; for(const m of mods){ const v=m.sample(d,lat,lon); if(v!=null) vals.push(v); }
      const k=(di*NLAT+j)*NLON+i;
      if(!vals.length){ dvs[k]=0; agree[k]=0; continue; }
      const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
      const pos=vals.filter(v=>v>0.15).length, neg=vals.filter(v=>v<-0.15).length;
      const strong=pos+neg, n=vals.length;
      let ag;
      if(strong < n*0.5) ag=0.78;                       // consensus "ordinary mantle"
      else ag=Math.max(pos,neg)/strong;                 // sign agreement among the anomalous votes
      dvs[k]=Math.max(-127,Math.min(127,Math.round(mean*SCALE)));
      agree[k]=Math.round(Math.max(0,Math.min(1,ag))*255);
      mn=Math.min(mn,mean); mx=Math.max(mx,mean);
    }
  }
}

const out={ models:mods.map(m=>m.name), depths:depthLayers, nlon:NLON, nlat:NLAT, dvsScale:SCALE,
  dvs:Buffer.from(dvs.buffer).toString('base64'), agree:Buffer.from(agree).toString('base64') };
const json=JSON.stringify(out);
writeFileSync('data/tomo-ensemble.json', json);
console.log(`ensemble: ${mods.length} models, ${NDEP}×${NLAT}×${NLON}, dVs range ${mn.toFixed(2)}..${mx.toFixed(2)}%`);
console.log(`wrote data/tomo-ensemble.json  ${(json.length/1024).toFixed(0)} KB`);
