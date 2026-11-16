<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {ApiError,IdentityChanged,identityEpoch,onIdentityChange} from '@/core/http'
import {can,projectId as activeProject,session} from '@/core/session'
import {definitionUuid} from './device-task-definition-port'
import {deviceSourceMembers,readRuleSourceNames,type RuleDeviceSourceContract} from './rule-source-api'
import {readTypeDevices} from '../device-types/type-devices-api'
import TaskChoiceSelect from './TaskChoiceSelect.vue'
import type {TaskChoicePage} from './task-choices'
const props=withDefaults(defineProps<{projectId:string;deviceSource:RuleDeviceSourceContract;modelValue?:string;disabled?:boolean}>(),{modelValue:''})
const emit=defineEmits<{'update:modelValue':[deviceId:string];busy:[value:boolean];denied:[cause:ApiError]}>()
const known=ref(new Set<string>()),error=ref(''),loading=ref(false),sealed=ref(false)
const source=computed(()=>{try{if(!['DEVICE','DEVICE_TYPE'].includes(String(props.deviceSource.kind)))return undefined;const ids=deviceSourceMembers(props.deviceSource);return{value:props.deviceSource,ids}}catch{return undefined}})
const sourceKey=computed(()=>source.value?source.value.value.kind+':'+source.value.ids.join(','):'invalid')
const scopeKey=computed(()=>props.projectId+':'+activeProject.value+':'+String(session.user?.accountId)+':'+sourceKey.value)
const permitted=computed(()=>!sealed.value&&!!source.value&&definitionUuid(props.projectId)&&props.projectId===activeProject.value&&can('rule:manage'))
const selected=computed(()=>props.modelValue?[props.modelValue]:[])
let alive=true,generation=0
function reset(){generation++;known.value=new Set();loading.value=false;error.value='';emit('update:modelValue','')}
watch([scopeKey,permitted],reset,{immediate:true,flush:'sync'})
watch(loading,value=>emit('busy',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{sealed.value=true;reset()})
onScopeDispose(()=>{alive=false;generation++;known.value=new Set();dispose();emit('busy',false)})
const loader=computed(()=>{
 const selectedSource=source.value,scope=scopeKey.value,project=props.projectId
 return async(cursor:string|undefined,signal:AbortSignal):Promise<TaskChoicePage>=>{
  if(!selectedSource||!permitted.value)throw new IdentityChanged()
  const turn=generation,epoch=identityEpoch(),current=()=>alive&&!signal.aborted&&turn===generation&&epoch===identityEpoch()&&scope===scopeKey.value&&permitted.value
  loading.value=true
  try{
   let result:TaskChoicePage
   if(selectedSource.value.kind==='DEVICE'){
    if(cursor!==undefined)throw new Error('模拟设备分页无效')
    const names=await readRuleSourceNames(project,selectedSource.value,signal)
    result={options:selectedSource.ids.map(id=>({id,label:names.get(id)!})),hasMore:false}
   }else{
    const page=cursor===undefined?1:/^[1-9][0-9]{0,4}$/.test(cursor)?Number(cursor):0
    if(page<1||page>10000)throw new Error('模拟设备分页无效')
    const value=await readTypeDevices(project,selectedSource.ids[0]!,{page,limit:24},signal)
    if(typeof value.total!=='string')throw new Error('模拟设备分页资料不完整')
    const hasMore=BigInt(value.total)>BigInt(page*24)
    result={options:value.items.map(row=>({id:row.id!,label:row.name!})),hasMore,nextCursor:hasMore?String(page+1):undefined}
   }
   if(!current())throw new IdentityChanged()
   known.value=new Set([...known.value,...result.options.map(row=>row.id)])
   return result
  }finally{if(current())loading.value=false}
 }
})
function choose(ids:string[]){
 if(props.disabled||!permitted.value||loading.value)return
 if(!ids.length){error.value='';emit('update:modelValue','');return}
 if(ids.length!==1||!known.value.has(ids[0]!)){error.value='请选择当前来源中的设备';emit('update:modelValue','');return}
 error.value='';emit('update:modelValue',ids[0]!)
}
function denied(cause:ApiError){sealed.value=true;reset();emit('denied',cause)}
</script>
<template><section class="event-preview-device-picker"><el-form-item label="选择模拟的设备"><TaskChoiceSelect v-if="permitted" :key="scopeKey" :model-value="selected" :loader="loader" :multiple="false" :maximum="1" placeholder="请选择设备" :disabled="disabled||loading" @update:model-value="choose" @denied="denied"/><p v-else-if="!source" role="alert">请选择有效的设备来源</p></el-form-item><p v-if="error" role="alert">{{error}}</p></section></template>
<style scoped>.event-preview-device-picker .el-form-item{margin-bottom:22px}.event-preview-device-picker :deep(.el-form-item__label){font-size:14px;font-weight:700;line-height:32px;color:#606266}.event-preview-device-picker p{margin:8px 0;font-size:13px;color:var(--el-color-danger)}</style>
