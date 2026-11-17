import { expect, test } from '@playwright/test'
import { enterProject, expandWorkspace, login } from './helpers'

/**
 * 项目设置页的真实浏览器验收（展示面）。
 *
 * jagonzn 控制台不展示商用套餐与订阅用量信息：项目设置只保留 Agent、知识资料与告警配置。
 * 本旅程验证该页可进入，且不再渲染套餐摘要与配额用量卡片。
 */
const PLAN_EMAIL = process.env.E2E_PLAN_EMAIL ?? 'e2e-plan@example.com'
const PLAN_PASSWORD = process.env.E2E_PLAN_PASSWORD ?? 'contract-pass-123'
const PLAN_PROJECT = process.env.E2E_PLAN_PROJECT ?? '套餐面板项目'

test('项目设置页：可进入且不展示商用套餐与配额用量面板', async ({ page }) => {
  await login(page, PLAN_EMAIL, PLAN_PASSWORD)
  await enterProject(page, PLAN_PROJECT)
  await expandWorkspace(page, '项目与资源')
  await page.locator('#app-sidebar').getByText('项目设置', { exact: true }).click()

  const settings = page.locator('.project-settings')
  await expect(settings).toBeVisible({ timeout: 20_000 })
  await expect(settings).toContainText('Agent 与知识配置')
  await expect(settings.locator('.plan-summary')).toHaveCount(0)
  await expect(settings.locator('.project-settings__sections')).toHaveCount(0)
  await expect(settings).not.toContainText('用量与额度')
  await expect(settings).not.toContainText('订阅套餐')
})
