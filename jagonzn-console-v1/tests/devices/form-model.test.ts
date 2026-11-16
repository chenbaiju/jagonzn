import { describe,it,expect } from 'vitest'
import { createBody,emptyDeviceForm,csvCell } from '../../src/features/devices/form-model'
describe('设备原子创建参数',()=>{
  function form(){return {...emptyDeviceForm(),name:'设备 A',businessKey:'Aa:Bb:01:02'}}
  it('在单个请求中携带静态组与所有键值标签',()=>{const f=form();f.groupId='group';f.tags=[{key:'site',value:'north'},{key:'floor',value:'2'}];expect(createBody(f)).toMatchObject({groupId:'group',tags:{site:'north',floor:'2'}})})
  it('允许未绑定类型且空标签不发送',()=>{expect(createBody(form())).toMatchObject({deviceTypeId:undefined,tags:undefined})})
  it('可填写MAC/Unicode业务标识，拒绝控制字符、首尾空格和超长',()=>{expect(createBody(form())).toMatchObject({businessKey:'Aa:Bb:01:02'});expect(createBody({...form(),businessKey:'中文😀'}).businessKey).toBe('中文😀');for(const businessKey of [' key','key ','a\u0001b','x'.repeat(129),'\ud800'])expect(()=>createBody({...form(),businessKey})).toThrow('唯一标识')})
  it('阻止重复标签，避免后键静默覆盖',()=>{expect(()=>createBody({...form(),tags:[{key:'site',value:'a'},{key:' site ',value:'b'}]})).toThrow('重复')})
  it('阻止不完整或超量标签',()=>{expect(()=>createBody({...form(),tags:[{key:'site',value:''}]})).toThrow('标签');expect(()=>createBody({...form(),tags:Array.from({length:21},(_,i)=>({key:`t${i}`,value:'x'}))})).toThrow('20')})
  it('标签的特殊键保留为普通数据',()=>{expect(createBody({...form(),tags:[{key:'constructor',value:'x'}]}).tags?.constructor).toBe('x')})
})
describe('当前页CSV',()=>{
  it('对公式与引号转义',()=>{expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');expect(csvCell('正常')).toBe('"正常"')})
})

it('原站业务标识允许省略且保持空值',()=>{expect(createBody({...emptyDeviceForm(),name:'新设备'}).businessKey).toBeNull()})

it('省略设备唯一标识时显式为空并由服务端生成，不隐式选择类型',()=>{const body=createBody({...emptyDeviceForm(),name:'原站设备'});expect(body.businessKey).toBeNull();expect(body.deviceKey).toBeNull();expect(body.deviceTypeId).toBeUndefined()})

it('显式设备唯一标识必须是MQTT Topic安全段',()=>{
 expect(createBody({...emptyDeviceForm(),name:'显式设备',deviceKey:'explicit_key_01'}).deviceKey).toBe('explicit_key_01')
 for(const key of ['芯片','a b','x'.repeat(65),'bad/key'])expect(()=>createBody({...emptyDeviceForm(),name:'显式设备',deviceKey:key})).toThrow('设备唯一标识')
})
