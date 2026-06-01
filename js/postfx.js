// postfx.js — the layered render pipeline that makes the concept literal:
//   1. render the theoretical onion to an offscreen target
//   2. separable-Gaussian blur it  -> the "fuzzy estimation"
//   3. to screen: stars, then additively the blurred model, then the crisp scan
import * as THREE from 'three';

function makeQuad(){
  const scene=new THREE.Scene();
  const cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const geo=new THREE.PlaneGeometry(2,2);
  const mesh=new THREE.Mesh(geo, null);
  scene.add(mesh);
  return {scene,cam,mesh};
}

const BLUR_FRAG=`
  precision highp float;
  varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 dir;
  void main(){
    vec4 s=texture2D(tDiffuse,vUv)*0.2270270270;
    s+=texture2D(tDiffuse,vUv+dir*1.3846153846)*0.3162162162;
    s+=texture2D(tDiffuse,vUv-dir*1.3846153846)*0.3162162162;
    s+=texture2D(tDiffuse,vUv+dir*3.2307692308)*0.0702702703;
    s+=texture2D(tDiffuse,vUv-dir*3.2307692308)*0.0702702703;
    gl_FragColor=s;
  }`;
const VERT=`varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}`;

function makeStarfield(){
  const g=new THREE.BufferGeometry();
  const N=2600, pos=new Float32Array(N*3), col=new Float32Array(N*3), siz=new Float32Array(N);
  let seed=1234.5;
  const rnd=()=>{seed=Math.sin(seed*91.7+13.1)*43758.5453; return seed-Math.floor(seed);};
  for(let i=0;i<N;i++){
    const u=rnd()*2-1, t=rnd()*Math.PI*2, r=Math.sqrt(1-u*u);
    const R=46+rnd()*20;
    pos[i*3]=Math.cos(t)*r*R; pos[i*3+1]=u*R; pos[i*3+2]=Math.sin(t)*r*R;
    const w=0.55+rnd()*0.45, tint=rnd();
    col[i*3]=w*(0.8+0.2*tint); col[i*3+1]=w*(0.85+0.1*tint); col[i*3+2]=w;
    siz[i]=rnd()*rnd()*2.4+0.25;
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setAttribute('asize',new THREE.Float32BufferAttribute(siz,1));
  const m=new THREE.ShaderMaterial({
    transparent:true, depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{uPix:{value:1}},
    vertexShader:`
      attribute float asize; attribute vec3 color; varying vec3 vC; uniform float uPix;
      void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=asize*uPix*(120.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`
      precision highp float; varying vec3 vC;
      void main(){ vec2 d=gl_PointCoord-0.5; float a=smoothstep(0.5,0.0,length(d));
        gl_FragColor=vec4(vC,a); }`,
  });
  const scene=new THREE.Scene();
  scene.add(new THREE.Points(g,m));
  return {scene, mat:m};
}

export function makePipeline(renderer){
  const opt={depthBuffer:false, format:THREE.RGBAFormat, type:THREE.UnsignedByteType,
    minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter};
  let rt=new THREE.WebGLRenderTarget(2,2,opt);
  let rtA=new THREE.WebGLRenderTarget(2,2,opt);
  let rtB=new THREE.WebGLRenderTarget(2,2,opt);
  let W=2,H=2;

  const quad=makeQuad();
  const blurMat=new THREE.ShaderMaterial({uniforms:{tDiffuse:{value:null},dir:{value:new THREE.Vector2()}},
    vertexShader:VERT, fragmentShader:BLUR_FRAG, depthTest:false, depthWrite:false});
  const compMat=new THREE.ShaderMaterial({
    uniforms:{tDiffuse:{value:null}, uIntensity:{value:1}},
    vertexShader:VERT,
    fragmentShader:`precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uIntensity;
      void main(){ gl_FragColor=vec4(texture2D(tDiffuse,vUv).rgb*uIntensity,1.0); }`,
    transparent:true, depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending});

  const stars=makeStarfield();

  function setSize(w,h,pix){
    W=Math.max(2,Math.floor(w*0.5)); H=Math.max(2,Math.floor(h*0.5));
    rt.setSize(W,H); rtA.setSize(W,H); rtB.setSize(W,H);
    stars.mat.uniforms.uPix.value=pix||1;
  }

  function blur(srcTex, amount){
    const spread=0.6+amount*5.0;
    let src=srcTex;
    for(let it=0; it<2; it++){
      blurMat.uniforms.tDiffuse.value=src; blurMat.uniforms.dir.value.set(spread/W,0);
      quad.mesh.material=blurMat; renderer.setRenderTarget(rtA); renderer.clear(); renderer.render(quad.scene,quad.cam);
      blurMat.uniforms.tDiffuse.value=rtA.texture; blurMat.uniforms.dir.value.set(0,spread/H);
      renderer.setRenderTarget(rtB); renderer.clear(); renderer.render(quad.scene,quad.cam);
      src=rtB.texture;
    }
    return rtB.texture;
  }

  function render(theoryScene, scanScene, camera, p){
    // 1 — theoretical onion to offscreen
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000,1); renderer.clear();
    if(p.showTheory) renderer.render(theoryScene,camera);

    // 2 — blur it
    let blurred=rt.texture;
    if(p.showTheory) blurred=blur(rt.texture, p.blur);

    // 3 — to screen
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x04050a,1); renderer.clear();
    renderer.render(stars.scene,camera);
    if(p.showTheory){
      compMat.uniforms.tDiffuse.value=blurred;
      compMat.uniforms.uIntensity.value=p.theoryIntensity;
      quad.mesh.material=compMat;
      renderer.render(quad.scene,quad.cam);
    }
    if(p.showScan) renderer.render(scanScene,camera);
  }

  return {setSize, render, starScene:stars.scene};
}
