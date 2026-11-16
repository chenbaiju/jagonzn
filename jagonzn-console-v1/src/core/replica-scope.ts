/** 用户裁决：只开放 ThingsCloud 参考界面，TL扩展待复刻完成后另行审核。 */
export const THINGSLINK_EXTRAS_VISIBLE = false
export const referenceDeviceTabs = [
  ['overview', '概览'], ['connection', '连接'], ['info', '信息'], ['properties', '属性'],
  ['events', '事件'], ['commands', '命令'], ['rules', '规则'], ['tasks', '任务'],
  ['automations', '自动化'], ['scenes', '场景'], ['alarms', '告警'], ['users', '用户'],
  ['debug', '调试'], ['settings', '设置'],
] as const
/** 原站设备详情深链的 tab 键与本系统内部页签键不同；两者都接受，未知仍回概览。 */
const referenceDeviceTabAliases:Readonly<Record<string,string>>={summary:'overview',conn:'connection',extend_info:'info',attrs:'properties',event:'events',command:'commands',rules:'rules',tasks:'tasks',automations:'automations',scenes:'scenes',alarm:'alarms',customers:'users',debug:'debug',settings:'settings'}
export function referenceDeviceTab(value: unknown): string {
  if(typeof value==='string'&&Object.hasOwn(referenceDeviceTabAliases,value))return referenceDeviceTabAliases[value]!
  return typeof value === 'string' && referenceDeviceTabs.some(([key]) => key === value) ? value : 'overview'
}
