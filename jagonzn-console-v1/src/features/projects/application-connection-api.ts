import {api,assertIdentity,identityEpoch} from '@/core/http'
import type {Schema} from '@/core/contracts'

export type ProjectApplicationConnection=Schema<'ProjectApplicationConnectionResponse'>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const invalid=()=>new Error('项目应用接入参数不完整或身份不匹配')
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw invalid()
 const record=value as Record<string,unknown>
 if(Object.keys(record).length!==keys.length||keys.some(key=>!Object.hasOwn(record,key)))throw invalid()
 return record
}
/** 仅校验并保留服务器明确提供的公开地址，不从当前站点、设备入口或凭据拼接。 */
function endpoint(value:unknown,scheme:'https:'|'wss:'):string|null{
 if(value===null)return null
 if(typeof value!=='string'||!value||/[\u0000-\u0020\u007f-\u009f]/.test(value)||!value.startsWith(scheme+'//')||value.includes('\\'))throw invalid()
 try{
  const parsed=new URL(value),authority=value.slice(scheme.length+2).split('/')[0]||''
  if(parsed.protocol!==scheme||!parsed.hostname||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.port==='0'||value.includes('?')||value.includes('#')||authority.includes('@')||authority.endsWith(':')||/%(?:0[\da-f]|1[\da-f]|7f|c2%(?:8[\da-f]|9[\da-f]))/i.test(parsed.pathname))throw invalid()
 }catch{throw invalid()}
 return value
}
export function decodeApplicationConnection(value:unknown,project:string):ProjectApplicationConnection{
 const root=object(value,['projectId','api','mqtt']),apiFields=object(root.api,['endpoint','enabled','writesEnabled']),mqtt=object(root.mqtt,['endpoint','enabled'])
 if(!uuid.test(project)||root.projectId!==project||typeof apiFields.enabled!=='boolean'||typeof apiFields.writesEnabled!=='boolean'||typeof mqtt.enabled!=='boolean'||apiFields.writesEnabled&&!apiFields.enabled)throw invalid()
 return {projectId:project,api:{endpoint:endpoint(apiFields.endpoint,'https:'),enabled:apiFields.enabled,writesEnabled:apiFields.writesEnabled},mqtt:{endpoint:endpoint(mqtt.endpoint,'wss:'),enabled:mqtt.enabled}}
}
export async function readApplicationConnection(project:string,signal:AbortSignal){
 if(!uuid.test(project))throw invalid()
 const epoch=identityEpoch(),value=await api<unknown>(`/api/v1/projects/${project}/application-connection`,{signal,maxResponseBytes:16384})
 assertIdentity(epoch)
 return decodeApplicationConnection(value,project)
}
