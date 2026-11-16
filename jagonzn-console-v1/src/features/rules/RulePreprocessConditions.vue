<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import RuleConditionGroupEditor from './RuleConditionGroupEditor.vue'
import RuleReportFilterEditor from './RuleReportFilterEditor.vue'
import type {RuleDeviceSourceContract} from './rule-source-api'
import {conditionLabels,type ConditionDraft,type ConditionGroupDraft} from './rule-builder-draft'
const props=defineProps<{modelValue:ConditionGroupDraft;editing?:boolean;disabled?:boolean;error?:string;recoveryPending?:boolean;recovering?:boolean;reportSource?:RuleDeviceSourceContract;project?:string}>()
const emit=defineEmits<{'update:modelValue':[value:ConditionGroupDraft];edit:[];save:[];cancel:[];recover:[]}>()
const validationError=ref('')
const reportEditor=ref<InstanceType<typeof RuleReportFilterEditor>>()
watch(()=>props.editing,()=>{validationError.value=''})
function update(group:ConditionGroupDraft){validationError.value='';emit('update:modelValue',group)}
function validPaths(group:ConditionGroupDraft):boolean{return group.conditions.every(row=>row.path.startsWith('/')&&row.path.length<=256&&!/~(?![01])/.test(row.path))&&group.groups.every(validPaths)}
function save(){if(!validPaths(props.modelValue)){validationError.value='请输入有效属性名（1至64位字母、数字、_ 或 -）或以 / 开头的属性路径';return}if(reportEditor.value&&!reportEditor.value.validate()){validationError.value='请选择属性对应的比较值';return}emit('save')}
function metric(path:string){return /^\/[A-Za-z0-9_-]{1,64}$/.test(path)?path.slice(1):path}
function value(row:ConditionDraft){if(row.operator==='EXISTS')return '';if(row.operator==='IN_RANGE'||row.operator==='OUT_RANGE')return '['+row.lower+', '+row.upper+']';if(['CONTAINS','NOT_CONTAINS','KEY_EXISTS','KEY_ABSENT'].includes(row.operator))return row.text;return row.valueType==='null'?'null':row.valueType==='boolean'?String(row.booleanValue).toUpperCase():row.text}
function rows(group:ConditionGroupDraft,context=''):{key:string;metric:string;operator:string;value:string}[]{return [...group.conditions.map(row=>({key:row.id,metric:(context?context+' ':'')+metric(row.path),operator:conditionLabels[row.operator],value:value(row)})),...group.groups.flatMap((child,index)=>rows(child,context+'（'+(child.operator==='ALL'?'全部满足':'任一满足')+' '+(index+1)+'）'))]}
const displayed=computed(()=>rows(props.modelValue,props.modelValue.operator==='ANY'?'（任一满足）':''))
const reportLayout=computed(()=>!!props.project&&!!props.reportSource&&!props.modelValue.groups.length&&props.modelValue.conditions.every(row=>['GT','GTE','LT','LTE','EQ','NE','IN_RANGE','OUT_RANGE','KEY_EXISTS','KEY_ABSENT','CONTAINS','NOT_CONTAINS'].includes(row.operator)&&['number','string','boolean'].includes(row.valueType)&&(!row.path||/^\/[A-Za-z0-9_-]{1,64}$/.test(row.path))))
</script>
<template><section class="preprocess-conditions" :class="{'is-empty':!displayed.length}" aria-label="规则条件">
 <template v-if="!editing"><el-table v-if="displayed.length" :data="displayed" row-key="key"><el-table-column prop="metric" label="属性"/><el-table-column prop="operator" label="运算符"/><el-table-column prop="value" label="值"/></el-table><el-button size="small" aria-label="编辑规则条件" :disabled="disabled" @click="emit('edit')">编辑</el-button></template>
 <template v-else><RuleReportFilterEditor v-if="reportLayout&&reportSource&&project" ref="reportEditor" :model-value="modelValue" :project="project" :source="reportSource" :disabled="disabled" @update:model-value="update"/><RuleConditionGroupEditor v-else :model-value="modelValue" :disabled="disabled" :number-text-limit="1024" property-name-mode @update:model-value="update"/><el-alert v-if="validationError||error" :title="validationError||error" type="warning" :closable="false"/><el-form :disabled="false" class="condition-buttons"><el-button v-if="recoveryPending" size="small" :disabled="recovering" @click="emit('recover')">读取核对</el-button><el-button size="small" type="primary" aria-label="保存规则条件" :disabled="disabled" @click="save">保存</el-button><el-button size="small" aria-label="取消规则条件" :disabled="disabled" @click="emit('cancel')">取消</el-button></el-form></template>
</section></template>
<style scoped>
.preprocess-conditions{min-width:0;max-width:none}.preprocess-conditions>.el-button,.condition-buttons{margin-top:10px}.condition-buttons{display:flex;gap:10px}.condition-buttons .el-button+.el-button{margin-left:0}.preprocess-conditions :deep(.el-table .cell){overflow-wrap:anywhere;white-space:normal}.preprocess-conditions :deep(.el-table th.el-table__cell){color:#303133;font-weight:600}.preprocess-conditions .el-alert{margin-top:10px}
</style>
