import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Managed from '../../src/features/alarms/ManagedAlarmRuleChoicesEditor.vue'
import {changeIdentity,setAccessToken} from '../../src/core/http'
import {session} from '../../src/core/session'
import {parseAlarmRuleJson,stringifyAlarmRuleJson,AlarmRuleJsonNumber,type AlarmRuleJsonObject} from '../../src/features/alarms/alarm-rule-json'
import {exactThreshold,managementDevice,managementProject,managementResponse,managementRule} from './rule-management-fixture'
let wrapper:ReturnType<typeof mount>,saved:string,removed:boolean,metadataFailure:boolean,requests:{path:string;method:string;body:string;query:string}[]
const button=(text:string)=>wrapper.findAll('button').find(value=>value.text()===text)!
const metadata=()=>({kind:'DEVICE',sourceIds:[managementDevice],bindings:[{sourceId:managementDevice,modelVersionId:managementRule,name:'真实当前设备名'}],properties:[{key:'temperature',dataType:'NUMBER',label:'温度'}]})
function response(value:unknown,status=200){return new Response(typeof value==='string'?value:JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})}
beforeEach(()=>{saved=managementResponse();removed=false;metadataFailure=false;requests=[];session.user={currentProjectId:managementProject,permissions:['alarm:read','alarm:manage']};changeIdentity();setAccessToken('bounded-flow');vi.stubGlobal('fetch',vi.fn(async(input,options)=>{
 const url=new URL(String(input)),method=options?.method??'GET',path=url.pathname,body=String(options?.body??'');requests.push({path,method,body,query:url.search})
 const base=`/api/v1/projects/${managementProject}`
 if(path===base+'/console/alarm-rule-source-properties/query')return metadataFailure?response({message:'模型读取失败'},503):response(metadata())
 if([base+'/devices/search',base+'/alarm-notification-groups',base+'/applications'].includes(path))return response({items:[{id:managementDevice,name:'目录名',managementName:'应用名'}],nextCursor:url.searchParams.get('cursor')?null:'next',hasMore:!url.searchParams.get('cursor')})
 if(path===base+'/console/alarm-rules/'+managementRule){
  if(method==='GET')return removed?response({message:'规则已移除'},404):response(saved)
  if(method==='DELETE'){removed=true;return new Response(null,{status:204})}
  if(method==='PUT'){const command=parseAlarmRuleJson(body) as AlarmRuleJsonObject;const original=parseAlarmRuleJson(saved) as AlarmRuleJsonObject;saved=stringifyAlarmRuleJson({...original,name:command.name!,enabled:command.enabled!,configuration:command.configuration!,version:new AlarmRuleJsonNumber('1')});return response(saved)}
 }
 return response({message:'隔离服务没有这个操作'},503)
}))})
afterEach(()=>{wrapper?.unmount();session.user=null;vi.unstubAllGlobals();changeIdentity()})
async function setup(){wrapper=mount(Managed,{props:{ruleId:managementRule},global:{plugins:[ElementPlus],stubs:{ElDialog:{template:'<div><slot/><slot name="footer"/></div>'}}}});await flushPromises()}
describe('正式默认模型适配器到规则管理的真实共享HTTP/内存服务接线',()=>{
 it('GET配置+一次模型POST+三目录→完整PUT→独立GET，精确阈值始终保留',async()=>{await setup();expect(wrapper.text()).toContain('真实当前设备名');expect(requests.filter(row=>row.path.endsWith('/alarm-rule-source-properties/query'))).toHaveLength(1);expect(wrapper.get('input[aria-label="条件1值"]').element).toHaveProperty('value',exactThreshold);await button('提交').trigger('click');await flushPromises();expect(wrapper.emitted('saved')).toEqual([[managementRule]]);const write=requests.find(row=>row.method==='PUT')!;expect(write.body).toContain(exactThreshold);expect(requests.filter(row=>row.path.endsWith('/console/alarm-rules/'+managementRule)&&row.method==='GET')).toHaveLength(2)})
 it('实际目录翻页重新核模型但不修改配置或版本、选中当前名称不被目录旧名覆盖',async()=>{await setup();const before=requests.length;await wrapper.get('[aria-label="设备源下一页"]').trigger('click');await flushPromises();expect(requests.slice(before).some(row=>row.path.endsWith('/devices/search')&&row.query.includes('cursor=next'))).toBe(true);expect(requests.filter(row=>row.path.endsWith('/alarm-rule-source-properties/query'))).toHaveLength(2);expect(requests.filter(row=>row.method==='PUT')).toHaveLength(0);expect(wrapper.text()).toContain('真实当前设备名');expect(wrapper.get('input[aria-label="条件1值"]').element).toHaveProperty('value',exactThreshold)})
 it('真实模型HTTP失败不伪造可保存表单，仍允许原CAS移除并GET404确认',async()=>{metadataFailure=true;await setup();expect(wrapper.text()).toContain('设备源资料读取失败');expect(button('提交').attributes('disabled')).toBeDefined();await button('移除规则').trigger('click');await button('确认移除').trigger('click');await flushPromises();expect(wrapper.emitted('removed')).toEqual([[managementRule]]);expect(JSON.parse(requests.find(row=>row.method==='DELETE')!.body)).toEqual({version:0});expect(requests.filter(row=>row.method==='PUT')).toHaveLength(0)})
 it('身份变更清除真实端口资料与表单，不保留旧项目选择或发送写操作',async()=>{await setup();changeIdentity();await flushPromises();expect(wrapper.find('input[aria-label="规则名称"]').exists()).toBe(false);expect(requests.filter(row=>row.method==='PUT'||row.method==='DELETE')).toHaveLength(0);expect(wrapper.emitted('saved')).toBeUndefined()})
})
