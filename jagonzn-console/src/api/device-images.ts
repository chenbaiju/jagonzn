import request from '@/utils/http'
import type { components } from '@/types/api/schema'
export type DeviceImage = components['schemas']['DeviceImageView']
function endpoint(
  project: string,
  device: string
): `/api/v1/projects/${string}/devices/${string}/image` {
  if (!project || !device) throw new Error('请先选择项目和设备')
  return `/api/v1/projects/${encodeURIComponent(project)}/devices/${encodeURIComponent(device)}/image`
}
export function readDeviceImage(project: string, device: string) {
  return request.get<DeviceImage>({ url: endpoint(project, device), showErrorMessage: false })
}
/** 每次明确意图只发一次；不重用旧文件或旧键自动重试。 */
export function uploadDeviceImage(
  project: string,
  device: string,
  revision: string,
  file: File,
  key: string
) {
  return request.put<DeviceImage>({
    url: endpoint(project, device),
    params: { expectedRevision: revision },
    data: file,
    headers: { 'Content-Type': file.type, 'Idempotency-Key': key },
    showErrorMessage: false
  })
}
export function removeDeviceImage(project: string, device: string, revision: string) {
  return request.del<DeviceImage>({
    url: endpoint(project, device),
    params: { expectedRevision: revision },
    showErrorMessage: false
  })
}
export async function readDeviceImageContent(project: string, device: string, revision: string) {
  const bytes = await request.get<ArrayBuffer>({
    url: `${endpoint(project, device)}/content`,
    params: { revision },
    responseType: 'arraybuffer',
    showErrorMessage: false
  })
  if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > 1048576)
    throw new Error('图片正文不完整')
  return new Blob([bytes], { type: 'image/png' })
}
