import type { Schema } from '@/core/contracts'
import { can } from '@/core/session'
import { cas } from './models'
import { getConsoleTaskDeviceSchedules, setConsoleTaskDeviceSchedule, runTaskOnDevices } from './api'
import type { RelatedDevicesTransport, RelatedDeviceRead, RelatedDeviceChange } from './task-related-devices-state'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)
function incomplete(): never { throw new Error('任务设备偏好返回不完整，请重新读取任务与设备') }
/** 仅转换正式生成Schema；最后运行只消费正式字段，不读取命令时间或内部代次猜测。 */
function page(value: Schema<'ConsoleTaskDeviceSchedulePage'>, definition: number): RelatedDeviceRead {
  if (!value || !Array.isArray(value.items) || value.items.length > 24 || typeof value.hasMore !== 'boolean' || cas(value.definitionVersion) !== definition) incomplete()
  const cursor = value.nextCursor
  if (cursor != null && (typeof cursor !== 'string' || !cursor || cursor.length > 8192) || value.hasMore !== !!cursor || value.hasMore && !value.items.length) incomplete()
  const keys = new Set<string>(), links = can('device:read')
  const rows = value.items.map(row => {
    if (!row || !validId(row.deviceId) || keys.has(row.deviceId.toLowerCase()) || typeof row.name !== 'string' || !row.name.trim() || typeof row.allowed !== 'boolean' || row.lastRunAt !== null && (typeof row.lastRunAt !== 'string' || !/(Z|[+-]\d{2}:?\d{2})$/i.test(row.lastRunAt) || !Number.isFinite(Date.parse(row.lastRunAt)))) incomplete()
    if(row.timerStatus!==undefined&&(!['PENDING','SCHEDULED','DISABLED','UNAVAILABLE'].includes(row.timerStatus)||row.nextRunAt!==null&&(typeof row.nextRunAt!=='string'||!/(Z|[+-]\d{2}:?\d{2})$/i.test(row.nextRunAt)||!Number.isFinite(Date.parse(row.nextRunAt)))||(row.timerStatus==='SCHEDULED'?!row.nextRunAt:row.nextRunAt!==null)))incomplete()
    if(row.timerStatus===undefined&&row.nextRunAt!==undefined)incomplete()
    const key = row.deviceId.toLowerCase(); keys.add(key)
    return { key, label: row.name, href: links ? `/devices/${key}` : undefined, scheduled: row.allowed, lastRunAt: row.lastRunAt,...(row.timerStatus===undefined?{}:{timerStatus:row.timerStatus,nextRunAt:row.nextRunAt}), writeToken: cas(row.version) }
  })
  return { rows, definitionToken: cas(value.definitionVersion), ...(cursor ? { continuation: cursor } : {}) }
}
function control(value: Schema<'ConsoleTaskDeviceScheduleControl'>, key: string, definition: number, preference: number, allowed: boolean): RelatedDeviceChange {
  if (!value || !validId(value.deviceId) || value.deviceId.toLowerCase() !== key.toLowerCase() || value.allowed !== allowed || cas(value.definitionVersion) !== definition || cas(value.version) !== preference + 1) incomplete()
  return { key: value.deviceId.toLowerCase(), scheduled: value.allowed, writeToken: cas(value.version), definitionToken: cas(value.definitionVersion) }
}
export const taskRelatedDevicesTransport: RelatedDevicesTransport = {
  readRows: async (project, job, definition, cursor, signal) => page(await getConsoleTaskDeviceSchedules(project, job, definition, cursor, signal), definition),
  changeSchedule: async (project, job, key, definition, preference, allowed) => control(await setConsoleTaskDeviceSchedule(project, job, key, definition, preference, allowed), key, definition, preference, allowed),
  runRows: async (project, job, definition, keys) => { await runTaskOnDevices(project, job, definition, keys) }
}
