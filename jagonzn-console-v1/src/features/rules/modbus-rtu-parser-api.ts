import type {DeviceDataPreviewSelection} from './use-device-data-preview-sample'
import {deviceSourceMembers} from './rule-source-api'
import {api,IdentityChanged} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
import {readRawRuleJson,type RawRuleJsonValue} from './raw-rule-json'

type Definition=Schema<'ModbusRtuDataParserDefinition'>
export type ModbusRtuParser=Readonly<Omit<Required<Definition>,'fields'>&{fields:readonly Readonly<Required<NonNullable<Definition['fields']>[number]>>[]}>
export type ModbusRtuPreview=Readonly<Required<Schema<'DeviceTypeModbusRtuDataParserPreviewResponse'>>>
export const modbusRtuFieldTypes=[['INT16_BE','16位整数'],['UINT16_BE','16位无符号整数'],['INT32_BE','32位整数'],['UINT32_BE','32位无符号整数'],['FLOAT32_BE','32位浮点数']] as const
export type ModbusRtuFieldType=typeof modbusRtuFieldTypes[number][0]|'BOOL_BIT'
export const modbusRtuFunctionCodes=[[1,'读取线圈状态'],[2,'读取输入状态'],[3,'读取保持寄存器'],[4,'读取输入寄存器']] as const
export const modbusRtuFunctionLabel=(value:number)=>modbusRtuFunctionCodes.find(([code])=>code===value)![1]
export const isModbusRtuCoil=(value:number)=>value===1||value===2
const fieldType=(value:string):value is ModbusRtuFieldType=>value==='BOOL_BIT'||modbusRtuFieldTypes.some(([type])=>type===value)
export const modbusRtuFieldLabel=(value:ModbusRtuFieldType)=>value==='BOOL_BIT'?'布尔值':modbusRtuFieldTypes.find(([type])=>type===value)![1]
export const modbusRtuFieldWidth=(value:Exclude<ModbusRtuFieldType,'BOOL_BIT'>)=>value==='INT16_BE'||value==='UINT16_BE'?2:4
export const modbusRtuSourceFormat=(value:ModbusRtuParser)=>isModbusRtuCoil(value.functionCode)?'MODBUS_RTU_V4':value.crc==='NONE'?'MODBUS_RTU_V3':value.fields.every(row=>row.dataType==='FLOAT32_BE')?'MODBUS_RTU_V1':'MODBUS_RTU_V2'
export type ModbusRtuForm={slaveAddress:string;functionCode:number;dataBytes:string;crc:'CRC16_MODBUS'|'NONE';fields:{id:string;propertyKey:string;offset:string;dataType:ModbusRtuFieldType;coefficient:string}[]}
const bad=()=>new Error('请核对Modbus RTU解析配置及样例')
function fields(value:RawRuleJsonValue,keys:readonly string[]){if(value.kind!=='object'||value.keys().length!==keys.length||keys.some(key=>!value.optional([key])))throw bad()}
function integer(value:RawRuleJsonValue,min:number,max:number){const token=value.integerText();if(token.length>String(max).length)throw bad();const n=Number(token);if(n<min||n>max)throw bad();return n}
/** 与实际BigDecimal precision/scale核同；保留正号、尾零和指数原词法。 */
export function validModbusCoefficient(value:string){
 if(typeof value!=='string'||value.length>64)return false
 const match=/^[+-]?(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(value)
 if(!match||match[0]!==value)return false
 const precision=((match[1]!+(match[2]??'')).replace(/^0+/,'').length)||1,scale=BigInt((match[2]??'').length)-BigInt(match[3]??'0')
 return precision<=32&&scale>=-16n&&scale<=16n
}
export function decodeModbusRtuParser(value:RawRuleJsonValue):ModbusRtuParser{
 fields(value,['slaveAddress','functionCode','dataBytes','crc','useSubdeviceAddress','fields'])
 const slaveAddress=integer(value.at(['slaveAddress']),1,255),fc=integer(value.at(['functionCode']),1,4),functionCode=fc===1?1:fc===2?2:fc===3?3:4,coil=isModbusRtuCoil(functionCode),dataBytes=integer(value.at(['dataBytes']),coil?1:2,250),rows=value.at(['fields'])
 const crc=value.at(['crc']).string();if(crc!=='CRC16_MODBUS'&&crc!=='NONE')throw bad()
 if(!coil&&dataBytes%2||value.at(['useSubdeviceAddress']).boolean()||rows.arrayLength()<1||rows.arrayLength()>64)throw bad()
 const names=new Set<string>(),result=[]
 for(let i=0;i<rows.arrayLength();i++){
  const row=rows.at([i]);fields(row,['propertyKey','offset','dataType','coefficient'])
  const propertyKey=row.at(['propertyKey']).string(),dataType=row.at(['dataType']).string(),coefficient=row.at(['coefficient']).string();if(!fieldType(dataType))throw bad()
  const width=dataType==='BOOL_BIT'?0:modbusRtuFieldWidth(dataType),offset=integer(row.at(['offset']),0,coil?1999:250-width)
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(propertyKey)||names.has(propertyKey)||(coil?(dataType!=='BOOL_BIT'||coefficient!=='1'||offset>=dataBytes*8):(dataType==='BOOL_BIT'||offset+width>dataBytes||!validModbusCoefficient(coefficient))))throw bad();names.add(propertyKey)
  result.push(Object.freeze({propertyKey,offset,dataType,coefficient}))
 }
 return Object.freeze({slaveAddress,functionCode,dataBytes,crc,useSubdeviceAddress:false,fields:Object.freeze(result)})
}
export function normalizeModbusRtuParser(value:unknown):ModbusRtuParser{return decodeModbusRtuParser(readRawRuleJson(new TextEncoder().encode(JSON.stringify(value))))}
export function newModbusRtuForm(value?:ModbusRtuParser):ModbusRtuForm{return{slaveAddress:String(value?.slaveAddress??1),functionCode:value?.functionCode??3,dataBytes:String(value?.dataBytes??4),crc:value?.crc??'CRC16_MODBUS',fields:value?value.fields.map(row=>({id:crypto.randomUUID(),propertyKey:row.propertyKey,offset:String(row.offset),dataType:row.dataType,coefficient:row.coefficient})):[{id:crypto.randomUUID(),propertyKey:'',offset:'0',dataType:'FLOAT32_BE',coefficient:'1'}]}}
export function formModbusRtuParser(value:ModbusRtuForm,hexMode:boolean):ModbusRtuParser{
 const n=(text:string,length=3)=>{if(!/^(0|[1-9][0-9]*)$/.test(text)||text.length>length)throw bad();return Number(text)}
 const dataBytes=hexMode?(/^[0-9a-fA-F]{1,2}$/.test(value.dataBytes)?parseInt(value.dataBytes,16):NaN):n(value.dataBytes)
 if(!Number.isInteger(dataBytes))throw bad()
 return normalizeModbusRtuParser({slaveAddress:n(value.slaveAddress),functionCode:value.functionCode,dataBytes,crc:value.crc,useSubdeviceAddress:false,fields:value.fields.map(row=>({propertyKey:row.propertyKey,offset:n(row.offset,4),dataType:row.dataType,coefficient:row.coefficient}))})
}
export function validateModbusHex(hex:string){if(typeof hex!=='string'||hex.length>2048||!/^[0-9a-fA-F \t\r\n\f]+$/.test(hex))throw bad();const bytes=hex.replace(/[ \t\r\n\f]/g,'');if(!bytes.length||bytes.length%2||bytes.length>510)throw bad()}
export async function previewModbusRtuParser(scope:{projectId:string;deviceTypeId:string;scopeKey:string},streamIdentifier:string,nativeParser:ModbusRtuParser,hex:string,current:()=>boolean,signal?:AbortSignal,selection?:DeviceDataPreviewSelection):Promise<ModbusRtuPreview>{
 if(!scope.scopeKey||!definitionUuid(scope.projectId)||!definitionUuid(scope.deviceTypeId)||!/^[A-Za-z0-9_-]{1,64}$/.test(streamIdentifier))throw bad();validateModbusHex(hex)
 const normalized=normalizeModbusRtuParser(nativeParser)
 const body:Schema<'PreviewDeviceTypeModbusRtuDataParserRequest'>={streamIdentifier,nativeParser:{...normalized,fields:normalized.fields.map(row=>({...row}))},hex}
 if(selection&&(selection.context.deviceSource.kind!=='DEVICE'||selection.member.deviceTypeId!==scope.deviceTypeId||!deviceSourceMembers(selection.context.deviceSource).includes(selection.member.deviceId)))throw bad()
 if(!current())throw new IdentityChanged()
 const bytes=selection?await api<Uint8Array>(`/api/v1/projects/${scope.projectId}/message-rules/data-parser-previews/modbus-rtu`,{method:'post',body:{deviceSource:selection.context.deviceSource,sampleDeviceId:selection.member.deviceId,content:body} satisfies Schema<'MessageRuleModbusDataPreviewRequest'>,signal,responseType:'bytes',maxResponseBytes:128*1024}):await api<Uint8Array>(`/api/v1/projects/${scope.projectId}/device-types/${scope.deviceTypeId}/data-parser-previews/modbus-rtu`,{method:'post',body,signal,responseType:'bytes',maxResponseBytes:128*1024})
 if(!current())throw new IdentityChanged()
 const value=readRawRuleJson(bytes);fields(value,['matched','reason','attributesJson'])
 const matched=value.at(['matched']).boolean(),reason=value.at(['reason']).string(),attributesJson=value.at(['attributesJson']).string(),attributes=readRawRuleJson(new TextEncoder().encode(attributesJson))
 if(!['MATCHED','NO_MATCH_SLAVE_ADDRESS','NO_MATCH_FUNCTION_CODE','NO_MATCH_DATA_BYTES','REJECTED'].includes(reason)||matched!==(reason==='MATCHED')||attributes.kind!=='object'||!matched&&attributesJson!=='{}')throw bad()
 if(reason!=='MATCHED'&&reason!=='NO_MATCH_SLAVE_ADDRESS'&&reason!=='NO_MATCH_FUNCTION_CODE'&&reason!=='NO_MATCH_DATA_BYTES'&&reason!=='REJECTED')throw bad()
 return Object.freeze({matched,reason,attributesJson})
}
