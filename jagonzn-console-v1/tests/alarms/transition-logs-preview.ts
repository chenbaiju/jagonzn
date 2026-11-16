/** 隔离内存fetch，仅演示正式507只读合同和真实组件，不请求共享后端。 */
import { createApp,h } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import { createRouter,createMemoryHistory,RouterView } from 'vue-router'
import Shell from '../../src/layout/ConsoleShell.vue'
import Page from '../../src/features/alarms/AlarmTransitionLogsView.vue'
import { session } from '../../src/core/session'
import { setAccessToken } from '../../src/core/http'
import type { Schema } from '../../src/core/contracts'
const params=new URLSearchParams(location.search),state=params.get('state')||'timeline',project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',rule='00000000-0000-4000-8000-000000000003'
const rows=Array.from({length:5},(_,index)=>({id:`00000000-0000-4000-8000-00000000001${index}`,instanceId:'00000000-0000-4000-8000-000000000004',deviceId:device,ruleId:rule,alarmType:'temperature',state:index===0?'ok':index===1?'pending':'alerting',level:index<2?null:index-1,createdAt:`2026-10-24T00:0${5-index}:00Z`,value:index===0?null:index===1?0:72.5+index,clearReason:index===0?'AUTO_RECOVERY':null,ruleName:index===0?'冷库温度监测':index===1?'消防泵运行状态':'温度超过安全范围',deviceName:index===4?'西区仓库冷冻间温湿度传感器':'设备 A-01',maintenanceAlarmReason:null,maintenanceSolution:null,maintenanceRemark:null,notificationLogs:[],notificationLogsTruncated:false,triggerValues:null} satisfies Schema<'ConsoleAlarmLogResponse'>))
const base=`/api/v1/projects/${project}/console/alarm-logs`
function response(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})}
window.fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.href)
 if(init?.method!=='GET')return response({message:'此夹具只提供读取'},503)
 if(url.pathname===base){
  if(state==='error')return response({message:'告警历史暂时无法读取，请稍后重试'},503)
  const status=url.searchParams.get('status')||'',from=url.searchParams.get('from'),before=url.searchParams.get('before'),page=Number(url.searchParams.get('page')||1),limit=Number(url.searchParams.get('limit')||24)
  const selected=(state==='empty'?[]:rows).filter(row=>(!status||status.startsWith('alerting_')?(!status||row.state==='alerting'&&row.level===Number(status.slice(-1))):row.state===status)&&(!from||Date.parse(row.createdAt)>=Date.parse(from))&&(!before||Date.parse(row.createdAt)<Date.parse(before)))
  return response({items:selected.slice((page-1)*limit,page*limit),total:String(selected.length),page,limit})
 }
 if(url.pathname.startsWith(base+'/')){const row=rows.find(row=>url.pathname===`${base}/${row.id}`);return row?response(row):response({message:'日志不可见'},404)}
 return response({message:'夹具未配置此读取'},503)
}
session.user={accountId:'00000000-0000-4000-8000-000000000005',currentProjectId:project,displayName:'项目成员',projectRole:'VIEWER',permissions:['alarm:read','device:read']};session.projects=[{id:project,name:'消防监测项目'}];session.ready=true;session.menus=[{name:'AlarmHistory'}];setAccessToken('local-fixture-only')
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Shell,children:[{path:'/alarm-history',component:Page},{path:'/devices/:deviceId',component:{render:()=>h('main',{class:'tl-page'},[h('h1','设备详情')])}}]}]})
await router.push('/alarm-history');await router.isReady();createApp({render:()=>h(RouterView)}).use(ElementPlus).use(router).mount('#app')
