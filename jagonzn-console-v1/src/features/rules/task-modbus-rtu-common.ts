import type {Schema} from '@/core/contracts'
import {api,assertIdentity,identityEpoch} from '@/core/http'
import {taskSelection,type TaskSelectionWrite} from './models'

/** 唯一生成Schema的固定或属性配置；不是自由脚本或设备快照。 */
export type TaskModbusRtuCommon=Schema<'TaskModbusRtuCommonPreviewRequest'>|Schema<'TaskModbusRtuSingleRegisterPreviewRequest'>|Schema<'TaskModbusRtuMultipleCoilsPreviewRequest'>|Schema<'TaskModbusRtuMultipleRegistersPreviewRequest'>|Schema<'TaskModbusRtuSingleCoilPreviewRequest'>|Schema<'TaskModbusRtuAttributeRegisterCommon'>|Schema<'TaskModbusRtuAttributeRegistersCommon'>
export function hasTaskModbusRtuCommon(value:unknown):boolean{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,'common')}
export function taskModbusRtuCommon(value:unknown):TaskModbusRtuCommon{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('请填写完整的Modbus RTU配置。')
 const raw=value as Record<string,unknown>
 if(raw.schemaVersion===2){
  const fields=raw.functionCode==='06'?'checksum,functionCode,kind,registerAddress,registerAttribute,schemaVersion,unitId':'checksum,functionCode,kind,registerAddress,registerAttributes,schemaVersion,unitId'
  if(Object.keys(raw).sort().join(',')!==fields||raw.kind!=='MODBUS_RTU'||raw.checksum!=='CRC16_MODBUS'||raw.functionCode!=='06'&&raw.functionCode!=='10'||typeof raw.unitId!=='number'||!Number.isInteger(raw.unitId)||raw.unitId<1||raw.unitId>255||typeof raw.registerAddress!=='number'||!Number.isInteger(raw.registerAddress)||raw.registerAddress<0||raw.registerAddress>65535)throw new Error('Modbus RTU属性配置字段或地址不合法。')
  const valid=(key:unknown):key is string=>typeof key==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(key)
  if(raw.functionCode==='06'){if(!valid(raw.registerAttribute))throw new Error('请填写有效的设备属性标识符。');return {schemaVersion:2,kind:'MODBUS_RTU',unitId:raw.unitId,functionCode:'06',registerAddress:raw.registerAddress,registerAttribute:raw.registerAttribute,checksum:'CRC16_MODBUS'}}
  if(!Array.isArray(raw.registerAttributes)||raw.registerAttributes.length<1||raw.registerAttributes.length>123||raw.registerAddress+raw.registerAttributes.length>65536)throw new Error('请配置1至123个设备属性标识符。')
  const keys:string[]=[];for(let i=0;i<raw.registerAttributes.length;i++){const key=raw.registerAttributes[i];if(!Object.hasOwn(raw.registerAttributes,i)||!valid(key))throw new Error('请填写完整有效的设备属性标识符。');keys.push(key)}
  return {schemaVersion:2,kind:'MODBUS_RTU',unitId:raw.unitId,functionCode:'10',registerAddress:raw.registerAddress,registerAttributes:keys,checksum:'CRC16_MODBUS'}
 }
 const v=value as Record<string,unknown>,write=v.functionCode==='05'||v.functionCode==='06',singleCoil=v.functionCode==='05',coils=v.functionCode==='0F',registers=v.functionCode==='10',fields=registers?'checksum,functionCode,kind,registerAddress,registerValues,schemaVersion,unitId':coils?'checksum,coilValues,functionCode,kind,registerAddress,schemaVersion,unitId':write?'checksum,functionCode,kind,registerAddress,registerValue,schemaVersion,unitId':'checksum,functionCode,kind,quantity,registerAddress,schemaVersion,unitId'
 if(Object.keys(v).sort().join(',')!==fields||v.schemaVersion!==1||v.kind!=='MODBUS_RTU'||v.checksum!=='CRC16_MODBUS'||typeof v.functionCode!=='string'||!['01','02','03','04','05','06','0F','10'].includes(v.functionCode))throw new Error('Modbus RTU配置字段或功能码不合法。')
 if(singleCoil&&v.registerValue!==0&&v.registerValue!==65280)throw new Error('线圈值仅支持0（关闭）或65280（开启）。')
 for(const [key,min,max] of [['unitId',1,255],['registerAddress',0,65535],...(coils||registers?[]:write?[['registerValue',0,65535] as const]:[['quantity',1,125] as const])] as const)if(typeof v[key]!=='number'||!Number.isInteger(v[key])||v[key]<min||v[key]>max)throw new Error('从机地址、起始地址、读取数量或寄存器值超出范围。')
 if(registers){
  if(!Array.isArray(v.registerValues)||v.registerValues.length<1||v.registerValues.length>123)throw new Error('请配置1至123个寄存器值。')
  const values:number[]=[];for(let i=0;i<v.registerValues.length;i++){const word=v.registerValues[i];if(!Object.hasOwn(v.registerValues,i)||typeof word!=='number'||!Number.isInteger(word)||word<0||word>65535)throw new Error('寄存器值只能是完整的0至65535整数列表。');values.push(word)}
  if((v.registerAddress as number)+values.length>65536)throw new Error('寄存器范围超出地址。')
  return {schemaVersion:1,kind:'MODBUS_RTU',unitId:v.unitId as number,functionCode:'10',registerAddress:v.registerAddress as number,registerValues:values,checksum:'CRC16_MODBUS'}
 }
 if(coils){
  if(!Array.isArray(v.coilValues)||v.coilValues.length<1||v.coilValues.length>125)throw new Error('请配置1至125个线圈状态值。')
  const values:number[]=[];for(let i=0;i<v.coilValues.length;i++){if(!Object.hasOwn(v.coilValues,i)||v.coilValues[i]!==0&&v.coilValues[i]!==1)throw new Error('线圈状态值只能是完整的0或1列表。');values.push(v.coilValues[i] as number)}
  if((v.registerAddress as number)+values.length>65536)throw new Error('线圈范围超出地址。')
  return {schemaVersion:1,kind:'MODBUS_RTU',unitId:v.unitId as number,functionCode:'0F',registerAddress:v.registerAddress as number,coilValues:values,checksum:'CRC16_MODBUS'}
 }
 if(singleCoil)return {schemaVersion:1,kind:'MODBUS_RTU',unitId:v.unitId as number,functionCode:'05',registerAddress:v.registerAddress as number,registerValue:v.registerValue===65280?65280:0,checksum:'CRC16_MODBUS'}
 if(write)return {schemaVersion:1,kind:'MODBUS_RTU',unitId:v.unitId as number,functionCode:'06',registerAddress:v.registerAddress as number,registerValue:v.registerValue as number,checksum:'CRC16_MODBUS'}
 if((v.registerAddress as number)+(v.quantity as number)>65536)throw new Error('读取范围超出寄存器地址。')
 return {schemaVersion:1,kind:'MODBUS_RTU',unitId:v.unitId as number,functionCode:v.functionCode as Schema<'TaskModbusRtuCommonPreviewRequest'>['functionCode'],registerAddress:v.registerAddress as number,quantity:v.quantity as number,checksum:'CRC16_MODBUS'}
}
/** 只编译受控原库及显式CURRENT调用；后端必须再次精确核同，不以客户端编译授予运行许可。 */
export function taskModbusRtuSource(value:TaskModbusRtuCommon):string{const v=taskModbusRtuCommon(value);if('registerAttribute' in v||'registerAttributes' in v){const prefix=`module.exports=function(){const a=Cloud.getCurrentAttributes();function w(k){const v=a[k];if(!Number.isInteger(v)||v<0||v>65535)throw Error('TASK_MODBUS_CURRENT');return v;}Cloud.ModbusRTU.setUnitId(${v.unitId});return {type:'hex',msg:Cloud.ModbusRTU.`;return prefix+('registerAttribute' in v?`fc06(${v.registerAddress},w("${v.registerAttribute}"))`:`fc16(${v.registerAddress},[${v.registerAttributes.map(key=>`w("${key}")`).join(',')}])`)+"};};"}if(v.functionCode==='05')return `module.exports=function(){Cloud.ModbusRTU.setUnitId(${v.unitId});return {type:'hex',msg:Cloud.ModbusRTU.fc05(${v.registerAddress},${v.registerValue===65280?1:0})};};`;if(v.functionCode==='10')return `module.exports=function(){Cloud.ModbusRTU.setUnitId(${v.unitId});return {type:'hex',msg:Cloud.ModbusRTU.fc16(${v.registerAddress},[${v.registerValues.join(',')}])};};`;if(v.functionCode==='0F')return `module.exports=function(){Cloud.ModbusRTU.setUnitId(${v.unitId});return {type:'hex',msg:Cloud.ModbusRTU.fc15(${v.registerAddress},[${v.coilValues.join(',')}])};};`;return `module.exports=function(){Cloud.ModbusRTU.setUnitId(${v.unitId});return {type:'hex',msg:Cloud.ModbusRTU.fc${v.functionCode}(${v.registerAddress},${v.functionCode==='06'?v.registerValue:v.quantity})};};`}
export function taskModbusRtuInput(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Modbus RTU任务配置不完整。')
 const v=value as Record<string,unknown>,allowed=['protocol','streamIdentifier','format','source','common'];if(Object.keys(v).some(k=>!allowed.includes(k))||!Object.hasOwn(v,'common'))throw new Error('Modbus RTU任务配置字段不合法。')
 if(v.protocol!=='MQTT'&&v.protocol!=='TCP'||typeof v.streamIdentifier!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(v.streamIdentifier))throw new Error('请选择有效的推送方式和自定义数据流。')
 const common=taskModbusRtuCommon(v.common),source=taskModbusRtuSource(common)
 if(Object.hasOwn(v,'format')&&v.format!=='COMMON_JS'||Object.hasOwn(v,'source')&&v.source!==source)throw new Error('Modbus RTU配置与原受控内容不一致。')
 return {protocol:v.protocol,streamIdentifier:v.streamIdentifier,format:'COMMON_JS' as const,source,common}
}
export async function previewTaskModbusRtu(project:string,value:TaskModbusRtuCommon,signal?:AbortSignal,selection?:TaskSelectionWrite):Promise<Schema<'TaskPropertyFunctionPreviewResponse'>>{
 const config=taskModbusRtuCommon(value);let body:TaskModbusRtuCommon|Schema<'TaskModbusRtuAttributePreviewRequest'>=config
 if('registerAttribute' in config||'registerAttributes' in config){if(!selection)throw new Error('动态指令预览需要唯一的指定设备目标，保存与实际执行不受此限制。');body={common:config,...taskSelection(selection)}}
 const result=await api<Schema<'TaskPropertyFunctionPreviewResponse'>>(`/api/v1/projects/${project}/task-modbus-rtu-previews`,{method:'post',body,signal})
 if(!result||!['SUCCESS','FAILURE','TIMEOUT','RESOURCE_EXHAUSTED','REJECTED'].includes(result.status)||result.outputJson!==null&&typeof result.outputJson!=='string'||result.errorCode!==null&&typeof result.errorCode!=='string'||!Number.isSafeInteger(result.durationMillis)||result.durationMillis<0||result.guestCpuMillis!==null&&(!Number.isSafeInteger(result.guestCpuMillis)||result.guestCpuMillis<0))throw new Error('Modbus预览返回不完整，请重新生成。')
 return result
}

/** 真实完整任务范围的已发布NUMBER建议；缺CURRENT不妨碍输入或保存。 */
export async function taskModbusNumberAttributes(project:string,selection:TaskSelectionWrite,search:string,signal:AbortSignal){
 const epoch=identityEpoch(),body:Schema<'TaskModbusNumberAttributeQuery'>={...taskSelection(selection),search,limit:50}
 const page=await api<Schema<'TaskModbusNumberAttributePage'>>(`/api/v1/projects/${project}/task-modbus-number-attributes/selections`,{method:'post',body,signal});assertIdentity(epoch)
 if(!page||!Array.isArray(page.items)||page.items.length>50||typeof page.hasMore!=='boolean'||page.items.some(row=>!row||typeof row.identifier!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(row.identifier)||typeof row.name!=='string')||new Set(page.items.map(row=>row.identifier)).size!==page.items.length)throw new Error('设备属性建议读取不完整。')
 return page.items.map(row=>({value:row.identifier,name:row.name}))
}
