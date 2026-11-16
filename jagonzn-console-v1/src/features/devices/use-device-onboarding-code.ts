import {computed,ref,shallowRef,watch,onScopeDispose} from 'vue'
import {can,currentProject,projectId} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,onIdentityChange} from '@/core/http'
import {useDeviceGuard} from './use-device-guard'
import {readDeviceOnboardingCode,type DeviceOnboardingCode} from './device-onboarding-code-api'

/** 当前设备的纯读弹窗；关闭、身份或范围变化立即清除码，晚到响应不能重开弹窗。 */
export function useDeviceOnboardingCode(device:()=>string,visible:()=>boolean){
 const shown=ref(false),data=shallowRef<DeviceOnboardingCode>(),busy=ref(false),error=ref(''),denied=ref(false)
 const allowed=computed(()=>can('device:read')&&!!currentProject.value&&projectId.value===currentProject.value.id&&!denied.value)
 const capture=useDeviceGuard(device)
 let generation=0,controller:AbortController|undefined
 function invalidate(){generation++;controller?.abort();controller=undefined;data.value=undefined;busy.value=false;error.value=''}
 function close(){invalidate();shown.value=false}
 async function reload(){
  if(!shown.value||!allowed.value||!visible()||busy.value)return
  invalidate();const intent=generation,check=capture(),project=projectId.value,id=device()
  const active=()=>intent===generation&&shown.value&&allowed.value&&visible()
  controller=new AbortController();busy.value=true
  try{const value=await readDeviceOnboardingCode(project,id,controller.signal);check();if(active())data.value=value}
  catch(cause){if(active()&&!(cause instanceof IdentityChanged)){
   if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){denied.value=true;close()}
   else error.value=errorMessage(cause)
  }}finally{if(intent===generation)busy.value=false}
 }
 function start(){if(!allowed.value||!visible())return;close();shown.value=true;void reload()}
 watch(()=>[device(),projectId.value,currentProject.value?.id,can('device:read')],()=>{close();denied.value=false},{flush:'sync'})
 watch(visible,value=>{if(!value)close()},{flush:'sync'})
 const dispose=onIdentityChange(()=>{close();denied.value=false})
 onScopeDispose(()=>{close();dispose()})
 return {shown,data,busy,error,allowed,start,close,reload}
}
