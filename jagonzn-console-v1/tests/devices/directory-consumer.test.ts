import {beforeEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceList from '../../src/features/devices/DeviceList.vue'
import DeviceCatalogToolbar from '../../src/features/devices/DeviceCatalogToolbar.vue'
import CursorPager from '../../src/ui/CursorPager.vue'
import {directoryQuery} from '../../src/features/devices/directory-query'
const state=vi.hoisted(()=>({project:null as any,readAllowed:null as any,directory:vi.fn()}))
vi.mock('vue-router',()=>({onBeforeRouteLeave:vi.fn(),onBeforeRouteUpdate:vi.fn(),useRouter:()=>({push:vi.fn()})}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('project-a');state.readAllowed=ref(true);return {session:{ready:true,transitioning:false,user:null},currentProject:ref(undefined),projectId:state.project,can:(permission:string)=>permission==='device:read'?state.readAllowed.value:true}})
vi.mock('../../src/features/devices/api',async(importOriginal)=>{const original=await importOriginal<typeof import('../../src/features/devices/api')>();return {...original,devicesApi:{...original.devicesApi,directory:state.directory}}})
vi.mock('../../src/features/devices/use-options',async()=>{const {ref}=await import('vue');return {useDeviceOptions:()=>({groups:{data:ref([{id:'group-1',name:'机房'}]),error:ref(),loading:ref(false),reload:vi.fn()},allTypes:ref([]),types:{data:ref({hasMore:false}),error:ref(),loading:ref(false),reload:vi.fn()},moreTypes:vi.fn()})}})
function mountList(){return mount(DeviceList,{global:{plugins:[ElementPlus],stubs:{DeviceBatchActions:true,RouterLink:{template:'<a><slot/></a>'}}}})}
describe('正式directory消费者',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.project.value='project-a';state.readAllowed.value=true;state.directory.mockImplementation((_p:string,q:any)=>Promise.resolve({items:[{id:'00000000-0000-4000-8000-000000000001',name:'目录设备',status:'OFFLINE'}],alarmObservations:[{deviceId:'00000000-0000-4000-8000-000000000001',modelVersionId:'00000000-0000-4000-8000-000000000099',observedAt:'2026-10-24T00:00:00Z',state:'NORMAL',highestSeverity:null}],referenceIdentities:[{deviceId:'00000000-0000-4000-8000-000000000001',businessKey:null,version:'0',updatedAt:'2026-10-24T00:00:00Z'}],total:'83',page:q.page,limit:q.limit}))})
 it('同项目撤销读取权限即清除目录总数，恢复后必须重新读取',async()=>{
  const w=mountList();await flushPromises();expect(w.text()).toContain('设备(83)');expect(state.directory).toHaveBeenCalledTimes(1)
  state.readAllowed.value=false;await flushPromises();expect(w.text()).not.toContain('设备(83)');expect(w.text()).toContain('当前账号没有');expect(state.directory).toHaveBeenCalledTimes(1)
  state.readAllowed.value=true;await flushPromises();expect(state.directory).toHaveBeenCalledTimes(2);expect(w.text()).toContain('设备(83)');w.unmount()
 })
 it('显示权威总数并以唯一页码事件翻页，四排序及每页数量发往directory',async()=>{
  const w=mountList();await flushPromises();expect(w.text()).toContain('设备(83)');expect(state.directory).toHaveBeenCalledTimes(1)
  await w.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(state.directory).toHaveBeenCalledTimes(2);expect(state.directory.mock.lastCall?.[1]).toMatchObject({page:2,limit:24})
  const toolbar=w.getComponent(DeviceCatalogToolbar)
  for(const order of ['CREATED_ASC','CREATED_DESC','ACTIVE_DESC','NAME_ASC']){toolbar.vm.$emit('update:order',order);toolbar.vm.$emit('search');await flushPromises();expect(state.directory.mock.lastCall?.[1]).toMatchObject({order,page:1})}
  w.getComponent(CursorPager).vm.$emit('update:limit',96);await flushPromises();expect(state.directory.mock.lastCall?.[1]).toMatchObject({limit:96,page:1});w.unmount()
 })
 it('受控筛选实际传参，原站未观察的标签筛选不展示或残留，切项目清除旧范围',async()=>{
  const w=mountList();await flushPromises();const toolbar=w.getComponent(DeviceCatalogToolbar)
  await w.findAll('button').find(button=>button.text()==='更多筛选')!.trigger('click');await flushPromises()
  expect(document.querySelector('input[aria-label="标签名称筛选"]')).toBeNull();expect(document.querySelector('input[aria-label="标签值筛选"]')).toBeNull()
  const emitStale=toolbar.vm.$emit as (event:string,...values:unknown[])=>void
  emitStale('update:tagKey','部门');emitStale('update:tagValue','旧隐藏条件')
  toolbar.vm.$emit('update:filters',{online:'OFFLINE',activity:'NEVER',alarm:'',enabled:'false',kind:'DIRECT'});toolbar.vm.$emit('search');await flushPromises()
  expect(state.directory.mock.lastCall?.[1]).toMatchObject({statuses:['OFFLINE','INACTIVE'],activity:'NEVER',enabled:false,deviceKinds:['DIRECT']})
  for(const key of ['tagKey','tagValue'])expect(Object.hasOwn(state.directory.mock.lastCall?.[1],key)).toBe(false)
  await w.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(state.directory.mock.lastCall?.[1]).toMatchObject({page:2,enabled:false})
  for(const key of ['tagKey','tagValue'])expect(Object.hasOwn(state.directory.mock.lastCall?.[1],key)).toBe(false)
  await w.findAll('button').find(button=>button.text()==='刷新')!.trigger('click');await flushPromises()
  for(const key of ['tagKey','tagValue'])expect(Object.hasOwn(state.directory.mock.lastCall?.[1],key)).toBe(false)
  state.directory.mockReturnValue(new Promise(()=>{}));state.project.value='project-b';await flushPromises();expect(w.text()).not.toContain('设备(83)');expect(state.directory.mock.lastCall?.[0]).toBe('project-b');expect(state.directory.mock.lastCall?.[1]).toEqual({page:1,limit:24,order:'CREATED_ASC'});w.unmount()
 })
 it('设备组侧栏按原站默认展开，选择分组与全部设备发往真实目录条件',async()=>{
  const w=mountList();await flushPromises()
  const group=w.findAll('button').find(b=>b.text()==='机房');expect(group).toBeDefined();await group!.trigger('click');await flushPromises();expect(state.directory.mock.lastCall?.[1]).toMatchObject({groupId:'group-1',page:1})
  await w.get('[aria-label="设备分组"]').findAll('button')[0].trigger('click');await flushPromises();expect(state.directory.mock.lastCall?.[1].groupId).toBeUndefined();await w.get('[aria-label="设备分组"]').findAll('button')[1].trigger('click');await flushPromises();expect(state.directory.mock.lastCall?.[1]).toMatchObject({ungrouped:true,page:1});expect(state.directory.mock.lastCall?.[1].groupId).toBeUndefined();w.unmount()
 })
 it('正式告警筛选使用目录同快照摘要，查询失败清除旧总数和正常状态',async()=>{
  const id='00000000-0000-4000-8000-000000000001',model='00000000-0000-4000-8000-000000000099'
  state.directory.mockImplementation((_p:string,q:any)=>Promise.resolve({items:[{id,name:'同快照设备',status:'ONLINE',deviceKey:'internal-protocol'}],total:'1',page:q.page,limit:q.limit,
   alarmObservations:[{deviceId:id,modelVersionId:model,observedAt:'2026-10-24T00:00:00Z',state:q.alarm&&q.alarm!=='NORMAL'?'ACTIVE':'NORMAL',highestSeverity:q.alarm&&q.alarm!=='NORMAL'?'CRITICAL':null}],referenceIdentities:[{deviceId:id,businessKey:'MAC:Current',version:'0',updatedAt:'2026-10-24T00:00:00Z'}]}))
  const w=mountList();await flushPromises();expect(w.text()).toContain('无告警')
  const toolbar=w.getComponent(DeviceCatalogToolbar)
  for(const alarm of ['NORMAL','ACTIVE','MINOR','MAJOR','CRITICAL']){toolbar.vm.$emit('update:filters',{online:'',activity:'',alarm,enabled:'',kind:''});toolbar.vm.$emit('search');await flushPromises();expect(state.directory.mock.lastCall?.[1]).toMatchObject({alarm,page:1})}
  expect(w.text()).toContain('告警中');expect(w.text()).toContain('设备(1)');toolbar.vm.$emit('update:view','table');await flushPromises();expect(w.text()).toContain('MAC:Current');expect(w.text()).toContain('internal-protocol')
  state.directory.mockRejectedValueOnce(new Error('公开视图不可用'));toolbar.vm.$emit('search');await flushPromises();expect(w.text()).not.toContain('设备(1)');expect(w.text()).not.toContain('无告警');expect(w.text()).toContain('公开视图不可用');w.unmount()
 })
 it('成功搜索空页按原站显示完整空面板，不渲染表头分页且不把读取错误当空态',async()=>{
  state.directory.mockResolvedValue({items:[],alarmObservations:[],referenceIdentities:[],total:'0',page:1,limit:24})
  const w=mountList();await flushPromises();const toolbar=w.getComponent(DeviceCatalogToolbar);toolbar.vm.$emit('update:view','table');toolbar.vm.$emit('update:keyword','NO-MATCH');toolbar.vm.$emit('search');await flushPromises()
  expect(w.find('thead').exists()).toBe(false);expect(w.text()).toContain('无匹配的设备');expect(w.find('[aria-label="分页"]').exists()).toBe(false);expect(w.get('.device-empty img').attributes('src')).toBe('/reference/empty-content.png');expect(w.get('.device-empty button').text()).toBe('创建设备')
  state.directory.mockRejectedValueOnce(new Error('设备目录读取失败'));toolbar.vm.$emit('search');await flushPromises();expect(w.text()).toContain('设备目录读取失败');expect(w.text()).not.toContain('无匹配的设备');expect(w.find('.device-empty').exists()).toBe(false);w.unmount()
 })
 it('本页选择、批次锁定与写后刷新保留核对范围，解锁后清除选择',async()=>{
  const w=mountList();await flushPromises();const toolbar=w.getComponent(DeviceCatalogToolbar),batch=w.getComponent({name:'DeviceBatchActions'})
  toolbar.vm.$emit('update:view','table');await flushPromises();await w.get('[aria-label="选择本页全部设备"] input').setValue(true);await flushPromises()
  const ids=['00000000-0000-4000-8000-000000000001'];expect(batch.props('deviceIds')).toEqual(ids)
  batch.vm.$emit('locked',true);await flushPromises();expect(toolbar.props('disabled')).toBe(true);expect(w.get('[aria-label="下一页"]').attributes('disabled')).toBeDefined()
  const count=state.directory.mock.calls.length;toolbar.vm.$emit('search');batch.vm.$emit('cleared');await flushPromises();expect(state.directory).toHaveBeenCalledTimes(count);expect(batch.props('deviceIds')).toEqual(ids)
  batch.vm.$emit('changed');await flushPromises();expect(state.directory).toHaveBeenCalledTimes(count+1);expect(batch.props('deviceIds')).toEqual(ids)
  batch.vm.$emit('locked',false);await flushPromises();expect(batch.props('deviceIds')).toEqual([]);expect(toolbar.props('disabled')).toBe(false);w.unmount()
 })
 it.each(['24','0'])('后页数据缩减为空且总数为%s时保留返回入口，不自动重读或伪造首屏',async(total)=>{
  const w=mountList();await flushPromises()
  state.directory.mockResolvedValueOnce({items:[],alarmObservations:[],referenceIdentities:[],total,page:2,limit:24})
  await w.get('[aria-label="下一页"]').trigger('click');await flushPromises()
  expect(state.directory).toHaveBeenCalledTimes(2)
  expect(w.text()).toContain(`设备(${total})`)
  expect(w.find('[aria-label="分页"]').exists()).toBe(true)
  expect(w.get('[aria-label="上一页"]').attributes('disabled')).toBeUndefined()
  expect(w.get('[aria-label="下一页"]').attributes('disabled')).toBeDefined()
  await w.get('[aria-label="上一页"]').trigger('click');await flushPromises()
  expect(state.directory).toHaveBeenCalledTimes(3)
  expect(state.directory.mock.lastCall?.[1]).toMatchObject({page:1,limit:24})
  expect(w.text()).toContain('目录设备');w.unmount()
 })
 it('批次核对后页变空仍维持锁定，解锁后可返回且撤权立即移除分页',async()=>{
  const w=mountList();await flushPromises()
  await w.get('[aria-label="下一页"]').trigger('click');await flushPromises()
  const batch=w.getComponent({name:'DeviceBatchActions'})
  await w.get('[aria-label="选择设备 目录设备"] input').setValue(true)
  batch.vm.$emit('locked',true);await flushPromises()
  state.directory.mockResolvedValueOnce({items:[],alarmObservations:[],referenceIdentities:[],total:'24',page:2,limit:24})
  batch.vm.$emit('changed');await flushPromises()
  expect(state.directory).toHaveBeenCalledTimes(3)
  expect(w.find('[aria-label="分页"]').exists()).toBe(true)
  expect(w.get('[aria-label="上一页"]').attributes('disabled')).toBeDefined()
  w.getComponent(CursorPager).vm.$emit('update:page',1);await flushPromises()
  expect(state.directory).toHaveBeenCalledTimes(3)
  batch.vm.$emit('locked',false);await flushPromises()
  expect(batch.props('deviceIds')).toEqual([])
  expect(w.get('[aria-label="上一页"]').attributes('disabled')).toBeUndefined()
  state.readAllowed.value=false;await flushPromises()
  expect(w.find('[aria-label="分页"]').exists()).toBe(false)
  expect(state.directory).toHaveBeenCalledTimes(3);w.unmount()
 })
 it('同页卡片表格切换保留选择，翻页及同项目撤权清除旧选择',async()=>{
  const w=mountList();await flushPromises();const toolbar=w.getComponent(DeviceCatalogToolbar),batch=w.getComponent({name:'DeviceBatchActions'})
  await w.get('[aria-label="选择设备 目录设备"] input').setValue(true);await flushPromises();expect(batch.props('deviceIds')).toHaveLength(1)
  toolbar.vm.$emit('update:view','table');await flushPromises();expect(batch.props('deviceIds')).toEqual(['00000000-0000-4000-8000-000000000001'])
  await w.get('[aria-label="选择本页全部设备"] input').setValue(true);await flushPromises();await w.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(batch.props('deviceIds')).toEqual([])
  await w.get('[aria-label="选择本页全部设备"] input').setValue(true);await flushPromises();state.readAllowed.value=false;await flushPromises();expect(batch.props('deviceIds')).toEqual([]);w.unmount()
 })
 it('未支持筛选不能静默丢弃并请求全部设备',()=>{
  const filters={online:'',activity:'ACTIVE',alarm:'',enabled:'',kind:''},extra={groupId:'',tagKey:'',tagValue:''}
  expect(()=>directoryQuery('', '', filters,'CREATED_ASC',1,24,extra)).toThrow('活跃筛选')
  expect(()=>directoryQuery('', '', {...filters,activity:'',alarm:'UNSUPPORTED'},'CREATED_ASC',1,24,extra)).toThrow('告警筛选')
 })
})
