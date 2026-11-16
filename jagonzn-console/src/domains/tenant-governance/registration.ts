import type { ConsoleDomainRegistration } from '../contract'
import { tenantGovernanceRoutes } from '@/router/modules/tenant-governance'
export default {
  id: 'tenant-governance',
  order: 78,
  routes: [tenantGovernanceRoutes],
  zhCNMessages: { menus: { tenantGovernance: { title: '租户安全治理' } } }
} satisfies ConsoleDomainRegistration
