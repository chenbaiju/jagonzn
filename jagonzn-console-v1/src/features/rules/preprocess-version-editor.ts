import {dataStreamTemplate,type DataStreamItem} from '../device-types/data-stream-publication-api'
import {normalizeDataOperations,newDataOperationId,type DataOperations,type DataOperation} from './data-operations-api'
import {normalizeSubdeviceModbusRtuParser,type SubdeviceModbusRtuParser} from './subdevice-modbus-rtu-parser-api'
import {normalizeGatewayDataParser,type GatewayDataParser} from './gateway-data-parser-api'
import {normalizeDataDownlinkFunction,type DataDownlinkFunction} from './data-downlink-function-api'
import {normalizeModbusRtuParser,type ModbusRtuParser} from './modbus-rtu-parser-api'
import {sameDeviceSource,type RuleDeviceSourceContract} from './rule-source-api'
import {ruleTagsValue} from './rule-tag-draft'
import {definitionUuid} from './device-task-definition-port'
import {newCondition,newConditionGroup,newFunction,groupSize,conditionOperators,type ConditionDraft,type ConditionGroupDraft,type FunctionDraft,type PreprocessKind} from './rule-builder-draft'
import {ExactDecimal,compareDecimal,parsePreprocessJson,writePreprocessJson,validUnicode,type ExactJson} from './preprocess-exact-json'
import {propertyOperationsDraft,readPropertyOperationsDraft,type PropertyOperationsDraft} from './property-operations-draft'

/** 父层已完成正式读取后的组合领域输入，不是HTTP DTO；JSON片段须从原字节取得，不能先JSON.parse丢精度。 */
export type PreprocessVersionSeed={
 scopeKey:string;deviceId:string;ruleId:string;versionId:string;latestVersionId:string
 definitionVersion:string;versionNumber:string
 name:string;description:string|null;status:'DRAFT'|'ACTIVE'|'PAUSED';activeVersionId:string|null
 deviceSourceKind:'DEVICE';deviceSourceId:string;deviceSourceIds?:readonly string[];source:string;actionsJson:string;preprocessingJson:string
}
export type PreprocessEditScope={scopeKey:string;deviceId:string;ruleId:string}
export type PreprocessEditDraft={name:string;description:string;kind:PreprocessKind;filter:ConditionGroupDraft;functions:FunctionDraft[];propertyOperations?:PropertyOperationsDraft}
export type PreprocessRevisionIntent={
 scopeKey:string;deviceId:string;ruleId:string;attemptId:string
 expectedDefinitionVersion:string;baseVersionId:string;baseVersionNumber:string
 name:string;description:string|null;preprocessingJson:string
}
export type LoadedPreprocessVersion={seed:Readonly<PreprocessVersionSeed>;draft:PreprocessEditDraft;signature:string}
const max=9223372036854775807n
const javaSpace=/^[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+$/gu
const strip=(value:string)=>value.replace(javaSpace,'')
const invalid=()=>new Error('完整前处理版本或编辑基线无效，请重新读取')
function object(value:ExactJson):{[key:string]:ExactJson}{
 if(!value||typeof value!=='object'||Array.isArray(value)||value instanceof ExactDecimal)throw invalid()
 return value
}
function fields(value:{[key:string]:ExactJson},required:string[],optional:string[]=[]){
 if(required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))throw invalid()
}
function text(value:ExactJson|undefined):string{if(typeof value!=='string'||!validUnicode(value))throw invalid();return value}
function contentIdentity(value:ExactJson):string{
 if(value instanceof ExactDecimal)return value.canonical()
 if(Array.isArray(value))return '['+value.map(contentIdentity).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+contentIdentity(value[key]!)).join(',')+'}'
 return JSON.stringify(value)
}
export function exactRevisionCounter(value:unknown):string{
 if(typeof value!=='string'||!/^[1-9]\d{0,18}$/.test(value)||BigInt(value)>max)throw invalid()
 return value
}
function pointer(path:string):string{if(!path.startsWith('/')||path.length>256||/~(?![01])/.test(path))throw invalid();return path}
/** 只展开最多64字符的条件输入；复用既有精确展开，不舍入或把数值转成Number。 */
function conditionText(value:ExactDecimal):string{
 const size=BigInt(value.digits.length),point=size+value.exponent
 const length=value.digits==='0'?1n:(value.negative?1n:0n)+(point<=0n?2n-point+size:point>=size?point:size+1n)
 return length<=64n?value.expanded():value.literal
}
function readCondition(value:ExactJson):ConditionDraft{
 const row=object(value);fields(row,['pointer','operator'],['value'])
 const operator=text(row.operator) as ConditionDraft['operator']
 if(!conditionOperators.includes(operator))throw invalid()
 const draft={...newCondition(),path:pointer(text(row.pointer)),operator}
 if(operator==='EXISTS'){
  if(Object.hasOwn(row,'value'))throw invalid()
  return draft
 }
 if(!Object.hasOwn(row,'value'))throw invalid()
 const input=row.value!
 if(operator==='IN_RANGE'||operator==='OUT_RANGE'){
  if(!Array.isArray(input)||input.length!==2||!(input[0] instanceof ExactDecimal)||!(input[1] instanceof ExactDecimal)||compareDecimal(input[0],input[1])>0)throw invalid()
  return {...draft,lower:conditionText(input[0]),upper:conditionText(input[1])}
 }
 if(['CONTAINS','NOT_CONTAINS','KEY_EXISTS','KEY_ABSENT'].includes(operator)){
  if(typeof input!=='string'||!input)throw invalid()
  return {...draft,valueType:'string',text:input}
 }
 if(['GT','GTE','LT','LTE'].includes(operator)&&!(input instanceof ExactDecimal))throw invalid()
 if(input instanceof ExactDecimal)return {...draft,valueType:'number',text:conditionText(input)}
 if(typeof input==='boolean')return {...draft,valueType:'boolean',booleanValue:input}
 if(typeof input==='string')return {...draft,valueType:'string',text:input}
 if(input===null&&(operator==='EQ'||operator==='NE'))return {...draft,valueType:'null'}
 throw invalid()
}
function readGroup(value:ExactJson):ConditionGroupDraft{
 const row=object(value);fields(row,['operator','conditions','groups'])
 if(row.operator!=='ALL'&&row.operator!=='ANY'||!Array.isArray(row.conditions)||!Array.isArray(row.groups))throw invalid()
 return {...newConditionGroup(),operator:row.operator,conditions:row.conditions.map(readCondition),groups:row.groups.map(readGroup)}
}
function writeCondition(row:ConditionDraft):ExactJson{
 if(!conditionOperators.includes(row.operator))throw invalid()
 const result:{[key:string]:ExactJson}={pointer:pointer(row.path),operator:row.operator}
 if(row.operator==='EXISTS')return result
 if(row.operator==='IN_RANGE'||row.operator==='OUT_RANGE'){
  const lower=new ExactDecimal(row.lower.trim()),upper=new ExactDecimal(row.upper.trim())
  if(compareDecimal(lower,upper)>0)throw new Error('区间下限不能大于上限')
  result.value=[lower,upper]
 }else if(['CONTAINS','NOT_CONTAINS','KEY_EXISTS','KEY_ABSENT'].includes(row.operator)){
  if(!row.text||!validUnicode(row.text))throw new Error('请输入有效非空文本')
  result.value=row.text
 }else if(['GT','GTE','LT','LTE'].includes(row.operator)||row.valueType==='number')result.value=new ExactDecimal(row.text.trim())
 else if(row.valueType==='boolean')result.value=row.booleanValue
 else if(row.valueType==='string'){if(!validUnicode(row.text))throw invalid();result.value=row.text}
 else if(row.valueType==='null')result.value=null
 else throw invalid()
 return result
}
function writeGroup(group:ConditionGroupDraft,nested=false):ExactJson{
 const size=groupSize(group)
 if(size.leaves>32||size.groups>64||size.depth>4||group.conditions.length>32||group.groups.length>32
  ||group.operator!=='ALL'&&group.operator!=='ANY'||nested&&!size.leaves
  ||!size.leaves&&(group.groups.length>0||group.operator==='ANY'))throw new Error('请核对条件分组，最多32项、64组和4层')
 return {operator:group.operator,conditions:group.conditions.map(writeCondition),groups:group.groups.map(child=>writeGroup(child,true))}
}
export function editPreprocessingJson(draft:PreprocessEditDraft):string{
 if(draft.kind!=='ATTRS_RPT_PREPROC'&&draft.kind!=='ATTRS_PUSH_PREPROC')throw invalid()
 const filter=draft.kind==='ATTRS_PUSH_PREPROC'?{operator:'ALL',conditions:[],groups:[]} as ExactJson:writeGroup(draft.filter)
 if(new TextEncoder().encode(writePreprocessJson(filter,true)).length>65536)throw new Error('条件总内容超过65536个UTF8字节')
 if(draft.propertyOperations){
  if(draft.kind!=='ATTRS_RPT_PREPROC')throw new Error('这些操作仅适用于属性上报预处理')
  const operations=propertyOperationsDraft(draft.propertyOperations),value={trigger:{kind:draft.kind,identifier:null,filter},...operations}
  if(new TextEncoder().encode(writePreprocessJson(value,true)).length>65536)throw new Error('完整预处理内容超过65536个UTF8字节')
  return writePreprocessJson(value)
 }
 let bytes=0
 if(!draft.functions.length||draft.functions.length>32)throw new Error('请添加1至32项预处理操作')
 const functions=draft.functions.map(row=>{
  if(!['COMMON_JS','FUNCTION_EXPRESSION'].includes(row.format)||!row.source.trim()||!validUnicode(row.source))throw new Error('请补全每项操作的函数与格式')
  bytes+=new TextEncoder().encode(row.source).length
  return {format:row.format,source:row.source}
 })
 if(bytes>65536)throw new Error('全部函数合计最多65536个UTF8字节')
 return writePreprocessJson({trigger:{kind:draft.kind,identifier:null,filter},functions})
}
function metadata(draft:Pick<PreprocessEditDraft,'name'|'description'>):{name:string;description:string|null}{
 if(typeof draft.name!=='string'||typeof draft.description!=='string'||!validUnicode(draft.name)||!validUnicode(draft.description))throw invalid()
 const name=strip(draft.name),description=strip(draft.description)
 if(!name||name.length>128||draft.description.length>512)throw new Error('请核对名称与说明长度')
 return {name,description:description||null}
}
export function seedMatchesScope(seed:PreprocessVersionSeed,scope:PreprocessEditScope):boolean{
 return typeof seed.scopeKey==='string'&&seed.scopeKey===scope.scopeKey
  &&typeof seed.deviceId==='string'&&seed.deviceId.toLowerCase()===scope.deviceId.toLowerCase()
  &&typeof seed.ruleId==='string'&&seed.ruleId.toLowerCase()===scope.ruleId.toLowerCase()
}
/** 多设备种子保持完整集合；空deviceId仅表示真实规则级上下文，不能伪装首设备。 */
export function preprocessSeedDeviceIds(seed:PreprocessVersionSeed):string[]{
 if(seed.deviceSourceIds!==undefined){const ids=seed.deviceSourceIds.map(value=>{if(!definitionUuid(value))throw invalid();return value.toLowerCase()});if(seed.deviceId!==''||seed.deviceSourceId!==''||ids.length<2||ids.length>64||new Set(ids).size!==ids.length||ids.some((value,index)=>index>0&&value<=ids[index-1]!))throw invalid();return ids}
 if(!definitionUuid(seed.deviceSourceId))throw invalid();return [seed.deviceSourceId.toLowerCase()]
}
export function loadPreprocessVersion(seed:PreprocessVersionSeed,scope:PreprocessEditScope):LoadedPreprocessVersion{
 const members=preprocessSeedDeviceIds(seed)
 if(!scope.scopeKey||scope.scopeKey.length>2048||!(definitionUuid(scope.deviceId)||scope.deviceId===''&&members.length>1)||!definitionUuid(scope.ruleId)||!seedMatchesScope(seed,scope)
  ||!definitionUuid(seed.versionId)||!definitionUuid(seed.latestVersionId)||seed.versionId.toLowerCase()!==seed.latestVersionId.toLowerCase()
  ||seed.deviceSourceKind!=='DEVICE'||(members.length===1?members[0]!==scope.deviceId.toLowerCase():scope.deviceId!=='')
  ||!['DRAFT','ACTIVE','PAUSED'].includes(seed.status)||seed.status==='DRAFT'&&seed.activeVersionId!==null
  ||seed.status!=='DRAFT'&&!definitionUuid(seed.activeVersionId))throw invalid()
 exactRevisionCounter(seed.definitionVersion);exactRevisionCounter(seed.versionNumber)
 const actions=parsePreprocessJson(seed.actionsJson)
 if(!Array.isArray(actions)||actions.length)throw invalid()
 const value=object(parsePreprocessJson(seed.preprocessingJson)),native=value.profile==='PROPERTY_TRANSFORM_V1';fields(value,native?['trigger','profile','operations']:['trigger','functions'])
 const trigger=object(value.trigger!);fields(trigger,native?['kind','identifier','filter']:['kind','filter'],native?[]:['identifier'])
 if(trigger.identifier!==undefined&&trigger.identifier!==null||trigger.kind!=='ATTRS_RPT_PREPROC'&&trigger.kind!=='ATTRS_PUSH_PREPROC'||native&&trigger.kind!=='ATTRS_RPT_PREPROC'||!native&&!Array.isArray(value.functions))throw invalid()
 const propertyOperations=native?readPropertyOperationsDraft({profile:value.profile!,operations:value.operations!}):undefined
 const draft:PreprocessEditDraft={name:seed.name,description:seed.description??'',kind:trigger.kind,filter:readGroup(trigger.filter!),functions:native?[]:(value.functions as ExactJson[]).map(value=>{
  const row=object(value);fields(row,['format','source'])
  if(row.format!=='COMMON_JS'&&row.format!=='FUNCTION_EXPRESSION')throw invalid()
  return {...newFunction(),format:row.format,source:text(row.source)}
 }),...(propertyOperations?{propertyOperations}:{})}
 if(native){if(contentIdentity(parsePreprocessJson(seed.source))!==contentIdentity(value))throw invalid()}else if(!draft.functions.length||draft.functions[0]!.source!==seed.source)throw invalid()
 if(draft.kind==='ATTRS_PUSH_PREPROC'&&(draft.filter.operator!=='ALL'||draft.filter.conditions.length||draft.filter.groups.length))throw invalid()
 const info=metadata(draft),preprocessingJson=editPreprocessingJson(draft)
 if(info.name!==seed.name||info.description!==seed.description)throw invalid()
 const frozen=Object.freeze({...seed,...(members.length>1?{deviceSourceIds:Object.freeze(members)}:{}),deviceId:scope.deviceId.toLowerCase(),ruleId:scope.ruleId.toLowerCase(),versionId:seed.versionId.toLowerCase(),latestVersionId:seed.latestVersionId.toLowerCase(),deviceSourceId:scope.deviceId.toLowerCase(),preprocessingJson})
 return {seed:frozen,draft,signature:JSON.stringify([info.name,info.description,preprocessingJson])}
}
export function revisionDraftChanged(loaded:LoadedPreprocessVersion,draft:PreprocessEditDraft):boolean{
 const info=metadata(draft)
 return JSON.stringify([info.name,info.description,editPreprocessingJson(draft)])!==loaded.signature
}
export function makeRevisionIntent(loaded:LoadedPreprocessVersion,draft:PreprocessEditDraft,attemptId:string):PreprocessRevisionIntent{
 if(!definitionUuid(attemptId))throw invalid()
 if(BigInt(loaded.seed.definitionVersion)===max||BigInt(loaded.seed.versionNumber)===max)throw new Error('版本号已达上限，当前版本仅供读取')
 const info=metadata(draft),preprocessingJson=editPreprocessingJson(draft)
 if(!revisionDraftChanged(loaded,draft))throw new Error('请先修改版本内容')
 return {scopeKey:loaded.seed.scopeKey,deviceId:loaded.seed.deviceId,ruleId:loaded.seed.ruleId,attemptId,expectedDefinitionVersion:loaded.seed.definitionVersion,baseVersionId:loaded.seed.versionId,baseVersionNumber:loaded.seed.versionNumber,...info,preprocessingJson}
}
/** 父层仍须提供真实读回；这里只核关联和完整内容，不能从一次事件推断后台已持久化。 */
export function confirmRevision(loaded:LoadedPreprocessVersion,intent:PreprocessRevisionIntent,seed:PreprocessVersionSeed):LoadedPreprocessVersion{
 const next=loadPreprocessVersion(seed,intent)
 if(BigInt(next.seed.definitionVersion)!==BigInt(intent.expectedDefinitionVersion)+1n||BigInt(next.seed.versionNumber)!==BigInt(intent.baseVersionNumber)+1n
  ||next.seed.versionId===intent.baseVersionId||next.seed.name!==intent.name||next.seed.description!==intent.description
  ||next.seed.preprocessingJson!==intent.preprocessingJson||next.seed.status!==loaded.seed.status
  ||next.seed.activeVersionId?.toLowerCase()!==loaded.seed.activeVersionId?.toLowerCase()||JSON.stringify(preprocessSeedDeviceIds(next.seed))!==JSON.stringify(preprocessSeedDeviceIds(loaded.seed)))throw new Error('修订结果尚未完整核对，请勿重复保存')
 return next
}

/** 创建与修订共用精确条件/函数域；唯一JSON表达避免大数先落入Number。 */
export type PreprocessCreationDraft={name:string;description:string|null;tags:Record<string,string>;preprocessingJson:string;propertyOperations?:PropertyOperationsDraft;nativeParser?:ModbusRtuParser;dataDownlink?:DataDownlinkFunction;gatewayParser?:GatewayDataParser;subdeviceNativeParser?:SubdeviceModbusRtuParser;dataOperations?:DataOperations;streamIdentifier?:string}
/** 复用精确条件草稿读取，后处理编辑不经浮点转换或丢弃嵌套分组。 */
export function readRuleConditionDraft(source:string):ConditionGroupDraft{return readGroup(parsePreprocessJson(source))}
export function preprocessConditionJson(filter:ConditionGroupDraft):string{
 const value=writeGroup(filter)
 if(new TextEncoder().encode(writePreprocessJson(value,true)).length>65536)throw new Error('条件总内容超过65536个UTF8字节')
 return writePreprocessJson(value)
}
export function makePreprocessCreationDraft(input:{name:string;description:string;kind:PreprocessKind|undefined;filter:ConditionGroupDraft;functions:FunctionDraft[];propertyOperations?:PropertyOperationsDraft;tags:import('./rule-tag-draft').RuleTagDraft[]}):PreprocessCreationDraft{
 if(!input.kind)throw new Error('请选择属性预处理类型')
 const draft:PreprocessEditDraft={...input,kind:input.kind}
 return {...metadata(draft),tags:ruleTagsValue(input.tags),preprocessingJson:editPreprocessingJson(draft),...(input.propertyOperations?{propertyOperations:propertyOperationsDraft(input.propertyOperations)}:{})}
}

/** 公开固定包复用原精确条件合同，只验证，不生成身份或改写原条件正文。 */
export function validatePreprocessFilterJson(source:string,kind:PreprocessKind):void{
 if(kind!=='ATTRS_RPT_PREPROC'&&kind!=='ATTRS_PUSH_PREPROC')throw invalid()
 const value=parsePreprocessJson(source);if(value===null)return
 if(kind==='ATTRS_PUSH_PREPROC')throw invalid()
 const checked=writeGroup(readGroup(value))
 if(new TextEncoder().encode(writePreprocessJson(checked,true)).length>65536)throw invalid()
}

/** TYPE DATA只接受已选业务流和一个原文CommonJS；旧DEVICE修订域保持两类。 */
export function makeTypeDataCreationDraft(input:{name:string;description:string;streamIdentifier:string;functions:FunctionDraft[];tags:import('./rule-tag-draft').RuleTagDraft[]}):PreprocessCreationDraft{
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(input.streamIdentifier)||input.functions.length!==1)throw new Error('请选择数据流并设置一个属性解析函数')
 const fn=input.functions[0]!
 if(fn.format!=='COMMON_JS'||!fn.source.trim()||!validUnicode(fn.source)||new TextEncoder().encode(fn.source).length>65536)throw new Error('请设置65536 UTF8字节以内的CommonJS属性解析函数')
 return {...metadata(input),tags:ruleTagsValue(input.tags),preprocessingJson:writePreprocessJson({trigger:{kind:'DATA_RPT',identifier:input.streamIdentifier,filter:{operator:'ALL',conditions:[],groups:[]}},functions:[{format:fn.format,source:fn.source}]})}
}

/** 独立原生操作意图；不把配置JSON伪装成JavaScript函数。 */
export function makeTypeNativeDataCreationDraft(input:{name:string;description:string;streamIdentifier:string;nativeParser:ModbusRtuParser;tags:import('./rule-tag-draft').RuleTagDraft[]}):PreprocessCreationDraft{
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(input.streamIdentifier))throw new Error('请选择HEX数据流')
 return {...metadata(input),tags:ruleTagsValue(input.tags),preprocessingJson:'null',nativeParser:normalizeModbusRtuParser(input.nativeParser),streamIdentifier:input.streamIdentifier}
}

/** 单个下行动作完整保留可选延迟，目标流与原上行流分别保存。 */
export function makeTypeDownlinkCreationDraft(input:{name:string;description:string;streamIdentifier:string;dataDownlink:DataDownlinkFunction;tags:import('./rule-tag-draft').RuleTagDraft[]}):PreprocessCreationDraft{
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(input.streamIdentifier))throw new Error('请选择上报数据流')
 return {...metadata(input),tags:ruleTagsValue(input.tags),preprocessingJson:'null',streamIdentifier:input.streamIdentifier,dataDownlink:normalizeDataDownlinkFunction(input.dataDownlink)}
}

/** 网关函数只保存原CommonJS源码，设备目标由运行时有效绑定核验。 */
export function makeTypeGatewayDataCreationDraft(input:{name:string;description:string;streamIdentifier:string;gatewayParser:GatewayDataParser;tags:import('./rule-tag-draft').RuleTagDraft[]}):PreprocessCreationDraft{
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(input.streamIdentifier))throw new Error('请选择上报数据流')
 return {...metadata(input),tags:ruleTagsValue(input.tags),preprocessingJson:'null',streamIdentifier:input.streamIdentifier,gatewayParser:normalizeGatewayDataParser(input.gatewayParser)}
}

/** 子设备Native沿独立true合同保存，原配置从机地址不替换为预览地址。 */
export function makeTypeSubdeviceNativeDataCreationDraft(input:{name:string;description:string;streamIdentifier:string;subdeviceNativeParser:SubdeviceModbusRtuParser;tags:import('./rule-tag-draft').RuleTagDraft[]}):PreprocessCreationDraft{
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(input.streamIdentifier))throw new Error('请选择HEX上报数据流')
 return {...metadata(input),tags:ruleTagsValue(input.tags),preprocessingJson:'null',streamIdentifier:input.streamIdentifier,subdeviceNativeParser:normalizeSubdeviceModbusRtuParser(input.subdeviceNativeParser)}
}

/** TYPE编辑只消费已完整读取的领域结果，不将类型身份塞入旧DEVICE种子。 */
export type TypePreprocessContent=Awaited<ReturnType<typeof import('./preprocess-control-api').readTypePreprocessor>>
export type TypePreprocessEditScope={scopeKey:string;deviceTypeId:string;ruleId:string;deviceSource?:RuleDeviceSourceContract}
export type TypePreprocessEditDraft={streamIdentifier?:string;name:string;description:string;filter:ConditionGroupDraft;functions:FunctionDraft[];propertyOperations?:PropertyOperationsDraft;nativeParser?:ModbusRtuParser;dataDownlink?:DataDownlinkFunction;gatewayParser?:GatewayDataParser;subdeviceNativeParser?:SubdeviceModbusRtuParser;dataOperations?:DataOperations}
export type LoadedTypePreprocessContent={scope:Readonly<TypePreprocessEditScope>;before:TypePreprocessContent;draft:TypePreprocessEditDraft;signature:string}
export type TypePreprocessRevisionIntent={scopeKey:string;deviceTypeId:string;deviceSource?:RuleDeviceSourceContract;ruleId:string;attemptId:string;expectedDefinitionVersion:string;baseVersionId:string;baseVersionNumber:string;content:Readonly<PreprocessCreationDraft>}
function typeContent(before:TypePreprocessContent,draft:TypePreprocessEditDraft):PreprocessCreationDraft{
 if(draft.streamIdentifier!==undefined&&before.kind!=='DATA_RPT')throw invalid()
 const streamIdentifier=draft.streamIdentifier??before.streamIdentifier!
 const tags=Object.entries(before.tags).map(([key,value],index)=>({id:String(index),key,value})),base={name:draft.name,description:draft.description,tags}
 if(draft.dataOperations){
  if(before.kind!=='DATA_RPT'||draft.gatewayParser||draft.nativeParser||draft.subdeviceNativeParser||draft.dataDownlink||draft.functions.length)throw invalid()
  return makeTypeDataOperationsCreationDraft({...base,streamIdentifier,dataOperations:draft.dataOperations})
 }
 if(before.dataOperations)throw invalid()
 if(before.gatewayParser){
  if(!draft.gatewayParser||draft.subdeviceNativeParser||draft.nativeParser||draft.dataDownlink||draft.functions.length)throw invalid()
  return makeTypeGatewayDataCreationDraft({...base,streamIdentifier,gatewayParser:draft.gatewayParser})
 }
 if(before.nativeParser||before.subdeviceNativeParser){
  if(draft.dataDownlink||draft.gatewayParser||draft.functions.length||!!draft.nativeParser===!!draft.subdeviceNativeParser)throw invalid()
  if(draft.subdeviceNativeParser)return makeTypeSubdeviceNativeDataCreationDraft({...base,streamIdentifier,subdeviceNativeParser:draft.subdeviceNativeParser})
  if(before.subdeviceNativeParser||!draft.nativeParser)throw invalid()
  return makeTypeNativeDataCreationDraft({...base,streamIdentifier,nativeParser:draft.nativeParser})
 }
 if(before.dataDownlink){
  if(!draft.dataDownlink||draft.subdeviceNativeParser||draft.nativeParser||draft.gatewayParser||draft.functions.length)throw invalid()
  return makeTypeDownlinkCreationDraft({...base,streamIdentifier,dataDownlink:draft.dataDownlink})
 }
 if(draft.nativeParser||draft.subdeviceNativeParser||draft.dataDownlink||draft.gatewayParser)throw invalid()
 return before.kind==='DATA_RPT'?makeTypeDataCreationDraft({...base,streamIdentifier,functions:draft.functions}):makePreprocessCreationDraft({...base,kind:before.kind,filter:draft.filter,functions:draft.functions,propertyOperations:draft.propertyOperations})
}
function typeContentInputStream(content:PreprocessCreationDraft):string{const value=content.streamIdentifier??object(object(parsePreprocessJson(content.preprocessingJson)).trigger!).identifier;const identifier=text(value);if(!/^[A-Za-z0-9_-]{1,64}$/.test(identifier))throw invalid();return identifier}
function typeContentSignature(content:PreprocessCreationDraft){return JSON.stringify([content.name,content.description,content.preprocessingJson,content.streamIdentifier??null,content.nativeParser??null,content.dataDownlink??null,content.gatewayParser??null,content.subdeviceNativeParser??null,content.dataOperations??null])}
export function loadTypePreprocessContent(scope:TypePreprocessEditScope,before:TypePreprocessContent):LoadedTypePreprocessContent{
 if(!scope.scopeKey||!definitionUuid(scope.ruleId)||before.first.id!==scope.ruleId||!definitionUuid(before.versionId))throw invalid();if(scope.deviceSource){if(scope.deviceTypeId!==''||scope.deviceSource.kind!=='DEVICE'||before.kind!=='DATA_RPT'||!sameDeviceSource(scope.deviceSource,before.deviceSource))throw invalid()}else if(!definitionUuid(scope.deviceTypeId)||before.deviceSource.kind!=='DEVICE_TYPE'||before.sourceId!==scope.deviceTypeId)throw invalid()
 exactRevisionCounter(before.first.version);exactRevisionCounter(before.versionNumber)
 let filter=newConditionGroup(),functions:FunctionDraft[]=[],propertyOperations:PropertyOperationsDraft|undefined
 if(!before.dataOperations&&!before.nativeParser&&!before.subdeviceNativeParser&&!before.dataDownlink&&!before.gatewayParser){
  const parsed=object(parsePreprocessJson(before.preprocessingJson)),trigger=object(parsed.trigger!)
  filter=readGroup(trigger.filter!)
  if(parsed.profile==='PROPERTY_TRANSFORM_V1'){if(before.kind!=='ATTRS_RPT_PREPROC')throw invalid();propertyOperations=readPropertyOperationsDraft({profile:parsed.profile,operations:parsed.operations!})}
  else{if(!Array.isArray(parsed.functions))throw invalid();functions=parsed.functions.map(value=>{const fn=object(value);return {...newFunction(),format:text(fn.format) as FunctionDraft['format'],source:text(fn.source)}})}
 }
 const draft:TypePreprocessEditDraft={...(propertyOperations?{propertyOperations}:{}),...(before.dataOperations?{dataOperations:normalizeDataOperations(before.dataOperations)}:{}),name:before.first.name,description:before.first.description??'',filter,functions,...(before.nativeParser?{nativeParser:normalizeModbusRtuParser(before.nativeParser)}:{}),...(before.dataDownlink?{dataDownlink:normalizeDataDownlinkFunction(before.dataDownlink)}:{}),...(before.gatewayParser?{gatewayParser:normalizeGatewayDataParser(before.gatewayParser)}:{}),...(before.subdeviceNativeParser?{subdeviceNativeParser:normalizeSubdeviceModbusRtuParser(before.subdeviceNativeParser)}:{})}
 return {scope:Object.freeze({...scope}),before,draft,signature:typeContentSignature(typeContent(before,draft))}
}
export function typePreprocessDraftChanged(loaded:LoadedTypePreprocessContent,draft:TypePreprocessEditDraft){return loaded.signature!==typeContentSignature(typeContent(loaded.before,draft))}
export function makeTypePreprocessRevisionIntent(loaded:LoadedTypePreprocessContent,draft:TypePreprocessEditDraft,attemptId:string):TypePreprocessRevisionIntent{
 if(!definitionUuid(attemptId)||BigInt(loaded.before.first.version)===max||BigInt(loaded.before.versionNumber)===max)throw invalid()
 const content=typeContent(loaded.before,draft);if(typeContentSignature(content)===loaded.signature)throw new Error('请先修改内容')
 return Object.freeze({...loaded.scope,attemptId,expectedDefinitionVersion:loaded.before.first.version,baseVersionId:loaded.before.versionId,baseVersionNumber:loaded.before.versionNumber,content:Object.freeze(content)})
}
/** 未知时只认完整的新候选；后继推进、标签或活动指针变化不推定原请求成功。 */
export function confirmTypePreprocessRevision(loaded:LoadedTypePreprocessContent,intent:TypePreprocessRevisionIntent,after:TypePreprocessContent):LoadedTypePreprocessContent{
 const next=loadTypePreprocessContent(loaded.scope,after),before=loaded.before
 if(intent.scopeKey!==loaded.scope.scopeKey||intent.deviceTypeId!==loaded.scope.deviceTypeId||intent.ruleId!==loaded.scope.ruleId||intent.baseVersionId!==before.versionId||intent.expectedDefinitionVersion!==before.first.version
  ||BigInt(after.first.version)!==BigInt(intent.expectedDefinitionVersion)+1n||BigInt(after.versionNumber)!==BigInt(intent.baseVersionNumber)+1n||after.versionId===intent.baseVersionId
  ||after.first.status!==before.first.status||after.first.activeVersionId!==before.first.activeVersionId||after.kind!==before.kind||after.streamIdentifier!==(before.kind==='DATA_RPT'?typeContentInputStream(intent.content):before.streamIdentifier)||!sameDeviceSource(after.deviceSource,before.deviceSource)
  ||Object.keys(after.tags).length!==Object.keys(before.tags).length||Object.keys(before.tags).some(key=>after.tags[key]!==before.tags[key])||next.signature!==typeContentSignature(intent.content))throw new Error('修订结果尚未完整核对，请勿重复保存')
 return next
}

/** 组合始终按完整配置保存；一个操作也不降回旧profile。 */
export function makeTypeDataOperationsCreationDraft(input:{name:string;description:string;streamIdentifier:string;dataOperations:DataOperations;tags:import('./rule-tag-draft').RuleTagDraft[]}):PreprocessCreationDraft{
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(input.streamIdentifier))throw new Error('请选择已发布上报数据流')
 return {...metadata(input),tags:ruleTagsValue(input.tags),preprocessingJson:'null',streamIdentifier:input.streamIdentifier,dataOperations:normalizeDataOperations(input.dataOperations)}
}
/** 仅由明确添加第二操作触发，不改变源码、旧版本或活动指针。 */
export function upgradeSingleDataOperation(input:{nativeParser?:ModbusRtuParser;subdeviceNativeParser?:SubdeviceModbusRtuParser;gatewayParser?:GatewayDataParser;dataDownlink?:DataDownlinkFunction;functions:readonly FunctionDraft[]},inputStreams?:readonly DataStreamItem[]):DataOperations{
 const id=newDataOperationId();let operation:DataOperation
 if(input.subdeviceNativeParser)operation={id,kind:'MODBUS_RTU',subdeviceNativeParser:input.subdeviceNativeParser}
 else if(input.nativeParser)operation={id,kind:'MODBUS_RTU',nativeParser:input.nativeParser}
 else if(input.gatewayParser)operation={id,kind:'GATEWAY_PROPERTY',gatewayParser:input.gatewayParser}
 else if(input.dataDownlink)operation={id,kind:'DATA_DOWNLINK',dataDownlink:input.dataDownlink,transportTarget:'ORIGINAL_PHYSICAL_DEVICE'}
 else{if(input.functions.length!==1||input.functions[0]!.format!=='COMMON_JS')throw invalid();if(!inputStreams?.length||inputStreams.some(stream=>stream.identifier!==inputStreams[0]!.identifier||stream.format!==inputStreams[0]!.format))throw new Error('请重新读取完整来源的实际输入流');const text=inputStreams[0]!.format==='TEXT',legacy=text&&inputStreams.every(stream=>!dataStreamTemplate(stream));if(text&&!legacy&&!inputStreams.every(dataStreamTemplate))throw new Error('来源设备的文本输入方式不一致，原函数不能安全组合；请调整来源后重试');operation={id,kind:'PROPERTY',function:{format:'COMMON_JS',source:input.functions[0]!.source},...(legacy?{inputContract:'LEGACY_TEXT_V1' as const}:{})}}
 return normalizeDataOperations({profile:'DATA_OPERATIONS_V1',operations:[operation]})
}
