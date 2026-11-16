import request from '@/utils/http'
import type { components } from '@/types/api/schema'

/** 按设备实际绑定读取冻结快照，不能用类型latest替代设备版本。 */
export async function fetchDeviceBoundModel(
  projectId: string,
  deviceTypeId: string,
  deviceId: string
): Promise<Record<string, Record<string, Record<string, unknown>>>> {
  const binding = await request.get<components['schemas']['DeviceThingModelBindingResponse']>({
    url: `/api/v1/projects/${encodeURIComponent(projectId)}/devices/${encodeURIComponent(deviceId)}/thing-model-binding`
  })
  if (!binding) throw new Error('设备尚未关联物模型')
  if (
    binding.deviceId !== deviceId ||
    binding.deviceTypeId !== deviceTypeId ||
    binding.version?.deviceTypeId !== deviceTypeId ||
    !binding.version.id ||
    !/^[0-9a-f]{64}$/.test(binding.version.schemaDigest ?? '')
  )
    throw new Error('设备绑定物模型身份不匹配')
  const snapshot = await request.get<components['schemas']['ThingModelSnapshotResponse']>({
    url: `/api/v1/projects/${encodeURIComponent(projectId)}/device-types/${encodeURIComponent(deviceTypeId)}/thing-model-versions/${encodeURIComponent(binding.version.id)}`
  })
  if (
    snapshot.version?.id !== binding.version.id ||
    snapshot.version.deviceTypeId !== deviceTypeId ||
    snapshot.version.schemaDigest !== binding.version.schemaDigest ||
    !snapshot.modelSnapshot ||
    typeof snapshot.modelSnapshot !== 'object' ||
    Array.isArray(snapshot.modelSnapshot)
  )
    throw new Error('设备冻结物模型快照不匹配')
  return snapshot.modelSnapshot as Record<string, Record<string, Record<string, unknown>>>
}
