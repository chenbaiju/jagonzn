import type {AlarmRuleConfiguration} from './alarm-rule-management-api'
import type {AlarmRuleSourceChoices} from './alarm-rule-choice-reader'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const fail=()=>new Error('设备源当前模型资料不完整或已变更，请重新读取')
function exact(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw fail();const row=value as Record<string,unknown>;if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key)))throw fail();return row}
function identity(value:unknown):string{if(typeof value!=='string'||!uuid.test(value))throw fail();return value}
function label(value:unknown):string{if(typeof value!=='string'||!value.trim()||[...value].length>128||value.includes('\0')||new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(value))!==value)throw fail();return value}
/** 只验证现有正式来源文档；空选择由宿主跳过metadata请求，不能发送非法空查询。 */
export function alarmRuleSourceIdentity(source:AlarmRuleConfiguration['source']):AlarmRuleConfiguration['source']{
 const row=exact(source,['kind','ids'])
 if(typeof row.kind!=='string'||!['DEVICE','DEVICE_TYPE'].includes(row.kind)||!Array.isArray(row.ids)||!row.ids.length||row.ids.length>1000||row.kind==='DEVICE_TYPE'&&row.ids.length!==1)throw fail()
 const ids=row.ids.map(identity);if(new Set(ids).size!==ids.length)throw fail()
 return {kind:row.kind as AlarmRuleConfiguration['source']['kind'],ids}
}
/** unknown边界解码为表单展示资料，不定义另一套HTTP DTO，也不把模型观察带入保存许可。 */
export function alarmRuleSourceChoices(value:unknown,source:AlarmRuleConfiguration['source']):AlarmRuleSourceChoices{
 const expected=alarmRuleSourceIdentity(source),row=exact(value,['kind','sourceIds','bindings','properties'])
 if(row.kind!==expected.kind||!Array.isArray(row.sourceIds)||row.sourceIds.length!==expected.ids.length||row.sourceIds.some((id,index)=>id!==expected.ids[index])||!Array.isArray(row.bindings)||row.bindings.length!==expected.ids.length||!Array.isArray(row.properties)||row.properties.length>200)throw fail()
 const sources=row.bindings.map((value,index)=>{const binding=exact(value,['sourceId','modelVersionId','name']);if(identity(binding.sourceId)!==expected.ids[index])throw fail();identity(binding.modelVersionId);return {id:binding.sourceId as string,label:label(binding.name)}})
 const seen=new Set<string>(),properties=row.properties.map(value=>{const property=exact(value,['key','dataType','label']);if(typeof property.key!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(property.key)||seen.has(property.key)||typeof property.dataType!=='string'||!['NUMBER','SWITCH','TEXT','ENUM','LIST','OBJECT'].includes(property.dataType))throw fail();seen.add(property.key);return {key:property.key,dataType:property.dataType as AlarmRuleSourceChoices['properties'][number]['dataType'],label:label(property.label)}})
 return {sources,properties}
}
