/** 事件/注释实际组件的隔离内存旅程，不注册正式历史路由或请求共享后端。 */
import {createApp,h} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import Shell from '../../src/layout/ConsoleShell.vue'
import Page from '../../src/features/alarms/AlarmTransitionLogsView.vue'
import {session} from '../../src/core/session'
import {setAccessToken} from '../../src/core/http'
import {transitionMaintenanceServer,maintenanceProject as project} from './transition-maintenance-server'
const params=new URLSearchParams(location.search),state=params.get('state')||'alerting',role=params.get('role')||'OPERATOR',maintain=role!=='VIEWER'
const server=transitionMaintenanceServer(state==='normal'?'normal':params.get('scenario')||'success');window.fetch=server.fetcher
session.user={accountId:'00000000-0000-0000-0000-000000000003',currentProjectId:project,displayName:'项目成员',projectRole:role,permissions:['alarm:read','device:read',...(maintain?['alarm:maintain']:[])]};session.ready=true;session.projects=[{id:project,name:'消防监测项目'}];session.menus=[{name:'AlarmHistory'}];setAccessToken('fixture-only')
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Shell,children:[{path:'/alarm-history',component:Page},{path:'/devices/:deviceId',component:{render:()=>h('main',{class:'tl-page'},'设备详情')}}]}]})
await router.push('/alarm-history');await router.isReady();createApp({render:()=>h(RouterView)}).use(ElementPlus).use(router).mount('#app')
