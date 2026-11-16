import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {validateTagRows,type DeviceTagRow} from '../devices/tag-rules'
export type DeviceGroup=Readonly<Required<Schema<'DeviceGroupResponse'>>>
type GroupTreeItem=NonNullable<Schema<'DeviceGroupTreePageResponse'>['items']>[number]
export type GroupTreePage=Readonly<Required<Omit<Schema<'DeviceGroupTreePageResponse'>,'items'>>&{
 items:readonly Readonly<Required<Omit<GroupTreeItem,'group'>>&{group:DeviceGroup}>[]
}>
export type GroupQuery=Readonly<{parentId:string|null;page:number;size:number}>
export type GroupDraft={name:string;description:string;type:'STATIC'|'DYNAMIC';rule:string;parentId:string|null;parentName:string;color:string;sortOrder:string;tags:DeviceTagRow[]}
type GroupWriteBase=Readonly<{project:string;key:string}>
export type GroupIntent=GroupWriteBase&(
 |Readonly<{kind:'create';groupId?:never;body:Readonly<Schema<'SaveDeviceGroupRequest'>>}>
 |Readonly<{kind:'edit';groupId:string;body:Readonly<Schema<'SaveDeviceGroupRequest'>&Required<Pick<Schema<'SaveDeviceGroupRequest'>,'revision'>>>}>
 |Readonly<{kind:'move';groupId:string;body:Readonly<Schema<'MoveDeviceGroupRequest'>>}>
 |Readonly<{kind:'delete';groupId:string;body?:never}>)
export type GroupOrderItem=NonNullable<Schema<'SortDeviceGroupsRequest'>['items']>[number]
export type GroupTransport={list:(project:string,query:GroupQuery,signal:AbortSignal)=>Promise<GroupTreePage>;read:(project:string,id:string,signal:AbortSignal)=>Promise<DeviceGroup>;write:(intent:GroupIntent,signal:AbortSignal)=>Promise<DeviceGroup|undefined>;order?:(project:string,signal:AbortSignal)=>Promise<DeviceGroup[]>;sort?:(project:string,items:GroupOrderItem[],signal:AbortSignal)=>Promise<DeviceGroup[]>}
export const groupUuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
function invalid(message='设备组响应范围或字段不完整'):never{throw new Error(message)}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return value as Record<string,unknown>}
function integer(value:unknown,max=Number.MAX_SAFE_INTEGER):number{const word=isStrictJsonNumber(value as StrictJsonValue)?(value as {lexical:string}).lexical:typeof value==='number'&&Number.isSafeInteger(value)?String(value):'';if(!/^(0|[1-9]\d*)$/.test(word)||BigInt(word)>BigInt(max))invalid('设备组整数超出安全范围');return Number(word)}
function tags(value:unknown){const source=object(value),entries=Object.entries(source);if(entries.some(([,v])=>typeof v!=='string'))invalid('组标签必须为字符串映射');validateTagRows(entries.map(([key,value])=>({key,value:value as string})));return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<string,string>>}
function rule(value:unknown):NonNullable<Schema<'SaveDeviceGroupRequest'>['rule']>|null{
 if(value==null)return null
 const raw=object(value),keys=Object.keys(raw)
 if(keys.some(k=>!['deviceTypeIds','statuses','tags','tagMatch'].includes(k))||!Array.isArray(raw.deviceTypeIds)||raw.deviceTypeIds.length>100||raw.deviceTypeIds.some(v=>typeof v!=='string'||!groupUuid.test(v))||new Set(raw.deviceTypeIds).size!==raw.deviceTypeIds.length||!Array.isArray(raw.statuses)||raw.statuses.length>3||raw.statuses.some(v=>!['INACTIVE','ONLINE','OFFLINE'].includes(String(v)))||new Set(raw.statuses).size!==raw.statuses.length)invalid('动态组仅支持既有类型、状态和标签白名单')
 const t=tags(raw.tags),hasTags=Object.keys(t).length>0
 if(!raw.deviceTypeIds.length&&!raw.statuses.length&&!hasTags||(hasTags?!['ANY','ALL'].includes(String(raw.tagMatch)):raw.tagMatch!=null))invalid('动态组条件或标签匹配方式不完整')
 return Object.freeze({deviceTypeIds:Object.freeze([...raw.deviceTypeIds]),statuses:Object.freeze([...raw.statuses]),tags:t,tagMatch:raw.tagMatch??null}) as NonNullable<Schema<'SaveDeviceGroupRequest'>['rule']>
}
export function decodeGroup(value:unknown,id?:string):DeviceGroup{
 const raw=object(value),required=['id','name','description','type','rule','createdAt','parentId','color','tags','sortOrder','revision']
 if(Object.keys(raw).length!==required.length||required.some(k=>!Object.hasOwn(raw,k))||typeof raw.id!=='string'||!groupUuid.test(raw.id)||id!==undefined&&raw.id!==id||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>128||raw.description!==null&&(typeof raw.description!=='string'||raw.description.length>500)||!['STATIC','DYNAMIC'].includes(String(raw.type))||typeof raw.createdAt!=='string'||!Number.isFinite(Date.parse(raw.createdAt))||raw.parentId!==null&&(typeof raw.parentId!=='string'||!groupUuid.test(raw.parentId)||raw.parentId===raw.id)||raw.color!==null&&(typeof raw.color!=='string'||!/^#[a-f\d]{6}$/i.test(raw.color))||typeof raw.revision!=='string'||!/^(0|[1-9]\d{0,18})$/.test(raw.revision)||BigInt(raw.revision)>9223372036854775807n)invalid()
 const r=rule(raw.rule);if(raw.type==='STATIC'?r!==null:r===null)invalid()
 return Object.freeze({...raw,rule:r,tags:tags(raw.tags),sortOrder:integer(raw.sortOrder,2147483647)}) as DeviceGroup
}
export function decodeGroupPage(value:unknown,query:GroupQuery):GroupTreePage{
 const raw=object(value)
 if(Object.keys(raw).length!==5||!['items','total','page','size','hasMore'].every(k=>Object.hasOwn(raw,k)))invalid()
 if(!Array.isArray(raw.items)||typeof raw.hasMore!=='boolean'||integer(raw.page)!==query.page||integer(raw.size)!==query.size)invalid()
 const total=integer(raw.total),offset=(query.page-1)*query.size,expected=Math.min(query.size,Math.max(0,total-offset))
 if(raw.items.length!==expected||raw.hasMore!==(query.page*query.size<total))invalid()
 const items=raw.items.map(value=>{
  const item=object(value)
  if(Object.keys(item).length!==4||typeof item.hasChildren!=='boolean')invalid()
  const group=decodeGroup(item.group),deviceCount=integer(item.deviceCount),childCount=integer(item.childCount)
  if(group.parentId!==query.parentId)invalid('设备组层级范围不符')
  if(item.hasChildren!==(childCount>0))invalid('设备组子组数与展开状态不符')
  return Object.freeze({group,hasChildren:item.hasChildren,deviceCount,childCount})
 })
 for(let i=0;i<items.length;i++){const current=items[i]!.group,previous=items[i-1]?.group;if(previous&&(current.sortOrder<previous.sortOrder||current.sortOrder===previous.sortOrder&&current.id<=previous.id))invalid('设备组页重复或顺序不符')}
 return Object.freeze({items:Object.freeze(items),total,page:query.page,size:query.size,hasMore:raw.hasMore}) as GroupTreePage
}
export function groupDraft(group?:DeviceGroup,parentId:string|null=null,parentName='根组'):GroupDraft{return{name:group?.name??'',description:group?.description??'',type:group?.type??'STATIC',rule:group?.rule?JSON.stringify(group.rule,null,2):'{"deviceTypeIds":[],"statuses":[],"tags":{},"tagMatch":null}',parentId:group?.parentId??parentId,parentName,color:group?.color??'',sortOrder:String(group?.sortOrder??0),tags:Object.entries(group?.tags??{}).map(([key,value])=>({key,value}))}}
export function prepareGroup(project:string,kind:GroupIntent['kind'],draft:GroupDraft,group?:DeviceGroup):GroupIntent{
 if(!groupUuid.test(project)||kind!=='create'&&(!group||!groupUuid.test(group.id)))invalid('设备组意图缺少当前范围')
 if(draft.parentId!==null&&!groupUuid.test(draft.parentId))invalid('请选择真实父组')
 const base={project,key:crypto.randomUUID()}
 if(kind==='delete')return Object.freeze({...base,kind,groupId:group!.id})
 if(!/^(0|[1-9]\d{0,9})$/.test(draft.sortOrder)||BigInt(draft.sortOrder)>2147483647n)invalid('排序必须为0至2147483647整数')
 if(kind==='move')return Object.freeze({...base,kind,groupId:group!.id,body:Object.freeze({parentId:draft.parentId,sortOrder:Number(draft.sortOrder),revision:group!.revision})})
 const name=draft.name.trim(),description=draft.description.trim()||null
 if(!name||name.length>128||name.includes('\0')||description!==null&&(description.length>500||description.includes('\0'))||draft.color&&!/^#[a-f\d]{6}$/i.test(draft.color))invalid('名称、描述或颜色不合法')
 const r=draft.type==='STATIC'?null:rule(parseDashboardRuntimeResponse(new TextEncoder().encode(draft.rule)))
 const body={name,description,type:draft.type,rule:r,parentId:draft.parentId,color:draft.color||null,tags:Object.freeze(Object.fromEntries(validateTagRows(draft.tags).map(row=>[row.key,row.value]))),sortOrder:Number(draft.sortOrder),...(group?{revision:group.revision}:{})}
 if(kind==='create')return Object.freeze({...base,kind,body:Object.freeze(body)})
 return Object.freeze({...base,kind,groupId:group!.id,body:Object.freeze({...body,revision:group!.revision})})
}
/** 原回执只按本次完整意图校验，不以同名列表或新时间戳推定受理。 */
export function groupMatchesIntent(group:DeviceGroup,intent:GroupIntent):boolean{
 if(intent.kind==='delete'||!intent.body)return false
 const body=intent.body
 if(group.parentId!==body.parentId||group.sortOrder!==body.sortOrder||group.revision!==(intent.kind==='create'?'0':String(BigInt(intent.body.revision)+1n)))return false
 if(intent.kind==='move')return group.id===intent.groupId
 const saved=body as Schema<'SaveDeviceGroupRequest'>
 const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).sort().join(',')}]`:value&&typeof value==='object'?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')}}`:JSON.stringify(value)
 return group.name===saved.name&&group.description===saved.description&&group.type===saved.type&&group.color===saved.color&&canonical(group.tags)===canonical(saved.tags)&&canonical(group.rule)===canonical(saved.rule)
}
function base(project:string){if(!groupUuid.test(project))invalid('项目范围不合法');return `/api/v1/projects/${project}` as const}
function groupPath(project:string,id:string){if(!groupUuid.test(id))invalid('设备组范围不合法');return `${base(project)}/device-groups/${id}` as const}
export const groupTransport:GroupTransport={
 async order(project,signal){const bytes=await api<Uint8Array>(`${base(project)}/device-group-order`,{signal,responseType:'bytes'});return decodeOrder(bytes)},
 async sort(project,items,signal){const bytes=await api<Uint8Array>(`${base(project)}/device-group-order`,{method:'put',body:{items},signal,responseType:'bytes'});try{return decodeOrder(bytes)}catch{throw new ApiError('排序回执未能核对，结果未知',200,undefined,undefined,true)}},
 async list(project,query,signal){if(query.parentId!==null&&!groupUuid.test(query.parentId)||!Number.isInteger(query.page)||query.page<1||query.page>1000000||!Number.isInteger(query.size)||query.size<1||query.size>100)invalid('设备组分页范围不合法');const bytes=await api<Uint8Array>(`${base(project)}/device-group-tree`,{query,signal,responseType:'bytes'});return decodeGroupPage(parseDashboardRuntimeResponse(bytes),query)},
 async read(project,id,signal){const bytes=await api<Uint8Array>(groupPath(project,id),{signal,responseType:'bytes',maxResponseBytes:64*1024});return decodeGroup(parseDashboardRuntimeResponse(bytes),id)},
 async write(intent,signal){
  if(intent.kind==='delete'){await api(groupPath(intent.project,intent.groupId!),{method:'delete',headers:{'Idempotency-Key':intent.key},signal});return}
  const options={body:intent.body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes' as const,maxResponseBytes:64*1024}
  const bytes=intent.kind==='create'?await api<Uint8Array>(`${base(intent.project)}/device-groups`,{...options,method:'post'}):intent.kind==='move'?await api<Uint8Array>(`${groupPath(intent.project,intent.groupId!)}/position`,{...options,method:'put'}):await api<Uint8Array>(groupPath(intent.project,intent.groupId!),{...options,method:'put'})
  try{return decodeGroup(parseDashboardRuntimeResponse(bytes),intent.groupId)}catch{throw new ApiError('设备组写回执未能核对，结果未知',intent.kind==='create'?201:200,undefined,undefined,true)}
 }
}
function decodeOrder(bytes:Uint8Array):DeviceGroup[]{const prefix=new TextEncoder().encode('{"items":'),wrapped=new Uint8Array(prefix.length+bytes.length+1);wrapped.set(prefix);wrapped.set(bytes,prefix.length);wrapped[wrapped.length-1]=125;const parsed=parseDashboardRuntimeResponse(wrapped),value=parsed.items;if(Object.keys(parsed).length!==1||!Array.isArray(value)||value.length>10000)invalid('设备组排序快照不完整');const groups=value.map(item=>decodeGroup(item));if(new Set(groups.map(group=>group.id)).size!==groups.length)invalid('设备组排序快照重复');return groups}
