// build-caves.mjs — offline bake: real Survex .3d cave surveys -> compact JSON the
// app renders on focus. NOT needed at runtime. Sources (downloaded to /tmp first):
//   CUCC Loser plateau combined: https://expo.survex.com/survexfile/1623.3d   (courtesy of CUCC)
//   Migovec system (CC-BY-NC-SA): https://github.com/iccaving/migovec-survey-data (Releases: system_migovec.3d)
// CUCC = UTM33N / EPSG:32633 (absolute) -> WGS84 here; Migovec = EPSG:3912 (anchored at a known WGS84 entrance).
// Emit local ENU centimetres relative to each cave's top station + the anchor lat/lon.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// ---- Survex .3d v8 parser (validated against 204.3d / 1623.3d) --------------
function parse3d(buf){
  let p=0;
  const line=()=>{ let s=p; while(p<buf.length&&buf[p]!==0x0a)p++; const b=buf.slice(s,p); p++; return b; };
  line(); line(); const meta=line(); line(); buf[p++];
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
    else if(code<=0x0e){}
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
const clamp0=(x)=>x<0?0:x;

function ringsForRun(run){
  const rings=[];
  for(let i=0;i<run.length;i++){
    const P=run[i].p, prev=run[i-1]?run[i-1].p:P, next=run[i+1]?run[i+1].p:P;
    let dir=norm(sub(next,prev)); if(!isFinite(dir[0])) dir=[0,1,0];
    let right=cross(dir,[0,0,1]); if(Math.hypot(...right)<1e-3) right=[1,0,0]; right=norm(right);
    const left=[-right[0],-right[1],-right[2]];
    const L=clamp0(run[i].L), R=clamp0(run[i].R), U=clamp0(run[i].U), Dn=clamp0(run[i].D);
    rings.push([
      P[0]+left[0]*L,P[1]+left[1]*L,P[2]+left[2]*L,
      P[0],P[1],P[2]+U,
      P[0]+right[0]*R,P[1]+right[1]*R,P[2]+right[2]*R,
      P[0],P[1],P[2]-Dn].map(Math.round));
  }
  return rings;
}

function extract(data, {kat, anchorLatLon, zone, wantSplays, splayCap=6500}){
  const pref = kat ? kat+'.' : null;
  const caveSt = pref ? [...data.stations].filter(([n])=>n.startsWith(pref)) : [...data.stations];
  if(!caveSt.length) throw new Error('no stations for '+(kat||'(whole file)'));
  let anchor=caveSt[0][1]; for(const [,s] of caveSt) if(s.z>anchor.z) anchor=s;
  const A=[anchor.x,anchor.y,anchor.z];
  const latlon = anchorLatLon || utmInv(anchor.x/100, anchor.y/100, zone);
  const inSet=new Set(caveSt.map(([,s])=>s.x+','+s.y+','+s.z));
  const key=(p)=>p[0]+','+p[1]+','+p[2];
  let minz=1e15,maxz=-1e15; for(const [,s] of caveSt){ if(s.z<minz)minz=s.z; if(s.z>maxz)maxz=s.z; }

  const segs=[], splayAll=[]; let lenCm=0;
  for(const l of data.legs){
    if(l.flag&0x01) continue;                       // surface
    if(l.flag&0x04){                                // splay (wall shot)
      if(wantSplays && inSet.has(key(l.a))){ const b=sub(l.b,A); splayAll.push([Math.round(b[0]),Math.round(b[1]),Math.round(b[2])]); }
      continue;
    }
    if(!inSet.has(key(l.a))||!inSet.has(key(l.b))) continue;
    const a=sub(l.a,A), b=sub(l.b,A);
    segs.push(a[0],a[1],a[2], b[0],b[1],b[2]);
    lenCm += Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
  }
  // decimate splays to keep JSON small
  let splays=[];
  if(splayAll.length){ const stride=Math.max(1,Math.ceil(splayAll.length/splayCap));
    for(let i=0;i<splayAll.length;i+=stride) splays.push(...splayAll[i]); }

  const runs=[]; let cur=[];
  for(const x of data.xsects){
    if(pref && !x.name.startsWith(pref)){ if(cur.length){runs.push(cur);cur=[];} continue; }
    const st=data.stations.get(x.name); if(!st) continue;
    cur.push({p:sub([st.x,st.y,st.z],A), L:x.L,R:x.R,U:x.U,D:x.D});
    if(x.last){ runs.push(cur); cur=[]; }
  }
  if(cur.length) runs.push(cur);
  const walls = runs.filter(r=>r.length>=2).map(ringsForRun);

  return { dot:[+latlon[0].toFixed(5), +latlon[1].toFixed(5)],
    altTop:+(anchor.z/100).toFixed(0), depthM:+((maxz-minz)/100).toFixed(0),
    lengthKm:+(lenCm/100/1000).toFixed(1),
    nLegs:segs.length/6, nWallRings:walls.reduce((s,r)=>s+r.length,0), nSplays:splays.length/3,
    segs, walls, splays };
}

mkdirSync('/home/workspace/world/data/caves',{recursive:true});
const manifest=[];
function bake(id, name, country, source, m, note){
  const out={name, country, source, dot:m.dot, altTop:m.altTop, depthM:m.depthM, lengthKm:m.lengthKm,
    segs:m.segs, walls:m.walls, splays:m.splays};
  writeFileSync(`/home/workspace/world/data/caves/${id}.json`, JSON.stringify(out));
  manifest.push({id, name, country, note, dot:m.dot, depthM:m.depthM, lengthKm:m.lengthKm,
    legs:m.nLegs, wallRings:m.nWallRings, splays:m.nSplays, bytes:JSON.stringify(out).length});
}

// ---- CUCC Loser plateau (combined 1623, UTM33N) -----------------------------
const cucc = parse3d(readFileSync('/tmp/cucc-1623.3d'));
const CUCC=[
  ['steinbruckenhohle','1623.204','Steinbrückenhöhle','Deep shaft maze in the Schwarzmoos plateau.'],
  ['tunnockschacht','1623.258','Tunnockschacht','Big vertical CUCC system — one of the deepest here.'],
  ['balkonhohle','1623.264','Balkonhöhle','Branching plateau system, rich in surveyed cross-sections.'],
  ['kaninchenhohle','1623.161','Kaninchenhöhle','Long plateau maze — ~28 km of surveyed passage.'],
  ['fischgesicht','1623.290','Fischgesichthöhle','"Fish-face cave" — a newer CUCC discovery on the plateau.'],
  ['stellerweg','1623.41','Stellerweghöhle','Classic deep CUCC shaft system.'],
  ['schwabenhohle','1623.78','Schwabenschachthöhle','Vertical shaft cave on the Loser plateau.'],
  ['eishohle','1623.40','Schwarzmooskogeleishöhle','Ice cave high on the Schwarzmooskogel.'],
  ['schnellzug','1623.115','Schnellzughöhle','"Express-train cave" — fast-flowing CUCC system.'],
  ['gemshohle','1623.107','Gemshöhle','Plateau cave named for the chamois.'],
];
for(const [id,kat,name,note] of CUCC){
  bake(id, name, 'Austria', 'CUCC Loser expedition · expo.survex.com', extract(cucc,{kat,zone:33}), note);
}

// ---- Slovenia: Sistem Migovec (combined, EPSG:3912, splays not LRUD) ---------
const mig = parse3d(readFileSync('/tmp/mig-system_migovec.3d'));
bake('migovec','Sistem Migovec','Slovenia','Imperial College CC / JSPDT (CC-BY-NC-SA) · github.com/iccaving',
  extract(mig,{anchorLatLon:[46.2486,13.7466], wantSplays:true}),
  'One of Slovenia’s longest systems, under Tolminski Migovec — shown as centreline + a splay-shot point cloud of the walls.');

console.table(manifest.map(m=>({name:m.name, dot:m.dot.join(','), depth:m.depthM, lenKm:m.lengthKm,
  legs:m.legs, walls:m.wallRings, splays:m.splays, KB:Math.round(m.bytes/1024)})));

// ---- patch karst.json: add these as clickable, ringed model dots ------------
const KP='/home/workspace/world/data/karst.json';
const karst=JSON.parse(readFileSync(KP));
karst.caves = karst.caves.filter(c=>!c.model);
for(const m of manifest){
  karst.caves.push({ name:m.name, country:m.country, lat:m.dot[0], lon:m.dot[1],
    len_km:m.lengthKm, depth_m:m.depthM, flooded:false, cat:'deep', type:'deep-cave',
    note:m.note, source:(m.country==='Slovenia'?'JSPDT/ICCC (CC-BY-NC-SA)':'CUCC · expo.survex.com'),
    label:false, model:m.id });
}
karst.meta={...(karst.meta||{}), caves:karst.caves.length, models:manifest.length};
writeFileSync(KP, JSON.stringify(karst));
writeFileSync('/home/workspace/world/data/caves/index.json', JSON.stringify(
  manifest.map(m=>({id:m.id,name:m.name,country:m.country,dot:m.dot,depthM:m.depthM,lengthKm:m.lengthKm}))));
console.log('patched karst.json → caves', karst.caves.length, '· models', manifest.length);
