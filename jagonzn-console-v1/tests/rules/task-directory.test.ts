import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {ElMessage} from 'element-plus'
import {computed,defineComponent,h,inject,provide,reactive,type ComputedRef} from 'vue'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
const api=vi.hoisted(()=>({listTasks:vi.fn(),saveTask:vi.fn(),saveTaskInformation:vi.fn(),deleteTask:vi.fn(),enableTask:vi.fn(),disableTask:vi.fn(),runTask:vi.fn(),taskExecutions:vi.fn()}))
const navigate=vi.hoisted(()=>vi.fn())
const replace=vi.hoisted(()=>vi.fn())
const routeState=reactive<{query:import('vue-router').LocationQuery}>({query:{}})
vi.mock('../../src/features/rules/api',()=>api)
vi.mock('vue-router',()=>({useRouter:()=>({push:navigate,replace}),useRoute:()=>routeState}))
import Tasks from '../../src/features/rules/TasksPage.vue'
const Row=defineComponent({props:['row'],setup(props,{slots}){provide('row',computed(()=>props.row));return()=>h('div',{'data-row':props.row.id},slots.default?.())}})
const Table=defineComponent({props:['data'],setup(props,{slots}){return()=>h('div',props.data?.map((row:unknown)=>h(Row,{row},slots.default)))}})
const Column=defineComponent({props:['prop'],setup(props,{slots}){const row=inject<ComputedRef>('row')!;return()=>h('div',slots.default?.({row:row.value}) || (props.prop?String(row.value[props.prop]??''):''))}})
const Button=defineComponent({props:['disabled','loading'],template:'<button :disabled="disabled || loading"><slot/></button>'})
const Select=defineComponent({props:['modelValue','disabled'],emits:['update:modelValue'],template:'<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\',typeof modelValue===\'number\' ? Number($event.target.value) : $event.target.value)"><slot/></select>'})
const Option=defineComponent({props:['value','label'],template:'<option :value="value">{{label}}</option>'})
const Alert=defineComponent({props:['title'],template:'<div>{{title}}<slot/></div>'})
const Dialog=defineComponent({props:['modelValue'],template:'<section v-if="modelValue" role="dialog"><slot/><slot name="footer"/></section>'})
const Confirm=defineComponent({props:['title'],emits:['confirm'],template:'<span><slot name="reference"/></span>'})
const Switch=defineComponent({props:['modelValue','disabled'],emits:['change'],template:'<button role="switch" :aria-checked="String(modelValue)" :disabled="disabled" @click="$emit(\'change\',!modelValue)" />'})
const stubs={ElSwitch:Switch,ElTable:Table,ElTableColumn:Column,ElButton:Button,ElSelect:Select,ElOption:Option,ElAlert:Alert,ElDialog:Dialog,ElPopconfirm:Confirm,ElEmpty:defineComponent({props:['description'],template:'<div>{{description}}<slot/></div>'}),ElSkeleton:true,ElForm:true,ElFormItem:true,ElInput:true}
const jobs=[{id:'a',name:'显式设备任务',targetType:'EXPLICIT_DEVICES',status:'ACTIVE'},{id:'b',name:'设备类型任务',targetType:'DEVICE_TYPE',status:'PAUSED'},{id:'c',name:'多组任务',targetType:'DEVICE_GROUPS',status:'ACTIVE'},{id:'d',name:'旧单组任务',targetType:'DEVICE_GROUP',status:'PAUSED'},{id:'e',name:'旧全体任务',targetType:'ALL_DEVICES',status:'ACTIVE'},{id:'f',name:'未知任务',targetType:'FUTURE',status:'FUTURE'}].map(row=>({...row,version:4,commandKey:'set',input:{},scheduleType:'CRON',cronExpression:'0 * * * * *',timezone:'Asia/Shanghai'}))
let wrapper:ReturnType<typeof mount>
function button(text:string){const found=wrapper.findAll('button').find(b=>b.text()===text);if(!found)throw new Error('missing '+text);return found}
function ids(){return wrapper.findAll('[data-row]').map(r=>r.attributes('data-row'))}
function target(){return wrapper.find<HTMLSelectElement>('select[aria-label="任务目标类型"]')}
function status(){return wrapper.find<HTMLSelectElement>('select[aria-label="任务状态"]')}
async function open(extra={}){wrapper=mount(Tasks,{props:extra,global:{stubs}});await flushPromises()}
beforeEach(()=>{Object.values(api).forEach(mock=>mock.mockReset());navigate.mockReset();replace.mockReset();routeState.query={};navigate.mockImplementation((value:unknown)=>{if(value&&typeof value==='object'&&'query' in value)routeState.query=value.query as import('vue-router').LocationQuery;return Promise.resolve()});replace.mockImplementation((value:{query:import('vue-router').LocationQuery})=>{routeState.query=value.query;return Promise.resolve()});session.user=JSON.parse('{"currentProjectId":"p","permissions":["task:read","task:manage","task:run"]}');api.listTasks.mockResolvedValue(jobs);api.taskExecutions.mockResolvedValue([])})
afterEach(()=>{wrapper?.unmount();ElMessage.closeAll();session.user=null})
it('目标/状态取交集并支持恢复不限，完整数组只读一次且不发写请求',async()=>{
 await open();expect(ids()).toEqual(['a','b','c','d','e','f']);expect(wrapper.text()).toContain('任务 (6)');await target().setValue('device-groups');expect(ids()).toEqual(['c','d']);await status().setValue('ACTIVE');expect(ids()).toEqual(['c']);await target().setValue('');expect(ids()).toEqual(['a','c','e']);await status().setValue('');expect(ids()).toHaveLength(6);expect(api.listTasks).toHaveBeenCalledTimes(1);for(const name of ['saveTask','saveTaskInformation','runTask','enableTask','disableTask','deleteTask'] as const)expect(api[name]).not.toHaveBeenCalled()
})
it('组详情只显示当前组的单组和多组任务，筛选和刷新保留范围',async()=>{
 const groupId='20000000-0000-4000-8000-000000000001', otherId='20000000-0000-4000-8000-000000000002'
 api.listTasks.mockResolvedValue([
  {...jobs[0],targetDeviceIds:[groupId]},
  {...jobs[2],targetGroupIds:[otherId,groupId]},
  {...jobs[3],targetGroupId:groupId,actionType:'PROPERTY_SET',commandKey:null},
  {...jobs[3],id:'another-group',targetGroupId:otherId},
  jobs[4]
 ])
 await open({groupId})
 expect(ids()).toEqual(['c','d'])
 expect(wrapper.get('[data-row="c"] .task-card-status').text()).toBe('已启用')
 expect(wrapper.get('[data-row="d"] .task-card-status').text()).toBe('已停用')
 expect(wrapper.find('[role="switch"]').exists()).toBe(false)
 expect(target().exists()).toBe(false)
 await wrapper.get('select[aria-label="任务类型"]').setValue('edge')
 expect(ids()).toEqual([])
 await wrapper.get('select[aria-label="任务类型"]').setValue('')
 await status().setValue('PAUSED')
 expect(ids()).toEqual(['d'])
 await wrapper.get('select[aria-label="任务类型"]').setValue('cmd_send')
 expect(ids()).toEqual([])
 expect(wrapper.find('.group-task-empty').exists()).toBe(false)
 await wrapper.get('select[aria-label="任务类型"]').setValue('attrs_push')
 await button('刷新').trigger('click');await flushPromises()
 expect(ids()).toEqual(['d'])
 expect(status().element.value).toBe('PAUSED')
 await wrapper.get('.task-card-name').trigger('click')
 expect(navigate).toHaveBeenCalledWith({path:'/tasks/jobs/d',query:{deviceGroupId:groupId}})
})
it('卡片使用真实命令目标与定时事实，名称导航且启停复用原接口，未知状态不误启用',async()=>{
 api.listTasks.mockResolvedValue([{...jobs[0],scheduleType:'MANUAL',nextRunAt:'2099-01-01T00:00:00Z'},{...jobs[1],scheduleType:'ONCE'},jobs[5]]);await open();expect(wrapper.find('.task-directory-table').exists()).toBe(false);expect(ids()).toEqual(['a','b','f']);const first=wrapper.find('[data-row="a"]');expect(first.text()).toContain('命令下发 - 设备');expect(first.text()).toContain('关闭定时');expect(first.text()).not.toContain('2099');expect(wrapper.find('[data-row="b"]').text()).toContain('只运行一次');await first.find('.task-card-name').trigger('click');expect(navigate).toHaveBeenCalledExactlyOnceWith('/tasks/jobs/a');api.disableTask.mockResolvedValue(undefined);await first.find('[role="switch"]').trigger('click');await flushPromises();expect(api.disableTask).toHaveBeenCalledExactlyOnceWith('p','a');expect(document.body.querySelector('.el-message')?.textContent).toContain('操作已保存');expect(wrapper.text()).not.toContain('操作已保存');expect(api.listTasks).toHaveBeenCalledTimes(2);expect(api.enableTask).not.toHaveBeenCalled();await target().setValue('devices');expect(ids()).toEqual(['a']);await target().setValue('');const unknown=wrapper.find('[data-row="f"]');expect(unknown.find('[role="switch"]').exists()).toBe(false);expect(unknown.find('[aria-label="任务状态无法识别"]').text()).toBe('—');expect(unknown.text()).toContain(' - —');expect(api.saveTask).not.toHaveBeenCalled();expect(api.runTask).not.toHaveBeenCalled()
})
it('启停后台回读保持现有卡片顺序，使用服务端新状态并接纳新增和移除',async()=>{
 let resolve!:(value:unknown)=>void
 api.listTasks.mockResolvedValueOnce(jobs.slice(0,3)).mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
 api.disableTask.mockResolvedValue(undefined)
 await open();await wrapper.get('[data-row="a"] [role="switch"]').trigger('click');await flushPromises()
 expect(ids()).toEqual(['a','b','c'])
 expect(target().attributes('disabled')).toBeUndefined()
 expect(status().attributes('disabled')).toBeUndefined()
 expect(wrapper.get('select[aria-label="任务类型"]').attributes('disabled')).toBeUndefined()
 expect(button('创建任务').attributes('disabled')).toBeDefined()
 expect(button('刷新').attributes('disabled')).toBeDefined()
 expect(wrapper.find('.task-header-switching').exists()).toBe(true)
 resolve([{...jobs[2]}, {...jobs[0],status:'PAUSED'}, {...jobs[4]}]);await flushPromises()
 expect(ids()).toEqual(['a','c','e'])
 expect(wrapper.get('[data-row="a"] [role="switch"]').attributes('aria-checked')).toBe('false')
 expect(api.disableTask).toHaveBeenCalledExactlyOnceWith('p','a')
})
it('启停请求在途时卡片不卸载且开关立即反馈，失败后恢复原状态',async()=>{
 let reject!:(reason:unknown)=>void
 api.disableTask.mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail}))
 await open();const card=wrapper.get('[data-row="a"]').element
 await wrapper.get('[data-row="a"] [role="switch"]').trigger('click')
 expect(wrapper.get('[data-row="a"]').element).toBe(card)
 expect(wrapper.get('[data-row="a"] [role="switch"]').attributes('aria-checked')).toBe('false')
 expect(wrapper.get('.task-directory-cards').classes()).toContain('is-switching')
 reject(new ApiError('停用失败',503));await flushPromises()
 expect(wrapper.get('[data-row="a"]').element).toBe(card)
 expect(wrapper.get('[data-row="a"] [role="switch"]').attributes('aria-checked')).toBe('true')
 expect(wrapper.text()).toContain('停用失败')
})

it('第二/三页后改变筛选回到首页，总数只用真实匹配集合',async()=>{
 api.listTasks.mockResolvedValue(Array.from({length:70},(_,n)=>({...jobs[0],id:'job'+n,name:'任务'+n,targetType:n===69?'DEVICE_GROUPS':'EXPLICIT_DEVICES'})));await open();await wrapper.find('button[aria-label="第 3 页"]').trigger('click');expect(ids()).toHaveLength(22);await target().setValue('device-groups');expect(ids()).toEqual(['job69']);expect(wrapper.find('[aria-current="page"]').text()).toBe('1');expect(wrapper.text()).toContain('任务 (1)');expect(api.listTasks).toHaveBeenCalledTimes(1)
})
it('切项目清理旧筛选和旧数组，不让旧名称条件污染新项目',async()=>{
 api.listTasks.mockResolvedValueOnce(jobs).mockResolvedValueOnce([{...jobs[0],id:'new',name:'新项目任务'}]);await open();await target().setValue('device-types');await status().setValue('PAUSED');expect(ids()).toEqual(['b']);session.user={...session.user!,currentProjectId:'next'};await flushPromises();expect(target().element.value).toBe('');expect(status().element.value).toBe('');expect(ids()).toEqual(['new']);expect(wrapper.text()).not.toContain('设备类型任务');expect(api.listTasks.mock.calls[0][1].aborted).toBe(true)
})
it('刷新保留筛选，加载时不冒充新计数，空匹配与真实空目录分别显示',async()=>{
 let resolve!:(v:unknown)=>void;api.listTasks.mockResolvedValueOnce(jobs).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));await open();await target().setValue('device-types');await button('刷新').trigger('click');expect(target().attributes('disabled')).toBeDefined();expect(wrapper.text()).not.toContain('任务 (1)');resolve([jobs[0]]);await flushPromises();expect(target().element.value).toBe('device-types');expect(wrapper.text()).toContain('没有匹配的任务');expect(wrapper.text()).toContain('任务 (0)');await target().setValue('');expect(ids()).toEqual(['a'])
})
it('失败读取不显示伪0，明确重读真实空数组后才显示空目录',async()=>{
 api.listTasks.mockRejectedValueOnce(new ApiError('读取失败',503)).mockResolvedValueOnce([]);await open();expect(wrapper.text()).toContain('读取失败');expect(wrapper.text()).not.toContain('任务 (0)');await button('重新读取').trigger('click');await flushPromises();expect(wrapper.text()).toContain('任务 (0)');expect(wrapper.text()).toContain('让设备批量或定时执行任务')
})
it('正式入口隐藏技术执行明细，internal参数不能越过全局关闭开关',async()=>{
 await open({internal:true});expect(wrapper.findAll('button').some(b=>b.text()==='执行记录')).toBe(false);expect(wrapper.text()).not.toContain('执行标识');expect(api.taskExecutions).not.toHaveBeenCalled();expect(wrapper.find('[placeholder="搜索任务"]').exists()).toBe(false);await wrapper.find('[data-row="a"] button').trigger('click');expect(navigate).toHaveBeenCalledWith('/tasks/jobs/a')
})
it('只读成员仍能筛选和读取中文状态，无管理入口；撤权迟到不恢复目录',async()=>{
 session.user={...session.user!,permissions:['task:read']};await open();expect(wrapper.text()).not.toContain('ACTIVE');expect(wrapper.findAll('button').some(b=>['编辑','运行','运行任务','移除'].includes(b.text()))).toBe(false);await status().setValue('PAUSED');expect(ids()).toEqual(['b','d']);let resolve!:(v:unknown)=>void;api.listTasks.mockImplementationOnce(()=>new Promise(done=>{resolve=done}));await button('刷新').trigger('click');changeIdentity();session.user={...session.user!,permissions:[]};await flushPromises();resolve(jobs);await flushPromises();expect(ids()).toHaveLength(0);expect(wrapper.text()).toContain('读取权限')
})

it('三类任务按正式动作显示，五类型URL本地组合分页，非法URL和坏kind明确错误不冒0',async()=>{
 const values=Array.from({length:60},(_,n)=>({...jobs[0],id:'kind'+n,name:'类型任务'+n,actionType:n%2?'COMMAND':'PROPERTY_SET',commandKey:n%2?'set':null,targetType:n%3?'EXPLICIT_DEVICES':'DEVICE_TYPE',status:n%4?'PAUSED':'ACTIVE'}));values.push({...values[0],id:'cloud-kind',name:'固定云更新',actionType:'CLOUD_UPDATE',commandKey:null,targetType:'DEVICE_TYPE',status:'ACTIVE'});api.listTasks.mockResolvedValue(values);routeState.query={task_type:'attrs_push'};await open();const type=()=>wrapper.find<HTMLSelectElement>('select[aria-label="任务类型"]');expect(type().findAll('option').map(o=>o.text())).toEqual(['不限任务类型','属性下发','属性更新','命令下发','自定义数据下发','边缘任务']);expect(wrapper.text()).toContain('任务 (30)');expect(wrapper.find('[data-row="kind0"]').text()).toContain('属性下发 - 设备类型');await wrapper.find('button[aria-label="第 2 页"]').trigger('click');expect(ids()).toHaveLength(6);await target().setValue('device-types');expect(ids()).toHaveLength(10);expect(wrapper.find('[aria-current="page"]').text()).toBe('1');await status().setValue('ACTIVE');expect(ids()).toHaveLength(5);await status().setValue('');await type().setValue('cmd_send');await flushPromises();expect(routeState.query.task_type).toBe('cmd_send');expect(ids()).toHaveLength(10);expect(wrapper.find('[data-row="kind3"]').text()).toContain('命令下发 - 设备类型');await type().setValue('attrs_update');await flushPromises();expect(routeState.query.task_type).toBe('attrs_update');expect(ids()).toEqual(['cloud-kind']);expect(wrapper.find('[data-row="cloud-kind"]').text()).toContain('属性更新 - 设备类型');for(const kind of ['data_set','edge']){await type().setValue(kind);await flushPromises();expect(routeState.query.task_type).toBe(kind);expect(wrapper.text()).toContain('任务 (0)');expect(wrapper.text()).toContain('没有匹配的任务')};expect(api.listTasks).toHaveBeenCalledTimes(1)
 for(const invalid of ['FUTURE',['cmd_send','attrs_push'],null,'']){routeState.query={task_type:invalid};await flushPromises();expect(wrapper.text()).toContain('任务类型筛选无效');expect(wrapper.text()).not.toContain('任务 (0)');expect(ids()).toHaveLength(0)}await button('清除任务类型筛选').trigger('click');await flushPromises();expect(routeState.query.task_type).toBeUndefined();expect(ids()).toHaveLength(21);await target().setValue('');expect(wrapper.text()).toContain('任务 (61)')
 await type().setValue('attrs_update');await flushPromises();api.listTasks.mockResolvedValueOnce([...values,{...values[0],actionType:'FUTURE'}]);await button('刷新').trigger('click');await flushPromises();expect(wrapper.text()).toContain('任务类型或内容不一致');expect(wrapper.text()).not.toContain('任务 (0)');expect(ids()).toHaveLength(0);expect(api.listTasks).toHaveBeenCalledTimes(2)
 api.listTasks.mockResolvedValueOnce([{...values[0],id:'new-project'}]);changeIdentity();session.user={...session.user!,currentProjectId:'next'};await flushPromises();expect(routeState.query.task_type).toBeUndefined();expect(type().element.value).toBe('');expect(ids()).toEqual(['new-project']);expect(api.listTasks).toHaveBeenCalledTimes(3);for(const name of ['saveTask','saveTaskInformation','runTask','enableTask','disableTask','deleteTask'] as const)expect(api[name]).not.toHaveBeenCalled()
})

it('第四类DATA可筛选并打开运行弹窗，设备摘要不要求正文也不冒命令',async()=>{
 api.listTasks.mockResolvedValue([...jobs.slice(0,1),{...jobs[1],id:'data-kind',name:'固定数据任务',actionType:'DATA_DOWNLINK',commandKey:null,input:{protocol:'TCP',streamIdentifier:'raw-a',format:'HEX',message:'01aa'},status:'ACTIVE'}]);routeState.query={task_type:'data_set'};await open();expect(ids()).toEqual(['data-kind']);expect(wrapper.get('[data-row="data-kind"]').text()).toContain('自定义数据下发 - 设备类型');expect(wrapper.text()).toContain('任务 (1)')
 await wrapper.get('[data-row="data-kind"] button').trigger('click');expect(navigate).toHaveBeenCalledWith('/tasks/jobs/data-kind');await wrapper.get('[data-row="data-kind"]').findAll('button').find(x=>x.text().includes('运行任务'))!.trigger('click');await flushPromises();const dialog=wrapper.get('[role="dialog"]');expect(dialog.text()).toContain('确定');expect(dialog.text()).not.toContain('不代表设备业务执行成功');expect(api.runTask).not.toHaveBeenCalled()
 const {deviceTaskDefinitionPage}=await import('../../src/features/rules/device-task-definition-port');const {taskActionLabel}=await import('../../src/features/rules/models')
 const page=deviceTaskDefinitionPage({items:[{id:'10000000-0000-4000-8000-000000000001',name:'数据摘要',status:'ACTIVE',version:1,targetType:'EXPLICIT_DEVICES',createdAt:'2026-11-02T00:00:00Z',actionType:'DATA_DOWNLINK',commandKey:null}],hasMore:false},[]);expect(taskActionLabel(page.items[0])).toBe('自定义数据下发');expect(page.items[0]).not.toHaveProperty('input')
 for(const bad of [null,'FUTURE'])expect(()=>taskActionLabel({actionType:bad,commandKey:null})).toThrow();expect(()=>taskActionLabel({actionType:'DATA_DOWNLINK',commandKey:'fake-command'})).toThrow()
})
