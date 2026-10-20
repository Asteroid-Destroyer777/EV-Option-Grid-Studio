import * as T from '../../vendor/three/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {addSkyline} from './skyline.js';
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};

const section=document.querySelector('#system'),stage=section?.querySelector('.network-stage');
if(section&&stage)init();
function init(){
 stage.classList.add('planet-stage');
 const mount=document.createElement('div');mount.className='planet-mount';mount.innerHTML='<div class="planet-loading" role="status"><i></i><span>Планета загружается</span></div><div class="planet-labels" aria-hidden="true"></div>';
 stage.querySelector('.map-turn').replaceChildren(mount);
 stage.querySelector('.map-coordinate').textContent='EV—OPTION GRID / СИСТЕМА СВЯЗЕЙ';
 stage.querySelector('.map-coordinate.bottom').textContent='Одна планета. Единая зарядная сеть.';
 section.querySelectorAll('.story-chapter h2 br').forEach(br=>br.after(document.createTextNode(' ')));
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),pause=section.querySelector('.planet-pause');
 let loading,world,visible=false,frame=0,top=0,travel=1,last=0,time=0,progress=0,paused=false,focused=false;
 const staticMotion=()=>reduced.matches||document.documentElement.classList.contains('motion-off');
 const moving=()=>!staticMotion()&&!paused&&!focused;
 function schedule(){if(!frame&&!document.hidden&&visible)frame=requestAnimationFrame(render);}
 function measure(){const r=section.getBoundingClientRect();top=r.top+scrollY;travel=Math.max(1,r.height-innerHeight);last=0;world?.resize();schedule();}
 function render(now){
  frame=0;if(!visible||document.hidden){last=0;return;}
  const target=staticMotion()?.48:clamp((scrollY-top)/travel),settling=Math.abs(target-progress)>.0001;
  const dt=last?Math.min(.06,(now-last)/1000):1/60;last=now;
  progress=staticMotion()?target:T.MathUtils.damp(progress,target,12,dt);
  if(moving())time+=dt;
  if(world){world.render(progress,time,staticMotion());stage.dataset.planetProgress=progress.toFixed(3);stage.dataset.planetRotation=(progress*360+time*.025*180/Math.PI).toFixed(2);}
  if(world&&(moving()||settling))schedule();else last=0;
 }
 function load(){
  if(loading||world)return;
  pause.disabled=true;progress=staticMotion()?.48:clamp((scrollY-top)/travel);stage.dataset.planetState='loading';
  mount.classList.remove('planet-error');
  loading=createPlanet(mount).then(w=>{world=w;focused=false;stage.dataset.planetState='ready';pause.disabled=false;pause.textContent='Пауза';pause.setAttribute('aria-label','Приостановить фоновое движение планеты');measure();}).catch(e=>{
   stage.dataset.planetState='unavailable';mount.classList.add('planet-error');
   mount.querySelector('.planet-loading span').textContent='Не удалось открыть 3D. Можно повторить загрузку.';
   pause.disabled=false;pause.textContent='Повторить';pause.setAttribute('aria-label','Повторить загрузку планеты');
   console.warn('Planet renderer:',e);
  }).finally(()=>{loading=null;});
 }
 const preload=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){load();preload.disconnect();}},{rootMargin:'350px 0px'});preload.observe(section);
 const observer=new IntersectionObserver(([entry])=>{
  visible=entry.isIntersecting;if(visible)schedule();else{cancelAnimationFrame(frame);frame=0;last=0;}
 });observer.observe(stage);
 pause.addEventListener('click',()=>{
  if(!world){load();return;}
  paused=!paused;if(!paused)focused=false;pause.textContent=paused?'Продолжить':'Пауза';pause.setAttribute('aria-pressed',String(paused));
  pause.setAttribute('aria-label',paused?'Продолжить фоновое движение планеты':'Приостановить фоновое движение планеты');schedule();
 });
 pause.addEventListener('focus',()=>{focused=true;schedule();});pause.addEventListener('blur',()=>{focused=false;schedule();});
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',measure,{passive:true});reduced.addEventListener('change',measure);document.addEventListener('ev-motion-change',measure);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;}else schedule();});document.fonts.ready.then(measure);measure();
}
function radialTexture(){
 const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);
 g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.12,'rgba(255,255,255,.9)');g.addColorStop(.35,'rgba(255,255,255,.28)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new T.CanvasTexture(c);
}
function makeSpace(scene){
 let seed=7297;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;},positions=[],colors=[],sizes=[];
 for(let i=0;i<900;i++){positions.push((rand()-.5)*8,(rand()-.5)*8,-1.8-rand()*2);const b=.28+rand()*.65;colors.push(b*(.68+rand()*.3),b*(.78+rand()*.2),b);sizes.push(rand()<.04?3.6:1+rand()*1.2);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setAttribute('aSize',new T.Float32BufferAttribute(sizes,1));
 scene.add(new T.Points(geo,new T.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,blending:T.AdditiveBlending,vertexShader:'attribute float aSize; varying vec3 vColor; void main(){vColor=color;gl_PointSize=aSize;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vColor;void main(){float d=length(gl_PointCoord-.5)*2.;float a=pow(max(0.,1.-d),3.);gl_FragColor=vec4(vColor,a*.8);}'})));
 const nebula=new T.Mesh(new T.PlaneGeometry(10,10),new T.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 vUv;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){vec2 p=(vUv-.5)*3.;float n=noise(p*4.)*.5+noise(p*9.)*.25+noise(p*21.)*.125;float band=exp(-pow((p.y-p.x*.64-.15)*2.9,2.));vec3 col=mix(vec3(.025,.035,.10),vec3(.10,.15,.29),n);gl_FragColor=vec4(col,band*n*.65);}`}));nebula.position.z=-4.5;scene.add(nebula);
}
function makeFlow(root,routes){
 const parts=[],heads=[],headTexture=radialTexture();
 routes.forEach((route,index)=>{
  const curve=new T.CatmullRomCurve3(route.points.map(p=>{const v=new T.Vector3(...p);return v.addScaledVector(v.clone().normalize(),.023);}),false,'centripetal'),g=new T.TubeGeometry(curve,Math.max(48,Math.min(120,route.points.length*2)),.0065,6,false),delay=new Float32Array(g.attributes.position.count);delay.fill((index%6)*.028);g.setAttribute('aDelay',new T.BufferAttribute(delay,1));parts.push(g);
  const head=new T.Sprite(new T.SpriteMaterial({map:headTexture,color:'#b0f2ff',transparent:true,opacity:.95,blending:T.AdditiveBlending,depthWrite:false}));head.scale.set(.10,.10,1);root.add(head);heads.push({head,curve,delay:(index%6)*.028});
 });
 const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());const uniforms={uProgress:{value:0},uTime:{value:0}};
 const vertexShader='attribute float aDelay;varying vec2 vUv;varying float vDelay;uniform float uRadius;void main(){vUv=uv;vDelay=aDelay;vec3 p=position+normal*(uRadius-1.)*.0065;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}';
 const fragmentShader=`varying vec2 vUv;varying float vDelay;uniform float uProgress;uniform float uTime;uniform float uHalo;
 void main(){float progress=clamp((uProgress-.10-vDelay)/.32,0.,1.);float connected=1.-smoothstep(progress-.025,progress+.025,vUv.x);float head=fract(uProgress*3.6+uTime*.13-vDelay*1.7);float behind=mod(head-vUv.x+1.,1.);float pulse=exp(-behind*24.)*connected;float charge=exp(-pow((vUv.x-progress)*36.,2.))*step(.01,progress)*step(progress,.99);float intensity=connected*(.44+.08*sin(vUv.x*100.-uTime*1.5))+pulse*2.1+charge*2.8;vec3 color=mix(vec3(.04,.40,1.),vec3(.56,.96,1.),min(1.,pulse+charge));color=mix(color,vec3(1.),min(.8,(pulse+charge)*.5));gl_FragColor=vec4(color,intensity*(uHalo>.5?.24:1.));}`;
 for(const [radius,halo]of [[1,0],[2.7,1],[5,1]])root.add(new T.Mesh(geometry,new T.ShaderMaterial({uniforms:{...uniforms,uRadius:{value:radius},uHalo:{value:halo}},vertexShader,fragmentShader,transparent:true,depthWrite:false,blending:T.AdditiveBlending})));
 return {update(p,time){uniforms.uProgress.value=p;uniforms.uTime.value=time;for(const s of heads){const reveal=clamp((p-.10-s.delay)/.32),front=reveal<.99?reveal:(p*3.6+time*.13-s.delay*1.7)%1;s.head.visible=reveal>.01;s.curve.getPoint(front,s.head.position);}}};
}
async function createPlanet(mount){
 const canvas=document.createElement('canvas');canvas.className='planet-canvas';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Цельная объёмная планета в космосе. Города, дороги, леса и зарядные станции со всех сторон. Прокрутка вращает шар и проводит энергию по сети.');
 const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:innerWidth>700,powerPreference:'default'});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.setClearColor(0x070a15,0);renderer.shadowMap.enabled=innerWidth>700;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-1.4,1.4,1.4,-1.4,.1,30);camera.position.set(0,0,5);camera.lookAt(0,0,0);makeSpace(scene);
 const root=new T.Group();scene.add(root);
 let asset,layout;
 try{[asset,layout]=await Promise.all([new GLTFLoader().loadAsync(new URL('./assets/planet/spherical-planet.glb.br',document.baseURI).href),fetch(new URL('./assets/planet/layout.json',document.baseURI)).then(r=>{if(!r.ok)throw Error('Planet layout unavailable');return r.json();})]);}catch(error){renderer.dispose();throw error;}
 asset.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});root.add(asset.scene);
 stage.dataset.skyscrapers=String(addSkyline(root,layout));
 scene.add(new T.HemisphereLight('#b7d4ff','#22202a',1.15));
 const key=new T.DirectionalLight('#ffedce',3.0);key.position.set(-2.5,3.5,4.5);key.castShadow=true;key.shadow.mapSize.setScalar(1024);Object.assign(key.shadow.camera,{left:-1.4,right:1.4,top:1.4,bottom:-1.4,near:.5,far:12});key.shadow.bias=-.00012;key.shadow.normalBias=.0015;scene.add(key);const fill=new T.DirectionalLight('#6b9eff',1.4);fill.position.set(3.5,-.4,1);scene.add(fill);const rim=new T.DirectionalLight('#80cfff',3.1);rim.position.set(1.8,2.5,-3);scene.add(rim);
 const atmosphere=new T.Mesh(new T.SphereGeometry(1.065,96,64),new T.ShaderMaterial({side:T.BackSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending,vertexShader:'varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 n;varying vec3 v;void main(){float f=pow(1.-abs(dot(normalize(n),normalize(v))),4.);gl_FragColor=vec4(.20,.48,1.,f*.34);}'}));root.add(atmosphere);
 const flow=makeFlow(root,layout.routes),glow=radialTexture(),stations=[],labelRoot=mount.querySelector('.planet-labels');
 for(const [index,s]of layout.stations.entries()){
  const position=new T.Vector3(...s.position),normal=position.clone().normalize(),group=new T.Group();group.position.copy(position);group.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);root.add(group);
  const halo=new T.Mesh(new T.PlaneGeometry(.18,.18),new T.MeshBasicMaterial({map:glow,color:'#63cfff',transparent:true,opacity:.14,blending:T.AdditiveBlending,depthWrite:false}));group.add(halo);
  const ring=new T.Mesh(new T.RingGeometry(.027,.029,40),new T.MeshBasicMaterial({color:'#b5e7ff',transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));ring.position.z=.002;group.add(ring);
  const label=document.createElement('span');label.className='planet-object-label';label.textContent=s.name;labelRoot.append(label);stations.push({position,normal,halo,ring,label,index});
 }
 const traffic=[],sphere=new T.SphereGeometry(.0025,5,4),carMat=new T.MeshBasicMaterial({color:'#ffdda3'});
 for(const [j,route]of (layout.roadRoutes||layout.routes).entries()){
  if(j>20)break;const curve=new T.CatmullRomCurve3(route.points.map(p=>new T.Vector3(...p)),false,'centripetal');
  for(let k=0;k<7;k++)traffic.push({curve,offset:k/7+j*.31});
 }
 const cars=new T.InstancedMesh(sphere,carMat,traffic.length),carMatrix=new T.Matrix4(),carPosition=new T.Vector3();cars.instanceMatrix.setUsage(T.DynamicDrawUsage);cars.frustumCulled=false;root.add(cars);
 const projected=new T.Vector3(),normalWorld=new T.Vector3();let width=1,height=1,lastShadow=-10;
 function resize(){
  const r=mount.getBoundingClientRect();width=Math.max(2,r.width);height=Math.max(2,r.height);const aspect=width/height,pad=1.34;
  camera.left=-pad*Math.max(1,aspect);camera.right=pad*Math.max(1,aspect);camera.top=pad*Math.max(1,1/aspect);camera.bottom=-pad*Math.max(1,1/aspect);camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5,Math.sqrt(1250000/(width*height))));renderer.setSize(width,height,false);
 }
 const ro=new ResizeObserver(resize);ro.observe(mount);resize();if(renderer.compileAsync)await renderer.compileAsync(scene,camera);mount.append(canvas);mount.classList.add('planet-ready');mount.querySelector('.planet-loading').remove();
 canvas.addEventListener('webglcontextrestored',()=>{lastShadow=-10;dispatchEvent(new Event('resize'));});
 return {resize,render(p,time,staticMotion){
  const rotation=staticMotion?.3:p*Math.PI*2+.3+time*.025;
  root.rotation.set(.16+Math.sin(p*Math.PI*2)*.11,rotation,-.10+Math.sin(p*Math.PI*2)*.07);if(Math.abs(lastShadow-rotation)>.055){renderer.shadowMap.needsUpdate=true;lastShadow=rotation;}flow.update(staticMotion?.85:Math.max(.24,p),time);const decision=smooth(.64,.84,p);
  stations.forEach(s=>{const arrived=smooth(.16+(s.index%6)*.055,.42+(s.index%6)*.055,p);s.halo.material.opacity=.12+arrived*.48;s.halo.scale.setScalar(1+decision*.15+arrived*.04*Math.sin(time*1.4+s.index));s.ring.material.opacity=decision*.8;normalWorld.copy(s.normal).applyQuaternion(root.quaternion);projected.copy(s.position).multiplyScalar(1.07).applyQuaternion(root.quaternion).project(camera);s.label.style.left=(projected.x*.5+.5)*width+'px';s.label.style.top=(-projected.y*.5+.5)*height+'px';s.label.style.opacity=String(normalWorld.z>.58?decision*.95:0);});
  traffic.forEach((car,i)=>{car.curve.getPoint((time*.025+car.offset+p*.18)%1,carPosition);carMatrix.makeTranslation(carPosition.x,carPosition.y,carPosition.z);cars.setMatrixAt(i,carMatrix);});cars.instanceMatrix.needsUpdate=true;renderer.render(scene,camera);
 }};
}
