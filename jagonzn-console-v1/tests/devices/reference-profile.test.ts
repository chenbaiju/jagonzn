import {describe,it,expect} from 'vitest'
import {assertProfile,businessKey,changeProfileBody,referenceVersion,sameProfile} from '../../src/features/devices/reference-profile'
const id='00000000-0000-4000-8000-000000000001'
const profile={deviceId:id,name:'设备',deviceKey:'device-key-01',description:null,deviceTypeId:null,businessKey:'Aa:BB',referenceVersion:'9223372036854775807',profileToken:'a'.repeat(64)}
describe('正式原子资料消费者边界',()=>{
 it('直接传回服务端指纹/精确版本，MAC保留原文且空标识显式清空',()=>{
  const body=changeProfileBody({name:'新名称',businessKey:'Aa:BB:01',description:''},profile)
  expect(body).toEqual({name:'新名称',businessKey:'Aa:BB:01',description:null,expectedProfileToken:profile.profileToken,expectedReferenceVersion:profile.referenceVersion})
  expect(changeProfileBody({name:'设备',businessKey:'',description:''},profile).businessKey).toBeNull()
  expect(businessKey('😀'.repeat(128))).toHaveLength(256);expect(()=>businessKey('😀'.repeat(129))).toThrow()
 })
 it('拒绝别设备/缺失指纹/数字或溢出版本，不能误用旧设备响应',()=>{
  for(const value of [{...profile,deviceId:undefined},{...profile,profileToken:undefined},{...profile,referenceVersion:0},{...profile,referenceVersion:'9223372036854775808'},{...profile,businessKey:undefined},{...profile,deviceTypeId:'wrong'},{...profile,deviceKey:undefined},{...profile,deviceKey:'bad/key'}])expect(()=>assertProfile(value as any,id)).toThrow()
  expect(()=>assertProfile(profile,'00000000-0000-4000-8000-000000000002')).toThrow()
  expect(referenceVersion('01')).toBe(false);expect(referenceVersion('9223372036854775807')).toBe(true)
 })
 it('写后核对完整同设备资料，不将另一时刻改名拼成写成功回执',()=>{
  expect(sameProfile(profile,{...profile})).toBe(true);expect(sameProfile(profile,{...profile,name:'另一修改'})).toBe(false)
 })
})
