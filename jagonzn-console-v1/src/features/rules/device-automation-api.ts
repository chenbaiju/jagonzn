import {api} from '@/core/http'
import type {paths} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
import {automationFilters,type DeviceAutomationPort} from './device-automation-port'
function base(project:string,device:string,cursor:string|undefined,limit:number){
 if(!definitionUuid(project)||!definitionUuid(device)||![24,48].includes(limit)||cursor!=null&&(typeof cursor!=='string'||!cursor||cursor.length>8192))throw new Error('自动化设备范围或分页无效')
 return `/api/v1/projects/${project.toLowerCase()}/devices/${device.toLowerCase()}` as const
}
/** 只读既有设备范围，筛选由服务器在分页前执行。 */
export const deviceAutomationApi:DeviceAutomationPort={
 definitions:(project,device,filters,cursor,limit,signal)=>{
  const path=base(project,device,cursor,limit),checked=automationFilters(filters)
  const query:NonNullable<paths['/api/v1/projects/{projectId}/devices/{deviceId}/automations']['get']['parameters']['query']>={status:checked.status||undefined,keyword:checked.keyword||undefined,usage:checked.usage||undefined,cursor,limit}
  return api(`${path}/automations`,{query,signal})
 },
 history:(project,device,cursor,limit,signal)=>api(`${base(project,device,cursor,limit)}/automation-executions`,{query:{cursor,limit},signal})
}
