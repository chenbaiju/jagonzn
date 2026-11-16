import {beforeEach,describe,it,expect,vi} from 'vitest'
import {prepareTypeAssignment,submitTypeAssignment,decodeTypeAssignment} from '../../src/features/devices/device-type-assignment-api'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',()=>({api:state.api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',type='00000000-0000-4000-8000-000000000003'
const bytes=(value:string)=>new TextEncoder().encode(value)
describe('类型独立写面原件和回执',()=>{
 beforeEach(()=>{vi.clearAllMocks()})
 it('请求只有显式两类型字段，有限字节和原幂等键，无陈旧资料',async()=>{
  const intent=prepareTypeAssignment(project,device,null,type),controller=new AbortController();await submitTypeAssignment(intent,controller.signal)
  expect(Object.isFrozen(intent)).toBe(true);expect(state.api).toHaveBeenCalledWith(`/api/v1/projects/${project}/devices/${device}/type-assignment`,expect.objectContaining({method:'put',body:{deviceTypeId:type,expectedDeviceTypeId:null},responseType:'bytes',maxResponseBytes:2048,headers:{'Idempotency-Key':intent.key},signal:controller.signal}))
 })
 it('空选择、伪造范围、短UUID和无效前提在网络前拒绝',()=>{for(const values of [[project,device,null,''],['bad',device,null,type],[project,device,'1-1-1-1-1',type]] as Array<[string,string,string|null,string]>)expect(()=>prepareTypeAssignment(values[0]!,values[1]!,values[2],values[3]!)).toThrow()})
 it('只接收当前设备和明确所选类型的完整两字段回执',()=>{
  const intent=prepareTypeAssignment(project,device,null,type);expect(decodeTypeAssignment(bytes(JSON.stringify({deviceId:device,deviceTypeId:type})),intent)).toEqual({deviceId:device,deviceTypeId:type})
  for(const value of [{},{deviceId:device},{deviceId:project,deviceTypeId:type},{deviceId:device,deviceTypeId:null},{deviceId:device,deviceTypeId:type,name:'extra'}])expect(()=>decodeTypeAssignment(bytes(JSON.stringify(value)),intent)).toThrow()
 })
 it('重复键、尾随JSON和非法UTF8不能被JSON.parse覆盖成成功',()=>{
  const intent=prepareTypeAssignment(project,device,null,type)
  for(const text of [`{"deviceId":"${device}","deviceTypeId":"${type}","deviceTypeId":"${type}"}`,`{"deviceId":"${device}","deviceTypeId":"${type}"}{}`])expect(()=>decodeTypeAssignment(bytes(text),intent)).toThrow()
  expect(()=>decodeTypeAssignment(new Uint8Array([0xc3,0x28]),intent)).toThrow()
 })
})


it('从类型移除显式发送null并严格核对空类型回执',async()=>{
 const intent=prepareTypeAssignment(project,device,type,null),signal=new AbortController().signal
 await submitTypeAssignment(intent,signal);expect(state.api.mock.lastCall?.[1]).toMatchObject({body:{deviceTypeId:null,expectedDeviceTypeId:type},headers:{'Idempotency-Key':intent.key}})
 expect(decodeTypeAssignment(bytes(JSON.stringify({deviceId:device,deviceTypeId:null})),intent)).toEqual({deviceId:device,deviceTypeId:null})
 for(const value of [{deviceId:device},{deviceId:device,deviceTypeId:type},{deviceId:project,deviceTypeId:null}])expect(()=>decodeTypeAssignment(bytes(JSON.stringify(value)),intent)).toThrow()
})
