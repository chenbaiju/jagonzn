import {readAlarmRuleSourceChoices} from '@/features/alarms/alarm-rule-source-choices-api'
import {coordinatePropertyKey,coordinateRuleSource} from './coordinate-transform-draft'
import {deviceSourceMembers,type RuleDeviceSourceContract} from './rule-source-api'
import type {RuleSourceInput} from './rule-source-selection'

/** 页面原生配置草稿；不代替正式HTTP Schema或几何值校验。 */
export type GeofenceKind='POINT_IN_CIRCLE'|'POINT_IN_POLYGON'
export type CircleGeofenceDraft={point:string;circle:string;result:string}
export type PolygonGeofenceDraft={point:string;polygon:string;result:string}
export type GeofenceDraft=CircleGeofenceDraft|PolygonGeofenceDraft
export type GeofencePropertyChoices={points:readonly string[];circles:readonly string[];polygons:readonly string[];results:readonly string[]}
export function geofenceDraft(kind:GeofenceKind,value:GeofenceDraft):GeofenceDraft{
 const fence=kind==='POINT_IN_CIRCLE'?'circle':'polygon',keys=['point',fence,'result']
 if(!['POINT_IN_CIRCLE','POINT_IN_POLYGON'].includes(kind)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw new Error('电子围栏配置不完整')
 const part=value as unknown as Record<string,unknown>
 if(keys.some(key=>typeof part[key]!=='string'||!coordinatePropertyKey.test(part[key] as string)))throw new Error('属性标识符须为1至32位英文字母、数字、下划线或短横线')
 return kind==='POINT_IN_CIRCLE'?{point:value.point,circle:part.circle as string,result:value.result}:{point:value.point,polygon:part.polygon as string,result:value.result}
}
/** 全部明确来源的声明属性交集；SWITCH不等价于已确认Boolean编码。 */
export async function readRuleGeofenceProperties(project:string,source:RuleSourceInput|RuleDeviceSourceContract,signal:AbortSignal):Promise<GeofencePropertyChoices>{
 const current=coordinateRuleSource(source),ids=deviceSourceMembers(current)
 const choices=await readAlarmRuleSourceChoices(project,{kind:current.kind==='DEVICE'?'DEVICE':'DEVICE_TYPE',ids},signal);signal.throwIfAborted()
 const keys=(type:string)=>Object.freeze(choices.properties.filter(value=>value.dataType===type&&coordinatePropertyKey.test(value.key)).map(value=>value.key).sort())
 const objects=keys('OBJECT')
 return {points:objects,circles:objects,polygons:keys('LIST'),results:keys('SWITCH')}
}
