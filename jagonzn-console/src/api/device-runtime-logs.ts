import request from '@/utils/http'
import type { components } from '@/types/api/schema'

export type DeviceRuntimeLogPage = components['schemas']['DeviceRuntimeLogPage']
export type DeviceRuntimeLogEntry = components['schemas']['DeviceRuntimeLogEntryResponse']
export interface RuntimeLogQuery {
  from?: string
  to?: string
  level?: string
  cursor?: string
}
/** 按当前项目读取原设备日志；时间字符串原样保留纳秒，分页沿首次有效窗口。 */
export function fetchDeviceRuntimeLogs(
  project: string,
  device: string,
  query: RuntimeLogQuery = {}
) {
  if (!project || !device) throw new Error('请先选择项目和设备')
  return request.get<DeviceRuntimeLogPage>({
    url: `/api/v1/projects/${project}/devices/${device}/runtime-logs`,
    params: { ...query, limit: 50 },
    showErrorMessage: false
  })
}
