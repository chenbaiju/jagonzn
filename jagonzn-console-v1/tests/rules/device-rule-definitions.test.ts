import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect,ElSwitch,ElOption} from 'element-plus'
import DeviceRuleDefinitions from '../../src/features/rules/DeviceRuleDefinitions.vue'
import {ruleKinds,ruleKindLabels} from '../../src/features/rules/rule-builder-draft'
import {ApiError} from '../../src/core/http'
import {deviceRulePage,type DeviceRuleDefinition} from '../../src/features/rules/device-rule-definition-port'
const state=vi.hoisted(()=>({project:null as any,manage:null as any,push:vi.fn()}))
vi.mock('vue-router',()=>({onBeforeRouteLeave:()=>{},onBeforeRouteUpdate:()=>{},useRouter:()=>({push:state.push})}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('10000000-0000-4000-8000-000000000001');state.manage=ref(true);return {projectId:state.project,can:(value:string)=>value==='rule:manage'&&state.manage.value}})
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',otherDevice='20000000-0000-4000-8000-000000000002',rule='30000000-0000-4000-8000-000000000001',version='40000000-0000-4000-8000-000000000001'
const row=(name='设备规则甲',status:'ACTIVE'|'PAUSED'='ACTIVE',definitionVersion=9):DeviceRuleDefinition=>({id:rule,name,status,activeVersionId:version,versionNumber:2,definitionVersion,deviceSource:{kind:'DEVICE',referenceId:device},hasDeviceAction:true,ruleType:null,createdAt:'2026-10-25T00:00:00Z'})
const page=(items=[row()],nextCursor:string|null=null)=>({items,nextCursor,hasMore:!!nextCursor})
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
let w:VueWrapper|undefined,port:any
async function setup(extra:Record<string,unknown>={}){w=mount(DeviceRuleDefinitions,{attachTo:document.body,props:{deviceId:device,deviceName:'机房设备',transport:port,...extra},global:{plugins:[ElementPlus]}});await flushPromises();return w}
const button=(text:string)=>{const node=[...document.querySelectorAll('button')].find(item=>item.textContent?.trim()===text);expect(node,text).toBeDefined();return new DOMWrapper(node!)}
describe('当前设备规则来源与独立参与',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.project.value=project;state.manage.value=true;port={read:vi.fn().mockResolvedValue(page()),preference:vi.fn().mockImplementation((_p:string,_r:string,d:string,v:number)=>Promise.resolve({deviceId:d,allowed:true,version:1,definitionVersion:v})),change:vi.fn().mockImplementation((_p:string,_r:string,d:string,v:number,p:number,allowed:boolean)=>Promise.resolve({deviceId:d,allowed,version:p+1,definitionVersion:v}))}})
 afterEach(()=>{w?.unmount();w=undefined;document.body.innerHTML=''})
 it('正常读取仅当前设备的真实来源，PAUSED仍独立允许且控制CAS不混展示版本',async()=>{
  port.read.mockResolvedValue(page([row('暂停规则','PAUSED')]));const view=await setup();expect(port.read).toHaveBeenCalledExactlyOnceWith(project,device,{relation:'',status:'',ruleType:''},undefined,expect.any(AbortSignal));expect(view.text()).toContain('什么是消息规则？');expect(view.text()).toContain('未启用');expect(view.text()).toContain('版本 2');expect(view.getComponent(ElSwitch).props('modelValue')).toBe(true);expect(port.preference.mock.lastCall.slice(0,4)).toEqual([project,rule,device,9]);expect(view.findAllComponents(ElSelect)).toHaveLength(3);expect(view.text()).not.toContain('执行历史');expect(port.change).not.toHaveBeenCalled()
 })
 it('独立关闭只发送当前设备和两个CAS，不改变全局状态或把卡片隐藏',async()=>{
  const view=await setup();view.getComponent(ElSwitch).vm.$emit('update:modelValue',false);await flushPromises();expect(port.change).toHaveBeenCalledExactlyOnceWith(project,rule,device,9,1,false);expect(view.text()).toContain('设备规则甲');expect(view.text()).toContain('已启用');expect(view.getComponent(ElSwitch).props('modelValue')).toBe(false);expect(port.read).toHaveBeenCalledTimes(1)
 })
 it('来源和状态由服务端筛选，清旧页游标，不用当前页代筛',async()=>{
  port.read.mockResolvedValueOnce(page([row()],'next')).mockResolvedValue(page([]));const view=await setup();const select=view.findAllComponents(ElSelect)[0]!;select.vm.$emit('update:modelValue','DEVICE_TYPE');select.vm.$emit('change');await flushPromises();expect(port.read.mock.lastCall.slice(0,4)).toEqual([project,device,{relation:'DEVICE_TYPE',status:'',ruleType:''},undefined]);expect(view.text()).toContain('没有符合条件的规则')
 })
 it('合法空后页保留上一页并按全部原筛选返回，读取在途不能重复翻页',async()=>{
  const matched:DeviceRuleDefinition={...row('类型下发规则','PAUSED'),ruleType:'ATTRS_PUSH_PREPROC',deviceSource:{kind:'DEVICE_TYPE',referenceId:version}}
  port.read.mockResolvedValue(page([matched],'signed-rule-page-2'))
  const createRule=vi.fn(),view=await setup({createRule})
  const selections:[number,string][]=[[0,'DEVICE_TYPE'],[1,'ATTRS_PUSH_PREPROC'],[2,'PAUSED']]
  for(const [index,value] of selections){const select=view.findAllComponents(ElSelect)[index]!;select.vm.$emit('update:modelValue',value);select.vm.$emit('change');await flushPromises()}
  const filters={relation:'DEVICE_TYPE',status:'PAUSED',ruleType:'ATTRS_PUSH_PREPROC'}
  expect(port.read.mock.lastCall.slice(0,4)).toEqual([project,device,filters,undefined])
  const empty=deferred<ReturnType<typeof page>>(),back=deferred<ReturnType<typeof page>>()
  port.read.mockReturnValueOnce(empty.promise).mockReturnValueOnce(back.promise)
  const reads=port.read.mock.calls.length,next=view.get('[aria-label="下一页"]')
  await Promise.all([next.trigger('click'),next.trigger('click')]);await flushPromises()
  expect(port.read).toHaveBeenCalledTimes(reads+1)
  expect(port.read.mock.lastCall.slice(0,4)).toEqual([project,device,filters,'signed-rule-page-2'])
  empty.resolve(page([]));await flushPromises()
  expect(view.text()).toContain('没有符合条件的规则')
  expect(view.find('[aria-label="上一页"]').exists()).toBe(true)
  expect(view.get('[aria-label="上一页"]').attributes('disabled')).toBeUndefined()
  expect(view.get('[aria-label="下一页"]').attributes('disabled')).toBeDefined()
  await view.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(port.read).toHaveBeenCalledTimes(reads+1)
  const previous=view.get('[aria-label="上一页"]')
  await Promise.all([previous.trigger('click'),previous.trigger('click')]);await flushPromises()
  expect(port.read).toHaveBeenCalledTimes(reads+2)
  expect(port.read.mock.lastCall.slice(0,4)).toEqual([project,device,filters,undefined])
  back.resolve(page([{...matched,name:'返回原范围规则'}]));await flushPromises()
  expect(view.text()).toContain('返回原范围规则');expect(view.find('[aria-label="分页"]').exists()).toBe(false)
  expect(port.change).not.toHaveBeenCalled();expect(createRule).not.toHaveBeenCalled()
 })
 it('规则参与写在途保留当前卡片且禁止分页并发读取',async()=>{
  port.read.mockResolvedValue(page([row()],'signed-rule-page-2'))
  const pending=deferred<unknown>();port.change.mockReturnValueOnce(pending.promise)
  const view=await setup();view.getComponent(ElSwitch).vm.$emit('update:modelValue',false);await flushPromises()
  expect(view.get('[aria-label="下一页"]').attributes('disabled')).toBeDefined()
  expect(view.get('[aria-label="上一页"]').attributes('disabled')).toBeDefined()
  await view.get('[aria-label="下一页"]').trigger('click');await view.get('[aria-label="上一页"]').trigger('click');await flushPromises()
  expect(port.read).toHaveBeenCalledTimes(1);expect(view.text()).toContain('设备规则甲');expect(port.change).toHaveBeenCalledTimes(1)
  pending.resolve({deviceId:device,allowed:false,version:2,definitionVersion:9});await flushPromises()
  expect(view.get('[aria-label="下一页"]').attributes('disabled')).toBeUndefined();expect(port.read).toHaveBeenCalledTimes(1)
 })
 it('409后不重放，人工先读新定义页再用新定义CAS点读参与',async()=>{
  port.change.mockRejectedValue(new ApiError('定义已变化',409));const view=await setup();view.getComponent(ElSwitch).vm.$emit('update:modelValue',false);await flushPromises();expect(view.getComponent(ElSwitch).props('disabled')).toBe(true);expect(button('刷新').attributes('disabled')).toBeDefined();port.read.mockResolvedValue(page([row('规则新版','ACTIVE',10)]));await button('重新读取核对').trigger('click');await flushPromises();expect(view.text()).toContain('规则新版');expect(port.preference.mock.lastCall.slice(0,4)).toEqual([project,rule,device,10]);expect(view.getComponent(ElSwitch).props('disabled')).toBe(false);expect(port.change).toHaveBeenCalledTimes(1)
 })
 it('结果未知和错回执都锁住卡片及父写入口；手动读取失败不能放行旧开关',async()=>{
  port.change.mockResolvedValue({deviceId:otherDevice,allowed:false,version:2,definitionVersion:9});const createRule=vi.fn(),view=await setup({createRule});view.getComponent(ElSwitch).vm.$emit('update:modelValue',false);await flushPromises();expect(view.text()).toContain('回执身份不匹配');expect(button('创建规则').attributes('disabled')).toBeDefined();view.getComponent(ElSwitch).vm.$emit('update:modelValue',false);await flushPromises();expect(port.change).toHaveBeenCalledTimes(1);port.read.mockRejectedValue(new ApiError('暂不可读',500));await button('重新读取核对').trigger('click');await flushPromises();expect(view.text()).toContain('暂不可读');expect(view.text()).toContain('设备规则甲');expect(view.getComponent(ElSwitch).props('disabled')).toBe(true);expect(button('创建规则').attributes('disabled')).toBeDefined();expect(port.change).toHaveBeenCalledTimes(1)
 })
 it('参与读取撤权清父旧名，不能当成权威空页',async()=>{
  port.preference.mockRejectedValue(new ApiError('禁止读取',403));const view=await setup();expect(view.text()).toContain('禁止读取');expect(view.text()).not.toContain('设备规则甲');expect(view.text()).not.toContain('无所不能的消息规则');expect(view.findComponent(ElSwitch).exists()).toBe(false)
 })
 it('切设备丢弃迟到定义和参与；撤权停止读取，恢复后只读新设备',async()=>{
  const old=deferred<unknown>();port.preference.mockReturnValueOnce(old.promise);const view=await setup();port.read.mockResolvedValue(page([{...row('新设备规则'),deviceSource:{kind:'DEVICE',referenceId:otherDevice}}]));await view.setProps({deviceId:otherDevice});await flushPromises();old.resolve({deviceId:device,allowed:false,version:2,definitionVersion:9});await flushPromises();expect(view.text()).toContain('新设备规则');expect(view.getComponent(ElSwitch).props('modelValue')).toBe(true);state.manage.value=false;await flushPromises();const count=port.read.mock.calls.length;expect(view.text()).not.toContain('新设备规则');state.manage.value=true;await flushPromises();expect(port.read).toHaveBeenCalledTimes(count+1);expect(port.preference.mock.lastCall[2]).toBe(otherDevice)
 })
 it('写在途切设备，旧变更回执不改变新对象的偏好或反馈',async()=>{
  const pending=deferred<unknown>();port.change.mockReturnValueOnce(pending.promise);const view=await setup();view.getComponent(ElSwitch).vm.$emit('update:modelValue',false);await flushPromises();port.read.mockResolvedValue(page([{...row('新设备'),deviceSource:{kind:'DEVICE',referenceId:otherDevice}}]));await view.setProps({deviceId:otherDevice});await flushPromises();pending.resolve({deviceId:device,allowed:false,version:2,definitionVersion:9});await flushPromises();expect(view.text()).toContain('新设备');expect(view.text()).not.toContain('已禁止该设备');expect(view.getComponent(ElSwitch).props('modelValue')).toBe(true)
 })
 it('重复游标、错误设备来源和不安全CAS均拒绝，不伪装为空或默认允许',async()=>{
  expect(()=>deviceRulePage(page([{...row(),deviceSource:{kind:'DEVICE',referenceId:otherDevice}}]),device,[undefined])).toThrow('来源');expect(()=>deviceRulePage(page([{...row(),definitionVersion:9007199254740992}]),device,[undefined])).toThrow('版本');port.read.mockResolvedValue(page([row()],'same'));const view=await setup();await view.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(view.text()).toContain('分页没有形成推进');expect(view.text()).not.toContain('设备规则甲');expect(view.findComponent(ElSwitch).exists()).toBe(false)
 })
 it('仅权威空页显示专用空态，创建回调保留真实设备上下文',async()=>{
  port.read.mockResolvedValue(page([]));const createRule=vi.fn(),view=await setup({createRule});expect(view.text()).toContain('无所不能的消息规则');expect(view.find('[aria-label="分页"]').exists()).toBe(false);expect(port.preference).not.toHaveBeenCalled();await view.findAll('button').filter(x=>x.text()==='创建规则')[1]!.trigger('click');expect(createRule).toHaveBeenCalledTimes(1);expect(port.change).not.toHaveBeenCalled()
 })
 it('网络未知参与结果不重放也不自动重读，允许状态保留为最后确认值',async()=>{
  port.change.mockRejectedValue(new ApiError('连接中断',0,undefined,undefined,true));const view=await setup();view.getComponent(ElSwitch).vm.$emit('update:modelValue',false);await flushPromises();expect(view.getComponent(ElSwitch).props('modelValue')).toBe(true);expect(view.getComponent(ElSwitch).props('disabled')).toBe(true);expect(view.text()).toContain('重新读取核对');expect(port.preference).toHaveBeenCalledTimes(1);view.getComponent(ElSwitch).vm.$emit('update:modelValue',false);await flushPromises();expect(port.change).toHaveBeenCalledTimes(1)
 })

 it('正常选择器不暴露内部兼容类型，历史项目范围卡片不冒设备绑定或展示迁移术语',async()=>{
  port.read.mockResolvedValue(page([{...row('旧规则'),deviceSource:{kind:'LEGACY_PROJECT',referenceId:null}}]));const view=await setup();expect(view.findAllComponents(ElOption).map(option=>option.props('value'))).not.toContain('LEGACY_PROJECT');expect(view.text()).not.toContain('项目兼容');expect(view.text()).not.toContain('LEGACY_PROJECT');expect(view.text()).toContain('旧规则');expect(view.find('.definition-kind').text()).toBe('类型未记录');expect(view.getComponent(ElSwitch).props('modelValue')).toBe(true);expect(port.preference).toHaveBeenCalledExactlyOnceWith(project,rule,device,9,expect.any(AbortSignal))
 })

 it.each([...ruleKinds.map(kind=>[kind,ruleKindLabels[kind].label] as const),[null,'类型未记录'] as const])('卡片显示真实规则类型%s，历史空值不猜测',async(ruleType,label)=>{
  port.read.mockResolvedValue(page([{...row(),ruleType}] as never));const view=await setup();expect(view.get('.definition-kind').text()).toContain(label)
 })
 it('规则类型第三筛选交服务器并重置旧游标，空匹配仍可更换类型',async()=>{
  port.read.mockResolvedValueOnce(page([{...row(),ruleType:'ATTRS_RPT_PREPROC'}] as never,'next')).mockResolvedValue(page([]));const view=await setup()
  const select=view.findAllComponents(ElSelect).find(item=>item.props('ariaLabel')==='规则类型');expect(select).toBeDefined()
  select!.vm.$emit('update:modelValue','ATTRS_PUSH_PREPROC');select!.vm.$emit('change');await flushPromises()
  expect(port.read.mock.lastCall.slice(0,4)).toEqual([project,device,{relation:'',status:'',ruleType:'ATTRS_PUSH_PREPROC'},undefined]);expect(view.text()).toContain('没有符合条件的规则');expect(port.change).not.toHaveBeenCalled()
 })
 it('缺失或伪造规则类型投影拒绝，历史null明确接受',()=>{
  for(const ruleType of [undefined,'COMMAND','UNKNOWN',42,['ATTRS_RPT_PREPROC']])expect(()=>deviceRulePage(page([{...row(),ruleType}] as never),device,[undefined])).toThrow('类型')
  expect(deviceRulePage(page([{...row(),ruleType:null}] as never),device,[undefined]).items[0]).toHaveProperty('ruleType',null)
 })

 it('设备和类型混合六阶段读取不污染来源校验，直接设备DATA也是真实类型',()=>{
  for(const kind of ['DEVICE','DEVICE_TYPE'] as const){
   const items=ruleKinds.map((ruleType,index)=>({...row(),id:`30000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,ruleType,deviceSource:{kind,referenceId:kind==='DEVICE'?device:version}}))
   expect(deviceRulePage(page(items),device,[undefined]).items.map(row=>row.ruleType)).toEqual(ruleKinds)
   if(kind==='DEVICE')expect(()=>deviceRulePage(page(items),otherDevice,[undefined])).toThrow('来源')
  }
 })

})
