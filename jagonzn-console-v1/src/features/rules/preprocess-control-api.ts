import {decodeDataOperations,normalizeDataOperations} from './data-operations-api'
import {decodeSubdeviceModbusRtuParser,normalizeSubdeviceModbusRtuParser} from './subdevice-modbus-rtu-parser-api'
import {decodeGatewayDataParser,normalizeGatewayDataParser} from './gateway-data-parser-api'
import {dataDownlinkSourceFormat,decodeDataDownlinkFunction,normalizeDataDownlinkFunction} from './data-downlink-function-api'
import {decodeModbusRtuParser,normalizeModbusRtuParser,modbusRtuSourceFormat} from './modbus-rtu-parser-api'
import {api,ApiError,IdentityChanged,type RequestOptions} from '@/core/http'
import type {Schema,paths} from '@/core/contracts'
import type {ApiUrl} from '@/core/paths'
import {readRawRuleJson,type RawRuleJsonValue} from './raw-rule-json'
import {definitionUuid} from './device-task-definition-port'
import {exactRevisionCounter,preprocessSeedDeviceIds,loadPreprocessVersion,confirmRevision,validatePreprocessFilterJson,type PreprocessVersionSeed,type PreprocessRevisionIntent,loadTypePreprocessContent,confirmTypePreprocessRevision,type TypePreprocessRevisionIntent} from './preprocess-version-editor'
import {ruleTagsValue} from './rule-tag-draft'
import {readPropertyOperationsDraft} from './property-operations-draft'
import {ExactDecimal,parsePreprocessJson,type ExactJson} from './preprocess-exact-json'
import {decodeDeviceSource,deviceSourceMembers,sameDeviceSource,sourceContract,type RuleDeviceSourceContract} from './rule-source-api'
import {sourceIds,type RuleSourceSelection} from './rule-source-selection'
import type {PreprocessCreationDraft} from './preprocess-version-editor'
export type TypeRuleScope={projectId:string;deviceTypeId:string;scopeKey:string;deviceSource?:RuleDeviceSourceContract}
export type PreprocessScope={projectId:string;deviceId:string;scopeKey:string}
export type PreprocessSnapshot={seed:PreprocessVersionSeed;tags:Readonly<Record<string,string>>}
export type PreprocessPreview=Omit<Schema<'MessageRulePreprocessDebugView'>,'guestCpuMillis'>&{guestCpuMillis:string|null}
type Current=()=>boolean
export class LegacyRuleVersion extends Error{}
export class PreprocessOutcomeUnknown extends Error{ruleId?:string;constructor(public cause:unknown){super('结果尚未完整核对，请勿重复提交')}}
export const knownPreprocessRejection=(cause:unknown)=>cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,401,403,404,409].includes(cause.status)
const bad=()=>new Error('规则完整回读不匹配，请重新读取')
const id=(value:string)=>{if(!definitionUuid(value))throw bad();return value.toLowerCase()}
const active=(current:Current)=>{if(!current())throw new IdentityChanged()}
/** 字段投影名由正式生成Schema约束，数值始终来自原token，不能先解为Number。 */
const field=<T>(value:RawRuleJsonValue,key:keyof T)=>value.at([String(key)])
const optional=<T>(value:RawRuleJsonValue,key:keyof T)=>value.optional([String(key)])
const uuid=(value:RawRuleJsonValue)=>id(value.string())
const counter=(value:RawRuleJsonValue)=>exactRevisionCounter(value.integerText())
function nullableText(value:RawRuleJsonValue|undefined){return !value||value.kind==='null'?null:value.string()}
function fields<T>(parts:{[K in keyof T]:string}):string{return '{'+Object.entries(parts).filter(([,v])=>v!==undefined).map(([k,v])=>JSON.stringify(k)+':'+v).join(',')+'}'}
async function decode(pending:Promise<Uint8Array>,current:Current){const bytes=await pending;active(current);return readRawRuleJson(bytes)}
function raw(url:ApiUrl<'get'>,current:Current,options:RequestOptions={}){active(current);return decode(api<Uint8Array>(url,{...options,method:'get',responseType:'bytes',maxResponseBytes:2*1024*1024}),current)}
function post(url:ApiUrl<'post'>,current:Current,options:RequestOptions){active(current);return decode(api<Uint8Array>(url,{...options,method:'post',responseType:'bytes',maxResponseBytes:2*1024*1024}),current)}
function put(url:ApiUrl<'put'>,current:Current,options:RequestOptions){active(current);return decode(api<Uint8Array>(url,{...options,method:'put',responseType:'bytes',maxResponseBytes:2*1024*1024}),current)}
function definition(value:RawRuleJsonValue,ruleId?:string){
 type T=Schema<'MessageRuleView'>
 const row={id:uuid(field<T>(value,'id')),name:field<T>(value,'name').string(),description:nullableText(optional<T>(value,'description')),status:field<T>(value,'status').string(),version:counter(field<T>(value,'version')),activeVersionId:nullableText(optional<T>(value,'activeVersionId'))}
 if(ruleId&&row.id!==id(ruleId)||!row.name||!['PAUSED','ACTIVE','DRAFT'].includes(row.status)||row.status==='DRAFT'&&row.activeVersionId!==null||row.status!=='DRAFT'&&!definitionUuid(row.activeVersionId))throw bad()
 return row
}
function tags(value:RawRuleJsonValue,ruleId:string,version:string){
 type T=Schema<'MessageRuleTagsView'>
 if(uuid(field<T>(value,'ruleId'))!==ruleId||counter(field<T>(value,'version'))!==version)throw bad()
 const input=field<T>(value,'tags');return Object.freeze(ruleTagsValue(input.keys().map((key,index)=>({id:String(index),key,value:input.at([key]).string()}))))
}
const sameTags=(a:Readonly<Record<string,string>>,b:Readonly<Record<string,string>>)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&a[k]===b[k])
function snapshotScope(scope:PreprocessScope,snapshot:PreprocessSnapshot){if(scope.scopeKey!==snapshot.seed.scopeKey||scope.deviceId.toLowerCase()!==snapshot.seed.deviceId)throw bad();return loadPreprocessVersion(snapshot.seed,{scopeKey:scope.scopeKey,deviceId:scope.deviceId,ruleId:snapshot.seed.ruleId})}
/** 按真实来源组合头、固定版本、标签与第二次头；两类创建共享原字节读取，不读参与开关。 */
async function readPreprocessFacts(projectId:string,ruleId:string,current:Current,signal:AbortSignal|undefined,expected:{kind:'DEVICE'|'DEVICE_TYPE';referenceId?:string}){
 const project=id(projectId),rule=id(ruleId),root=`/api/v1/projects/${project}/message-rules/${rule}` as const
 const first=definition(await raw(root,current,{signal}),rule)
 const query:NonNullable<paths['/api/v1/projects/{projectId}/message-rules/{ruleId}/version-history']['get']['parameters']['query']>={limit:1}
 const history=await raw(`${root}/version-history`,current,{query,signal}),items=field<Schema<'RuleManagementPageMessageRuleVersionView'>>(history,'items')
 if(items.arrayLength()!==1)throw bad()
 const latest=items.at([0]),versionId=uuid(field<Schema<'MessageRuleVersionView'>>(latest,'id')),versionNumber=counter(field<Schema<'MessageRuleVersionView'>>(latest,'versionNumber'))
 const version=await raw(`${root}/versions/${versionId}`,current,{signal})
 type V=Schema<'MessageRuleVersionView'>
 if(uuid(field<V>(version,'id'))!==versionId||counter(field<V>(version,'versionNumber'))!==versionNumber)throw bad()
 const preprocessing=field<V>(version,'preprocessing'),propertyPreprocessing=optional<V>(version,'propertyPreprocessing'),sourceFormat=optional<V>(version,'sourceFormat'),nativeParser=optional<V>(version,'nativeParser'),streamIdentifier=optional<V>(version,'streamIdentifier'),dataDownlink=optional<V>(version,'dataDownlink'),gatewayParser=optional<V>(version,'gatewayParser'),subdeviceNativeParser=optional<V>(version,'subdeviceNativeParser'),dataOperations=optional<V>(version,'dataOperations')
 if(propertyPreprocessing&&(!sourceFormat||sourceFormat.kind!=='string'||sourceFormat.string()!=='PROPERTY_TRANSFORM_V1'))throw bad()
 if(dataOperations&&(!sourceFormat||sourceFormat.kind!=='string'||sourceFormat.string()!=='DATA_OPERATIONS_V1'))throw bad()
 if(subdeviceNativeParser&&(!sourceFormat||sourceFormat.kind!=='string'||sourceFormat.string()!=='MODBUS_RTU_SUBDEVICE_V1'))throw bad()
 if(gatewayParser&&(!sourceFormat||sourceFormat.kind!=='string'||sourceFormat.string()!=='DATA_GATEWAY_COMMON_JS_V1'))throw bad()
 if(preprocessing.kind==='null'&&!dataOperations&&!gatewayParser&&!subdeviceNativeParser&&!sourceFormat&&!nativeParser&&!streamIdentifier&&(!dataDownlink||dataDownlink.kind==='null')){const after=definition(await raw(root,current,{signal}),rule);if(JSON.stringify(first)!==JSON.stringify(after))throw bad();throw new LegacyRuleVersion()}
 if(sourceFormat){
  if(sourceFormat.kind!=='string'||preprocessing.kind!=='null')throw bad()
  if(sourceFormat.string()==='PROPERTY_TRANSFORM_V1'){if(!propertyPreprocessing||propertyPreprocessing.kind!=='object'||streamIdentifier||dataOperations||nativeParser||subdeviceNativeParser||gatewayParser||dataDownlink)throw bad()}else if(!streamIdentifier||streamIdentifier.kind!=='string')throw bad()
  if(sourceFormat.string()==='PROPERTY_TRANSFORM_V1'){}
  else if(sourceFormat.string()==='DATA_OPERATIONS_V1'){if(!dataOperations||dataOperations.kind!=='object'||nativeParser||subdeviceNativeParser||gatewayParser||dataDownlink)throw bad()}
  else if(sourceFormat.string()==='MODBUS_RTU_SUBDEVICE_V1'){if(!subdeviceNativeParser||subdeviceNativeParser.kind!=='object'||nativeParser&&nativeParser.kind!=='null'||dataDownlink&&dataDownlink.kind!=='null'||gatewayParser)throw bad()}
  else if(sourceFormat.string()==='DATA_GATEWAY_COMMON_JS_V1'){if(!gatewayParser||gatewayParser.kind!=='object'||nativeParser&&nativeParser.kind!=='null'||dataDownlink&&dataDownlink.kind!=='null')throw bad()}
  else if(['DATA_DOWNLINK_COMMON_JS_V1','DATA_DOWNLINK_COMMON_JS_V2'].includes(sourceFormat.string())){if(!dataDownlink||dataDownlink.kind!=='object'||nativeParser&&nativeParser.kind!=='null')throw bad()}
  else if(!['MODBUS_RTU_V1','MODBUS_RTU_V2','MODBUS_RTU_V3','MODBUS_RTU_V4'].includes(sourceFormat.string())||!nativeParser||nativeParser.kind!=='object'||dataDownlink&&dataDownlink.kind!=='null')throw bad()
 }else if(nativeParser||streamIdentifier||dataDownlink&&dataDownlink.kind!=='null')throw bad()
 if(propertyPreprocessing){const source=field<V>(version,'source').string(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),byte=>byte.toString(16).padStart(2,'0')).join('');active(current);if(digest!==field<V>(version,'sourceSha256').string()||canonicalPreprocessing(parsePreprocessJson(source))!==canonicalPreprocessing(parsePreprocessJson(propertyPreprocessing.raw())))throw bad()}
 const deviceSource=decodeDeviceSource(field<V>(version,'deviceSource')),sourceKind=deviceSource.kind,sourceMembers=deviceSourceMembers(deviceSource),sourceId=sourceMembers.length===1?sourceMembers[0]!:''
 if(sourceKind!==expected.kind||expected.referenceId&&!sourceMembers.includes(id(expected.referenceId)))throw bad()
 type TagQuery=NonNullable<paths['/api/v1/projects/{projectId}/message-rules/{ruleId}/tags']['get']['parameters']['query']>
 const tagQuery:{[K in keyof TagQuery]:TagQuery[K] extends number|undefined?string:TagQuery[K]}={expectedDefinitionVersion:first.version}
 const tagSet=tags(await raw(`${root}/tags`,current,{query:tagQuery,signal}),rule,first.version)
 const second=definition(await raw(root,current,{signal}),rule);if(JSON.stringify(first)!==JSON.stringify(second))throw bad()
 return {first,versionId,versionNumber,sourceId,sourceMembers,deviceSource,source:field<V>(version,'source').string(),sourceSha256:field<V>(version,'sourceSha256').string(),actionsJson:field<V>(version,'actions').raw(),preprocessingJson:propertyPreprocessing?.raw()??preprocessing.raw(),tags:tagSet,sourceFormat:sourceFormat?.string()??null,nativeParserJson:!nativeParser||nativeParser.kind==='null'?null:nativeParser.raw(),dataDownlinkJson:!dataDownlink||dataDownlink.kind==='null'?null:dataDownlink.raw(),gatewayParserJson:gatewayParser?gatewayParser.raw():null,subdeviceNativeParserJson:subdeviceNativeParser?subdeviceNativeParser.raw():null,dataOperationsJson:dataOperations?dataOperations.raw():null,streamIdentifier:streamIdentifier?.string()??null}
}
/** 旧设备编辑保持原DEVICE范围和领域种子，不将类型ID装入设备字段。 */
export async function readPreprocessSnapshot(scope:PreprocessScope,ruleId:string,current:Current,signal?:AbortSignal):Promise<PreprocessSnapshot>{
 if(!scope.scopeKey)throw bad()
 const facts=await readPreprocessFacts(scope.projectId,ruleId,current,signal,{kind:'DEVICE',referenceId:scope.deviceId||undefined}),device=facts.sourceMembers.length===1?facts.sourceId:''
 const {first,versionId,versionNumber}=facts
 const seed:PreprocessVersionSeed={scopeKey:scope.scopeKey,deviceId:device,ruleId:id(ruleId),versionId,latestVersionId:versionId,definitionVersion:first.version,versionNumber,name:first.name,description:first.description,status:first.status as PreprocessVersionSeed['status'],activeVersionId:first.activeVersionId,deviceSourceKind:'DEVICE',deviceSourceId:facts.sourceId,...(facts.sourceMembers.length>1?{deviceSourceIds:facts.sourceMembers}:{}),source:facts.source,actionsJson:facts.actionsJson,preprocessingJson:facts.preprocessingJson}
 const checked=loadPreprocessVersion(seed,{scopeKey:scope.scopeKey,deviceId:device,ruleId:id(ruleId)});active(current)
 return {seed:{...checked.seed},tags:facts.tags}
}
async function writeThenRead<T>(write:()=>Promise<RawRuleJsonValue>,verify:(value:RawRuleJsonValue)=>Promise<T>):Promise<T>{
 let accepted=false
 try{const value=await write();accepted=true;return await verify(value)}catch(cause){if(!accepted&&knownPreprocessRejection(cause))throw cause;throw new PreprocessOutcomeUnknown(cause)}
}
/** 仅用于比较原件，十进制按精确值规范化且对象排序；不重写请求数字。 */
function canonicalPreprocessing(value:ExactJson):string{
 if(value instanceof ExactDecimal)return value.canonical()
 if(Array.isArray(value))return '['+value.map(canonicalPreprocessing).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalPreprocessing(value[key]!)).join(',')+'}'
 return JSON.stringify(value)
}
/** 正式配置字段按不可变版本格式分派；不会把原生配置生成源码。 */
function preprocessingActions(value:RawRuleJsonValue){
 const profile=value.optional(['profile'])
 if(profile){
  type D=Schema<'MessageRulePropertyPreprocessDefinition'>
  const content=fields<Schema<'MessageRulePropertyPreprocessOperations'>>({profile:field<D>(value,'profile').raw(),operations:field<D>(value,'operations').raw()})
  readPropertyOperationsDraft(parsePreprocessJson(content))
  if(field<Schema<'MessageRuleTrigger'>>(field<D>(value,'trigger'),'kind').string()!=='ATTRS_RPT_PREPROC')throw bad()
  return {propertyOperations:content}
 }
 return {functions:field<Schema<'MessageRulePreprocessDefinition'>>(value,'functions').raw()}
}
function preprocessingSource(value:RawRuleJsonValue){return value.optional(['profile'])?value.raw():field<Schema<'MessageRulePreprocessDefinition'>>(value,'functions').at([0,'source']).string()}
function versionPreprocessing(value:RawRuleJsonValue){type V=Schema<'MessageRuleVersionView'>;return optional<V>(value,'sourceFormat')?.string()==='PROPERTY_TRANSFORM_V1'?field<V>(value,'propertyPreprocessing'):field<V>(value,'preprocessing')}
/** TYPE原件创建；不产生设备种子，不调用旧设备参与或修订端口。 */
export async function createTypePreprocessor(scope:TypeRuleScope,draft:PreprocessCreationDraft,attemptId:string,current:Current,signal?:AbortSignal):Promise<{id:string;versionId:string;facts:Awaited<ReturnType<typeof readTypePreprocessor>>}>{
 const project=id(scope.projectId),source=scope.deviceSource,type=source?.kind==='DEVICE'?'':id(scope.deviceTypeId);id(attemptId);if(!scope.scopeKey)throw bad();if(source){deviceSourceMembers(source);if(source.kind!=='DEVICE')throw bad()}
 let body:string
 if(draft.dataOperations){
  if(draft.nativeParser||draft.subdeviceNativeParser||draft.gatewayParser||draft.dataDownlink||draft.preprocessingJson!=='null'||!draft.streamIdentifier||!/^[A-Za-z0-9_-]{1,64}$/.test(draft.streamIdentifier))throw bad()
  body=fields<Schema<'DeviceMessageRulePreprocessCreateRequest'>>({name:JSON.stringify(draft.name),description:JSON.stringify(draft.description??''),kind:'"DATA_RPT"',streamIdentifier:JSON.stringify(draft.streamIdentifier),filter:'null',dataOperations:JSON.stringify(normalizeDataOperations(draft.dataOperations)),tags:JSON.stringify(draft.tags)})
 }else if(draft.subdeviceNativeParser){
  if(draft.nativeParser||draft.dataDownlink||draft.gatewayParser||draft.preprocessingJson!=='null'||!draft.streamIdentifier||!/^[A-Za-z0-9_-]{1,64}$/.test(draft.streamIdentifier))throw bad()
  body=fields<Schema<'DeviceMessageRulePreprocessCreateRequest'>>({name:JSON.stringify(draft.name),description:JSON.stringify(draft.description??''),kind:'"DATA_RPT"',streamIdentifier:JSON.stringify(draft.streamIdentifier),filter:'null',subdeviceNativeParser:JSON.stringify(normalizeSubdeviceModbusRtuParser(draft.subdeviceNativeParser)),tags:JSON.stringify(draft.tags)})
 }else if(draft.gatewayParser){
  if(draft.nativeParser||draft.dataDownlink||draft.preprocessingJson!=='null'||!draft.streamIdentifier||!/^[A-Za-z0-9_-]{1,64}$/.test(draft.streamIdentifier))throw bad()
  body=fields<Schema<'DeviceMessageRulePreprocessCreateRequest'>>({name:JSON.stringify(draft.name),description:JSON.stringify(draft.description??''),kind:'"DATA_RPT"',streamIdentifier:JSON.stringify(draft.streamIdentifier),filter:'null',gatewayParser:JSON.stringify(normalizeGatewayDataParser(draft.gatewayParser)),tags:JSON.stringify(draft.tags)})
 }else if(draft.dataDownlink){
  if(draft.nativeParser||draft.preprocessingJson!=='null'||!draft.streamIdentifier||!/^[A-Za-z0-9_-]{1,64}$/.test(draft.streamIdentifier))throw bad()
  body=fields<Schema<'DeviceMessageRulePreprocessCreateRequest'>>({name:JSON.stringify(draft.name),description:JSON.stringify(draft.description??''),kind:'"DATA_RPT"',streamIdentifier:JSON.stringify(draft.streamIdentifier),filter:'null',dataDownlink:JSON.stringify(normalizeDataDownlinkFunction(draft.dataDownlink)),tags:JSON.stringify(draft.tags)})
 }else if(draft.nativeParser){
  if(draft.preprocessingJson!=='null'||!draft.streamIdentifier||!/^[A-Za-z0-9_-]{1,64}$/.test(draft.streamIdentifier))throw bad()
  body=fields<Schema<'DeviceMessageRulePreprocessCreateRequest'>>({name:JSON.stringify(draft.name),description:JSON.stringify(draft.description??''),kind:'"DATA_RPT"',streamIdentifier:JSON.stringify(draft.streamIdentifier),filter:'null',nativeParser:JSON.stringify(normalizeModbusRtuParser(draft.nativeParser)),tags:JSON.stringify(draft.tags)})
 }else{
  const preprocessing=readRawRuleJson(new TextEncoder().encode(draft.preprocessingJson)),trigger=field<Schema<'MessageRulePreprocessDefinition'>>(preprocessing,'trigger')
  body=fields<Schema<'DeviceMessageRulePreprocessCreateRequest'>>({name:JSON.stringify(draft.name),description:JSON.stringify(draft.description??''),kind:field<Schema<'MessageRuleTrigger'>>(trigger,'kind').raw(),filter:field<Schema<'MessageRuleTrigger'>>(trigger,'kind').string()==='DATA_RPT'?'null':field<Schema<'MessageRuleTrigger'>>(trigger,'filter').raw(),...preprocessingActions(preprocessing),tags:JSON.stringify(draft.tags),...(field<Schema<'MessageRuleTrigger'>>(trigger,'kind').string()==='DATA_RPT'?{streamIdentifier:field<Schema<'MessageRuleTrigger'>>(trigger,'identifier').raw()}:{})})
 }
 if(source){if(JSON.parse(body).kind!=='DATA_RPT')throw bad();body=fields<Schema<'MessageRuleDataCreateRequest'>>({deviceSource:JSON.stringify(source),content:body})}
 let createdId:string|undefined
 try{return await writeThenRead(()=>post(source?`/api/v1/projects/${project}/message-rules/data-parsers`:`/api/v1/projects/${project}/device-types/${type}/message-rules/preprocessors`,current,{rawBody:body,signal,headers:{'Content-Type':'application/json','Idempotency-Key':attemptId}}),async value=>{
  const created=definition(value);createdId=created.id
  if(created.status!=='PAUSED'||created.version!=='1'||created.name!==draft.name||created.description!==(draft.description??null))throw bad()
  const facts=await recoverTypePreprocessor(scope,created.id,draft,current,signal)
  if(facts.versionId!==created.activeVersionId)throw bad()
  return {id:created.id,versionId:facts.versionId,facts}
 })}catch(cause){if(cause instanceof PreprocessOutcomeUnknown)cause.ruleId=createdId;throw cause}
}
/** 唯一原子创建包括完整标签；任何成功正文/后继读回错误均保持未知，绝不补写或重放。 */
export async function createPreprocessor(scope:PreprocessScope,draft:PreprocessCreationDraft,attemptId:string,current:Current,signal?:AbortSignal):Promise<PreprocessSnapshot>{
 const project=id(scope.projectId),device=id(scope.deviceId);id(attemptId)
 const expectedJson=draft.preprocessingJson,preprocessing=readRawRuleJson(new TextEncoder().encode(expectedJson)),trigger=field<Schema<'MessageRulePreprocessDefinition'>>(preprocessing,'trigger')
 const body=fields<Schema<'DeviceMessageRulePreprocessCreateRequest'>>({name:JSON.stringify(draft.name),description:JSON.stringify(draft.description??''),kind:field<Schema<'MessageRuleTrigger'>>(trigger,'kind').raw(),filter:field<Schema<'MessageRuleTrigger'>>(trigger,'filter').raw(),...preprocessingActions(preprocessing),tags:JSON.stringify(draft.tags)})
 const wanted=ruleTagsValue(Object.entries(draft.tags).map(([key,value],index)=>({id:String(index),key,value})))
 return writeThenRead(()=>post(`/api/v1/projects/${project}/devices/${device}/message-rules/preprocessors`,current,{method:'post',rawBody:body,headers:{'Content-Type':'application/json','Idempotency-Key':attemptId}}),async value=>{
  const created=definition(value)
  if(created.status!=='PAUSED'||created.version!=='1'||created.name!==draft.name||created.description!==(draft.description??null))throw bad()
  const result=await readPreprocessSnapshot(scope,created.id,current,signal)
  if(result.seed.definitionVersion!=='1'||result.seed.versionNumber!=='1'||result.seed.status!=='PAUSED'||result.seed.versionId!==created.activeVersionId||result.seed.activeVersionId!==created.activeVersionId||result.seed.name!==created.name||result.seed.description!==created.description||!sameTags(wanted,result.tags))throw bad()
  const expected=loadPreprocessVersion({...result.seed,preprocessingJson:expectedJson,source:preprocessingSource(preprocessing)},{scopeKey:scope.scopeKey,deviceId:device,ruleId:created.id})
  if(expected.signature!==loadPreprocessVersion(result.seed,result.seed).signature)throw bad()
  return result
 })
}
/** 精确CAS与filter原JSON在正式请求上序列化；不经Number或旧source/actions修订。 */
export async function revisePreprocessor(scope:PreprocessScope,before:PreprocessSnapshot,intent:PreprocessRevisionIntent,current:Current,signal?:AbortSignal):Promise<PreprocessSnapshot>{
 const project=id(scope.projectId),device=scope.deviceId?id(scope.deviceId):'',rule=id(intent.ruleId)
 snapshotScope(scope,before)
 if(intent.ruleId!==before.seed.ruleId||intent.scopeKey!==scope.scopeKey||intent.deviceId.toLowerCase()!==device||intent.expectedDefinitionVersion!==before.seed.definitionVersion||intent.baseVersionId!==before.seed.versionId)throw bad()
 exactRevisionCounter(intent.expectedDefinitionVersion);id(intent.attemptId)
 const parsed=readRawRuleJson(new TextEncoder().encode(intent.preprocessingJson)),trigger=field<Schema<'MessageRulePreprocessDefinition'>>(parsed,'trigger')
 const body=fields<Schema<'DeviceMessageRulePreprocessReviseRequest'>>({expectedVersion:intent.expectedDefinitionVersion,baseVersionId:JSON.stringify(id(intent.baseVersionId)),name:JSON.stringify(intent.name),description:JSON.stringify(intent.description??''),kind:field<Schema<'MessageRuleTrigger'>>(trigger,'kind').raw(),filter:field<Schema<'MessageRuleTrigger'>>(trigger,'filter').raw(),...preprocessingActions(parsed)})
 return writeThenRead(()=>device?post(`/api/v1/projects/${project}/devices/${device}/message-rules/${rule}/preprocessing-versions`,current,{method:'post',rawBody:body,headers:{'Content-Type':'application/json','Idempotency-Key':intent.attemptId}}):put(`/api/v1/projects/${project}/message-rules/${rule}/preprocessing`,current,{rawBody:body,headers:{'Content-Type':'application/json','Idempotency-Key':intent.attemptId}}),async value=>{
  const receipt=definition(field<Schema<'MessageRulePreprocessRevisionView'>>(value,'definition'),rule),saved=field<Schema<'MessageRulePreprocessRevisionView'>>(value,'savedVersion')
  const result=await readPreprocessSnapshot(scope,rule,current,signal)
  if(receipt.version!==result.seed.definitionVersion||receipt.name!==result.seed.name||receipt.description!==result.seed.description||receipt.status!==result.seed.status||receipt.activeVersionId!==result.seed.activeVersionId||uuid(field<Schema<'MessageRuleVersionView'>>(saved,'id'))!==result.seed.versionId||counter(field<Schema<'MessageRuleVersionView'>>(saved,'versionNumber'))!==result.seed.versionNumber||!sameTags(before.tags,result.tags))throw bad()
  type V=Schema<'MessageRuleVersionView'>
  const savedSource=field<V>(saved,'deviceSource')
  if(!sameDeviceSource(decodeDeviceSource(savedSource),preprocessSeedSource(before.seed)))throw bad()
  const echoed=loadPreprocessVersion({...result.seed,source:field<V>(saved,'source').string(),actionsJson:field<V>(saved,'actions').raw(),preprocessingJson:versionPreprocessing(saved).raw()},result.seed)
  if(echoed.signature!==loadPreprocessVersion(result.seed,result.seed).signature)throw bad()
  confirmRevision(loadPreprocessVersion(before.seed,before.seed),intent,result.seed);return result
 })
}
/** 标签是定义全集CAS；同值可不增版，读回仍需完整版本和头一致。 */
export async function replacePreprocessorTags(scope:PreprocessScope,before:PreprocessSnapshot,input:Record<string,string>,attemptId:string,current:Current,signal?:AbortSignal):Promise<PreprocessSnapshot>{
 snapshotScope(scope,before)
 const project=id(scope.projectId),rule=id(before.seed.ruleId),wanted=ruleTagsValue(Object.entries(input).map(([key,value],i)=>({id:String(i),key,value})));id(attemptId)
 const body=fields<Schema<'MessageRuleTagsWriteRequest'>>({expectedVersion:exactRevisionCounter(before.seed.definitionVersion),tags:JSON.stringify(wanted)})
 return writeThenRead(()=>put(`/api/v1/projects/${project}/message-rules/${rule}/tags`,current,{method:'put',rawBody:body,headers:{'Content-Type':'application/json','Idempotency-Key':attemptId}}),async value=>{
  const expected=String(BigInt(before.seed.definitionVersion)+(sameTags(before.tags,wanted)?0n:1n));if(!sameTags(tags(value,rule,expected),wanted))throw bad()
  const result=await readPreprocessSnapshot(scope,rule,current,signal)
  if(result.seed.definitionVersion!==expected||result.seed.versionId!==before.seed.versionId||result.seed.versionNumber!==before.seed.versionNumber||result.seed.name!==before.seed.name||result.seed.description!==before.seed.description||result.seed.status!==before.seed.status||result.seed.activeVersionId!==before.seed.activeVersionId||result.seed.preprocessingJson!==before.seed.preprocessingJson||!sameTags(result.tags,wanted))throw bad()
  return result
 })
}
/** 样例是原JSON字符串，DEBUG审计返回不等同生产阶段、派发或设备效果。 */
export async function previewPreprocessor(scope:PreprocessScope,snapshot:PreprocessSnapshot,sampleJson:string,attemptId:string,current:Current):Promise<PreprocessPreview>{
 const loaded=snapshotScope(scope,snapshot)
 if(new TextEncoder().encode(sampleJson).length>65536||readRawRuleJson(new TextEncoder().encode(sampleJson)).kind!=='object')throw new Error('样例须为65536 UTF8字节以内的完整JSON对象')
 const project=id(scope.projectId),rule=id(snapshot.seed.ruleId);id(attemptId)
 const body:Schema<'MessageRulePreprocessDebugRequest'>={versionId:id(snapshot.seed.versionId),sampleJson}
 return writeThenRead(()=>post(`/api/v1/projects/${project}/message-rules/${rule}/preprocessing-preview`,current,{method:'post',body,headers:{'Idempotency-Key':attemptId}}),async value=>{
  type T=Schema<'MessageRulePreprocessDebugView'>
  const integer=(key:keyof T)=>{const raw=field<T>(value,key).integerText(),n=Number(raw);if(!Number.isSafeInteger(n)||n<0||n>32)throw bad();return n}
  const status=field<T>(value,'status').string(),outputJson=nullableText(optional<T>(value,'outputJson')),cpu=optional<T>(value,'guestCpuMillis'),guestCpuMillis=!cpu||cpu.kind==='null'?null:cpu.integerText()
  const result={eventId:uuid(field<T>(value,'eventId')),versionId:uuid(field<T>(value,'versionId')),matched:field<T>(value,'matched').boolean(),functionsAttempted:integer('functionsAttempted'),functionsSucceeded:integer('functionsSucceeded'),status:status as T['status'],resultCode:field<T>(value,'resultCode').string(),outputJson,guestCpuMillis,duration:field<T>(value,'duration').string(),occurredAt:field<T>(value,'occurredAt').string()}
  if(result.versionId!==snapshot.seed.versionId||!['SUCCESS','FAILURE','TIMEOUT','RESOURCE_EXHAUSTED','REJECTED'].includes(status)||result.functionsSucceeded>result.functionsAttempted||result.functionsAttempted>(loaded.draft.propertyOperations?.operations.filter(row=>row.kind==='FUNCTION').length??loaded.draft.functions.length)||!result.matched&&(result.functionsAttempted!==0||result.functionsSucceeded!==0)||!result.resultCode||!Number.isFinite(Date.parse(result.occurredAt))||guestCpuMillis!==null&&(!/^\d+$/.test(guestCpuMillis)||BigInt(guestCpuMillis)>9223372036854775807n))throw bad()
  if(outputJson!==null){if(new TextEncoder().encode(outputJson).length>65536)throw bad();const kind=readRawRuleJson(new TextEncoder().encode(outputJson)).kind;if(kind!=='object'&&kind!=='null')throw bad()}
  active(current);return result
 })
}
/** 复用既有同步移除合同，使用完整快照的精确CAS；失败不自动重放。 */
export async function removePreprocessor(scope:PreprocessScope,snapshot:PreprocessSnapshot,attemptId:string,current:Current):Promise<void>{
 snapshotScope(scope,snapshot);id(attemptId);active(current)
 await api<void>(`/api/v1/projects/${id(scope.projectId)}/message-rules/${id(snapshot.seed.ruleId)}`,{method:'delete',query:{expectedVersion:exactRevisionCounter(snapshot.seed.definitionVersion)},headers:{'Idempotency-Key':attemptId}})
 active(current)
}

/** 正式独立设备许可的精确读模型；两个long保持十进制词法，不混展示版本号。 */
export type ExactRuleParticipation=Omit<Schema<'RuleDeviceParticipationControl'>,'version'|'definitionVersion'>&{version:string;definitionVersion:string}
export type ExactRuleControlDefinition=ReturnType<typeof definition>
export type RuleControlScope={projectId:string;ruleId:string;scopeKey:string}
/** 读取既有定义头，供旧规则与完整前处理共用；不要求把旧规则转换为前处理模型。 */
export async function readRuleControlDefinition(scope:RuleControlScope,current:Current,signal?:AbortSignal):Promise<ExactRuleControlDefinition>{
 if(!scope.scopeKey)throw bad()
 return definition(await raw(`/api/v1/projects/${id(scope.projectId)}/message-rules/${id(scope.ruleId)}`,current,{signal}),scope.ruleId)
}
function participation(value:RawRuleJsonValue,device:string,definitionVersion:string):ExactRuleParticipation{
 type T=Schema<'RuleDeviceParticipationControl'>
 const result={deviceId:uuid(field<T>(value,'deviceId')),allowed:field<T>(value,'allowed').boolean(),version:counter(field<T>(value,'version')),definitionVersion:counter(field<T>(value,'definitionVersion'))}
 if(result.deviceId!==device||result.definitionVersion!==definitionVersion)throw bad()
 return result
}
function controlScope(scope:RuleControlScope,header:ExactRuleControlDefinition,device:string){
 if(!scope.scopeKey||id(scope.ruleId)!==header.id||!['ACTIVE','PAUSED'].includes(header.status)||!definitionUuid(header.activeVersionId))throw bad()
 exactRevisionCounter(header.version);return id(device)
}
/** 真实目录调用方只提供本页设备；来源/角色仍由既有点读端点权威复验。 */
export async function readRuleParticipation(scope:RuleControlScope,header:ExactRuleControlDefinition,device:string,current:Current,signal?:AbortSignal):Promise<ExactRuleParticipation>{
 const target=controlScope(scope,header,device)
 type Query=NonNullable<paths['/api/v1/projects/{projectId}/message-rules/{ruleId}/device-participation/{deviceId}']['get']['parameters']['query']>
 const query:{[K in keyof Query]:Query[K] extends number|undefined?string:Query[K]}={expectedDefinitionVersion:header.version}
 return participation(await raw(`/api/v1/projects/${id(scope.projectId)}/message-rules/${id(scope.ruleId)}/device-participation/${target}`,current,{query,signal}),target,header.version)
}
/** 一次既有双CAS PUT后核许可及原定义头；未知不重放，不启用或追加版本。 */
export async function changeRuleParticipation(scope:RuleControlScope,header:ExactRuleControlDefinition,device:string,before:ExactRuleParticipation,allowed:boolean,attemptId:string,current:Current,signal?:AbortSignal):Promise<ExactRuleParticipation>{
 const target=controlScope(scope,header,device);id(attemptId)
 if(typeof allowed!=='boolean'||before.deviceId!==target||before.definitionVersion!==header.version)throw bad()
 exactRevisionCounter(before.version)
 if(before.allowed===allowed)return before
 const expected=exactRevisionCounter(String(BigInt(before.version)+1n))
 const body=fields<Schema<'RuleDeviceParticipationRequest'>>({allowed:JSON.stringify(allowed),expectedVersion:before.version,expectedDefinitionVersion:header.version})
 return writeThenRead(()=>put(`/api/v1/projects/${id(scope.projectId)}/message-rules/${id(scope.ruleId)}/device-participation/${target}`,current,{rawBody:body,headers:{'Content-Type':'application/json','Idempotency-Key':attemptId}}),async value=>{
  const result=participation(value,target,header.version)
  if(result.allowed!==allowed||result.version!==expected)throw bad()
  const verified=await readRuleParticipation(scope,header,target,current,signal)
  if(verified.allowed!==result.allowed||verified.version!==result.version)throw bad()
  const head=await readRuleControlDefinition(scope,current,signal)
  if((['id','version','name','description','status','activeVersionId'] as const).some(key=>head[key]!==header[key]))throw bad()
  return verified
 })
}
function snapshotDefinition(snapshot:PreprocessSnapshot):ExactRuleControlDefinition{
 const seed=snapshot.seed;return {id:seed.ruleId,name:seed.name,description:seed.description,status:seed.status,version:seed.definitionVersion,activeVersionId:seed.activeVersionId}
}
/** 既有完整前处理调用保留全快照/scope验证，共用同一许可实现。 */
export async function readPreprocessorParticipation(scope:PreprocessScope,snapshot:PreprocessSnapshot,current:Current,signal?:AbortSignal):Promise<ExactRuleParticipation>{
 snapshotScope(scope,snapshot)
 return readRuleParticipation({...scope,ruleId:snapshot.seed.ruleId},snapshotDefinition(snapshot),scope.deviceId,current,signal)
}
/** 完整模型只是调用方校验前置，不为旧规则伪造一个前处理版本。 */
export async function changePreprocessorParticipation(scope:PreprocessScope,snapshot:PreprocessSnapshot,before:ExactRuleParticipation,allowed:boolean,attemptId:string,current:Current,signal?:AbortSignal):Promise<ExactRuleParticipation>{
 snapshotScope(scope,snapshot)
 return changeRuleParticipation({...scope,ruleId:snapshot.seed.ruleId},snapshotDefinition(snapshot),scope.deviceId,before,allowed,attemptId,current,signal)
}

export type ExactRuleDeviceDirectoryItem=Omit<Schema<'RuleDeviceDirectoryItem'>,'version'>&{version:string}
export type ExactRuleDeviceDirectoryPage=Omit<Schema<'RuleDeviceDirectoryPage'>,'definitionVersion'|'items'>&{definitionVersion:string;items:ExactRuleDeviceDirectoryItem[]}
/** 只在正式closed DTO上查字段，沿既有原文工具投影，不增加JSON扫描器。 */
function closed<T>(value:RawRuleJsonValue,keys:readonly(keyof T)[]){if(value.keys().some(key=>!keys.includes(key as keyof T)))throw bad()}
/** 唯一正式570目录操作；真实来源/活动版本来自服务端，不用导航设备猜行。 */
export async function readRuleDeviceDirectory(scope:RuleControlScope,header:ExactRuleControlDefinition,cursor:string|undefined,limit:number,current:Current,signal?:AbortSignal,seenCursors:readonly(string|undefined)[]=[]):Promise<ExactRuleDeviceDirectoryPage>{
 if(!scope.scopeKey||id(scope.ruleId)!==header.id||!['ACTIVE','PAUSED'].includes(header.status)||!definitionUuid(header.activeVersionId)||!Number.isInteger(limit)||limit<1||limit>50||cursor!==undefined&&(!cursor||cursor.length>2048))throw bad()
 exactRevisionCounter(header.version)
 type Query=NonNullable<paths['/api/v1/projects/{projectId}/message-rules/{ruleId}/devices']['get']['parameters']['query']>
 const query:Omit<Query,'expectedDefinitionVersion'>&{expectedDefinitionVersion:string}={expectedDefinitionVersion:header.version,cursor,limit}
 const value=await raw(`/api/v1/projects/${id(scope.projectId)}/message-rules/${id(scope.ruleId)}/devices`,current,{query,signal})
 type P=Schema<'RuleDeviceDirectoryPage'>;type I=Schema<'RuleDeviceDirectoryItem'>;type S=Schema<'RuleDeviceSource'>
 closed<P>(value,['ruleId','definitionVersion','activeVersionId','deviceSource','readOnly','items','nextCursor'])
 const ruleId=uuid(field<P>(value,'ruleId')),definitionVersion=counter(field<P>(value,'definitionVersion')),activeVersionId=uuid(field<P>(value,'activeVersionId'))
 if(ruleId!==header.id||definitionVersion!==header.version||activeVersionId!==header.activeVersionId)throw bad()
 const source=field<P>(value,'deviceSource'),deviceSource=decodeDeviceSource(source),kind=deviceSource.kind,sourceMembers=deviceSourceMembers(deviceSource),referenceId=deviceSource.referenceId??null
 if(!['DEVICE','DEVICE_TYPE','LEGACY_PROJECT'].includes(kind)||(kind==='LEGACY_PROJECT'?referenceId!==null:sourceMembers.length===0))throw bad()
 const rawItems=field<P>(value,'items');if(rawItems.arrayLength()>limit)throw bad()
 const seen=new Set<string>(),items:ExactRuleDeviceDirectoryItem[]=[]
 for(let index=0;index<rawItems.arrayLength();index++){
  const row=rawItems.at([index]);closed<I>(row,['deviceId','name','deviceTypeId','allowed','version'])
  const deviceId=uuid(field<I>(row,'deviceId')),name=field<I>(row,'name').string(),deviceTypeId=nullableText(optional<I>(row,'deviceTypeId')),allowed=field<I>(row,'allowed').boolean(),version=counter(field<I>(row,'version'))
  if(!name.trim()||seen.has(deviceId)||deviceTypeId!==null&&!definitionUuid(deviceTypeId)||kind==='DEVICE'&&!sourceMembers.includes(deviceId)||kind==='DEVICE_TYPE'&&deviceTypeId!==referenceId)throw bad()
  seen.add(deviceId);items.push({deviceId,name,deviceTypeId,allowed,version})
 }
 const nextCursor=nullableText(optional<P>(value,'nextCursor'))
 if(kind==='DEVICE'&&sourceMembers.length===1&&(items.length>1||nextCursor!==null)||nextCursor!==null&&(!nextCursor||nextCursor.length>2048||!items.length||nextCursor===cursor||seenCursors.includes(nextCursor)))throw bad()
 active(current)
 return {ruleId,definitionVersion,activeVersionId,deviceSource,readOnly:field<P>(value,'readOnly').boolean(),items,nextCursor}
}

// TYPE旧wrapper与DEVICE DATA共享不可变格式读取；DEVICE不构造属性前处理种子。
export async function readTypePreprocessor(scope:TypeRuleScope,ruleId:string,current:Current,signal?:AbortSignal,readCurrentSource=false){
 if(!scope.scopeKey)throw bad()
 const facts=await readPreprocessFacts(scope.projectId,ruleId,current,signal,scope.deviceSource?.kind==='DEVICE'?{kind:'DEVICE'}:{kind:'DEVICE_TYPE',referenceId:scope.deviceTypeId});if(scope.deviceSource&&!readCurrentSource&&!sameDeviceSource(facts.deviceSource,scope.deviceSource))throw bad()
 if(facts.sourceFormat==='PROPERTY_TRANSFORM_V1'){
  if(scope.deviceSource||facts.actionsJson.trim()!=='[]')throw bad()
  const parsed=readRawRuleJson(new TextEncoder().encode(facts.preprocessingJson)),trigger=field<Schema<'MessageRulePropertyPreprocessDefinition'>>(parsed,'trigger')
  if([...parsed.keys()].sort().join(',')!=='operations,profile,trigger'||[...trigger.keys()].sort().join(',')!=='filter,identifier,kind'||field<Schema<'MessageRuleTrigger'>>(trigger,'kind').string()!=='ATTRS_RPT_PREPROC'||field<Schema<'MessageRuleTrigger'>>(trigger,'identifier').kind!=='null')throw bad()
  validatePreprocessFilterJson(field<Schema<'MessageRuleTrigger'>>(trigger,'filter').raw(),'ATTRS_RPT_PREPROC');preprocessingActions(parsed)
  return {...facts,kind:'ATTRS_RPT_PREPROC' as const,streamIdentifier:null,nativeParser:null,dataDownlink:null,gatewayParser:null,subdeviceNativeParser:null,dataOperations:null}
 }
 if(facts.sourceFormat==='DATA_OPERATIONS_V1'){
  if(!facts.dataOperationsJson||facts.nativeParserJson||facts.subdeviceNativeParserJson||facts.gatewayParserJson||facts.dataDownlinkJson||facts.preprocessingJson!=='null'||!facts.streamIdentifier||!/^[A-Za-z0-9_-]{1,64}$/.test(facts.streamIdentifier)||facts.actionsJson.trim()!=='[]')throw bad()
  const dataOperations=decodeDataOperations(readRawRuleJson(new TextEncoder().encode(facts.dataOperationsJson))),sourceOperations=decodeDataOperations(readRawRuleJson(new TextEncoder().encode(facts.source)))
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(facts.source))),byte=>byte.toString(16).padStart(2,'0')).join('');active(current)
  if(JSON.stringify(dataOperations)!==JSON.stringify(sourceOperations)||digest!==facts.sourceSha256)throw bad()
  return {...facts,kind:'DATA_RPT' as const,streamIdentifier:facts.streamIdentifier,nativeParser:null,dataDownlink:null,gatewayParser:null,subdeviceNativeParser:null,dataOperations}
 }
 if(facts.sourceFormat==='MODBUS_RTU_SUBDEVICE_V1'){
  if(!facts.subdeviceNativeParserJson||facts.nativeParserJson||facts.dataDownlinkJson||facts.gatewayParserJson||facts.preprocessingJson!=='null'||!facts.streamIdentifier||!/^[A-Za-z0-9_-]{1,64}$/.test(facts.streamIdentifier)||facts.actionsJson.trim()!=='[]')throw bad()
  const subdeviceNativeParser=decodeSubdeviceModbusRtuParser(readRawRuleJson(new TextEncoder().encode(facts.subdeviceNativeParserJson))),sourceParser=decodeSubdeviceModbusRtuParser(readRawRuleJson(new TextEncoder().encode(facts.source)))
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(facts.source))),byte=>byte.toString(16).padStart(2,'0')).join('');active(current)
  if(JSON.stringify(subdeviceNativeParser)!==JSON.stringify(sourceParser)||digest!==facts.sourceSha256)throw bad()
  return {...facts,kind:'DATA_RPT' as const,streamIdentifier:facts.streamIdentifier,nativeParser:null,dataDownlink:null,gatewayParser:null,subdeviceNativeParser,dataOperations:null}
 }
 if(facts.sourceFormat==='DATA_GATEWAY_COMMON_JS_V1'){
  if(!facts.gatewayParserJson||facts.nativeParserJson||facts.dataDownlinkJson||facts.preprocessingJson!=='null'||!facts.streamIdentifier||!/^[A-Za-z0-9_-]{1,64}$/.test(facts.streamIdentifier)||facts.actionsJson.trim()!=='[]')throw bad()
  const gatewayParser=decodeGatewayDataParser(readRawRuleJson(new TextEncoder().encode(facts.gatewayParserJson)))
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(facts.source))),byte=>byte.toString(16).padStart(2,'0')).join('');active(current)
  if(gatewayParser.source!==facts.source||digest!==facts.sourceSha256)throw bad()
  return {...facts,kind:'DATA_RPT' as const,streamIdentifier:facts.streamIdentifier,nativeParser:null,dataDownlink:null,gatewayParser,subdeviceNativeParser:null,dataOperations:null}
 }
 if(facts.sourceFormat==='DATA_DOWNLINK_COMMON_JS_V1'||facts.sourceFormat==='DATA_DOWNLINK_COMMON_JS_V2'){
  if(!facts.dataDownlinkJson||facts.nativeParserJson||facts.preprocessingJson!=='null'||!facts.streamIdentifier||!/^[A-Za-z0-9_-]{1,64}$/.test(facts.streamIdentifier)||facts.actionsJson.trim()!=='[]')throw bad()
  const dataDownlink=decodeDataDownlinkFunction(readRawRuleJson(new TextEncoder().encode(facts.dataDownlinkJson)))
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(facts.source))),byte=>byte.toString(16).padStart(2,'0')).join('');active(current)
  if(dataDownlinkSourceFormat(dataDownlink)!==facts.sourceFormat||dataDownlink.source!==facts.source||digest!==facts.sourceSha256)throw bad()
  return {...facts,kind:'DATA_RPT' as const,streamIdentifier:facts.streamIdentifier,nativeParser:null,dataDownlink,gatewayParser:null,subdeviceNativeParser:null,dataOperations:null}
 }
 if(facts.sourceFormat==='MODBUS_RTU_V1'||facts.sourceFormat==='MODBUS_RTU_V2'||facts.sourceFormat==='MODBUS_RTU_V3'||facts.sourceFormat==='MODBUS_RTU_V4'){
  if(!facts.nativeParserJson||facts.preprocessingJson!=='null'||!facts.streamIdentifier||!/^[A-Za-z0-9_-]{1,64}$/.test(facts.streamIdentifier)||facts.actionsJson.trim()!=='[]')throw bad()
  const nativeParser=decodeModbusRtuParser(readRawRuleJson(new TextEncoder().encode(facts.nativeParserJson))),sourceParser=decodeModbusRtuParser(readRawRuleJson(new TextEncoder().encode(facts.source)))
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(facts.source))),byte=>byte.toString(16).padStart(2,'0')).join('');active(current)
  if(modbusRtuSourceFormat(nativeParser)!==facts.sourceFormat||JSON.stringify(nativeParser)!==JSON.stringify(sourceParser)||digest!==facts.sourceSha256)throw bad()
  return {...facts,kind:'DATA_RPT' as const,streamIdentifier:facts.streamIdentifier,nativeParser,dataDownlink:null,gatewayParser:null,subdeviceNativeParser:null,dataOperations:null}
 }
 const value=readRawRuleJson(new TextEncoder().encode(facts.preprocessingJson)),trigger=value.at(['trigger']),kind=trigger.at(['kind']).string(),functions=value.at(['functions'])
 if(scope.deviceSource&&kind!=='DATA_RPT')throw bad()
 if([...value.keys()].sort().join(',')!=='functions,trigger'||[...trigger.keys()].sort().join(',')!=='filter,identifier,kind'||!['ATTRS_RPT_PREPROC','ATTRS_PUSH_PREPROC','DATA_RPT'].includes(kind)||functions.arrayLength()<1||functions.arrayLength()>32||facts.actionsJson.trim()!=='[]')throw bad()
 const identifier=trigger.at(['identifier'])
 if(kind==='DATA_RPT'){
  if(identifier.kind!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(identifier.string())||functions.arrayLength()!==1||canonicalPreprocessing(parsePreprocessJson(trigger.at(['filter']).raw()))!==canonicalPreprocessing(parsePreprocessJson('{"operator":"ALL","conditions":[],"groups":[]}')))throw bad()
 }else{if(identifier.kind!=='null')throw bad();if(kind==='ATTRS_PUSH_PREPROC'){if(canonicalPreprocessing(parsePreprocessJson(trigger.at(['filter']).raw()))!==canonicalPreprocessing(parsePreprocessJson('{"operator":"ALL","conditions":[],"groups":[]}')))throw bad()}else validatePreprocessFilterJson(trigger.at(['filter']).raw(),'ATTRS_RPT_PREPROC')}
 let bytes=0
 for(let i=0;i<functions.arrayLength();i++){const fn=functions.at([i]),format=fn.at(['format']).string(),source=fn.at(['source']).string();if([...fn.keys()].sort().join(',')!=='format,source'||!['COMMON_JS','FUNCTION_EXPRESSION'].includes(format)||kind==='DATA_RPT'&&format!=='COMMON_JS'||!source.trim())throw bad();bytes+=new TextEncoder().encode(source).length}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(facts.source))),byte=>byte.toString(16).padStart(2,'0')).join('');active(current)
 if(bytes>65536||facts.source!==functions.at([0,'source']).string()||facts.sourceSha256!==digest)throw bad()
 return {...facts,kind:kind as 'ATTRS_RPT_PREPROC'|'ATTRS_PUSH_PREPROC'|'DATA_RPT',streamIdentifier:kind==='DATA_RPT'?identifier.string():null,nativeParser:null,dataDownlink:null,gatewayParser:null,subdeviceNativeParser:null,dataOperations:null}
}
export async function recoverTypePreprocessor(scope:TypeRuleScope,ruleId:string,draft:PreprocessCreationDraft,current:Current,signal?:AbortSignal){
 const facts=await readTypePreprocessor(scope,ruleId,current,signal)
 const contentMatches=draft.dataOperations?!!facts.dataOperations&&facts.streamIdentifier===draft.streamIdentifier&&JSON.stringify(facts.dataOperations)===JSON.stringify(normalizeDataOperations(draft.dataOperations)):
  facts.dataOperations!==null?false:draft.subdeviceNativeParser?!!facts.subdeviceNativeParser&&facts.streamIdentifier===draft.streamIdentifier&&JSON.stringify(facts.subdeviceNativeParser)===JSON.stringify(normalizeSubdeviceModbusRtuParser(draft.subdeviceNativeParser)):
  facts.subdeviceNativeParser!==null?false:draft.gatewayParser?!!facts.gatewayParser&&facts.streamIdentifier===draft.streamIdentifier&&JSON.stringify(facts.gatewayParser)===JSON.stringify(normalizeGatewayDataParser(draft.gatewayParser)):
  facts.gatewayParser!==null?false:draft.dataDownlink?!!facts.dataDownlink&&facts.streamIdentifier===draft.streamIdentifier&&JSON.stringify(facts.dataDownlink)===JSON.stringify(normalizeDataDownlinkFunction(draft.dataDownlink)):
  facts.dataDownlink!==null?false:draft.nativeParser?!!facts.nativeParser&&facts.streamIdentifier===draft.streamIdentifier&&JSON.stringify(facts.nativeParser)===JSON.stringify(normalizeModbusRtuParser(draft.nativeParser)):
  facts.nativeParser===null&&canonicalPreprocessing(parsePreprocessJson(facts.preprocessingJson))===canonicalPreprocessing(parsePreprocessJson(draft.preprocessingJson))
 if(facts.first.status!=='PAUSED'||facts.first.version!=='1'||facts.versionNumber!=='1'||facts.first.activeVersionId!==facts.versionId||facts.first.name!==draft.name||facts.first.description!==(draft.description??null)||!sameTags(facts.tags,draft.tags)||!contentMatches)throw bad()
 return facts
}
/** 属性上报/下发前处理共用状态意图；实际启用仍由后端各自运行准入裁决。 */
export const propertyPreprocessHasStateControl=(kind:string)=>kind==='ATTRS_RPT_PREPROC'||kind==='ATTRS_PUSH_PREPROC'
export const preprocessHasStateControl=(kind:string)=>kind==='DATA_RPT'||propertyPreprocessHasStateControl(kind)
/** 状态写入独立封存所见完整版本；未知恢复只读当前事实，不重发原POST。 */
export type TypePreprocessStateIntent=Readonly<{scopeKey:string;ruleId:string;attemptId:string;enabled:boolean;before:Awaited<ReturnType<typeof readTypePreprocessor>>}>
export function makeTypePreprocessStateIntent(scope:{scopeKey:string},before:Awaited<ReturnType<typeof readTypePreprocessor>>,enabled:boolean,attemptId:string):TypePreprocessStateIntent{
 if(!scope.scopeKey||!preprocessHasStateControl(before.kind)||!definitionUuid(attemptId)||BigInt(before.first.version)>=9223372036854775807n||!['ACTIVE','PAUSED'].includes(before.first.status)||!enabled&&before.first.status!=='ACTIVE'||enabled&&before.first.status==='ACTIVE'&&before.first.activeVersionId===before.versionId)throw bad()
 return Object.freeze({scopeKey:scope.scopeKey,ruleId:before.first.id,attemptId,enabled,before})
}
export function confirmTypePreprocessState(intent:TypePreprocessStateIntent,after:Awaited<ReturnType<typeof readTypePreprocessor>>){
 const before=intent.before
 const contentKeys=['versionId','versionNumber','source','sourceSha256','actionsJson','preprocessingJson','sourceFormat','streamIdentifier','nativeParserJson','subdeviceNativeParserJson','gatewayParserJson','dataDownlinkJson','dataOperationsJson','kind'] as const
 if(after.first.id!==intent.ruleId||after.first.status!==(intent.enabled?'ACTIVE':'PAUSED')||after.first.activeVersionId!==(intent.enabled?before.versionId:before.first.activeVersionId)||BigInt(after.first.version)!==BigInt(before.first.version)+1n||after.first.name!==before.first.name||after.first.description!==before.first.description||contentKeys.some(key=>after[key]!==before[key])||!sameDeviceSource(after.deviceSource,before.deviceSource)||!sameTags(after.tags,before.tags))throw bad()
 return after
}
export async function applyTypePreprocessStateIntent(scope:TypeRuleScope,intent:TypePreprocessStateIntent,current:Current,signal?:AbortSignal){
 if(scope.scopeKey!==intent.scopeKey||!preprocessHasStateControl(intent.before.kind))throw bad()
 const project=id(scope.projectId),rule=id(intent.ruleId),version=id(intent.before.versionId);id(intent.attemptId)
 return writeThenRead(()=>post(intent.enabled?`/api/v1/projects/${project}/message-rules/${rule}/versions/${version}/activate`:`/api/v1/projects/${project}/message-rules/${rule}/pause`,current,{signal,query:{expectedVersion:exactRevisionCounter(intent.before.first.version)},headers:{'Idempotency-Key':intent.attemptId}}),async()=>confirmTypePreprocessState(intent,await readTypePreprocessor(scope,rule,current,signal)))
}
export async function changeTypePreprocessorState(scope:TypeRuleScope,before:Awaited<ReturnType<typeof readTypePreprocessor>>,enabled:boolean,current:Current,signal?:AbortSignal){return applyTypePreprocessStateIntent(scope,makeTypePreprocessStateIntent(scope,before,enabled,crypto.randomUUID()),current,signal)}

/** DEVICE属性上报/下发前处理从完整种子固定来源、候选、精确CAS与独立状态原键。 */
export type DevicePreprocessStateIntent=Readonly<{scopeKey:string;ruleId:string;attemptId:string;enabled:boolean;before:PreprocessSnapshot}>
export function makeDevicePreprocessStateIntent(scope:PreprocessScope,before:PreprocessSnapshot,enabled:boolean,attemptId:string):DevicePreprocessStateIntent{
 const loaded=snapshotScope(scope,before),seed=before.seed
 if(!propertyPreprocessHasStateControl(loaded.draft.kind)||!definitionUuid(attemptId)||BigInt(seed.definitionVersion)>=9223372036854775807n||!['ACTIVE','PAUSED'].includes(seed.status)||!enabled&&seed.status!=='ACTIVE'||enabled&&seed.status==='ACTIVE'&&seed.activeVersionId===seed.versionId)throw bad()
 return Object.freeze({scopeKey:scope.scopeKey,ruleId:seed.ruleId,attemptId,enabled,before})
}
export function confirmDevicePreprocessState(intent:DevicePreprocessStateIntent,after:PreprocessSnapshot){
 const a=intent.before.seed,b=after.seed,keys=['ruleId','deviceId','versionId','latestVersionId','versionNumber','name','description','source','actionsJson','preprocessingJson'] as const
 if(keys.some(key=>a[key]!==b[key])||b.status!==(intent.enabled?'ACTIVE':'PAUSED')||b.activeVersionId!==(intent.enabled?a.versionId:a.activeVersionId)||BigInt(b.definitionVersion)!==BigInt(a.definitionVersion)+1n||!sameDeviceSource(preprocessSeedSource(a),preprocessSeedSource(b))||!sameTags(intent.before.tags,after.tags))throw bad()
 return after
}
export async function applyDevicePreprocessStateIntent(scope:PreprocessScope,intent:DevicePreprocessStateIntent,current:Current,signal?:AbortSignal){
 if(scope.scopeKey!==intent.scopeKey||!propertyPreprocessHasStateControl(loadPreprocessVersion(intent.before.seed,intent.before.seed).draft.kind))throw bad()
 const project=id(scope.projectId),rule=id(intent.ruleId),version=id(intent.before.seed.versionId);id(intent.attemptId)
 return writeThenRead(()=>post(intent.enabled?`/api/v1/projects/${project}/message-rules/${rule}/versions/${version}/activate`:`/api/v1/projects/${project}/message-rules/${rule}/pause`,current,{signal,query:{expectedVersion:exactRevisionCounter(intent.before.seed.definitionVersion)},headers:{'Idempotency-Key':intent.attemptId}}),async()=>confirmDevicePreprocessState(intent,await readPreprocessSnapshot(scope,rule,current,signal)))
}

// 完整DATA候选复用原字段/ABI；DEVICE走来源等值基线，来源变化仍由独立PUT处理。
export async function reviseTypePreprocessor(scope:TypeRuleScope,before:Awaited<ReturnType<typeof readTypePreprocessor>>,intent:TypePreprocessRevisionIntent,current:Current,signal?:AbortSignal){
 const project=id(scope.projectId),source=scope.deviceSource,type=source?.kind==='DEVICE'?'':id(scope.deviceTypeId),rule=id(intent.ruleId),loaded=loadTypePreprocessContent({...scope,ruleId:rule},before);if(source&&(before.kind!=='DATA_RPT'||!sameDeviceSource(source,before.deviceSource)||!intent.deviceSource||!sameDeviceSource(intent.deviceSource,source)))throw bad()
 if(intent.scopeKey!==scope.scopeKey||intent.deviceTypeId!==type||intent.expectedDefinitionVersion!==before.first.version||intent.baseVersionId!==before.versionId||intent.baseVersionNumber!==before.versionNumber)throw bad();id(intent.attemptId)
 const content=intent.content
 const inputStreamPart=()=>{if(typeof content.streamIdentifier!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(content.streamIdentifier))throw bad();return JSON.stringify(content.streamIdentifier)}
 if(content.streamIdentifier!==undefined&&(before.kind!=='DATA_RPT'||!/^[A-Za-z0-9_-]{1,64}$/.test(content.streamIdentifier)))throw bad()
 const parts:{[K in keyof Schema<'DeviceTypeMessageRuleReviseRequest'>]:string}={expectedVersion:exactRevisionCounter(intent.expectedDefinitionVersion),baseVersionId:JSON.stringify(id(intent.baseVersionId)),name:JSON.stringify(content.name),description:JSON.stringify(content.description??''),kind:JSON.stringify(before.kind),filter:'null'}
 if(content.dataOperations){if(before.kind!=='DATA_RPT'||content.nativeParser||content.subdeviceNativeParser||content.gatewayParser||content.dataDownlink||content.preprocessingJson!=='null')throw bad();parts.dataOperations=JSON.stringify(normalizeDataOperations(content.dataOperations));parts.streamIdentifier=inputStreamPart()}
 else if(content.subdeviceNativeParser){if((!before.nativeParser&&!before.subdeviceNativeParser)||content.nativeParser||content.gatewayParser||content.dataDownlink||content.preprocessingJson!=='null')throw bad();parts.subdeviceNativeParser=JSON.stringify(normalizeSubdeviceModbusRtuParser(content.subdeviceNativeParser));parts.streamIdentifier=inputStreamPart()}
 else if(content.gatewayParser){if(!before.gatewayParser||content.nativeParser||content.dataDownlink||content.preprocessingJson!=='null')throw bad();parts.gatewayParser=JSON.stringify(normalizeGatewayDataParser(content.gatewayParser));parts.streamIdentifier=inputStreamPart()}
 else if(content.nativeParser){if(!before.nativeParser||content.dataDownlink||content.preprocessingJson!=='null')throw bad();parts.nativeParser=JSON.stringify(normalizeModbusRtuParser(content.nativeParser));parts.streamIdentifier=inputStreamPart()}
 else if(content.dataDownlink){if(!before.dataDownlink||content.preprocessingJson!=='null')throw bad();parts.dataDownlink=JSON.stringify(normalizeDataDownlinkFunction(content.dataDownlink));parts.streamIdentifier=inputStreamPart()}
 else{if(before.dataOperations||before.nativeParser||before.subdeviceNativeParser||before.dataDownlink||before.gatewayParser)throw bad();const parsed=readRawRuleJson(new TextEncoder().encode(content.preprocessingJson)),trigger=parsed.at(['trigger']);if(trigger.at(['kind']).string()!==before.kind)throw bad();Object.assign(parts,preprocessingActions(parsed));if(before.kind==='DATA_RPT'){if(!/^[A-Za-z0-9_-]{1,64}$/.test(trigger.at(['identifier']).string())||content.streamIdentifier!==undefined&&content.streamIdentifier!==trigger.at(['identifier']).string())throw bad();parts.streamIdentifier=trigger.at(['identifier']).raw()}else parts.filter=trigger.at(['filter']).raw()}
 const contentBody=fields<Schema<'DeviceTypeMessageRuleReviseRequest'>>(parts),rawBody=source?fields<Schema<'MessageRuleDataReviseRequest'>>({deviceSource:JSON.stringify(source),content:contentBody}):contentBody
 return writeThenRead(()=>post(source?`/api/v1/projects/${project}/message-rules/${rule}/data-versions`:`/api/v1/projects/${project}/device-types/${type}/message-rules/${rule}/versions`,current,{rawBody,signal,headers:{'Content-Type':'application/json','Idempotency-Key':intent.attemptId}}),async value=>{
  const receipt=definition(field<Schema<'MessageRulePreprocessRevisionView'>>(value,'definition'),rule),saved=field<Schema<'MessageRulePreprocessRevisionView'>>(value,'savedVersion'),after=await readTypePreprocessor(scope,rule,current,signal)
  type V=Schema<'MessageRuleVersionView'>
  const source=field<V>(saved,'deviceSource'),nullableRaw=(key:keyof V)=>{const v=optional<V>(saved,key);return !v||v.kind==='null'?null:v.raw()}
  if(receipt.version!==after.first.version||receipt.name!==after.first.name||receipt.description!==after.first.description||receipt.status!==after.first.status||receipt.activeVersionId!==after.first.activeVersionId
   ||uuid(field<V>(saved,'id'))!==after.versionId||counter(field<V>(saved,'versionNumber'))!==after.versionNumber||!sameDeviceSource(decodeDeviceSource(source),after.deviceSource)
   ||field<V>(saved,'source').string()!==after.source||field<V>(saved,'sourceSha256').string()!==after.sourceSha256||canonicalPreprocessing(parsePreprocessJson(field<V>(saved,'actions').raw()))!==canonicalPreprocessing(parsePreprocessJson(after.actionsJson))
   ||canonicalPreprocessing(parsePreprocessJson(versionPreprocessing(saved).raw()))!==canonicalPreprocessing(parsePreprocessJson(after.preprocessingJson))||nullableText(optional<V>(saved,'sourceFormat'))!==after.sourceFormat||nullableText(optional<V>(saved,'streamIdentifier'))!==(after.sourceFormat===null?null:after.streamIdentifier)
   ||canonicalPreprocessing(parsePreprocessJson(nullableRaw('nativeParser')??'null'))!==canonicalPreprocessing(parsePreprocessJson(after.nativeParserJson??'null'))||canonicalPreprocessing(parsePreprocessJson(nullableRaw('dataDownlink')??'null'))!==canonicalPreprocessing(parsePreprocessJson(after.dataDownlinkJson??'null'))||canonicalPreprocessing(parsePreprocessJson(nullableRaw('gatewayParser')??'null'))!==canonicalPreprocessing(parsePreprocessJson(after.gatewayParserJson??'null'))||canonicalPreprocessing(parsePreprocessJson(nullableRaw('subdeviceNativeParser')??'null'))!==canonicalPreprocessing(parsePreprocessJson(after.subdeviceNativeParserJson??'null'))||canonicalPreprocessing(parsePreprocessJson(nullableRaw('dataOperations')??'null'))!==canonicalPreprocessing(parsePreprocessJson(after.dataOperationsJson??'null')))throw bad()
  confirmTypePreprocessRevision(loaded,intent,after);return after
 })
}

/** 保存和启用各有独立固定身份；读取恢复不会再次调用写入口。 */
export type TypePreprocessActivationIntent=Readonly<{scopeKey:string;ruleId:string;attemptId:string;before:Awaited<ReturnType<typeof readTypePreprocessor>>}>
export function makeTypePreprocessActivationIntent(scope:{scopeKey:string},before:Awaited<ReturnType<typeof readTypePreprocessor>>,attemptId:string):TypePreprocessActivationIntent{
 if(!scope.scopeKey||!preprocessHasStateControl(before.kind)||!definitionUuid(attemptId)||BigInt(before.first.version)>=9223372036854775807n)throw bad()
 return Object.freeze({scopeKey:scope.scopeKey,ruleId:before.first.id,attemptId,before})
}
export function confirmTypePreprocessActivation(intent:TypePreprocessActivationIntent,after:Awaited<ReturnType<typeof readTypePreprocessor>>){
 const before=intent.before
 if(after.first.id!==intent.ruleId||after.first.status!=='ACTIVE'||after.first.activeVersionId!==before.versionId||BigInt(after.first.version)!==BigInt(before.first.version)+1n||after.versionId!==before.versionId||after.versionNumber!==before.versionNumber||after.source!==before.source||after.sourceSha256!==before.sourceSha256||after.sourceFormat!==before.sourceFormat||after.kind!==before.kind||after.streamIdentifier!==before.streamIdentifier||after.first.name!==before.first.name||after.first.description!==before.first.description||!sameDeviceSource(after.deviceSource,before.deviceSource)||!sameTags(after.tags,before.tags))throw bad()
 return after
}
export async function activateTypePreprocessIntent(scope:TypeRuleScope,intent:TypePreprocessActivationIntent,current:Current,signal?:AbortSignal){
 if(intent.scopeKey!==scope.scopeKey||!preprocessHasStateControl(intent.before.kind))throw bad()
 const project=id(scope.projectId),rule=id(intent.ruleId),version=id(intent.before.versionId);id(intent.attemptId)
 return writeThenRead(()=>post(`/api/v1/projects/${project}/message-rules/${rule}/versions/${version}/activate`,current,{signal,query:{expectedVersion:exactRevisionCounter(intent.before.first.version)},headers:{'Idempotency-Key':intent.attemptId}}),async()=>confirmTypePreprocessActivation(intent,await readTypePreprocessor(scope,rule,current,signal)))
}

/** 完整来源只从真实种子还原，不把多设备第一成员作为请求上下文。 */
export function preprocessSeedSource(seed:PreprocessVersionSeed):RuleDeviceSourceContract{const ids=preprocessSeedDeviceIds(seed);return ids.length===1?{kind:'DEVICE',referenceId:ids[0]!}:{kind:'DEVICE',referenceId:null,referenceIds:ids}}
export type SourcePreprocessScope={projectId:string;scopeKey:string;source:RuleSourceSelection}
export async function recoverSourcePreprocessor(scope:SourcePreprocessScope,ruleId:string,draft:PreprocessCreationDraft,current:Current,signal?:AbortSignal):Promise<PreprocessSnapshot>{
 const result=await readPreprocessSnapshot({projectId:scope.projectId,deviceId:'',scopeKey:scope.scopeKey},ruleId,current,signal)
 if(result.seed.definitionVersion!=='1'||result.seed.versionNumber!=='1'||result.seed.status!=='PAUSED'||result.seed.activeVersionId!==result.seed.versionId||!sameDeviceSource(preprocessSeedSource(result.seed),sourceContract(scope.source))||!sameTags(result.tags,draft.tags))throw bad()
 const parsed=readRawRuleJson(new TextEncoder().encode(draft.preprocessingJson)),expected=loadPreprocessVersion({...result.seed,name:draft.name,description:draft.description,preprocessingJson:draft.preprocessingJson,source:preprocessingSource(parsed)},result.seed)
 if(expected.signature!==loadPreprocessVersion(result.seed,result.seed).signature)throw bad();return result
}
/** 新项目级入口一次创建整集合；TYPE DATA继续原专用端口，不拆成逐设备请求。 */
export async function createSourcePreprocessor(scope:SourcePreprocessScope,draft:PreprocessCreationDraft,attemptId:string,current:Current,signal?:AbortSignal):Promise<PreprocessSnapshot>{
 const project=id(scope.projectId);id(attemptId);sourceIds(scope.source);if(scope.source.kind!=='DEVICE')throw bad()
 const parsed=readRawRuleJson(new TextEncoder().encode(draft.preprocessingJson)),trigger=field<Schema<'MessageRulePreprocessDefinition'>>(parsed,'trigger'),kind=field<Schema<'MessageRuleTrigger'>>(trigger,'kind').string();if(!['ATTRS_RPT_PREPROC','ATTRS_PUSH_PREPROC'].includes(kind))throw bad()
 const content=fields<Schema<'DeviceMessageRulePreprocessCreateRequest'>>({name:JSON.stringify(draft.name),description:JSON.stringify(draft.description??''),kind:JSON.stringify(kind),filter:field<Schema<'MessageRuleTrigger'>>(trigger,'filter').raw(),...preprocessingActions(parsed),tags:JSON.stringify(draft.tags)}),body=fields<Schema<'MessageRulePreprocessCreateRequest'>>({deviceSource:JSON.stringify(sourceContract(scope.source)),content})
 let createdId:string|undefined
 try{return await writeThenRead(()=>post(`/api/v1/projects/${project}/message-rules/preprocessors`,current,{rawBody:body,headers:{'Content-Type':'application/json','Idempotency-Key':attemptId},signal}),async value=>{const created=definition(value);createdId=created.id;const result=await recoverSourcePreprocessor(scope,created.id,draft,current,signal);if(result.seed.versionId!==created.activeVersionId)throw bad();return result})}catch(cause){if(cause instanceof PreprocessOutcomeUnknown)cause.ruleId=createdId;throw cause}
}
