import {describe,it,expect} from 'vitest'
import {readRawRuleJson} from '../../src/features/rules/raw-rule-json'
const bytes=(value:string)=>new TextEncoder().encode(value)
describe('规则领域有界原始JSON片段',()=>{
 it('整树验证后精确保留数值token、空白及转义源码，不先转换Number',()=>{
  const raw='{ "wrapper" : { "integer":9007199254740993,"decimal":1.0000000000000001, "source":"module.exports = a=>a;\\r\\n", "list":[false,null,"30"] } }'
  const document=readRawRuleJson(bytes(raw)),value=document.at(['wrapper'])
  expect(document.raw()).toBe(raw);expect(value.at(['integer']).integerText()).toBe('9007199254740993')
  expect(value.at(['decimal']).numberLiteral()).toBe('1.0000000000000001')
  expect(value.at(['source']).raw()).toBe('"module.exports = a=>a;\\r\\n"');expect(value.at(['source']).string()).toBe('module.exports = a=>a;\r\n')
  expect(value.at(['list']).arrayLength()).toBe(3);expect(value.at(['list',0]).boolean()).toBe(false);expect(value.at(['list',1]).kind).toBe('null');expect(value.at(['list',2]).string()).toBe('30')
 })
 it('缺字段与显式null分开，错误类型和不合法索引不能降级成缺字段',()=>{
  const value=readRawRuleJson(bytes('{"nil":null,"list":[{}],"0":"key"}'))
  expect(value.optional(['missing'])).toBeUndefined();expect(value.at(['nil']).kind).toBe('null');expect(value.optional(['list',9])).toBeUndefined()
  for(const path of [['nil','x'],['list','0'],['list',-1],['list',.5]] as const)expect(()=>value.optional(path)).toThrow()
  expect(value.at(['0']).string()).toBe('key');expect(()=>value.at(['list',0]).string()).toThrow()
 })
 it('全树拒绝重复键，包括转义同名和未投影分支，原型名称保持普通数据',()=>{
  for(const source of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"used":1,"ignored":{"x":1,"x":2}}'])expect(()=>readRawRuleJson(bytes(source))).toThrow()
  const value=readRawRuleJson(bytes('{"__proto__":{"polluted":true},"constructor":"text"}'))
  expect(value.keys()).toEqual(['__proto__','constructor']);expect(value.at(['__proto__','polluted']).boolean()).toBe(true);expect(({} as Record<string,unknown>).polluted).toBeUndefined()
 })
 it('拒绝尾随根、非法数字/转义/UTF8、BOM和不成对代理字符，不输出正文',()=>{
  for(const source of ['{} {}','[1,]','{"a":01}','{"a":1.}','{"a":NaN}','{"a":"\\uD800"}','{"a":"\\x20"}','{"a":"literal\nnewline"}','\ufeff{}'])expect(()=>readRawRuleJson(bytes(source))).toThrow('规则JSON')
  expect(()=>readRawRuleJson(new Uint8Array([0xc3,0x28]))).toThrow('规则JSON');expect(()=>readRawRuleJson(new Uint16Array([123,125]) as unknown as Uint8Array)).toThrow('规则JSON')
  const secret='credential-secret';try{readRawRuleJson(bytes('{"secret":"'+secret+'",}'))}catch(error){expect(String(error)).not.toContain(secret)}
 })
 it('2MiB/节点/深度/数值token预算各自有界，超预算不返回部分正文',()=>{
  expect(()=>readRawRuleJson(new Uint8Array(2*1024*1024+1))).toThrow()
  expect(()=>readRawRuleJson(bytes('['+'0,'.repeat(16384)+'0]'))).toThrow()
  expect(()=>readRawRuleJson(bytes('['.repeat(26)+'0'+']'.repeat(26)))).toThrow()
  expect(()=>readRawRuleJson(bytes('1'.repeat(1025)))).toThrow()
 })
 it('解码后输入字节或keys副本修改不影响文档，语法读取不充当业务数值授权',()=>{
  const input=bytes('{"a":1e999999999999,"b":-0}'),value=readRawRuleJson(input);input.fill(0)
  expect(value.at(['a']).numberLiteral()).toBe('1e999999999999');expect(()=>value.at(['a']).integerText()).toThrow()
  expect(value.at(['b']).integerText()).toBe('-0')
  const keys=value.keys() as string[];keys.length=0;expect(value.keys()).toEqual(['a','b']);expect(JSON.stringify(value)).toBe('{}');expect(Object.isFrozen(value)).toBe(true)
 })
})
