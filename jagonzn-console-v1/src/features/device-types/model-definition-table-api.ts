import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'
import {propertyValueText} from '../devices/property-decoder'
import {typeProfileId} from './profile-api'
import type {ModelEditContext} from './model-edit-api'

export type DefinitionKind='properties'|'events'|'commands'
export type DefinitionContext=Readonly<Required<Pick<Schema<'DeviceTypeModelDefinitionContextResponse'>,'deviceTypeId'|'typeStatus'|'versionId'|'versionNumber'|'token'>>>
export type DefinitionTableList<T>=Readonly<{items:readonly T[];context:DefinitionContext}>
export type DefinitionTableIntent=Readonly<{project:string;typeId:string;kind:DefinitionKind;operation:'order'|'delete';context:DefinitionContext;ids:readonly string[];key:string}>
export type DefinitionTablePort<T>={definitionList?:(project:string,typeId:string,signal:AbortSignal)=>Promise<DefinitionTableList<T>>;tableWrite?:(intent:DefinitionTableIntent,signal:AbortSignal)=>Promise<DefinitionTableList<T>>}
const fields=['deviceTypeId','typeStatus','versionId','versionNumber','token','properties','events','commands'] as const
function fail():never{throw new Error('完整功能定义或编辑版本不符，请重新读取')}
function base(project:string,typeId:string){if(!typeProfileId(project)||!typeProfileId(typeId))fail();return `/api/v1/projects/${project}/device-types/${typeId}` as const}
function context(raw:StrictJsonObject,typeId:string):DefinitionContext{
 if(Object.keys(raw).length!==fields.length||fields.some(key=>!Object.hasOwn(raw,key))||raw.deviceTypeId!==typeId||!['DRAFT','PUBLISHED'].includes(String(raw.typeStatus))||typeof raw.token!=='string'||!/^[a-f0-9]{64}$/.test(raw.token)||!['properties','events','commands'].every(key=>Array.isArray(raw[key])))fail()
 if(raw.typeStatus==='DRAFT'?(raw.versionId!==null||raw.versionNumber!==null):(!typeProfileId(raw.versionId)||typeof raw.versionNumber!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(raw.versionNumber)))fail()
 return Object.freeze({deviceTypeId:typeId,typeStatus:raw.typeStatus,versionId:raw.versionId,versionNumber:raw.versionNumber,token:raw.token}) as DefinitionContext
}
export function publishedEditContext(value:DefinitionContext):ModelEditContext|undefined{
 return value.typeStatus==='PUBLISHED'&&value.versionId&&value.versionNumber?Object.freeze({deviceTypeId:value.deviceTypeId,versionId:value.versionId,versionNumber:value.versionNumber,token:value.token}):undefined
}
export function decodeDefinitionTable<T>(bytes:Uint8Array,typeId:string,kind:DefinitionKind,decode:(bytes:Uint8Array,typeId:string)=>readonly T[]):DefinitionTableList<T>{
 const value=parseDashboardRuntimeResponse(bytes)
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))fail()
 const raw=value as StrictJsonObject,identity=context(raw,typeId)
 return Object.freeze({context:identity,items:decode(new TextEncoder().encode(propertyValueText(raw[kind]!)),typeId)})
}
export async function readDefinitionTable<T>(project:string,typeId:string,kind:DefinitionKind,decode:(bytes:Uint8Array,typeId:string)=>readonly T[],signal:AbortSignal){
 return decodeDefinitionTable(await api<Uint8Array>(`${base(project,typeId)}/model-definition-context`,{signal,responseType:'bytes',maxResponseBytes:8*1024*1024}),typeId,kind,decode)
}
export async function writeDefinitionTable<T>(intent:DefinitionTableIntent,decode:(bytes:Uint8Array,typeId:string)=>readonly T[],signal:AbortSignal){
 const route=intent.operation==='order'?'model-definition-orders':'model-definition-deletions'
 const body=intent.operation==='order'?{orderedIds:intent.ids}:{ids:intent.ids}
 return decodeDefinitionTable(await api<Uint8Array>(`${base(intent.project,intent.typeId)}/${route}/${intent.kind}`,{method:'post',body,headers:{'Idempotency-Key':intent.key,'If-Match':intent.context.token},signal,responseType:'bytes',maxResponseBytes:8*1024*1024}),intent.typeId,intent.kind,decode)
}
export function prepareDefinitionTableOperation(project:string,typeId:string,kind:DefinitionKind,operation:'order'|'delete',value:DefinitionContext|undefined,allIds:readonly string[],ids:readonly string[]):DefinitionTableIntent{
 base(project,typeId)
 if(operation==='delete'&&ids.length>100)throw new Error('每次最多移除100项，请减少选择')
 if(!value||value.deviceTypeId!==typeId||!/^[a-f0-9]{64}$/.test(value.token)||!ids.length||ids.length>(operation==='delete'?100:1000)||new Set(allIds).size!==allIds.length||new Set(ids).size!==ids.length||ids.some(id=>!typeProfileId(id)||!allIds.includes(id))||operation==='order'&&ids.length!==allIds.length)fail()
 return Object.freeze({project,typeId,kind,operation,context:value,ids:Object.freeze([...ids]),key:crypto.randomUUID()})
}
