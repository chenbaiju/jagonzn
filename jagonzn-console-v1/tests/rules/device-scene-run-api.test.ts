import {beforeEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
import {deviceSceneRunApi as transport} from '../../src/features/rules/device-scene-run-api'
const p='10000000-0000-4000-8000-000000000001',s='20000000-0000-4000-8000-000000000001',d='30000000-0000-4000-8000-000000000001'
describe('正式559当前设备场景执行适配',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.api.mockResolvedValue({})})
 it('只发一个明确设备和定义CAS，幂等键在header，不覆盖场景定义或启用状态',async()=>{
  await transport.run(p,s,d,8,'original-key');expect(state.api).toHaveBeenCalledExactlyOnceWith(`/api/v1/projects/${p}/scenes/${s}/executions`,{method:'post',headers:{'Idempotency-Key':'original-key'},body:{deviceId:d,expectedVersion:8,payload:{}}})
 })
 it('核对只GET精确key和父定义，不扫描投递/列表或再次POST',async()=>{
  const signal=new AbortController().signal;await transport.lookup(p,s,'original-key',signal);expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/scenes/${s}/executions/by-key`,{query:{key:'original-key'},signal});await transport.definition(p,s,signal);expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/scenes/${s}`,{signal});expect(state.api).toHaveBeenCalledTimes(2)
 })
 it('非法范围/不安全CAS/空key在网络前拒绝；服务端未知原样传递不自动重放',async()=>{
  const signal=new AbortController().signal;await expect(transport.run(p,s,'bad',8,'key')).rejects.toThrow();await expect(transport.run(p,s,d,9007199254740992,'key')).rejects.toThrow();await expect(transport.lookup(p,s,' ',signal)).rejects.toThrow();expect(state.api).not.toHaveBeenCalled();const failure=new Error('unknown');state.api.mockRejectedValueOnce(failure);await expect(transport.run(p,s,d,8,'key')).rejects.toBe(failure);expect(state.api).toHaveBeenCalledTimes(1)
 })
})
