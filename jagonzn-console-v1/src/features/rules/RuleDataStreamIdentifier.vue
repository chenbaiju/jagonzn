<script setup lang="ts">
import {computed,watch} from 'vue'
import {projectId} from '@/core/session'
import {errorMessage} from '@/core/http'
import {useResource} from '@/core/use-resource'
import {devicesApi} from '@/features/devices/api'
import {dataStreamTransport,type DataStreamItem} from '@/features/device-types/data-stream-publication-api'
import {definitionUuid} from './device-task-definition-port'
import {sourceIds,sourceSelectionKey,type RuleSourceSelection} from './rule-source-selection'
const props=defineProps<{modelValue:string;source?:RuleSourceSelection;disabled?:boolean;choices?:readonly DataStreamItem[]}>()
const emit=defineEmits<{'update:modelValue':[value:string]}>()
const selectionKey=computed(()=>props.source?sourceSelectionKey(props.source):'')
async function bounded<T,R>(items:readonly T[],read:(item:T)=>Promise<R>):Promise<R[]>{const result:R[]=new Array(items.length);let offset=0;await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{while(offset<items.length){const at=offset++;result[at]=await read(items[at]!)}}));return result}
const resource=useResource(async signal=>{
 const source=props.source,project=projectId.value;if(!source||props.choices!==undefined)return []
 const members=sourceIds(source)
 const types=source.kind==='DEVICE_TYPE'?members:await bounded(members,async id=>{signal.throwIfAborted();const device=await devicesApi.read(project,id,signal);if(device.id?.toLowerCase()!==id||!definitionUuid(device.deviceTypeId)||'projectId' in device&&device.projectId!==project)throw new Error('当前来源设备没有可读取的类型数据流');return device.deviceTypeId.toLowerCase()})
 const published=await bounded([...new Set(types)],async type=>{signal.throwIfAborted();return (await dataStreamTransport.read(project,type,signal)).publication?.definition.streams.filter(stream=>!stream.disabled)??[]})
 if(!published.length)return []
 return published[0]!.filter(stream=>published.every(streams=>streams.some(row=>row.identifier===stream.identifier&&row.format===stream.format)))
})
watch([projectId,selectionKey,()=>props.choices],()=>{resource.clear();if(projectId.value&&props.source&&props.choices===undefined)void resource.reload()},{immediate:true})
function suggestions(query:string,done:(items:(DataStreamItem&{value:string})[])=>void){const text=query.toLowerCase();done((props.choices??resource.data.value??[]).filter(stream=>stream.identifier.toLowerCase().startsWith(text)).map(stream=>({...stream,value:stream.identifier})))}
</script>
<template><div class="rule-data-stream-identifier"><el-autocomplete :model-value="modelValue" aria-label="自定义数据流标识符" :fetch-suggestions="suggestions" :disabled="disabled" placeholder="填写自定义数据流标识符" popper-class="rule-stream-autocomplete" @update:model-value="emit('update:modelValue',$event)"><template #default="{item}"><div class="identifier">{{item.identifier}}</div><span class="name">{{item.name}}</span></template></el-autocomplete><p v-if="resource.error.value" role="note">{{errorMessage(resource.error.value)}}</p></div></template>
<style scoped>.rule-data-stream-identifier,.rule-data-stream-identifier :deep(.el-autocomplete){width:100%;min-width:0}.rule-data-stream-identifier p{font-size:13px;line-height:18px;color:#888;margin:8px 0 0}.identifier{line-height:20px}.name{font-size:12px;line-height:18px;color:#b4b4b4}</style>
