import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import Create from '@/pages/ProjectCreatePage.vue'
import { ApiError } from '@/core/http'
const mock = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('@/core/http', async original => ({ ...await original<typeof import('@/core/http')>(), api: mock.api }))
let view: VueWrapper | undefined
const regions = [
  { code: 'sh-1', name: '上海1区', areaCode: 'sh', areaName: '上海', enabled: true, projectCreationEnabled: true },
  { code: 'sh-2', name: '上海2区', areaCode: 'sh', areaName: '上海', enabled: true, projectCreationEnabled: false },
  { code: 'bj-2', name: '北京2区', areaCode: 'bj', areaName: '北京', enabled: true, projectCreationEnabled: true },
  { code: 'hk-2', name: '香港2区', areaCode: 'hk', areaName: '香港', enabled: true, projectCreationEnabled: false }
]
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects/create', component: Create }, { path: '/projects', component: { template: '<p>我的项目</p>' } }
  ] })
  await router.push('/projects/create'); await router.isReady()
  view = mount({ template: '<router-view />' }, { attachTo: document.body, global: { plugins: [router, ElementPlus] } })
  await flushPromises()
  return router
}
beforeEach(() => {
  mock.api.mockReset().mockImplementation(async (path, options) => {
    if (path === '/api/v1/project-regions') return regions
    if (path === '/api/v1/plans') return ['FREE', 'STANDARD', 'ENTERPRISE', 'PROFESSIONAL'].map(code => ({ code, name: code === 'PROFESSIONAL' ? '专业版' : code, referencePriceCents: 1198000, saleStatus: 'NOT_FOR_SALE', quotaDimensions: [{code:'REST_API_WRITE_DAILY',value:0,unit:'REQUEST',window:'UTC_DAY'},{code:'FUTURE_LIMIT',value:9,unit:'COUNT',window:'NONE'}], entitlements:[{code:'OBJECT_STORAGE',enabled:true},{code:'FUTURE_FEATURE',enabled:true},{code:'OTA',enabled:false},{code:'UNKNOWN_STATE'}] }))
    if (options?.method === 'post') return { id: 'new-project' }
    return [{ myRole: 'OWNER', subscribedPlan: { code: 'PROFESSIONAL', name: '专业版' } }]
  })
})
afterEach(() => { view?.unmount(); view = undefined; document.body.innerHTML = '' })
async function createClick() { await view!.get('.create-actions .el-button--primary').trigger('click'); await flushPromises() }
describe('创建项目', () => {
  it('使用真实两级目录、当前订阅；展示四档新方案与不可选择的按量卡片', async () => {
    await render()
    expect(view!.findAll('.version-card')).toHaveLength(5)
    expect(view!.get('.is-current').text()).toContain('专业版')
    expect(view!.get('.is-current .plan-price').text()).toContain('19980')
    expect(view!.get('.payg-card').attributes('data-selectable')).toBe('false')
    expect(view!.get('.payg-card').text()).toContain('未上线')
    const card = view!.get('.is-current')
    expect(card.get('.card-note').text()).toContain('参考价')
    expect(card.get('.quota-features').text()).toContain('REST 写请求 0 次/UTC日')
    expect(card.get('.quota-features').text()).toContain('FUTURE_LIMIT 9')
    expect(card.get('.capability-features').text()).toContain('FUTURE_FEATURE')
    expect(card.get('.capability-features').text()).not.toContain('OTA')
    expect(card.findAll('.excluded-features').map(e=>e.text()).join('')).toContain('OTA 升级')
    expect(card.findAll('.excluded-features').map(e=>e.text()).join('')).toContain('UNKNOWN_STATE（状态待确认）')
    expect(card.get('.proposed-features').text()).toContain('业务历史逻辑池 100 GiB')
    expect(view!.get('[aria-label="免费版"] .card-note').text()).toBe('免费版可随时升级至付费版')
    expect(view!.get('input[value="sh-2"]').attributes('disabled')).toBeDefined()
    await view!.get('input[value="bj"]').setValue()
    expect((view!.get('input[value="bj-2"]').element as HTMLInputElement).checked).toBe(true)
    await view!.get('input[value="hk"]').setValue()
    expect(view!.get('input[value="hk-2"]').attributes('disabled')).toBeDefined()
    expect(view!.text()).not.toContain('当前地域暂无可创建')
    expect(view!.text()).not.toContain('请选择可用区')
    expect(view!.get('.create-actions .el-button--primary').attributes('disabled')).toBeDefined()
    await view!.get('.payg-card .detail-button').trigger('click'); await flushPromises()
    expect(document.body.textContent).toContain('¥0.06 / 设备 / UTC日')
    expect(document.body.textContent).toContain('max(1, ceil(字节数 / 4096))')
    expect(document.body.textContent).toContain('每 5 分钟结算')
  })
  it('空名称不提交；一次正常创建只提交既有契约字段并返回项目列表', async () => {
    const router = await render()
    await createClick()
    expect(mock.api.mock.calls.filter(c => c[1]?.method === 'post')).toHaveLength(0)
    await vi.waitFor(() => expect(view!.get('.el-form-item__error').text()).toBe('请填写'))
    await view!.get('input[aria-label="项目名称"]').setValue('  新建项目  ')
    await view!.get('textarea').setValue(' 用途 ')
    await createClick()
    expect(mock.api).toHaveBeenCalledWith('/api/v1/projects', { method: 'post', body: { name: '新建项目', region: 'sh-1', description: '用途' } })
    expect(router.currentRoute.value.path).toBe('/projects')
  })
  it('提交期间阻止重复创建，结果未知时锁定并可返回核对', async () => {
    const router = await render()
    let fail!: (error: Error) => void
    mock.api.mockImplementation((path, options) => options?.method === 'post' ? new Promise((_, reject) => { fail = reject }) : Promise.resolve([]))
    await view!.get('input[aria-label="项目名称"]').setValue('核对项目')
    await createClick(); await createClick()
    expect(mock.api.mock.calls.filter(c => c[1]?.method === 'post')).toHaveLength(1)
    fail(new ApiError('结果未知', 0, undefined, undefined, true)); await flushPromises()
    expect(view!.text()).toContain('本页不会重复提交')
    expect(view!.get('.create-actions .el-button--primary').attributes('disabled')).toBeDefined()
    await view!.get('.create-actions .el-button:last-child').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/projects')
  })
  it('明确额度拒绝保留输入且不自动重试；目录故障不提交', async () => {
    await render()
    await view!.get('input[aria-label="项目名称"]').setValue('额度项目')
    mock.api.mockRejectedValueOnce(new ApiError('项目额度已用尽', 429))
    await createClick()
    expect(view!.text()).toContain('项目额度已用尽')
    expect((view!.get('input[aria-label="项目名称"]').element as HTMLInputElement).value).toBe('额度项目')
    expect(mock.api.mock.calls.filter(c => c[1]?.method === 'post')).toHaveLength(1)
    view!.unmount(); mock.api.mockRejectedValue(new ApiError('目录不可用', 503))
    await render()
    expect(view!.text()).toContain('目录不可用')
    expect(view!.get('.create-actions .el-button--primary').attributes('disabled')).toBeDefined()
  })
})
