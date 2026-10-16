import {createPlanJob} from '../simulation/plan-job.js';
import {state,setState} from '../state.js';
import {auditInput} from './audit.js';
export async function requestPlan(toast) {
  if(state.planBusy)return;
  const input=auditInput(), fingerprint=JSON.stringify(input);
  setState({planBusy:true,planMessage:'Расчёт выполняется в фоновом потоке. Интерфейс остаётся доступен.'});
  let job;
  try {
    job=createPlanJob(input);
    const result=await job.promise;
    if(JSON.stringify(auditInput())!==fingerprint)throw new Error('Входные данные изменились во время расчёта. Запустите подбор ещё раз.');
    const message=result.length?`Расчёт завершён. В план добавлено шагов: ${result.length}. Проверьте сроки и экономику ниже.`:'Расчёт завершён: выгодные инвестиционные шаги по критериям алгоритма не найдены. Рекомендация — пока не строить; это результат расчёта, а не ошибка кнопки.';
    setState({decisions:result,planMessage:message});toast(message,6500);
  } catch(e) {setState({planMessage:e.message});toast(e.message,6500);}
  finally {job?.cancel();setState({planBusy:false});}
}
