import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { session } from '../../src/core/session'
import { ApiError, changeIdentity } from '../../src/core/http'
const api = vi.hoisted(() => ({ getRuleUsageStatistics: vi.fn(), getTaskUsageStatistics: vi.fn(), taskExecutions: vi.fn() }))
vi.mock('../../src/features/rules/api', () => api)
import Panel from '../../src/features/rules/UsageStatisticsPanel.vue'
import { usagePoints, taskUsageSummary } from '../../src/features/rules/statistics'
const Button = defineComponent({ props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' })
const Radio = defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<div><button @click="$emit(\'update:modelValue\', 3)">3天窗口</button></div>' })
const stubs = { ElButton: Button, ElRadioGroup: Radio, ElRadioButton: true, ElSkeleton: true, ElEmpty: true }
function sample(days=1) { const to='2026-10-24T00:00:00Z',start=Date.parse(to)-days*86400000; return { from:new Date(start).toISOString(),to,items:Array.from({length:days*24},(_,i)=>({hour:new Date(start+i*3600000).toISOString(),calls:i+1,actions:i===1?null:i+2})) } }
const statistics = sample()
let wrapper: ReturnType<typeof mount>
function identity(permissions: string[], project = 'p') { session.user = JSON.parse(JSON.stringify({ currentProjectId: project, permissions })) }
beforeEach(() => { Object.values(api).forEach(fn => fn.mockReset()); identity(['rule:manage', 'task:read']); api.getRuleUsageStatistics.mockImplementation((_project,_rule,days)=>Promise.resolve(sample(days))); api.getTaskUsageStatistics.mockImplementation((_project,_job,days)=>Promise.resolve({...sample(days),items:sample(days).items.map(row=>({...row,actions:2}))})); api.taskExecutions.mockResolvedValue([{ jobId:'job', id: 'one', startedAt: '2026-10-23T00:00:00Z' }, { jobId:'job', id: 'two', startedAt: '2026-10-23T01:00:00Z' }]) })
afterEach(() => { wrapper?.unmount(); session.user = null })
it('规则图读取生成接口并保留未知断线，切窗口取消旧请求并清旧图', async () => {
  wrapper = mount(Panel, { props: { kind: 'rule', id: 'rule' }, global: { stubs } }); await flushPromises()
  expect(api.getRuleUsageStatistics).toHaveBeenCalledWith('p', 'rule', 1, expect.any(AbortSignal)); expect(wrapper.findAll('[data-series="1"]')).toHaveLength(2)
  let resolve!: (value: unknown) => void; api.getRuleUsageStatistics.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  await wrapper.find('button').trigger('click'); await nextTick(); expect(wrapper.find('svg').exists()).toBe(false); expect(api.getRuleUsageStatistics.mock.calls[0][3].aborted).toBe(true)
  expect(api.getRuleUsageStatistics).toHaveBeenLastCalledWith('p', 'rule', 3, expect.any(AbortSignal)); resolve(sample(3)); await flushPromises(); expect(wrapper.find('svg').exists()).toBe(true)
})
it('任务只有运行次数曲线，总数和最后运行来自完整执行事实', async () => {
  wrapper = mount(Panel, { props: { kind: 'task', id: 'job' }, global: { stubs } }); await flushPromises()
  expect(api.getTaskUsageStatistics).toHaveBeenCalledWith('p', 'job', 1, expect.any(AbortSignal)); expect(api.taskExecutions).toHaveBeenCalledWith('p', 'job', expect.any(AbortSignal)); expect(wrapper.text()).toContain('总体统计'); expect(wrapper.text()).toContain('2026-10-23 09:00:00'); expect(wrapper.text()).toContain('总运行次数2'); expect(wrapper.findAll('[data-series="1"]')).toHaveLength(0); expect(wrapper.text()).toContain('任务运行次数'); expect(wrapper.text()).not.toContain('操作执行次数')
})
it('运行事实权限不读取规则管理统计，Viewer任务统计不依赖写权限', async () => {
  identity(['rule:read']); wrapper = mount(Panel, { props: { kind: 'rule', id: 'rule' }, global: { stubs } }); await flushPromises(); expect(api.getRuleUsageStatistics).not.toHaveBeenCalled()
  identity(['task:read']); await wrapper.setProps({ kind: 'task', id: 'job' }); await flushPromises(); expect(api.getTaskUsageStatistics).toHaveBeenCalledTimes(1)
})
it('刷新403清旧曲线，撤权后迟到结果不恢复', async () => {
  wrapper = mount(Panel, { props: { kind: 'rule', id: 'rule' }, global: { stubs } }); await flushPromises(); api.getRuleUsageStatistics.mockRejectedValueOnce(new ApiError('无权读取', 403))
  await wrapper.findAll('button').find(button => button.text() === '刷新')!.trigger('click'); await flushPromises(); expect(wrapper.find('svg').exists()).toBe(false); expect(wrapper.text()).toContain('无权读取')
  let resolve!: (value: unknown) => void; api.getRuleUsageStatistics.mockImplementationOnce(() => new Promise(done => { resolve = done })); await wrapper.findAll('button').find(button => button.text() === '重新读取')!.trigger('click'); identity(['rule:read']); await nextTick(); resolve(statistics); await flushPromises(); expect(wrapper.find('svg').exists()).toBe(false)
})
it('跨项目取消旧统计且迟到不覆盖新图，卸载取消读取', async () => {
  let resolve!: (value: unknown) => void; api.getRuleUsageStatistics.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  wrapper = mount(Panel, { props: { kind: 'rule', id: 'rule' }, global: { stubs } }); await nextTick(); changeIdentity(); identity(['rule:manage'], 'next'); await flushPromises(); resolve({ ...statistics, items: [{ hour: '2026-10-23T00:00:00Z', calls: 99, actions: 99 }] }); await flushPromises()
  expect(api.getRuleUsageStatistics).toHaveBeenLastCalledWith('next', 'rule', 1, expect.any(AbortSignal)); expect(wrapper.findAll('[data-series="1"]')).toHaveLength(2); const signal = api.getRuleUsageStatistics.mock.calls.at(-1)![3]; wrapper.unmount(); expect(signal.aborted).toBe(true)
})
it('损坏统计不伪造零，真实空执行的总数为0而最后时间为空', () => {
  expect(() => usagePoints({ from: statistics.from, to: statistics.to }, 'rule', 1)).toThrow(); expect(() => usagePoints({ ...statistics, items: [{ hour: '2026-10-23T00:00:00Z', calls: -1, actions: 0 }] }, 'rule', 1)).toThrow()
  expect(() => usagePoints({ ...statistics, items: [{ hour: '2026-10-23T00:00:00Z', calls: 1 }] }, 'rule', 1)).toThrow(); expect(taskUsageSummary([], 'job')).toEqual({ total: 0, latest: undefined }); expect(() => taskUsageSummary([{ id: 'broken' }] as never, 'job')).toThrow()
})

it('并行两个读取均拒绝时只向父发出一次当前范围失权事件',async()=>{
 api.getTaskUsageStatistics.mockRejectedValueOnce(new ApiError('统计被拒绝',403));api.taskExecutions.mockRejectedValueOnce(new ApiError('执行不存在',404));wrapper=mount(Panel,{props:{kind:'task',id:'job'},global:{stubs}});await flushPromises();expect(wrapper.emitted('denied')).toHaveLength(1);expect(wrapper.find('svg').exists()).toBe(false)
})

it('单场景统计读取真实合同四序列与NULL，切窗隔离晚回包并精确导出',async()=>{
 const {default:ScenePanel}=await import('../../src/features/rules/SceneStatisticsPanel.vue'),{default:SceneChart}=await import('../../src/features/rules/SceneUsageChart.vue')
 const http=await import('../../src/core/http'),exports=await import('../../src/features/devices/device-data-export'),sceneStatistics=await import('../../src/features/rules/scene-statistics-api')
 const project='10000000-0000-4000-8000-000000000001',scene='10000000-0000-7000-8000-000000000002',nextScene='10000000-0000-7000-8000-000000000003'
 function data(id=scene,days=1,total='9007199254740993'){
  const observedAt='2026-11-02T00:15:00Z',from=new Date(Date.parse(observedAt)-days*86400000).toISOString(),first=Math.floor(Date.parse(from)/3600000)*3600000
  return {sceneId:id,observedAt,totalRunCount:total,lastRunAt:'2026-11-01T23:00:00Z',window:{from,to:observedAt,days,bucketSeconds:3600},buckets:Array.from({length:days*24+1},(_,i)=>({hour:new Date(first+i*3600000).toISOString(),runSucceeded:i===0?'9007199254740993':'0',runFailed:'0',runSkipped:'0',runTerminated:null,runPending:i===0?'1':'0',runUnknown:i===0?'1':'0',actionAttrsPush:i===1?null:'1',actionAttrsUpdate:'0',actionTaskRun:'0',actionDelay:null,incompleteRunCount:i===0?'1':'0',unknownActionCount:'0'})),coverage:{complete:false,incompleteRunCount:'1',unknownActionCount:'0',unsupportedNodeTypes:[],limitations:['TERMINATED_AND_DELAY_NOT_OBSERVED']}}
 }
 identity(['rule:manage'],project);session.projects=[{id:project,status:'ARCHIVED'}]
 let release!:(value:unknown)=>void,hold=false
 const read=vi.spyOn(http,'api').mockImplementation(async(path,options)=>{const id=String(path).includes(nextScene)?nextScene:scene,days=Number(options?.query?.days??1);if(hold&&id===scene&&days===3){hold=false;return new Promise(done=>{release=done}) as never}return data(id,days,id===nextScene?'2':undefined) as never})
 const downloaded=vi.spyOn(exports,'downloadTabular').mockImplementation(()=>{})
 try{
  wrapper=mount(ScenePanel,{props:{id:scene,name:'真实场景'},global:{stubs}});await flushPromises()
  expect(read).toHaveBeenCalledWith(`/api/v1/projects/${project}/scenes/${scene}/usage-statistics`,expect.objectContaining({query:{days:1}}));expect(wrapper.text()).toContain('9007199254740993');expect(wrapper.text()).toContain('执行中 1 次，结果未确认 1 次')
  const charts=wrapper.findAllComponents(SceneChart);expect(charts).toHaveLength(2);expect(charts[0]!.props('series').map(row=>row.label)).toEqual(['完成','失败','跳过','被终止']);expect(charts[1]!.props('series').map(row=>row.label)).toEqual(['下发属性','更新属性','执行任务','延时']);expect(charts[0]!.props('series')[3]!.values.every(value=>value===null)).toBe(true);expect(charts[1]!.props('series')[0]!.values[1]).toBeNull();expect(charts[1]!.find('[data-series="actionDelay"]').findAll('rect')).toHaveLength(0)
  await charts[1]!.get('[aria-label="动作调用统计导出"]').trigger('click');const rows=downloaded.mock.lastCall![0];expect(rows[2]![1]).toBe('');expect(downloaded.mock.lastCall![4]).toBe('场景统计');const xml=new TextDecoder().decode(exports.tabularXlsx(sceneStatistics.sceneStatisticsRows(sceneStatistics.decodeSceneStatistics(data() as never,scene,1),'run'),'场景统计'));expect(xml).toContain('sheet name="场景统计"');expect(xml).toContain('9007199254740993');expect(xml).not.toContain('<f>');expect(xml).toContain('xml:space="preserve"></t>')
  const initial=read.mock.calls[0]![1]!.signal!;hold=true;await wrapper.find('button').trigger('click');await nextTick();expect(initial.aborted).toBe(true);expect(wrapper.find('svg').exists()).toBe(false)
  await wrapper.setProps({id:nextScene});await flushPromises();release(data(scene,3,'999'));await flushPromises();expect(wrapper.find('.scene-stat-summary').text()).toContain('运行次数2');expect(wrapper.find('.scene-stat-summary').text()).not.toContain('999')
  const broken=data(nextScene,3);delete (broken.buckets[0] as Record<string,unknown>).actionAttrsPush;expect(()=>sceneStatistics.decodeSceneStatistics(broken as never,nextScene,3)).toThrow()
  const v2={...data(),buckets:data().buckets.map((row,index)=>({...row,runTerminated:index===0?'2':'0',actionDelay:index===0?'1':'0'}))};const v2decoded=sceneStatistics.decodeSceneStatistics(v2 as never,scene,1);expect(v2decoded.run[3]!.values[0]).toBe('2');expect(v2decoded.action[3]!.values[0]).toBe('1');expect(v2decoded.notes.join(' ')).not.toContain('尚未统计');expect(v2decoded.notes.join(' ')).not.toContain('历史运行没有终止');expect(sceneStatistics.decodeSceneStatistics(data() as never,scene,1).notes.join(' ')).toContain('未统计值不按零计算')
  read.mockRejectedValueOnce(new ApiError('统计暂时读取失败',503));await wrapper.findAll('button').find(b=>b.text()==='刷新')!.trigger('click');await flushPromises();expect(wrapper.text()).toContain('统计暂时读取失败');expect(wrapper.find('svg').exists()).toBe(false)
 }finally{read.mockRestore();downloaded.mockRestore();session.projects=[]}
})
