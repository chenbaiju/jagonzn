/** 当前Vue/正式目录HTTP+隔离内存服务；metadata走新正式HTTP客户端，仍为隔离内存服务而非实际用户库或Source。 */
import {createApp,h,ref} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import Managed from '../../src/features/alarms/ManagedAlarmRuleChoicesEditor.vue'
import {alarmRuleSourceIdentity} from '../../src/features/alarms/alarm-rule-source-choices'
import {session} from '../../src/core/session'
import {setAccessToken} from '../../src/core/http'
import {AlarmRuleJsonNumber,parseAlarmRuleJson,stringifyAlarmRuleJson,type AlarmRuleJsonObject} from '../../src/features/alarms/alarm-rule-json'
import {editorChoices} from './rule-editor-fixture'
import {managementProject,managementRule,managementResponse,managementDevice} from './rule-management-fixture'
let saved=managementResponse(),version=0
const row=parseAlarmRuleJson(saved) as AlarmRuleJsonObject,config=row.configuration as AlarmRuleJsonObject,n=config.notifications as AlarmRuleJsonObject
n.customerChannels=['WECHAT'];n.wechatClickAction='PROJECT_APP';n.wechatAppId=managementRule;n.groupIds=[managementRule];saved=stringifyAlarmRuleJson(row)
const status=ref(''),open=ref(true),requests:string[]=[]
window.fetch=async(input,options)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.href),method=options?.method??'GET',json=(value:unknown,code=200)=>new Response(typeof value==='string'?value:JSON.stringify(value),{status:code,headers:{'Content-Type':'application/json'}})
 requests.push(method+' '+url.pathname+(url.search||''));status.value=`已读取${requests.length}次；最近${url.pathname.split('/').at(-1)}`
 const base=`/api/v1/projects/${managementProject}`,path=base+'/console/alarm-rules/'+managementRule
 if(url.pathname===base+'/console/alarm-rule-source-properties/query'){const selected=alarmRuleSourceIdentity(JSON.parse(String(options?.body)));return json({kind:selected.kind,sourceIds:selected.ids,bindings:selected.ids.map(id=>({sourceId:id,modelVersionId:managementRule,name:id===managementDevice?'批量当前设备名称':'当前类型名称'})),properties:editorChoices().properties})}
 if(url.pathname===path){if(method==='GET')return json(saved);if(method==='PUT'){const command=parseAlarmRuleJson(String(options?.body)) as AlarmRuleJsonObject;version++;saved=stringifyAlarmRuleJson({id:managementRule,name:command.name!,enabled:command.enabled!,version:new AlarmRuleJsonNumber(String(version)),createdAt:'2026-10-24T04:00:00Z',updatedAt:'2026-10-24T05:00:00Z',configuration:command.configuration!});return json(saved)}}
 const second=url.searchParams.get('cursor')==='next',id=second?managementRule:managementDevice
 if([base+'/devices/search',base+'/device-types/search',base+'/alarm-notification-groups',base+'/applications'].includes(url.pathname))return json({items:[{id,name:second?'第二页真实目录选项':'第一页真实目录选项',managementName:second?'第二页用户应用':'第一页用户应用',projectId:managementProject}],nextCursor:second?null:'next',hasMore:!second})
 return json({message:'隔离服务没有此操作'},503)
}
session.user={currentProjectId:managementProject,permissions:['alarm:read','alarm:manage']};session.ready=true;setAccessToken('isolated-pagination-preview')
createApp({render:()=>h('div',[open.value?h(Managed,{ruleId:managementRule,onClose:()=>{open.value=false},onSaved:()=>{status.value='已保存并回读规则配置'}}):h('p','告警规则'),h('p',{id:'receipt',role:'status'},status.value)])}).use(ElementPlus).mount('#app')
