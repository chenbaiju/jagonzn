<script setup lang="ts">
import {computed} from 'vue'
import {ArrowUp,ArrowDown,CircleClose} from '@element-plus/icons-vue'
import {validExtensionScalar,type ExtensionField} from './device-extensions-api'
const props=defineProps<{field:ExtensionField;modelValue:string|null;disabled?:boolean;label?:string;reference?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:string|null]}>()
function update(value:unknown){if(!props.disabled)emit('update:modelValue',typeof value==='string'?value:null)}
const checked=computed(()=>(props.modelValue??props.field.defaultValue)==='true')
/** 步进只在十进制整数字符串上运算，手输大数和尾随小数位不经浮点数。 */
function step(direction:1|-1){
 const value=props.modelValue??props.field.defaultValue??'0'
 if(props.disabled||!validExtensionScalar(props.field,value))return
 const negative=value.startsWith('-'),absolute=negative?value.slice(1):value,[integer,fraction='']=absolute.split('.'),scale=10n**BigInt(fraction.length)
 const next=(negative?-1n:1n)*BigInt(integer!+fraction)+BigInt(direction)*scale
 const digits=(next<0n?-next:next).toString().padStart(fraction.length+1,'0')
 const result=(next<0n?'-':'')+(fraction?digits.slice(0,-fraction.length)+'.'+digits.slice(-fraction.length):digits)
 if(validExtensionScalar(props.field,result))update(result)
}
</script>
<template><div class="extension-scalar-input" :class="{'scalar-reference':reference}">
 <el-switch v-if="reference&&field.kind==='SWITCH'" :model-value="checked" :aria-label="label||field.name" :disabled="disabled" @update:model-value="update($event?'true':'false')"/>
 <div v-else-if="reference&&field.kind==='NUMBER'" class="scalar-number"><el-input :model-value="modelValue??''" inputmode="decimal" :aria-label="label||field.name" :placeholder="field.defaultValue??''" :maxlength="128" :disabled="disabled" @update:model-value="update" @keydown.up.prevent="step(1)" @keydown.down.prevent="step(-1)"/><div class="scalar-number-controls"><button type="button" :aria-label="`增加${label||field.name}`" :disabled="disabled" @click="step(1)"><el-icon><ArrowUp/></el-icon></button><button type="button" :aria-label="`减少${label||field.name}`" :disabled="disabled" @click="step(-1)"><el-icon><ArrowDown/></el-icon></button></div></div>
 <el-select v-else-if="field.kind==='SWITCH'||field.kind==='SELECT'" :model-value="modelValue" :empty-values="[undefined]" :aria-label="label||field.name" :disabled="disabled" @update:model-value="update">
  <el-option :value="null" :label="field.defaultValue===null?'未设置':'使用默认值'"/>
  <template v-if="field.kind==='SWITCH'"><el-option value="true" :label="field.onLabel||'开启'"/><el-option value="false" :label="field.offLabel||'关闭'"/></template>
  <el-option v-for="option in field.kind==='SELECT'?field.options:[]" :key="option" :value="option" :label="option"/>
 </el-select>
 <el-date-picker v-else-if="field.kind==='DATE'" :model-value="modelValue" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" :aria-label="label||field.name" :placeholder="field.defaultValue||'选择日期'" :disabled="disabled" @update:model-value="update"/>
 <el-time-picker v-else-if="field.kind==='TIME'" :model-value="modelValue" format="HH:mm" value-format="HH:mm" :aria-label="label||field.name" :placeholder="field.defaultValue||'选择时间'" :disabled="disabled" @update:model-value="update"/>
 <el-input v-else :model-value="modelValue??''" :type="field.kind==='PHONE'?'tel':'text'" :inputmode="field.kind==='NUMBER'?'decimal':field.kind==='PHONE'?'tel':'text'" :aria-label="label||field.name" :placeholder="field.defaultValue??''" :maxlength="field.kind==='NUMBER'?128:field.kind==='PHONE'?64:2048" :disabled="disabled" @update:model-value="update"/>
 <el-button v-if="modelValue!==null&&!(reference&&['DATE','TIME'].includes(field.kind))" size="small" text :disabled="disabled" :title="field.defaultValue===null?'清除设置':'恢复默认值'" :aria-label="field.defaultValue===null?'清除设置':'恢复默认值'" @click="update(null)"><el-icon v-if="reference"><CircleClose/></el-icon><span :class="{'scalar-reset-label':reference}">{{field.defaultValue===null?'清除设置':'恢复默认值'}}</span></el-button>
 <span v-else class="tl-muted extension-unset">{{field.defaultValue===null?'未设置':'当前使用默认值'}}</span>
</div></template>
<style scoped>.extension-scalar-input{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.extension-scalar-input>.el-input,.extension-scalar-input>.el-select,.extension-scalar-input>:deep(.el-date-editor){max-width:500px;width:100%}.extension-unset{font-size:12px}.scalar-reference{position:relative}.scalar-number{position:relative;width:100%}.scalar-number :deep(.el-input__wrapper){padding-right:40px}.scalar-number-controls{position:absolute;right:1px;top:1px;bottom:1px;display:flex;flex-direction:column;width:39px;border-left:1px solid #dcdfe6;background:#f5f7fa;border-radius:0 3px 3px 0}.scalar-number-controls button{display:flex;flex:1;justify-content:center;align-items:center;padding:0;border:0;background:transparent;color:#909399;cursor:pointer;font-size:10px}.scalar-number-controls button+button{border-top:1px solid #dcdfe6}.scalar-number-controls button:hover{color:#409eff}.scalar-reference>.el-button{margin:0;position:absolute;right:10px;top:4px;width:20px;height:32px;font-size:14px;padding:0;opacity:0;color:#c0c4cc}.scalar-reference:has(>.scalar-number)>.el-button{right:44px}.scalar-reference:has(>.el-switch)>.el-button{left:48px;right:auto;top:0}.scalar-reset-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.scalar-reference:hover>.el-button,.scalar-reference:focus-within>.el-button{opacity:1}.scalar-reference .extension-unset{font-size:12px;color:#909399}</style>
