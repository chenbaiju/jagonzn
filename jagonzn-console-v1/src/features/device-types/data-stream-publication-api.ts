import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid} from './type-devices-api'

type StreamContract=Schema<'DeviceDataStreamDefinitionItem'>
export type DataStreamMqttTopics=Readonly<Required<Schema<'DeviceDataStreamMqttTopics'>>>
export type DataStreamItem=Readonly<Required<Omit<StreamContract,'mqttTopics'|'disabled'>>&Pick<StreamContract,'mqttTopics'>&{disabled?:true}>
export type DataStreamDefinition=Readonly<Omit<Required<Schema<'DeviceDataStreamDefinitionDocument'>>,'streams'>&{streams:readonly DataStreamItem[];tcpStreamIdentifier:string|null}>
export type DataStreamPublished=Readonly<Omit<Required<Schema<'DeviceDataStreamPublished'>>,'definition'>&{definition:DataStreamDefinition}>
export type DataStreamPublication=Readonly<Omit<Required<Schema<'DeviceDataStreamPublicationResponse'>>,'publication'>&{publication:DataStreamPublished|null}>
export type DataStreamDescriptions=Readonly<NonNullable<Schema<'PublishDeviceDataStreamRequest'>['descriptions']>>
export type DataStreamManagementDetails=Readonly<Required<Schema<'DeviceDataStreamManagementDetails'>>>
export type DataStreamIntent=Readonly<{project:string;typeId:string;key:string;body:Readonly<{expectedRevision:string;definition:DataStreamDefinition;descriptions?:DataStreamDescriptions}>}>
export type DataStreamTransport={read:(project:string,typeId:string,signal:AbortSignal)=>Promise<DataStreamPublication>;publish:(intent:DataStreamIntent,signal:AbortSignal)=>Promise<DataStreamPublication>}
const identifier=/^[A-Za-z0-9_-]{1,64}$/,revision=/^(0|[1-9][0-9]{0,18})$/
function invalid():never{throw new Error('数据流定义、代次或发布回执不符合合同，请重新核对')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return value as Record<string,unknown>}
function fields(value:Record<string,unknown>,keys:string[]){if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))invalid()}
function exactRevision(value:unknown):value is string{return typeof value==='string'&&revision.test(value)&&BigInt(value)<=9223372036854775807n}
/** 固定字面保持旧合同；模板仅支持完整路径层参数，不解释表达式。 */
export function dataStreamTopicVariables(topic:string):readonly string[]{
 if(typeof topic!=='string'||topic.length>256||!topic.startsWith('data/'))invalid()
 const parts=topic.split('/'),names=new Set<string>();if(parts.length>8)invalid()
 for(const part of parts){const variable=/^\{([A-Za-z_][A-Za-z0-9_]{0,63})\}$/.exec(part);if(variable){const name=variable[1]!;if(['__proto__','prototype','constructor'].includes(name)||names.has(name))invalid();names.add(name)}else if(!/^[A-Za-z0-9_-]{1,64}$/.test(part))invalid()}
 if(names.size>8)invalid();return Object.freeze([...names].sort())
}
export function normalizeDataStreamMqttTopics(value:unknown):DataStreamMqttTopics{
 const row=object(value);fields(row,['profile','publishTopic','subscribeTopic'])
 if(typeof row.publishTopic!=='string'||typeof row.subscribeTopic!=='string')invalid()
 if(row.profile==='TL_LITERAL_TOPIC_PAIR_V1'){if(!/^data\/[A-Za-z0-9_-]{1,64}$/.test(row.publishTopic)||!/^data\/[A-Za-z0-9_-]{1,64}$/.test(row.subscribeTopic))invalid()}
 else if(row.profile==='TL_TEMPLATE_TOPIC_PAIR_V1'){const publish=dataStreamTopicVariables(row.publishTopic),subscribe=dataStreamTopicVariables(row.subscribeTopic);if(!publish.length||JSON.stringify(publish)!==JSON.stringify(subscribe)||row.publishTopic===row.subscribeTopic)invalid()}
 else invalid()
 return Object.freeze({profile:row.profile,publishTopic:row.publishTopic,subscribeTopic:row.subscribeTopic}) as DataStreamMqttTopics
}
export const dataStreamPublishTopic=(stream:Pick<DataStreamItem,'identifier'|'mqttTopics'>)=>stream.mqttTopics?.publishTopic??`data/${stream.identifier}`
export const dataStreamSubscribeTopic=(stream:Pick<DataStreamItem,'identifier'|'mqttTopics'>)=>stream.mqttTopics?.subscribeTopic??`data/${stream.identifier}/set`
export const dataStreamTemplate=(stream:Pick<DataStreamItem,'mqttTopics'>)=>stream.mqttTopics?.profile==='TL_TEMPLATE_TOPIC_PAIR_V1'
export const dataStreamParameterNames=(stream:Pick<DataStreamItem,'identifier'|'mqttTopics'>)=>dataStreamTemplate(stream)?dataStreamTopicVariables(dataStreamPublishTopic(stream)):Object.freeze([] as string[])
export const dataStreamDefinitionProfile=(definition:Pick<DataStreamDefinition,'streams'>)=>definition.streams.some(dataStreamTemplate)?'TL_DATA_STREAM_DEFINITION_V2':'TL_DATA_STREAM_DEFINITION_V1'
/** 原件参数只读副本；不把参数名或值解释为设备身份。 */
export function normalizeDataStreamParameterValues(value:unknown):Readonly<Record<string,string>>{
 const row=object(value),names=Object.keys(row).sort();if(names.length>8||names.some(name=>!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)||['__proto__','prototype','constructor'].includes(name)||typeof row[name]!=='string'||!identifier.test(row[name] as string)))invalid()
 return Object.freeze(Object.fromEntries(names.map(name=>[name,row[name] as string])))
}
export function normalizeDataStreamParams(stream:Pick<DataStreamItem,'identifier'|'mqttTopics'>,value:unknown):Readonly<Record<string,string>>|undefined{
 const names=dataStreamParameterNames(stream)
 if(!names.length){if(value!==undefined)throw new Error('固定Topic不接受参数');return undefined}
 const row=object(value);fields(row,[...names]);if(names.some(name=>typeof row[name]!=='string'||!identifier.test(row[name] as string)))throw new Error('请填写全部Topic参数，每项为1至64位字母、数字、下划线或横线')
 return Object.freeze(Object.fromEntries(names.map(name=>[name,row[name] as string])))
}
export function resolveDataStreamTopic(stream:Pick<DataStreamItem,'identifier'|'mqttTopics'>,direction:'publish'|'subscribe',value?:unknown):string{
 const params=normalizeDataStreamParams(stream,value),pattern=direction==='publish'?dataStreamPublishTopic(stream):dataStreamSubscribeTopic(stream)
 const topic=pattern.split('/').map(part=>part.startsWith('{')?params![part.slice(1,-1)]!:part).join('/')
 if(topic.length>256)throw new Error('参数展开后的Topic不能超过256字节');return topic
}
export function dataStreamTopicsOverlap(left:string,right:string):boolean{const a=left.split('/'),b=right.split('/');return a.length===b.length&&a.every((part,i)=>part.startsWith('{')||b[i]!.startsWith('{')||part===b[i])}
/** 新发布输入区分方向；历史读取和原件恢复继续保留V1原值。 */
export function validateDataStreamPublicationInput(definition:DataStreamDefinition):void{
 if(definition.streams.some(stream=>stream.mqttTopics&&stream.mqttTopics.publishTopic===stream.mqttTopics.subscribeTopic))throw new Error('发布 Topic 和订阅 Topic 不能相同')
}
/** 字符串保持原值；ASCII 标识排序与数据库冻结顺序一致，不归一化大小写。 */
export function normalizeDataStreamDefinition(value:unknown):DataStreamDefinition{
 const raw=object(value);fields(raw,['streams','tcpStreamIdentifier'])
 if(!Array.isArray(raw.streams)||raw.streams.length>64)invalid()
 const seen=new Set<string>(),publishTopics:string[]=[],subscribeTopics:string[]=[],streams=raw.streams.map(value=>{const stream=object(value);fields(stream,['identifier','name','format',...(Object.hasOwn(stream,'mqttTopics')?['mqttTopics']:[]),...(Object.hasOwn(stream,'disabled')?['disabled']:[])])
  if(typeof stream.identifier!=='string'||!identifier.test(stream.identifier)||seen.has(stream.identifier)||typeof stream.name!=='string'||!stream.name.trim()||Array.from(stream.name).length>128||/[\u0000-\u001f\u007f-\u009f]|\p{Surrogate}/u.test(stream.name)||typeof stream.format!=='string'||!['HEX','TEXT','JSON'].includes(stream.format))invalid()
  if(Object.hasOwn(stream,'disabled')&&stream.disabled!==true)invalid()
  const mqttTopics=Object.hasOwn(stream,'mqttTopics')?normalizeDataStreamMqttTopics(stream.mqttTopics):undefined,item={identifier:stream.identifier,name:stream.name,format:stream.format,...(mqttTopics?{mqttTopics}:{}),...(stream.disabled===true?{disabled:true as const}:{})},publish=dataStreamPublishTopic(item),subscribe=dataStreamSubscribeTopic(item)
  if(publishTopics.some(topic=>dataStreamTopicsOverlap(topic,publish))||subscribeTopics.some(topic=>dataStreamTopicsOverlap(topic,subscribe)))throw new Error('同一方向的Topic存在交集，请修改后保存');publishTopics.push(publish);subscribeTopics.push(subscribe);seen.add(stream.identifier);return Object.freeze(item) as DataStreamItem
 }).sort((a,b)=>a.identifier<b.identifier?-1:a.identifier>b.identifier?1:0)
 if(raw.tcpStreamIdentifier!==null&&(typeof raw.tcpStreamIdentifier!=='string'||!seen.has(raw.tcpStreamIdentifier)))invalid()
 if(streams.some(row=>row.identifier===raw.tcpStreamIdentifier&&row.disabled))throw new Error('请先解除该数据流的 TCP 绑定，再停用')
 if(streams.some(row=>row.identifier===raw.tcpStreamIdentifier&&dataStreamTemplate(row)))throw new Error('TCP不能绑定带参数Topic的数据流，请先解除该绑定')
 const result=Object.freeze({streams:Object.freeze(streams),tcpStreamIdentifier:raw.tcpStreamIdentifier as string|null})
 if(new TextEncoder().encode(JSON.stringify(result)).byteLength>65536)invalid()
 return result
}
export function decodeDataStreamPublication(bytes:Uint8Array):DataStreamPublication{
 const root=parseDashboardRuntimeResponse(bytes);fields(root,['revision','publication']);if(!exactRevision(root.revision))invalid()
 if(root.publication===null){if(root.revision!=='0')invalid();return Object.freeze({revision:'0',publication:null})}
 if(root.revision==='0')invalid();const published=object(root.publication);fields(published,['publicationId','schemaProfile','digestAlgorithm','definitionDigest','definition','publishedAt','activation','managementDetails'])
 if(!typeDeviceUuid.test(String(published.publicationId))||!['TL_DATA_STREAM_DEFINITION_V1','TL_DATA_STREAM_DEFINITION_V2'].includes(String(published.schemaProfile))||published.digestAlgorithm!=='PG_JSONB_TEXT_V1_SHA256'||typeof published.definitionDigest!=='string'||!/^[0-9a-f]{64}$/.test(published.definitionDigest)||published.activation!=='NEXT_CONNECTION'||typeof published.publishedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(published.publishedAt)||!Number.isFinite(Date.parse(published.publishedAt)))invalid()
 const definition=normalizeDataStreamDefinition(published.definition)
 if(published.schemaProfile!==dataStreamDefinitionProfile(definition))invalid()
 const original=object(published.definition).streams as Record<string,unknown>[]
 if(original.some((stream,index)=>stream.identifier!==definition.streams[index]?.identifier))invalid()
 if(!Array.isArray(published.managementDetails)||published.managementDetails.length!==definition.streams.length)invalid()
 const managementDetails=published.managementDetails.map((value,index)=>{const row=object(value);fields(row,['identifier','description','createdAt'])
  if(row.identifier!==definition.streams[index]?.identifier||!(row.description===null||typeof row.description==='string'&&Array.from(row.description).length<=500&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(row.description))||!(row.createdAt===null||typeof row.createdAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(row.createdAt)&&Number.isFinite(Date.parse(row.createdAt))&&Date.parse(row.createdAt)<=Date.parse(published.publishedAt as string)))invalid()
  return Object.freeze({...row}) as DataStreamManagementDetails
 })
 return Object.freeze({revision:root.revision,publication:Object.freeze({...published,definition,managementDetails}) as DataStreamPublished})
}
export function prepareDataStreamPublication(project:string,typeId:string,current:DataStreamPublication,definition:unknown,descriptions?:DataStreamDescriptions):DataStreamIntent{
 if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId)||!exactRevision(current.revision)||current.revision==='9223372036854775807')invalid()
 const normalized=normalizeDataStreamDefinition(definition)
 validateDataStreamPublicationInput(normalized)
 if(descriptions!==undefined){const values=object(descriptions);if(Object.keys(values).length>64||Object.entries(values).some(([id,value])=>!normalized.streams.some(row=>row.identifier===id)||!(value===null||typeof value==='string'&&Array.from(value).length<=500&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value))))invalid()}
 return Object.freeze({project,typeId,key:crypto.randomUUID(),body:Object.freeze({expectedRevision:current.revision,definition:normalized,...(descriptions===undefined?{}:{descriptions:Object.freeze({...descriptions})})})})
}
export function dataStreamReceiptMatches(actual:DataStreamPublication,intent:DataStreamIntent){return !!actual.publication&&BigInt(actual.revision)===BigInt(intent.body.expectedRevision)+1n&&JSON.stringify(actual.publication.definition)===JSON.stringify(intent.body.definition)&&Object.entries(intent.body.descriptions??{}).every(([id,value])=>actual.publication!.managementDetails.some(row=>row.identifier===id&&row.description===value))}
function path(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))invalid();return `/api/v1/projects/${project}/device-types/${typeId}/data-stream-publication` as const}
export const dataStreamTransport:DataStreamTransport={
 async read(project,typeId,signal){return decodeDataStreamPublication(await api<Uint8Array>(path(project,typeId),{signal,responseType:'bytes',maxResponseBytes:128*1024}))},
 async publish(intent,signal){const bytes=await api<Uint8Array>(path(intent.project,intent.typeId),{method:'put',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:128*1024});try{const actual=decodeDataStreamPublication(bytes);if(!dataStreamReceiptMatches(actual,intent))invalid();return actual}catch{throw new ApiError('发布回执与原数据流定义不符，原操作结果尚未确认',200,undefined,undefined,true)}}
}
