import type {Schema} from '@/core/contracts'
import {decodeDirectoryManualLocation} from './directory-manual-location'
import {decodeLocationObservation} from './device-location-observation-api'
export type DirectoryDisplayFact=Schema<'DeviceDirectoryItemDetailsResponse'>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** 旧运行实例缺少整份投影时明确保持未知；存在的投影必须与本页身份及顺序完全相同。 */
export function directoryDisplayFacts(items:Schema<'DeviceResponse'>[]|undefined,values:unknown):Record<string,DirectoryDisplayFact>|undefined{
 if(values===undefined)return undefined
 if(!Array.isArray(items)||!Array.isArray(values)||items.length>96||items.length!==values.length)throw new Error('目录展示投影不完整')
 const result:Record<string,DirectoryDisplayFact>={}
 for(let index=0;index<items.length;index++){
  const item=items[index]!,value=values[index]
  const deviceKind=value?.deviceKind===undefined?null:value.deviceKind
  if(!item.id||!uuid.test(item.id)||result[item.id]||!value||typeof value!=='object'||value.deviceId!==item.id||typeof value.enabled!=='boolean'
   ||!(value.deviceTypeId===null||typeof value.deviceTypeId==='string'&&uuid.test(value.deviceTypeId))
   ||!(value.deviceTypeName===null||typeof value.deviceTypeName==='string'&&value.deviceTypeName.length>0)
   ||!(deviceKind===null||deviceKind==='DIRECT'||deviceKind==='GATEWAY'||deviceKind==='SUB_DEVICE')
   ||value.deviceTypeId===null&&deviceKind!==null
   ||value.deviceTypeId==null&&value.deviceTypeName!==null||!Array.isArray(value.staticGroups)
   ||!(value.lastDataReportAt===null||typeof value.lastDataReportAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value.lastDataReportAt)&&Number.isFinite(Date.parse(value.lastDataReportAt))))throw new Error('目录展示身份或事实无效')
  const seen=new Set<string>()
  for(const group of value.staticGroups){const ancestors=group?.ancestors;if(!group||!uuid.test(group.id)||seen.has(group.id)||typeof group.name!=='string'||!group.name||!(group.color===undefined||group.color===null||typeof group.color==='string'&&/^#[0-9a-f]{6}$/i.test(group.color))||!(ancestors===undefined||ancestors===null||Array.isArray(ancestors)&&ancestors.length<=16&&ancestors.every(name=>typeof name==='string'&&name.trim().length>0)))throw new Error('目录设备组投影无效');seen.add(group.id)}
  result[item.id]={...value,deviceKind,manualLocationPoint:decodeDirectoryManualLocation(value.manualLocationPoint),...(value.locationObservation===undefined?{}:{locationObservation:decodeLocationObservation(value.locationObservation)})}
 }
 return result
}
/** 组卡片路径由同快照父链和当前组名组成；旧运行实例缺父链时只显示组名。 */
export function staticGroupPath(group:{name?:string|null;ancestors?:string[]|null}):string{
 const name=group.name??''
 return group.ancestors?.length?[...group.ancestors,name].join('/'):name
}
