import type {Schema} from '@/core/contracts'
import type {DirectoryDisplayFact} from './directory-display-facts'
import {directoryManualLocations} from './directory-manual-location'
import {decodeLocationObservation,type LocationObservation} from './device-location-observation-api'

export type DirectoryMapDetails=Readonly<{deviceTypeName:string|null;lastDataReportAt:string|null}>
export type DirectoryMapRow=Readonly<{deviceId:string;name:string;longitude:number|null;latitude:number|null;version:string|null;online:boolean;locationSource?:LocationObservation['source'];details?:DirectoryMapDetails}>
export type DirectoryMapProvider=Readonly<{id:'OSM_STANDARD';tileUrl:string;attribution:string}>
export const osmTileUrl='https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const mercatorLatitudeLimit=85.0511287798066
/** 默认无供应商；显式配置仍只允许已审的无查询参数标准HTTPS瓦片模板。 */
export function directoryMapProvider(env:Record<string,unknown>):DirectoryMapProvider|null{
 const id=env.VITE_DEVICE_MAP_PROVIDER,url=env.VITE_DEVICE_MAP_TILE_URL
 if((id===undefined||id==='')&&(url===undefined||url===''))return null
 if(id!=='OSM_STANDARD'||url!==osmTileUrl)throw new Error('地图底图配置无效，请核对已允许的供应商和HTTPS瓦片地址。')
 return Object.freeze({id,tileUrl:osmTileUrl,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'})
}
/** 当前页人工点保持完整身份、顺序和大版本；空点不伪造为零坐标。 */
export function directoryMapRows(items:readonly Schema<'DeviceResponse'>[]|undefined,facts:Readonly<Record<string,DirectoryDisplayFact>>|undefined):readonly DirectoryMapRow[]{
 const locations=directoryManualLocations(items,facts)
 return Object.freeze(locations.map(({deviceId,point},index)=>Object.freeze({deviceId,name:items![index]!.name||'未命名设备',...point,online:items![index]!.status==='ONLINE'&&facts![deviceId]!.enabled===true})))
}
/** 新消费者只使用显式同页有效点观察；缺失不得回退旧人工坐标绕过关闭策略。 */
export function directoryEffectiveMapRows(items:readonly Schema<'DeviceResponse'>[]|undefined,facts:Readonly<Record<string,DirectoryDisplayFact>>|undefined):readonly DirectoryMapRow[]{
 if(!Array.isArray(items)||items.length>96||!facts||Object.keys(facts).length!==items.length)throw new Error('当前页有效位置投影不完整')
 const seen=new Set<string>()
 return Object.freeze(items.map(item=>{
  const id=item.id
  if(typeof id!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)||seen.has(id)||facts[id]?.deviceId!==id)throw new Error('当前页有效位置身份不匹配')
  seen.add(id);const observed=decodeLocationObservation(facts[id]!.locationObservation)
  return Object.freeze({deviceId:id,name:item.name||'未命名设备',longitude:observed.longitude,latitude:observed.latitude,version:observed.manualVersion,locationSource:observed.source,online:item.status==='ONLINE'&&facts[id]!.enabled===true,details:Object.freeze({deviceTypeName:facts[id]!.deviceTypeName??null,lastDataReportAt:facts[id]!.lastDataReportAt??null})})
 }))
}
export function canPlaceMapPoint(row:DirectoryMapRow):boolean{return row.longitude!==null&&row.latitude!==null&&Math.abs(row.latitude)<=mercatorLatitudeLimit}
/** 以最大经度空隙为界，跨日期变更线的本页点不会错误包围整个地球。 */
export function directoryMapBounds(rows:readonly DirectoryMapRow[]):Readonly<{south:number;north:number;west:number;east:number}>|null{
 const points=rows.filter(canPlaceMapPoint)
 if(!points.length)return null
 const longitudes=points.map(p=>(p.longitude!+360)%360).sort((a,b)=>a-b)
 let largest=-1,start=0
 for(let i=0;i<longitudes.length;i++){const next=i===longitudes.length-1?longitudes[0]!+360:longitudes[i+1]!,gap=next-longitudes[i]!;if(gap>largest){largest=gap;start=(i+1)%longitudes.length}}
 const first=longitudes[start]!,west=first>180?first-360:first
 return Object.freeze({south:Math.min(...points.map(p=>p.latitude!)),north:Math.max(...points.map(p=>p.latitude!)),west,east:west+360-largest})
}
export function displayMapLongitude(longitude:number,west:number){let value=longitude;while(value<west)value+=360;while(value>west+360)value-=360;return value}

export type DirectoryBaseMap='vector'|'satellite'
export type DirectoryBaseMapLayer=Readonly<{tileUrl:string;attribution:string;tileSize:number;zoomOffset:number;minZoom:number;maxZoom:number}>
export type DirectoryBaseMapProvider=Readonly<{id:'OSM_STANDARD'|'MAPTILER_RASTER';layers:Readonly<Partial<Record<DirectoryBaseMap,DirectoryBaseMapLayer>>>}>
const mapTilerAttribution='<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer"><img src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler" referrerpolicy="origin" style="height:16px;vertical-align:middle"/> &copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>'
/** 目录独立配置街道/卫星栅格底图；不改变位置编辑器的既有OSM合同或持久WGS84坐标。 */
export function directoryBaseMapProvider(env:Record<string,unknown>):DirectoryBaseMapProvider|null{
 const id=env.VITE_DEVICE_DIRECTORY_MAP_PROVIDER,key=env.VITE_DEVICE_DIRECTORY_MAP_KEY
 if((id===undefined||id==='')&&(key===undefined||key==='')){
  const legacy=directoryMapProvider(env)
  return legacy?Object.freeze({id:legacy.id,layers:Object.freeze({vector:Object.freeze({tileUrl:legacy.tileUrl,attribution:legacy.attribution,tileSize:256,zoomOffset:0,minZoom:0,maxZoom:19})})}):null
 }
 if(id!=='MAPTILER_RASTER'||typeof key!=='string'||key.length===0||key.length>256||/[\s\u0000-\u001f\u007f]/u.test(key))throw new Error('目录地图底图配置无效，请核对供应商与公开密钥。')
 let encoded:string
 try{encoded=encodeURIComponent(key)}catch{throw new Error('目录地图底图配置无效，请核对供应商与公开密钥。')}
 // 19沿当前目录应用缩放边界，不代表供应商对各地区和级别的影像覆盖承诺。
 const layer=(mapId:'streets-v4'|'satellite-v4'):DirectoryBaseMapLayer=>Object.freeze({tileUrl:`https://api.maptiler.com/maps/${mapId}/{z}/{x}/{y}.png?key=${encoded}`,attribution:mapTilerAttribution,tileSize:512,zoomOffset:-1,minZoom:1,maxZoom:19})
 return Object.freeze({id,layers:Object.freeze({vector:layer('streets-v4'),satellite:layer('satellite-v4')})})
}
