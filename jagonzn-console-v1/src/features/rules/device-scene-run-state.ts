import {computed,onScopeDispose,ref,shallowRef,watch,type Ref} from 'vue'
import {can,projectId,currentProject} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
import {cas} from './models'
/** 组件内部的执行确认上下文，不是网络DTO。 */
export type DeviceSceneRunIdentity={sceneId:string;deviceId:string;versionId:string;definitionVersion:number;status:string}
export type DeviceSceneRunPort={
 run:(project:string,scene:string,device:string,definition:number,key:string)=>Promise<Schema<'RuleSceneExecutionView'>>
 lookup:(project:string,scene:string,key:string,signal:AbortSignal)=>Promise<Schema<'RuleSceneExecutionView'>>
 definition:(project:string,scene:string,signal:AbortSignal)=>Promise<Schema<'RuleSceneView'>>
}
type Pending=DeviceSceneRunIdentity&{project:string;key:string}
/** 同次执行只生成一个幂等键；未知只GET核对，不借404重试或宣称送达。 */
export function useDeviceSceneRunState(scope:Ref<DeviceSceneRunIdentity|null>,transport:DeviceSceneRunPort,onDefinitionRead:()=>Promise<void>,onDenied:(cause:ApiError)=>void=()=>{},keyFactory:()=>string=()=>crypto.randomUUID()){
 const confirming=ref(false),writing=ref(false),checking=ref(false),locked=ref(false),definitionStale=ref(false),error=ref(''),notice=ref(''),receipt=shallowRef<Schema<'RuleSceneExecutionView'>>()
 let held:Pending|undefined,active=true,generation=0,controller:AbortController|undefined
 const allowed=computed(()=>!!projectId.value&&can('rule:manage'))
 const writable=computed(()=>allowed.value&&currentProject.value?.status==='ACTIVE')
 const valid=computed(()=>{const s=scope.value;if(!s||![s.sceneId,s.deviceId,s.versionId].every(definitionUuid))return false;try{cas(s.definitionVersion);return ['ACTIVE','PAUSED'].includes(s.status)}catch{return false}})
 // 无读取权时允许离开；同作用域恢复权限后，未决请求仍须先核对。
 const busy=computed(()=>writing.value||checking.value),blocked=computed(()=>allowed.value&&(busy.value||locked.value||confirming.value))
 const canRun=computed(()=>writable.value&&valid.value&&scope.value?.status==='ACTIVE'&&!busy.value&&!locked.value)
 const same=(p:Pending)=>active&&p.project===projectId.value&&p.sceneId===scope.value?.sceneId&&p.deviceId===scope.value?.deviceId
 function invalidate(clear:boolean){generation++;controller?.abort();controller=undefined;writing.value=false;checking.value=false;confirming.value=false;if(clear){held=undefined;locked.value=false;definitionStale.value=false;error.value='';notice.value='';receipt.value=undefined}}
 const dispose=onIdentityChange(()=>invalidate(true));onScopeDispose(()=>{active=false;invalidate(true);dispose()})
 watch([projectId,()=>scope.value?.sceneId,()=>scope.value?.deviceId],()=>invalidate(true))
 watch([()=>scope.value?.definitionVersion,()=>scope.value?.versionId],()=>{const keep=!!held&&(writing.value||locked.value)&&!definitionStale.value;invalidate(!keep);if(keep)locked.value=true})
 watch([allowed,writable],([reading,writingAllowed])=>{if(!reading||!writingAllowed){const pending=!!held&&(writing.value||locked.value);invalidate(false);if(!reading){receipt.value=undefined;notice.value='';error.value=''}if(pending){locked.value=true;error.value='该次执行结果待核对，请勿重复运行'}}})
 function readReceipt(value:Schema<'RuleSceneExecutionView'>,p:Pending){
  const runtime=(value as {runtimeVersion?:unknown})?.runtimeVersion,states=runtime===undefined||runtime===1?['DISPATCHED','SKIPPED','FAILED']:runtime===2?['QUEUED','RUNNING','WAITING','SUCCEEDED','SKIPPED','FAILED','TERMINATED']:[]
  if(!value||!definitionUuid(value.id)||value.sceneId!==p.sceneId||value.deviceId!==p.deviceId||value.sceneVersionId!==p.versionId||value.idempotencyKey!==p.key||value.trigger!=='MANUAL'||!states.includes(value.status||''))throw new Error('场景执行回执不匹配，请核对同次请求')
  return value
 }
 function resolved(value:Schema<'RuleSceneExecutionView'>){receipt.value=value;notice.value=value.status==='DISPATCHED'?'该次操作已写入发送队列':['QUEUED','RUNNING','WAITING'].includes(value.status||'')?'已触发一次执行':value.status==='SUCCEEDED'?'执行完成':value.status==='TERMINATED'?'已终止':value.status==='SKIPPED'?(value as {runtimeVersion?:unknown}).runtimeVersion===2?'已跳过':'条件未满足，未产生操作':'该次场景执行失败';locked.value=false;definitionStale.value=false;confirming.value=false;error.value='';held=undefined}
 function open(){if(canRun.value){confirming.value=true;error.value='';notice.value=''}}
 function cancel(){if(!busy.value&&!locked.value)confirming.value=false}
 async function confirm(){
  if(!confirming.value||!canRun.value||!scope.value)return
  const p:Pending={...scope.value,project:projectId.value,key:keyFactory()}
  if(!p.key||p.key.length>128){error.value='无法建立本次执行标识';return}
  const epoch=identityEpoch(),turn=generation,current=()=>same(p)&&epoch===identityEpoch()&&turn===generation&&writable.value
  held=p;writing.value=true;error.value='';receipt.value=undefined
  try{const value=await transport.run(p.project,p.sceneId,p.deviceId,p.definitionVersion,p.key);if(current())resolved(readReceipt(value,p))}
  catch(cause){if(current()&&!(cause instanceof IdentityChanged)){
   error.value=errorMessage(cause)
   if(cause instanceof ApiError&&!cause.outcomeUnknown&&cause.status===409&&cause.code===40042){locked.value=true;definitionStale.value=true}
   else if(cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404].includes(cause.status)){held=undefined;confirming.value=false;if([401,403,404].includes(cause.status))onDenied(cause)}
   else locked.value=true
  }}finally{if(current())writing.value=false}
 }
 async function verify(){
  const p=held;if(!p||!same(p)||!allowed.value||busy.value||!locked.value)return
  const epoch=identityEpoch(),turn=generation,current=()=>same(p)&&epoch===identityEpoch()&&turn===generation&&allowed.value
  checking.value=true;controller=new AbortController();const signal=controller.signal
  try{
   if(definitionStale.value){
    // 40042是原同步事务已回滚的定义冲突；10010等在途409仍走精确key读取。
    const value=await transport.definition(p.project,p.sceneId,signal);if(!current())return
    if(value.id!==p.sceneId||!['DRAFT','ACTIVE','PAUSED'].includes(value.status||''))throw new Error('场景定义核对不匹配')
    cas(value.version);if(value.status!=='DRAFT'&&!definitionUuid(value.activeVersionId))throw new Error('场景版本核对不完整')
    await onDefinitionRead();if(current()){locked.value=false;definitionStale.value=false;held=undefined;confirming.value=false;error.value='';notice.value='场景已重新读取，请确认最新定义后再运行'}
   }else{const value=await transport.lookup(p.project,p.sceneId,p.key,signal);if(current())resolved(readReceipt(value,p))}
  }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){
   error.value=cause instanceof ApiError&&cause.status===404?'尚未找到同次执行记录，结果仍待核对，请勿重复运行':errorMessage(cause)
   if(cause instanceof ApiError&&[401,403].includes(cause.status))onDenied(cause)
  }}finally{if(current()){checking.value=false;controller=undefined}}
 }
 return {confirming,writing,checking,busy,blocked,locked,definitionStale,error,notice,receipt,canRun,open,cancel,confirm,verify}
}
