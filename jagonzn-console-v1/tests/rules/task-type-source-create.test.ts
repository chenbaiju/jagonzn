import {configureTaskCommand} from './task-command-config-fixture'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {h} from 'vue'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import ElementPlus from 'element-plus'
import {setAccessToken} from '../../src/core/http'
import TaskChoiceSelect from '../../src/features/rules/TaskChoiceSelect.vue'
import {ruleRoutes} from '../../src/features/rules/routes'
import {taskCreationRouteSource,taskTargetsCreationSource} from '../../src/features/rules/task-creation-source'
const state=vi.hoisted(()=>({project:null as any,current:null as any,user:null as any,manage:null as any}))
vi.mock('../../src/core/session',async()=>{const {ref,reactive}=await import('vue');state.project=ref('');state.current=ref({});state.user=reactive({user:null,ready:true,transitioning:false});state.manage=ref(true);return {projectId:state.project,currentProject:state.current,session:state.user,can:(permission:string)=>permission==='task:read'||permission==='task:manage'&&state.manage.value}})
const project='10000000-0000-4000-8000-000000000001',typeId='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',job='30000000-0000-4000-8000-000000000001'
let view:VueWrapper|undefined,router:Router,saved:any,postError:number,lookupError:number,profileHold:((response:Response)=>Promise<Response>)|undefined
let calls:{path:string;method:string;body?:any;headers:Headers}[]
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})}
async function fetcher(input:RequestInfo|URL,init?:RequestInit){
 const u=new URL(String(input)),method=init?.method||'GET',body=init?.body?JSON.parse(String(init.body)):undefined,headers=new Headers(init?.headers);calls.push({path:u.pathname+u.search,method,body,headers});const root=`/api/v1/projects/${project}`
 if(method==='GET'&&u.pathname===`${root}/device-types/${typeId}/profile`){const response=json({type:{id:typeId,projectId:project,name:'权威类型名称',deviceKind:'DIRECT',networkType:'WIFI',payloadProtocol:'STANDARD',status:'PUBLISHED'},description:null,tags:{},revision:'0',profileToken:'a'.repeat(64)});return profileHold?profileHold(response):response}
 if(method==='GET'&&u.pathname===`${root}/device-types/search`)return json({items:[{id:typeId,name:'权威类型名称'},{id:other,name:'另一类型'}],hasMore:false,nextCursor:null})
 if(method==='GET'&&u.pathname===`${root}/device-types/${typeId}`)return json({id:typeId,name:'权威类型名称'})
 if(method==='GET'&&u.pathname===`${root}/device-types/${other}`)return json({id:other,name:'另一类型'})
 if(method==='POST'&&u.pathname===`${root}/task-jobs`){saved={...body,id:job,tags:body.tags??{},status:body.enabled?'ACTIVE':'PAUSED',version:1,createdAt:'2026-10-29T00:00:00Z',updatedAt:'2026-10-29T00:00:00Z'};return postError?json({message:'写入回执不可用'},postError):json(saved)}
 if(method==='GET'&&u.pathname===`${root}/task-jobs/${job}`)return json(saved)
 if(method==='GET'&&u.pathname===`${root}/task-job-creations/by-key`)return lookupError?json({message:'暂未找到原件'},lookupError):json({jobId:job,initialDefinitionVersion:1,deleted:false})
 throw new Error(`夹具禁止未定义请求 ${method} ${u.pathname}`)
}
async function setup(query=`source=device-type&deviceTypeId=${typeId}`){router=createRouter({history:createMemoryHistory(),routes:[...ruleRoutes,{path:'/device-types/:id',component:{render:()=>h('p','类型任务页')}},{path:'/away',component:{render:()=>h('p','已离开')}},{path:'/tasks/jobs/:id',component:{render:()=>h('p','任务详情')}}]});await router.push('/tasks/jobs/create?'+query);await router.isReady();view=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await flushPromises();return view}
function button(label:string){const found=view!.findAll('button').find(x=>x.text()===label||x.attributes('aria-label')===label);expect(found,label).toBeDefined();return found!}
async function fill(){await view!.get('[aria-label="新任务名称"]').setValue('类型采样');await configureTaskCommand(view!,'sample','{}');await button('下一步').trigger('click');await flushPromises()}
const writes=()=>calls.filter(x=>x.method!=='GET')
beforeEach(()=>{state.project.value=project;state.current.value={id:project,status:'ACTIVE',myRole:'ADMIN',timezone:'Asia/Shanghai'};state.user.user={currentProjectId:project,projectRole:'ADMIN'};state.manage.value=true;calls=[];saved=undefined;postError=0;lookupError=0;profileHold=undefined;vi.stubGlobal('fetch',vi.fn(fetcher));setAccessToken('type-task-fixture')})
afterEach(()=>{view?.unmount();view=undefined;document.body.innerHTML='';vi.unstubAllGlobals();setAccessToken('')})
it('类型来源读公开资料并预选真实类型，一次创建回读后返回类型任务，取消零写',async()=>{
 const w=await setup();expect(w.text()).toContain('来源设备类型：权威类型名称');expect(w.getComponent(TaskChoiceSelect).props()).toMatchObject({kind:'device-types',modelValue:[typeId]});await button('返回').trigger('click');await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe(`/device-types/${typeId}`));expect(writes()).toHaveLength(0)
 await router.push(`/tasks/jobs/create?source=device-type&deviceTypeId=${typeId}`);await flushPromises();await fill();await button('创建').trigger('click');await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe(`/device-types/${typeId}`));expect(router.currentRoute.value.query.tab).toBe('tasks');expect(writes()).toHaveLength(1);expect(writes()[0]!.body).toMatchObject({targetType:'DEVICE_TYPE',targetDeviceTypeId:typeId,name:'类型采样'});expect(writes()[0]!.body.targetDeviceIds).toBeUndefined();expect(calls.some(x=>x.path.includes('/devices/')||x.path.includes('/device-schedules/'))).toBe(false)
})
it('类型来源改为另一类型后返回实际任务，不能凭来源或单设备归属冒整类型关联',async()=>{
 await setup();view!.getComponent(TaskChoiceSelect).vm.$emit('update:modelValue',[other]);await flushPromises();await fill();await button('创建').trigger('click');await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe(`/tasks/jobs/${job}`));expect(writes()).toHaveLength(1);expect(saved.targetDeviceTypeId).toBe(other);expect(calls.some(x=>x.path.includes('/device-schedules/'))).toBe(false)
 const source={kind:'DEVICE_TYPE' as const,id:typeId};expect(taskTargetsCreationSource({tags:{},actionType:'COMMAND',targetType:'EXPLICIT_DEVICES',targetDeviceIds:[typeId]},source)).toBe(false);expect(taskTargetsCreationSource({tags:{},actionType:'COMMAND',targetType:'ALL_DEVICES'},source)).toBe(false)
})
it('类型来源未知创建仅用原键核对，404仍未知且不重POST，之后按原ID回读返回',async()=>{
 postError=502;lookupError=404;const w=await setup();await fill();await button('创建').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('不要重复创建'));const key=writes()[0]!.headers.get('Idempotency-Key');expect(key).toBeTruthy();expect(await router.push('/away')).toBeTruthy();await button('重新读取核对').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('尚未找到同次'));expect(button('创建').attributes('disabled')).toBeDefined();lookupError=0;await button('重新读取核对').trigger('click');await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe(`/device-types/${typeId}`));expect(writes()).toHaveLength(1);for(const call of calls.filter(x=>x.path.includes('creations/by-key'))){expect(call.headers.get('Original-Request-Key')).toBe(key);expect(call.headers.has('Idempotency-Key')).toBe(false)}expect(calls.some(x=>x.path.includes('/device-schedules/'))).toBe(false)
})
it('类型来源拒混合参数及归档或只读账号，资料晚回在撤权后不恢复表单',async()=>{
 expect(taskCreationRouteSource({source:'device-type',deviceTypeId:typeId,deviceId:typeId})).toBeUndefined();const w=await setup(`source=device-type&deviceTypeId=${typeId}&deviceId=${typeId}`);expect(w.text()).toContain('入口参数无效');expect(calls).toHaveLength(0)
 state.current.value={...state.current.value,status:'ARCHIVED'};await router.push(`/tasks/jobs/create?source=device-type&deviceTypeId=${typeId}`);await flushPromises();expect(w.text()).toContain('没有此内容');expect(calls).toHaveLength(0)
 let release!:()=>void;profileHold=response=>new Promise(yes=>{release=()=>yes(response)});state.current.value={...state.current.value,status:'ACTIVE'};await vi.waitFor(()=>expect(release).toBeDefined());state.user.user={currentProjectId:project,projectRole:'VIEWER'};state.current.value={...state.current.value,myRole:'VIEWER'};await flushPromises();release();await flushPromises();expect(w.find('[aria-label="新任务名称"]').exists()).toBe(false);expect(w.text()).toContain('没有此内容');expect(writes()).toHaveLength(0)
})
