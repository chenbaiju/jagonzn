import {describe,it,expect,vi,beforeEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceProperties from '../../src/features/devices/DeviceProperties.vue'
const state=vi.hoisted(()=>({api:vi.fn(),control:true}))
vi.mock('../../src/core/session',async()=>{const{ref}=await import('vue');return{projectId:ref('project'),can:()=>state.control}})
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
vi.mock('../../src/features/devices/api',()=>({devicesApi:{profile:async()=>({deviceId:'00000000-0000-4000-8000-000000000001',name:'测试设备',deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId:'00000000-0000-4000-8000-000000000003',referenceVersion:'0',profileToken:'a'.repeat(64)}),binding:async()=>({deviceId:'00000000-0000-4000-8000-000000000001',deviceTypeId:'00000000-0000-4000-8000-000000000003',version:{id:'model',schemaDigest:'digest'}})},devicePath:(p:string,d:string)=>`/api/v1/projects/${p}/devices/${d}`}))
const Removal={name:'CurrentPropertyRemovalAction',props:['deviceId','modelVersionId','keys','disabled'],template:'<span />'}
function render(){return mount(DeviceProperties,{props:{deviceId:'00000000-0000-4000-8000-000000000001'},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{PropertyHistoryRemovalAction:true,CurrentPropertyRemovalAction:Removal,PlatformPropertyAction:true,PropertyCurve:true,PropertyHistory:true}}})}
describe('当前表真实批量选择与移除上下文',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.control=true;state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve({version:{id:'model',schemaDigest:'digest'},modelSnapshot:{properties:{n:{name:'温度',dataType:'NUMBER',accessType:'REPORT'},other:{name:'另一属性',dataType:'NUMBER',accessType:'REPORT'}}}}):Promise.resolve(new TextEncoder().encode(JSON.stringify({projectId:'project',deviceId:'00000000-0000-4000-8000-000000000001',modelVersionId:'model',values:['n','other'].map(propertyKey=>({propertyKey,state:'VALUE',sourceKind:'DEVICE_REPORT',value:1,modelVersionId:'model',occurredAt:'2026-10-24T00:00:00Z',updatedAt:null,operationId:null,reportedRevision:'1'}))}))))})
 it('移除busy向父聚合，旧scope回调不能锁解新的删除上下文',async()=>{
  const w=render();await flushPromises();const old=w.findComponent(Removal).vm.$.vnode.props!.onBusy as(value:boolean)=>void;old(true);await flushPromises();expect(w.emitted('busy')?.at(-1)).toEqual([true]);await w.setProps({deviceId:'00000000-0000-4000-8000-000000000009'});await flushPromises();old(true);expect(w.emitted('busy')?.at(-1)).toEqual([false]);const current=w.findComponent(Removal).vm.$.vnode.props!.onBusy as(value:boolean)=>void;current(true);old(false);await flushPromises();expect(w.emitted('busy')?.at(-1)).toEqual([true]);w.unmount()
 })
 it('表头全选交付完整两键，刷新清空选择而非保留旧删除范围',async()=>{
  const w=render();await flushPromises();expect(w.findAll('.el-table__row')).toHaveLength(2);await w.find('thead input[type="checkbox"]').setValue(true);await vi.waitFor(()=>expect(w.findComponent(Removal).props('keys')).toEqual(['n','other']));await w.findAll('button').find(b=>b.text()==='刷新')!.trigger('click');await flushPromises();expect(w.findComponent(Removal).props('keys')).toEqual([]);w.unmount()
 })
 it('只读表没有选择列，不能构造批量写入口',async()=>{state.control=false;const w=render();await flushPromises();expect(w.findAll('input[type="checkbox"]')).toHaveLength(0);expect(w.findComponent(Removal).props('keys')).toEqual([]);w.unmount()})
})
