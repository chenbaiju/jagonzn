import {describe,it,expect,vi,beforeEach} from 'vitest'
import {decodePropertySeries} from '../../src/features/devices/property-series-json'
import {propertySeries,propertySeriesFrame} from '../../src/features/devices/property-series-api'
import {seriesQuery,seriesWire,seriesModel} from './property-series-fixture'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
describe('专用曲线词法及真实有界查询',()=>{
 beforeEach(()=>{vi.clearAllMocks()})
 it('独立端口发送精确模型/半开窗口/九函数，不重用旧history协议',async()=>{
  const query=seriesQuery({granularity:'ONE_MONTH',aggregation:'MEDIAN'}),signal=new AbortController().signal
  state.api.mockResolvedValue(seriesWire(query,[]));await propertySeries(query,signal)
  expect(state.api).toHaveBeenCalledWith(expect.stringContaining('/property-observations/series'),expect.objectContaining({responseType:'bytes',maxResponseBytes:4194304,signal,query:{expectedModelVersionId:query.model,propertyKey:'n',from:query.from,to:query.to,granularity:'ONE_MONTH',aggregation:'MEDIAN'}}))
  await expect(propertySeries({...query,to:query.from},signal)).rejects.toThrow();expect(state.api).toHaveBeenCalledTimes(1)
 })
 it('真实2e308、大整数、小数与极小值原文保留，普通对象不能伪造数值',()=>{
  const query=seriesQuery({granularity:'ONE_MINUTE',aggregation:'SUM'})
  const wire=seriesWire(query,['2e308','9007199254740993.0000000001','1e-16383'],{}, {sourceKind:'PLATFORM_CLOUD_UPDATE',timeKind:'PLATFORM_ACCEPTED',precision:'DECIMAL_AGGREGATE'})
  expect(decodePropertySeries(wire,query).points.map(p=>p.value.lexical)).toEqual(['2e308','9007199254740993.0000000001','1e-16383'])
  for(const value of ['"2e308"','{"type":"JSON_NUMBER","lexical":"2e308"}','null','true','1e999999','1.0.2','1e2e3','01','-01','1e'])expect(()=>decodePropertySeries(seriesWire(query,[value]),query)).toThrow()
 })
 it('封闭结构、回显身份、重复键、错误时钟/精度及UTF8不被零值帧掩盖',()=>{
  const query=seriesQuery(),wire=seriesWire(query),text=new TextDecoder().decode(wire)
  for(const bytes of [new TextEncoder().encode(text.replace('"projectId":','"projectId":"bad","projectId":')),new TextEncoder().encode(text.replace('"value":1','"value":1,"x":2')),seriesWire(query,['1'],{deviceId:seriesModel}),seriesWire(query,['1'],{}, {timeKind:'PLATFORM_ACCEPTED'}),seriesWire(query,['1'],{}, {precision:'EXACT_PLATFORM_JSON'}),new Uint8Array([239,187,191,...wire]),new Uint8Array([123,34,120,34,58,34,255,34,125])])expect(()=>decodePropertySeries(bytes,query)).toThrow()
 })
 it('空未来窗口可缩为请求起点前同一上界；非空不能越出权益或省略真实历史版本',()=>{
  const query=seriesQuery(),empty={from:'2026-10-23T23:00:00Z',to:'2026-10-23T23:00:00Z'}
  expect(decodePropertySeries(seriesWire(query,[],{reportedWindow:empty,platformWindow:empty}),query).points).toHaveLength(0)
  expect(()=>decodePropertySeries(seriesWire(query,['1'],{reportedWindow:empty}),query)).toThrow()
  expect(decodePropertySeries(seriesWire(query,['1'],{}, {sourceModelVersionId:null,modelVersion:'LEGACY_UNVERSIONED'}),query).points[0]!.sourceModelVersionId).toBeNull()
  expect(()=>decodePropertySeries(seriesWire(query,['1'],{}, {sourceModelVersionId:null,modelVersion:'1.0.0'}),query)).toThrow()
 })
 it('允许可见行组成的不完整月桶，拒绝不对齐/重复桶和每域超预算',()=>{
  const query=seriesQuery({from:'2026-10-24T00:00:00.000000001Z',granularity:'ONE_MONTH'})
  expect(decodePropertySeries(seriesWire(query,['6'],{}, {ts:'2026-10-01T00:00:00Z'}),query).points[0]!.value.lexical).toBe('6')
  expect(()=>decodePropertySeries(seriesWire(query,['6'],{}, {ts:'2026-10-02T00:00:00Z'}),query)).toThrow()
  expect(()=>decodePropertySeries(seriesWire(query,['6','7'],{}, {ts:'2026-10-01T00:00:00Z'}),query)).toThrow()
  const raw=seriesQuery();expect(()=>decodePropertySeries(seriesWire(raw,Array(2001).fill('1'),{}, {ts:'2026-10-24T00:01:00Z'}),raw)).toThrow()
 })
 it('最多两路并发，五属性按实际较粗档重读，未重复读取已对齐属性',async()=>{
  let active=0,maximum=0
  state.api.mockImplementation(async(_path:string,{query}:any)=>{active++;maximum=Math.max(maximum,active);await Promise.resolve();active--;const q=seriesQuery({property:query.propertyKey,granularity:query.granularity});return seriesWire(q,[],{actualGranularity:query.propertyKey==='n'?'ONE_HOUR':query.granularity,bucketPolicy:query.propertyKey==='n'||query.granularity!=='RAW'?'VISIBLE_WINDOW_BUCKETS':'RAW_VISIBLE_POINTS'})})
  const results=await propertySeriesFrame(['n','x','y','z','v'].map(property=>seriesQuery({property})),new AbortController().signal)
  expect(maximum).toBe(2);expect(results.every(r=>r.actualGranularity==='ONE_HOUR')).toBe(true)
  expect(state.api).toHaveBeenCalledTimes(9);expect(state.api.mock.calls.filter(call=>call[1].query.propertyKey==='n')).toHaveLength(1)
 })
 it('任一属性失败撤销整轮，不返回其它属性成功子集；重复属性在请求前拒绝',async()=>{
  state.api.mockImplementation((_path:string,{query}:any)=>query.propertyKey==='x'?Promise.reject(new Error('denied')):Promise.resolve(seriesWire(seriesQuery(),[])))
  await expect(propertySeriesFrame([seriesQuery(),seriesQuery({property:'x'})],new AbortController().signal)).rejects.toThrow('denied')
  const before=state.api.mock.calls.length;await expect(propertySeriesFrame([seriesQuery(),seriesQuery()],new AbortController().signal)).rejects.toThrow();expect(state.api).toHaveBeenCalledTimes(before)
 })
 it('多属性累计正文超过8MiB明确失败，后续调用只获剩余预算，不截成部分导出',async()=>{
  state.api.mockImplementation((_path:string,{query, maxResponseBytes}:any)=>{const bytes=seriesWire(seriesQuery({property:query.propertyKey}),[]);const padded=new Uint8Array(3*1024*1024);padded.fill(32);padded.set(bytes);return Promise.resolve(padded)})
  await expect(propertySeriesFrame(['n','b','c'].map(property=>seriesQuery({property})),new AbortController().signal)).rejects.toThrow('8MiB')
  expect(state.api.mock.calls[2]![1].maxResponseBytes).toBeLessThan(4194304)
 })
})
