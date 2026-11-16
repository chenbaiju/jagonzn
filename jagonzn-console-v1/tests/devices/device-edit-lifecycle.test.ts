import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceDetail from '../../src/features/devices/DeviceDetail.vue'
import {ApiError} from '../../src/core/http'
const state=vi.hoisted(()=>({route:null as any,profile:vi.fn(),save:vi.fn(),push:vi.fn()}))
const device='00000000-0000-4000-8000-000000000002',project='00000000-0000-4000-8000-000000000001'
vi.mock('vue-router',async()=>{const{reactive}=await import('vue');state.route=reactive({params:{deviceId:'00000000-0000-4000-8000-000000000002'},query:{tab:'overview'}});return{useRoute:()=>state.route,useRouter:()=>({push:state.push,replace:vi.fn()})}})
vi.mock('@/core/session',async()=>{const{ref}=await import('vue');return{session:{ready:true,transitioning:false,user:{accountId:'00000000-0000-4000-8000-0000000000aa'},projects:[],menus:[]},projectId:ref('00000000-0000-4000-8000-000000000001'),currentProject:ref({status:'ACTIVE'}),can:(p:string)=>['device:read','device:update'].includes(p)}})
vi.mock('../../src/features/devices/api',()=>({devicesApi:{read:vi.fn().mockResolvedValue({id:'00000000-0000-4000-8000-000000000002',name:'关闭反例'}),profile:state.profile,changeProfile:state.save}}))
vi.mock('../../src/features/devices/page-alarm-status',()=>({pageAlarmStatus:vi.fn().mockResolvedValue({states:{}}),alarmLabel:()=> '无告警'}))
const profile={deviceId:device,name:'关闭反例',deviceKey:'device-key-01',businessKey:'close-test',description:null,deviceTypeId:null,referenceVersion:'0',profileToken:'a'.repeat(64)}
let wrapper:ReturnType<typeof mount>
beforeEach(()=>{vi.clearAllMocks();state.profile.mockResolvedValue(profile);state.route.params.deviceId=device})
afterEach(()=>{wrapper?.unmount();document.body.innerHTML=''})
describe('设备资料真实对话框即时关闭',()=>{
 it('pending保存后header close立即使意图失效，晚到拒绝不保留错误或重开弹窗',async()=>{
  let reject!:(cause:unknown)=>void;state.save.mockReturnValue(new Promise((_,r)=>{reject=r}))
  wrapper=mount(DeviceDetail,{attachTo:document.body,global:{plugins:[ElementPlus],stubs:{DeviceOverview:true}}});await flushPromises()
  await wrapper.findAll('button').find(b=>b.text()==='编辑')!.trigger('click');await flushPromises()
  await wrapper.findAll('button').find(b=>b.text()==='保存')!.trigger('click');await flushPromises();expect(state.save).toHaveBeenCalledTimes(1)
  await wrapper.get('[aria-label="Close this dialog"]').trigger('click');await flushPromises()
  expect(wrapper.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false)
  reject(new ApiError('旧保存错误不应进入已关闭弹窗'));await flushPromises()
  expect(wrapper.text()).not.toContain('旧保存错误不应进入已关闭弹窗');expect(state.profile).toHaveBeenCalledTimes(2);expect(state.push).not.toHaveBeenCalled()
 })
})
