import {beforeEach,describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async(importOriginal)=>({...await importOriginal<typeof import('../../src/core/http')>(),api:state.api}))
import {deviceTaskDefinitionApi as transport} from '../../src/features/rules/device-task-definition-api'
const p='10000000-0000-4000-8000-000000000001',d='20000000-0000-4000-8000-000000000001',j='30000000-0000-4000-8000-000000000001'
describe('正式543设备任务端口接线',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.api.mockResolvedValue({})})
 it('直接调用设备目录及三筛选，不调用项目任务全集或前端过滤',async()=>{
  const signal=new AbortController().signal;await transport.read(p,d,{relation:'DEVICE_TYPE',status:'PAUSED',taskType:'COMMAND'},'signed-cursor',signal)
  expect(state.api).toHaveBeenCalledExactlyOnceWith(`/api/v1/projects/${p}/devices/${d}/task-jobs`,{query:{relation:'DEVICE_TYPE',status:'PAUSED',taskType:'COMMAND',cursor:'signed-cursor',limit:24},signal})
 })
 it('独立偏好只点读当前job/device并绑定定义，不遍历设备偏好页',async()=>{
  const signal=new AbortController().signal;await transport.preference(p,j,d,9,signal);expect(state.api).toHaveBeenCalledExactlyOnceWith(`/api/v1/projects/${p}/task-jobs/${j}/device-schedules/${d}`,{query:{expectedDefinitionVersion:9},signal})
 })
 it('复用双CAS偏好PUT与正式单台手动端口，不能换成全局enabled或所有目标',async()=>{
  await transport.change(p,j,d,9,3,false);expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/task-jobs/${j}/device-schedules/${d}`,{method:'put',body:{allowed:false,expectedVersion:3,expectedDefinitionVersion:9}})
  await transport.run(p,j,d,9);expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/task-jobs/${j}/device-runs/${d}`,{method:'post',body:{expectedVersion:9}});expect(state.api).toHaveBeenCalledTimes(2)
 })
 it('非法标识/CAS或未知类型在网络前拒绝，不悄丢条件',async()=>{
  const signal=new AbortController().signal;await expect(transport.read(p,'bad',{relation:'',status:'',taskType:''},undefined,signal)).rejects.toThrow('标识无效');await expect(transport.read(p,d,{relation:'',status:'',taskType:'CLOUD_FUNCTION'} as never,undefined,signal)).rejects.toThrow('筛选无效');await expect(transport.preference(p,j,d,0,signal)).rejects.toThrow();expect(state.api).not.toHaveBeenCalled()
 })
 it('冲突原样交给成熟状态机，不自行重放写入或先改全局状态',async()=>{
  const failure=new Error('conflict');state.api.mockRejectedValueOnce(failure);await expect(transport.change(p,j,d,9,3,true)).rejects.toBe(failure);expect(state.api).toHaveBeenCalledTimes(1)
 })
 it('创建只用既有POST及精确定义GET，拒绝全体/多设备/启用范围',async()=>{
  const body={name:'采样',commandKey:'sample',input:{},scheduleType:'MANUAL' as const,timezone:'Asia/Shanghai',targetType:'EXPLICIT_DEVICES' as const,targetDeviceIds:[d],enabled:false}
  await transport.create!(p,d,body);expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/task-jobs`,{method:'post',body:expect.objectContaining(body)});const signal=new AbortController().signal;await transport.definition!(p,j,signal);expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${p}/task-jobs/${j}`,{signal});state.api.mockClear()
  for(const change of [{targetType:'ALL_DEVICES' as const},{targetDeviceIds:[d,j]},{enabled:true},{scheduleType:'CRON' as const}])await expect(transport.create!(p,d,{...body,...change})).rejects.toThrow('创建范围无效')
  expect(state.api).not.toHaveBeenCalled()
 })
})
