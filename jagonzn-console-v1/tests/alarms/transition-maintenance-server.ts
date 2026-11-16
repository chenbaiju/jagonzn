import type {Schema} from '../../src/core/contracts'
export const maintenanceProject='00000000-0000-0000-0000-000000000002',maintenanceEvent='00000000-0000-0000-0000-000000000004'
/** 实际组件/HTTP封装共用内存事件及注释服务，无真实数据库或事故状态写入。 */
export function transitionMaintenanceServer(scenario='success'){
 const project=maintenanceProject,id=maintenanceEvent,base=`/api/v1/projects/${project}/console/alarm-logs`
 const log={id,instanceId:'00000000-0000-0000-0000-000000000005',ruleId:'00000000-0000-0000-0000-000000000006',deviceId:'00000000-0000-0000-0000-000000000007',alarmType:'temperature',state:scenario==='normal'?'ok':'alerting',level:scenario==='normal'?null:2,createdAt:'2026-10-24T00:00:00Z',value:36.5,clearReason:null,ruleName:'冷库温度规则',deviceName:'冷库设备',maintenanceAlarmReason:null,maintenanceSolution:null,maintenanceRemark:null,notificationLogs:[],notificationLogsTruncated:false,triggerValues:null} satisfies Schema<'ConsoleAlarmLogResponse'>
 let note:Schema<'ConsoleAlarmLogMaintenanceResponse'>={eventId:id,version:7,alarmReason:'已检查温度探头',solution:'保留的隐藏解决方案',remark:'等待巡检',updatedBy:'00000000-0000-0000-0000-000000000003',createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:01Z'}
 const notifications:Schema<'ConsoleAlarmLogNotificationResponse'>[]=scenario==='notifications'?[{id:'00000000-0000-0000-0000-000000000008',channel:'EMAIL',result:true,errorCode:null,target:'***'},{id:'00000000-0000-0000-0000-000000000009',channel:'WEBHOOK',result:false,errorCode:'DEAD_LETTER',target:''},{id:'00000000-0000-0000-0000-00000000000a',channel:'PUSH',result:null,errorCode:null,target:''}]:[]
 const snapshot=()=>({...log,maintenanceAlarmReason:note.alarmReason,maintenanceSolution:note.solution,maintenanceRemark:note.remark,notificationLogs:notifications})
 const calls:{method:string;path:string}[]=[]
 const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
 const fetcher:typeof fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input),'http://localhost'),method=init?.method?.toUpperCase()||'GET';calls.push({method,path:url.pathname})
  if(url.pathname===base&&method==='GET')return response({items:[snapshot()],total:'1',page:1,limit:24})
  if(url.pathname===base+'/'+id&&method==='GET')return response(snapshot())
  if(url.pathname===base.replace('/alarm-logs','/alarm-log-export')&&method==='GET')return response({items:[{log:{...snapshot(),notificationLogs:null,notificationLogsTruncated:null},deviceTypeName:'温湿度传感器'}],limit:1000,truncated:false})
  if(url.pathname===base+'/'+id+'/maintenance'){
   if(method==='GET')return scenario==='read-error'?response({message:'维护信息暂时无法读取'},503):response(note)
   if(method==='PUT'){
    const body=JSON.parse(String(init?.body)) as Schema<'SaveAlarmLogMaintenanceRequest'>
    if(scenario==='conflict'||body.version!==note.version)return response({message:'维护信息已变更'},409)
    if(log.state!=='ok'&&body.solution!==note.solution)return response({message:'隐藏解决方案不可更改'},400)
    note={...note,...body,version:body.version+1,updatedAt:'2026-10-24T00:00:02Z'}
    if(scenario==='unknown')throw new TypeError('fixture replylost afterput')
    return response(note)
   }
  }
  return response({message:'无对应夹具请求'},503)
 }
 return {fetcher,calls,note:()=>({...note})}
}
