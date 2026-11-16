import {describe,it,expect,vi,beforeEach} from 'vitest'
import {readPropertyHistoryExport,historyExportRows,type HistoryExportQuery} from '../../src/features/devices/property-history-export'
const state=vi.hoisted(()=>({read:vi.fn()}))
vi.mock('../../src/features/devices/property-observations-api',()=>({propertyObservations:state.read}))
const device='00000000-0000-4000-8000-000000000001',model='00000000-0000-4000-8000-000000000002',query:HistoryExportQuery={project:'project',device,model,property:'n',from:'2026-10-20T00:00:00Z',to:'2026-10-25T00:00:00Z'}
function id(index:number){return`10000000-0000-4000-8000-${index.toString(16).padStart(12,'0')}`}
function wire(q:HistoryExportQuery,start:number,count:number,more:boolean,overrides:Record<string,unknown>={}){
 const items=Array.from({length:count},(_,index)=>({sourceKind:'DEVICE_REPORT',sourceId:id(start+index+1),propertyKey:q.property,state:'SOURCE_VERSION_UNKNOWN',value:null,precision:'UNAVAILABLE',sourceModelVersionId:null,at:new Date(Date.parse('2026-10-24T00:00:00Z')-(start+index)*1000).toISOString(),timeKind:'DEVICE_OCCURRED',commandId:null,actorId:null,actorDisplayName:null}))
 return new TextEncoder().encode(JSON.stringify({projectId:q.project,deviceId:q.device,modelVersionId:q.model,requestedFrom:q.from,requestedTo:q.to,reportedFrom:q.from,reportedTo:q.to,platformFrom:q.from,platformTo:q.to,items,nextCursor:more?`cursor-${start+count}`:null,hasMore:more,...overrides}))
}
describe('Source限额原始历史导出读取',()=>{
 beforeEach(()=>{state.read.mockReset()})
 it('从独立签名首页读取，逐页使用真实位置，不沿当前列表页/来源/操作用户选项',async()=>{
  state.read.mockImplementation((q:HistoryExportQuery,cursor?:string)=>Promise.resolve(wire(q,cursor?2:0,cursor?1:2,!cursor,cursor?{reportedFrom:'2026-10-21T00:00:00Z'}:{})))
  const progress=vi.fn(),result=await readPropertyHistoryExport(query,new AbortController().signal,progress)
  expect(result.items).toHaveLength(3);expect(result.items[0]!.readWindow.reportedFrom).toBe(query.from);expect(result.items[2]!.readWindow.reportedFrom).toBe('2026-10-21T00:00:00Z');expect(result.hasMore).toBe(false);expect(state.read.mock.calls.map(call=>call[1])).toEqual([undefined,'cursor-2']);expect(state.read.mock.calls[0]![0]).toMatchObject({...query,limit:50,includeActor:false,source:undefined});expect(progress.mock.calls.map(call=>call[0])).toEqual([2,3])
 })
 it('真实执行100页/5000项有界前缀，仍有后继明确保留，不假全量或发第101页',async()=>{
  state.read.mockImplementation((q:HistoryExportQuery,cursor?:string)=>{const start=cursor?Number(cursor.split('-')[1]):0;return Promise.resolve(wire(q,start,50,true))})
  const result=await readPropertyHistoryExport(query,new AbortController().signal)
  expect(result.items).toHaveLength(5000);expect(result.hasMore).toBe(true);expect(state.read).toHaveBeenCalledTimes(100);expect(new Set(result.items.map(item=>item.sourceId)).size).toBe(5000)
  const{rows}=historyExportRows(result,false);expect(rows[1]).toContain('还有后继，请缩小时间范围')
 })
 it('第二页失败、跨页重复、倒序及循环cursor都整次失败，不返回首段文件材料',async()=>{
  state.read.mockResolvedValueOnce(wire(query,0,2,true)).mockRejectedValueOnce(new Error('revoked'));await expect(readPropertyHistoryExport(query,new AbortController().signal)).rejects.toThrow('revoked')
  for(const next of [wire(query,0,2,true),wire(query,0,1,false),wire(query,2,1,true,{nextCursor:'cursor-2'})]){
   state.read.mockReset().mockResolvedValueOnce(wire(query,0,2,true)).mockResolvedValueOnce(next);await expect(readPropertyHistoryExport(query,new AbortController().signal)).rejects.toThrow()
  }
 })
 it('在途取消后晚回执不能成为可下载结果',async()=>{
  const controller=new AbortController();let resolve!:(bytes:Uint8Array)=>void
  state.read.mockResolvedValueOnce(wire(query,0,2,true)).mockImplementationOnce(()=>new Promise(r=>resolve=r))
  const promise=readPropertyHistoryExport(query,controller.signal);await Promise.resolve();await Promise.resolve();controller.abort();resolve(wire(query,2,1,false));await expect(promise).rejects.toThrow()
 })
 it('原数字/复合值保留，毫秒只是显示选项，原始纳秒与状态始终进入文件',async()=>{
  const row={sourceKind:'PLATFORM_CLOUD_UPDATE',sourceId:id(1),propertyKey:'n',state:'VALUE',value:'RAW',precision:'EXACT_PLATFORM_JSON',sourceModelVersionId:model,at:'2026-10-24T00:00:00.123456789Z',timeKind:'PLATFORM_ACCEPTED',commandId:null,actorId:null,actorDisplayName:null}
  let text=new TextDecoder().decode(wire(query,0,0,false,{items:[row]}));text=text.replace('"RAW"','9007199254740993.0000000001');state.read.mockResolvedValue(new TextEncoder().encode(text))
  const result=await readPropertyHistoryExport(query,new AbortController().signal),plain=historyExportRows(result,false,'温度'),withMs=historyExportRows(result,true,'温度')
  expect(plain.rows[1]![0]).toBe('2026-10-24 08:00:00');expect(withMs.rows[1]![0]).toBe('2026-10-24 08:00:00.123');expect(plain.rows[1]).toContain('2026-10-24T00:00:00.123456789Z');expect(plain.rows[1]![5]).toBe('9007199254740993.0000000001');expect(plain.numericCell(1,5)).toBe(true)
 })
 it('累计字节预算在下一请求前缩小，超限不输出部分结果',async()=>{
  let page=0;state.read.mockImplementation((q:HistoryExportQuery)=>{const data=wire(q,page++,1,true),bytes=new Uint8Array(3*1024*1024);bytes.fill(32);bytes.set(data);return Promise.resolve(bytes)})
  await expect(readPropertyHistoryExport(query,new AbortController().signal)).rejects.toThrow('8MiB');expect(state.read.mock.calls[2]![3]).toBe(2*1024*1024)
 })
})
