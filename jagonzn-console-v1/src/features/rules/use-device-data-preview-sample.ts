import {computed,inject,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {projectId as activeProject} from '@/core/session'
import {deviceDataSourceContextKey,type DeviceDataSourceContext,type DeviceDataSourceMember} from './device-data-source-context'
import {readSubdeviceDataPreviewSource,type SubdeviceDataPreviewSource} from './data-property-preview-api'

/** UI选中值保留整来源和实际成员，不是另造的HTTP DTO或保存准入。 */
export type DeviceDataPreviewSelection=Readonly<{context:DeviceDataSourceContext;member:DeviceDataSourceMember}>

/** DEVICE弹窗独立选样例；TYPE没有注入时继续原类型预览，绝不默认取首设备。 */
export function useDeviceDataPreviewSample(props:{projectId:()=>string;typeId:()=>string;scopeKey:()=>string;streamIdentifier:()=>string;disabled:()=>boolean;physical?:boolean}){
 const injected=inject(deviceDataSourceContextKey,undefined),context=computed(()=>injected?.value)
 const sampleDeviceId=ref(''),member=computed(()=>context.value?.members.find(row=>row.deviceId===sampleDeviceId.value))
 const physical=shallowRef<SubdeviceDataPreviewSource>(),loading=ref(false),error=ref('')
 let alive=true,generation=0,controller:AbortController|undefined
 function clear(){generation++;controller?.abort();physical.value=undefined;loading.value=false;error.value=''}
 function reset(){clear();sampleDeviceId.value=''}
 function current(selection:DeviceDataPreviewSelection|undefined){return alive&&(selection?context.value===selection.context&&member.value===selection.member:!context.value)}
 function capture():DeviceDataPreviewSelection|undefined{
  if(!context.value)return undefined
  if(!member.value)throw new Error('请选择模拟的设备')
  if(loading.value||props.physical&&member.value.profile.type.deviceKind==='SUB_DEVICE'&&!physical.value)throw new Error(error.value||'请等待样例设备读取完成')
  return {context:context.value,member:member.value}
 }
 watch([context,props.projectId,props.typeId,props.scopeKey],reset,{flush:'sync'})
 watch([member,props.streamIdentifier],async()=>{
  clear();const selected=member.value;if(!props.physical||!context.value||!selected||selected.profile.type.deviceKind!=='SUB_DEVICE'||props.disabled())return
  const selection={context:context.value,member:selected},s={generation,epoch:identityEpoch(),project:props.projectId(),scope:props.scopeKey(),stream:props.streamIdentifier()};controller=new AbortController();loading.value=true
  const valid=()=>current(selection)&&!props.disabled()&&s.generation===generation&&s.epoch===identityEpoch()&&activeProject.value===s.project&&props.projectId()===s.project&&props.scopeKey()===s.scope&&props.streamIdentifier()===s.stream
  try{const value=await readSubdeviceDataPreviewSource(s.project,selected.deviceTypeId,selected.deviceId,s.stream,valid,controller.signal);if(valid())physical.value=value}catch(cause){if(valid())error.value=errorMessage(cause)}finally{if(valid())loading.value=false}
 },{flush:'sync'})
 watch(props.disabled,value=>{if(value)reset()},{flush:'sync'})
 const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clear();dispose()})
 return {context,sampleDeviceId,member,physical,loading,error,capture,current}
}
