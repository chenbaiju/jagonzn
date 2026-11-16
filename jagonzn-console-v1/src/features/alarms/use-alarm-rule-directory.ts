import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,projectId} from '../../core/session'
import {onIdentityChange} from '../../core/http'
import {useResource} from '../../core/use-resource'
import {alarmRuleDirectoryApi,alarmRuleTableRow,type AlarmRuleDirectoryQuery} from './alarm-rule-directory-api'
/** 当前V2目录的只读工作区；不补入旧规则、模拟名称或写接口。 */
export function useAlarmRuleDirectory(){
 const page=ref(1),limit=ref(24),sourceKind=ref<AlarmRuleDirectoryQuery['sourceKind']>()
 const list=useResource(signal=>alarmRuleDirectoryApi.page(projectId.value,{page:String(page.value),limit:String(limit.value),sourceKind:sourceKind.value},signal))
 const rows=computed(()=>list.data.value?.items.map(alarmRuleTableRow)??[])
 const readable=()=>!!projectId.value&&can('alarm:read')
 function clear(){page.value=1;limit.value=24;sourceKind.value=undefined;list.clear()}
 async function reload(){if(readable())await list.reload()}
 async function refresh(){if(!readable())return;page.value=1;list.clear();await reload()}
 async function setSourceKind(value:AlarmRuleDirectoryQuery['sourceKind']){if(!readable()||value!==undefined&&!['DEVICE','DEVICE_TYPE'].includes(value))return;sourceKind.value=value;await refresh()}
 async function setLimit(value:number){if(!readable()||!Number.isSafeInteger(value)||value<1||value>100)return;limit.value=value;await refresh()}
 async function selectPage(value:number){const total=list.data.value?.total;if(!readable()||list.loading.value||!Number.isSafeInteger(value)||value<1||value>2147483647||value===page.value||total===undefined||BigInt(value)>((BigInt(total)+BigInt(limit.value)-1n)/BigInt(limit.value)||1n))return;page.value=value;list.clear();await reload()}
 const dispose=onIdentityChange(clear);onScopeDispose(()=>{clear();dispose()})
 watch([projectId,()=>can('alarm:read')],()=>{clear();void reload()},{immediate:true,flush:'sync'})
 return {list,rows,page,limit,sourceKind,reload,refresh,setSourceKind,setLimit,selectPage}
}
