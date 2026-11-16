import { afterEach, describe, expect, it } from 'vitest'
import {
  isPublicAuthPath,
  normalizeLegacyAuthHash,
  PUBLIC_AUTH_PATHS
} from '@/core/auth-routes'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('认证页面路由边界', () => {
  it('未登录可停留全部认证页', () => {
    for (const path of PUBLIC_AUTH_PATHS) expect(isPublicAuthPath(path)).toBe(true)
    expect(isPublicAuthPath('/projects')).toBe(false)
    expect(isPublicAuthPath('/auth/unknown')).toBe(false)
  })

  it('把后端邮件链接的 hash 形式还原为 history 路径', () => {
    window.history.replaceState(
      null,
      '',
      '/login#/auth/reset-password?token=opaque-reset-token'
    )
    normalizeLegacyAuthHash()
    expect(window.location.pathname).toBe('/auth/reset-password')
    expect(window.location.search).toBe('?token=opaque-reset-token')
  })

  it('不接管其它 hash 地址', () => {
    window.history.replaceState(null, '', '/login#/projects')
    normalizeLegacyAuthHash()
    expect(window.location.pathname).toBe('/login')
    expect(window.location.hash).toBe('#/projects')
  })
})
