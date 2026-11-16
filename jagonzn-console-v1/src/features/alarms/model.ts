import type { Schema } from '../../core/contracts'
export type Group = Schema<'AlarmNotificationGroupResponse'>
export type Recipient = Schema<'AlarmNotificationRecipientResponse'>
export type Template = Schema<'AlarmNotificationTemplateResponse'>
export type Rule = Schema<'AlarmRuleResponse'>
export type Instance = Schema<'AlarmInstanceResponse'>
export type Channel = Schema<'SaveAlarmNotificationRecipientRequest'>['channel']
export const channels: { value: Channel; label: string }[] = [{ value: 'EMAIL', label: '邮箱通知' }, { value: 'WEBHOOK', label: 'Webhook' }, { value: 'PUSH', label: 'App 推送' }]
export const unsupportedChannels = ['短信通知', '电话通知', '企业微信', '钉钉', '飞书']
export const channelName = (channel?: string) => channels.find(c => c.value === channel)?.label || channel || '—'
export function versionOf(row: { version?: number }) {
  if (!Number.isSafeInteger(row.version) || row.version! < 0) throw new Error('缺少有效版本，请刷新后重试')
  return row.version!
}
export function idOf(row: { id?: string }) { if (!row.id) throw new Error('缺少资源标识，请刷新后重试'); return row.id }
export function groupBody(name: string, enabled: boolean, row?: Group, description?: string): Schema<'SaveAlarmNotificationGroupRequest'> {
  const value = name.trim()
  if (!value || value.length > 128) throw new Error('名称须为 1～128 个字符')
  if (description !== undefined && description.length > 2048) throw new Error('描述最多2048个字符')
  return { name: value, enabled, ...(row ? { version: versionOf(row) } : {}), ...(description === undefined ? {} : { description }) }
}
export function recipientBody(channel: Channel, target: string, enabled: boolean, row?: Recipient): Schema<'SaveAlarmNotificationRecipientRequest'> {
  if (channel === 'PUSH') throw new Error('App推送接收者由终端授权关系确定，不能填写用户ID或令牌')
  const value = target.trim()
  if (!value || value.length > 2048) throw new Error('请填写有效的通知目标')
  return { channel, target: value, enabled, ...(row ? { version: versionOf(row) } : {}) }
}
export function canAcknowledge(row: Instance) { return row.ackState === 'UNACKNOWLEDGED' && row.conditionState !== 'PENDING' }
export function canClear(row: Instance) { return row.conditionState === 'ACTIVE' }

/** 离线规则固定为平台连接EQ0触发、EQ1恢复；响应字段和不支持条件不进入写请求。 */
export function ruleBody(form: Schema<'SaveAlarmRuleRequest'>, offline: boolean, row?: Rule): Schema<'SaveAlarmRuleRequest'> {
  if (!form.name?.trim() || !form.alarmType?.trim() || !form.deviceId || (!offline && !form.propertyKey)) throw new Error('请填写名称、告警类型、设备和属性')
  return { name: form.name.trim(), alarmType: form.alarmType.trim(), deviceId: form.deviceId, propertyKey: offline ? 'platformConnectionOnline' : form.propertyKey, triggerOperator: offline ? 'EQ' : form.triggerOperator, triggerThreshold: offline ? 0 : form.triggerThreshold, triggerDurationSeconds: offline ? 0 : form.triggerDurationSeconds, clearOperator: offline ? 'EQ' : form.clearOperator, clearThreshold: offline ? 1 : form.clearThreshold, clearDurationSeconds: offline ? 0 : form.clearDurationSeconds, severity: form.severity, enabled: form.enabled, ...(row ? { version: versionOf(row) } : {}) }
}

/** 策略代次保留原始long十进制字符串，拒绝JS不精确数字和越界值。 */
export function validatePolicy(value: Schema<'ProjectAlarmNotificationPolicyResponse'>) {
  if (typeof value.muted !== 'boolean' || typeof value.writable !== 'boolean' || typeof value.revision !== 'string'
    || !/^(0|[1-9][0-9]{0,18})$/.test(value.revision) || BigInt(value.revision) > 9223372036854775807n) throw new Error('项目策略响应不完整，请重新读取')
  return value
}

export const templateVariables: Record<string, string> = {
  '${alarm.type}': '【告警类型】', '${alarm.severity}': '【告警级别】', '${alarm.value}': '【告警值】',
  '${alarm.activatedAt}': '【激活时间】', '${alarm.instanceId}': '【告警实例ID】'
}
/** 只替换固定文本变量，不执行表达式，也不把通知正文作为HTML。 */
export function previewTemplate(value: string) {
  let from = 0
  while ((from = value.indexOf('${', from)) >= 0) {
    const end = value.indexOf('}', from)
    if (end < 0 || !Object.hasOwn(templateVariables, value.substring(from, end + 1))) throw new Error('通知模板包含不支持的变量')
    from = end + 1
  }
  return value.replace(/\$\{[^}]*\}/g, token => templateVariables[token])
}
export function templateBody(name: string, channel: Channel, subject: string, body: string, enabled: boolean, row?: Template): Schema<'SaveAlarmNotificationTemplateRequest'> {
  if (!name.trim() || name.trim().length > 128 || !body.trim() || (channel === 'EMAIL' && !subject.trim())) throw new Error('请填写有效名称、通知正文及邮件标题')
  previewTemplate(body); previewTemplate(subject)
  return { name: name.trim(), channel, subjectTemplate: subject, bodyTemplate: body, enabled, ...(row ? { version: versionOf(row) } : {}) }
}

/** 普通文本描述沿唯一生成Schema，错误响应不渲染为HTML。 */
export function groupDescription(row: Group): string {
  return typeof row.description === 'string' ? row.description : ''
}

/** 只接受后端真实计数；旧cursor页没有total时保持未知，不拿items.length推导。 */
export function directoryTotal(page: unknown): string | undefined {
  if (!page || typeof page !== 'object' || !('total' in page) || typeof page.total !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(page.total) || BigInt(page.total) > 9223372036854775807n) return undefined
  return page.total
}

/** 邮箱原站编辑读面仅投影既有受权recipient schema；不在前端重建服务端DTO。 */
export function emailOptionSnapshot(value: unknown, groupId: string): Recipient[] {
  if (!value || typeof value !== 'object' || !('recipients' in value) || !Array.isArray(value.recipients) || value.recipients.length > 1000) throw new Error('邮箱设置响应不完整')
  const seen = new Set<string>()
  return value.recipients.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !item.id || seen.has(item.id) || !('groupId' in item) || item.groupId !== groupId || !('channel' in item) || item.channel !== 'EMAIL' || !('target' in item) || typeof item.target !== 'string' || !('version' in item) || !Number.isSafeInteger(item.version) || (item.version as number) < 0 || !('enabled' in item) || typeof item.enabled !== 'boolean') throw new Error('邮箱设置范围或版本不匹配')
    seen.add(item.id)
    return item as Recipient
  })
}
/** 脱敏旧行按身份保留；新文本才按真实邮箱提交，不把占位符写入投递目标。 */
export function emailEditRequest(text: string, snapshot: Recipient[]): Schema<'ReplaceNotificationGroupEmailsRequest'> {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!lines.length || lines.length > 1000) throw new Error('请填写1～1000个邮箱，每行一个')
  const candidates = new Map<string, Recipient[]>()
  for (const row of snapshot.filter(row => row.enabled)) candidates.set(row.target || '', [...(candidates.get(row.target || '') || []), row])
  for (const [mask, rows] of candidates) {
    const kept = lines.filter(line => line === mask).length
    if (rows.length > 1 && kept > 0 && kept < rows.length) throw new Error('多个邮箱脱敏后相同，请完整保留这些行，或改填完整邮箱以核对')
  }
  const retainedRecipientIds: string[] = [], addedEmails: string[] = []
  for (const line of lines) {
    const existing = candidates.get(line)?.shift()
    if (existing) retainedRecipientIds.push(idOf(existing))
    else {
      if (line.includes('***')) throw new Error('脱敏地址须保留原行，修改时请填写完整邮箱')
      const target = recipientBody('EMAIL', line, true).target!
      if (addedEmails.includes(target)) throw new Error('邮箱不能重复')
      addedEmails.push(target)
    }
  }
  return { addedEmails, retainedRecipientIds, expectedRecipients: snapshot.map(row => ({ id: idOf(row), version: versionOf(row) })) }
}


/** 管理编辑项直接使用官方专用响应的元素类型，不复用普通脱敏recipient DTO。 */
export type ManagedEmailRecipient = Required<NonNullable<Schema<'NotificationGroupEmailEditResponse'>['recipients']>[number]>
/** 管理端点原地址快照必须完整且与启用列表一致；错误响应不得回填为无身份文本。 */
export function emailManagementSnapshot(value: unknown): ManagedEmailRecipient[] {
  if (!value || typeof value !== 'object' || !('recipients' in value) || !Array.isArray(value.recipients) || value.recipients.length > 1000 || !('activeEmails' in value) || !Array.isArray(value.activeEmails)) throw new Error('邮箱编辑快照不完整，请重新读取')
  const ids = new Set<string>(), emails = new Set<string>()
  const rows = value.recipients.map((item: unknown): ManagedEmailRecipient => {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !item.id || ids.has(item.id)
      || !('email' in item) || typeof item.email !== 'string' || item.email !== item.email.trim() || item.email.length > 2048 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) || emails.has(item.email)
      || !('enabled' in item) || typeof item.enabled !== 'boolean' || !('version' in item) || typeof item.version !== 'number' || !Number.isSafeInteger(item.version) || item.version < 0) throw new Error('邮箱编辑身份或版本不完整，请重新读取')
    ids.add(item.id); emails.add(item.email)
    return { id: item.id, email: item.email, enabled: item.enabled, version: item.version }
  })
  const active = rows.filter(row => row.enabled).map(row => row.email)
  if (value.activeEmails.length !== active.length || value.activeEmails.some((email: unknown, index: number) => email !== active[index])) throw new Error('邮箱编辑启用集合不一致，请重新读取')
  return rows
}
/** 原地址逐行编辑：精确保留未改身份，移除/新增按完整recipient版本原子提交，不用组版本。 */
export function managedEmailEditRequest(text: string, snapshot: ManagedEmailRecipient[]): Schema<'ReplaceNotificationGroupEmailsRequest'> {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!lines.length || lines.length > 1000) throw new Error('请填写1～1000个邮箱，每行一个')
  if (new Set(lines).size !== lines.length) throw new Error('邮箱不能重复')
  const active = new Map(snapshot.filter(row => row.enabled).map(row => [row.email, row]))
  const retainedRecipientIds: string[] = [], addedEmails: string[] = []
  for (const line of lines) {
    const existing = active.get(line)
    if (existing) retainedRecipientIds.push(idOf(existing))
    else {
      if (line.includes('***') || line.length > 2048 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) throw new Error('请填写完整有效邮箱，每行一个')
      addedEmails.push(line)
    }
  }
  return { addedEmails, retainedRecipientIds, expectedRecipients: snapshot.map(row => ({ id: idOf(row), version: versionOf(row) })) }
}
