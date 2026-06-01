// shells.js — the two rendered layers:
//   makeTheoryShells : soft, additive, fresnel-lit onion (gets blurred in post)
//   makeScanShell    : the crisp depth-slice that samples the baked scan texture
import * as THREE from 'three';
import { THEORY_SHELLS, kmToUnit } from './earthModel.js';
import { CATEGORY } from './tomography.js';

const c3 = (hex)=>{const c=new THREE.Color(hex);return new THREE.Vector3(c.r,c.g,c.b);};

const NOISE_GLSL = `
float hash3(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnoise3(vec3 x){
  vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),f.x),
                 mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),
                 mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm3(vec3 p){return vnoise3(p)*0.6+vnoise3(p*2.4+5.0)*0.3+vnoise3(p*4.9+9.0)*0.1;}
`;

// ---------------- theoretical shells ----------------
export function makeTheoryShells(){
  const group=new THREE.Group();
  group.renderOrder=0;
  for(const s of THEORY_SHELLS){
    const r=kmToUnit(s.rOuterKm);
    const geo=new THREE.SphereGeometry(r, 96, 64);
    const mat=new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, depthTest:false,
      blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
      uniforms:{
        uInner:{value:c3(s.cInner)}, uOuter:{value:c3(s.cOuter)},
        uGlow:{value:s.glow}, uTime:{value:0},
      },
      vertexShader:`
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz);
          vP=normalize(position);
          gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader:`
        precision highp float;
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        uniform vec3 uInner,uOuter; uniform float uGlow,uTime;
        ${NOISE_GLSL}
        void main(){
          float ndv=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);
          float fres=pow(1.0-ndv,2.3);
          float n=fbm3(vP*5.0+vec3(0.0,uTime*0.03,0.0));
          vec3 col=mix(uInner,uOuter,fres);
          col*= (0.55+0.7*n);
          float a=(0.06+0.5*fres+0.16*n)*uGlow;
          a=clamp(a,0.0,1.0);
          gl_FragColor=vec4(col*a,a);
        }`,
    });
    const mesh=new THREE.Mesh(geo,mat);
    mesh.userData.mat=mat;
    group.add(mesh);
  }
  group.userData.tick=(t)=>group.children.forEach(m=>m.userData.mat.uniforms.uTime.value=t);
  return group;
}

// ---------------- scan shell ----------------
export function makeScanShell(scanTexture){
  const cats=Object.values(CATEGORY).sort((a,b)=>a.id-b.id).map(c=>c3(c.color));
  const geo=new THREE.SphereGeometry(1, 160, 120);
  const mat=new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, depthTest:false, side:THREE.FrontSide,
    blending:THREE.NormalBlending,
    uniforms:{
      uTex:{value:scanTexture},
      uOpacity:{value:0.92}, uMode:{value:0.0}, uGain:{value:1.0}, uCovFloor:{value:0.16},
      uCat:{value:cats},
    },
    vertexShader:`
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.0);
        vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz);
        vP=normalize(position);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      precision highp float;
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      uniform sampler2D uTex; uniform float uOpacity,uMode,uGain,uCovFloor;
      uniform vec3 uCat[7];
      const float PI=3.141592653589793;
      vec3 dvsColor(float t){
        vec3 zero=vec3(0.93,0.95,0.98);
        vec3 cold1=vec3(0.62,0.77,1.00), cold2=vec3(0.07,0.20,0.70);
        vec3 warm1=vec3(1.00,0.52,0.42), warm2=vec3(0.74,0.09,0.14);
        float a=clamp(abs(t),0.0,1.0);
        vec3 c = t>=0.0
          ? mix(zero, mix(cold1,cold2,smoothstep(0.4,1.0,a)), smoothstep(0.0,0.5,a))
          : mix(zero, mix(warm1,warm2,smoothstep(0.4,1.0,a)), smoothstep(0.0,0.5,a));
        return c;
      }
      void main(){
        vec3 dir=normalize(vP);
        float lat=asin(clamp(dir.y,-1.0,1.0));
        float lon=atan(dir.z,-dir.x);
        vec2 uv=vec2(lon/(2.0*PI)+0.5, 0.5-lat/PI);
        vec4 d=texture2D(uTex,uv);
        float signed=(d.r-0.5)*2.0*uGain;
        float cov=d.g;
        int id=int(floor(d.b*255.0/40.0+0.5));
        float strength=clamp(abs(signed),0.0,1.0);
        vec3 color = uMode<0.5 ? dvsColor(signed) : uCat[id];
        // a touch of self-illumination on strong anomalies
        color += color*strength*0.35;
        float ndv=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);
        float limb=smoothstep(0.0,0.32,ndv);
        float alpha=cov*(uCovFloor+(1.0-uCovFloor)*strength)*uOpacity*limb;
        float isFeat = id>0 ? 1.0 : 0.0;
        if(uMode>0.5) alpha=cov*(0.05+0.95*isFeat)*uOpacity*limb; // feature mode: hide neutral mantle
        gl_FragColor=vec4(color,alpha);
      }`,
  });
  const mesh=new THREE.Mesh(geo,mat);
  mesh.renderOrder=2;
  return {
    mesh, material:mat,
    setRadius:(u)=>mesh.scale.setScalar(Math.max(0.012,u)),
    setOpacity:(o)=>mat.uniforms.uOpacity.value=o,
    setMode:(m)=>mat.uniforms.uMode.value=m,
    setGain:(g)=>mat.uniforms.uGain.value=g,
  };
}
