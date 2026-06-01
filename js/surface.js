// surface.js — a translucent relief Earth skin: real blue-marble colour +
// hill-shaded topography (from the elevation map), aligned to the same lat/lon
// convention as the coastlines/scan so continents sit where they should. Kept
// see-through so the interior still reads underneath.
import * as THREE from 'three';

export function makeReliefEarth(){
  const loader=new THREE.TextureLoader();
  // flipY=false so v=0 is the NORTH row, matching the hand-built scan DataTexture
  // (and therefore the coastlines/borders). Image textures default to flipY=true,
  // which would mirror the relief north<->south against the outlines.
  const colorTex=loader.load('./assets/earth-blue-marble.jpg');
  colorTex.colorSpace=THREE.SRGBColorSpace; colorTex.wrapS=THREE.RepeatWrapping; colorTex.flipY=false;
  const topoTex=loader.load('./assets/earth-topology.png');
  topoTex.colorSpace=THREE.NoColorSpace; topoTex.wrapS=THREE.RepeatWrapping; topoTex.flipY=false;

  const geo=new THREE.SphereGeometry(1.0, 160, 100);
  const mat=new THREE.ShaderMaterial({
    transparent:true, depthTest:false, depthWrite:false, side:THREE.FrontSide,
    uniforms:{ uColor:{value:colorTex}, uTopo:{value:topoTex}, uOpacity:{value:0.6} },
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
      uniform sampler2D uColor, uTopo; uniform float uOpacity;
      const float PI=3.141592653589793;
      void main(){
        vec3 dir=normalize(vP);
        float lat=asin(clamp(dir.y,-1.0,1.0)), lon=atan(dir.z,-dir.x);
        vec2 uv=vec2(lon/(2.0*PI)+0.5, 0.5-lat/PI);
        vec3 col=texture2D(uColor,uv).rgb;
        // hill-shade from the elevation gradient
        float e=0.0016;
        float h =texture2D(uTopo,uv).r;
        float hx=texture2D(uTopo,uv+vec2(e,0.0)).r;
        float hy=texture2D(uTopo,uv+vec2(0.0,e)).r;
        vec3 n=normalize(vec3((h-hx)*9.0,(h-hy)*9.0,1.0));
        float shade=clamp(dot(n,normalize(vec3(-0.55,0.6,0.85))),0.0,1.0);
        col=col*(0.62+0.7*shade)*1.12;
        col+=vec3(0.05,0.09,0.16)*pow(1.0-clamp(dot(normalize(vN),normalize(vV)),0.0,1.0),3.0); // faint atmosphere rim
        float ndv=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);
        gl_FragColor=vec4(col, uOpacity*(0.30+0.70*ndv)); // softer at grazing edges
      }`,
  });
  const mesh=new THREE.Mesh(geo,mat);
  mesh.renderOrder=1;
  return { mesh, setOpacity:(o)=>mat.uniforms.uOpacity.value=o };
}
