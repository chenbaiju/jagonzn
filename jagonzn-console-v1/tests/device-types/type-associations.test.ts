import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect} from 'element-plus'
import {ruleKinds,ruleKindLabels} from '../../src/features/rules/rule-builder-draft'
import Associations from '../../src/features/device-types/DeviceTypeAssociations.vue'
import {alarmTransitionLogApi} from '../../src/features/alarms/alarm-transition-log-api'
import {typeRulePage,typeTaskPage,typeAlarmPage,type TypeAssociationsTransport} from '../../src/features/device-types/type-associations-api'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
import * as taskApi from '../../src/features/rules/api'
import {taskScheduleTransport} from '../../src/features/rules/task-schedule-transport'
import TaskRunnerDialog from '../../src/features/rules/TaskRunnerDialog.vue'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(100),type=id(200),other=id(201)
const rule=(scope=type,name='类型消息规则')=>({id:id(1),name,status:'PAUSED',activeVersionId:id(5),versionNumber:3,definitionVersion:7,deviceSource:{kind:'DEVICE_TYPE',referenceId:scope},hasDeviceAction:true,createdAt:'2026-10-29T00:00:00Z',ruleType:'ATTRS_RPT_PREPROC'})
const task=(name='类型任务')=>({id:id(2),name,status:'PAUSED',version:9,actionType:'COMMAND' as const,targetType:'DEVICE_TYPE',targetGroupId:null,commandKey:'set_level',createdAt:'2026-10-29T00:00:00Z'})
const alarm=(scope=type)=>({deviceTypeId:scope,items:[{id:id(3),name:'类型告警规则',enabled:false,version:2,level:'IMPORTANT',notificationGroups:[{id:id(9),name:'类型通知组'},{id:id(10),name:null}],customerChannels:['SMS','WECHAT']}],total:'1',page:1,limit:24})
const rules=vi.fn(),tasks=vi.fn(),alarms=vi.fn(),transport:TypeAssociationsTransport={rules,tasks,alarms},wrappers:VueWrapper[]=[]
function owner(){session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['rule:manage','alarm:read']} as never;session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]}
function render(){const w=mount(Associations,{props:{typeId:type,transport},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);return w}
async function tab(label:string){const target=[...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(t=>t.textContent?.trim()===label);expect(target).toBeDefined();target!.click();await flushPromises()}
async function button(label:string){const target=[...document.querySelectorAll<HTMLButtonElement>('button')].find(t=>t.textContent?.trim()===label);expect(target).toBeDefined();target!.click();await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;owner();rules.mockImplementation((_p,t,filters,cursors)=>Promise.resolve(typeRulePage(cursors.length>1?{items:[],hasMore:false,nextCursor:null}:{items:[rule(t)],hasMore:true,nextCursor:'next-type-page'},t,filters,cursors)));tasks.mockImplementation((_p,t,status,cursors)=>Promise.resolve(typeTaskPage({items:[task(t===other?'新类型任务':'类型任务')],hasMore:false,nextCursor:null},status,cursors)));alarms.mockImplementation((_p,t,page)=>Promise.resolve(typeAlarmPage(page===1?alarm(t):{...alarm(t),items:[],total:'1',page},t,page)))})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})
it('类型来源、目标和真实告警计数严格核对，不混DEVICE/项目来源或单设备参与',()=>{
 const filters={status:'',ruleType:''} as const;expect(typeRulePage({items:[rule()],hasMore:false,nextCursor:null},type,filters,[undefined]).items).toHaveLength(1);expect(()=>typeRulePage({items:[rule(other)],hasMore:false,nextCursor:null},type,filters,[undefined])).toThrow();expect(()=>typeRulePage({items:[{...rule(),deviceSource:{kind:'DEVICE',referenceId:type}}],hasMore:false,nextCursor:null},type,filters,[undefined])).toThrow();expect(()=>typeRulePage({items:[rule()],hasMore:true,nextCursor:'used'},type,filters,[undefined,'used'])).toThrow()
 expect(()=>typeTaskPage({items:[{...task(),targetType:'EXPLICIT_DEVICES'}],hasMore:false,nextCursor:null},'',[undefined])).toThrow();expect(()=>typeTaskPage({items:[{...task(),version:9007199254740992}],hasMore:false,nextCursor:null},'',[undefined])).toThrow();expect(()=>typeAlarmPage(alarm(other),type,1)).toThrow();expect(()=>typeAlarmPage({...alarm(),total:'2'},type,1)).toThrow();expect(typeAlarmPage({...alarm(),items:[],total:'0'},type,1).items).toEqual([])
 const invalidRows=[{...alarm().items[0],notificationGroups:undefined},{...alarm().items[0],notificationGroups:[{id:id(9)}]},{...alarm().items[0],notificationGroups:[{id:id(9),name:'一'},{id:id(9),name:'重复'}]},{...alarm().items[0],notificationGroups:[{id:id(9),name:'一',email:'private@example.invalid'}]},{...alarm().items[0],customerChannels:['SMS','SMS']},{...alarm().items[0],customerChannels:['EMAIL']}]
 for(const row of invalidRows)expect(()=>typeAlarmPage({...alarm(),items:[row]},type,1)).toThrow()
})
it('三个真实只读页懒加载，消息规则空后页仍可返回，不显示执行或创建成功',async()=>{
 const wrapper=render();await flushPromises();expect(rules).toHaveBeenCalledTimes(1);expect(tasks).not.toHaveBeenCalled();expect(wrapper.text()).toContain('类型消息规则');document.querySelector<HTMLButtonElement>('[aria-label="下一页"]')!.click();await flushPromises();expect(wrapper.text()).toContain('当前类型暂无关联消息规则');expect(document.querySelector<HTMLButtonElement>('[aria-label="上一页"]')!.disabled).toBe(false);document.querySelector<HTMLButtonElement>('[aria-label="上一页"]')!.click();await flushPromises();expect(wrapper.text()).toContain('类型消息规则')
 await tab('任务');expect(tasks).toHaveBeenLastCalledWith(project,type,'',[undefined],expect.any(AbortSignal));expect(wrapper.text()).toContain('类型任务');expect(wrapper.text()).not.toContain('定义版本');await tab('告警规则');expect(alarms).toHaveBeenLastCalledWith(project,type,1,expect.any(AbortSignal));expect(wrapper.text()).toContain('类型告警规则');expect(wrapper.text()).toContain('通知组');expect(wrapper.text()).toContain('未启用');expect(wrapper.text()).not.toContain('创建入口尚未接通');expect(wrapper.findAll('button').some(b=>b.text()==='创建')).toBe(false)
})
it('VIEWER沿真实任务读权限，alarm:read独立撤销，换类型丢弃晚回且不调用受限规则端口',async()=>{
 session.user={...session.user!,projectRole:'VIEWER',permissions:['alarm:read']};session.projects=[{id:project,status:'ARCHIVED',myRole:'VIEWER'}];const wrapper=render();await flushPromises();expect(rules).not.toHaveBeenCalled();expect(tasks).toHaveBeenCalledTimes(1);expect(wrapper.text()).toContain('类型任务');await tab('告警规则');expect(wrapper.text()).toContain('类型告警规则');session.user={...session.user!,permissions:[]};await flushPromises();expect(wrapper.text()).not.toContain('类型告警规则');expect([...document.querySelectorAll('[role="tab"]')].some(t=>t.textContent?.trim()==='告警规则')).toBe(false)
 let done!:(value:ReturnType<typeof typeTaskPage>)=>void;tasks.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve}));await button('刷新');const signal=tasks.mock.calls.at(-1)![4] as AbortSignal;await wrapper.setProps({typeId:other});done(typeTaskPage({items:[task('旧类型迟到任务')],hasMore:false,nextCursor:null},'',[undefined]));await flushPromises();expect(signal.aborted).toBe(true);expect(wrapper.text()).not.toContain('旧类型迟到任务');expect(wrapper.text()).toContain('新类型任务');expect(rules).not.toHaveBeenCalled()
})

it('宿主指定栏只读取对应类型来源，受限栏不会偷偷改读其它业务',async()=>{
 const wrapper=mount(Associations,{props:{typeId:type,kind:'tasks',transport},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises();expect(tasks).toHaveBeenCalledTimes(1);expect(rules).not.toHaveBeenCalled();expect(wrapper.findAll('[role="tab"]')).toHaveLength(0);
 await wrapper.setProps({kind:'alarms'});await flushPromises();expect(alarms).toHaveBeenCalledTimes(1);expect(wrapper.text()).toContain('类型告警规则');
 session.user={...session.user!,projectRole:'VIEWER',permissions:['alarm:read']};session.projects=[{id:project,status:'ACTIVE',myRole:'VIEWER'}];await wrapper.setProps({kind:'rules'});await flushPromises();expect(rules).not.toHaveBeenCalled();expect(wrapper.text()).toContain('没有此内容的读取权限');expect(wrapper.text()).not.toContain('类型任务');
})

it('类型任务创建仅ACTIVE管理员可发显式类型来源，锁定和只读项目不发事件',async()=>{
 session.user={...session.user!,permissions:['task:manage']};const wrapper=mount(Associations,{props:{typeId:type,kind:'tasks',transport},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises();await button('创建任务');expect(wrapper.emitted('create-task')).toEqual([[type]])
 await wrapper.setProps({disabled:true});await button('创建任务');expect(wrapper.emitted('create-task')).toHaveLength(1);session.projects=[{id:project,status:'ARCHIVED',myRole:'OWNER'}];await flushPromises();expect(wrapper.findAll('button').some(x=>x.text()==='创建任务')).toBe(false)
 session.projects=[{id:project,status:'ACTIVE',myRole:'VIEWER'}];session.user={...session.user!,projectRole:'VIEWER'};await flushPromises();expect(wrapper.findAll('button').some(x=>x.text()==='创建任务')).toBe(false)
})

it('类型任务筛选在状态范围内越过不匹配的首个游标页，并可清除筛选',async()=>{
 const command = task()
 const data = {...task('自定义下发样本'),id:id(4),actionType:'DATA_DOWNLINK_FUNCTION' as const,commandKey:null}
 tasks.mockImplementation((_project,_type,status,cursors)=>Promise.resolve(typeTaskPage(
  cursors.at(-1)==='next-task' ? {items:[data],hasMore:false,nextCursor:null} : {items:[command],hasMore:true,nextCursor:'next-task'},
  status,cursors
 )))
 const wrapper=mount(Associations,{props:{typeId:type,kind:'tasks',transport},attachTo:document.body,global:{plugins:[ElementPlus]}})
 wrappers.push(wrapper);await flushPromises()
 const [kind,status]=wrapper.findAllComponents(ElSelect)
 status!.vm.$emit('update:modelValue','PAUSED');await flushPromises()
 kind!.vm.$emit('update:modelValue','自定义数据下发');await flushPromises()
 expect(tasks).toHaveBeenLastCalledWith(project,type,'PAUSED',[undefined,'next-task'],expect.any(AbortSignal))
 expect(wrapper.text()).toContain('自定义下发样本')
 expect(wrapper.text()).not.toContain('set_level')
 kind!.vm.$emit('update:modelValue','');await flushPromises()
 expect(tasks).toHaveBeenLastCalledWith(project,type,'PAUSED',[undefined],expect.any(AbortSignal))
 expect(wrapper.text()).toContain('set_level')
 expect(wrapper.text()).not.toContain('自定义下发样本')
})

async function renderRunnableTask(status:'ACTIVE'|'PAUSED'){
 session.user={...session.user!,permissions:['task:read','task:run']}
 const row={...task(),status,targetType:'DEVICE_TYPE' as const}
 tasks.mockResolvedValue(typeTaskPage({items:[row],hasMore:false,nextCursor:null},'',[undefined]))
 const wrapper=mount(Associations,{props:{typeId:type,kind:'tasks',transport},attachTo:document.body,global:{plugins:[ElementPlus]}})
 wrappers.push(wrapper);await flushPromises()
 return {wrapper,definition:{...row,targetGroupId:undefined,targetDeviceTypeId:type,tags:{}}}
}

it('任务卡使用真实计划，暂停任务可查看运行器且不会发出执行请求',async()=>{
 const plan=vi.spyOn(taskScheduleTransport,'readPlan').mockResolvedValue({token:9,kind:'DAILY',live:false,consumed:false})
 const read=vi.spyOn(taskApi,'getTask'),run=vi.spyOn(taskApi,'runTask'),selected=vi.spyOn(taskApi,'runTaskOnDevices')
 const {wrapper,definition}=await renderRunnableTask('PAUSED')
 read.mockResolvedValue(definition)
 expect(plan).toHaveBeenCalledExactlyOnceWith(project,definition.id,expect.any(AbortSignal))
 expect(wrapper.text()).toContain('每日定时');expect(wrapper.text()).toContain('未启用')
 await button('运行任务');expect(wrapper.findComponent(TaskRunnerDialog).exists()).toBe(true)
 await button('确定');expect(run).not.toHaveBeenCalled();expect(selected).not.toHaveBeenCalled()
})

it('全部目标确认前重新核对任务范围，已改绑的任务不会提交',async()=>{
 vi.spyOn(taskScheduleTransport,'readPlan').mockResolvedValue({token:8,kind:'MANUAL',live:true,consumed:false})
 const read=vi.spyOn(taskApi,'getTask'),run=vi.spyOn(taskApi,'runTask')
 const {wrapper,definition}=await renderRunnableTask('ACTIVE')
 read.mockResolvedValueOnce(definition).mockResolvedValueOnce({...definition,targetDeviceTypeId:other,version:10})
 expect(wrapper.text()).not.toContain('关闭定时')
 await button('运行任务');await button('确定')
 expect(read).toHaveBeenCalledTimes(2);expect(run).not.toHaveBeenCalled()
 expect(wrapper.text()).toContain('任务资料已变化')
})

it('指定目标沿任务保存范围读取，提交时只发送选中设备和原版本',async()=>{
 vi.spyOn(taskScheduleTransport,'readPlan').mockResolvedValue({token:9,kind:'MANUAL',live:true,consumed:false})
 const read=vi.spyOn(taskApi,'getTask'),all=vi.spyOn(taskApi,'runTask')
 const device=id(16)
 const candidates=vi.spyOn(taskApi,'taskRunCandidates').mockResolvedValue({items:[{id:device,name:'保存范围内设备'}],hasMore:false})
 const run=vi.spyOn(taskApi,'runTaskOnDevices').mockResolvedValue({id:id(18),status:'EXPANDING',actionType:'COMMAND'})
 const {wrapper,definition}=await renderRunnableTask('ACTIVE')
 read.mockResolvedValue(definition)
 await button('运行任务')
 const dialog=wrapper.findComponent(TaskRunnerDialog)
 const signal=new AbortController().signal
 await expect(dialog.props('loadCandidates')(undefined,signal)).resolves.toMatchObject({options:[{id:device,label:'保存范围内设备'}]})
 expect(candidates).toHaveBeenCalledExactlyOnceWith(project,definition.id,definition.version,undefined,signal)
 dialog.vm.$emit('run',[device]);await flushPromises()
 expect(run).toHaveBeenCalledExactlyOnceWith(project,definition.id,definition.version,[device])
 expect(all).not.toHaveBeenCalled()
 expect(wrapper.findComponent(TaskRunnerDialog).exists()).toBe(false)
})

it('运行回执未知时保留核对提示并阻止重复提交',async()=>{
 vi.spyOn(taskScheduleTransport,'readPlan').mockResolvedValue({token:9,kind:'MANUAL',live:true,consumed:false})
 const read=vi.spyOn(taskApi,'getTask')
 const run=vi.spyOn(taskApi,'runTask').mockRejectedValue(new ApiError('连接中断',0,undefined,undefined,true))
 const {wrapper,definition}=await renderRunnableTask('ACTIVE')
 read.mockResolvedValue(definition)
 await button('运行任务');await button('确定');await button('确定')
 expect(run).toHaveBeenCalledExactlyOnceWith(project,definition.id,undefined,true)
 expect(document.body.textContent).toContain('任务运行结果待核对')
 await button('取消');expect(wrapper.text()).toContain('任务运行结果待核对')
})

it('类型告警创建需源类型读取与现告警管理权限，显式类型事件不绕过归档只读',async()=>{
 session.user={...session.user!,permissions:['alarm:read','alarm:manage','device:read']};const wrapper=mount(Associations,{props:{typeId:type,kind:'alarms',transport},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises();await button('创建告警规则');expect(wrapper.emitted('create-alarm')).toEqual([[type]])
 session.user={...session.user!,permissions:['alarm:read','alarm:manage']};await flushPromises();expect(wrapper.findAll('button').some(x=>x.text()==='创建告警规则')).toBe(false);session.user={...session.user!,permissions:['alarm:read','alarm:manage','device:read']};session.projects=[{id:project,status:'ARCHIVED',myRole:'OWNER'}];await flushPromises();expect(wrapper.findAll('button').some(x=>x.text()==='创建告警规则')).toBe(false)
})

it('告警行编辑使用所选规则，历史仅查询该规则并在失权时关闭',async()=>{
 session.user={...session.user!,permissions:['alarm:read','alarm:manage','device:read']}
 const history=vi.spyOn(alarmTransitionLogApi,'page').mockResolvedValue({items:[],total:'0',page:1,limit:24})
 const wrapper=mount(Associations,{props:{typeId:type,kind:'alarms',transport},attachTo:document.body,global:{plugins:[ElementPlus]}})
 wrappers.push(wrapper);await flushPromises()
 await button('编辑');expect(wrapper.emitted('edit-alarm')).toEqual([[type,id(3)]])
 await button('告警历史')
 expect(history).toHaveBeenCalledExactlyOnceWith(project,{deviceId:undefined,ruleId:id(3),page:1,limit:24},expect.any(AbortSignal))
 expect(document.body.textContent).toContain('暂无告警历史消息')
 session.user={...session.user!,permissions:[]};await flushPromises()
 expect(document.querySelector('[aria-label="规则告警历史"]')).toBeNull()
})

it('类型告警空态使用原站表格文案且不显示无用分页',async()=>{
 alarms.mockResolvedValue({...alarm(),items:[],total:'0'});const wrapper=mount(Associations,{props:{typeId:type,kind:'alarms',transport},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises();expect(wrapper.text()).toContain('暂无数据');expect(wrapper.find('[aria-label="分页"]').exists()).toBe(false);expect(wrapper.text()).toContain('通知组');expect(wrapper.text()).toContain('用户通知')
})

it('类型告警真实通知标签、失效组和渠道可见，读取失败不冒未设置，空配置另有明确显示',async()=>{
 const wrapper=mount(Associations,{props:{typeId:type,kind:'alarms',transport},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises()
 expect(wrapper.text()).toContain('类型通知组');expect(wrapper.text()).toContain('通知组已失效/无法读取名称');expect(wrapper.find('[aria-label="短信通知"]').exists()).toBe(true);expect(wrapper.find('[aria-label="公众号通知"]').exists()).toBe(true);expect(wrapper.text()).not.toContain('当前接口未提供')
 alarms.mockRejectedValueOnce(new Error('通知组读取失败'));await button('刷新');expect(wrapper.text()).toContain('操作未完成，请重试');expect(wrapper.text()).not.toContain('类型通知组');expect(wrapper.text()).not.toContain('未设置')
 alarms.mockResolvedValueOnce(typeAlarmPage({...alarm(),items:[{...alarm().items[0],notificationGroups:[],customerChannels:[]}]},type,1));await button('刷新');expect(wrapper.text().match(/未设置/g)).toHaveLength(2);expect(wrapper.find('[aria-label="短信通知"]').exists()).toBe(false)
})

it('类型目录混合六阶段真实标签与筛选不会使整页格式失败，仍拒绝非当前类型来源',async()=>{
 const items=ruleKinds.map((ruleType,index)=>({...rule(type,`阶段规则${index}`),id:id(20+index),ruleType}))
 rules.mockImplementation((_p,t,filters,cursors)=>Promise.resolve(typeRulePage({items:filters.ruleType?items.filter(row=>row.ruleType===filters.ruleType):items,hasMore:false,nextCursor:null},t,filters,cursors)))
 const wrapper=render();await flushPromises();const cards=wrapper.get('.type-rule-cards')
 for(const kind of ruleKinds)expect(cards.text()).toContain(ruleKindLabels[kind].label)
 const filter=wrapper.findAllComponents(ElSelect).find(control=>control.attributes('aria-label')==='类型规则种类'||control.props('ariaLabel')==='类型规则种类')!;expect(filter).toBeDefined();filter.vm.$emit('update:modelValue','ATTRS_PUSH');await flushPromises();expect(rules.mock.lastCall?.[2]).toEqual({status:'',ruleType:'ATTRS_PUSH'});expect(wrapper.get('.type-rule-cards').text()).toContain('属性下发');expect(wrapper.findAll('.type-rule-card')).toHaveLength(1)
 expect(()=>typeRulePage({items:[{...items[0],deviceSource:{kind:'DEVICE',referenceId:type}}],hasMore:false,nextCursor:null},type,{status:'',ruleType:''},[undefined])).toThrow('来源')
})
