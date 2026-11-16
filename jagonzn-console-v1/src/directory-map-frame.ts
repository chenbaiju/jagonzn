import {load} from '@amap/amap-jsapi-loader'
import {convertDirectoryAmapPoints} from './features/devices/directory-amap-coordinates'
import {solarAmapAdapter} from './features/rules/solar-amap-adapter'
import {directoryAmapAdapter} from './features/devices/directory-amap-adapter'
import {decodeParentMessage,directoryAmapSdkServiceHost,frameChannel,ownedFrameEvent,uuidV4,type ChildMessage,type FrameConfiguration,type ParentMessage} from './features/devices/directory-amap-protocol'
import type {DirectoryMapRow} from './features/devices/directory-map'
import './features/devices/directory-map-frame.css'
const nonce=location.hash.slice(1),container=document.getElementById('directory-map')
let pickerMode=false
let disposed=false,initialized=false,generation=0,lastParentSerial=0,serial=0,project='',configuration:FrameConfiguration|undefined,expiryTimer:ReturnType<typeof setTimeout>|undefined,renderSequence=0,baseSequence=0
let adapter:ReturnType<typeof directoryAmapAdapter>|undefined,picker:ReturnType<typeof solarAmapAdapter>|undefined,pickerRequest=0
let rows:readonly DirectoryMapRow[]=[],selection='',baseMap:'vector'|'satellite'='vector'
type Payload<T>=T extends unknown?Omit<T,'channel'|'nonce'|'generation'|'serial'>:never
function send(message:Payload<ChildMessage>){if(!disposed)parent.postMessage({...message,channel:frameChannel,nonce,generation,serial:++serial},location.origin)}
const active=()=>!disposed&&!!configuration&&Date.parse(configuration.expiresAt!)>Date.now()+1000
function fail(reason:'SDK'|'CONVERSION'|'EXPIRED'|'PROTOCOL'|'BASEMAP'){
 if(disposed)return
 send({kind:'error',reason});dispose()
}
function dispose(){if(disposed)return;disposed=true;renderSequence++;clearTimeout(expiryTimer);window.removeEventListener('message',receive);resize.disconnect();try{adapter?.destroy();picker?.destroy()}finally{adapter=undefined;picker=undefined;container?.replaceChildren();rows=[]}}
function armExpiry(){clearTimeout(expiryTimer);if(!configuration)return;expiryTimer=setTimeout(()=>fail('EXPIRED'),Math.max(0,Date.parse(configuration.expiresAt!)-Date.now()-1500))}
async function render(){
 if(!adapter||!active())return
 const current=++renderSequence,currentGeneration=generation,snapshot=rows
 const currentRender=()=>active()&&current===renderSequence&&currentGeneration===generation
 try{adapter.clear()}catch{if(currentRender())fail('SDK');return}
 let points:Awaited<ReturnType<typeof convertDirectoryAmapPoints>>
 try{points=await convertDirectoryAmapPoints(snapshot,adapter.converter,currentRender)}catch{if(currentRender())fail('CONVERSION');return}
 if(!points||!adapter||!currentRender())return
 try{adapter.render(points);adapter.fit();if(selection)adapter.select(selection)}catch{if(currentRender())fail('SDK');return}
 const layerCurrent=++baseSequence
 try{
  if(!await adapter.baseMap(baseMap)||!currentRender()||layerCurrent!==baseSequence)return
 }catch{if(currentRender()&&layerCurrent===baseSequence)fail('BASEMAP');return}
 send({kind:'ready'});send({kind:'rendered'})
}
async function initialize(message:Extract<ParentMessage,{kind:'init'|'picker-init'}>){
 if(initialized||!container)return;initialized=true;pickerMode=message.kind==='picker-init';configuration=message.configuration;project=message.projectId
 if(message.kind==='init'){rows=message.rows;selection=message.selected;baseMap=message.baseMap}else pickerRequest=message.request;armExpiry()
 // serviceHost 是该文档的不可变配置；任何变更由父级销毁整个 iframe。
 ;(window as unknown as Record<string,unknown>)._AMapSecurityConfig={serviceHost:directoryAmapSdkServiceHost(configuration,location.origin)}
 try{
  const sdk:unknown=await Promise.race([load({key:configuration.publicKey!,version:configuration.jsApiVersion!,plugins:message.kind==='picker-init'?['AMap.Scale','AMap.Geocoder']:['AMap.Scale']}) as Promise<unknown>,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('SDK加载超时')),10000))]);if(!active())return
  if(message.kind==='picker-init'){
   picker=solarAmapAdapter(sdk,container,active,()=>send({kind:'picker-busy',request:pickerRequest}),(point,name)=>send({kind:'picker-result',request:pickerRequest,point,name}),()=>send({kind:'picker-failed',request:pickerRequest}),message.zoom,message.readOnly,message.appearance)
   await picker.initialize(message.point);if(active()){send({kind:'ready'});send({kind:'rendered'})}
  }else{adapter=directoryAmapAdapter(sdk,container,active,id=>send({kind:'select',deviceId:id}),id=>send({kind:'navigate',deviceId:id}));await render()}
 }catch{if(!disposed)fail('SDK')}
}
async function switchBaseMap(kind:'vector'|'satellite'){const current=++baseSequence;baseMap=kind;try{if(await adapter?.baseMap(kind)&&active()&&current===baseSequence)send({kind:'rendered'})}catch{if(active()&&current===baseSequence)fail('BASEMAP')}}
function receive(event:MessageEvent){
 if(disposed||!ownedFrameEvent(event,location.origin,parent))return
 const message=decodeParentMessage(event.data,nonce,project);if(!message)return
 if(message.serial<=lastParentSerial||message.generation<generation)return
 if(!initialized&&message.kind!=='init'&&message.kind!=='picker-init')return
 lastParentSerial=message.serial
 if(message.kind==='init'||message.kind==='picker-init'){generation=message.generation;void initialize(message);return}
 if(message.kind==='dispose'){dispose();return}
 if(message.kind==='renew'){if(!configuration||message.configuration.contextId!==configuration.contextId||message.configuration.serviceHost!==configuration.serviceHost||message.configuration.publicKey!==configuration.publicKey||message.configuration.jsApiVersion!==configuration.jsApiVersion){fail('PROTOCOL');return}configuration=message.configuration;armExpiry();return}
 if(!active()){fail('EXPIRED');return}
 if(message.kind==='picker-cancel'){if(message.generation===generation){pickerRequest=message.request;picker?.cancel()}return}
 if(message.kind==='picker-query'){if(picker&&message.generation===generation){pickerRequest=message.request;if(message.query.kind==='name')picker.locateName(message.query.name);else picker.locateCoordinates(message.query.point)}return}
 if(message.kind==='rows'){if(pickerMode)return;generation=message.generation;rows=message.rows;selection=message.selected;void render();return}
 // 控制消息只能对应当前查询，不能借较新代次在旧点位上执行。
 if(message.generation!==generation)return
 if(pickerMode){try{if(message.kind==='zoom')picker?.zoom(message.direction)}catch{fail('SDK')}return}
 if(!adapter)return
 try{if(message.kind==='select'){if(rows.some(r=>r.deviceId===message.deviceId)){selection=message.deviceId;adapter.select(message.deviceId)}}else if(message.kind==='fit'){if(!message.deviceIds||message.deviceIds.every(id=>rows.some(row=>row.deviceId===id)))adapter.fit(message.deviceIds)}else if(message.kind==='zoom')adapter.zoom(message.direction);else if(message.kind==='basemap'){void switchBaseMap(message.baseMap)}}catch{fail('SDK')}
}
const resize=new ResizeObserver(()=>{try{adapter?.resize();picker?.resize()}catch{fail('SDK')}})
if(!uuidV4.test(nonce)||parent===window||!container){disposed=true}else{window.addEventListener('message',receive);window.addEventListener('pagehide',dispose,{once:true});resize.observe(container);send({kind:'hello'})}
