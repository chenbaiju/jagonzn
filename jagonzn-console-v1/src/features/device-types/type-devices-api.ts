import {devicesApi,type Device,type DirectoryQuery} from '../devices/api'
import {directoryDisplayFacts} from '../devices/directory-display-facts'
import {directoryAlarmStatus} from '../devices/directory-alarm-status'
import {referenceVersion} from '../devices/reference-profile'
export const typeDeviceUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export type TypeDeviceQuery=Readonly<{page:number;limit:number;keyword?:string;online?:''|'ONLINE'|'OFFLINE'}>
type Directory=Awaited<ReturnType<typeof devicesApi.directory>>
export function typeDeviceQuery(query:TypeDeviceQuery,type?:string):DirectoryQuery {
 if(!Number.isSafeInteger(query.page)||query.page<1||query.page>10000||![24,48,72,96].includes(query.limit)
  ||query.keyword!==undefined&&(typeof query.keyword!=='string'||query.keyword.trim().length>128)
  ||query.online!==undefined&&!['','ONLINE','OFFLINE'].includes(query.online)||type!==undefined&&!typeDeviceUuid.test(type))throw new Error('设备读取范围无效')
 return {page:query.page,limit:query.limit,order:'CREATED_ASC',deviceTypeIds:type?[type]:undefined,keyword:query.keyword?.trim()||undefined,
  statuses:query.online==='ONLINE'?['ONLINE']:query.online==='OFFLINE'?['OFFLINE','INACTIVE']:undefined}
}
/** 只核本页实际使用的设备、范围、总数和展示事实；错误不能降为空态。 */
export function decodeTypeDevices(value:Directory,query:TypeDeviceQuery,type?:string){
 if(!value||!referenceVersion(value.total)||value.page!==query.page||value.limit!==query.limit||!Array.isArray(value.items))throw new Error('设备分页资料不完整')
 const remaining=BigInt(value.total)-BigInt(query.page-1)*BigInt(query.limit)
 const expected=remaining<=0n?0:Number(remaining>BigInt(query.limit)?BigInt(query.limit):remaining)
 if(value.items.length!==expected||new Set(value.items.map(item=>item.id)).size!==value.items.length
  ||value.items.some(item=>!item.id||!typeDeviceUuid.test(item.id)||typeof item.name!=='string'||!item.name.trim()
   ||!['ONLINE','OFFLINE','INACTIVE'].includes(item.status||'')
   ||item.deviceTypeId!=null&&!typeDeviceUuid.test(item.deviceTypeId)||type!==undefined&&item.deviceTypeId!==type))throw new Error('设备目录身份或类型范围不匹配')
 return {...value,items:value.items as Device[],display:directoryDisplayFacts(value.items,value.displayFacts),alarms:directoryAlarmStatus(value.items,value.alarmObservations)}
}
export async function readTypeDevices(project:string,type:string,query:TypeDeviceQuery,signal:AbortSignal){
 if(!typeDeviceUuid.test(project))throw new Error('请选择当前项目')
 const request=typeDeviceQuery(query,type)
 return decodeTypeDevices(await devicesApi.directory(project,request,signal),query,type)
}
/** 添加弹层明确读取项目内的候选页，不将某一页过滤后冒充完整候选。 */
export async function readTypeDeviceCandidates(project:string,type:string,query:TypeDeviceQuery,signal:AbortSignal){
 if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(type))throw new Error('设备候选读取范围无效')
 return decodeTypeDevices(await devicesApi.directory(project,{...typeDeviceQuery(query),assignableToDeviceTypeId:type},signal),query)
}
