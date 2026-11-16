import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileTemplate, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import type { AppRouteRecord } from '@/types/router'
import { consoleDomainRegistry } from '@/domains/registry'

const { user, frontendMode } = vi.hoisted(() => ({
  user: { info: { roles: [] as string[], buttons: [] as string[] } },
  frontendMode: { value: true }
}))
vi.mock('@/store/modules/user', () => ({ useUserStore: () => user }))
vi.mock('@/hooks/core/useAppMode', () => ({
  useAppMode: () => ({ isFrontendMode: frontendMode })
}))
vi.mock('@/api/system-manage', () => ({ fetchGetMenuList: vi.fn() }))
vi.mock('@/utils', () => ({ formatMenuTitle: (title: string) => title }))
import { MenuProcessor } from '@/router/core/MenuProcessor'
import { fetchGetMenuList } from '@/api/system-manage'
import { workspaceNavigation } from '@/utils/workspace-navigation'

interface Row {
  name: string
  parent: string
  path: string
  component: string
  title: string
  hidden: boolean
  fullPage: boolean
  fixedTab: boolean
  authCodes: string[]
}
/** jagonzn 本地删除页面对应的菜单身份；上游基线原件不改写。 */
const LOCALLY_REMOVED_MENU_NAMES = new Set(['PlanCatalog'])

const baseline = JSON.parse(
  readFileSync('../docs/upstream/console-menu-catalog-baseline.json', 'utf8')
) as {
  nodes: Row[]
  cases: {
    role: string
    commercial: boolean
    reviewer: boolean
    governor: boolean
    permissions: string[]
    names: string[]
  }[]
}
function rows(routes: readonly AppRouteRecord[], parent = '', base = ''): Row[] {
  return routes
    .flatMap((route) => {
      const path = route.path.startsWith('/') ? route.path : `${base}/${route.path}`
      return [
        {
          name: String(route.name),
          parent,
          path,
          component: String(route.component),
          title: String(route.meta.title),
          hidden: route.meta.isHide === true,
          fullPage: route.meta.isFullPage === true,
          fixedTab: route.meta.fixedTab === true,
          authCodes: [...new Set((route.meta.authList ?? []).map((point) => point.authMark))].sort()
        },
        ...rows(route.children ?? [], String(route.name), path)
      ]
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}
const baselineNodes = baseline.nodes.filter(
  (node) => node.name !== 'Overview' && !LOCALLY_REMOVED_MENU_NAMES.has(node.name)
)

function assertCatalog(actual: Row[]) {
  const kept = actual.filter((row) => !LOCALLY_REMOVED_MENU_NAMES.has(row.name))
  expect(new Set(kept.map((row) => row.name)).size).toBe(kept.length)
  const withoutButtons = ({ authCodes: _ignored, ...identity }: Row) => identity
  expect(kept.map(withoutButtons)).toEqual(
    [...baselineNodes]
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))
      .map(withoutButtons)
  )
  for (const row of actual) {
    const expected = baseline.nodes.find((item) => item.name === row.name)!
    for (const permission of row.authCodes)
      expect(expected.authCodes, row.name).toContain(permission)
  }
}

/** 只检查页面直接解构的 useAuth，避免把全局 buttons、说明字符串或注释当成路由权限。 */
function directAuthConsumers(source: string, filename: string): string[] {
  const { descriptor, errors } = parse(source, { filename })
  expect(errors, filename).toEqual([])
  const scripts = [descriptor.script?.content, descriptor.scriptSetup?.content]
    .filter((content): content is string => content !== undefined)
    .map((content) => ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true))
  const names = new Set<string>()
  const visit = (node: ts.Node, inspect: (child: ts.Node) => void) => {
    inspect(node)
    ts.forEachChild(node, (child) => visit(child, inspect))
  }
  for (const script of scripts) {
    visit(script, (node) => {
      if (
        !ts.isVariableDeclaration(node) ||
        !ts.isObjectBindingPattern(node.name) ||
        !node.initializer ||
        !ts.isCallExpression(node.initializer) ||
        !ts.isIdentifier(node.initializer.expression) ||
        node.initializer.expression.text !== 'useAuth'
      )
        return
      for (const element of node.name.elements) {
        if (
          ts.isIdentifier(element.name) &&
          (element.propertyName?.getText() ?? element.name.text) === 'hasAuth'
        )
          names.add(element.name.text)
      }
    })
  }
  if (!names.size) return []

  const permissions = new Set<string>()
  const collect = (node: ts.Node) => {
    if (!ts.isCallExpression(node)) return
    const callee = node.expression
    const direct = ts.isIdentifier(callee) && names.has(callee.text)
    const template =
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      ['_ctx', '$setup'].includes(callee.expression.text) &&
      names.has(callee.name.text)
    const permission = node.arguments[0]
    if ((direct || template) && permission && ts.isStringLiteralLike(permission))
      permissions.add(permission.text)
  }
  for (const script of scripts) visit(script, collect)
  if (descriptor.template) {
    const template = compileTemplate({
      source: descriptor.template.content,
      filename,
      id: filename
    })
    expect(template.errors, filename).toEqual([])
    visit(ts.createSourceFile(filename, template.code, ts.ScriptTarget.Latest, true), collect)
  }
  return [...permissions].sort()
}

function leafAuthConsumers(nodes: readonly Row[]) {
  const parents = new Set(nodes.map((node) => node.parent))
  return nodes.flatMap((node) => {
    if (parents.has(node.name) || node.name === 'Overview') return []
    const component = resolve('src/views', node.component.replace(/^\//, ''))
    const filename = [`${component}.vue`, resolve(component, 'index.vue')].find(existsSync)
    expect(filename, `${node.name} 必须定位实际页面源码`).toBeDefined()
    const permissions = directAuthConsumers(readFileSync(filename!, 'utf8'), filename!)
    return permissions.length ? [{ node, permissions }] : []
  })
}

function assertLeafAuthPoints(nodes: readonly Row[]) {
  const consumers = leafAuthConsumers(nodes)
  for (const { node, permissions } of consumers) {
    for (const permission of permissions)
      expect(node.authCodes, `${node.name} 缺少页面直接消费的 ${permission}`).toContain(permission)
  }
  return consumers
}

describe('D-004目录合同与已退役项目概况的显式差额', () => {
  it('全部业务菜单具有相同稳定身份、层级和显示合同', () =>
    assertCatalog(rows(consoleDomainRegistry.routes)))
  it('业务叶菜单声明页面实际 useAuth 消费的权限，不依赖父级门槛或全局按钮补足', () => {
    const consumers = assertLeafAuthPoints(baselineNodes)
    expect(consumers.map(({ node }) => node.name)).toEqual(
      expect.arrayContaining([
        'Devices',
        'DeviceGroups',
        'DeviceTypes',
        'DeviceTopology',
        'DeviceModbusPoints',
        'AlarmRules',
        'AlarmHistory',
        'AlarmNotificationGroups',
        'AlarmNotificationTemplates',
        'TaskJobs',
        'OtaFirmwares',
        'OtaCampaigns'
      ])
    )
  })
  it('删去告警规则读取点时即使父菜单可达且角色全局权限仍在，也能发现漏点', () => {
    const withoutAlarmRead = baselineNodes.map((node) =>
      node.name === 'AlarmRules'
        ? { ...node, authCodes: node.authCodes.filter((code) => code !== 'alarm:read') }
        : node
    )
    expect(baseline.cases.find((scenario) => scenario.role === 'VIEWER')?.permissions).toContain(
      'alarm:read'
    )
    expect(() => assertLeafAuthPoints(withoutAlarmRead)).toThrow(
      'AlarmRules 缺少页面直接消费的 alarm:read'
    )
  })
  it('源码检查不把全局按钮、注释和说明字符串归入路由消费点', () => {
    const source = `<script setup lang="ts">
      const { hasAuth: allowed } = useAuth()
      const canRead = allowed('device:read')
      const globalOnly = user.info.buttons.includes('application:read')
      // allowed('comment:read')
      const help = "allowed('description:read')"
    </script>
    <template>
      <!-- allowed('template_comment:read') -->
      <button v-if="allowed('device:update')">{{ help }}</button>
    </template>`
    expect(directAuthConsumers(source, 'direct-auth-fixture.vue')).toEqual([
      'device:read',
      'device:update'
    ])
    expect(
      directAuthConsumers(
        `<script setup>const canRead = user.info.buttons.includes('application:read')</script>`,
        'global-buttons-fixture.vue'
      )
    ).toEqual([])
  })

  for (const scenario of baseline.cases) {
    it(`${scenario.role}平台运营=${scenario.commercial}独立审核=${scenario.reviewer}租户治理=${scenario.governor}的实际处理结果与后端一致`, async () => {
      frontendMode.value = true
      user.info.roles = scenario.role === 'NONE' ? [] : [scenario.role]
      user.info.buttons = scenario.permissions
      const menus = await new MenuProcessor().getMenuList()
      const visibleLeaves = (routes: readonly AppRouteRecord[]): AppRouteRecord[] =>
        routes.flatMap((route) =>
          route.meta.isHide
            ? []
            : route.children?.length
              ? visibleLeaves(route.children)
              : route.component && route.component !== '/index/index'
                ? [route]
                : []
        )
      const before = visibleLeaves(menus)
      const projected = workspaceNavigation(menus).flatMap((group) => group.children ?? [group])
      expect(projected.map((leaf) => leaf.name).sort()).toEqual(
        before.map((leaf) => leaf.name).sort()
      )
      expect(new Set(projected).size).toBe(projected.length)
      for (const leaf of projected) {
        if (leaf.path === '/dashboard/workbench') {
          const original = before.find((item) => item.path === leaf.path)!
          expect(leaf).toEqual({
            ...original,
            meta: { ...original.meta, title: '工作台', icon: 'ri:home-smile-2-line' }
          })
        } else {
          expect(before).toContain(leaf)
        }
      }
      expect(
        rows(menus)
          .map((item) => item.name)
          .sort()
      ).toEqual(
        scenario.names
          .filter((name) => name !== 'Overview' && !LOCALLY_REMOVED_MENU_NAMES.has(name))
          .sort()
      )
    })
  }
  it('兼容旧服务菜单时不注册退役页面，保留首页与原授权目录且不修改服务原件', async () => {
    frontendMode.value = false
    const source: AppRouteRecord[] = [
      {
        name: 'Dashboard',
        path: '/dashboard',
        component: '/index/index',
        meta: { title: '工作台' },
        children: [
          {
            name: 'Workbench',
            path: 'workbench',
            component: '/dashboard/workbench',
            meta: { title: '首页' }
          },
          {
            name: 'Overview',
            path: 'overview',
            component: '/dashboard/overview',
            meta: { title: '项目概况' }
          }
        ]
      }
    ]
    const before = JSON.stringify(source)
    vi.mocked(fetchGetMenuList).mockResolvedValue(source)
    try {
      const menus = await new MenuProcessor().getMenuList()
      expect(menus[0].children?.map((route) => route.name)).toEqual(['Workbench'])
      expect(menus[0].children?.[0].path).toBe('/dashboard/workbench')
      expect(menus[0].redirect).toBe('/dashboard/workbench')
      expect(JSON.stringify(source)).toBe(before)
    } finally {
      frontendMode.value = true
    }
  })
  it('异常路由保留但不显示在业务导航中', () => {
    const catalog = rows(consoleDomainRegistry.routes)
    for (const name of ['Exception', 'Exception403', 'Exception404', 'Exception500']) {
      expect(catalog.find((route) => route.name === name)?.hidden).toBe(true)
    }
    const visible = workspaceNavigation(consoleDomainRegistry.routes)
      .flatMap((group) => group.children ?? [])
      .map((route) => route.name)
    expect(visible).not.toContain('Exception403')
    expect(visible).not.toContain('Exception404')
    expect(visible).not.toContain('Exception500')
  })
  it('删菜单或篡改路径不可被共同子集比对掩盖', () => {
    const good = rows(consoleDomainRegistry.routes)
    expect(() => assertCatalog(good.slice(1))).toThrow()
    const broken = structuredClone(good)
    broken[0].path = '/wrong-path'
    expect(() => assertCatalog(broken)).toThrow()
  })
})
