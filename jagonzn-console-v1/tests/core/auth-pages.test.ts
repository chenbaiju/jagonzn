import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import ElementPlus, { ElMessage } from 'element-plus'
import Login from '@/pages/auth/LoginPage.vue'
import Register from '@/pages/auth/RegisterPage.vue'
import ForgotPassword from '@/pages/auth/ForgotPasswordPage.vue'
import ResetPassword from '@/pages/auth/ResetPasswordPage.vue'
import VerifyEmail from '@/pages/auth/VerifyEmailPage.vue'
import { login } from '@/core/session'
import * as auth from '@/core/auth'
import { ApiError } from '@/core/http'

vi.mock('@/core/session', () => ({ login: vi.fn() }))
vi.mock('@/core/auth', () => ({
  register: vi.fn(),
  resendVerification: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  verifyEmail: vi.fn()
}))

let wrapper: VueWrapper | undefined
let router: Router | undefined

const routes = [
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/forgot-password', component: ForgotPassword },
  { path: '/reset-password', component: ResetPassword },
  { path: '/auth/verify-email', component: VerifyEmail },
  { path: '/projects', component: { template: '<p>项目列表</p>' } }
]

async function setup(path: string) {
  router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [router, ElementPlus] } })
  await flushPromises()
  return wrapper
}

function button(label: string) {
  const element = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    node => node.textContent?.trim() === label && new DOMWrapper(node).isVisible()
  )
  if (!element) throw new Error(`未找到按钮：${label}`)
  return new DOMWrapper(element)
}

async function fill(ariaLabel: string, value: string) {
  await new DOMWrapper(document.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`)!).setValue(value)
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  router = undefined
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ThingsCloud 风格认证页', () => {
  it('登录页保留微信快捷登录按钮并明确提示尚未实现', async () => {
    const info = vi.spyOn(ElMessage, 'info')
    await setup('/login')
    expect(wrapper!.text()).toContain('登录')
    expect(wrapper!.text()).toContain('或')
    await button('微信快捷登录').trigger('click')
    expect(info).toHaveBeenCalledWith('微信快捷登录功能尚未实现')
    info.mockRestore()
  })

  it('邮箱未验证时显示重发入口并调用已实现的重发接口', async () => {
    vi.mocked(login).mockRejectedValue(new ApiError('该邮箱尚未完成注册验证', 403, 20022))
    vi.mocked(auth.resendVerification).mockResolvedValue(undefined)
    await setup('/login')
    await fill('邮箱', 'pending@example.test')
    await fill('密码', 'fixture-only-password')
    await wrapper!.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper!.text()).toContain('尚未完成注册验证')
    await button('重新发送验证邮件').trigger('click')
    await flushPromises()
    expect(auth.resendVerification).toHaveBeenCalledWith('pending@example.test')
  })

  it('注册提交已实现接口，成功后提示查收验证邮件', async () => {
    vi.mocked(auth.register).mockResolvedValue(undefined)
    await setup('/register')
    await fill('邮箱', '  new@example.test  ')
    await fill('密码', 'fixture-password-123')
    await fill('重复密码', 'fixture-password-123')
    await wrapper!.find('input[type="checkbox"]').setValue(true)
    await wrapper!.find('form').trigger('submit')
    await flushPromises()
    expect(auth.register).toHaveBeenCalledWith({
      email: 'new@example.test',
      password: 'fixture-password-123'
    })
    expect(wrapper!.text()).toContain('注册成功')
    expect(wrapper!.text()).toContain('new@example.test')
  })

  it('注册未同意协议时不发请求', async () => {
    await setup('/register')
    await fill('邮箱', 'new@example.test')
    await fill('密码', 'fixture-password-123')
    await fill('重复密码', 'fixture-password-123')
    await wrapper!.find('form').trigger('submit')
    await flushPromises()
    expect(auth.register).not.toHaveBeenCalled()
    expect(wrapper!.find('.auth-agreement').classes()).toContain('is-error')
  })

  it('找回密码提示已发送，不泄露邮箱是否存在', async () => {
    vi.mocked(auth.forgotPassword).mockResolvedValue(undefined)
    await setup('/forgot-password')
    await fill('邮箱', 'found@example.test')
    await wrapper!.find('form').trigger('submit')
    await flushPromises()
    expect(auth.forgotPassword).toHaveBeenCalledWith('found@example.test')
    expect(wrapper!.text()).toContain('已向 found@example.test 发送密码找回邮件')
  })

  it('重置页读取邮件令牌并提交新口令', async () => {
    vi.mocked(auth.resetPassword).mockResolvedValue(undefined)
    await setup('/reset-password?token=opaque-reset-token')
    await fill('新密码', 'fixture-password-456')
    await fill('重复密码', 'fixture-password-456')
    await wrapper!.find('form').trigger('submit')
    await flushPromises()
    expect(auth.resetPassword).toHaveBeenCalledWith('opaque-reset-token', 'fixture-password-456')
    expect(wrapper!.text()).toContain('密码已重置')
  })

  it('重置链接缺少令牌时不提交', async () => {
    await setup('/reset-password')
    expect(wrapper!.text()).toContain('重置链接不完整或已失效')
    expect(auth.resetPassword).not.toHaveBeenCalled()
  })

  it('邮箱验证页消费令牌并显示已验证邮箱', async () => {
    vi.mocked(auth.verifyEmail).mockResolvedValue({ email: 'verified@example.test' })
    await setup('/auth/verify-email?token=opaque-verify-token')
    await flushPromises()
    expect(auth.verifyEmail).toHaveBeenCalledWith('opaque-verify-token')
    expect(wrapper!.text()).toContain('verified@example.test')
  })
})
