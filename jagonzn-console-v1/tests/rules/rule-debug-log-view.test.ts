import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import RuleDebugLogView from '../../src/features/rules/RuleDebugLogView.vue'
import { ApiError,type RequestOptions } from '../../src/core/http'
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
const row={key:'log',deviceLabel:'温湿度设备',deviceHref:'/devices/d',ruleLabel:'温度规则',ruleHref:'/rules/messages/r',typeLabel:'—',operationLabel:'属性下发',at:'2026-10-24T00:00:00Z',resultLabel:'已提交',failed:false}
let wrapper:ReturnType<typeof mount>
async function open(props:Record<string,unknown>={}){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<p />'}}]});await router.push('/rules/executions');await router.isReady()
 wrapper=mount(RuleDebugLogView,{props:{rows:[],page:1,...props},attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises()
}
function button(label:string){const node=wrapper.findAll('button').find(b=>b.text()===label || b.attributes('aria-label')===label);if(!node)throw Error('missing '+label);return node}
afterEach(()=>{wrapper?.unmount();document.body.innerHTML=''})
it('项目空日志保留原站六列表头，不显示调试开关或假总数/页数',async()=>{
 await open({canClear:true});expect(wrapper.findAll('th').map(x=>x.text())).toEqual(['设备名称','规则名称','规则类型','操作类型','执行时间','执行结果']);expect(wrapper.text()).toContain('暂无日志');expect(wrapper.find('[role="switch"]').exists()).toBe(false);expect(button('上一页').attributes('disabled')).toBeDefined();expect(button('下一页').attributes('disabled')).toBeDefined();expect(wrapper.find('select').exists()).toBe(false)
})
it('详情四列，读取到关闭状态仍展示真实历史；链接保持自身设备与规则身份',async()=>{
 await open({singleRule:true,enabled:false,canClear:true,rows:[row]});expect(wrapper.findAll('th').map(x=>x.text())).toEqual(['设备名称','操作类型','执行时间','执行结果']);expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');expect(wrapper.text()).toContain('温湿度设备');expect(wrapper.find('a').attributes('href')).toBe('/devices/d');expect(wrapper.text()).toContain('已提交');expect(wrapper.text()).not.toContain('ACK');expect(wrapper.text()).not.toContain('暂无日志')
})
it('未读取到控制状态时不伪造关闭开关，控制读取失败可独立重读',async()=>{
 await open({singleRule:true,controlLoading:true});expect(wrapper.find('[role="switch"]').exists()).toBe(false);await wrapper.setProps({controlLoading:false,controlError:new ApiError('控制读取失败',503)});expect(wrapper.find('[role="switch"]').exists()).toBe(false);await button('重新读取').trigger('click');expect(wrapper.emitted('retryControl')).toHaveLength(1);expect(wrapper.emitted('toggle')).toBeUndefined()
})
it('实际开关发出所选布尔值，写入中/待核对状态均阻止再次变更',async()=>{
 await open({singleRule:true,enabled:false});await wrapper.find('[role="switch"]').trigger('click');expect(wrapper.emitted('toggle')).toEqual([[true]]);await wrapper.setProps({busy:true});expect(wrapper.find('[role="switch"]').attributes('aria-disabled')).toBe('true');await wrapper.find('[role="switch"]').trigger('click');expect(wrapper.emitted('toggle')).toHaveLength(1);await wrapper.setProps({busy:false,locked:true});await wrapper.find('[role="switch"]').trigger('click');expect(wrapper.emitted('toggle')).toHaveLength(1)
})
it('分页只允许存在的方向，有下一游标才允许前进',async()=>{
 await open({page:2,hasNext:true});await button('上一页').trigger('click');await button('下一页').trigger('click');expect(wrapper.emitted('previous')).toHaveLength(1);expect(wrapper.emitted('next')).toHaveLength(1);await wrapper.setProps({hasNext:false});expect(button('下一页').attributes('disabled')).toBeDefined()
})
it('读取失败遮住残留日志，不把失败当空结果；401/403边界由父层清除',async()=>{
 await open({rows:[row],error:new ApiError('日志读取失败',503),canClear:true});expect(wrapper.text()).toContain('日志读取失败');expect(wrapper.text()).not.toContain('温湿度设备');expect(wrapper.text()).not.toContain('暂无日志');expect(button('清空').attributes('disabled')).toBeDefined();await button('重新读取').trigger('click');expect(wrapper.emitted('refresh')).toHaveLength(1);await wrapper.setProps({forbidden:true});expect(wrapper.text()).toContain('当前账号没有此内容的读取权限');expect(wrapper.text()).not.toContain('日志读取失败')
})
it('清空先打开确认，取消与确定分开发出意图，忙时禁用取消/确定和其他写入',async()=>{
 await open({singleRule:true,enabled:true,canClear:true});await button('清空').trigger('click');expect(wrapper.emitted('openClear')).toHaveLength(1);expect(wrapper.emitted('confirmClear')).toBeUndefined();await wrapper.setProps({confirming:true});await flushPromises();expect(document.body.textContent).toContain('确认清空该规则的日志吗？');const buttons=()=>Array.from(document.body.querySelectorAll('button'));buttons().find(b=>b.textContent?.trim()==='取消')!.click();await flushPromises();expect(wrapper.emitted('cancelClear')).toHaveLength(1);buttons().find(b=>b.textContent?.trim()==='确定')!.click();await flushPromises();expect(wrapper.emitted('confirmClear')).toHaveLength(1);await wrapper.setProps({busy:true});await flushPromises();expect(buttons().find(b=>b.textContent?.trim()==='取消')!.disabled).toBe(true);expect(buttons().find(b=>b.textContent?.trim()==='确定')!.disabled).toBe(true);expect(button('刷新').attributes('disabled')).toBeDefined()
})
it('未知写结果锁定清空和开关，保留人工重新读取入口',async()=>{
 await open({singleRule:true,enabled:true,locked:true,writeError:'结果未知，请重新读取',canClear:true});expect(button('清空').attributes('disabled')).toBeDefined();await button('重新读取核对').trigger('click');expect(wrapper.emitted('reread')).toHaveLength(1);expect(wrapper.emitted('confirmClear')).toBeUndefined()
})
it('项目行显示六列真实标签，失败行不显示内部结果码或异常正文',async()=>{
 await open({rows:[{...row,resultLabel:'执行失败',failed:true}]});expect(wrapper.findAll('a').map(x=>x.attributes('href'))).toEqual(['/devices/d','/rules/messages/r']);expect(wrapper.text()).toContain('执行失败');expect(wrapper.find('.rule-debug-log-result').exists()).toBe(true);expect(wrapper.text()).not.toContain('RETRY_SCHEDULED');expect(wrapper.text()).not.toContain('PROPERTY_REPORT')
})

it('场景专用日志保开关及清空UNKNOWN原代次，只读核对并隔离迟到旧页',async()=>{
 const {default:SceneLogs}=await import('../../src/features/rules/SceneDebugLogPanel.vue'),http=await import('../../src/core/http'),{session}=await import('../../src/core/session')
 const project='10000000-0000-4000-8000-000000000001',scene='10000000-0000-7000-8000-000000000002',nextScene='10000000-0000-7000-8000-000000000003',execution='10000000-0000-7000-8000-000000000004',version='10000000-0000-7000-8000-000000000005',device='10000000-0000-4000-8000-000000000006'
 let control={sceneId:scene,enabled:false,version:'1',generation:'1'},empty=false,hold=false,release!:(value:unknown)=>void
 const entry={executionId:execution,versionId:version,sourceDeviceId:device,occurredAt:'2026-11-02T00:00:00Z',recordedAt:'2026-11-02T00:00:01Z',sourceStatus:'DISPATCHED',result:'PENDING',coverageComplete:true,durationMillis:null,actions:[],limitations:[]}
 const page=(id=scene)=>({sceneId:id,observedAt:'2026-11-02T00:01:00Z',page:1,pageSize:20,total:empty||id===nextScene?'0':'1',control:{...control,sceneId:id},items:empty||id===nextScene?[]:[entry]})
 const reads=vi.spyOn(http,'api').mockImplementation(async(path:string,options:RequestOptions={})=>{
  if(options?.method==='put'){expect(options.body).toEqual({enabled:true,expectedVersion:'1'});control={...control,enabled:true,version:'2'};throw new ApiError('开关未知',0,undefined,undefined,true)}
  if(options?.method==='post'){expect(options.body).toEqual({expectedVersion:'2'});control={...control,version:'3',generation:'2'};empty=true;throw new ApiError('清空未知',0,undefined,undefined,true)}
  if(String(path).endsWith('/debug-log-control'))return {...control} as never
  if(hold&&String(path).includes(scene)){hold=false;return new Promise(done=>{release=done}) as never}
  return page(String(path).includes(nextScene)?nextScene:scene) as never
 })
 try{
  session.user={currentProjectId:project,permissions:['rule:manage']};session.projects=[{id:project,status:'ACTIVE'}]
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<p />'}}]});await router.push(`/rules/scenes/${scene}`);await router.isReady()
  wrapper=mount(SceneLogs,{props:{id:scene},attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises();expect(wrapper.findAll('th')).toHaveLength(0);expect(wrapper.text()).toContain('耗时 未知');expect(wrapper.text()).toContain('执行中');expect(wrapper.text()).not.toContain('0ms');expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
  await wrapper.get('[role="switch"]').trigger('click');await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(button('清空').attributes('disabled')).toBeDefined()
  control={...control,generation:'2'};await button('重新读取核对').trigger('click');await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(reads.mock.calls.filter(([,o])=>String(o?.method)==='put')).toHaveLength(1)
  control={...control,generation:'1'};await button('重新读取核对').trigger('click');await flushPromises();expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
  await button('清空').trigger('click');await flushPromises();const confirm=Array.from(document.body.querySelectorAll('button')).find(b=>b.textContent?.trim()==='确定')!;expect(document.body.textContent).toContain('确认清空所有运行日志吗？');confirm.click();await flushPromises();expect(reads.mock.calls.filter(([,o])=>String(o?.method)==='post')).toHaveLength(1)
  await wrapper.setProps({inactive:true});await wrapper.setProps({inactive:false});await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);control={...control,generation:'1'};await button('重新读取核对').trigger('click');await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true])
  control={...control,generation:'2'};await button('重新读取核对').trigger('click');await flushPromises();expect(wrapper.text()).toContain('暂无执行日志');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(reads.mock.calls.filter(([,o])=>String(o?.method)==='post')).toHaveLength(1)
  hold=true;await button('刷新').trigger('click');await flushPromises();const signal=reads.mock.lastCall![1]!.signal!;await wrapper.setProps({id:nextScene});await flushPromises();empty=false;release(page());await flushPromises();expect(signal.aborted).toBe(true);expect(wrapper.text()).toContain('暂无执行日志');expect(wrapper.text()).not.toContain('耗时 未知');expect(reads.mock.calls.filter(([,o])=>o?.method)).toHaveLength(2)
  reads.mockImplementationOnce(async(_path,options)=>{expect(options?.method).toBe('put');expect(options?.body).toEqual({enabled:false,expectedVersion:'3'});throw new ApiError('请求受限，请稍后重试',429,undefined,undefined,false)})
  await wrapper.get('[role="switch"]').trigger('click');await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper.text()).toContain('请求受限');expect(wrapper.findAll('button').some(b=>b.text()==='重新读取核对')).toBe(false)
  await button('重新读取').trigger('click');await flushPromises();expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');expect(reads.mock.calls.filter(([,o])=>o?.method)).toHaveLength(3)
 }finally{reads.mockRestore();session.user=null;session.projects=[]}
})


it('场景V2日志按真实步骤展示延迟终止与已跳过，旧耗时仍未知',async()=>{
 const {default:SceneLogs}=await import('../../src/features/rules/SceneDebugLogPanel.vue'),{decodeSceneLogPage,sceneLogElapsed}=await import('../../src/features/rules/scene-debug-log-api'),editor=await import('../../src/features/rules/scene-editor-api'),http=await import('../../src/core/http'),{session}=await import('../../src/core/session')
 const project='10000000-0000-4000-8000-000000000001',scene='10000000-0000-7000-8000-000000000002',execution='10000000-0000-7000-8000-000000000004',version='10000000-0000-7000-8000-000000000005',device='10000000-0000-4000-8000-000000000006',effect='10000000-0000-7000-8000-000000000007'
 const at='2026-11-02T00:00:00Z',done='2026-11-02T00:00:10Z',nodes=[{nodeType:'scene-device-cloud-update-action',config:{deviceId:device,properties:{flag:true}}},{nodeType:'scene-delay-action',config:{durationSeconds:10}},{nodeType:'scene-device-property-set-action',config:{deviceId:device,properties:{flag:false}}},{nodeType:'scene-task-run-action',config:{deviceId:device,taskId:version}}]
 const action=(ordinal:number,result:string,acceptedAt:string|null,completedAt:string|null,durationMillis:number|null)=>({ordinal,nodeType:nodes[ordinal]!.nodeType,actionId:execution,targetDeviceId:ordinal===1?null:device,effectId:ordinal===0?effect:null,result,acceptedAt,completedAt,durationMillis})
 const entry={executionId:execution,versionId:version,sourceDeviceId:device,occurredAt:at,recordedAt:at,sourceStatus:'TERMINATED',result:'TERMINATED',coverageComplete:true,durationMillis:10001,actions:[action(0,'SUCCEEDED',at,at,0),action(1,'TERMINATED',at,done,10000),action(2,'FAILED',null,done,1),action(3,'NOT_RUN',null,done,null)],limitations:[]}
 const page={sceneId:scene,observedAt:'2026-11-02T00:01:00Z',page:1,pageSize:20,total:'1',control:{sceneId:scene,enabled:true,version:'1',generation:'1'},items:[entry]}
 const read=vi.spyOn(http,'api').mockResolvedValue(page as never),versionRead=vi.spyOn(editor,'readSceneVersion').mockResolvedValue({id:version,versionNumber:1,conditions:[],actions:nodes,deviceScope:{kind:'DEVICE',referenceId:device}} as never)
 try{
  session.user={currentProjectId:project,permissions:['rule:manage']};session.projects=[{id:project,status:'ACTIVE'}]
  const decoded=decodeSceneLogPage(page as never,scene,1);expect(decoded.items[0]!.actions.map(a=>a.result)).toEqual(['SUCCEEDED','TERMINATED','FAILED','NOT_RUN']);expect(decoded.items[0]!.actions[2]!.acceptedAt).toBeNull();expect(decoded.items[0]!.actions[2]!.durationMillis).toBe(1)
  for(const sourceStatus of ['QUEUED','RUNNING','WAITING','FAILED','SUCCEEDED','TERMINATED']){const inFlight=['QUEUED','RUNNING','WAITING'].includes(sourceStatus),actions=sourceStatus==='QUEUED'?[]:sourceStatus==='RUNNING'?[entry.actions[0]!]:sourceStatus==='WAITING'?[entry.actions[0]!,action(1,'PENDING',at,null,null)]:sourceStatus==='SUCCEEDED'?[entry.actions[0]!,action(1,'SUCCEEDED',at,done,10000)]:sourceStatus==='FAILED'?[entry.actions[0]!,action(1,'SUCCEEDED',at,done,10000),...entry.actions.slice(2)]:entry.actions,result=inFlight?'PENDING':sourceStatus;expect(()=>decodeSceneLogPage({...page,items:[{...entry,sourceStatus,result,actions,durationMillis:inFlight?null:10001}]} as never,scene,1)).not.toThrow()}
  const bad={...entry,actions:[{...entry.actions[1]!,acceptedAt:null}]};expect(()=>decodeSceneLogPage({...page,items:[bad]} as never,scene,1)).toThrow()
  expect(()=>decodeSceneLogPage({...page,items:[{...entry,actions:[{...entry.actions[3]!,acceptedAt:at}]}]} as never,scene,1)).toThrow()
  for(const change of [{nodeType:'scene-task-run-action'},{nodeType:'scene-device-property-set-action'},{targetDeviceId:device},{effectId:effect},{acceptedAt:null},{completedAt:null},{durationMillis:null}])expect(()=>decodeSceneLogPage({...page,items:[{...entry,actions:[{...entry.actions[1]!,...change}]}]} as never,scene,1)).toThrow()
  expect(()=>decodeSceneLogPage({...page,items:[{...entry,sourceStatus:'RUNNING'}]} as never,scene,1)).toThrow()
  const transport=decodeSceneLogPage({...page,items:[{...entry,actions:[{...entry.actions[0]!,result:'PENDING',completedAt:null,durationMillis:null}]}]} as never,scene,1);expect(transport.items[0]!.actions[0]!.result).toBe('PENDING')
  expect(()=>decodeSceneLogPage({...page,items:[{...entry,durationMillis:-1}]} as never,scene,1)).toThrow()
  const legacy=decodeSceneLogPage({...page,items:[{...entry,sourceStatus:'DISPATCHED',result:'PENDING',durationMillis:null,actions:[]}]} as never,scene,1);expect(legacy.items[0]!.durationMillis).toBeNull();expect(sceneLogElapsed(null)).toBe('未知');expect(sceneLogElapsed(0)).toBe('0ms');expect(sceneLogElapsed(1500)).toBe('1.5s');expect(sceneLogElapsed(60000)).toBe('1.0min')
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<p />'}}]});await router.push(`/rules/scenes/${scene}`);await router.isReady();wrapper=mount(SceneLogs,{props:{id:scene},attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises()
  expect(wrapper.text()).toContain('耗时 10.0s');expect(wrapper.text()).toContain('终止');await wrapper.get('.el-collapse-item__header').trigger('click');await flushPromises();expect(wrapper.findAll('.timeline-content')).toHaveLength(4);expect(wrapper.get('.status-icon.terminated').text()).toContain('终止');expect(wrapper.find('.status-icon.pending').exists()).toBe(false);expect(wrapper.text()).toContain('延迟等待');expect(wrapper.text()).toContain('延迟 10 秒');expect(wrapper.text()).toContain('已跳过');expect(wrapper.text()).not.toContain('开始执行');expect(wrapper.text()).not.toContain('条件检查');expect(read.mock.calls.every(([,options])=>!options?.method)).toBe(true)
 }finally{read.mockRestore();versionRead.mockRestore();session.user=null;session.projects=[]}
})
