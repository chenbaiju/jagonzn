import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {api} from '@/core/http'
import {devicesApi,devicePath} from './api'
import {formatCommandJson} from './command-records-api'
import {submitCommand,readCommandSubmission,validateCommandInput} from './command-send-api'
import {preparePlatformPropertyBody} from './platform-properties-json'
import {submitPlatformProperties,assertPlatformReceipt,type PlatformPropertyReceipt} from './platform-properties-api'
export type DownlinkKind='PROPERTY'|'COMMAND'
type Base=Readonly<{project:string;device:string;key:string}>
export type DownlinkIntent=Base&(Readonly<{kind:'PROPERTY';model:string;body:string;bodyHash:string}>|Readonly<{kind:'COMMAND';method:string;input:string}>)
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const jsonObject=(value:StrictJsonValue|undefined):value is StrictJsonObject=>!!value&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value)
/** 整理只修改JSON排版，保留严格数字词法。 */
export function formatDownlinkJson(input:string){return formatCommandJson(parseDashboardRuntimeResponse(new TextEncoder().encode(input)))}
/** 原站method/params适配已有命令契约，未定义的设备命令仍由后台真实模型拒绝。 */
export function commandEnvelope(input:string){
 const value=parseDashboardRuntimeResponse(new TextEncoder().encode(input))
 if(Object.keys(value).length!==2||typeof value.method!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(value.method)||!jsonObject(value.params))throw new Error('请填写method命令标识符和params参数对象')
 const parameters=formatCommandJson(value.params);validateCommandInput(parameters)
 return {method:value.method,input:parameters}
}
/** 固定本次模型/输入/键；界面切换不能改写在途意图，正文摘要绑定实际UTF8原件。 */
export async function prepareDownlink(project:string,device:string,kind:DownlinkKind,input:string,signal:AbortSignal):Promise<DownlinkIntent>{
 if(!uuid.test(project)||!uuid.test(device)||!['PROPERTY','COMMAND'].includes(kind))throw new Error('设备下发范围不合法')
 if(new TextEncoder().encode(input).byteLength>16384)throw new Error('下发消息长度请勿超过 16 KB，请减少消息内容后重试。')
 const key=crypto.randomUUID()
 if(kind==='COMMAND')return Object.freeze({project,device,key,kind,...commandEnvelope(input)})
 const binding=await devicesApi.binding(project,device,signal),model=binding.version?.id
 if(binding.deviceId!==device||typeof model!=='string'||!uuid.test(model))throw new Error('设备当前模型不可用，请刷新后重试')
 const prepared=preparePlatformPropertyBody(model,input)
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(prepared.body))
 const bodyHash=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')
 return Object.freeze({project,device,key,kind,model,body:prepared.body,bodyHash})
}
/** 202只证明可靠受理，不能视为Broker或设备执行成功。 */
export async function sendDownlink(intent:DownlinkIntent,signal:AbortSignal){
 if(intent.kind==='COMMAND'){await submitCommand(intent.project,intent.device,intent.method,intent.input,intent.key,signal);return}
 const receipt=await submitPlatformProperties(intent.project,intent.device,'DOWNLINK',intent.body,intent.key)
 assertPlatformReceipt(receipt,intent.project,intent.device,intent.model,'DOWNLINK')
}
/** 核对只有GET；未定位保持未知，原键不会变成第二个写请求。 */
export async function recoverDownlink(intent:DownlinkIntent,signal:AbortSignal){
 if(intent.kind==='COMMAND'){await readCommandSubmission(intent.project,intent.device,intent.method,intent.input,intent.key,signal);return}
 const receipt=await api<PlatformPropertyReceipt>(`${devicePath(intent.project,intent.device)}/platform-properties/submissions/DOWNLINK`,{headers:{'Original-Request-Key':intent.key,'X-Request-Body-SHA256':intent.bodyHash},signal})
 assertPlatformReceipt(receipt,intent.project,intent.device,intent.model,'DOWNLINK')
}
