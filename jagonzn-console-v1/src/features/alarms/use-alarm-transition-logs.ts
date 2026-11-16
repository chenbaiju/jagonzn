import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { can, projectId } from '../../core/session'
import { onIdentityChange } from '../../core/http'
import { useResource } from '../../core/use-resource'
import { alarmTransitionLogApi,type AlarmLogQuery } from './alarm-transition-log-api'
export type AlarmLogFilters=Omit<AlarmLogQuery,'page'|'limit'>
/** 原站历史筛选工作区；列表与详情只读事件，不调用事故确认、人工清除或已读写入口。 */
export function useAlarmTransitionLogs(){
 const page=ref(1),limit=ref(24),filters=shallowRef<AlarmLogFilters>({}),selectedLogId=ref('')
 const list=useResource(signal=>alarmTransitionLogApi.page(projectId.value,{...filters.value,page:page.value,limit:limit.value},signal))
 const detail=useResource(signal=>alarmTransitionLogApi.get(projectId.value,selectedLogId.value,signal))
 const readable=()=>!!projectId.value&&can('alarm:read')
 function closeLog(){selectedLogId.value='';detail.clear()}
 function clear(){page.value=1;limit.value=24;filters.value={};list.clear();closeLog()}
 async function reload(){if(readable())await list.reload()}
 async function refresh(){if(!readable())return;page.value=1;list.clear();closeLog();await reload()}
 async function setFilters(value:AlarmLogFilters){if(!readable())return;filters.value=Object.freeze({...value});page.value=1;list.clear();closeLog();await reload()}
 async function setLimit(value:number){if(!readable()||!Number.isSafeInteger(value)||value<1||value>100)return;limit.value=value;await refresh()}
 async function selectPage(value:number){
  const total=list.data.value?.total
  if(!readable()||list.loading.value||!Number.isSafeInteger(value)||value<1||value>2147483647||total===undefined||BigInt(value)>((BigInt(total)+BigInt(limit.value)-1n)/BigInt(limit.value)||1n)||value===page.value)return
  page.value=value;list.clear();closeLog();await reload()
 }
 async function openLog(logId:string){if(!readable())return;detail.clear();selectedLogId.value=logId;await detail.reload()}
 const dispose=onIdentityChange(clear);onScopeDispose(()=>{clear();dispose()})
 watch([projectId,()=>can('alarm:read')],()=>{clear();void reload()},{immediate:true,flush:'sync'})
 return {page,limit,filters,selectedLogId,list,detail,reload,refresh,setFilters,setLimit,selectPage,openLog,closeLog}
}
