import { describe, expect, it } from 'vitest'
import {
  deviceCreationTagError,
  deviceCreationTags
} from '../src/views/device/device-creation-form'

describe('创建设备的可选键值标签', () => {
  it('不填标签或添加空行不改变原有创建请求', () => {
    expect(deviceCreationTags([])).toBeUndefined()
    expect(deviceCreationTags([{ key: ' ', value: '' }])).toBeUndefined()
  })
  it('保留大小写、中文值并去除首尾空白', () => {
    expect(deviceCreationTags([{ key: ' region ', value: ' 上海 ' }])).toEqual({ region: '上海' })
  })
  it.each([
    [{ key: 'site', value: '' }],
    [{ key: '', value: 'east' }],
    [{ key: '站点', value: 'east' }],
    [{ key: '1site', value: 'east' }],
    [{ key: 'a'.repeat(65), value: 'east' }],
    [{ key: 'site', value: 'a'.repeat(129) }]
  ])('拒绝不完整或超出服务端约束的标签 %j', (tag) => {
    expect(deviceCreationTagError([tag])).toBeTruthy()
    expect(() => deviceCreationTags([tag])).toThrow()
  })
  it('重复键不能静默覆盖之前的值', () => {
    expect(
      deviceCreationTagError([
        { key: 'site', value: 'east' },
        { key: ' site ', value: 'west' }
      ])
    ).toBe('标签名称不能重复')
  })
  it('创建批次最多20个标签', () => {
    const tags = Array.from({ length: 20 }, (_, i) => ({ key: `tag_${i}`, value: 'x' }))
    expect(deviceCreationTagError(tags)).toBeUndefined()
    expect(deviceCreationTagError([...tags, { key: 'extra', value: 'x' }])).toBeTruthy()
  })
})
