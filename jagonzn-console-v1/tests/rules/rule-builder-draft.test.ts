import {describe,it,expect} from 'vitest'
import {newCondition,newConditionGroup,newFunction,conditionValue,conditionGroupValue,preprocessDraft,preciseNumber,cloneGroup,ruleKinds,ruleKindLabels} from '../../src/features/rules/rule-builder-draft'
const operation=()=>({...newFunction(),source:'module.exports = attributes => attributes;'})
const form=()=>({name:'  温度预处理  ',description:'  设备属性  ',kind:'ATTRS_RPT_PREPROC' as const,filter:newConditionGroup(),functions:[operation()]})
describe('两步创建领域草稿的有限准确表达',()=>{
 it('六类显式语义和观察文案保留，草稿不含HTTP或隐式类型推断',()=>{
  expect(ruleKinds).toHaveLength(6);expect(ruleKinds.map(value=>ruleKindLabels[value].label)).toEqual(['属性上报预处理','属性上报','属性下发预处理','属性下发','事件上报','自定义上报'])
  expect(preprocessDraft(form())).toEqual({tags:{},name:'温度预处理',description:'设备属性',kind:'ATTRS_RPT_PREPROC',filter:{operator:'ALL',conditions:[],groups:[]},functions:[{format:'COMMON_JS',source:'module.exports = attributes => attributes;'}]})
 })
 it('数值在转换前核精确十进制，不让JSON.parse先舍入后假称精确',()=>{
  for(const value of ['9007199254740993','1.0000000000000001','1e400','1e-400','0x10','NaN','01'])expect(()=>preciseNumber(value),value).toThrow()
  expect(preciseNumber('1e3')).toBe(1000);expect(preciseNumber('9007199254740991')).toBe(9007199254740991);expect(preciseNumber('0.1')).toBe(.1);expect(preciseNumber('5e-324')).toBe(5e-324)
 })
 it('字符串、false、存在、范围和对象键严格分开，不把缺值当比较成功',()=>{
  const row={...newCondition(),path:'/temperature',text:'30',valueType:'string' as const};expect(conditionValue(row).value).toBe('30');expect(conditionValue({...row,valueType:'boolean',booleanValue:false}).value).toBe(false)
  expect(conditionValue({...row,operator:'EXISTS'})).toEqual({pointer:'/temperature',operator:'EXISTS'});expect(conditionValue({...row,operator:'IN_RANGE',lower:'-10',upper:'2e1'}).value).toEqual([-10,20]);expect(()=>conditionValue({...row,operator:'OUT_RANGE',lower:'2',upper:'1'})).toThrow('下限');expect(()=>conditionValue({...row,operator:'KEY_ABSENT',text:''})).toThrow('非空文本')
 })
 it('RFC6901转义与显式括号不折叠成混合逐行优先级，空子组拒绝',()=>{
  const row={...newCondition(),path:'/nested/a~1b~0c',text:'2'};expect(conditionValue(row).pointer).toBe('/nested/a~1b~0c');expect(()=>conditionValue({...row,path:'/a~2b'})).toThrow('属性路径')
  const root=newConditionGroup(),child={...newConditionGroup(),operator:'ANY' as const,conditions:[row]};root.groups=[child];expect(conditionGroupValue(root)).toEqual({operator:'ALL',conditions:[],groups:[{operator:'ANY',conditions:[{pointer:row.path,operator:'EQ',value:2}],groups:[]}]});expect(JSON.stringify(conditionGroupValue(root))).not.toContain('rule-draft-');expect(()=>conditionGroupValue({...root,groups:[newConditionGroup()]})).toThrow('补全')
 })
 it('叶子、深度和JSONB真实展开字节预算有界',()=>{
  const row={...newCondition(),path:'/value',text:'1'};const root={...newConditionGroup(),conditions:Array.from({length:33},()=>({...row}))};expect(()=>conditionGroupValue(root)).toThrow('32项')
  let deep={...newConditionGroup(),conditions:[row]};for(let i=0;i<4;i++)deep={...newConditionGroup(),conditions:[],groups:[deep]};expect(()=>conditionGroupValue(deep)).toThrow('4层')
  const huge={...newConditionGroup(),conditions:[{...row,valueType:'string' as const,text:'汉'.repeat(22000)}]};expect(()=>conditionGroupValue(huge)).toThrow('UTF8')
 })
 it('切换下发只输出该类型允许的空条件，上报草稿留存而非删除',()=>{
  const value=form();value.filter.conditions=[{...newCondition(),path:'/temperature',operator:'GT',text:'30'}];const original=cloneGroup(value.filter)
  expect(preprocessDraft({...value,kind:'ATTRS_PUSH_PREPROC'}).filter).toEqual({operator:'ALL',conditions:[],groups:[]});expect(value.filter).toEqual(original);expect(preprocessDraft(value).filter.conditions[0]?.value).toBe(30)
 })
 it('原函数格式/顺序/空白与中文UTF8预算保存，不做宿主执行或自动改写',()=>{
  const value=form();const first='  module.exports = attributes => attributes;\r\n',second='attributes => ({...attributes, 标记:true})';value.functions=[{...newFunction(),format:'FUNCTION_EXPRESSION',source:second},{...newFunction(),format:'COMMON_JS',source:first}];const saved=preprocessDraft(value)
  expect(saved.functions).toEqual([{format:'FUNCTION_EXPRESSION',source:second},{format:'COMMON_JS',source:first}]);value.functions[0]!.source='changed';expect(saved.functions[0]!.source).toBe(second);expect(()=>preprocessDraft({...value,functions:[{...newFunction(),source:'汉'.repeat(22000)}]})).toThrow('UTF8')
 })
 it('缺名称/类型/原函数拒绝，32操作上限不被空集合或后继漏校验绕过',()=>{
  expect(()=>preprocessDraft({...form(),name:''})).toThrow('规则名称');expect(()=>preprocessDraft({...form(),kind:undefined})).toThrow('类型');expect(()=>preprocessDraft({...form(),functions:[]})).toThrow('1至32');expect(()=>preprocessDraft({...form(),functions:[operation(),newFunction()]})).toThrow('补全');expect(preprocessDraft({...form(),functions:Array.from({length:32},operation)}).functions).toHaveLength(32);expect(()=>preprocessDraft({...form(),functions:Array.from({length:33},operation)})).toThrow('1至32')
 })
})
