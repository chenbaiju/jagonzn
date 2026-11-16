/** 真实创建页/管理弹层与正式498客户端组合，所有HTTP只在内存服务内，不写共享后端。 */
import {createApp,h} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import Shell from '../../src/layout/ConsoleShell.vue'
import CreatePage from '../../src/features/alarms/NotificationGroupCreatePage.vue'
import DetailPage from '../../src/features/alarms/NotificationGroupsPage.vue'
import {fullCreationServer} from './full-creation-server'
import {creationFixtureProject as project,creationFixtureGroup as group,creationFixtureAccount as account} from './ordinary-creation-server'
import {session} from '../../src/core/session'
import {setAccessToken} from '../../src/core/http'
const params=new URLSearchParams(location.search),state=params.get('state')||'create',role=params.get('role')||'OWNER',manage=['OWNER','ADMIN'].includes(role),mode=params.get('mode')==='qywx_robot'?'qywx_robot':'webhook'
const server=fullCreationServer(params.get('scenario')||'success',state==='create'?undefined:{name:'值班通知',description:'设备告警通知接收组',notificationType:mode,url:'https://example.invalid/notify?key=fixture',headers:mode==='webhook'?[{name:'Authorization',value:'fixture-token'}]:[]});window.fetch=server.fetcher
session.user={accountId:account,currentProjectId:project,displayName:'项目成员',projectRole:role,permissions:['alarm:read',...(manage?['alarm:manage']:[])]};session.projects=[{id:project,name:'消防监测项目'}];session.ready=true;session.menus=[{name:'AlarmNotificationGroups'}];setAccessToken('fixture-only')
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Shell,children:[{path:'/notification-groups/create',component:CreatePage},{path:'/notification-groups',component:DetailPage},{path:'/notification-groups/:groupId',component:DetailPage}]}]})
await router.push(state==='create'?'/notification-groups/create':'/notification-groups/'+group);await router.isReady();createApp({render:()=>h(RouterView)}).use(ElementPlus).use(router).mount('#app')
