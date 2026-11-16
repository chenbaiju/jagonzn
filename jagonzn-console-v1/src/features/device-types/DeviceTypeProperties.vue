<script setup lang="ts">
import {definitionTypeCaption,switchEncodingCaption} from './definition-presentation'
import DefinitionHelp from './DefinitionHelp.vue'
import DefinitionStyleControl from './DefinitionStyleControl.vue'
import DefinitionColorDrawer from './DefinitionColorDrawer.vue'
import DefinitionTypeLabel from './DefinitionTypeLabel.vue'
import DefinitionGuide from './DefinitionGuide.vue'
import './function-definition.css'
import {plainDeclaredNumber} from './scalar-material-values'
import type {ModelEditContext} from './model-edit-api'
import {publishedEditContext,type DefinitionContext} from './model-definition-table-api'
import {useDefinitionTableActions,nextDefinitionOrder} from './use-definition-table-actions'
import DefinitionRasterIconPicker from './DefinitionRasterIconPicker.vue'
import {rasterIconSource,type DefinitionRasterIcon} from './definition-raster-icon'
import {computed,onScopeDispose,reactive,ref,shallowRef,watch,type Component} from 'vue'
import {ArrowDown,CircleClose,Edit,Sort,CopyDocument,Delete,Plus,Sunny,Pouring,Lightning,Location,SwitchButton,Document,Odometer,Clock,Connection,Warning,Cpu} from '@element-plus/icons-vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {session,projectId,currentProject} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import JsonCodeEditor from '@/ui/JsonCodeEditor.vue'
import PropertyObjectFieldsEditor from './PropertyObjectFieldsEditor.vue'
import FunctionMdiIcon from './FunctionMdiIcon.vue'
import {functionMdiPath} from './function-style-icons'
import {propertyStyleIcons,type PropertyPresentation} from './property-presentation'
import {readObjectFields,objectFieldsSchema,type ObjectFieldDraft} from './property-object-fields'
import {typeProfileId} from './profile-api'
import {propertyTransport,propertyDraft,copyPropertyDraft,propertyAccess,propertyTypes,propertySwitchEncodings,prepareProperty,preparePropertyDelete,propertyMatches,type PropertyTransport,type PropertyDefinition,type PropertyIntent} from './property-definition-api'

const iconPreviewBusy=ref(false),rasterSession=ref(0)
const props=withDefaults(defineProps<{typeId:string;typeStatus?:'DRAFT'|'PUBLISHED';disabled?:boolean;transport?:PropertyTransport}>(),{transport:()=>propertyTransport})
const emit=defineEmits<{locked:[boolean];changed:[]}>()
const roles=['OWNER','ADMIN','OPERATOR','VIEWER'],denied=ref(false)
const member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&!!projectId.value&&roles.includes(session.user?.projectRole||'')&&!!currentProject.value&&roles.includes(currentProject.value.myRole||''))
const readable=computed(()=>member.value&&!denied.value),editableRole=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const tableContext=shallowRef<DefinitionContext>(),editContext=shallowRef<ModelEditContext>(),editConflict=ref(false)
const writable=computed(()=>editableRole.value&&!editConflict.value&&(props.typeStatus==='DRAFT'||props.typeStatus==='PUBLISHED'&&!!editContext.value))
async function readDefinitions(signal:AbortSignal){
 const project=projectId.value,typeId=props.typeId
 if(props.transport.definitionList){
  const actual=await props.transport.definitionList(project,typeId,signal)
  if(actual.context.typeStatus!==props.typeStatus)throw new Error('设备类型状态已变化，请刷新类型资料')
  if(!signal.aborted&&project===projectId.value&&typeId===props.typeId){tableContext.value=actual.context;editContext.value=publishedEditContext(actual.context)}
  return actual.items
 }
 if(props.typeStatus!=='PUBLISHED')return props.transport.list(project,typeId,signal)
 editContext.value=undefined
 if(!props.transport.publishedList)throw new Error('尚未取得已发布模型的完整编辑资料，请重新读取')
 const actual=await props.transport.publishedList(project,typeId,signal)
 if(!signal.aborted&&project===projectId.value&&typeId===props.typeId)editContext.value=actual.context
 return actual.items
}
const resource=useResource(readDefinitions)
const shown=ref(false),busy=ref(false),unknown=ref(false),error=ref(''),notice=ref(''),mode=ref<'create'|'update'|'delete'|'copy'>('create')
const editing=shallowRef<PropertyDefinition>(),intent=shallowRef<PropertyIntent>(),observed=shallowRef<readonly PropertyDefinition[]>(),form=reactive(propertyDraft())
const editorLocked=computed(()=>shown.value||busy.value||unknown.value),locked=computed(()=>editorLocked.value||tableActions.locked),navigationBlocked=computed(()=>readable.value&&(busy.value||unknown.value||tableActions.busy||tableActions.unknown))
const propertyIconComponents:Record<string,Component>={temperature:Sunny,humidity:Pouring,power:Lightning,location:Location,switch:SwitchButton,text:Document,number:Odometer,time:Clock,battery:Odometer,signal:Connection,alarm:Warning,device:Cpu}
const objectFormAvailable=computed(()=>readObjectFields(form.schema)!==undefined)
const observation=computed(()=>{const original=intent.value;if(!observed.value||!original)return'';const found=original.id?observed.value.find(row=>row.id===original.id):observed.value.find(row=>row.propertyKey===original.body?.propertyKey);return found?`当前可读属性：${found.name}（${found.propertyKey}）`:'当前列表中未见原目标；这不能证明原操作的历史结果。'})
let generation=0,alive=true,controller:AbortController|undefined
const tableActions=useDefinitionTableActions<PropertyDefinition>({
 typeId:()=>props.typeId,kind:'properties',rows:()=>resource.data.value,context:()=>tableContext.value,
 readable:()=>readable.value,writable:()=>editableRole.value,disabled:()=>!!props.disabled||editorLocked.value||resource.loading.value||!!resource.error.value,
 read:async signal=>{const items=await readDefinitions(signal);if(!tableContext.value)throw new Error('请重新读取完整定义后操作');return{items,context:tableContext.value}},
 write:(original,signal)=>{if(!props.transport.tableWrite)throw new Error('当前定义写入接口不完整');return props.transport.tableWrite(original,signal)},
 apply:actual=>{resource.error.value=undefined;resource.data.value=actual.items;tableContext.value=actual.context;editContext.value=publishedEditContext(actual.context)},
 unavailable:cause=>{resource.clear();resource.error.value=cause;tableContext.value=undefined;editContext.value=undefined},
 changed:()=>emit('changed')
})
function clearEditor(){editConflict.value=false;rasterSession.value++;iconPreviewBusy.value=false;generation++;controller?.abort();shown.value=false;busy.value=false;unknown.value=false;intent.value=undefined;observed.value=undefined;editing.value=undefined;error.value='';Object.assign(form,propertyDraft())}
function scopeChanged(){tableActions.reset();tableContext.value=undefined;editContext.value=undefined;clearEditor();resource.clear();notice.value='';denied.value=false;if(member.value&&typeProfileId(props.typeId))void resource.reload()}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId,type:props.typeId}}
function current(s:ReturnType<typeof capture>){return alive&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.account===session.user?.accountId&&s.type===props.typeId&&readable.value}
function deny(cause:unknown){clearEditor();resource.clear();denied.value=true;error.value=errorMessage(cause)}
function restartEditing(){if(busy.value||unknown.value||!readable.value)return;clearEditor();resource.clear();void resource.reload()}
function reload(){if(!readable.value||props.disabled||locked.value)return;resource.clear();void resource.reload()}
function open(kind:'create'|'update'|'delete'|'copy',value?:PropertyDefinition){
 if(!writable.value||props.disabled||busy.value||unknown.value||resource.loading.value||resource.error.value||!resource.data.value)return
 if(value&&!resource.data.value.includes(value))return
 if(kind==='copy'&&!value)return
 let appendedOrder:number|undefined;try{if(kind==='create'||kind==='copy')appendedOrder=nextDefinitionOrder(resource.data.value)}catch(cause){error.value=errorMessage(cause);return}
 clearEditor();mode.value=kind;editing.value=kind==='copy'?undefined:value;Object.assign(form,kind==='copy'?copyPropertyDraft(value!):propertyDraft(value));if(appendedOrder!==undefined)form.sortOrder=appendedOrder;shown.value=true;notice.value=''
}
function changeDataType(value:string){if(!writable.value||props.disabled||busy.value||unknown.value||form.dataType===value)return;if(form.defaultValue.trim()||form.textDefaultValue!==null){error.value='改变数据类型前请明确清空默认值';return}if(form.numericStep.trim()){error.value='改变数据类型前请明确清空精度步进';return}if(form.enumRows.some(row=>row.description.trim())||Object.keys(form.objectPresentation).length){error.value='改变数据类型前请明确清除当前类型的展示配置，避免丢失枚举说明或子字段名称';return}error.value='';Object.assign(form,{...propertyDraft(),name:form.name,propertyKey:form.propertyKey,accessType:['DAILY_TIMER','DAILY_TIMER_RANGE','DAILY_TIMER_DURATION','DAILY_TIMER_INTERVAL','DAILY_TIMER_LIST','DAILY_TIMER_RANGE_LIST','DAILY_TIMER_DURATION_LIST','DAILY_TIMER_INTERVAL_LIST'].includes(value)?'CLOUD_PRIVATE':form.accessType,sortOrder:form.sortOrder,description:form.description,dataType:value,compositeProfile:value==='LIST'?'BASIC_MIXED_LIST_V1':'',iconId:form.iconId,color:form.color,iconRaster:form.iconRaster,presentationMode:form.presentationMode})}
function presentationChanged(){if(writable.value&&!busy.value&&!unknown.value)form.presentationMode='replace'}
function rasterChanged(value:DefinitionRasterIcon|null){if(!writable.value||busy.value||unknown.value)return;form.iconRaster=value;if(value){form.iconId='';form.color=''}form.presentationMode='replace'}
function fixedIconChanged(){if(!writable.value||busy.value||unknown.value)return;form.iconRaster=null;form.presentationMode='replace'}
function enumChanged(){form.enumText='';presentationChanged()}
function addEnum(){if(writable.value&&!busy.value&&!unknown.value&&form.enumRows.length<100){form.enumRows.push({value:'',description:''});enumChanged()}}
function removeEnum(index:number){if(writable.value&&!busy.value&&!unknown.value){form.enumRows.splice(index,1);enumChanged()}}
function objectRowsChanged(rows:ObjectFieldDraft[]){if(!writable.value||busy.value||unknown.value)return;const structural=(values:readonly ObjectFieldDraft[])=>JSON.stringify(values.map(({key,dataType,required,maxLength})=>({key,dataType,required,maxLength})));form.objectChanged=form.objectChanged||structural(rows)!==structural(form.objectRows);form.objectRows=rows;form.objectPresentation=Object.fromEntries(rows.map(row=>[row.key.trim(),{name:row.name,description:row.description.trim()||null}]));presentationChanged()}
function objectMode(value:'form'|'json'){
 if(!writable.value||busy.value||unknown.value||form.objectMode===value)return
 try{if(value==='json'){if(form.objectChanged)form.schema=objectFieldsSchema(form.objectRows);form.objectChanged=false;form.objectMode='json'}else{const rows=readObjectFields(form.schema,{iconId:null,color:null,enumDescriptions:{},objectFields:form.objectPresentation} as PropertyPresentation);if(rows===undefined)throw new Error('当前Schema包含表单未表示的约束，不能无损切换；请保留JSON编辑');form.objectRows=rows;form.objectChanged=false;form.objectMode='form'}error.value=''}catch(cause){error.value=errorMessage(cause)}
}
function close(){if(busy.value)return;if(unknown.value)shown.value=false;else clearEditor()}
async function apply(continueAdding=false){
 if(iconPreviewBusy.value||!writable.value||props.disabled||!shown.value||busy.value||unknown.value)return
 let original:PropertyIntent;const copied=mode.value==='copy'
 try{original=mode.value==='delete'?preparePropertyDelete(projectId.value,props.typeId,editing.value!):prepareProperty(projectId.value,props.typeId,form,editing.value);if(props.typeStatus==='PUBLISHED'){if(!editContext.value)throw new Error('请重新读取当前模型后编辑');original=Object.freeze({...original,modelEdit:editContext.value})}
 }catch(cause){error.value=errorMessage(cause);return}
 intent.value=original;unknown.value=true;observed.value=undefined;busy.value=true;error.value='';const s=capture();controller=new AbortController();let writeAccepted=false
 try{
  const returned=await props.transport.write(original,controller.signal);writeAccepted=true
  if(!current(s)||!writable.value)return
  if(original.kind!=='delete'&&(!returned||!propertyMatches(returned,original)))throw new Error('保存回执与本次属性不符，请读取当前列表核对')
  const actual=await readDefinitions(controller.signal)
  if(!current(s)||!writable.value)return
  if(original.kind==='delete'?actual.some(row=>row.id===original.id):!actual.some(row=>row.id===returned!.id&&propertyMatches(row,original)))throw new Error('当前属性列表与操作回执不同，请核对原操作')
  resource.data.value=actual;clearEditor();notice.value=original.kind==='delete'?'属性已删除':copied?'属性已复制':'属性定义已保存';emit('changed')
  if(continueAdding&&original.kind==='create'&&writable.value){mode.value='create';shown.value=true}
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(!writeAccepted&&original.modelEdit&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&cause.status===409){unknown.value=false;intent.value=undefined;editConflict.value=true;error.value='功能定义已变化，请重新读取后编辑。';return}
  if(!writeAccepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[401,403,404].includes(cause.status)){deny(cause);return}
  if(!writeAccepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,409,413,422,429].includes(cause.status)){unknown.value=false;intent.value=undefined}
  error.value=errorMessage(cause)
 }}finally{if(current(s))busy.value=false}
}
async function readCurrent(){
 const original=intent.value;if(!original||!unknown.value||busy.value||!readable.value)return
 const s=capture();controller=new AbortController();busy.value=true;observed.value=undefined;error.value=''
 try{const rows=await readDefinitions(controller.signal);if(current(s))observed.value=rows}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){deny(cause);return}error.value=errorMessage(cause)}}
 finally{if(current(s))busy.value=false}
}
function finish(){if(!unknown.value||observed.value===undefined||busy.value)return;resource.data.value=observed.value;clearEditor();notice.value='已结束本次核对；原操作结果仍未确认'}
watch([()=>projectId.value,()=>session.user?.accountId,()=>props.typeId,()=>member.value,()=>props.transport],scopeChanged,{immediate:true,flush:'sync'})
watch(()=>props.typeStatus,()=>{if(!unknown.value&&!busy.value)scopeChanged()},{flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{clearEditor();resource.clear();denied.value=false;notice.value='';queueMicrotask(()=>{if(alive&&member.value&&typeProfileId(props.typeId)&&!resource.loading.value)void resource.reload()})})
onBeforeRouteLeave(()=>!navigationBlocked.value);onBeforeRouteUpdate(()=>!navigationBlocked.value)
function beforeUnload(event:BeforeUnloadEvent){if(navigationBlocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload)
onScopeDispose(()=>{alive=false;clearEditor();dispose();window.removeEventListener('beforeunload',beforeUnload);emit('locked',false)})
const accessLabel=(value:string)=>propertyAccess.find(([key])=>key===value)?.[1]||'未指定（兼容）'
const dataLabel=(value:string)=>propertyTypes.find(([key])=>key===value)?.[1]||'未知'
function numberOptions(row:PropertyDefinition){
 const values:string[]=[]
 if(row.unit)values.push(row.unit)
 if(row.numericStep!==undefined)values.push(`精度 ${plainDeclaredNumber(row.numericStep)}`)
 if(row.minimumValue!==null&&row.minimumValue!==undefined)values.push(`最小值 ${plainDeclaredNumber(row.minimumValue)}`)
 if(row.maximumValue!==null&&row.maximumValue!==undefined)values.push(`最大值 ${plainDeclaredNumber(row.maximumValue)}`)
 return values.join(' · ')
}
</script>
<template><section class="type-properties function-definitions"><header><h3>属性<DefinitionHelp text="了解属性定义" href="https://www.thingscloud.xyz/docs/guide/device-type/function-define.html#属性"/></h3><span><el-dropdown v-if="tableActions.selected.length" trigger="click" @command="tableActions.openDelete"><el-button size="small" :disabled="!tableActions.allowed">批量操作<el-icon class="batch-arrow"><ArrowDown/></el-icon></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="delete" class="definition-remove" :icon="Delete">移除属性</el-dropdown-item></el-dropdown-menu></template></el-dropdown><el-button v-if="editableRole" type="primary" :icon="Plus" :disabled="!writable||disabled||locked||resource.loading.value||!resource.data.value"  @click="open('create')">添加属性</el-button></span></header>
 <p v-if="!editableRole&&readable" class="tl-muted">当前账号、类型或项目状态只允许读取属性定义。</p>
 <el-alert v-if="notice" :title="notice" type="info" :closable="false"/><el-alert v-if="error&&!shown" :title="error" type="error" :closable="false"/>

 <el-alert v-if="tableActions.notice" :title="tableActions.notice" type="info" :closable="false"/>
 <el-alert v-if="tableActions.error&&!tableActions.shown" :title="tableActions.error" type="error" :closable="false"><el-button v-if="tableActions.conflict" size="small" @click="tableActions.reload">重新读取</el-button></el-alert>
 <el-button v-if="tableActions.unknown&&!tableActions.shown" @click="tableActions.shown=true">核对表格操作结果</el-button>
 <AsyncState :forbidden="!readable" :loading="resource.loading.value" :error="resource.error.value" @retry="reload"><el-table class="definition-table" :data="resource.data.value||[]" row-key="id" :row-class-name="tableActions.rowClass" @selection-change="tableActions.select" empty-text="暂无属性"><el-table-column v-if="editableRole" type="selection" width="24" :selectable="()=>tableActions.allowed"/><el-table-column label="属性名称" width="180"><template #default="{row}"><img v-if="row.presentation?.iconRaster" :src="rasterIconSource(row.presentation.iconRaster)" width="24" height="24" alt="功能图标" class="definition-raster"/><FunctionMdiIcon v-else-if="functionMdiPath(row.presentation?.iconId)" :icon-id="row.presentation?.iconId" :color="row.presentation?.color"/><el-icon v-else-if="row.presentation?.iconId" :style="{color:row.presentation.color||undefined}" class="property-icon"><component :is="propertyIconComponents[row.presentation.iconId]"/></el-icon><span v-else-if="row.presentation?.color" class="property-color-dot" :style="{backgroundColor:row.presentation.color}"/>{{row.name}}</template></el-table-column><el-table-column prop="propertyKey" label="属性标识符" width="180"/><el-table-column label="属性类型" width="130"><template #default="{row}"><span class="definition-access" :class="`definition-access--${row.accessType.toLowerCase()}`">{{accessLabel(row.accessType)}}</span></template></el-table-column><el-table-column label="数据类型" width="180"><template #default="{row}"><DefinitionTypeLabel :type="row.dataType" :label="dataLabel(row.dataType)"/></template></el-table-column><el-table-column label="扩展选项" min-width="180"><template #default="{row}"><span v-if="row.dataType==='NUMBER'">{{numberOptions(row)}}</span><span v-else-if="row.dataType==='SWITCH'"><span class="definition-option">值类型: {{row.switchEncoding==='NUMBER'?'1/0':row.switchEncoding==='TEXT'?'ON/OFF':'true/false'}}</span><span v-if="row.onLabel||row.offLabel" class="definition-option">值名称: {{row.onLabel||'-'}}/{{row.offLabel||'-'}}</span></span><span v-else-if="row.dataType==='ENUM'"><span v-for="value in row.enumOptions" :key="value" class="enum-label">{{value}}{{row.presentation?.enumDescriptions[value]?`：${row.presentation.enumDescriptions[value]}`:''}}</span></span><span v-else-if="row.dataType==='LIST'&&row.compositeProfile==='BASIC_MIXED_LIST_V1'">混合基本值列表</span><span v-else-if="row.dataType==='OBJECT'||row.dataType==='LIST'">固定元素结构</span><span v-else/></template></el-table-column><el-table-column v-if="editableRole" width="226" align="right" class-name="definition-actions"><template #default="{row}"><el-button size="small" :icon="Edit" title="编辑" aria-label="编辑" :disabled="!writable||disabled||locked" @click="open('update',row)"><span class="action-label">编辑</span></el-button><el-button size="small" :icon="Sort" title="请点此拖动进行上下排序" aria-label="排序" :draggable="false" class="definition-sort-handle" :class="{'definition-dragging':tableActions.dragging}" :disabled="!tableActions.allowed||tableActions.shown" @pointerdown="tableActions.startPointer($event,row.id)" @dragstart.prevent><span class="action-label">排序</span></el-button><el-button size="small" :icon="CopyDocument" title="复制到新属性" aria-label="复制到新属性" :disabled="!writable||disabled||locked" @click="open('copy',row)"><span class="action-label">复制</span></el-button><el-button size="small" type="danger" :icon="Delete" title="移除" aria-label="移除" :disabled="!writable||disabled||locked" @click="open('delete',row)"><span class="action-label">删除</span></el-button></template></el-table-column></el-table></AsyncState>
 <el-button v-if="unknown&&!shown" @click="shown=true">核对属性操作结果</el-button>
 <el-dialog class="function-definition-dialog function-property-dialog" :model-value="shown&&readable" :title="mode==='delete'?'删除属性':mode==='update'?'编辑属性':mode==='copy'?'复制属性':'添加属性'" width="min(700px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :before-close="(done:()=>void)=>{if(!busy){close();done()}}" destroy-on-close>
  <DefinitionGuide v-if="!unknown&&mode!=='delete'" kind="属性" :published="typeStatus==='PUBLISHED'"/>
  <el-button v-if="editConflict" :disabled="busy||unknown" @click="restartEditing">重新读取定义</el-button>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="unknown"><el-alert title="原操作结果尚未确认；只读取当前列表，不会重新提交。当前同值或缺失都不证明原写入的历史结果。" type="warning" :closable="false"/><p v-if="observed">{{observation}}</p></template>
  <p v-else-if="mode==='delete'">确认删除属性“{{editing?.name}}（{{editing?.propertyKey}}）”？本次修改仅影响后续模型版本，已有设备绑定保持。</p>
  <p v-if="!unknown&&mode==='copy'" class="tl-muted">副本尚未保存，请填写新的属性标识符后确认。</p>
  <el-form v-if="!unknown&&mode!=='delete'" label-position="top" :disabled="busy||unknown||disabled||!writable" @submit.prevent="apply(false)"><div class="definition-name-row"><el-form-item label="属性名称"><el-input v-model="form.name" aria-label="属性名称" maxlength="128" placeholder="填写属性名称"/></el-form-item><el-form-item><template #label>样式<DefinitionHelp text="选择图标和颜色，仅影响展示。"/></template><DefinitionStyleControl label="属性样式" :icons="propertyStyleIcons" :icon-id="form.iconId" :active="shown&&!unknown" :disabled="busy||unknown||disabled||!writable" :selection-disabled="iconPreviewBusy" :color="form.color" @choose-icon="form.iconId=$event;fixedIconChanged()"><template #color><DefinitionColorDrawer :model-value="form.color" label="属性颜色" :default-color="'#2f4153'" :active="shown&&!unknown" :disabled="!!form.iconRaster||iconPreviewBusy||busy||unknown||disabled||!writable" @update:model-value="form.color=$event;presentationChanged()"/></template><template #preview><img v-if="form.iconRaster" :src="rasterIconSource(form.iconRaster)" width="24" height="24" alt="功能图标"/><FunctionMdiIcon v-else-if="functionMdiPath(form.iconId)" :icon-id="form.iconId" :color="form.color"/><el-icon v-else-if="form.iconId" :style="{color:form.color||undefined}"><component :is="propertyIconComponents[form.iconId]"/></el-icon></template><template #icon="{value}"><FunctionMdiIcon v-if="functionMdiPath(value)" :icon-id="value"/><el-icon v-else><component :is="propertyIconComponents[value]"/></el-icon></template><template #upload><DefinitionRasterIconPicker :key="rasterSession" :type-id="typeId" :model-value="form.iconRaster" :active="shown&&!unknown" :disabled="busy||unknown||disabled||!writable" @update:model-value="rasterChanged" @busy="iconPreviewBusy=$event"/></template></DefinitionStyleControl></el-form-item></div><el-form-item><template #label>属性标识符<DefinitionHelp text="使用类型内唯一的标识符。"/></template><el-input v-model="form.propertyKey" aria-label="属性标识符" maxlength="64" placeholder="填写唯一标识"/></el-form-item><el-form-item label="属性类型"><el-radio-group v-model="form.accessType" aria-label="属性流向"><el-radio v-for="[value,label] in propertyAccess" :key="value" :value="value" :disabled="['DAILY_TIMER','DAILY_TIMER_RANGE','DAILY_TIMER_DURATION','DAILY_TIMER_INTERVAL','DAILY_TIMER_LIST','DAILY_TIMER_RANGE_LIST','DAILY_TIMER_DURATION_LIST','DAILY_TIMER_INTERVAL_LIST'].includes(form.dataType)&&value!=='CLOUD_PRIVATE'">{{label}}</el-radio></el-radio-group><p v-if="form.accessType==='UNDEFINED'" class="tl-muted">该属性流向尚未明确，请选择后保存。</p></el-form-item><el-form-item label="数据类型"><el-select :model-value="form.dataType" aria-label="属性数据类型" placeholder="选择数据类型" @update:model-value="changeDataType(String($event))"><template #prefix><DefinitionTypeLabel v-if="form.dataType" :type="form.dataType" label=""/></template><el-option-group label="基本类型"><el-option v-for="[value,label] in propertyTypes.filter(([value])=>!value.startsWith('DAILY_TIMER'))" :key="value" :value="value" :label="definitionTypeCaption(label)"><DefinitionTypeLabel :type="value" :label="label"/></el-option></el-option-group><el-option-group label="高级类型"><el-option v-for="[value,label] in propertyTypes.filter(([value])=>value.startsWith('DAILY_TIMER'))" :key="value" :value="value" :label="definitionTypeCaption(label)"><DefinitionTypeLabel :type="value" :label="label"/></el-option></el-option-group></el-select></el-form-item>
   <template v-if="form.dataType==='NUMBER'"><el-form-item label="单位"><el-input v-model="form.unit" aria-label="属性单位" maxlength="32"/></el-form-item><div class="property-field-pair"><el-form-item label="默认值"><el-input v-model="form.defaultValue" aria-label="属性默认值" placeholder="未声明"/><p class="tl-muted">仅声明默认值，不替代设备实际上报。</p></el-form-item><el-form-item label="精度"><el-input v-model="form.numericStep" aria-label="属性步进" inputmode="decimal" maxlength="1024" clearable placeholder="例如 0.5"/></el-form-item></div><div class="property-field-pair"><el-form-item label="最小值"><el-input v-model="form.minimum" aria-label="属性最小值"/></el-form-item><el-form-item label="最大值"><el-input v-model="form.maximum" aria-label="属性最大值"/></el-form-item></div></template>
   <el-form-item v-else-if="form.dataType==='TEXT'" label="默认值"><el-input :model-value="form.textDefaultValue??''" aria-label="文本属性默认值" maxlength="4096" clearable placeholder="未声明" @update:model-value="form.textDefaultValue=$event===''?null:String($event)" @clear="form.textDefaultValue=null"><template #suffix><el-button v-if="form.textDefaultValue===''" link :icon="CircleClose" aria-label="清除文本默认值" @click="form.textDefaultValue=null"/></template></el-input></el-form-item>
   <template v-else-if="form.dataType==='SWITCH'"><el-form-item label="开关值类型"><el-select v-model="form.switchEncoding" aria-label="开关值类型"><el-option v-for="[value] in propertySwitchEncodings" :key="value" :value="value" :label="switchEncodingCaption(value)"/></el-select></el-form-item><div class="property-field-pair"><el-form-item :label="form.switchEncoding==='NUMBER'?'1 名称':form.switchEncoding==='TEXT'?'ON 名称':'true 名称'"><el-input v-model="form.onLabel" aria-label="属性开启文字" maxlength="32"/></el-form-item><el-form-item :label="form.switchEncoding==='NUMBER'?'0 名称':form.switchEncoding==='TEXT'?'OFF 名称':'false 名称'"><el-input v-model="form.offLabel" aria-label="属性关闭文字" maxlength="32"/></el-form-item></div></template><el-form-item v-else-if="form.dataType==='ENUM'" label="枚举值与说明"><div class="property-enums"><div v-for="(row,index) in form.enumRows" :key="index"><el-input v-model="row.value" :aria-label="`枚举值${index+1}`" placeholder="枚举值（文本）" maxlength="64" @input="enumChanged"/><el-input v-model="row.description" :aria-label="`枚举说明${index+1}`" placeholder="说明（可选）" maxlength="512" @input="enumChanged"/><el-button @click="removeEnum(index)">移除枚举项</el-button></div><el-button :disabled="form.enumRows.length>=100" @click="addEnum">添加枚举项</el-button></div></el-form-item>
   <el-form-item v-else-if="form.dataType==='OBJECT'" label="Object直接子字段"><div class="object-editor"><div class="object-editor-actions"><el-button :type="form.objectMode==='form'?'primary':'default'" :disabled="!objectFormAvailable&&form.objectMode==='json'" @click="objectMode('form')">结构化表单</el-button><el-button :type="form.objectMode==='json'?'primary':'default'" @click="objectMode('json')">JSON编辑</el-button></div><PropertyObjectFieldsEditor v-if="form.objectMode==='form'" :model-value="form.objectRows" :disabled="busy||unknown||disabled||!writable" @update:model-value="objectRowsChanged"/><template v-else><JsonCodeEditor v-model="form.schema" ariaLabel="属性复合Schema" :height="220" :disabled="busy||unknown||disabled||!writable"/><p v-if="!objectFormAvailable" class="tl-muted">当前Schema包含表单未表示的约束，不能无损切换；请保留JSON编辑，样式修改不会重写原Schema。</p></template></div></el-form-item>
   <template v-else-if="form.dataType==='LIST'"><el-form-item label="列表元素"><el-select v-model="form.compositeProfile" aria-label="列表元素模式"><el-option value="BASIC_MIXED_LIST_V1" label="混合基本值"/><el-option value="" label="固定元素结构"/></el-select><p class="tl-muted">切换列表模式会替换保存时的结构约束，取消可保留原定义。</p></el-form-item><template v-if="form.compositeProfile==='BASIC_MIXED_LIST_V1'"><div class="property-field-pair"><el-form-item label="最少项数"><el-input v-model="form.listMinimum" aria-label="列表最少项数" placeholder="未指定"/></el-form-item><el-form-item label="最多项数"><el-input v-model="form.listMaximum" aria-label="列表最多项数"/></el-form-item></div><p class="tl-muted">允许组合数值、文本、布尔、对象和列表，不支持空值。云端维护和明确版本的设备上报可用；设备下发与现有固件升级暂不支持。</p></template><el-form-item v-else label="受限 JSON Schema"><JsonCodeEditor v-model="form.schema" ariaLabel="属性复合Schema" :height="220" :disabled="busy||unknown||disabled||!writable"/><p class="tl-muted">保留原有元素结构和约束，保存前由服务端完整校验。</p></el-form-item></template>
   <el-form-item label="属性描述"><el-input v-model="form.description" aria-label="属性描述" type="textarea" :rows="2" maxlength="512"/></el-form-item>
  </el-form>
  <template #footer>
   <el-button v-if="!unknown&&mode==='create'&&writable" class="definition-continue" :disabled="disabled||busy||iconPreviewBusy" @click="apply(true)">保存并继续添加</el-button>
   <el-button :disabled="busy" @click="close">{{unknown?'关闭':'取消'}}</el-button>
   <template v-if="unknown">
    <el-button :loading="busy" @click="readCurrent">读取当前属性列表</el-button>
    <el-button type="primary" :disabled="busy||observed===undefined" @click="finish">已核对，结束本次操作</el-button>
   </template>
   <el-button v-else-if="writable" :type="mode==='delete'?'danger':'primary'" :disabled="disabled||busy||iconPreviewBusy" :loading="busy" @click="apply(false)">{{mode==='delete'?'确认删除':'保存'}}</el-button>
  </template>
 </el-dialog> <el-dialog :model-value="tableActions.shown&&readable" title="提示" width="min(420px,94vw)" :show-close="!tableActions.busy&&!tableActions.unknown" :close-on-click-modal="false" :close-on-press-escape="false" :before-close="(done:()=>void)=>{if(!tableActions.busy&&!tableActions.unknown){tableActions.cancel();done()}}">
  <template v-if="tableActions.unknown"><p>原操作结果尚未确认；只读取当前定义，不会再次提交。</p><p v-if="tableActions.observed">已读取当前定义；当前状态不能证明原请求的历史结果。</p><el-alert v-if="tableActions.error" :title="tableActions.error" type="error" :closable="false"/></template><p v-else>确认移除吗？</p>
  <template #footer><template v-if="tableActions.unknown"><el-button :loading="tableActions.busy" @click="tableActions.review">读取当前定义</el-button><el-button :disabled="tableActions.busy||!tableActions.observed" @click="tableActions.finish">结束核对</el-button></template><template v-else><el-button @click="tableActions.cancel">取消</el-button><el-button type="primary" :loading="tableActions.busy" :disabled="!tableActions.allowed" @click="tableActions.confirmDelete">确定</el-button></template></template>
 </el-dialog>
</section></template>
<style scoped>.definition-sort-handle{touch-action:none;user-select:none;cursor:grab}.definition-sort-handle.definition-dragging{cursor:grabbing}.type-properties :deep(.definition-actions .cell){white-space:nowrap}.batch-arrow{margin-left:8px}.definition-remove{color:var(--el-color-danger)}.type-properties :deep(.el-table__row){transition:background-color .12s}.el-dropdown{margin-right:10px}.action-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.definition-raster{object-fit:contain;vertical-align:middle;margin-right:6px}.property-field-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.type-properties :deep(.el-select){width:100%}.type-properties :deep(.el-radio-group){display:flex;gap:4px 12px;flex-wrap:wrap}.property-style{display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%}.property-style>.el-select{width:150px}.property-style>.el-input{width:130px}.property-style>.el-icon{font-size:24px}.property-icon,.property-color-dot{margin-right:7px;vertical-align:middle}.property-color-dot{display:inline-block;width:12px;height:12px;border-radius:50%}.property-enums,.object-editor{width:100%}.property-enums>div{display:grid;grid-template-columns:1fr 1.5fr auto;gap:8px;margin-bottom:8px}.enum-label{display:inline-block;margin-right:8px}.object-editor-actions{display:flex;gap:8px;margin-bottom:12px}@media(max-width:600px){.property-field-pair{grid-template-columns:minmax(0,1fr);gap:0}.property-enums>div{grid-template-columns:1fr}.property-style>.el-select{width:140px}}</style>
