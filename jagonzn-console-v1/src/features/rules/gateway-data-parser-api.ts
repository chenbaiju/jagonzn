import type {DeviceDataPreviewSelection} from './use-device-data-preview-sample'
import {deviceSourceMembers} from './rule-source-api'
import {api,IdentityChanged} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
import {readRawRuleJson,type RawRuleJsonValue} from './raw-rule-json'
import {validUnicode} from './preprocess-exact-json'
import {dataBase64} from '../devices/data-stream-runtime-api'
import {normalizeDataStreamParams,type DataStreamItem} from '../device-types/data-stream-publication-api'

export type GatewayDataParser=Readonly<Required<Schema<'DataRuleGatewayDefinition'>>>
export type GatewayDataPreview=Readonly<Required<Schema<'DeviceTypeGatewayDataParserPreviewResponse'>>>
export const gatewayDataParserSource=`module.exports = function(identifier, data, options) {
    return null;
}`
const bad=()=>new Error('请核对云网关解析函数、Topic参数和模拟数据')
function closed(value:RawRuleJsonValue,keys:readonly string[]){if(value.kind!=='object'||value.keys().length!==keys.length||keys.some(key=>!value.optional([key])))throw bad()}
export function decodeGatewayDataParser(value:RawRuleJsonValue):GatewayDataParser{
 closed(value,['source']);const source=value.at(['source']).string()
 if(!source.trim()||!validUnicode(source)||new TextEncoder().encode(source).length>65536)throw bad()
 return Object.freeze({source})
}
export const normalizeGatewayDataParser=(value:unknown)=>decodeGatewayDataParser(readRawRuleJson(new TextEncoder().encode(JSON.stringify(value))))
/** 纯模拟只核输出结构；地址是否有效和属性模型由实际执行时单独核验。 */
export function decodeGatewayDataPreview(value:RawRuleJsonValue):GatewayDataPreview{
 closed(value,['outputJson','targetCount']);const outputJson=value.at(['outputJson']).string(),count=value.at(['targetCount']).integerText()
 if(!/^(?:0|[1-9][0-9]?)$/.test(count)||Number(count)>64||new TextEncoder().encode(outputJson).length>65536)throw bad()
 const output=readRawRuleJson(new TextEncoder().encode(outputJson)),targetCount=Number(count)
 if(output.kind==='null'){if(outputJson!=='null'||targetCount!==0)throw bad()}
 else if(output.kind!=='object'||output.keys().length!==targetCount||output.keys().some(address=>!/^[A-Za-z0-9._:-]{1,64}$/.test(address)||output.at([address]).kind!=='object'))throw bad()
 return Object.freeze({outputJson,targetCount})
}
export async function previewGatewayDataParser(scope:{projectId:string;deviceTypeId:string;scopeKey:string},stream:Pick<DataStreamItem,'identifier'|'mqttTopics'>,source:string,bytes:Uint8Array,params:unknown,current:()=>boolean,signal?:AbortSignal,selection?:DeviceDataPreviewSelection):Promise<GatewayDataPreview>{
 if(!scope.scopeKey||!definitionUuid(scope.projectId)||!definitionUuid(scope.deviceTypeId)||!/^[A-Za-z0-9_-]{1,64}$/.test(stream.identifier)||bytes.length<1||bytes.length>65504)throw bad()
 const configuration=normalizeGatewayDataParser({source}),safeParams=normalizeDataStreamParams(stream,params)
 const body:Schema<'PreviewDeviceTypeGatewayDataParserRequest'>={streamIdentifier:stream.identifier,source:configuration.source,payloadBase64:dataBase64(bytes),...(safeParams?{params:safeParams}:{})}
 if(selection&&(selection.context.deviceSource.kind!=='DEVICE'||selection.member.deviceTypeId!==scope.deviceTypeId||!deviceSourceMembers(selection.context.deviceSource).includes(selection.member.deviceId)))throw bad()
 if(!current())throw new IdentityChanged()
 const bytesReturned=selection?await api<Uint8Array>(`/api/v1/projects/${scope.projectId}/message-rules/data-parser-previews/gateway`,{method:'post',body:{deviceSource:selection.context.deviceSource,sampleDeviceId:selection.member.deviceId,content:body} satisfies Schema<'MessageRuleGatewayDataPreviewRequest'>,signal,responseType:'bytes',maxResponseBytes:512*1024}):await api<Uint8Array>(`/api/v1/projects/${scope.projectId}/device-types/${scope.deviceTypeId}/data-parser-previews/gateway`,{method:'post',body,signal,responseType:'bytes',maxResponseBytes:512*1024})
 if(!current())throw new IdentityChanged()
 return decodeGatewayDataPreview(readRawRuleJson(bytesReturned))
}
