import {beforeEach,describe,expect,it,vi} from 'vitest'
import {captureBoundPropertyDownlinkModel,readPropertyDownlinkCapabilities} from '../../src/features/devices/property-downlink-capabilities-api'
import {preparePlatformPropertyBody,prepareSinglePlatformPropertyBody} from '../../src/features/devices/platform-properties-json'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',()=>({api:state.api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',model='00000000-0000-4000-8000-000000000003'
const capabilityId='019a0a00-0000-7000-8000-000000000001',ticket='00000000-0000-4000-8000-000000000004'
const item=()=>({capabilityId,connectionTicketId:ticket,modelVersionId:model,schemaDigest:'a'.repeat(64),maximumPayloadBytes:4096,declaredAt:'2026-10-29T00:00:00Z'})
const facts=(capabilities:ReturnType<typeof item>[]=[])=>( {projectId:project,deviceId:device,modelVersionId:model,sendEnabled:false,capabilities} )
describe('精确混合下行原声明只读helper',()=>{
 beforeEach(()=>vi.clearAllMocks())
 it('只从相同绑定版本完整快照冻结混合键全集，错摘要或缺域不降级为普通下行',()=>{
  const type='00000000-0000-4000-8000-000000000005',version={id:model,deviceTypeId:type,schemaDigest:'a'.repeat(64),digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256'}
  const modelSnapshot={properties:{unreported:{dataType:'LIST',compositeProfile:'BASIC_MIXED_LIST_V1'},scalar:{dataType:'TEXT'}},events:{},commands:{}}
  const snapshot={version,modelSnapshot},bound=captureBoundPropertyDownlinkModel(project,device,type,version,snapshot)
  expect(bound).toEqual({projectId:project,deviceId:device,modelVersionId:model,schemaDigest:version.schemaDigest,mixedKeys:['unreported']});expect(Object.isFrozen(bound?.mixedKeys)).toBe(true)
  for(const invalid of [{...snapshot,version:{...version,id:device}},{...snapshot,version:{...version,schemaDigest:'b'.repeat(64)}},{...snapshot,version:{...version,deviceTypeId:device}},{...snapshot,modelSnapshot:{properties:modelSnapshot.properties,events:{}}}])expect(()=>captureBoundPropertyDownlinkModel(project,device,type,version,invalid)).toThrow()
 })
 it('关闭/空候选保留真实事实，单候选仅返回不自动选择或提交',async()=>{
  state.api.mockResolvedValueOnce(facts()).mockResolvedValueOnce(facts([item()]))
  expect(await readPropertyDownlinkCapabilities(project,device,model)).toEqual(facts())
  const signal=new AbortController().signal,value=await readPropertyDownlinkCapabilities(project,device,model,signal)
  expect(value.sendEnabled).toBe(false);expect(value.capabilities).toEqual([item()]);expect(state.api).toHaveBeenCalledTimes(2)
  expect(state.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/devices/${device}/property-downlink-capabilities`,{query:{expectedModelVersionId:model},signal})
 })
 it('错模型/重复声明/非闭集摘要拒绝，不从坏范围提取候选',async()=>{
  for(const value of [{...facts(),modelVersionId:device},facts([item(),item()]),facts([{...item(),schemaDigest:'a'.repeat(65)}])]){
   state.api.mockResolvedValueOnce(value);await expect(readPropertyDownlinkCapabilities(project,device,model)).rejects.toThrow()
  }
 })
 it('仅显式原声明追加第三字段，保留数字原文及旧两字段字节',()=>{
  const raw='[0.1234567890123456789,9007199254740993,true,"ON"]'
  const legacy=prepareSinglePlatformPropertyBody(model,'mixed',raw)
  expect(legacy.body).toBe(`{"expectedModelVersionId":"${model}","properties":{"mixed":${raw}}}`)
  const exact=prepareSinglePlatformPropertyBody(model,'mixed',raw,capabilityId)
  expect(exact.body).toBe(`{"expectedModelVersionId":"${model}","properties":{"mixed":${raw}},"expectedDownlinkCapabilityId":"${capabilityId}"}`)
  expect(()=>preparePlatformPropertyBody(model,'{"mixed":[]}','other')).toThrow()
 })
})
