import { describe, expect, it } from 'vitest'
import { can, hasMenu, session } from '@/core/session'
describe('服务端权限与菜单分离', () => {
  it('只读成员看得见读取菜单，没有管理按钮', () => {
    session.user = { permissions: ['device:read','alarm:read'], projectRole:'VIEWER' }
    session.menus = [{name:'Alarm',children:[{name:'AlarmRules'}]}]
    expect(can('alarm:read')).toBe(true); expect(can('alarm:manage')).toBe(false)
    expect(hasMenu('AlarmRules')).toBe(true); expect(hasMenu('MessageRules')).toBe(false)
    session.user = null; session.menus = []
    expect(can('alarm:read')).toBe(false); expect(hasMenu('AlarmRules')).toBe(false)
  })
})
