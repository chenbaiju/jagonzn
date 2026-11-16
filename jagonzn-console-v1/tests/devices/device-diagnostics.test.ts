import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {ref} from 'vue'
import {useDeviceDiagnostics} from '../../src/features/devices/use-device-diagnostics'
import Diagnostics from '../../src/features/devices/DeviceDiagnostics.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({project:null as any,current:null as any,session:null as any,permissions:null as any,control:null as any,api:vi.fn(),read:vi.fn(),write:vi.fn(),list:vi.fn()}))
vi.mock('@/core/session',async()=>{const {ref,reactive}=await import('vue');state.project=ref('00000000-0000-4000-8000-000000000010');state.current=ref({status:'ACTIVE'});state.session=reactive({user:{accountId:'actor',projectRole:'OWNER'}});state.permissions=ref([]);return{projectId:state.project,currentProject:state.current,session:state.session,can:(p:string)=>state.permissions.value.includes(p)}})
vi.mock('@/core/http',async()=>({...await vi.importActual('@/core/http'),api:state.api}))
const project='00000000-0000-4000-8000-000000000010',device='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003'
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const point=(enabled=false,version=0,clearGeneration=0,target=device)=>({deviceId:target,enabled,version,clearGeneration})
const empty=()=>encode({items:[],nextCursor:null,hasMore:false})
function observation(fragment='私有诊断片段'){return {id,origin:'PROTOCOL_OBSERVATION',deviceId:device,messageId:other,protocol:'MQTT',direction:'UP',messageType:'PROPERTY_REPORT',receivedAt:'2026-10-25T08:00:01Z',payloadFormat:'JSON',contentCodec:'JSON',contentState:'COMPLETE',originalBytes:50,processingStage:null,processingStatus:'RECEIVED',completedAt:null,errorCode:null,preview:JSON.stringify({message:fragment}),previewTruncated:false}}
function observationDetail(row:ReturnType<typeof observation>){const {preview,previewTruncated,...base}=row;return {...base,topic:null,httpPath:null,content:preview,errorBody:null,errorBodyState:null,summary:null,summaryTruncated:null,summarySampled:null}}

const deferred=()=>{let resolve!:(value:Uint8Array)=>void;const promise=new Promise<Uint8Array>(done=>resolve=done);return{promise,resolve}}
let wrapper:ReturnType<typeof mount>|undefined
const writes=()=>state.api.mock.calls.filter((call:any[])=>['put','delete'].includes(call[1]?.method))
const switcher=()=>wrapper!.findComponent({name:'ElSwitch'})
const button=(text:string)=>wrapper!.findAll('button').find(b=>b.text()===text||b.attributes('aria-label')===text)
async function click(text:string){expect(button(text)).toBeDefined();await button(text)!.trigger('click');await flushPromises()}
async function toggle(){await wrapper!.find('.el-switch').trigger('click');await flushPromises()}
async function render(){wrapper=mount(Diagnostics,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises()}
beforeEach(()=>{
 vi.clearAllMocks();state.project.value=project;state.current.value={status:'ACTIVE'};state.session.user={accountId:'actor',projectRole:'OWNER'};state.permissions.value=['device:read','device:update'];state.control=point()
 state.read.mockImplementation((target:string)=>Promise.resolve(encode({...state.control,deviceId:target})))
 state.list.mockResolvedValue(empty())
 state.write.mockImplementation((target:string,options:any)=>{state.control=options.method==='delete'?point(state.control.enabled,state.control.version+1,state.control.clearGeneration+1,target):point(options.body.enabled,state.control.version+1,state.control.clearGeneration,target);return Promise.resolve(encode(state.control))})
 state.api.mockImplementation((url:string,options:any)=>{const target=url.match(/\/devices\/([^/]+)/)![1]!;if(['put','delete'].includes(options?.method))return state.write(target,options);return url.endsWith('/diagnostic-control')?state.read(target):state.list(url,options)})
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML='';vi.useRealTimers()})
describe('真实诊断采集UI与清空CAS',()=>{
 it('Source状态图标只凭真实业务结果，接入预处理投递ACK与legacy均不显示成功',async()=>{
  const terminal={...observation(),processingStatus:'SUCCEEDED',completedAt:'2026-10-25T08:00:02Z'}
  const rows=[{...terminal,id:'00000000-0000-4000-8000-000000000009',processingStage:'PERSISTENCE'},
   {...terminal,id:'00000000-0000-4000-8000-000000000008',processingStage:'INGRESS',processingStatus:'REJECTED',errorCode:'40103'},
   ...['INGRESS','PREPROCESSING','DELIVERY'].map((processingStage,index)=>({...terminal,id:`00000000-0000-4000-8000-00000000000${7-index}`,processingStage})),
   {...observation(),id:'00000000-0000-4000-8000-000000000004',origin:'LEGACY_SUMMARY',payloadFormat:'UNKNOWN',contentCodec:null,contentState:'LEGACY_SUMMARY',originalBytes:null,processingStatus:'UNKNOWN'}]
  state.list.mockResolvedValueOnce(encode({items:rows,nextCursor:null,hasMore:false}));await render()
  expect(wrapper!.findAll('.diagnostic-message-status').map(icon=>icon.attributes('aria-label'))).toEqual(['消息状态：成功','消息状态：错误',...Array(4).fill('消息状态：未记录')])
  expect(wrapper!.findAll('.diagnostic-message-status.is-success')).toHaveLength(1);expect(wrapper!.findAll('.diagnostic-message-status.is-error')).toHaveLength(1)
  expect(wrapper!.findAll('th .cell').map(v=>v.text())).toEqual(['消息类型','消息','时间']);expect(state.api).toHaveBeenCalledTimes(2);expect(writes()).toHaveLength(0)
 })
 it('统一预览保留原消息列，同UUID来源分别开详情且列表不逐行请求全文',async()=>{
  const first=observation('完整内容'),legacy={...first,origin:'LEGACY_SUMMARY',payloadFormat:'UNKNOWN',contentCodec:null,contentState:'LEGACY_SUMMARY',originalBytes:null,processingStatus:'UNKNOWN',preview:'{"temperature":26.7}',previewTruncated:false}
  const {preview,previewTruncated,...legacyBase}=legacy;const oldDetail={...legacyBase,topic:null,httpPath:null,content:null,errorBody:null,errorBodyState:null,summary:preview,summaryTruncated:false,summarySampled:false}
  state.list.mockResolvedValueOnce(encode({items:[first,legacy],nextCursor:null,hasMore:false}));const original=state.api.getMockImplementation()!;state.api.mockImplementation((url:string,options:any)=>url.endsWith(`/diagnostic-observations/${id}`)?Promise.resolve(encode(options.query.origin==='LEGACY_SUMMARY'?oldDetail:observationDetail(first))):original(url,options))
  await render();expect(wrapper!.text()).toContain(first.preview);expect(wrapper!.text()).toContain('{"temperature":26.7}');expect(state.api).toHaveBeenCalledTimes(2)
  const links=wrapper!.findAll('button[aria-label="查看消息详情"]');expect(links).toHaveLength(2);await links[1]!.trigger('click');await flushPromises();expect(state.api.mock.calls.at(-1)![1].query).toEqual({origin:'LEGACY_SUMMARY'});expect(wrapper!.findComponent({name:'DeviceDiagnosticDetails'}).props('origin')).toBe('LEGACY_SUMMARY');expect(wrapper!.findComponent({name:'DeviceDiagnosticDetails'}).text()).toContain('历史脱敏片段');expect(writes()).toHaveLength(0)
 })
 it('列表只显示256码点安全预览并标截断，点击后才取完整正文',async()=>{
  const full=JSON.stringify({message:'中'.repeat(500)}),row={...observation(),preview:Array.from(full).slice(0,256).join(''),previewTruncated:true,originalBytes:new TextEncoder().encode(full).byteLength}
  state.list.mockResolvedValueOnce(encode({items:[row],nextCursor:null,hasMore:false}));const original=state.api.getMockImplementation()!;state.api.mockImplementation((url:string,options:any)=>url.endsWith(`/diagnostic-observations/${id}`)?Promise.resolve(encode({...observationDetail(row),content:full})):original(url,options))
  await render();expect(wrapper!.text()).toContain('预览已截断');expect(state.api).toHaveBeenCalledTimes(2);await click('查看消息详情');expect(wrapper!.get('pre[aria-label="完整安全消息内容"]').text()).toBe(full);expect(state.api).toHaveBeenCalledTimes(3);expect(writes()).toHaveLength(0)
 })
 it('采样未保留片段时不开放Source仅有内容才展示的详情入口',async()=>{const row={...observation(),origin:'LEGACY_SUMMARY',payloadFormat:'UNKNOWN',contentCodec:null,contentState:'UNSUPPORTED',originalBytes:null,processingStatus:'UNKNOWN',preview:null,previewTruncated:false};state.list.mockResolvedValueOnce(encode({items:[row],nextCursor:null,hasMore:false}));await render();expect(button('查看消息详情')).toBeUndefined();wrapper!.findComponent({name:'ElTable'}).vm.$emit('row-click',row);await flushPromises();expect(wrapper!.findComponent({name:'DeviceDiagnosticDetails'}).exists()).toBe(false)})
 it('消息详情接收当前设备日志及代次，撤销读取立即卸载并清私有片段',async()=>{
  const row=observation('私有诊断片段')
  state.list.mockResolvedValueOnce(encode({items:[row],nextCursor:null,hasMore:false}));const original=state.api.getMockImplementation()!;state.api.mockImplementation((url:string,options:any)=>url.endsWith(`/diagnostic-observations/${id}`)?Promise.resolve(encode(observationDetail(row))):original(url,options))
  await render();await click('查看消息详情');const details=wrapper!.findComponent({name:'DeviceDiagnosticDetails'});expect(details.props()).toMatchObject({deviceId:device,logId:id,generation:0});expect(details.text()).toContain('私有诊断片段');state.permissions.value=[];await flushPromises();expect(wrapper!.findComponent({name:'DeviceDiagnosticDetails'}).exists()).toBe(false);expect(wrapper!.text()).not.toContain('私有诊断片段')
 })
 it('自动只读刷新发现清空代次改变后关闭旧详情，不继续显示历史片段',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval']});const row=observation('已清空片段')
  state.list.mockResolvedValueOnce(encode({items:[row],nextCursor:null,hasMore:false}));const original=state.api.getMockImplementation()!;state.api.mockImplementation((url:string,options:any)=>url.endsWith(`/diagnostic-observations/${id}`)?Promise.resolve(encode(observationDetail(row))):original(url,options))
  await render();await click('自动刷新');await click('查看消息详情');expect(wrapper!.findComponent({name:'DeviceDiagnosticDetails'}).exists()).toBe(true);state.control=point(false,1,1);await vi.advanceTimersByTimeAsync(5000);await flushPromises();expect(wrapper!.findComponent({name:'DeviceDiagnosticDetails'}).exists()).toBe(false);expect(wrapper!.text()).not.toContain('已清空片段');expect(writes()).toHaveLength(0)
 })
 it('缺省关闭只读诊断端点、保留三列表头，不读取生产messages或自动写入',async()=>{
  await render();expect(switcher().props('modelValue')).toBe(false);expect(switcher().props('disabled')).toBe(false)
  expect(wrapper!.findAll('th .cell').map(v=>v.text())).toEqual(['消息类型','消息','时间']);expect(wrapper!.text()).toContain('暂无日志');expect(wrapper!.get('#diagnostic-capture-help').text()).toContain('最多保存 7 天');expect(wrapper!.find('.diagnostic-toolbar .el-switch').exists()).toBe(false);expect(button('自动刷新')!.attributes('aria-pressed')).toBe('false');await click('自动刷新');expect(button('自动刷新')!.attributes('aria-pressed')).toBe('true');await click('自动刷新');expect(button('自动刷新')!.attributes('aria-pressed')).toBe('false')
  expect(state.api.mock.calls.map((c:any[])=>c[0])).toEqual([`/api/v1/projects/${project}/devices/${device}/diagnostic-control`,`/api/v1/projects/${project}/devices/${device}/diagnostic-observations`]);expect(writes()).toHaveLength(0)
 })
 it.each(['OPERATOR','VIEWER'])('%s仍可读，写控件与迟到change回调均不能写',async role=>{
  state.session.user.projectRole=role;await render();expect(switcher().props('disabled')).toBe(true)
  switcher().vm.$emit('change',true);await flushPromises();await click('刷新诊断记录');expect(writes()).toHaveLength(0);expect(state.list).toHaveBeenCalledTimes(2)
 })
 it('归档项目仍可读且不写；MAX同样只读',async()=>{
  state.current.value={status:'ARCHIVED'};await render();expect(switcher().props('disabled')).toBe(true);expect(state.list).toHaveBeenCalledTimes(1)
  state.control=point(false,2147483647,0);state.current.value={status:'ACTIVE'};await flushPromises();expect(switcher().props('disabled')).toBe(true);expect(writes()).toHaveLength(0)
 })
 it('开关不乐观变化，权威2xx校验后才应用，原版本只写一次',async()=>{
  const wait=deferred();state.write.mockReturnValueOnce(wait.promise);await render();await toggle()
  expect(switcher().props('modelValue')).toBe(false);expect(switcher().props('loading')).toBe(true);expect(writes()[0]![1].body).toEqual({version:0,enabled:true})
  state.control=point(true,1);wait.resolve(encode(state.control));await flushPromises();expect(switcher().props('modelValue')).toBe(true);expect(writes()).toHaveLength(1)
 })
 it('清空须先确认且取消不写；确认只发原version并保留开关',async()=>{
  state.control=point(true,7,2);await render();await click('清空记录');expect(writes()).toHaveLength(0);await click('取消');expect(writes()).toHaveLength(0)
  await click('清空记录');await click('确定清空');expect(writes()).toHaveLength(1);expect(writes()[0]![1]).toMatchObject({method:'delete',body:{version:7}});expect(switcher().props('modelValue')).toBe(true)
 })
 it.each([new ApiError('版本冲突',409),new ApiError('服务器结果未知',500,undefined,undefined,true),new Error('连接中断')])('冲突或未知结果须显式GET/继续后另提新意图，不自动重放',async cause=>{
  state.write.mockRejectedValueOnce(cause);await render();await toggle();expect(writes()).toHaveLength(1);expect(switcher().props('disabled')).toBe(true)
  const reads=state.read.mock.calls.length;await click('刷新诊断记录');expect(state.read).toHaveBeenCalledTimes(reads)
  state.control=point(true,1);await click('读取当前状态');expect(switcher().props('modelValue')).toBe(false);expect(writes()).toHaveLength(1)
  await click('继续使用当前状态');expect(switcher().props('modelValue')).toBe(true);expect(writes()).toHaveLength(1)
  await toggle();expect(writes()).toHaveLength(2);expect(writes()[1]![1].body).toEqual({version:1,enabled:false})
 })
 it('坏2xx清空保持未知，禁止第二次清空和自动刷新',async()=>{
  await render();state.write.mockResolvedValueOnce(encode(point(false,1,0)));await click('清空记录');await click('确定清空')
  expect(wrapper!.text()).toContain('操作结果尚未确认');expect(writes()).toHaveLength(1);expect(button('清空记录')!.attributes('disabled')).toBeDefined()
 })
 it('写403保持写拒绝，当前状态继续后仍不能写；显式读403则清私有内容',async()=>{
  state.write.mockRejectedValueOnce(new ApiError('权限撤销',403));await render();await toggle();await click('读取当前状态');await click('继续使用当前状态');expect(switcher().props('disabled')).toBe(true)
  expect(wrapper!.text()).toContain('诊断写入权限已被拒绝');expect(writes()).toHaveLength(1)
  state.read.mockRejectedValueOnce(new ApiError('读取撤销',403));await click('刷新诊断记录');expect(wrapper!.text()).toContain('没有设备诊断的读取权限');expect(wrapper!.findAll('table')).toHaveLength(0)
 })
 it('旧写与旧finally不能更新新设备或清除新写busy',async()=>{
  const old=deferred(),next=deferred();state.write.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
  await render();await toggle();await wrapper!.setProps({deviceId:other});await flushPromises();await toggle();expect(writes()).toHaveLength(2)
  old.resolve(encode(point(true,1)));await flushPromises();expect(switcher().props('loading')).toBe(true);expect(switcher().props('modelValue')).toBe(false)
  state.control=point(true,1,0,other);next.resolve(encode(state.control));await flushPromises();expect(switcher().props('loading')).toBe(false);expect(switcher().props('modelValue')).toBe(true)
 })
 it.each(['project','identity','role','permission','archive'])('%s变化撤销草稿及迟到写回，不自动补发',async kind=>{
  const wait=deferred();state.write.mockReturnValueOnce(wait.promise);await render();await toggle()
  if(kind==='project')state.project.value=other;if(kind==='identity')changeIdentity();if(kind==='role')state.session.user.projectRole='VIEWER';if(kind==='permission')state.permissions.value=['device:read'];if(kind==='archive')state.current.value={status:'ARCHIVED'}
  await flushPromises();wait.resolve(encode(point(true,1)));await flushPromises();expect(writes()).toHaveLength(1);expect(wrapper!.text()).not.toContain('操作结果尚未确认')
 })
 it('读取精确摘要词法与平台接收时刻，刷新失败后不继续展示私有旧记录',async()=>{
  const row={...observation(),origin:'LEGACY_SUMMARY',payloadFormat:'UNKNOWN',contentCodec:null,contentState:'LEGACY_SUMMARY',originalBytes:null,processingStatus:'UNKNOWN',preview:'{"temperature":9007199254740993}',previewTruncated:false,receivedAt:'2026-10-25T01:00:00Z'}
  state.list.mockResolvedValueOnce(encode({items:[row],nextCursor:null,hasMore:false}));await render();expect(wrapper!.text()).toContain('9007199254740993');expect(wrapper!.text()).toContain('2026-10-25 09:00:00');expect(wrapper!.text()).not.toContain('2026-10-20')
  state.list.mockRejectedValueOnce(new Error('读取失败'));await click('刷新诊断记录');expect(wrapper!.text()).not.toContain('9007199254740993');expect(wrapper!.text()).not.toContain('暂无日志');expect(writes()).toHaveLength(0)
 })
 it('诊断范围准入：项目改变同tick的旧清空确认不提交',async()=>{
  await render();await click('清空记录')
  const oldConfirm=wrapper!.findAllComponents({name:'ElButton'}).find(b=>b.text()==='确定清空')!.vm.$.vnode.props!.onClick as ()=>void
  state.project.value=other;oldConfirm();await flushPromises();expect(writes()).toHaveLength(0)
  expect(wrapper!.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false)
 })
 it.each(['project','device','identity'] as const)('诊断范围准入：独立逻辑%s改变后不发送旧清空或旧控制状态',async mode=>{
  const target=ref(device);let diagnostics!:ReturnType<typeof useDeviceDiagnostics>
  wrapper=mount({setup(){diagnostics=useDeviceDiagnostics({device:()=>target.value,visible:()=>true,readable:()=>true,writable:()=>true});return()=>null}})
  await diagnostics.load();diagnostics.requestClear()
  if(mode==='project')state.project.value=other
  else if(mode==='device')target.value=other
  else changeIdentity()
  await diagnostics.confirmClear();await diagnostics.toggle(true);expect(writes()).toHaveLength(0)
  diagnostics.reset();await diagnostics.load();await diagnostics.toggle(true);expect(writes()).toHaveLength(1)
  expect(writes()[0]![0]).toBe(`/api/v1/projects/${state.project.value}/devices/${target.value}/diagnostic-control`)
 })
 it('诊断范围准入：已卸载逻辑的旧读取入口不再发送GET',async()=>{
  let diagnostics!:ReturnType<typeof useDeviceDiagnostics>
  wrapper=mount({setup(){diagnostics=useDeviceDiagnostics({device:()=>device,visible:()=>true,readable:()=>true,writable:()=>true});return()=>null}})
  await diagnostics.load();const count=state.api.mock.calls.length;wrapper.unmount();wrapper=undefined
  await diagnostics.load();await diagnostics.toggle(true);diagnostics.requestClear();await diagnostics.confirmClear()
  expect(state.api).toHaveBeenCalledTimes(count)
 })
 it.each(['loading','replacement'] as const)('诊断范围准入：%s时旧详情行不能打开新读取',async mode=>{
  const row=observation(),pending=deferred()
  state.list.mockResolvedValueOnce(encode({items:[row],nextCursor:null,hasMore:false}))
  const original=state.api.getMockImplementation()!;state.api.mockImplementation((url:string,options:any)=>url.endsWith(`/diagnostic-observations/${id}`)?Promise.resolve(encode(observationDetail(row))):original(url,options))
  await render()
  const oldOpen=wrapper!.findAllComponents({name:'ElButton'}).find(b=>b.attributes('aria-label')==='查看消息详情')!.vm.$.vnode.props!.onClick as (event:MouseEvent)=>void
  if(mode==='loading')state.read.mockReturnValueOnce(pending.promise)
  else state.list.mockResolvedValueOnce(encode({items:[{...row,contentState:'UNSUPPORTED',preview:null}],nextCursor:null,hasMore:false}))
  await click('刷新诊断记录');const count=state.api.mock.calls.length
  oldOpen(new MouseEvent('click'));await flushPromises();expect(state.api).toHaveBeenCalledTimes(count);expect(wrapper!.findComponent({name:'DeviceDiagnosticDetails'}).exists()).toBe(false)
  if(mode==='loading'){pending.resolve(encode(point()));await flushPromises()}
  state.list.mockResolvedValueOnce(encode({items:[row],nextCursor:null,hasMore:false}));await click('刷新诊断记录');await click('查看消息详情')
  expect(wrapper!.findComponent({name:'DeviceDiagnosticDetails'}).exists()).toBe(true);expect(writes()).toHaveLength(0)
 })

})
