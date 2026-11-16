import {api,assertIdentity,identityEpoch} from '@/core/http'
import type {Schema} from '@/core/contracts'
import type {TaskSelectionWrite} from './models'

export type TaskOtaUpgradeInput=Schema<'TaskOtaUpgradeDefinition'>
/** OTA配置只保存运行时版本来源及明确模块；不伪造固件或普通命令参数。 */
export function taskOtaUpgradeValue(value:unknown):TaskOtaUpgradeInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('请配置 OTA 推送。')
 const v=value as Record<string,unknown>
 if(Object.keys(v).sort().join(',')!=='module,versionProperty'||typeof v.versionProperty!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(v.versionProperty))throw new Error('版本属性须为1至32位英文字母、数字、下划线或短横线。')
 if(v.module!=='main')throw new Error('当前仅支持 main 主应用模块。')
 return {versionProperty:v.versionProperty,module:'main'}
}
/** 实际任务目标范围的发布属性建议；目录不读取当前值或选择固件，不是保存前置。 */
export async function taskOtaVersionAttributes(project:string,selection:TaskSelectionWrite,search:string,signal:AbortSignal){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(project)||!selection.targetType||search.length>64||/[\u0000-\u001f\u007f]/.test(search))return []
 const epoch=identityEpoch(),body:Schema<'TaskOtaVersionAttributeQuery'>={targetType:selection.targetType,targetGroupId:selection.targetGroupId,targetDeviceTypeId:selection.targetDeviceTypeId,targetDeviceIds:selection.targetDeviceIds,targetGroupIds:selection.targetGroupIds,search,limit:50}
 const page=await api<Schema<'TaskOtaVersionAttributePage'>>(`/api/v1/projects/${project}/task-ota-version-attributes/selections`,{method:'post',body,signal});assertIdentity(epoch)
 if(!page||!Array.isArray(page.items)||page.items.length>50||typeof page.hasMore!=='boolean'||page.items.some(row=>!row||typeof row.identifier!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(row.identifier)||typeof row.name!=='string')||new Set(page.items.map(row=>row.identifier)).size!==page.items.length)throw new Error('版本属性建议读取不完整。')
 return page.items.map(row=>({value:row.identifier,name:row.name}))
}
