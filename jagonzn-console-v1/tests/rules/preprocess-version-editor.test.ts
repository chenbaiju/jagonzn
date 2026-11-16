import {describe,it,expect} from 'vitest'
import {loadPreprocessVersion,makeRevisionIntent,confirmRevision,editPreprocessingJson,exactRevisionCounter,revisionDraftChanged} from '../../src/features/rules/preprocess-version-editor'
import {parsePreprocessJson,writePreprocessJson,ExactDecimal,compareDecimal,type ExactJson} from '../../src/features/rules/preprocess-exact-json'
import {newCondition,newConditionGroup,conditionValue} from '../../src/features/rules/rule-builder-draft'
import {versionSeed,confirmedSeed,source,second} from './preprocess-version-seed.fixture'
const attempt='50000000-0000-4000-8000-000000000001'
describe('完整前处理编辑领域基线',()=>{
 it('精确回填所有条件类型、括号与有序函数，不经过Number或JSON.parse数字',()=>{
  const seed=versionSeed(),loaded=loadPreprocessVersion(seed,seed),form=loaded.draft
  expect(form.filter.conditions[0]!.text).toBe('1.0000000000000001');expect(form.filter.conditions[1]!.operator).toBe('EXISTS')
  const child=form.filter.groups[0]!
  expect(child.conditions[0]!.booleanValue).toBe(false);expect(child.conditions[1]!.valueType).toBe('null');expect(child.conditions[2]!.text).toBe('30');expect(child.conditions[3]!.lower).toBe('9007199254740993')
  expect(form.functions.map(row=>row.source)).toEqual([source,second]);expect(()=>makeRevisionIntent(loaded,form,attempt)).toThrow('先修改')
  form.name='新名称';const intent=makeRevisionIntent(loaded,form,attempt)
  expect(intent.expectedDefinitionVersion).toBe('9007199254740993');expect(intent.baseVersionNumber).toBe('7')
  expect(intent.preprocessingJson).toContain('10000000000000001e-16');expect(intent.preprocessingJson).toContain('9007199254740993')
  expect(intent).not.toHaveProperty('tags');expect(intent).not.toHaveProperty('enabled')
  const tree=parsePreprocessJson(intent.preprocessingJson) as {[key:string]:ExactJson}
  expect(writePreprocessJson(tree)).toBe(intent.preprocessingJson)
 })
 it('外部种子修改与草稿编辑都不能改冻结基线；数值同值表示不追加空版本',()=>{
  const seed=versionSeed(),loaded=loadPreprocessVersion(seed,seed)
  seed.name='外部变化';seed.source='外部代码';expect(loaded.seed.name).toBe('完整前处理');expect(loaded.draft.functions[0]!.source).toBe(source)
  loaded.draft.filter.conditions[0]!.text='10000000000000001e-16'
  expect(()=>makeRevisionIntent(loaded,loaded.draft,attempt)).toThrow('先修改')
  loaded.draft.functions.reverse();const intent=makeRevisionIntent(loaded,loaded.draft,attempt)
  expect(intent.preprocessingJson.indexOf(second)).toBeLessThan(intent.preprocessingJson.indexOf('module.exports'))
  expect(loaded.seed.source).toBe(source)
 })
 it('拒绝不完整来源、旧基线、隐藏动作及未知字段，不用默认值伪装完整版本',()=>{
  const base=versionSeed()
  for(const patch of [{latestVersionId:'40000000-0000-4000-8000-000000000099'},{deviceSourceId:'20000000-0000-4000-8000-000000000099'},{source:'truncated'},{actionsJson:'[{}]'},{definitionVersion:9007199254740992 as unknown as string},{preprocessingJson:base.preprocessingJson.replace('"trigger":','"extra":true,"trigger":')},{preprocessingJson:base.preprocessingJson.replace('"groups":[]','"groups":[{}]')}])
   expect(()=>loadPreprocessVersion({...base,...patch},base)).toThrow()
 })
 it('完整JSON预算、重复键、尾随根、原型键及非法Unicode明确拒绝或隔离',()=>{
  for(const json of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{} {}','[1,]','{"a":"\\uD800"}','{"a":1e-16384}','['.repeat(14)+'0'+']'.repeat(14)])expect(()=>parsePreprocessJson(json)).toThrow()
  const parsed=parsePreprocessJson('{"__proto__":{"polluted":true}}')
  expect(Object.getPrototypeOf(parsed)).toBeNull();expect(({} as Record<string,unknown>).polluted).toBeUndefined()
  expect(()=>parsePreprocessJson('"'+('汉'.repeat(180000))+'"')).toThrow('预算')
 })
 it('高精度范围、符号、指数和JSONB展开预算按精确值比较',()=>{
  expect(compareDecimal(new ExactDecimal('9007199254740993'),new ExactDecimal('9007199254740994'))).toBe(-1)
  expect(compareDecimal(new ExactDecimal('-1e3'),new ExactDecimal('-999'))).toBe(-1);expect(new ExactDecimal('-0.000e99').canonical()).toBe('0')
  const loaded=loadPreprocessVersion(versionSeed(),versionSeed()),range=loaded.draft.filter.groups[0]!.conditions[3]!
  range.lower='9007199254740995';expect(()=>editPreprocessingJson(loaded.draft)).toThrow('下限')
  range.lower='9007199254740993';loaded.draft.filter.conditions[0]!.text='1e65536';expect(()=>editPreprocessingJson(loaded.draft)).toThrow('65536')
 })
 it('读到long上限仍可读，拒绝再写；边界上一版本成功读回上限',()=>{
  expect(exactRevisionCounter('9223372036854775807')).toBe('9223372036854775807')
  for(const value of ['01','1e3','9223372036854775808','-1'])expect(()=>exactRevisionCounter(value)).toThrow()
  const seed=versionSeed({definitionVersion:'9223372036854775806',versionNumber:'9223372036854775806'}),loaded=loadPreprocessVersion(seed,seed);loaded.draft.name='边界版本'
  const intent=makeRevisionIntent(loaded,loaded.draft,attempt),saved=confirmRevision(loaded,intent,confirmedSeed(intent))
  expect(saved.seed.definitionVersion).toBe('9223372036854775807');expect(revisionDraftChanged(saved,saved.draft)).toBe(false);saved.draft.name='再写';expect(()=>makeRevisionIntent(saved,saved.draft,attempt)).toThrow('上限')
 })
 it('保存回读必须同来源、精确两种版本代次、完整内容及原状态指针',()=>{
  const seed=versionSeed(),loaded=loadPreprocessVersion(seed,seed);loaded.draft.name='修改'
  const intent=makeRevisionIntent(loaded,loaded.draft,attempt),confirmed=confirmedSeed(intent)
  expect(confirmRevision(loaded,intent,confirmed).seed.name).toBe('修改')
  for(const patch of [{definitionVersion:intent.expectedDefinitionVersion},{versionNumber:'99'},{activeVersionId:confirmed.versionId},{status:'ACTIVE' as const},{preprocessingJson:confirmed.preprocessingJson.replace('checked:true','checked:false')}])
   expect(()=>confirmRevision(loaded,intent,{...confirmed,...patch})).toThrow()
 })
 it('EXISTS省略操作数、真正null保类型；切下发不丢隐藏上报草稿',()=>{
  expect(conditionValue({...newCondition(),path:'/v',operator:'EQ',valueType:'null'})).toEqual({pointer:'/v',operator:'EQ',value:null})
  const loaded=loadPreprocessVersion(versionSeed(),versionSeed()),before=editPreprocessingJson(loaded.draft)
  loaded.draft.kind='ATTRS_PUSH_PREPROC';const down=editPreprocessingJson(loaded.draft);expect(down).toContain('"conditions":[]')
  loaded.draft.kind='ATTRS_RPT_PREPROC';expect(editPreprocessingJson(loaded.draft)).toBe(before)
  loaded.draft.filter={...newConditionGroup(),conditions:[{...newCondition(),path:'/v',operator:'EXISTS'}]}
  expect(editPreprocessingJson(loaded.draft)).toContain('{"pointer":"/v","operator":"EXISTS"}')
 })
})

it('条件展示短十进制完全精确且不制造脏稿，范围与大CAS/原写入语义保持',()=>{
 const initial=versionSeed(),canonical=loadPreprocessVersion(initial,initial).seed.preprocessingJson
 const seed={...initial,preprocessingJson:canonical},loaded=loadPreprocessVersion(seed,seed)
 expect(loaded.draft.filter.conditions[0]!.text).toBe('1.0000000000000001');expect(loaded.draft.filter.groups[0]!.conditions[3]!.lower).toBe('9007199254740993');expect(loaded.draft.filter.groups[0]!.conditions[3]!.upper).toBe('9007199254740994');expect(revisionDraftChanged(loaded,loaded.draft)).toBe(false);expect(editPreprocessingJson(loaded.draft)).toBe(canonical)
 loaded.draft.name='只修改名称';const intent=makeRevisionIntent(loaded,loaded.draft,attempt);expect(intent.expectedDefinitionVersion).toBe('9007199254740993');expect(intent.preprocessingJson).toBe(canonical);expect(intent.preprocessingJson).toContain('10000000000000001e-16')
 const range=canonical.replace('9007199254740993','-25e-4').replace('9007199254740994','9e3'),withRange=loadPreprocessVersion({...seed,preprocessingJson:range},seed);expect(withRange.draft.filter.groups[0]!.conditions[3]!.lower).toBe('-0.0025');expect(withRange.draft.filter.groups[0]!.conditions[3]!.upper).toBe('9000');expect(revisionDraftChanged(withRange,withRange.draft)).toBe(false)
})
it('条件展示64字符边界含符号和前导零，巨大正负指数保原词法而不展开DOM',()=>{
 const base=versionSeed(),canonical=loadPreprocessVersion(base,base).seed.preprocessingJson
 for(const [literal,display] of [['1e63','1'+'0'.repeat(63)],['1e64','1e64'],['-1e62','-1'+'0'.repeat(62)],['-1e63','-1e63'],['1e-62','0.'+'0'.repeat(61)+'1'],['1e-63','1e-63'],['1e1000','1e1000'],['1e-1000','1e-1000'],['-0e1000','0']]){
  const seed={...base,preprocessingJson:canonical.replace('10000000000000001e-16',literal!)},loaded=loadPreprocessVersion(seed,seed);expect(loaded.draft.filter.conditions[0]!.text).toBe(display);expect(loaded.draft.filter.conditions[0]!.text.length).toBeLessThanOrEqual(64);expect(revisionDraftChanged(loaded,loaded.draft)).toBe(false)
 }
})
