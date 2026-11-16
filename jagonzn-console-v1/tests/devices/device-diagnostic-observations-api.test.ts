import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {Schema} from '../../src/core/contracts'
import {ApiError} from '../../src/core/http'
import {decodeDeviceDiagnosticObservationPage,decodeDeviceDiagnosticObservationDetail,readDeviceDiagnosticObservations,readDeviceDiagnosticObservation} from '../../src/features/devices/device-diagnostic-observations-api'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('@/core/http',async()=>({...await vi.importActual('@/core/http'),api:state.api}))
const project='00000000-0000-4000-8000-000000000010',device='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',message='00000000-0000-4000-8000-000000000003'
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const fullContent='{"n":9007199254740993.2500,"text":"'+'中'.repeat(400)+'"}'
function metadata(){return {id,origin:'PROTOCOL_OBSERVATION',deviceId:device,messageId:message,protocol:'MQTT',direction:'UP',messageType:'PROPERTY_REPORT',receivedAt:'2026-10-25T08:00:01.123456Z',payloadFormat:'JSON',contentCodec:'JSON',contentState:'COMPLETE',originalBytes:400,processingStage:null,processingStatus:'RECEIVED',completedAt:null,errorCode:null,preview:Array.from(fullContent).slice(0,256).join(''),previewTruncated:true} satisfies Required<Schema<'DeviceDiagnosticObservationResponse'>>}
function legacy(){return {...metadata(),origin:'LEGACY_SUMMARY',payloadFormat:'UNKNOWN',contentCodec:null,contentState:'LEGACY_SUMMARY',originalBytes:null,processingStage:null,processingStatus:'UNKNOWN',completedAt:null,preview:'{"temperature":26.7000}',previewTruncated:false} satisfies Required<Schema<'DeviceDiagnosticObservationResponse'>>}
function detail(){const {preview,previewTruncated,...base}=metadata();return {...base,topic:'tc/v1/real/up/property/report',httpPath:null,content:'{"n":9007199254740993.2500,"text":"'+'中'.repeat(400)+'"}',errorBody:null,errorBodyState:null,summary:null,summaryTruncated:null,summarySampled:null} satisfies Required<Schema<'DeviceDiagnosticObservationDetailResponse'>>}
function legacyDetail(){const {preview,previewTruncated,...base}=legacy();return {...base,topic:null,httpPath:null,content:null,errorBody:null,errorBodyState:null,summary:'{"temperature":26.7000}',summaryTruncated:false,summarySampled:false} satisfies Required<Schema<'DeviceDiagnosticObservationDetailResponse'>>}
beforeEach(()=>vi.clearAllMocks())
describe('正式561独立诊断统一来源读取合同',()=>{
 it('18字段元数据允许同UUID不同来源，拒同来源重复和旧20字段行',()=>{
  const page={items:[metadata(),legacy()],nextCursor:null,hasMore:false};expect(decodeDeviceDiagnosticObservationPage(encode(page),device,50).items.map(row=>row.origin)).toEqual(['PROTOCOL_OBSERVATION','LEGACY_SUMMARY'])
  expect(()=>decodeDeviceDiagnosticObservationPage(encode({...page,items:[metadata(),metadata()]}),device,50)).toThrow()
  expect(()=>decodeDeviceDiagnosticObservationPage(encode({...page,items:[{...metadata(),payloadSummary:'旧摘要'}]}),device,50)).toThrow()
  expect(()=>decodeDeviceDiagnosticObservationPage(encode({...page,items:[legacy(),metadata()]}),device,50)).toThrow()
 })
 it('排序保留纳秒差别，格式化毫秒不得让反向页次通过',()=>{
  expect(()=>decodeDeviceDiagnosticObservationPage(encode({items:[metadata(),{...metadata(),id:message,receivedAt:'2026-10-25T08:00:01.123457Z'}],nextCursor:null,hasMore:false}),device,50)).toThrow()
  expect(()=>decodeDeviceDiagnosticObservationPage(encode({items:[{...metadata(),receivedAt:'2026-02-30T08:00:01Z'}],nextCursor:null,hasMore:false}),device,50)).toThrow()
 })
 it('24字段详情保留完整安全正文和原数字词法，原格式与摘要表现不同',()=>{
  const row=decodeDeviceDiagnosticObservationDetail(encode(detail()),device,id,'PROTOCOL_OBSERVATION');expect(row.content).toBe(detail().content);expect(row.content!.length).toBeGreaterThan(256);expect(row.payloadFormat).toBe('JSON');expect(row.processingStatus).toBe('RECEIVED');expect(row.summary).toBeNull()
  for(const changed of [{format:'JSON'}, {origin:'LEGACY_SUMMARY'},{deviceId:message},{originalBytes:'400'},{content:null},{payloadFormat:'UNKNOWN'},{contentCodec:null}])expect(()=>decodeDeviceDiagnosticObservationDetail(encode({...detail(),...changed}),device,id,'PROTOCOL_OBSERVATION')).toThrow()
 })
 it('历史26.7只存在summary；禁全文、原格式、观察Topic及权威成功的误提升',()=>{
  const result=decodeDeviceDiagnosticObservationDetail(encode(legacyDetail()),device,id,'LEGACY_SUMMARY');expect(result.summary).toBe('{"temperature":26.7000}');expect(result.content).toBeNull();expect(result.processingStatus).toBe('UNKNOWN');expect(result.originalBytes).toBeNull()
  for(const changed of [{content:'{"temperature":26.7}'},{payloadFormat:'JSON'},{processingStatus:'SUCCEEDED'},{topic:'logical/route'},{originalBytes:19},{summarySampled:true}])expect(()=>decodeDeviceDiagnosticObservationDetail(encode({...legacyDetail(),...changed}),device,id,'LEGACY_SUMMARY')).toThrow()
  expect(decodeDeviceDiagnosticObservationDetail(encode({...legacyDetail(),contentState:'UNSUPPORTED',summary:null,summarySampled:true}),device,id,'LEGACY_SUMMARY').summarySampled).toBe(true)
 })
 it('阶段终态必须成对，拒绝空错误推成功和错误体跨协议路径',()=>{
  const rejected={...detail(),protocol:'HTTP',topic:null,httpPath:'/api/v1/device/properties',processingStage:'INGRESS',processingStatus:'REJECTED',completedAt:'2026-10-25T08:00:02Z',errorCode:'40103',errorBody:'{"code":40103,"message":"类型错误"}',errorBodyState:'REDACTED'}
  expect(decodeDeviceDiagnosticObservationDetail(encode(rejected),device,id,'PROTOCOL_OBSERVATION').processingStage).toBe('INGRESS')
  for(const changed of [{processingStage:null},{completedAt:null},{errorCode:null},{httpPath:'/report?token=x'},{topic:'fake/topic'},{processingStatus:'SUCCEEDED'},{errorBodyState:null}])expect(()=>decodeDeviceDiagnosticObservationDetail(encode({...rejected,...changed}),device,id,'PROTOCOL_OBSERVATION')).toThrow()
 })
 it('响应及正文有界，重复JSON字段和未声明字段不能静默忽略',()=>{
  expect(()=>decodeDeviceDiagnosticObservationDetail(new Uint8Array(524289),device,id,'PROTOCOL_OBSERVATION')).toThrow()
  expect(()=>decodeDeviceDiagnosticObservationDetail(encode({...detail(),content:'中'.repeat(30000)}),device,id,'PROTOCOL_OBSERVATION')).toThrow()
  expect(()=>decodeDeviceDiagnosticObservationPage(new Uint8Array(1048577),device,50)).toThrow()
  const repeated=JSON.stringify(detail()).replace('"origin":"PROTOCOL_OBSERVATION"','"origin":"PROTOCOL_OBSERVATION","origin":"LEGACY_SUMMARY"');expect(()=>decodeDeviceDiagnosticObservationDetail(new TextEncoder().encode(repeated),device,id,'PROTOCOL_OBSERVATION')).toThrow()
 })
 it('只GET独立观察路径与精确origin；404保留原结果，不回退旧messages或重试',async()=>{
  const signal=new AbortController().signal;state.api.mockResolvedValueOnce(encode(detail()));await readDeviceDiagnosticObservation(project,device,id,'PROTOCOL_OBSERVATION',signal)
  expect(state.api).toHaveBeenCalledExactlyOnceWith(`/api/v1/projects/${project}/devices/${device}/diagnostic-observations/${id}`,{query:{origin:'PROTOCOL_OBSERVATION'},signal,responseType:'bytes',maxResponseBytes:524288})
  state.api.mockClear();state.api.mockRejectedValueOnce(new ApiError('已清空',404));await expect(readDeviceDiagnosticObservation(project,device,id,'LEGACY_SUMMARY',signal)).rejects.toMatchObject({status:404});expect(state.api).toHaveBeenCalledTimes(1)
  state.api.mockClear();await expect(readDeviceDiagnosticObservation(project,device,id,'FAKE' as any,signal)).rejects.toThrow();expect(state.api).not.toHaveBeenCalled()
 })
 it('分页只读同一服务端投影，拒绝原游标不推进，不在客户端拼两套页',async()=>{
  const signal=new AbortController().signal;const items=Array.from({length:50},(_,index)=>({...metadata(),id:`00000000-0000-4000-8000-${(50-index).toString(16).padStart(12,'0')}`}));state.api.mockResolvedValueOnce(encode({items,nextCursor:'cursor',hasMore:true}));await expect(readDeviceDiagnosticObservations(project,device,'cursor',signal)).rejects.toThrow();expect(state.api).toHaveBeenCalledTimes(1);expect(state.api.mock.calls[0]![0]).toBe(`/api/v1/projects/${project}/devices/${device}/diagnostic-observations`)
 })
 it('列表预览最多256码点且与内容可用性一致，不能把16字段旧页冒18字段',()=>{
  const page=(row:unknown)=>encode({items:[row],nextCursor:null,hasMore:false})
  expect(decodeDeviceDiagnosticObservationPage(page(metadata()),device,50).items[0]!.previewTruncated).toBe(true)
  for(const change of [{preview:'😀'.repeat(257)},{preview:null},{preview:'短内容',previewTruncated:true},{contentState:'UNSUPPORTED',preview:'{}',previewTruncated:false}])expect(()=>decodeDeviceDiagnosticObservationPage(page({...metadata(),...change}),device,50)).toThrow()
  const {preview,previewTruncated,...old16}=metadata();expect(()=>decodeDeviceDiagnosticObservationPage(page(old16),device,50)).toThrow()
 })
})
