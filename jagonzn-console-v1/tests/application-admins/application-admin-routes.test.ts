import { describe, expect, it } from 'vitest'
import { router } from '@/router'

describe('应用管理员深链', () => {
  it('目录、独立创建和详情使用应用管理员路由', () => {
    expect(router.resolve('/admins').name).toBe('application-admins')
    expect(router.resolve('/admin_add').name).toBe('application-admin-create')
    expect(router.resolve('/admins/00000000-0000-4000-8000-000000000002').name).toBe('application-admin-detail')
  })

  it('项目成员保留独立深链和身份页面，不与应用管理员混用', () => {
    const route = router.resolve('/project-members')
    expect(route.name).toBe('project-members')
    expect(route.meta.pending).not.toBe(true)
  })
})
