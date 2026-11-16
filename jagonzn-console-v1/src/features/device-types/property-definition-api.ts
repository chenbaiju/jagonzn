import {readDefinitionTable,writeDefinitionTable,type DefinitionTablePort} from './model-definition-table-api'
import {readModelEditList,modelEditPath,modelEditHeaders,type ModelEditContext,type ModelEditList} from './model-edit-api'
import type {DefinitionRasterIcon} from './definition-raster-icon'
import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonValue,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'
import {readNumberDraft} from '../devices/single-property-number'
import {typeProfileId} from './profile-api'
import {decodePropertyPresentation,normalizePropertyPresentation,samePropertyPresentation,type PropertyPresentation} from './property-presentation'
import {readObjectFields,objectFieldsSchema,type ObjectFieldDraft} from './property-object-fields'

type Response=Schema<'DevicePropertyDefinitionResponse'>
type Request=Schema<'SaveDevicePropertyDefinitionRequest'>
/** 数值边界在界面中保留词法，HTTP仍提交正式合同的JSON number。 */
export type PropertySwitchEncoding=NonNullable<Request['switchEncoding']>
export type PropertyCompositeProfile=NonNullable<Request['compositeProfile']>
export type PropertyDefinition=Readonly<Omit<Response,'minimumValue'|'maximumValue'|'defaultValue'|'numericStep'|'textDefaultValue'|'description'|'presentation'|'compositeProfile'>&Required<Pick<Response,'id'|'deviceTypeId'|'name'|'propertyKey'|'accessType'|'dataType'|'sortOrder'>>&{minimumValue?:string;maximumValue?:string;defaultValue?:string;numericStep?:string;textDefaultValue?:NonNullable<Response['textDefaultValue']>;description?:string;presentation?:PropertyPresentation|null;switchEncoding?:PropertySwitchEncoding|null;compositeProfile?:PropertyCompositeProfile|null}>
export type PropertyDraft={name:string;propertyKey:string;accessType:string;dataType:string;unit:string;precision:string;numericStep:string;textDefaultValue:Exclude<Request['textDefaultValue'],undefined>;minimum:string;maximum:string;enumText:string;enumRows:{value:string;description:string}[];onLabel:string;offLabel:string;switchEncoding:string;compositeProfile:string;listMinimum:string;listMaximum:string;schema:string;sortOrder:number;description:string;defaultValue:string;iconId:string;color:string;iconRaster:DefinitionRasterIcon|null;presentationMode:'keep'|'replace'|'clear';objectMode:'form'|'json';objectRows:ObjectFieldDraft[];objectChanged:boolean;objectPresentation:Record<string,{name:string;description:string|null}>}
type Body=Readonly<Omit<Request,'minimumValue'|'maximumValue'|'defaultValue'|'numericStep'|'textDefaultValue'|'presentation'|'compositeProfile'>&{minimumValue?:string;maximumValue?:string;defaultValue:string|null;numericStep:string|null;textDefaultValue:Exclude<Request['textDefaultValue'],undefined>;presentation?:PropertyPresentation|null;switchEncoding?:PropertySwitchEncoding|null;compositeProfile?:PropertyCompositeProfile|null}>
export type PropertyIntent=Readonly<{project:string;typeId:string;id?:string;kind:'create'|'update'|'delete';key:string;modelEdit?:ModelEditContext;body?:Body;rawBody?:string;label:string;expectedPresentation?:PropertyPresentation|null}>
export type PropertyTransport=DefinitionTablePort<PropertyDefinition>&{publishedList?:(project:string,typeId:string,signal:AbortSignal)=>Promise<ModelEditList<PropertyDefinition>>;list:(project:string,typeId:string,signal:AbortSignal)=>Promise<readonly PropertyDefinition[]>;write:(intent:PropertyIntent,signal:AbortSignal)=>Promise<PropertyDefinition|undefined>}
export const propertyAccess=[['REPORT','设备上报'],['DOWNLINK','云端下发'],['SHARED','设备云端共享'],['CLOUD_PRIVATE','云端私有']] as const
export const propertyTypes=[['NUMBER','Number（数值）'],['SWITCH','Switch（开关）'],['TEXT','Text（文本）'],['ENUM','Enum（枚举）'],['OBJECT','Object（对象）'],['LIST','List（列表）'],['DAILY_TIMER','DailyTimer（每日定时器）'],['DAILY_TIMER_RANGE','DailyTimerRange（每日定时区间）'],['DAILY_TIMER_DURATION','DailyTimerDuration（每日定时时长）'],['DAILY_TIMER_INTERVAL','DailyTimerInterval（每日间歇定时）'],['DAILY_TIMER_LIST','DailyTimerList（每日定时器列表）'],['DAILY_TIMER_RANGE_LIST','DailyTimerRangeList（每日定时区间列表）'],['DAILY_TIMER_DURATION_LIST','DailyTimerDurationList（每日定时时长列表）'],['DAILY_TIMER_INTERVAL_LIST','DailyTimerIntervalList（每日间歇定时列表）']] as const
export const propertySwitchEncodings=[['BOOLEAN','Boolean（true / false）'],['NUMBER','Number（1 / 0）'],['TEXT','Text（ON / OFF）']] as const
function invalid():never{throw new Error('属性定义资料不完整或范围不符，请重新读取')}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))invalid();return value as StrictJsonObject}
function integer(value:StrictJsonValue|undefined,max:number){if(value===undefined||value===null)return undefined;if(!isStrictJsonNumber(value)||!/^\d+$/.test(value.lexical))invalid();const result=Number(value.lexical);if(!Number.isSafeInteger(result)||result>max)invalid();return result}
function text(value:StrictJsonValue|undefined,max:number){if(value===undefined||value===null)return undefined;if(typeof value!=='string'||value.length>max)invalid();return value}
function numeric(value:StrictJsonValue|undefined){if(value===undefined||value===null)return undefined;if(!isStrictJsonNumber(value))invalid();return value.lexical}
function definition(value:StrictJsonValue,typeId:string):PropertyDefinition{
 const raw=object(value),sortOrder=integer(raw.sortOrder,2147483647)
 if(!typeProfileId(raw.id)||raw.deviceTypeId!==typeId||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>128||typeof raw.propertyKey!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(raw.propertyKey)
  ||!['UNDEFINED',...propertyAccess.map(([key])=>key)].includes(String(raw.accessType))||!propertyTypes.some(([key])=>key===raw.dataType)||sortOrder===undefined)invalid()
 if(['DAILY_TIMER','DAILY_TIMER_RANGE','DAILY_TIMER_DURATION','DAILY_TIMER_INTERVAL','DAILY_TIMER_LIST','DAILY_TIMER_RANGE_LIST','DAILY_TIMER_DURATION_LIST','DAILY_TIMER_INTERVAL_LIST'].includes(String(raw.dataType))&&(raw.accessType!=='CLOUD_PRIVATE'||['unit','decimalPlaces','minimumValue','maximumValue','onLabel','offLabel','schema','defaultValue','numericStep','textDefaultValue','switchEncoding','compositeProfile'].some(k=>raw[k]!=null)||raw.enumOptions!=null&&(!Array.isArray(raw.enumOptions)||raw.enumOptions.length)))invalid()
 const encoding=raw.switchEncoding
 if(encoding!=null&&(!propertySwitchEncodings.some(([key])=>key===encoding)||raw.dataType!=='SWITCH'))invalid()
 const composite=raw.compositeProfile
 if(composite!=null&&(composite!=='BASIC_MIXED_LIST_V1'||raw.dataType!=='LIST'))invalid()
 const switchEncoding=raw.dataType==='SWITCH'?(encoding??'BOOLEAN') as PropertySwitchEncoding:undefined
 const numericStep=numeric(raw.numericStep),textDefaultValue=text(raw.textDefaultValue,4096)
 if(numericStep!==undefined&&(raw.dataType!=='NUMBER'||!positiveNumber(numericStep))||textDefaultValue!==undefined&&(raw.dataType!=='TEXT'||!validTextDefault(textDefaultValue)))invalid()
 const options=raw.enumOptions==null?undefined:raw.enumOptions
 if(options!==undefined&&(!Array.isArray(options)||options.length>100||options.some(v=>typeof v!=='string'||!v||v.length>64)||new Set(options).size!==options.length))invalid()
 const presentation=decodePropertyPresentation(raw.presentation),schema=text(raw.schema,65536)
 if(composite!=null)readMixedListBounds(schema)
 if(presentation){if(Object.keys(presentation.enumDescriptions).length&&(raw.dataType!=='ENUM'||Object.keys(presentation.enumDescriptions).some(key=>!Array.isArray(options)||!options.includes(key))))invalid()
  if(Object.keys(presentation.objectFields).length){if(raw.dataType!=='OBJECT'||!schema)invalid();const properties=object(parseDashboardRuntimeResponse(new TextEncoder().encode(schema)).properties);if(Object.keys(presentation.objectFields).some(key=>!Object.hasOwn(properties,key)))invalid()}}
 return Object.freeze({id:raw.id,deviceTypeId:typeId,name:raw.name,propertyKey:raw.propertyKey,accessType:raw.accessType as PropertyDefinition['accessType'],dataType:raw.dataType as PropertyDefinition['dataType'],sortOrder,unit:text(raw.unit,32),decimalPlaces:integer(raw.decimalPlaces,10),minimumValue:numeric(raw.minimumValue),maximumValue:numeric(raw.maximumValue),enumOptions:options as string[]|undefined,onLabel:text(raw.onLabel,32),offLabel:text(raw.offLabel,32),schema,createdAt:text(raw.createdAt,64),description:text(raw.description,512),defaultValue:numeric(raw.defaultValue),numericStep,textDefaultValue,presentation,switchEncoding,compositeProfile:composite==='BASIC_MIXED_LIST_V1'?composite:null})
}
export function decodeProperty(bytes:Uint8Array,typeId:string,id?:string){const value=definition(parseDashboardRuntimeResponse(bytes),typeId);if(id!==undefined&&value.id!==id)invalid();return value}
export function decodePropertyList(bytes:Uint8Array,typeId:string):readonly PropertyDefinition[]{
 if(bytes.byteLength>2*1024*1024||!typeProfileId(typeId))invalid()
 const prefix=new TextEncoder().encode('{"items":'),wrapped=new Uint8Array(prefix.length+bytes.length+1);wrapped.set(prefix);wrapped.set(bytes,prefix.length);wrapped[wrapped.length-1]=125
 const values=parseDashboardRuntimeResponse(wrapped).items
 if(!Array.isArray(values))invalid()
 const rows=values.map(value=>definition(value,typeId));if(new Set(rows.map(row=>row.id)).size!==rows.length||new Set(rows.map(row=>row.propertyKey)).size!==rows.length)invalid();return Object.freeze(rows)
}
export function propertyDraft(value?:PropertyDefinition):PropertyDraft{
 const rows=value?.dataType==='OBJECT'?readObjectFields(value.schema||'',value.presentation):[],bounds=value?.compositeProfile?readMixedListBounds(value.schema):undefined
 return{name:value?.name||'',propertyKey:value?.propertyKey||'',accessType:value?.accessType||'REPORT',dataType:value?.dataType||'',unit:value?.unit||'',precision:value?.decimalPlaces===undefined?'':String(value.decimalPlaces),numericStep:value?.numericStep||'',textDefaultValue:value?.textDefaultValue??null,minimum:value?.minimumValue||'',maximum:value?.maximumValue||'',enumText:value?.enumOptions?.join('\n')||'',enumRows:value?.enumOptions?.map(key=>({value:key,description:value.presentation?.enumDescriptions[key]||''}))||[],onLabel:value?.onLabel||'',offLabel:value?.offLabel||'',switchEncoding:value?.switchEncoding||'BOOLEAN',compositeProfile:value?.compositeProfile||'',listMinimum:bounds?.minimum??'',listMaximum:bounds?.maximum??'256',schema:value?.schema||'',sortOrder:value?.sortOrder??0,description:value?.description||'',defaultValue:value?.defaultValue||'',iconId:value?.presentation?.iconId||'',color:value?.presentation?.color||'',iconRaster:value?.presentation?.iconRaster??null,presentationMode:'keep',objectMode:rows===undefined?'json':'form',objectRows:rows||[],objectChanged:false,objectPresentation:Object.fromEntries(Object.entries(value?.presentation?.objectFields||{}).map(([key,meta])=>[key,{name:meta.name,description:meta.description??null}]))}
}
/** 副本只生成未提交草稿；新键必须由用户填写，展示资料在创建时完整声明。 */
export function copyPropertyDraft(value:PropertyDefinition):PropertyDraft{return{...propertyDraft(value),propertyKey:'',presentationMode:'replace'}}
export function propertySortOrder(value:string):number{const input=value.trim();if(!/^\d{1,10}$/.test(input)||BigInt(input)>2147483647n)throw new Error('排序号必须为0至2147483647的整数');return Number(input)}
function presentationInput(draft:PropertyDraft){if(draft.presentationMode==='keep')return undefined;if(draft.presentationMode==='clear')return null;return normalizePropertyPresentation({iconId:draft.iconId||null,color:draft.color||null,...(draft.iconRaster?{iconRaster:draft.iconRaster}:{}),enumDescriptions:draft.dataType==='ENUM'?Object.fromEntries(draft.enumRows.filter(row=>row.description.trim()).map(row=>[row.value.trim(),row.description])):{},objectFields:draft.dataType==='OBJECT'?draft.objectPresentation:{}})}
function numberInput(value:string){if(!value.trim())return undefined;const parsed=value.length<=1024?readNumberDraft(value.trim()):undefined;if(!parsed)throw new Error('数值边界必须是有效且有界的JSON数字');return parsed.lexical}
function positiveNumber(value:string){return!value.startsWith('-')&&/[1-9]/.test(value.split(/[eE]/)[0]!)}
function stepInput(value:string){const number=numberInput(value);if(number!==undefined&&!positiveNumber(number))throw new Error('精度步进必须是大于0的数值');return number}
function validTextDefault(value:string){return value.length<=4096&&!value.includes('\0')&&new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(value))===value}
/** 仅校验语法和根型；完整受限Schema由既有服务端验证，不另造第二套规则。 */
function schemaInput(value:string,type:string){if(!value||value.length>65536)throw new Error('请填写不超过65536字符的受限JSON Schema');const root=parseDashboardRuntimeResponse(new TextEncoder().encode(value));if(root.type!==(type==='OBJECT'?'object':'array'))throw new Error('Schema根类型与属性数据类型不符');return value}
/** 混合列表只有长度边界，不猜测或伪造单一items。 */
export function mixedListSchema(minimum:string,maximum:string){
 if(!/^(0|[1-9][0-9]{0,2})$/.test(maximum)||Number(maximum)>256||minimum!==''&&(!/^(0|[1-9][0-9]{0,2})$/.test(minimum)||Number(minimum)>Number(maximum)))throw new Error('列表长度必须为0至256的整数，最少项数不能超过最多项数')
 return JSON.stringify({type:'array',...(minimum===''?{}:{minItems:Number(minimum)}),maxItems:Number(maximum)})
}
/** 新能力显式闭集，坏资料不能被省略字段降为旧同构合同。 */
function readMixedListBounds(schema:string|undefined){
 if(!schema)invalid();const root=parseDashboardRuntimeResponse(new TextEncoder().encode(schema))
 if(root.type!=='array'||Object.keys(root).some(key=>!['type','minItems','maxItems'].includes(key))||!isStrictJsonNumber(root.maxItems!))invalid()
 const maximum=root.maxItems.lexical,minimum=root.minItems===undefined?'':isStrictJsonNumber(root.minItems)?root.minItems.lexical:undefined
 if(minimum===undefined)invalid();mixedListSchema(minimum,maximum);return{minimum,maximum}
}
export function prepareProperty(project:string,typeId:string,draft:PropertyDraft,existing?:PropertyDefinition):PropertyIntent{
 if(!typeProfileId(project)||!typeProfileId(typeId)||existing&&existing.deviceTypeId!==typeId)invalid()
 const name=draft.name.trim(),propertyKey=draft.propertyKey.trim()
 if(!name||name.length>128||!/^[A-Za-z0-9_-]{1,64}$/.test(propertyKey))throw new Error('请填写属性名称及1至64位字母、数字、下划线或横线标识符')
 if(!propertyAccess.some(([key])=>key===draft.accessType)||!propertyTypes.some(([key])=>key===draft.dataType))throw new Error('请选择明确的属性流向和数据类型')
 if(['DAILY_TIMER','DAILY_TIMER_RANGE','DAILY_TIMER_DURATION','DAILY_TIMER_INTERVAL','DAILY_TIMER_LIST','DAILY_TIMER_RANGE_LIST','DAILY_TIMER_DURATION_LIST','DAILY_TIMER_INTERVAL_LIST'].includes(draft.dataType)&&(draft.accessType!=='CLOUD_PRIVATE'||[draft.unit,draft.precision,draft.minimum,draft.maximum,draft.onLabel,draft.offLabel,draft.schema,draft.defaultValue,draft.numericStep,draft.enumText,draft.compositeProfile].some(Boolean)||draft.enumRows.length||draft.textDefaultValue!==null||draft.switchEncoding!==''&&draft.switchEncoding!=='BOOLEAN'))throw new Error('每日定时器仅支持云端私有属性，不能携带其它数据类型的配置')
 if(draft.description.length>512)throw new Error('属性描述最多512字符')
 if(draft.dataType!=='NUMBER'&&draft.defaultValue.trim())throw new Error('当前默认值仅支持数值属性；改变类型前请明确清除默认值')
 if(draft.dataType!=='NUMBER'&&draft.numericStep.trim())throw new Error('改变类型前请明确清除数值步进')
 if(draft.textDefaultValue!==null&&(draft.dataType!=='TEXT'||!validTextDefault(draft.textDefaultValue)))throw new Error('文本默认声明仅支持Text，最多4096字符且不能含NUL或无效Unicode；改变类型前请明确清除')
 if(!Number.isInteger(draft.sortOrder)||draft.sortOrder<0||draft.sortOrder>2147483647)invalid()
 let fields:Partial<Body>={}
 if(draft.dataType==='NUMBER'){
  if(draft.unit.length>32||draft.precision!==''&&(!/^\d{1,2}$/.test(draft.precision)||Number(draft.precision)>10))throw new Error('单位最多32字符，精度为0至10的整数')
  fields={unit:draft.unit.trim()||undefined,decimalPlaces:draft.precision===''?undefined:Number(draft.precision),minimumValue:numberInput(draft.minimum),maximumValue:numberInput(draft.maximum)}
 }else if(draft.dataType==='ENUM'){
  const options=draft.enumRows.length?draft.enumRows.map(row=>row.value.trim()):draft.enumText.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)
  if(!options.length||options.length>100||options.some(v=>!v||v.length>64)||new Set(options).size!==options.length)throw new Error('枚举值必须非空，最多100项、每项64字符且不能重复')
  fields={enumOptions:options}
 }else if(draft.dataType==='SWITCH'){
  if(!propertySwitchEncodings.some(([key])=>key===draft.switchEncoding))throw new Error('请选择明确的开关值类型');if(draft.onLabel.length>32||draft.offLabel.length>32)throw new Error('开关文字最多32字符');fields={switchEncoding:draft.switchEncoding as PropertySwitchEncoding,onLabel:draft.onLabel.trim()||undefined,offLabel:draft.offLabel.trim()||undefined}
 }else if(draft.dataType==='LIST'){
  if(draft.compositeProfile!==''&&draft.compositeProfile!=='BASIC_MIXED_LIST_V1')invalid()
  fields={compositeProfile:draft.compositeProfile==='BASIC_MIXED_LIST_V1'?'BASIC_MIXED_LIST_V1':null,schema:draft.compositeProfile==='BASIC_MIXED_LIST_V1'?mixedListSchema(draft.listMinimum,draft.listMaximum):schemaInput(draft.schema,'LIST')}
 }else if(draft.dataType==='OBJECT')fields={schema:schemaInput(draft.objectMode==='form'&&draft.objectChanged?objectFieldsSchema(draft.objectRows):draft.schema,'OBJECT')}
 const presentation=presentationInput(draft),body=Object.freeze({name,propertyKey,accessType:draft.accessType as Request['accessType'],dataType:draft.dataType as Request['dataType'],sortOrder:draft.sortOrder,description:draft.description.trim()||null,defaultValue:draft.dataType==='NUMBER'?(numberInput(draft.defaultValue)??null):null,numericStep:draft.dataType==='NUMBER'?(stepInput(draft.numericStep)??null):null,textDefaultValue:draft.dataType==='TEXT'?draft.textDefaultValue:null,...(draft.dataType!=='LIST'&&existing?.compositeProfile?{compositeProfile:null}:{}),...(draft.dataType!=='SWITCH'&&existing?.dataType==='SWITCH'&&existing.switchEncoding&&existing.switchEncoding!=='BOOLEAN'?{switchEncoding:null}:{}),...fields,...(presentation===undefined?{}:{presentation})})
 const rawBody='{'+Object.entries(body).filter(([,value])=>value!==undefined).map(([key,value])=>`${JSON.stringify(key)}:${key==='minimumValue'||key==='maximumValue'||key==='defaultValue'||key==='numericStep'?value:JSON.stringify(value)}`).join(',')+'}'
 return Object.freeze({project,typeId,id:existing?.id,kind:existing?'update':'create',key:crypto.randomUUID(),body,rawBody,label:name,expectedPresentation:presentation===undefined?existing?.presentation??null:presentation})
}
export function preparePropertyDelete(project:string,typeId:string,value:PropertyDefinition):PropertyIntent{if(!typeProfileId(project)||!typeProfileId(typeId)||value.deviceTypeId!==typeId||!typeProfileId(value.id))invalid();return Object.freeze({project,typeId,id:value.id,kind:'delete',key:crypto.randomUUID(),label:value.name})}
/** 只规范十进制比较表示，不展开指数或将属性数值转换为浮点。 */
function decimal(value:string){const [coefficient,exponent='0']=value.toLowerCase().split('e'),negative=coefficient!.startsWith('-'),[whole,fraction='']=coefficient!.replace(/^-/,'').split('.');let digits=(whole!+fraction).replace(/^0+/,'');if(!digits)return'0';let power=BigInt(exponent)-BigInt(fraction.length);const suffix=digits.length-digits.replace(/0+$/,'').length;digits=digits.replace(/0+$/,'');power+=BigInt(suffix);return`${negative?'-':''}${digits}e${power}`}
function semantic(value:StrictJsonValue):string{if(isStrictJsonNumber(value))return'#'+decimal(value.lexical);if(Array.isArray(value))return'['+value.map(semantic).join(',')+']';if(value&&typeof value==='object')return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+semantic((value as StrictJsonObject)[key]!)).join(',')+'}';return JSON.stringify(value)}
function schemaEqual(left:string|undefined,right:string|undefined){return left===right||!!left&&!!right&&semantic(parseDashboardRuntimeResponse(new TextEncoder().encode(left)))===semantic(parseDashboardRuntimeResponse(new TextEncoder().encode(right)))}
export function propertyMatches(value:PropertyDefinition,intent:PropertyIntent){
 const body=intent.body;if(!body||value.deviceTypeId!==intent.typeId||intent.id&&value.id!==intent.id)return false
 const numbers=(left:string|undefined,right:string|undefined)=>left===right||left!==undefined&&right!==undefined&&decimal(left)===decimal(right)
 return value.name===body.name&&value.propertyKey===body.propertyKey&&value.accessType===body.accessType&&value.dataType===body.dataType&&value.sortOrder===body.sortOrder&&(value.compositeProfile??null)===(body.compositeProfile??null)&&(value.dataType!=='SWITCH'||(value.switchEncoding||'BOOLEAN')===(body.switchEncoding||'BOOLEAN'))&&(value.description||null)===(body.description||null)&&numbers(value.defaultValue,body.defaultValue??undefined)&&numbers(value.numericStep,body.numericStep??undefined)&&(value.textDefaultValue??null)===body.textDefaultValue&&(value.unit||undefined)===body.unit&&value.decimalPlaces===body.decimalPlaces&&numbers(value.minimumValue,body.minimumValue)&&numbers(value.maximumValue,body.maximumValue)&&(value.onLabel||undefined)===body.onLabel&&(value.offLabel||undefined)===body.offLabel&&JSON.stringify(value.enumOptions||[])===JSON.stringify(body.enumOptions||[])&&schemaEqual(value.schema,body.schema)&&samePropertyPresentation(value.presentation,intent.expectedPresentation)
}
const path=(project:string,typeId:string)=>{if(!typeProfileId(project)||!typeProfileId(typeId))invalid();return `/api/v1/projects/${project}/device-types/${typeId}/properties` as const}
export const propertyTransport:PropertyTransport={
 definitionList:(project,typeId,signal)=>readDefinitionTable(project,typeId,'properties',decodePropertyList,signal),
 tableWrite:(intent,signal)=>writeDefinitionTable(intent,decodePropertyList,signal),
 publishedList:(project,typeId,signal)=>readModelEditList(project,typeId,'properties',decodePropertyList,signal),
 async list(project,typeId,signal){return decodePropertyList(await api<Uint8Array>(path(project,typeId),{signal,responseType:'bytes',maxResponseBytes:2*1024*1024}),typeId)},
 async write(intent,signal){const route=intent.modelEdit?(`${modelEditPath(intent.project,intent.typeId)}/properties` as const):path(intent.project,intent.typeId);const headers={'Idempotency-Key':intent.key,...modelEditHeaders(intent.modelEdit,intent.typeId)};if(intent.kind==='delete'){const value=await api(`${route}/${intent.id}`,{method:'delete',headers,signal});if(value!==undefined)throw new ApiError('属性删除回执不完整，结果尚未确认',0,undefined,undefined,true);return}const bytes=intent.kind==='create'?await api<Uint8Array>(route,{method:'post',rawBody:intent.rawBody,headers:{...headers,'Content-Type':'application/json'},signal,responseType:'bytes'}):await api<Uint8Array>(`${route}/${intent.id}`,{method:'put',rawBody:intent.rawBody,headers:{...headers,'Content-Type':'application/json'},signal,responseType:'bytes'});return decodeProperty(bytes,intent.typeId,intent.id)},
}
