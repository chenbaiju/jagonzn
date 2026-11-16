import {describe,it,expect} from 'vitest'
import {createBody,emptyDeviceForm} from '../../src/features/devices/form-model'

describe('创建标签共享规则消费者',()=>{
 it('创建沿既有裁剪策略后交共享规则，保留中文/内部空格及其它创建字段',()=>{const form=emptyDeviceForm();Object.assign(form,{name:'  设备甲  ',businessKey:'business-Key',description:' 描述 ',deviceTypeId:'type-a',groupId:'group-a',tags:[{key:' 部门 ',value:' 品控部 '},{key:'服务 商',value:'服务商甲'},{key:'',value:''}]});const before=structuredClone(form);expect(createBody(form)).toMatchObject({name:'设备甲',businessKey:'business-Key',description:'描述',deviceTypeId:'type-a',groupId:'group-a',tags:{部门:'品控部','服务 商':'服务商甲'}});expect(form).toEqual(before)})
 it.each([
  {label:'裁剪后的重复键',rows:[{key:'部门',value:'一'},{key:' 部门 ',value:'二'}]},
  {label:'用户填写的半行',rows:[{key:'部门',value:''}]},
 ])('$label被明确拒绝，不能转对象覆盖或吞掉输入',({rows})=>{const form=emptyDeviceForm();form.name='设备甲';form.tags=rows;const before=structuredClone(form);expect(()=>createBody(form)).toThrow();expect(form).toEqual(before)})
 it('被允许的字典键经创建序列化仍是自有数据属性，不改变原型',()=>{const form=emptyDeviceForm();form.name='设备甲';form.tags=[{key:'__proto__',value:'原文'},{key:'constructor',value:'当前值'}];const tags=createBody(form).tags!;expect(Object.getPrototypeOf(tags)).toBe(Object.prototype);expect(Object.hasOwn(tags,'__proto__')).toBe(true);expect(JSON.parse(JSON.stringify(tags))).toEqual(JSON.parse('{"__proto__":"原文","constructor":"当前值"}'))})
})
