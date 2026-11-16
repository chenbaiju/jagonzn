import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'

/** 原键只保留于当前页面意图；回执缺失不能证明迟到请求不会提交。 */
export type RuleDeletionIntent={project:string;rule:string;actor:string;expectedVersion:string;key:string}
export function ruleDeletionIntent(project:string,rule:string,actor:string,expectedVersion:string):RuleDeletionIntent{
 if(![project,rule,actor].every(definitionUuid)||!/^\d+$/.test(expectedVersion)||BigInt(expectedVersion)<1n||BigInt(expectedVersion)>=9223372036854775807n)throw new Error('请重新读取规则核对最新状态')
 return {project,rule,actor,expectedVersion:BigInt(expectedVersion).toString(),key:crypto.randomUUID()}
}
function root(intent:RuleDeletionIntent){return `/api/v1/projects/${intent.project}/message-rules/${intent.rule}/deletions` as const}
export function confirmRuleDeletion(intent:RuleDeletionIntent,value:Schema<'MessageRuleDeletionResponse'>){
 if(value.projectId!==intent.project||value.ruleId!==intent.rule||value.actorId!==intent.actor||value.expectedDefinitionVersion!==intent.expectedVersion||value.deletedDefinitionVersion!==(BigInt(intent.expectedVersion)+1n).toString()||typeof value.deletedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value.deletedAt)||!Number.isFinite(Date.parse(value.deletedAt)))throw new Error('原删除回执不匹配，结果仍未确认，请勿重复移除')
 return value
}
export async function removeMessageRule(intent:RuleDeletionIntent){
 const body:Schema<'MessageRuleDeletionRequest'>={expectedDefinitionVersion:intent.expectedVersion}
 return confirmRuleDeletion(intent,await api<Schema<'MessageRuleDeletionResponse'>>(root(intent),{method:'post',body,headers:{'Idempotency-Key':intent.key}}))
}
export async function readMessageRuleDeletion(intent:RuleDeletionIntent){
 return confirmRuleDeletion(intent,await api<Schema<'MessageRuleDeletionResponse'>>(`${root(intent)}/by-key`,{headers:{'Original-Request-Key':intent.key}}))
}
