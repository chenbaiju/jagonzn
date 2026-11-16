import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export type TypeAssignmentIntent=Readonly<{project:string;device:string;expected:string|null;next:string|null;key:string}>
export function prepareTypeAssignment(project:string,device:string,expected:string|null,next:string|null):TypeAssignmentIntent {
 if(!uuid.test(project)||!uuid.test(device)||expected!==null&&!uuid.test(expected)||next!==null&&!uuid.test(next))throw new Error('请选择有效的设备类型')
 return Object.freeze({project,device,expected,next,key:crypto.randomUUID()})
}
/** 只发送类型内容前提，不拼接页面上可能已过时的名称、说明、位置或业务标识。 */
export function submitTypeAssignment(intent:TypeAssignmentIntent,signal:AbortSignal){
 const body={deviceTypeId:intent.next,expectedDeviceTypeId:intent.expected} satisfies Schema<'ChangeConsoleDeviceTypeAssignmentRequest'>
 return api<Uint8Array>(`${devicePath(intent.project,intent.device)}/type-assignment`,{method:'put',body,signal,responseType:'bytes',maxResponseBytes:2048,headers:{'Idempotency-Key':intent.key}})
}
/** 有界原始字节严格验当前设备和所选类型；坏2xx不能变成可自动重试的参数错误。 */
export function decodeTypeAssignment(bytes:Uint8Array,intent:TypeAssignmentIntent):Schema<'ConsoleDeviceTypeAssignmentResponse'> {
 const value=parseDashboardRuntimeResponse(bytes)
 if(Object.keys(value).length!==2||value.deviceId!==intent.device||value.deviceTypeId!==intent.next)throw new Error('设备类型回执不完整或与所选类型不符')
 return {deviceId:intent.device,deviceTypeId:intent.next}
}
