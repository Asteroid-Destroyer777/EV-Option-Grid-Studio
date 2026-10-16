// Bound GPU work on Retina/large displays; adapt only after sustained slow frames.
export function renderRatio({width,height,dpr=1,mobile=false}) {
  return Math.min(dpr,mobile?1.35:1.5,Math.max(.85,Math.sqrt(2500000/Math.max(1,width*height))));
}
export function createRenderBudget(maxRatio) {
  let ratio=maxRatio,total=0,frames=0,lastChange=0,fastSince=null;
  return {
    reset(next){maxRatio=next;ratio=Math.min(ratio,maxRatio);total=frames=0;fastSince=null;return ratio;},
    sample(ms,now){
      if(!Number.isFinite(ms)||ms<=0||ms>200)return null;
      total+=ms;frames++;
      if(frames<90)return null;
      const average=total/frames;total=frames=0;
      if(now-lastChange<4000)return null;
      const floor=Math.min(maxRatio,.85);
      if(average>23&&ratio>floor+.04){ratio=Math.max(floor,ratio-.15);lastChange=now;fastSince=null;return ratio;}
      if(average<17.8&&ratio<maxRatio-.04){
        fastSince??=now;
        if(now-fastSince>10000){ratio=Math.min(maxRatio,ratio+.1);lastChange=now;fastSince=null;return ratio;}
      }else fastSince=null;
      return null;
    },
    get ratio(){return ratio;}
  };
}
