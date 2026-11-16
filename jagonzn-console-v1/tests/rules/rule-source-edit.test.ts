import {describe,expect,it} from 'vitest'
import {ruleEditor} from '../../src/features/rules/models'
describe('编辑不可变规则版本保留实际来源',()=>{
 it.each(['DEVICE','DEVICE_TYPE'])('显式编辑%s版本保留其绑定，不从活动版本继承覆盖草稿',kind=>{
  const deviceSource={kind,referenceId:'20000000-0000-4000-8000-000000000001'},version:any={id:'v',versionNumber:2,source:'return message',actions:[],deviceSource};const body:any=ruleEditor({id:'r',version:9},version);expect(body.deviceSource).toEqual(deviceSource);expect(body.expectedVersion).toBe(9);deviceSource.referenceId='changed';expect(body.deviceSource.referenceId).toBe('20000000-0000-4000-8000-000000000001')
 })
 it('显式来源损坏不能静默省略成服务端继承',()=>{
  expect(()=>ruleEditor({id:'r',version:9},{id:'v',source:'return message',actions:[],deviceSource:{kind:'DEVICE',referenceId:null}} as any)).toThrow('来源')
 })
})
