// Computation finishes immediately. Only the visible scene has a minimum lifetime.
export function createCalculationPresentation(element,{minimum=7000,now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let started=null,timer=null,pending=null,completed=false,skipAnimation=false,reveal=null;
 function cancel(){clearTimer(timer);timer=null;started=null;completed=false;reveal=null;element.hidden=true;pending?.();pending=null;}
 function show(){if(completed){started=null;const scene=element.querySelector('.beaver-cinema');scene?.getAnimations?.({subtree:true})?.forEach(animation=>{animation.currentTime=0;});}completed=false;clearTimer(timer);timer=null;pending?.();pending=null;element.classList.remove('calculation-done');if(started==null){started=now();element.hidden=false;}element.querySelector('#cancel-calculation').disabled=false;}
 function finish(onShown,title='Расчёт завершён',detail='Результаты уже готовы. Крутя завершает подключение — затем откроется отчёт.'){if(started==null)return Promise.resolve();completed=true;element.classList.add('calculation-done');element.querySelector('#progress-title').textContent=title;element.querySelector('#progress-detail').textContent=detail;element.querySelector('#cancel-calculation').disabled=true;
 if(pending)return Promise.resolve();return new Promise(resolve=>{pending=resolve;reveal=()=>{element.hidden=true;started=null;timer=null;pending=null;reveal=null;onShown?.();resolve();};timer=setTimer(reveal,skipAnimation?0:Math.max(0,minimum-(now()-started)));});}
 function skip(){skipAnimation=true;if(completed&&reveal){clearTimer(timer);reveal();}}
 return {show,finish,cancel,skip};
}
