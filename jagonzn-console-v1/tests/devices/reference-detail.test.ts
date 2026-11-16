import {describe,it,expect,vi,beforeEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {ref} from 'vue'
import ElementPlus from 'element-plus'
import DeviceDetail from '../../src/features/devices/DeviceDetail.vue'
const state=vi.hoisted(()=>({tab:'image',read:vi.fn(),profile:vi.fn()}))
vi.mock('vue-router',()=>({useRoute:()=>({params:{deviceId:'00000000-0000-4000-8000-000000000001'},query:{tab:state.tab}}),useRouter:()=>({push:vi.fn(),replace:vi.fn()})}))
vi.mock('../../src/core/session',()=>({session:{ready:true,transitioning:false,user:{accountId:'00000000-0000-4000-8000-0000000000aa'},projects:[],menus:[]},projectId:ref('project'),currentProject:ref({status:'ACTIVE'}),can:()=>true}))
vi.mock('../../src/features/devices/api',()=>({devicesApi:{read:state.read,profile:state.profile},statusLabel:()=> '未激活'}))
describe('原站详情范围的实际消费者',()=>{
 beforeEach(()=>{state.read.mockResolvedValue({id:'00000000-0000-4000-8000-000000000001',name:'模拟设备'});state.profile.mockResolvedValue({deviceId:'00000000-0000-4000-8000-000000000001',name:'模拟设备',deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId:null,referenceVersion:'0',profileToken:'a'.repeat(64)})})
 function mountDetail(){return mount(DeviceDetail,{global:{plugins:[ElementPlus],stubs:{DeviceOverview:true,DeviceProperties:true,DeviceRecords:true,DeviceLocation:true,DeviceTags:true,DeviceStateControls:true,DeviceCommands:true,DeviceEvents:true,DeviceUserAssociations:true,DeviceTypeAssignment:true,DeviceStaticGroupMemberships:true}}})}
 it('额外图片深链只挂载概览与14个原站tab',async()=>{state.tab='image';const w=mountDetail();await flushPromises();expect(w.findAll('[role=tab]').map(t=>t.text())).toEqual(['概览','连接','信息','属性','事件','命令','规则','任务','自动化','场景','告警','用户','调试','设置']);expect(w.find('device-overview-stub').exists()).toBe(true);expect(w.text()).not.toContain('设备凭据');expect(w.text()).not.toContain('设备图片');w.unmount()})
 it('非法tab深链也回落概览',async()=>{state.tab='invalid';const w=mountDetail();await flushPromises();expect(w.find('device-overview-stub').exists()).toBe(true);w.unmount()})
 it('设置页类型动作接真实独立子组件，完成事件重新读两份当前资料',async()=>{state.tab='settings';const w=mountDetail();await flushPromises();const child=w.findComponent({name:'DeviceTypeAssignment'});expect(child.exists()).toBe(true);expect(child.props('deviceId')).toBe('00000000-0000-4000-8000-000000000001');const before=state.profile.mock.calls.length,reads=state.read.mock.calls.length;child.vm.$emit('changed');await flushPromises();expect(state.profile).toHaveBeenCalledTimes(before+1);expect(state.read).toHaveBeenCalledTimes(reads+1);w.unmount()})

 it('设置页静态归属完成事件只刷新当前设备资料，不伪造组层级',async()=>{state.tab='settings';const w=mountDetail();await flushPromises();const child=w.findComponent({name:'DeviceStaticGroupMemberships'});expect(child.exists()).toBe(true);expect(child.props('deviceId')).toBe('00000000-0000-4000-8000-000000000001');const reads=state.read.mock.calls.length,profiles=state.profile.mock.calls.length;child.vm.$emit('changed');await flushPromises();expect(state.read).toHaveBeenCalledTimes(reads+1);expect(state.profile).toHaveBeenCalledTimes(profiles+1);w.unmount()})

})
