import type {Schema} from '@/core/contracts'
import type {DirectoryDisplayFact} from './directory-display-facts'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const maximumVersion=9223372036854775807n
/** 外层未知与已请求但未设置的双null坐标分开；只复用正式坐标合同，不转换坐标系。 */
export function decodeDirectoryManualLocation(value:unknown):Readonly<Schema<'DeviceLocationPointResponse'>>|null{
 if(value===undefined||value===null)return null
 if(typeof value!=='object'||Array.isArray(value))throw new Error('目录手工坐标事实无效')
 const point=value as Record<string,unknown>,{longitude,latitude,version}=point
 const complete=Object.keys(point).length===3&&['longitude','latitude','version'].every(key=>Object.hasOwn(point,key))
 const validCoordinates=longitude===null&&latitude===null||typeof longitude==='number'&&typeof latitude==='number'&&Number.isFinite(longitude)&&Number.isFinite(latitude)&&longitude>=-180&&longitude<=180&&latitude>=-90&&latitude<=90
 if(!complete||!validCoordinates||typeof version!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(version)||BigInt(version)>maximumVersion)throw new Error('目录手工坐标或版本无效')
 return Object.freeze({longitude:longitude as number|null,latitude:latitude as number|null,version})
}
/** 按当前页身份及顺序生成完整只读投影；任何未请求行使整页保持不可用于定位。 */
export function directoryManualLocations(items:readonly Schema<'DeviceResponse'>[]|undefined,facts:Readonly<Record<string,DirectoryDisplayFact>>|undefined){
 if(!Array.isArray(items)||items.length>96||!facts||typeof facts!=='object'||Array.isArray(facts)||Object.keys(facts).length!==items.length)throw new Error('当前页手工坐标投影不完整')
 const seen=new Set<string>()
 return Object.freeze(items.map(item=>{
  const id=item?.id
  if(typeof id!=='string'||!uuid.test(id)||seen.has(id)||!Object.hasOwn(facts,id)||facts[id]?.deviceId!==id)throw new Error('当前页手工坐标身份不匹配')
  seen.add(id)
  const point=decodeDirectoryManualLocation(facts[id]!.manualLocationPoint)
  if(point===null)throw new Error('当前页手工坐标尚未请求，不能据此生成定位数据')
  return Object.freeze({deviceId:id,point})
 }))
}
