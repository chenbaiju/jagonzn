import {isStrictJsonNumber,parseCompositeValue,serializeRuntimeValue,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import type {Schema} from '@/core/contracts'
export type DeviceEventItem=Omit<Schema<'DeviceEventResponse'>,'params'>&{paramsText:string}
export type DeviceEventPage=Omit<Schema<'DeviceEventPageResponse'>,'items'>&{items:DeviceEventItem[]}
const fields = [
  'messageId',
  'deviceId',
  'deviceTypeId',
  'eventKey',
  'level',
  'thingModelVersionId',
  'modelVersion',
  'eligibility',
  'occurredAt',
  'receivedAt',
  'acceptedAt',
  'params',
  'paramsRedacted',
  'currentDefinitionName'
]
const encoder = new TextEncoder()
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function instant(value:unknown):value is string {
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value.slice(0,10)
}
function fail(): never {
  throw new Error('事件历史响应不符合只读合同。')
}
function object(value: StrictJsonValue): StrictJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isStrictJsonNumber(value))
    return fail()
  return value as StrictJsonObject
}
function closed(value: StrictJsonObject, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    fail()
}
function render(value: StrictJsonValue): string {
  if (isStrictJsonNumber(value)) return value.lexical
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(render).join(', ')}]`
  return `{\n${Object.entries(value)
    .map(([key, item]) => `  ${JSON.stringify(key)}: ${render(item)}`)
    .join(',\n')}\n}`
}
function row(value: StrictJsonObject, deviceId: string, messageId?: string): DeviceEventItem {
  closed(value, fields)
  for (const key of fields.filter((key) => !['params', 'paramsRedacted', 'currentDefinitionName'].includes(key)))
    if (typeof value[key] !== 'string' || value[key] === '') fail()
  if(value.currentDefinitionName!==null&&(typeof value.currentDefinitionName!=='string'||!value.currentDefinitionName.trim()||value.currentDefinitionName.length>128))fail()
  if (
    value.deviceId !== deviceId ||
    ['messageId','deviceId','deviceTypeId','thingModelVersionId'].some(key=>!uuid.test(value[key] as string)) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(value.eventKey as string) ||
    ['occurredAt','receivedAt','acceptedAt'].some(key=>!instant(value[key])) ||
    (messageId && value.messageId !== messageId) ||
    !['INFO', 'SUCCESS', 'WARNING', 'ERROR'].includes(value.level as string) ||
    !['CURRENT', 'HISTORY_ONLY'].includes(value.eligibility as string) ||
    typeof value.paramsRedacted !== 'boolean'
  )
    fail()
  const params = object(value.params!)
  if (Object.keys(params).length > 100) fail()
  const compact=Object.entries(params).map(([key,item])=>{
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(key))fail()
    let text:string
    if(typeof item==='string'){if(Array.from(item).length>4096||item.includes('\0'))fail();text=JSON.stringify(item)}
    else if(typeof item==='boolean')text=JSON.stringify(item)
    else if(isStrictJsonNumber(item))text=item.lexical
    else text=serializeRuntimeValue(parseCompositeValue(item,Array.isArray(item)?'LIST':'OBJECT'))
    return JSON.stringify(key)+':'+text
  })
  if(encoder.encode('{'+compact.join(',')+'}').length>65536)fail()
  const { params: _params, ...metadata } = value
  void _params
  return Object.freeze({ ...metadata, paramsText: render(params) }) as unknown as DeviceEventItem
}
export function decodeEvent(bytes: Uint8Array, deviceId: string, messageId?: string) {
  return row(parseDashboardRuntimeResponse(bytes), deviceId, messageId)
}
/** 仅分离顶层items原词法；结构、重复键、UTF8和数字仍交共享strict-json逐段复核。 */
function pageFrames(bytes: Uint8Array) {
  if (
    bytes.byteLength > 8 * 1024 * 1024 ||
    (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
  )
    fail()
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const skip = (start: number) => {
    while (/[ \n\r\t]/.test(text[start] ?? '') && start < text.length) start++
    return start
  }
  const endValue = (start: number) => {
    const brackets: string[] = []
    let quoted = false,
      escaped = false
    for (let index = start; index < text.length; index++) {
      const c = text[index]!
      if (quoted) {
        if (escaped) escaped = false
        else if (c === '\\') escaped = true
        else if (c === '"') quoted = false
        continue
      }
      if (c === '"') quoted = true
      else if (c === '{' || c === '[') {
        brackets.push(c)
        if (brackets.length > 16) fail()
      } else if (c === '}' || c === ']') {
        if (!brackets.length) return index
        const opening = brackets.pop()
        if ((c === '}' && opening !== '{') || (c === ']' && opening !== '[')) fail()
        if (!brackets.length) return index + 1
      } else if (c === ',' && !brackets.length) return index
    }
    return fail()
  }
  let index = skip(0)
  if (text[index++] !== '{') fail()
  let arrayStart = -1,
    arrayEnd = -1
  while (true) {
    index = skip(index)
    if (text[index] === '}') break
    if (text[index] !== '"') fail()
    let finish = index + 1,
      escaped = false
    for (; finish < text.length; finish++) {
      if (escaped) escaped = false
      else if (text[finish] === '\\') escaped = true
      else if (text[finish] === '"') break
    }
    const key: unknown = JSON.parse(text.slice(index, finish + 1)) // 只解码字段名，不解码参数数字。
    index = skip(finish + 1)
    if (text[index++] !== ':') fail()
    index = skip(index)
    const end = endValue(index)
    if (key === 'items') {
      if (arrayStart !== -1 || text[index] !== '[') fail()
      arrayStart = index
      arrayEnd = end
    }
    index = skip(end)
    if (text[index] === '}') break
    if (text[index++] !== ',') fail()
  }
  if (arrayStart < 0 || text[arrayEnd - 1] !== ']') fail()
  const metadata = parseDashboardRuntimeResponse(
    encoder.encode(text.slice(0, arrayStart) + '[]' + text.slice(arrayEnd))
  )
  const items: StrictJsonObject[] = []
  index = skip(arrayStart + 1)
  while (index < arrayEnd - 1) {
    const end = endValue(index)
    items.push(parseDashboardRuntimeResponse(encoder.encode(text.slice(index, end))))
    if (items.length > 100) fail()
    index = skip(end)
    if (text[index] === ']') break
    if (text[index++] !== ',') fail()
    index = skip(index)
    if (text[index] === ']') fail()
  }
  return { metadata, items }
}
export function decodeEventPage(bytes: Uint8Array, deviceId: string): DeviceEventPage {
  const { metadata, items } = pageFrames(bytes)
  closed(metadata, ['items', 'nextCursor', 'windowFrom', 'windowTo', 'retentionDays'])
  if (
    (metadata.nextCursor !== null &&
      (typeof metadata.nextCursor !== 'string' ||
        !/^[A-Za-z0-9_-]+$/.test(metadata.nextCursor) ||
        metadata.nextCursor.length > 8192)) ||
    !instant(metadata.windowFrom) ||
    !instant(metadata.windowTo) ||
    !isStrictJsonNumber(metadata.retentionDays!) ||
    metadata.retentionDays.lexical !== '90'
  )
    fail()
  const records=items.map((item)=>row(item,deviceId))
  if(new Set(records.map(item=>item.messageId)).size!==records.length || metadata.nextCursor!==null&&!records.length)fail()
  return {
    items: records,
    nextCursor: metadata.nextCursor,
    windowFrom: metadata.windowFrom,
    windowTo: metadata.windowTo,
    retentionDays: 90
  } as DeviceEventPage
}

export type DeviceEventNumberPage=Omit<Schema<'ConsoleDeviceEventNumberPageResponse'>,'items'>&{items:DeviceEventItem[]}
/** 独立页码原文投影复用同一词法帧与原事件解码，不能假造cursor末页。 */
export function decodeEventNumberPage(bytes:Uint8Array,deviceId:string,page:number,limit:number):DeviceEventNumberPage{
 const{metadata,items}=pageFrames(bytes)
 closed(metadata,['items','page','limit','windowFrom','windowTo','retentionDays'])
 if(!isStrictJsonNumber(metadata.page!)||metadata.page.lexical!==String(page)||!isStrictJsonNumber(metadata.limit!)||metadata.limit.lexical!==String(limit)||items.length>limit||!instant(metadata.windowFrom)||!instant(metadata.windowTo)||!isStrictJsonNumber(metadata.retentionDays!)||metadata.retentionDays.lexical!=='90')fail()
 const instantKey=(value:string)=>value.replace(/(?:\.(\d{1,9}))?Z$/,(_match,fraction:string='')=>'.'+fraction.padEnd(9,'0')+'Z')
 const lower=instantKey(metadata.windowFrom as string),upper=instantKey(metadata.windowTo as string)
 if(lower>upper)fail()
 const records=items.map(item=>row(item,deviceId))
 if(new Set(records.map(item=>item.messageId)).size!==records.length||records.some(item=>instantKey(item.occurredAt!)<lower||instantKey(item.occurredAt!)>=upper))fail()
 return{items:records,page,limit,windowFrom:metadata.windowFrom as string,windowTo:metadata.windowTo as string,retentionDays:90}
}
