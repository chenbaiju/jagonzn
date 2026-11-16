<script setup lang="ts">
import {ref,watch,onScopeDispose} from 'vue'
import {projectId} from '@/core/session'
import {ApiError,errorMessage,identityEpoch} from '@/core/http'
import RuleActionDeviceTarget,{type RuleActionDeviceTarget as Target} from './RuleActionDeviceTarget.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {readAutomationActionChoices,type AutomationPropertyChoice} from './automation-property-model'
import {automationTargetAction,automationCloudOperationAction,automationCloudOperationLabels,type AutomationCloudOperation,automationPropertyNode,automationActionPresentation,automationCloudPresentation,type AutomationNode} from './automation-editor-draft'
import {ExactDecimal,parsePreprocessJson,writePreprocessJson,type ExactJson} from './preprocess-exact-json'
const props=defineProps<{value?:AutomationNode;disabled?:boolean;purpose?:'downlink'|'cloud-update'}>(),emit=defineEmits<{save:[node:AutomationNode,deviceName:string];cancel:[];denied:[cause:ApiError]}>()
const initial=props.value?automationTargetAction(props.value):undefined,presentation=props.purpose==='cloud-update'?automationCloudPresentation:automationActionPresentation
const device=ref<Target>(),choices=ref<AutomationPropertyChoice[]>([]),rows=ref<{id:string;key:string;raw:string;op:AutomationCloudOperation['op']}[]>([]),loading=ref(false),targetBusy=ref(false),error=ref('')
let initialApplied=false,turn=0,controller:AbortController|undefined,alive=true
function inputValue(value:ExactJson){try{return writePreprocessJson(value,true)}catch{return writePreprocessJson(value)}}
async function selected(target:Target|undefined){
 const generation=++turn,project=projectId.value,epoch=identityEpoch();controller?.abort();device.value=target;choices.value=[];rows.value=[];error.value=''
 if(!target){loading.value=false;return}
 const restoreInitial=!initialApplied&&initial?.deviceId===target.id;initialApplied=true
 controller=new AbortController();loading.value=true
 try{
  const result=await readAutomationActionChoices(project,target.id,controller.signal,props.purpose)
  if(!alive||turn!==generation||project!==projectId.value||epoch!==identityEpoch())return
  choices.value=result
  rows.value=restoreInitial?(initial&&'operations' in initial?initial.operations.map(row=>({id:crypto.randomUUID(),key:row.propertyKey,op:row.op,raw:'value' in row?inputValue(row.value):'0'})):Object.entries(initial!.properties).map(([key,value])=>({id:crypto.randomUUID(),key,raw:inputValue(value),op:'set' as const}))):[]
  if(!result.length)error.value=props.purpose==='cloud-update'?'当前设备没有可更新的云端私有 Number、Switch、Text 或 Enum 属性。':'当前设备没有可下发的 Number、Switch、Text 或 Enum 属性。'
 }catch(cause){if(alive&&turn===generation){error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))emit('denied',cause)}}finally{if(alive&&turn===generation)loading.value=false}
}
function definition(key:string){return choices.value.find(value=>value.key===key)}
function add(){if(!props.disabled&&!loading.value&&device.value)rows.value.push({id:crypto.randomUUID(),key:'',raw:'""',op:'set'})}
function choose(row:{key:string;raw:string;op:AutomationCloudOperation['op']},key:string){if(props.disabled)return;row.key=key;row.op='set';const property=definition(key);row.raw=property?.type==='NUMBER'?'0':property?.type==='SWITCH'?property.switchEncoding==='NUMBER'?'0':property.switchEncoding==='TEXT'?'"OFF"':'false':property?.type==='ENUM'?JSON.stringify(property.enumOptions?.[0]??''):'""'}
function operations(key:string):AutomationCloudOperation['op'][] {const type=definition(key)?.type;return type==='NUMBER'?['set','inc','dec','inc_pct','dec_pct']:type==='SWITCH'?['set','toggle']:type==='TEXT'?['set','clear']:['set']}
function changeOperation(row:{key:string;op:AutomationCloudOperation['op'];raw:string},op:AutomationCloudOperation['op']){if(props.disabled)return;if(op==='set')choose(row,row.key);else{row.op=op;row.raw='0'}}
function text(raw:string){try{const value=parsePreprocessJson(raw);return typeof value==='string'?value:''}catch{return ''}}
function switchOptions(property:AutomationPropertyChoice){return property.switchEncoding==='NUMBER'?[{label:'开启',value:'1'},{label:'关闭',value:'0'}]:property.switchEncoding==='TEXT'?[{label:'开启',value:'"ON"'},{label:'关闭',value:'"OFF"'}]:[{label:'开启',value:'true'},{label:'关闭',value:'false'}]}
function operationsFor(row:{key:string;op:AutomationCloudOperation['op']}){return operations(row.key).includes(row.op)}
function save(){
 if(props.disabled||loading.value||targetBusy.value)return
 try{
  if(!device.value||device.value.projectId!==projectId.value)throw new Error('请选择设备')
  if(!rows.value.length)throw new Error('请至少设置一个属性')
  const properties:Record<string,ExactJson>=Object.create(null),operations:AutomationCloudOperation[]=[],keys=new Set<string>()
  for(const row of rows.value){
   const property=definition(row.key);if(!property||keys.has(row.key))throw new Error('请选择有效且不重复的属性')
   keys.add(row.key);if(props.purpose==='cloud-update'&&!operationsFor(row))throw new Error('请选择有效属性操作')
   if(props.purpose==='cloud-update'&&(row.op==='toggle'||row.op==='clear')){operations.push({propertyKey:row.key,op:row.op});continue}
   const value=parsePreprocessJson(row.raw)
   if(row.op!=='set'&&!(value instanceof ExactDecimal))throw new Error('请填写有效数值')
   if(property.type==='NUMBER'&&!(value instanceof ExactDecimal)||property.type==='TEXT'&&typeof value!=='string'||property.type==='ENUM'&&(typeof value!=='string'||!property.enumOptions?.includes(value))||property.type==='SWITCH'&&!switchOptions(property).some(option=>option.value===row.raw))throw new Error('请填写所有已选属性的有效值')
   properties[row.key]=value;operations.push({propertyKey:row.key,op:row.op as 'set'|'inc'|'dec'|'inc_pct'|'dec_pct',value})
  }
  const node=props.purpose==='cloud-update'?automationCloudOperationAction(device.value.id,operations):{nodeType:automationPropertyNode,config:{deviceId:device.value.id,properties}}
  emit('save',node,device.value.name)
 }catch(cause){error.value=errorMessage(cause)}
}
watch(projectId,()=>{turn++;controller?.abort();device.value=undefined;rows.value=[];choices.value=[];loading.value=false})
onScopeDispose(()=>{alive=false;turn++;controller?.abort()})
</script>
<template><el-dialog :model-value="true" title="配置动作" width="800px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!disabled" :show-close="!disabled" append-to-body @update:model-value="!disabled&&emit('cancel')">
 <div class="automation-action-type"><span class="automation-action-type-icon" :style="{background:presentation.background,color:presentation.color}"><ReferenceIcon :glyph="presentation.glyph"/></span><div><strong>{{presentation.label}}</strong><p>{{presentation.description}}</p></div></div>
 <el-form label-position="top" :disabled="disabled"><el-form-item label="选择设备"><RuleActionDeviceTarget :initial-id="initial?.deviceId" :disabled="disabled" @selected="selected" @busy="targetBusy=$event"/></el-form-item>
 <el-form-item v-if="device" label="属性设置"><div class="automation-properties"><div v-for="(row,index) in rows" :key="row.id" class="automation-property-row">
  <el-select :model-value="row.key" :aria-label="`属性 ${index+1}`" placeholder="请选择属性" :disabled="disabled||loading" filterable @update:model-value="choose(row,$event)"><el-option v-for="property in choices" :key="property.key" :label="property.name" :value="property.key"/></el-select>
  <el-select v-if="purpose==='cloud-update'&&definition(row.key)" :model-value="row.op" :aria-label="`属性操作 ${index+1}`" :disabled="disabled||loading" @update:model-value="changeOperation(row,$event)"><el-option v-for="operation in operations(row.key)" :key="operation" :value="operation" :label="automationCloudOperationLabels[operation]"/></el-select>
  <template v-if="definition(row.key)&&row.op!=='toggle'&&row.op!=='clear'"><el-input v-if="definition(row.key)?.type==='NUMBER'" v-model="row.raw" :aria-label="`属性值 ${index+1}`" :disabled="disabled" inputmode="decimal"/>
   <el-select v-else-if="definition(row.key)?.type==='SWITCH'" v-model="row.raw" :aria-label="`属性值 ${index+1}`" :disabled="disabled"><el-option v-for="option in switchOptions(definition(row.key)!)" :key="option.value" :label="option.label" :value="option.value"/></el-select>
   <el-select v-else-if="definition(row.key)?.type==='ENUM'" :model-value="text(row.raw)" :aria-label="`属性值 ${index+1}`" :disabled="disabled" @update:model-value="row.raw=JSON.stringify($event)"><el-option v-for="option in definition(row.key)?.enumOptions" :key="option" :label="option" :value="option"/></el-select>
   <el-input v-else :model-value="text(row.raw)" :aria-label="`属性值 ${index+1}`" :disabled="disabled" @update:model-value="row.raw=JSON.stringify($event)"/>
  </template><span v-else-if="row.key&&!definition(row.key)">原属性当前不可读取，请取消并检查设备物模型。</span>
  <el-button :disabled="disabled||loading" :aria-label="`移除属性 ${index+1}`" @click="rows.splice(index,1)">移除</el-button>
 </div><el-button :disabled="disabled||loading||!choices.length" @click="add">添加属性</el-button></div></el-form-item></el-form>
 <p v-if="loading">正在读取设备属性…</p><el-alert v-if="error" :title="error" type="warning" :closable="false"/>
 <template #footer><el-button :disabled="disabled" @click="emit('cancel')">取消</el-button><el-button type="primary" :disabled="disabled||loading||targetBusy||!device" @click="save">{{purpose==='cloud-update'?'保存':'确定'}}</el-button></template>
</el-dialog></template>
<style scoped>.automation-action-type{display:flex;align-items:center;gap:14px;padding:14px 16px;background:#f8f9fa;border-radius:8px;margin-bottom:20px}.automation-action-type-icon{width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#1e88e5;background:#e3f2fd;font-size:22px}.automation-action-type strong{font-size:15px;font-weight:600;color:#333}.automation-action-type p{margin:4px 0 0;font-size:13px;color:#888}.automation-properties{width:100%}.automation-property-row{display:flex;align-items:center;gap:10px;margin-bottom:12px}.automation-property-row>.el-select,.automation-property-row>.el-input{min-width:0;flex:1}</style>
