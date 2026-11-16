import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const feedback=vi.hoisted(()=>({success:vi.fn(),error:vi.fn()}))
vi.mock('@/ui/copy-feedback',()=>({copySucceeded:feedback.success,copyFailed:feedback.error}))
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Credentials from '../../src/features/device-types/DeviceTypeProductCredentials.vue'
import {decodeProductCredential,prepareProductCredential} from '../../src/features/device-types/product-credentials-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=uuid(100),type=uuid(200),other=uuid(300),publicKey='product_a'
// 完全合成的固定夹具，不读取任何真实产品或设备秘密。
const generated=()=>({deviceTypeId:type,productKey:publicKey,productSecret:'a'.repeat(64)})
const wrappers:VueWrapper[]=[]
function render(productKey:string|null=publicKey){const wrapper=mount(Credentials,{props:{typeId:type,typeStatus:'PUBLISHED',deviceKind:'DIRECT',productKey},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);return wrapper}
function button(label:string){const node=[...document.querySelectorAll<HTMLButtonElement>('button')].find(value=>value.textContent?.trim()===label);expect(node,label).toBeDefined();return node!}
async function click(label:string){button(label).click();await flushPromises()}
const writes=()=>state.api.mock.calls.filter(([,options])=>options?.method==='post')
const plaintext=()=>document.querySelector<HTMLInputElement>('input[aria-label="本次产品密钥"]')
async function confirm(label='轮换产品密钥'){await click(label);await click('确认生成或轮换')}
function owner(){session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;owner();state.api.mockImplementation((_path,options)=>Promise.resolve(options?.method?generated():{id:type,projectId:project,productKey:publicKey}))})
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('显式确认前取消零写，双击只POST一次，关闭立即清明文并拒绝迟到复制反馈',async()=>{
 const local=vi.spyOn(Storage.prototype,'setItem'),wrapper=render();await click('轮换产品密钥');expect(writes()).toHaveLength(0);expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);await click('取消');expect(writes()).toHaveLength(0);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);await click('轮换产品密钥');const submit=button('确认生成或轮换');submit.click();submit.click();await flushPromises()
 expect(writes()).toHaveLength(1);expect(writes()[0]![0]).toBe(`/api/v1/projects/${project}/device-types/${type}/product-credential`);expect(writes()[0]![1].headers['Idempotency-Key']).toMatch(/^[a-f0-9-]{36}$/);expect(writes()[0]![1].body).toBeUndefined();expect(plaintext()?.value).toBe(generated().productSecret);expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true])
 let finish!:()=>void;const clipboard=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve}));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:clipboard}});button('复制本次密钥').click();await flushPromises();await click('关闭并清除明文');expect(plaintext()).toBeNull();expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper.emitted('changed')).toHaveLength(1);finish();await flushPromises();expect(wrapper.text()).not.toContain('已复制本次密钥');expect(feedback.success).not.toHaveBeenCalled();expect(feedback.error).not.toHaveBeenCalled();expect(local).not.toHaveBeenCalled();expect(writes()).toHaveLength(1)
})
it('10014保持UNKNOWN和原key，公开GET同值不认轮换成功也不回放秘密',async()=>{
 const normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>options?.method?Promise.reject(new ApiError('原结果不回放',409,10014)):normal(path,options));const wrapper=render();await confirm();const key=writes()[0]![1].headers['Idempotency-Key'];expect(wrapper.text()).toContain('不可回放结果');expect(wrapper.text()).toContain(key);expect(plaintext()).toBeNull();await wrapper.setProps({disabled:true});session.user={...session.user!};session.projects=session.projects.map(value=>({...value}));await flushPromises();await click('读取公开产品事实');expect(state.api.mock.calls.at(-1)![0]).toBe(`/api/v1/projects/${project}/device-types/${type}`);expect(wrapper.text()).toContain('不能证明原轮换结果');expect(writes()).toHaveLength(1);expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);await click('结束本次核对');await wrapper.setProps({disabled:false});expect(button('轮换产品密钥').disabled).toBe(true);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(plaintext()).toBeNull();expect(writes()[0]![1].headers['Idempotency-Key']).toBe(key)
})
it('写权限和读权限撤销均立即清明文，公开productKey反馈不误清本次展示',async()=>{
 const wrapper=render(null);await confirm('生成产品凭据');expect(plaintext()).not.toBeNull();await wrapper.setProps({productKey:publicKey});expect(plaintext()).not.toBeNull();session.user={...session.user!,permissions:['device:read']};await flushPromises();expect(plaintext()).toBeNull();expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper.emitted('changed')).toHaveLength(1)
 owner();await flushPromises();await confirm();expect(plaintext()).not.toBeNull();session.user={...session.user!,permissions:[]};await flushPromises();expect(plaintext()).toBeNull();expect(wrapper.text()).toContain('没有此内容的读取权限');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(writes()).toHaveLength(2)
})
it('scope切换丢弃迟到密钥，写角色降级的迟到响应仅保未知事实核对',async()=>{
 let finish!:(value:ReturnType<typeof generated>)=>void;const normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>options?.method?new Promise(resolve=>{finish=resolve}):normal(path,options));const wrapper=render();await click('轮换产品密钥');button('确认生成或轮换').click();await flushPromises();await wrapper.setProps({typeId:other,productKey:null});finish(generated());await flushPromises();expect(plaintext()).toBeNull();expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
 await wrapper.setProps({typeId:type,productKey:publicKey});await click('轮换产品密钥');button('确认生成或轮换').click();await flushPromises();session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();finish(generated());await flushPromises();expect(plaintext()).toBeNull();expect(wrapper.text()).toContain('当前写权限不允许展示明文');expect(wrapper.text()).toContain('原生成或轮换结果未知');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(writes()).toHaveLength(2)
})
it('未发布、子设备、归档、非管理员或disabled不能确认，回执错类型/旧key不能当可见秘密',async()=>{
 const wrapper=render();await wrapper.setProps({typeStatus:'DRAFT'});expect(wrapper.findAll('button').some(node=>node.text()==='轮换产品密钥')).toBe(false);await wrapper.setProps({typeStatus:'PUBLISHED',deviceKind:'SUB_DEVICE'});expect(wrapper.text()).toContain('子设备不能生成');await wrapper.setProps({deviceKind:'DIRECT'});session.projects=[{id:project,myRole:'OWNER',status:'ARCHIVED'}];await flushPromises();expect(wrapper.findAll('button').some(node=>node.text()==='轮换产品密钥')).toBe(false);owner();session.user={...session.user!,projectRole:'OPERATOR'};session.projects=[{id:project,myRole:'OPERATOR',status:'ACTIVE'}];await flushPromises();expect(wrapper.findAll('button').some(node=>node.text()==='轮换产品密钥')).toBe(false);owner();await wrapper.setProps({disabled:true});expect(button('轮换产品密钥').disabled).toBe(true);expect(writes()).toHaveLength(0)
 const intent=prepareProductCredential(project,type,publicKey);expect(()=>decodeProductCredential({...generated(),deviceTypeId:other},intent)).toThrow();expect(()=>decodeProductCredential({...generated(),productKey:'changed_key'},intent)).toThrow();expect(()=>decodeProductCredential({...generated(),productSecret:undefined},intent)).toThrow()
})
