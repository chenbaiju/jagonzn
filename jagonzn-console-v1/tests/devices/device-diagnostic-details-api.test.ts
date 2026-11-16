import {beforeEach,describe,expect,it,vi} from 'vitest'
import {decodeDeviceDiagnosticMessage,readDeviceDiagnosticMessage} from '../../src/features/devices/device-diagnostics-api'
const state=vi.hoisted(()=>({api:vi.fn()}));vi.mock('../../src/core/http',()=>({api:state.api}))
const project='00000000-0000-4000-8000-000000000010',device='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',message='00000000-0000-4000-8000-000000000003'
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
function row(){return {id,deviceId:device,messageId:message,protocol:'MQTT',direction:'UP',topic:'devices/test/report',payloadSummary:'{"n":9007199254740993.1200}',payloadHex:null,format:'JSON',normalizedResult:'PROPERTY_REPORT/MQTT/UP',rawBytes:999,errorCode:'INVALID_PAYLOAD',ts:'2026-10-25T08:00:00Z',receivedAt:'2026-10-25T08:00:01Z',traceId:null,messageType:'PROPERTY_REPORT',acceptedAt:'2026-10-25T08:00:01Z',parsedAt:null,processedAt:null,deliveredAt:null,repliedAt:null,truncated:true,sampled:false}}
beforeEach(()=>state.api.mockReset())
describe('消息诊断详情与脱敏片段格式',()=>{
 it('单条详情保留原始摘要和真实可空时间，不把缺失解析或回复推成完成',()=>{const value=decodeDeviceDiagnosticMessage(encode(row()),device,id);expect(value.payloadSummary).toBe('{"n":9007199254740993.1200}');expect(value.parsedAt).toBeNull();expect(value.repliedAt).toBeNull();expect(value.rawBytes).toBe(999)})
 it('实际详情23与旧详情22及列表20严格区分，缺topic或详情presentation字段均不能借list成功',()=>{const detail=row();expect(Object.keys(detail)).toHaveLength(23);const {topic,...old22}=detail;expect(Object.keys(old22)).toHaveLength(22);expect(()=>decodeDeviceDiagnosticMessage(encode(old22),device,id)).toThrow();const {payloadHex,format,normalizedResult,...list20}=detail;expect(Object.keys(list20)).toHaveLength(20);expect(()=>decodeDeviceDiagnosticMessage(encode(list20),device,id)).toThrow();expect(decodeDeviceDiagnosticMessage(encode({...detail,topic:null}),device,id).topic).toBeNull()})
 it('只接受所请求JSON摘要presentation，HEX和规范化三元组错配拒绝而不猜原始wire格式',()=>{for(const modify of [(r:any)=>r.format='HEX',(r:any)=>r.payloadHex='7b7d',(r:any)=>r.normalizedResult='PROPERTY_REPORT/HTTP/DOWN']){const value=row();modify(value);expect(()=>decodeDeviceDiagnosticMessage(encode(value),device,id)).toThrow()}expect(decodeDeviceDiagnosticMessage(encode(row()),device,id).format).toBe('JSON')})
 it('错日志身份、错设备、缺时钟、重复字段和伪造采样详情全部拒绝',()=>{
  for(const change of [(r:any)=>r.id=message,(r:any)=>r.deviceId=project,(r:any)=>delete r.repliedAt,(r:any)=>r.sampled=true,(r:any)=>r.errorStage='PARSED']){const value=row();change(value);expect(()=>decodeDeviceDiagnosticMessage(encode(value),device,id)).toThrow()}
  expect(()=>decodeDeviceDiagnosticMessage(new TextEncoder().encode(JSON.stringify(row()).replace('"rawBytes":999','"rawBytes":999,"rawBytes":999')),device,id)).toThrow()
  expect(()=>decodeDeviceDiagnosticMessage(new Uint8Array(16385),device,id)).toThrow()
 })
 it('仅请求当前设备diagnostic-messages单条GET，不回退生产messages或重复请求',async()=>{state.api.mockResolvedValueOnce(encode(row()));await readDeviceDiagnosticMessage(project,device,id,new AbortController().signal);expect(state.api).toHaveBeenCalledTimes(1);expect(state.api.mock.calls[0]![0]).toBe(`/api/v1/projects/${project}/devices/${device}/diagnostic-messages/${id}`);expect(state.api.mock.calls[0]![1]).toMatchObject({query:{format:'JSON'},responseType:'bytes',maxResponseBytes:16384});expect(state.api.mock.calls[0]![1].method).toBeUndefined()})
})
