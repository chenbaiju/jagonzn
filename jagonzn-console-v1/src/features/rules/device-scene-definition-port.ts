import type {Schema} from '@/core/contracts'
import {cas} from './models'
import {definitionUuid} from './device-task-definition-port'
import type {DeviceSceneRunPort} from './device-scene-run-state'
/** 559真实持久范围的视图；不是项目候选或历史执行推导的关系。 */
export type DeviceSceneDefinition=Required<Omit<Schema<'SceneDeviceDefinition'>,'status'>>&{status:'ACTIVE'|'PAUSED'}
export type DeviceSceneFilters={status:''|'ACTIVE'|'PAUSED';name:string}
export type DeviceScenePage={items:DeviceSceneDefinition[];nextCursor?:string|null;hasMore:boolean}
export type DeviceSceneDefinitionPort=DeviceSceneRunPort&{
 read:(project:string,device:string,filters:DeviceSceneFilters,cursor:string|undefined,signal:AbortSignal)=>Promise<Schema<'CursorPageSceneDeviceDefinition'>>
}
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('设备场景返回不完整，请重新读取');return value as Record<string,unknown>}
export function deviceScenePage(value:unknown,device:string,cursors:readonly(string|undefined)[]):DeviceScenePage{
 const page=object(value)
 if(!Array.isArray(page.items)||page.items.length>24||typeof page.hasMore!=='boolean')throw new Error('设备场景页不完整，请重新读取')
 const seen=new Set<string>()
 const items=page.items.map(input=>{
  const row=object(input),scope=object(row.deviceScope)
  if(!definitionUuid(row.id)||seen.has(row.id.toLowerCase())||typeof row.name!=='string'||!row.name.trim()||!['ACTIVE','PAUSED'].includes(String(row.status))||!definitionUuid(row.activeVersionId)||typeof row.hasDeviceAction!=='boolean'||typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt)))throw new Error('设备场景身份或版本不完整，请重新读取')
  if(!['DEVICE','DEVICE_TYPE','LEGACY_PROJECT'].includes(String(scope.kind))||(scope.kind==='LEGACY_PROJECT'?scope.referenceId!=null:!definitionUuid(scope.referenceId))||scope.kind==='DEVICE'&&scope.referenceId!==device)throw new Error('设备场景范围与当前设备不匹配，请重新读取')
  cas(row.definitionVersion as number);cas(row.versionNumber as number);seen.add(row.id.toLowerCase())
  return row as DeviceSceneDefinition
 })
 const next=page.nextCursor
 if(next!=null&&(typeof next!=='string'||!next||next.length>8192||cursors.includes(next))||page.hasMore!==!!next||page.hasMore&&!items.length)throw new Error('设备场景分页没有形成推进，请刷新')
 return {items,nextCursor:next as string|null|undefined,hasMore:page.hasMore}
}
