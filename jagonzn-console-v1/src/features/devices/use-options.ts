import { ref, watch, onScopeDispose } from 'vue'
import { projectId, session } from '@/core/session'
import {onIdentityChange} from '@/core/http'
import { useResource } from '@/core/use-resource'
import { devicesApi, type DeviceType } from './api'
/** 类型选项显式追加游标页；不以有界第一页冒充完整目录。 */
export function useDeviceOptions() {
  const cursor = ref<string>(), allTypes = ref<DeviceType[]>([])
  const types = useResource(signal => devicesApi.types(projectId.value, cursor.value, signal))
  const groups = useResource(signal => devicesApi.groups(projectId.value, signal))
  watch(types.data, data => { if (data) allTypes.value = cursor.value ? [...allTypes.value, ...(data.items || [])] : data.items || [] })
  function clear(){types.clear();groups.clear();allTypes.value=[];cursor.value=undefined}
  const dispose=onIdentityChange(clear);onScopeDispose(dispose)
  watch(()=>[projectId.value,session.user?.accountId,session.transitioning],()=>{clear();if(projectId.value&&!session.transitioning){void types.reload();void groups.reload()}},{immediate:true,flush:'sync'})
  function moreTypes() { if (types.data.value?.nextCursor) { cursor.value = types.data.value.nextCursor; void types.reload() } }
  return { types, groups, allTypes, moreTypes }
}
