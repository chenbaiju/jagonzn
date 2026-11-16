import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {effectScope,type EffectScope} from 'vue'
import {changeIdentity} from '@/core/http'
import {devicesApi} from '@/features/devices/api'
import {writeBatchRow} from '@/features/devices/device-batch-api'
import {useDeviceMaintenanceAction} from '@/features/devices/use-device-maintenance-action'

vi.mock('@/core/session',async()=>{
 const {ref}=await import('vue')
 return {projectId:ref('00000000-0000-4000-8000-000000000001'),currentProject:ref({status:'ACTIVE'}),can:()=>true}
})
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002'
const endpoint=`/api/v1/projects/${project}/devices/${device}/removal`
const fetchMock=vi.fn(),scopes:EffectScope[]=[]
const error=(status:number,code:number)=>new Response(JSON.stringify({code,message:'本次移除未完成'}),{status,headers:{'Content-Type':'application/json'}})
function request(index=0){const [url,init]=fetchMock.mock.calls[index];return {url:url as URL,init:init as RequestInit}}
function expectRemoval(index=0){
 const {url,init}=request(index)
 expect(url.pathname).toBe(endpoint);expect(url.search).toBe('')
 expect(init.method).toBe('POST');expect(init.body).toBeUndefined()
 expect((init.headers as Headers).get('Idempotency-Key')).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
}
function maintenance(){
 const removed=vi.fn(),scope=effectScope();scopes.push(scope)
 const action=scope.run(()=>useDeviceMaintenanceAction('remove',{device:()=>device,readable:()=>true,visible:()=>true,available:()=>true,access:()=>undefined,onRemoved:removed,onAccess:()=>{}}))!
 return {action,removed}
}
beforeEach(()=>{fetchMock.mockReset();changeIdentity('controlled-console-token');vi.stubGlobal('fetch',fetchMock)})
afterEach(()=>{scopes.splice(0).forEach(scope=>scope.stop());vi.unstubAllGlobals()})

describe('Console安全移除固定入口与两个真实消费者',()=>{
 it('每次明确调用使用独立key，空正文POST成功不补DELETE或GET',async()=>{
  fetchMock.mockImplementation(()=>Promise.resolve(new Response(null,{status:204})))
  await devicesApi.remove(project,device);await devicesApi.remove(project,device)
  expect(fetchMock).toHaveBeenCalledTimes(2);expectRemoval(0);expectRemoval(1)
  expect((request(0).init.headers as Headers).get('Idempotency-Key')).not.toBe((request(1).init.headers as Headers).get('Idempotency-Key'))
 })
 it.each([[409,10009,false],[409,10010,false],[409,10014,false],[403,30024,false],[404,10004,false],[503,10000,true]])('拒绝%s/%s只传递原结果，不回退通用删除',async(status,code,unknown)=>{
  fetchMock.mockResolvedValue(error(status as number,code as number))
  await expect(devicesApi.remove(project,device)).rejects.toMatchObject({status,code,outcomeUnknown:unknown})
  expect(fetchMock).toHaveBeenCalledTimes(1);expectRemoval()
 })
 it('网络丢失保持unknown且不自动重发',async()=>{
  fetchMock.mockRejectedValue(new TypeError('connection lost'))
  await expect(devicesApi.remove(project,device)).rejects.toMatchObject({status:0,outcomeUnknown:true})
  expect(fetchMock).toHaveBeenCalledTimes(1);expectRemoval()
 })
 it('目录批次真实writer消费同一个安全入口',async()=>{
  fetchMock.mockResolvedValue(new Response(null,{status:204}))
  await writeBatchRow(project,{id:device,name:'受控设备',status:'READY',detail:'待确认'},'remove','',new AbortController().signal)
  expect(fetchMock).toHaveBeenCalledTimes(1);expectRemoval()
 })
 it('单设备真实hook取消零写，重新确认只提交安全入口',async()=>{
  fetchMock.mockResolvedValue(new Response(null,{status:204}))
  const {action,removed}=maintenance();action.start();action.close();expect(fetchMock).not.toHaveBeenCalled()
  action.start();await action.confirm.value()
  expectRemoval();expect(fetchMock).toHaveBeenCalledTimes(1);expect(removed).toHaveBeenCalledTimes(1)
 })
 it('单设备安全移除503后关闭重开只核对，读404不冒原请求成功',async()=>{
  fetchMock.mockResolvedValueOnce(error(503,10000)).mockResolvedValueOnce(error(404,30001))
  const {action,removed}=maintenance();action.start();const original=action.confirm.value;await original()
  action.close();action.start();await original();expect(fetchMock).toHaveBeenCalledTimes(1)
  await action.reread();expect(fetchMock).toHaveBeenCalledTimes(2);expectRemoval()
  expect(request(1).init.method).toBe('GET');expect(request(1).url.pathname).toBe(endpoint.replace('/removal',''))
  expect(action.review.value).toBe(true);expect(action.canContinue.value).toBe(false);expect(removed).not.toHaveBeenCalled()
 })
})
