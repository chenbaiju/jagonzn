import {describe,it,expect} from 'vitest'
import {ruleTagsValue,newRuleTag} from '../../src/features/rules/rule-tag-draft'
import {preprocessDraft,newConditionGroup,newFunction} from '../../src/features/rules/rule-builder-draft'
const row=(key:string,value='')=>({...newRuleTag(),key,value})
describe('规则标签完整原文与安全构造',()=>{
 it('标签码点边界和原文值含空文本保留，不依赖UTF16 maxlength',()=>{
  expect(ruleTagsValue([row('😀'.repeat(64),'  中文  '),row('部门','')])).toEqual({['😀'.repeat(64)]:'  中文  ',部门:''})
  expect(()=>ruleTagsValue([row('😀'.repeat(65))])).toThrow('64');expect(ruleTagsValue([row('值','😀'.repeat(256))]).值).toHaveLength(512);expect(()=>ruleTagsValue([row('值','😀'.repeat(257))])).toThrow('256')
 })
 it('重复与空键/控制符/不成对代理/首尾空白拒绝，不静默归一或丢行',()=>{
  for(const key of ['', ' ', ' a','a\u2000','\u0080','\ud800'])expect(()=>ruleTagsValue([row(key)])).toThrow()
  for(const value of ['\n','\u0085','\udc00'])expect(()=>ruleTagsValue([row('a',value)])).toThrow()
  expect(()=>ruleTagsValue([row('部门','一'),row('部门','二')])).toThrow('重复');expect(ruleTagsValue([row('\u00a0','\u00a0')])).toEqual({'\u00a0':'\u00a0'})
 })
 it('原型名称作为自有文本键，不污染对象且完整集合有界',()=>{
  const saved=ruleTagsValue([row('__proto__','原文'),row('constructor','文本'),row('status','ACTIVE')]);expect(Object.getPrototypeOf(saved)).toBe(Object.prototype);expect(Object.hasOwn(saved,'__proto__')).toBe(true);expect(JSON.parse(JSON.stringify(saved))['__proto__']).toBe('原文');expect(({} as Record<string,unknown>).polluted).toBeUndefined()
  expect(Object.keys(ruleTagsValue(Array.from({length:32},(_,i)=>row('key'+i))))).toHaveLength(32);expect(()=>ruleTagsValue(Array.from({length:33},(_,i)=>row('key'+i)))).toThrow('32')
 })
 it('领域创建意图冻结完整标签，空对象显式保留而非丢失选择',()=>{
  const tags=[row('部门','  原文  ')],form={name:'p',description:'',kind:'ATTRS_RPT_PREPROC' as const,filter:newConditionGroup(),functions:[{...newFunction(),source:'a=>a'}],tags};const draft=preprocessDraft(form);tags[0]!.value='changed';expect(draft.tags).toEqual({部门:'  原文  '});expect(preprocessDraft({...form,tags:[]}).tags).toEqual({});expect(()=>preprocessDraft({...form,tags:[row('')]})).toThrow('标签名称')
 })
})
