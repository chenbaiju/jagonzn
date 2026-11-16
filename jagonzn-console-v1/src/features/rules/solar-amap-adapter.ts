import {validPickerPoint,type PickerPoint} from '../devices/directory-amap-protocol'
import {solarLocationName} from './task-solar-fields'
type RecordValue=Record<string,unknown>
const record=(v:unknown):v is RecordValue=>typeof v==='object'&&v!==null
function member(v:unknown,key:string):unknown{if(!record(v))throw new Error('地图接口无效');return v[key]}
function call(v:unknown,key:string,...args:unknown[]):unknown{const fn=member(v,key);if(typeof fn!=='function')throw new Error('地图接口无效');return Reflect.apply(fn,v,args)}
function construct(v:unknown,args:unknown[]):unknown{if(typeof v!=='function')throw new Error('地图接口无效');return Reflect.construct(v,args)}
function point(v:unknown):PickerPoint{
 const longitude=typeof member(v,'getLng')==='function'?call(v,'getLng'):member(v,'lng'),latitude=typeof member(v,'getLat')==='function'?call(v,'getLat'):member(v,'lat')
 const value={longitude,latitude};if(!validPickerPoint(value))throw new Error('地图坐标无效');return value
}
function bounded<T>(work:()=>Promise<T>,deadline:number,alive:()=>boolean):Promise<T>{return new Promise((resolve,reject)=>{
 const remaining=deadline-Date.now();if(remaining<=0||!alive()){reject(new Error('地点定位未完成'));return}
 const timer=setTimeout(()=>reject(new Error('地点定位未完成')),remaining)
 let pending:Promise<T>;try{pending=work()}catch(error){clearTimeout(timer);reject(error);return}
 pending.then(value=>{clearTimeout(timer);if(alive()&&Date.now()<deadline)resolve(value);else reject(new Error('地点定位已失效'))},error=>{clearTimeout(timer);reject(error)})
})}
/** 四次校正后只核一次六位候选；原手填坐标不经过此逆解或舍入。 */
export async function inverseSolarMapPoint(display:PickerPoint,forward:(p:PickerPoint)=>Promise<PickerPoint>,alive:()=>boolean,deadline=Date.now()+10000):Promise<PickerPoint>{
 if(!validPickerPoint(display))throw new Error('地图坐标无效')
 let candidate=display
 for(let i=0;i<4;i++){
  const actual=await bounded(()=>forward(candidate),deadline,alive)
  if(!validPickerPoint(actual))throw new Error('地图坐标无效')
  const dx=actual.longitude-display.longitude,dy=actual.latitude-display.latitude
  if(Math.max(Math.abs(dx),Math.abs(dy))<=1e-6)break
  candidate={longitude:candidate.longitude-dx,latitude:candidate.latitude-dy}
  if(!validPickerPoint(candidate))throw new Error('地图坐标无效')
 }
 const rounded={longitude:Number(candidate.longitude.toFixed(6)),latitude:Number(candidate.latitude.toFixed(6))}
 if(!validPickerPoint(rounded))throw new Error('地图坐标无效')
 const checked=await bounded(()=>forward(rounded),deadline,alive)
 if(!validPickerPoint(checked)||Math.max(Math.abs(checked.longitude-display.longitude),Math.abs(checked.latitude-display.latitude))>1e-6)throw new Error('地图坐标转换未完成')
 return rounded
}
/** 仅独立地图文档调用供应商；固定地点不使用设备列表或平台凭据。 */
export function solarAmapAdapter(sdk:unknown,container:HTMLElement,active:()=>boolean,onBusy:()=>void,onResult:(p:PickerPoint,name:string)=>void,onFailure:()=>void,zoom=8,readOnly=false,appearance?:'device-location'){
 const map=construct(member(sdk,'Map'),[container,{zoom:7,center:[116.307484,39.98412],viewMode:'2D',resizeEnable:true}])
 if(appearance==='device-location')call(map,'addControl',construct(member(sdk,'Scale'),[]))
 const geocoder=construct(member(sdk,'Geocoder'),[{extensions:'base',radius:1000,batch:false}])
 let marker:unknown,disposed=false,sequence=0,nextForwardAt=0
 const alive=()=>!disposed&&active()
 /** 同实例转换首调间隔至少1100ms；只等当前这一轮，不重试、不排历史请求。 */
 async function forward(p:PickerPoint,current:()=>boolean,deadline:number):Promise<PickerPoint>{
  if(!current()||Date.now()>=deadline)throw new Error('地点定位已失效')
  const wait=Math.max(0,nextForwardAt-Date.now())
  if(wait){if(wait>=deadline-Date.now())throw new Error('地点定位未完成');await new Promise<void>(resolve=>setTimeout(resolve,wait))}
  if(!current()||Date.now()>=deadline)throw new Error('地点定位已失效')
  nextForwardAt=Date.now()+1100
  return new Promise<PickerPoint>((resolve,reject)=>{try{call(sdk,'convertFrom',[[p.longitude,p.latitude]],'gps',(status:unknown,result:unknown)=>{try{const locations=member(result,'locations');if(status!=='complete'||!Array.isArray(locations)||locations.length!==1)throw new Error();resolve(point(locations[0]))}catch{reject(new Error('地图坐标转换未完成'))}})}catch{reject(new Error('地图坐标转换未完成'))}})}
 function geocode(method:'getLocation'|'getAddress',input:unknown):Promise<unknown>{return new Promise((resolve,reject)=>{try{call(geocoder,method,input,(status:unknown,result:unknown)=>{if(status==='complete'&&record(result))resolve(result);else reject(new Error('地点定位未完成'))})}catch{reject(new Error('地点定位未完成'))}})}
 function show(p:PickerPoint){
  if(!alive())return
  const options:Record<string,unknown>={position:[p.longitude,p.latitude]};if(appearance==='device-location'){const pin=document.createElement('span');pin.className='device-location-map-pin';pin.setAttribute('aria-label','设备位置');options.content=pin;options.anchor='bottom-center'}
  const previous=marker,next=construct(member(sdk,'Marker'),[options])
  const oldCenter=previous?point(call(map,'getCenter')):undefined,oldZoom=previous?call(map,'getZoom'):undefined
  try{call(next,'setMap',map);call(map,'setZoomAndCenter',zoom,[p.longitude,p.latitude]);if(previous)call(map,'remove',previous);marker=next}
  catch(cause){try{call(map,'remove',next);if(previous)call(previous,'setMap',map);if(oldCenter&&typeof oldZoom==='number')call(map,'setZoomAndCenter',oldZoom,[oldCenter.longitude,oldCenter.latitude])}catch{/* 供应商已失效时只保留原草稿，不发布不完整结果。 */}throw cause}
 }
 function locationName(address:unknown):string{
  const formatted=member(address,'formattedAddress');if(typeof formatted!=='string')throw new Error('地点名称无效')
  const component=member(address,'addressComponent');let value=formatted
  if(component!==undefined){
   if(!record(component))throw new Error('地点名称无效')
   const part=(key:string)=>{const item=component[key];if(item===undefined||key==='city'&&Array.isArray(item)&&item.length===0)return '';if(typeof item!=='string')throw new Error('地点名称无效');return item}
   const country=part('country');if(country)value=country+part('province')+part('city')+part('district')
  }
  const checked=solarLocationName(value);if(checked===undefined)throw new Error('地点名称无效');return checked
 }
 async function resolveSelection(display:PickerPoint,deadline:number,current:()=>boolean){
  const original=await inverseSolarMapPoint(display,p=>forward(p,current,deadline),current,deadline)
  const result=await bounded(()=>geocode('getAddress',[display.longitude,display.latitude]),deadline,current),address=member(result,'regeocode')
  const name=locationName(address)
  if(current()){show(display);onResult(original,name)}
 }
 function run(work:(deadline:number,current:()=>boolean)=>Promise<void>){const turn=++sequence,current=()=>alive()&&turn===sequence;onBusy();void work(Date.now()+10000,current).catch(()=>{if(current())onFailure()})}
 function pick(event:unknown){try{const display=point(member(event,'lnglat'));run((deadline,current)=>resolveSelection(display,deadline,current))}catch{if(alive())onFailure()}}
 if(!readOnly)call(map,'on','click',pick)
 return{
  async initialize(value:PickerPoint|null){if(value){const turn=++sequence,current=()=>alive()&&turn===sequence,deadline=Date.now()+10000;try{const display=await bounded(()=>forward(value,current,deadline),deadline,current);if(current())show(display)}catch(cause){if(current())throw cause}}},
  locateName(name:string){run(async(deadline,current)=>{solarLocationName(name);const result=await bounded(()=>geocode('getLocation',name),deadline,current),places=member(result,'geocodes');if(!Array.isArray(places)||!places.length)throw new Error('未找到地点');await resolveSelection(point(member(places[0],'location')),deadline,current)})},
  locateCoordinates(value:PickerPoint){run(async(deadline,current)=>{const display=await bounded(()=>forward(value,current,deadline),deadline,current),result=await bounded(()=>geocode('getAddress',[display.longitude,display.latitude]),deadline,current),address=member(result,'regeocode'),name=locationName(address);if(current()){show(display);onResult(value,name)}})},
  zoom(direction:'in'|'out'){if(alive())call(map,direction==='in'?'zoomIn':'zoomOut')},cancel(){sequence++},resize(){if(alive()&&typeof member(map,'resize')==='function')call(map,'resize')},
  destroy(){if(disposed)return;disposed=true;sequence++;try{call(map,'off','click',pick)}finally{call(map,'destroy')}}
 }
}
