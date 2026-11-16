import type {DeviceDataPreviewSelection} from './use-device-data-preview-sample'
import {deviceSourceMembers} from './rule-source-api'
import {decodeDataRulePreviewTarget,type SubdeviceDataPreviewSource} from './data-property-preview-api'
import {api,IdentityChanged} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
import {readRawRuleJson,type RawRuleJsonValue} from './raw-rule-json'
import {validUnicode} from './preprocess-exact-json'
import {dataBase64,dataBytes,dataFromBase64,dataHex} from '../devices/data-stream-runtime-api'
import {dataStreamTemplate,normalizeDataStreamParams,resolveDataStreamTopic,type DataStreamItem} from '../device-types/data-stream-publication-api'

export type DataDownlinkFunction=Readonly<Required<Omit<Schema<'DataRuleDownlinkDefinition'>,'delaySeconds'>>&Pick<Schema<'DataRuleDownlinkDefinition'>,'delaySeconds'>>
export type DataDownlinkPreview=Readonly<Required<Omit<Schema<'DeviceTypeDataDownlinkPreviewResponse'>,'previewTargetContext'>>&Pick<Schema<'DeviceTypeDataDownlinkPreviewResponse'>,'previewTargetContext'>>
/** 原站已观察的两参默认函数；不增加未提供的设备上下文或动态参数。 */
export const dataDownlinkFunctionSource=`module.exports = function(identifier, data) {
    var response = {
        type: "json",
        msg: {
            var1: 1,
            var2: true
        }
    }
    return response;
}`
const bad=()=>new Error('请核对下行函数、数据流和模拟数据')
function closed(value:RawRuleJsonValue,keys:readonly string[]){if(value.kind!=='object'||value.keys().length!==keys.length||keys.some(k=>!value.optional([k])))throw bad()}
export function validateDownlinkSource(source:string){if(!source.trim()||!validUnicode(source)||new TextEncoder().encode(source).length>65536)throw bad();return source}
export function decodeDataDownlinkFunction(value:RawRuleJsonValue):DataDownlinkFunction{
 const delay=value.optional(['delaySeconds'])
 closed(value,['protocol','streamIdentifier','source',...(delay?['delaySeconds']:[])])
 const protocol=value.at(['protocol']).string(),streamIdentifier=value.at(['streamIdentifier']).string(),source=validateDownlinkSource(value.at(['source']).string())
 if(protocol!=='MQTT'&&protocol!=='TCP'||!/^[A-Za-z0-9_-]{1,64}$/.test(streamIdentifier))throw bad()
 let delaySeconds:number|undefined
 if(delay){const text=delay.integerText();if(!/^[1-9][0-9]{0,3}$/.test(text)||Number(text)>3600)throw bad();delaySeconds=Number(text)}
 return Object.freeze({protocol,streamIdentifier,source,...(delaySeconds===undefined?{}:{delaySeconds})})
}
export function normalizeDataDownlinkFunction(value:unknown){return decodeDataDownlinkFunction(readRawRuleJson(new TextEncoder().encode(JSON.stringify(value))))}
export const dataDownlinkSourceFormat=(value:DataDownlinkFunction)=>value.delaySeconds===undefined?'DATA_DOWNLINK_COMMON_JS_V1':'DATA_DOWNLINK_COMMON_JS_V2'
export const dataDownlinkTiming=(value:DataDownlinkFunction)=>value.delaySeconds===undefined?'立即执行':`延迟 ${value.delaySeconds} 秒执行`
export function downlinkSampleBytes(text:string,mode:'HEX'|'TEXT'|'JSON'){
 if(mode==='JSON')readRawRuleJson(new TextEncoder().encode(text))
 const result=dataBytes(text,mode==='HEX'?'HEX':'UTF8');if(!result.length)throw bad();return result
}
export function decodeDataDownlinkPreview(value:RawRuleJsonValue,target?:Pick<DataStreamItem,'identifier'|'mqttTopics'>,sample?:SubdeviceDataPreviewSource):DataDownlinkPreview{
 const context=value.optional(['previewTargetContext']);if(!!sample!==!!context)throw bad();const previewTargetContext=context?decodeDataRulePreviewTarget(context,sample):undefined
 closed(value,['outputJson','format','payloadBase64','payloadBytes',...(context?['previewTargetContext']:[])])
 const outputJson=value.at(['outputJson']).string(),formatValue=value.at(['format']),payload=value.at(['payloadBase64']),count=value.at(['payloadBytes']).integerText(),output=readRawRuleJson(new TextEncoder().encode(outputJson))
 if(count.length>5)throw bad();const payloadBytes=Number(count)
 if(output.kind==='null'){if(outputJson!=='null'||formatValue.kind!=='null'||payload.kind!=='null'||payloadBytes!==0)throw bad();return Object.freeze({outputJson,format:null,payloadBase64:null,payloadBytes,...(previewTargetContext?{previewTargetContext}:{})})}
 const template=!!target&&dataStreamTemplate(target)
 closed(output,['type','msg',...(template?['params']:[])]);if(template){const params=normalizeDataStreamParams(target!,JSON.parse(output.at(['params']).raw()));resolveDataStreamTopic(target!,'subscribe',params)}
 const type=output.at(['type']).string(),format=formatValue.string(),payloadBase64=payload.string(),bytes=dataFromBase64(payloadBase64)
 if(!['hex','text','json'].includes(type)||format!==type.toUpperCase()||!bytes.length||bytes.length!==payloadBytes)throw bad()
 const msg=output.at(['msg']);let expected:Uint8Array
 if(type==='hex')expected=dataBytes(msg.string(),'HEX')
 else if(type==='text')expected=dataBytes(msg.string(),'UTF8')
 else{if(msg.kind!=='object')throw bad();expected=dataBytes(msg.raw(),'UTF8')}
 if(dataBase64(expected)!==payloadBase64)throw bad()
 if(format!=='HEX'&&format!=='TEXT'&&format!=='JSON')throw bad()
 return Object.freeze({outputJson,format,payloadBase64,payloadBytes,...(previewTargetContext?{previewTargetContext}:{})})
}
export function downlinkPreviewContent(value:DataDownlinkPreview){if(value.payloadBase64===null)return '';const bytes=dataFromBase64(value.payloadBase64);return value.format==='HEX'?dataHex(bytes):new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
export async function previewDataDownlinkFunction(scope:{projectId:string;deviceTypeId:string;scopeKey:string},streamIdentifier:string,source:string,bytes:Uint8Array,current:()=>boolean,signal?:AbortSignal,routing?:{input:Pick<DataStreamItem,'identifier'|'mqttTopics'>;target?:Pick<DataStreamItem,'identifier'|'mqttTopics'>;params?:unknown;sample?:SubdeviceDataPreviewSource},selection?:DeviceDataPreviewSelection):Promise<DataDownlinkPreview>{
 if(!scope.scopeKey||!definitionUuid(scope.projectId)||!definitionUuid(scope.deviceTypeId)||!/^[A-Za-z0-9_-]{1,64}$/.test(streamIdentifier)||bytes.length<1||bytes.length>65504)throw bad()
 const dynamic=!!routing&&(dataStreamTemplate(routing.input)||!!routing.target&&dataStreamTemplate(routing.target))
 if((dynamic||routing?.sample)&&!routing?.target)throw new Error('请选择当前发布的目标数据流后再测试模板参数')
 const params=routing?normalizeDataStreamParams(routing.input,routing.params):undefined
 const body:Schema<'PreviewDeviceTypeDataDownlinkRequest'>={streamIdentifier,source:validateDownlinkSource(source),payloadBase64:dataBase64(bytes),...(params?{params}:{}),...(dynamic||routing?.sample||selection&&routing?.target?{targetStreamIdentifier:routing!.target!.identifier}:{}),...(routing?.sample?{subDeviceId:routing.sample.subDeviceId}:{})}
 if(selection&&(selection.context.deviceSource.kind!=='DEVICE'||selection.member.deviceTypeId!==scope.deviceTypeId||!deviceSourceMembers(selection.context.deviceSource).includes(selection.member.deviceId)||routing?.sample&&routing.sample.subDeviceId!==selection.member.deviceId))throw bad()
 if(!current())throw new IdentityChanged()
 const result=selection?await api<Uint8Array>(`/api/v1/projects/${scope.projectId}/message-rules/data-parser-previews/downlink`,{method:'post',body:{deviceSource:selection.context.deviceSource,sampleDeviceId:selection.member.deviceId,content:body} satisfies Schema<'MessageRuleDataDownlinkPreviewRequest'>,signal,responseType:'bytes',maxResponseBytes:512*1024}):await api<Uint8Array>(`/api/v1/projects/${scope.projectId}/device-types/${scope.deviceTypeId}/data-downlink-previews`,{method:'post',body,signal,responseType:'bytes',maxResponseBytes:512*1024})
 if(!current())throw new IdentityChanged()
 return decodeDataDownlinkPreview(readRawRuleJson(result),routing?.target,routing?.sample)
}
