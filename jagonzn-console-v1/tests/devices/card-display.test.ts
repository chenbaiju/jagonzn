import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {defineComponent} from 'vue'
import {createRouter,createMemoryHistory,RouterView,type Router} from 'vue-router'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceList from '../../src/features/devices/DeviceList.vue'
import DeviceCatalogToolbar from '../../src/features/devices/DeviceCatalogToolbar.vue'

const state=vi.hoisted(()=>({directory:vi.fn(),types:[] as {id:string;name:string;deviceKind?:string}[]}))
vi.mock('../../src/core/session',async()=>{const{ref}=await import('vue');return{session:{ready:true,transitioning:false,user:null},currentProject:ref(undefined),projectId:ref('project-a'),can:()=>true}})
vi.mock('../../src/features/devices/api',async original=>{const source=await original<typeof import('../../src/features/devices/api')>();return{...source,devicesApi:{...source.devicesApi,directory:state.directory}}})
vi.mock('../../src/features/devices/use-options',async()=>{const{ref}=await import('vue');return{useDeviceOptions:()=>({groups:{data:ref([{id:'unrelated',name:'不得拼入卡片的全局组'}]),error:ref(),loading:ref(false),reload:vi.fn()},types:{data:ref({hasMore:false}),error:ref(),loading:ref(false),reload:vi.fn()},allTypes:ref(state.types),moreTypes:vi.fn()})}})
const Batch=defineComponent({name:'DeviceBatchActions',props:['deviceIds','selectedGroupId','disabled'],template:'<output>{{deviceIds.join(",")}}</output>'})
function id(n:number){return`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`}
function page(withProjection=true){const items=[{id:id(1),name:'设备甲',status:'ONLINE',deviceTypeId:id(9)},{id:id(2),name:'设备乙',status:'OFFLINE',deviceTypeId:id(9)}];return{items,total:'2',page:1,limit:24,alarmObservations:items.map(d=>({deviceId:d.id,modelVersionId:id(99),observedAt:'2026-10-25T00:00:00Z',state:'NORMAL',highestSeverity:null})),referenceIdentities:items.map(d=>({deviceId:d.id,businessKey:d.name,version:'0',updatedAt:'2026-10-25T00:00:00Z'})),...(withProjection?{displayFacts:items.map((d,i)=>({deviceId:d.id,deviceTypeId:id(9),deviceTypeName:i===0?'当前投影类型':null,staticGroups:i===0?[{id:id(20),name:'监测组',color:undefined as string|null|undefined,ancestors:['园区','A区'] as string[]|undefined},{id:id(21),name:'同名不同身份',color:undefined as string|null|undefined}]:[],lastDataReportAt:null,enabled:true}))}:{})}}
let wrapper:ReturnType<typeof mount>,router:Router
async function setup(data=page()){state.directory.mockResolvedValue(data);router=createRouter({history:createMemoryHistory(),routes:[{path:'/devices',component:DeviceList},{path:'/devices/:deviceId',component:{template:'<p>设备详情</p>'}},{path:'/device-groups/:groupId',name:'device-groups',component:{template:'<p>设备组</p>'}}]});await router.push('/devices');await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus],stubs:{DeviceBatchActions:Batch}}});await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();state.types=[{id:id(9),name:'旧选项名称'}]})
afterEach(()=>{wrapper?.unmount();document.body.innerHTML=''})
it('卡片只显示目录同快照的静态组，类型保留在表格和详情而不进入原站卡片',async()=>{await setup();const cards=wrapper.findAll('.device-card');expect(cards[0]!.text()).not.toContain('当前投影类型');expect(cards[0]!.findAll('.card-groups span').map(t=>t.text())).toEqual(['园区/A区/监测组','同名不同身份']);expect(cards[0]!.find('.card-groups span').attributes('title')).toBe('园区/A区/监测组');expect(cards[1]!.find('.card-groups').exists()).toBe(false);expect(cards[1]!.find('.card-main p').exists()).toBe(false);expect(wrapper.text()).not.toContain('旧选项名称');expect(cards[0]!.text()).not.toContain('不得拼入卡片的全局组');expect(wrapper.text()).not.toContain('设备类型不可用')})
it('旧投影缺父链时卡片只显示组名，不借全局组补层级',async()=>{const data=page();data.displayFacts![0]!.staticGroups=[{id:id(20),name:'监测组',color:null}];await setup(data);const tags=wrapper.findAll('.card-groups span');expect(tags.map(t=>t.text())).toEqual(['监测组']);expect(tags[0]!.attributes('title')).toBe('监测组')})
it('卡片使用同快照组颜色，刷新后更新，旧投影保持默认',async()=>{
 const data=page();data.displayFacts![0]!.staticGroups=[{id:id(20),name:'监测组',color:'#ff1493'},{id:id(21),name:'默认组',color:null}]
 await setup(data)
 let tags=wrapper.findAll('.card-groups span');expect((tags[0]!.element as HTMLElement).style.color).toBe('rgb(255, 20, 147)');expect((tags[0]!.element as HTMLElement).style.borderColor).toBe('rgb(255, 20, 147)');expect((tags[0]!.element as HTMLElement).style.backgroundColor).toBe('transparent');expect((tags[1]!.element as HTMLElement).style.color).toBe('');expect((tags[1]!.element as HTMLElement).style.backgroundColor).toBe('')
 const next=page();next.displayFacts![0]!.staticGroups=[{id:id(20),name:'监测组',color:'#00aa55'}];state.directory.mockResolvedValue(next)
 await wrapper.findAll('button').find(b=>b.text()==='刷新')!.trigger('click');await flushPromises();tags=wrapper.findAll('.card-groups span');expect((tags[0]!.element as HTMLElement).style.color).toBe('rgb(0, 170, 85)')
})
it('旧运行时缺展示投影时不借类型选项伪造卡片事实',async()=>{await setup(page(false));expect(wrapper.findAll('.card-groups')).toHaveLength(0);expect(wrapper.findAll('.card-main p')).toHaveLength(0);expect(wrapper.text()).not.toContain('旧选项名称');expect(wrapper.findAll('.device-card')).toHaveLength(2)})
it('未选择时点击普通分组标签沿卡片进入当前设备，不新增筛选查询',async()=>{await setup();await wrapper.get('.card-groups span').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/devices/'+id(1));expect(state.directory).toHaveBeenCalledTimes(1)})
it('选择模式的分组标签点击仅切换该卡片一次',async()=>{await setup();const cards=wrapper.findAll('.device-card');await cards[1]!.get('input[type="checkbox"]').setValue(true);await cards[0]!.get('.card-groups span').trigger('click');await flushPromises();expect(wrapper.getComponent(Batch).props('deviceIds')).toEqual([id(2),id(1)]);expect(router.currentRoute.value.path).toBe('/devices');expect(state.directory).toHaveBeenCalledTimes(1)})
it('表格分组也使用普通事实标签，刷新后不保留旧组名',async()=>{await setup();wrapper.getComponent(DeviceCatalogToolbar).vm.$emit('update:view','table');await flushPromises();const tags=wrapper.findAll('.group-tags .directory-tag');expect(tags.map(t=>t.element.tagName)).toEqual(['SPAN','SPAN']);expect(tags.map(t=>t.text())).toEqual(['监测组','同名不同身份']);const next=page();next.displayFacts![0]!.staticGroups=[{id:id(22),name:'刷新后的当前组',color:undefined}];state.directory.mockResolvedValue(next);await wrapper.findAll('button').find(b=>b.text()==='刷新')!.trigger('click');await flushPromises();expect(wrapper.text()).toContain('刷新后的当前组');expect(wrapper.text()).not.toContain('同名不同身份')})

for(const options of ['empty','contradictory'] as const){
 for(const view of ['cards','table'] as const){
  it(`${options}类型选项不改变${view}同快照网关与子设备标记`,async()=>{
   state.types=options==='empty'?[]:[{id:id(9),name:'旧选项名称',deviceKind:'DIRECT'}]
   const data=page();data.displayFacts=data.displayFacts!.map((fact,index)=>({...fact,deviceKind:index===0?'GATEWAY':'SUB_DEVICE'}))
   await setup(data)
   if(view==='table'){wrapper.getComponent(DeviceCatalogToolbar).vm.$emit('update:view','table');await flushPromises()}
   const scope=wrapper.get(view==='cards'?'.device-grid':'.device-directory-table')
   expect(scope.findAll('[title="网关"]')).toHaveLength(1)
   expect(scope.findAll('[title="网关子设备"]')).toHaveLength(1)
   expect(scope.get('[title="网关"]').attributes('aria-label')).toBe('网关')
   expect(scope.get('[title="网关子设备"]').attributes('aria-label')).toBe('网关子设备')
   expect(state.directory).toHaveBeenCalledTimes(1)
  })
 }
}
it('直连和未知种类不显示标记，矛盾的类型选项不能成为回退',async()=>{
 state.types=[{id:id(9),name:'旧选项名称',deviceKind:'GATEWAY'}]
 const data=page();data.displayFacts=data.displayFacts!.map((fact,index)=>({...fact,deviceKind:index===0?'DIRECT':null}))
 await setup(data)
 expect(wrapper.findAll('.device-grid [title="网关"],.device-grid [title="网关子设备"]')).toHaveLength(0)
 wrapper.getComponent(DeviceCatalogToolbar).vm.$emit('update:view','table');await flushPromises()
 expect(wrapper.findAll('.device-directory-table [title="网关"],.device-directory-table [title="网关子设备"]')).toHaveLength(0)
 expect(state.directory).toHaveBeenCalledTimes(1)
})
it('旧投影缺少种类时卡片和表格不从当前类型首页猜种类',async()=>{
 state.types=[{id:id(9),name:'旧选项名称',deviceKind:'GATEWAY'}]
 await setup()
 expect(wrapper.findAll('.device-grid [title="网关"],.device-grid [title="网关子设备"]')).toHaveLength(0)
 wrapper.getComponent(DeviceCatalogToolbar).vm.$emit('update:view','table');await flushPromises()
 expect(wrapper.findAll('.device-directory-table [title="网关"],.device-directory-table [title="网关子设备"]')).toHaveLength(0)
 expect(state.directory).toHaveBeenCalledTimes(1)
})
