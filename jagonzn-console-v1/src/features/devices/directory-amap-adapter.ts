import type {DirectoryAmapPoint,CoordinatePair,DirectoryCoordinateConverter} from './directory-amap-coordinates'
import {directoryMapBounds,displayMapLongitude,type DirectoryBaseMap} from './directory-map'
type ObjectLike=Record<string,unknown>
const object=(v:unknown):v is ObjectLike=>(typeof v==='object'&&v!==null)||typeof v==='function'
function member(v:unknown,key:string):unknown{if(!object(v))throw new Error('地图接口无效。');return v[key]}
function call(v:unknown,key:string,...args:unknown[]):unknown{const fn=member(v,key);if(typeof fn!=='function')throw new Error('地图接口无效。');return Reflect.apply(fn,v,args)}
function construct(v:unknown,args:unknown[]):unknown{if(typeof v!=='function')throw new Error('地图构造器无效。');return Reflect.construct(v,args)}
function coordinate(v:unknown):CoordinatePair{
 const lng=typeof member(v,'getLng')==='function'?call(v,'getLng'):member(v,'lng'),lat=typeof member(v,'getLat')==='function'?call(v,'getLat'):member(v,'lat')
 if(typeof lng!=='number'||!Number.isFinite(lng)||Math.abs(lng)>180||typeof lat!=='number'||!Number.isFinite(lat)||Math.abs(lat)>90)throw new Error('地图转换坐标无效。')
 return [lng,lat]
}
/** 只在 iframe 内包住官方 SDK 的 unknown 返回；供应商从不接收平台令牌。 */
export function directoryAmapAdapter(sdk:unknown,container:HTMLElement,active:()=>boolean,onSelect:(id:string)=>void,onNavigate:(id:string)=>void){
 const street=call(sdk,'createDefaultLayer')
 const map=construct(member(sdk,'Map'),[container,{zoom:10,center:[116.307484,39.98412],viewMode:'2D',showLabel:true,resizeEnable:true,layers:[street]}])
 // 比例尺由唯一显式插件提供；缺少公开接口时释放已创建地图，不能静默丢控件。
 try{
  const scaleConstructor=member(sdk,'Scale'),addControl=member(map,'addControl')
  if(typeof scaleConstructor!=='function'||typeof addControl!=='function')throw new Error('比例尺接口无效。')
  call(map,'addControl',construct(scaleConstructor,[]))
 }catch{try{call(map,'destroy')}catch{}throw new Error('地图比例尺加载失败。')}
 let disposed=false,points:readonly DirectoryAmapPoint[]=[],markers:unknown[]=[],satellitePair:readonly unknown[]|undefined,selected='',popup:unknown|undefined
 const alive=()=>!disposed&&active()
 // SDK可重建弹层DOM；在本地图容器委托点击，避免克隆后丢失按钮监听器。
 function navigateFromPopup(event:MouseEvent){
  if(!alive()||!(event.target instanceof Element))return
  const button=event.target.closest<HTMLButtonElement>('button[data-directory-map-action="details"]')
  const id=button?.dataset.deviceId
  if(!button||!container.contains(button)||!id||id!==selected||!points.some(point=>point.deviceId===id))return
  event.preventDefault();event.stopPropagation();onNavigate(id)
 }
 container.addEventListener('click',navigateFromPopup,true)
 let tileSequence=0,cancelTile:(()=>void)|undefined
 const loaded=new Set<unknown>(),layerListeners=new Map<unknown,()=>void>()
 function observeLayer(layer:unknown){const callback=()=>{if(layerListeners.get(layer)===callback)loaded.add(layer)};layerListeners.set(layer,callback);call(layer,'on','complete',callback)}
 observeLayer(street)
 function unobserveLayer(layer:unknown){const listener=layerListeners.get(layer);if(listener){call(layer,'off','complete',listener);layerListeners.delete(layer)}loaded.delete(layer)}
 function removeSatellitePair(){
  const previous=satellitePair;satellitePair=undefined
  if(!previous)return
  try{call(map,'remove',previous)}finally{for(const layer of previous)unobserveLayer(layer)}
 }
 function baseMap(kind:DirectoryBaseMap):Promise<boolean>{
  if(!alive())return Promise.resolve(false)
  const current=++tileSequence;cancelTile?.();cancelTile=undefined
  removeSatellitePair()
  let layers:readonly unknown[]=[street]
  if(kind==='satellite'){
   // 两层属于同次激活；切回后不用旧图层，避免迟到完成混入新选择。
   const satellite=construct(member(member(sdk,'TileLayer'),'Satellite'),[])
   const roadNet=construct(member(member(sdk,'TileLayer'),'RoadNet'),[])
   satellitePair=[satellite,roadNet];layers=satellitePair
   for(const layer of layers)observeLayer(layer)
  }
  const currentPair=satellitePair
  return new Promise((resolve,reject)=>{
   let finished=false,timer:ReturnType<typeof setTimeout>|undefined
   const settle=(error?:Error)=>{
    if(finished)return;finished=true;clearTimeout(timer)
    for(const layer of layers)call(layer,'off','complete',complete)
    if(current===tileSequence)cancelTile=undefined
    if(error){try{if(kind==='satellite'&&satellitePair===currentPair)removeSatellitePair()}catch{}reject(error)}
    else resolve(alive()&&current===tileSequence)
   }
   // 街道与其它图层的完成不能代替卫星和路网的独立完成事实。
   const complete=()=>{if(layers.every(layer=>loaded.has(layer)))settle()}
   cancelTile=()=>settle();for(const layer of layers)call(layer,'on','complete',complete)
   timer=setTimeout(()=>settle(new Error('地图底图加载未完成。')),15000)
   try{if(kind==='satellite')call(map,'add',layers);complete()}catch{settle(new Error('地图底图加载失败。'))}
  })
 }
 const mapRows=()=>points.map(p=>({deviceId:p.deviceId,name:p.name,version:p.version,online:p.online,longitude:p.displayGcj02[0],latitude:p.displayGcj02[1]}))
 function position(point:DirectoryAmapPoint){const bounds=directoryMapBounds(mapRows());return construct(member(sdk,'LngLat'),[bounds?displayMapLongitude(point.displayGcj02[0],bounds.west):point.displayGcj02[0],point.displayGcj02[1],true])}
 const clear=()=>{if(markers.length)call(map,'remove',markers);markers=[];points=[];if(popup)call(popup,'close');popup=undefined;selected=''}
 const converter:DirectoryCoordinateConverter=input=>new Promise((resolve,reject)=>{
  if(!alive()){reject(new Error('地图上下文已失效。'));return}
  let done=false
  const finish=(error?:Error,result?:readonly CoordinatePair[])=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(result!)}
  const timer=setTimeout(()=>finish(new Error('地图坐标转换超时。')),8000)
  try{call(sdk,'convertFrom',input.map(p=>[p[0],p[1]]),'gps',(status:unknown,result:unknown)=>{
   if(!alive()){finish(new Error('地图上下文已失效。'));return}
   try{const locations=member(result,'locations');if(status!=='complete'||!Array.isArray(locations)||locations.length!==input.length)throw new Error('地图坐标转换失败。');finish(undefined,locations.map(coordinate))}catch{finish(new Error('地图坐标转换失败。'))}
  })}catch{finish(new Error('地图坐标转换失败。'))}
 })
 function select(id:string,focus=true){
  if(!alive())return
  const point=points.find(p=>p.deviceId===id);if(!point)return
  selected=id
  markers.forEach((marker,index)=>{const content=call(marker,'getContent');if(content instanceof HTMLElement){content.classList.toggle('is-selected',points[index]?.deviceId===id);content.setAttribute('aria-pressed',String(points[index]?.deviceId===id))}})
  if(focus){call(map,'setZoomAndCenter',13,position(point))}
  const content=document.createElement('div'),title=document.createElement('button'),status=document.createElement('div'),coordinates=document.createElement('div');content.className='devices-marker-card';title.className='mc-title';title.type='button';title.textContent=point.name;title.title=point.name;title.setAttribute('aria-label',`查看设备详情：${point.name}`);title.dataset.directoryMapAction='details';title.dataset.deviceId=id;status.className=`mc-status ${point.online?'is-online':'is-offline'}`;status.textContent=point.online?'在线':'离线';coordinates.className='mc-latlng';coordinates.textContent=`${point.sourceWgs84[1]}, ${point.sourceWgs84[0]}`;coordinates.title='WGS84 纬度, 经度';content.append(title);if(point.details?.deviceTypeName){const type=document.createElement('div');type.className='mc-type';type.textContent=point.details.deviceTypeName;type.title=point.details.deviceTypeName;content.append(type)}if(point.details?.lastDataReportAt){const activeTime=document.createElement('span');activeTime.className='mc-active';activeTime.textContent=new Date(point.details.lastDataReportAt).toLocaleString('zh-CN',{hour12:false});status.append(activeTime)}content.append(status,coordinates)
  if(popup)call(popup,'close');popup=construct(member(sdk,'InfoWindow'),[{content}]);call(popup,'open',map,position(point))
 }
 return {
  converter,
  render(next:readonly DirectoryAmapPoint[]){
   if(!alive())return
   clear();points=next
   try{for(const point of points){const content=document.createElement('button');content.type='button';content.className=`directory-map-marker ${point.online?'is-online':'is-offline'}`;content.title=point.name;content.setAttribute('aria-label',point.name);content.setAttribute('aria-pressed','false');content.append(document.createElement('span'));content.addEventListener('click',()=>{if(alive()){select(point.deviceId,false);onSelect(point.deviceId)}});const marker=construct(member(sdk,'Marker'),[{position:position(point),content,anchor:'center',title:point.name}]);markers.push(marker);call(marker,'setMap',map)}}catch{clear();throw new Error('地图点位显示失败。')}
  },
  select,clear,
  fit(deviceIds?:readonly string[]){if(alive()){const allRows=mapRows(),fittedRows=allRows.filter(row=>!deviceIds||deviceIds.includes(row.deviceId));if(deviceIds&&!fittedRows.length)return;let bounds=directoryMapBounds(fittedRows);const allBounds=directoryMapBounds(allRows);if(deviceIds&&bounds&&allBounds){const longitudes=fittedRows.map(row=>displayMapLongitude(row.longitude,allBounds.west));bounds={...bounds,west:Math.min(...longitudes),east:Math.max(...longitudes)}}if(bounds){if(bounds.west===bounds.east&&bounds.north===bounds.south)call(map,'setZoomAndCenter',13,construct(member(sdk,'LngLat'),[bounds.west,bounds.south,true]));else{const sw=construct(member(sdk,'LngLat'),[bounds.west,bounds.south,true]),ne=construct(member(sdk,'LngLat'),[bounds.east,bounds.north,true]);call(map,'setBounds',construct(member(sdk,'Bounds'),[sw,ne]),true,[100,100,100,100]);const zoom=call(map,'getZoom');if(typeof zoom==='number'&&zoom>13)call(map,'setZoom',13)}}else call(map,'setZoomAndCenter',10,[116.307484,39.98412])}},
  zoom(direction:'in'|'out'){if(alive())call(map,direction==='in'?'zoomIn':'zoomOut')},
  baseMap,
  resize(){if(alive()&&typeof member(map,'resize')==='function')call(map,'resize')},
  destroy(){if(disposed)return;tileSequence++;cancelTile?.();try{clear();removeSatellitePair();for(const [layer,listener] of layerListeners)call(layer,'off','complete',listener);layerListeners.clear();loaded.clear()}finally{disposed=true;container.removeEventListener('click',navigateFromPopup,true);call(map,'destroy')}}
 }
}
