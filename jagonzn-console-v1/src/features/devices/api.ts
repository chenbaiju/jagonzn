import { api } from '@/core/http'
import type { Schema, paths } from '@/core/contracts'
export type DirectoryQuery = NonNullable<paths['/api/v1/projects/{projectId}/devices/directory']['get']['parameters']['query']>
export type Device = Schema<'DeviceResponse'>
export type DeviceType = Schema<'DeviceTypeResponse'>
export type Group = Schema<'DeviceGroupResponse'>
export type SearchFilters = { keyword: string; deviceTypeIds: string[]; statuses: Array<'INACTIVE' | 'ONLINE' | 'OFFLINE'>; groupId: string; tagKey: string; tagValue: string }
export const emptyFilters = (): SearchFilters => ({ keyword: '', deviceTypeIds: [], statuses: [], groupId: '', tagKey: '', tagValue: '' })
export function devicePath(project: string, device: string) {
  if (!project || !device) throw new Error('请先选择项目和设备')
  return `/api/v1/projects/${encodeURIComponent(project)}/devices/${encodeURIComponent(device)}` as const
}
export const devicesApi = {
  profile: (project:string,device:string,signal?:AbortSignal)=>api<Schema<'DeviceReferenceProfileResponse'>>(`${devicePath(project,device)}/reference-profile`,{signal}),
  createProfile: (project:string,body:Schema<'CreateDeviceReferenceProfileRequest'>,key:string)=>api<Schema<'DeviceReferenceProfileResponse'>>(`/api/v1/projects/${project}/devices/reference-profile`,{method:'post',body,headers:{'Idempotency-Key':key}}),
  changeProfile: (project:string,device:string,body:Schema<'ChangeDeviceReferenceProfileRequest'>,key:string)=>api<Schema<'DeviceReferenceProfileResponse'>>(`${devicePath(project,device)}/reference-profile`,{method:'put',body,headers:{'Idempotency-Key':key}}),
  directory: (project: string, query: DirectoryQuery, signal?: AbortSignal) => api<Schema<'ConsoleDeviceCatalogResponse'>>(`/api/v1/projects/${project}/devices/directory`, { query, signal }),
  search: (project: string, filters: SearchFilters, cursor?: string, limit = 24, signal?: AbortSignal) => api<Schema<'CursorPageDeviceResponse'>>(`/api/v1/projects/${project}/devices/search`, { query: { ...filters, cursor, limit }, signal }),
  type: (project: string, type: string, signal?: AbortSignal) => api<DeviceType>(`/api/v1/projects/${encodeURIComponent(project)}/device-types/${encodeURIComponent(type)}`, { signal }),
  types: (project: string, cursor?: string, signal?: AbortSignal) => api<Schema<'CursorPageDeviceTypeResponse'>>(`/api/v1/projects/${project}/device-types/search`, { query: { cursor, limit: 50 }, signal }),
  groups: (project: string, signal?: AbortSignal) => api<Group[]>(`/api/v1/projects/${project}/device-groups`, { signal }),
  read: (project: string, device: string, signal?: AbortSignal) => api<Device>(devicePath(project, device), { signal }),
  create: (project: string, body: Schema<'CreateDeviceRequest'>) => api<Device>(`/api/v1/projects/${project}/devices`, { method: 'post', body }),
  update: (project: string, device: string, body: Schema<'UpdateDeviceRequest'>) => api<Device>(devicePath(project, device), { method: 'put', body }),
  remove: (project: string, device: string) => api<void>(`${devicePath(project, device)}/removal`, { method: 'post', headers: { 'Idempotency-Key': crypto.randomUUID() } }),
  tags: (project: string, device: string, signal?: AbortSignal) => api<Schema<'DeviceTagResponse'>[]>(`${devicePath(project, device)}/tags`, { signal }),
  shadow: (project: string, device: string, signal?: AbortSignal) => api<Schema<'DeviceShadowResponse'>>(`${devicePath(project, device)}/shadow`, { signal }),
  desired: (project: string, device: string, body: Schema<'UpdateDesiredRequest'>) => api<Schema<'DeviceShadowResponse'>>(`${devicePath(project, device)}/shadow/desired`, { method: 'put', body }),
  credentials: (project: string, device: string, signal?: AbortSignal) => api<Schema<'DeviceCredentialResponse'>[]>(`${devicePath(project, device)}/credentials`, { signal }),
  generateCredential: (project: string, device: string) => api<Schema<'CredentialCreatedResponse'>>(`${devicePath(project, device)}/credentials`, { method: 'post' }),
  revokeCredential: (project: string, device: string, credential: string) => api<void>(`${devicePath(project, device)}/credentials/${credential}`, { method: 'delete' }),
  connections: (project: string, device: string, signal?: AbortSignal) => api<Schema<'DeviceConnectionResponse'>[]>(`${devicePath(project, device)}/connections`, { signal }),
  access: (project: string, device: string, signal?: AbortSignal) => api<Schema<'DeviceAccessConfigurationResponse'>>(`${devicePath(project, device)}/access-config`, { signal }),
  changeAccess: (project: string, device: string, body: Schema<'ChangeDeviceAccessConfigurationRequest'>) => api<Schema<'DeviceAccessConfigurationResponse'>>(`${devicePath(project, device)}/access-config`, { method: 'put', body }),
  binding: async (project: string, device: string, signal?: AbortSignal) => {
    const value=await api<Schema<'DeviceThingModelBindingResponse'>|undefined>(`${devicePath(project, device)}/thing-model-binding`, { signal })
    if(!value)throw new Error('设备尚未关联物模型')
    return value
  },
  command: (project: string, device: string, body: Schema<'SubmitDeviceCommandRequest'>, key: string) => api<Schema<'DeviceCommandResponse'>>(`${devicePath(project, device)}/commands`, { method: 'post', body, headers: { 'Idempotency-Key': key } }),
}
export const statusLabel = (status?: string) => ({ INACTIVE: '未激活', ONLINE: '在线', OFFLINE: '离线' }[status || ''] || status || '未知')
