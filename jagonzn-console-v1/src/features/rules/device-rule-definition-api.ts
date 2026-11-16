import {api} from '@/core/http'
import type {paths,Schema} from '@/core/contracts'
import {cas,validateRule} from './models'
import {getRule,ruleHistory} from './api'
import {deviceSourceMembers} from './rule-source-api'
import {ruleKinds} from './rule-builder-draft'
import {definitionUuid} from './device-task-definition-port'
import type {DeviceRuleDefinitionPort} from './device-rule-definition-port'
function id(value:string){if(!definitionUuid(value))throw new Error('设备规则范围标识无效');return value.toLowerCase()}
/** 只消费唯一正式生成的真实设备关联与独立参与合同。 */
export const deviceRuleDefinitionApi:DeviceRuleDefinitionPort={
 read:async(project,device,filters,cursor,signal)=>{
  if(!filters||!['','DEVICE','DEVICE_TYPE','LEGACY_PROJECT'].includes(filters.relation)||!['','ACTIVE','PAUSED'].includes(filters.status)||!['',...ruleKinds].includes(filters.ruleType)||cursor!=null&&(!cursor||cursor.length>8192))throw new Error('设备规则筛选或游标无效')
  const query:NonNullable<paths['/api/v1/projects/{projectId}/devices/{deviceId}/message-rules']['get']['parameters']['query']>={relation:filters.relation||undefined,status:filters.status||undefined,ruleType:filters.ruleType||undefined,cursor,limit:24}
  return api<Schema<'CursorPageRuleDeviceDefinition'>>(`/api/v1/projects/${id(project)}/devices/${id(device)}/message-rules`,{query,signal})
 },
 preference:async(project,rule,device,definition,signal)=>{
  const query:NonNullable<paths['/api/v1/projects/{projectId}/message-rules/{ruleId}/device-participation/{deviceId}']['get']['parameters']['query']>={expectedDefinitionVersion:cas(definition)}
  return api<Schema<'RuleDeviceParticipationControl'>>(`/api/v1/projects/${id(project)}/message-rules/${id(rule)}/device-participation/${id(device)}`,{query,signal})
 },
 change:async(project,rule,device,definition,preference,allowed)=>{
  if(typeof allowed!=='boolean')throw new Error('设备规则参与值无效')
  const body:Schema<'RuleDeviceParticipationRequest'>={allowed,expectedVersion:cas(preference),expectedDefinitionVersion:cas(definition)}
  return api<Schema<'RuleDeviceParticipationControl'>>(`/api/v1/projects/${id(project)}/message-rules/${id(rule)}/device-participation/${id(device)}`,{method:'put',body})
 },
 create:async(project,device,input)=>{
  const target=id(device)
  if(input.expectedVersion!=null||input.deviceSource!=null&&(input.deviceSource.kind!=='DEVICE'||JSON.stringify(deviceSourceMembers(input.deviceSource))!==JSON.stringify([target])))throw new Error('设备创建不接受旧定义或其它来源')
  const checked=validateRule(input)
  if(typeof checked.name!=='string'||typeof checked.source!=='string')throw new Error('设备规则创建正文不完整')
  const body:Schema<'DeviceMessageRuleCreateRequest'>={name:checked.name,description:checked.description,source:checked.source,actions:checked.actions}
  return api<Schema<'MessageRuleView'>>(`/api/v1/projects/${id(project)}/devices/${target}/message-rules`,{method:'post',body})
 },
 definition:async(project,rule,signal)=>getRule(id(project),id(rule),signal),
 history:async(project,rule,signal)=>ruleHistory(id(project),id(rule),undefined,signal,1)
}
