import {beforeEach,describe,expect,it,vi} from 'vitest'
import {ApiError} from '../../src/core/http'
import {decodeDeviceDiagnosticControl,decodeDeviceDiagnosticPage,prepareDeviceDiagnosticIntent,readDeviceDiagnosticControl,submitDeviceDiagnosticIntent,verifyDeviceDiagnosticWrite} from '../../src/features/devices/device-diagnostics-api'
const api=vi.hoisted(()=>vi.fn())
vi.mock('@/core/http',async()=>({...await vi.importActual('@/core/http'),api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003'
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const point=(enabled=false,version=0,clearGeneration=0)=>({deviceId:device,enabled,version,clearGeneration})
const message=()=>({id,deviceId:device,messageId:project,protocol:'MQTT',direction:'UP',topic:'up/property',payloadSummary:'{"temperature":23}',rawBytes:173,errorCode:null,ts:'2026-10-20T01:00:00Z',receivedAt:'2026-10-25T01:00:00.123456Z',traceId:null,messageType:'PROPERTY_REPORT',acceptedAt:'2026-10-25T01:00:00.123456Z',parsedAt:null,processedAt:null,deliveredAt:null,repliedAt:null,truncated:false,sampled:false})
beforeEach(()=>api.mockReset())
describe('设备诊断独立采集和代次CAS协议',()=>{
 it('读取缺省关闭和int32边界，拒绝缺失/未知/错目标/假布尔/不可能代次',()=>{
  for(const state of [point(),point(true,8,3),point(false,2147483647,2147483647)])expect(decodeDeviceDiagnosticControl(encode(state),device)).toEqual(state)
  for(const mutate of [(s:any)=>delete s.enabled,(s:any)=>delete s.clearGeneration,(s:any)=>s.extra=1,(s:any)=>s.deviceId=project,(s:any)=>s.enabled='true',(s:any)=>s.enabled=true,(s:any)=>s.clearGeneration=1,(s:any)=>s.version=-1,(s:any)=>s.version=2147483648,(s:any)=>s.version='0']){const state=point();mutate(state);expect(()=>decodeDeviceDiagnosticControl(encode(state),device)).toThrow()}
 })
 it('重复字段和非规范数字词法均拒绝，读接口使用4096字节边界',async()=>{
  for(const value of ['0.0','0e0','-0','0,"version":0'])expect(()=>decodeDeviceDiagnosticControl(new TextEncoder().encode(JSON.stringify(point()).replace('"version":0',`"version":${value}`)),device)).toThrow()
  const over=new Uint8Array(4097).fill(32);over.set(encode(point()));expect(()=>decodeDeviceDiagnosticControl(over,device)).toThrow()
  api.mockResolvedValueOnce(encode(point(true,1)));const signal=new AbortController().signal
  await expect(readDeviceDiagnosticControl(project,device,signal)).resolves.toEqual(point(true,1))
  expect(api).toHaveBeenCalledExactlyOnceWith(`/api/v1/projects/${project}/devices/${device}/diagnostic-control`,{signal,responseType:'bytes',maxResponseBytes:4096})
 })
 it('冻结原开关版本，PUT只有原version/enabled，不能被后来GET替换',async()=>{
  const state=point(true,7,2),intent=prepareDeviceDiagnosticIntent(project,state,'toggle',false);state.version=99;state.clearGeneration=77
  expect(Object.isFrozen(intent)).toBe(true);api.mockResolvedValueOnce(encode(point(false,8,2)));const signal=new AbortController().signal
  await expect(submitDeviceDiagnosticIntent(intent,signal)).resolves.toEqual(point(false,8,2))
  expect(api).toHaveBeenCalledExactlyOnceWith(`/api/v1/projects/${project}/devices/${device}/diagnostic-control`,{method:'put',body:{version:7,enabled:false},signal,responseType:'bytes',maxResponseBytes:4096})
 })
 it('清空只提交原version，回执保持开关且版本/代次各加一',async()=>{
  const intent=prepareDeviceDiagnosticIntent(project,point(true,7,2),'clear');api.mockResolvedValueOnce(encode(point(true,8,3)))
  await expect(submitDeviceDiagnosticIntent(intent,new AbortController().signal)).resolves.toEqual(point(true,8,3))
  expect(api.mock.calls[0]![1]).toMatchObject({method:'delete',body:{version:7}})
  for(const state of [point(false,8,3),point(true,7,3),point(true,9,3),point(true,8,2),point(true,8,4)])expect(()=>verifyDeviceDiagnosticWrite(encode(state),intent)).toThrow()
 })
 it('同值保持版本和代次，MAX与伪造意图在任何网络操作前拒绝',async()=>{
  const same=prepareDeviceDiagnosticIntent(project,point(true,7,2),'toggle',true)
  expect(verifyDeviceDiagnosticWrite(encode(point(true,7,2)),same)).toEqual(point(true,7,2))
  expect(()=>verifyDeviceDiagnosticWrite(encode(point(true,8,2)),same)).toThrow()
  expect(()=>prepareDeviceDiagnosticIntent(project,point(true,2147483647,0),'clear')).toThrow()
  await expect(submitDeviceDiagnosticIntent({...same,project:'../escape'},new AbortController().signal)).rejects.toThrow()
  await expect(submitDeviceDiagnosticIntent({...same,kind:'clear',enabled:false},new AbortController().signal)).rejects.toThrow()
  expect(api).not.toHaveBeenCalled()
 })
 it.each([new ApiError('冲突',409),new ApiError('结果未知',500,undefined,undefined,true),new Error('连接中断')])('错误不重传且保留原始原因',async cause=>{
  api.mockRejectedValueOnce(cause);await expect(submitDeviceDiagnosticIntent(prepareDeviceDiagnosticIntent(project,point(),'toggle',true),new AbortController().signal)).rejects.toBe(cause);expect(api).toHaveBeenCalledTimes(1)
 })
 it('坏2xx不是成功且不会触发第二次清空',async()=>{api.mockResolvedValueOnce(encode(point(false,1,0)));await expect(submitDeviceDiagnosticIntent(prepareDeviceDiagnosticIntent(project,point(),'clear'),new AbortController().signal)).rejects.toThrow();expect(api).toHaveBeenCalledTimes(1)})
 it('诊断页保留精确平台时间、消息摘要与采样事实，拒绝错设备/缺时间/假值和不完整页',()=>{
  const row=message();expect(decodeDeviceDiagnosticPage(encode({items:[row],nextCursor:null,hasMore:false}),device,50).items[0]).toMatchObject(row)
  for(const mutate of [(r:any)=>r.deviceId=project,(r:any)=>delete r.receivedAt,(r:any)=>r.receivedAt='2026-02-30T01:00:00Z',(r:any)=>r.rawBytes=1.5,(r:any)=>r.sampled=true,(r:any)=>r.truncated='true',(r:any)=>r.protocol='FTP']){const changed=message();mutate(changed);expect(()=>decodeDeviceDiagnosticPage(encode({items:[changed],nextCursor:null,hasMore:false}),device,50)).toThrow()}
  expect(()=>decodeDeviceDiagnosticPage(encode({items:[row,row],nextCursor:null,hasMore:false}),device,50)).toThrow()
  expect(()=>decodeDeviceDiagnosticPage(encode({items:[row],nextCursor:'opaque',hasMore:true}),device,50)).toThrow()
  expect(()=>decodeDeviceDiagnosticPage(encode({items:[],nextCursor:'opaque',hasMore:false}),device,50)).toThrow()
 })
})
