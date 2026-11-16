import {api,ApiError,IdentityChanged,assertIdentity,identityEpoch} from '@/core/http'
import type {Schema} from '@/core/contracts'
export type ProjectMqttViewIdentity=Schema<'ProjectApplicationMqttIdentity'>
export type ProjectMqttViewCredentials=Schema<'ProjectApplicationMqttCredentials'>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const invalid=()=>new Error('订阅身份响应无效，请重新读取身份')
function object(value:unknown,keys:readonly string[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw invalid()
 const result=value as Record<string,unknown>
 if(Object.keys(result).length!==keys.length||keys.some(key=>!Object.hasOwn(result,key)))throw invalid()
 return result
}
/** 回验原始日历，拒绝Date.parse对不存在日期或24:00的归一化；不改写纳秒/时区正文。 */
function date(value:unknown):value is string{
 if(typeof value!=='string')return false
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value)
 if(!match)return false
 const [year,month,day,hour,minute,second]=match.slice(1,7).map(Number) as [number,number,number,number,number,number],zone=match[7]!
 if(month<1||month>12||day<1||day>31||hour>23||minute>59||second>59||zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(4))>59))return false
 const calendar=new Date(0);calendar.setUTCFullYear(year,month-1,day);calendar.setUTCHours(hour,minute,second,0)
 return calendar.getUTCFullYear()===year&&calendar.getUTCMonth()===month-1&&calendar.getUTCDate()===day&&Number.isFinite(Date.parse(value))
}
export function decodeProjectMqttViewIdentity(value:unknown,project:string):ProjectMqttViewIdentity{
 const raw=object(value,['projectId','viewKey','versionId','revision','status','createdAt','updatedAt'])
 if(!uuid.test(project)||raw.projectId!==project||typeof raw.viewKey!=='string'||!uuid.test(raw.viewKey)||typeof raw.versionId!=='string'||!uuid.test(raw.versionId)
  ||typeof raw.revision!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(raw.revision)||BigInt(raw.revision)>9223372036854775807n
  ||raw.status!=='ACTIVE'&&raw.status!=='REVOKED'||!date(raw.createdAt)||!date(raw.updatedAt))throw invalid()
 return{projectId:project,viewKey:raw.viewKey,versionId:raw.versionId,revision:raw.revision,status:raw.status,createdAt:raw.createdAt,updatedAt:raw.updatedAt}
}
/** 只接受当前元数据版本的既有专用材料，绝不从设备或项目接入秘密推导。 */
export function decodeProjectMqttViewCredentials(value:unknown,expected:ProjectMqttViewIdentity):ProjectMqttViewCredentials{
 const raw=object(value,['identity','projectViewKey','projectViewSecret']),identity=decodeProjectMqttViewIdentity(raw.identity,expected.projectId)
 if(identity.status!=='ACTIVE'||(Object.keys(expected) as (keyof ProjectMqttViewIdentity)[]).some(key=>identity[key]!==expected[key])
  ||raw.projectViewKey!==`tl-view-v1:${identity.viewKey}`||typeof raw.projectViewSecret!=='string'||raw.projectViewSecret.length!==86||!raw.projectViewSecret.startsWith(`tlpv1.${identity.viewKey}.`))throw invalid()
 const tail=raw.projectViewSecret.slice(43)
 if(!/^[A-Za-z0-9_-]{43}$/.test(tail))throw invalid()
 try{const decoded=atob(tail.replace(/-/g,'+').replace(/_/g,'/')+'=');if(decoded.length!==32||btoa(decoded).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==tail)throw invalid()}catch{throw invalid()}
 return{identity,projectViewKey:raw.projectViewKey as string,projectViewSecret:raw.projectViewSecret}
}
/** 上游错误正文可能含敏感材料；页面只显示固定状态文案。 */
export function projectMqttViewError(cause:unknown):string{
 if(cause instanceof ApiError){
  if(cause.status===401||cause.status===403)return '当前账号没有订阅身份的读取权限'
  if(cause.status===404)return '当前没有可读取的订阅身份'
  if(cause.status===409)return '当前订阅凭据不可用，请重新读取身份'
  if(cause.status===503)return '项目 MQTT 订阅身份管理尚未启用'
 }
 return '订阅身份读取未完成，请重新读取身份'
}
function safeError(cause:unknown):never{
 if(cause instanceof IdentityChanged)throw cause
 if(cause instanceof ApiError)throw new ApiError(projectMqttViewError(cause),cause.status,cause.code)
 throw new Error(projectMqttViewError(cause))
}
export async function readProjectMqttViewIdentity(project:string,signal:AbortSignal){
 if(!uuid.test(project))throw invalid()
 const epoch=identityEpoch()
 try{const value=await api<unknown>(`/api/v1/projects/${project}/application-mqtt`,{signal,maxResponseBytes:16384});assertIdentity(epoch);return decodeProjectMqttViewIdentity(value,project)}catch(cause){safeError(cause)}
}
export async function readProjectMqttViewCredentials(expected:ProjectMqttViewIdentity,signal:AbortSignal){
 const snapshot=decodeProjectMqttViewIdentity(expected,expected.projectId),epoch=identityEpoch()
 if(snapshot.status!=='ACTIVE')throw invalid()
 try{const value=await api<unknown>(`/api/v1/projects/${snapshot.projectId}/application-mqtt/credentials`,{signal,maxResponseBytes:16384});assertIdentity(epoch);return decodeProjectMqttViewCredentials(value,snapshot)}catch(cause){safeError(cause)}
}

export type ProjectMqttViewOperation=Schema<'ProjectApplicationMqttOperation'>
export type ProjectMqttViewRotationIntent=Readonly<{project:string;expected:Readonly<ProjectMqttViewIdentity>;operationId:string;key:string;body:string;bodyHash:string}>
const rotationInvalid=()=>new Error('重置回执与本次操作不符，请核对原操作')
/** 固定原操作、CAS和原始正文；摘要等待结束后由调用者再次核对当前权限。 */
export async function prepareProjectMqttViewRotation(value:ProjectMqttViewIdentity):Promise<ProjectMqttViewRotationIntent>{
 const expected=Object.freeze(decodeProjectMqttViewIdentity(value,value.projectId))
 if(expected.status!=='ACTIVE'||BigInt(expected.revision)===9223372036854775807n)throw new Error('当前订阅身份不可重置，请重新读取身份')
 const operationId=crypto.randomUUID(),key=crypto.randomUUID()
 const request:Schema<'ProjectApplicationMqttExpectedVersion'>={operationId,expectedVersionId:expected.versionId,expectedRevision:expected.revision}
 const body=JSON.stringify(request),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body))
 return Object.freeze({project:expected.projectId,expected,operationId,key,body,bodyHash:Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('')})
}
/** 原件与后来当前身份分开；本动作需要完整非空CAS字段，不放宽通用Schema的可选字段。 */
export function decodeProjectMqttViewRotation(value:unknown,intent:ProjectMqttViewRotationIntent):ProjectMqttViewOperation{
 const raw=object(value,['operationId','kind','expectedVersionId','expectedRevision','viewKey','versionId','revision','status','acceptedAt'])
 if(raw.operationId!==intent.operationId||raw.kind!=='ROTATE'||raw.expectedVersionId!==intent.expected.versionId||raw.expectedRevision!==intent.expected.revision
  ||raw.viewKey!==intent.expected.viewKey||typeof raw.versionId!=='string'||!uuid.test(raw.versionId)||raw.versionId===intent.expected.versionId
  ||typeof raw.revision!=='string'||raw.revision!==(BigInt(intent.expected.revision)+1n).toString()||raw.status!=='ACTIVE'||!date(raw.acceptedAt))throw rotationInvalid()
 return{operationId:intent.operationId,kind:'ROTATE',expectedVersionId:intent.expected.versionId,expectedRevision:intent.expected.revision,viewKey:intent.expected.viewKey,versionId:raw.versionId,revision:raw.revision,status:'ACTIVE',acceptedAt:raw.acceptedAt}
}
/** 写响应是否未知必须保留；任何上游正文都不直接进入提示。 */
export function projectMqttViewRotationError(cause:unknown):string{
 if(cause instanceof ApiError){
  if(cause.status===401||cause.status===403)return '当前账号无权继续核对；原操作结果尚未确认'
  if(cause.status===404)return '当前无法读取本次操作原件；结果仍未确认'
  if(cause.status===409&&!cause.outcomeUnknown)return '本次重置被拒绝，请重新读取身份后确认'
 }
 return '本次重置结果尚未确认，请读取原操作核对'
}
function rotationError(cause:unknown):never{
 if(cause instanceof IdentityChanged)throw cause
 if(cause instanceof ApiError)throw new ApiError(projectMqttViewRotationError(cause),cause.status,cause.code,undefined,cause.outcomeUnknown)
 throw new Error(projectMqttViewRotationError(cause))
}
export async function rotateProjectMqttView(intent:ProjectMqttViewRotationIntent,signal:AbortSignal){
 const epoch=identityEpoch()
 try{const raw=await api<unknown>(`/api/v1/projects/${intent.project}/application-mqtt/rotate`,{method:'post',rawBody:intent.body,headers:{'Content-Type':'application/json','Idempotency-Key':intent.key},signal,maxResponseBytes:16384});assertIdentity(epoch);return decodeProjectMqttViewRotation(raw,intent)}catch(cause){rotationError(cause)}
}
export async function readProjectMqttViewRotation(intent:ProjectMqttViewRotationIntent,signal:AbortSignal){
 const epoch=identityEpoch()
 try{const raw=await api<unknown>(`/api/v1/projects/${intent.project}/application-mqtt/operations/${intent.operationId}`,{signal,maxResponseBytes:16384});assertIdentity(epoch);return decodeProjectMqttViewRotation(raw,intent)}catch(cause){rotationError(cause)}
}
