import {describe,it,expect,vi,beforeEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus,{ElSelect} from 'element-plus'
import PropertyHistoryExport from '../../src/features/devices/PropertyHistoryExport.vue'
import PropertyHistory from '../../src/features/devices/PropertyHistory.vue'
import CivilInput from '../../src/features/devices/HistoryRemovalDateTimeInput.vue'
import type {ObservationQuery} from '../../src/features/devices/property-observations-json'
const state=vi.hoisted(()=>({binding:vi.fn(),read:vi.fn()}))
vi.mock('../../src/core/session',async()=>{const{ref}=await import('vue');return{projectId:ref('project'),can:()=>true}})
vi.mock('../../src/features/devices/api',()=>({devicesApi:{binding:state.binding}}))
vi.mock('../../src/features/devices/property-observations-api',()=>({propertyObservations:state.read}))
const device='00000000-0000-4000-8000-000000000001',model='00000000-0000-4000-8000-000000000002',operation='00000000-0000-4000-8000-000000000003'
function wire(query:ObservationQuery,options:{more?:boolean;actor?:boolean;legacy?:boolean;value?:string}={}){
 const row={sourceKind:'PLATFORM_CLOUD_UPDATE',sourceId:operation,propertyKey:query.property,state:'VALUE',value:'RAW_VALUE',precision:'EXACT_PLATFORM_JSON',sourceModelVersionId:model,at:query.from,timeKind:'PLATFORM_ACCEPTED',commandId:null,actorId:options.actor?device:null,actorDisplayName:options.actor?'实际操作用户':null}
 if(options.legacy)Object.assign(row,{sourceKind:'DEVICE_REPORT',state:'SOURCE_VERSION_UNKNOWN',sourceModelVersionId:null,value:null,precision:'UNAVAILABLE',timeKind:'DEVICE_OCCURRED'})
 return new TextEncoder().encode(JSON.stringify({projectId:query.project,deviceId:query.device,modelVersionId:model,requestedFrom:query.from,requestedTo:query.to,reportedFrom:query.from,reportedTo:query.to,platformFrom:query.from,platformTo:query.to,items:[row],nextCursor:options.more?'signed-next':null,hasMore:!!options.more}).replace('"RAW_VALUE"',options.value||'9007199254740993'))
}
function render(){return mount(PropertyHistory,{props:{deviceId:device,propertyKey:'n',dataType:'NUMBER'},attachTo:document.body,global:{plugins:[ElementPlus]}})}
function button(w:ReturnType<typeof render>,label:string){return w.findAll('button').find(b=>b.text()===label)!}
describe('历史弹窗消费实际混合来源且隔离分页上下文',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.binding.mockImplementation((_p:string,id:string)=>Promise.resolve({deviceId:id,version:{id:model}}));state.read.mockImplementation((query:ObservationQuery)=>Promise.resolve(wire(query)))})
 it('绑定实际当前模型并保持精确值，默认不请求或展示操作用户',async()=>{
  const w=render();await flushPromises();expect(state.read.mock.calls[0]![0]).toMatchObject({project:'project',device,model,property:'n',limit:20,includeActor:false});expect(w.text()).toContain('9007199254740993');expect(w.text()).toContain('云端属性更新');expect(w.findAll('th .cell').map(c=>c.text())).toEqual(['时间','属性','值','属性类型']);expect(w.text()).not.toContain('导出当前页');w.unmount()
 })
 it('下一页仅用实际签名位置，用户选项更改后清空旧位置重查',async()=>{
  state.read.mockImplementation((query:ObservationQuery,cursor?:string)=>Promise.resolve(wire(query,{more:!cursor,actor:query.includeActor})));const w=render();await flushPromises();await w.find('button[aria-label="下一页"]').trigger('click');await flushPromises();expect(state.read.mock.calls[1]![1]).toBe('signed-next')
  await w.find('input[type="checkbox"]').setValue(true);await flushPromises();expect(state.read.mock.calls[2]![1]).toBeUndefined();expect(state.read.mock.calls[2]![0].includeActor).toBe(true);expect(w.text()).toContain('实际操作用户');expect(w.findAll('th .cell').map(c=>c.text())).toContain('操作用户');w.unmount()
 })
 it('真实ElementPlus紧凑箭头保留可访问名称与当前页及翻页行为',async()=>{
  state.read.mockImplementation((query:ObservationQuery,cursor?:string)=>Promise.resolve(wire(query,{more:!cursor})));const w=render();await flushPromises()
  const pager=w.find('nav[aria-label="属性历史分页"]');expect(pager.exists()).toBe(true)
  expect(pager.find('button[aria-label="上一页"] svg').exists()).toBe(true);expect(pager.find('[aria-current="page"]').text()).toBe('1');expect(pager.find('button[aria-label="下一页"] svg').exists()).toBe(true)
  await pager.find('button[aria-label="下一页"]').trigger('click');await flushPromises();expect(pager.find('[aria-current="page"]').text()).toBe('2');expect(pager.find('button[aria-label="上一页"]').attributes('disabled')).toBeUndefined()
  await pager.find('button[aria-label="上一页"]').trigger('click');await flushPromises();expect(pager.find('[aria-current="page"]').text()).toBe('1');expect(state.read.mock.calls[2]![1]).toBeUndefined();w.unmount()
 })
 it('刷新或换页失败清空旧行，不能继续导出或展示上一页值',async()=>{
  const w=render();await flushPromises();expect(w.text()).toContain('9007199254740993');state.read.mockRejectedValueOnce(new Error('历史读取失败'));await button(w,'刷新').trigger('click');await flushPromises();expect(w.text()).toContain('历史读取失败');expect(w.text()).not.toContain('9007199254740993');expect(w.find('button[aria-label="下一页"]').attributes('disabled')).toBeDefined();w.unmount()
 })
 it('设备变更后的迟到旧响应不能覆盖新设备记录',async()=>{
  let resolve!:(bytes:Uint8Array)=>void;let captured!:ObservationQuery;state.read.mockImplementationOnce((query:ObservationQuery)=>{captured=query;return new Promise(r=>{resolve=r})}).mockImplementation((query:ObservationQuery)=>Promise.resolve(wire(query,{value:'7'})))
  const w=render();await flushPromises();await w.setProps({deviceId:operation});await flushPromises();resolve(wire(captured));await flushPromises();expect(w.text()).toContain('7');expect(w.text()).not.toContain('9007199254740993');w.unmount()
 })
 it('日期范围更改从首页重查，三个已证筛选项映射真实来源并重置位置',async()=>{
  state.read.mockImplementation((query:ObservationQuery,cursor?:string)=>Promise.resolve(wire(query,{more:!cursor})));const w=render();await flushPromises();const pickers=w.findAllComponents(CivilInput),select=w.findComponent(ElSelect);expect(select.props('placeholder')).toBe('不限属性类型')
  const start=new Date('2026-10-01T00:00:00Z'),end=new Date('2026-10-24T00:00:00Z');pickers[0]!.vm.$emit('update:modelValue','2026-10-01 08:00:00');pickers[1]!.vm.$emit('update:modelValue','2026-10-24 08:00:00');pickers[1]!.vm.$emit('change');await flushPromises();expect(state.read.mock.calls[1]![0]).toMatchObject({from:start.toISOString(),to:end.toISOString()});expect(state.read.mock.calls[1]![1]).toBeUndefined()
  await w.find('button[aria-label="下一页"]').trigger('click');await flushPromises();expect(state.read.mock.calls[2]![1]).toBe('signed-next');select.vm.$emit('update:modelValue','PLATFORM_CLOUD_UPDATE');await flushPromises();expect(state.read.mock.calls[3]![0].source).toBe('PLATFORM_CLOUD_UPDATE');expect(state.read.mock.calls[3]![1]).toBeUndefined();w.unmount()
 })
 it('已开启用户时切换设备关闭选项且仅发一个新作用域读取',async()=>{
  state.read.mockImplementation((query:ObservationQuery)=>Promise.resolve(wire(query,{actor:query.includeActor})));const w=render();await flushPromises();await w.find('input[type="checkbox"]').setValue(true);await flushPromises();expect(state.read).toHaveBeenCalledTimes(2)
  await w.setProps({deviceId:operation});await flushPromises();expect(state.read).toHaveBeenCalledTimes(3);expect(state.read.mock.calls[2]![0].includeActor).toBe(false);expect(w.text()).not.toContain('实际操作用户');w.unmount()
 })
 it('legacy无版本原点显示来源未知，不借当前模型补成实际值',async()=>{
  state.read.mockImplementation((query:ObservationQuery)=>Promise.resolve(wire(query,{legacy:true})));const w=render();await flushPromises();expect(w.text()).toContain('来源版本未知');expect(w.text()).not.toContain('9007199254740993');w.unmount()
 })
 it('缺当前模型不发历史请求，不回退旧上报专属接口',async()=>{
  state.binding.mockResolvedValueOnce({deviceId:device});const w=render();await flushPromises();expect(state.read).not.toHaveBeenCalled();expect(w.text()).toContain('设备当前物模型不可用');w.unmount()
 })
 it('导出使用当前已验模型和完整窗口，不沿当前页或属性类型筛选',async()=>{
  state.read.mockImplementation((query:ObservationQuery,cursor?:string)=>Promise.resolve(wire(query,{more:!cursor})))
  const w=render();await flushPromises();await w.find('button[aria-label="下一页"]').trigger('click');await flushPromises();const select=w.findComponent(ElSelect);select.vm.$emit('update:modelValue','PLATFORM_CLOUD_UPDATE');await flushPromises()
  await button(w,'导出').trigger('click');await flushPromises();const exporter=w.findComponent(PropertyHistoryExport);expect(exporter.exists()).toBe(true);expect(exporter.props()).toMatchObject({deviceId:device,propertyKey:'n',modelVersionId:model});expect(exporter.props()).not.toHaveProperty('source');expect(exporter.props('from')).toBe(state.read.mock.calls.at(-1)![0].from)
  exporter.vm.$emit('unavailable',new (await import('../../src/core/http')).ApiError('导出读取失权',403));await flushPromises();expect(w.emitted('unavailable')).toHaveLength(1);expect(w.text()).not.toContain('9007199254740993');expect(w.findComponent(PropertyHistoryExport).exists()).toBe(false);w.unmount()
 })

 it('导出仅显示已证标量类型，复合类型/未知不扩展Source入口',async()=>{
  for(const type of ['NUMBER','TEXT','SWITCH','ENUM','OBJECT','LIST',undefined]){const w=render();await w.setProps({dataType:type});await flushPromises();expect(w.findAll('button').some(button=>button.text()==='导出')).toBe(['NUMBER','TEXT','SWITCH','ENUM'].includes(type||''));w.unmount()}
 })

 it('东八区民用时间草稿不逐字请求，确认后UTC窗口与导出范围相同',async()=>{const w=render();await flushPromises();const fields=w.findAllComponents(CivilInput);fields[0]!.vm.$emit('update:modelValue','2026-03-08 02:');fields[0]!.vm.$emit('update:modelValue','2026-03-08 02:30:00');fields[1]!.vm.$emit('update:modelValue','2026-03-08 03:30:00');await flushPromises();expect(state.read).toHaveBeenCalledTimes(1);expect(button(w,'导出').attributes('disabled')).toBeDefined();fields[1]!.vm.$emit('change');await flushPromises();expect(state.read).toHaveBeenCalledTimes(2);expect(state.read.mock.lastCall![0]).toMatchObject({from:'2026-03-07T18:30:00.000Z',to:'2026-03-07T19:30:00.000Z'});await button(w,'导出').trigger('click');await flushPromises();expect(w.findComponent(PropertyHistoryExport).props()).toMatchObject({from:'2026-03-07T18:30:00.000Z',to:'2026-03-07T19:30:00.000Z'});w.unmount()})
 it('无效或反序日期不读后端、不保留旧值或旧导出，修正后可恢复',async()=>{const w=render();await flushPromises();const fields=w.findAllComponents(CivilInput);fields[0]!.vm.$emit('update:modelValue','2026-02-30 00:00:00');fields[1]!.vm.$emit('change');await flushPromises();expect(state.read).toHaveBeenCalledTimes(1);expect(w.text()).not.toContain('9007199254740993');expect(w.text()).toContain('日期或时间无效');fields[0]!.vm.$emit('update:modelValue','2026-03-08 03:30:00');fields[1]!.vm.$emit('update:modelValue','2026-03-08 02:30:00');fields[1]!.vm.$emit('change');await flushPromises();expect(state.read).toHaveBeenCalledTimes(1);expect(w.text()).toContain('结束时间必须晚于起始时间');fields[1]!.vm.$emit('update:modelValue','2026-03-08 04:30:00');fields[1]!.vm.$emit('change');await flushPromises();expect(state.read).toHaveBeenCalledTimes(2);w.unmount()})

})
