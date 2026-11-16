import {configureTaskCommand} from './task-command-config-fixture'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {h} from 'vue'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import ElementPlus from 'element-plus'
import {ApiError,invalidateIdentity,setAccessToken} from '../../src/core/http'
import {ruleRoutes} from '../../src/features/rules/routes'
import {projectId as loadedProject} from '../../src/core/session'
const state=vi.hoisted(()=>({project:null as any,current:null as any,manage:null as any,port:{} as any}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('');state.current=ref({timezone:'Asia/Shanghai'});state.manage=ref(true);return {session:{ready:true,transitioning:false,user:{accountId:'00000000-0000-4000-8000-0000000000aa'},projects:[],menus:[]},projectId:state.project,currentProject:state.current,can:()=>state.manage.value}})
vi.mock('../../src/features/rules/device-task-definition-api',()=>({deviceTaskDefinitionApi:state.port}))
vi.mock('../../src/features/devices/api',()=>({devicesApi:{read:async(_p:string,id:string)=>({id,name:'原设备'})}}))
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',job='30000000-0000-4000-8000-000000000001'
let wrapper:VueWrapper|undefined,router:Router,saved:any
function button(label:string){const value=wrapper!.findAll('button').find(x=>x.text()===label||x.attributes('aria-label')===label);expect(value,label).toBeDefined();return value!}
async function setup(){router=createRouter({history:createMemoryHistory(),routes:[{path:'/away',component:{render:()=>h('p','已离开')}},{path:'/devices/:id',component:{render:()=>h('p','已返回设备任务')}},...ruleRoutes]});await router.push('/tasks/jobs/create?source=device&deviceId='+device);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await vi.waitFor(()=>expect(wrapper!.find('[aria-label="新任务名称"]').exists()).toBe(true));await wrapper!.get('[aria-label="新任务名称"]').setValue(' 原键任务 ');await configureTaskCommand(wrapper!,'sample','{}')}
async function submit(){await button('下一步').trigger('click');await flushPromises();await button('创建').trigger('click');await flushPromises()}
beforeEach(()=>{void loadedProject.value;state.project.value=project;state.current.value={timezone:'Asia/Shanghai'};state.manage.value=true;setAccessToken('original-key-domain-fixture');Object.assign(state.port,{create:vi.fn().mockImplementation((_p:string,_d:string,body:any)=>{saved={...body,tags:body.tags??{},id:job,status:'PAUSED',version:1,createdAt:'2026-10-26T00:00:00Z',updatedAt:'2026-10-26T00:00:00Z'};return Promise.reject(new ApiError('原POST应答未知',0,undefined,undefined,true))}),creation:vi.fn().mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:false}),definition:vi.fn().mockImplementation(async()=>saved),preference:vi.fn().mockResolvedValue({deviceId:device,allowed:true,version:1,definitionVersion:1})})})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML='';setAccessToken('')})
it('无ID应答未知保一次原key及原意图，404不解锁；原件提交后只GET完成不重POST',async()=>{
 await setup();await submit();const key=state.port.create.mock.lastCall[3];expect(key).toMatch(/^[a-f0-9-]{36}$/);expect(wrapper!.text()).not.toContain('任务已受理');expect(button('重新读取核对').attributes('disabled')).toBeUndefined();state.port.creation.mockRejectedValueOnce(new ApiError('原件尚未出现',404));await button('重新读取核对').trigger('click');await flushPromises();expect(wrapper!.text()).toContain('仍待核对');expect(await router.push('/away')).toBeTruthy();expect(state.port.creation.mock.lastCall.slice(0,2)).toEqual([project,key]);expect(state.port.definition).not.toHaveBeenCalled();await button('重新读取核对').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/devices/'+device);expect(state.port.create).toHaveBeenCalledTimes(1);expect(state.port.creation.mock.calls.every((call:any[])=>call[1]===key)).toBe(true);expect(state.port.definition).toHaveBeenCalledExactlyOnceWith(project,job,expect.any(AbortSignal));expect(state.port.preference).toHaveBeenCalledExactlyOnceWith(project,job,device,1,expect.any(AbortSignal))
})
it('已有可信ID不额外依赖原件端口，只原定义及偏好人工两读',async()=>{
 const original=state.port.create.getMockImplementation();state.port.create.mockImplementation(async(...args:any[])=>{try{await original(...args)}catch{}return saved});state.port.definition.mockRejectedValueOnce(new ApiError('后继读失败',503));await setup();await submit();expect(wrapper!.text()).toContain(job);await button('重新读取核对').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/devices/'+device);expect(state.port.creation).not.toHaveBeenCalled();expect(state.port.create).toHaveBeenCalledTimes(1)
})
it.each([{jobId:job,initialDefinitionVersion:2,deleted:false},{jobId:job,initialDefinitionVersion:1},{jobId:'bad',initialDefinitionVersion:1,deleted:false},{jobId:job,initialDefinitionVersion:1,deleted:false,payload:'不得接受额外内容'}])('原件缺失或越界字段不能当创建确认 %j',async bad=>{
 await setup();await submit();state.port.creation.mockResolvedValue(bad);await button('重新读取核对').trigger('click');await flushPromises();expect(await router.push('/away')).toBeTruthy();expect(state.port.definition).not.toHaveBeenCalled();expect(state.port.preference).not.toHaveBeenCalled();expect(state.port.create).toHaveBeenCalledTimes(1);expect(button('创建').attributes('disabled')).toBeDefined()
})
it('已创建后软删原件明确结束核对并可退出，当前页不允许再次创建',async()=>{
 await setup();await submit();state.port.creation.mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:true});await button('重新读取核对').trigger('click');await flushPromises();expect(wrapper!.text()).toContain('原任务已创建后被移除');expect(button('创建').attributes('disabled')).toBeDefined();await button('创建').trigger('click');expect(state.port.create).toHaveBeenCalledTimes(1);expect(state.port.definition).not.toHaveBeenCalled();expect(state.port.preference).not.toHaveBeenCalled();expect(await router.push('/away')).toBeUndefined()
})
it('原键核对在途身份失效清输入并丢迟到原件，不继续读取或返回',async()=>{
 await setup();await submit();let release!:(value:unknown)=>void;state.port.creation.mockReturnValue(new Promise(yes=>{release=yes}));await button('重新读取核对').trigger('click');await flushPromises();state.manage.value=false;invalidateIdentity();await flushPromises();expect(wrapper!.find('[aria-label="新任务名称"]').exists()).toBe(false);release({jobId:job,initialDefinitionVersion:1,deleted:false});await flushPromises();expect(state.port.definition).not.toHaveBeenCalled();expect(router.currentRoute.value.path).toBe('/tasks/jobs/create');expect(await router.push('/away')).toBeUndefined();expect(state.port.create).toHaveBeenCalledTimes(1)
})
it('原件已确认后偏好503继续保锁，后续人工只必要两读且无第二POST',async()=>{
 await setup();await submit();state.port.preference.mockRejectedValueOnce(new ApiError('偏好暂不可读',503));await button('重新读取核对').trigger('click');await flushPromises();expect(await router.push('/away')).toBeTruthy();expect(state.port.creation).toHaveBeenCalledTimes(1);await button('重新读取核对').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/devices/'+device);expect(state.port.creation).toHaveBeenCalledTimes(1);expect(state.port.create).toHaveBeenCalledTimes(1)
})
it('原键创建409不能清同次未知放第二POST，仍只按原keyGET',async()=>{
 const original=state.port.create.getMockImplementation();state.port.create.mockImplementation(async(...args:any[])=>{try{await original(...args)}catch{}throw new ApiError('原创建已受理',409,10009)});await setup();await submit();expect(button('创建').attributes('disabled')).toBeDefined();expect(await router.push('/away')).toBeTruthy();await button('重新读取核对').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/devices/'+device);expect(state.port.create).toHaveBeenCalledTimes(1);expect(state.port.creation).toHaveBeenCalledTimes(1)
})
it('已知ID定义404后下一人工查同原key，确认软删可结束且无第二创建',async()=>{
 await setup();await submit();state.port.definition.mockRejectedValueOnce(new ApiError('任务已移除',404));await button('重新读取核对').trigger('click');await flushPromises();expect(await router.push('/away')).toBeTruthy();state.port.creation.mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:true});await button('重新读取核对').trigger('click');await flushPromises();expect(wrapper!.text()).toContain('原任务已创建后被移除');expect(state.port.creation).toHaveBeenCalledTimes(2);expect(state.port.create).toHaveBeenCalledTimes(1);expect(await router.push('/away')).toBeUndefined()
})
