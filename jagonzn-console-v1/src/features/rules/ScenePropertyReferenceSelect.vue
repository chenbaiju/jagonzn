<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,projectId} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import RuleActionDeviceTarget,{type RuleActionDeviceTarget as Target} from './RuleActionDeviceTarget.vue'
import {readDevicePropertyChoices,type DevicePropertyChoice} from './device-property-choices'
type Reference={refDeviceId:string;refPropertyKey:string}
const props=defineProps<{initial?:Reference;propertyType:DevicePropertyChoice['type'];disabled?:boolean}>()
const initialReference=props.initial?{...props.initial}:undefined
const emit=defineEmits<{change:[value:Reference|undefined];busy:[value:boolean];denied:[cause:ApiError]}>()
const device=ref<Target>(),property=ref(''),choices=ref<DevicePropertyChoice[]>([]),loading=ref(false),targetBusy=ref(false),error=ref('')
const readable=computed(()=>can('device:read')),busy=computed(()=>loading.value||targetBusy.value)
const typeLabel=computed(()=>({NUMBER:'数值',SWITCH:'布尔',TEXT:'文本',ENUM:'枚举'}[props.propertyType]))
let controller:AbortController|undefined,generation=0,alive=true,initialApplied=false
function reset(){generation++;controller?.abort();device.value=undefined;property.value='';choices.value=[];loading.value=false;targetBusy.value=false;error.value='';emit('change',undefined)}
function current(turn:number,project:string,epoch:number){return alive&&turn===generation&&readable.value&&project===projectId.value&&epoch===identityEpoch()}
async function selected(target:Target|undefined){
 reset();if(!target||!readable.value)return
 if(target.projectId!==projectId.value){error.value='请选择当前项目中的设备';return}
 device.value=target;const turn=++generation,project=projectId.value,epoch=identityEpoch(),restore=!initialApplied&&initialReference?.refDeviceId===target.id
 initialApplied=true;controller=new AbortController();loading.value=true
 try{
  const found=await readDevicePropertyChoices(project,target.id,undefined,controller.signal)
  if(!current(turn,project,epoch))return
  choices.value=found.filter(row=>row.type===props.propertyType)
  if(restore&&initialReference){if(choices.value.some(row=>row.key===initialReference.refPropertyKey))choose(initialReference.refPropertyKey);else error.value='原引用属性与当前设备物模型不符，请重新选择'}
 }catch(cause){if(current(turn,project,epoch)){error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))emit('denied',cause)}}finally{if(current(turn,project,epoch))loading.value=false}
}
function choose(key:string){
 if(props.disabled||!readable.value)return
 if(!device.value||device.value.projectId!==projectId.value||!choices.value.some(row=>row.key===key)){property.value='';emit('change',undefined);return}
 property.value=key;error.value='';emit('change',{refDeviceId:device.value.id,refPropertyKey:key})
}
watch(busy,value=>emit('busy',value),{immediate:true,flush:'sync'})
watch([projectId,readable],reset)
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;generation++;controller?.abort();dispose()})
</script>
<template><div class="scene-property-reference"><div v-if="readable" class="ref-selector-row">
 <RuleActionDeviceTarget :initial-id="initialReference?.refDeviceId" :disabled="disabled" placeholder="选择设备" @selected="selected" @busy="targetBusy=$event"/>
 <el-select v-if="device&&!loading" :model-value="property" :aria-label="`引用${typeLabel}属性`" :placeholder="`选择${typeLabel}属性`" size="small" filterable clearable :disabled="disabled||busy" @update:model-value="choose"><el-option v-for="row in choices" :key="row.key" :label="row.name" :value="row.key"/></el-select>
 </div><p v-if="error" class="reference-error" role="alert">{{error}}</p></div></template>
<style scoped>.scene-property-reference{min-width:0;flex:1}.ref-selector-row{display:flex;align-items:flex-start;gap:10px;min-width:0}.ref-selector-row>.rule-action-target,.ref-selector-row>.el-select{min-width:0;flex:1;width:50%}.ref-selector-row :deep(.el-select){--el-component-size:24px}.reference-error{margin:4px 0 0;color:var(--el-color-danger);font-size:12px;line-height:18px}</style>
