import type { Schema } from '@/core/contracts'
import {businessKey,deviceKey as protocolKey} from './reference-profile'
import {validateTagRows} from './tag-rules'
export type TagRow = { key: string; value: string }
export type DeviceForm = { name: string; deviceKey: string; businessKey: string; deviceTypeId: string; groupId: string; description: string; location: string; tags: TagRow[] }
export const emptyDeviceForm = (): DeviceForm => ({ name: '', deviceKey: '', businessKey: '', deviceTypeId: '', groupId: '', description: '', location: '', tags: [{ key: '', value: '' }] })
export function createBody(form: DeviceForm): Schema<'CreateDeviceReferenceProfileRequest'> {
  if (!form.name.trim() || form.name.trim().length > 128) throw new Error('设备名称为必填项，最多128个字符')
  const currentDeviceKey=protocolKey(form.deviceKey)
  const currentKey=businessKey(form.businessKey)
  if (form.description.length > 500 || form.location.length > 256) throw new Error('描述或位置长度超限')
  const rows = validateTagRows(form.tags.map(t => ({ key: t.key.trim(), value: t.value.trim() })))
  return { name: form.name.trim(), deviceKey: currentDeviceKey, businessKey: currentKey, deviceTypeId: form.deviceTypeId || undefined, groupId: form.groupId || undefined, description: form.description.trim()||null, location: form.location||undefined, tags: rows.length ? Object.fromEntries(rows.map(t => [t.key, t.value])) : undefined }
}
/** 导出仅限当前游标页，防止公式注入，不伪装全量导出。 */
export function csvCell(value: unknown) { const text = String(value ?? ''); return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"` }
