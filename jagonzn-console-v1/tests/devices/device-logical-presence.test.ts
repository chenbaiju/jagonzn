import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Component from '../../src/features/devices/DeviceLogicalPresence.vue'
import {decodeLogicalPresence} from '../../src/features/devices/device-logical-presence-api'
import {changeIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({api:vi.fn(),project:null as any,read:null as any}))
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('00000000-0000-4000-8000-000000000001');state.read=ref(true);return{projectId:state.project,session:{user:{accountId:'actor'}},can:()=>state.read.value}})
const device='00000000-0000-4000-8000-000000000002',fact={deviceId:device,mode:'QUALIFIED_COMMUNICATION',state:'UNKNOWN',transportStatus:'ONLINE',onlineTimeoutMinutes:10,observedAt:'2026-10-29T00:00:00Z',lastQualifiedCommunicationAt:null};let wrapper:ReturnType<typeof mount>|undefined
beforeEach(()=>{vi.clearAllMocks();changeIdentity();state.read.value=true;state.api.mockResolvedValue({...fact})});afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML=''})
it('逻辑未知保留原接入在线含义，只刷新当前观察，不以未知当离线',async()=>{
 wrapper=mount(Component,{global:{plugins:[ElementPlus]}} as never);await wrapper.setProps({deviceId:device});await flushPromises();expect(wrapper.text()).toContain('逻辑在线：未知');expect(wrapper.text()).toContain('接入状态 在线');expect(wrapper.text()).toContain('当前观察不足，不能确认离线');expect(wrapper.text()).not.toContain('逻辑在线：离线');state.api.mockResolvedValue({...fact,state:'OFFLINE'});await wrapper.get('button').trigger('click');await flushPromises();expect(wrapper.text()).toContain('逻辑在线：离线');expect(wrapper.text()).toContain('接入状态 在线');expect(state.api.mock.calls.every(([,o])=>!o?.method)).toBe(true);expect(()=>decodeLogicalPresence({...fact,mode:'LEGACY_TRANSPORT'},device)).toThrow();state.read.value=false;await flushPromises();expect(wrapper.text()).not.toContain('接入状态 在线')
})
