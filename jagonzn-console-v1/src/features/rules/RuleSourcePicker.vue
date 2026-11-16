<script setup lang="ts">
import {computed} from 'vue'
import type {ApiError} from '@/core/http'
import RuleSourceSetPicker from './RuleSourceSetPicker.vue'
import {sourceSelectionInput,type RuleSourceInput,type RuleSourceSelection} from './rule-source-selection'
const props=defineProps<{modelValue?:RuleSourceInput;disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:RuleSourceInput|undefined];busy:[value:boolean];denied:[cause:ApiError]}>()
const selected=computed(()=>props.modelValue?sourceSelectionInput(props.modelValue):undefined)
/** 旧页面的单值草稿形状兼容；多设备始终保留完整集合。 */
function update(value:RuleSourceSelection|undefined){if(!value){emit('update:modelValue',undefined);return}if(value.members.length===1){const member=value.members[0]!;emit('update:modelValue',{kind:value.kind,referenceId:member.referenceId,name:member.name})}else emit('update:modelValue',value)}
</script>
<template><RuleSourceSetPicker :model-value="selected" :disabled="disabled" @update:model-value="update" @busy="emit('busy',$event)" @denied="emit('denied',$event)"/></template>
