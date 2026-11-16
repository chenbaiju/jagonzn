import type {DeviceDiagnosticObservation} from './device-diagnostic-observations-api'

type ObservationStatus=Pick<DeviceDiagnosticObservation,'origin'|'processingStage'|'processingStatus'|'errorCode'>
type MessageStatus=Readonly<{kind:'success'|'error'|'unknown';label:'成功'|'错误'|'未记录'}>

/** 列表和详情共用业务状态；接入、预处理或投递ACK不能提升为业务成功。 */
export function diagnosticMessageStatus(value:ObservationStatus):MessageStatus {
 if(value.errorCode!==null||value.processingStatus==='FAILED'||value.processingStatus==='REJECTED')return {kind:'error',label:'错误'}
 if(value.origin==='PROTOCOL_OBSERVATION'&&value.processingStatus==='SUCCEEDED'&&['PERSISTENCE','DEVICE_REPLY'].includes(value.processingStage??''))return {kind:'success',label:'成功'}
 return {kind:'unknown',label:'未记录'}
}
