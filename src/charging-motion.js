import {motion} from './experience.js';
const root=document.querySelector('.hero-track'),stage=document.querySelector('.motion-stage'),car=document.querySelector('.tesla-layer'),station=document.querySelector('.station-layer'),wire=document.querySelector('.charging-wire'),signal=document.querySelector('.charging-wire-signal'),plug=document.querySelector('.charge-plug'),port=document.querySelector('.charge-port'),plane=document.querySelector('.energy-plane'),phase=document.querySelector('#charge-phase'),bar=document.querySelector('#charge-fill');const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));let raf=0,top=0,travel=1,startDistance=1600,lastProgress=-1,sceneVisible=true;const length=wire.getTotalLength();wire.style.strokeDasharray=length;signal.style.strokeDasharray=length;const wireReveal=document.querySelector('.wire-reveal');wireReveal.style.strokeDasharray=length;
const wheels=[...document.querySelectorAll('.wheel-rotor')];
// Sample immutable cable geometry once, rather than querying SVG paths every frame.
function samplePath(path,span){
  const count=Math.ceil(span/3),points=Array.from({length:count+1},(_,i)=>path.getPointAtLength(span*i/count));
  return distance=>{const position=clamp(distance/span)*count,index=Math.min(count-1,Math.floor(position)),t=position-index,a=points[index],b=points[index+1];return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};};
}
const wirePoint=samplePath(wire,length);
const svgNS='http://www.w3.org/2000/svg',flowRoutes=[];let flowFrame=0,flowLast=0,flowTime=0;
for(const [index,path] of [...document.querySelectorAll('.power-conduit .conduit-core'),wire].entries()){
  const span=path.getTotalLength(),parent=path===wire?document.querySelector('.charging-lead'):path.parentElement,packets=[];
  const defs=document.createElementNS(svgNS,'defs'),mask=document.createElementNS(svgNS,'mask'),bounds=document.createElementNS(svgNS,'path'),flow=document.createElementNS(svgNS,'g'),maskId=`current-envelope-${index}`;
  mask.setAttribute('id',maskId);mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('x','0');mask.setAttribute('y','0');mask.setAttribute('width','1200');mask.setAttribute('height','600');
  bounds.setAttribute('d',path.getAttribute('d'));bounds.setAttribute('fill','none');bounds.setAttribute('stroke','white');bounds.setAttribute('stroke-width',path===wire?'6':'5');bounds.setAttribute('stroke-linecap','round');mask.append(bounds);defs.append(mask);flow.classList.add('current-flow');flow.setAttribute('mask',`url(#${maskId})`);parent.append(defs,flow);
  for(let i=0;i<2;i++){const g=document.createElementNS(svgNS,'g');g.classList.add('current-emitter');g.setAttribute('pointer-events','none');g.innerHTML='<ellipse cx="-15" cy="0" rx="22" ry="2.5" fill="#68cbff" opacity=".55"/><ellipse cx="-11" cy="0" rx="17" ry="1.4" fill="#b9f4ff"/><circle r="3.1" fill="#ecfcff"/>';flow.append(g);packets.push(g);}
  flowRoutes.push({point:path===wire?wirePoint:samplePath(path,span),span,packets,reverse:path===wire,speed:path===wire?105:240});
}
function flowActive(){return sceneVisible&&motion.enabled&&!document.hidden&&root.classList.contains('charging-active');}
function drawFlow(now){
  flowFrame=0;if(!flowActive()){flowLast=0;return;}
  if(!flowLast||now-flowLast>=1000/30){const dt=flowLast?Math.min(.1,(now-flowLast)/1000):0;flowLast=now;flowTime+=dt;
    for(const route of flowRoutes)for(let i=0;i<route.packets.length;i++){let distance=(flowTime*route.speed+i*route.span/2)%route.span;if(route.reverse)distance=route.span-distance;const p=route.point(distance);route.packets[i].setAttribute('transform',`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${(p.angle+(route.reverse?180:0)).toFixed(1)})`);}
  }
  flowFrame=requestAnimationFrame(drawFlow);
}
function startFlow(){if(!flowFrame&&flowActive()){flowLast=0;flowFrame=requestAnimationFrame(drawFlow);}}
function stopFlow(){cancelAnimationFrame(flowFrame);flowFrame=0;flowLast=0;}
let lastArrival=-1,lastConnect=-1,lastCharge=-1;
function render(){
  raf=0;
  const visible=!document.hidden&&scrollY<top+travel+innerHeight&&scrollY>top-innerHeight;
  root.classList.toggle('charging-active',visible&&sceneVisible&&motion.enabled&&(scrollY-top)/travel>.63);
  if(!visible&&motion.enabled){stopFlow();return;}
  const p=motion.enabled?clamp((scrollY-top)/travel):1;
  if(p===lastProgress){startFlow();return;}
  lastProgress=p;
  const arrive=clamp(p/.34),connect=clamp((p-.36)/.27),charge=clamp((p-.63)/.34);
  if(arrive!==lastArrival){
    lastArrival=arrive;root.classList.toggle('tesla-arrived',arrive===1);
    const remaining=startDistance*(1-arrive*arrive*(3-2*arrive));
    car.style.transform=`translateX(${remaining}px)`;
    for(const wheel of wheels)wheel.setAttribute('transform',`rotate(${remaining/58*180/Math.PI} ${wheel.dataset.wheelX} ${wheel.dataset.wheelY})`);
  }
  if(connect!==lastConnect){
    lastConnect=connect;
    wire.style.strokeDashoffset=wireReveal.style.strokeDashoffset=signal.style.strokeDashoffset=length*(1-connect);
    const point=wirePoint(length*connect);
    plug.setAttribute('transform',`translate(${point.x},${point.y}) rotate(${connect*18})`);
    plug.style.opacity=String(connect>0?1:0);port.style.opacity=String(connect>.95?1:0);
  }
  if(charge!==lastCharge){
    lastCharge=charge;signal.style.opacity=String(charge);
    plane.style.opacity=String(.45+charge*.55);plane.style.transform=`translateY(${(1-charge)*28}px)`;
    bar.style.width=(8+charge*82)+'%';root.style.setProperty('--charge',charge);
  }
  const label=arrive<1?'Tesla подъезжает':connect<.95?'Подключение кабеля':'Энергия в движении';
  if(phase.textContent!==label)phase.textContent=label;
  startFlow();if(hovered)scheduleSection();
}
function schedule(){if(!raf)raf=requestAnimationFrame(render)}function measure(){lastProgress=lastArrival=lastConnect=lastCharge=-1;const r=root.getBoundingClientRect();top=r.top+scrollY;travel=Math.max(1,r.height-innerHeight);const matrix=stage.querySelector('svg').getScreenCTM();if(matrix?.a)startDistance=Math.max(1600,(innerWidth+70-matrix.e)/Math.abs(matrix.a)-58);schedule();}window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',measure,{passive:true});document.addEventListener('ev-motion-change',()=>{lastProgress=-1;stopFlow();schedule();});document.addEventListener('visibilitychange',()=>{if(document.hidden){root.classList.remove('charging-active');stopFlow();}else schedule();});document.fonts.ready.then(measure);measure();
new IntersectionObserver(entries=>{sceneVisible=entries[0].isIntersecting;if(!sceneVisible){root.classList.remove('charging-active');stopFlow();}schedule();}).observe(document.querySelector('.hero-sticky'));
// N2: a feathered circular lens tracks both axes in the moving SVG car.
const hit=document.querySelector('[data-tesla-hit]');
const lensParts=document.querySelectorAll('.section-cut,.section-window,.lens-mechanics,.lens-ring');
let hovered=false,keyboard=false,keyboardModality=true,pointer=null,lensX=430,lensY=225,sectionFrame=0;
let lensMatrix=null,recheckHit=false,cutawayState='idle';
const cutaway=document.querySelector('.tesla-cutaway-image');
function loadCutaway(){
  if(cutawayState!=='idle')return;
  cutawayState='loading';hit.setAttribute('aria-busy','true');
  cutaway.addEventListener('load',()=>{cutawayState='ready';hit.removeAttribute('aria-busy');scheduleSection();},{once:true});
  cutaway.addEventListener('error',()=>{cutawayState='failed';hit.removeAttribute('aria-busy');scheduleSection();},{once:true});
  cutaway.setAttribute('href',new URL('../assets/tesla-cutaway-reference.webp',import.meta.url).href);
}
function paintSection(){
  sectionFrame=0;
  if(recheckHit&&hovered&&pointer)hovered=Boolean(document.elementFromPoint(pointer.x,pointer.y)?.closest('[data-tesla-hit]'));
  recheckHit=false;
  const requested=hovered||keyboard;if(requested)loadCutaway();
  const active=requested&&cutawayState==='ready';
  if(hovered&&pointer){
    if(document.querySelector('.hero-photo').getAnimations().length)lensMatrix=null;
    lensMatrix??=car.getScreenCTM()?.inverse();
    if(lensMatrix){const p=new DOMPoint(pointer.x,pointer.y).matrixTransform(lensMatrix);lensX=p.x;lensY=p.y;}
  }
  car.classList.toggle('scanning',active);hit.setAttribute('aria-pressed',String(requested));
  if(active)for(const circle of lensParts){circle.setAttribute('cx',lensX);circle.setAttribute('cy',lensY);}
}
function scheduleSection(){if(!sectionFrame)sectionFrame=requestAnimationFrame(paintSection);}
const finePointer=matchMedia('(pointer:fine)');
document.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||!finePointer.matches)return;const onCar=Boolean(e.target.closest('[data-tesla-hit]'));if(!onCar&&!hovered&&!keyboard)return;keyboard=false;keyboardModality=false;hovered=onCar;pointer=hovered?{x:e.clientX,y:e.clientY}:null;scheduleSection();},{passive:true});
function dismissInspection(){if(sectionFrame)cancelAnimationFrame(sectionFrame);sectionFrame=0;hovered=false;keyboard=false;pointer=null;paintSection();}
hit.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch')dismissInspection();});
document.documentElement.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch')dismissInspection();});
window.addEventListener('blur',dismissInspection);
document.addEventListener('pointerdown',e=>{keyboardModality=false;if(e.pointerType!=='touch')keyboard=false;if(!e.target.closest('[data-tesla-hit]'))dismissInspection();else scheduleSection();},{passive:true});document.addEventListener('keydown',e=>{if(e.key==='Tab')keyboardModality=true;});
hit.addEventListener('focus',()=>{if(keyboardModality)keyboard=true;scheduleSection();});hit.addEventListener('blur',()=>{keyboard=false;scheduleSection();});
hit.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','Escape'].includes(e.key)){e.preventDefault();if(e.key==='Escape'){keyboard=false;hovered=false;pointer=null;}else if(e.key==='Enter'||e.key===' '){keyboard=!keyboard;hovered=false;}else {keyboard=true;lensX=clamp(lensX+(e.key==='ArrowLeft'?-35:e.key==='ArrowRight'?35:0),58,798);lensY=clamp(lensY+(e.key==='ArrowUp'?-25:e.key==='ArrowDown'?25:0),90,358);}scheduleSection();}});
hit.addEventListener('pointerup',e=>{if(e.pointerType==='touch'){keyboard=!keyboard;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(car.getScreenCTM().inverse());lensX=p.x;lensY=p.y;scheduleSection();}});
window.addEventListener('scroll',()=>{lensMatrix=null;recheckHit=true;if(hovered||keyboard)scheduleSection();},{passive:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)dismissInspection();});window.addEventListener('resize',()=>{lensMatrix=null;recheckHit=true;if(hovered||keyboard)scheduleSection();},{passive:true});paintSection();
