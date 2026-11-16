<script setup lang="ts">
import {computed,ref} from 'vue'
import {ruleKinds,ruleKindLabels,type RuleKind} from './rule-builder-draft'
const props=defineProps<{modelValue?:RuleKind;kinds?:readonly RuleKind[];disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:RuleKind]}>()
const host=ref<HTMLElement>(),visible=computed(()=>ruleKinds.filter(kind=>!props.kinds||props.kinds.includes(kind)))
const selected=computed(()=>props.modelValue&&visible.value.includes(props.modelValue)?props.modelValue:undefined)
function select(kind:RuleKind){if(!props.disabled)emit('update:modelValue',kind)}
function key(event:KeyboardEvent,index:number){
 if(props.disabled)return
 let next=index
 if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%visible.value.length
 else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index+visible.value.length-1)%visible.value.length
 else if(event.key==='Home')next=0
 else if(event.key==='End')next=visible.value.length-1
 else return
 event.preventDefault();select(visible.value[next]!);host.value?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
}
</script>
<template><div ref="host" class="rule-trigger-grid" role="radiogroup" aria-label="规则类型">
 <button v-for="(kind,index) in visible" :key="kind" type="button" role="radio" :aria-label="ruleKindLabels[kind].label" :aria-checked="modelValue===kind" :tabindex="selected===kind||!selected&&index===0?0:-1" :disabled="disabled" :class="{selected:modelValue===kind}" @click="select(kind)" @keydown="key($event,index)">
  <strong>{{ruleKindLabels[kind].label}}</strong><span>{{ruleKindLabels[kind].description}}</span>
 </button>
</div></template>
<style scoped>
.rule-trigger-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;min-width:0}.rule-trigger-grid button{appearance:none;min-height:96px;padding:16px;text-align:left;border:1px solid var(--el-border-color-lighter);background:var(--el-bg-color);color:var(--el-text-color-primary);border-radius:3px;cursor:pointer;display:flex;flex-direction:column;gap:7px;font:inherit}.rule-trigger-grid strong{font-size:14px;font-weight:500}.rule-trigger-grid span{font-size:12px;color:var(--el-text-color-secondary);line-height:1.5}.rule-trigger-grid button.selected{border-color:var(--el-color-primary);background:var(--el-color-primary-light-9)}.rule-trigger-grid button:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:2px}.rule-trigger-grid button:disabled{cursor:default;opacity:.6}
</style>
