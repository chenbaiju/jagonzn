/** 纯内存HTTP夹具，不操作Source或共享服务；供当前空态、设置与弹层的看图核对。 */
import {createApp,h} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import Shell from '../../src/layout/ConsoleShell.vue'
import Page from '../../src/features/alarms/NotificationGroupsPage.vue'
import {session} from '../../src/core/session'
import {setAccessToken} from '../../src/core/http'
const query=new URLSearchParams(location.search),state=query.get('state')||'empty',project='00000000-0000-0000-0000-000000000002',group='00000000-0000-0000-0000-000000000004'
const manage=query.get('role')!=='VIEWER',base=`/api/v1/projects/${project}`,row={id:group,name:'值班通知',enabled:false,version:7,description:'设备告警通知接收组'}
function response(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})}
window.fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.href)
 if(init?.method!=='GET')return response({message:'当前读取失败，请重新核对'},503)
 if(url.pathname===base+'/console/alarm-notification-groups')return state==='error'?response({message:'通知组读取失败'},503):response({items:state==='list'?[row]:[],total:state==='list'?'1':'0',page:1,limit:24})
 if(url.pathname===base+'/alarm-notification-groups/'+group)return response(row)
 if(url.pathname===base+'/console/alarm-notification-groups/'+group+'/configuration')return response({groupId:group,configured:true,notificationType:'EMAIL',configurationVersion:7})
 if(url.pathname.endsWith('/email-options'))return response({activeEmails:['m***@example.invalid'],recipients:[]})
 return response({message:'无对应读取'},503)
}
session.user={accountId:'00000000-0000-0000-0000-000000000003',currentProjectId:project,displayName:'项目成员',projectRole:manage?'OWNER':'VIEWER',permissions:['alarm:read',...(manage?['alarm:manage']:[])]};session.ready=true;session.projects=[{id:project,name:'消防监测项目'}];session.menus=[{name:'AlarmNotificationGroups'}];setAccessToken('local-fixture-only')
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Shell,children:[{path:'/notification-groups',component:Page},{path:'/notification-groups/:groupId',component:Page}]}]})
await router.push(['detail','settings','edit'].includes(state)?'/notification-groups/'+group:'/notification-groups');await router.isReady();createApp({render:()=>h(RouterView)}).use(ElementPlus).use(router).mount('#app')
