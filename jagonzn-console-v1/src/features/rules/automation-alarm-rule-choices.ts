import {ref,watch,onScopeDispose} from 'vue'
import {can,projectId} from '@/core/session'
import {ApiError,identityEpoch,onIdentityChange} from '@/core/http'
import {readDeviceAlarmRules,type DeviceAlarmRule} from '../devices/device-alarm-rules-api'
import {automationAlarmCondition,type AutomationNode,type AutomationAlarmCondition} from './automation-editor-draft'
/** 只找本设备适用的精确规则；首页未找到不能把后页旧引用判断为失效。 */
export async function findAutomationAlarmRule(project:string,device:string,rule:string,signal:AbortSignal):Promise<DeviceAlarmRule|undefined>{
 const seen=new Set<string>();let total:string|undefined
 for(let page=1;;page++){
  signal.throwIfAborted();const value=await readDeviceAlarmRules(project,device,page,100,signal);if(!Array.isArray(value.items)||typeof value.total!=='string')throw new Error('告警规则候选资料不完整')
  if(total!==undefined&&value.total!==total)throw new Error('告警规则候选已变化，请重新读取');total=value.total
  for(const row of value.items){if(seen.has(row.id!))throw new Error('告警规则候选已变化，请重新读取');seen.add(row.id!);if(row.id===rule)return row}
  if(BigInt(page)*100n>=BigInt(value.total!))return
 }
}
/** 只显示精确公开事实，停止监测不抹真实ACTIVE，未知不补成正常。 */
export function automationAlarmRuleStateLabel(row:DeviceAlarmRule):string{return row.incident?.conditionState==='ACTIVE'?'告警中':row.incident?.conditionState==='PENDING'?'—':row.enabled&&row.deviceAllowed?'正常':'—'}
/** 名称只用于展示；身份或引用变化清理，读取失败保真实UUID，不授保存/执行许可。 */
export function useAutomationAlarmRuleNames(nodes:()=>readonly AutomationNode[]|undefined){
 const names=ref(new Map<string,string>());let alive=true,turn=0,controller:AbortController|undefined
 function clear(){turn++;controller?.abort();names.value=new Map()}
 const permitted=()=>can('rule:read')&&can('device:read')&&can('alarm:read')
 watch([projectId,permitted,()=>nodes()?.map(node=>{const c=automationAlarmCondition(node);return c?`${c.deviceId}:${c.alarmRuleId}`:''}).join('|')],async()=>{
  clear();if(!projectId.value||!permitted())return;const project=projectId.value,epoch=identityEpoch(),token=turn;controller=new AbortController();const signal=controller.signal
  const current=()=>alive&&!signal.aborted&&token===turn&&project===projectId.value&&epoch===identityEpoch()&&permitted()
  const pairs=new Map((nodes()??[]).map(automationAlarmCondition).filter((c):c is AutomationAlarmCondition=>c!==undefined).map(c=>[`${c.deviceId}:${c.alarmRuleId}`,c] as const))
  for(const c of pairs.values()){try{const row=await findAutomationAlarmRule(project,c.deviceId,c.alarmRuleId,signal);if(!current())return;if(row)names.value=new Map(names.value).set(c.alarmRuleId,row.name!)}catch(cause){if(!current())return;if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){names.value=new Map();return}}}
 },{immediate:true})
 const dispose=onIdentityChange(clear);onScopeDispose(()=>{alive=false;clear();dispose()});return names
}
