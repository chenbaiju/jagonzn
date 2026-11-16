import {describe,it,expect} from 'vitest'
import {decodePropertyObservations,observationWindow,defaultObservationWindow,type ObservationQuery} from '../../src/features/devices/property-observations-json'
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',model='00000000-0000-4000-8000-000000000003',operation='00000000-0000-4000-8000-000000000004',old='00000000-0000-4000-8000-000000000005'
const from='2026-10-01T00:00:00Z',to='2026-10-24T00:00:00Z',at='2026-10-23T00:00:00.123456789Z'
const query:ObservationQuery={project,device,model,from,to,limit:20,includeActor:false}
const platform=(change:Record<string,unknown>={})=>({sourceKind:'PLATFORM_CLOUD_UPDATE',sourceId:operation,propertyKey:'n',state:'VALUE',value:'original',precision:'EXACT_PLATFORM_JSON',sourceModelVersionId:old,at,timeKind:'PLATFORM_ACCEPTED',commandId:null,actorId:null,actorDisplayName:null,...change})
const report=(change:Record<string,unknown>={})=>platform({sourceKind:'DEVICE_REPORT',sourceId:device,precision:'STORED_DOUBLE',value:7,timeKind:'DEVICE_OCCURRED',...change})
const envelope=(items:unknown[],change:Record<string,unknown>={})=>({projectId:project,deviceId:device,modelVersionId:model,requestedFrom:from,requestedTo:to,reportedFrom:from,reportedTo:to,platformFrom:from,platformTo:to,items,nextCursor:null,hasMore:false,...change})
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const decode=(items:unknown[],change:Record<string,unknown>={},q=query)=>decodePropertyObservations(bytes(envelope(items,change)),q)
describe('混合属性历史严格原文来源解释',()=>{
 it('精确大整数和小数保持原文，原历史模型不被当前模型覆盖',()=>{
  const raw=JSON.stringify(envelope([platform()])).replace('"value":"original"','"value":{"n":9007199254740993,"d":0.12345678901234567890123456789}')
  const page=decodePropertyObservations(new TextEncoder().encode(raw),query);expect(page.items[0]!.valueText).toContain('9007199254740993');expect(page.items[0]!.valueText).toContain('0.12345678901234567890123456789');expect(page.items[0]!.sourceModelVersionId).toBe(old)
 })
 it('本地整日默认前29天至明日；严格窗口可区分相同毫秒内两个纳秒',()=>{
  const now=new Date(2026,9,24,15,46,12),window=defaultObservationWindow(now)
  expect(window.from).toBe(new Date(2026,8,25).toISOString());expect(window.to).toBe(new Date(2026,9,25).toISOString())
  expect(()=>observationWindow('2026-10-23T00:00:00.123456788Z','2026-10-23T00:00:00.123456789Z')).not.toThrow()
  for(const start of ['2026-02-30T00:00:00Z','2026-10-01T00:00:00'])expect(()=>observationWindow(start,to)).toThrow()
 })
 it('旧Double、JSON和标量保持实际已存精度名，不能冒认平台精确原件',()=>{
  expect(decode([report()]).items[0]!.precision).toBe('STORED_DOUBLE');expect(decode([report({precision:'STORED_JSON',value:{n:1}})]).items[0]!.precision).toBe('STORED_JSON')
  for(const change of [{precision:'EXACT_PLATFORM_JSON'},{precision:'STORED_DOUBLE',value:'7'},{precision:'STORED_JSON',value:7},{precision:'STORED_SCALAR',value:{n:1}}])expect(()=>decode([report(change)])).toThrow()
 })
 it('legacy明确抑制未知来源值，不能夹带当前版本或未证明值',()=>{
  const legacy=report({state:'SOURCE_VERSION_UNKNOWN',sourceModelVersionId:null,value:null,precision:'UNAVAILABLE'});expect(decode([legacy]).items[0]!.valueText).toBe('来源版本未知')
  for(const change of [{value:7},{sourceModelVersionId:model},{precision:'STORED_DOUBLE'}])expect(()=>decode([{...legacy,...change}])).toThrow()
 })
 it('平台命令身份和用户关闭默认真null，不能借响应加操作用户',()=>{
  expect(()=>decode([platform({sourceKind:'PLATFORM_DOWNLINK',commandId:operation})])).not.toThrow()
  for(const change of [{sourceKind:'PLATFORM_DOWNLINK',commandId:null},{commandId:operation},{actorId:device,actorDisplayName:'用户'},{actorDisplayName:'假用户'},{timeKind:'DEVICE_OCCURRED'}])expect(()=>decode([platform(change)])).toThrow()
  expect(decode([platform({actorId:device,actorDisplayName:'当前显示名'})],{}, {...query,includeActor:true}).items[0]!.actorDisplayName).toBe('当前显示名')
  expect(()=>decode([report({actorId:device,actorDisplayName:'假操作者'})],{}, {...query,includeActor:true})).toThrow()
 })
 it('保留源内部键顺序，同刻上报必须在平台前；不能倒序或复制同来源项',()=>{
  expect(decode([report(),platform({propertyKey:'_'}),platform({propertyKey:'Z'})]).items.map(p=>p.propertyKey)).toEqual(['n','_','Z'])
  expect(()=>decode([platform(),report()])).toThrow();expect(()=>decode([platform(),platform()])).toThrow();expect(()=>decode([report({at:'2026-10-22T00:00:00Z'}),platform()])).toThrow()
 })
 it('纳秒边界和严格日期/时区均核对，毫秒截断不能把窗口外值放行',()=>{
  const end='2026-10-23T00:00:00.123456788Z';expect(()=>decode([platform()],{requestedTo:end,reportedTo:end,platformTo:end},{...query,to:end})).toThrow()
  for(const at of ['2026-10-23T00:00:00','2026-02-30T00:00:00Z','2026-10-23T24:00:00Z',to])expect(()=>decode([platform({at})])).toThrow()
  expect(()=>decode([platform({at:'2026-10-23T08:00:00.123456789+08:00'})])).not.toThrow()
 })
 it('身份/筛选/窗口/closed字段与分页末页真null不允许漂移',()=>{
  for(const change of [{projectId:device},{modelVersionId:old},{extra:true},{hasMore:true},{nextCursor:'fake'},{nextCursor:'x'.repeat(4097),hasMore:true},{requestedFrom:'2026-09-01T00:00:00Z'}])expect(()=>decode([platform()],change)).toThrow()
  expect(()=>decode([platform()],{}, {...query,source:'DEVICE_REPORT'})).toThrow();expect(()=>decode([platform()],{}, {...query,property:'other'})).toThrow()
  expect(()=>decode([],{nextCursor:'cursor',hasMore:true})).toThrow()
 })
 it('重复JSON字段与超4MiB响应整页拒绝，不截断后冒充完整',()=>{
  const raw=JSON.stringify(envelope([platform()])).replace('"hasMore":false','"hasMore":false,"hasMore":false');expect(()=>decodePropertyObservations(new TextEncoder().encode(raw),query)).toThrow()
  expect(()=>decode([platform({value:'x'.repeat(4194304)})])).toThrow()
 })
})
