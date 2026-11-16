<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { projectId } from '@/core/session'
import { useResource } from '@/core/use-resource'
import { onIdentityChange, ApiError, errorMessage } from '@/core/http'
import { taskChoices, selectedTaskChoices, type TaskChoice, type TaskChoiceKind, type TaskChoicePage } from './task-choices'
const props=withDefaults(defineProps<{ modelValue: string[]; kind?: TaskChoiceKind; disabled?: boolean; multiple?: boolean; collapseTags?: boolean; maximum?: number; selectedOptions?: readonly TaskChoice[]; placeholder?: string; loader?: (cursor: string | undefined, signal: AbortSignal) => Promise<TaskChoicePage> }>(), { multiple:true, collapseTags:true, placeholder:'请选择' })
const emit=defineEmits<{ 'update:modelValue': [value:string[]]; denied:[cause:ApiError]; conflict:[cause:ApiError] }>()
const cursor=ref<string>(), options=ref<TaskChoice[]>([]), lookupError=ref('')
const resource=useResource(signal=>props.loader ? props.loader(cursor.value,signal) : taskChoices(projectId.value,props.kind!,cursor.value,signal))
let names:AbortController|undefined, generation=0
function clear(){generation++;names?.abort();options.value=[];lookupError.value='';cursor.value=undefined;resource.clear()}
const dispose=onIdentityChange(clear);onScopeDispose(()=>{names?.abort();dispose()})
watch([projectId,()=>props.kind,()=>props.loader],()=>{
 clear();if(!projectId.value || !props.kind && !props.loader)return
 void resource.reload()
 const selected=props.modelValue.slice();if(!selected.length || !props.kind)return
 const scope=generation;names=new AbortController();void selectedTaskChoices(projectId.value,props.kind,selected,names.signal).then(found=>{if(scope===generation)merge(found)}).catch(cause=>{if(scope!==generation || names?.signal.aborted)return;lookupError.value=errorMessage(cause);if(cause instanceof ApiError && [401,403].includes(cause.status))emit('denied',cause)})
},{immediate:true})
function merge(found:TaskChoice[]){const all=new Map(options.value.map(row=>[row.id,row]));for(const row of found)all.set(row.id,row);options.value=[...all.values()]}
watch(resource.data,value=>{if(value)merge(value.options)})
watch(resource.error,cause=>{if(cause instanceof ApiError && cause.status===409)emit('conflict',cause);if(cause instanceof ApiError && [401,403,404].includes(cause.status)){options.value=[];emit('denied',cause)}})
const choices=computed(()=>{const known=new Map(options.value.map(row=>[row.id,row]));for(const row of props.selectedOptions??[])if(props.modelValue.includes(row.id)&&typeof row.label==='string'&&row.label.trim())known.set(row.id,row);for(const id of props.modelValue.slice(0,20))if(!known.has(id))known.set(id,{id,label:id});return [...known.values()]})
function update(value:string|string[]|undefined){const ids=typeof value==='string'?[value]:value || [];emit('update:modelValue',[...new Set(ids)])}
async function more(){if(resource.loading.value || !resource.data.value?.hasMore)return;cursor.value=resource.data.value.nextCursor || undefined;await resource.reload()}
</script>
<template><div class="task-choice-select">
 <el-select :model-value="multiple === false ? modelValue[0] : modelValue" :multiple="multiple !== false" filterable clearable :collapse-tags="collapseTags" :collapse-tags-tooltip="collapseTags" :multiple-limit="maximum || 10000" :disabled="disabled" :loading="resource.loading.value" :placeholder="placeholder" class="task-runner-picker" @update:model-value="update">
  <el-option v-for="choice in choices" :key="choice.id" :label="choice.label" :value="choice.id">
   <template v-if="$slots.option" #default><slot name="option" :choice="choice" /></template>
  </el-option>
 </el-select>
 <p v-if="resource.error.value || lookupError" class="task-choice-error">{{ errorMessage(resource.error.value || lookupError) }} <el-button link @click="resource.reload">重新读取候选</el-button></p>
 <el-button v-if="resource.data.value?.hasMore" link :disabled="disabled || resource.loading.value" @click="more">加载更多</el-button>
</div></template>
<style scoped>.task-choice-select,.task-runner-picker{width:100%;min-width:0}.task-choice-error{margin:8px 0;color:var(--el-color-danger);overflow-wrap:anywhere}</style>
