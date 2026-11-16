import { beforeEach, expect, it, vi } from 'vitest'
const get = vi.hoisted(() => vi.fn())
vi.mock('@/utils/http', () => ({ default: { get } }))
import { fetchDeviceBoundModel } from '@/api/device-bound-model'
import { fetchDevicePropertyDefinitions, fetchDeviceEventDefinitions } from '@/api/device'

const version = { id: 'bound-version', deviceTypeId: 'type', schemaDigest: 'a'.repeat(64) }
const binding = { deviceId: 'device', deviceTypeId: 'type', version }
const modelSnapshot = {
  properties: {
    online: { dataType: 'SWITCH', accessType: 'REPORT' },
    tamperNotice: { dataType: 'NUMBER', accessType: 'REPORT', minimum: 0, maximum: 1 }
  },
  events: { tamperNotice: { level: 'WARNING', parameters: {} } }
}
beforeEach(() => get.mockReset())

it('设备详情读取实际绑定版本，展示原类型表中没有的属性', async () => {
  get
    .mockResolvedValueOnce([
      { propertyKey: 'online', name: '上线', dataType: 'SWITCH' },
      { propertyKey: 'obsolete', name: '已移除', dataType: 'NUMBER' }
    ])
    .mockResolvedValueOnce(binding)
    .mockResolvedValueOnce({ version, modelSnapshot })
  const rows = await fetchDevicePropertyDefinitions('project', 'type', 'device')
  expect(rows.map((r) => r.propertyKey)).toEqual(['online', 'tamperNotice'])
  expect(rows[0]?.name).toBe('上线')
  expect(rows[1]?.dataType).toBe('NUMBER')
  expect(rows[1]?.maximumValue).toBe(1)
  expect(get.mock.calls.map(([arg]) => arg.url)).toEqual([
    '/api/v1/projects/project/device-types/type/properties',
    '/api/v1/projects/project/devices/device/thing-model-binding',
    '/api/v1/projects/project/device-types/type/thing-model-versions/bound-version'
  ])
})
it('设备事件定义也遵循冻结模型而非旧类型列表', async () => {
  get
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(binding)
    .mockResolvedValueOnce({ version, modelSnapshot })
  expect(await fetchDeviceEventDefinitions('project', 'type', 'device')).toMatchObject([
    { id: 'tamperNotice', eventKey: 'tamperNotice', name: 'tamperNotice', level: 'WARNING' }
  ])
})
it('类型编辑仍读取类型定义，不偷偷选择latest或某台设备', async () => {
  get.mockResolvedValueOnce([])
  expect(await fetchDevicePropertyDefinitions('project', 'type')).toEqual([])
  expect(get).toHaveBeenCalledTimes(1)
})
it('设备或类型身份错配时拒绝，不回退到旧定义', async () => {
  get.mockResolvedValueOnce({ ...binding, deviceId: 'other' })
  await expect(fetchDeviceBoundModel('project', 'type', 'device')).rejects.toThrow('身份不匹配')
  expect(get).toHaveBeenCalledTimes(1)
})
it('精确版本摘要错配时拒绝，不读取latest', async () => {
  get.mockResolvedValueOnce(binding).mockResolvedValueOnce({
    version: { ...version, schemaDigest: 'different' },
    modelSnapshot
  })
  await expect(fetchDeviceBoundModel('project', 'type', 'device')).rejects.toThrow('快照不匹配')
})
it('畸形冻结属性定义必须失败，不能伪造缺失字段', async () => {
  get
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(binding)
    .mockResolvedValueOnce({ version, modelSnapshot: { properties: { broken: null } } })
  await expect(fetchDevicePropertyDefinitions('project', 'type', 'device')).rejects.toThrow(
    '不合法'
  )
})
