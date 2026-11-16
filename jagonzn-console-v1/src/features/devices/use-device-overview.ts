import {onScopeDispose,watch} from 'vue'
import {can,projectId,session} from '@/core/session'
import {onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
/** 相同设备ID的会话切换和撤权也清除旧活动/统计，晚到响应不能回写。 */
export function useDeviceOverview<T>(device:()=>string,loader:(project:string,id:string,signal:AbortSignal)=>Promise<T>,range:()=>string=()=> ''){
 const resource=useResource(signal=>loader(projectId.value,device(),signal))
 function changed(){resource.clear();if(projectId.value&&device()&&can('device:read'))void resource.reload()}
 watch(()=>[projectId.value,device(),session.user?.accountId,can('device:read'),range()],changed,{immediate:true,flush:'sync'})
 const stop=onIdentityChange(changed);onScopeDispose(stop)
 return resource
}
