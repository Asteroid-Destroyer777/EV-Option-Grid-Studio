// Общие uniform-переменные и шейдерные материалы сцены.
// Все «городские» материалы понимают режим GRID (uGrid 0..1): город становится призрачным, виден подземный слой.
import * as THREE from 'three';

export const U = {
  uMetroFocus: {value:new THREE.Vector3(0,0,0)},
  uTime: { value: 0 },
  uGrid: { value: 0 },
  uNight: { value: 1 },
  uFuture: { value: 0 },
  uDim: { value: 0 },
  uFogColor: { value: new THREE.Color('#0a0c11') },
  uFogDensity: { value: 0.00013 },
  uSunDir: { value: new THREE.Vector3(-0.55, 0.62, 0.55).normalize() },
};

export const PAL = {
  ground: '#14161b',
  land: { 1: '#181b21', 2: '#1a1d25', 3: '#1b1a1c', 4: '#17181c', 5: '#17251f', 6: '#152019', 7: '#1d2027', 8: '#1a1d24', 9: '#16261f', 10: '#141d18' },
  water: '#0a1f33',
  asphalt: ['#2a2d36', '#262931', '#23262e', '#20232a', '#1d2026', '#191b20', '#2a2c34'],
  curb: '#2e313a',
  bldg: { 0: '#464a54', 1: '#4e525d', 2: '#3f4d61', 3: '#4b4744', 4: '#5a5763', 5: '#393c43' },
  bldgNew: '#5f6379',
  violet: '#8b7bff', cyan: '#59d8e6', ok: '#35d08f', warn: '#ffb83d', bad: '#ff4d5e',
};

const GLSL_HEAD = /* glsl */`
uniform float uTime; uniform float uGrid; uniform float uNight; uniform float uFuture; uniform float uDim;
uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uSunDir;
vec3 applyFog(vec3 c, float d){ float f = 1.0 - exp(-pow(uFogDensity*d, 2.0)); return mix(c, uFogColor, clamp(f,0.0,1.0)); }
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x), f.y); }
`;

const fadeMats = new Set();
function fade(mat, gridAlpha, depthWrite = true) {
  mat.userData.fade = true;
  mat.userData.baseDepthWrite = depthWrite;
  mat.userData.baseTransparent = mat.transparent;
  mat.uniforms.uFade = { value: gridAlpha };
  fadeMats.add(mat);
  return mat;
}
/** Плавное включение режима GRID (0..1). */
export function setGridMix(v) {
  U.uGrid.value = v;
  const t = v > 0.002;
  for (const m of fadeMats) {
    m.transparent = t || m.userData.baseTransparent;
    m.depthWrite = !t && m.userData.baseDepthWrite;
  }
}

function shader(opts) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U, ...(opts.uniforms || {}) },
    vertexShader: opts.vertex, fragmentShader: opts.fragment,
    transparent: !!opts.transparent, depthWrite: opts.depthWrite !== false, depthTest: opts.depthTest !== false,
    side: opts.side ?? THREE.FrontSide, blending: opts.blending ?? THREE.NormalBlending,
    polygonOffset: opts.units != null, polygonOffsetFactor: opts.units != null ? -1 : 0, polygonOffsetUnits: opts.units || 0,
  });
  return m;
}

/* -------------------- здания -------------------- */
export function makeBuildingMaterial() {
  const m = shader({
    vertex: /* glsl */`
      attribute vec3 aColor; attribute float aSeed; attribute float aKind; attribute float aNew;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying vec2 vUv; varying float vSeed; varying float vKind; varying float vNew;
      void main(){
        vec4 w = modelMatrix * vec4(position,1.0);
        vWorld = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vCol = aColor; vUv = uv; vSeed = aSeed; vKind = aKind; vNew = aNew;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragment: GLSL_HEAD + /* glsl */`
      uniform float uFade;uniform vec3 uMetroFocus;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying vec2 vUv; varying float vSeed; varying float vKind; varying float vNew;
      void main(){
        vec3 n = normalize(vN);
        if(uMetroFocus.z>0.0 && distance(vWorld.xz,uMetroFocus.xy)<uMetroFocus.z)discard;
        bool roof = vUv.y < -0.5;
        float sun = max(dot(n, uSunDir), 0.0);
        float hemi = 0.52 + 0.48*n.y;
        float ao = roof ? 1.0 : mix(0.5, 1.0, smoothstep(0.0, 16.0, vWorld.y));
        vec3 col = vCol * (0.46*hemi + 0.82*sun) * ao;
        vec3 emis = vec3(0.0);
        if(!roof){
          vec2 cs = vec2(3.5, 3.1);
          float fill = 0.62;
          if(vKind > 1.5 && vKind < 2.5){ cs = vec2(2.4, 3.6); fill = 0.86; }
          else if(vKind > 2.5 && vKind < 3.5){ cs = vec2(7.0, 5.5); fill = 0.5; }
          else if(vKind > 4.5){ cs = vec2(9.0, 6.0); fill = 0.0; }
          vec2 g = vUv / cs; vec2 cell = floor(g); vec2 f = fract(g);
          float m = (1.0-fill)*0.5;
          float win = step(m, f.x)*step(f.x, 1.0-m)*step(0.2, f.y)*step(f.y, 0.8);
          float r = hash21(cell + vSeed*31.7);
          float lit = step(0.90 - 0.12*vNew, r);
          col = mix(col, col*0.5 + vec3(0.02,0.035,0.07), win*0.75);
          emis += win*lit*vec3(1.0,0.80,0.52)*(0.55+0.4*hash21(cell+3.1))*uNight*0.85;
        }
        if(vNew > 0.5){ col += vec3(0.05,0.045,0.09)*hemi; if(roof) col += vec3(0.05,0.04,0.11); }
        col += emis;
        col *= mix(1.0, 0.5, uDim);
        float alpha = mix(1.0, uFade, uGrid);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(dot(n,V)), 2.2);
        vec3 ghost = vec3(0.30,0.34,0.55)*(0.10+0.9*fres) + emis*0.4;
        col = mix(col, ghost, uGrid*0.85);
        alpha += uGrid*fres*0.28;
        float d = length(cameraPosition - vWorld);
        col = applyFog(col, d);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
  return fade(m, 0.075, true);
}

/* -------------------- плоские слои земли (вершинные цвета) -------------------- */
export function makeLayerMaterial(units, gridAlpha = 0.16, noiseAmt = 0.0) {
  const m = shader({
    units,
    uniforms: { uNoise: { value: noiseAmt } },
    vertex: /* glsl */`
      attribute vec3 aColor; varying vec3 vCol; varying vec3 vWorld;
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vWorld=w.xyz; vCol=aColor; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragment: GLSL_HEAD + /* glsl */`
      uniform float uFade; uniform float uNoise;
      varying vec3 vCol; varying vec3 vWorld;
      void main(){
        vec3 col = vCol;
        float nz = vnoise(vWorld.xz*0.035)*0.6 + vnoise(vWorld.xz*0.21)*0.4;
        col *= 1.0 + (nz-0.5)*uNoise;
        float d = length(cameraPosition - vWorld);
        col = applyFog(col, d);
        float alpha = mix(1.0, uFade, uGrid);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
  return fade(m, gridAlpha, true);
}

/* -------------------- базовая плита с координатной сеткой -------------------- */
export function makeGroundMaterial(halfW, halfH) {
  const m = shader({
    uniforms: { uHalf: { value: new THREE.Vector2(halfW, halfH) }, uBase: { value: new THREE.Color(PAL.ground) } },
    vertex: /* glsl */`varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragment: GLSL_HEAD + /* glsl */`
      uniform float uFade; uniform vec2 uHalf; uniform vec3 uBase; varying vec3 vWorld;
      float gridLine(vec2 p, float s, float w){ vec2 g = abs(fract(p/s+0.5)-0.5)*s; vec2 f = fwidth(p); vec2 l = smoothstep(f*w+f, f*w, g); return max(l.x,l.y); }
      void main(){
        vec3 col = uBase;
        float d = length(cameraPosition - vWorld);
        float far = 1.0 - smoothstep(1500.0, 4200.0, d);
        float minor = gridLine(vWorld.xz, 100.0, 0.5) * 0.045 * far;
        float major = gridLine(vWorld.xz, 500.0, 0.6) * 0.09;
        col += vec3(0.55,0.58,0.8)*(minor+major);
        vec2 e = uHalf - abs(vWorld.xz);
        float edge = 1.0 - smoothstep(0.0, 14.0, min(e.x,e.y));
        col += vec3(0.42,0.36,1.0)*edge*0.55;
        col = applyFog(col, d);
        gl_FragColor = vec4(col, mix(1.0, uFade, uGrid));
        #include <colorspace_fragment>
      }`,
  });
  return fade(m, 0.2, true);
}

/* -------------------- вода -------------------- */
export function makeWaterMaterial(units) {
  const m = shader({
    units,
    vertex: /* glsl */`varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragment: GLSL_HEAD + /* glsl */`
      uniform float uFade; varying vec3 vWorld;
      void main(){
        vec2 p = vWorld.xz;
        float t = uTime*0.06;
        float w1 = vnoise(p*0.018 + vec2(t, -t*0.7));
        float w2 = vnoise(p*0.07 + vec2(-t*1.6, t));
        float streak = smoothstep(0.62, 0.9, w1*0.6 + w2*0.5);
        vec3 col = vec3(0.018,0.07,0.12) + vec3(0.015,0.035,0.065)*w1;
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(V.y,0.0,1.0), 3.0);
        col += vec3(0.06,0.11,0.19)*fres*0.8 + vec3(0.2,0.33,0.5)*streak*0.10;
        float d = length(cameraPosition - vWorld);
        col = applyFog(col, d);
        gl_FragColor = vec4(col, mix(1.0, uFade, uGrid));
        #include <colorspace_fragment>
      }`,
  });
  return fade(m, 0.22, true);
}

/* -------------------- дороги -------------------- */
export function makeRoadMaterial({ color, line = '#c8c9d0', marks = false, units, sidewalk = false, gridAlpha = 0.3 }) {
  const m = shader({
    units,
    uniforms: { uColor: { value: new THREE.Color(color) }, uLine: { value: new THREE.Color(line) }, uMarks: { value: marks ? 1 : 0 }, uWalk: { value: sidewalk ? 1 : 0 } },
    vertex: /* glsl */`varying vec2 vUv; varying vec3 vWorld; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragment: GLSL_HEAD + /* glsl */`
      uniform float uFade; uniform vec3 uColor; uniform vec3 uLine; uniform float uMarks; uniform float uWalk;
      varying vec2 vUv; varying vec3 vWorld;
      void main(){
        vec3 col = uColor;
        float d = length(cameraPosition - vWorld);
        float near = 1.0 - smoothstep(250.0, 900.0, d);
        if(uMarks > 0.5){
          float a = vUv.x;
          float dash = step(fract(vUv.y/16.0), 0.5);
          float center = (1.0 - smoothstep(0.02, 0.05, abs(a))) * dash;
          float edge = 1.0 - smoothstep(0.02, 0.05, abs(abs(a)-0.88));
          col = mix(col, uLine, max(center*0.5, edge*0.32) * near);
        }
        if(uWalk > 0.5){ col *= 1.0 + 0.10*vnoise(vWorld.xz*1.3); }
        col = applyFog(col, d);
        gl_FragColor = vec4(col, mix(1.0, uFade, uGrid));
        #include <colorspace_fragment>
      }`,
  });
  return fade(m, gridAlpha, true);
}

/* -------------------- ж/д, МЦК -------------------- */
export function makeRailMaterial({ color = '#22242a', rail = '#6a6e7c', glow = null, units }) {
  const m = shader({
    units,
    uniforms: { uColor: { value: new THREE.Color(color) }, uRail: { value: new THREE.Color(rail) }, uGlow: { value: new THREE.Color(glow || '#000000') }, uHasGlow: { value: glow ? 1 : 0 } },
    vertex: /* glsl */`varying vec2 vUv; varying vec3 vWorld; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragment: GLSL_HEAD + /* glsl */`
      uniform float uFade; uniform vec3 uColor; uniform vec3 uRail; uniform vec3 uGlow; uniform float uHasGlow; varying vec2 vUv; varying vec3 vWorld;
      void main(){
        float a = abs(vUv.x);
        float d = length(cameraPosition - vWorld);
        float near = 1.0 - smoothstep(200.0, 800.0, d);
        vec3 col = uColor;
        float r = 1.0 - smoothstep(0.03, 0.09, abs(a-0.42));
        float sleeper = step(fract(vUv.y/1.6), 0.28) * step(a, 0.62);
        col = mix(col, uRail, r*0.65*near + sleeper*0.1*near);
        if(uHasGlow > 0.5){ float g = 1.0 - smoothstep(0.0, 0.34, a); col = mix(col, uGlow, g*0.85); col += uGlow*g*0.25; }
        col = applyFog(col, d);
        gl_FragColor = vec4(col, mix(1.0, uFade, uGrid));
        #include <colorspace_fragment>
      }`,
  });
  return fade(m, 0.25, true);
}

/* -------------------- небо -------------------- */
export function makeSkyMaterial() {
  return shader({
    depthWrite: false, side: THREE.BackSide,
    vertex: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.9999; }`,
    fragment: GLSL_HEAD + /* glsl */`
      varying vec3 vDir;
      void main(){
        float y = vDir.y;
        vec3 hor = uFogColor*1.15;
        vec3 top = vec3(0.020,0.022,0.038);
        vec3 col = mix(hor, top, pow(clamp(y,0.0,1.0), 0.55));
        col = mix(col, uFogColor*0.55, smoothstep(0.0,-0.35,y));
        float h = hash21(floor(vDir.xz/max(abs(vDir.y),0.05)*220.0));
        col += vec3(0.5,0.55,0.8) * step(0.9985, h) * smoothstep(0.15, 0.5, y) * 0.5;
        col = mix(col, col*vec3(0.6,0.7,1.1), uGrid*0.6);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/* -------------------- боковые грани плиты (разрез грунта) -------------------- */
export function makeSlabMaterial() {
  const m = shader({
    vertex: /* glsl */`varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragment: GLSL_HEAD + /* glsl */`
      varying vec3 vWorld;
      void main(){
        float depth = clamp(-vWorld.y/70.0, 0.0, 1.0);
        vec3 col = mix(vec3(0.115,0.125,0.16), vec3(0.03,0.032,0.045), pow(depth,0.7));
        float strata = vnoise(vec2((vWorld.x+vWorld.z)*0.02, vWorld.y*0.45));
        col *= 0.85 + 0.3*strata;
        float lines = 1.0 - smoothstep(0.0, 0.06, abs(fract(vWorld.y/10.0)-0.5+0.5) ); // отметки каждые 10 м
        lines = max(lines, 1.0 - smoothstep(0.0, 0.06, abs(fract(vWorld.y/10.0) - 1.0)));
        col += vec3(0.3,0.32,0.5)*lines*0.10*(0.3+uGrid);
        col += vec3(0.35,0.3,0.9)*(1.0 - smoothstep(0.0, 0.8, -vWorld.y))*0.55;
        col += vec3(0.05,0.28,0.32)*uGrid*(0.25 + 0.2*strata);
        float d = length(cameraPosition - vWorld);
        col = applyFog(col, d);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return m;
}

/* -------------------- транспорт (инстансы) -------------------- */
export function makeVehicleMaterial() {
  return shader({
    vertex: /* glsl */`
      attribute vec3 aColor; attribute float aEmit;
      varying vec3 vN; varying vec3 vCol; varying float vEmit; varying vec3 vWorld; varying vec3 vTint;
      void main(){
        mat4 im = mat4(1.0);
        #ifdef USE_INSTANCING
          im = instanceMatrix;
        #endif
        vec3 tint = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          tint = instanceColor;
        #endif
        vec4 w = modelMatrix * im * vec4(position,1.0);
        vWorld = w.xyz; vN = normalize(mat3(modelMatrix*im)*normal); vCol = aColor; vEmit = aEmit; vTint = tint;
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragment: GLSL_HEAD + /* glsl */`
      varying vec3 vN; varying vec3 vCol; varying float vEmit; varying vec3 vWorld; varying vec3 vTint;
      void main(){
        vec3 n = normalize(vN);
        float sun = max(dot(n,uSunDir),0.0); float hemi = 0.5+0.5*n.y;
        // aEmit: 0 — окрашиваемый кузов, 1 — светящиеся огни, 2 — тёмные неокрашиваемые детали
        vec3 base = vCol;
        if(vEmit < 0.5) base = vCol * vTint;
        vec3 col = base*(0.5*hemi + 0.85*sun);
        if(vEmit > 0.5 && vEmit < 1.5) col = vCol*1.8;
        float d = length(cameraPosition - vWorld);
        col = applyFog(col, d);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/* -------------------- светящиеся ленты потоков / кабелей -------------------- */
export function makeFlowMaterial(color, { speed = 0.7, dash = 26, core = 0.5, alpha = 1.0, depthTest = true } = {}) {
  return shader({
    transparent: true, depthWrite: false, depthTest, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uSpeed: { value: speed }, uDash: { value: dash },
      uCore: { value: core }, uAlpha: { value: alpha }, uPulse: { value: 0 }, uHi: { value: 0 },
    },
    vertex: /* glsl */`varying vec2 vUv; varying vec3 vWorld; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragment: GLSL_HEAD + /* glsl */`
      uniform vec3 uColor; uniform float uSpeed; uniform float uDash; uniform float uCore; uniform float uAlpha; uniform float uPulse; uniform float uHi;
      varying vec2 vUv; varying vec3 vWorld;
      void main(){
        float a = abs(vUv.x);
        float across = 1.0 - smoothstep(0.0, 1.0, a);
        float coreL = 1.0 - smoothstep(0.0, uCore, a);
        float ph = fract((vUv.y - uTime*uSpeed*uDash*0.9)/uDash);
        float dashV = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.35, 0.62, ph));
        float base = 0.22 + 0.78*dashV;
        float k = (across*0.55 + coreL*0.9) * base;
        k *= uAlpha * (1.0 + uHi*0.8);
        float d = length(cameraPosition - vWorld);
        k *= 1.0 - smoothstep(2600.0, 6000.0, d)*0.7;
        vec3 col = uColor * (0.9 + 0.6*coreL);
        gl_FragColor = vec4(col*k, k);
        #include <colorspace_fragment>
      }`,
  });
}

/* -------------------- световые колонны, кольца (аддитивные) -------------------- */
export function makeGlowMaterial(color, { height = 60, alpha = 0.6 } = {}) {
  return shader({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uH: { value: height }, uPulse: { value: 0 }, uSeed: { value: Math.random() * 10 } },
    vertex: /* glsl */`varying vec2 vUv; varying vec3 vWorld; varying vec3 vLocal; void main(){ vUv=uv; vLocal=position; vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragment: GLSL_HEAD + /* glsl */`
      uniform vec3 uColor; uniform float uAlpha; uniform float uH; uniform float uPulse; uniform float uSeed; varying vec2 vUv; varying vec3 vWorld; varying vec3 vLocal;
      void main(){
        float t = clamp(vUv.y, 0.0, 1.0);
        float g = pow(1.0 - t, 1.4);
        float pulse = 0.75 + 0.25*sin(uTime*(2.0+uPulse*5.0) + uSeed);
        float band = smoothstep(0.0,0.04,fract(t*6.0 - uTime*0.35 + uSeed)) * (1.0-smoothstep(0.06,0.2,fract(t*6.0 - uTime*0.35 + uSeed)));
        float k = uAlpha*(g*0.8 + band*0.35*g)*pulse;
        float d = length(cameraPosition - vWorld);
        k *= 1.0 - smoothstep(3500.0, 8000.0, d);
        gl_FragColor = vec4(uColor*k, k);
        #include <colorspace_fragment>
      }`,
  });
}

/* -------------------- голографические «призрачные» объекты (опции, превью) -------------------- */
export function makeHoloMaterial(color, alpha = 0.32) {
  return shader({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uScan: { value: 1 } },
    vertex: /* glsl */`varying vec3 vN; varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragment: GLSL_HEAD + /* glsl */`
      uniform vec3 uColor; uniform float uAlpha; uniform float uScan; varying vec3 vN; varying vec3 vWorld;
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(dot(normalize(vN),V)), 1.6);
        float scan = 0.65 + 0.35*sin(vWorld.y*1.6 - uTime*3.0)*uScan;
        float k = (0.20 + 0.9*fres) * uAlpha * scan;
        gl_FragColor = vec4(uColor*k*1.6, k);
        #include <colorspace_fragment>
      }`,
  });
}

export const col = (hex) => new THREE.Color(hex);
