import type { Schema } from './contracts'
import { api } from './http'

/**
 * 公开认证入口。
 *
 * 这些请求都不携带访问令牌：注册、找回口令、邮箱验证的重置/验证令牌
 * 走请求体而不是查询串，避免进入访问日志与浏览器历史。
 */

/** 注册租户与初始账号；后端返回 204，邮箱验证前不签发会话。 */
export async function register(input: Schema<'RegisterRequest'>) {
  await api<void>('/api/v1/auth/register', {
    method: 'post',
    body: input,
    authenticated: false
  })
}

/** 重发注册验证邮件；无论邮箱是否存在都返回 204。 */
export async function resendVerification(email: string) {
  await api<void>('/api/v1/auth/email/resend', {
    method: 'post',
    body: { email } satisfies Schema<'ResendVerificationRequest'>,
    authenticated: false
  })
}

/** 消费邮件链接中的一次性令牌，返回已验证邮箱。 */
export function verifyEmail(token: string) {
  return api<Schema<'VerifyEmailResponse'>>('/api/v1/auth/email/verify', {
    method: 'post',
    body: { token } satisfies Schema<'VerifyEmailRequest'>,
    authenticated: false
  })
}

/** 发送找回口令邮件；无论邮箱是否注册都返回 204。 */
export async function forgotPassword(email: string) {
  await api<void>('/api/v1/auth/password/forgot', {
    method: 'post',
    body: { email } satisfies Schema<'ForgotPasswordRequest'>,
    authenticated: false
  })
}

/** 用邮件令牌设置新口令；成功后该账号全部会话失效，需重新登录。 */
export async function resetPassword(token: string, newPassword: string) {
  await api<void>('/api/v1/auth/password/reset', {
    method: 'post',
    body: { token, newPassword } satisfies Schema<'ResetPasswordRequest'>,
    authenticated: false
  })
}
