<script setup lang="ts">
import {computed,ref,watch,onScopeDispose} from 'vue'
import {ArrowUp,ArrowDown,Delete} from '@element-plus/icons-vue'
import {projectId} from '@/core/session'
import {ApiError,errorMessage,identityEpoch} from '@/core/http'
import RuleActionDeviceTarget,{type RuleActionDeviceTarget as Target} from './RuleActionDeviceTarget.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import ScenePropertyReferenceSelect from './ScenePropertyReferenceSelect.vue'
import {readScenePropertyChoices,type ScenePropertyChoice} from './scene-property-model'
import {scenePropertyConfig,scenePropertyTransformConfig,sceneCloudTransformConfig,scenePropertyAction,sceneCloudAction,scenePropertyPresentation,sceneCloudOperationLabels,stepSceneDecimal,type SceneCloudOperation,type ScenePropertyOperation,type SceneNode,type ScenePropertyPurpose} from './scene-editor-draft'
import {ExactDecimal,parsePreprocessJson,writePreprocessJson,type ExactJson} from './preprocess-exact-json'
const props=withDefaults(defineProps<{value?:SceneNode;purpose?:ScenePropertyPurpose;allowTransforms?:boolean;disabled?:boolean}>(),{purpose:'downlink',allowTransforms:false}),emit=defineEmits<{save:[node:SceneNode,deviceName:string];cancel:[];denied:[cause:ApiError]}>()
const literal=props.value?scenePropertyConfig(props.value):undefined,transform=props.value?(sceneCloudTransformConfig(props.value)||scenePropertyTransformConfig(props.value)):undefined
const initial=transform?.purpose===props.purpose?transform:literal?.purpose===props.purpose?literal:undefined
const presentation=computed(()=>scenePropertyPresentation[props.purpose]),cloud=computed(()=>props.purpose==='cloud-update'),sourceStyle=computed(()=>cloud.value||props.allowTransforms)
type Reference={refDeviceId:string;refPropertyKey:string}
type Row={id:string;key:string;op:SceneCloudOperation['op'];raw:string;reference?:Reference;referenceBusy?:boolean}
const device=ref<Target>(),choices=ref<ScenePropertyChoice[]>([]),rows=ref<Row[]>([]),loading=ref(false),targetBusy=ref(false),error=ref('')
const referenceBusy=computed(()=>rows.value.some(row=>row.referenceBusy))
let initialApplied=false,turn=0,controller:AbortController|undefined,alive=true
const blank=():Row=>({id:crypto.randomUUID(),key:'',op:'set',raw:'""'})
function inputValue(value:ExactJson){try{return writePreprocessJson(value,true)}catch{return writePreprocessJson(value)}}
async function selected(target:Target|undefined){
 const generation=++turn,project=projectId.value,epoch=identityEpoch();controller?.abort();device.value=target;choices.value=[];rows.value=[];error.value=''
 if(!target){loading.value=false;return}
 const restoreInitial=!initialApplied&&initial?.deviceId===target.id;initialApplied=true;controller=new AbortController();loading.value=true
 try{
  const result=await readScenePropertyChoices(project,target.id,props.purpose,controller.signal)
  if(!alive||turn!==generation||project!==projectId.value||epoch!==identityEpoch())return
  choices.value=result
  if(restoreInitial&&initial){const operations:SceneCloudOperation[]='operations' in initial?initial.operations:Object.entries(initial.properties).map(([propertyKey,value])=>({propertyKey,op:'set',value}));rows.value=operations.map(op=>({id:crypto.randomUUID(),key:op.propertyKey,op:op.op,raw:'value' in op?inputValue(op.value):'',...(op.op==='set_ref'?{reference:{refDeviceId:op.refDeviceId,refPropertyKey:op.refPropertyKey}}:{})}))}
  else rows.value=sourceStyle.value?[blank()]:[]
  if(!result.length)error.value=cloud.value?'当前设备没有可更新的云端私有 Number、Switch、Text 或 Enum 属性。':'当前设备没有可下发的 Number、Switch、Text 或 Enum 属性。'
 }catch(cause){if(alive&&turn===generation){error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))emit('denied',cause)}}finally{if(alive&&turn===generation)loading.value=false}
}
function definition(key:string){return choices.value.find(value=>value.key===key)}
function add(){if(!props.disabled&&!loading.value&&device.value)rows.value.push(blank())}
function choose(row:Row,key:string){if(props.disabled)return;row.key=key;row.op='set';row.reference=undefined;row.referenceBusy=false;const property=definition(key);row.raw=property?.type==='NUMBER'?'0':property?.type==='SWITCH'?property.switchEncoding==='NUMBER'?'0':property.switchEncoding==='TEXT'?'"OFF"':'false':property?.type==='ENUM'?JSON.stringify(property.enumOptions?.[0]??''):'""'}
function operations(key:string):SceneCloudOperation['op'][] {const property=definition(key);if(!props.allowTransforms)return ['set'];const own:SceneCloudOperation['op'][]=property?.type==='NUMBER'?['set','inc','dec','inc_pct','dec_pct']:property?.type==='SWITCH'?['set','toggle']:property?.type==='TEXT'?['set','clear']:['set'];return ['set','set_ref',...own.slice(1)]}
function chooseOperation(row:Row,op:SceneCloudOperation['op']){if(props.disabled||!operations(row.key).includes(op))return;row.op=op;row.reference=undefined;row.referenceBusy=false;if(op==='set_ref'||op==='toggle'||op==='clear')row.raw='';else if(op==='set'&&definition(row.key)?.type==='TEXT'&&!row.raw)row.raw='""'}
function numberPlaceholder(op:SceneCloudOperation['op']){return op==='inc_pct'||op==='dec_pct'?'百分比(%)':op==='inc'?'增量':op==='dec'?'减量':'数值'}
function step(row:Row,direction:1|-1){if(props.disabled||loading.value)return;try{row.raw=stepSceneDecimal(row.raw,direction);error.value=''}catch(cause){error.value=errorMessage(cause)}}
function text(raw:string){try{const value=parsePreprocessJson(raw);return typeof value==='string'?value:''}catch{return ''}}
function switchOptions(property:ScenePropertyChoice){return property.switchEncoding==='NUMBER'?[{label:'开',value:'1'},{label:'关',value:'0'}]:property.switchEncoding==='TEXT'?[{label:'开',value:'"ON"'},{label:'关',value:'"OFF"'}]:[{label:'开',value:'true'},{label:'关',value:'false'}]}
function save(){
 if(props.disabled||loading.value||targetBusy.value||referenceBusy.value)return
 try{
  if(!device.value||device.value.projectId!==projectId.value)throw new Error('请选择设备')
  if(!rows.value.length)throw new Error('请至少设置一个属性')
  const properties:Record<string,ExactJson>=Object.create(null),operationsList:SceneCloudOperation[]=[]
  for(const row of rows.value){
   const property=definition(row.key);if(!property||Object.hasOwn(properties,row.key))throw new Error('请选择有效且不重复的属性')
   if(!operations(row.key).includes(row.op))throw new Error('属性操作与当前类型不符，请重新选择')
   if(row.op==='set_ref'){if(!row.reference)throw new Error('请选择引用设备及同类型属性');properties[row.key]=null;operationsList.push({propertyKey:row.key,op:'set_ref',...row.reference});continue}
   if(row.op==='toggle'||row.op==='clear'){properties[row.key]=null;operationsList.push({propertyKey:row.key,op:row.op});continue}
   const value=parsePreprocessJson(row.raw)
   if(property.type==='NUMBER'&&!(value instanceof ExactDecimal)||property.type==='TEXT'&&typeof value!=='string'||property.type==='ENUM'&&(typeof value!=='string'||!property.enumOptions?.includes(value))||property.type==='SWITCH'&&!switchOptions(property).some(option=>option.value===row.raw))throw new Error('请填写所有已选属性的有效值')
   properties[row.key]=value;operationsList.push({propertyKey:row.key,op:row.op,value})
  }
  emit('save',cloud.value?sceneCloudAction(device.value.id,operationsList):scenePropertyAction(device.value.id,operationsList as ScenePropertyOperation[]),device.value.name)
 }catch(cause){error.value=errorMessage(cause)}
}
watch(projectId,()=>{turn++;controller?.abort();device.value=undefined;rows.value=[];choices.value=[];loading.value=false})
onScopeDispose(()=>{alive=false;turn++;controller?.abort()})
</script>
<template><el-dialog :model-value="true" title="配置动作" width="800px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!disabled" :show-close="!disabled" append-to-body @update:model-value="!disabled&&emit('cancel')">
 <div class="scene-action-type"><span class="scene-action-type-icon" :style="{background:presentation.background,color:presentation.color}"><ReferenceIcon :glyph="presentation.glyph"/></span><div><strong>{{presentation.label}}</strong><p>{{presentation.description}}</p></div></div>
 <el-form label-position="top" :disabled="disabled"><el-form-item label="选择设备"><RuleActionDeviceTarget :initial-id="initial?.deviceId" :disabled="disabled" @selected="selected" @busy="targetBusy=$event"/></el-form-item>
 <el-form-item v-if="device" label="属性设置"><div class="scene-properties"><div v-for="(row,index) in rows" :key="row.id" class="scene-property-row" :class="{'is-cloud':sourceStyle}">
  <el-select :model-value="row.key" :aria-label="`属性 ${index+1}`" :class="{'cloud-property':sourceStyle&&!!row.key}" :placeholder="sourceStyle?'选择属性':'请选择属性'" :size="sourceStyle?'small':undefined" :disabled="disabled||loading" filterable @update:model-value="choose(row,$event)"><el-option v-for="property in choices" :key="property.key" :label="property.name" :value="property.key"/></el-select>
  <template v-if="definition(row.key)"><el-select v-if="allowTransforms" :model-value="row.op" :aria-label="`属性操作 ${index+1}`" class="scene-operation-select" :class="{'is-expanded':row.op==='toggle'||row.op==='clear'}" size="small" :disabled="disabled" @update:model-value="chooseOperation(row,$event)"><el-option v-for="op in operations(row.key)" :key="op" :label="sceneCloudOperationLabels[op]" :value="op"/></el-select>
   <ScenePropertyReferenceSelect v-if="row.op==='set_ref'" :key="row.id+'-'+row.key" :initial="row.reference" :property-type="definition(row.key)!.type" :disabled="disabled" @change="row.reference=$event" @busy="row.referenceBusy=$event" @denied="emit('denied',$event)"/>
   <template v-else-if="row.op!=='toggle'&&row.op!=='clear'"><div v-if="sourceStyle&&definition(row.key)?.type==='NUMBER'" class="scene-exact-number"><el-input v-model="row.raw" :aria-label="`属性值 ${index+1}`" :placeholder="numberPlaceholder(row.op)" size="small" :disabled="disabled" inputmode="decimal" @keydown.up.prevent="step(row,1)" @keydown.down.prevent="step(row,-1)"/><span class="scene-number-controls"><button type="button" :aria-label="`增加数值 ${index+1}`" :disabled="disabled||loading" @click="step(row,1)"><el-icon><ArrowUp/></el-icon></button><button type="button" :aria-label="`减少数值 ${index+1}`" :disabled="disabled||loading" @click="step(row,-1)"><el-icon><ArrowDown/></el-icon></button></span></div>
    <el-input v-else-if="definition(row.key)?.type==='NUMBER'" v-model="row.raw" :aria-label="`属性值 ${index+1}`" :disabled="disabled" inputmode="decimal"/>
    <el-select v-else-if="definition(row.key)?.type==='SWITCH'" v-model="row.raw" :aria-label="`属性值 ${index+1}`" :size="sourceStyle?'small':undefined" :disabled="disabled"><el-option v-for="option in switchOptions(definition(row.key)!)" :key="option.value" :label="sourceStyle?option.label:option.label==='开'?'开启':'关闭'" :value="option.value"/></el-select>
    <el-select v-else-if="definition(row.key)?.type==='ENUM'" :model-value="text(row.raw)" :aria-label="`属性值 ${index+1}`" :size="sourceStyle?'small':undefined" :placeholder="sourceStyle?'选择枚举值':undefined" :disabled="disabled" @update:model-value="row.raw=JSON.stringify($event)"><el-option v-for="option in definition(row.key)?.enumOptions" :key="option" :label="option" :value="option"/></el-select>
    <el-input v-else :model-value="text(row.raw)" :aria-label="`属性值 ${index+1}`" :size="sourceStyle?'small':undefined" :disabled="disabled" :placeholder="sourceStyle?'文本值':undefined" @update:model-value="row.raw=JSON.stringify($event)"/>
   </template>
  </template><span v-else-if="row.key">原属性当前不可读取，请取消并检查设备物模型。</span>
  <el-button v-if="sourceStyle" :icon="Delete" text class="scene-property-delete" :disabled="disabled||loading||!row.key||rows.length<=1" :aria-label="`移除属性 ${index+1}`" @click="rows.splice(index,1)"/><el-button v-else :disabled="disabled||loading" :aria-label="`移除属性 ${index+1}`" @click="rows.splice(index,1)">移除</el-button>
 </div><el-button :disabled="disabled||loading||!choices.length" @click="add">添加属性</el-button></div></el-form-item></el-form>
 <p v-if="loading">正在读取设备属性…</p><el-alert v-if="error" :title="error" type="warning" :closable="false"/>
 <template #footer><el-button :disabled="disabled" @click="emit('cancel')">取消</el-button><el-button type="primary" :disabled="disabled||loading||targetBusy||referenceBusy||!device" @click="save">确定</el-button></template>
</el-dialog></template>
<style scoped>.scene-action-type{display:flex;align-items:center;gap:14px;padding:14px 16px;background:#f8f9fa;border-radius:8px;margin-bottom:20px}.scene-action-type-icon{width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#1e88e5;background:#e3f2fd;font-size:22px}.scene-action-type strong{font-size:15px;font-weight:600;color:#333}.scene-action-type p{margin:4px 0 0;font-size:13px;color:#888}.scene-properties{width:100%}.scene-property-row{display:flex;align-items:center;gap:10px;margin-bottom:12px}.scene-property-row>.el-select,.scene-property-row>.el-input{min-width:0;flex:1}.scene-property-row.is-cloud .cloud-property{width:280px;flex:0 0 280px}.scene-property-row.is-cloud .scene-operation-select{width:150px;flex:0 0 150px}.scene-property-row.is-cloud .scene-operation-select.is-expanded{width:auto;flex:1}.scene-property-row.is-cloud>.scene-property-delete{width:20px;min-width:20px;flex:none;padding:0;margin:0;color:#f56c6c}.scene-exact-number{position:relative;min-width:0;flex:1}.scene-exact-number :deep(.el-input__wrapper){padding-right:33px}.scene-exact-number :deep(.el-input__inner){text-align:center}.scene-number-controls{position:absolute;top:1px;bottom:1px;right:1px;width:31px;display:flex;flex-direction:column;border-left:1px solid #dcdfe6;background:#f5f7fa;border-radius:0 4px 4px 0}.scene-number-controls button{display:flex;align-items:center;justify-content:center;flex:1;min-height:0;border:0;background:transparent;color:#606266;cursor:pointer;font-size:12px;padding:0}.scene-number-controls button+button{border-top:1px solid #dcdfe6}.scene-number-controls button:hover{color:#409eff}.scene-number-controls button:disabled{cursor:not-allowed;color:#c0c4cc}</style>
