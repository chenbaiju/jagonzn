import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {defineComponent} from 'vue'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import ElementPlus from 'element-plus'
import DeviceList from '../../src/features/devices/DeviceList.vue'
import Toolbar from '../../src/features/devices/DeviceCatalogToolbar.vue'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
const mock=vi.hoisted(()=>({type:vi.fn(),types:vi.fn(),groups:vi.fn(),directory:vi.fn()}))
vi.mock('../../src/features/devices/api',async original=>{const source=await original<typeof import('../../src/features/devices/api')>();return{...source,devicesApi:{...source.devicesApi,...mock}}})
const Batch=defineComponent({name:'DeviceBatchActions',props:['deviceIds','disabled','userManagementAvailable'],emits:['locked','changed','cleared','manage-users'],template:'<span/>'})
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const project=id(1),other=id(2),type=id(99),secondType=id(98)
function typeFact(selected=type,scope=project,name='首屏外类型'){return{id:selected,projectId:scope,name,typeKey:'type',deviceKind:'DIRECT',networkType:'WIFI',payloadProtocol:'STANDARD',status:'DRAFT',version:1}}
function page(name='限定设备'){const device=id(200);return{items:[{id:device,name,status:'ONLINE'}],total:'1',page:1,limit:24,alarmObservations:[{deviceId:device,modelVersionId:id(300),observedAt:'2026-10-28T01:00:00Z',state:'NORMAL',highestSeverity:null}],referenceIdentities:[{deviceId:device,businessKey:null,version:'0',updatedAt:'2026-10-28T01:00:00Z'}]}}
let wrapper:ReturnType<typeof mount>|undefined,router:Router
function toolbar(){return wrapper!.getComponent(Toolbar)}
function button(label:string){const result=wrapper!.findAll('button').find(value=>value.text()===label);if(!result)throw new Error('缺少按钮：'+label);return result}
async function setup(path=`/devices?deviceTypeId=${type}`){router=createRouter({history:createMemoryHistory(),routes:[{path:'/devices',component:DeviceList},{path:'/devices/:id',component:{template:'<p>设备详情目标</p>'}},{path:'/device-groups/:groupId',name:'device-groups',component:{template:'<p>设备组详情目标</p>'}},{path:'/end-users',name:'end-users',component:{template:'<p>终端用户目录目标</p>'}}]});await router.push(path);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus],stubs:{DeviceBatchActions:Batch,DeviceTypeActivityPolicyDialog:true}}});await flushPromises()}
beforeEach(()=>{sessionStorage.clear();Object.values(mock).forEach(fn=>fn.mockReset());changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,permissions:['device:read','enduser:read'],projectRole:'OWNER'} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}];mock.type.mockResolvedValue(typeFact());mock.types.mockResolvedValue({items:Array.from({length:50},(_,index)=>typeFact(id(1000+index),project,`第一页类型${index}`)),hasMore:true,nextCursor:'next'});mock.groups.mockResolvedValue([]);mock.directory.mockResolvedValue(page())})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];sessionStorage.clear();document.body.innerHTML=''})

it('链接类型不依赖首50选项，先直读再受限查询；锁中不放开，显式清类型才移除参数',async()=>{
 await setup();expect(mock.type).toHaveBeenCalledTimes(1);expect(mock.type.mock.calls[0]!.slice(0,2)).toEqual([project,type]);expect(mock.directory).toHaveBeenCalledTimes(1);expect(mock.directory.mock.calls[0]![1]).toMatchObject({deviceTypeIds:[type],page:1});expect(toolbar().props('typeId')).toBe(type);expect(toolbar().props('types').find(row=>row.id===type)!.name).toBe('首屏外类型');expect(mock.types).toHaveBeenCalledTimes(1)
 await button('刷新').trigger('click');await flushPromises();expect(mock.directory.mock.lastCall![1].deviceTypeIds).toEqual([type]);expect(mock.type).toHaveBeenCalledTimes(1)
 wrapper!.getComponent(Batch).vm.$emit('locked',true);toolbar().vm.$emit('update:typeId','');toolbar().vm.$emit('search');await flushPromises();expect(router.currentRoute.value.query.deviceTypeId).toBe(type);expect(mock.directory).toHaveBeenCalledTimes(2)
 wrapper!.getComponent(Batch).vm.$emit('locked',false);toolbar().vm.$emit('update:typeId','');toolbar().vm.$emit('search');await flushPromises();expect(router.currentRoute.value.query.deviceTypeId).toBeUndefined();expect(mock.directory).toHaveBeenCalledTimes(3);expect(mock.directory.mock.lastCall![1].deviceTypeIds).toBeUndefined();expect(toolbar().props('typeId')).toBe('')
})

it('非法/数组或拒读清旧行总数，刷新不请求无滤设备页，只有明确清除限定才放开',async()=>{
 await setup('/devices');expect(wrapper!.text()).toContain('设备(1)');expect(mock.directory).toHaveBeenCalledTimes(1)
 await router.push('/devices?deviceTypeId=bad');await flushPromises();expect(wrapper!.text()).toContain('设备类型链接无效');expect(wrapper!.findAll('.device-card')).toHaveLength(0);expect(wrapper!.text()).not.toContain('设备(1)');await button('刷新').trigger('click');await flushPromises();expect(mock.type).not.toHaveBeenCalled();expect(mock.directory).toHaveBeenCalledTimes(1)
 await router.push({path:'/devices',query:{deviceTypeId:[type,type]}});await flushPromises();expect(wrapper!.text()).toContain('链接无效');expect(mock.type).not.toHaveBeenCalled();mock.type.mockRejectedValue(new ApiError('当前不可读取',403));await router.push(`/devices?deviceTypeId=${type}`);await flushPromises();expect(wrapper!.text()).toContain('无法读取链接中的设备类型');await button('刷新').trigger('click');await flushPromises();expect(mock.type).toHaveBeenCalledTimes(2);expect(mock.directory).toHaveBeenCalledTimes(1)
 await button('清除类型限定').trigger('click');await flushPromises();expect(router.currentRoute.value.query.deviceTypeId).toBeUndefined();expect(mock.directory).toHaveBeenCalledTimes(2);expect(mock.directory.mock.lastCall![1].deviceTypeIds).toBeUndefined()
})

it('切项目中止旧类型读取，旧响应不恢复名称或无滤查询；新链接和失权仍按当前scope',async()=>{
 let finish!:(value:ReturnType<typeof typeFact>)=>void;const pending=new Promise<ReturnType<typeof typeFact>>(resolve=>{finish=resolve});mock.type.mockReturnValueOnce(pending).mockRejectedValueOnce(new ApiError('不属于当前项目',403)).mockResolvedValue(typeFact(secondType,other,'新项目类型'));await setup();expect(mock.directory).not.toHaveBeenCalled();const oldSignal=mock.type.mock.calls[0]![2] as AbortSignal
 session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'},{id:other,myRole:'OWNER',status:'ACTIVE'}];session.user={...session.user!,currentProjectId:other};await flushPromises();expect(oldSignal.aborted).toBe(true);finish(typeFact(type,project,'旧项目私有名称'));await flushPromises();expect(wrapper!.text()).not.toContain('旧项目私有名称');expect(mock.directory).not.toHaveBeenCalled();expect(mock.type.mock.calls[1]!.slice(0,2)).toEqual([other,type])
 await router.push(`/devices?deviceTypeId=${secondType}`);await flushPromises();expect(mock.directory).toHaveBeenCalledTimes(1);expect(mock.directory.mock.lastCall!.slice(0,2)).toEqual([other,expect.objectContaining({deviceTypeIds:[secondType]})]);expect(toolbar().props('types').find(row=>row.id===secondType)!.name).toBe('新项目类型')
 session.user={...session.user!,permissions:[]};await flushPromises();expect(wrapper!.findAll('.device-card')).toHaveLength(0);expect(wrapper!.text()).not.toContain('设备(1)');expect(toolbar().props('types')).toEqual([]);expect(toolbar().props('typeId')).toBe('');expect(mock.directory).toHaveBeenCalledTimes(1)
})

it('设备组链接直接查询组范围（默认含子组），清除后才读取所有设备',async()=>{
 const group=id(78)
 await setup(`/devices?groupId=${group}`)
 expect(mock.directory).toHaveBeenCalledTimes(1)
 expect(mock.directory.mock.lastCall![1]).toMatchObject({groupId:group,includeSubgroups:true})
 expect(toolbar().props('view')).toBe('cards')
 await router.push('/devices?groupId=bad');await flushPromises()
 expect(wrapper!.text()).toContain('设备组链接无效')
 expect(mock.directory).toHaveBeenCalledTimes(1)
 await button('清除分组限定').trigger('click');await flushPromises()
 expect(router.currentRoute.value.query.groupId).toBeUndefined()
 expect(mock.directory).toHaveBeenCalledTimes(2)
 expect(mock.directory.mock.lastCall![1].groupId).toBeUndefined()
})

it('侧栏选择组时按原站 include_sub_groups=1 读取组及子组设备',async()=>{
 const group=id(78)
 mock.groups.mockResolvedValue([{id:group,name:'父组',description:null,type:'STATIC',rule:null,createdAt:'2026-01-01T00:00:00Z',parentId:null,color:'#008888',tags:{},sortOrder:0,revision:'0'}])
 await setup('/devices')
 const groupsButton=wrapper!.findAll('button').find(value=>value.text().includes('设备组'))
 if(!groupsButton)throw new Error('缺少设备组按钮')
 expect(groupsButton.classes()).toContain('is-plain')
 await groupsButton.trigger('click');await flushPromises()
 expect(groupsButton.classes()).not.toContain('is-plain')
 await groupsButton.trigger('click');await flushPromises()
 expect(groupsButton.classes()).toContain('is-plain')
 toolbar().vm.$emit('update:keyword','abc')
 await wrapper!.get('.group-name').trigger('click');await flushPromises()
 expect(mock.directory.mock.lastCall![1]).toMatchObject({groupId:group,includeSubgroups:true,keyword:'abc'})
 expect(router.currentRoute.value.query).toMatchObject({groupId:group,includeSubgroups:'1'})
 await wrapper!.findAll('.sidebar-filter')[0]!.trigger('click');await flushPromises()
 expect(mock.directory.mock.lastCall![1]).toMatchObject({keyword:'abc'})
 expect(mock.directory.mock.lastCall![1].groupId).toBeUndefined()
 expect(router.currentRoute.value.query.groupId).toBeUndefined()
 expect(router.currentRoute.value.query.includeSubgroups).toBeUndefined()
})

it('批量关联“管理用户”按终端用户读取权限启用、保留选择并导航到真实目录',async()=>{
 await setup('/devices')
 const device=id(200)
 await wrapper!.find('[aria-label="选择设备 限定设备"] input').setValue(true)
 const batch=wrapper!.getComponent(Batch)
 expect(batch.props('userManagementAvailable')).toBe(true)
 batch.vm.$emit('manage-users');await flushPromises()
 expect(router.currentRoute.value.path).toBe('/end-users')
 expect(sessionStorage.getItem('thingslink:device-batch-return:v1')).toContain(device)
 await router.push('/devices');await flushPromises()
 expect(wrapper!.getComponent(Batch).props('deviceIds')).toEqual([device])
})
