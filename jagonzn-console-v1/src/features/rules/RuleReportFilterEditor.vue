<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {Delete} from '@element-plus/icons-vue'
import {readAlarmRuleSourceChoicesWithVersions} from '@/features/alarms/alarm-rule-source-choices-api'
import DefinitionTypeLabel from '@/features/device-types/DefinitionTypeLabel.vue'
import {propertyTransport} from '@/features/device-types/property-definition-api'
import {readDevicePropertyChoices,readTypePropertyChoices,type DevicePropertyChoice} from './device-property-choices'
import {deviceSourceMembers,type RuleDeviceSourceContract} from './rule-source-api'
import {newCondition,type ConditionDraft,type ConditionGroupDraft,type ConditionOperator} from './rule-builder-draft'
const props=defineProps<{modelValue:ConditionGroupDraft;project:string;source:RuleDeviceSourceContract;disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:ConditionGroupDraft]}>()
const choices=ref<{key:string;label:string;dataType:string;detail?:DevicePropertyChoice}[]>([]),error=ref(''),loading=ref(false),pendingValue=ref(new Set<string>())
const placeholder=newCondition(),showPlaceholder=ref(true)
const visibleRows=computed(()=>props.modelValue.conditions.length?props.modelValue.conditions:showPlaceholder.value?[placeholder]:[])
const missingOptions=computed(()=>choices.value.some(choice=>['SWITCH','ENUM'].includes(choice.dataType)&&!available(choice)))
const operators:Record<string,readonly [ConditionOperator,string][]>={NUMBER:[['GT','大于'],['GTE','大于等于'],['LT','小于'],['LTE','小于等于'],['EQ','等于'],['NE','不等于'],['IN_RANGE','在范围内'],['OUT_RANGE','不在范围内']],TEXT:[['EQ','等于'],['NE','不等于']],ENUM:[['EQ','等于'],['NE','不等于']],SWITCH:[['EQ','等于']],OBJECT:[['KEY_EXISTS','存在键名'],['KEY_ABSENT','不存在键名']],LIST:[['CONTAINS','包含'],['NOT_CONTAINS','不包含']]}
watch(()=>[props.project,props.source] as const,async([project,source],_,onCleanup)=>{const controller=new AbortController();onCleanup(()=>controller.abort());choices.value=[];error.value='';loading.value=true;try{if(source.kind!=='DEVICE'&&source.kind!=='DEVICE_TYPE')throw new Error('当前来源不支持读取属性');const result=await readAlarmRuleSourceChoicesWithVersions(project,{kind:source.kind,ids:deviceSourceMembers(source)},controller.signal);let metadata:DevicePropertyChoice[][]=[]
  if(result.properties.length){try{let next=0;metadata=new Array(result.bindings.length);await Promise.all(Array.from({length:Math.min(4,result.bindings.length)},async()=>{while(next<result.bindings.length){const index=next++,binding=result.bindings[index]!;metadata[index]=source.kind==='DEVICE_TYPE'?await readTypePropertyChoices(project,binding.sourceId,binding.modelVersionId,controller.signal):await readDevicePropertyChoices(project,binding.sourceId,undefined,controller.signal,binding.modelVersionId)}}))}catch{metadata=[]}}
  let definitions:Awaited<ReturnType<typeof propertyTransport.list>>=[]
  if(source.kind==='DEVICE_TYPE'&&result.bindings.length===1){try{definitions=await propertyTransport.list(project,result.bindings[0]!.sourceId,controller.signal)}catch{/* 固定版本仍可用于条件选择。 */}}
  if(!controller.signal.aborted)choices.value=result.properties.map(item=>{const details=metadata.map(rows=>rows.find(row=>row.key===item.key));const first=details[0],sameType=first&&details.length===result.bindings.length&&details.every(value=>value&&value.type===item.dataType),definition=definitions.find(value=>value.propertyKey===item.key&&value.dataType===item.dataType);return {...item,...(definition?{label:definition.name}:sameType&&details.every(value=>value?.name===first.name)?{label:first.name}:{}),...(sameType&&details.every(value=>value&&value.switchEncoding===first.switchEncoding&&JSON.stringify(value.enumOptions)===JSON.stringify(first.enumOptions))?{detail:first}:{})}})
 }catch(cause){if(!controller.signal.aborted)error.value=cause instanceof Error?cause.message:'读取属性失败'}finally{if(!controller.signal.aborted)loading.value=false}},{immediate:true,deep:true})
function update(value:ConditionGroupDraft){if(!props.disabled)emit('update:modelValue',value)}
function row(index:number,patch:Partial<ConditionDraft>){const conditions=props.modelValue.conditions.length?props.modelValue.conditions:[placeholder];update({...props.modelValue,conditions:conditions.map((item,i)=>i===index?{...item,...patch}:item)})}
function available(choice:{dataType:string;detail?:DevicePropertyChoice}){return !!operators[choice.dataType]&&(!['SWITCH','ENUM'].includes(choice.dataType)||!!choice.detail&&(choice.dataType!=='SWITCH'||!!choice.detail.switchEncoding)&&(choice.dataType!=='ENUM'||!!choice.detail.enumOptions?.length))}
function selectProperty(index:number,key:string){const choice=choices.value.find(item=>item.key===key),availableOps=choice&&operators[choice.dataType];if(!choice||!availableOps||!available(choice))return;const current=visibleRows.value[index]!;const next=new Set(pendingValue.value);if(choice.dataType==='SWITCH'||choice.dataType==='ENUM')next.add(current.id);else next.delete(current.id);pendingValue.value=next;row(index,{path:'/'+key,operator:availableOps[0]![0],valueType:choice.dataType==='NUMBER'||choice.detail?.switchEncoding==='NUMBER'?'number':choice.detail?.switchEncoding==='BOOLEAN'?'boolean':'string',text:'',lower:'',upper:''})}
function selected(item:ConditionDraft){return choices.value.find(choice=>'/'+choice.key===item.path)}
function chooseValue(index:number,item:ConditionDraft,value:string){const next=new Set(pendingValue.value);next.delete(item.id);pendingValue.value=next;const encoding=selected(item)?.detail?.switchEncoding;if(encoding==='BOOLEAN')row(index,{booleanValue:value==='ON'});else if(encoding==='NUMBER')row(index,{text:value==='ON'?'1':'0'});else row(index,{text:value})}
function choiceValue(item:ConditionDraft){if(pendingValue.value.has(item.id))return undefined;const encoding=selected(item)?.detail?.switchEncoding;if(encoding==='BOOLEAN')return item.booleanValue?'ON':'OFF';if(encoding==='NUMBER')return item.text==='1'?'ON':item.text==='0'?'OFF':undefined;return item.text||undefined}
function validate(){return !visibleRows.value.some(item=>pendingValue.value.has(item.id))}
defineExpose({validate})
function rowOperators(item:ConditionDraft):readonly [ConditionOperator,string][]{const type=choices.value.find(choice=>'/'+choice.key===item.path)?.dataType;return type&&operators[type]||operators[item.valueType==='number'?'NUMBER':item.operator==='KEY_EXISTS'||item.operator==='KEY_ABSENT'?'OBJECT':item.operator==='CONTAINS'||item.operator==='NOT_CONTAINS'?'LIST':'TEXT']!}
function add(){if(visibleRows.value.length<32)update({...props.modelValue,conditions:[...visibleRows.value,newCondition()]})}
function remove(index:number){if(props.disabled)return;const conditions=visibleRows.value.filter((_,i)=>i!==index);if(!conditions.length)showPlaceholder.value=false;update({...props.modelValue,conditions})}
</script>
<template><div class="report-filter-editor">
 <p v-if="error" role="alert" class="report-filter-error">{{error}}</p>
 <p v-else-if="!loading&&missingOptions" class="report-filter-note">部分开关或枚举的固定模型选项不可读取或在来源间不一致，暂不能选择。</p>
 <div v-for="(item,index) in visibleRows" :key="item.id" class="report-filter-row">
  <el-select size="small" :model-value="index===0?'ALL':modelValue.operator" :aria-label="`条件关系 ${index+1}`" :disabled="disabled||index===0" @update:model-value="update({...modelValue,operator:$event})"><el-option label="AND" value="ALL"/><el-option label="OR" value="ANY"/></el-select>
  <el-select size="small" :model-value="item.path.startsWith('/')?item.path.slice(1):item.path" :aria-label="`选择属性 ${index+1}`" placeholder="选择属性" filterable popper-class="report-filter-property-popper" :loading="loading" :disabled="disabled||loading||!!error" @update:model-value="selectProperty(index,$event)"><el-option-group label="属性"><el-option v-for="choice in choices" :key="choice.key" :value="choice.key" :label="`${choice.key} (${choice.label})`" :disabled="!available(choice)"><span class="report-filter-property"><DefinitionTypeLabel :type="choice.dataType" label=""/><span class="report-filter-property-key">{{choice.key}}</span><span class="report-filter-property-name">{{choice.label}}</span></span></el-option></el-option-group></el-select>
  <template v-if="item.path"><el-select size="small" :model-value="item.operator" :aria-label="`条件运算 ${index+1}`" placeholder="运算符" :disabled="disabled" @update:model-value="row(index,{operator:$event})"><el-option v-for="[key,label] in rowOperators(item)" :key="key" :label="label" :value="key"/></el-select>
   <template v-if="item.operator==='IN_RANGE'||item.operator==='OUT_RANGE'"><el-input size="small" :model-value="item.lower" :aria-label="`区间下限 ${index+1}`" placeholder="下限" :disabled="disabled" @update:model-value="row(index,{lower:$event})"/><el-input size="small" :model-value="item.upper" :aria-label="`区间上限 ${index+1}`" placeholder="上限" :disabled="disabled" @update:model-value="row(index,{upper:$event})"/></template>
   <el-select size="small" v-else-if="selected(item)?.dataType==='SWITCH'||selected(item)?.dataType==='ENUM'" :model-value="choiceValue(item)" :aria-label="`比较值 ${index+1}`" placeholder="请选择" :disabled="disabled||!selected(item)?.detail" @update:model-value="chooseValue(index,item,$event)"><template v-if="selected(item)?.dataType==='SWITCH'"><el-option label="ON" value="ON"/><el-option label="OFF" value="OFF"/></template><el-option v-for="option in selected(item)?.detail?.enumOptions??[]" v-else :key="option" :label="option" :value="option"/></el-select>
   <el-input size="small" v-else :model-value="item.text" :aria-label="visibleRows.length===1&&item.valueType==='number'?'数值比较值':`比较值 ${index+1}`" :placeholder="item.valueType==='number'?'数值':'值'" :disabled="disabled" @update:model-value="row(index,{text:$event})"/></template>
  <el-button type="danger" size="small" :icon="Delete" :aria-label="`移除条件 ${index+1}`" :disabled="disabled" @click="remove(index)"/>
 </div>
 <div class="report-filter-actions"><el-button size="small" :disabled="disabled||visibleRows.length>=32" @click="add">添加条件</el-button></div>
</div></template>
<style scoped>
.report-filter-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:nowrap;max-width:100%;overflow-x:auto}.report-filter-row>.el-select:first-child{flex:0 0 75px;width:75px}.report-filter-row>.el-select:nth-child(2){flex:0 0 150px;width:150px}.report-filter-row>.el-select:nth-child(3){flex:0 0 100px;width:100px}.report-filter-row>.el-select:nth-child(4),.report-filter-row>.el-input{flex:0 0 180px;width:180px}.report-filter-row :deep(.el-select__wrapper),.report-filter-row :deep(.el-input__wrapper){min-height:32px;font-size:14px}.report-filter-row>.el-button{flex-shrink:0;height:32px;padding:8px 15px}.report-filter-actions{display:flex;align-items:center;gap:10px}.report-filter-actions :deep(.el-button+.el-button){margin-left:0}.report-filter-error,.report-filter-note{font-size:12px;color:#909399;margin:4px 0 0}.report-filter-error{color:#e6a23c}
.report-filter-property{display:flex;align-items:center;gap:8px;min-width:0}.report-filter-property-key{overflow:hidden;text-overflow:ellipsis}.report-filter-property-name{margin-left:auto;padding-left:12px;overflow:hidden;text-overflow:ellipsis;color:#606266}
</style>
<style>
.report-filter-property-popper.el-popper{width:360px;max-width:calc(100vw - 24px)}
.report-filter-property-popper .el-select-group__title{padding-left:20px}
.report-filter-property-popper .el-select-group .el-select-dropdown__item{padding:0 20px}
</style>
