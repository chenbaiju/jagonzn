import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicesApi} from './api'
import {useDeviceGuard,isDeviceScopeCurrent} from './use-device-guard'

type Access=Schema<'DeviceAccessConfigurationResponse'>
type AccessFact=Readonly<Access>
type Intent=Readonly<{generation:number;project:string;device:string;epoch:number;check:()=>void;access?:AccessFact;target?:boolean}>
type Options={device:()=>string;readable:()=>boolean;visible:()=>boolean;available:()=>boolean;access:()=>Access|undefined;onRemoved:()=>void;onAccess:(value:AccessFact)=>void}
function accessFact(value:Access|undefined):AccessFact{
 const protocols=['MQTT','HTTP','COAP','TCP']
 const fields=['protocol','enabled','configVersion','credentialVersion','configured','allowedProtocols','canManage']
 const version=(v:unknown)=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n
 if(!value||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key))||!protocols.includes(value.protocol)||typeof value.enabled!=='boolean'||typeof value.canManage!=='boolean'||typeof value.configured!=='boolean'||!version(value.configVersion)||!version(value.credentialVersion)||!Array.isArray(value.allowedProtocols)||value.allowedProtocols.length>4||new Set(value.allowedProtocols).size!==value.allowedProtocols.length||value.allowedProtocols.some(p=>!protocols.includes(p)))throw new Error('当前设备接入状态不完整，请重新读取')
 return Object.freeze({...value,allowedProtocols:[...value.allowedProtocols]})
}

/** 每个动作保留独立未知结果保护；关闭/读当前不会自动重发原写入。 */
export function useDeviceMaintenanceAction(kind:'remove'|'access',options:Options){
 const shown=ref(false),writing=ref(false),checking=ref(false),review=ref(false),checked=ref(false),denied=ref(false),error=ref('')
 const currentAccess=shallowRef<AccessFact>(),exists=ref(false)
 const capture=useDeviceGuard(options.device)
 let generation=0,request=0,intent:Intent|undefined,controller:AbortController|undefined
 const allowed=computed(()=>options.readable()&&can(kind==='remove'?'device:delete':'device:update')&&currentProject.value?.status==='ACTIVE'&&!denied.value)
 const message=ref(kind==='remove'?'确认移除设备吗？':'')
 const confirm=shallowRef<()=>Promise<void>>(async()=>{})
 const valid=(value:Intent)=>value.generation===generation&&value.epoch===identityEpoch()&&isDeviceScopeCurrent(value.check)&&options.readable()
 function reset(){generation++;request++;controller?.abort();intent=undefined;shown.value=false;writing.value=false;checking.value=false;review.value=false;checked.value=false;denied.value=false;error.value='';exists.value=false;currentAccess.value=undefined;confirm.value=async()=>{}}
 function setIntent(access?:AccessFact,target?:boolean){
  const value:Intent=Object.freeze({generation:++generation,project:projectId.value,device:options.device(),epoch:identityEpoch(),check:capture(),access,target})
  intent=value
  message.value=kind==='remove'?'确认移除设备吗？':target?'确认启用设备吗？':'停用设备后，设备将无法连接到平台，无法上报数据或接收下发消息。确认停用吗？'
  // 每个可点击回调绑定原代次；保留的旧DOM回调不能确认后来打开的设备。
  confirm.value=()=>perform(value)
 }
 function start(){
  if(!options.visible()||!allowed.value||!options.available()||writing.value||checking.value)return
  if(review.value&&intent&&valid(intent)){shown.value=true;return}
  reset();shown.value=true
  try{
   if(!projectId.value||!options.device())throw new Error('请先读取当前设备')
   if(kind==='access'){
    const value=accessFact(options.access())
    if(!value.canManage||!value.allowedProtocols.includes(value.protocol)||BigInt(value.configVersion)===9223372036854775807n)throw new Error('当前接入状态不可修改，请重新读取')
    setIntent(value,!value.enabled)
   }else setIntent()
  }catch(cause){error.value=errorMessage(cause)}
 }
 function close(){
  if(writing.value)return
  request++;controller?.abort();checking.value=false;shown.value=false
  if(!review.value)reset()
 }
 async function perform(value:Intent){
  if(!valid(value)||!shown.value||!allowed.value||!options.available()||writing.value||review.value)return
  writing.value=true;review.value=true;checked.value=false;error.value=''
  try{
   if(kind==='remove'){
    await devicesApi.remove(value.project,value.device)
    if(!valid(value)||!shown.value||!allowed.value)return
    reset();options.onRemoved();return
   }
   const before=value.access!
   const returned=await devicesApi.changeAccess(value.project,value.device,{protocol:before.protocol,enabled:value.target!,expectedConfigVersion:before.configVersion})
   if(!valid(value)||!shown.value||!allowed.value)return
   const receipt=accessFact(returned)
   if(receipt.protocol!==before.protocol||receipt.enabled!==value.target||BigInt(receipt.configVersion)!==BigInt(before.configVersion)+1n)throw new Error('接入修改回执需要重新读取核对')
   const actual=accessFact(await devicesApi.access(value.project,value.device))
   if(!valid(value)||!shown.value||!allowed.value)return
   if(actual.protocol!==receipt.protocol||actual.enabled!==receipt.enabled||actual.configVersion!==receipt.configVersion)throw new Error('当前接入状态与修改回执不同，请重新读取核对')
   options.onAccess(actual);reset()
  }catch(cause){
   if(!valid(value)||!shown.value)return
   error.value=errorMessage(cause)
   if(cause instanceof ApiError&&[401,403,404].includes(cause.status))denied.value=true
  }finally{if(value.generation===generation)writing.value=false}
 }
 async function reread(){
  const value=intent
  if(!value||!valid(value)||!shown.value||!review.value||writing.value||checking.value||!options.readable())return
  const seq=++request;controller?.abort();controller=new AbortController();const signal=controller.signal
  checking.value=true;checked.value=false;error.value='';exists.value=false;currentAccess.value=undefined
  try{
   if(kind==='remove'){
    const actual=await devicesApi.read(value.project,value.device,signal)
    if(!valid(value)||!shown.value||seq!==request||signal.aborted)return
    if(actual.id!==value.device)throw new Error('当前设备读取身份不匹配')
    exists.value=true
   }else{
    const actual=accessFact(await devicesApi.access(value.project,value.device,signal))
    if(!valid(value)||!shown.value||seq!==request||signal.aborted)return
    currentAccess.value=actual;options.onAccess(actual)
   }
   checked.value=true
  }catch(cause){if(valid(value)&&shown.value&&seq===request&&!signal.aborted){error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))denied.value=true}}
  finally{if(value.generation===generation&&seq===request)checking.value=false}
 }
 const canContinue=computed(()=>allowed.value&&review.value&&checked.value&&!writing.value&&!checking.value&&(kind==='remove'?exists.value:!!currentAccess.value?.canManage&&currentAccess.value.allowedProtocols.includes(currentAccess.value.protocol)&&currentAccess.value.enabled!==intent?.target&&BigInt(currentAccess.value.configVersion)<9223372036854775807n))
 const canFinish=computed(()=>allowed.value&&review.value&&checked.value&&!writing.value&&!checking.value)
 function continueWithCurrent(){
  if(!canContinue.value||!intent||!valid(intent))return
  const target=intent.target,access=currentAccess.value;review.value=false;checked.value=false;error.value=''
  setIntent(access,target)
 }
 function finishReview(){if(canFinish.value)reset()}
 const stop=onIdentityChange(reset)
 watch([()=>projectId.value,options.device,options.readable,()=>can('device:update'),()=>can('device:delete'),()=>currentProject.value?.status],reset,{flush:'sync'})
 watch(options.visible,visible=>{if(!visible){if(review.value){shown.value=false;request++;controller?.abort();checking.value=false}else reset()}},{flush:'sync'})
 onScopeDispose(()=>{reset();stop()})
 return {kind,shown,writing,checking,review,checked,denied,error,message,currentAccess,exists,allowed,confirm,canContinue,canFinish,start,close,reread,continueWithCurrent,finishReview}
}
export type DeviceMaintenanceState=ReturnType<typeof useDeviceMaintenanceAction>
