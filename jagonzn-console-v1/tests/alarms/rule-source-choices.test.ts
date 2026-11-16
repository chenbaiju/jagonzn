import {describe,expect,it} from 'vitest'
import {alarmRuleSourceChoices,alarmRuleSourceIdentity} from '../../src/features/alarms/alarm-rule-source-choices'
import {managementDevice,managementRule} from './rule-management-fixture'
const source={kind:'DEVICE' as const,ids:[managementDevice]}
const reply=()=>({kind:'DEVICE',sourceIds:[managementDevice],bindings:[{sourceId:managementDevice,modelVersionId:managementRule,name:'当前设备名称'}],properties:[{key:'1_temp',dataType:'NUMBER',label:'1_temp'}]})
describe('批量当前模型资料严格解码为表单选项',()=>{
 it('规范身份/当前名称与安全键保留，空交集是合法资料',()=>{expect(alarmRuleSourceChoices(reply(),source)).toEqual({sources:[{id:managementDevice,label:'当前设备名称'}],properties:[{key:'1_temp',dataType:'NUMBER',label:'1_temp'}]});expect(alarmRuleSourceChoices({...reply(),properties:[]},source).properties).toEqual([]);expect(alarmRuleSourceChoices({...reply(),kind:'DEVICE_TYPE'},{kind:'DEVICE_TYPE',ids:[managementDevice]}).sources).toHaveLength(1)})
 it('来源空/重复/超1000/非规范UUID/类型复选和额外owner在查询前拒绝',()=>{
  for(const value of [{...source,ids:[]},{...source,ids:[managementDevice,managementDevice]},{...source,ids:Array.from({length:1001},(_,i)=>`00000000-0000-0000-0000-${i.toString(16).padStart(12,'0')}`)},{...source,ids:['bad']},{kind:'DEVICE_TYPE',ids:[managementDevice,managementRule]},{...source,owner:managementRule},{kind:'BAD',ids:[managementDevice]}])expect(()=>alarmRuleSourceIdentity(value as never)).toThrow()
  const value=alarmRuleSourceIdentity(source);value.ids.push(managementRule);expect(source.ids).toEqual([managementDevice])
 })
 it('kind/原序sourceIds/绑定身份或模型UUID错位不借目录标签拼成功',()=>{
  for(const value of [{...reply(),kind:'DEVICE_TYPE'},{...reply(),sourceIds:[managementRule]},{...reply(),bindings:[]},{...reply(),bindings:[{...reply().bindings[0],sourceId:managementRule}]},{...reply(),bindings:[{...reply().bindings[0],modelVersionId:null}]},{...reply(),bindings:[{...reply().bindings[0],modelVersionId:'BAD'}]}])expect(()=>alarmRuleSourceChoices(value,source)).toThrow()
  const both={kind:'DEVICE' as const,ids:[managementDevice,managementRule]},value=reply();expect(()=>alarmRuleSourceChoices({...value,sourceIds:both.ids,bindings:[value.bindings[0],{...value.bindings[0],sourceId:managementDevice}]},both)).toThrow()
 })
 it('根/绑定/属性字段封闭，属性重复/超200/未知类型/不安全键拒绝',()=>{
  for(const value of [{...reply(),extra:true},{...reply(),bindings:[{...reply().bindings[0],owner:managementRule}]},{...reply(),properties:[{...reply().properties[0],schema:{}}]},{...reply(),properties:[reply().properties[0],reply().properties[0]]},{...reply(),properties:Array.from({length:201},(_,i)=>({key:'p'+i,dataType:'TEXT',label:'属性'}))},{...reply(),properties:[{key:'x.y',dataType:'NUMBER',label:'坏键'}]},{...reply(),properties:[{key:'value',dataType:'UNKNOWN',label:'未知'}]}])expect(()=>alarmRuleSourceChoices(value,source)).toThrow()
 })
 it('缺失/空白/超128字符/NUL/无效Unicode名称和标签不伪造显示',()=>{for(const text of [null,'',' ','x'.repeat(129),'name\0','\ud800']){expect(()=>alarmRuleSourceChoices({...reply(),bindings:[{...reply().bindings[0],name:text}]},source)).toThrow();expect(()=>alarmRuleSourceChoices({...reply(),properties:[{...reply().properties[0],label:text}]},source)).toThrow()}expect(alarmRuleSourceChoices({...reply(),bindings:[{...reply().bindings[0],name:'😀'.repeat(128)}]},source).sources[0]!.label).toHaveLength(256)})
})
