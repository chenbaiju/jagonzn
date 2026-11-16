import { describe, expect, it, vi } from 'vitest'
import type { AppRouteRecord } from '@/types/router'

const state = vi.hoisted(() => ({
  frontendMode: false,
  backendMenu: [] as AppRouteRecord[]
}))

vi.mock('@/hooks/core/useAppMode', () => ({
  useAppMode: () => ({ isFrontendMode: { value: state.frontendMode } })
}))
vi.mock('@/api/system-manage', () => ({
  fetchGetMenuList: async () => state.backendMenu
}))
vi.mock('@/store/modules/user', () => ({
  useUserStore: () => ({ info: { roles: [], buttons: [] } })
}))
vi.mock('@/utils', () => ({ formatMenuTitle: (title: string) => title }))

import { MenuProcessor } from '@/router/core/MenuProcessor'

/** 构造后端目录返回的菜单节点。 */
const route = (name: string, path: string, children?: AppRouteRecord[]): AppRouteRecord => ({
  name,
  path,
  component: `${path}/index`,
  meta: { title: `menus.${name}.title` },
  ...(children ? { children } : {})
})

describe('jagonzn 本地菜单删除', () => {
  it('后端仍下发已删除页面时在装配期过滤，保留其他平台节点', async () => {
    state.backendMenu = [
      route('PlanCatalog', '/plan-catalog'),
      route('SystemStatus', '/system-status'),
      route('PlatformTools', '/platform-tools', [
        route('PlanCatalog', '/plan-catalog'),
        route('TenantGovernance', '/tenant-governance')
      ])
    ]

    const menus = await new MenuProcessor().getMenuList()

    expect(menus.map((menu) => menu.name)).toEqual(['SystemStatus', 'PlatformTools'])
    expect(menus[1].children?.map((menu) => menu.name)).toEqual(['TenantGovernance'])
  })
})
