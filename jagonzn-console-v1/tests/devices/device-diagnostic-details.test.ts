import {copySucceeded} from '../../src/ui/copy-feedback'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Component from '../../src/features/devices/DeviceDiagnosticDetails.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
vi.mock('../../src/ui/copy-feedback',()=>({copySucceeded:vi.fn(),copyFailed:vi.fn()}))
const state=vi.hoisted(()=>({project:null as any,session:null as any,readable:null as any,row:null as any,api:vi.fn(),copy:vi.fn()}))
vi.mock('@/core/session',async()=>{const {ref,reactive}=await import('vue');state.project=ref('00000000-0000-4000-8000-000000000010');state.session=reactive({user:{accountId:'actor',projectRole:'OWNER'}});state.readable=ref(true);return {projectId:state.project,session:state.session,can:(permission:string)=>permission==='device:read'&&state.readable.value}})
vi.mock('@/core/http',async()=>({...await vi.importActual('@/core/http'),api:state.api}))
const device='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003'
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
function row(){return {id,origin:'PROTOCOL_OBSERVATION',deviceId:device,messageId:other,protocol:'MQTT',direction:'UP',topic:'safe/report',httpPath:null,payloadFormat:'JSON',contentCodec:'JSON',contentState:'REDACTED',content:'{"n":9007199254740993.1200,"s":"中"}',originalBytes:999,errorCode:'BAD_VALUE',receivedAt:'2026-10-25T08:00:01Z',messageType:'PROPERTY_REPORT',processingStage:'PERSISTENCE',processingStatus:'FAILED',completedAt:'2026-10-25T08:00:02Z',errorBody:null,errorBodyState:null,summary:null,summaryTruncated:null,summarySampled:null}}
function legacyRow(){return {...row(),origin:'LEGACY_SUMMARY',topic:null,payloadFormat:'UNKNOWN',contentCodec:null,contentState:'LEGACY_SUMMARY',content:null,originalBytes:null,errorCode:null,processingStage:null,processingStatus:'UNKNOWN',completedAt:null,summary:'{"temperature":26.7000}',summaryTruncated:true,summarySampled:false}}
const deferred=()=>{let resolve!:(value:Uint8Array)=>void;const promise=new Promise<Uint8Array>(done=>resolve=done);return {promise,resolve}}
let wrapper:ReturnType<typeof mount>|undefined
async function render(origin:'PROTOCOL_OBSERVATION'|'LEGACY_SUMMARY'='PROTOCOL_OBSERVATION'){wrapper=mount(Component,{props:{deviceId:device,logId:id,origin,generation:0},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises()}
function facts(){const terms=wrapper!.findAll('dt'),descriptions=wrapper!.findAll('dd');return Object.fromEntries(terms.map((term,index)=>[term.text(),descriptions[index]!.text()]))}
beforeEach(()=>{vi.clearAllMocks();state.copy.mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:state.copy}});state.readable.value=true;state.session.user={accountId:'actor',projectRole:'OWNER'};state.row=row();state.api.mockImplementation((path:string)=>{const match=path.match(/\/devices\/([^/]+)\/diagnostic-observations\/([^/]+)$/)!;return Promise.resolve(encode({...state.row,deviceId:match[1],id:match[2]}))})})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML=''})
describe('消息诊断只读详情',()=>{
 it.each(['INGRESS','PREPROCESSING','DELIVERY'])('%s的ACK不展示业务成功或TL阶段前缀',async processingStage=>{
  state.row={...row(),processingStatus:'SUCCEEDED',processingStage,errorCode:null};await render()
  expect(facts()['消息状态']).toBe('未记录');expect(wrapper!.find('.diagnostic-status.is-unknown').exists()).toBe(true)
  for(const hidden of ['成功','接入受理','预处理','下行投递'])expect(wrapper!.text()).not.toContain(hidden)
 })
 it('legacy只有公开错误码时展示错误图标，缺失错误码仍不推成功',async()=>{
  state.row={...legacyRow(),errorCode:'40103'};await render('LEGACY_SUMMARY');expect(facts()['消息状态']).toBe('错误');expect(wrapper!.find('.diagnostic-status.is-error').exists()).toBe(true);expect(wrapper!.text()).not.toContain('成功')
 })
 it('按Source660查看消息弹窗呈现已知字段，隐藏TL阶段时钟Trace和字节数',async()=>{
  await render();expect(wrapper!.findComponent({name:'ElDialog'}).props()).toMatchObject({title:'查看消息',width:'min(660px,96vw)'});expect(wrapper!.findComponent({name:'ElDrawer'}).exists()).toBe(false);expect(facts()).toEqual({'消息 ID':other,'消息类型':'属性上报','消息状态':'错误','消息时间':'2026-10-25 16:00:01.000','请求方式':'MQTT','MQTT 发布 Topic':'safe/report'});expect(wrapper!.text()).toContain('完整内容，已移除凭据字段');expect(wrapper!.get('pre[aria-label="完整安全消息内容"]').text()).toBe(state.row.content)
  for(const hidden of ['平台受理时间','解析时间','处理时间','下发时间','回复时间','Trace ID','原始载荷字节数','日志 ID'])expect(wrapper!.text()).not.toContain(hidden)
  expect(state.api.mock.calls.every((call:any[])=>!call[1]?.method)).toBe(true)
 })
 it('已知原格式仅标签不加转换radio，复制完整安全正文保留原数词法',async()=>{
  await render();expect(wrapper!.findComponent({name:'ElRadioGroup'}).exists()).toBe(false);expect(wrapper!.get('pre[aria-label="完整安全消息内容"]').text()).toContain('9007199254740993.1200');expect(wrapper!.text()).not.toContain('HEX');expect(wrapper!.text()).not.toContain('Plaintext')
  await wrapper!.get('button[aria-label="复制消息内容"]').trigger('click');await flushPromises();expect(state.copy).toHaveBeenCalledExactlyOnceWith(state.row.content);expect(copySucceeded).toHaveBeenCalledExactlyOnceWith('已复制内容');expect(wrapper!.text()).not.toContain('已复制内容');expect(state.api).toHaveBeenCalledTimes(1)
 })
 it('缺失成功标记不推成功，平台毫秒时刻不换成设备ts或上报时间',async()=>{state.row={...row(),errorCode:null,processingStage:null,processingStatus:'RECEIVED',completedAt:null,receivedAt:'2026-10-25T08:00:01.123456Z'};await render();expect(facts()['消息时间']).toBe('2026-10-25 16:00:01.123');expect(facts()['消息状态']).toBe('未记录');expect(wrapper!.text()).not.toContain('成功');expect(wrapper!.text()).not.toContain('上报时间');expect(wrapper!.text()).not.toContain('1970')})
 it('采样且无摘要时只显示真实事实，不伪造空JSON或HEX',async()=>{state.row={...legacyRow(),contentState:'UNSUPPORTED',summarySampled:true,summary:null};await render('LEGACY_SUMMARY');expect(wrapper!.text()).toContain('本条为采样记录');expect(wrapper!.find('pre[aria-label="完整安全消息内容"]').exists()).toBe(false);expect(wrapper!.findComponent({name:'ElRadioGroup'}).exists()).toBe(false)})
 it.each(['OPERATOR','VIEWER'])('%s按读取权限可看详情，所有请求均为GET',async role=>{state.session.user.projectRole=role;await render();expect(facts()['消息 ID']).toBe(other);expect(state.api).toHaveBeenCalledTimes(1);expect(state.api.mock.calls[0]![1].method).toBeUndefined()})
 it('404只提示清空过期或不可见，不使用列表缓存或生产messages回退',async()=>{state.api.mockRejectedValueOnce(new ApiError('不存在',404));await render();expect(wrapper!.text()).toContain('已清空、过期或不可见');expect(wrapper!.find('pre').exists()).toBe(false);expect(state.api).toHaveBeenCalledTimes(1);expect(state.api.mock.calls[0]![0]).toContain('/diagnostic-observations/')})
 it('403清除详情并向父页传播失权，初始失权零请求',async()=>{state.api.mockRejectedValueOnce(new ApiError('成员撤销',403));await render();expect(wrapper!.emitted('denied')).toHaveLength(1);expect(wrapper!.find('dd').exists()).toBe(false);wrapper!.unmount();state.api.mockClear();state.readable.value=false;await render();expect(state.api).not.toHaveBeenCalled()})
 it('切换记录后迟到结果不能覆盖新记录，身份变化清除私有片段并关闭',async()=>{const wait=deferred();state.api.mockReturnValueOnce(wait.promise);await render();await wrapper!.setProps({logId:other});await flushPromises();expect(state.api.mock.calls.at(-1)![0]).toContain(`/diagnostic-observations/${other}`);expect(facts()['消息 ID']).toBe(other);wait.resolve(encode({...row(),content:'旧记录私有片段'}));await flushPromises();expect(wrapper!.text()).not.toContain('旧记录私有片段');changeIdentity();await flushPromises();expect(wrapper!.emitted('close')).toHaveLength(1);expect(wrapper!.find('dd').exists()).toBe(false)})
 it('真实持久化成功显示Source状态与图标，JSON原格式标签与完整正文可复制',async()=>{state.row={...row(),processingStatus:'SUCCEEDED',errorCode:null};await render();expect(facts()['消息状态']).toBe('成功');expect(wrapper!.findComponent({name:'ElTag'}).text()).toBe('JSON');await wrapper!.get('button[aria-label="复制消息内容"]').trigger('click');await flushPromises();expect(state.copy).toHaveBeenCalledExactlyOnceWith(state.row.content)})
 it('HTTP拒绝展示真实路径和完整安全公开错误体，不拼MQTT Topic或成功状态',async()=>{state.row={...row(),protocol:'HTTP',topic:null,httpPath:'/api/v1/device/properties',processingStage:'INGRESS',processingStatus:'REJECTED',errorCode:'40103',errorBody:'{"code":40103,"message":"类型错误"}',errorBodyState:'REDACTED'};await render();expect(facts()['消息状态']).toBe('错误');expect(facts()['HTTP API Path']).toBe('/api/v1/device/properties');expect(facts()['MQTT 发布 Topic']).toBeUndefined();expect(wrapper!.text()).toContain(state.row.errorBody);expect(wrapper!.text()).not.toContain('成功')})
 it('legacy26.7只展示并复制历史片段，不能误成JSON原格式或权威处理成功',async()=>{state.row=legacyRow();await render('LEGACY_SUMMARY');expect(wrapper!.get('pre[aria-label="脱敏消息片段"]').text()).toBe('{"temperature":26.7000}');expect(wrapper!.text()).toContain('历史脱敏片段，内容已截断');expect(wrapper!.findComponent({name:'ElTag'}).exists()).toBe(false);expect(facts()['消息状态']).toBe('未记录');expect(wrapper!.find('pre[aria-label="完整安全消息内容"]').exists()).toBe(false);await wrapper!.get('button[aria-label="复制消息片段"]').trigger('click');await flushPromises();expect(state.copy).toHaveBeenCalledExactlyOnceWith(state.row.summary)})
 it('同UUID切换origin必须重新精确读取，原来源迟到正文不能污染legacy',async()=>{const pending=deferred();state.api.mockReturnValueOnce(pending.promise);await render();state.row=legacyRow();await wrapper!.setProps({origin:'LEGACY_SUMMARY'});await flushPromises();expect(state.api.mock.calls.at(-1)![1].query).toEqual({origin:'LEGACY_SUMMARY'});expect(wrapper!.text()).toContain('26.7000');pending.resolve(encode({...row(),content:'旧来源私有内容'}));await flushPromises();expect(wrapper!.text()).not.toContain('旧来源私有内容');expect(wrapper!.find('pre[aria-label="完整安全消息内容"]').exists()).toBe(false)})
 it('诊断范围准入：卸载详情后的旧重试回调不得再发GET',async()=>{
  state.api.mockRejectedValueOnce(new Error('暂时不可读'));await render()
  const retry=wrapper!.findAllComponents({name:'ElButton'}).find(b=>b.text()==='重新读取详情')!.vm.$.vnode.props!.onClick as ()=>void
  const count=state.api.mock.calls.length;wrapper!.unmount();wrapper=undefined
  retry();await flushPromises();expect(state.api).toHaveBeenCalledTimes(count)
 })

})
