import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {createRouter,createMemoryHistory,RouterView,type Router} from 'vue-router'
import {defineComponent} from 'vue'
import ElementPlus,{ElSwitch,ElDialog} from 'element-plus'
import Detail from '../../src/features/rules/TaskDetailPage.vue'
import {setAccessToken,invalidateIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({project:null as any,current:null as any,manage:null as any,read:null as any}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('');state.current=ref({});state.manage=ref(true);state.read=ref(true);return{session:{user:{accountId:'test-account'}},projectId:state.project,currentProject:state.current,can:(p:string)=>p==='task:read'?state.read.value:p==='task:run'||p==='task:manage'&&state.manage.value}})
const project='10000000-0000-4000-8000-000000000001',job='30000000-0000-4000-8000-000000000001'
const Child=defineComponent({name:'TaskSchedulePanel',props:['inactive'],emits:['editing','busy','locked'],template:'<div/>'})
let view:VueWrapper|undefined,router:Router,stored:any,calls:{path:string;method:string;body?:unknown}[],postError:number,readError:number,wrongRead:string,holdPost:((response:Response)=>Promise<Response>)|undefined
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}})
async function fetcher(input:RequestInfo|URL,init?:RequestInit){const url=new URL(String(input)),method=init?.method||'GET';calls.push({path:url.pathname,method,body:init?.body});const root=`/api/v1/projects/${project}/task-jobs/${job}`;
 if(method==='GET'&&url.pathname===root){if(readError)return json({message:'暂不可读'},readError);return json({...stored,...(wrongRead==='status'?{status:'ACTIVE'}:{}),...(wrongRead==='version'?{version:4}:{}),...(wrongRead==='identity'?{id:project}:{})})}
 if(method==='GET'&&url.pathname===root+'/app-visibility')return json({taskId:job,version:stored.version,projectDeviceDetails:false,userSettings:false,userDetails:false})
 if(method==='POST'&&[root+'/enable',root+'/disable'].includes(url.pathname)){if(postError!==409)stored={...stored,status:url.pathname.endsWith('/enable')?'ACTIVE':'PAUSED',version:stored.version+1};const response=postError?json({message:'应答未知'},postError):json(stored);return holdPost?holdPost(response):response}
 throw new Error(`闭合夹具拒绝${method} ${url.pathname}`)
}
async function setup(){router=createRouter({history:createMemoryHistory(),routes:[{path:'/tasks/jobs/:id',component:Detail},{path:'/away',component:{template:'<p>已离开任务</p>'}}]});await router.push(`/tasks/jobs/${job}`);await router.isReady();view=mount(RouterView,{global:{plugins:[router,ElementPlus],stubs:{TaskSchedulePanel:Child,TaskRelatedDevicesPanel:true,TaskDebugLogPanel:true,TaskRunnerDialog:true}}});await vi.waitFor(()=>expect(view!.find('.task-global-enabled').exists()).toBe(true))}
const control=()=>view!.get('.task-global-enabled').getComponent(ElSwitch)
const button=(name:string)=>view!.findAll('button').find(b=>b.text()===name)!
async function ask(value:boolean){control().vm.$emit('change',value);await flushPromises()}
const posts=()=>calls.filter(c=>c.method==='POST')
beforeEach(()=>{state.project.value=project;state.current.value={id:project,timezone:'UTC'};state.manage.value=true;state.read.value=true;stored={id:job,name:'全局启停任务',status:'ACTIVE',version:4,targetType:'ALL_DEVICES',scheduleType:'MANUAL',timezone:'UTC',commandKey:'sample',input:{},createdAt:'2026-10-26T00:00:00Z',updatedAt:'2026-10-26T00:00:00Z'};calls=[];postError=0;readError=0;wrongRead='';holdPost=undefined;setAccessToken('closed-global-switch');vi.stubGlobal('fetch',vi.fn(fetcher))})
afterEach(()=>{view?.unmount();view=undefined;setAccessToken('');vi.unstubAllGlobals()})
it('任务tab右侧开关直接disable，不弹确认，精确GET后显示停用',async()=>{await setup();expect(view!.find('.task-state-column').text()).toContain('任务状态');expect(control().props('modelValue')).toBe(true);await ask(false);expect(view!.findAllComponents(ElDialog).some(d=>d.props('modelValue'))).toBe(false);expect(posts().map(c=>c.path)).toEqual([`/api/v1/projects/${project}/task-jobs/${job}/disable`]);expect(posts()[0]!.body).toBeUndefined();expect(control().props('modelValue')).toBe(false);expect(calls.filter(c=>c.method==='GET'&&c.path===`/api/v1/projects/${project}/task-jobs/${job}`)).toHaveLength(2)})
it('PAUSED启用在途保持旧显示且不二次写，完成仅enable加原ID回读',async()=>{stored.status='PAUSED';let release!:()=>void;holdPost=response=>new Promise(done=>{release=()=>done(response)});await setup();await ask(true);expect(posts()).toHaveLength(1);expect(control().props('modelValue')).toBe(false);expect(control().props('disabled')).toBe(true);await ask(true);expect(posts()).toHaveLength(1);release();await flushPromises();expect(control().props('modelValue')).toBe(true);expect(posts()[0]!.path).toMatch(/\/enable$/)})
it('未知应答不重POST，503反向状态或未推进版本均不解锁，实际目标与新版核实后恢复',async()=>{postError=502;await setup();await ask(false);expect(control().props('disabled')).toBe(true);await ask(false);expect(posts()).toHaveLength(1);readError=503;await button('重新读取核对').trigger('click');await flushPromises();expect(view!.find('.task-global-enabled').exists()).toBe(false);readError=0;wrongRead='status';await button('重新读取核对').trigger('click');await flushPromises();expect(control().props('disabled')).toBe(true);wrongRead='version';await button('重新读取核对').trigger('click');await flushPromises();expect(control().props('disabled')).toBe(true);wrongRead='';await button('重新读取核对').trigger('click');await flushPromises();expect(control().props('disabled')).toBe(false);expect(control().props('modelValue')).toBe(false);expect(posts()).toHaveLength(1)})
it.each(['503','version','identity'])('已受理后GET%s错误保持核对锁，不用乐观POST回执替代状态',async variant=>{await setup();if(variant==='503')readError=503;else wrongRead=variant;await ask(false);if(variant==='version')expect(control().props('disabled')).toBe(true);else expect(view!.find('.task-global-enabled').exists()).toBe(false);expect(posts()).toHaveLength(1);readError=0;wrongRead='';await button('重新读取核对').trigger('click');await flushPromises();expect(control().props('disabled')).toBe(false);expect(control().props('modelValue')).toBe(false);expect(posts()).toHaveLength(1)})
it('VIEWER只读展示实际状态，内部change事件不能越过manage权限',async()=>{state.manage.value=false;await setup();expect(control().props('disabled')).toBe(true);expect(control().props('modelValue')).toBe(true);await ask(false);expect(posts()).toHaveLength(0)})
it('身份失效期间的旧POST晚到不继续读取或恢复管理控件',async()=>{let release!:()=>void;holdPost=response=>new Promise(done=>{release=()=>done(response)});await setup();await ask(false);state.manage.value=false;invalidateIdentity();await flushPromises();const reads=calls.filter(c=>c.method==='GET'&&c.path===`/api/v1/projects/${project}/task-jobs/${job}`).length;release();await flushPromises();expect(calls.filter(c=>c.method==='GET'&&c.path===`/api/v1/projects/${project}/task-jobs/${job}`)).toHaveLength(reads);expect(posts()).toHaveLength(1)})
it('计划子编辑与直接启停互斥，关闭子编辑后才可请求切换',async()=>{await setup();await router.replace({query:{tab:'schedule'}});await flushPromises();const child=view!.getComponent(Child);child.vm.$emit('editing',true);await router.replace({query:{tab:'task'}});await flushPromises();expect(control().props('disabled')).toBe(true);await ask(false);expect(posts()).toHaveLength(0);child.vm.$emit('editing',false);await flushPromises();let release!:()=>void;holdPost=response=>new Promise(done=>{release=()=>done(response)});await ask(false);expect(child.props('inactive')).toBe(true);expect(view!.findAllComponents(ElDialog).some(d=>d.props('modelValue'))).toBe(false);expect(posts()).toHaveLength(1);release();await flushPromises()})
it('直接启停被403拒绝后撤下写控件，不自动回读或重POST',async()=>{postError=403;await setup();await ask(false);expect(view!.find('.task-global-enabled').exists()).toBe(false);expect(posts()).toHaveLength(1);expect(calls.filter(c=>c.method==='GET'&&c.path===`/api/v1/projects/${project}/task-jobs/${job}`)).toHaveLength(1);expect(view!.text()).toContain('应答未知')})
it('明确409拒绝启停后按原任务回读即可解除核对锁，不要求状态变化或重发',async()=>{stored.status='PAUSED';postError=409;await setup();await ask(true);expect(control().props('disabled')).toBe(true);expect(posts()).toHaveLength(1);await button('重新读取核对').trigger('click');await flushPromises();expect(control().props('disabled')).toBe(false);expect(control().props('modelValue')).toBe(false);expect(posts()).toHaveLength(1)})
it('启停在途阻止离开和改任务，精确回读完成后释放浏览器与路由保护',async()=>{
 let release!:()=>void;holdPost=response=>new Promise(done=>{release=()=>done(response)});await setup();await ask(false)
 expect(await router.push('/away')).toBeTruthy();expect(await router.push('/tasks/jobs/other')).toBeTruthy();expect(router.currentRoute.value.params.id).toBe(job)
 let unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true)
 release();await flushPromises();expect(posts()).toHaveLength(1);expect(control().props('modelValue')).toBe(false)
 unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(false)
 expect(await router.push('/away')).toBeUndefined();await flushPromises();expect(view!.text()).toContain('已离开任务')
})
it('未知启停保留同任务tab与核对入口，旧版本GET仍阻止离开且不重写',async()=>{
 postError=502;await setup();await ask(false);expect(await router.replace({query:{tab:'settings'}})).toBeUndefined();await flushPromises()
 expect(await router.push('/away')).toBeTruthy();expect(await router.push('/tasks/jobs/other')).toBeTruthy()
 wrongRead='version';await button('重新读取核对').trigger('click');await flushPromises();expect(await router.push('/away')).toBeTruthy()
 wrongRead='';await button('重新读取核对').trigger('click');await flushPromises();expect(posts()).toHaveLength(1)
 expect(await router.push('/away')).toBeUndefined()
})
it.each(['manage','read','project','identity'])('未知启停在%s范围失效后允许退出，不误锁已无权的核对页面',async kind=>{
 postError=502;await setup();await ask(false)
 if(kind==='manage')state.manage.value=false;else if(kind==='read')state.read.value=false;else if(kind==='project')state.project.value='10000000-0000-4000-8000-000000000002';else invalidateIdentity()
 await flushPromises();expect(await router.push('/away')).toBeUndefined();await flushPromises()
 const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(false);expect(posts()).toHaveLength(1)
})
