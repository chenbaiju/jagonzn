import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
import {taskPropertyFunctionValue} from './task-property-function'

export type TaskPropertyFunctionPreview=Schema<'TaskPropertyFunctionPreviewResponse'>
/** 纯预览只带当前项目真实样例与源码，不携带任务写入、计费或设备下发许可。 */
export async function previewTaskPropertyFunction(project:string,sampleDeviceId:string,source:string,signal?:AbortSignal):Promise<TaskPropertyFunctionPreview>{
 return previewFunction(project,sampleDeviceId,source,'task-property-function-previews',signal)
}
/** DATA目的由固定端口选择，模拟不得产生消息或借属性目的验证DATA输出。 */
export async function previewTaskDataFunction(project:string,sampleDeviceId:string,source:string,signal?:AbortSignal):Promise<TaskPropertyFunctionPreview>{
 return previewFunction(project,sampleDeviceId,source,'task-data-function-previews',signal)
}
/** 命令预览独立验证命令信封，只读当前样例，不受理真实下发。 */
export async function previewTaskCommandFunction(project:string,sampleDeviceId:string,source:string,signal?:AbortSignal):Promise<TaskPropertyFunctionPreview>{
 return previewFunction(project,sampleDeviceId,source,'task-command-function-previews',signal)
}
async function previewFunction(project:string,sampleDeviceId:string,source:string,path:'task-property-function-previews'|'task-data-function-previews'|'task-command-function-previews',signal?:AbortSignal):Promise<TaskPropertyFunctionPreview>{
 if(!definitionUuid(sampleDeviceId))throw new Error('请选择模拟的设备。')
 const body:Schema<'TaskPropertyFunctionPreviewRequest'>={sampleDeviceId,...taskPropertyFunctionValue({format:'COMMON_JS',source})}
 const value=await api<TaskPropertyFunctionPreview>(`/api/v1/projects/${project}/${path}`,{method:'post',body,signal})
 if(!value||!['SUCCESS','FAILURE','TIMEOUT','RESOURCE_EXHAUSTED','REJECTED'].includes(value.status)
  ||value.outputJson!==null&&typeof value.outputJson!=='string'||value.errorCode!==null&&typeof value.errorCode!=='string'
  ||!Number.isSafeInteger(value.durationMillis)||value.durationMillis<0||value.guestCpuMillis!==null&&(!Number.isSafeInteger(value.guestCpuMillis)||value.guestCpuMillis<0))throw new Error('函数测试返回不完整，请重新测试。')
 return value
}
