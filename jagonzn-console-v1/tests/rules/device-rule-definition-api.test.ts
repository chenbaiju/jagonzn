import {beforeEach,describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async(importOriginal)=>({...await importOriginal<typeof import('../../src/core/http')>(),api:state.api}))
import {ruleKinds} from '../../src/features/rules/rule-builder-draft'
import {deviceRuleDefinitionApi as transport} from '../../src/features/rules/device-rule-definition-api'
const p='10000000-0000-4000-8000-000000000001',d='20000000-0000-4000-8000-000000000001',r='30000000-0000-4000-8000-000000000001'
describe('正式552真实设备规则适配',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.api.mockResolvedValue({})})
 it('列表只用新真实关联GET，筛选在请求交给服务器而非项目候选',async()=>{
  const signal=new AbortController().signal;await transport.read(p,d,{relation:'DEVICE_TYPE',status:'PAUSED',ruleType:''},'signed',signal);expect(state.api).toHaveBeenCalledExactlyOnceWith(`/api/v1/projects/${p}/devices/${d}/message-rules`,{query:{relation:'DEVICE_TYPE',status:'PAUSED',ruleType:undefined,cursor:'signed',limit:24},signal})
 })
 it('点读携定义CAS，修改携两个CAS和真实设备路径且无总开关写入',async()=>{
  const signal=new AbortController().signal;await transport.preference(p,r,d,9,signal);expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/message-rules/${r}/device-participation/${d}`,{query:{expectedDefinitionVersion:9},signal});await transport.change(p,r,d,9,3,false);expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/message-rules/${r}/device-participation/${d}`,{method:'put',body:{expectedDefinitionVersion:9,expectedVersion:3,allowed:false}});expect(state.api).toHaveBeenCalledTimes(2)
 })
 it('创建设备端点只从路径固定来源，正文不带旧来源/状态并核对首版本',async()=>{
  await transport.create!(p,d,{name:'设备规则',source:'x=>x',actions:[]});expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/devices/${d}/message-rules`,{method:'post',body:{name:'设备规则',description:undefined,source:'x=>x',actions:[]}});const signal=new AbortController().signal;await transport.definition!(p,r,signal);expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/message-rules/${r}`,{signal});await transport.history!(p,r,signal);expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/message-rules/${r}/version-history`,{query:{cursor:undefined,limit:1},signal});state.api.mockClear();for(const change of [{expectedVersion:1},{deviceSource:{kind:'DEVICE_TYPE' as const,referenceId:r}}])await expect(transport.create!(p,d,{name:'设备规则',source:'x=>x',actions:[],...change})).rejects.toThrow('设备创建不接受');expect(state.api).not.toHaveBeenCalled()
 })
 it('错误ID/不安全CAS/候选筛选在网络前拒绝，写失败只原样抛出不重放',async()=>{
  const signal=new AbortController().signal;await expect(transport.read(p,d,{relation:'PROJECT_CANDIDATE',status:''} as never,undefined,signal)).rejects.toThrow();await expect(transport.preference(p,r,'bad',9,signal)).rejects.toThrow();await expect(transport.change(p,r,d,9,9007199254740992,false)).rejects.toThrow();expect(state.api).not.toHaveBeenCalled();const failure=new Error('unknown');state.api.mockRejectedValueOnce(failure);await expect(transport.change(p,r,d,9,3,false)).rejects.toBe(failure);expect(state.api).toHaveBeenCalledTimes(1)
 })
 it('六类规则类型按正式query传递且非法类型在网络前拒绝',async()=>{
  const signal=new AbortController().signal
  for(const ruleType of ruleKinds){
   await transport.read(p,d,{relation:'',status:'',ruleType} as never,undefined,signal)
   expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/devices/${d}/message-rules`,{query:{relation:undefined,status:undefined,ruleType,cursor:undefined,limit:24},signal})
  }
  state.api.mockClear()
  for(const ruleType of ['UNKNOWN','COMMAND',null])await expect(transport.read(p,d,{relation:'',status:'',ruleType} as never,undefined,signal)).rejects.toThrow('筛选')
  expect(state.api).not.toHaveBeenCalled()
 })

})
