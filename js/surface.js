// surface.js — the relief as a REAL 3-D structure: the sphere is displaced by land
// topography (exaggerated) so mountains are actual geometry, not a painted skin. A
// radial cut (uCutR) lets the "Relief peel" slice down through the peaks; a separate
// translucent water shell fills the oceans at sea level. The elevation map is land-only
// (no bathymetry), so land reads as MEASURED/known and the ocean floor as ESTIMATED.
import * as THREE from 'three';
import { EARTH_RADIUS, RELIEF_EXAG, RELIEF_MAXELEV } from './earthModel.js';

const DISP = RELIEF_MAXELEV/EARTH_RADIUS*RELIEF_EXAG;   // unit displacement at a full (white) topo sample
const SEA = 0.018;                                      // topo sample below this = ocean (no land)
const NOCUT = 9.0;                                      // uCutR sentinel = nothing clipped

export function makeReliefEarth(){
  const loader=new THREE.TextureLoader();
  // flipY=false so v=0 is the NORTH row, matching the scan DataTexture / coastlines.
  const colorTex=loader.load('./assets/earth-blue-marble.jpg');
  colorTex.colorSpace=THREE.SRGBColorSpace; colorTex.wrapS=THREE.RepeatWrapping; colorTex.flipY=false;
  const topoTex=loader.load('./assets/earth-topology.png');
  topoTex.colorSpace=THREE.NoColorSpace; topoTex.wrapS=THREE.RepeatWrapping; topoTex.flipY=false;

  // ---------- displaced relief shell ----------
  const geo=new THREE.SphereGeometry(1.0, 384, 192);
  const mat=new THREE.ShaderMaterial({
    transparent:true, depthTest:false, depthWrite:false, side:THREE.DoubleSide,
    uniforms:{ uColor:{value:colorTex}, uTopo:{value:topoTex}, uOpacity:{value:0.6}, uBright:{value:1.12},
      uDisp:{value:DISP}, uCutR:{value:NOCUT}, uCutFade:{value:0.05}, uPeel:{value:0} },
    vertexShader:`
      precision highp float;
      uniform sampler2D uTopo; uniform float uDisp;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vH; varying float vR;
      const float PI=3.141592653589793;
      void main(){
        vec3 dir=normalize(position);
        float lat=asin(clamp(dir.y,-1.0,1.0)), lon=atan(dir.z,-dir.x);
        vUv=vec2(lon/(2.0*PI)+0.5, 0.5-lat/PI);
        vH=texture2D(uTopo,vUv).r;
        vR=1.0 + vH*uDisp;                 // exaggerated radius (sea level = 1.0)
        vec3 p=dir*vR;
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      precision highp float;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vH; varying float vR;
      uniform sampler2D uColor, uTopo; uniform float uOpacity, uBright, uCutR, uCutFade, uPeel;
      void main(){
        float top=uCutR+uCutFade; if(vR > top) discard;  // peel: discard above the SOFT cut band
        bool land = vH > ${SEA.toFixed(3)};
        vec3 col=texture2D(uColor,vUv).rgb;
        // hill-shade from the elevation gradient
        float e=0.0016;
        float hx=texture2D(uTopo,vUv+vec2(e,0.0)).r;
        float hy=texture2D(uTopo,vUv+vec2(0.0,e)).r;
        vec3 n=normalize(vec3((vH-hx)*9.0,(vH-hy)*9.0,1.0));
        float shade=clamp(dot(n,normalize(vec3(-0.55,0.6,0.85))),0.0,1.0);
        col=col*(0.62+0.7*shade)*uBright;
        float ndv=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);
        col+=vec3(0.05,0.09,0.16)*pow(1.0-ndv,3.0);        // faint atmosphere rim
        // honest encoding: land = measured (bright); ocean floor = no data -> estimated (dim, cool)
        float estimated = land ? 0.0 : 1.0;
        col = mix(col, mix(col,vec3(0.10,0.14,0.20),0.6), estimated);
        // opacity: the surface reads strongly; land = measured (solid), ocean floor = estimated (lighter)
        float aLand = mix(0.82, 1.0, uPeel);
        float aOcean= mix(0.62, 0.55, uPeel);
        float a = (land?aLand:aOcean) * uOpacity * (0.62+0.38*ndv);
        // SOFT CUT: instead of snapping off, the surface DISSOLVES over the band toward the cut,
        // so it melts into the wireframe/interior below (gradual merge, no hard edge).
        float fade = (uCutR<${NOCUT.toFixed(1)}) ? (1.0 - smoothstep(uCutR, top, vR)) : 1.0;
        a *= fade;
        col += vec3(0.42,0.62,0.88) * (1.0-fade) * 0.28;   // gentle cool wash on the dissolving rim
        gl_FragColor=vec4(col, a);
      }`,
  });
  const mesh=new THREE.Mesh(geo,mat); mesh.renderOrder=1;

  // ---------- translucent ocean shell at sea level ----------
  const wgeo=new THREE.SphereGeometry(1.0, 256, 128);
  const wmat=new THREE.ShaderMaterial({
    transparent:true, depthTest:false, depthWrite:false, side:THREE.DoubleSide,
    uniforms:{ uTopo:{value:topoTex}, uCutR:{value:NOCUT}, uCutFade:{value:0.05}, uOpacity:{value:0.0} },
    vertexShader:`
      precision highp float;
      uniform sampler2D uTopo;
      varying vec3 vN; varying vec3 vV; varying float vH;
      const float PI=3.141592653589793;
      void main(){
        vec3 dir=normalize(position);
        float lat=asin(clamp(dir.y,-1.0,1.0)), lon=atan(dir.z,-dir.x);
        vH=texture2D(uTopo,vec2(lon/(2.0*PI)+0.5,0.5-lat/PI)).r;
        vec4 mv=modelViewMatrix*vec4(position,1.0);   // sea level: r = 1.0
        vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      precision highp float;
      varying vec3 vN; varying vec3 vV; varying float vH;
      uniform float uCutR, uCutFade, uOpacity;
      void main(){
        if(vH > ${SEA.toFixed(3)}) discard;             // oceans only
        // fade the sea out as the cut descends through it, so sea level hands off gradually
        float wfade = 1.0 - smoothstep(uCutR, uCutR+uCutFade, 1.0);
        if(wfade <= 0.001) discard;                     // fully below the cut: beneath the sea
        float ndv=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);
        vec3 deep=vec3(0.02,0.10,0.22), shallow=vec3(0.10,0.32,0.46);
        vec3 col=mix(deep,shallow,ndv) + vec3(0.4,0.6,0.8)*pow(1.0-ndv,4.0)*0.5;
        gl_FragColor=vec4(col, uOpacity*(0.45+0.55*ndv)*wfade);
      }`,
  });
  const water=new THREE.Mesh(wgeo,wmat); water.renderOrder=2; water.visible=false;

  return {
    mesh, water,
    setOpacity:(o)=>mat.uniforms.uOpacity.value=o,
    setBright:(b)=>mat.uniforms.uBright.value=b,
    setCut:(r)=>{ mat.uniforms.uCutR.value=r; wmat.uniforms.uCutR.value=r; },
    setPeel:(on)=>{ mat.uniforms.uPeel.value=on?1:0; water.visible=!!on; wmat.uniforms.uOpacity.value=on?0.55:0.0;
      if(!on) mat.uniforms.uCutR.value=NOCUT; },
  };
}
