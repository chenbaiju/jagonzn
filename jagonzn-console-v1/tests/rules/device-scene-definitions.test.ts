import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElInput,ElSelect,ElOption} from 'element-plus'
import DeviceSceneDefinitions from '../../src/features/rules/DeviceSceneDefinitions.vue'
import {ApiError} from '../../src/core/http'
import {deviceScenePage,type DeviceSceneDefinition} from '../../src/features/rules/device-scene-definition-port'
const session=vi.hoisted(()=>({project:null as any,manage:null as any,current:null as any}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');session.project=ref('10000000-0000-4000-8000-000000000001');session.manage=ref(true);session.current=ref({status:'ACTIVE'});return {projectId:session.project,currentProject:session.current,can:()=>session.manage.value}})
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',scene='30000000-0000-4000-8000-000000000001',version='40000000-0000-4000-8000-000000000001',execution='50000000-0000-4000-8000-000000000001'
const row=(status:'ACTIVE'|'PAUSED'='ACTIVE',definitionVersion=9):DeviceSceneDefinition=>({id:scene,name:'机房降温',status,activeVersionId:version,versionNumber:2,definitionVersion,deviceScope:{kind:'DEVICE',referenceId:device},hasDeviceAction:true,createdAt:'2026-10-25T00:00:00Z'})
const page=(items=[row()],nextCursor:string|null=null)=>({items,nextCursor,hasMore:!!nextCursor})
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
let w:VueWrapper|undefined,port:any
const button=(text:string)=>{const node=[...document.querySelectorAll('button')].find(item=>item.textContent?.trim()===text);expect(node,text).toBeDefined();return new DOMWrapper(node!)}
async function setup(extra:Record<string,unknown>={}){w=mount(DeviceSceneDefinitions,{attachTo:document.body,props:{deviceId:device,deviceName:'测试风机',transport:port,...extra},global:{plugins:[ElementPlus]}});await flushPromises();return w}
async function confirm(){await button('运行场景').trigger('click');await flushPromises();await button('确定运行').trigger('click');await flushPromises()}
describe('正式设备关联场景列表与单设备运行',()=>{
 beforeEach(()=>{vi.clearAllMocks();session.project.value=project;session.manage.value=true;session.current.value={status:'ACTIVE'};port={read:vi.fn().mockResolvedValue(page()),run:vi.fn().mockImplementation((_p:string,_s:string,d:string,_v:number,key:string)=>Promise.resolve({id:execution,sceneId:scene,deviceId:d,sceneVersionId:version,idempotencyKey:key,trigger:'MANUAL',status:'DISPATCHED'})),lookup:vi.fn(),definition:vi.fn().mockResolvedValue({id:scene,status:'ACTIVE',version:10,activeVersionId:version})}})
 afterEach(()=>{w?.unmount();w=undefined;document.body.innerHTML=''})
 it('一状态筛选及名称描述搜索只读正式设备列表，不请求项目候选或写全局状态',async()=>{
  const view=await setup();expect(port.read).toHaveBeenCalledExactlyOnceWith(project,device,{status:'',name:''},undefined,expect.any(AbortSignal));expect(view.findAllComponents(ElSelect)).toHaveLength(1);expect(view.findComponent(ElInput).props('placeholder')).toBe('搜索名称/描述');expect(view.text()).toContain('机房降温');expect(view.text()).toContain('版本 2');expect(view.text()).not.toContain('执行历史');expect(port.run).not.toHaveBeenCalled();expect(view.text()).not.toContain('创建场景')
 })
 it('搜索和状态先清游标后由服务端过滤，空页有真实专用空态',async()=>{
  port.read.mockResolvedValueOnce(page([row()],'next')).mockResolvedValue(page([]));const createScene=vi.fn(),view=await setup({createScene});await view.get('[aria-label="搜索场景名称或描述"]').setValue('泵房');await view.get('[aria-label="搜索场景名称或描述"]').trigger('keyup.enter');await flushPromises();expect(port.read.mock.lastCall.slice(0,4)).toEqual([project,device,{status:'',name:'泵房'},undefined]);expect(view.text()).toContain('没有符合条件的场景');view.getComponent(ElSelect).vm.$emit('update:modelValue','PAUSED');view.getComponent(ElSelect).vm.$emit('change');await flushPromises();expect(port.read.mock.lastCall[2]).toEqual({status:'PAUSED',name:'泵房'});await button('创建场景').trigger('click');expect(createScene).toHaveBeenCalledTimes(1);expect(port.run).not.toHaveBeenCalled()
 })
 it('后续游标页变空仍可返回上一页，首屏空态不展示分页且不自动补读',async()=>{
  port.read.mockResolvedValueOnce(page([row()],'next')).mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([]))
  const view=await setup();await view.get('[aria-label="下一页"]').trigger('click');await flushPromises()
  expect(port.read).toHaveBeenCalledTimes(2);expect(port.read.mock.lastCall[3]).toBe('next')
  expect(view.find('[aria-label="分页"]').exists()).toBe(true)
  expect(view.get('[aria-label="上一页"]').attributes('disabled')).toBeUndefined()
  expect(view.get('[aria-label="下一页"]').attributes('disabled')).toBeDefined()
  await view.get('[aria-label="上一页"]').trigger('click');await flushPromises()
  expect(port.read).toHaveBeenCalledTimes(3);expect(port.read.mock.lastCall[3]).toBeUndefined()
  expect(view.find('[aria-label="分页"]').exists()).toBe(false);expect(port.run).not.toHaveBeenCalled()
 })
 it('打开确认不写；取消不写；确认只当前设备和控制CAS，DISPATCHED仅表示队列',async()=>{
  const view=await setup();await button('运行场景').trigger('click');await flushPromises();expect(document.body.textContent).toContain('本次只对设备“测试风机”执行');expect(port.run).not.toHaveBeenCalled();await button('取消').trigger('click');await flushPromises();expect(port.run).not.toHaveBeenCalled();await confirm();expect(port.run).toHaveBeenCalledTimes(1);expect(port.run.mock.lastCall.slice(0,4)).toEqual([project,scene,device,9]);expect(port.run.mock.lastCall[4]).toMatch(/^[a-f0-9-]{36}$/);expect(view.text()).toContain('发送队列');expect(view.text()).not.toContain('送达成功')
 })
 it('PAUSED可见但不能运行，不在客户端临时启用',async()=>{
  port.read.mockResolvedValue(page([row('PAUSED')]));const view=await setup();expect(view.text()).toContain('已停用');expect(button('运行场景').attributes('disabled')).toBeDefined();await button('运行场景').trigger('click');await flushPromises();expect(port.run).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('确定运行')
 })
 it('未知锁住筛选分页创建及详情，404保留原key，仅正确GET解除，无第二POST',async()=>{
  port.read.mockResolvedValue(page([row()],'next'));port.run.mockRejectedValue(new ApiError('网络中断',0,undefined,undefined,true));port.lookup.mockRejectedValueOnce(new ApiError('未找到',404)).mockImplementation((_p:string,_s:string,key:string)=>Promise.resolve({id:execution,sceneId:scene,deviceId:device,sceneVersionId:version,idempotencyKey:key,trigger:'MANUAL',status:'DISPATCHED'}));const openScene=vi.fn(),createScene=vi.fn(),view=await setup({openScene,createScene});await confirm();const key=port.run.mock.lastCall[4];expect(button('刷新').attributes('disabled')).toBeDefined();expect(button('创建场景').attributes('disabled')).toBeDefined();expect(view.getComponent(ElSelect).props('disabled')).toBe(true);expect(view.get('[aria-label="下一页"]').attributes('disabled')).toBeDefined();await view.get('.scene-name').trigger('click');expect(openScene).not.toHaveBeenCalled();await button('核对同次执行结果').trigger('click');await flushPromises();expect(view.text()).toContain('结果仍待核对');expect(button('刷新').attributes('disabled')).toBeDefined();expect(port.lookup.mock.lastCall.slice(0,3)).toEqual([project,scene,key]);await button('核对同次执行结果').trigger('click');await flushPromises();expect(button('刷新').attributes('disabled')).toBeUndefined();expect(port.run).toHaveBeenCalledTimes(1);expect(port.read).toHaveBeenCalledTimes(1)
 })
 it('未知时短暂撤读权可退出且不留私有显示，同scope恢复后仅人工原key核对',async()=>{
  port.run.mockRejectedValue(new ApiError('网络中断',0,undefined,undefined,true))
  port.lookup.mockRejectedValueOnce(new ApiError('未找到',404)).mockImplementation((_p:string,_s:string,key:string)=>Promise.resolve({id:execution,sceneId:scene,deviceId:device,sceneVersionId:version,idempotencyKey:key,trigger:'MANUAL',status:'DISPATCHED'}))
  const view=await setup();await confirm();const key=port.run.mock.lastCall[4]
  session.manage.value=false;await flushPromises()
  expect(view.text()).not.toContain('机房降温');expect(document.body.textContent).not.toContain('测试风机');expect(view.emitted('busy')?.at(-1)).toEqual([false])
  expect(port.lookup).not.toHaveBeenCalled();expect(port.read).toHaveBeenCalledTimes(1)
  session.manage.value=true;await flushPromises()
  expect(button('核对同次执行结果').exists()).toBe(true);expect(view.emitted('busy')?.at(-1)).toEqual([true]);expect(button('刷新').attributes('disabled')).toBeDefined()
  expect(port.lookup).not.toHaveBeenCalled();expect(port.run).toHaveBeenCalledTimes(1);expect(port.read).toHaveBeenCalledTimes(2)
  await button('核对同次执行结果').trigger('click');await flushPromises()
  expect(port.lookup.mock.lastCall.slice(0,3)).toEqual([project,scene,key]);expect(view.text()).toContain('结果仍待核对');expect(button('刷新').attributes('disabled')).toBeDefined()
  await button('核对同次执行结果').trigger('click');await flushPromises()
  expect(port.lookup.mock.lastCall.slice(0,3)).toEqual([project,scene,key]);expect(button('刷新').attributes('disabled')).toBeUndefined();expect(view.emitted('busy')?.at(-1)).toEqual([false]);expect(port.run).toHaveBeenCalledTimes(1)
 })
 it('已回滚定义冲突人工新定义与新设备页读取后才恢复，新运行不借展示版本作CAS',async()=>{
  port.run.mockRejectedValueOnce(new ApiError('版本变化',409,40042));const view=await setup();await confirm();expect(button('刷新').attributes('disabled')).toBeDefined();port.read.mockResolvedValue(page([row('ACTIVE',10)]));await button('重新读取场景定义').trigger('click');await flushPromises();expect(port.definition).toHaveBeenCalledTimes(1);expect(port.lookup).not.toHaveBeenCalled();expect(button('刷新').attributes('disabled')).toBeUndefined();await confirm();expect(port.run).toHaveBeenCalledTimes(2);expect(port.run.mock.lastCall[3]).toBe(10);expect(view.text()).toContain('发送队列')
 })
 it('冲突后列表读取失败不能清锁放行旧定义，恢复时仍是人工GET',async()=>{
  port.run.mockRejectedValueOnce(new ApiError('版本变化',409,40042));const view=await setup();await confirm();port.read.mockRejectedValueOnce(new ApiError('暂不可读',500));await button('重新读取场景定义').trigger('click');await flushPromises();expect(view.text()).toContain('暂不可读');expect(button('刷新').attributes('disabled')).toBeDefined();expect(port.run).toHaveBeenCalledTimes(1);port.read.mockResolvedValue(page([row('PAUSED',10)]));await button('重新读取场景定义').trigger('click');await flushPromises();expect(button('运行场景').attributes('disabled')).toBeDefined();expect(port.definition).toHaveBeenCalledTimes(2)
 })
 it('在途读取撤权清私有显示并允许退出，同scope恢复只提供原请求核对且不重放运行',async()=>{
  const pending=deferred<any>();port.run.mockReturnValue(pending.promise);const view=await setup();await confirm()
  session.manage.value=false;await flushPromises();expect(view.text()).not.toContain('机房降温');expect(view.emitted('busy')?.at(-1)).toEqual([false])
  pending.resolve({});await flushPromises();expect(view.text()).not.toContain('回执不匹配');expect(port.read).toHaveBeenCalledTimes(1)
  session.manage.value=true;await flushPromises();expect(button('刷新').attributes('disabled')).toBeDefined();expect(button('核对同次执行结果').exists()).toBe(true);expect(view.text()).toContain('机房降温')
  expect(port.read).toHaveBeenCalledTimes(2);expect(port.lookup).not.toHaveBeenCalled();expect(port.definition).not.toHaveBeenCalled();expect(port.run).toHaveBeenCalledTimes(1)
 })
 it('切设备丢弃旧定义响应及POST回执，不污染新设备状态',async()=>{
  const pending=deferred<any>();port.run.mockReturnValue(pending.promise);const view=await setup();await confirm();port.read.mockResolvedValue(page([{...row(),name:'新设备场景',deviceScope:{kind:'DEVICE',referenceId:other}}]));await view.setProps({deviceId:other});await flushPromises();pending.resolve({});await flushPromises();expect(view.text()).toContain('新设备场景');expect(view.text()).not.toContain('回执不匹配');expect(button('刷新').attributes('disabled')).toBeUndefined();expect(port.lookup).not.toHaveBeenCalled()
 })
 it('损坏身份、错误单设备范围、不安全CAS及重复游标拒绝，不能变成权威空页',async()=>{
  expect(()=>deviceScenePage(page([{...row(),definitionVersion:9007199254740992}]),device,[undefined])).toThrow('版本');expect(()=>deviceScenePage(page([{...row(),deviceScope:{kind:'DEVICE',referenceId:other}}]),device,[undefined])).toThrow('范围');expect(()=>deviceScenePage(page([row(),row()]),device,[undefined])).toThrow('身份');port.read.mockResolvedValue(page([row()],'same'));const view=await setup();await view.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(view.text()).toContain('分页没有形成推进');expect(view.text()).not.toContain('一键执行标准操作流程')
 })
 it('归档仍读取关联场景，残留管理权限不能运行或创建但可刷新和打开只读详情',async()=>{
  session.current.value={status:'ARCHIVED'};const createScene=vi.fn(),openScene=vi.fn(),view=await setup({createScene,openScene});expect(port.read).toHaveBeenCalledTimes(1);expect(view.text()).toContain('机房降温');expect(button('运行场景').attributes('disabled')).toBeDefined();expect(button('创建场景').attributes('disabled')).toBeDefined();await button('运行场景').trigger('click');await button('创建场景').trigger('click');await view.get('.scene-name').trigger('click');expect(openScene).toHaveBeenCalledExactlyOnceWith(scene);expect(createScene).not.toHaveBeenCalled();expect(port.run).not.toHaveBeenCalled();await button('刷新').trigger('click');await flushPromises();expect(port.read).toHaveBeenCalledTimes(2)
 })
 it('Source实屏状态和空态文案精确对应，搜索只输入框Enter不添加原站没有的按钮',async()=>{
  port.read.mockResolvedValue(page([]));const view=await setup();expect(view.findAllComponents(ElOption).map(option=>[option.props('value'),option.props('label')])).toEqual([['','全部'],['ACTIVE','正常'],['PAUSED','已停用']]);expect(view.text()).toContain('一键执行标准操作流程');expect(view.text()).toContain('创建场景，在动作中使用该设备，将常用的操作步骤保存为标准化流程，需要时一键执行。');expect(view.findAll('button').some(item=>item.text()==='搜索')).toBe(false);expect(view.getComponent(ElInput).props('placeholder')).toBe('搜索名称/描述');expect(port.run).not.toHaveBeenCalled()
 })
})
