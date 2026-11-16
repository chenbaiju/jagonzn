import {describe,expect,it} from 'vitest'
import {alarmRuleConfiguration} from '../../src/features/alarms/alarm-rule-management-api'
import {alarmRuleDraftRequest,editAlarmRuleDraft} from '../../src/features/alarms/alarm-rule-editor-draft'
import {editorRule} from './rule-editor-fixture'
describe('设备真实属性安全键贯通规则编辑',()=>{
 it('数字/下划线/连字符开头的条件和动态范围保持原键',()=>{
  for(const key of ['1_mode','_limit','-limit','9','_','-','x'.repeat(64)]){
   const rule=editorRule();rule.configuration.expression.terms=[{key,operator:'BETWEEN',value:{kind:'ATTRIBUTE',key:'_min'},upper:{kind:'ATTRIBUTE',key:'-max'}}]
   expect(alarmRuleConfiguration(rule.configuration).expression.terms).toEqual(rule.configuration.expression.terms)
   const draft=editAlarmRuleDraft(rule),properties=[{key,dataType:'NUMBER' as const,label:key},{key:'_min',dataType:'NUMBER' as const,label:'_min'},{key:'-max',dataType:'NUMBER' as const,label:'-max'}]
   expect(alarmRuleDraftRequest(draft,properties).configuration.expression.terms).toEqual(rule.configuration.expression.terms)
  }
 })
 it('路径、脚本、Unicode、空白、超长键仍被拒绝',()=>{
  for(const key of ['',' ','foo.bar','x/y','{x}','${x}','a b','温度','x'.repeat(65),'x\n']){
   const rule=editorRule();rule.configuration.expression.terms[0]!.key=key
   expect(()=>alarmRuleConfiguration(rule.configuration)).toThrow()
   rule.configuration.expression.terms[0]!.key='temperature';rule.configuration.expression.terms[0]!.value={kind:'ATTRIBUTE',key}
   expect(()=>alarmRuleConfiguration(rule.configuration)).toThrow()
  }
 })
 it('非当前数值属性即使键合法仍不可作为动态值',()=>{
  const draft=editAlarmRuleDraft(editorRule());draft.terms[0]!.value='{_min}'
  const base={key:'temperature',dataType:'NUMBER' as const,label:'温度'}
  for(const properties of [[base],[base,{key:'_min',dataType:'TEXT' as const,label:'下界'}]])expect(()=>alarmRuleDraftRequest(draft,properties)).toThrow('动态属性必须')
 })
})
