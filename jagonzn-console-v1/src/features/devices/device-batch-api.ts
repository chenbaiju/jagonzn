import type {Schema} from '@/core/contracts'
import {ApiError} from '@/core/http'
import {devicesApi} from './api'
import {readStaticGroup,decodeStaticGroup,changeStaticGroup,prepareStaticGroup,type StaticGroupIntent} from './static-group-membership-api'
import {readUserAssociations,prepareAssociationOperation,applyAssociationOperation,recoverAssociationOperation,type PreparedAssociationOperation} from './user-associations-api'

export type BatchAction='add-group'|'remove-group'|'associate'|'remove'|'enable'|'disable'
export type Access=Readonly<Schema<'DeviceAccessConfigurationResponse'>>
export type BatchStatus='READY'|'NOOP'|'RUNNING'|'SUCCESS'|'FAILED'|'UNKNOWN'|'NOTRUN'
export type BatchRow={id:string;name:string;status:BatchStatus;detail:string;targetName?:string;access?:Access;group?:StaticGroupIntent;association?:PreparedAssociationOperation;checked?:boolean;observation?:string}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
export function batchId(value:unknown):string{if(typeof value!=='string'||!uuid.test(value))throw new Error('设备操作身份无效');return value.toLowerCase()}
export function batchSelection(values:readonly string[]):string[]{
 if(!Array.isArray(values)||values.length>96)throw new Error('仅支持当前页最多96台设备，不会截断选择')
 const ids=values.map(batchId);if(new Set(ids).size!==ids.length)throw new Error('所选设备身份重复');return ids
}
export function accessFact(value:unknown):Access{
 const a=value as Access,protocols=['MQTT','HTTP','COAP','TCP'],keys=['protocol','enabled','configVersion','credentialVersion','configured','allowedProtocols','canManage']
 const version=(v:unknown)=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n
 if(!a||typeof a!=='object'||Object.keys(a).length!==keys.length||keys.some(k=>!Object.hasOwn(a,k))||!protocols.includes(a.protocol)||typeof a.enabled!=='boolean'||typeof a.configured!=='boolean'||typeof a.canManage!=='boolean'||!version(a.configVersion)||!version(a.credentialVersion)||!Array.isArray(a.allowedProtocols)||a.allowedProtocols.length>4||new Set(a.allowedProtocols).size!==a.allowedProtocols.length||a.allowedProtocols.some(p=>!protocols.includes(p)))throw new Error('设备接入配置不完整，请重新读取')
 return Object.freeze({...a,allowedProtocols:[...a.allowedProtocols]})
}
export async function readBatchDevice(project:string,id:string,signal:AbortSignal){
 const d=await devicesApi.read(project,id,signal)
 // DeviceResponse没有projectId；项目边界由当前会话、请求路径与服务端授权约束，不校验不存在的字段。
 if(d.id!==id||typeof d.name!=='string'||!d.name.trim()||Array.from(d.name).length>128)throw new Error('设备身份或名称不完整')
 return{id,name:d.name}
}
export async function readBatchAccess(project:string,id:string,signal:AbortSignal){return accessFact(await devicesApi.access(project,id,signal))}
/** 有限续读只判断目标关系；达到边界仍有后页时明确失败，不假定未关联。 */
export async function hasBatchAssociation(project:string,id:string,user:string,signal:AbortSignal){
 let cursor:string|undefined;const seen=new Set<string>(),bindings=new Set<string>(),users=new Set<string>()
 for(let page=0;page<100;page++){
  const result=await readUserAssociations(project,id,cursor,signal)
  for(const r of result.items){if(bindings.has(r.bindingId)||users.has(r.appUserId))throw new Error('关联用户目录在续读中发生变化');bindings.add(r.bindingId);users.add(r.appUserId)}
  if(result.items.some(r=>r.appUserId===user))return true
  if(!result.hasMore)return false
  if(!result.nextCursor||seen.has(result.nextCursor))throw new Error('关联用户目录位置重复')
  seen.add(result.nextCursor);cursor=result.nextCursor
 }
 throw new Error('关联用户目录超过核对上限，请缩小操作范围')
}
export async function prepareBatchRow(project:string,id:string,action:BatchAction,target:string,signal:AbortSignal):Promise<BatchRow>{
 const device=await readBatchDevice(project,id,signal),row:BatchRow={...device,status:'READY',detail:'待确认'}
 if(action==='enable'||action==='disable'){
  const a=await readBatchAccess(project,id,signal);row.access=a
  if(a.enabled===(action==='enable')){row.status='NOOP';row.detail='当前已是目标状态'}
  else if(!a.canManage||!a.allowedProtocols.includes(a.protocol)||BigInt(a.configVersion)===9223372036854775807n)throw new Error('当前设备接入配置不可修改')
 }else if(action==='add-group'||action==='remove-group'){
  const scope={project,device:id},member=action==='add-group';batchId(target)
  const a=decodeStaticGroup(await readStaticGroup(scope,target,signal),scope,target)
  row.targetName=a.name
  if(a.member===member){row.status='NOOP';row.detail=member?'当前已加入该组':'当前已不在该组'}
  else row.group=prepareStaticGroup(scope,target,member)
 }else if(action==='associate'){
  batchId(target)
  if(await hasBatchAssociation(project,id,target,signal)){row.status='NOOP';row.detail='当前已关联该用户'}
  else row.association=prepareAssociationOperation(project,id,'ADD',[target])
 }
 return row
}
/** 每行只提交一次，成功后核对当前事实；读回不符仍保留未知保护。 */
export async function writeBatchRow(project:string,row:BatchRow,action:BatchAction,target:string,signal:AbortSignal){
 if(action==='remove'){await devicesApi.remove(project,row.id);return}
 if(action==='enable'||action==='disable'){
  const before=row.access!,enabled=action==='enable'
  const receipt=accessFact(await devicesApi.changeAccess(project,row.id,{protocol:before.protocol,enabled,expectedConfigVersion:before.configVersion}))
  if(receipt.protocol!==before.protocol||receipt.enabled!==enabled||BigInt(receipt.configVersion)!==BigInt(before.configVersion)+1n)throw new ApiError('接入修改回执不符合本次版本',200,undefined,undefined,true)
  const actual=await readBatchAccess(project,row.id,signal)
  if(actual.protocol!==receipt.protocol||actual.enabled!==receipt.enabled||actual.configVersion!==receipt.configVersion)throw new ApiError('当前接入状态与回执不同',200,undefined,undefined,true)
 }else if(action==='add-group'||action==='remove-group'){
  const intent=row.group!,scope={project,device:row.id}
  const receipt=decodeStaticGroup(await changeStaticGroup(intent,signal),scope,target)
  const actual=decodeStaticGroup(await readStaticGroup(scope,target,signal),scope,target)
  if(receipt.member!==intent.member||actual.member!==intent.member)throw new ApiError('设备分组读回不符合目标状态',200,undefined,undefined,true)
 }else{
  await applyAssociationOperation(row.association!,signal)
  if(!await hasBatchAssociation(project,row.id,target,signal))throw new ApiError('关联回执完成但当前关系仍需核对',200,undefined,undefined,true)
 }
}
/** 只读原设备/原意图，不重发写请求，不把当前事实冒充历史执行结果。 */
export async function observeBatchRow(project:string,row:BatchRow,action:BatchAction,target:string,signal:AbortSignal):Promise<string>{
 if(action==='remove'){
  try{await readBatchDevice(project,row.id,signal);return '当前设备仍可读取；不证明原移除请求的历史结果'}
  catch(e){if(e instanceof ApiError&&e.status===404)return '当前设备不可见（404）；不证明原移除请求完成';throw e}
 }
 if(action==='enable'||action==='disable'){const a=await readBatchAccess(project,row.id,signal);return `当前${a.enabled?'启用':'停用'}，配置版本${a.configVersion}；原请求结果仍未确认`}
 if(action==='associate'){
  await recoverAssociationOperation(row.association!,signal)
  return '原关联操作回执已核实；结束核对后重新读取列表'
 }
 const scope={project,device:row.id},a=decodeStaticGroup(await readStaticGroup(scope,target,signal),scope,target)
 return `当前${a.member?'已在':'不在'}该设备组；不证明原请求的历史结果`
}
