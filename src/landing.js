import { motion, animate } from './experience.js';
const $ = s => document.querySelector(s);
const hero = $('.hero-track'), photo = $('.hero-photo'), title = $('.hero-title'), image = $('.hero-photo img');
const story = $('.system-track'), stage = $('.network-stage'), chapters = [...document.querySelectorAll('[data-chapter]')], tabs = [...document.querySelectorAll('[data-story]')];
const labels = ['СПРОС','МОЩНОСТЬ','ПЛАН'];
const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
let frame = 0, current = -1;
let metrics = {heroTop:0, heroTravel:1, heroHeight:0, storyTop:0, storyTravel:1, storyHeight:0};
function measure() {
  const h=hero.getBoundingClientRect(), s=story.getBoundingClientRect();
  metrics={heroTop:h.top+scrollY,heroTravel:Math.max(1,h.height-innerHeight),heroHeight:h.height,storyTop:s.top+scrollY,storyTravel:Math.max(1,s.height-innerHeight),storyHeight:s.height};
  schedule();
}
function chapter(n) {
  if (n === current) return;
  current=n; stage.dataset.stage=String(n);
  chapters.forEach((el,i) => { el.classList.toggle('active',i===n); el.setAttribute('aria-hidden',String(motion.enabled && i!==n)); });
  tabs.forEach((el,i) => { el.classList.toggle('active',i===n); if(i===n)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current'); });
  $('.story-count').textContent=`0${n+1} / 03`; $('.reading-value').textContent=labels[n];
}
function render() {
  frame=0;
  if (!motion.enabled || document.hidden) return;
  const y=scrollY, p=clamp((y-metrics.heroTop)/metrics.heroTravel), s=clamp((y-metrics.storyTop)/metrics.storyTravel);
  if(y<metrics.heroTop+metrics.heroHeight) {
    photo.style.transform=`translate3d(0,${-p*42}px,0) scale(${1+p*.1})`;
    photo.style.borderRadius=(18*(1-p))+'px'; image.style.transform=`scale(${1.08+p*.1})`;
    title.style.transform=`translate3d(0,${-p*innerHeight*.18}px,0)`; title.style.opacity=String(1-p*.88);
    $('.hero-bottom').style.opacity=String(1-p);
  }
  const inView=y>metrics.storyTop-innerHeight && y<metrics.storyTop+metrics.storyHeight;
  story.classList.toggle('in-view',inView);
  if(inView) {
    chapter(Math.min(2,Math.floor(s*3)));
    story.style.setProperty('--story-progress',String(s));
    stage.style.setProperty('--reading-y',`${(s-.5)*-35}px`);
    // Continuous tilt flattens the model as the scroll reaches the plan.
    $('.map-turn').style.transform=`rotateX(${36*(1-s)}deg) rotateZ(${-20*(1-s)}deg) scale(${1-s*.08})`;
  }
}
function schedule(){if(!frame)frame=requestAnimationFrame(render)}
window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',measure,{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
document.fonts?.ready.then(measure);
document.addEventListener('ev-motion-change',()=>{
  current=-1; chapter(0);
  if(!motion.enabled){for(const el of [photo,title,image,$('.hero-bottom'),$('.map-turn')]){el.style.transform='';el.style.opacity='';}photo.style.borderRadius='';}
  measure();
});
tabs.forEach((button,n)=>button.addEventListener('click',()=>{
  if(motion.enabled)window.scrollTo({top:metrics.storyTop+metrics.storyTravel*(n+.16)/3,behavior:'smooth'});
  else chapter(n);
}));
const menu=$('#site-menu'), toggle=$('.menu-toggle');
toggle.addEventListener('click',()=>{
  menu.showModal();toggle.setAttribute('aria-expanded','true');
  animate(menu,[{clipPath:'inset(0 0 100%)'},{clipPath:'inset(0)'}],{duration:600,easing:'cubic-bezier(.22,1,.36,1)'});
});
$('.menu-close').addEventListener('click',()=>menu.close());
menu.addEventListener('close',()=>{toggle.setAttribute('aria-expanded','false');toggle.focus({preventScroll:true})});
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.close()));
if(motion.enabled){
  animate(photo,[{clipPath:'inset(15% 10% 15%)',transform:'scale(1.12)'},{clipPath:'inset(0)',transform:'scale(1)'}],{duration:1450,easing:'cubic-bezier(.22,1,.36,1)'});
  [...document.querySelectorAll('.hero-grid>span')].forEach((el,i)=>animate(el,[{transform:'translateY(120%) rotate(7deg)',opacity:0},{transform:'translateY(0) rotate(0)',opacity:1}],{duration:1000,delay:180+i*90,easing:'cubic-bezier(.22,1,.36,1)'}));
  for(const [i,el] of [$('.site-header'),$('.hero-overline'),$('.hero-small'),$('.hero-bottom')].entries())animate(el,[{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:700,delay:100+i*140,easing:'cubic-bezier(.22,1,.36,1)'});
}
chapter(0);measure();
