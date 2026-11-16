import {api} from '../../core/http'
import type {Schema} from '../../core/contracts'
import type {AlarmRuleEditorChoice} from './alarm-rule-editor-draft'
export type AlarmRuleChoiceCatalogKind='DEVICE'|'DEVICE_TYPE'|'GROUP'|'APPLICATION'
/** 仅表单展示分页，不是第二份HTTP DTO；不声称首个目录页是完整选项。 */
export type AlarmRuleChoicePage={items:AlarmRuleEditorChoice[];nextCursor:string|null}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const fail=()=>new Error('规则选项分页资料不完整，请重新读取')
const pageLimit=(kind:AlarmRuleChoiceCatalogKind)=>kind==='GROUP'?100:200
function identity(value:unknown):string{if(typeof value!=='string'||!uuid.test(value))throw fail();return value}
function wellFormed(value:string){return new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(value))===value}
function label(value:unknown):string{if(typeof value!=='string'||!value.trim()||[...value].length>128||value.includes('\0')||!wellFormed(value))throw fail();return value}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw fail();return value as Record<string,unknown>}
export function alarmRuleChoicePage(value:unknown,kind:AlarmRuleChoiceCatalogKind,project:string,cursor?:string,keyword=''):AlarmRuleChoicePage{
 identity(project);if(!['DEVICE','DEVICE_TYPE','GROUP','APPLICATION'].includes(kind))throw fail();const row=record(value)
 if(!Array.isArray(row.items)||row.items.length>pageLimit(kind)||typeof row.hasMore!=='boolean')throw fail()
 const next=row.nextCursor
 if(row.hasMore?(typeof next!=='string'||!next.length||next.length>4096||next===cursor):next!==null)throw fail()
 const seen=new Set<string>(),items=row.items.map(item=>{const recordValue=record(item),id=identity(recordValue.id);if(seen.has(id)||kind==='DEVICE_TYPE'&&recordValue.projectId!==project)throw fail();seen.add(id);return {id,label:label(kind==='APPLICATION'?recordValue.managementName:recordValue.name)}})
 // 只有设备接口支持服务端keyword。其它目录保留真实分页，通过显式上一/下一页继续查找。
 const query=keyword.trim().toLocaleLowerCase()
 return {items:query&&kind!=='DEVICE'?items.filter(item=>item.label.toLocaleLowerCase().includes(query)):items,nextCursor:row.hasMore?next as string:null}
}
/** 每次仅一页，通知组至多100项、其它目录200项；设备走真实keyword，其它不捏造服务端搜索或总数。 */
export async function readAlarmRuleChoicePage(project:string,kind:AlarmRuleChoiceCatalogKind,keyword:string,cursor:string|undefined,signal:AbortSignal):Promise<AlarmRuleChoicePage>{
 identity(project);if(!['DEVICE','DEVICE_TYPE','GROUP','APPLICATION'].includes(kind))throw fail()
 if(keyword.length>128||keyword.includes('\0')||!wellFormed(keyword)||cursor!==undefined&&(!cursor.length||cursor.length>4096))throw fail()
 const base=`/api/v1/projects/${encodeURIComponent(project)}` as const
 const options={query:{cursor,limit:pageLimit(kind)},signal},value=kind==='DEVICE'?await api<Schema<'CursorPageDeviceResponse'>>(`${base}/devices/search`,{...options,query:{...options.query,keyword:keyword.trim()}})
  :kind==='DEVICE_TYPE'?await api<Schema<'CursorPageDeviceTypeResponse'>>(`${base}/device-types/search`,options)
  :kind==='GROUP'?await api<Schema<'CursorPageAlarmNotificationGroupResponse'>>(`${base}/alarm-notification-groups`,options)
  :await api<Schema<'CursorPageApplicationCatalogResponse'>>(`${base}/applications`,options)
 return alarmRuleChoicePage(value,kind,project,cursor,keyword)
}
