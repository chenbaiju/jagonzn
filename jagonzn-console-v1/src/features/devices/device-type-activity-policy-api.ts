import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse,isStrictJsonNumber} from '@things-link/client-contracts/dashboard/v1'
export type ActivityPolicy=Schema<'DeviceTypeActivityPolicyResponse'>
export type ActivityPolicyScope=Readonly<{project:string;type:string}>
export type ActivityPolicyIntent=ActivityPolicyScope&Readonly<{expectedVersion:string;minutes:number;key:string}>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const maximum=9223372036854775807n
export function policyId(value:string){return uuid.test(value)}
function check(scope:ActivityPolicyScope){if(!policyId(scope.project)||!policyId(scope.type))throw new Error('类型活跃设置范围无效')}
function version(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=maximum}
/** 版本不经过浮点数，未配置与空输入没有隐式默认。 */
export function decodeActivityPolicy(bytes:Uint8Array,type:string):ActivityPolicy{
 const raw=parseDashboardRuntimeResponse(bytes),value=raw.activeTimeoutMinutes
 const minutes=value===null?null:value!==undefined&&isStrictJsonNumber(value)?Number(value.lexical):NaN
 if(Object.keys(raw).length!==4||raw.deviceTypeId!==type||!policyId(type)||typeof raw.configured!=='boolean'||!version(raw.version)
  ||(raw.configured?!(Number.isSafeInteger(minutes)&&minutes!==null&&minutes>=1&&minutes<=5000&&BigInt(raw.version)>0n):minutes!==null||raw.version!=='0'))throw new Error('类型活跃设置回执不完整或范围不符')
 return{deviceTypeId:type,configured:raw.configured,activeTimeoutMinutes:minutes,version:raw.version}
}
export function readActivityPolicy(scope:ActivityPolicyScope,signal:AbortSignal){check(scope);return api<Uint8Array>(`/api/v1/projects/${scope.project}/device-types/${scope.type}/activity-policy`,{signal,responseType:'bytes',maxResponseBytes:8192})}
export function prepareActivityPolicy(scope:ActivityPolicyScope,snapshot:ActivityPolicy,value:string):ActivityPolicyIntent{
 check(scope)
 if(snapshot.deviceTypeId!==scope.type||!version(snapshot.version)||BigInt(snapshot.version)>=maximum)throw new Error('策略版本不可继续更新，请重新核对')
 if(!/^[1-9][0-9]{0,3}$/.test(value)||Number(value)>5000)throw new Error('请输入1至5000的整数分钟')
 return Object.freeze({...scope,expectedVersion:snapshot.version,minutes:Number(value),key:crypto.randomUUID()})
}
export function writeActivityPolicy(intent:ActivityPolicyIntent,signal:AbortSignal){
 check(intent)
 const body={expectedVersion:intent.expectedVersion,activeTimeoutMinutes:intent.minutes} satisfies Schema<'UpdateDeviceTypeActivityPolicyRequest'>
 return api<Uint8Array>(`/api/v1/projects/${intent.project}/device-types/${intent.type}/activity-policy`,{method:'put',body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:8192})
}
export function policyReceiptMatches(value:ActivityPolicy,intent:ActivityPolicyIntent){return value.deviceTypeId===intent.type&&value.configured&&value.activeTimeoutMinutes===intent.minutes&&value.version===String(BigInt(intent.expectedVersion)+1n)}
