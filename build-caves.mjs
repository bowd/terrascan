// build-caves.mjs — offline bake: real Survex .3d cave surveys -> compact JSON the
// app renders on focus. NOT needed at runtime. Sources (downloaded to /tmp first):
//   CUCC Loser plateau combined: https://expo.survex.com/survexfile/1623.3d   (CC: courtesy of CUCC)
//   Migovec system (CC-BY-NC-SA): https://github.com/iccaving/migovec-survey-data (Releases)
// Coordinates: CUCC = UTM33N / EPSG:32633 (absolute) -> WGS84 here; Migovec = EPSG:3794.
// We emit local ENU centimetres relative to each cave's top station, plus the
// real lat/lon of that anchor, so the renderer can pin + orient it on the globe.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// ---- Survex .3d v8 parser (validated against 204.3d / 1623.3d) --------------
function parse3d(buf){
  let p=0;
  const line=()=>{ let s=p; while(p<buf.length&&buf[p]!==0x0a)p++; const b=buf.slice(s,p); p++; return b; };
  line(); line(); const meta=line(); line(); const fflags=buf[p++];
  const cs=meta.toString('latin1').split('\0')[1]||'';
  const label=[];
  const readLabel=()=>{ let D,A; const b=buf[p++];
    if(b!==0){ D=b>>4; A=b&0x0f; }
    else { let b1=buf[p++]; if(b1!==0xff)D=b1; else{D=buf.readUInt32LE(p);p+=4;} let b2=buf[p++]; if(b2!==0xff)A=b2; else{A=buf.readUInt32LE(p);p+=4;} }
    if(D>0) label.length=Math.max(0,label.length-D); for(let i=0;i<A;i++) label.push(buf[p++]);
    return Buffer.from(label).toString('latin1'); };
  const i32=()=>{const v=buf.readInt32LE(p);p+=4;return v;}, i16=()=>{const v=buf.readInt16LE(p);p+=2;return v;};
  let cx,cy,cz; const stations=new Map(), legs=[], xsects=[];
  while(p<buf.length){ const code=buf[p++];
    if(code===0x0f){ cx=i32();cy=i32();cz=i32(); }
    else if(code<=0x0e){ /* style/reserved */ }
    else if(code===0x10){} else if(code===0x11){p+=2;} else if(code===0x12){p+=3;} else if(code===0x13){p+=4;}
    else if(code<=0x1e){} else if(code===0x1f){p+=20;} else if(code<=0x2f){}
    else if(code>=0x30&&code<=0x33){ const name=readLabel(); let L,R,U,D2;
      if(code<=0x31){L=i16();R=i16();U=i16();D2=i16();}else{L=i32();R=i32();U=i32();D2=i32();}
      xsects.push({name,L,R,U,D:D2,last:!!(code&0x01)}); }
    else if(code<=0x3f){}
    else if(code>=0x40&&code<=0x7f){ const f=code&0x3f; if(!(f&0x20))readLabel();
      const a=[cx,cy,cz]; cx=i32();cy=i32();cz=i32(); legs.push({a,b:[cx,cy,cz],flag:f}); }
    else { const f=code&0x7f; const name=readLabel(); const x=i32(),y=i32(),z=i32(); stations.set(name,{x,y,z,flag:f}); }
  }
  return {cs, stations, legs, xsects};
}

// ---- UTM (north) -> WGS84 lat/lon -------------------------------------------
function utmInv(E,N,zone){
  const a=6378137.0, f=1/298.257223563, e2=f*(2-f), ep2=e2/(1-e2), k0=0.9996;
  const x=E-500000, M=N/k0;
  const mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2**3/256));
  const e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const fp=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1*e1/16-55*e1**4/32)*Math.sin(4*mu)
    +(151*e1**3/96)*Math.sin(6*mu)+(1097*e1**4/512)*Math.sin(8*mu);
  const C1=ep2*Math.cos(fp)**2, T1=Math.tan(fp)**2, sf=Math.sin(fp);
  const N1=a/Math.sqrt(1-e2*sf*sf), R1=a*(1-e2)/Math.pow(1-e2*sf*sf,1.5), D=x/(N1*k0);
  const lat=fp-(N1*Math.tan(fp)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24
    +(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720);
  const lon=(zone*6-183)*Math.PI/180+(D-(1+2*T1+C1)*D**3/6
    +(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/Math.cos(fp);
  return [lat*180/Math.PI, lon*180/Math.PI];
}

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const norm=(v)=>{const m=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/m,v[1]/m,v[2]/m];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const clamp0=(x)=>x<0?0:x;   // omitted LRUD = -1

// build wall rings (local ENU cm) for one passage run of xsect stations
function ringsForRun(run){
  const rings=[];
  for(let i=0;i<run.length;i++){
    const P=run[i].p;
    const prev=run[i-1]?run[i-1].p:P, next=run[i+1]?run[i+1].p:P;
    let dir=norm(sub(next,prev)); if(!isFinite(dir[0])) dir=[0,1,0];
    let right=cross(dir,[0,0,1]); if(Math.hypot(...right)<1e-3) right=[1,0,0]; right=norm(right);
    const left=[-right[0],-right[1],-right[2]], up=[0,0,1];
    const L=clamp0(run[i].L), R=clamp0(run[i].R), U=clamp0(run[i].U), Dn=clamp0(run[i].D);
    const lp=[P[0]+left[0]*L,P[1]+left[1]*L,P[2]+left[2]*L];
    const up_=[P[0],P[1],P[2]+U];
    const rp=[P[0]+right[0]*R,P[1]+right[1]*R,P[2]+right[2]*R];
    const dp=[P[0],P[1],P[2]-Dn];
    rings.push([...lp,...up_,...rp,...dp].map(Math.round));   // L,U,R,D  (4 pts ×3)
  }
  return rings;
}

function extract(data, opts){
  const {kat, anchorLatLon, zone} = opts;
  // stations belonging to this cave
  const pref = kat+'.';
  const caveSt = [...data.stations].filter(([n])=>n.startsWith(pref));
  if(!caveSt.length) throw new Error('no stations for '+kat);
  // anchor = highest station (≈ entrance for alpine shafts)
  let anchor=caveSt[0][1]; for(const [,s] of caveSt) if(s.z>anchor.z) anchor=s;
  const A=[anchor.x,anchor.y,anchor.z];
  const latlon = anchorLatLon || utmInv(anchor.x/100, anchor.y/100, zone);
  // coord set for leg filtering
  const inSet=new Set(caveSt.map(([,s])=>s.x+','+s.y+','+s.z));
  const key=(p)=>p[0]+','+p[1]+','+p[2];
  // centreline legs (drop surface 0x01 + splay 0x04), both ends in this cave
  const segs=[];
  let lenCm=0, minz=1e15, maxz=-1e15;
  for(const l of data.legs){
    if(l.flag&0x01 || l.flag&0x04) continue;
    if(!inSet.has(key(l.a))||!inSet.has(key(l.b))) continue;
    const a=sub(l.a,A), b=sub(l.b,A);
    segs.push(a[0],a[1],a[2], b[0],b[1],b[2]);
    lenCm += Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    minz=Math.min(minz,l.a[2],l.b[2]); maxz=Math.max(maxz,l.a[2],l.b[2]);
  }
  // LRUD wall runs
  const runs=[]; let cur=[];
  for(const x of data.xsects){
    if(!x.name.startsWith(pref)) { if(cur.length){runs.push(cur);cur=[];} continue; }
    const st=data.stations.get(x.name); if(!st){ continue; }
    cur.push({p:sub([st.x,st.y,st.z],A), L:x.L,R:x.R,U:x.U,D:x.D});
    if(x.last){ runs.push(cur); cur=[]; }
  }
  if(cur.length) runs.push(cur);
  const walls = runs.filter(r=>r.length>=2).map(ringsForRun);
  return {
    kat, dot:[+latlon[0].toFixed(5), +latlon[1].toFixed(5)],
    altTop:+(anchor.z/100).toFixed(0),
    depthM:+((maxz-minz)/100).toFixed(0),
    lengthKm:+(lenCm/100/1000).toFixed(1),
    nLegs:segs.length/6, nWallRings:walls.reduce((s,r)=>s+r.length,0),
    segs, walls,
  };
}

// ---- CUCC: the big four of the Loser / Schwarzmoos plateau ------------------
mkdirSync('/home/workspace/world/data/caves',{recursive:true});
const cucc = parse3d(readFileSync('/tmp/cucc-1623.3d'));
const CAVES = [
  {id:'steinbruckenhohle', kat:'1623.204', name:'Steinbrückenhöhle'},
  {id:'tunnockschacht',    kat:'1623.258', name:'Tunnockschacht'},
  {id:'balkonhohle',       kat:'1623.264', name:'Balkonhöhle'},
  {id:'kaninchenhohle',    kat:'1623.161', name:'Kaninchenhöhle'},
];
const manifest=[];
for(const c of CAVES){
  const m = extract(cucc, {kat:c.kat, zone:33});
  const out = {name:c.name, source:'CUCC Loser plateau expedition (expo.survex.com)', cs:'EPSG:32633',
    dot:m.dot, altTop:m.altTop, depthM:m.depthM, lengthKm:m.lengthKm, segs:m.segs, walls:m.walls};
  writeFileSync(`/home/workspace/world/data/caves/${c.id}.json`, JSON.stringify(out));
  manifest.push({id:c.id, ...c, dot:m.dot, depthM:m.depthM, lengthKm:m.lengthKm,
    legs:m.nLegs, wallRings:m.nWallRings,
    bytes:JSON.stringify(out).length});
}
console.table(manifest.map(m=>({name:m.name, dot:m.dot.join(','), depth:m.depthM, lenKm:m.lengthKm, legs:m.legs, wallRings:m.wallRings, KB:Math.round(m.bytes/1024)})));

// ---- patch karst.json: add these as clickable dots that carry a 3-D model ----
const KP='/home/workspace/world/data/karst.json';
const karst=JSON.parse(readFileSync(KP));
karst.caves = karst.caves.filter(c=>!c.model);     // drop any previously-added model dots
const NOTE={
  steinbruckenhohle:'Deep shaft maze in the Schwarzmoos plateau; surveyed by CUCC. Click to fly into the real passages.',
  tunnockschacht:'Big vertical CUCC system on the Loser plateau; one of the deepest here.',
  balkonhohle:'Branching CUCC plateau system, rich in surveyed cross-sections.',
  kaninchenhohle:'Long CUCC maze on the same plateau — ~28 km of surveyed passage.',
};
for(const m of manifest){
  karst.caves.push({
    name:m.name, country:'Austria', lat:m.dot[0], lon:m.dot[1],
    len_km:m.lengthKm, depth_m:m.depthM, flooded:false, cat:'deep', type:'deep-cave',
    note:NOTE[m.id]||'Surveyed alpine cave (CUCC).', source:'CUCC Loser expedition · expo.survex.com',
    label:false, model:m.id,
  });
}
karst.meta = {...(karst.meta||{}), caves:karst.caves.length, models:manifest.length};
writeFileSync(KP, JSON.stringify(karst));
// a small manifest the app can read if needed
writeFileSync('/home/workspace/world/data/caves/index.json', JSON.stringify(
  manifest.map(m=>({id:m.id,name:m.name,dot:m.dot,depthM:m.depthM,lengthKm:m.lengthKm}))));
console.log('patched karst.json → caves now', karst.caves.length, '· models', manifest.length);
