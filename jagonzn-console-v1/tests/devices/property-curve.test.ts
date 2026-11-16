import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect,ElCheckbox,ElSwitch} from 'element-plus'
import PropertyCurve from '../../src/features/devices/PropertyCurve.vue'
import CivilInput from '../../src/features/devices/HistoryRemovalDateTimeInput.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
import type {SeriesQuery} from '../../src/features/devices/property-series-json'
import {seriesQuery,seriesWire,seriesDevice,seriesModel,seriesProject} from './property-series-fixture'
const state=vi.hoisted(()=>({binding:vi.fn(),api:vi.fn(),allowed:undefined as any}))
vi.mock('../../src/core/session',async()=>{const{ref}=await import('vue');state.allowed=ref(true);return{projectId:ref('00000000-0000-4000-8000-000000000010'),can:()=>state.allowed.value}})
vi.mock('../../src/features/devices/api',()=>({devicesApi:{binding:state.binding},devicePath:(project:string,device:string)=>`/api/v1/projects/${project}/devices/${device}`}))
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
const wrappers:VueWrapper[]=[]
function query(path:string,wire:any):SeriesQuery{return seriesQuery({device:path.split('/devices/')[1]!.split('/')[0]!,property:wire.propertyKey,model:wire.expectedModelVersionId,from:wire.from,to:wire.to,granularity:wire.granularity,aggregation:wire.aggregation})}
function render(extra:Record<string,unknown>={}){const w=mount(PropertyCurve,{props:{deviceId:seriesDevice,propertyKey:'n',...extra},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);return w}
function button(w:VueWrapper,name:string){return w.findAll('button').find(b=>b.text()===name||b.attributes('aria-label')===name)!}
function select(w:VueWrapper,name:string){return w.findAllComponents(ElSelect).find(s=>s.props('ariaLabel')===name)!}
function checkbox(w:VueWrapper,name:string){return w.findAllComponents(ElCheckbox).find(c=>c.text()===name)!}
describe('Source曲线真实组件控制与状态隔离',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.allowed.value=true;state.binding.mockImplementation((_p:string,id:string)=>Promise.resolve({deviceId:id,version:{id:seriesModel}}));state.api.mockImplementation((path:string,{query:wire}:any)=>Promise.resolve(seriesWire(query(path,wire))))})
 afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());vi.useRealTimers();document.body.innerHTML=''})
 it('默认最近1小时/RAW，真实点与线位于原viewBox且保留跨度，读取新公开端口',async()=>{
  const w=render();await flushPromises();const svg=w.find('svg[aria-label="属性历史曲线"]'),points=svg.findAll('circle').map(p=>[Number(p.attributes('cx')),Number(p.attributes('cy'))])
  expect(points).toHaveLength(3);for(const[x,y]of points){expect(x).toBeGreaterThanOrEqual(24);expect(x).toBeLessThanOrEqual(616);expect(y).toBeGreaterThanOrEqual(24);expect(y).toBeLessThanOrEqual(196)}
  expect(points[0]![0]).toBeLessThan(points[2]![0]!);expect(points[0]![1]).toBeGreaterThan(points[2]![1]!);expect(svg.find('g[data-series] path').attributes('d')).toBe(`M${points[0]!.join(',')} L${points[1]!.join(',')} L${points[2]!.join(',')}`)
  const call=state.api.mock.calls[0]!;expect(call[0]).toContain('/property-observations/series');expect(call[1]).toMatchObject({responseType:'bytes',maxResponseBytes:4194304,query:{expectedModelVersionId:seriesModel,granularity:'RAW',aggregation:'AVG'}});expect(Date.parse(call[1].query.to)-Date.parse(call[1].query.from)).toBe(3600000)
  expect(select(w,'时间预设').props('modelValue')).toBe('last_1h');expect(checkbox(w,'自动更新').props('modelValue')).toBe(false)
 })
 it('新查询/失败重试清除旧悬浮与图中点，不能导出旧成功帧',async()=>{
  const w=render();await flushPromises();await w.find('circle').trigger('focus');expect(w.find('.curve-hover').text()).toContain('1 个样本')
  state.api.mockRejectedValueOnce(new Error('历史查询失败'));await w.find('form').trigger('submit');await flushPromises();expect(w.text()).toContain('历史查询失败');expect(w.find('.curve-hover').exists()).toBe(false);expect(w.findAll('circle')).toHaveLength(0);expect(button(w,'导出').attributes('disabled')).toBeDefined()
  await button(w,'重新读取').trigger('click');await flushPromises();expect(w.find('.curve-hover').exists()).toBe(false);expect(w.findAll('circle')).toHaveLength(3)
 })
 it('设备切换后的迟到数据不覆盖新设备，也不读取当前绑定替换明确模型',async()=>{
  let resolve!:(bytes:Uint8Array)=>void,captured!:SeriesQuery;state.api.mockImplementationOnce((path:string,{query:wire}:any)=>{captured=query(path,wire);return new Promise(r=>resolve=r)}).mockImplementation((path:string,{query:wire}:any)=>Promise.resolve(seriesWire(query(path,wire),['7','8','9'])))
  const w=render({modelVersionId:seriesModel});await flushPromises();await w.setProps({deviceId:seriesModel});await flushPromises();resolve(seriesWire(captured,['10001','10002','10003']));await flushPromises();expect(w.text()).not.toContain('10001');expect(w.find('circle title').text()).toContain('7');expect(state.binding).not.toHaveBeenCalled()
 })
 it('多属性选择实际读取同窗口并停自动更新，折线/柱/散点及显示项有实际效果',async()=>{
  const w=render({properties:[{key:'n',name:'温度',dataType:'NUMBER'},{key:'b',name:'湿度',dataType:'NUMBER'},{key:'text',name:'文字',dataType:'TEXT'}]});await flushPromises()
  checkbox(w,'自动更新').vm.$emit('update:modelValue',true);await flushPromises();await button(w,'＋ 对比').trigger('click');select(w,'对比属性').vm.$emit('update:modelValue',['b']);await flushPromises();(Array.from(document.body.querySelectorAll('button')).find(node=>node.textContent?.trim()==='确定') as HTMLButtonElement).click();await flushPromises()
  expect(state.api.mock.calls.slice(-2).map(call=>call[1].query.propertyKey).sort()).toEqual(['b','n']);expect(w.findAll('g[data-series]')).toHaveLength(2);expect(checkbox(w,'自动更新').props('disabled')).toBe(true);expect(checkbox(w,'自动更新').props('modelValue')).toBe(false)
  await button(w,'柱状图').trigger('click');expect(w.findAll('g[data-series] rect')).toHaveLength(6);expect(w.findAll('g[data-series] path')).toHaveLength(0)
  checkbox(w,'标注数据点').vm.$emit('update:modelValue',false);await flushPromises();expect(w.findAll('circle')).toHaveLength(0)
  await button(w,'散点图').trigger('click');expect(w.findAll('circle')).toHaveLength(6)
  await button(w,'切换全屏').trigger('click');expect(w.find('.el-dialog').classes()).toContain('is-fullscreen')
 })
 it('三种失权响应清除并通知父页；身份变更和当前模型变更不保留可导出数据',async()=>{
  for(const status of [401,403,404]){state.api.mockRejectedValueOnce(new ApiError('no access',status));const w=render();await flushPromises();expect(w.emitted('unavailable')).toHaveLength(1);expect(w.emitted('close')).toBeTruthy();expect(w.findAll('circle')).toHaveLength(0);w.unmount();wrappers.pop()}
  const w=render({modelVersionId:seriesModel});await flushPromises();await w.setProps({modelVersionId:seriesDevice});expect(w.emitted('close')).toBeTruthy();expect(w.findAll('circle')).toHaveLength(0)
  const second=render();await flushPromises();changeIdentity();await flushPromises();expect(second.emitted('unavailable')).toBeTruthy();expect(second.findAll('circle')).toHaveLength(0)
 })
 it('权限实时撤回与关闭弹窗均取消旧请求，迟到回执不能复活图或导出',async()=>{
  let resolve!:(bytes:Uint8Array)=>void,captured!:SeriesQuery
  state.api.mockImplementationOnce((path:string,{query:wire}:any)=>{captured=query(path,wire);return new Promise(r=>resolve=r)})
  const w=render();await flushPromises();state.allowed.value=false;await flushPromises();resolve(seriesWire(captured,['999']));await flushPromises();expect(w.emitted('unavailable')).toBeTruthy();expect(w.findAll('circle')).toHaveLength(0);expect(button(w,'导出').attributes('disabled')).toBeDefined()
 })
 it('纵轴手动范围应用实际坐标并拒绝倒序，导出弹窗默认为真实Excel',async()=>{
  const w=render();await flushPromises();await button(w,'纵轴设置').trigger('click');await flushPromises()
  const minimum=w.findAllComponents(ElSwitch).find(item=>item.props('ariaLabel')==='n纵轴下限自动')!,maximum=w.findAllComponents(ElSwitch).find(item=>item.props('ariaLabel')==='n纵轴上限自动')!
  minimum.vm.$emit('update:modelValue',false);maximum.vm.$emit('update:modelValue',false);await flushPromises()
  await w.find('input[aria-label="n纵轴最小值"]').setValue('0');await w.find('input[aria-label="n纵轴最大值"]').setValue('4');expect(Number(w.findAll('circle')[0]!.attributes('cy'))).toBe(153)
  await w.find('input[aria-label="n纵轴最大值"]').setValue('-1');expect(w.text()).toContain('纵轴最小值必须小于最大值');expect(Number(w.findAll('circle')[0]!.attributes('cy'))).toBe(153)
  await button(w,'导出').trigger('click');await flushPromises();expect(document.body.textContent).toContain('导出文件类型');expect(document.body.querySelector<HTMLInputElement>('input[type="radio"][value="xlsx"]')?.checked).toBe(true)
 })
 it('自动更新只在单属性每15秒读当前窗口；卸载终止后续读取',async()=>{
  vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});vi.setSystemTime(new Date('2026-10-24T01:00:00Z'))
  const w=render();await flushPromises();checkbox(w,'自动更新').vm.$emit('update:modelValue',true);await flushPromises();expect(state.api).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(15000);await flushPromises();expect(state.api).toHaveBeenCalledTimes(2);expect(state.api.mock.calls[1]![1].query.to).toBe('2026-10-24T01:00:15.000Z')
  w.unmount();wrappers.pop();await vi.advanceTimersByTimeAsync(30000);expect(state.api).toHaveBeenCalledTimes(2)
 })
 it('曲线时间及悬浮沿公共东八区格式，原始时间属性保持不变',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-24T01:00:00Z'))
  const w=render();await flushPromises()
  expect(w.find('.curve-time-labels time').text()).toBe('2026-10-24 08:01:00')
  await w.find('circle').trigger('focus');expect(w.find('.curve-hover').text()).toContain('2026-10-24 08:01:00')
  expect(w.find('.curve-table time').attributes('datetime')).toBe('2026-10-24T00:01:00.000Z')
 })
 it('偶数点中位数发生有限精度舍入时与均值一样明确标近似',async()=>{
  state.api.mockImplementation((path:string,{query:wire}:any)=>Promise.resolve(seriesWire(query(path,wire),['9007199254740993.0000000001','9007199254740993.0000000001'],{},
   {sourceKind:'PLATFORM_CLOUD_UPDATE',timeKind:'PLATFORM_ACCEPTED',precision:'EXACT_PLATFORM_JSON'})))
  const w=render();await flushPromises();const values=w.findAll('.curve-statistics dl>div')
  expect(values.find(item=>item.find('dt').text()==='平均值')!.find('dd').text()).toMatch(/^≈/)
  expect(values.find(item=>item.find('dt').text()==='中位数')!.find('dd').text()).toMatch(/^≈/)
 })
 it('自选东八区文字在本地DST空洞也不偏移，草稿不逐字读取且不导出旧图',async()=>{const w=render();await flushPromises();const fields=w.findAllComponents(CivilInput);expect(fields).toHaveLength(2);fields[0]!.vm.$emit('update:modelValue','2026-03-08 02:');fields[0]!.vm.$emit('update:modelValue','2026-03-08 02:30:00');fields[1]!.vm.$emit('update:modelValue','2026-03-08 03:30:00');await flushPromises();expect(state.api).toHaveBeenCalledTimes(1);expect(w.findAll('g[data-series] path')).toHaveLength(0);expect(button(w,'导出').attributes('disabled')).toBeDefined();fields[1]!.vm.$emit('change');await flushPromises();expect(state.api).toHaveBeenCalledTimes(2);expect(state.api.mock.lastCall![1].query).toMatchObject({from:'2026-03-07T18:30:00.000Z',to:'2026-03-07T19:30:00.000Z'});expect(select(w,'时间预设').props('modelValue')).toBe('custom')})
 it('反序或非法日期阻止查询，改选真实预设恢复当前窗口及东八区文字',async()=>{const w=render();await flushPromises();const fields=w.findAllComponents(CivilInput);fields[0]!.vm.$emit('update:modelValue','2026-02-30 02:30:00');fields[1]!.vm.$emit('change');await flushPromises();expect(state.api).toHaveBeenCalledTimes(1);expect(w.text()).toContain('日期或时间无效');const preset=select(w,'时间预设');preset.vm.$emit('update:modelValue','last_1h');preset.vm.$emit('change');await flushPromises();expect(state.api).toHaveBeenCalledTimes(2);expect(fields[0]!.props('modelValue')).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:/);expect(w.text()).not.toContain('日期或时间无效')})

})
