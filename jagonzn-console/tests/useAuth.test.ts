import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'

const state = vi.hoisted(() => ({ user: {} as any }))
vi.mock('@/store/modules/user', async () => {
  const { reactive, ref } = await import('vue')
  state.user = reactive({ info: ref({ buttons: [] as string[] }) })
  return { useUserStore: () => state.user }
})
import { useAuth } from '@/hooks/core/useAuth'

const Consumer = defineComponent({
  setup() {
    const { hasAuth } = useAuth()
    return () =>
      h('section', [
        hasAuth('alarm:read') ? h('table', '规则列表') : null,
        hasAuth('alarm:manage') ? h('button', '编辑规则') : null
      ])
  }
})

beforeEach(() => {
  state.user.info = { buttons: ['alarm:read', 'alarm:manage'] }
})

describe('useAuth 实时消费会话权限', () => {
  it('读取与管理权限分别控制列表和编辑入口', () => {
    const page = mount(Consumer)
    expect(page.find('table').exists()).toBe(true)
    expect(page.find('button').exists()).toBe(true)
    page.unmount()
  })

  it('撤权后立即移除对应控件，保留仍有效的读取区域', async () => {
    const page = mount(Consumer)
    state.user.info = { buttons: ['alarm:read'] }
    await nextTick()
    expect(page.find('table').exists()).toBe(true)
    expect(page.find('button').exists()).toBe(false)
    page.unmount()
  })

  it('buttons 数组原地替换也即时生效', async () => {
    const page = mount(Consumer)
    state.user.info.buttons = []
    await nextTick()
    expect(page.find('table').exists()).toBe(false)
    expect(page.find('button').exists()).toBe(false)
    page.unmount()
  })

  it('空会话不授予读取或管理权限', () => {
    state.user.info = {}
    const { hasAuth } = useAuth()
    expect(hasAuth('alarm:read')).toBe(false)
    expect(hasAuth('alarm:manage')).toBe(false)
  })

  it('未知权限保持拒绝', () => {
    const { hasAuth } = useAuth()
    expect(hasAuth('not:a:permission')).toBe(false)
  })
})
