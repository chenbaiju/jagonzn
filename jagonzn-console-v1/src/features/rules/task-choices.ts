import { api } from '@/core/http'
import type { Schema } from '@/core/contracts'
import { taskRunCandidates } from './api'

/** 选择器展示模型；HTTP始终读取正式生成合同，不是替代服务端DTO。 */
export type TaskChoice = { id: string; label: string }
export type TaskChoiceKind = 'devices' | 'device-types' | 'device-groups'
export type TaskChoicePage = { options: TaskChoice[]; nextCursor?: string | null; hasMore: boolean }
function choice(value: { id?: string; name?: string }): TaskChoice {
  if (!value.id) throw new Error('目标候选缺少标识，请重新读取')
  return { id: value.id, label: value.name || value.id }
}
function page(value: { items?: { id?: string; name?: string }[]; nextCursor?: string | null; hasMore?: boolean }): TaskChoicePage {
  if (!Array.isArray(value.items) || typeof value.hasMore !== 'boolean' || value.hasMore && !value.nextCursor) throw new Error('目标候选页不完整，请重新读取')
  return { options: value.items.map(choice), nextCursor: value.nextCursor, hasMore: value.hasMore }
}
export async function taskChoices(project: string, kind: TaskChoiceKind, cursor?: string, signal?: AbortSignal): Promise<TaskChoicePage> {
  if (kind === 'devices') return page(await api<Schema<'CursorPageDeviceResponse'>>(`/api/v1/projects/${project}/devices/search`, { query: { cursor, limit: 50 }, signal }))
  if (kind === 'device-types') return page(await api<Schema<'CursorPageDeviceTypeResponse'>>(`/api/v1/projects/${project}/device-types/search`, { query: { cursor, limit: 50 }, signal }))
  const groups = await api<Schema<'DeviceGroupResponse'>[]>(`/api/v1/projects/${project}/device-groups`, { signal })
  if (!Array.isArray(groups)) throw new Error('设备组候选不完整，请重新读取')
  return { options: groups.map(choice), hasMore: false }
}
/** 只补最多20个已选名称；其余保留完整UUID而不猜名称或发起万次查询。 */
export async function selectedTaskChoices(project: string, kind: TaskChoiceKind, ids: readonly string[], signal?: AbortSignal): Promise<TaskChoice[]> {
  const selected=ids.slice(0,20)
  if(kind==='device-groups') {
    const groups=await api<Schema<'DeviceGroupResponse'>[]>(`/api/v1/projects/${project}/device-groups`,{signal})
    if(!Array.isArray(groups))throw new Error('设备组候选不完整，请重新读取')
    return groups.filter(group=>group.id && selected.includes(group.id)).map(choice)
  }
  const found:TaskChoice[]=[], count=Math.min(4,selected.length);let offset=0
  await Promise.all(Array.from({length:count},async()=>{
    while(offset<selected.length){
      signal?.throwIfAborted();const id=selected[offset++]
      found.push(choice(kind==='devices'
        ? await api<Schema<'DeviceResponse'>>(`/api/v1/projects/${project}/devices/${id}`,{signal})
        : await api<Schema<'DeviceTypeResponse'>>(`/api/v1/projects/${project}/device-types/${id}`,{signal})))
    }
  }))
  return found
}

/** 运行器只加载该任务当前保存范围，不复用全项目设备目录。 */
export async function taskRunnerChoices(project: string, id: string, expectedVersion: number, cursor?: string, signal?: AbortSignal): Promise<TaskChoicePage> {
  const value = await taskRunCandidates(project, id, expectedVersion, cursor, signal)
  if (!Array.isArray(value?.items)) throw new Error('任务候选页不完整，请重新读取')
  const unique = new Set<string>()
  for (const item of value.items) {
    if (!item || typeof item.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id) || typeof item.name !== 'string' || unique.has(item.id)) throw new Error('任务候选设备不完整，请重新读取')
    unique.add(item.id)
  }
  const result = page(value)
  if (result.hasMore && (!result.options.length || result.nextCursor === cursor) || result.nextCursor != null && (typeof result.nextCursor !== 'string' || result.nextCursor.length > 8192)) throw new Error('任务候选游标不完整，请重新读取')
  return result
}
