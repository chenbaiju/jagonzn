import { api, ApiError } from '../../core/http'
import type { Schema } from '../../core/contracts'
import { idOf, directoryTotal, emailOptionSnapshot, emailManagementSnapshot, versionOf, type Group, type Recipient, type Template, type Rule, type Instance } from './model'
import { configuredGroupCreated, notificationGroupIdentity, ordinaryGroupOptions, publicOrdinaryGroupOptions, notificationMemberChoices } from './notification-group-contract'
const part = (value: string) => { if (!value) throw new Error('请先选择项目或资源'); return encodeURIComponent(value) }
const base = (p: string) => `/api/v1/projects/${part(p)}` as const
export const alarmApi = {
  groupConfiguration: async (p:string,id:string,signal?:AbortSignal) => notificationGroupIdentity(await api<Schema<'ConsoleNotificationGroupConfigurationResponse'>>(`${base(p)}/console/alarm-notification-groups/${part(id)}/configuration`,{signal}),id),
  groupPublicOptions: async (p:string,id:string,signal?:AbortSignal) => publicOrdinaryGroupOptions(await api<Schema<'ConsoleNotificationGroupPublicOptionsResponse'>>(`${base(p)}/console/alarm-notification-groups/${part(id)}/configuration/options`,{signal}),id),
  groupOrdinaryOptions: async (p:string,id:string,signal?:AbortSignal) => ordinaryGroupOptions(await api<Schema<'ConsoleNotificationGroupOptionsResponse'>>(`${base(p)}/console/alarm-notification-groups/${part(id)}/configuration/edit`,{signal})),
  notificationMembers: async (p:string,signal?:AbortSignal) => notificationMemberChoices(await api<Schema<'ConsoleNotificationMemberChoiceResponse'>[]>(`${base(p)}/console/notification-members`,{signal})),
  createOrdinaryGroup: async (p:string,body:Schema<'CreateConsoleNotificationGroupRequest'>) => {
    const result=await api<Schema<'ConsoleConfiguredNotificationGroupResponse'>>(`${base(p)}/console/alarm-notification-groups`,{method:'post',body})
    try{return configuredGroupCreated(result,body.notificationType)}catch{throw new ApiError('创建结果需要重新读取核对',0,undefined,undefined,true)}
  },
  saveOrdinaryGroupOptions: async (p:string,id:string,body:Schema<'SaveConsoleNotificationGroupOptionsRequest'>) => {
    const result=await api<Schema<'ConsoleNotificationGroupOptionsResponse'>>(`${base(p)}/console/alarm-notification-groups/${part(id)}/configuration`,{method:'put',body})
    try{const value=ordinaryGroupOptions(result);if(value.notificationType!==body.notificationType.toUpperCase()||value.version!==body.version+1)throw new Error();return value}catch{throw new ApiError('保存结果需要重新读取核对',0,undefined,undefined,true)}
  },
  groupEmailOptions: async (p: string, id: string, signal?: AbortSignal) => {
    const result = await api<Schema<'NotificationGroupEmailOptionsResponse'>>(`${base(p)}/console/alarm-notification-groups/${part(id)}/email-options`, { signal })
    return emailOptionSnapshot(result, id)
  },
  groupEmailEditOptions: async (p: string, id: string, signal?: AbortSignal) => {
    const result = await api<Schema<'NotificationGroupEmailEditResponse'>>(`${base(p)}/console/alarm-notification-groups/${part(id)}/email-options/edit`, { signal })
    return emailManagementSnapshot(result)
  },
  saveGroupEmailOptions: async (p: string, id: string, body: Schema<'ReplaceNotificationGroupEmailsRequest'>) => {
    const result = await api<Schema<'NotificationGroupEmailOptionsResponse'>>(`${base(p)}/console/alarm-notification-groups/${part(id)}/email-options`, { method: 'put', body })
    return emailOptionSnapshot(result, id)
  },
  groupDirectory: async (p: string, page: number, limit: number, signal?: AbortSignal) => {
    const result = await api<Schema<'ConsoleNotificationGroupPageResponse'>>(`${base(p)}/console/alarm-notification-groups`, { query: { page, limit }, signal })
    if (directoryTotal(result) === undefined) throw new Error('通知组真实计数缺失，请重新读取')
    if (!Array.isArray(result.items) || result.page !== page || result.limit !== limit) throw new Error('通知组分页响应与请求不一致，请重新读取')
    return result
  },
  policy: (p: string, signal?: AbortSignal) => api<Schema<'ProjectAlarmNotificationPolicyResponse'>>(`${base(p)}/alarm-notification-policy`, { signal }),
  savePolicy: (p: string, body: Schema<'UpdateProjectAlarmNotificationPolicyRequest'>) => api<Schema<'ProjectAlarmNotificationPolicyResponse'>>(`${base(p)}/alarm-notification-policy`, { method: 'put', body }),
  inbox: (p: string, cursor?: string, signal?: AbortSignal) => api<Schema<'AlarmInboxPageResponse'>>(`${base(p)}/alarm-notifications`, { query: { cursor, limit: 24 }, signal }),
  unread: (p: string, signal?: AbortSignal) => api<Schema<'AlarmInboxCountResponse'>>(`${base(p)}/alarm-notifications/unread-count`, { signal }),
  markRead: (p: string, eventIds: string[]) => api<Schema<'AlarmInboxReadResponse'>>(`${base(p)}/alarm-notifications/read`, { method: 'post', body: { eventIds } }),
  devices: (p: string, cursor?: string, signal?: AbortSignal) => api<Schema<'CursorPageDeviceResponse'>>(`${base(p)}/devices`, { query: { cursor, limit: 24 }, signal }),
  bindings: (p: string, ruleId: string, signal?: AbortSignal) => api<Schema<'AlarmNotificationBindingResponse'>[]>(`${base(p)}/alarm-rules/${part(ruleId)}/notification-bindings`, { signal }),
  saveBinding: (p: string, ruleId: string, body: Schema<'SaveAlarmNotificationBindingRequest'>, row?: Schema<'AlarmNotificationBindingResponse'>) => row
    ? api<Schema<'AlarmNotificationBindingResponse'>>(`${base(p)}/alarm-notification-bindings/${part(idOf(row))}`, { method: 'put', body })
    : api<Schema<'AlarmNotificationBindingResponse'>>(`${base(p)}/alarm-rules/${part(ruleId)}/notification-bindings`, { method: 'post', body }),
  deleteBinding: (p: string, row: Schema<'AlarmNotificationBindingResponse'>) => api(`${base(p)}/alarm-notification-bindings/${part(idOf(row))}`, { method: 'delete', query: { version: versionOf(row) } }),
  deliveries: (p: string, cursor?: string, signal?: AbortSignal) => api<Schema<'CursorPageAlarmNotificationDeliveryResponse'>>(`${base(p)}/alarm-notification-deliveries`, { query: { cursor, limit: 24 }, signal }),
  groups: (p: string, cursor?: string, signal?: AbortSignal, limit = 24) => api<Schema<'CursorPageAlarmNotificationGroupResponse'>>(`${base(p)}/alarm-notification-groups`, { query: { cursor, limit }, signal }),
  group: (p: string, id: string, signal?: AbortSignal) => {
    return api<Group>(`${base(p)}/alarm-notification-groups/${part(id)}`, { signal })
  },
  saveGroup: (p: string, body: Schema<'SaveAlarmNotificationGroupRequest'>, row?: Group) => row
    ? api<Group>(`${base(p)}/alarm-notification-groups/${part(idOf(row))}`, { method: 'put', body })
    : api<Group>(`${base(p)}/alarm-notification-groups`, { method: 'post', body }),
  deleteGroup: (p: string, row: Group) => api(`${base(p)}/alarm-notification-groups/${part(idOf(row))}`, { method: 'delete', query: { version: versionOf(row) } }),
  recipients: (p: string, id: string, signal?: AbortSignal) => api<Recipient[]>(`${base(p)}/alarm-notification-groups/${part(id)}/recipients`, { signal }),
  saveRecipient: (p: string, groupId: string, body: Schema<'SaveAlarmNotificationRecipientRequest'>, row?: Recipient) => row
    ? api<Recipient>(`${base(p)}/alarm-notification-recipients/${part(idOf(row))}`, { method: 'put', body })
    : api<Recipient>(`${base(p)}/alarm-notification-groups/${part(groupId)}/recipients`, { method: 'post', body }),
  deleteRecipient: (p: string, row: Recipient) => api(`${base(p)}/alarm-notification-recipients/${part(idOf(row))}`, { method: 'delete', query: { version: versionOf(row) } }),
  templates: (p: string, cursor?: string, signal?: AbortSignal, limit = 24) => api<Schema<'CursorPageAlarmNotificationTemplateResponse'>>(`${base(p)}/alarm-notification-templates`, { query: { cursor, limit }, signal }),
  saveTemplate: (p: string, body: Schema<'SaveAlarmNotificationTemplateRequest'>, row?: Template) => row
    ? api<Template>(`${base(p)}/alarm-notification-templates/${part(idOf(row))}`, { method: 'put', body })
    : api<Template>(`${base(p)}/alarm-notification-templates`, { method: 'post', body }),
  deleteTemplate: (p: string, row: Template) => api(`${base(p)}/alarm-notification-templates/${part(idOf(row))}`, { method: 'delete', query: { version: versionOf(row) } }),
  rules: (p: string, cursor?: string, signal?: AbortSignal) => api<Schema<'CursorPageAlarmRuleResponse'>>(`${base(p)}/alarm-rules`, { query: { cursor, limit: 24 }, signal }),
  saveRule: (p: string, body: Schema<'SaveAlarmRuleRequest'>, row?: Rule) => row
    ? api<Rule>(`${base(p)}/alarm-rules/${part(idOf(row))}`, { method: 'put', body })
    : api<Rule>(`${base(p)}/alarm-rules`, { method: 'post', body }),
  deleteRule: (p: string, row: Rule) => api(`${base(p)}/alarm-rules/${part(idOf(row))}`, { method: 'delete', query: { version: versionOf(row) } }),
  instances: (p: string, query: Record<string, unknown>, signal?: AbortSignal) => api<Schema<'CursorPageAlarmInstanceResponse'>>(`${base(p)}/alarms`, { query: { ...query, limit: 24 }, signal }),
  instance: (p: string, id: string, signal?: AbortSignal) => api<Instance>(`${base(p)}/alarms/${part(id)}`, { signal }),
  events: (p: string, id: string, cursor?: string, signal?: AbortSignal) => api<Schema<'CursorPageAlarmEventResponse'>>(`${base(p)}/alarms/${part(id)}/events`, { query: { cursor, limit: 24 }, signal }),
  acknowledge: (p: string, row: Instance) => api<Instance>(`${base(p)}/alarms/${part(idOf(row))}/ack`, { method: 'post', body: { version: versionOf(row) } }),
  clear: (p: string, row: Instance) => api<Instance>(`${base(p)}/alarms/${part(idOf(row))}/clear`, { method: 'post', body: { version: versionOf(row) } }),
}
