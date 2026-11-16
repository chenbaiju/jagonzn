import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Policy from '../../src/features/device-types/DeviceTypeProductIdentifier.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
import {decodeProductIdentifier} from '../../src/features/device-types/product-identifier-api'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(1),type=id(2)
const wrappers:VueWrapper[]=[];let fact={deviceTypeId:type,enabled:false,productIdentifier:null as string|null,revision:'0'}
function owner(){session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]}
async function render(){const wrapper=mount(Policy,{props:{typeId:type,deviceKind:'DIRECT'},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises();return wrapper}
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.trim()===label);expect(found,label).toBeDefined();return found!}
async function click(label:string){button(label).click();await flushPromises()}
const writes=()=>state.api.mock.calls.filter(([,options])=>options?.method==='put')
async function choose(alias='brand.sensor-v1'){await click('设置产品识别码');(document.querySelector('[role="switch"]') as HTMLElement).click();await flushPromises();const input=document.querySelector<HTMLInputElement>('input[aria-label="产品识别码"]')!;input.value=alias;input.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;owner();fact={deviceTypeId:type,enabled:false,productIdentifier:null,revision:'0'};state.api.mockImplementation((_path,options)=>{if(options?.method==='put')fact={deviceTypeId:type,enabled:options.body.enabled,productIdentifier:options.body.productIdentifier,revision:'1'};return Promise.resolve({...fact})})})
afterEach(()=>{wrappers.splice(0).forEach(x=>x.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})
it('产品别名校验及取消零写，明确保存一次并核完整当前回执',async()=>{
 const wrapper=await render();await choose('Brand.sensor');await click('保存产品识别码');expect(writes()).toHaveLength(0);expect(wrapper.text()).toContain('至少两段点分');await click('取消');expect(writes()).toHaveLength(0);await choose();const save=button('保存产品识别码');save.click();save.click();await flushPromises();expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({revision:'0',enabled:true,productIdentifier:'brand.sensor-v1'});expect(wrapper.text()).toContain('产品识别码已保存');expect(wrapper.text()).toContain('brand.sensor-v1');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(()=>decodeProductIdentifier({...fact,productIdentifier:'uuid'},type)).toThrow();expect(decodeProductIdentifier({...fact,revision:'9223372036854775807'},type).revision).toBe('9223372036854775807')
})
it('未知保存保原意图，同值会话或失写权不清锁，只GET核对不把同值当原请求成功',async()=>{
 const wrapper=await render();state.api.mockImplementation((_path,options)=>options?.method==='put'?Promise.reject(new ApiError('网络结果未知',0,undefined,undefined,true)):Promise.resolve({...fact}));await choose();await click('保存产品识别码');expect(wrapper.text()).toContain('原保存结果尚未核对');const key=writes()[0]![1].headers['Idempotency-Key'];session.user={...session.user!};await flushPromises();await wrapper.setProps({disabled:true});session.projects=[{id:project,myRole:'OWNER',status:'ARCHIVED'}];await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);state.api.mockResolvedValue({...fact,enabled:true,productIdentifier:'brand.sensor-v1',revision:'1'});await click('读取当前产品识别码核对');expect(wrapper.text()).not.toContain('产品识别码已保存');await click('采用当前配置并结束核对');expect(wrapper.text()).toContain('原保存结果仍未确认');expect(writes()).toHaveLength(1);expect(key).toMatch(/^[0-9a-f-]{36}$/);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);session.user={...session.user!,permissions:[]};await flushPromises();expect(wrapper.text()).toContain('没有读取权限');expect(wrapper.text()).not.toContain('当前配置：')
})
it('设置宿主内嵌产品码表单保留校验与一次保存',async()=>{
 const w=mount(Policy,{props:{typeId:type,deviceKind:'DIRECT',compact:true},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);await flushPromises();await w.get('[role="switch"]').trigger('click');await w.get('input[aria-label="产品识别码"]').setValue('brand.sensor-v1');await click('保存产品识别码');expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({revision:'0',enabled:true,productIdentifier:'brand.sensor-v1'});expect(w.emitted('locked')?.at(-1)).toEqual([false])
})
