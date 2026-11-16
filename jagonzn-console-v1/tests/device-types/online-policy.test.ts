import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Policy from '../../src/features/device-types/DeviceTypeOnlinePolicy.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
import {decodeOnlinePolicy} from '../../src/features/device-types/online-policy-api'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(1),type=id(2),other=id(3)
const wrappers:VueWrapper[]=[];let fact={deviceTypeId:type,onlineTimeoutMinutes:null as number|null,revision:'0'}
function owner(){session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]}
async function render(){const wrapper=mount(Policy,{props:{typeId:type},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises();return wrapper}
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.trim()===label);expect(found,label).toBeDefined();return found!}
async function click(label:string){button(label).click();await flushPromises()}
const writes=()=>state.api.mock.calls.filter(([,options])=>options?.method==='put')
async function enable(){await click('设置在线超时');(document.querySelector('[role="switch"]') as HTMLElement).click();await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;owner();fact={deviceTypeId:type,onlineTimeoutMinutes:null as number|null,revision:'0'};state.api.mockImplementation((_path,options)=>{if(options?.method==='put')fact={deviceTypeId:type,onlineTimeoutMinutes:options.body.onlineTimeoutMinutes,revision:String(BigInt(fact.revision)+(fact.onlineTimeoutMinutes===options.body.onlineTimeoutMinutes?0n:1n))};return Promise.resolve({...fact})})})
afterEach(()=>{wrappers.splice(0).forEach(x=>x.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})
it('NULL沿用接入态且取消零写，整数阈值和恢复NULL各一次CAS提交',async()=>{
 const wrapper=await render();expect(wrapper.text()).toContain('沿用原接入状态');await enable();await click('取消');expect(writes()).toHaveLength(0);await enable();await click('保存在线超时');expect(writes()).toHaveLength(0);expect(document.body.textContent).toContain('在线超时须为1至5000分钟');wrapper.findComponent({name:'ElInputNumber'}).vm.$emit('update:modelValue',10);await flushPromises();await click('保存在线超时');expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({revision:'0',onlineTimeoutMinutes:10});expect(wrapper.text()).toContain('10 分钟');await click('设置在线超时');(document.querySelector('[role="switch"]') as HTMLElement).click();await flushPromises();await click('保存在线超时');expect(writes()).toHaveLength(2);expect(writes()[1]![1].body).toEqual({revision:'1',onlineTimeoutMinutes:null});expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(()=>decodeOnlinePolicy({...fact,onlineTimeoutMinutes:'10'},type)).toThrow()
})
it('未知在线策略保留原意图，同值会话或归档只读核对不重PUT',async()=>{
 const wrapper=await render();state.api.mockImplementation((_path,options)=>options?.method==='put'?Promise.reject(new ApiError('网络结果未知',0,undefined,undefined,true)):Promise.resolve({...fact}));await enable();wrapper.findComponent({name:'ElInputNumber'}).vm.$emit('update:modelValue',10);await flushPromises();await click('保存在线超时');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);session.user={...session.user!};session.projects=[{id:project,myRole:'OWNER',status:'ARCHIVED'}];await wrapper.setProps({disabled:true});state.api.mockResolvedValue({...fact,onlineTimeoutMinutes:10,revision:'1'});await click('读取当前在线超时核对');await click('采用当前配置并结束核对');expect(writes()).toHaveLength(1);expect(wrapper.text()).toContain('原保存结果仍未确认');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})
it('设置宿主内嵌超时表单保存仍一次PUT与独立回读',async()=>{
 const w=mount(Policy,{props:{typeId:type,compact:true},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);await flushPromises();await w.get('[role="switch"]').trigger('click');w.findComponent({name:'ElInputNumber'}).vm.$emit('update:modelValue',10);await flushPromises();await click('保存在线超时');expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({revision:'0',onlineTimeoutMinutes:10});expect(w.emitted('locked')?.at(-1)).toEqual([false])
})
