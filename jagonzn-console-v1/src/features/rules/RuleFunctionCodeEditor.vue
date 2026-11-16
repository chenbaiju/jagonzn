<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import type {FunctionEditorEngine} from './rule-function-editor-engine'
const props=withDefaults(defineProps<{modelValue:string;ariaLabel:string;disabled?:boolean;readonly?:boolean;height?:number}>(),{disabled:false,readonly:false,height:300})
const emit=defineEmits<{'update:modelValue':[value:string];busy:[value:boolean]}>()
const host=ref<HTMLElement>(),ready=ref(false),failed=ref(false),formatting=ref(false),error=ref('')
const blocked=computed(()=>props.disabled||props.readonly||formatting.value)
let engine:FunctionEditorEngine|undefined,live=true,generation=0,task=0
watch(formatting,value=>emit('busy',value),{immediate:true,flush:'sync'})
watch(()=>props.modelValue,value=>{generation++;error.value='';engine?.setValue(value)})
watch([()=>props.disabled,()=>props.readonly,()=>props.ariaLabel,formatting],()=>engine?.configure({ariaLabel:props.ariaLabel,disabled:props.disabled||formatting.value,readonly:props.readonly}))
async function load(){
 failed.value=false
 try{
  const module=await import('./rule-function-editor-engine')
  if(!live||!host.value)return
  engine=module.createFunctionEditor(host.value,props.modelValue,{ariaLabel:props.ariaLabel,disabled:props.disabled||formatting.value,readonly:props.readonly},value=>{if(live&&!blocked.value)emit('update:modelValue',value)})
  ready.value=true;await nextTick();if(live)engine.measure()
 }catch{if(live)failed.value=true}
}
async function format(){
 if(blocked.value)return
 const source=props.modelValue,revision=generation,id=++task;formatting.value=true;error.value=''
 const current=()=>live&&id===task&&revision===generation&&source===props.modelValue&&!props.disabled&&!props.readonly
 try{
  if(new TextEncoder().encode(source).length>65536)throw new Error('云函数超过65536字节，请检查修改。')
  // 与原站一样给当前语法标注一次更新机会；Babel仍独立解析当前全文。
  await new Promise(resolve=>setTimeout(resolve,500))
  if(!current())return
  if(engine?.errors().length){error.value='函数代码存在语法错误，请检查修改。';return}
  const {formatFunctionSource}=await import('./rule-function-format')
  const value=await formatFunctionSource(source)
  if(current())emit('update:modelValue',value)
 }catch(cause){if(current())error.value=cause instanceof Error&&cause.message.startsWith('云函数超过')?cause.message:'函数代码格式化失败，请检查修改。'}
 finally{if(live&&id===task)formatting.value=false}
}
onMounted(load)
onBeforeUnmount(()=>{live=false;task++;engine?.destroy();engine=undefined;emit('busy',false)})
</script>
<template><div class="function-code-editor">
 <div v-if="!readonly" class="function-editor-tools"><button type="button" :disabled="blocked" @click="format"><ReferenceIcon glyph="󰚔"/> 整理</button></div>
 <div class="function-editor-body" :style="{height:`${height}px`}"><div v-show="ready" ref="host" class="function-editor-host"/><textarea v-if="!ready" :value="modelValue" :aria-label="ariaLabel" :disabled="disabled||formatting" :readonly="readonly" spellcheck="false" @input="emit('update:modelValue',($event.target as HTMLTextAreaElement).value)"/><div v-if="failed" class="function-editor-load-error">编辑器加载失败，草稿已保留。<button type="button" @click="load">重新加载</button></div></div>
 <p v-if="error" role="alert">{{error}}</p>
</div></template>
<style scoped>
.function-code-editor{position:relative;width:100%;min-width:0}.function-editor-tools{position:absolute;top:-30px;right:0;height:22px;line-height:22px}.function-editor-tools button{font:inherit;padding:0;border:0;background:none;color:#606266;font-size:14px;cursor:pointer}.function-editor-tools button:disabled{color:#c0c4cc;cursor:default}.function-editor-tools .reference-icon{font-size:14px}.function-editor-body{position:relative;width:100%;background:#272822;color:#f8f8f2}.function-editor-host{height:100%;width:100%}.function-editor-body textarea{width:100%;height:100%;border:0;border-radius:0;outline:none;resize:none;background:#272822;color:#f8f8f2;padding:0 4px;font:16px/normal Monaco,Menlo,"Ubuntu Mono",Consolas,source-code-pro,monospace}.function-editor-load-error{position:absolute;bottom:0;padding:4px;background:#272822;color:#f8f8f2;font-size:12px}.function-editor-load-error button{border:0;background:none;color:#66d9ef;cursor:pointer}.function-code-editor>p{color:#f56c6c;font-size:13px;line-height:18px;margin:6px 0 0}
</style>
