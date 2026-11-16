import {api,ApiError} from '../../core/http'
import type {Schema} from '../../core/contracts'
import type {AlarmRuleConfiguration} from './alarm-rule-management-api'
import {alarmRuleSourceChoices,alarmRuleSourceIdentity} from './alarm-rule-source-choices'
/** 主控实际生成的新只读POST；不发送预期模型、owner或运行许可，不自动重放。 */
export async function readAlarmRuleSourceChoicesWithVersions(project:string,source:AlarmRuleConfiguration['source'],signal:AbortSignal){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(project))throw new Error('请先选择项目')
 const body:Schema<'ConsoleAlarmRuleSourceDocument'>=alarmRuleSourceIdentity(source)
 const value=await api<Schema<'ConsoleAlarmRuleSourcePropertiesResponse'>>(`/api/v1/projects/${project}/console/alarm-rule-source-properties/query`,{method:'post',body,signal,maxResponseBytes:2*1024*1024})
 signal.throwIfAborted()
 try{return {...alarmRuleSourceChoices(value,source),bindings:value.bindings}}catch{throw new ApiError('设备源当前模型资料无法核对，请重新读取',200)}
}
export async function readAlarmRuleSourceChoices(project:string,source:AlarmRuleConfiguration['source'],signal:AbortSignal){const {sources,properties}=await readAlarmRuleSourceChoicesWithVersions(project,source,signal);return {sources,properties}}
