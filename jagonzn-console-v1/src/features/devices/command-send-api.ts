import {equalDeviceJsonValues} from './platform-properties-json'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {api,ApiError} from '@/core/http'
import {devicePath,devicesApi} from './api'
import {decodeCommandDetail,formatCommandJson,type CommandDetail} from './command-records-api'

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
export type CommandChoice={value:string;name:string;defaults?:string}
function isDeviceJsonObject(value:StrictJsonValue|undefined):value is StrictJsonObject{return value!==undefined&&value!==null&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value)}
export function validateCommandInput(input:string){
 const bytes=new TextEncoder().encode(input)
 if(bytes.byteLength>64*1024)throw new Error('命令参数超过允许大小')
 return parseDashboardRuntimeResponse(bytes)
}
export async function commandChoices(project:string,device:string,signal:AbortSignal):Promise<CommandChoice[]>{
 const binding=await devicesApi.binding(project,device,signal),version=binding.version
 if(binding.deviceId!==device||typeof binding.deviceTypeId!=='string'||!uuid.test(binding.deviceTypeId)
  ||typeof version?.id!=='string'||!uuid.test(version.id)||version.deviceTypeId!==binding.deviceTypeId
  ||typeof version.schemaDigest!=='string'||!/^[0-9a-f]{64}$/.test(version.schemaDigest)
  ||version.digestAlgorithm!=='PG_JSONB_TEXT_V1_SHA256')throw new Error('设备模型绑定不可用')
 const bytes=await api<Uint8Array>(`/api/v1/projects/${project}/device-types/${binding.deviceTypeId}/thing-model-versions/${version.id}`,{signal,responseType:'bytes',maxResponseBytes:4*1024*1024})
 const frozen=parseDashboardRuntimeResponse(bytes),frozenVersion=frozen.version
 if(!isDeviceJsonObject(frozenVersion)
  ||frozenVersion.id!==version.id||frozenVersion.deviceTypeId!==binding.deviceTypeId
  ||frozenVersion.schemaDigest!==version.schemaDigest||frozenVersion.digestAlgorithm!==version.digestAlgorithm)
  throw new Error('设备固定模型快照身份不匹配')
 const model=frozen.modelSnapshot
 if(!isDeviceJsonObject(model))throw new Error('设备命令定义不可用')
 const commands=model.commands
 if(!isDeviceJsonObject(commands)||Object.keys(commands).length>5000)
  throw new Error('设备命令定义不可用')
 return Object.entries(commands).map(([key,item])=>{
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(key)||!isDeviceJsonObject(item))throw new Error('设备命令定义不匹配')
  const name=item.name===undefined?key:item.name
  if(typeof name!=='string'||!name.trim()||name.length>128)throw new Error('设备命令名称不可用')
  let defaults:string|undefined
  const schema=item.inputSchema
  if(schema!==undefined&&schema!==null){
   if(!isDeviceJsonObject(schema))throw new Error('设备命令签名不可用')
   const value=schema.default
   if(isDeviceJsonObject(value))defaults=formatCommandJson(value)
  }
  return{value:key,name,defaults}
 })
}
function receipt(bytes:Uint8Array,device:string,commandKey:string):CommandDetail{
 const root=parseDashboardRuntimeResponse(bytes)
 if(typeof root.id!=='string'||!uuid.test(root.id)||root.deviceId!==device||root.commandKey!==commandKey)throw new Error('命令受理响应身份不匹配，请重新读取核对结果')
 const result=decodeCommandDetail(bytes,{id:root.id,deviceId:device,commandKey})
 return{...result,outputText:root.output===null||root.output===undefined?null:formatCommandJson(root.output)}
}
export async function submitCommand(project:string,device:string,commandKey:string,input:string,key:string,signal:AbortSignal){
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(commandKey))throw new Error('请填写有效命令标识符')
 validateCommandInput(input)
 const bytes=await api<Uint8Array>(`${devicePath(project,device)}/commands`,{method:'post',rawBody:`{"commandKey":${JSON.stringify(commandKey)},"input":${input}}`,headers:{'Content-Type':'application/json','Idempotency-Key':key},signal,responseType:'bytes',maxResponseBytes:4*1024*1024})
 try{return receipt(bytes,device,commandKey)}catch(error){throw new ApiError(error instanceof Error?error.message:'命令受理响应无效，请重新读取核对结果',202,undefined,undefined,true)}
}
export async function waitCommandReply(project:string,command:CommandDetail,signal:AbortSignal){
 const bytes=await api<Uint8Array>(`${devicePath(project,command.deviceId)}/commands/${command.id}/reply`,{signal,responseType:'bytes',maxResponseBytes:4*1024*1024})
 const result=receipt(bytes,command.deviceId,command.commandKey!)
 if(result.id!==command.id)throw new Error('命令回复身份不匹配')
 return result
}

/** 仅以原键GET核对本人的持久命令，仍须匹配原设备、方法及精确参数；404绝不授权重发。 */
export async function readCommandSubmission(project:string,device:string,commandKey:string,input:string,key:string,signal:AbortSignal){
 const bytes=await api<Uint8Array>(`${devicePath(project,device)}/commands/submissions/current`,{headers:{'Original-Request-Key':key},signal,responseType:'bytes',maxResponseBytes:4*1024*1024})
 const result=receipt(bytes,device,commandKey)
 if(!equalDeviceJsonValues(validateCommandInput(result.inputText),validateCommandInput(input)))throw new Error('原命令请求的参数不匹配，结果仍需核对')
 return result
}
