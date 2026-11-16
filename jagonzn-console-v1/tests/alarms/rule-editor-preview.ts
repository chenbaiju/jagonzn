/** 正式管理客户端与真实Vue，仅连接隔离内存fetch和展示资料端口，不访问Source或实际后端。 */
import {createApp,h,ref} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import Managed from '../../src/features/alarms/ManagedAlarmRuleEditor.vue'
import {session} from '../../src/core/session'
import {setAccessToken} from '../../src/core/http'
import {AlarmRuleJsonNumber,parseAlarmRuleJson,stringifyAlarmRuleJson,type AlarmRuleJsonObject} from '../../src/features/alarms/alarm-rule-json'
import type {AlarmRuleConfiguration} from '../../src/features/alarms/alarm-rule-management-api'
import {editorChoices} from './rule-editor-fixture'
import {managementProject,managementRule,managementResponse} from './rule-management-fixture'
const state=new URLSearchParams(location.search).get('state')||'basic',open=ref(true),creating=state==='create'
let saved=managementResponse(),version=0,deleted=false
if(state==='notifications'){
 const row=parseAlarmRuleJson(saved) as AlarmRuleJsonObject,config=row.configuration as AlarmRuleJsonObject,n=config.notifications as AlarmRuleJsonObject
 n.customerChannels=['WECHAT','SMS','VOICE','APP'];n.customerSmsQuotaRequired=true;n.customerVoiceQuotaRequired=true;n.wechatClickAction='PROJECT_APP';n.wechatAppId=managementRule;n.groupIds=[managementRule];saved=stringifyAlarmRuleJson(row)
}
if(state==='time'){
 const row=parseAlarmRuleJson(saved) as AlarmRuleJsonObject,config=row.configuration as AlarmRuleJsonObject,schedule=config.schedule as AlarmRuleJsonObject
 schedule.enabled=true;schedule.recoveryOutsideAllowed=true;saved=stringifyAlarmRuleJson(row)
}
if(state==='clear'){
 const row=parseAlarmRuleJson(saved) as AlarmRuleJsonObject,config=row.configuration as AlarmRuleJsonObject,recovery=config.recovery as AlarmRuleJsonObject
 recovery.manualClearAllowed=true;recovery.customerClearAllowed=true;saved=stringifyAlarmRuleJson(row)
}
window.fetch=async(input,options)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.href),method=options?.method??'GET'
 const json=(value:string,status=200)=>new Response(value,{status,headers:{'Content-Type':'application/json'}})
 const path=`/api/v1/projects/${managementProject}/console/alarm-rules`
 if(![path,path+'/'+managementRule].includes(url.pathname))return json('{"message":"夹具没有此操作"}',503)
 if(method==='GET')return state==='error'?json('{"message":"规则配置暂时无法读取"}',503):deleted?json('{"message":"规则不存在"}',404):json(saved)
 if(state==='conflict')return json('{"message":"规则已被其他成员修改"}',409)
 if(method==='DELETE'){deleted=true;return new Response(null,{status:204})}
 if(method==='PUT'||method==='POST'){
  const command=parseAlarmRuleJson(String(options?.body)) as AlarmRuleJsonObject
  version=method==='POST'?0:version+1
  const result:AlarmRuleJsonObject={id:managementRule,name:command.name!,enabled:command.enabled!,version:new AlarmRuleJsonNumber(String(version)),createdAt:'2026-10-24T04:00:00Z',updatedAt:`2026-10-24T04:01:${String(version).padStart(2,'0')}Z`,configuration:command.configuration!}
  saved=stringifyAlarmRuleJson(result);return json(saved,method==='POST'?201:200)
 }
 return json('{"message":"夹具没有此操作"}',503)
}
session.user={currentProjectId:managementProject,displayName:'项目成员',permissions:state==='forbidden'?['alarm:read']:['alarm:read','alarm:manage']};session.projects=[{id:managementProject,name:'配置验证'}];session.ready=true;setAccessToken('bounded-fixture-only')
createApp({render:()=>open.value?h(Managed,{ruleId:creating?undefined:managementRule,loadChoices:async(project:string,source:AlarmRuleConfiguration['source'])=>({...editorChoices(),projectId:project,source,properties:source.ids.length?editorChoices().properties:[]}),onClose:()=>{open.value=false},onSaved:()=>{document.getElementById('receipt')!.textContent='已保存并回读规则配置'},onRemoved:()=>{document.getElementById('receipt')!.textContent='已移除并确认规则不可读取'}}):h('p','告警规则')}).use(ElementPlus).mount('#app')
