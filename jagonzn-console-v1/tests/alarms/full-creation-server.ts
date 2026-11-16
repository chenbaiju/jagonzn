import type {Schema} from '../../src/core/contracts'
import {ordinaryCreationServer,creationFixtureProject as project,creationFixtureGroup as id,creationFixtureAccount as account} from './ordinary-creation-server'
import {secretGroupKinds} from '../../src/features/alarms/notification-secret-contract'
/** 同一内存服务组合正式普通与秘密入口，不连接任何实际API、URL或供应商。 */
export function fullCreationServer(scenario='success',initial?:Schema<'CreateConsoleNotificationGroupSecretRequest'>){
 const ordinary=ordinaryCreationServer(scenario),base=`/api/v1/projects/${project}`,prefix=base+'/console/alarm-notification-groups',calls:{method:string;path:string}[]=[]
 let body=initial?{...initial,headers:initial.headers.map(header=>({...header}))}:undefined,version=0
 const group=()=>({id,name:body?.name||'',description:body?.description?.trim()||'',enabled:true,version:0,createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z'})
 const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
 const fetcher:typeof fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input),'http://localhost'),method=init?.method?.toUpperCase()||'GET';calls.push({method,path:url.pathname})
  if(url.pathname===base+'/console/notification-members'&&method==='GET')return response([{accountId:account,email:'member@example.invalid',displayName:'值班员',channels:{email:'AVAILABLE',wechat:'UNKNOWN',sms:'UNAVAILABLE',voice:'UNAVAILABLE'}}])
  if(url.pathname===prefix+'/secret'&&method==='POST'){body=JSON.parse(String(init?.body)) as Schema<'CreateConsoleNotificationGroupSecretRequest'>;if(scenario==='unknown')throw new TypeError('replylost');return response({group:group(),notificationType:secretGroupKinds[body.notificationType],configurationVersion:0},201)}
  if(body&&url.pathname===prefix+'/'+id+'/secret'&&method==='PUT'){
   const update=JSON.parse(String(init?.body)) as Schema<'SaveConsoleNotificationGroupSecretRequest'>
   if(update.version!==version||scenario==='conflict')return response({message:'版本冲突'},409)
   body={...body,url:update.url,headers:update.headers};version++
   if(scenario==='unknown')throw new TypeError('replylost afterput')
   return response({groupId:id,configured:true,notificationType:secretGroupKinds[body.notificationType],configurationVersion:version})
  }
  if(body&&method==='GET'){
   if(url.pathname===base+'/alarm-notification-groups/'+id)return response(group())
   if(url.pathname===prefix+'/'+id+'/configuration')return response({groupId:id,configured:true,notificationType:secretGroupKinds[body.notificationType],configurationVersion:version})
   if(url.pathname===prefix+'/'+id+'/secret/edit')return scenario==='denied'?response({message:'无权读取'},403):response({groupId:id,notificationType:secretGroupKinds[body.notificationType],configurationVersion:scenario==='changed'?version+1:version,url:body.url,headers:body.headers})
   if(url.pathname===prefix)return response({items:[group()],total:'1',page:1,limit:24})
  }
  return ordinary.fetcher(input,init)
 }
 return {fetcher,calls,secretCreated:()=>!!body}
}
