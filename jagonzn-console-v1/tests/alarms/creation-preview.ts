/** 隔离表单视觉与失败态复核；不注册正式路由，不访问任何真实数据或保存端点。 */
import { createApp, h, ref } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import Shell from '../../src/layout/ConsoleShell.vue'
import Form from '../../src/features/alarms/NotificationGroupCreationForm.vue'
import Editor from '../../src/features/alarms/GroupOrdinaryOptionsEditor.vue'
import type { NotificationOrdinaryMode, NotificationOrdinaryOptions } from '../../src/features/alarms/notification-ordinary-options'
import { notificationGroupModes, type NotificationGroupMode } from '../../src/features/alarms/notification-group-draft'
import { session } from '../../src/core/session'
import { ApiError, setAccessToken } from '../../src/core/http'
const params=new URLSearchParams(location.search),role=params.get('role')||'OWNER'
const requested=params.get('mode'),mode:NotificationGroupMode=notificationGroupModes.find(item=>item.value===requested)?.value||'email'
const manage=role==='OWNER'||role==='ADMIN'
window.fetch=async()=>new Response(JSON.stringify({message:'读取失败'}),{status:503,headers:{'Content-Type':'application/json'}})
session.user={accountId:'fixture-account',currentProjectId:'fixture-project',displayName:'隔离夹具',projectRole:role,permissions:['alarm:read',...(manage?['alarm:manage']:[])]}
session.projects=[{id:'fixture-project',name:'消防监测项目'}];session.ready=true;session.menus=[{name:'AlarmNotificationGroups'}];setAccessToken('local-fixture-only')
const showEditor=ref(true),editorMode:NotificationOrdinaryMode=mode==='member'||mode==='voice'?mode:'sms'
const editorInitial:NotificationOrdinaryOptions={mode:editorMode,configurationVersion:7,memberChannels:{'fixture-member':['EMAIL']},smsText:'13812345678\n13912345678',voiceNumber:'0755-12345678',voicePlatform:'aliyun'}
const editorPage={setup:()=>()=>h('main',{class:'tl-page'},[h('h1','通知组详情'),h('p','值班通知'),showEditor.value?h(Editor,{projectId:'fixture-project',groupId:'fixture-group',canManage:manage,initial:editorInitial,members:[{accountId:'fixture-member',email:'member@example.invalid',availableChannels:['EMAIL','SMS','VOICE']}],save:async()=>{throw new ApiError('版本冲突，请重新核对。',409)},onClose:()=>{showEditor.value=false}}):null])}
const page={setup:()=>()=>h(Form,{projectId:'fixture-project',canManage:manage,initialMode:mode,members:[{accountId:'fixture-member',email:'member@example.invalid',availableChannels:['EMAIL','SMS','VOICE']}],bodyFunctionTemplate:'module.exports = function(alarm_rule, alarm, attributes) {\n  return { alarm_rule, alarm, attributes };\n};',save:async()=>{throw new ApiError('版本冲突，请重新核对。',409)},onCancel:()=>router.push('/notification-groups/create')})}
const selectedPage=params.get('editor')==='1'?editorPage:page
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Shell,children:[{path:'/notification-groups/create',component:selectedPage}]}]})
await router.push('/notification-groups/create');await router.isReady();createApp({render:()=>h(RouterView)}).use(ElementPlus).use(router).mount('#app')
const marker=document.createElement('div');marker.textContent='隔离视觉夹具 · 无真实业务数据或写入';marker.style.cssText='position:fixed;right:12px;bottom:8px;font-size:11px;color:#8a5a00;background:#fff7df;padding:4px;z-index:9999';document.body.append(marker)
