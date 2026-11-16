import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceProperties from '../../src/features/devices/DeviceProperties.vue'
import AsyncState from '../../src/ui/AsyncState.vue'
import {ApiError,invalidateIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({profile:vi.fn(),binding:vi.fn(),api:vi.fn()}))
vi.mock('../../src/core/session',async()=>{const{ref}=await import('vue');return{projectId:ref('project'),can:()=>false}})
vi.mock('../../src/features/devices/api',()=>({devicesApi:{profile:state.profile,binding:state.binding},devicePath:(project:string,device:string)=>`/api/v1/projects/${project}/devices/${device}`}))
vi.mock('../../src/core/http',async()=>{const original=await vi.importActual('../../src/core/http');return{...original,api:state.api}})
const device='00000000-0000-4000-8000-000000000001',version='00000000-0000-4000-8000-000000000002',type='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004'
const neutral='设备物模型绑定暂不可读取，请刷新核对。'
const wrappers:VueWrapper[]=[]
function profile(id=device,deviceTypeId:string|null=type){return{deviceId:id,name:'测试设备',deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId,referenceVersion:'0',profileToken:'a'.repeat(64)}}
function render(presentation:'table'|'cards'='table'){
 const w=mount(DeviceProperties,{props:{deviceId:device,presentation},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{PropertyHistoryRemovalAction:true,PropertyHistory:true,PropertyCurve:true}}});wrappers.push(w);return w
}
function button(w:VueWrapper,text:string){const value=w.findAll('button').find(b=>b.text()===text);expect(value).toBeDefined();return value!}
function expectFailure(w:VueWrapper,message:string){
 expect(w.get('[role="alert"]').text()).toContain(message)
 expect(w.text()).not.toContain('尚未绑定')
 expect(w.findAll('.el-table__row,.property-cards article')).toHaveLength(0)
 expect(state.api).not.toHaveBeenCalled()
}
describe('当前属性绑定读取错误的真实组件呈现',()=>{
 beforeEach(()=>{vi.resetAllMocks();state.profile.mockResolvedValue(profile());state.binding.mockResolvedValue({deviceId:device,deviceTypeId:type,version:{id:version,schemaDigest:'digest'}})})
 afterEach(()=>{for(const w of wrappers.splice(0))w.unmount()})
 it.each(['table','cards'] as const)('typed资料成功后%s的binding40430020使用中性错误并保留资格',async presentation=>{
  const original=new ApiError('设备不存在',404,30020,'trace-binding',false)
  state.binding.mockRejectedValue(original)
  const w=render(presentation);await flushPromises()
  expectFailure(w,neutral);expect(w.text()).not.toContain('设备不存在')
  const displayed=w.findComponent(AsyncState).props('error')
  expect(displayed).toBeInstanceOf(ApiError)
  expect(displayed).toMatchObject({status:404,code:30020,traceId:'trace-binding',outcomeUnknown:false})
  expect(original.message).toBe('设备不存在')
  expect(state.profile).toHaveBeenCalledTimes(1);expect(state.binding).toHaveBeenCalledTimes(1)
  if(presentation==='table'){
   expect(button(w,'查看属性 JSON').attributes('disabled')).toBeDefined()
   for(const action of w.findAllComponents({name:'PlatformPropertyAction'}))expect(action.props('disabled')).toBe(true)
   expect(w.findComponent({name:'CurrentPropertyRemovalAction'}).props('disabled')).toBe(true)
  }
 })
 it('资料40430020仍显示原错误且不调用绑定',async()=>{
  const error=new ApiError('设备不存在',404,30020);state.profile.mockRejectedValue(error)
  const w=render();await flushPromises();expectFailure(w,'设备不存在');expect(w.text()).not.toContain(neutral)
  expect(w.findComponent(AsyncState).props('error')).toBe(error);expect(state.binding).not.toHaveBeenCalled()
 })
 it.each([
  ['另一404',()=>new ApiError('另一绑定404',404,30021)],
  ['无code404',()=>new ApiError('无code绑定404',404)],
  ['403',()=>new ApiError('绑定读取无权限',403,30020)],
  ['500',()=>new ApiError('绑定读取内部错误',500,30020)],
  ['未知结果',()=>new ApiError('绑定结果未知',404,30020,'trace-unknown',true)],
  ['普通异常',()=>Object.assign(new Error('普通绑定错误'),{status:404,code:30020})],
 ] as const)('%s不泛化重写',async(_label,factory)=>{
  const error=factory();state.binding.mockRejectedValue(error);const w=render();await flushPromises()
  expectFailure(w,error.message);expect(w.text()).not.toContain(neutral);expect(w.findComponent(AsyncState).props('error')).toBe(error)
 })
 it('真实type-null资料仍走既有未绑定状态且不请求绑定',async()=>{
  state.profile.mockResolvedValue(profile(device,null));const w=render();await flushPromises()
  expect(w.text()).toContain('设备尚未绑定设备类型，模型属性暂不可读取。');expect(w.find('[role="alert"]').exists()).toBe(false)
  expect(state.binding).not.toHaveBeenCalled();expect(state.api).not.toHaveBeenCalled();expect(button(w,'查看属性 JSON').attributes('disabled')).toBeDefined()
 })
 it('设备切换后旧绑定404不能污染新设备状态',async()=>{
  let reject!:(error:unknown)=>void;state.binding.mockReturnValue(new Promise((_resolve,no)=>{reject=no}))
  const w=render();await flushPromises();expect(state.binding).toHaveBeenCalledTimes(1)
  state.profile.mockResolvedValue(profile(other,null));await w.setProps({deviceId:other});await flushPromises()
  reject(new ApiError('设备不存在',404,30020));await flushPromises()
  expect(w.text()).toContain('设备尚未绑定设备类型');expect(w.text()).not.toContain(neutral);expect(w.find('[role="alert"]').exists()).toBe(false);expect(state.api).not.toHaveBeenCalled()
 })
 it('身份撤销后迟到绑定404不显示旧错误',async()=>{
  let reject!:(error:unknown)=>void;state.binding.mockReturnValue(new Promise((_resolve,no)=>{reject=no}))
  const w=render();await flushPromises();invalidateIdentity();reject(new ApiError('设备不存在',404,30020));await flushPromises()
  expect(w.find('[role="alert"]').exists()).toBe(false);expect(w.text()).not.toContain(neutral);expect(state.api).not.toHaveBeenCalled()
 })
 it('明确重新读取成功后恢复模型可读状态，不把错误留作空结果',async()=>{
  state.binding.mockRejectedValueOnce(new ApiError('设备不存在',404,30020))
  const w=render();await flushPromises();expectFailure(w,neutral)
  state.api.mockResolvedValue({version:{id:version,schemaDigest:'digest'},modelSnapshot:{properties:{}}})
  await button(w,'重新读取').trigger('click');await flushPromises()
  expect(w.find('[role="alert"]').exists()).toBe(false);expect(w.text()).not.toContain(neutral)
  expect(state.profile).toHaveBeenCalledTimes(2);expect(state.binding).toHaveBeenCalledTimes(2);expect(state.api).toHaveBeenCalledTimes(1)
  expect(button(w,'查看属性 JSON').attributes('disabled')).toBeUndefined()
 })
})
