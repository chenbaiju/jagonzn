import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect,ElSwitch} from 'element-plus'
import DeviceTaskDefinitions from '../../src/features/rules/DeviceTaskDefinitions.vue'
import {ApiError} from '../../src/core/http'
import {typeTaskPage} from '../../src/features/device-types/type-associations-api'
import {deviceTaskDefinitionPage,type DeviceTaskDefinition} from '../../src/features/rules/device-task-definition-port'
const state=vi.hoisted(()=>({project:null as any,read:null as any,manage:null as any,run:null as any,push:vi.fn()}))
vi.mock('vue-router',()=>({onBeforeRouteLeave:()=>{},onBeforeRouteUpdate:()=>{},useRouter:()=>({push:state.push})}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('10000000-0000-4000-8000-000000000001');state.read=ref(true);state.manage=ref(true);state.run=ref(true);return {projectId:state.project,can:(value:string)=>value==='task:read'?state.read.value:value==='task:manage'?state.manage.value:value==='task:run'?state.run.value:false}})
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',otherDevice='20000000-0000-4000-8000-000000000002',job='30000000-0000-4000-8000-000000000001'
const row=(name='设备任务甲',status:'ACTIVE'|'PAUSED'='ACTIVE',version=9):DeviceTaskDefinition=>({id:job,name,status,version,actionType:'COMMAND',targetType:'EXPLICIT_DEVICES',commandKey:'restart',createdAt:'2026-10-25T00:00:00Z'})
const page=(items=[row()],nextCursor:string|null=null)=>({items,nextCursor,hasMore:!!nextCursor})
const deferred=<T,>()=>{let resolve!:(value:T)=>void;let reject!:(value:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
let w:VueWrapper|undefined,port:any
async function setup(extra:Record<string,unknown>={}){w=mount(DeviceTaskDefinitions,{attachTo:document.body,props:{deviceId:device,deviceName:'机房温度设备',transport:port,...extra},global:{plugins:[ElementPlus]}});await flushPromises();return w}
const button=(text:string)=>{const node=[...document.querySelectorAll('button')].find(item=>item.textContent?.trim()===text);expect(node,text).toBeDefined();return new DOMWrapper(node!)}
describe('设备任务Source专用卡片与独立定时偏好',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.project.value=project;state.read.value=true;state.manage.value=true;state.run.value=true;port={read:vi.fn().mockResolvedValue(page()),preference:vi.fn().mockImplementation((_p:string,_j:string,d:string,v:number)=>Promise.resolve({deviceId:d,allowed:true,version:1,definitionVersion:v})),change:vi.fn().mockImplementation((_p:string,_j:string,d:string,v:number,p:number,allowed:boolean)=>Promise.resolve({deviceId:d,allowed,version:p+1,definitionVersion:v})),run:vi.fn().mockResolvedValue(undefined)}})
 afterEach(()=>{w?.unmount();w=undefined;document.body.innerHTML=''})
 it('正常设备读面有学习资源/三筛选/卡片，不把PAUSED全局状态冒独立false',async()=>{
  port.read.mockResolvedValue(page([row('未启用任务','PAUSED')]));const view=await setup();expect(view.text()).toContain('什么是任务？');expect(view.findAllComponents(ElSelect)).toHaveLength(3);expect(view.text()).toContain('所有关联任务');expect(view.text()).toContain('不限任务类型');expect(view.text()).toContain('不限任务状态');expect(view.text()).not.toContain('请选择');expect(view.text()).toContain('未启用');expect(view.getComponent(ElSwitch).props('modelValue')).toBe(true);expect(port.read).toHaveBeenCalledWith(project,device,{relation:'',status:'',taskType:''},undefined,expect.any(AbortSignal));expect(port.preference).toHaveBeenCalledWith(project,job,device,9,expect.any(AbortSignal));expect(view.text()).not.toContain('关联定义');expect(view.text()).not.toContain('执行历史');expect(port.change).not.toHaveBeenCalled()
 })
 it('三筛选交给服务器并清旧游标，不在当前页过滤或遍历项目任务',async()=>{
  port.read.mockResolvedValueOnce(page([row()],'signed-page-2')).mockResolvedValue(page([]));const view=await setup();const relation=view.findAllComponents(ElSelect)[0]!;relation.vm.$emit('update:modelValue','DEVICE_TYPE');relation.vm.$emit('change','DEVICE_TYPE');await flushPromises();expect(port.read.mock.lastCall.slice(0,4)).toEqual([project,device,{relation:'DEVICE_TYPE',status:'',taskType:''},undefined]);expect(view.text()).toContain('没有符合条件的任务');expect(port.preference).toHaveBeenCalledTimes(1)
 })
 it('独立false不禁用手动运行，确认后只发当前设备且只提示受理',async()=>{
  port.preference.mockResolvedValue({deviceId:device,allowed:false,version:3,definitionVersion:9});const view=await setup();expect(view.getComponent(ElSwitch).props('modelValue')).toBe(false);expect(button('运行任务').attributes('disabled')).toBeUndefined();await button('运行任务').trigger('click');await flushPromises();expect(document.body.textContent).toContain('仅对当前设备发起一次手动运行');await button('确定').trigger('click');await flushPromises();expect(port.run).toHaveBeenCalledExactlyOnceWith(project,job,device,9);expect(port.change).not.toHaveBeenCalled();expect(document.body.querySelector('.el-message--success')?.textContent).toContain('执行已受理');expect(view.text()).not.toContain('执行成功')
 })
 it('单设备开关携两个CAS；冲突不重放，人工回读实际更新父定义而非被busy挡住',async()=>{
  port.change.mockRejectedValueOnce(new ApiError('偏好已变化',409));const view=await setup();view.getComponent(ElSwitch).vm.$emit('update:modelValue',false);await flushPromises();expect(port.change).toHaveBeenCalledExactlyOnceWith(project,job,device,9,1,false);expect(view.text()).toContain('重新读取核对');expect(view.getComponent(ElSwitch).props('disabled')).toBe(true);port.read.mockResolvedValue(page([row('任务新版','ACTIVE',10)]));await button('重新读取核对').trigger('click');await flushPromises();expect(port.read).toHaveBeenCalledTimes(2);expect(port.preference.mock.lastCall.slice(0,4)).toEqual([project,job,device,10]);expect(view.text()).toContain('任务新版');expect(view.getComponent(ElSwitch).props('disabled')).toBe(false);expect(port.change).toHaveBeenCalledTimes(1)
 })
 it('偏好读取失权清父列表，不能继续显示旧定义或变为真实空态',async()=>{
  port.preference.mockRejectedValue(new ApiError('读取权限已撤销',403));const view=await setup();expect(view.text()).toContain('读取权限已撤销');expect(view.text()).not.toContain('设备任务甲');expect(view.text()).not.toContain('让设备批量或定时执行任务');expect(view.find('.device-task-card').exists()).toBe(false)
 })
 it('切设备丢弃迟到页，撤权清除后恢复只读新设备',async()=>{
  const old=deferred<ReturnType<typeof page>>();port.read.mockReturnValueOnce(old.promise).mockResolvedValue(page([row('新设备任务')]));const view=await setup();await view.setProps({deviceId:otherDevice});await flushPromises();old.resolve(page([row('旧设备迟到任务')]));await flushPromises();expect(view.text()).toContain('新设备任务');expect(view.text()).not.toContain('旧设备迟到任务');expect(port.preference.mock.lastCall[2]).toBe(otherDevice);state.read.value=false;await flushPromises();expect(view.text()).not.toContain('新设备任务');const count=port.read.mock.calls.length;state.read.value=true;await flushPromises();expect(port.read).toHaveBeenCalledTimes(count+1);expect(port.read.mock.lastCall[1]).toBe(otherDevice)
 })
 it('重复后续游标拒绝且清旧卡片，不用空页掩盖不完整读取',async()=>{
  port.read.mockResolvedValue(page([row()],'same-cursor'));const view=await setup();await view.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(view.text()).toContain('分页没有形成推进');expect(view.text()).not.toContain('设备任务甲');expect(view.text()).not.toContain('让设备批量或定时执行任务')
 })
 it('合法空后页保留上一页并按原范围返回首屏，不能进入下一页或触发写入',async()=>{
  const view=await setup()
  port.read.mockResolvedValueOnce(page([row()],'signed-page-2')).mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([row('返回首屏任务')]))
  const relation=view.findAllComponents(ElSelect)[0]!
  relation.vm.$emit('update:modelValue','DEVICE_TYPE');relation.vm.$emit('change','DEVICE_TYPE');await flushPromises()
  await view.get('[aria-label="下一页"]').trigger('click');await flushPromises()
  expect(port.read.mock.lastCall.slice(0,4)).toEqual([project,device,{relation:'DEVICE_TYPE',status:'',taskType:''},'signed-page-2'])
  expect(view.text()).toContain('没有符合条件的任务')
  expect(view.find('[aria-label="上一页"]').exists()).toBe(true)
  expect(view.get('[aria-label="上一页"]').attributes('disabled')).toBeUndefined()
  expect(view.get('[aria-label="下一页"]').attributes('disabled')).toBeDefined()
  const reads=port.read.mock.calls.length
  await view.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(port.read).toHaveBeenCalledTimes(reads)
  await view.get('[aria-label="上一页"]').trigger('click');await flushPromises()
  expect(port.read.mock.lastCall.slice(0,4)).toEqual([project,device,{relation:'DEVICE_TYPE',status:'',taskType:''},undefined])
  expect(view.text()).toContain('返回首屏任务');expect(view.find('[aria-label="分页"]').exists()).toBe(false)
  expect(port.change).not.toHaveBeenCalled();expect(port.run).not.toHaveBeenCalled()
 })
 it('只有权威空页才显示Source任务空态；创建只交给真实父页回调',async()=>{
  port.read.mockResolvedValue(page([]));const createTask=vi.fn();const view=await setup({createTask});expect(view.text()).toContain('让设备批量或定时执行任务');expect(view.find('[aria-label="分页"]').exists()).toBe(false);expect(port.preference).not.toHaveBeenCalled();const buttons=view.findAll('button').filter(node=>node.text()==='创建任务');expect(buttons).toHaveLength(2);await buttons[1]!.trigger('click');expect(createTask).toHaveBeenCalledTimes(1);expect(port.change).not.toHaveBeenCalled();expect(port.run).not.toHaveBeenCalled()
 })
 it('错误设备的偏好不能默认为允许或不允许',async()=>{
  port.preference.mockResolvedValue({deviceId:otherDevice,allowed:true,version:1,definitionVersion:9});const view=await setup();expect(view.text()).toContain('定时偏好身份不匹配');expect(view.findComponent(ElSwitch).exists()).toBe(false);expect(view.text()).toContain('未确认');expect(port.run).not.toHaveBeenCalled()
 })
 it('PAUSED与设备定时false均不阻止当前设备手动，确认仍只有一台且不切总状态',async()=>{
  port.read.mockResolvedValue(page([row('手动采样任务','PAUSED')]));port.preference.mockResolvedValue({deviceId:device,allowed:false,version:2,definitionVersion:9});const view=await setup();expect(button('运行任务').attributes('disabled')).toBeUndefined();expect(view.getComponent(ElSwitch).props('modelValue')).toBe(false);await button('运行任务').trigger('click');await flushPromises();state.run.value=false;await flushPromises();expect(port.run).not.toHaveBeenCalled();state.run.value=true;await flushPromises();await button('运行任务').trigger('click');await flushPromises();await button('确定').trigger('click');await flushPromises();expect(port.run).toHaveBeenCalledExactlyOnceWith(project,job,device,9);expect(view.text()).not.toContain('执行成功');expect(port.change).not.toHaveBeenCalled();expect(view.text()).toContain('未启用')
 })
 it('暂停任务手动结果未知仍锁住全部写入口，不因新增手动能力自动重试',async()=>{
  port.read.mockResolvedValue(page([row('手动采样任务','PAUSED')]));port.run.mockRejectedValue(new ApiError('连接中断',0,undefined,undefined,true));const view=await setup();await button('运行任务').trigger('click');await flushPromises();await button('确定').trigger('click');await flushPromises();expect(port.run).toHaveBeenCalledTimes(1);expect(view.text()).toContain('重新读取核对');expect(button('运行任务').attributes('disabled')).toBeDefined();expect(view.getComponent(ElSwitch).props('disabled')).toBe(true);await button('确定').trigger('click');expect(port.run).toHaveBeenCalledTimes(1)
 })
 it('任务卡片运行未知必须继续锁父刷新筛选创建，不能普通刷新卸载未知卡片',async()=>{
  port.run.mockRejectedValue(new ApiError('请求结果未知',0,undefined,undefined,true));const create=vi.fn();const view=await setup({createTask:create});expect(button('创建任务').attributes('disabled')).toBeUndefined();await button('运行任务').trigger('click');await flushPromises();await button('确定').trigger('click');await flushPromises();expect(port.run).toHaveBeenCalledTimes(1);expect(button('刷新').attributes('disabled')).toBeDefined();expect(button('创建任务').attributes('disabled')).toBeDefined();expect(view.findAllComponents(ElSelect).every(select=>select.props('disabled'))).toBe(true);const reads=port.read.mock.calls.length;await button('刷新').trigger('click');await button('创建任务').trigger('click');await flushPromises();expect(port.read).toHaveBeenCalledTimes(reads);expect(create).not.toHaveBeenCalled();expect(view.text()).toContain('重新读取核对');expect(port.run).toHaveBeenCalledTimes(1)
 })
 it('固定属性关联卡按显式类型及空命令标识读取，类型筛选走原端口且旧命令/坏kind边界不混淆',async()=>{
  const property:DeviceTaskDefinition={...row('固定属性任务'),id:'30000000-0000-4000-8000-000000000002',actionType:'PROPERTY_SET',commandKey:null},legacy={...row('旧命令任务')};Reflect.deleteProperty(legacy,'actionType');port.read.mockResolvedValue(page([property,legacy]));const view=await setup();expect(view.text()).toContain('属性下发 - 设备');expect(view.text()).toContain('命令下发 - 设备');expect(view.findAll('.definition-command').map(el=>el.text())).toEqual(['restart']);expect(view.findAll('.device-task-card')).toHaveLength(2);expect(port.run).not.toHaveBeenCalled();expect(port.change).not.toHaveBeenCalled();expect(typeTaskPage(page([{...property,targetType:'DEVICE_TYPE',targetGroupId:null}]),'',[undefined]).items[0]?.actionType).toBe('PROPERTY_SET')
  port.read.mockResolvedValue(page([property]));const filter=view.findAllComponents(ElSelect)[1]!;filter.vm.$emit('update:modelValue','PROPERTY_SET');filter.vm.$emit('change','PROPERTY_SET');await flushPromises();expect(port.read.mock.lastCall.slice(0,4)).toEqual([project,device,{relation:'',status:'',taskType:'PROPERTY_SET'},undefined]);expect(view.findAll('.device-task-card')).toHaveLength(1);expect(view.text()).not.toContain('旧命令任务')
  for(const fields of [{actionType:null},{actionType:'FUTURE'},{actionType:'PROPERTY_SET',commandKey:''},{actionType:'PROPERTY_SET',commandKey:'restart'},{actionType:undefined,commandKey:null}]){const invalid={...property};for(const [key,value]of Object.entries(fields))Reflect.set(invalid,key,value);expect(()=>deviceTaskDefinitionPage(page([invalid]),[])).toThrow()}
  const bad={...property};Reflect.set(bad,'actionType',null);port.read.mockResolvedValue(page([bad]));await button('刷新').trigger('click');await flushPromises();expect(view.text()).toContain('任务类型或内容不一致');expect(view.findAll('.device-task-card')).toHaveLength(0);expect(view.text()).not.toContain('让设备批量或定时执行任务');expect(port.run).not.toHaveBeenCalled();expect(port.change).not.toHaveBeenCalled()
 })

})
