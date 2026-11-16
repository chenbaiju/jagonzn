import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {defineComponent} from 'vue'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {session} from '../../src/core/session'
import {ApiError,invalidateIdentity} from '../../src/core/http'
import Detail from '../../src/features/rules/TaskDetailPage.vue'
const api=vi.hoisted(()=>({getTask:vi.fn(),saveTaskInformation:vi.fn(),saveTaskTargets:vi.fn(),deleteTask:vi.fn()}))
vi.mock('../../src/features/rules/api',()=>api)
vi.mock('../../src/features/rules/task-choices',()=>({selectedTaskChoices:vi.fn().mockResolvedValue([])}))
const device='10000000-0000-4000-8000-000000000001'
const job={id:'j',name:'任务',description:'原说明',version:4,status:'ACTIVE',targetType:'EXPLICIT_DEVICES',targetDeviceIds:[device],scheduleType:'MANUAL',timezone:'Asia/Shanghai',commandKey:'sample',input:{}}
const Button=defineComponent({props:['disabled','loading'],template:'<button :disabled="disabled||loading"><slot/></button>'})
const Dialog=defineComponent({props:['modelValue','title'],template:'<section v-if="modelValue" role="dialog"><h3>{{title}}</h3><slot/><slot name="footer"/></section>'})
const Panel=defineComponent({props:['title'],template:'<div>{{title}}<slot/></div>'})
const stubs={ElButton:Button,ElDialog:Dialog,ElForm:Panel,ElFormItem:Panel,ElAlert:Panel,ElTabs:Panel,ElTabPane:true,ElIcon:true,ElInput:true,ElRadioGroup:true,ElRadio:true,ElSwitch:true,ElSkeleton:true,ElEmpty:true,TaskChoiceSelect:true}
type Kind='information'|'targets'|'removal'
const kinds:Kind[]=['information','targets','removal']
const write=(kind:Kind)=>kind==='information'?api.saveTaskInformation:kind==='targets'?api.saveTaskTargets:api.deleteTask
let view:VueWrapper|undefined,router:Router
const button=(label:string)=>{const found=view!.findAll('button').find(node=>node.text()===label);if(!found)throw new Error('missing '+label);return found}
async function setup(){router=createRouter({history:createMemoryHistory(),routes:[{path:'/tasks/jobs/:id',component:Detail},{path:'/tasks/jobs',component:{template:'<p>任务目录</p>'}},{path:'/devices/:id',component:{template:'<p>设备详情</p>'}}]});await router.push('/tasks/jobs/j');await router.isReady();view=mount(RouterView,{global:{plugins:[router],stubs}});await flushPromises()}
async function open(kind:Kind){if(kind==='information')await button('编辑').trigger('click');else if(kind==='targets')await view!.get('[aria-label="编辑目标"]').trigger('click');else{await router.replace({query:{tab:'settings'}});await flushPromises();await button('移除任务').trigger('click')}await flushPromises()}
async function submit(kind:Kind){await button(kind==='information'?'保存':'确定').trigger('click');await flushPromises()}
function unload(){const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented}
function deferred(){let resolve!:(value?:unknown)=>void;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
beforeEach(()=>{Object.values(api).forEach(fn=>fn.mockReset());session.ready=true;session.transitioning=false;session.user={currentProjectId:'p',permissions:['task:read','task:manage']} as never;api.getTask.mockImplementation(async(_project:string,id:string)=>({...job,id}));api.saveTaskInformation.mockResolvedValue({});api.saveTaskTargets.mockResolvedValue({});api.deleteTask.mockResolvedValue(undefined)})
afterEach(()=>{view?.unmount();view=undefined;session.user=null})
it.each(kinds)('%s写在途保护离开与换任务，同任务tab可切，明确成功后解除',async kind=>{
 const pending=deferred();write(kind).mockReturnValueOnce(pending.promise);await setup();await open(kind);await submit(kind);expect(write(kind)).toHaveBeenCalledTimes(1)
 expect(await router.replace({query:{tab:'task'}})).toBeUndefined();expect(await router.push('/tasks/jobs')).toBeTruthy();expect(await router.push('/tasks/jobs/next')).toBeTruthy();expect(unload()).toBe(true)
 pending.resolve();await flushPromises();expect(write(kind)).toHaveBeenCalledTimes(1);expect(unload()).toBe(false)
 if(kind!=='removal')expect(await router.push('/tasks/jobs')).toBeUndefined()
 expect(router.currentRoute.value.path).toBe('/tasks/jobs')
})
it.each(kinds)('%s未知写取消弹窗仍保留核对上下文，GET失败不解锁，成功读取才放行',async kind=>{
 write(kind).mockRejectedValueOnce(new ApiError('结果未知',0,undefined,undefined,true));await setup();await open(kind);await submit(kind);await button('取消').trigger('click');await flushPromises()
 expect(await router.push('/tasks/jobs')).toBeTruthy();expect(await router.push('/tasks/jobs/next')).toBeTruthy();expect(unload()).toBe(true)
 expect(await router.replace({query:{tab:kind==='removal'?'task':'settings'}})).toBeUndefined();api.getTask.mockRejectedValueOnce(new ApiError('读取失败',503));await button('重新读取核对').trigger('click');await flushPromises();expect(await router.push('/tasks/jobs')).toBeTruthy()
 api.getTask.mockResolvedValueOnce({...job,version:5});await button('重新读取核对').trigger('click');await flushPromises();expect(unload()).toBe(false);expect(await router.push('/tasks/jobs')).toBeUndefined();expect(write(kind)).toHaveBeenCalledTimes(1)
})
it.each(kinds)('%s普通草稿可取消并离开，不产生写或导航锁',async kind=>{
 await setup();await open(kind);expect(unload()).toBe(false);await button('取消').trigger('click');expect(await router.push('/tasks/jobs/next')).toBeUndefined();await flushPromises();expect(write(kind)).not.toHaveBeenCalled()
})
it.each(['manage','read','identity','project'])('未知资料写在%s失效后允许离开，不以旧核对锁困住新范围',async change=>{
 api.saveTaskInformation.mockRejectedValueOnce(new ApiError('结果未知',0,undefined,undefined,true));await setup();await open('information');await submit('information')
 if(change==='manage')session.user={...session.user!,permissions:['task:read']};else if(change==='read')session.user={...session.user!,permissions:['task:manage']};else if(change==='identity')invalidateIdentity();else session.user={...session.user!,currentProjectId:'other'}
 await flushPromises();expect(unload()).toBe(false);expect(await router.push('/tasks/jobs')).toBeUndefined();expect(api.saveTaskInformation).toHaveBeenCalledTimes(1)
})
it.each([400,401,403,404])('移除明确拒绝%s后不宣称成功，但允许主动离开',async status=>{
 api.deleteTask.mockRejectedValueOnce(new ApiError('明确拒绝',status));await setup();await open('removal');await submit('removal');expect(router.currentRoute.value.path).toBe('/tasks/jobs/j');expect(unload()).toBe(false);expect(await router.push('/tasks/jobs')).toBeUndefined();expect(api.deleteTask).toHaveBeenCalledTimes(1)
})
