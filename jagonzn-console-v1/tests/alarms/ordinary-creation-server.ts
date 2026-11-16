/** 同一具名夹具供组件集成与浏览器使用；全部fetch在内存截获，不连接任何后端或供应商。 */
import type { Schema } from '../../src/core/contracts'
export const creationFixtureProject='00000000-0000-0000-0000-000000000002',creationFixtureGroup='00000000-0000-0000-0000-000000000004',creationFixtureAccount='00000000-0000-0000-0000-000000000003'
export function ordinaryCreationServer(scenario='success'){
 const project=creationFixtureProject,id=creationFixtureGroup,base=`/api/v1/projects/${project}`,prefix=`${base}/console/alarm-notification-groups`
 let body:Schema<'CreateConsoleNotificationGroupRequest'>|undefined,unknownUsed=false
 const calls:{method:string;path:string}[]=[]
 const group=()=>({id,name:body?.name||'',description:body?.description?.trim()||'',enabled:true,version:0,createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z'})
 const members=()=>body?.members||[],numbers=()=>body?.numbers?.map(value=>body?.notificationType==='sms'?'+86'+value:value.replace(/[ -]/g,''))||[]
 const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
 const fetcher:typeof fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input),'http://localhost'),method=init?.method?.toUpperCase()||'GET';calls.push({method,path:url.pathname})
  if(url.pathname===prefix&&method==='POST'){
   body=JSON.parse(String(init?.body))as Schema<'CreateConsoleNotificationGroupRequest'>
   if(scenario==='unknown'&&!unknownUsed){unknownUsed=true;throw new TypeError('fixture reply lost after create')}
   return response({group:group(),notificationType:body.notificationType.toUpperCase(),configurationVersion:0},201)
  }
  if(url.pathname===prefix&&method==='GET')return response({items:body?[group()]:[],total:body?'1':'0',page:1,limit:24})
  if(!body)return response({message:'资料不存在'},404)
  if(url.pathname===`${base}/alarm-notification-groups/${id}`&&method==='GET')return response(group())
  if(url.pathname===`${prefix}/${id}/configuration`&&method==='GET')return response({groupId:id,configured:true,notificationType:body.notificationType.toUpperCase(),configurationVersion:0})
  if(url.pathname===`${prefix}/${id}/configuration/edit`&&method==='GET')return scenario==='denied'?response({message:'无权读取'},403):response({notificationType:body.notificationType.toUpperCase(),version:scenario==='changed'?1:0,members:body.notificationType==='member'?members():[],numbers:body.notificationType==='sms'||body.notificationType==='voice'?numbers():[]})
  if(url.pathname===`${prefix}/${id}/email-options/edit`&&method==='GET'){
   const recipients=(body.emails||[]).map((email,index)=>({id:`00000000-0000-0000-0000-${String(index+40).padStart(12,'0')}`,email,enabled:true,version:0}))
   return response({recipients,activeEmails:recipients.map(row=>row.email)})
  }
  return response({message:'夹具未配置此读取'},503)
 }
 return {fetcher,calls,group,created:()=>body!==undefined}
}
