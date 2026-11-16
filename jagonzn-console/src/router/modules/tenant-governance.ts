import type { AppRouteRecord } from '@/types/router'
export const tenantGovernanceRoutes: AppRouteRecord = {
  name: 'TenantGovernance',
  path: '/tenant-governance',
  component: '/tenant-governance/index',
  meta: {
    title: 'menus.tenantGovernance.title',
    icon: 'ri:shield-user-line',
    keepAlive: false,
    requiredPermissions: ['tenant:govern']
  }
}
