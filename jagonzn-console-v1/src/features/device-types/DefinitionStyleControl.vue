<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {Close} from '@element-plus/icons-vue'
const props=withDefaults(defineProps<{label:string;iconId?:string;color?:string;icons:readonly(readonly[string,string])[];active?:boolean;disabled?:boolean;selectionDisabled?:boolean}>(),{active:true})
const emit=defineEmits<{'choose-icon':[value:string]}>()
const shown=ref(false),tab=ref('icons'),recent=ref<string[]>([])
const displayed=computed(()=>tab.value==='common'?props.icons.filter(([id])=>id===props.iconId||recent.value.includes(id)):props.icons)
function choose(value:string){if(props.disabled||props.selectionDisabled||!props.active||!props.icons.some(([id])=>id===value))return;recent.value=[value,...recent.value.filter(id=>id!==value)].slice(0,12);emit('choose-icon',value);shown.value=false}
watch([()=>props.active,()=>props.disabled],([active,disabled])=>{if(!active||disabled)shown.value=false})
</script>
<template><div class="definition-style-control"><el-button class="definition-style-trigger" :aria-label="label" :disabled="disabled||selectionDisabled||!active" :style="{color:color||undefined}" @click="shown=true"><slot name="preview"/></el-button><slot name="color"/>
 <el-drawer v-model="shown" :data-picker-open="shown" title="选择图标" aria-label="选择图标" direction="rtl" size="360px" append-to-body :with-header="false" class="definition-icon-drawer definition-picker-drawer"><div class="definition-icon-toolbar"><el-tabs v-model="tab"><el-tab-pane label="常用" name="common"/><el-tab-pane label="普通" name="icons"/><el-tab-pane label="上传" name="upload"/></el-tabs><el-button :icon="Close" text aria-label="关闭图标选择" @click="shown=false"/></div><template v-if="tab!=='upload'"><div class="definition-icon-grid"><el-tooltip v-for="[value,labelText] in displayed" :key="value" :content="labelText" placement="top"><button type="button" :aria-label="labelText" :title="value" :aria-pressed="iconId===value" :disabled="disabled||selectionDisabled" @click="choose(value)"><slot name="icon" :value="value"/></button></el-tooltip></div><el-empty v-if="!displayed.length" description="暂无最近使用的图标" :image-size="80"/></template><div v-show="tab==='upload'" class="definition-icon-upload"><slot name="upload"/></div><div v-if="$slots.default" class="definition-style-options"><slot/></div></el-drawer>
 </div></template>
<style scoped>
.definition-style-control{display:flex;align-items:center;gap:8px}
.definition-style-trigger.el-button{height:32px;width:32px;padding:0;border-style:dashed;color:#909399}
.definition-style-trigger :deep(.definition-level){margin:0;width:22px;height:22px}
.definition-icon-toolbar{position:relative;padding-right:24px}.definition-icon-toolbar :deep(.el-tabs__header){margin-bottom:22px}.definition-icon-toolbar :deep(.el-tabs__nav){width:100%}.definition-icon-toolbar :deep(.el-tabs__item){flex:1;padding:0 22px;height:40px;font-size:14px}.definition-icon-toolbar>.el-button{position:absolute;right:0;top:10px;padding:0;height:20px;color:#909399}
.definition-icon-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));row-gap:0;align-items:center}
.definition-icon-grid button{display:flex;align-items:center;justify-content:center;width:100%;height:48px;padding:0;border:0;border-radius:3px;background:#fff;color:#666;cursor:pointer;font-size:22px}
.definition-icon-grid button:hover,.definition-icon-grid button[aria-pressed=true]{background:#ecf5ff;color:var(--tl-primary)}
.definition-style-options{margin-top:24px;color:#909399;font-size:12px;line-height:20px}.definition-style-options :deep(.el-button){height:32px;font-size:12px}
.definition-icon-upload{font-size:12px;line-height:20px;color:#909399}
</style>
