import {describe,it,expect,vi,beforeEach} from 'vitest'
import {platformCurrent,submitPlatformProperties,readPlatformPropertySubmission,assertPlatformReceipt} from '../../src/features/devices/platform-properties-api'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async()=>{const original=await vi.importActual('../../src/core/http');return{...original,api:state.api}})
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',model='00000000-0000-4000-8000-000000000003',operation='00000000-0000-4000-8000-000000000004'
describe('平台属性正式路径消费者',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.api.mockResolvedValue({})})
 it('双动作使用各自正式方法、JSON原始正文和幂等头，不调用desired或规则动作',async()=>{
  const body=`{"expectedModelVersionId":"${model}","properties":{"n":9007199254740993}}`
  await submitPlatformProperties(project,device,'DOWNLINK',body,'first');await submitPlatformProperties(project,device,'CLOUD_UPDATE',body,'second')
  expect(state.api.mock.calls).toEqual([
   [`/api/v1/projects/${project}/devices/${device}/platform-properties/downlink`,{method:'post',rawBody:body,headers:{'Content-Type':'application/json','Idempotency-Key':'first'}}],
   [`/api/v1/projects/${project}/devices/${device}/platform-properties/cloud`,{method:'put',rawBody:body,headers:{'Content-Type':'application/json','Idempotency-Key':'second'}}]
  ])
 })
 it.each(['DOWNLINK','CLOUD_UPDATE'] as const)('原%s请求只经GET原键/正文摘要读取并封闭校验回执',async kind=>{
  const signal=new AbortController().signal,bodyHash='a'.repeat(64),receipt={operationId:operation,projectId:project,deviceId:device,modelVersionId:model,kind,acceptedAt:'2026-10-24T00:00:00Z',commandId:kind==='DOWNLINK'?operation:null}
  state.api.mockResolvedValue(receipt);await expect(readPlatformPropertySubmission(project,device,model,kind,'original-key',bodyHash,signal)).resolves.toEqual(receipt)
  expect(state.api).toHaveBeenCalledWith(`/api/v1/projects/${project}/devices/${device}/platform-properties/submissions/${kind}`,{headers:{'Original-Request-Key':'original-key','X-Request-Body-SHA256':bodyHash},signal})
  state.api.mockResolvedValue({...receipt,modelVersionId:operation});await expect(readPlatformPropertySubmission(project,device,model,kind,'original-key',bodyHash,signal)).rejects.toThrow('回执身份不完整')
 })
 it('来源读取使用GET正式查询和剩余字节预算，保留原始数值响应',async()=>{
  const controller=new AbortController();await platformCurrent(project,device,model,['n','d'],controller.signal,123456)
  expect(state.api).toHaveBeenCalledWith(`/api/v1/projects/${project}/devices/${device}/platform-properties/current`,{query:{expectedModelVersionId:model,propertyKeys:['n','d']},responseType:'bytes',maxResponseBytes:123456,signal:controller.signal})
 })
 it('回执身份/来源/命令相关性封闭核对，真null不接受省略或字符串null',async()=>{
  const receipt={operationId:operation,projectId:project,deviceId:device,modelVersionId:model,kind:'CLOUD_UPDATE' as const,acceptedAt:'2026-10-24T00:00:00Z',commandId:null}
  expect(()=>assertPlatformReceipt(receipt,project,device,model,'CLOUD_UPDATE')).not.toThrow()
  for(const change of [{commandId:undefined},{commandId:'null'},{commandId:operation},{projectId:device},{deviceId:project},{modelVersionId:operation},{operationId:'fake'},{acceptedAt:'bad'},{extra:true}])expect(()=>assertPlatformReceipt({...receipt,...change},project,device,model,'CLOUD_UPDATE')).toThrow()
  expect(()=>assertPlatformReceipt({...receipt,kind:'DOWNLINK',commandId:operation},project,device,model,'DOWNLINK')).not.toThrow()
  const logical={...receipt,kind:'DOWNLINK' as const,deliveryMode:'TCP_LOGICAL' as const,commandId:null};expect(()=>assertPlatformReceipt(logical,project,device,model,'DOWNLINK')).not.toThrow()
  for(const change of [{commandId:operation},{commandId:undefined},{commandId:'null'},{deliveryMode:null},{deliveryMode:'MQTT'},{deliveryMode:undefined},{kind:'CLOUD_UPDATE'},{extra:true}])expect(()=>assertPlatformReceipt({...logical,...change} as never,project,device,model,'DOWNLINK')).toThrow()
  state.api.mockResolvedValue(logical);await expect(readPlatformPropertySubmission(project,device,model,'DOWNLINK','original-tcp-key','a'.repeat(64))).resolves.toEqual(logical);expect(state.api).toHaveBeenCalledTimes(1);expect(state.api.mock.calls[0]![1]).not.toHaveProperty('method');expect(state.api.mock.calls[0]![1]).toMatchObject({headers:{'Original-Request-Key':'original-tcp-key','X-Request-Body-SHA256':'a'.repeat(64)}})

 })
 it('回执时间必须完整带时区的RFC3339，不能把本机时区日期当服务端时间',()=>{
  const receipt={operationId:operation,projectId:project,deviceId:device,modelVersionId:model,kind:'CLOUD_UPDATE' as const,acceptedAt:'2026-10-24T00:00:00Z',commandId:null}
  for(const acceptedAt of ['2026-10-24T00:00:00','2026-10-24T00:00Z','2026-10-24T00:00:00+0800','2026-10-24T00:00:00Z extra'])expect(()=>assertPlatformReceipt({...receipt,acceptedAt},project,device,model,'CLOUD_UPDATE')).toThrow()
  for(const acceptedAt of ['2026-10-24T00:00:00Z','2026-10-24T08:00:00.123456789+08:00'])expect(()=>assertPlatformReceipt({...receipt,acceptedAt},project,device,model,'CLOUD_UPDATE')).not.toThrow()
 })

})
