import { AlarmRuleJsonNumber, parseAlarmRuleJson, stringifyAlarmRuleJson, type AlarmRuleJson } from './alarm-rule-json'
import { formatTime } from '../../core/time'

/** 仅供卡片与导出的冻结显示模型；正式wire类型由唯一生成合同接入，此处不声明第二份DTO。 */
export type AlarmTriggerValueDisplay = Readonly<{
  key: string; dataType: string | null; known: boolean; value: string; truncated: boolean;
  acceptedAt: string | null; timeBasis: 'ALARM_INTAKE' | 'PLATFORM_ACCEPTED' | 'UNKNOWN'; line: string
}>
export type AlarmTriggerValuesDisplay = Readonly<{
  totalProperties: number; items: readonly AlarmTriggerValueDisplay[]; truncated: boolean;
  omittedProperties: number; lines: readonly string[]; notices: readonly string[]; text: string
}>
const types = ['NUMBER','TEXT','SWITCH','ENUM','LIST','OBJECT']
const bases = ['ALARM_INTAKE','PLATFORM_ACCEPTED','UNKNOWN']
const invalid = () => new Error('告警触发值摘要不完整')
const bytes = (value: string) => new TextEncoder().encode(value).byteLength

function closed(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![null,Object.prototype].includes(Object.getPrototypeOf(value))) throw invalid()
  const keys = Reflect.ownKeys(value)
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key)
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)!,'value'))) throw invalid()
  return value as Record<string, unknown>
}
function rows(value: unknown): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > 8
    || Reflect.ownKeys(value).length !== value.length + 1) throw invalid()
  for (let i=0;i<value.length;i++) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value,i) ?? {},'value')) throw invalid()
  return value
}
function time(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw invalid()
  const found = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value)
  if (!found || !Number.isFinite(Date.parse(value))) throw invalid()
  const year=Number(found[1]),month=Number(found[2]),day=Number(found[3])
  const leap=year%4===0&&(year%100!==0||year%400===0)
  if (day > [31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1]!) throw invalid()
  return value
}
function matches(type: string, value: AlarmRuleJson): boolean {
  switch (type) {
    case 'NUMBER': return value instanceof AlarmRuleJsonNumber
    case 'TEXT': case 'ENUM': return typeof value === 'string'
    case 'SWITCH': return typeof value === 'boolean'
    case 'LIST': return Array.isArray(value)
    case 'OBJECT': return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof AlarmRuleJsonNumber)
    default: return false
  }
}
/** 片段容器从1层计数，与服务端16层完整JSON合同一致；共享规则parser的20层预算保持不变。 */
function fragmentDepth(value: AlarmRuleJson, depth=0): void {
  if (value===null || typeof value!=='object' || value instanceof AlarmRuleJsonNumber) return
  if (depth>=16) throw invalid()
  for (const child of Object.values(value)) fragmentDepth(child,depth+1)
}

/** 严格消费单事件有界摘要并生成纯文本；不读当前模型、不补单位/名称、不请求详情或重建历史。 */
export function alarmTriggerValuesDisplay(value: unknown, alarmType?: string): AlarmTriggerValuesDisplay {
  const root=closed(value,['totalProperties','items','truncated']),source=rows(root.items)
  if (!Number.isSafeInteger(root.totalProperties) || (root.totalProperties as number)<1 || (root.totalProperties as number)>200
    || source.length>(root.totalProperties as number) || typeof root.truncated!=='boolean') throw invalid()
  let previous=''
  const wireItems: Record<string,unknown>[]=[],items=source.map((value): AlarmTriggerValueDisplay => {
    const row=closed(value,['key','dataType','known','valueJson','truncated','acceptedAt','timeBasis'])
    if (typeof row.key!=='string' || !/^[A-Za-z0-9_-]{1,64}$/.test(row.key) || row.key<=previous
      || row.dataType!==null && (typeof row.dataType!=='string' || !types.includes(row.dataType))
      || typeof row.known!=='boolean' || typeof row.truncated!=='boolean'
      || typeof row.timeBasis!=='string' || !bases.includes(row.timeBasis)) throw invalid()
    previous=row.key
    const acceptedAt=time(row.acceptedAt)
    if (!row.known && (row.valueJson!==null || row.truncated || acceptedAt!==null || row.timeBasis!=='UNKNOWN')
      || row.known && (row.dataType===null || (acceptedAt===null)!==(row.timeBasis==='UNKNOWN'))) throw invalid()
    let display='未知'
    if (row.known) {
      if (row.truncated) { if (row.valueJson!==null) throw invalid(); display='内容较长' }
      else {
        if (typeof row.valueJson!=='string' || bytes(row.valueJson)>256) throw invalid()
        const exact=parseAlarmRuleJson(row.valueJson)
        fragmentDepth(exact)
        if (!matches(row.dataType as string,exact)) throw invalid()
        display=typeof exact==='string' ? exact===''?'""':exact : stringifyAlarmRuleJson(exact)
      }
    }
    const basis=row.timeBasis as AlarmTriggerValueDisplay['timeBasis']
    const age=acceptedAt===null?'平台接纳时间未知':`${basis==='ALARM_INTAKE'?'告警平台接纳时间':'平台属性接纳时间'}：${formatTime(acceptedAt)}`
    const line=`${row.key}：${display}${alarmType==='INACTIVITY'?`（${age}）`:''}`
    wireItems.push({key:row.key,dataType:row.dataType,known:row.known,valueJson:row.valueJson,truncated:row.truncated,acceptedAt,timeBasis:basis})
    return Object.freeze({key:row.key,dataType:row.dataType as string|null,known:row.known,value:display,
      truncated:row.truncated,acceptedAt,timeBasis:basis,line})
  })
  const total=root.totalProperties as number,omitted=total-items.length,hasLong=items.some(item=>item.truncated)
  if (root.truncated !== (omitted>0 || hasLong)
    || bytes(JSON.stringify({totalProperties:total,items:wireItems,truncated:root.truncated}))>8*1024) throw invalid()
  const lines=Object.freeze(items.map(item=>item.line)),notices=Object.freeze([
    ...(omitted>0?[`另${omitted}个属性未显示`]:[]),...(hasLong?['内容较长，查看详情']:[])
  ])
  return Object.freeze({totalProperties:total,items:Object.freeze(items),truncated:root.truncated,
    omittedProperties:omitted,lines,notices,text:[...lines,...notices].join('\n')})
}
