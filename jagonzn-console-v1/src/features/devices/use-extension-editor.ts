import {computed,onScopeDispose,ref,shallowRef} from 'vue'
import {ApiError,errorMessage,IdentityChanged} from '@/core/http'
import {isDeviceScopeCurrent,useDeviceGuard} from './use-device-guard'

type Options<Snapshot,Draft,Intent>={id:()=>string;readable:()=>boolean;writable:()=>boolean;read:(signal:AbortSignal)=>Promise<Snapshot>;draft:(snapshot:Snapshot)=>Draft;prepare:(snapshot:Snapshot,draft:Draft)=>Intent;submit:(intent:Intent,signal:AbortSignal)=>Promise<Snapshot>;onSaved?:(snapshot:Snapshot)=>void}
type Review<Snapshot,Intent>=Readonly<{stage:'unknown'|'rejected';intent:Intent;current?:Snapshot}>
/** 定义和值共用编辑生命周期；未知或冲突后须显式读取与采用当前信息，旧意图绝不自动重放。 */
export function useExtensionEditor<Snapshot,Draft,Intent>(options:Options<Snapshot,Draft,Intent>){
 const data=shallowRef<Snapshot>(),draft=shallowRef<Draft>(),review=shallowRef<Review<Snapshot,Intent>>()
 const loading=ref(false),sending=ref(false),editing=ref(false),reviewLoading=ref(false),error=ref(''),denied=ref(false),writeDenied=ref(false)
 const readable=computed(()=>options.readable()&&!denied.value),writable=computed(()=>readable.value&&options.writable()&&!writeDenied.value&&!loading.value&&!sending.value&&!reviewLoading.value&&!review.value)
 const capture=useDeviceGuard(options.id)
 let generation=0,serial=0,disposed=false,reader:AbortController|undefined,writer:AbortController|undefined
 function active(check:()=>void,g:number,s:number){return !disposed&&generation===g&&serial===s&&isDeviceScopeCurrent(check)}
 function reset(){generation++;serial++;reader?.abort();writer?.abort();data.value=undefined;draft.value=undefined;review.value=undefined;loading.value=false;sending.value=false;editing.value=false;reviewLoading.value=false;error.value='';denied.value=false;writeDenied.value=false}
 function deny(cause:unknown){reset();denied.value=true;error.value=errorMessage(cause)}
 async function readSnapshot(keepVisibleData:boolean){
  if(!readable.value||loading.value||sending.value||editing.value||review.value)return
  const check=capture(),g=generation,s=++serial,controller=new AbortController();reader?.abort();reader=controller;loading.value=true;error.value=''
  if(!keepVisibleData)data.value=undefined
  try{const result=await options.read(controller.signal);if(active(check,g,s)&&readable.value){data.value=result;return result}}
  catch(cause){if(!active(check,g,s)||controller.signal.aborted||cause instanceof IdentityChanged)return;if(cause instanceof ApiError&&[401,403,404].includes(cause.status))deny(cause);else{data.value=undefined;error.value=errorMessage(cause)}}
  finally{if(active(check,g,s))loading.value=false}
 }
 function load(){return readSnapshot(false)}
 async function begin({keepVisibleData=false}:{keepVisibleData?:boolean}={}){
  if(!writable.value||editing.value)return
  const g=generation;const current=await readSnapshot(keepVisibleData);if(g!==generation||!current||!writable.value)return
  draft.value=options.draft(current);editing.value=true
 }
 function beginCurrent(){if(!writable.value||editing.value||data.value===undefined)return false;draft.value=options.draft(data.value);editing.value=true;return true}
 function cancel(){if(sending.value)return;editing.value=false;draft.value=undefined;if(!review.value)error.value=''}
 async function save(){
  if(!writable.value||!editing.value||data.value===undefined||draft.value===undefined)return
  let intent:Intent
  try{intent=options.prepare(data.value,draft.value)}catch(cause){error.value=errorMessage(cause);return}
  const check=capture(),g=generation,s=++serial,controller=new AbortController();writer=controller;sending.value=true;error.value='';let saved:Snapshot|undefined,completed=false
  try{const result=await options.submit(intent,controller.signal);if(!active(check,g,s)||!readable.value)return;data.value=result;draft.value=undefined;editing.value=false;saved=result;completed=true}
  catch(cause){
   if(!active(check,g,s)||controller.signal.aborted||cause instanceof IdentityChanged)return
   if(cause instanceof ApiError&&[401,404].includes(cause.status)){deny(cause);return}
   error.value=errorMessage(cause)
   if(cause instanceof ApiError&&cause.status===403)writeDenied.value=true
   if(!(cause instanceof ApiError)||cause.outcomeUnknown||cause.status===0||cause.status>=500||[403,409].includes(cause.status))review.value={intent,stage:cause instanceof ApiError&&[403,409].includes(cause.status)?'rejected':'unknown'}
  }finally{if(active(check,g,s)){sending.value=false;if(completed&&readable.value)options.onSaved?.(saved as Snapshot)}}
 }
 async function readCurrent(){
  if(!review.value||!readable.value||sending.value||reviewLoading.value)return
  const previous=review.value,check=capture(),g=generation,s=++serial,controller=new AbortController();reader?.abort();reader=controller;reviewLoading.value=true;review.value={...previous,current:undefined};error.value=''
  try{const current=await options.read(controller.signal);if(active(check,g,s)&&readable.value)review.value={...previous,current}}
  catch(cause){if(!active(check,g,s)||controller.signal.aborted||cause instanceof IdentityChanged)return;if(cause instanceof ApiError&&[401,403,404].includes(cause.status))deny(cause);else error.value=errorMessage(cause)}
  finally{if(active(check,g,s))reviewLoading.value=false}
 }
 function useCurrent(){
  const current=review.value?.current;if(current===undefined||!readable.value||sending.value||reviewLoading.value)return
  data.value=current;review.value=undefined;error.value='';editing.value=options.writable()&&!writeDenied.value;draft.value=editing.value?options.draft(current):undefined
 }
 onScopeDispose(()=>{disposed=true;reset()})
 return {data,draft,review,loading,sending,editing,reviewLoading,error,denied,readable,writable,reset,load,begin,beginCurrent,cancel,save,readCurrent,useCurrent}
}
