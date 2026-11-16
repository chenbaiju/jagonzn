<script setup lang="ts">
import {ref,watch} from 'vue'
import {definitionColors} from '@/features/device-types/definition-colors'
const props=defineProps<{modelValue:string;disabled:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:string]}>()
const shown=ref(false)
watch(()=>props.disabled,value=>{if(value)shown.value=false})
function choose(color:string){if(props.disabled)return;emit('update:modelValue',color);shown.value=false}
</script>
<template>
 <button type="button" class="group-color-trigger" aria-label="组颜色" :disabled="disabled" :style="{backgroundColor:modelValue||undefined}" @click="shown=true"><span v-if="!modelValue">×</span></button>
 <el-drawer v-model="shown" title="选择色彩" direction="rtl" size="300px" append-to-body class="group-color-drawer">
  <div class="group-color-grid"><button type="button" class="group-color-clear" aria-label="清除颜色" :disabled="disabled" @click="choose('')">×</button><button v-for="color in definitionColors" :key="color" type="button" :aria-label="`颜色 ${color}`" :aria-pressed="modelValue.toLowerCase()===color" :title="color" :style="{backgroundColor:color}" :disabled="disabled" @click="choose(color)"/></div>
 </el-drawer>
</template>
<style scoped>
.group-color-trigger{width:32px;height:32px;padding:0;border:1px solid #dcdfe6;border-radius:4px;background:#fff;color:#a8abb2;cursor:pointer;font-size:20px;line-height:28px}.group-color-grid{display:grid;grid-template-columns:repeat(6,30px);column-gap:13px;row-gap:20px}.group-color-grid button{width:30px;height:30px;padding:0;border:0;border-radius:5px;cursor:pointer}.group-color-grid button:hover,.group-color-grid button[aria-pressed=true]{outline:2px solid #409eff;outline-offset:2px}.group-color-grid .group-color-clear{border:1px solid #dcdfe6;background:#fff;color:#a8abb2;font-size:20px}
</style>
<style>
.group-color-drawer .el-drawer__header{padding:20px 20px 0;margin-bottom:32px;color:#606266}.group-color-drawer .el-drawer__title{color:#606266;font-size:16px;font-weight:400;line-height:24px}.group-color-drawer .el-drawer__body{padding:20px 23px 30px 30px}
</style>
