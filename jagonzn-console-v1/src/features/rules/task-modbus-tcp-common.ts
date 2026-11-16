import type {Schema} from '@/core/contracts'
import {api} from '@/core/http'
import {taskModbusRtuCommon} from './task-modbus-rtu-common'
import {taskSelection,type TaskSelectionWrite} from './models'

export type TaskModbusTcpCommon=Schema<'TaskModbusTcpCommonPreviewRequest'>|Schema<'TaskModbusTcpSingleCoilPreviewRequest'>|Schema<'TaskModbusTcpSingleRegisterPreviewRequest'>|Schema<'TaskModbusTcpMultipleCoilsPreviewRequest'>|Schema<'TaskModbusTcpMultipleRegistersPreviewRequest'>|Schema<'TaskModbusTcpAttributeRegisterCommon'>|Schema<'TaskModbusTcpAttributeRegistersCommon'>
/** TCP只复用原RTU纯字段校验；64上限和固定事务号是本域明确限制，不借RTU权限。 */
export function taskModbusTcpCommon(value:unknown):TaskModbusTcpCommon{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('请填写完整的Modbus TCP配置。')
 const v=value as Record<string,unknown>
 if(Object.keys(v).length!==7||v.kind!=='MODBUS_TCP'||v.transactionId!==0)throw new Error('Modbus TCP配置字段或功能码不合法。')
 const {transactionId,...rest}=v,rtu=taskModbusRtuCommon({...rest,kind:'MODBUS_RTU',checksum:'CRC16_MODBUS'})
 if('quantity' in rtu&&rtu.quantity>64)throw new Error('从机地址、起始地址或读取数量超出范围。')
 if('coilValues' in rtu&&rtu.coilValues.length>64||'registerValues' in rtu&&rtu.registerValues.length>64||'registerAttributes' in rtu&&rtu.registerAttributes.length>64)throw new Error('Modbus TCP数量或列表最多64项。')
 const {checksum,...common}=rtu
 return {...common,kind:'MODBUS_TCP',transactionId:0}
}
/** 旧读模板保持；新写臂只对原PDU增加变长MBAP头，不提供新的Cloud能力。 */
export function taskModbusTcpSource(value:TaskModbusTcpCommon):string{
 const v=taskModbusTcpCommon(value)
 if('quantity' in v)return `module.exports=function(){Cloud.ModbusRTU.setUnitId(${v.unitId});const r=Cloud.ModbusRTU.fc${v.functionCode}(${v.registerAddress},${v.quantity});return {type:'hex',msg:'000000000006'+r.slice(0,-4)};};`
 const dynamic='registerAttribute' in v||'registerAttributes' in v,prefix="module.exports=function(){"+(dynamic?"const a=Cloud.getCurrentAttributes();function w(k){const v=a[k];if(!Number.isInteger(v)||v<0||v>65535)throw Error('TASK_MODBUS_CURRENT');return v;}":"")+`Cloud.ModbusRTU.setUnitId(${v.unitId});const r=Cloud.ModbusRTU.`
 let call:string
 if(v.functionCode==='05')call=`fc05(${v.registerAddress},${v.registerValue===65280?1:0})`
 else if(v.functionCode==='06')call=`fc06(${v.registerAddress},${'registerAttribute' in v?`w("${v.registerAttribute}")`:v.registerValue})`
 else if(v.functionCode==='0F')call=`fc15(${v.registerAddress},[${v.coilValues.join(',')}])`
 else call=`fc16(${v.registerAddress},[${'registerAttributes' in v?v.registerAttributes.map(key=>`w("${key}")`).join(','):v.registerValues.join(',')}])`
 return prefix+call+";const p=r.slice(0,-4);return {type:'hex',msg:'00000000'+(p.length/2).toString(16).padStart(4,'0')+p};};"
}
export function taskModbusTcpInput(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Modbus TCP任务配置不完整。')
 const v=value as Record<string,unknown>;if(Object.keys(v).some(k=>!['protocol','streamIdentifier','format','source','common'].includes(k))||!Object.hasOwn(v,'common'))throw new Error('Modbus TCP任务配置字段不合法。')
 if(v.protocol!=='MQTT'&&v.protocol!=='TCP'||typeof v.streamIdentifier!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(v.streamIdentifier))throw new Error('请选择有效的推送方式和自定义数据流。')
 const common=taskModbusTcpCommon(v.common),source=taskModbusTcpSource(common)
 if(Object.hasOwn(v,'format')&&v.format!=='COMMON_JS'||Object.hasOwn(v,'source')&&v.source!==source)throw new Error('Modbus TCP配置与原受控内容不一致。')
 return {protocol:v.protocol,streamIdentifier:v.streamIdentifier,format:'COMMON_JS' as const,source,common}
}
export async function previewTaskModbusTcp(project:string,value:TaskModbusTcpCommon,signal:AbortSignal,selection?:TaskSelectionWrite):Promise<Schema<'TaskPropertyFunctionPreviewResponse'>>{
 const common=taskModbusTcpCommon(value);let body:TaskModbusTcpCommon|Schema<'TaskModbusTcpAttributePreviewRequest'>=common
 if('registerAttribute' in common||'registerAttributes' in common){if(!selection)throw new Error('动态指令预览需要唯一的指定设备目标，保存与实际执行不受此限制。');body={common,...taskSelection(selection)}}
 const result=await api<Schema<'TaskPropertyFunctionPreviewResponse'>>(`/api/v1/projects/${project}/task-modbus-tcp-previews`,{method:'post',body,signal})
 if(!result||!['SUCCESS','FAILURE','TIMEOUT','RESOURCE_EXHAUSTED','REJECTED'].includes(result.status)||result.outputJson!==null&&typeof result.outputJson!=='string'||result.errorCode!==null&&typeof result.errorCode!=='string'||!Number.isSafeInteger(result.durationMillis)||result.durationMillis<0||result.guestCpuMillis!==null&&(!Number.isSafeInteger(result.guestCpuMillis)||result.guestCpuMillis<0))throw new Error('Modbus预览返回不完整，请重新生成。')
 return result
}

/** 严格核真实MBAP长度及原配置，不把CRC或运输ACK误作Modbus响应。 */
export function taskModbusTcpFrame(config:TaskModbusTcpCommon,raw:string):string{
 const v=taskModbusTcpCommon(config),out=JSON.parse(raw)
 const count=v.functionCode==='10'?('registerAttributes' in v?v.registerAttributes:v.registerValues).length:v.functionCode==='0F'?v.coilValues.length:0,bytes=v.functionCode==='10'?13+2*count:v.functionCode==='0F'?13+Math.ceil(count/8):12
 if(!out||typeof out!=='object'||Array.isArray(out)||Object.keys(out).sort().join(',')!=='msg,type'||out.type!=='hex'||typeof out.msg!=='string'||!new RegExp('^[0-9a-fA-F]{'+bytes*2+'}$').test(out.msg)||out.msg.slice(0,8)!=='00000000'||parseInt(out.msg.slice(8,12),16)!==bytes-6||parseInt(out.msg.slice(12,14),16)!==v.unitId||out.msg.slice(14,16).toUpperCase()!==v.functionCode||parseInt(out.msg.slice(16,20),16)!==v.registerAddress)throw new Error('Modbus预览返回不完整。')
 return out.msg.toUpperCase()
}
