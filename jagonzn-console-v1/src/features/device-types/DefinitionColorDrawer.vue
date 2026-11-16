<script setup lang="ts">
import {ref,watch} from 'vue'
import {definitionColors} from './definition-colors'
const props=withDefaults(defineProps<{modelValue:string;label:string;defaultColor?:string;active?:boolean;disabled?:boolean}>(),{active:true,defaultColor:'#2f4153'})
const emit=defineEmits<{'update:modelValue':[value:string]}>()
const shown=ref(false)
function update(value:string,close=false){if(props.disabled||!props.active)return;emit('update:modelValue',value);if(close)shown.value=false}
watch([()=>props.active,()=>props.disabled],([active,disabled])=>{if(!active||disabled)shown.value=false})
</script>
<template><el-button class="definition-color-trigger" :aria-label="`选择${label}`" :title="modelValue||'选择色彩'" :disabled="disabled||!active" :style="{backgroundColor:modelValue||defaultColor}" @click="shown=true"/>
 <el-drawer v-model="shown" @close="shown=false" :data-picker-open="shown" title="选择色彩" direction="rtl" size="300px" append-to-body class="definition-color-drawer definition-picker-drawer" :close-on-click-modal="true"><div class="definition-color-grid"><button v-for="(color,index) in definitionColors" :key="index" type="button" :aria-label="`颜色 ${color}`" :aria-pressed="modelValue.toLowerCase()===color" :title="color" :style="{backgroundColor:color}" :disabled="disabled" @click="update(color,true)"/></div><div class="definition-custom-color"><el-input :model-value="modelValue" :aria-label="label" placeholder="#RRGGBB" maxlength="7" :disabled="disabled" @update:model-value="update(String($event))"/><el-button :disabled="disabled" @click="update('',true)">清除颜色</el-button></div></el-drawer>
</template>
<style scoped>
.definition-color-trigger.el-button{width:32px;height:32px;padding:0;margin:0;border:0;border-radius:3px;flex-shrink:0}
.definition-color-grid{display:grid;grid-template-columns:repeat(6,30px);column-gap:13.4px;row-gap:20px}
.definition-color-grid>button{width:30px;height:30px;padding:0;border:0;border-radius:5px;cursor:pointer}
.definition-color-grid>button:hover,.definition-color-grid>button[aria-pressed=true]{outline:2px solid var(--tl-primary);outline-offset:3px}
.definition-custom-color{display:flex;gap:8px;margin-top:30px}.definition-custom-color :deep(.el-input){min-width:0;flex:1}.definition-custom-color :deep(.el-button){height:32px;padding:8px;font-size:12px}
</style>
