/** 原站完整表单调用普通创建适配器的隔离旅程；所有fetch截获，无真实API、供应商或正式路由。 */
import { createApp, h, onMounted, ref } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import { createMemoryHistory, createRouter, RouterLink, RouterView } from 'vue-router'
import Shell from '../../src/layout/ConsoleShell.vue'
import Form from '../../src/features/alarms/NotificationGroupCreationForm.vue'
import { createOrdinaryGroupAndVerify } from '../../src/features/alarms/ordinary-group-creation'
import type { NotificationGroupCreationContext, NotificationGroupDraft } from '../../src/features/alarms/notification-group-draft'
import { alarmApi } from '../../src/features/alarms/api'
import type { Group } from '../../src/features/alarms/model'
import { session } from '../../src/core/session'
import { setAccessToken } from '../../src/core/http'
import { ordinaryCreationServer, creationFixtureProject as project, creationFixtureAccount as account } from './ordinary-creation-server'
const params=new URLSearchParams(location.search),mode=params.get('mode'),initialMode=mode==='member'||mode==='sms'||mode==='voice'?mode:'email'
const server=ordinaryCreationServer(params.get('scenario')||'success');window.fetch=server.fetcher
session.user={accountId:account,currentProjectId:project,displayName:'值班员',projectRole:'OWNER',permissions:['alarm:read','alarm:manage']};session.projects=[{id:project,name:'消防监测项目'}];session.ready=true;session.menus=[{name:'AlarmNotificationGroups'}];setAccessToken('fixture-only')
const members=[{accountId:account,email:'member@example.invalid',availableChannels:['EMAIL' as const]}],verified=ref<Group>()
const create={setup:()=>()=>h(Form,{projectId:project,canManage:true,initialMode,members,save:async(context:NotificationGroupCreationContext,draft:NotificationGroupDraft)=>{verified.value=await createOrdinaryGroupAndVerify(context,draft,members)},onSaved:()=>router.push('/notification-groups/result'),onCancel:()=>router.push('/notification-groups')})}
const details={setup:()=>()=>h('main',{class:'tl-page'},[h('h1','通知组详情'),h('h2',verified.value?.name||''),h('p',verified.value?.description||''),h(RouterLink,{to:'/notification-groups'},()=> '返回通知组')])}
const list={setup(){const rows=ref<Group[]>([]);onMounted(async()=>{rows.value=(await alarmApi.groupDirectory(project,1,24)).items||[]});return()=>h('main',{class:'tl-page'},[h('h1','通知组'),...rows.value.map(row=>h('p',{key:row.id},row.name))])}}
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Shell,children:[{path:'/notification-groups/create',component:create},{path:'/notification-groups/result',component:details},{path:'/notification-groups',component:list}]}]})
await router.push('/notification-groups/create');await router.isReady();createApp({render:()=>h(RouterView)}).use(ElementPlus).use(router).mount('#app')
