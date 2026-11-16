import request from '@/utils/http'
import type { components } from '@/types/api/schema'

export type SmsRecipientConfiguration = components['schemas']['SmsRecipientConfigurationResponse']
export type SmsRecipientUpdate = components['schemas']['UpdateSmsRecipientRequest']
export type SmsRecipientPurpose = SmsRecipientConfiguration['purpose']

function endpoint(purpose: SmsRecipientPurpose, projectId?: string) {
  if (purpose === 'DEVICE_ALARM') {
    if (!projectId) throw new Error('请先选择项目')
    return `/api/v1/projects/${encodeURIComponent(projectId)}/alarm-sms-recipient` as const
  }
  return `/api/v1/tenant/notification-recipients/${purpose}` as const
}

/** 只读当前作用域，租户身份始终由服务端会话推导。 */
export function readSmsRecipient(purpose: SmsRecipientPurpose, projectId?: string) {
  return request.get<SmsRecipientConfiguration>({ url: endpoint(purpose, projectId) })
}

/** PUT沿HTTP层精确单次发送，失败后读取权威状态，不能自动重放旧身份写入。 */
export function updateSmsRecipient(
  purpose: SmsRecipientPurpose,
  projectId: string | undefined,
  data: SmsRecipientUpdate
) {
  return request.put<SmsRecipientConfiguration>({
    url: endpoint(purpose, projectId),
    data,
    showErrorMessage: false
  })
}
