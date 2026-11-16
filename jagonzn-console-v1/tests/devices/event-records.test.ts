import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus,{ElSelect} from 'element-plus'
import Events from '../../src/features/devices/DeviceEvents.vue'
import {ApiError,invalidateIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({api:vi.fn(),choices:vi.fn(),read:null as any,project:null as any}))
vi.mock('../../src/core/session',async()=>{const{ref}=await import('vue');state.read=ref(true);state.project=ref('project');return{projectId:state.project,can:(permission:string)=>permission==='device:read'&&state.read.value}})
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
vi.mock('../../src/features/devices/event-records-api',async()=>({...await vi.importActual('../../src/features/devices/event-records-api'),readEventChoices:state.choices}))
const device='00000000-0000-4000-8000-000000000001',message='00000000-0000-4000-8000-000000000002',model='00000000-0000-4000-8000-000000000003'
const encode=(x:unknown)=>new TextEncoder().encode(JSON.stringify(x))
function event(key='overheat',id=message){return{messageId:id,deviceId:device,deviceTypeId:model,eventKey:key,level:'WARNING',thingModelVersionId:model,modelVersion:'v1',eligibility:'HISTORY_ONLY',occurredAt:'2026-10-24T01:00:00Z',receivedAt:'2026-10-24T01:00:01Z',acceptedAt:'2026-10-24T01:00:02Z',params:{text:'<img src=x onerror=alert(1)>'},paramsRedacted:true,currentDefinitionName:null}}
function page(items=[event()],_legacyCursor:string|null=null,position=1){return encode({items,page:position,limit:24,windowFrom:'2026-10-23T00:00:00Z',windowTo:'2026-10-24T02:00:00Z',retentionDays:90})}
const wrappers:ReturnType<typeof mount>[]= []
function render(){const w=mount(Events,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);return w}
afterEach(()=>{wrappers.splice(0).forEach(w=>{if(w.exists())w.unmount()});document.body.innerHTML=''})
function button(w:ReturnType<typeof render>,label:string){return w.findAll('button').find(b=>b.text()===label)!}
function deferred(){let resolve!:(value:Uint8Array)=>void;const promise=new Promise<Uint8Array>(r=>resolve=r);return{promise,resolve}}
describe('事件筛选页码与真实详情组件',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.api.mockReset();state.read.value=true;state.project.value='project';state.choices.mockResolvedValue(['overheat','alarm']);state.api.mockImplementation((p:string)=>Promise.resolve(p.endsWith('/event-pages')?page():encode(event())))})
 it('默认窗口只在内部保留，不向后页补时间或展示TL时间筛选',async()=>{
  state.api.mockResolvedValueOnce(page([event()],'opaque')).mockResolvedValueOnce(page([event()],null,2))
  const w=render();await flushPromises();expect(w.find('input[placeholder="RFC3339，含时区"]').exists()).toBe(false);expect(w.text()).not.toContain('当前查询窗口');await w.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(state.api.mock.calls[1]![1].query).toMatchObject({eventKey:'',page:2});expect(state.api.mock.calls[1]![1].query.from).toBeUndefined();expect(state.api.mock.calls[1]![1].query.to).toBeUndefined();w.unmount()
 })
 it('Source事件空表保留列头/筛选与双箭头，只隐藏非Source分页功能',async()=>{
  state.api.mockResolvedValueOnce(page([]));const w=render();await flushPromises();expect(w.findAll('th').map(x=>x.text())).toEqual(['事件标识符','事件名称','事件上报时间','查看事件']);expect(w.text()).toContain('暂无数据');expect(w.find('.el-empty').exists()).toBe(false);expect(w.find('.event-toolbar .el-select').exists()).toBe(true);expect(w.find('.tl-pager .el-select').exists()).toBe(false);expect(w.find('.tl-pager__page').exists()).toBe(false);expect(w.findAll('.tl-pager button').map(x=>x.attributes('aria-label'))).toEqual(['上一页','下一页']);expect(w.find('.tl-learning-resource a').attributes('href')).toContain('/device-manage/device-events.html');w.unmount()
 })
 it('事件选择立即从首页查询，后页及刷新保持相同原始过滤',async()=>{
  state.api.mockResolvedValueOnce(page()).mockResolvedValueOnce(page([event()],'next')).mockResolvedValueOnce(page([event()],null,2)).mockResolvedValueOnce(page())
  const w=render();await flushPromises();const select=w.findComponent(ElSelect);select.vm.$emit('update:modelValue','overheat');select.vm.$emit('change','overheat');await flushPromises();expect(state.api.mock.calls[1]![1].query).toMatchObject({eventKey:'overheat',page:1});await w.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(state.api.mock.calls[2]![1].query.eventKey).toBe('overheat');await button(w,'刷新').trigger('click');await flushPromises();expect(state.api.mock.calls[3]![1].query).toMatchObject({eventKey:'overheat',page:1});w.unmount()
 })
 it('无控制权限的可读成员可读事件，不请求命令或模型定义；参数与三个时钟可核对',async()=>{
  const w=render();await flushPromises();await button(w,'查看').trigger('click');await flushPromises();expect(state.api.mock.calls[1]![0]).toBe(`/api/v1/projects/project/devices/${device}/events/${message}`);expect(state.api.mock.calls[1]![1].query).toBeUndefined();expect(w.text()).toContain('部分参数已隐藏');expect(w.findAll('th').map(x=>x.text())).toEqual(['事件标识符','事件名称','事件上报时间','查看事件']);expect(w.findAll('dt').map(x=>x.text())).toEqual(['事件名称','事件消息','事件上报时间']);expect(w.text()).not.toContain('平台受理时间');expect(w.text()).not.toContain('2026-10-24 09:00:02');expect(w.find('img').exists()).toBe(false);expect(w.text()).toContain('<img src=x onerror=alert(1)>');expect(state.api.mock.calls.every(([p])=>p.includes('/events')||p.endsWith('/event-pages'))).toBe(true);w.unmount()
 })
 it('窗口缩短导致详情404时不回退摘要载荷，重试只读单条GET',async()=>{
  const w=render();await flushPromises();state.api.mockRejectedValueOnce(new ApiError('事件已不在可读窗口内',404)).mockResolvedValueOnce(encode(event()));await button(w,'查看').trigger('click');await flushPromises();expect(w.text()).toContain('事件已不在可读窗口内');expect(w.find('pre').exists()).toBe(false);await button(w,'重新读取').trigger('click');await flushPromises();expect(w.find('pre').exists()).toBe(true);expect(state.api).toHaveBeenCalledTimes(3);w.unmount()
 })
 it('模型筛选定义单独403不误封已经获准的事件事实读取',async()=>{
  state.choices.mockRejectedValueOnce(new ApiError('模型定义无读取权限',403));const w=render();await flushPromises();expect(w.text()).toContain('模型定义无读取权限');expect(w.text()).toContain('overheat');await button(w,'查看').trigger('click');await flushPromises();expect(w.find('pre').exists()).toBe(true);expect(w.text()).not.toContain('没有事件记录的读取权限');w.unmount()
 })
 it('分页400清旧行和旧next资格，回上一页仍用原查询',async()=>{
  state.api.mockResolvedValueOnce(page([event()],'next')).mockRejectedValueOnce(new ApiError('分页失效',400)).mockResolvedValueOnce(page())
  const w=render();await flushPromises();await w.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(w.text()).toContain('分页失效');expect(w.text()).not.toContain('overheat');expect(w.get('[aria-label="下一页"]').attributes('disabled')).toBeDefined();await w.get('[aria-label="上一页"]').trigger('click');await flushPromises();expect(state.api.mock.calls[2]![1].query.page).toBe(1);w.unmount()
 })
 it('两个消息快速切换/关闭，旧详情迟到不覆盖当前选择',async()=>{
  const late=deferred();state.api.mockResolvedValueOnce(page([event(),event('alarm',model)])).mockReturnValueOnce(late.promise).mockResolvedValueOnce(encode({...event('alarm',model),params:{marker:'当前消息原载荷'}}))
  const w=render();await flushPromises();await w.findAll('button').filter(b=>b.text()==='查看')[0]!.trigger('click');await w.findAll('button').filter(b=>b.text()==='查看')[1]!.trigger('click');await flushPromises();late.resolve(encode({...event(),params:{marker:'旧消息原载荷'}}));await flushPromises();expect(w.find('dl').text()).toContain('当前消息原载荷');expect(w.find('dl').text()).not.toContain('旧消息原载荷');await button(w,'关闭').trigger('click');await flushPromises();expect(w.find('dl').exists()).toBe(false);w.unmount()
 })
 it('切设备/项目/身份/失权都清除当前载荷与晚到资格',async()=>{
  for(const kind of ['device','project','identity','permission']){state.read.value=true;state.project.value='project';const late=deferred();state.api.mockReset().mockResolvedValueOnce(page()).mockReturnValueOnce(late.promise).mockResolvedValueOnce(page([]));const w=render();await flushPromises();await button(w,'查看').trigger('click');if(kind==='device')await w.setProps({deviceId:model});if(kind==='project')state.project.value='other';if(kind==='identity')invalidateIdentity();if(kind==='permission')state.read.value=false;await flushPromises();late.resolve(encode(event()));await flushPromises();expect(w.find('pre').exists()).toBe(false);w.unmount()}
 })
 it('权限不足零请求，实际403清除已展示内容并隐藏入口',async()=>{
  state.read.value=false;let w=render();await flushPromises();expect(state.api).not.toHaveBeenCalled();expect(w.text()).toContain('没有事件记录的读取权限');w.unmount();state.read.value=true;w=render();await flushPromises();state.api.mockRejectedValueOnce(new ApiError('失权',403));await button(w,'查看').trigger('click');await flushPromises();expect(w.text()).toContain('没有事件记录的读取权限');expect(w.text()).not.toContain('overheat');expect(w.find('pre').exists()).toBe(false);w.unmount()
 })
 it('事件空页下一页/上一页按真实页码读取，不把窗口改成下页过滤',async()=>{
  state.api.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([],null,2)).mockResolvedValueOnce(page([],null,3)).mockResolvedValueOnce(page([],null,2));const w=render();await flushPromises();for(const label of ['下一页','下一页','上一页']){await w.get(`[aria-label="${label}"]`).trigger('click');await flushPromises()}expect(state.api.mock.calls.map(([,o])=>o.query.page)).toEqual([1,2,3,2]);expect(state.api.mock.calls.every(([path,o])=>path.endsWith('/event-pages')&&!Object.hasOwn(o.query,'cursor')&&o.query.from===undefined&&o.query.to===undefined)).toBe(true);w.unmount()
 })

 it('当前名称不可确认时保留Source三行并显示—，不再把事件键称作名称',async()=>{
  const w=render();await flushPromises();await button(w,'查看').trigger('click');await flushPromises();const terms=[...document.querySelectorAll('.event-details dt')].map(e=>[e.textContent,e.nextElementSibling?.textContent]);expect(terms).toContainEqual(['事件名称','—']);expect(terms.map(row=>row[0])).toEqual(['事件名称','事件消息','事件上报时间']);w.unmount()
 })

 it.each(['device','refresh','project'] as const)('%s后旧行回调不得启动详情读取，新行仍可读',async mode=>{
  const w=render();await flushPromises()
  const stale=w.findAllComponents({name:'ElButton'}).find(b=>b.text()==='查看')!.vm.$.vnode.props!.onClick as ()=>void
  const target=mode==='device'?model:device
  state.api.mockImplementation((p:string)=>Promise.resolve(p.endsWith('/event-pages')?page([{...event(),deviceId:target}]):encode({...event(),deviceId:target})))
  if(mode==='device')await w.setProps({deviceId:target})
  else if(mode==='refresh')await button(w,'刷新').trigger('click')
  else {state.project.value='next';stale()}
  await flushPromises();expect(state.api).toHaveBeenCalledTimes(2)
  stale();await flushPromises();expect(state.api).toHaveBeenCalledTimes(2);expect(w.find('dl').exists()).toBe(false)
  await button(w,'查看').trigger('click');await flushPromises()
  expect(state.api).toHaveBeenCalledTimes(3);expect(state.api.mock.calls[2]![0]).toBe(`/api/v1/projects/${mode==='project'?'next':'project'}/devices/${target}/events/${message}`);expect(w.find('dl').exists()).toBe(true)
 })

})
