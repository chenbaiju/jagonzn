/** 全部fetch在内存截获，验证正式API适配与组件链；不请求共享后端或保存真实业务数据。 */
import { createApp, h } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import Shell from '../../src/layout/ConsoleShell.vue'
import Panel from '../../src/features/alarms/NotificationGroupOptionsPanel.vue'
import { session } from '../../src/core/session'
import { setAccessToken } from '../../src/core/http'
const params=new URLSearchParams(location.search),requested=(params.get('mode')||params.get('state'))?.toUpperCase(),mode=requested==='MEMBER'||requested==='VOICE'?requested:'SMS'
const project='00000000-0000-0000-0000-000000000002',group='00000000-0000-0000-0000-000000000004',account='00000000-0000-0000-0000-000000000003'
const manage=!['VIEWER','OPERATOR'].includes(params.get('role')||'OWNER')
const base=`/api/v1/projects/${project}`,path=`${base}/console/alarm-notification-groups/${group}/configuration`
let version=7,numbers=mode==='VOICE'?['075512345678']:params.get('count')==='11'?Array.from({length:11},(_,i)=>'+86138123456'+String(i).padStart(2,'0')):['+8613812345678'],members=mode==='MEMBER'?[{accountId:account,channels:['EMAIL']}]:[],unknownConsumed=false
const calls:{method:string;path:string;body?:unknown}[]=[]
function trace(){const element=document.getElementById('fixture-requests');if(element)element.textContent=JSON.stringify({calls,version})}
function response(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})}
const snapshot=()=>({notificationType:mode,version,members:mode==='MEMBER'?members:[],numbers:mode==='MEMBER'?[]:numbers})
window.fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.href),method=init?.method?.toUpperCase()||'GET'
 const body=typeof init?.body==='string'?JSON.parse(init.body):undefined;calls.push({method,path:url.pathname,body});trace()
 if(url.pathname===path&&method==='GET')return response({groupId:group,configured:true,notificationType:mode,configurationVersion:version})
 if(url.pathname===path+'/options'&&method==='GET'){
  if((params.get('public')||params.get('state'))==='denied')return response({message:'无权读取'},403)
  return response({groupId:group,notificationType:mode,configurationVersion:version+((params.get('public')||params.get('state'))==='changed'?1:0),members:mode==='MEMBER'?members:[],maskedNumbers:mode==='MEMBER'?[]:numbers.map(number=>number.startsWith('+86')?number.slice(0,6)+'****'+number.slice(-4):number.slice(0,3)+'****'+number.slice(-4))})
 }
 if(url.pathname===path+'/edit'&&method==='GET')return manage?response(snapshot()):response({message:'无权读取'},403)
 if(url.pathname===base+'/console/notification-members'&&method==='GET')return response([{accountId:account,email:'member@example.invalid',displayName:'值班成员',channels:{email:'AVAILABLE',wechat:'UNKNOWN',sms:'UNKNOWN',voice:'UNKNOWN'}}])
 if(url.pathname===path&&method==='PUT'){
  if(!manage)return response({message:'无权修改'},403)
  if(body?.version!==version||body?.notificationType!==mode.toLowerCase())return response({message:'配置已变更'},409)
  version++;if(mode==='MEMBER')members=body.members;else numbers=body.numbers.map((number:string)=>{const normalized=number.replace(/[ -]/g,'');return mode==='SMS'&&/^1[3-9][0-9]{9}$/.test(normalized)?'+86'+normalized:normalized});trace()
  if(params.get('save')==='unknown'&&!unknownConsumed){unknownConsumed=true;throw new TypeError('隔离夹具模拟结果未知')}
  return response(snapshot())
 }
 return response({message:'夹具未配置此读取'},503)
}
session.user={accountId:account,currentProjectId:project,displayName:'隔离夹具',projectRole:manage?'OWNER':'VIEWER',permissions:['alarm:read',...(manage?['alarm:manage']:[])]}
session.projects=[{id:project,name:'消防监测项目'}];session.ready=true;session.menus=[{name:'AlarmNotificationGroups'}];setAccessToken('local-fixture-only')
const page={setup:()=>()=>h('main',{class:'tl-page'},[h('h1','通知组详情'),h('h2','值班通知'),h(Panel,{groupId:group})])}
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Shell,children:[{path:'/notification-groups/'+group,component:page}]}]})
await router.push('/notification-groups/'+group);await router.isReady();createApp({render:()=>h(RouterView)}).use(ElementPlus).use(router).mount('#app')
const evidence=document.createElement('pre');evidence.id='fixture-requests';evidence.hidden=true;document.body.append(evidence);trace()
