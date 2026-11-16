/** 只翻译当前真实动作种类；未知值不直接显示技术标识，也不推断触发器种类。 */
export function debugOperationLabel(value: string | null | undefined): string {
  switch (value) {
    case 'notification': return '发送通知'
    case 'device-command': return '下发命令'
    case 'device-property-set': return '属性下发'
    case 'device-cloud-update': return '云端属性更新'
    case 'device-data-downlink': return '自定义数据下发'
    case 'external-url-forward': return '转发到 URL'
    case 'device-ota-check': return 'OTA 升级检查'
    case 'external-mqtt-forward': return '转发到 MQTT'
    case 'alarm-create': return '创建告警'
    case 'alarm-clear': return '解除告警'
    default: return '—'
  }
}
/** 持久动作事实只证明提交，不把设备下发/通知受理推成设备回复或最终送达。 */
export function debugResultLabel(sourceKind: string | null | undefined, resultCode: string | null | undefined): { label: string; failed: boolean } {
  if (sourceKind === 'ACTION' && resultCode === 'OTA_ACCEPTED') return { label: '升级已受理', failed: false }
  if (sourceKind === 'ACTION' && resultCode === 'OTA_NO_UPDATE') return { label: '无需升级', failed: false }
  if (sourceKind === 'ACTION' && resultCode === 'OTA_REJECTED') return { label: '检查未通过', failed: true }
  if (sourceKind === 'ACTION' && resultCode === 'ACTION_COMMITTED') return { label: '已提交', failed: false }
  if (sourceKind === 'ACTION' && resultCode === 'URL_ACCEPTED') return { label: '已发送', failed: false }
  if (sourceKind === 'ACTION' && resultCode === 'URL_REFUSED') return { label: '发送失败', failed: true }
  if (sourceKind === 'ACTION' && resultCode === 'URL_REJECTED') return { label: '未发送', failed: true }
  if (sourceKind === 'ACTION' && resultCode === 'URL_UNKNOWN') return { label: '结果未知', failed: false }
  if (sourceKind === 'ACTION' && resultCode === 'MQTT_ACCEPTED') return { label: '已发送', failed: false }
  if (sourceKind === 'ACTION' && resultCode === 'MQTT_REFUSED') return { label: '发送失败', failed: true }
  if (sourceKind === 'ACTION' && resultCode === 'MQTT_REJECTED') return { label: '未发送', failed: true }
  if (sourceKind === 'ACTION' && resultCode === 'MQTT_UNKNOWN') return { label: '结果未知', failed: false }
  if (sourceKind === 'ATTEMPT' && resultCode === 'POSTPROCESS_OUTPUT_READY') return { label: '输出已就绪', failed: false }
  // 其余尝试沿原失败码呈现；函数输出就绪不表示动作提交或设备送达。
  if (sourceKind === 'ATTEMPT') return { label: '执行失败', failed: true }
  return { label: '—', failed: false }
}
