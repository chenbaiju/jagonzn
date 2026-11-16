import {configureTaskCommand} from './task-command-config-fixture'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {createRouter,createMemoryHistory,RouterView,type Router} from 'vue-router'
import {h} from 'vue'
import ElementPlus from 'element-plus'
import {invalidateIdentity,setAccessToken} from '../../src/core/http'
import {projectId as loadedProject} from '../../src/core/session'
import {ruleRoutes} from '../../src/features/rules/routes'
import TaskChoiceSelect from '../../src/features/rules/TaskChoiceSelect.vue'
import TaskCreateScheduleFields from '../../src/features/rules/TaskCreateScheduleFields.vue'
import {deviceTaskDefinitionApi as transport} from '../../src/features/rules/device-task-definition-api'
import {saveTask} from '../../src/features/rules/api'
const state=vi.hoisted(()=>({project:null as any,current:null as any,manage:null as any}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('');state.current=ref({});state.manage=ref(true);return{session:{ready:true,transitioning:false,user:{accountId:'00000000-0000-4000-8000-0000000000aa'},projects:[],menus:[]},projectId:state.project,currentProject:state.current,can:(permission:string)=>['task:read','device:read'].includes(permission)||permission==='task:manage'&&state.manage.value}})
const group='50000000-0000-4000-8000-000000000001'
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',job='30000000-0000-4000-8000-000000000001'
let view:VueWrapper|undefined,router:Router,saved:any,calls:{path:string;method:string;headers:Headers;body?:any}[],postError:number,planError:number,wrongPlan:boolean,receiptError:number,holdPlan:((response:Response)=>Promise<Response>)|undefined
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
function definition(){const {initialSchedule,...body}=saved;return{...body,tags:body.tags??{},id:job,status:body.enabled?'ACTIVE':'PAUSED',version:1,timezone:initialSchedule?.timezoneMode==='CUSTOM'?initialSchedule.timezone:body.timezone,runAt:initialSchedule?.mode==='ONCE'?initialSchedule.runAt:null,cronExpression:null}}
function plan(){const p=saved.initialSchedule;return{mode:p.mode,legacy:false,version:1,taskEnabled:saved.enabled,onceConsumed:false,runAt:p.runAt||null,timezoneMode:p.timezoneMode||null,timezone:p.timezone||null,resolvedTimezone:p.timezoneMode==='CUSTOM'?p.timezone:'Asia/Shanghai',times:p.times||[],weekdays:wrongPlan?[2]:p.weekdays||[],nextRunAt:null,...(p.mode==='SOLAR'?{solar:p.solar,solarWaitingForEvent:false,nextRunAt:'2027-01-02T09:00:00Z'}:{}),...(p.mode==='INTERVAL'?{intervalMinutes:wrongPlan?10:p.intervalMinutes,timeRanges:p.timeRanges}:{})}}
async function fetcher(input:RequestInfo|URL,init?:RequestInit){const url=new URL(String(input)),method=init?.method||'GET',body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({path:url.pathname+url.search,method,body,headers:new Headers(init?.headers)});const root=`/api/v1/projects/${project}`;
 if(method==='GET'&&url.pathname===`${root}/devices/${device}`)return json({id:device,name:'当前设备'})
 if(method==='GET'&&url.pathname===`${root}/device-groups`)return json([{id:group,name:'目标组'}])
 if(method==='GET'&&url.pathname===`${root}/devices/search`)return json({items:[{id:device,name:'当前设备'}],hasMore:false,nextCursor:null})
 if(method==='POST'&&url.pathname===`${root}/task-jobs`){saved=body;return postError?json({message:'应答结果未知'},postError):json(definition(),201)}
 if(method==='GET'&&url.pathname===`${root}/task-jobs/${job}`)return json(definition())
 if(method==='GET'&&url.pathname===`${root}/task-jobs/${job}/console-schedule`){if(planError)return json({message:'计划暂不可读'},planError);const response=json(plan());return holdPlan?holdPlan(response):response}
 if(method==='GET'&&url.pathname===`${root}/task-jobs/${job}/device-schedules/${device}`)return json({deviceId:device,allowed:true,version:1,definitionVersion:1})
 if(method==='GET'&&url.pathname===`${root}/task-job-creations/by-key`)return receiptError?json({message:'原件暂不可见'},receiptError):json({jobId:job,initialDefinitionVersion:1,deleted:false})
 throw new Error(`封闭夹具拒绝 ${method} ${url.pathname}`)
}
async function setup(){router=createRouter({history:createMemoryHistory(),routes:[{path:'/tasks/jobs/:id',component:{render:()=>h('p','原任务详情')}},{path:'/away',component:{render:()=>h('p','away')}},{path:'/devices/:id',component:{render:()=>h('p','设备任务')}},...ruleRoutes.filter(r=>r.path==='/tasks/jobs/create')]});await router.push(`/tasks/jobs/create?source=device&deviceId=${device}`);await router.isReady();view=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await vi.waitFor(()=>expect(view!.findComponent(TaskCreateScheduleFields).exists()).toBe(true));return view}
function button(label:string){const result=view!.findAll('button').find(x=>x.text()===label||x.attributes('aria-label')===label);expect(result,label).toBeDefined();return result!}
async function draft(kind:'ONCE'|'DAILY'|'INTERVAL'|'SOLAR',patch:Record<string,unknown>={}){await view!.get('[aria-label="新任务名称"]').setValue('初始计划');await configureTaskCommand(view!,'sample','{}');const fields=view!.getComponent(TaskCreateScheduleFields);fields.vm.$emit('update:modelValue',{...fields.props('modelValue'),kind,...patch});await flushPromises()}
async function submit(){await button('下一步').trigger('click');await flushPromises();await view!.get('[aria-label="新任务描述"]').setValue('创建即保存计划');await button('创建').trigger('click')}
const writes=()=>calls.filter(c=>c.method!=='GET')
beforeEach(()=>{state.project.value=project;expect(loadedProject.value).toBe(project);state.current.value={id:project,timezone:'Asia/Shanghai'};state.manage.value=true;calls=[];saved=undefined;postError=0;planError=0;wrongPlan=false;receiptError=0;holdPlan=undefined;setAccessToken('closed-initial-plan');vi.stubGlobal('fetch',vi.fn(fetcher))})
afterEach(()=>{view?.unmount();view=undefined;document.body.innerHTML='';setAccessToken('');vi.unstubAllGlobals()})
it('太阳创建使用29项负偏移和明确零坐标，默认ACTIVE且一POST后完整计划核对',async()=>{await setup();await draft('SOLAR',{solar:{event:'SUNSET',beforeMinutes:-360,position:{latitude:0,longitude:0}},repeat:'CUSTOM',days:[3,1],zoneKind:'CUSTOM',zone:'UTC'});await submit();await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe(`/devices/${device}`));expect(writes()).toHaveLength(1);const body=writes()[0]!.body;expect(body.enabled).toBe(true);expect(body.scheduleType).toBe('SOLAR');expect(body.initialSchedule).toEqual({mode:'SOLAR',timezoneMode:'CUSTOM',timezone:'UTC',weekdays:[1,3],solar:{event:'SUNSET',beforeMinutes:-360,latitude:0,longitude:0}});expect(body.runAt).toBeUndefined();expect(calls.filter(c=>c.path.endsWith('/console-schedule'))).toHaveLength(1);expect(calls.filter(c=>c.path.includes('/device-schedules/'))).toHaveLength(1)})
it('太阳原定义已读但计划503保持未知，按原ID只读恢复且不重建',async()=>{planError=503;await setup();await draft('SOLAR',{solar:{event:'SUNRISE',beforeMinutes:360,position:{latitude:31.2,longitude:121.4}}});await submit();await vi.waitFor(()=>expect(view!.text()).toContain('不要重复创建'));expect(button('创建').attributes('disabled')).toBeDefined();expect(await router.push('/away')).toBeTruthy();expect(writes()).toHaveLength(1);planError=0;await button('重新读取核对').trigger('click');await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe(`/devices/${device}`));expect(writes()).toHaveLength(1)})
it('太阳首次位置未确认或未知偏移在下一步前拒绝，没有POST',async()=>{await setup();await draft('SOLAR');await button('下一步').trigger('click');await flushPromises();expect(view!.text()).toContain('请先配置日出日落地点');expect(writes()).toHaveLength(0);await draft('SOLAR',{solar:{event:'SUNRISE',beforeMinutes:-15,position:{latitude:0,longitude:0}}});await button('下一步').trigger('click');await flushPromises();expect(view!.text()).toContain('前后偏移');expect(writes()).toHaveLength(0)})
