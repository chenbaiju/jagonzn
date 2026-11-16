import {expect,it} from 'vitest'
import {readCommandParameterForm,commandParameterSchema,newCommandParameter} from '../../src/features/device-types/command-parameter-schema'
import {parseDashboardRuntimeResponse,isStrictJsonNumber} from '@things-link/client-contracts/dashboard/v1'
it('简单参数表单保留名称/说明、必填、精确边界和枚举词法，空约束与空对象保持区别',()=>{
 const schema='{"type":"object","properties":{"amount":{"type":"number","title":"数量","description":" 原说明 ","minimum":9007199254740993,"maximum":9007199254740993.1234567890123456789,"enum":[9007199254740993.1234567890123456789]},"result":{"type":"array","minItems":0,"maxItems":3}},"required":["amount"],"additionalProperties":false}'
 const form=readCommandParameterForm(schema)!;expect(form.rows[0]).toMatchObject({key:'amount',name:'数量',description:' 原说明 ',required:true,minimum:'9007199254740993',maximum:'9007199254740993.1234567890123456789'});expect(form.additionalProperties).toBe(false)
 const output=commandParameterSchema(form);expect(output).toContain('9007199254740993.1234567890123456789');expect(readCommandParameterForm(output)).toEqual(form);expect(readCommandParameterForm('')?.unconstrained).toBe(true);expect(readCommandParameterForm('{"type":"object"}')?.unconstrained).toBe(false)
 const raw=parseDashboardRuntimeResponse(new TextEncoder().encode(output));expect(isStrictJsonNumber((raw.properties as any).amount.minimum)).toBe(true)
})
it('未知/默认/联合Schema不能切换表单，非法键/边界和重复参数不能重建',()=>{
 for(const schema of ['{"type":"object","properties":{"n":{"type":"number","default":0.1234567890123456789}}}','{"type":"object","properties":{"n":{"type":["number","null"]}}}','{"type":"object","allOf":[{"required":["n"]}]}','{"type":"object","properties":{"n":{"$ref":"#/defs/n"}}}','{"type":"object","properties":{"n":{"type":"string","maxLength":2147483648}}}'])expect(readCommandParameterForm(schema)).toBeUndefined()
 const root=readCommandParameterForm('')!,row={...newCommandParameter(),key:'n',minimum:'9007199254740993'};expect(commandParameterSchema({...root,rows:[row]})).toContain('"minimum":9007199254740993');expect(()=>commandParameterSchema({...root,rows:[row,row]})).toThrow('不能重复');expect(()=>commandParameterSchema({...root,rows:[{...row,minimum:'"1"'}]})).toThrow();expect(()=>commandParameterSchema({...root,rows:[{...row,key:'bad/key'}]})).toThrow();expect(()=>commandParameterSchema({...root,rows:[{...row,type:'string',maxLength:'1.5'}]})).toThrow('长度')
})

it('对象子字段与列表元素递归保留精确Schema，未知子约束保留在子JSON',()=>{
 const input='{"type":"object","properties":{"samples":{"type":"array","items":{"type":"object","properties":{"n":{"type":"number","minimum":0.1234567890123456789}},"required":["n"],"additionalProperties":false}},"config":{"type":"object","properties":{"label":{"type":"string","default":"原值"}},"required":[],"additionalProperties":false}}}'
 const form=readCommandParameterForm(input)!;expect(form.rows).toHaveLength(2);expect(form.rows[0]!.nestedSchema).toContain('0.1234567890123456789');expect(readCommandParameterForm(form.rows[1]!.nestedSchema)).toBeUndefined();
 form.rows[0]!.name='采样';const output=commandParameterSchema(form);expect(output).toContain('0.1234567890123456789');expect(output).toMatch(/"default"\s*:\s*"原值"/);expect(readCommandParameterForm(output)?.rows[0]).toMatchObject({name:'采样',nestedSchema:form.rows[0]!.nestedSchema})
 const child=readCommandParameterForm('')!;child.rows.push({...newCommandParameter(),key:'enabled',type:'boolean',required:true});form.rows[1]!.nestedSchema=commandParameterSchema(child);expect(commandParameterSchema(form)).toContain('"required":["enabled"]')
 expect(()=>commandParameterSchema({...form,rows:[{...form.rows[0]!,nestedSchema:'{"type":"number","type":"string"}'}]})).toThrow()
})
