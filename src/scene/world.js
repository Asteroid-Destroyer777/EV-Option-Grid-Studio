import {renderRatio,createRenderBudget} from './render-budget.js';
// Рендерер, камера, свет, небо.
import * as THREE from 'three';
import { U, makeSkyMaterial } from './materials.js';

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  const budget=createRenderBudget(1.5);
  let firstSize=true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(U.uFogColor.value, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(U.uFogColor.value.clone(), U.uFogDensity.value);

  const camera = new THREE.PerspectiveCamera(42, 1, 2, 16000);
  camera.position.set(1200, 900, 1300);

  // свет для «обычных» материалов (станции, опции, техника)
  const hemi = new THREE.HemisphereLight(0x9fb0d8, 0x1a1b22, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dd, 1.6);
  sun.position.copy(U.uSunDir.value).multiplyScalar(500);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6a78ff, 0.35);
  fill.position.set(0.6, 0.3, -0.7).multiplyScalar(500);
  scene.add(fill);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 24, 12), makeSkyMaterial());
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  let W = 1, H = 1, shiftX = 0;
  function applyViewOffset() {
    if (Math.abs(shiftX) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(W, H, -shiftX, 0, W, H);
  }
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width)); H = Math.max(2, Math.round(r.height));
    const cap=renderRatio({width:W,height:H,dpr:window.devicePixelRatio||1,mobile:matchMedia('(max-width: 700px)').matches});
    const ratio=firstSize?(firstSize=false,cap):Math.min(budget.ratio,cap);
    budget.reset(cap);
    if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
    renderer.setSize(W, H, false);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    camera.aspect = W / H;
    applyViewOffset();
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    renderer, scene, camera, sky, hemi, sun, resize,
    sampleFrame(ms,now){const ratio=budget.sample(ms,now);if(ratio!=null&&Math.abs(renderer.getPixelRatio()-ratio)>.04){renderer.setPixelRatio(ratio);renderer.setSize(W,H,false);}},
    get size() { return { w: W, h: H }; },
    /** Сдвиг центра проекции (px, вправо>0) — чтобы фокус не прятался под боковыми панелями. */
    setViewShift(px) { shiftX = px; applyViewOffset(); camera.updateProjectionMatrix(); },
    setFogDensity(d) { U.uFogDensity.value = d; scene.fog.density = d; },
  };
}
