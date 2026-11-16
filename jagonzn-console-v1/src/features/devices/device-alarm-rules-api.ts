import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'
export type DeviceAlarmRulePage=Schema<'DeviceAlarmRulePageResponse'>
export type DeviceAlarmRule=Schema<'DeviceAlarmRuleItemResponse'>
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const fail=():never=>{throw new Error('设备适用告警规则身份或分页资料不完整')}
function object(value:StrictJsonValue,keys:string[]):StrictJsonObject{
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))return fail()
 return value as StrictJsonObject
}
function integer(value:StrictJsonValue|undefined,min=0){if(value===undefined||!isStrictJsonNumber(value)||!/^(0|[1-9][0-9]*)$/.test(value.lexical))return fail();const n=Number(value.lexical);if(!Number.isInteger(n)||n<min||n>2147483647)return fail();return n}
export function decodeDeviceAlarmRules(bytes:Uint8Array,device:string,page:number,limit:number):DeviceAlarmRulePage{
 const value=object(parseDashboardRuntimeResponse(bytes),['deviceId','items','total','page','limit'])
 if(!uuid.test(device)||value.deviceId!==device||integer(value.page,1)!==page||integer(value.limit,1)!==limit||typeof value.total!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(value.total)||BigInt(value.total)>9223372036854775807n||!Array.isArray(value.items)||value.items.length>limit)fail()
 const ids=new Set<string>()
 const items=(value.items as StrictJsonValue[]).map(raw=>{
  const row=object(raw,['id','name','enabled','version','level','sourceKind','manualClearAllowed','incident','notificationGroups','customerChannels','deviceAllowed','deviceAllowanceVersion'])
  if(typeof row.id!=='string'||!uuid.test(row.id)||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>128||typeof row.enabled!=='boolean'||typeof row.manualClearAllowed!=='boolean'||!['NORMAL','IMPORTANT','URGENT'].includes(row.level as string)||!['DEVICE','DEVICE_TYPE'].includes(row.sourceKind as string))fail()
  const deviceAllowanceVersion=integer(row.deviceAllowanceVersion)
  if(typeof row.deviceAllowed!=='boolean'||deviceAllowanceVersion===0&&!row.deviceAllowed)fail()
  ids.add(row.id as string);const version=integer(row.version);let incident=null
  if(row.incident!==null){const i=object(row.incident!,['instanceId','ruleId','deviceId','conditionState','version']);if(typeof i.instanceId!=='string'||!uuid.test(i.instanceId)||i.ruleId!==row.id||i.deviceId!==device||!['PENDING','ACTIVE'].includes(i.conditionState as string))fail();incident={instanceId:i.instanceId,ruleId:i.ruleId,deviceId:device,conditionState:i.conditionState,version:integer(i.version)}}
  if(!Array.isArray(row.notificationGroups)||!Array.isArray(row.customerChannels))fail()
  const groupIds=new Set<string>()
  const notificationGroups=(row.notificationGroups as StrictJsonValue[]).map(rawGroup=>{
   const group=object(rawGroup,['id','name'])
   if(typeof group.id!=='string'||!uuid.test(group.id)||groupIds.has(group.id)||(group.name!==null&&typeof group.name!=='string'))fail()
   groupIds.add(group.id as string);return {id:group.id,name:group.name}
  })
  const channels=new Set<string>()
  for(const channel of row.customerChannels as StrictJsonValue[]){if(typeof channel!=='string'||!['WECHAT','SMS','VOICE','APP'].includes(channel)||channels.has(channel))fail();channels.add(channel as string)}
  return {...row,version,incident,notificationGroups,customerChannels:row.customerChannels,deviceAllowanceVersion} as DeviceAlarmRule
 })
 const offset=BigInt(page-1)*BigInt(limit),remaining=BigInt(value.total as string)-offset,expected=remaining<=0n?0:Number(remaining<BigInt(limit)?remaining:BigInt(limit))
 if(items.length!==expected)fail()
 return {deviceId:device,items,total:value.total as string,page,limit}
}
export async function readDeviceAlarmRules(project:string,device:string,page:number,limit:number,signal:AbortSignal){
 if(!uuid.test(project)||!uuid.test(device)||!Number.isInteger(page)||page<1||page>2147483647||!Number.isInteger(limit)||limit<1||limit>100)fail()
 const bytes=await api<Uint8Array>(`/api/v1/projects/${project}/console/devices/${device}/alarm-rules`,{query:{page,limit},signal,responseType:'bytes',maxResponseBytes:4194304})
 return decodeDeviceAlarmRules(bytes,device,page,limit)
}
