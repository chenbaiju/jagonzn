import request from '@/utils/http'
import type { components } from '@/types/api/schema'
export type TenantSafetyView = components['schemas']['TenantGovernanceView']
export type TenantSafetyOperation = components['schemas']['TenantGovernanceOperation']
export type TenantSafetyRequest = components['schemas']['TenantSafetyChangeRequest']
export type TenantSafetyPage = components['schemas']['TenantPage']
export type TenantSafetyHistory = components['schemas']['HistoryPage']
const base = (id: string) =>
  `/api/v1/operations/tenants/${encodeURIComponent(id)}/governance` as const
export const fetchTenantSafetyDirectory = (params: {
  tenantId?: string
  prefix?: string
  status?: string
  cursor?: string
  limit?: number
}) => request.get<TenantSafetyPage>({ url: '/api/v1/operations/tenants', params })
export const fetchTenantSafety = (id: string) => request.get<TenantSafetyView>({ url: base(id) })
export const fetchTenantSafetyHistory = (
  id: string,
  params: { cursor?: string; operationId?: string; limit?: number } = {}
) => request.get<TenantSafetyHistory>({ url: `${base(id)}/operations`, params })
export const changeTenantSafety = (id: string, data: TenantSafetyRequest) =>
  request.post<TenantSafetyOperation>({ url: `${base(id)}/operations`, data })
