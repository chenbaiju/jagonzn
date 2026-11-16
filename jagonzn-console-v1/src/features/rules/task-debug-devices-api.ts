import { api } from '@/core/http'
import type { Schema } from '@/core/contracts'
/** 只读取受权日志的原执行成员，不从当前设备选择或任务汇总重建。 */
export const getTaskDebugLogDevices = (project: string, log: string, cursor: string | undefined, signal: AbortSignal) =>
  api<Schema<'TaskLogDevicePage'>>(`/api/v1/projects/${project}/task-debug-logs/${log}/devices`, { query: { cursor, limit: 20 }, signal })
