import { identityEpoch, assertIdentity, IdentityChanged } from '@/core/http'
import {getCurrentScope,onScopeDispose} from 'vue'
import { projectId } from '@/core/session'
/** 同身份切换设备也属于请求作用域改变；旧写回执不得导航或刷新新设备。 */
export function useDeviceGuard(device:()=>string) {
  let disposed=false
  if(getCurrentScope())onScopeDispose(()=>{disposed=true})
  return ()=>{
    const epoch=identityEpoch(),project=projectId.value,id=device()
    return ()=>{assertIdentity(epoch);if(disposed||project!==projectId.value||id!==device())throw new IdentityChanged()}
  }
}

export function isDeviceScopeCurrent(check:()=>void){try{check();return true}catch(error){if(error instanceof IdentityChanged)return false;throw error}}
