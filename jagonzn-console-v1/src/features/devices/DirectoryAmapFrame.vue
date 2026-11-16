<script setup lang="ts">
import {ref,watch,onScopeDispose,nextTick} from 'vue'
import {readDirectoryMapContext} from './directory-amap-context-api'
import {decodeChildMessage,frameChannel,nextFrameGeneration,ownedFrameEvent,validFrameConfiguration,uuidV4,type FrameConfiguration,type ParentMessage,type PickerPoint,type PickerQuery} from './directory-amap-protocol'
import type {DirectoryMapRow,DirectoryBaseMap} from './directory-map'
const props=defineProps<{projectId:string;scopeKey:string;rows:readonly DirectoryMapRow[];selected:string;baseMap:DirectoryBaseMap;disabled?:boolean;picker?:PickerPoint|null;pickerZoom?:number;pickerReadOnly?:boolean;pickerAppearance?:'device-location'}>()
const emit=defineEmits<{select:[id:string];navigate:[id:string];ready:[value:boolean];loading:[value:boolean];error:[message:string];point:[point:PickerPoint,name:string];pickerBusy:[value:boolean]}>()
const frame=ref<HTMLIFrameElement>(),src=ref('')
let pickerSerial=0,pendingPicker:{request:number;query:PickerQuery}|undefined
let disposed=false,nonce='',generation=0,serial=0,childSerial=0,configuration:FrameConfiguration|undefined,controller:AbortController|undefined,renewTimer:ReturnType<typeof setTimeout>|undefined,expiryTimer:ReturnType<typeof setTimeout>|undefined,loadTimer:ReturnType<typeof setTimeout>|undefined,operation=0,ready=false,initialized=false
// 消息仅为同文档内部协议，不是第二套公共 API DTO。
type Payload<T>=T extends unknown?Omit<T,'channel'|'nonce'|'generation'|'serial'>:never
function post(message:Payload<ParentMessage>):boolean{
 try{
  const peer=frame.value?.contentWindow
  if(!peer||!nonce)throw new Error('地图文档不可通信。')
  peer.postMessage({...message,channel:frameChannel,nonce,generation,serial:++serial},location.origin);return true
 }catch{failure('地图通信未完成，设备位置列表仍可查看。');return false}
}
function stop(){
 // 先使原工作失效并撤下文档；dispose仅是通知，关闭的对端不能阻断清理。
 const previousNonce=nonce,previousGeneration=generation,previousSerial=serial+1,previousFrame=frame.value,request=controller
 operation++;pickerSerial++;pendingPicker=undefined;emit('pickerBusy',false);controller=undefined;nonce='';serial=0;childSerial=0;configuration=undefined;ready=false;initialized=false
 clearTimeout(renewTimer);clearTimeout(expiryTimer);clearTimeout(loadTimer);renewTimer=undefined;expiryTimer=undefined;loadTimer=undefined
 window.removeEventListener('message',receive)
 let previousPeer:Window|null=null;try{previousPeer=previousFrame?.contentWindow??null}catch{/* 已关闭文档的访问同样不能阻断失效。 */}
 src.value='';previousFrame?.removeAttribute('src');request?.abort();emit('ready',false);emit('loading',false)
 if(previousNonce){try{previousPeer?.postMessage({kind:'dispose',channel:frameChannel,nonce:previousNonce,generation:previousGeneration,serial:previousSerial},location.origin)}catch{/* 对端可能已关闭；不得递归进入failure或恢复原工作。 */}}
}
function failure(message:string){stop();if(!disposed)emit('error',props.picker!==undefined?(message.includes('授权')?'地图授权已到期，请关闭后重新打开。':'地图加载未完成，请关闭后重试。'):message)}
function armExpiry(current:number){
 clearTimeout(expiryTimer);if(!configuration)return
 expiryTimer=setTimeout(()=>{if(current===operation)failure('地图授权已到期，请明确重新读取地图。')},Math.max(0,Date.parse(configuration.expiresAt)-Date.now()-1000))
}
function scheduleRenew(current:number){clearTimeout(renewTimer);if(configuration)renewTimer=setTimeout(()=>{void renew(current)},Math.max(0,Date.parse(configuration.expiresAt)-Date.now()-15000))}
async function renew(current:number){
 if(disposed||props.disabled||current!==operation||!configuration||!controller)return
 const previous=configuration,project=props.projectId,scope=props.scopeKey,currentNonce=nonce
 try{
  const value=await readDirectoryMapContext(project,currentNonce,controller.signal)
  if(disposed||props.disabled||current!==operation||project!==props.projectId||scope!==props.scopeKey)return
  if(!validFrameConfiguration(value,project))throw new Error('地图授权响应无效。')
  // 新主体/代次不能在既有 SDK 上替换全局地址，先移除旧文档再新建。
  if(value.serviceHost!==previous.serviceHost||value.contextId!==previous.contextId||value.publicKey!==previous.publicKey||value.jsApiVersion!==previous.jsApiVersion){await start();return}
  configuration=value;if(!post({kind:'renew',configuration:value}))return;armExpiry(current);scheduleRenew(current)
 }catch{if(current===operation&&!disposed)failure('地图授权续期未完成，请明确重新读取地图。')}
}
async function start(){
 stop();emit('error','')
 if(disposed||props.disabled||!props.projectId||!props.scopeKey)return
 nonce=crypto.randomUUID();if(!uuidV4.test(nonce)){failure('地图实例无法建立。');return}
 generation=nextFrameGeneration(generation);serial=0;childSerial=0;window.addEventListener('message',receive)
 const current=operation,project=props.projectId,scope=props.scopeKey,requestNonce=nonce
 controller=new AbortController();emit('loading',true)
 try{
  const value=await readDirectoryMapContext(project,requestNonce,controller.signal)
  if(disposed||props.disabled||current!==operation||project!==props.projectId||scope!==props.scopeKey)return
  if(!validFrameConfiguration(value,project))throw new Error('地图授权响应无效。')
  configuration=value;src.value=`${import.meta.env.BASE_URL}directory-map-frame.html#${requestNonce}`;armExpiry(current);scheduleRenew(current)
  loadTimer=setTimeout(()=>{if(current===operation)failure('地图文档加载未完成，请明确重新读取地图。')},30000)
  await nextTick()
 }catch{if(current===operation&&!disposed)failure('目录地图尚不可用，设备位置列表仍可查看。')}
}
function initialize(handshake=false){if(!configuration||props.disabled||initialized&&(!handshake||ready))return;initialized=true;post(props.picker!==undefined?{kind:'picker-init',configuration,projectId:props.projectId,point:props.picker===null?null:{longitude:props.picker.longitude,latitude:props.picker.latitude},request:pickerSerial,...(props.pickerZoom===undefined?{}:{zoom:props.pickerZoom}),...(props.pickerReadOnly===undefined?{}:{readOnly:props.pickerReadOnly}),...(props.pickerAppearance===undefined?{}:{appearance:props.pickerAppearance})}:{kind:'init',configuration,projectId:props.projectId,rows:props.rows,selected:props.selected,baseMap:props.baseMap})}
function receive(event:MessageEvent){
 if(disposed||props.disabled||!ownedFrameEvent(event,location.origin,frame.value?.contentWindow??null))return
 const value=decodeChildMessage(event.data,nonce,new Set(props.rows.map(row=>row.deviceId)))
 if(!value||value.serial<=childSerial||value.generation!==generation&&value.kind!=='hello')return
 childSerial=value.serial
 if(value.kind==='hello'){initialize(true);return}
 if(!initialized)return
 if(value.kind==='ready'){clearTimeout(loadTimer);ready=true;emit('ready',true);flushPicker()}
 else if(value.kind==='rendered'){emit('loading',false)}
 else if(value.kind==='picker-busy'&&props.picker!==undefined&&value.request===pickerSerial)emit('pickerBusy',true)
 else if(value.kind==='picker-result'&&props.picker!==undefined&&value.request===pickerSerial){emit('pickerBusy',false);emit('error','');emit('point',value.point,value.name)}
 else if(value.kind==='picker-failed'&&props.picker!==undefined&&value.request===pickerSerial){emit('pickerBusy',false);emit('error','地点定位未完成，请重试。')}
 else if(value.kind==='select')emit('select',value.deviceId)
 else if(value.kind==='navigate')emit('navigate',value.deviceId)
 else if(value.kind==='error')failure(value.reason==='EXPIRED'?'地图授权已到期，请明确重新读取地图。':value.reason==='CONVERSION'?'地图坐标转换未完成，当前点位未发布。':value.reason==='BASEMAP'?'地图底图加载失败，设备位置列表仍可查看。':'地图组件未能完成加载，设备位置列表仍可查看。')
}
function cancelPicker(){pickerSerial++;pendingPicker=undefined;emit('pickerBusy',false);if(initialized&&props.picker!==undefined)post({kind:'picker-cancel',request:pickerSerial})}
function flushPicker(){
 const queued=pendingPicker
 if(!queued||!ready||props.disabled||props.picker===undefined||queued.request!==pickerSerial)return
 pendingPicker=undefined;post({kind:'picker-query',request:queued.request,query:queued.query})
}
function queryPicker(query:PickerQuery){
 if(disposed||props.disabled||props.picker===undefined)return false
 pickerSerial++;pendingPicker={request:pickerSerial,query:query.kind==='coordinates'?{kind:'coordinates',point:{longitude:query.point.longitude,latitude:query.point.latitude}}:query};emit('error','');emit('pickerBusy',true);flushPicker();return true
}
function fit(deviceIds?:readonly string[]){if(ready&&!props.disabled){if(deviceIds===undefined)post({kind:'fit'});else if(deviceIds.length&&deviceIds.every(id=>props.rows.some(row=>row.deviceId===id)))post({kind:'fit',deviceIds})}}
function zoom(direction:'in'|'out'){if(ready&&!props.disabled)post({kind:'zoom',direction})}
watch(()=>[props.projectId,props.scopeKey,props.disabled] as const,()=>{void start()},{immediate:true,flush:'sync'})
watch(()=>props.rows,()=>{if(props.picker!==undefined)return;generation=nextFrameGeneration(generation);if(initialized&&!disposed&&!props.disabled){emit('loading',true);post({kind:'rows',rows:props.rows,selected:props.selected})}},{flush:'sync'})
watch(()=>props.selected,id=>{if(ready&&props.picker===undefined&&id)post({kind:'select',deviceId:id})})
watch(()=>props.baseMap,baseMap=>{if(ready&&props.picker===undefined){emit('loading',true);post({kind:'basemap',baseMap})}})
onScopeDispose(()=>{disposed=true;try{stop()}finally{window.removeEventListener('message',receive)}})
defineExpose({fit,zoom,restart:start,cancelPicker,queryPicker})
</script>
<template><iframe v-if="src" ref="frame" class="directory-map-frame" :src="src" :title="picker!==undefined?'地点位置地图':'高德当前页设备地图'" referrerpolicy="same-origin" @load="initialize()"/></template>
<style scoped>.directory-map-frame{border:0;display:block;width:100%;height:100%;background:#f4f5f6}</style>
