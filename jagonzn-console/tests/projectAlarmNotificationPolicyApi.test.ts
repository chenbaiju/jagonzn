import { expect, it, vi } from 'vitest'
import request from '@/utils/http'
import {
  readProjectAlarmNotificationPolicy,
  updateProjectAlarmNotificationPolicy
} from '@/api/project-alarm-notification-policy'
vi.mock('@/utils/http', () => ({ default: { get: vi.fn(), put: vi.fn() } }))
it('项目策略API只使用精确项目路径与布尔及字符串CAS正文', () => {
  const project = '11111111-2222-4333-8444-555555555555'
  const path = `/api/v1/projects/${project}/alarm-notification-policy`
  readProjectAlarmNotificationPolicy(project)
  updateProjectAlarmNotificationPolicy(project, {
    muted: true,
    expectedRevision: '9007199254740993'
  })
  expect(request.get).toHaveBeenCalledExactlyOnceWith({ url: path, showErrorMessage: false })
  expect(request.put).toHaveBeenCalledExactlyOnceWith({
    url: path,
    showErrorMessage: false,
    data: { muted: true, expectedRevision: '9007199254740993' }
  })
  expect(() => readProjectAlarmNotificationPolicy('')).toThrow('请先选择项目')
})
