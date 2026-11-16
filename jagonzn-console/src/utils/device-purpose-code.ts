import { appProjectEntry } from './app-project-entry'
import type { ProjectResponse } from '@/api/project'
import type { DeviceLocationCode, DeviceClaimCode } from '@/api/device-purpose-codes'
/** 设备码保留足够固定能力字段空间，先校验源站再签发，避免拿到能力后无法展示。 */
export function devicePurposeOrigin(project: ProjectResponse, address: string) {
  const entry = JSON.parse(appProjectEntry(project, address).payload) as { baseUrl: string }
  if (new TextEncoder().encode(entry.baseUrl).length > 1024)
    throw new Error('设备二维码平台地址过长')
  return entry.baseUrl
}
/** 平台源站只用于展示，沿现有入口严格校验；扫码端须与当前登录平台/项目一致。 */
export function devicePurposeCode(
  project: ProjectResponse,
  address: string,
  deviceId: string,
  value: DeviceLocationCode | DeviceClaimCode
) {
  const origin = devicePurposeOrigin(project, address)
  if (
    value.kind !== 'thingslink.device' ||
    value.version !== 1 ||
    value.projectKey !== project.projectCode ||
    value.deviceId !== deviceId ||
    !['LOCATE', 'CLAIM'].includes(value.purpose)
  )
    throw new Error('设备用途码范围无效')
  const core = {
    kind: value.kind,
    version: value.version,
    purpose: value.purpose,
    origin,
    projectKey: value.projectKey,
    deviceId: value.deviceId
  }
  let payload: string
  if (value.purpose === 'CLAIM') {
    if (
      !('token' in value) ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.token) ||
      !value.codeId ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      Date.parse(value.expiresAt) <= Date.now()
    )
      throw new Error('认领码无效或已到期')
    payload = JSON.stringify({
      ...core,
      token: value.token,
      codeId: value.codeId,
      expiresAt: value.expiresAt
    })
  } else {
    if ('token' in value || 'codeId' in value || 'expiresAt' in value)
      throw new Error('定位码不能含认领能力')
    payload = JSON.stringify(core)
  }
  if (new TextEncoder().encode(payload).length > 1800)
    throw new Error('用途码过长，请使用较短的平台源站地址')
  return payload
}
