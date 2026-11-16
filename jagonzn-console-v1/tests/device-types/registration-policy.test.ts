import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Policy from '../../src/features/device-types/DeviceTypeRegistrationPolicy.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
import {decodeRegistrationPolicy} from '../../src/features/device-types/registration-policy-api'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(1),type=id(2),other=id(3)
const wrappers:VueWrapper[]=[];let fact={deviceTypeId:type,automaticCreationEnabled:true,revision:'0'}
function owner(){session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]}
async function render(){const wrapper=mount(Policy,{props:{typeId:type,deviceKind:'DIRECT'},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises();return wrapper}
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.trim()===label);expect(found,label).toBeDefined();return found!}
async function click(label:string){button(label).click();await flushPromises()}
const writes=()=>state.api.mock.calls.filter(([,options])=>options?.method==='put')
async function chooseOff(){await click('设置自动创建');(document.querySelector('[role="switch"]') as HTMLElement).click();await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;owner();fact={deviceTypeId:type,automaticCreationEnabled:true,revision:'0'};state.api.mockImplementation((_path,options)=>{if(options?.method==='put')fact={deviceTypeId:type,automaticCreationEnabled:options.body.automaticCreationEnabled,revision:'1'};return Promise.resolve({...fact})})})
afterEach(()=>{wrappers.splice(0).forEach(x=>x.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})
it('取消零写，明确关闭只保存一次并读取同版本，不因自身锁反禁保存',async()=>{
 const wrapper=await render();await chooseOff();await click('取消');expect(writes()).toHaveLength(0);await chooseOff();const save=button('保存自动创建策略');save.click();save.click();await flushPromises()
 expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({revision:'0',automaticCreationEnabled:false});expect(writes()[0]![1].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);expect(wrapper.text()).toContain('策略已保存');expect(wrapper.text()).toContain('不允许自动创建');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})
it('已受理后的读取409仍未知，只读当前不重PUT且不冒原结果',async()=>{
 let written=false;state.api.mockImplementation((_path,options)=>{if(options?.method==='put'){written=true;return Promise.resolve({deviceTypeId:type,automaticCreationEnabled:false,revision:'1'})}return written?Promise.reject(new ApiError('读取冲突',409,10009)):Promise.resolve({...fact})})
 const wrapper=await render();await chooseOff();await click('保存自动创建策略');expect(wrapper.text()).toContain('原保存结果尚未核对');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);const key=writes()[0]![1].headers['Idempotency-Key'];await wrapper.setProps({disabled:true});state.api.mockResolvedValue({deviceTypeId:type,automaticCreationEnabled:false,revision:'2'});await click('读取当前策略核对');await click('采用当前策略并结束核对');expect(wrapper.text()).toContain('原保存结果仍未确认');expect(writes()).toHaveLength(1);expect(key).toMatch(/^[0-9a-f-]{36}$/)
})
it('范围变化丢弃迟到结果，查看者与子设备不能修改，读失权清旧事实',async()=>{
 const wrapper=await render();let finish!:(value:unknown)=>void;state.api.mockImplementation((_path,options)=>options?.method==='put'?new Promise(resolve=>{finish=resolve}):Promise.resolve({...fact,deviceTypeId:other}));await chooseOff();button('保存自动创建策略').click();await flushPromises();await wrapper.setProps({typeId:other});finish({deviceTypeId:type,automaticCreationEnabled:false,revision:'1'});await flushPromises();expect(wrapper.text()).not.toContain('策略已保存');expect(wrapper.text()).toContain('允许自动创建')
 session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();expect(wrapper.findAll('button').some(x=>x.text()==='设置自动创建')).toBe(false);owner();await wrapper.setProps({deviceKind:'SUB_DEVICE'});expect(wrapper.text()).toContain('子设备没有独立');session.user={...session.user!,permissions:[]};await flushPromises();expect(wrapper.text()).toContain('没有读取权限');expect(wrapper.text()).not.toContain('当前策略：')
})
it('准确解码布尔与长版本，写冲突必须重新读取后编辑',async()=>{
 expect(decodeRegistrationPolicy({...fact,revision:'9223372036854775807'},type).revision).toBe('9223372036854775807');expect(()=>decodeRegistrationPolicy({...fact,automaticCreationEnabled:'false'},type)).toThrow();expect(()=>decodeRegistrationPolicy({...fact,revision:'9223372036854775808'},type)).toThrow()
 const wrapper=await render();state.api.mockImplementation((_path,options)=>options?.method==='put'?Promise.reject(new ApiError('冲突',409,10009)):Promise.resolve({...fact,revision:'1'}));await chooseOff();await click('保存自动创建策略');expect(wrapper.text()).toContain('本次保存被拒绝');expect(button('设置自动创建').disabled).toBe(true);await click('刷新自动创建策略');expect(button('设置自动创建').disabled).toBe(false);expect(writes()).toHaveLength(1)
})
it('设置宿主内嵌开关保留原关闭保存与读取',async()=>{
 const w=mount(Policy,{props:{typeId:type,deviceKind:'DIRECT',compact:true},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);await flushPromises();await w.get('[role="switch"]').trigger('click');await click('保存自动创建设置');expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({revision:'0',automaticCreationEnabled:false});expect(w.emitted('locked')?.at(-1)).toEqual([false])
})
