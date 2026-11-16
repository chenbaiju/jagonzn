import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'
import {eastEightCivilInstant} from './device-civil-time'
export {eastEightCivilInstant as historyRemovalEastEightInput} from './device-civil-time'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'

// 新HTTP路径及请求/回执直接绑定主控正式525生成合同；禁止手改生成物或复制后端DTO。
export type HistoryRemovalMode=NonNullable<Schema<'ConsolePropertyHistoryRemovalRequest'>['mode']>
export type HistoryRemovalReceipt=Required<Schema<'ConsolePropertyHistoryRemovalResponse'>>
export type HistoryRemovalIdentity={project:string;device:string;operationId:string}
export type HistoryRemovalIntent=HistoryRemovalIdentity&{body:string;key:string;mode:HistoryRemovalMode;from?:string;to?:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const modes=['ALL','FROM','TO','RANGE'] as const
const phases=['RAW','ONE_MINUTE','ONE_HOUR','ONE_DAY','REBUILD','PLATFORM','COMPLETE'] as const
const failures=['PROCESSING_BUDGET_EXHAUSTED','AUTHORIZATION_UNAVAILABLE','DEVICE_UNAVAILABLE','STORE_LAYOUT_UNSUPPORTED','MAINTENANCE_BUSY','SQL_BUDGET_EXCEEDED','WORKER_FAILURE']
/** DB规范UTC文本按纳秒比较，拒绝日期归一化、闰秒或超四位年。 */
function instant(value:unknown):bigint{
 if(typeof value!=='string')throw new Error('历史移除时间不完整')
 const match=/^([0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9])(?:\.([0-9]{1,9}))?Z$/.exec(value)
 if(!match||value.startsWith('0000'))throw new Error('历史移除时间格式不完整')
 const milliseconds=Date.parse(match[1]+'Z')
 if(!Number.isFinite(milliseconds)||new Date(milliseconds).toISOString().slice(0,19)!==match[1])throw new Error('历史移除日期无效')
 return BigInt(milliseconds)*1000000n+BigInt((match[2]||'').padEnd(9,'0'))
}
function picker(value:string|undefined){
 if(value===undefined||value==='')throw new Error('请选择完整的时间范围')
 return eastEightCivilInstant(value)
}
export function prepareHistoryRemoval(project:string,device:string,mode:HistoryRemovalMode,from?:string,to?:string):HistoryRemovalIntent{
 if(!uuid.test(project)||!uuid.test(device)||!modes.includes(mode))throw new Error('历史移除范围无效')
 const operationId=crypto.randomUUID(),lower=mode==='FROM'||mode==='RANGE'?picker(from):undefined,upper=mode==='TO'||mode==='RANGE'?picker(to):undefined
 if(lower&&upper&&instant(lower)>=instant(upper))throw new Error('结束时间必须晚于起始时间')
 const request={operationId,mode,...(lower?{from:lower}:{}),...(upper?{to:upper}:{})} satisfies Schema<'ConsolePropertyHistoryRemovalRequest'>
 return Object.freeze({project,device,operationId,mode,from:lower,to:upper,key:crypto.randomUUID(),body:JSON.stringify(request)})
}
export function submitHistoryRemoval(intent:HistoryRemovalIntent,signal:AbortSignal){
 return api<Uint8Array>(`${devicePath(intent.project,intent.device)}/property-history-removals`,{method:'post',rawBody:intent.body,signal,responseType:'bytes',maxResponseBytes:32768,headers:{'Content-Type':'application/json','Idempotency-Key':intent.key}})
}
export function readHistoryRemoval(identity:HistoryRemovalIdentity,signal:AbortSignal){
 if(!uuid.test(identity.operationId))throw new Error('原操作编号无效')
 return api<Uint8Array>(`${devicePath(identity.project,identity.device)}/property-history-removals/${identity.operationId}`,{signal,responseType:'bytes',maxResponseBytes:32768})
}
function count(value:StrictJsonValue|undefined,max=50000000){
 if(value===undefined||!isStrictJsonNumber(value)||!/^(0|[1-9][0-9]*)$/.test(value.lexical))throw new Error('历史移除计数不完整')
 const number=Number(value.lexical);if(!Number.isSafeInteger(number)||number>max)throw new Error('历史移除计数超出实际处理范围');return number
}
export function decodeHistoryRemoval(bytes:Uint8Array,identity:HistoryRemovalIdentity,expected?:Pick<HistoryRemovalIntent,'mode'|'from'|'to'>):HistoryRemovalReceipt{
 const value=parseDashboardRuntimeResponse(bytes),fields=['operationId','projectId','deviceId','mode','from','to','state','phase','rawRows','aggregateRows','platformOperations','rebuildWindows','batchesAttempted','acceptedAt','updatedAt','completedAt','failureCode']
 if(Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key))||value.operationId!==identity.operationId||value.projectId!==identity.project||value.deviceId!==identity.device
  ||!modes.some(mode=>mode===value.mode)||!['QUEUED','RUNNING','COMPLETED','FAILED'].some(state=>state===value.state)||!phases.some(phase=>phase===value.phase))throw new Error('历史移除回执身份或状态不完整，请查询原操作')
 const from=value.from===null?null:typeof value.from==='string'?(instant(value.from),value.from):undefined,to=value.to===null?null:typeof value.to==='string'?(instant(value.to),value.to):undefined
 if(from===undefined||to===undefined||value.mode==='ALL'&&(from!==null||to!==null)||value.mode==='FROM'&&(from===null||to!==null)||value.mode==='TO'&&(from!==null||to===null)||value.mode==='RANGE'&&(from===null||to===null||instant(from)>=instant(to)))throw new Error('历史移除范围回执不完整')
 if(expected&&(value.mode!==expected.mode||(from===null)!==!expected.from||(to===null)!==!expected.to||from!==null&&expected.from&&instant(from)!==instant(expected.from)||to!==null&&expected.to&&instant(to)!==instant(expected.to)))throw new Error('历史移除回执与原请求范围不一致')
 const acceptedAt=value.acceptedAt,updatedAt=value.updatedAt,completedAt=value.completedAt,terminal=value.state==='COMPLETED'||value.state==='FAILED'
 instant(acceptedAt);instant(updatedAt);if(completedAt!==null)instant(completedAt)
 if(terminal!==(completedAt!==null)
  ||value.state==='COMPLETED'&&(value.phase!=='COMPLETE'||value.failureCode!==null)||value.state==='FAILED'&&(typeof value.failureCode!=='string'||!failures.includes(value.failureCode))
  ||!terminal&&(value.phase==='COMPLETE'||value.failureCode!==null))throw new Error('历史移除终态回执不完整')
 const rawRows=count(value.rawRows),aggregateRows=count(value.aggregateRows),platformOperations=count(value.platformOperations),rebuildWindows=count(value.rebuildWindows,91),batchesAttempted=count(value.batchesAttempted,100000)
 if(rawRows+aggregateRows+platformOperations>500*batchesAttempted)throw new Error('历史移除计数超过实际批次')
 return {operationId:identity.operationId,projectId:identity.project,deviceId:identity.device,mode:value.mode as HistoryRemovalMode,from,to,state:value.state as HistoryRemovalReceipt['state'],phase:value.phase as HistoryRemovalReceipt['phase'],rawRows,aggregateRows,platformOperations,rebuildWindows,batchesAttempted,acceptedAt:acceptedAt as string,updatedAt:updatedAt as string,completedAt:completedAt as string|null,failureCode:value.failureCode as string|null}
}
/** 仅本标签页按账号/项目/设备保存原操作UUID；不存正文、时间、原幂等键、令牌或业务值。 */
export function pendingHistoryKey(account:string|undefined,project:string,device:string){return account&&uuid.test(account)&&uuid.test(project)&&uuid.test(device)?`thingslink:history-removal:${account}:${project}:${device}`:undefined}
export function pendingHistoryOperation(key:string|undefined){
 if(!key)return undefined
 try{const value=sessionStorage.getItem(key);if(value&&uuid.test(value))return value;if(value)sessionStorage.removeItem(key)}catch{/* 不把浏览器存储失败转成已受理或自动重发。 */}
 return undefined
}
export function savePendingHistory(key:string|undefined,operationId:string){if(!key||!uuid.test(operationId))throw new Error('无法保存原操作范围，请刷新身份后重试');sessionStorage.setItem(key,operationId)}
export function clearPendingHistory(key:string|undefined){if(key)try{sessionStorage.removeItem(key)}catch{/* 仅本地恢复索引，不授予服务端访问权。 */}}
