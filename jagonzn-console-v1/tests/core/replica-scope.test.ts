import { expect, it } from 'vitest'
import { referenceDeviceTabs, referenceDeviceTab, THINGSLINK_EXTRAS_VISIBLE } from '@/core/replica-scope'
it('设备详情只开放原站14页签，深链参数也不能打开TL扩展', () => {
  expect(referenceDeviceTabs.map(([,label]) => label)).toEqual(['概览','连接','信息','属性','事件','命令','规则','任务','自动化','场景','告警','用户','调试','设置'])
  expect(THINGSLINK_EXTRAS_VISIBLE).toBe(false)
  for (const tab of ['images','diagnostics','logs','shadow','model','topology','modbus','ota']) expect(referenceDeviceTab(tab)).toBe('overview')
  expect(referenceDeviceTab('properties')).toBe('properties')
  const originalKeys = {summary:'overview',conn:'connection',extend_info:'info',attrs:'properties',event:'events',command:'commands',rules:'rules',tasks:'tasks',automations:'automations',scenes:'scenes',alarm:'alarms',customers:'users',debug:'debug',settings:'settings'}
  for (const [source,target] of Object.entries(originalKeys)) expect(referenceDeviceTab(source)).toBe(target)
})
