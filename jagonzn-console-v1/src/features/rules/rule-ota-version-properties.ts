import {devicesApi} from '@/features/devices/api'
import {decodeModelVersion,modelVersionTransport,type ModelVersion} from '@/features/device-types/model-version-api'
import {isStrictJsonNumber,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {deviceSourceMembers,sourceContract,type RuleDeviceSourceContract} from './rule-source-api'
import {sourceSelectionInput,type RuleSourceInput} from './rule-source-selection'
import {definitionUuid} from './device-task-definition-port'

export const otaVersionPropertyKey=/^[A-Za-z0-9_-]{1,32}$/
/** 页面来源或正式来源统一为完整集合，不能取多设备首成员代替。 */
export function otaRuleSource(source:RuleSourceInput|RuleDeviceSourceContract):RuleDeviceSourceContract{
 const result='members' in source||'name' in source?sourceContract(sourceSelectionInput(source as RuleSourceInput)):source as RuleDeviceSourceContract
 if(!['DEVICE','DEVICE_TYPE'].includes(String(result.kind))||!deviceSourceMembers(result).length)throw new Error('请选择有效设备来源后配置OTA检查')
 return result
}
function object(value:StrictJsonValue|undefined):value is StrictJsonObject{return !!value&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value)}
function keys(model:StrictJsonObject):string[]{
 const properties=model.properties;if(!object(properties))throw new Error('固定物模型缺少属性定义，未能读取版本属性候选')
 return Object.keys(properties).filter(key=>{const value=properties[key];return otaVersionPropertyKey.test(key)&&object(value)&&value.dataType==='TEXT'&&['UNDEFINED','REPORT','SHARED'].includes(String(value.accessType))}).sort()
}
/** DEVICE读取每台设备当前绑定的冻结版本，TYPE读取最新发布版本；候选为完整来源交集，不读取影子值。 */
export async function readRuleOtaVersionProperties(project:string,source:RuleSourceInput|RuleDeviceSourceContract,signal:AbortSignal):Promise<readonly string[]>{
 if(!definitionUuid(project))throw new Error('当前项目不可读取')
 const current=otaRuleSource(source),ids=deviceSourceMembers(current),snapshots=new Map<string,Promise<readonly string[]>>()
 async function snapshot(type:string,version:ModelVersion){
  if(version.digestAlgorithm!=='PG_JSONB_TEXT_V1_SHA256')throw new Error('固定物模型摘要类型不可读取')
  const key=type+':'+JSON.stringify(version)
  if(!snapshots.has(key))snapshots.set(key,modelVersionTransport.snapshot(project,type,version.id,signal,version).then(value=>{signal.throwIfAborted();return keys(value.modelSnapshot)}))
  return snapshots.get(key)!
 }
 if(current.kind==='DEVICE_TYPE'){const type=ids[0]!,version=await modelVersionTransport.latest(project,type,signal);signal.throwIfAborted();return snapshot(type,version)}
 const choices:(readonly string[])[]=new Array(ids.length);let offset=0
 await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{while(offset<ids.length){signal.throwIfAborted();const index=offset++,device=ids[index]!,binding=await devicesApi.binding(project,device,signal);signal.throwIfAborted();if(binding.deviceId!==device||!definitionUuid(binding.deviceTypeId)||!binding.version)throw new Error('来源设备当前物模型绑定不可用，未能读取版本属性候选');const version=decodeModelVersion(binding.version,binding.deviceTypeId);choices[index]=await snapshot(binding.deviceTypeId,version)}}))
 signal.throwIfAborted();return Object.freeze(choices[0]!.filter(key=>choices.every(values=>values.includes(key))))
}
