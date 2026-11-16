<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {projectId} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {devicesApi} from '@/features/devices/api'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import TaskChoiceSelect from './TaskChoiceSelect.vue'
import {sourceIds,type RuleSourceKind,type RuleSourceMember,type RuleSourceSelection} from './rule-source-selection'
const props=defineProps<{modelValue?:RuleSourceSelection;disabled?:boolean;fixedKind?:RuleSourceKind;inline?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:RuleSourceSelection|undefined];busy:[value:boolean];denied:[cause:ApiError]}>()
const kind=ref<RuleSourceKind>(),selected=ref<string[]>([]),verified=ref<RuleSourceMember[]>([]),busy=ref(false),error=ref('')
const choicesKind=computed(()=>kind.value==='DEVICE'?'devices':'device-types'),selectedOptions=computed(()=>verified.value.map(row=>({id:row.referenceId,label:row.name})))
let controller:AbortController|undefined,turn=0,alive=true,lastEmitted=''
function clear(){turn++;controller?.abort();busy.value=false;selected.value=[];verified.value=[];error.value='';lastEmitted='';emit('update:modelValue',undefined)}
function reset(){clear();kind.value=props.fixedKind}
watch(busy,value=>emit('busy',value),{immediate:true,flush:'sync'})
function key(value:RuleSourceSelection){return value.kind+':'+sourceIds(value).join(',')}
watch(()=>props.modelValue,value=>{if(!value)return;try{const signature=key(value);if(signature===lastEmitted)return;if(props.fixedKind&&value.kind!==props.fixedKind)throw new Error('来源类型不能修改');kind.value=value.kind;void verify(sourceIds(value),true)}catch(cause){clear();error.value=errorMessage(cause)}},{immediate:true})
watch([projectId,()=>props.fixedKind],reset)
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;controller?.abort();dispose();emit('busy',false)})
function changeKind(value:unknown){if(props.disabled||busy.value||props.fixedKind||value!=='DEVICE'&&value!=='DEVICE_TYPE')return;clear();kind.value=value}
async function verify(ids:string[],initial=false){
 if(!alive||!initial&&(props.disabled||busy.value)||!kind.value)return
 const currentKind=kind.value;clear();kind.value=currentKind
 if(!ids.length)return
 let values:string[];try{values=sourceIds({kind:currentKind,members:ids.map(referenceId=>({referenceId,name:''}))})}catch(cause){error.value=errorMessage(cause);return}
 const generation=++turn,project=projectId.value,epoch=identityEpoch();controller=new AbortController();const signal=controller.signal;busy.value=true;let offset=0;const names=new Map<string,string>()
 try{await Promise.all(Array.from({length:Math.min(4,values.length)},async()=>{while(offset<values.length){signal.throwIfAborted();const id=values[offset++]!,value=await(currentKind==='DEVICE'?devicesApi.read(project,id,signal):devicesApi.type(project,id,signal));if(value.id?.toLowerCase()!==id||'projectId' in value&&value.projectId!==project||typeof value.name!=='string'||!value.name.trim())throw new Error('设备来源与当前项目不符，请重新选择');names.set(id,value.name)}}));if(!alive||generation!==turn||project!==projectId.value||epoch!==identityEpoch())return;const members=values.map(referenceId=>({referenceId,name:names.get(referenceId)!}));selected.value=values;verified.value=members;const value={kind:currentKind,members};lastEmitted=key(value);emit('update:modelValue',value)}catch(cause){if(alive&&generation===turn){controller?.abort();selected.value=[];verified.value=[];error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))emit('denied',cause)}}finally{if(alive&&generation===turn)busy.value=false}
}
function deny(cause:ApiError){clear();error.value=errorMessage(cause);emit('denied',cause)}
</script>
<template>
 <div class="rule-source-set-picker" :class="{inline}">
  <el-form-item v-if="!fixedKind" label="设备来源类型">
   <el-radio-group :model-value="kind" :disabled="disabled||busy" aria-label="设备来源类型" @update:model-value="changeKind">
    <el-radio value="DEVICE">设备</el-radio>
    <el-radio value="DEVICE_TYPE">设备类型</el-radio>
   </el-radio-group>
  </el-form-item>
  <el-form-item v-if="kind" :label="inline?undefined:'选择来源'" class="source-choice">
   <TaskChoiceSelect :key="choicesKind" :model-value="selected" :selected-options="selectedOptions" :kind="choicesKind" :multiple="kind==='DEVICE'" :maximum="kind==='DEVICE'?64:1" :disabled="disabled||busy" @update:model-value="verify" @denied="deny">
    <template v-if="!inline" #option="{ choice }">
     <span class="source-option" :class="{ 'source-option--device': kind==='DEVICE' }">
      <ReferenceIcon glyph="󰆧" />
      <span class="source-option__name">{{ choice.label }}</span>
     </span>
    </template>
   </TaskChoiceSelect>
  </el-form-item>
  <p v-if="error" role="alert" class="source-error">{{error}}</p>
 </div>
</template>
<style scoped>
.source-choice { width: 350px; max-width: 100%; }
.inline .source-choice { width: 100%; }
.source-error { color: var(--el-color-danger); font-size: 13px; margin: 8px 0; }
.rule-source-set-picker :deep(.el-form-item) { margin-bottom: 22px; }
.rule-source-set-picker :deep(.el-radio) { height: 28px; }
.inline :deep(.el-form-item) { margin-bottom: 0; }
.source-option { display: flex; align-items: center; gap: 12px; }
.source-option .reference-icon { color: #999; }
.source-option--device .reference-icon { font-size: 26px; }
.source-option--device .source-option__name { font-weight: 700; }
.source-option__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
</style>
