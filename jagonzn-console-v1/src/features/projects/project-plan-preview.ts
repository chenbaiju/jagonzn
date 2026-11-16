import type { Schema } from '@/core/contracts'

/** 商用方案展示，不作为订阅、报价或准入合同。
 * 来源：COMMERCIAL_PLAN_ARCHITECTURE §11；PAY_AS_YOU_GO_DESIGN §4.2（v4）。
 * 当前目录的旧专业版参考价与实际权益仍由服务端返回，不能被这里的新方案覆盖。
 */
export const projectPlanPreviews = [
  { code: 'FREE', outbound: '0.1 GiB', writes: 100, reads: 1000, targets: 0, peak: 1, burst: 2, name: '免费版', price: 0, description: '适合个人开发者、物联网项目原型验证，提供基础的设备接入和应用搭建能力。', devices: 3, uplink: 700, downlink: 300, history: '7 天', users: 3, boards: 1, projects: 1, members: 0, objects: '100 MiB', historyPool: '100 MiB' },
  { code: 'STANDARD', outbound: '5 GiB', writes: 1000, reads: 10000, targets: 2, peak: 10, burst: 20, name: '标准版', price: 2980, description: '适合小型公司、小规模物联网项目，提供比较完整的设备接入和应用搭建能力。', devices: 100, uplink: 105000, downlink: 45000, history: '6 个月', users: 100, boards: 10, projects: 5, members: 5, objects: '5 GiB', historyPool: '10 GiB' },
  { code: 'ENTERPRISE', outbound: '10 GiB', writes: 3000, reads: 30000, targets: 5, peak: 30, burst: 60, name: '企业版', price: 5980, description: '适合需要更多资源用量和协作能力的中小型企业，搭建自有物联网应用。', devices: 300, uplink: 315000, downlink: 135000, history: '9 个月', users: 300, boards: 30, projects: 10, members: 15, objects: '20 GiB', historyPool: '30 GiB' },
  { code: 'PROFESSIONAL', outbound: '20 GiB', writes: 10000, reads: 100000, targets: 10, peak: 100, burst: 200, name: '专业版', price: 19980, description: '适合需要更多资源用量的中大型企业，可搭建规模较大的物联网项目。', devices: 1000, uplink: 1050000, downlink: 450000, history: '12 个月', users: 1000, boards: 100, projects: 20, members: 50, objects: '100 GiB', historyPool: '100 GiB' }
] as const

export const payAsYouGoRates = [
  ['活跃设备', '¥0.06 / 设备 / UTC日', '当日首次可信活动计费，同日重连不重复；跨日持续在线计入次日。'],
  ['消息通信', '¥15 / 百万计费单位', '每份独立有效上行、下行或应用投递按 max(1, ceil(字节数 / 4096)) 计量，按单位实扣。'],
  ['持久化存储', '¥5 / GiB·月', '按可归属逻辑字节 × 保存秒数；1 GiB = 2³⁰ 字节，1 月 = 30 日。'],
  ['文件 / OTA / 导出出站', '¥3 / GiB', '按有效交付字节计费，不按整 GiB 进位，不重复收取已计消息费的字节。'],
  ['对象写请求', '¥0.12 / 千次', '成功逻辑写入按次实扣，内部落库、分片及平台重试不收费。'],
  ['对象读请求', '¥0.01 / 千次', '成功逻辑读取按次实扣；受控下载分片去重，普通查询和列表不收费。'],
  ['业务短信', '¥0.06 / 供应商计费段', '单独开通，仅使用正充值余额，不使用赠款或信用。'],
  ['语音通知', '¥0.15 / 接通分钟', '接通时间按分钟进位；单独开通，仅使用正充值余额。'],
  ['平台代发业务邮件', '¥0.005 / 收件人·封', '供应商受理后计费；仅使用正充值余额，自配 SMTP 不重复计费。']
] as const

export function previewFeatures(plan: typeof projectPlanPreviews[number]) {
  const n = (value: number) => value.toLocaleString('en-US')
  return [ `${n(plan.devices)} 个设备`, `上行 ${n(plan.uplink)} / 下行 ${n(plan.downlink)} 条/日`, `${plan.history} API 可查窗口`, `${n(plan.users)} 个终端用户`, `${plan.boards} 个看板`, `${plan.projects} 个自有项目`, `${plan.members} 个外部协作者席位`, `${plan.objects} 对象文件容量` ]
}

/** 目录全部维度和能力逐项显示；未知编码保留，缺值不能变为零或无限。 */
const quotaNames: Record<string, string> = {
  PROJECTS_MAX: '自有项目', DEVICES_MAX: '设备', END_USERS_MAX: '终端用户', DASHBOARDS_MAX: '看板',
  EXTERNAL_COLLABORATOR_SEATS: '外部协作者席位', HISTORY_WINDOW: 'API 可查窗口',
  UPLINK_MESSAGE_DAILY: '上行消息', DOWNLINK_MESSAGE_DAILY: '下行消息', REST_API_WRITE_DAILY: 'REST 写请求',
  REST_API_RATE_PER_MINUTE: 'REST 请求速率', WEBSOCKET_CONNECTION_CONCURRENT: 'WebSocket 并发连接',
  SCRIPT_RULE_CONCURRENCY: '脚本/规则并发', SCRIPT_RULE_EXECUTION_DAILY: '脚本/规则执行',
  SCRIPT_RULE_CPU_MILLIS_DAILY: '脚本/规则 CPU 时间', NOTIFICATION_DELIVERY_DAILY: '通知投递', STORAGE_LIMIT: '对象文件容量'
}
const capabilityNames: Record<string, string> = {
  REST_API_WRITE: 'REST 写接口', REST_API_RATE_LIMIT: 'REST 请求速率控制', WEBSOCKET_CONNECTION: 'WebSocket 实时连接',
  SCRIPT_RULE_CONCURRENCY: '脚本/规则并发执行', SCRIPT_RULE_EXECUTION: '脚本/规则执行', SCRIPT_RULE_CPU: '脚本/规则 CPU 配额',
  NOTIFICATION_DELIVERY: '通知投递', OBJECT_STORAGE: '对象文件存储', SMS_CHANNEL: '短信渠道', OTA: 'OTA 升级',
  OPEN_API: '开放 API', APP_SUBSCRIPTION: 'MQTT 应用订阅'
}
export const capabilityName = (code?: string) => code ? capabilityNames[code] || code : '未提供功能名称'
const numberText = (value?: number) => value != null && Number.isFinite(value) ? value.toLocaleString('en-US') : '未提供'
export function catalogQuotaFeatures(plan: Schema<'PlanResponse'>) {
  const order = ['DEVICES_MAX', 'UPLINK_MESSAGE_DAILY', 'DOWNLINK_MESSAGE_DAILY', 'HISTORY_WINDOW', 'END_USERS_MAX', 'DASHBOARDS_MAX', 'PROJECTS_MAX', 'EXTERNAL_COLLABORATOR_SEATS', 'STORAGE_LIMIT', 'REST_API_WRITE_DAILY', 'REST_API_RATE_PER_MINUTE', 'WEBSOCKET_CONNECTION_CONCURRENT', 'SCRIPT_RULE_CONCURRENCY', 'SCRIPT_RULE_EXECUTION_DAILY', 'SCRIPT_RULE_CPU_MILLIS_DAILY', 'NOTIFICATION_DELIVERY_DAILY']
  const rank = (code?: string) => { const index = order.indexOf(code || ''); return index < 0 ? order.length : index }
  const dimensions = [...(plan.quotaDimensions || [])].sort((a,b) => rank(a.code) - rank(b.code))
  const up = dimensions.find(q => q.code === 'UPLINK_MESSAGE_DAILY'), down = dimensions.find(q => q.code === 'DOWNLINK_MESSAGE_DAILY')
  const combined = up && down && up.unit === 'MESSAGE' && down.unit === 'MESSAGE' && up.window === 'UTC_DAY' && down.window === 'UTC_DAY'
  const units: Record<string, string> = { COUNT: '', DAY: '天', MONTH: '日历月', MESSAGE: '条', REQUEST: '次', CONNECTION: '个', EXECUTION: '次', MILLISECOND: '毫秒', DELIVERY: '次', MB: 'MiB', GB: 'GiB' }
  const windows: Record<string, string> = { NONE: '', ROLLING: '', UTC_DAY: '/UTC日', MINUTE: '/分钟', CONCURRENT: '（并发）' }
  return dimensions.flatMap(q => {
    if (combined && q.code === 'DOWNLINK_MESSAGE_DAILY') return []
    if (combined && q.code === 'UPLINK_MESSAGE_DAILY') return [`上行 ${numberText(up.value)} / 下行 ${numberText(down.value)} 条/日`]
    const unit = q.unit ? units[q.unit] ?? q.unit : ''
    const window = q.window ? windows[q.window] ?? q.window : ''
    return [`${quotaNames[q.code || ''] || q.code || '未提供额度名称'} ${numberText(q.value)}${unit ? ' ' + unit : ''}${window}`]
  })
}
export function proposedPlanFeatures(plan: typeof projectPlanPreviews[number]) {
  return [
    `业务历史逻辑池 ${plan.historyPool}`, `非消息业务出站 ${plan.outbound}/UTC月`,
    `对象成功逻辑写 ${numberText(plan.writes)} 次/UTC日`, `对象成功逻辑读 ${numberText(plan.reads)} 次/UTC日`,
    `单来源外发目标 ${plan.targets} 个`, `消息峰值 ${plan.peak} 单位/秒`, `突发桶 ${plan.burst} 单位`,
    '每份独立消息按 4 KiB 进位计量'
  ]
}
/** ADR0376 冻结的按量有限软件基线；不是附送套餐池，不代表已上线。 */
export const payAsYouGoEntitlements = [
  '自有项目最多 5 个', '设备最多 100 个', '终端用户最多 100 个', '看板最多 10 个', '外部协作者最多 5 人',
  '对象文件容量上限 5 GiB', '业务历史容量上限 10 GiB', '历史默认 7 天，最长 90 天',
  '消息峰值 10 单位/秒，突发桶 20 单位', '单来源外发目标最多 2 个',
  'API、规则、并发沿标准版有限保护', '基础规则、站内告警和普通管理不单独收费', '普通历史查询不另收 API 或行数费',
  '无固定月租；实时预占，每 5 分钟结算', '符合资格的新账户一次赠送 ¥10', '合计可用余额至少 ¥10 可新建，无创建费',
  '所有者共享钱包，赠款优先；最多 ¥1 信用', '短信、语音、平台代发邮件单独开通，仅用正充值余额'
] as const
