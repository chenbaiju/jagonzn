import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import type {Schema} from '@/core/contracts'
type EmptyState=Schema<'ConsoleDeviceCurrentEmptyValueItem'>['state']
const emptyStates:readonly EmptyState[]=['NO_VALUE','SOURCE_VERSION_UNKNOWN','SOURCE_MODEL_MISMATCH','CONTRACT_MISMATCH']
/** 正式PG快照按请求模型解释每个属性，不能把别模型的同名值贴入冻结定义。 */
export function decodeCurrentValues(bytes:Uint8Array,deviceId:string,modelVersionId:string,keys:readonly string[]){
 const object=(value:StrictJsonValue|undefined):StrictJsonObject=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))throw new Error('当前属性响应不是完整对象')
  return value as StrictJsonObject
 }
 const closed=(value:StrictJsonObject,fields:string[])=>{
  if(Object.keys(value).length!==fields.length||fields.some(field=>!Object.hasOwn(value,field)))throw new Error('当前属性响应字段不符合正式合同')
 }
 const response=parseDashboardRuntimeResponse(bytes);closed(response,['devices'])
 if(!Array.isArray(response.devices)||response.devices.length!==1)throw new Error('当前属性设备响应不完整')
 const item=object(response.devices[0]);closed(item,['deviceId','status','values'])
 if(item.deviceId!==deviceId||!Array.isArray(item.values))throw new Error('当前属性设备身份不匹配')
 if(item.status!=='AVAILABLE')throw new Error('设备不可用或物模型已变化，请刷新设备信息')
 if(item.values.length!==keys.length||new Set(keys).size!==keys.length)throw new Error('当前属性投影不完整')
 const values:Record<string,StrictJsonValue>=Object.create(null),occurredAt:Record<string,string>=Object.create(null)
 for(let index=0;index<keys.length;index++){
  const current=object(item.values[index]),key=keys[index]!
  if(current.propertyKey!==key)throw new Error('当前属性身份或顺序不匹配')
  if(current.state==='VALUE'){
   closed(current,['propertyKey','state','value','occurredAt','reportedModelVersionId'])
   const time=current.occurredAt
   if(current.reportedModelVersionId!==modelVersionId||current.value===null||typeof time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(time)||!Number.isFinite(Date.parse(time)))throw new Error('当前属性来源模型或采集时间不匹配')
   values[key]=current.value!;occurredAt[key]=time
  }else{
   closed(current,['propertyKey','state'])
   if(!emptyStates.includes(current.state as EmptyState))throw new Error('当前属性状态不合法')
   if(current.state!=='NO_VALUE')throw new Error('当前属性来源或数据合同不匹配，请刷新设备信息')
  }
 }
 return {values,occurredAt}
}
