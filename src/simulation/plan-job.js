// All automatic network planning runs off the rendering thread.
export function createPlanJob(input,{createWorker=()=>new Worker(new URL('./plan-worker.js',import.meta.url),{type:'module'}),timeout=60000}={}) {
  let worker,timer,rejectJob,settled=false;
  const finish=(callback,value)=>{
    if(settled)return;
    settled=true;clearTimeout(timer);worker?.terminate();callback(value);
  };
  const promise=new Promise((resolve,reject)=>{
    rejectJob=reject;
    try{
      worker=createWorker();
      worker.onmessage=({data})=>data.error?finish(reject,new Error(data.error)):finish(resolve,data.plan);
      worker.onerror=()=>finish(reject,new Error('Не удалось запустить фоновый подбор плана.'));
      timer=setTimeout(()=>finish(reject,new Error('Расчёт превысил 60 секунд. Повторите попытку.')),timeout);
      worker.postMessage(input);
    }catch(error){finish(reject,error);}
  });
  return {promise,cancel(){const error=new Error('Расчёт отменён.');error.name='AbortError';finish(rejectJob,error);}};
}
