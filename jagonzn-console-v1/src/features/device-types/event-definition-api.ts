import {readDefinitionTable,writeDefinitionTable,type DefinitionTablePort} from './model-definition-table-api'
import {readModelEditList,modelEditPath,modelEditHeaders,type ModelEditContext,type ModelEditList} from './model-edit-api'
import {decodeDefinitionRasterIcon,sameDefinitionRasterIcon,type DefinitionRasterIcon} from './definition-raster-icon'
import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from './type-devices-api'
import {eventStyleIconAllowed} from './function-style-icons'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonValue,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'
type Request=Schema<'SaveDeviceEventDefinitionRequest'>
type ParameterRequest=NonNullable<Request['parameters']>[number]&{schema?:string|null;description?:string|null}
type Response=Schema<'DeviceEventDefinitionResponse'>
type ParameterResponse=NonNullable<Response['parameters']>[number]
export const eventLevels=[['INFO','信息'],['SUCCESS','成功'],['WARNING','警告'],['ERROR','故障']] as const
export const eventParameterTypes=[['NUMBER','Number（数值）'],['TEXT','Text（文本）'],['SWITCH','Switch（开关）'],['ENUM','Enum（枚举）'],['OBJECT','Object（对象）'],['LIST','List（列表）']] as const
export type EventPresentation=Readonly<Required<Omit<Schema<'DeviceEventPresentationDto'>,'iconRaster'>>&{iconRaster?:DefinitionRasterIcon}>
export type EventParameter=Readonly<Required<Omit<ParameterResponse,'enumOptions'|'schema'|'description'|'compositeProfile'>>&{enumOptions:readonly string[];schema:string|null;description:string|null;compositeProfile?:ParameterResponse['compositeProfile']|null}>
export type EventDefinition=Readonly<Required<Omit<Response,'description'|'parameters'|'presentation'>>&{description:string|null;parameters:readonly EventParameter[];presentation:EventPresentation|null}>
export type EventParameterDraft={parameterKey:string;name:string;dataType:string;required:boolean;enumOptions:string[];sortOrder:number;schema:string;description:string;compositeProfile?:ParameterResponse['compositeProfile']|null}
export type EventDraft={eventKey:string;name:string;level:string;description:string;sortOrder:number;parameters:EventParameterDraft[];iconId:string;color:string;iconRaster:DefinitionRasterIcon|null;presentationMode:'keep'|'replace'|'clear'}
export type EventIntent=Readonly<{project:string;typeId:string;id?:string;kind:'create'|'update'|'delete';key:string;modelEdit?:ModelEditContext;body?:Omit<Request,'parameters'|'presentation'>&{parameters:ParameterRequest[];presentation?:EventPresentation|null};label:string;expectedPresentation?:EventPresentation|null}>
export type EventDefinitionTransport=DefinitionTablePort<EventDefinition>&{publishedList?:(project:string,typeId:string,signal:AbortSignal)=>Promise<ModelEditList<EventDefinition>>;list:(project:string,typeId:string,signal:AbortSignal)=>Promise<readonly EventDefinition[]>;write:(intent:EventIntent,signal:AbortSignal)=>Promise<EventDefinition|undefined>}
function invalid():never{throw new Error('事件定义资料不完整、超出读取范围或类型尚未接入，请重新读取')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return value as Record<string,unknown>}
function integer(value:unknown):value is number{return Number.isInteger(value)&&Number(value)>=0&&Number(value)<=2147483647}
function name(value:unknown,max:number):value is string{return typeof value==='string'&&!!value.trim()&&value.length<=max}
function key(value:unknown):value is string{return typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value)}
function options(value:unknown,dataType:unknown):readonly string[]{
 if(value===undefined||value===null)value=[]
 if(!Array.isArray(value)||value.length>100||value.some(item=>typeof item!=='string'||!item.trim()||Array.from(item).length>64||/[\u0000-\u001f\u007f-\u009f]/.test(item))||new Set(value).size!==value.length||dataType==='ENUM'&&!value.length||dataType!=='ENUM'&&value.length)invalid()
 return Object.freeze([...value]) as readonly string[]
}
function presentation(value:unknown,strict=false):EventPresentation|null{
 if(value==null)return null
 const raw=object(value),iconId=raw.iconId??null,color=raw.color??null,iconRaster=decodeDefinitionRasterIcon(raw.iconRaster)
 if(iconRaster&&(iconId!==null||color!==null))invalid()
 if(strict&&(Object.keys(raw).length!==(Object.hasOwn(raw,'iconRaster')?3:2)||!Object.hasOwn(raw,'iconId')||!Object.hasOwn(raw,'color')))invalid()
 if(Object.keys(raw).some(key=>!['iconId','color','iconRaster'].includes(key))||iconId!==null&&!eventStyleIconAllowed(iconId)||color!==null&&(typeof color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(color)))invalid()
 return iconId===null&&color===null&&!iconRaster?null:Object.freeze({iconId:iconId as EventPresentation['iconId'],color:typeof color==='string'?color.toLowerCase():null,...(iconRaster?{iconRaster}:{})})
}
export function decodeEventPresentation(value:unknown){return presentation(value,true)}
/** 仅语法、重复键和根型在界面检查；完整受限Schema由同一后端内核负责。 */
export const eventBasicObjectSchema='{"type":"object","maxProperties":64}'
function schemaInput(value:unknown,type:unknown,profile?:unknown):string|null{
 if(profile!=null&&profile!=='BASIC_MIXED_OBJECT_V1'||profile!=null&&type!=='OBJECT')invalid()
 if(type!=='OBJECT'&&type!=='LIST'){if(value!=null&&value!=='')invalid();return null}
 if(typeof value!=='string'||!value||value.length>65536||new TextEncoder().encode(value).length>65536)throw new Error('复合参数必须填写不超过64KiB的受限JSON Schema')
 const root=parseDashboardRuntimeResponse(new TextEncoder().encode(value));if(profile!=null&&(Object.keys(root).length!==2||root.type!=='object'||!isStrictJsonNumber(root.maxProperties!)||root.maxProperties.lexical!=='64'))invalid();if(root.type!==(type==='OBJECT'?'object':'array'))throw new Error('参数Schema根类型与数据类型不符');return value
}
function definition(value:unknown,typeId:string):EventDefinition{
 const raw=object(value)
 if(Object.keys(raw).some(key=>!['id','deviceTypeId','eventKey','name','level','description','sortOrder','parameters','createdAt','presentation'].includes(key))||!typeDeviceUuid.test(String(raw.id))||raw.deviceTypeId!==typeId||!key(raw.eventKey)||!name(raw.name,128)||!eventLevels.some(([level])=>level===raw.level)||!integer(raw.sortOrder)||!(raw.description==null||typeof raw.description==='string'&&raw.description.length<=500)||typeof raw.createdAt!=='string'||!Number.isFinite(Date.parse(raw.createdAt))||!Array.isArray(raw.parameters)||raw.parameters.length>100)invalid()
 const parameters=raw.parameters.map(value=>{const parameter=object(value)
  if(Object.keys(parameter).some(key=>!['id','parameterKey','name','dataType','required','enumOptions','sortOrder','schema','description','compositeProfile'].includes(key))||!typeDeviceUuid.test(String(parameter.id))||!key(parameter.parameterKey)||!name(parameter.name,128)||!eventParameterTypes.some(([type])=>type===parameter.dataType)||typeof parameter.required!=='boolean'||!integer(parameter.sortOrder))invalid()
  if(!(parameter.description==null||typeof parameter.description==='string'&&parameter.description.length<=512))invalid()
  return Object.freeze({...parameter,enumOptions:options(parameter.enumOptions,parameter.dataType),schema:schemaInput(parameter.schema,parameter.dataType,parameter.compositeProfile),description:parameter.description??null,compositeProfile:parameter.compositeProfile??null}) as EventParameter
 })
 if(new Set(parameters.map(value=>value.id)).size!==parameters.length||new Set(parameters.map(value=>value.parameterKey)).size!==parameters.length)invalid()
 return Object.freeze({...raw,description:raw.description??null,parameters:Object.freeze(parameters),presentation:presentation(raw.presentation,true)}) as EventDefinition
}
export function decodeEventDefinitions(value:unknown,typeId:string):readonly EventDefinition[]{
 if(!typeDeviceUuid.test(typeId)||!Array.isArray(value)||value.length>1000)invalid()
 const result=value.map(item=>definition(item,typeId))
 if(new Set(result.map(item=>item.id)).size!==result.length||new Set(result.map(item=>item.eventKey)).size!==result.length)invalid()
 return Object.freeze(result)
}
export function eventDraft(value?:EventDefinition):EventDraft{return{eventKey:value?.eventKey||'',name:value?.name||'',level:value?.level||'INFO',description:value?.description||'',sortOrder:value?.sortOrder||0,parameters:value?value.parameters.map(parameter=>({parameterKey:parameter.parameterKey,name:parameter.name,dataType:parameter.dataType,required:parameter.required,enumOptions:[...parameter.enumOptions],sortOrder:parameter.sortOrder,schema:parameter.schema||'',description:parameter.description||'',compositeProfile:parameter.compositeProfile??undefined})):[],iconId:value?.presentation?.iconId||'',color:value?.presentation?.color||'',iconRaster:value?.presentation?.iconRaster??null,presentationMode:'keep'}}
/** 副本保留完整可编辑资料，清空新键且不携带事件或参数的原资源ID。 */
export function eventCopyDraft(value:EventDefinition):EventDraft{return{...eventDraft(value),eventKey:'',presentationMode:'replace'}}
/** 新选择Object直接承接源站通用对象；已有严格结构只在明确旧编辑上下文保留。 */
export function eventParameterForType(value:EventParameterDraft,dataType:string,preserveExistingObjectStructure=false):EventParameterDraft{
 if(dataType==='OBJECT'&&!preserveExistingObjectStructure)return{...value,dataType,compositeProfile:'BASIC_MIXED_OBJECT_V1',schema:eventBasicObjectSchema}
 return{...value,dataType,compositeProfile:value.compositeProfile===undefined?undefined:null}
}
export function normalizeEventParameter(value:EventParameterDraft):ParameterRequest{
 const parameterKey=value.parameterKey.trim(),parameterName=value.name.trim()
 if(!key(parameterKey)||!name(parameterName,128)||!eventParameterTypes.some(([type])=>type===value.dataType)||typeof value.required!=='boolean'||!integer(value.sortOrder))throw new Error('请填写参数名称和合法标识符，并选择已支持的数据类型')
 const enumOptions=options(value.enumOptions.map(item=>item.trim()),value.dataType)
 if(typeof value.description!=='string'||value.description.length>512)throw new Error('参数说明最多512字符')
 if(value.compositeProfile!=null&&value.dataType!=='OBJECT')invalid()
 const schema=['OBJECT','LIST'].includes(value.dataType)?schemaInput(value.schema,value.dataType,value.compositeProfile):null
 return Object.freeze({parameterKey,name:parameterName,dataType:value.dataType as ParameterRequest['dataType'],required:value.required,sortOrder:value.sortOrder,enumOptions:value.dataType==='ENUM'?[...enumOptions]:undefined,schema,description:value.description.trim()||null,...(value.compositeProfile===undefined?{}:{compositeProfile:value.compositeProfile})})
}
export function prepareEvent(project:string,typeId:string,draft:EventDraft,existing?:EventDefinition):EventIntent{
 if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId)||existing&&(existing.deviceTypeId!==typeId||!typeDeviceUuid.test(existing.id)))invalid()
 const eventKey=draft.eventKey.trim(),eventName=draft.name.trim()
 if(!key(eventKey)||!name(eventName,128)||!eventLevels.some(([level])=>level===draft.level)||typeof draft.description!=='string'||draft.description.length>500||!integer(draft.sortOrder)||draft.parameters.length>100)throw new Error('请检查事件名称、标识符、级别和描述；参数最多100项')
 const parameters=draft.parameters.map(normalizeEventParameter)
 if(new Set(parameters.map(value=>value.parameterKey)).size!==parameters.length)throw new Error('事件参数标识符不能重复')
 const style=draft.presentationMode==='keep'?undefined:draft.presentationMode==='clear'?null:presentation({iconId:draft.iconId||null,color:draft.color||null,...(draft.iconRaster?{iconRaster:draft.iconRaster}:{})})
 const body=Object.freeze({eventKey,name:eventName,level:draft.level as Request['level'],description:draft.description.trim()||undefined,sortOrder:draft.sortOrder,parameters:Object.freeze(parameters) as unknown as ParameterRequest[],...(style===undefined?{}:{presentation:style})})
 return Object.freeze({project,typeId,id:existing?.id,kind:existing?'update':'create',key:crypto.randomUUID(),body,label:eventName,expectedPresentation:style===undefined?existing?.presentation??null:style})
}
export function prepareEventDelete(project:string,typeId:string,value:EventDefinition):EventIntent{if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId)||value.deviceTypeId!==typeId||!typeDeviceUuid.test(value.id))invalid();return Object.freeze({project,typeId,id:value.id,kind:'delete',key:crypto.randomUUID(),label:value.name})}
function decimal(value:string){const [coefficient,exponent='0']=value.toLowerCase().split('e'),negative=coefficient!.startsWith('-'),[whole,fraction='']=coefficient!.replace(/^-/,'').split('.');let digits=(whole!+fraction).replace(/^0+/,'');if(!digits)return'0';let power=BigInt(exponent)-BigInt(fraction.length);const suffix=digits.length-digits.replace(/0+$/,'').length;digits=digits.replace(/0+$/,'');power+=BigInt(suffix);return`${negative?'-':''}${digits}e${power}`}
function semantic(value:StrictJsonValue):string{if(isStrictJsonNumber(value))return'#'+decimal(value.lexical);if(Array.isArray(value))return'['+value.map(semantic).join(',')+']';if(value&&typeof value==='object')return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+semantic((value as StrictJsonObject)[key]!)).join(',')+'}';return JSON.stringify(value)}
function sameSchema(left:string|null,right:string|null|undefined){return left===(right??null)||!!left&&!!right&&semantic(parseDashboardRuntimeResponse(new TextEncoder().encode(left)))===semantic(parseDashboardRuntimeResponse(new TextEncoder().encode(right)))}
export function eventMatches(value:EventDefinition,intent:EventIntent){
 const body=intent.body;if(!body||value.deviceTypeId!==intent.typeId||intent.id&&value.id!==intent.id)return false
 const parameters=body.parameters||[]
 return value.eventKey===body.eventKey&&value.name===body.name&&value.level===body.level&&value.description===(body.description||null)&&value.sortOrder===body.sortOrder&&JSON.stringify(value.presentation)===JSON.stringify(intent.expectedPresentation??null)&&value.parameters.length===parameters.length&&parameters.every(expected=>value.parameters.some(actual=>actual.parameterKey===expected.parameterKey&&actual.name===expected.name&&actual.dataType===expected.dataType&&actual.required===expected.required&&actual.sortOrder===expected.sortOrder&&JSON.stringify(actual.enumOptions)===JSON.stringify(expected.enumOptions||[])&&sameSchema(actual.schema,expected.schema)&&(actual.compositeProfile??null)===(expected.compositeProfile??null)&&actual.description===(expected.description??null)))
}
function base(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))invalid();return `/api/v1/projects/${project}/device-types/${typeId}/events` as const}
export const eventDefinitionTransport:EventDefinitionTransport={
 definitionList:(project,typeId,signal)=>readDefinitionTable(project,typeId,'events',(bytes,typeId)=>decodeEventDefinitions(JSON.parse(new TextDecoder().decode(bytes)),typeId),signal),
 tableWrite:(intent,signal)=>writeDefinitionTable(intent,(bytes,typeId)=>decodeEventDefinitions(JSON.parse(new TextDecoder().decode(bytes)),typeId),signal),
 publishedList:(project,typeId,signal)=>readModelEditList(project,typeId,'events',(bytes,typeId)=>decodeEventDefinitions(JSON.parse(new TextDecoder().decode(bytes)),typeId),signal),
 async list(project,typeId,signal){return decodeEventDefinitions(await api<unknown>(base(project,typeId),{signal,maxResponseBytes:4*1024*1024}),typeId)},
 async write(intent,signal){
  const route=intent.modelEdit?(`${modelEditPath(intent.project,intent.typeId)}/events` as const):base(intent.project,intent.typeId)
  const headers={'Idempotency-Key':intent.key,...modelEditHeaders(intent.modelEdit,intent.typeId)},options={headers,signal,maxResponseBytes:4*1024*1024}
  const value=intent.kind==='create'
   ?await api<unknown>(route,{...options,method:'post',body:intent.body})
   :intent.kind==='update'
    ?await api<unknown>(`${route}/${intent.id}`,{...options,method:'put',body:intent.body})
    :await api<unknown>(`${route}/${intent.id}`,{...options,method:'delete'})
  if(intent.kind==='delete'){if(value!==undefined)throw new ApiError('事件删除回执不完整，结果尚未确认',0,undefined,undefined,true);return undefined}
  return definition(value,intent.typeId)
 }
}
