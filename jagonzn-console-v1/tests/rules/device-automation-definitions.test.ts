import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect,ElRadioGroup} from 'element-plus'
import Page from '../../src/features/rules/DeviceAutomationDefinitions.vue'
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',id='30000000-0000-4000-8000-000000000001',version='40000000-0000-4000-8000-000000000001'
const state=vi.hoisted(()=>({api:vi.fn(),manage:{value:true},read:{value:true},menu:{value:true},project:{value:''}}))
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
vi.mock('../../src/core/session',async()=>{const{ref}=await import('vue');state.manage=ref(true);state.read=ref(true);state.menu=ref(true);state.project=ref('10000000-0000-4000-8000-000000000001');return{projectId:state.project,can:(permission:string)=>permission==='rule:manage'?state.manage.value:state.read.value,hasMenu:()=>state.menu.value}})
const row=()=>({id,name:'当前设备自动化',description:'仅描述中的关键字',status:'PAUSED',activeVersionId:version,versionNumber:1,triggerType:'CRON',usesConditionInput:true,hasDeviceAction:true,createdAt:'2026-10-26T00:00:00Z'})
const page=(items:unknown[]= [row()],nextCursor:string|null=null)=>({items,nextCursor,hasMore:!!nextCursor})
let wrappers:VueWrapper[]=[]
async function setup(){const w=mount(Page,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{RouterLink:{props:['to'],template:'<a :data-to="to.path"><slot/></a>'}}}});wrappers.push(w);await flushPromises();return w}
beforeEach(()=>{state.api.mockReset().mockResolvedValue(page());state.manage.value=true;state.read.value=true;state.menu.value=true;state.project.value=project})
afterEach(()=>{wrappers.forEach(w=>w.unmount());wrappers=[];document.body.innerHTML=''})
describe('设备自动化有限专用读面',()=>{
 it('正常入口提供名称描述及真实用途筛选',async()=>{const w=await setup();expect(w.find('[aria-label="自动化名称或描述"]').exists()).toBe(true);expect(w.findAllComponents(ElSelect).some(x=>x.props('ariaLabel')==='自动化用途')).toBe(true)})
 it('摘要卡显示描述且定时条件明确为配置输入',async()=>{const w=await setup();expect(w.text()).toContain('仅描述中的关键字');expect(w.text()).toContain('条件基于配置输入');expect(w.text()).toContain('设备命令或属性动作');expect(w.findAll('button').some(x=>['创建自动化','运行','启用','暂停'].includes(x.text()))).toBe(false)})
})

describe('服务端过滤、游标与读取边界',()=>{
 const history=()=>({id,automationId:id,automationVersionId:version,triggerType:'CRON',status:'DISPATCHED',attemptCount:1,deviceActionRecordCount:0,occurredAt:'2026-10-26T00:00:00Z',acceptedAt:'2026-10-26T00:00:00Z',createdAt:'2026-10-26T00:00:00Z'})
 const choose=async(w:VueWrapper,label:string,value:string)=>{const select=w.findAllComponents(ElSelect).find(s=>s.props('ariaLabel')===label)!;select.vm.$emit('update:modelValue',value);select.vm.$emit('change');await flushPromises()}
 const button=(w:VueWrapper,label:string)=>w.findAll('button').find(x=>x.text()===label)!
 it('名称描述按字面交服务器，已提交条件随下一页且新筛选重置游标',async()=>{
  state.api.mockResolvedValue(page([row()],'next'));const w=await setup()
  await w.get('input[aria-label="自动化名称或描述"]').setValue('  %_\\  ');await w.get('form').trigger('submit');await flushPromises()
  expect(state.api.mock.lastCall?.[1].query).toEqual({status:undefined,keyword:'%_\\',usage:undefined,cursor:undefined,limit:24})
  await w.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(state.api.mock.lastCall?.[1].query.cursor).toBe('next')
  state.api.mockResolvedValue(page([]));await choose(w,'自动化用途','DEVICE_ACTION');expect(state.api.mock.lastCall?.[1].query).toMatchObject({usage:'DEVICE_ACTION',keyword:'%_\\',cursor:undefined});expect(w.text()).toContain('没有符合条件的自动化');expect(w.find('[aria-label="分页"]').exists()).toBe(false)
 })
 it('首空不伪造数量，下一页为空仍有上一页且不自动重查',async()=>{
  state.api.mockResolvedValueOnce(page([row()],'next')).mockResolvedValueOnce(page([])).mockResolvedValue(page([row()],'next'));const w=await setup()
  await w.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(state.api).toHaveBeenCalledTimes(2);expect(w.get('[aria-label="上一页"]').attributes('disabled')).toBeUndefined();expect(w.find('[aria-label="第 2 页"]').exists()).toBe(true)
  await w.get('[aria-label="上一页"]').trigger('click');await flushPromises();expect(state.api.mock.lastCall?.[1].query.cursor).toBeUndefined();expect(w.text()).toContain('当前设备自动化')
 })
 it('空态、读取错误和重试不混淆，没有创建或执行写入口',async()=>{
  state.api.mockRejectedValueOnce(new Error('本次读取失败')).mockResolvedValue(page([]));const w=await setup();expect(w.get('[role="alert"]').text()).toContain('本次读取失败');expect(w.find('.automation-empty').exists()).toBe(false)
  await button(w,'重新读取').trigger('click');await flushPromises();expect(w.text()).toContain('让设备自动响应业务事件');expect(w.find('[aria-label="分页"]').exists()).toBe(false);expect(state.api.mock.calls.every(([,options])=>options.method===undefined&&options.body===undefined)).toBe(true)
 })
 it('执行历史沿原端点且不携带定义筛选，零设备动作不能宣称执行成功',async()=>{
  const w=await setup();await choose(w,'自动化状态','PAUSED');state.api.mockResolvedValue(page([history()]));w.getComponent(ElRadioGroup).vm.$emit('update:modelValue','history');await flushPromises()
  expect(state.api.mock.lastCall?.[0]).toBe(`/api/v1/projects/${project}/devices/${device}/automation-executions`);expect(state.api.mock.lastCall?.[1].query).toEqual({cursor:undefined,limit:24});expect(w.text()).toContain('DISPATCHED 不代表设备执行成功')
  await button(w,'查看').trigger('click');await flushPromises();expect(document.body.textContent).toContain('"deviceActionRecordCount": 0')
 })
 it('仅成员读权直接进入执行历史，管理权撤销隐藏旧定义并读合法历史',async()=>{
  const w=await setup();state.api.mockResolvedValue(page([history()]));state.manage.value=false;await flushPromises();expect(w.text()).not.toContain('仅描述中的关键字');expect(state.api.mock.lastCall?.[0]).toContain('/automation-executions');expect(w.find('[aria-label="自动化用途"]').exists()).toBe(false)
  state.read.value=false;await flushPromises();expect(w.text()).toContain('没有此内容的读取权限');const n=state.api.mock.calls.length;await flushPromises();expect(state.api).toHaveBeenCalledTimes(n)
 })
 it('设备切换清条件与旧卡，晚回的旧范围响应不能覆盖新设备',async()=>{
  let resolve!:(value:unknown)=>void;state.api.mockReturnValueOnce(new Promise(yes=>{resolve=yes})).mockResolvedValue(page([{...row(),name:'新设备自动化'}]));const w=await setup();await w.setProps({deviceId:'20000000-0000-4000-8000-000000000002'});await flushPromises();resolve(page());await flushPromises();expect(w.text()).toContain('新设备自动化');expect(w.text()).not.toContain('当前设备自动化');expect(state.api.mock.calls[0]?.[1].signal.aborted).toBe(true)
 })
 it('身份失效清已有数据并拒旧迟到结果，不自行向旧范围重读',async()=>{
  let resolve!:(value:unknown)=>void;state.api.mockReturnValueOnce(new Promise(yes=>{resolve=yes}));const w=await setup();const {invalidateIdentity}=await import('../../src/core/http');invalidateIdentity();resolve(page());await flushPromises();expect(w.text()).not.toContain('当前设备自动化');expect(state.api).toHaveBeenCalledTimes(1)
 })
 it('属性上报条件与定时配置条件文案区分，nullable描述不冒名填值',async()=>{
  state.api.mockResolvedValue(page([{...row(),description:null,triggerType:'PROPERTY_REPORTED',hasDeviceAction:false}]));const w=await setup();expect(w.text()).toContain('未填写描述');expect(w.text()).toContain('条件基于本次属性上报');expect(w.find('.automation-uses').text()).not.toContain('设备命令或属性动作')
 })
})

it('保留菜单授权的全部自动化导航，不暗示项目列表支持设备筛选',async()=>{const w=await setup();expect(w.text()).toContain('查看全部自动化');expect(w.find('[data-to="/rules/automations"]').exists()).toBe(true);state.menu.value=false;await flushPromises();expect(w.text()).not.toContain('查看全部自动化')})
