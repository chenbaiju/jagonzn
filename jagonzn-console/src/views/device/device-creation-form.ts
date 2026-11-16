export interface DeviceCreationTag {
  key: string
  value: string
}

export interface DeviceCreationForm {
  name: string
  deviceKey: string
  deviceTypeId: string
  groupId: string
  location: string
  description: string
  tags: DeviceCreationTag[]
}

const filledTags = (rows: DeviceCreationTag[]) =>
  rows
    .map(({ key, value }) => ({ key: key.trim(), value: value.trim() }))
    .filter(({ key, value }) => key || value)

export const deviceCreationTagError = (rows: DeviceCreationTag[]): string | undefined => {
  const tags = filledTags(rows)
  if (tags.length > 20) return '创建时最多添加 20 个标签'
  const keys = new Set<string>()
  for (const { key, value } of tags) {
    if (!key || !value) return '请完整填写标签名称和标签值，或删除该行'
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key))
      return '标签名称以字母开头，仅支持字母、数字、下划线和横线，最多 64 个字符'
    if (value.length > 128) return '标签值最多 128 个字符'
    if (keys.has(key)) return '标签名称不能重复'
    keys.add(key)
  }
  return undefined
}

export const deviceCreationTags = (
  rows: DeviceCreationTag[]
): Record<string, string> | undefined => {
  const error = deviceCreationTagError(rows)
  if (error) throw new Error(error)
  const tags = filledTags(rows)
  return tags.length ? Object.fromEntries(tags.map(({ key, value }) => [key, value])) : undefined
}
