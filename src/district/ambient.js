import {motion} from '../experience.js';
const background=document.querySelector('.district-ambient');
let frame=0,point={x:0,y:0};
function paint(){frame=0;if(!motion.enabled)return;background.style.setProperty('--ambient-x',point.x+'px');background.style.setProperty('--ambient-y',point.y+'px');}
window.addEventListener('pointermove',e=>{if(!motion.enabled||!matchMedia('(pointer:fine)').matches||document.hidden)return;point={x:(e.clientX/innerWidth-.5)*24,y:(e.clientY/innerHeight-.5)*18};if(!frame)frame=requestAnimationFrame(paint);},{passive:true});
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('ambient-paused',document.hidden));
document.addEventListener('ev-motion-change',()=>{if(!motion.enabled){background.style.setProperty('--ambient-x','0px');background.style.setProperty('--ambient-y','0px');}});
