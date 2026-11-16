import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeleteType from '../../src/features/device-types/DeviceTypeDeleteDialog.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const state=vi.hoisted(()=>({api:vi.fn(),type:vi.fn(),count:vi.fn(),owned:vi.fn(),remove:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
vi.mock('../../src/features/device-types/public-product-api',async original=>{
 const source=await original<typeof import('../../src/features/device-types/public-product-api')>()
 return {...source,productTransport:{...source.productTransport,owned:state.owned}}
})
const project='00000000-0000-4000-8000-000000000100',type='00000000-0000-4000-8000-000000000200',other='00000000-0000-4000-8000-000000000300'
const current=()=>({id:type,projectId:project,name:'草稿传感器',status:'DRAFT'})
const count=(n='0')=>({total:n,page:1,limit:1,items:n==='0'?[]:[{id:other,deviceTypeId:type}]})
const wrappers:VueWrapper[]=[]
function render(){const wrapper=mount(DeleteType,{props:{deviceTypeId:type},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);return wrapper}
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===label);expect(found,label).toBeDefined();return found!}
async function click(label:string){button(label).click();await flushPromises()}
const deletes=()=>state.api.mock.calls.filter(([,options])=>options?.method==='delete')
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}];state.type.mockResolvedValue(current());state.count.mockResolvedValue(count());state.owned.mockResolvedValue({items:[],total:'0',available:true});state.remove.mockResolvedValue(undefined);state.api.mockImplementation((path:string,options?:{method?:string})=>options?.method==='delete'?state.remove():path.endsWith('/devices/directory')?state.count():state.type())})
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount();session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('确认前核真实类型和绑定数，取消零写，明确成功只一次DELETE并先解锁再通知父页',async()=>{
 const wrapper=render();await click('移除设备类型');expect(state.api.mock.calls[1]![1]).toMatchObject({query:{deviceTypeIds:[type],page:1,limit:1}});expect(document.body.textContent).toContain('关联的规则、任务和告警规则将一并移除');await click('取消');expect(deletes()).toHaveLength(0)
 await click('移除设备类型');await click('确定移除');expect(deletes()).toHaveLength(1);expect(deletes()[0]![0]).toBe(`/api/v1/projects/${project}/device-types/${type}`);expect(deletes()[0]![1].headers['Idempotency-Key']).toEqual(expect.any(String));expect(wrapper.emitted('removed')).toHaveLength(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})
it('关联设备与产品库发布均禁写，已发布但未在产品库且无设备可移除，只读失权后清理弹层和旧类型',async()=>{
 state.count.mockResolvedValue(count('1'));const wrapper=render();await click('移除设备类型');expect(document.body.textContent).toContain('仍有 1 台关联设备');expect(button('确定移除').disabled).toBe(true);await click('取消')
 state.type.mockResolvedValue({...current(),status:'PUBLISHED'});state.count.mockResolvedValue(count());await click('移除设备类型');expect(document.body.textContent).toContain('没有关联设备且未在产品库发布');expect(button('确定移除').disabled).toBe(false);await click('取消')
 state.owned.mockResolvedValue({items:[{sourceDeviceTypeId:type,product:{state:'PUBLISHED'}}],total:'1',available:true});await click('移除设备类型');expect(document.body.textContent).toContain('仍在产品库发布');expect(button('确定移除').disabled).toBe(true);expect(deletes()).toHaveLength(0)
 session.user={...session.user!,projectRole:'VIEWER',permissions:[]};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();expect(wrapper.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false);expect(wrapper.findAll('button').some(node=>node.text()==='移除设备类型')).toBe(false);expect(wrapper.text()).not.toContain('草稿传感器');expect(deletes()).toHaveLength(0)
})
it('未知移除仅GET核对，404不冒原删除成功，同值会话替换保留意图并可明确结束核对',async()=>{
 state.remove.mockRejectedValue(new ApiError('网络结果未知',0,undefined,undefined,true));const wrapper=render();await click('移除设备类型');await click('确定移除');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(document.body.textContent).toContain('原请求不会再次发送')
 session.user={...session.user!};session.projects=session.projects.map(value=>({...value}));await flushPromises();await click('关闭');await click('移除设备类型');state.type.mockRejectedValue(new ApiError('不存在',404,30001));await click('读取当前状态');expect(document.body.textContent).toContain('仍不能确认原移除请求是否成功');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(wrapper.emitted('removed')).toBeUndefined();expect(deletes()).toHaveLength(1)
 await click('结束本次核对');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper.emitted('removed')).toBeUndefined();expect(wrapper.text()).toContain('未标记为移除成功');expect(button('移除设备类型').disabled).toBe(true);expect(deletes()).toHaveLength(1)
})
it('切项目后迟到DELETE响应不进入新范围，也不通知已移除',async()=>{
 let resolve!:()=>void;state.remove.mockImplementation(()=>new Promise<void>(done=>{resolve=done}));const wrapper=render();await click('移除设备类型');button('确定移除').click();await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);session.user={...session.user!,currentProjectId:other};session.projects=[{id:other,myRole:'OWNER',status:'ACTIVE'}];await flushPromises();resolve();await flushPromises();expect(wrapper.emitted('removed')).toBeUndefined();expect(wrapper.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(deletes()).toHaveLength(1)
})
