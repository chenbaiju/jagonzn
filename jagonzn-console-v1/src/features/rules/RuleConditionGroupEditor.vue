<script setup lang="ts">
import {computed} from 'vue'
import {newCondition,newConditionGroup,groupSize,conditionOperators,conditionLabels,type ConditionGroupDraft,type ConditionDraft,type ConditionOperator} from './rule-builder-draft'
defineOptions({name:'RuleConditionGroupEditor'})
const props=withDefaults(defineProps<{modelValue:ConditionGroupDraft;disabled?:boolean;depth?:number;remainingLeaves?:number;remainingGroups?:number;label?:string;numberTextLimit?:number;propertyNameMode?:boolean}>(),{depth:1,label:'属性上报条件',numberTextLimit:128})
const emit=defineEmits<{'update:modelValue':[value:ConditionGroupDraft]}>()
const size=computed(()=>groupSize(props.modelValue)),leaves=computed(()=>props.remainingLeaves??32-size.value.leaves),groups=computed(()=>props.remainingGroups??64-size.value.groups)
function update(patch:Partial<ConditionGroupDraft>){if(!props.disabled)emit('update:modelValue',{...props.modelValue,...patch})}
function condition(index:number,patch:Partial<ConditionDraft>){update({conditions:props.modelValue.conditions.map((value,i)=>i===index?{...value,...patch}:value)})}
function child(index:number,value:ConditionGroupDraft){update({groups:props.modelValue.groups.map((old,i)=>i===index?value:old)})}
function addCondition(){if(leaves.value>0)update({conditions:[...props.modelValue.conditions,newCondition()]})}
function addGroup(){if(props.depth<4&&groups.value>0&&props.modelValue.groups.length<32)update({groups:[...props.modelValue.groups,newConditionGroup()]})}
const attributeIdentifier=/^[A-Za-z0-9_-]{1,64}$/
function displayedPath(path:string){return props.propertyNameMode&&path.startsWith('/')&&attributeIdentifier.test(path.slice(1))?path.slice(1):path}
function enteredPath(path:string){return props.propertyNameMode&&attributeIdentifier.test(path)?'/'+path:path}
const range=(operator:ConditionOperator)=>operator==='IN_RANGE'||operator==='OUT_RANGE'
const textOnly=(operator:ConditionOperator)=>['CONTAINS','NOT_CONTAINS','KEY_EXISTS','KEY_ABSENT'].includes(operator)
const typed=(operator:ConditionOperator)=>operator==='EQ'||operator==='NE'
</script>
<template><fieldset class="rule-condition-group" :data-group-id="modelValue.id" :disabled="disabled">
 <legend>{{label}}</legend>
 <div class="group-heading"><el-select :model-value="modelValue.operator" aria-label="分组匹配方式" :disabled="disabled" @update:model-value="update({operator:$event})"><el-option label="全部满足" value="ALL"/><el-option label="任一满足" value="ANY"/></el-select><span class="tl-muted">{{depth===1&&!size.leaves?'所有属性上报均匹配':'括号内按所选方式匹配'}}</span></div>
 <div v-for="(row,index) in modelValue.conditions" :key="row.id" class="condition-row" :data-condition-id="row.id">
  <el-input :model-value="displayedPath(row.path)" aria-label="属性路径" :placeholder="propertyNameMode?'属性名':'/temperature'" maxlength="256" :disabled="disabled" @update:model-value="condition(index,{path:enteredPath($event)})"/>
  <el-select :model-value="row.operator" aria-label="条件运算" :disabled="disabled" @update:model-value="condition(index,{operator:$event})"><el-option v-for="operator in conditionOperators" :key="operator" :label="conditionLabels[operator]" :value="operator"/></el-select>
  <template v-if="range(row.operator)"><el-input :model-value="row.lower" aria-label="区间下限" placeholder="下限" :maxlength="numberTextLimit" :disabled="disabled" @update:model-value="condition(index,{lower:$event})"/><el-input :model-value="row.upper" aria-label="区间上限" placeholder="上限" :maxlength="numberTextLimit" :disabled="disabled" @update:model-value="condition(index,{upper:$event})"/></template>
  <template v-else-if="row.operator!=='EXISTS'">
   <el-select v-if="typed(row.operator)" :model-value="row.valueType" aria-label="比较值类型" :disabled="disabled" @update:model-value="condition(index,{valueType:$event})"><el-option label="数值" value="number"/><el-option label="文本" value="string"/><el-option label="布尔值" value="boolean"/><el-option label="null" value="null"/></el-select>
   <el-select v-if="typed(row.operator)&&row.valueType==='boolean'" :model-value="row.booleanValue" aria-label="布尔比较值" :disabled="disabled" @update:model-value="condition(index,{booleanValue:$event})"><el-option label="true" :value="true"/><el-option label="false" :value="false"/></el-select>
   <el-input v-else-if="!(typed(row.operator)&&row.valueType==='null')" :model-value="row.text" :aria-label="textOnly(row.operator)||typed(row.operator)&&row.valueType==='string'?'文本比较值':'数值比较值'" :placeholder="textOnly(row.operator)?'文本或对象键':'比较值'" :disabled="disabled" @update:model-value="condition(index,{text:$event})"/>
  </template>
  <el-button text :disabled="disabled" aria-label="移除条件" @click="update({conditions:modelValue.conditions.filter(value=>value.id!==row.id)})">移除</el-button>
 </div>
 <div v-for="(group,index) in modelValue.groups" :key="group.id" class="nested-condition">
  <RuleConditionGroupEditor :model-value="group" :depth="depth+1" :disabled="disabled" :number-text-limit="numberTextLimit" :remaining-leaves="leaves" :remaining-groups="groups" :property-name-mode="propertyNameMode" :label="`条件分组 ${index+1}`" @update:model-value="child(index,$event)"/>
  <el-button text :disabled="disabled" aria-label="移除条件分组" @click="update({groups:modelValue.groups.filter(value=>value.id!==group.id)})">移除分组</el-button>
 </div>
 <div class="condition-actions"><el-button :disabled="disabled||leaves<=0" @click="addCondition">添加条件</el-button><el-button :disabled="disabled||depth>=4||groups<=0||modelValue.groups.length>=32" @click="addGroup">添加分组</el-button></div>
</fieldset></template>
<style scoped>
.rule-condition-group{margin:0;min-width:0;border:1px solid var(--el-border-color-lighter);padding:12px;border-radius:3px}.rule-condition-group legend{font-size:13px;padding:0 5px;color:var(--el-text-color-regular)}.group-heading{display:flex;align-items:center;gap:12px;margin-bottom:12px}.group-heading .el-select{width:130px;flex-shrink:0}.condition-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0}.condition-row>.el-input{width:155px;flex:1;min-width:110px}.condition-row>.el-select{width:145px;flex-shrink:0}.condition-actions{display:flex;gap:8px;margin-top:12px}.condition-actions .el-button+.el-button{margin-left:0}.nested-condition{display:flex;align-items:flex-start;gap:6px;margin:12px 0}.nested-condition>.rule-condition-group{flex:1}.tl-muted{font-size:12px}@media(max-width:560px){.condition-row>.el-input,.condition-row>.el-select{flex:1 1 120px;width:auto}.nested-condition{display:block}}
</style>
