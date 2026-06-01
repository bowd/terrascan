// databodies.js — STRUCTURAL representation of the REAL data: turn the ensemble
// volume (mean ΔVs + agreement) into a 3-D blob cloud, so measured tomography has
// the same anatomy the synthesis does. Blue = fast/cold, red = slow/hot; opacity
// scales with |ΔVs| × cross-model agreement (faint where the models disagree).
import * as THREE from 'three';
import { EARTH_RADIUS, depthToUnit } from './earthModel.js';
import { latLonToVec3 } from './geo.js';

const COLD=[0.45,0.64,1.0], HOT=[1.0,0.40,0.30];
const THRESH=0.85;    // |ΔVs| % to emit a structural blob (cores of real anomalies only)
const STEP=2;         // lat/lon subsample

// Blobs exist through the whole volume, but only the SHELL near the current depth
// is drawn — opacity & size collapse away from it. Peeling the depth slider sweeps
// the lit shell inward, so you read one clean structural surface at a time instead
// of all 32 layers stacked into a glowing ball.
const VERT=`precision highp float;
  uniform mat4 modelViewMatrix, projectionMatrix;
  uniform float uCurDepth,uFocus;
  attribute vec3 position, aOffset, aColor;
  attribute float aScale, aDepth, aAlpha;
  varying vec3 vColor; varying float vHi; varying float vA; varying vec3 vL;
  void main(){
    float prox = 1.0 - smoothstep(0.0, uFocus, abs(aDepth-uCurDepth));
    vHi = 0.40 + 0.9*prox; vColor=aColor; vA=aAlpha*prox; vL=position;
    vec3 wp = aOffset + position*aScale*(0.35+0.65*prox);   // shrink away from the lit shell
    gl_Position = projectionMatrix*modelViewMatrix*vec4(wp,1.0);
  }`;
const FRAG=`precision highp float;
  uniform float uOpacity;
  varying vec3 vColor; varying float vHi; varying float vA; varying vec3 vL;
  void main(){
    float edge=0.5+0.5*pow(clamp(vL.z*0.5+0.5,0.0,1.0),1.5);
    gl_FragColor=vec4(vColor*vHi*edge*vA*uOpacity, 1.0);
  }`;

export function makeDataBodies(ens){
  const {depths,nlon,nlat,dvsScale,dvs,agree}=ens;
  const off=[],scl=[],col=[],dep=[],alp=[];
  for(let di=0; di<depths.length; di++){
    const rUnit=depthToUnit(depths[di]), dfrac=depths[di]/EARTH_RADIUS;
    for(let j=0; j<nlat; j+=STEP){
      const lat=90-(j+0.5)/nlat*180;
      for(let i=0; i<nlon; i+=STEP){
        const k=(di*nlat+j)*nlon+i;
        const v=dvs[k]/dvsScale, ag=agree[k]/255;
        if(Math.abs(v)<THRESH || ag<0.3) continue;
        let p=latLonToVec3(lat, -180+(i+0.5)/nlon*360, rUnit);
        const s=0.028; const maxR=0.985-s; if(p.length()>maxR) p.setLength(maxR);
        const c = v>0 ? COLD : HOT;
        off.push(p.x,p.y,p.z); scl.push(s); col.push(c[0],c[1],c[2]);
        dep.push(dfrac); alp.push(Math.min(1,Math.abs(v)/2.0)*ag*0.85);
      }
    }
  }
  const count=scl.length;
  const base=new THREE.IcosahedronGeometry(1,1);
  const g=new THREE.InstancedBufferGeometry();
  g.index=base.index; g.setAttribute('position', base.attributes.position);
  g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(off),3));
  g.setAttribute('aScale',  new THREE.InstancedBufferAttribute(new Float32Array(scl),1));
  g.setAttribute('aColor',  new THREE.InstancedBufferAttribute(new Float32Array(col),3));
  g.setAttribute('aDepth',  new THREE.InstancedBufferAttribute(new Float32Array(dep),1));
  g.setAttribute('aAlpha',  new THREE.InstancedBufferAttribute(new Float32Array(alp),1));
  g.instanceCount=count;
  const mat=new THREE.RawShaderMaterial({ transparent:true, depthTest:false, depthWrite:false,
    blending:THREE.AdditiveBlending, vertexShader:VERT, fragmentShader:FRAG,
    uniforms:{ uCurDepth:{value:0}, uFocus:{value:0.016}, uOpacity:{value:1} } });
  const mesh=new THREE.Mesh(g,mat); mesh.frustumCulled=false; mesh.renderOrder=4;
  if(typeof console!=='undefined') console.log('data bodies:', count, 'blobs');
  return {
    group:mesh,
    setCurDepth:(u)=>mat.uniforms.uCurDepth.value=u,
    setOpacity:(o)=>mat.uniforms.uOpacity.value=o,
  };
}
