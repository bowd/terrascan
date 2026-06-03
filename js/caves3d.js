// caves3d.js — the always-on layer of real 3-D cave surveys, placed on the globe
// like the extracted-feature blobs. Fetches every cave's baked model, builds it in
// place, hemisphere-culls the far side each frame, and handles hover-highlight /
// focus-dim emphasis + reliable pick proxies for hover & click.
import * as THREE from 'three';
import { makeCaveModel } from './cavemodel.js';

export async function makeCaves3d(caveList){
  const group=new THREE.Group(); group.renderOrder=8;
  const models=[];           // makeCaveModel results
  const pickProxies=[];
  let focused=null, hovered=null;

  await Promise.all((caveList||[]).map(async (cave)=>{
    try{
      const data=await fetch('./data/caves/'+cave.model+'.json').then(r=>r.json());
      const cm=makeCaveModel(data, cave);
      group.add(cm.group); models.push(cm); pickProxies.push(cm.pickProxy);
    }catch(e){ console.warn('cave model load failed', cave.model, e); }
  }));

  function refresh(){
    for(const cm of models)
      cm.setEmphasis(cm===focused ? 'focus' : cm===hovered ? 'hover' : (focused ? 'dim' : 'normal'));
  }
  function setHover(cm){ if(cm===hovered) return; hovered=cm; refresh(); }   // works during focus too (for switching)
  function focus(cm){ focused=cm||null; hovered=null; refresh(); }
  function caveOf(proxy){ return models.find(m=>m.pickProxy===proxy); }
  function modelFor(cave){ return models.find(m=>m.cave && m.cave.model===cave.model); }

  const _n=new THREE.Vector3();
  function update(camDirNorm){                 // cull the back hemisphere (models draw on top)
    for(const cm of models){ _n.copy(cm.center).normalize(); cm.group.visible = _n.dot(camDirNorm) > -0.12; }
  }
  function dispose(){ for(const cm of models) cm.dispose(); }

  return { group, models, pickProxies, setHover, focus, caveOf, modelFor, update, dispose };
}
