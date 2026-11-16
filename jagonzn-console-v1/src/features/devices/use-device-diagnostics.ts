import {computed,onScopeDispose,ref,shallowRef} from 'vue'
import {ApiError,errorMessage,IdentityChanged} from '@/core/http'
import {projectId} from '@/core/session'
import {isDeviceScopeCurrent,useDeviceGuard} from './use-device-guard'
import {MAX_DIAGNOSTIC_VERSION,prepareDeviceDiagnosticIntent,readDeviceDiagnosticControl,submitDeviceDiagnosticIntent,type DeviceDiagnosticControl,type DeviceDiagnosticIntent} from './device-diagnostics-api'
import {readDeviceDiagnosticObservations,type DeviceDiagnosticObservationPage} from './device-diagnostic-observations-api'

type Review=Readonly<{intent:DeviceDiagnosticIntent;stage:'unknown'|'rejected';error:string;current?:DeviceDiagnosticControl}>
type Options={device:()=>string;visible:()=>boolean;readable:()=>boolean;writable:()=>boolean}
/** 诊断写意图固定原版本；未知结果只能显式读取、核对、继续，不自动重放。 */
export function useDeviceDiagnostics(options:Options){
 const state=shallowRef<DeviceDiagnosticControl>(),data=shallowRef<DeviceDiagnosticObservationPage>(),review=shallowRef<Review>(),confirmation=shallowRef<DeviceDiagnosticIntent>()
 const loading=ref(false),sending=ref(false),reviewLoading=ref(false),denied=ref(false),writeDenied=ref(false),error=ref(''),page=ref(1)
 const cursors:Array<string|undefined>=[undefined]
 const capture=useDeviceGuard(options.device)
 let generation=0,serial=0,disposed=false,reader:AbortController|undefined,writer:AbortController|undefined
 let stateScope:(()=>void)|undefined
 const currentState=()=>!!state.value&&state.value.deviceId===options.device()&&!!stateScope&&isDeviceScopeCurrent(stateScope)
 const readable=computed(()=>options.visible()&&options.readable()&&!denied.value)
 const writable=computed(()=>readable.value&&options.writable()&&!writeDenied.value&&!loading.value&&!sending.value&&!reviewLoading.value&&!review.value&&!confirmation.value&&currentState()&&!!state.value&&state.value.version<MAX_DIAGNOSTIC_VERSION)
 function active(check:()=>void,g:number,s:number){return !disposed&&g===generation&&s===serial&&isDeviceScopeCurrent(check)}
 function reset(){stateScope=undefined;generation++;serial++;reader?.abort();writer?.abort();state.value=undefined;data.value=undefined;review.value=undefined;confirmation.value=undefined;error.value='';loading.value=false;sending.value=false;reviewLoading.value=false;denied.value=false;writeDenied.value=false;page.value=1;cursors.splice(0,cursors.length,undefined)}
 function deny(){stateScope=undefined;generation++;serial++;reader?.abort();writer?.abort();state.value=undefined;data.value=undefined;review.value=undefined;confirmation.value=undefined;loading.value=false;sending.value=false;reviewLoading.value=false;denied.value=true}
 async function load(){
  if(disposed||!readable.value||sending.value||review.value||confirmation.value||reviewLoading.value)return
  const check=capture(),g=generation,s=++serial,controller=new AbortController();reader?.abort();reader=controller;loading.value=true;error.value=''
  try{
   const current=await readDeviceDiagnosticControl(projectId.value,options.device(),controller.signal)
   if(!active(check,g,s)||!readable.value)return
   const messages=await readDeviceDiagnosticObservations(projectId.value,options.device(),cursors[page.value-1],controller.signal)
   if(!active(check,g,s)||!readable.value)return
   stateScope=check;state.value=current;data.value=messages
  }catch(cause){
   if(!active(check,g,s)||controller.signal.aborted||cause instanceof IdentityChanged)return
   stateScope=undefined;state.value=undefined;data.value=undefined;error.value=errorMessage(cause)
   if(cause instanceof ApiError&&[401,403,404].includes(cause.status))deny()
  }finally{if(active(check,g,s))loading.value=false}
 }
 function refresh(){if(sending.value||review.value||confirmation.value||reviewLoading.value)return;page.value=1;cursors.splice(0,cursors.length,undefined);void load()}
 function next(){if(!data.value?.hasMore||!data.value.nextCursor||loading.value||sending.value||review.value||confirmation.value)return;if(cursors.includes(data.value.nextCursor)){error.value='诊断记录游标没有推进，请刷新首页。';return}cursors[page.value]=data.value.nextCursor;page.value++;void load()}
 function previous(){if(page.value<=1||loading.value||sending.value||review.value||confirmation.value)return;page.value--;void load()}
 function requestClear(){if(writable.value&&state.value)confirmation.value=prepareDeviceDiagnosticIntent(projectId.value,state.value,'clear')}
 function cancelClear(){if(!sending.value)confirmation.value=undefined}
 async function confirmClear(){
  const intent=confirmation.value
  if(!intent||!readable.value||!options.writable()||writeDenied.value||sending.value)return
  confirmation.value=undefined;await send(intent)
 }
 async function toggle(enabled:boolean){if(!writable.value||!state.value||typeof enabled!=='boolean'||enabled===state.value.enabled)return;await send(prepareDeviceDiagnosticIntent(projectId.value,state.value,'toggle',enabled))}
 async function send(intent:DeviceDiagnosticIntent){
  if(disposed||!readable.value||!options.writable()||writeDenied.value||sending.value||review.value||intent.project!==projectId.value||intent.device!==options.device()||!currentState())return
  const check=capture(),g=generation,s=++serial,controller=new AbortController();reader?.abort();writer=controller;sending.value=true;error.value=''
  let accepted=false
  try{
   const result=await submitDeviceDiagnosticIntent(intent,controller.signal)
   if(!active(check,g,s)||!readable.value||!options.writable())return
   stateScope=check;state.value=result;data.value=undefined;accepted=true
  }catch(cause){
   if(!active(check,g,s)||cause instanceof IdentityChanged)return
   if(cause instanceof ApiError&&[401,404].includes(cause.status)){deny();return}
   if(cause instanceof ApiError&&cause.status===403)writeDenied.value=true
   const rejected=cause instanceof ApiError&&!cause.outcomeUnknown&&[400,403,409,413,422,429].includes(cause.status)
   review.value={intent,stage:rejected?'rejected':'unknown',error:errorMessage(cause)}
  }finally{if(active(check,g,s)){sending.value=false;if(accepted)refresh()}}
 }
 async function readCurrent(){
  const expected=review.value
  if(!expected||!readable.value||sending.value||reviewLoading.value)return
  const check=capture(),g=generation,s=++serial,controller=new AbortController();reader?.abort();reader=controller;reviewLoading.value=true
  review.value={...expected,current:undefined,error:''}
  try{
   const current=await readDeviceDiagnosticControl(expected.intent.project,expected.intent.device,controller.signal)
   if(!active(check,g,s)||!readable.value)return
   if(current.version<expected.intent.version||(current.version===expected.intent.version&&(current.enabled!==expected.intent.previousEnabled||current.clearGeneration!==expected.intent.clearGeneration)))throw new Error('诊断权威状态与原版本不一致，请重新核对')
   review.value={...expected,current,error:''}
  }catch(cause){
   if(!active(check,g,s)||controller.signal.aborted||cause instanceof IdentityChanged)return
   if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){deny();return}
   review.value={...expected,current:undefined,error:errorMessage(cause)}
  }finally{if(active(check,g,s))reviewLoading.value=false}
 }
 function continueWithCurrent(){
  if(!review.value?.current||!readable.value||sending.value||reviewLoading.value)return
  state.value=review.value.current;review.value=undefined;data.value=undefined;refresh()
 }
 onScopeDispose(()=>{disposed=true;reset()})
 return {state,data,review,confirmation,loading,sending,reviewLoading,denied,writeDenied,error,page,readable,writable,reset,load,refresh,next,previous,requestClear,cancelClear,confirmClear,toggle,readCurrent,continueWithCurrent}
}
