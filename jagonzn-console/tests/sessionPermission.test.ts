import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useAuth } from '@/hooks/core/useAuth'

const useFixture = defineStore('permission-fixture', () => {
  const info = ref<{ buttons?: string[] }>({})
  return { info }
})
vi.mock('@/store/modules/user', () => ({ useUserStore: () => useFixture() }))

beforeEach(() => setActivePinia(createPinia()))

describe('会话权限与菜单按钮清单解耦', () => {
  it('读取权限不依赖菜单是否声明同名操作按钮', () => {
    useFixture().info = { buttons: ['alarm:read'] }
    const { hasAuth } = useAuth()
    expect(hasAuth('alarm:read')).toBe(true)
    expect(hasAuth('alarm:manage')).toBe(false)
  })

  it('切换身份或撤权后立即采用新权限', () => {
    const store = useFixture()
    store.info = { buttons: ['alarm:read', 'alarm:manage'] }
    const { hasAuth } = useAuth()
    store.info = { buttons: ['alarm:read'] }
    expect(hasAuth('alarm:manage')).toBe(false)
    expect(hasAuth('alarm:read')).toBe(true)
    store.info = {}
    expect(hasAuth('alarm:read')).toBe(false)
  })

  it('空会话不授予读取或管理权限', () => {
    const { hasAuth } = useAuth()
    expect(hasAuth('alarm:read')).toBe(false)
    expect(hasAuth('device:control')).toBe(false)
  })
})
