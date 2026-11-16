<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {projectId} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {devicesApi} from '@/features/devices/api'
import TaskChoiceSelect from './TaskChoiceSelect.vue'
import {definitionUuid} from './device-task-definition-port'
export type RuleActionDeviceTarget={id:string;name:string;projectId:string}
const props=withDefaults(defineProps<{initialId?:string;disabled?:boolean;placeholder?:string}>(),{placeholder:'请选择'})
const emit=defineEmits<{selected:[value:RuleActionDeviceTarget|undefined];busy:[value:boolean]}>()
const verified=ref<RuleActionDeviceTarget>(),busy=ref(false),error=ref('')
const selected=computed(()=>verified.value?[verified.value.id]:[])
const selectedOptions=computed(()=>verified.value?[{id:verified.value.id,label:verified.value.name}]:[])
let controller:AbortController|undefined,generation=0,alive=true
function clear(){generation++;controller?.abort();verified.value=undefined;busy.value=false;error.value='';emit('selected',undefined)}
watch(busy,value=>emit('busy',value),{immediate:true,flush:'sync'})
async function select(ids:string[]){
 if(!alive||props.disabled||busy.value)return
 const id=ids[0];clear();if(!ids.length)return
 if(ids.length!==1||!definitionUuid(id)||!projectId.value){error.value='请选择当前项目中的设备';return}
 const turn=++generation,project=projectId.value,epoch=identityEpoch();controller=new AbortController();busy.value=true
 try{const value=await devicesApi.read(project,id,controller.signal);if(!alive||turn!==generation||project!==projectId.value||epoch!==identityEpoch())return;if(value.id!==id||'projectId' in value&&value.projectId!==project||typeof value.name!=='string'||!value.name.trim())throw new Error('目标设备与当前项目不符，请重新选择');const target={id,name:value.name,projectId:project};verified.value=target;emit('selected',target)}catch(cause){if(alive&&turn===generation){verified.value=undefined;emit('selected',undefined);error.value=errorMessage(cause)}}finally{if(alive&&turn===generation)busy.value=false}
}
function deny(cause:ApiError){if(!alive)return;clear();error.value=errorMessage(cause)}
watch([projectId,()=>props.initialId],([project,id],previous)=>{clear();if(previous?.length&&project!==previous[0])return;if(id)void select([id])},{immediate:true})
const dispose=onIdentityChange(clear);onScopeDispose(()=>{alive=false;controller?.abort();dispose()})
</script>
<template><div class="rule-action-target"><TaskChoiceSelect :model-value="selected" :selected-options="selectedOptions" kind="devices" :placeholder="placeholder" :multiple="false" :maximum="1" :disabled="disabled||busy" @update:model-value="select" @denied="deny"/><p v-if="error" class="target-error" role="alert">{{error}}</p></div></template>
<style scoped>.rule-action-target{width:100%;min-width:0}.target-error{color:var(--el-color-danger);font-size:13px;line-height:18px;margin:8px 0 0}</style>
