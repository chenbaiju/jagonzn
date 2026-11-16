import {dailyTimerValue,dailyTimerListValue,dailyTimerRangeValue,dailyTimerRangeListValue,dailyTimerDurationValue,dailyTimerDurationListValue,dailyTimerIntervalValue,dailyTimerIntervalListValue} from './daily-timer-value'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import type {Schema} from '@/core/contracts'
import {switchState} from './switch-value'
export type PropertyHistoryItem=Omit<Schema<'PropertyPointResponse'>,'value'>&{valueText:string}
export type PropertyHistoryPage={items:PropertyHistoryItem[];nextCursor?:string;hasMore:boolean}
function fail(): never {
  throw new Error('原始属性历史响应不符合合同。')
}
function object(value: StrictJsonValue): StrictJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isStrictJsonNumber(value))
    return fail()
  return value as StrictJsonObject
}
/** 值只作为文本展示，不经过 Number 或 JSON.parse 损失整数和小数词法。 */
export function propertyValueText(value: StrictJsonValue): string {
  if (isStrictJsonNumber(value)) return value.lexical
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(propertyValueText).join(', ')}]`
  return `{${Object.entries(value)
    .map(([key, item]) => `${JSON.stringify(key)}: ${propertyValueText(item)}`)
    .join(', ')}}`
}
export function decodePropertyPage(bytes: Uint8Array, deviceId: string): PropertyHistoryPage {
  const page = parseDashboardRuntimeResponse(bytes)
  if (
    Object.keys(page).length !== 3 ||
    !Array.isArray(page.items) ||
    page.items.length > 20 ||
    typeof page.hasMore !== 'boolean' ||
    (page.nextCursor !== null &&
      (typeof page.nextCursor !== 'string' || !page.nextCursor || page.nextCursor.length > 8192)) ||
    page.hasMore !== (typeof page.nextCursor === 'string')
  )
    fail()
  const fields = [
    'deviceId',
    'propertyKey',
    'ts',
    'value',
    'dataType',
    'thingModelVersionId',
    'modelVersion',
    'quality'
  ]
  const items = page.items.map((raw) => {
    const item = object(raw)
    const encoded=Object.hasOwn(item,'switchEncoding')
    if (
      Object.keys(item).length !== fields.length+(encoded?1:0) ||
      fields.some((key) => !Object.hasOwn(item, key)) ||
      item.deviceId !== deviceId ||
      encoded&&(item.dataType!=='SWITCH'||item.switchEncoding!=='NUMBER'&&item.switchEncoding!=='TEXT')
    )
      fail()
    for (const field of ['propertyKey', 'ts', 'dataType', 'modelVersion'])
      if (typeof item[field] !== 'string' || !item[field]) fail()
    if (item.thingModelVersionId !== null && typeof item.thingModelVersionId !== 'string') fail()
    const value = item.value!
    if (
      (item.dataType === 'NUMBER' && !isStrictJsonNumber(value)) ||
      (['TEXT', 'ENUM'].includes(item.dataType as string) && typeof value !== 'string') ||
      (item.dataType === 'SWITCH' && switchState(value,item.switchEncoding==='NUMBER'?'NUMBER':item.switchEncoding==='TEXT'?'TEXT':'BOOLEAN')===undefined) ||
      (item.dataType === 'OBJECT' &&
        (!value ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          isStrictJsonNumber(value))) ||
      (item.dataType === 'LIST' && !Array.isArray(value)) ||
      (item.dataType === 'DAILY_TIMER' && !dailyTimerValue(value)) ||
      (item.dataType === 'DAILY_TIMER_LIST' && !dailyTimerListValue(value)) ||
      (item.dataType === 'DAILY_TIMER_RANGE' && !dailyTimerRangeValue(value)) ||
      (item.dataType === 'DAILY_TIMER_RANGE_LIST' && !dailyTimerRangeListValue(value)) ||
      (item.dataType === 'DAILY_TIMER_DURATION' && !dailyTimerDurationValue(value)) ||
      (item.dataType === 'DAILY_TIMER_DURATION_LIST' && !dailyTimerDurationListValue(value)) ||
      (item.dataType === 'DAILY_TIMER_INTERVAL' && !dailyTimerIntervalValue(value)) ||
      (item.dataType === 'DAILY_TIMER_INTERVAL_LIST' && !dailyTimerIntervalListValue(value)) ||
      !['NUMBER', 'TEXT', 'ENUM', 'SWITCH', 'OBJECT', 'LIST', 'DAILY_TIMER', 'DAILY_TIMER_LIST', 'DAILY_TIMER_RANGE', 'DAILY_TIMER_RANGE_LIST', 'DAILY_TIMER_DURATION', 'DAILY_TIMER_DURATION_LIST', 'DAILY_TIMER_INTERVAL', 'DAILY_TIMER_INTERVAL_LIST'].includes(item.dataType as string) ||
      !isStrictJsonNumber(item.quality!) ||
      !/^-?(0|[1-9][0-9]*)$/.test(item.quality.lexical)
    )
      fail()
    const quality = Number(item.quality.lexical)
    if (!Number.isInteger(quality) || quality < -32768 || quality > 32767) fail()
    return {
      deviceId,
      propertyKey: item.propertyKey,
      ts: item.ts,
      dataType: item.dataType,
      thingModelVersionId: item.thingModelVersionId,
      modelVersion: item.modelVersion,
      quality,
      ...(encoded?{switchEncoding:item.switchEncoding}:{}),
      valueText: propertyValueText(value)
    } as PropertyHistoryItem
  })
  return { items, nextCursor: page.nextCursor || undefined, hasMore: page.hasMore }
}
