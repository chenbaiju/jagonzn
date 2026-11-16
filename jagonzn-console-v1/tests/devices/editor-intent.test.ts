import {beforeEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceTags from '../../src/features/devices/DeviceTags.vue'
import DeviceLocation from '../../src/features/devices/DeviceLocation.vue'
import {ApiError} from '../../src/core/http'
const state=vi.hoisted(()=>({api:vi.fn(),tags:vi.fn()}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');return {projectId:ref('11111111-1111-4111-8111-111111111111'),currentProject:ref({id:'11111111-1111-4111-8111-111111111111',status:'ACTIVE'}),session:{user:{accountId:'account'}},can:()=>true}})
vi.mock('../../src/core/http',async(importOriginal)=>{const original=await importOriginal<typeof import('../../src/core/http')>();return {...original,api:state.api}})
vi.mock('../../src/features/devices/api',async(importOriginal)=>{const original=await importOriginal<typeof import('../../src/features/devices/api')>();return {...original,devicesApi:{...original.devicesApi,tags:state.tags}}})
function button(w:VueWrapper,text:string){const b=w.findAll('button').find(b=>b.text()===text||b.attributes('aria-label')===text);expect(b).toBeDefined();return b!}
describe('同设备编辑意图边界',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.tags.mockResolvedValue([])})
 it('标签旧保存reject不能进入新开的编辑弹窗',async()=>{
  let reject:(e:unknown)=>void=()=>{};const tagDevice='33333333-3333-4333-8333-333333333333';state.api.mockImplementation(async(_url:string,opts?:{method?:string})=>opts?.method==='put'?new Promise((_resolve,r)=>{reject=r}):new TextEncoder().encode(JSON.stringify({deviceId:tagDevice,revision:'1',tags:[]})))
  const w=mount(DeviceTags,{props:{deviceId:tagDevice},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises()
  await button(w,'编辑标签').trigger('click');await flushPromises();await vi.waitFor(()=>expect(w.findAll('input').length).toBeGreaterThan(1));const inputs=w.findAll('input');await inputs[0].setValue('site');await inputs[1].setValue('east')
  await vi.waitFor(()=>expect(w.findAll('button').some(node=>node.text()==='提交')).toBe(true));await button(w,'提交').trigger('click');expect(state.api.mock.calls.filter(([,opts])=>opts?.method==='put')).toHaveLength(1);const closeButton=w.findAll('button').find(node=>['取消','关闭'].includes(node.text()));expect(closeButton).toBeTruthy();await closeButton!.trigger('click');await button(w,'编辑标签').trigger('click');reject(new ApiError('上次标签失败'));await flushPromises();expect(w.text()).not.toContain('上次标签失败');w.unmount()
 })
 it('坐标旧保存reject不能进入新开的编辑弹窗',async()=>{
  let reject:(e:unknown)=>void=()=>{};state.api.mockImplementation((_p:string,o:any)=>o?.method==='put'?new Promise((_resolve,r)=>{reject=r}):Promise.resolve(new TextEncoder().encode(JSON.stringify({longitude:0,latitude:0,version:'0'}))))
  const w=mount(DeviceLocation,{props:{deviceId:'22222222-2222-4222-8222-222222222222'},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();await button(w,'编辑地理位置').trigger('click');await flushPromises();await button(w,'保存').trigger('click');expect(state.api.mock.calls.filter(([,o])=>o?.method==='put')).toHaveLength(1);await button(w,'关闭').trigger('click');expect(button(w,'编辑地理位置').attributes('disabled')).toBeDefined();reject(new ApiError('上次坐标失败'));await flushPromises();await button(w,'编辑地理位置').trigger('click');await flushPromises();expect(document.body.textContent).not.toContain('上次坐标失败');expect(document.body.textContent).toContain('不会重新提交');expect(state.api.mock.calls.filter(([,o])=>o?.method==='put')).toHaveLength(1);w.unmount()
 })
})
