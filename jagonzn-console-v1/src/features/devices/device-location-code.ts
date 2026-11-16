import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'
import {devicePurposeCode,devicePurposeOrigin} from './purpose-code'

type Project=Schema<'ProjectResponse'>
type LocationCode=Schema<'DeviceLocationCodeResponse'>
const fields=['kind','version','purpose','projectKey','deviceId']
/** 只接受定位码的封闭五字段；认领能力不得进入只读查看流程。 */
export function locationCodePayload(project:Project,address:string,deviceId:string,value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('设备定位码格式无效')
 const code=value as Record<string,unknown>,keys=Object.keys(code)
 if(keys.length!==fields.length||keys.some(key=>!fields.includes(key))||code.kind!=='thingslink.device'||code.version!==1||code.purpose!=='LOCATE'||code.projectKey!==project.projectCode||code.deviceId!==deviceId||!project.projectCode||!deviceId)throw new Error('设备定位码范围无效')
 return devicePurposeCode(project,address,deviceId,code as LocationCode)
}
/** 先校验展示源站再读取；本接口没有签发、认领或自动轮换副作用。 */
export async function readLocationCode(project:Project,address:string,deviceId:string,signal:AbortSignal){
 devicePurposeOrigin(project,address)
 if(!project.id||!deviceId)throw new Error('请先选择项目和设备')
 const value=await api<unknown>(`${devicePath(project.id,deviceId)}/purpose-codes/location`,{signal,maxResponseBytes:8192})
 return locationCodePayload(project,address,deviceId,value)
}
