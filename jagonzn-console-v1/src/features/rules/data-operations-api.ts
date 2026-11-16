import type {Schema} from '@/core/contracts'
import {readRawRuleJson,type RawRuleJsonValue} from './raw-rule-json'
import {normalizeGatewayDataParser,decodeGatewayDataParser} from './gateway-data-parser-api'
import {decodeModbusRtuParser} from './modbus-rtu-parser-api'
import {decodeSubdeviceModbusRtuParser} from './subdevice-modbus-rtu-parser-api'
import {decodeDataDownlinkFunction} from './data-downlink-function-api'

type Contract=Schema<'DataRuleOperationsDefinition'>
type OperationContract=NonNullable<Contract['operations']>[number]
export type DataOperation=Readonly<Required<Pick<OperationContract,'id'|'kind'>>&Pick<OperationContract,'transportTarget'|'inputContract'>&{nativeParser?:ReturnType<typeof decodeModbusRtuParser>;subdeviceNativeParser?:ReturnType<typeof decodeSubdeviceModbusRtuParser>;function?:Readonly<Required<NonNullable<OperationContract['function']>>>;gatewayParser?:ReturnType<typeof decodeGatewayDataParser>;dataDownlink?:ReturnType<typeof decodeDataDownlinkFunction>}>
export type DataOperations=Readonly<Omit<Required<Contract>,'operations'>&{operations:readonly DataOperation[]}>
export type DataOperationKind=DataOperation['kind']
export type DataOperationContext={deviceKind:string;payloadProtocol:string;streamFormat:string;streamTemplate?:boolean}
export const dataOperationLabels:Record<DataOperationKind,string>={MODBUS_RTU:'Modbus RTU解析',PROPERTY:'属性解析函数',GATEWAY_PROPERTY:'云网关解析函数',DATA_DOWNLINK:'向当前设备下发自定义数据'}
const bad=()=>new Error('请核对操作类型、完整配置与数量上限')
function closed(value:RawRuleJsonValue,keys:readonly string[]){if(value.kind!=='object'||value.keys().length!==keys.length||keys.some(key=>!value.optional([key])))throw bad()}
/** 严格读取完整组合；各分支继续使用原不可变配置合同。 */
export function decodeDataOperations(value:RawRuleJsonValue):DataOperations{
 closed(value,['profile','operations']);if(value.at(['profile']).string()!=='DATA_OPERATIONS_V1')throw bad()
 const list=value.at(['operations']);if(list.arrayLength()<1||list.arrayLength()>13)throw bad()
 const ids=new Set<string>(),counts=new Map<string,number>(),operations:DataOperation[]=[]
 for(let index=0;index<list.arrayLength();index++){
  const row=list.at([index]),id=row.at(['id']).string(),kind=row.at(['kind']).string()
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)||ids.has(id)||!['MODBUS_RTU','PROPERTY','GATEWAY_PROPERTY','DATA_DOWNLINK'].includes(kind))throw bad()
  ids.add(id);const count=(counts.get(kind)??0)+1;counts.set(kind,count);if(count>(kind==='MODBUS_RTU'?10:1))throw bad()
  if(kind==='MODBUS_RTU'){
   const native=row.optional(['nativeParser']),subdevice=row.optional(['subdeviceNativeParser']);if(!!native===!!subdevice)throw bad()
   closed(row,['id','kind',native?'nativeParser':'subdeviceNativeParser'])
   operations.push(Object.freeze(native?{id,kind,nativeParser:decodeModbusRtuParser(native)}:{id,kind,subdeviceNativeParser:decodeSubdeviceModbusRtuParser(subdevice!)}))
  }else if(kind==='PROPERTY'){
   const inputContract=row.optional(['inputContract']);closed(row,['id','kind','function',...(inputContract?['inputContract']:[])]);if(inputContract&&inputContract.string()!=='LEGACY_TEXT_V1')throw bad();const fn=row.at(['function']);closed(fn,['format','source']);if(fn.at(['format']).string()!=='COMMON_JS')throw bad()
   const configuration=normalizeGatewayDataParser({source:fn.at(['source']).string()})
   operations.push(Object.freeze({id,kind,function:Object.freeze({format:'COMMON_JS',source:configuration.source}),...(inputContract?{inputContract:'LEGACY_TEXT_V1' as const}:{})}))
  }else if(kind==='GATEWAY_PROPERTY'){
   closed(row,['id','kind','gatewayParser']);operations.push(Object.freeze({id,kind,gatewayParser:decodeGatewayDataParser(row.at(['gatewayParser']))}))
  }else{
   closed(row,['id','kind','dataDownlink','transportTarget']);if(row.at(['transportTarget']).string()!=='ORIGINAL_PHYSICAL_DEVICE')throw bad()
   operations.push(Object.freeze({id,kind:'DATA_DOWNLINK',dataDownlink:decodeDataDownlinkFunction(row.at(['dataDownlink'])),transportTarget:'ORIGINAL_PHYSICAL_DEVICE'}))
  }
 }
 const result=Object.freeze({profile:'DATA_OPERATIONS_V1',operations:Object.freeze(operations)}) as DataOperations
 if(new TextEncoder().encode(JSON.stringify(result)).length>65536)throw new Error('所有操作完整配置合计不能超过65536个UTF8字节')
 return result
}
export const normalizeDataOperations=(value:unknown)=>decodeDataOperations(readRawRuleJson(new TextEncoder().encode(JSON.stringify(value))))
export const newDataOperationId=()=>`op_${crypto.randomUUID().replaceAll('-','')}`
/** 页面能力矩阵不替代实际原件、绑定、模型或运输授权。 */
export function dataOperationAllowed(kind:DataOperationKind,context:DataOperationContext):boolean{
 const supported=context.deviceKind==='DIRECT'&&context.payloadProtocol==='STANDARD'||context.deviceKind==='GATEWAY'&&context.payloadProtocol==='STANDARD_GATEWAY'||context.deviceKind==='SUB_DEVICE'
 return supported&&(context.deviceKind!=='SUB_DEVICE'||context.streamFormat==='HEX')&&(kind!=='GATEWAY_PROPERTY'||context.deviceKind==='GATEWAY'&&context.payloadProtocol==='STANDARD_GATEWAY')&&(kind!=='MODBUS_RTU'||context.streamFormat==='HEX')
}
export function validateDataOperationsContext(value:DataOperations,context:DataOperationContext):void{
 if(value.operations.some(operation=>operation.inputContract&&(context.streamFormat!=='TEXT'||context.streamTemplate!==false)))throw new Error('已保存函数的文本输入方式要求全部来源使用非模板TEXT数据流')
 if(value.operations.some(operation=>!dataOperationAllowed(operation.kind,context)||operation.subdeviceNativeParser&&context.deviceKind!=='SUB_DEVICE'))throw new Error('当前类型或数据流不支持所选操作，请核对设备类型及HEX输入')
}
