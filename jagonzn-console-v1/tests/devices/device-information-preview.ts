/** 实际信息页组件与隔离fetch；所有写请求拒绝，不修改真实设备。 */
import {createApp,h} from 'vue'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import ConsoleShell from '../../src/layout/ConsoleShell.vue'
import DeviceDetail from '../../src/features/devices/DeviceDetail.vue'
import {session} from '../../src/core/session'
import {setAccessToken} from '../../src/core/http'
import {project,device,informationFixture} from './device-information-fixture'
const state=new URLSearchParams(location.search).get('state')||'empty'
window.fetch=async(input,options)=>{
 const request=input instanceof Request?input:undefined,path=new URL(request?.url??String(input),location.href).pathname,method=options?.method??request?.method??'GET'
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
 if(method!=='GET')return json({message:'模拟预览不保存数据，请取消编辑。'},403)
 if(state==='error'&&path.endsWith('/location-point'))return json({message:'位置资料暂时无法读取，请重试。'},503)
 try{return json(informationFixture(state,path))}catch{return json({message:'隔离预览未提供该读取'},503)}
}
session.user={accountId:project,currentProjectId:project,displayName:'设计验收管理员',projectRole:'OWNER',permissions:['device:read','device:update']}
session.projects=[{id:project,name:'园区物联设计验收',myRole:'OWNER',status:'ACTIVE',projectCode:'preview-only'}]
session.menus=['Devices','DeviceTypes','DeviceGroups','DashboardDesigner','AlarmRules','AlarmHistory','AlarmNotificationGroups','ApplicationManager','ProjectEndUsers','RuleAutomations','RuleScenes','MessageRules','RuleExecutions','TaskJobs','OtaFirmwares','ProjectSettings'].map(name=>({name}))
session.ready=true;setAccessToken('isolated-preview-only')
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:ConsoleShell,children:[{path:'devices/:deviceId',component:DeviceDetail}]}]})
await router.push({path:'/devices/'+device,query:{tab:'info'}})
createApp({render:()=>h(RouterView)}).use(ElementPlus,{locale:zhCn}).use(router).mount('#app')
