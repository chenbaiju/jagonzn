import {api} from '@/core/http'
import type {paths} from '@/core/contracts'
import {devicePath} from './api'
import type {ObservationQuery} from './property-observations-json'
/** 正式481路径及query类型约束的有界原文字节读取，避免JSON数值先经double。 */
export function propertyObservations(query:ObservationQuery,cursor:string|undefined,signal?:AbortSignal,maximum=4194304){
 if(!Number.isSafeInteger(maximum)||maximum<1||maximum>4194304)throw new Error('历史读取预算已用尽，请缩小时间范围')
 const parameters:NonNullable<paths['/api/v1/projects/{projectId}/devices/{deviceId}/property-observations/history']['get']['parameters']['query']>={expectedModelVersionId:query.model,propertyKey:query.property,sourceKind:query.source,from:query.from,to:query.to,limit:query.limit,cursor,includeActor:query.includeActor}
 return api<Uint8Array>(`${devicePath(query.project,query.device)}/property-observations/history`,{query:parameters,responseType:'bytes',maxResponseBytes:maximum,signal})
}
