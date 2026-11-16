import type { AlarmLog } from '../../src/features/alarms/alarm-transition-log-api'
export const project = '11111111-1111-4111-8111-111111111111'
export const device = '22222222-2222-4222-8222-222222222222'
export const other = '33333333-3333-4333-8333-333333333333'
export const rule = '44444444-4444-4444-8444-444444444444'
export const event = '55555555-5555-4555-8555-555555555555'
export const row: AlarmLog = { id: event, instanceId: '66666666-6666-4666-8666-666666666666', ruleId: rule,
  deviceId: device, alarmType: 'temperature', state: 'ok', level: null, createdAt: '2026-10-24T00:00:00Z',
  value: null, clearReason: 'MANUAL', ruleName: '高温规则', deviceName: '设备一',
  maintenanceAlarmReason: '', maintenanceSolution: '', maintenanceRemark: '', notificationLogs: [
    { id: '77777777-7777-4777-8777-777777777777', channel: 'EMAIL', target: '***', result: false, errorCode: 'DEAD_LETTER' },
  ], notificationLogsTruncated: false,triggerValues:null }
/** 旧协议只提供实际标量；组合测试不伪造完整typed原件。 */
export const legacyEvaluation = (log = row) => ({ response: { eventId: log.id, instanceId: log.instanceId,
  ruleId: log.ruleId, deviceId: log.deviceId, createdAt: log.createdAt,
  kind: 'LEGACY_SCALAR' as const, evaluationSnapshotJson: null }, display: null })
