import {describe,it,expect,vi,beforeEach} from 'vitest'
import {prepareRemoval,submitRemoval,decodeRemoval,confirmRemovalSlice,readRemovalCurrent,readRemovalSubmission,type RemovalReceipt} from '../../src/features/devices/current-property-removal-api'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',()=>({api:state.api}))
vi.mock('../../src/features/devices/api',()=>({devicePath:(p:string,d:string)=>`/api/v1/projects/${p}/devices/${d}`}))
const model='00000000-0000-4000-8000-000000000001',operation='00000000-0000-4000-8000-000000000002',newOperation='00000000-0000-4000-8000-000000000003'
function receipt(keys=['n']):RemovalReceipt{return{operationId:operation,projectId:'project',deviceId:'device',modelVersionId:model,removedAt:'2026-10-24T00:00:00Z',observations:keys.map(propertyKey=>({propertyKey,reportedRevision:'1',removedPlatformOperationId:operation,reportedValueRemoved:true}))}}
function current(keys:string[],source:'none'|'report'|'platform'='none',identity='2'){return new TextEncoder().encode(JSON.stringify({projectId:'project',deviceId:'device',modelVersionId:model,values:keys.map(propertyKey=>({propertyKey,state:source==='none'?'NO_VALUE':'VALUE',sourceKind:source==='none'?null:source==='report'?'DEVICE_REPORT':'PLATFORM_CLOUD_UPDATE',value:source==='none'?null:7,modelVersionId:source==='none'?null:model,occurredAt:source==='report'?'2026-10-24T00:00:00Z':null,updatedAt:source==='platform'?'2026-10-24T00:00:00Z':null,operationId:source==='platform'?identity:null,reportedRevision:source==='report'?identity:null}))}))}
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
describe('批量移除原文合同与原锚点核对',()=>{
 beforeEach(()=>vi.clearAllMocks())
 it('569原请求只GET原头并核对原模型与有序选择，错回执不授予受理',async()=>{
  const signal=new AbortController().signal,hash='a'.repeat(64);state.api.mockResolvedValue(bytes(receipt(['n','other'])));await expect(readRemovalSubmission('project','device',model,['n','other'],'original',hash,signal)).resolves.toEqual(receipt(['n','other']))
  expect(state.api).toHaveBeenCalledWith('/api/v1/projects/project/devices/device/current-properties/removals/current',{headers:{'Original-Request-Key':'original','X-Request-Body-SHA256':hash},signal,responseType:'bytes',maxResponseBytes:262144})
  await expect(readRemovalSubmission('project','device',model,['other','n'],'original',hash,signal)).rejects.toThrow();state.api.mockResolvedValue(bytes({...receipt(),modelVersionId:newOperation}));await expect(readRemovalSubmission('project','device',model,['n'],'original',hash,signal)).rejects.toThrow()
  expect(state.api.mock.calls.every(([,o])=>!o.method&&!o.rawBody)).toBe(true)
 })

 it('200键完整发送且拒绝超预算/重复/空集合，真实POST只带绑定正文与同原键',async()=>{
  const keys=Array.from({length:200},(_,i)=>`p${i}`),prepared=prepareRemoval(model,keys);expect(JSON.parse(prepared.body).keys).toEqual(keys);for(const bad of [[],['n','n'],[...keys,'overflow'],['bad.key']])expect(()=>prepareRemoval(model,bad)).toThrow()
  state.api.mockResolvedValue(bytes(receipt()));await submitRemoval('project','device',prepared.body,'same-key');expect(state.api).toHaveBeenCalledWith('/api/v1/projects/project/devices/device/current-properties/remove',expect.objectContaining({method:'post',rawBody:prepared.body,responseType:'bytes',headers:{'Content-Type':'application/json','Idempotency-Key':'same-key'}}))
 })
 it('回执必须严格绑定完整有序集合，坏成功不得被接受',()=>{
  const good=receipt(['n','other']);expect(decodeRemoval(bytes(good),'project','device',model,['n','other'])).toEqual(good)
  for(const bad of [{...good,deviceId:'foreign'},{...good,observations:[good.observations[1],good.observations[0]]},{...good,extra:true},{...good,removedAt:'2026-02-30T00:00:00Z'},{...good,removedAt:'2026-10-24T00:00:00'},{...good,observations:[{...good.observations[0],reportedRevision:1},good.observations[1]]}])expect(()=>decodeRemoval(bytes(bad),'project','device',model,['n','other'])).toThrow()
 })
 it('NO_VALUE证实当前为空，原事实不能确认；更高真实序号或不同平台操作可自然出现',()=>{
  const r=receipt();expect(confirmRemovalSlice(current(['n']),r,r.observations)).toBe(false)
  expect(()=>confirmRemovalSlice(current(['n'],'report','1'),r,r.observations)).toThrow();expect(()=>confirmRemovalSlice(current(['n'],'report','0'),r,r.observations)).toThrow();expect(()=>confirmRemovalSlice(current(['n'],'platform',operation),r,r.observations)).toThrow()
  expect(confirmRemovalSlice(current(['n'],'report','2'),r,r.observations)).toBe(true);expect(confirmRemovalSlice(current(['n'],'platform',newOperation),r,r.observations)).toBe(true)
 })
 it('51键按现行50键读合同完整核对，后一批失败不冒称完成且预算递减',async()=>{
  const keys=Array.from({length:51},(_,i)=>`p${i}`),r=receipt(keys),budgets:number[]=[]
  state.api.mockImplementation((_path:string,options:any)=>{budgets.push(options.maxResponseBytes);return Promise.resolve(current(options.query.propertyKeys))})
  expect(await readRemovalCurrent(r)).toBe(false);expect(state.api.mock.calls.map(([,o])=>o.query.propertyKeys.length)).toEqual([50,1]);expect(budgets[0]).toBe(4194304);expect(budgets[1]).toBeLessThan(budgets[0]!)
  state.api.mockClear();state.api.mockResolvedValueOnce(current(keys.slice(0,50))).mockRejectedValueOnce(new Error('第二批失败'));await expect(readRemovalCurrent(r)).rejects.toThrow('第二批失败');expect(state.api.mock.calls.every(([,o])=>!o.method||o.method==='get')).toBe(true)
 })
})
