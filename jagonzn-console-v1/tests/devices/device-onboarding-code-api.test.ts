import {describe,it,expect} from 'vitest'
import {parseDeviceOnboardingCode} from '../../src/features/devices/device-onboarding-code-api'

const device='00000000-0000-4000-8000-000000000001'
const value={deviceId:device,deviceTypeId:null,codeMode:'AUTO',code:'00000001',allowUserAdd:false,previouslyConnected:false}
describe('当前设备码的封闭读取投影',()=>{
 it('保留八位数字原文及前导零，类型关闭不隐去当前码',()=>{
  expect(parseDeviceOnboardingCode(value,device)).toEqual(value)
  expect(Object.isFrozen(parseDeviceOnboardingCode(value,device))).toBe(true)
 })
 it('业务标识复用原资料Unicode/codepoint规则，不转换为数字或URL',()=>{
  const code='💡'.repeat(128)
  expect(parseDeviceOnboardingCode({...value,codeMode:'BUSINESS_KEY',code},device).code).toBe(code)
  expect(parseDeviceOnboardingCode({...value,codeMode:'BUSINESS_KEY',code:null},device).code).toBeNull()
 })
 it.each([
  {...value,code:1},{...value,code:'0000001'},{...value,code:null},
  {...value,deviceId:'00000000-0000-4000-8000-000000000002'},
  {...value,deviceTypeId:'invalid'},{...value,allowUserAdd:'false'},
  {...value,codeMode:{toString:():string=>'AUTO'}},{...value,secret:'must-not-display'},
  {...value,codeMode:'BUSINESS_KEY',code:''},
  {...value,codeMode:'BUSINESS_KEY',code:'💡'.repeat(129)},
  {...value,codeMode:'BUSINESS_KEY',code:' surrounded '},
  {...value,codeMode:'BUSINESS_KEY',code:'\u0085'},
  {...value,codeMode:'BUSINESS_KEY',code:'\ud800'},
 ])('拒绝错误范围、秘密混入或非原始标识 %#',bad=>{
  expect(()=>parseDeviceOnboardingCode(bad,device)).toThrow('设备码资料不完整')
 })
})
