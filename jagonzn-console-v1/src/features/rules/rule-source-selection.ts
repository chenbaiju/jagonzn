import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
/** 页面选择草稿；HTTP来源字段必须经正式Schema编解码。 */
export type RuleSourceKind=Extract<NonNullable<Schema<'RuleDeviceSource'>['kind']>,'DEVICE'|'DEVICE_TYPE'>
export type RuleSourceMember={referenceId:string;name:string}
export type RuleSourceSelection={kind:RuleSourceKind;members:readonly RuleSourceMember[]}
export type RuleSourceInput=RuleSourceSelection|{kind:RuleSourceKind;referenceId:string;name:string}
/** 既有组件的单来源页面草稿兼容，不是HTTP集合的首项降级。 */
export function sourceSelectionInput(value:RuleSourceInput):RuleSourceSelection{return 'members' in value?value:{kind:value.kind,members:[{referenceId:value.referenceId,name:value.name}]}}
export function sourceIds(value:RuleSourceSelection):string[]{
 if(!value||!['DEVICE','DEVICE_TYPE'].includes(value.kind)||!Array.isArray(value.members)||!value.members.length||value.members.length>(value.kind==='DEVICE'?64:1))throw new Error('请选择合法设备来源，设备最多64个，设备类型只能选择1个')
 const ids=value.members.map(row=>{if(!row||!definitionUuid(row.referenceId))throw new Error('设备来源标识不完整');return row.referenceId.toLowerCase()})
 if(new Set(ids).size!==ids.length)throw new Error('设备来源不能重复')
 return ids.sort()
}
export function sourceSelectionKey(value:RuleSourceSelection):string{return value.kind+':'+sourceIds(value).join(',')}
export function sourceNames(value:RuleSourceSelection):string{return value.members.map(row=>row.name).join('、')}
/** 只供确实单来源的TYPE DATA及旧嵌套端口使用，多设备不得取首项。 */
export function singleSource(value:RuleSourceSelection):RuleSourceMember{sourceIds(value);if(value.members.length!==1)throw new Error('此能力要求单一来源');return value.members[0]!}
