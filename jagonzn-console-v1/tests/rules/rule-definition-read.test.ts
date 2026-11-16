import {describe,expect,it} from 'vitest'
import {checkedRuleDefinition,RuleDefinitionReadError} from '../../src/features/rules/rule-definition-read'
const base={id:'00000000-0000-4000-8000-000000000001',status:'PAUSED',version:3}
describe('规则头部安全整数边界',()=>{
 it('合法头部通过',()=>{expect(checkedRuleDefinition(structuredClone(base) as never,base.id)).toMatchObject({id:base.id,version:3})})
 it('超出安全整数的数字版本给出明确范围错误',()=>{expect(()=>checkedRuleDefinition({...base,version:9007199254740992} as never,base.id)).toThrow(RuleDefinitionReadError);expect(()=>checkedRuleDefinition({...base,version:9007199254740992} as never,base.id)).toThrow('安全整数范围')})
 it('缺失身份或状态仍报不完整',()=>{expect(()=>checkedRuleDefinition({...base,status:'NEW_UNKNOWN_STATE'} as never,base.id)).toThrow('身份、版本或状态不完整')})
})
