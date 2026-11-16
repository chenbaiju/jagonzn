import type {DeviceDataPreviewSelection} from './use-device-data-preview-sample'
import {deviceSourceMembers} from './rule-source-api'
import {api,IdentityChanged} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
import {readRawRuleJson,type RawRuleJsonValue} from './raw-rule-json'
import {normalizeModbusRtuParser,formModbusRtuParser,validateModbusHex,type ModbusRtuForm} from './modbus-rtu-parser-api'
import {referenceVersion} from '../devices/reference-profile'

type Definition=Schema<'SubdeviceModbusRtuDataParserDefinition'>
export type SubdeviceModbusRtuParser=Readonly<Omit<Required<Definition>,'fields'>&{fields:readonly Readonly<Required<NonNullable<Definition['fields']>[number]>>[]}>
export type SubdeviceModbusRtuPreview=Readonly<Required<Schema<'DeviceTypeSubdeviceModbusRtuDataParserPreviewResponse'>>>
const bad=()=>new Error('请核对子设备Native配置、实际子设备和当前绑定地址')
/** 复用旧字段校验，不放宽旧Native读取true；新配置另有显式合同。 */
export function decodeSubdeviceModbusRtuParser(value:RawRuleJsonValue):SubdeviceModbusRtuParser{
 if(value.at(['useSubdeviceAddress']).boolean()!==true)throw bad()
 for(const key of ['slaveAddress','functionCode','dataBytes'])value.at([key]).integerText()
 const fields=value.at(['fields']);for(let index=0;index<fields.arrayLength();index++)fields.at([index,'offset']).integerText()
 const copied=JSON.parse(value.raw()),validated=normalizeModbusRtuParser({...copied,useSubdeviceAddress:false})
 return Object.freeze({...validated,useSubdeviceAddress:true}) as SubdeviceModbusRtuParser
}
export const normalizeSubdeviceModbusRtuParser=(value:unknown)=>decodeSubdeviceModbusRtuParser(readRawRuleJson(new TextEncoder().encode(JSON.stringify(value))))
export const formSubdeviceModbusRtuParser=(value:ModbusRtuForm,hexMode:boolean)=>normalizeSubdeviceModbusRtuParser({...formModbusRtuParser(value,hexMode),useSubdeviceAddress:true})
/** 管理读回必须对应本次实际子设备和类型；有效unit不覆盖保存配置中的slaveAddress。 */
export function decodeSubdeviceModbusRtuPreview(value:RawRuleJsonValue,typeId:string,subDeviceId:string):SubdeviceModbusRtuPreview{
 const keys=['matched','reason','attributesJson','binding','effectiveSlaveAddress'];if(value.kind!=='object'||value.keys().length!==keys.length||keys.some(key=>!value.optional([key])))throw bad()
 const matched=value.at(['matched']).boolean(),reason=value.at(['reason']).string(),attributesJson=value.at(['attributesJson']).string(),attributes=readRawRuleJson(new TextEncoder().encode(attributesJson)),binding=value.at(['binding']),bindingKeys=['bindingId','gatewayDeviceId','subDeviceId','subDeviceTypeId','subDeviceAddress','addressRevision']
 if(binding.kind!=='object'||binding.keys().length!==bindingKeys.length||bindingKeys.some(key=>!binding.optional([key])))throw bad()
 const result=Object.fromEntries(bindingKeys.map(key=>[key,binding.at([key]).string()])),unit=value.at(['effectiveSlaveAddress']).integerText(),effectiveSlaveAddress=Number(unit)
 if(!/^[1-9][0-9]{0,2}$/.test(unit)||effectiveSlaveAddress>255||result.subDeviceAddress!==unit||!definitionUuid(result.bindingId!)||!definitionUuid(result.gatewayDeviceId!)||result.gatewayDeviceId===subDeviceId||result.subDeviceId!==subDeviceId||result.subDeviceTypeId!==typeId||!referenceVersion(result.addressRevision))throw bad()
 if(!['MATCHED','NO_MATCH_SLAVE_ADDRESS','NO_MATCH_FUNCTION_CODE','NO_MATCH_DATA_BYTES','REJECTED'].includes(reason)||matched!==(reason==='MATCHED')||attributes.kind!=='object'||!matched&&attributesJson!=='{}')throw bad()
 return Object.freeze({matched,reason,attributesJson,effectiveSlaveAddress,binding:Object.freeze(result)}) as SubdeviceModbusRtuPreview
}
export async function previewSubdeviceModbusRtuParser(scope:{projectId:string;deviceTypeId:string;scopeKey:string},streamIdentifier:string,subdeviceNativeParser:SubdeviceModbusRtuParser,hexPayload:string,subDeviceId:string,current:()=>boolean,signal?:AbortSignal,selection?:DeviceDataPreviewSelection):Promise<SubdeviceModbusRtuPreview>{
 if(!scope.scopeKey||!definitionUuid(scope.projectId)||!definitionUuid(scope.deviceTypeId)||!definitionUuid(subDeviceId)||!/^[A-Za-z0-9_-]{1,64}$/.test(streamIdentifier))throw bad();validateModbusHex(hexPayload)
 const normalized=normalizeSubdeviceModbusRtuParser(subdeviceNativeParser),body:Schema<'PreviewDeviceTypeSubdeviceModbusRtuDataParserRequest'>={streamIdentifier,subdeviceNativeParser:{...normalized,fields:normalized.fields.map(row=>({...row}))},hexPayload,subDeviceId}
 if(selection&&(selection.context.deviceSource.kind!=='DEVICE'||selection.member.deviceTypeId!==scope.deviceTypeId||!deviceSourceMembers(selection.context.deviceSource).includes(selection.member.deviceId)||subDeviceId!==selection.member.deviceId))throw bad()
 if(!current())throw new IdentityChanged()
 const returned=selection?await api<Uint8Array>(`/api/v1/projects/${scope.projectId}/message-rules/data-parser-previews/subdevice-modbus-rtu`,{method:'post',body:{deviceSource:selection.context.deviceSource,sampleDeviceId:selection.member.deviceId,content:body} satisfies Schema<'MessageRuleSubdeviceModbusDataPreviewRequest'>,signal,responseType:'bytes',maxResponseBytes:128*1024}):await api<Uint8Array>(`/api/v1/projects/${scope.projectId}/device-types/${scope.deviceTypeId}/data-parser-previews/subdevice-modbus-rtu`,{method:'post',body,signal,responseType:'bytes',maxResponseBytes:128*1024})
 if(!current())throw new IdentityChanged()
 return decodeSubdeviceModbusRtuPreview(readRawRuleJson(returned),scope.deviceTypeId,subDeviceId)
}
