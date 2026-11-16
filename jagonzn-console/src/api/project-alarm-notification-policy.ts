import request from '@/utils/http'
import type { components } from '@/types/api/schema'

export type ProjectAlarmNotificationPolicy =
  components['schemas']['ProjectAlarmNotificationPolicyResponse']
export type ProjectAlarmNotificationPolicyUpdate =
  components['schemas']['UpdateProjectAlarmNotificationPolicyRequest']

function endpoint(projectId: string): `/api/v1/projects/${string}/alarm-notification-policy` {
  if (!projectId) throw new Error('请先选择项目')
  return `/api/v1/projects/${encodeURIComponent(projectId)}/alarm-notification-policy`
}

/** 读取当前项目策略，权限和实际归属由服务端重新核验。 */
export function readProjectAlarmNotificationPolicy(projectId: string) {
  return request.get<ProjectAlarmNotificationPolicy>({
    url: endpoint(projectId),
    showErrorMessage: false
  })
}

/** 单次CAS保存；失败或未知结果只能重新读取，不能自动重复PUT。 */
export function updateProjectAlarmNotificationPolicy(
  projectId: string,
  data: ProjectAlarmNotificationPolicyUpdate
) {
  return request.put<ProjectAlarmNotificationPolicy>({
    url: endpoint(projectId),
    data,
    showErrorMessage: false
  })
}
