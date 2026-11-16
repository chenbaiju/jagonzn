import {canPlaceMapPoint,mercatorLatitudeLimit,type DirectoryMapRow,type DirectoryMapDetails} from './directory-map'

export type CoordinatePair=readonly [longitude:number,latitude:number]
declare const wgs84:unique symbol
declare const gcj02:unique symbol
export type Wgs84Pair=CoordinatePair&{readonly [wgs84]:true}
export type Gcj02Pair=CoordinatePair&{readonly [gcj02]:true}
/** 供应商只接收坐标，不接收设备名称、标识、位置版本或平台令牌。 */
export type DirectoryCoordinateConverter=(points:readonly Wgs84Pair[])=>Promise<readonly CoordinatePair[]>
export type DirectoryAmapPoint=Readonly<{
 deviceId:string;name:string;version:string|null;online:boolean;details?:DirectoryMapDetails
 sourceWgs84:Wgs84Pair
 displayGcj02:Gcj02Pair
}>
const batchSize=40,pageLimit=96
function validPair(longitude:unknown,latitude:unknown):boolean{
 return typeof longitude==='number'&&Number.isFinite(longitude)&&Math.abs(longitude)<=180&&typeof latitude==='number'&&Number.isFinite(latitude)&&Math.abs(latitude)<=90
}
/**
 * 仅转换当前页的可绘制副本；任何失败均不返回部分点，失效后不再发下一批。
 * active 由账号、项目、查询代次及组件生存期共同决定；不修改原始位置。
 */
export async function convertDirectoryAmapPoints(rows:readonly DirectoryMapRow[],convert:DirectoryCoordinateConverter,active:()=>boolean):Promise<readonly DirectoryAmapPoint[]|null>{
 if(!active())return null
 if(rows.length>pageLimit)throw new Error('目录地图超出当前页上限。')
 const ids=new Set<string>()
 const snapshot=rows.map(row=>{
  if(!row.deviceId||ids.has(row.deviceId))throw new Error('目录地图设备身份重复或缺失。')
  ids.add(row.deviceId)
  if((row.longitude===null)!==(row.latitude===null)||row.longitude!==null&&!validPair(row.longitude,row.latitude))throw new Error('目录地图原始坐标无效。')
  return Object.freeze({...row})
 }).filter(canPlaceMapPoint).map(row=>{
  if(typeof row.version!=='string'&&!(row.version===null&&row.locationSource==='REPORTED_PROPERTY'))throw new Error('目录地图有效坐标缺少原位置版本。')
  return Object.freeze({...row,version:row.version})
 })
 const result:DirectoryAmapPoint[]=[]
 for(let offset=0;offset<snapshot.length;offset+=batchSize){
  if(!active())return null
  const batch=snapshot.slice(offset,offset+batchSize)
  const pairs=Object.freeze(batch.map(row=>Object.freeze([row.longitude!,row.latitude!] as const) as Wgs84Pair))
  let converted:readonly CoordinatePair[]
  try{converted=await convert(pairs)}catch(cause){if(!active())return null;throw cause}
  if(!active())return null
  if(!Array.isArray(converted)||converted.length!==batch.length||converted.some(point=>!Array.isArray(point)||point.length!==2||!validPair(point[0],point[1])||Math.abs(point[1])>mercatorLatitudeLimit))throw new Error('地图坐标转换结果不完整或无效。')
  batch.forEach((row,index)=>result.push(Object.freeze({deviceId:row.deviceId,name:row.name,version:row.version,online:row.online,...(row.details?{details:Object.freeze({...row.details})}:{}),sourceWgs84:pairs[index]!,displayGcj02:Object.freeze([converted[index]![0],converted[index]![1]] as const) as Gcj02Pair})))
 }
 return active()?Object.freeze(result):null
}
