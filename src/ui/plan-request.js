import {state,setState} from '../state.js';
import {auditInput} from './audit.js';
export async function requestPlan(toast) {
  if(state.planBusy)return;
  const input=auditInput(), fingerprint=JSON.stringify(input);
  setState({planBusy:true,planMessage:'Расчёт выполняется в фоновом потоке. Интерфейс остаётся доступен.'});
  let worker,timer;
  try {
    const result=await new Promise((resolve,reject)=>{
      worker=new Worker(new URL('../simulation/plan-worker.js',import.meta.url),{type:'module'});
      timer=setTimeout(()=>reject(new Error('Расчёт превысил 60 секунд. Повторите попытку.')),60000);
      worker.onmessage=e=>e.data.error?reject(new Error(e.data.error)):resolve(e.data.plan);
      worker.onerror=()=>reject(new Error('Не удалось запустить расчёт. Откройте сайт через сервер, не как локальный файл.'));
      worker.postMessage(input);
    });
    if(JSON.stringify(auditInput())!==fingerprint)throw new Error('Входные данные изменились во время расчёта. Запустите подбор ещё раз.');
    const message=result.length?`Расчёт завершён. В план добавлено шагов: ${result.length}. Проверьте сроки и экономику ниже.`:'Расчёт завершён: выгодные инвестиционные шаги по критериям алгоритма не найдены. Рекомендация — пока не строить; это результат расчёта, а не ошибка кнопки.';
    setState({decisions:result,planMessage:message});toast(message,6500);
  } catch(e) {setState({planMessage:e.message});toast(e.message,6500);}
  finally {clearTimeout(timer);worker?.terminate();setState({planBusy:false});}
}
