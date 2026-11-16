import {afterEach,beforeEach,expect,it,vi,type MockInstance} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Create from '../../src/features/device-types/TypeAlarmRuleCreate.vue'
import Editor from '../../src/features/alarms/AlarmRuleEditor.vue'
import {alarmRuleManagementApi,type ConfiguredAlarmRule,type CreateConfiguredAlarmRule} from '../../src/features/alarms/alarm-rule-management-api'
import {readAlarmRuleSourceChoices} from '../../src/features/alarms/alarm-rule-source-choices-api'
import {readAlarmRuleChoicePage} from '../../src/features/alarms/alarm-rule-choice-catalog'
import {decodeTypeProfile,typeProfileTransport,type TypeProfileTransport} from '../../src/features/device-types/profile-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
import {managementCreate,managementProject as project,managementRule as ruleId} from '../alarms/rule-management-fixture'
vi.mock('../../src/features/alarms/alarm-rule-management-api',async original=>({...await original<typeof import('../../src/features/alarms/alarm-rule-management-api')>(),alarmRuleManagementApi:{get:vi.fn(),create:vi.fn(),update:vi.fn(),setEnabled:vi.fn(),remove:vi.fn()}}))
vi.mock('../../src/features/alarms/alarm-rule-source-choices-api',()=>({readAlarmRuleSourceChoices:vi.fn()}))
vi.mock('../../src/features/alarms/alarm-rule-choice-catalog',()=>({readAlarmRuleChoicePage:vi.fn()}))
const type='00000000-0000-4000-8000-000000000004',other='00000000-0000-4000-8000-000000000005'
const views:VueWrapper[]=[];let saved:ConfiguredAlarmRule,readType:MockInstance<TypeProfileTransport['read']>
function profile(scope=project){return decodeTypeProfile({type:{id:type,projectId:scope,name:'权威告警类型',deviceKind:'DIRECT',networkType:'WIFI',payloadProtocol:'STANDARD',status:'PUBLISHED'},description:null,tags:{},revision:'0',profileToken:'a'.repeat(64)},scope,type)}
async function render(editing?:string){const w=mount(Create,{props:{typeId:type,ruleId:editing},global:{plugins:[ElementPlus],stubs:{ElDialog:{template:'<div><slot/><slot name="footer"/></div>'}}}});views.push(w);await flushPromises();return w}
function button(w:VueWrapper,label:string){const item=w.findAll('button').find(x=>x.text()===label);expect(item,label).toBeDefined();return item!}
async function select(w:VueWrapper,label:string,value:string){const item=w.findAllComponents({name:'ElSelect'}).find(x=>x.props('ariaLabel')===label);expect(item,label).toBeDefined();item!.vm.$emit('update:modelValue',value);item!.vm.$emit('change',value);await flushPromises()}
async function fields(w:VueWrapper){await w.get('[aria-label="规则名称"]').setValue('类型阈值告警');await select(w,'条件1属性','temperature');await w.get('[aria-label="条件1值"]').setValue('30')}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','alarm:read','alarm:manage']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]
 readType=vi.spyOn(typeProfileTransport,'read').mockResolvedValue(profile())
 vi.mocked(readAlarmRuleSourceChoices).mockImplementation(async(_p,source)=>({sources:source.ids.map(id=>({id,label:id===type?'权威告警类型':'另一类型'})),properties:[{key:'temperature',label:'温度',dataType:'NUMBER'}]}))
 vi.mocked(readAlarmRuleChoicePage).mockImplementation(async(_p,kind)=>({items:kind==='DEVICE_TYPE'?[{id:type,label:'权威告警类型'},{id:other,label:'另一类型'}]:[],nextCursor:null}))
 vi.mocked(alarmRuleManagementApi.create).mockImplementation(async(_p,value:CreateConfiguredAlarmRule)=>{saved={id:ruleId,name:value.name,enabled:value.enabled,version:0,createdAt:'2026-10-29T00:00:00Z',updatedAt:'2026-10-29T00:00:00Z',configuration:value.configuration};return saved})
 vi.mocked(alarmRuleManagementApi.get).mockImplementation(async()=>({...saved,configuration:{...saved.configuration,source:{...saved.configuration.source,ids:[...saved.configuration.source.ids]}}}))
})
afterEach(()=>{views.splice(0).forEach(w=>w.unmount());session.user=null;session.projects=[];changeIdentity();vi.restoreAllMocks();document.body.innerHTML=''})
it('类型告警公开资料及权威模型通过后预选类型，一次POST和独立GET后才返回当前类型',async()=>{
 const w=await render();expect(readType).toHaveBeenCalledExactlyOnceWith(project,type,expect.any(AbortSignal));expect(w.text()).toContain('权威告警类型');expect(readAlarmRuleSourceChoices).toHaveBeenCalledWith(project,{kind:'DEVICE_TYPE',ids:[type]},expect.any(AbortSignal));await fields(w);await button(w,'提交').trigger('click');await flushPromises();expect(alarmRuleManagementApi.create).toHaveBeenCalledTimes(1);expect(vi.mocked(alarmRuleManagementApi.create).mock.calls[0]![1].configuration.source).toEqual({kind:'DEVICE_TYPE',ids:[type]});expect(alarmRuleManagementApi.get).toHaveBeenCalledExactlyOnceWith(project,ruleId);expect(w.emitted('saved')).toEqual([[ruleId,true]]);expect(w.emitted('locked')?.at(-1)).toEqual([false]);expect(alarmRuleManagementApi.update).not.toHaveBeenCalled()
})
it('新建修改来源后按独立GET实际来源离开类型栏，不拿原始类型预选当保存事实',async()=>{
 const w=await render();await select(w,'设备源',other);await fields(w);await button(w,'提交').trigger('click');await flushPromises();expect(saved.configuration.source).toEqual({kind:'DEVICE_TYPE',ids:[other]});expect(w.emitted('saved')).toEqual([[ruleId,false]]);expect(alarmRuleManagementApi.get).toHaveBeenCalledTimes(1)
})
it('告警创建未知保持原表单禁再提交，不伪造原键恢复或成功，取消后释放宿主锁',async()=>{
 vi.mocked(alarmRuleManagementApi.create).mockRejectedValueOnce(new ApiError('回执不可用',502,undefined,undefined,true));const w=await render();await fields(w);await button(w,'提交').trigger('click');await flushPromises();expect(w.text()).toContain('创建结果待确认');expect(button(w,'提交').attributes('disabled')).toBeDefined();await button(w,'提交').trigger('click');expect(alarmRuleManagementApi.create).toHaveBeenCalledTimes(1);expect(alarmRuleManagementApi.get).not.toHaveBeenCalled();expect(w.emitted('saved')).toBeUndefined();await button(w,'取消').trigger('click');await flushPromises();expect(w.emitted('close')).toHaveLength(1);expect(w.emitted('locked')?.at(-1)).toEqual([false])
})
it('类型资料跨项目拒绝，取消零业务写，撤权丢弃晚回且不打开旧来源表单',async()=>{
 readType.mockResolvedValueOnce(profile(other));const bad=await render();expect(bad.text()).toContain('类型资料与当前项目不符');expect(bad.findComponent(Editor).exists()).toBe(false);await button(bad,'取消').trigger('click');expect(alarmRuleManagementApi.create).not.toHaveBeenCalled();expect(readAlarmRuleSourceChoices).not.toHaveBeenCalled()
 let finish!:(value:ReturnType<typeof profile>)=>void;readType.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));const late=await render();session.user={...session.user!,projectRole:'VIEWER'};session.projects=[{id:project,status:'ACTIVE',myRole:'VIEWER'}];await flushPromises();finish(profile());await flushPromises();expect(late.findComponent(Editor).exists()).toBe(false);expect(late.text()).toContain('没有类型告警创建权限');expect(alarmRuleManagementApi.create).not.toHaveBeenCalled();expect(readAlarmRuleSourceChoices).not.toHaveBeenCalled()
 views.splice(0).forEach(w=>w.unmount());session.user={...session.user!,projectRole:'OWNER',permissions:['device:read','alarm:read','alarm:manage']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]
 const original=vi.mocked(alarmRuleManagementApi.create).getMockImplementation()!;let finishWrite!:()=>Promise<void>;vi.mocked(alarmRuleManagementApi.create).mockImplementationOnce((p,value)=>new Promise(resolve=>{finishWrite=async()=>resolve(await original(p,value))}))
 const writing=await render();await fields(writing);await button(writing,'提交').trigger('click');await vi.waitFor(()=>expect(finishWrite).toBeDefined());session.user={...session.user!,permissions:['alarm:read','alarm:manage']};await flushPromises();await finishWrite();await flushPromises();expect(alarmRuleManagementApi.get).not.toHaveBeenCalled();expect(writing.emitted('saved')).toBeUndefined();expect(writing.findComponent(Editor).exists()).toBe(false)
})

it('草稿类型明确提示发布前提，不请求不存在的告警来源模型',async()=>{
 const value=profile();readType.mockResolvedValueOnce({...value,type:{...value.type,status:'DRAFT'}});const w=await render();expect(w.text()).toContain('当前类型尚未发布物模型');expect(readAlarmRuleSourceChoices).not.toHaveBeenCalled();expect(alarmRuleManagementApi.create).not.toHaveBeenCalled();expect(w.findComponent(Editor).exists()).toBe(false);await button(w,'取消').trigger('click');expect(w.emitted('close')).toHaveLength(1);
})

function existingAlarm(sourceType=type):ConfiguredAlarmRule{
 const draft=managementCreate(),time='2026-10-29T00:00:00Z'
 return {...draft,id:ruleId,version:2,createdAt:time,updatedAt:time,configuration:{...draft.configuration,source:{kind:'DEVICE_TYPE',ids:[sourceType]}}}
}
it('类型告警编辑预填已有规则，只更新原 ID 和版本，回读后刷新类型列表',async()=>{
 saved=existingAlarm()
 vi.mocked(alarmRuleManagementApi.update).mockImplementationOnce(async(_project,_rule,body)=>{
  saved={...saved,name:body.name,version:body.version+1}
  return saved
 })
 const w=await render(ruleId)
 expect((w.get('[aria-label="规则名称"]').element as HTMLInputElement).value).toBe('高温告警')
 await w.get('[aria-label="规则名称"]').setValue('高温告警测试')
 await button(w,'提交').trigger('click');await flushPromises()
 expect(alarmRuleManagementApi.update).toHaveBeenCalledExactlyOnceWith(project,ruleId,expect.objectContaining({name:'高温告警测试',enabled:false,version:2}))
 expect(alarmRuleManagementApi.get).toHaveBeenCalledTimes(2)
 expect(alarmRuleManagementApi.create).not.toHaveBeenCalled()
 expect(w.emitted('saved')).toEqual([[ruleId,true]])
})
it('规则已移出本类型时，旧列表入口无法打开草稿或写入',async()=>{
 saved=existingAlarm(other)
 const w=await render(ruleId)
 expect(w.text()).toContain('此规则已不属于当前设备类型')
 expect(w.find('[aria-label="规则名称"]').exists()).toBe(false)
 expect(button(w,'提交').attributes('disabled')).toBeDefined()
 expect(alarmRuleManagementApi.update).not.toHaveBeenCalled()
})
