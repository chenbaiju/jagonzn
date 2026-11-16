import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import ElementPlus,{ElSelect,ElOption} from 'element-plus'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
import DeviceDetail from '../../src/features/devices/DeviceDetail.vue'
import DeviceTags from '../../src/features/devices/DeviceTags.vue'
import DeviceTypeAssignment from '../../src/features/devices/DeviceTypeAssignment.vue'
import DeviceStaticGroupMemberships from '../../src/features/devices/DeviceStaticGroupMemberships.vue'

const transport=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:transport.api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002'
const type='00000000-0000-4000-8000-000000000005',nextType='00000000-0000-4000-8000-000000000007',group='00000000-0000-4000-8000-000000000006'
const base=`/api/v1/projects/${project}/devices/${device}`,settingsPath=`/devices/${device}?tab=settings`
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
let wrapper:ReturnType<typeof mount>|undefined,router:Router,assignedType:string|null=null,joined=false
let tagState={deviceId:device,revision:'7',tags:[{key:'原标签',value:'原标签值'}]},tagWrites=0,typeWrites=0
const unexpected:string[]=[]
function writes(){return transport.api.mock.calls.filter(([,options])=>options?.method&&options.method!=='get')}
function reads(path:string){return transport.api.mock.calls.filter(([p,o])=>p===path&&(!o?.method||o.method==='get'))}
function groupFact(){return {projectId:project,deviceId:device,groupId:group,name:'候选静态组',member:joined}}
function button(label:string){
 const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label||b.getAttribute('aria-label')===label)
 if(!found)throw new Error('找不到按钮：'+label)
 return found
}
async function click(label:string){button(label).click();await flushPromises()}
async function setup(){
 router=createRouter({history:createMemoryHistory(),routes:[{path:'/devices/:deviceId',component:DeviceDetail},{path:'/away',component:{template:'<p>其它页面</p>'}}]})
 await router.push(settingsPath);await router.isReady()
 wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await flushPromises()
 expect(wrapper.getComponent(DeviceTags).text()).toContain('原标签值')
}
async function leaveAndReturn(){
 await router.push('/away');await flushPromises();expect(router.currentRoute.value.path).toBe('/away')
 expect(wrapper!.findComponent(DeviceDetail).exists()).toBe(false)
 await router.push(settingsPath);await flushPromises();expect(router.currentRoute.value.fullPath).toBe(settingsPath)
}
async function chooseType(value:string){wrapper!.getComponent(DeviceTypeAssignment).getComponent(ElSelect).vm.$emit('update:modelValue',value);await flushPromises()}
beforeEach(()=>{
 transport.api.mockReset();unexpected.length=0;assignedType=null;joined=false;tagWrites=0;typeWrites=0
 tagState={deviceId:device,revision:'7',tags:[{key:'原标签',value:'原标签值'}]}
 changeIdentity();session.ready=true;session.transitioning=false
 session.user={accountId:'00000000-0000-4000-8000-000000000003',currentProjectId:project,permissions:['device:read','device:update']} as never
 session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('测试禁止真实网络')}))
 transport.api.mockImplementation(async(path:string,options:Record<string,any>={})=>{
  const method=options.method||'get'
  // 未知响应后当前事实已变化只是受控夹具设定，不证明真实超时请求的事务终态。
  if(method==='put'&&path===`${base}/tag-set`){
   expect(options.body.expectedRevision).toBe(tagState.revision)
   tagState={deviceId:device,revision:String(Number(tagState.revision)+1),tags:options.body.tags.map((row:{key:string;value:string})=>({...row}))}
   if(++tagWrites===1)throw new ApiError('受控保存结果未知',0,undefined,undefined,true)
   return bytes(tagState)
  }
  if(method==='put'&&path===`${base}/type-assignment`){
   expect(options.body.expectedDeviceTypeId).toBe(assignedType);assignedType=options.body.deviceTypeId
   if(++typeWrites===1)throw new ApiError('受控保存结果未知',0,undefined,undefined,true)
   return bytes({deviceId:device,deviceTypeId:assignedType})
  }
  if(method==='put'&&path===`${base}/static-groups/${group}`){joined=true;throw new ApiError('受控保存结果未知',0,undefined,undefined,true)}
  if(method==='get'){
   // 设置页会只读加载接入适配状态；本夹具未登记适配，按真实404显式处理。
   if(path===`${base}/type-association/adaptation`)throw new ApiError('未登记',404)
   if(path===base)return {id:device,name:'导航验收设备',status:'OFFLINE',deviceTypeId:assignedType}
   if(path===`${base}/reference-profile`)return {deviceId:device,name:'导航验收设备',deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId:assignedType,referenceVersion:'0',profileToken:'a'.repeat(64)}
   if(path===`${base}/logical-presence`)return {deviceId:device,mode:'LEGACY_TRANSPORT',state:'OFFLINE',transportStatus:'OFFLINE',onlineTimeoutMinutes:null,observedAt:'2026-10-26T00:00:00Z',lastQualifiedCommunicationAt:null}
   if(path===`${base}/access-config`)return {protocol:'MQTT',enabled:false,configVersion:'1',credentialVersion:'0',configured:true,allowedProtocols:['MQTT'],canManage:true}
   if(path===`${base}/tag-set`)return bytes(tagState)
   if(path===`${base}/static-groups`)return bytes({projectId:project,deviceId:device,membersOnly:options.query.membersOnly,items:options.query.membersOnly&&!joined?[]:[groupFact()],hasMore:false,nextAfterGroupId:null})
   if(path===`${base}/static-groups/${group}`)return bytes(groupFact())
   if(path===`/api/v1/projects/${project}/device-types/search`)return {items:[{id:type,name:'当前新类型'},{id:nextType,name:'再次选择类型'}],hasMore:false,nextCursor:null}
   if(path===`/api/v1/projects/${project}/device-types/${type}`)return {id:type,name:'当前新类型'}
   if(path===`/api/v1/projects/${project}/device-types/${nextType}`)return {id:nextType,name:'再次选择类型'}
   if(path===`/api/v1/projects/${project}/alarms/device-status`)return {observedAt:'2026-10-26T00:00:00Z',devices:[{deviceId:device,modelVersionId:'00000000-0000-4000-8000-000000000004',state:'NORMAL'}]}
  }
  unexpected.push(`${method} ${path}`);throw new Error('未声明的测试请求：'+method+' '+path)
 })
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.unstubAllGlobals();expect(unexpected).toEqual([])})

it('标签UNKNOWN可离开，返程fresh revision先于主动编辑，新提交使用新CAS且不自动重写',async()=>{
 await setup();await click('编辑标签');await wrapper!.getComponent(DeviceTags).get('[aria-label="标签值1"]').setValue('第一次修改')
 await click('提交');expect(writes()).toHaveLength(1);expect(writes()[0]![1].body.expectedRevision).toBe('7')
 expect(document.body.textContent).toContain('保存结果尚未确认');await click('关闭')
 const initialReads=reads(`${base}/tag-set`).length
 await leaveAndReturn();expect(reads(`${base}/tag-set`).length).toBeGreaterThan(initialReads)
 expect(wrapper!.getComponent(DeviceTags).text()).toContain('第一次修改');expect(writes()).toHaveLength(1)
 const returnedReads=reads(`${base}/tag-set`).length
 await click('编辑标签');expect(reads(`${base}/tag-set`)).toHaveLength(returnedReads+1);expect(writes()).toHaveLength(1)
 await wrapper!.getComponent(DeviceTags).get('[aria-label="标签值1"]').setValue('明确再次修改');expect(writes()).toHaveLength(1)
 await click('提交');expect(writes()).toHaveLength(2)
 expect(writes()[1]![1].body).toEqual({expectedRevision:'8',tags:[{key:'原标签',value:'明确再次修改'}]})
 expect(writes().every(([,options])=>!options.headers?.['Idempotency-Key'])).toBe(true)
})
it('类型UNKNOWN可离开，返程当前类型变化后仅主动新选择产生新前提和新键',async()=>{
 await setup();await click('修改设备类型');await chooseType(type);await click('确 定')
 expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({deviceTypeId:type,expectedDeviceTypeId:null})
 expect(document.body.textContent).toContain('保存结果尚未确认');await click('关闭')
 const initialReads=reads(`${base}/reference-profile`).length
 await leaveAndReturn();expect(reads(`${base}/reference-profile`).length).toBeGreaterThan(initialReads)
 expect(wrapper!.get('.device-meta').text()).toContain('当前新类型');expect(writes()).toHaveLength(1)
 const returnedReads=reads(`${base}/reference-profile`).length
 await click('修改设备类型');expect(reads(`${base}/reference-profile`)).toHaveLength(returnedReads+1)
 expect(wrapper!.getComponent(DeviceTypeAssignment).getComponent(ElSelect).props('modelValue')).toBe(type)
 await chooseType(nextType);expect(writes()).toHaveLength(1);await click('确 定');expect(writes()).toHaveLength(2)
 expect(writes()[1]![1].body).toEqual({deviceTypeId:nextType,expectedDeviceTypeId:type})
 const keys=writes().map(([,options])=>options.headers['Idempotency-Key'])
 expect(keys.every(key=>typeof key==='string'&&/^[0-9a-f-]{36}$/.test(key))).toBe(true);expect(keys[1]).not.toBe(keys[0])
})
it('静态组UNKNOWN可离开，返程fresh成员事实禁选已有组且始终只有原一次PUT',async()=>{
 await setup();await click('加入设备组');wrapper!.getComponent(DeviceStaticGroupMemberships).getComponent(ElSelect).vm.$emit('update:modelValue',group);await flushPromises();await click('确 定')
 expect(writes()).toHaveLength(1);expect(writes()[0]![0]).toBe(`${base}/static-groups/${group}`)
 expect(document.body.textContent).toContain('保存结果尚未确认');await click('关闭')
 const initialReads=reads(`${base}/static-groups`).length
 await leaveAndReturn();expect(reads(`${base}/static-groups`).length).toBeGreaterThan(initialReads)
 expect(wrapper!.getComponent(DeviceStaticGroupMemberships).get('.el-table').text()).toContain('候选静态组');expect(writes()).toHaveLength(1)
 await click('加入设备组');const option=wrapper!.getComponent(DeviceStaticGroupMemberships).findAllComponents(ElOption).find(o=>o.props('value')===group)
 expect(option).toBeDefined();expect(option!.props('disabled')).toBe(true);expect(button('确 定').disabled).toBe(true);expect(writes()).toHaveLength(1)
 expect(writes()[0]![1]).not.toHaveProperty('body')
})
it('真实设置标签普通未提交草稿可跨页且零写',async()=>{
 await setup();await click('编辑标签');await wrapper!.getComponent(DeviceTags).get('[aria-label="标签值1"]').setValue('仅草稿不保存')
 await router.push('/away');await flushPromises();expect(router.currentRoute.value.path).toBe('/away')
 expect(wrapper!.findComponent(DeviceTags).exists()).toBe(false);expect(writes()).toHaveLength(0)
})
