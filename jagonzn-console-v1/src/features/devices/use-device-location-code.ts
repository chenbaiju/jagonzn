import {computed,ref,watch,onScopeDispose} from 'vue'
import {currentProject,projectId,can} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,onIdentityChange} from '@/core/http'
import {useDeviceGuard} from './use-device-guard'
import {defaultAppProjectAddress} from './app-project-entry'
import {readLocationCode} from './device-location-code'

/** 弹窗关闭、地址变化和作用域变化均使原请求失效，旧结果不重新展示。 */
export function useDeviceLocationCode(device:()=>string,visible:()=>boolean){
 const shown=ref(false),address=ref(''),payload=ref(''),error=ref(''),busy=ref(false),denied=ref(false)
 const allowed=computed(()=>can('device:read')&&can('enduser:manage')&&!!currentProject.value&&projectId.value===currentProject.value.id&&!denied.value)
 const capture=useDeviceGuard(device)
 let generation=0,controller:AbortController|undefined
 function invalidate(){generation++;controller?.abort();controller=undefined;payload.value='';error.value='';busy.value=false}
 function close(){invalidate();shown.value=false;address.value=''}
 function start(){if(!allowed.value||!visible())return;close();address.value=defaultAppProjectAddress(window.location.hostname);shown.value=true}
 watch(address,invalidate,{flush:'sync'})
 watch(()=>[device(),projectId.value,currentProject.value?.id,currentProject.value?.projectCode,can('device:read'),can('enduser:manage')],()=>{close();denied.value=false},{flush:'sync'})
 watch(visible,value=>{if(!value)close()},{flush:'sync'})
 const dispose=onIdentityChange(()=>{close();denied.value=false})
 onScopeDispose(()=>{close();dispose()})
 async function prepare(){
  if(!shown.value||!allowed.value||!visible()||busy.value||!currentProject.value)return
  invalidate();const intent=generation,check=capture(),project={...currentProject.value},id=device(),origin=address.value
  const active=()=>intent===generation&&shown.value&&allowed.value&&visible()
  controller=new AbortController();busy.value=true
  try{const result=await readLocationCode(project,origin,id,controller.signal);check();if(active())payload.value=result}
  catch(cause){if(active()&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){denied.value=true;close()}else error.value=errorMessage(cause)}}
  finally{if(intent===generation)busy.value=false}
 }
 return {shown,address,payload,error,busy,allowed,start,close,prepare}
}
