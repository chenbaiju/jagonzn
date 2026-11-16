import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {changeIdentity,ApiError} from '@/core/http'
import {activityKeys,metricKeys,deviceOverviewApi} from '@/features/devices/device-overview-api'
const project='11111111-1111-4111-8111-111111111111',device='22222222-2222-4222-8222-222222222222',at='2026-10-24T12:34:56Z'
const activity=()=>({deviceId:device,observedAt:at,items:activityKeys.map(key=>({key,at:null}))})
const usage=()=>({deviceId:device,observedAt:at,range:'30d',from:'2026-09-24T13:00:00Z',to:at,bucketStarts:Array.from({length:720},(_,i)=>new Date(Date.parse('2026-09-24T13:00:00Z')+i*3600000).toISOString().replace('.000Z','Z')),series:metricKeys.map(key=>({key,coverage:'OBSERVED',values:Array(720).fill('999999999999999999999999999999999999999')}))})
beforeEach(()=>changeIdentity('fixture-only-token'))
afterEach(()=>{vi.unstubAllGlobals();changeIdentity()})
describe('设备概览真实共享HTTP组合',()=>{
 it('实际GET带既有认证、固定range，十二空时间保持null',async()=>{const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(activity()),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);const value=await deviceOverviewApi.activity(project,device);expect(value.items).toHaveLength(12);expect(new URL(String(fetch.mock.calls[0]![0])).pathname).toBe(`/api/v1/projects/${project}/devices/${device}/overview/activity`);expect(fetch.mock.calls[0]![1].method).toBe('GET');expect(new Headers(fetch.mock.calls[0]![1].headers).get('Authorization')).toBe('Bearer fixture-only-token')})
 it('最大720桶乘37指标的39位整数实际通过2MiB预算，完全保留文字',async()=>{const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(usage()),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);const value=await deviceOverviewApi.usage(project,device,'30d');expect(value.bucketStarts).toHaveLength(720);expect(value.series[0]!.values[0]).toBe('999999999999999999999999999999999999999');expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get('range')).toBe('30d')})
 it('超过边界响应在完整解析前被拒绝',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{headers:{'Content-Length':'2097153'}})));await expect(deviceOverviewApi.activity(project,device)).rejects.toThrow(/响应超过允许大小/)})
 it('403仍为错误，不转成十二空时间或零图成功',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({message:'没有权限'}),{status:403,headers:{'Content-Type':'application/json'}})));await expect(deviceOverviewApi.activity(project,device)).rejects.toBeInstanceOf(ApiError)})
 it('请求中身份改变丢弃迟到事实，不重新发送旧请求',async()=>{let resolve!:(r:Response)=>void;const fetch=vi.fn().mockImplementation(()=>new Promise(r=>{resolve=r}));vi.stubGlobal('fetch',fetch);const pending=deviceOverviewApi.activity(project,device);changeIdentity('new-fixture-token');resolve(new Response(JSON.stringify(activity()),{headers:{'Content-Type':'application/json'}}));await expect(pending).rejects.toThrow('页面身份已改变');expect(fetch).toHaveBeenCalledTimes(1)})
})
