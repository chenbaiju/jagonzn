import request from '@/utils/http'
import type { components } from '@/types/api/schema'
export type DeviceLocationCode = components['schemas']['DeviceLocationCodeResponse']
export type DeviceClaimCode = components['schemas']['DeviceClaimCodeResponse']
const path = (project: string, device: string) => {
  if (!project || !device) throw new Error('请先选择项目和设备')
  return `/api/v1/projects/${project}/devices/${device}/purpose-codes` as const
}
export const readDeviceLocationCode = (project: string, device: string) =>
  request.get<DeviceLocationCode>({
    url: `${path(project, device)}/location`,
    showErrorMessage: false
  })
/** 一次性明文不自动补签；401/超时等失败由HTTP层精确禁重放。 */
export const issueDeviceClaimCode = (project: string, device: string) =>
  request.post<DeviceClaimCode>({
    url: `${path(project, device)}/claim`,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    showErrorMessage: false
  })
export const revokeDeviceClaimCode = (project: string, device: string, code: string) =>
  request.del<void>({ url: `${path(project, device)}/claim/${code}`, showErrorMessage: false })
