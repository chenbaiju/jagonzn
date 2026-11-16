import {describe,it,expect,vi,beforeEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {ref} from 'vue'
import DeviceCredentials from '../../src/features/devices/DeviceCredentials.vue'
import {changeIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({generate:vi.fn(),credentials:vi.fn(),revoke:vi.fn()}))
vi.mock('../../src/core/session',()=>({projectId:ref('project'),can:()=>true}))
vi.mock('../../src/features/devices/api',()=>({devicesApi:{credentials:state.credentials,generateCredential:state.generate,revokeCredential:state.revoke}}))
describe('一次凭据的设备与身份范围',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.credentials.mockResolvedValue([])})
 async function generate(w:ReturnType<typeof mount>){await w.find('input[type=checkbox]').setValue(true);await w.findAll('button').find(b=>b.text()==='生成凭据')!.trigger('click');await flushPromises()}
 it('身份切换清除已显示的一次秘密',async()=>{state.generate.mockResolvedValue({plainSecret:'controlled-fixture-secret'});const w=mount(DeviceCredentials,{props:{deviceId:'a'},global:{plugins:[ElementPlus]}});await flushPromises();await generate(w);expect(w.find('input[type=password]').exists()).toBe(true);changeIdentity();await flushPromises();expect(w.find('input[type=password]').exists()).toBe(false);w.unmount()})
 it('同项目切设备后不显示旧设备晚到的秘密',async()=>{let resolve:(value:unknown)=>void=()=>{};state.generate.mockReturnValue(new Promise(r=>resolve=r));const w=mount(DeviceCredentials,{props:{deviceId:'a'},global:{plugins:[ElementPlus]}});await flushPromises();await w.find('input[type=checkbox]').setValue(true);await w.findAll('button').find(b=>b.text()==='生成凭据')!.trigger('click');await w.setProps({deviceId:'b'});resolve({plainSecret:'controlled-fixture-secret'});await flushPromises();expect(w.find('input[type=password]').exists()).toBe(false);w.unmount()})
})
