import {readDefinitionTable,writeDefinitionTable,type DefinitionTablePort} from './model-definition-table-api'
import {readModelEditList,modelEditPath,modelEditHeaders,type ModelEditContext,type ModelEditList} from './model-edit-api'
import {decodeDefinitionRasterIcon,sameDefinitionRasterIcon,type DefinitionRasterIcon} from './definition-raster-icon'
import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonValue,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'
import {typeProfileId} from './profile-api'
import {commandStyleIconAllowed} from './function-style-icons'
import {validateCommandParameterOrder} from './command-parameter-schema'

type Response=Schema<'DeviceCommandDefinitionResponse'>
type Request=Schema<'SaveDeviceCommandDefinitionRequest'>
export type CommandPresentation=Readonly<Required<Omit<NonNullable<Schema<'DeviceCommandPresentationResponse'>>,'iconRaster'|'inputParameterOrder'|'outputParameterOrder'>>&{iconRaster?:DefinitionRasterIcon;inputParameterOrder?:readonly string[]|null;outputParameterOrder?:readonly string[]|null}>
export type CommandDefinition=Readonly<Omit<Response,'presentation'>&Required<Pick<Response,'id'|'deviceTypeId'|'commandKey'|'name'|'timeoutSeconds'|'sortOrder'>>&{presentation?:CommandPresentation|null}>
export type CommandDraft={name:string;commandKey:string;description:string;inputSchema:string;outputSchema:string;timeoutSeconds:string;sortOrder:number;iconId:string;color:string;iconRaster:DefinitionRasterIcon|null;presentationMode:'keep'|'replace'|'clear';inputParameterOrder:string[]|null;outputParameterOrder:string[]|null}
export type CommandIntent=Readonly<{project:string;typeId:string;id?:string;kind:'create'|'update'|'delete';key:string;modelEdit?:ModelEditContext;body?:Readonly<Request>;label:string;expectedPresentation?:CommandPresentation|null}>
export type CommandTransport=DefinitionTablePort<CommandDefinition>&{publishedList?:(project:string,typeId:string,signal:AbortSignal)=>Promise<ModelEditList<CommandDefinition>>;list:(project:string,typeId:string,signal:AbortSignal)=>Promise<readonly CommandDefinition[]>;write:(intent:CommandIntent,signal:AbortSignal)=>Promise<CommandDefinition|undefined>}
function invalid():never{throw new Error('命令定义资料不完整或范围不符，请重新读取')}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))invalid();return value as StrictJsonObject}
/** 样式与参数顺序独立保留；旧响应省略顺序时不重建历史意图。 */
export function decodeCommandPresentation(value:StrictJsonValue|undefined,strict=true):CommandPresentation|null{
 if(value==null)return null
 const raw=object(value),iconId=raw.iconId??null,color=raw.color??null,iconRaster=decodeDefinitionRasterIcon(raw.iconRaster)
 if(iconRaster&&(iconId!==null||color!==null))invalid()
 if(strict&&(!Object.hasOwn(raw,'iconId')||!Object.hasOwn(raw,'color')))invalid()
 if(Object.keys(raw).some(key=>!['iconId','color','iconRaster','inputParameterOrder','outputParameterOrder'].includes(key))||iconId!==null&&!commandStyleIconAllowed(iconId)||color!==null&&(typeof color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(color)))invalid()
 const orders:{inputParameterOrder?:readonly string[];outputParameterOrder?:readonly string[]}={}
 for(const key of ['inputParameterOrder','outputParameterOrder'] as const){const order=raw[key];if(order==null)continue;if(!Array.isArray(order)||order.length>100||order.some(value=>typeof value!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(value))||new Set(order).size!==order.length)invalid();orders[key]=Object.freeze([...order]) as readonly string[]}
 return iconId===null&&color===null&&!iconRaster&&!Object.keys(orders).length?null:Object.freeze({iconId:iconId as CommandPresentation['iconId'],color:typeof color==='string'?color.toLowerCase():null,...(iconRaster?{iconRaster}:{}),...orders})
}
function sameOrder(a:readonly string[]|null|undefined,b:readonly string[]|null|undefined){return a==null&&b==null||!!a&&!!b&&a.length===b.length&&a.every((key,index)=>key===b[index])}
function samePresentation(a:CommandPresentation|null|undefined,b:CommandPresentation|null|undefined){return(a?.iconId??null)===(b?.iconId??null)&&(a?.color??null)===(b?.color??null)&&sameDefinitionRasterIcon(a?.iconRaster,b?.iconRaster)&&sameOrder(a?.inputParameterOrder,b?.inputParameterOrder)&&sameOrder(a?.outputParameterOrder,b?.outputParameterOrder)}
function integer(value:StrictJsonValue|undefined,min:number,max:number){if(value===undefined||!isStrictJsonNumber(value)||!/^\d+$/.test(value.lexical))invalid();const result=Number(value.lexical);if(!Number.isSafeInteger(result)||result<min||result>max)invalid();return result}
function text(value:StrictJsonValue|undefined,max:number){if(value==null)return undefined;if(typeof value!=='string'||value.length>max)invalid();return value}
function definition(value:StrictJsonValue,typeId:string):CommandDefinition{
 const raw=object(value)
 if(!typeProfileId(raw.id)||raw.deviceTypeId!==typeId||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>128||typeof raw.commandKey!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(raw.commandKey))invalid()
 const presentation=decodeCommandPresentation(raw.presentation),inputSchema=text(raw.inputSchema,65536),outputSchema=text(raw.outputSchema,65536)
 try{validateCommandParameterOrder(presentation?.inputParameterOrder,inputSchema);validateCommandParameterOrder(presentation?.outputParameterOrder,outputSchema)}catch{invalid()}
 return Object.freeze({id:raw.id,deviceTypeId:typeId,name:raw.name,commandKey:raw.commandKey,description:text(raw.description,500),inputSchema,outputSchema,timeoutSeconds:integer(raw.timeoutSeconds,1,86400),sortOrder:integer(raw.sortOrder,0,2147483647),createdAt:text(raw.createdAt,64),presentation})
}
export function decodeCommand(bytes:Uint8Array,typeId:string,id?:string){if(!typeProfileId(typeId))invalid();const value=definition(parseDashboardRuntimeResponse(bytes),typeId);if(id!==undefined&&value.id!==id)invalid();return value}
export function decodeCommandList(bytes:Uint8Array,typeId:string):readonly CommandDefinition[]{
 if(bytes.byteLength>2*1024*1024||!typeProfileId(typeId))invalid()
 const prefix=new TextEncoder().encode('{"items":'),wrapped=new Uint8Array(prefix.length+bytes.length+1);wrapped.set(prefix);wrapped.set(bytes,prefix.length);wrapped[wrapped.length-1]=125
 const values=parseDashboardRuntimeResponse(wrapped).items;if(!Array.isArray(values))invalid()
 const rows=values.map(value=>definition(value,typeId));if(new Set(rows.map(row=>row.id)).size!==rows.length||new Set(rows.map(row=>row.commandKey)).size!==rows.length)invalid();return Object.freeze(rows)
}
export function commandDraft(value?:CommandDefinition):CommandDraft{return{name:value?.name||'',commandKey:value?.commandKey||'',description:value?.description||'',inputSchema:value?.inputSchema||'',outputSchema:value?.outputSchema||'',timeoutSeconds:String(value?.timeoutSeconds??30),sortOrder:value?.sortOrder??0,iconId:value?.presentation?.iconId||'',color:value?.presentation?.color||'',iconRaster:value?.presentation?.iconRaster??null,presentationMode:'keep',inputParameterOrder:value?.presentation?.inputParameterOrder?[...value.presentation.inputParameterOrder]:null,outputParameterOrder:value?.presentation?.outputParameterOrder?[...value.presentation.outputParameterOrder]:null}}
/** 副本沿用完整Schema原文与超时，只清空新键，不沿用原命令ID。 */
export function commandCopyDraft(value:CommandDefinition):CommandDraft{return{...commandDraft(value),commandKey:'',presentationMode:'replace'}}
/** 只校验JSON语法及Schema根对象；实际支持的约束继续由既有命令服务校验。 */
function schemaInput(value:string){const normalized=value.trim();if(!normalized)return undefined;if(value.length>65536)throw new Error('每份参数 Schema 最多65536字符');parseDashboardRuntimeResponse(new TextEncoder().encode(normalized));return normalized}
export function prepareCommand(project:string,typeId:string,draft:CommandDraft,existing?:CommandDefinition):CommandIntent{
 if(!typeProfileId(project)||!typeProfileId(typeId)||existing&&(existing.deviceTypeId!==typeId||!typeProfileId(existing.id)))invalid()
 const name=draft.name.trim(),commandKey=draft.commandKey.trim(),description=draft.description.trim()
 if(!name||name.length>128||!/^[A-Za-z0-9_-]{1,64}$/.test(commandKey))throw new Error('请填写命令名称及1至64位字母、数字、下划线或横线标识符')
 if(draft.description.length>500)throw new Error('命令描述最多500字符')
 if(!/^\d{1,5}$/.test(draft.timeoutSeconds)||Number(draft.timeoutSeconds)<1||Number(draft.timeoutSeconds)>86400)throw new Error('超时必须为1至86400秒的整数')
 if(!Number.isInteger(draft.sortOrder)||draft.sortOrder<0||draft.sortOrder>2147483647)invalid()
 const inputSchema=schemaInput(draft.inputSchema),outputSchema=schemaInput(draft.outputSchema)
 validateCommandParameterOrder(draft.inputParameterOrder,inputSchema);validateCommandParameterOrder(draft.outputParameterOrder,outputSchema)
 const orderChanged=!sameOrder(draft.inputParameterOrder,existing?.presentation?.inputParameterOrder)||!sameOrder(draft.outputParameterOrder,existing?.presentation?.outputParameterOrder)
 const orderFields={...(draft.inputParameterOrder!==null||existing?.presentation?.inputParameterOrder!=null?{inputParameterOrder:draft.inputParameterOrder===null?null:[...draft.inputParameterOrder]}:{}),...(draft.outputParameterOrder!==null||existing?.presentation?.outputParameterOrder!=null?{outputParameterOrder:draft.outputParameterOrder===null?null:[...draft.outputParameterOrder]}:{})}
 const presentation=draft.presentationMode==='keep'&&!orderChanged?undefined:draft.presentationMode==='clear'&&draft.inputParameterOrder===null&&draft.outputParameterOrder===null?null:decodeCommandPresentation(parseDashboardRuntimeResponse(new TextEncoder().encode(JSON.stringify({iconId:draft.iconId||null,color:draft.color||null,...(draft.iconRaster?{iconRaster:draft.iconRaster}:{}),...orderFields}))))
 const presentationBody:Request['presentation']=presentation===undefined?undefined:presentation===null?null:{iconId:presentation.iconId,color:presentation.color,...(presentation.iconRaster?{iconRaster:presentation.iconRaster}:{}),...orderFields}

 const body=Object.freeze({name,commandKey,description:description||undefined,inputSchema,outputSchema,timeoutSeconds:Number(draft.timeoutSeconds),sortOrder:draft.sortOrder,...(presentationBody===undefined?{}:{presentation:presentationBody})})
 return Object.freeze({project,typeId,id:existing?.id,kind:existing?'update':'create',key:crypto.randomUUID(),body,label:name,expectedPresentation:presentation===undefined?existing?.presentation??null:presentation})
}
export function prepareCommandDelete(project:string,typeId:string,value:CommandDefinition):CommandIntent{if(!typeProfileId(project)||!typeProfileId(typeId)||value.deviceTypeId!==typeId||!typeProfileId(value.id))invalid();return Object.freeze({project,typeId,id:value.id,kind:'delete',key:crypto.randomUUID(),label:value.name})}
/** 比较服务端规范化Schema时保留数字精度，不把大整数转换为JS浮点。 */
function decimal(value:string){const [coefficient,exponent='0']=value.toLowerCase().split('e'),negative=coefficient!.startsWith('-'),[whole,fraction='']=coefficient!.replace(/^-/,'').split('.');let digits=(whole!+fraction).replace(/^0+/,'');if(!digits)return'0';let power=BigInt(exponent)-BigInt(fraction.length);const suffix=digits.length-digits.replace(/0+$/,'').length;digits=digits.replace(/0+$/,'');power+=BigInt(suffix);return`${negative?'-':''}${digits}e${power}`}
function semantic(value:StrictJsonValue):string{if(isStrictJsonNumber(value))return'#'+decimal(value.lexical);if(Array.isArray(value))return'['+value.map(semantic).join(',')+']';if(value&&typeof value==='object')return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+semantic((value as StrictJsonObject)[key]!)).join(',')+'}';return JSON.stringify(value)}
function schemaEqual(left:string|undefined,right:string|undefined){return left===right||!!left&&!!right&&semantic(parseDashboardRuntimeResponse(new TextEncoder().encode(left)))===semantic(parseDashboardRuntimeResponse(new TextEncoder().encode(right)))}
export function commandMatches(value:CommandDefinition,intent:CommandIntent){const body=intent.body;return!!body&&value.deviceTypeId===intent.typeId&&(!intent.id||value.id===intent.id)&&value.name===body.name&&value.commandKey===body.commandKey&&(value.description||undefined)===body.description&&value.timeoutSeconds===body.timeoutSeconds&&value.sortOrder===body.sortOrder&&schemaEqual(value.inputSchema,body.inputSchema)&&schemaEqual(value.outputSchema,body.outputSchema)&&samePresentation(value.presentation,intent.expectedPresentation)}
const path=(project:string,typeId:string)=>{if(!typeProfileId(project)||!typeProfileId(typeId))invalid();return `/api/v1/projects/${project}/device-types/${typeId}/commands` as const}
export const commandTransport:CommandTransport={
 definitionList:(project,typeId,signal)=>readDefinitionTable(project,typeId,'commands',decodeCommandList,signal),
 tableWrite:(intent,signal)=>writeDefinitionTable(intent,decodeCommandList,signal),
 publishedList:(project,typeId,signal)=>readModelEditList(project,typeId,'commands',decodeCommandList,signal),
 async list(project,typeId,signal){return decodeCommandList(await api<Uint8Array>(path(project,typeId),{signal,responseType:'bytes',maxResponseBytes:2*1024*1024}),typeId)},
 async write(intent,signal){const route=intent.modelEdit?(`${modelEditPath(intent.project,intent.typeId)}/commands` as const):path(intent.project,intent.typeId);const headers={'Idempotency-Key':intent.key,...modelEditHeaders(intent.modelEdit,intent.typeId)};if(intent.kind==='delete'){await api(`${route}/${intent.id}`,{method:'delete',headers,signal});return}const bytes=intent.kind==='create'?await api<Uint8Array>(route,{method:'post',body:intent.body,headers,signal,responseType:'bytes'}):await api<Uint8Array>(`${route}/${intent.id}`,{method:'put',body:intent.body,headers,signal,responseType:'bytes'});return decodeCommand(bytes,intent.typeId,intent.id)},
}
