// build-tomo.mjs — ingest many REAL public seismic-tomography models (shear + P),
// resample each onto a common grid, and bake a PER-MODEL dVs/dVp volume so the
// browser can combine/toggle them live (ensemble computed client-side).
// Output: data/tomo-models.json  (compact, base64 Int8 per model).
import { NetCDFReader } from 'netcdfjs';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = 'https://raw.githubusercontent.com/shuleyu/seismic-tomography-models/master/';
const mk = (name, kind, file) => ({ name, kind, file, url: BASE + file });
const MODELS = [
  // SHEAR
  mk('SGLOBE-rani', 'S', 'SGLOBE-rani_dvs.nc'),
  mk('S40RTS',      'S', 'S40RTS_dvs.nc'),
  mk('S20RTS',      'S', 'S20RTS_dvs.nc'),
  mk('SEISGLOB2',   'S', 'SEISGLOB2_dvs.nc'),
  mk('SEMUCB-WM1',  'S', 'SEMUCB-WM1_dvs.nc'),
  mk('TX2011',      'S', 'TX2011_dvs.nc'),
  mk('TX2000',      'S', 'TX2000_dvs.nc'),
  mk('SP12RTS',     'S', 'SP12RTS_dvs.nc'),
  mk('SPani',       'S', 'SPani_dvs.nc'),
  mk('HMSL-S06',    'S', 'HMSL-S06_dvs.nc'),
  // P-WAVE
  mk('GAP_P4',      'P', 'GAP_P4_dvp.nc'),
  mk('MITP08',      'P', 'MITP08_dvp.nc'),
  mk('LLNL-G3Dv3',  'P', 'LLNL-G3Dv3_dvp.nc'),
  mk('SP12RTS-P',   'P', 'SP12RTS_dvp.nc'),
];
const DIR='/tmp/tomo';

function nameLike(s,...keys){ s=s.toLowerCase(); return keys.some(k=>s.includes(k)); }

function loadModel(m){
  const path=`${DIR}/${m.file}`;
  if(!existsSync(path)) execSync(`curl -fsSL -o "${path}" "${m.url}"`);
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
  console.log(`  ${m.name} [${m.kind}]: var=${dataVar.name} dims=${dimNames.join(',')} depth[${depths.length}] ${depths[0]}..${depths[depths.length-1]} lat[${lats.length}] lon[${lons.length}] ${lon360?'(0-360)':'(-180..180)'}`);
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
  return { name:m.name, kind:m.kind, sample, dmin:depths[0], dmax:depths[depths.length-1] };
}

// common output grid
const NLON=144, NLAT=72, NDEP=32, SCALE=16;
const depthLayers=Array.from({length:NDEP},(_,i)=>Math.round(40+i*(2850-40)/(NDEP-1)));

console.log('loading models...');
const baked=[];      // { name, kind, dvs(base64), mn, mx }
const report=[];     // { name, kind, ok, dmin, dmax, mn, mx }

for(const m of MODELS){
  try{
    const mod=loadModel(m);
    const dvs=new Int8Array(NDEP*NLAT*NLON);
    let mn=99,mx=-99,filled=0;
    for(let di=0; di<NDEP; di++){
      const d=depthLayers[di];
      for(let j=0; j<NLAT; j++){
        const lat=90-(j+0.5)/NLAT*180;
        for(let i=0; i<NLON; i++){
          const lon=-180+(i+0.5)/NLON*360;
          const k=(di*NLAT+j)*NLON+i;
          const v=mod.sample(d,lat,lon);
          if(v==null){ dvs[k]=0; continue; }   // no data at this cell -> 0
          dvs[k]=Math.max(-127,Math.min(127,Math.round(v*SCALE)));
          mn=Math.min(mn,v); mx=Math.max(mx,v); filled++;
        }
      }
    }
    baked.push({ name:mod.name, kind:mod.kind, dvs:Buffer.from(dvs.buffer).toString('base64') });
    report.push({ name:mod.name, kind:mod.kind, ok:true, dmin:mod.dmin, dmax:mod.dmax, mn, mx, filled });
    console.log(`  -> ${mod.name}: depth ${Math.round(mod.dmin)}..${Math.round(mod.dmax)} km, ${filled}/${dvs.length} cells, dVs ${mn.toFixed(2)}..${mx.toFixed(2)}%`);
  }catch(err){
    console.warn(`  !! SKIP ${m.name} [${m.kind}] (${m.file}): ${err.message}`);
    report.push({ name:m.name, kind:m.kind, ok:false, err:err.message });
  }
}

const out={
  grid:{ nlon:NLON, nlat:NLAT, ndep:NDEP, depths:depthLayers, dvsScale:SCALE },
  models: baked.map(b=>({ name:b.name, kind:b.kind, dvs:b.dvs })),
};
const json=JSON.stringify(out);
writeFileSync('data/tomo-models.json', json);

// summary
console.log('\n=== summary ===');
for(const r of report){
  if(r.ok) console.log(`  OK   ${r.name.padEnd(13)} [${r.kind}] depth ${Math.round(r.dmin)}..${Math.round(r.dmax)} km  dVs ${r.mn.toFixed(2)}..${r.mx.toFixed(2)}%`);
  else     console.log(`  FAIL ${r.name.padEnd(13)} [${r.kind}] ${r.err}`);
}
const okN=report.filter(r=>r.ok).length;
const bytes=Buffer.byteLength(json);
const sz = bytes>=1048576 ? `${(bytes/1048576).toFixed(2)} MB` : `${(bytes/1024).toFixed(0)} KB`;
console.log(`\n${okN}/${MODELS.length} models baked onto ${NDEP}×${NLAT}×${NLON} grid`);
console.log(`wrote data/tomo-models.json  ${sz}`);
