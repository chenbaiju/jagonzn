<script setup lang="ts">
import {definitionTypeCaption} from './definition-presentation'
import DefinitionLevelIcon from './DefinitionLevelIcon.vue'
import DefinitionHelp from './DefinitionHelp.vue'
import DefinitionStyleControl from './DefinitionStyleControl.vue'
import DefinitionColorDrawer from './DefinitionColorDrawer.vue'
import DefinitionGuide from './DefinitionGuide.vue'
import './function-definition.css'
import {eventBasicObjectSchema,eventParameterForType} from './event-definition-api'
import type {ModelEditContext} from './model-edit-api'
import {publishedEditContext,type DefinitionContext} from './model-definition-table-api'
import {useDefinitionTableActions,nextDefinitionOrder} from './use-definition-table-actions'
import DefinitionRasterIconPicker from './DefinitionRasterIconPicker.vue'
import {rasterIconSource,type DefinitionRasterIcon} from './definition-raster-icon'
import {computed,onScopeDispose,reactive,ref,shallowRef,watch,type Component} from 'vue'
import {ArrowDown,Edit,Sort,CopyDocument,Delete,Plus,Refresh,Sunny,Pouring,Lightning,Location,SwitchButton,Document,Odometer,Clock,Connection,Warning,Cpu} from '@element-plus/icons-vue'
import {eventStyleIcons,fixedFunctionMdiIcon,sourceStyleTokenWithoutGlyph} from './function-style-icons'
import FunctionMdiIcon from './FunctionMdiIcon.vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import {typeDeviceUuid} from './type-devices-api'
import {eventDefinitionTransport,eventDraft,eventCopyDraft,eventLevels,eventParameterTypes,normalizeEventParameter,prepareEvent,prepareEventDelete,eventMatches,type EventDefinition,type EventDefinitionTransport,type EventIntent,type EventParameterDraft} from './event-definition-api'
const iconPreviewBusy=ref(false),rasterSession=ref(0)
const props=withDefaults(defineProps<{typeId:string;typeStatus:string;disabled?:boolean;transport?:EventDefinitionTransport}>(),{disabled:false,transport:()=>eventDefinitionTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>()
const denied=ref(false),member=computed(()=>!!projectId.value&&typeDeviceUuid.test(props.typeId)&&!session.transitioning&&can('device:read')&&['OWNER','ADMIN','OPERATOR','VIEWER'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN','OPERATOR','VIEWER'].includes(currentProject.value?.myRole||''))
const readable=computed(()=>member.value&&!denied.value),editableRole=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
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
const shown=ref(false),busy=ref(false),unknown=ref(false),error=ref(''),notice=ref(''),mode=ref<'create'|'update'|'delete'|'copy'>('create'),editing=shallowRef<EventDefinition>(),form=reactive(eventDraft()),intent=shallowRef<EventIntent>(),observed=shallowRef<readonly EventDefinition[]>()
const parameterOpen=ref(false),parameterIndex=ref(-1),parameterError=ref(''),parameter=reactive<EventParameterDraft>({name:'',parameterKey:'',dataType:'NUMBER',compositeProfile:undefined,required:false,enumOptions:[],sortOrder:0,schema:'',description:''}),enumText=ref('')
const editorLocked=computed(()=>shown.value||busy.value||unknown.value||iconPreviewBusy.value),locked=computed(()=>editorLocked.value||tableActions.locked)
const eventIcons:Record<string,Component>={temperature:Sunny,humidity:Pouring,power:Lightning,location:Location,switch:SwitchButton,text:Document,number:Odometer,time:Clock,battery:Odometer,signal:Connection,alarm:Warning,device:Cpu}
function rasterChanged(value:DefinitionRasterIcon|null){if(!writable.value||busy.value||unknown.value)return;form.iconRaster=value;if(value){form.iconId='';form.color=''}form.presentationMode='replace'}
function fixedIconChanged(){if(!writable.value||busy.value||unknown.value)return;form.iconRaster=null;form.presentationMode='replace'}
function clearPresentation(){if(!writable.value||busy.value||unknown.value)return;form.iconId='';form.color='';form.iconRaster=null;form.presentationMode='clear'}
const observation=computed(()=>{if(!observed.value||!intent.value)return '';const original=intent.value;const found=original.id?observed.value.find(row=>row.id===original.id):observed.value.find(row=>row.eventKey===original.body?.eventKey);return found?`当前列表可读事件：${found.name}（${found.eventKey}）。`:'当前列表中未见原目标；这不能证明原操作的历史结果。'})
let generation=0,alive=true,controller:AbortController|undefined
const tableActions=useDefinitionTableActions<EventDefinition>({
 typeId:()=>props.typeId,kind:'events',rows:()=>resource.data.value,context:()=>tableContext.value,
 readable:()=>readable.value,writable:()=>editableRole.value,disabled:()=>!!props.disabled||editorLocked.value||resource.loading.value||!!resource.error.value,
 read:async signal=>{const items=await readDefinitions(signal);if(!tableContext.value)throw new Error('请重新读取完整定义后操作');return{items,context:tableContext.value}},
 write:(original,signal)=>{if(!props.transport.tableWrite)throw new Error('当前定义写入接口不完整');return props.transport.tableWrite(original,signal)},
 apply:actual=>{resource.error.value=undefined;resource.data.value=actual.items;tableContext.value=actual.context;editContext.value=publishedEditContext(actual.context)},
 unavailable:cause=>{resource.clear();resource.error.value=cause;tableContext.value=undefined;editContext.value=undefined},
 changed:()=>emit('changed')
})
function clearEditor(){editConflict.value=false;rasterSession.value++;iconPreviewBusy.value=false;generation++;controller?.abort();shown.value=false;parameterOpen.value=false;busy.value=false;unknown.value=false;intent.value=undefined;observed.value=undefined;editing.value=undefined;error.value='';parameterError.value='';Object.assign(form,eventDraft())}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId,type:props.typeId}}
function current(value:ReturnType<typeof capture>){return alive&&value.generation===generation&&value.epoch===identityEpoch()&&value.project===projectId.value&&value.account===session.user?.accountId&&value.type===props.typeId&&readable.value}
function reset(){tableActions.reset();tableContext.value=undefined;editContext.value=undefined;clearEditor();resource.clear();denied.value=false;notice.value='';if(member.value)void resource.reload()}
function deny(){clearEditor();resource.clear();denied.value=true;notice.value=''}
function restartEditing(){if(busy.value||unknown.value||!readable.value)return;clearEditor();resource.clear();void resource.reload()}
function reload(){if(!readable.value||props.disabled||locked.value)return;resource.clear();void resource.reload()}
function open(kind:'create'|'update'|'delete'|'copy',value?:EventDefinition){
 if(!writable.value||props.disabled||locked.value||resource.loading.value||resource.error.value||!resource.data.value||value&&!resource.data.value.some(row=>row.id===value.id))return
 if(kind==='copy'&&!value)return
 let appendedOrder:number|undefined;try{if(kind==='create'||kind==='copy')appendedOrder=nextDefinitionOrder(resource.data.value)}catch(cause){error.value=errorMessage(cause);return}
 clearEditor();mode.value=kind;editing.value=kind==='copy'?undefined:value;Object.assign(form,kind==='copy'?eventCopyDraft(value!):eventDraft(value));if(appendedOrder!==undefined)form.sortOrder=appendedOrder;shown.value=true;notice.value=''
}
function close(){if(busy.value)return;if(unknown.value)shown.value=false;else clearEditor()}
function beforeClose(done:()=>void){if(!busy.value){close();done()}}
function editParameter(index=-1){
 if(!writable.value||busy.value||unknown.value||mode.value==='delete')return
 if(index<0&&form.parameters.length>=100){error.value='参数最多100项';return}
 const value=index>=0?form.parameters[index]:undefined
 parameterIndex.value=index;Object.assign(parameter,value?{...value,enumOptions:[...value.enumOptions]}:{name:'',parameterKey:'',dataType:'NUMBER',compositeProfile:undefined,required:false,enumOptions:[],sortOrder:form.parameters.reduce((max,item)=>Math.max(max,item.sortOrder),-1)+1,schema:'',description:''});enumText.value=parameter.enumOptions.join('\n');parameterError.value='';parameterOpen.value=true
}
function changeParameterType(){
 const before=parameterIndex.value>=0?form.parameters[parameterIndex.value]:undefined
 Object.assign(parameter,eventParameterForType(parameter,parameter.dataType,before?.dataType==='OBJECT'&&!before.compositeProfile))
}
function saveParameter(){
 if(!writable.value||busy.value||unknown.value)return
 try{const draft={...parameter,compositeProfile:parameter.dataType==='OBJECT'?parameter.compositeProfile:parameter.compositeProfile===undefined?undefined:null,schema:parameter.dataType==='OBJECT'&&parameter.compositeProfile?eventBasicObjectSchema:['OBJECT','LIST'].includes(parameter.dataType)?parameter.schema:'',enumOptions:parameter.dataType==='ENUM'?enumText.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean):[]};normalizeEventParameter(draft)
  if(form.parameters.some((value,index)=>index!==parameterIndex.value&&value.parameterKey===draft.parameterKey.trim()))throw new Error('事件参数标识符不能重复')
  const value={...draft,name:draft.name.trim(),parameterKey:draft.parameterKey.trim()};if(parameterIndex.value<0)form.parameters.push(value);else form.parameters[parameterIndex.value]=value;parameterOpen.value=false
 }catch(cause){parameterError.value=errorMessage(cause)}
}
function removeParameter(index:number){if(writable.value&&!busy.value&&!unknown.value)form.parameters.splice(index,1)}
async function save(){
 if(iconPreviewBusy.value||!writable.value||props.disabled||busy.value||unknown.value||!shown.value)return
 let original:EventIntent
 try{
  original=mode.value==='delete'?prepareEventDelete(projectId.value,props.typeId,editing.value!):prepareEvent(projectId.value,props.typeId,form,editing.value)
  if(props.typeStatus==='PUBLISHED'){if(!editContext.value)throw new Error('请重新读取当前模型后编辑');original=Object.freeze({...original,modelEdit:editContext.value})}
 }catch(cause){error.value=errorMessage(cause);return}
 intent.value=original;unknown.value=true;observed.value=undefined;busy.value=true;error.value='';const state=capture();controller=new AbortController();let accepted=false
 try{const result=await props.transport.write(original,controller.signal);accepted=true;if(!current(state)||!writable.value)return
  if(original.kind!=='delete'&&(!result||!eventMatches(result,original)))throw new Error('保存回执与本次事件不符，请读取当前列表核对')
  const actual=await readDefinitions(controller.signal);if(!current(state)||!writable.value)return
  if(original.kind==='delete'?actual.some(row=>row.id===original.id):!actual.some(row=>row.id===result!.id&&eventMatches(row,original)))throw new Error('当前事件列表与操作回执不同，请核对原操作')
  resource.data.value=actual;clearEditor();notice.value=original.kind==='delete'?'事件已删除':'事件定义已保存';emit('changed')
 }catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){
  if(!accepted&&original.modelEdit&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&cause.status===409){unknown.value=false;intent.value=undefined;editConflict.value=true;error.value='功能定义已变化，请重新读取后编辑。';return}
  if(cause instanceof ApiError&&cause.code!==10014&&[401,403].includes(cause.status)){deny();return}
  error.value=errorMessage(cause);if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&cause.status>=400&&cause.status<500){unknown.value=false;intent.value=undefined}
 }}finally{if(current(state))busy.value=false}
}
async function readCurrent(){
 const original=intent.value;if(!original||!unknown.value||!readable.value||busy.value)return
 const state=capture();controller?.abort();controller=new AbortController();busy.value=true;error.value='';observed.value=undefined
 try{const value=await readDefinitions(controller.signal);if(current(state))observed.value=value}
 catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();else error.value=errorMessage(cause)}}
 finally{if(current(state))busy.value=false}
}
function finishCheck(){if(busy.value||!unknown.value)return;const actual=observed.value;clearEditor();if(actual)resource.data.value=actual;notice.value='已结束本次核对；原操作结果仍未确认，未标记为保存或删除成功。'}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,()=>member.value,()=>props.transport],reset,{immediate:true,flush:'sync'})
watch(()=>props.typeStatus,()=>{if(!unknown.value&&!busy.value)reset()},{flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{clearEditor();resource.clear();notice.value=''});onScopeDispose(()=>{alive=false;clearEditor();dispose();emit('locked',false)})
</script>
<template><section class="type-events function-definitions">
 <header><h3>事件<DefinitionHelp text="了解事件定义" href="https://www.thingscloud.xyz/docs/guide/device-type/function-define.html#事件"/></h3><div><el-dropdown v-if="tableActions.selected.length" trigger="click" @command="tableActions.openDelete"><el-button size="small" :disabled="!tableActions.allowed">批量操作<el-icon class="batch-arrow"><ArrowDown/></el-icon></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="delete" class="definition-remove" :icon="Delete">移除事件</el-dropdown-item></el-dropdown-menu></template></el-dropdown><el-button v-if="editableRole" type="primary" :icon="Plus" :disabled="!writable||disabled||locked||resource.loading.value"  @click="open('create')">添加事件</el-button></div></header>
 <el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <el-alert v-if="unknown&&!shown" title="存在尚未确认的事件操作，请先核对。" type="warning" :closable="false"><el-button @click="shown=true">查看未确认操作</el-button></el-alert>

 <el-alert v-if="tableActions.notice" :title="tableActions.notice" type="info" :closable="false"/>
 <el-alert v-if="tableActions.error&&!tableActions.shown" :title="tableActions.error" type="error" :closable="false"><el-button v-if="tableActions.conflict" size="small" @click="tableActions.reload">重新读取</el-button></el-alert>
 <el-button v-if="tableActions.unknown&&!tableActions.shown" @click="tableActions.shown=true">核对表格操作结果</el-button>
 <AsyncState :forbidden="!readable" :loading="resource.loading.value" :error="resource.error.value" @retry="reload"><el-table class="definition-table" v-if="resource.data.value" :data="[...resource.data.value]" row-key="id" :row-class-name="tableActions.rowClass" @selection-change="tableActions.select" empty-text="暂无事件"><el-table-column v-if="editableRole" type="selection" width="24" :selectable="()=>tableActions.allowed"/>
  <el-table-column label="事件名称" width="180"><template #default="{row}"><img v-if="row.presentation?.iconRaster" :src="rasterIconSource(row.presentation.iconRaster)" width="24" height="24" alt="功能图标" class="definition-raster"/><FunctionMdiIcon v-else-if="fixedFunctionMdiIcon(row.presentation?.iconId)" :icon-id="row.presentation.iconId" :color="row.presentation.color" class="event-icon"/><el-icon v-else-if="row.presentation?.iconId" :style="{color:row.presentation.color||undefined}"><component :is="eventIcons[row.presentation.iconId]"/></el-icon><DefinitionLevelIcon v-else :level="row.level"/>{{row.name}}</template></el-table-column><el-table-column prop="eventKey" label="事件标识符" width="180"/>
  <el-table-column label="事件参数" min-width="220"><template #default="{row}"><span v-for="parameter in row.parameters" :key="parameter.id" class="event-parameter">{{parameter.name||parameter.parameterKey}}</span></template></el-table-column>
  <el-table-column v-if="editableRole" width="226" align="right" class-name="definition-actions"><template #default="{row}"><el-button size="small" :icon="Edit" title="编辑" aria-label="编辑" :disabled="!writable||disabled||locked" @click="open('update',row)"><span class="action-label">编辑</span></el-button><el-button size="small" :icon="Sort" title="请点此拖动进行上下排序" aria-label="排序" :draggable="false" class="definition-sort-handle" :class="{'definition-dragging':tableActions.dragging}" :disabled="!tableActions.allowed||tableActions.shown" @pointerdown="tableActions.startPointer($event,row.id)" @dragstart.prevent><span class="action-label">排序</span></el-button><el-button size="small" :icon="CopyDocument" title="复制到新事件" aria-label="复制到新事件" :disabled="!writable||disabled||locked" @click="open('copy',row)"><span class="action-label">复制</span></el-button><el-button size="small" type="danger" :icon="Delete" title="移除" aria-label="移除" :disabled="!writable||disabled||locked" @click="open('delete',row)"><span class="action-label">删除</span></el-button></template></el-table-column>
 </el-table></AsyncState>
 <el-dialog class="function-definition-dialog" :model-value="shown&&readable" :title="mode==='create'?'添加事件':mode==='copy'?'复制到新事件':mode==='delete'?'删除事件':'编辑事件'" width="min(700px,94vw)" :close-on-click-modal="false" :show-close="!busy" :before-close="beforeClose">
  <DefinitionGuide v-if="!unknown&&mode!=='delete'" kind="事件" :published="typeStatus==='PUBLISHED'"/>
  <el-button v-if="editConflict" :disabled="busy||unknown" @click="restartEditing">重新读取定义</el-button>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="unknown"><el-alert title="原操作结果尚未确认，不会再次提交。请读取当前事件列表核对。" type="warning" :closable="false"/><p v-if="observation">{{observation}}</p><el-button :loading="busy" @click="readCurrent">读取当前事件</el-button><el-button :disabled="busy" @click="finishCheck">结束本次核对</el-button></template>
  <p v-else-if="mode==='delete'">确定删除事件“{{editing?.name}}”？{{typeStatus==='PUBLISHED'?'本次修改生成新模型版本，已有设备绑定保持。':'此操作只修改当前草稿定义。'}}</p>
  <el-form v-else label-position="top" :disabled="busy||disabled||!writable" @submit.prevent="save"><div class="definition-name-row"><el-form-item label="事件名称"><el-input v-model="form.name" aria-label="事件名称" maxlength="128" placeholder="填写事件名称"/></el-form-item><el-form-item><template #label>样式<DefinitionHelp text="选择图标和颜色，仅影响展示。"/></template><DefinitionStyleControl label="事件样式" :icons="eventStyleIcons" :icon-id="form.iconId" :active="shown&&!unknown" :disabled="busy||unknown||disabled||!writable" :selection-disabled="iconPreviewBusy" :color="form.color" @choose-icon="form.iconId=$event;fixedIconChanged()"><template #color><DefinitionColorDrawer :model-value="form.color" label="事件颜色" :default-color="form.level==='WARNING'?'#e6c23b':form.level==='SUCCESS'?'#67c23a':form.level==='ERROR'?'#f56c6c':'#3498db'" :active="shown&&!unknown" :disabled="!!form.iconRaster||iconPreviewBusy||busy||unknown||disabled||!writable" @update:model-value="form.color=$event;form.presentationMode='replace'"/></template><template #preview><img v-if="form.iconRaster" :src="rasterIconSource(form.iconRaster)" width="24" height="24" alt="功能图标"/><FunctionMdiIcon v-else-if="fixedFunctionMdiIcon(form.iconId)" :icon-id="form.iconId" :color="form.color"/><el-icon v-else-if="form.iconId" :style="{color:form.color||undefined}"><component :is="eventIcons[form.iconId]"/></el-icon><DefinitionLevelIcon v-else :level="form.level"/></template><template #icon="{value}"><span v-if="sourceStyleTokenWithoutGlyph(value)" class="definition-no-glyph">?</span><FunctionMdiIcon v-else-if="fixedFunctionMdiIcon(value)" :icon-id="value"/><el-icon v-else><component :is="eventIcons[value]"/></el-icon></template><template #upload><DefinitionRasterIconPicker :key="rasterSession" :type-id="typeId" :model-value="form.iconRaster" :active="shown&&!unknown" :disabled="busy||unknown||disabled||!writable" @update:model-value="rasterChanged" @busy="iconPreviewBusy=$event"/></template><span v-if="sourceStyleTokenWithoutGlyph(form.iconId)" class="tl-muted">原图标暂无对应图形，标识和颜色仍保留。</span><el-button v-if="mode!=='create'" :disabled="iconPreviewBusy" @click="clearPresentation">清除事件样式</el-button></DefinitionStyleControl></el-form-item></div><el-form-item><template #label>事件标识符<DefinitionHelp text="使用类型内唯一的标识符。"/></template><el-input v-model="form.eventKey" aria-label="事件标识符" maxlength="64"/></el-form-item>
   <p v-if="mode==='copy'" class="event-unavailable">填写新的唯一标识符后创建独立事件；取消不会写入副本。</p>
   <el-form-item label="事件参数"><el-table :data="form.parameters" empty-text="暂无数据"><el-table-column prop="name" label="参数名称"/><el-table-column prop="parameterKey" label="参数标识符"/><el-table-column label="数据类型"><template #default="{row}">{{definitionTypeCaption(eventParameterTypes.find(([value])=>value===row.dataType)?.[1]||row.dataType)}}</template></el-table-column><el-table-column width="130" class-name="definition-parameter-actions"><template #default="{$index}"><el-button :icon="Edit" aria-label="编辑参数" size="small" @click="editParameter($index)"><span class="definition-parameter-action-label">编辑参数</span></el-button><el-button :icon="Delete" aria-label="移除参数" type="danger" size="small" @click="removeParameter($index)"><span class="definition-parameter-action-label">移除参数</span></el-button></template></el-table-column></el-table><el-button size="small" :disabled="form.parameters.length>=100" @click="editParameter()">添加参数</el-button><small v-if="form.parameters.some(parameter=>parameter.required)">现有参数必填约束将在保存时保留。</small></el-form-item>
   <el-form-item label="事件级别"><el-radio-group v-model="form.level" aria-label="事件级别"><el-radio v-for="[value,label] in eventLevels" :key="value" :value="value"><DefinitionLevelIcon :level="value"/>{{label}}</el-radio></el-radio-group></el-form-item><el-form-item label="事件描述"><el-input v-model="form.description" aria-label="事件描述" type="textarea" :rows="5" maxlength="500"/></el-form-item>
  </el-form>
  <template #footer><el-button :disabled="busy" @click="close">{{unknown?'关闭':'取消'}}</el-button><el-button v-if="!unknown" type="primary" :disabled="disabled||!writable||iconPreviewBusy" :loading="busy" @click="save">{{mode==='delete'?'确定删除':mode==='copy'?'创建副本':'保存'}}</el-button></template>
 </el-dialog>
 <el-dialog class="function-definition-dialog function-parameter-dialog" :model-value="parameterOpen&&shown&&writable&&!unknown" :title="parameterIndex<0?'添加参数':'编辑参数'" width="min(700px,94vw)" :close-on-click-modal="false" @close="parameterOpen=false"><el-alert v-if="parameterError" :title="parameterError" type="error" :closable="false"/><el-form label-position="top" @submit.prevent="saveParameter"><el-form-item label="参数名称"><el-input v-model="parameter.name" aria-label="参数名称" maxlength="128"/></el-form-item><el-form-item label="参数标识符"><el-input v-model="parameter.parameterKey" aria-label="参数标识符" maxlength="64"/></el-form-item><el-form-item label="数据类型"><el-select v-model="parameter.dataType" aria-label="参数数据类型" @change="changeParameterType"><el-option v-for="[value,label] in eventParameterTypes" :key="value" :value="value" :label="definitionTypeCaption(label)"/></el-select></el-form-item><el-form-item v-if="parameter.dataType==='ENUM'" label="枚举值（每行一项）"><el-input v-model="enumText" aria-label="参数枚举值" type="textarea" :rows="4"/></el-form-item><el-form-item label="参数描述"><el-input v-model="parameter.description" aria-label="参数说明" type="textarea" :rows="5" maxlength="512"/></el-form-item><el-form-item v-if="(parameter.dataType==='OBJECT'&&!parameter.compositeProfile)||parameter.dataType==='LIST'" label="参数受限 JSON Schema"><el-input v-model="parameter.schema" aria-label="参数 Schema" type="textarea" :rows="8" maxlength="65536"/><small>Object 根类型为 object，须封闭并指定 maxProperties；List 根类型为 array，须指定 maxItems 与 items。完整约束由保存时校验。</small></el-form-item></el-form><template #footer><el-button aria-label="取消参数" @click="parameterOpen=false">取消</el-button><el-button aria-label="确定参数" type="primary" @click="saveParameter">保存</el-button></template></el-dialog>
 <el-dialog :model-value="tableActions.shown&&readable" title="提示" width="min(420px,94vw)" :show-close="!tableActions.busy&&!tableActions.unknown" :close-on-click-modal="false" :close-on-press-escape="false" :before-close="(done:()=>void)=>{if(!tableActions.busy&&!tableActions.unknown){tableActions.cancel();done()}}">
  <template v-if="tableActions.unknown"><p>原操作结果尚未确认；只读取当前定义，不会再次提交。</p><p v-if="tableActions.observed">已读取当前定义；当前状态不能证明原请求的历史结果。</p><el-alert v-if="tableActions.error" :title="tableActions.error" type="error" :closable="false"/></template><p v-else>确认移除吗？</p>
  <template #footer><template v-if="tableActions.unknown"><el-button :loading="tableActions.busy" @click="tableActions.review">读取当前定义</el-button><el-button :disabled="tableActions.busy||!tableActions.observed" @click="tableActions.finish">结束核对</el-button></template><template v-else><el-button @click="tableActions.cancel">取消</el-button><el-button type="primary" :loading="tableActions.busy" :disabled="!tableActions.allowed" @click="tableActions.confirmDelete">确定</el-button></template></template>
 </el-dialog>
</section></template>
<style scoped>.definition-sort-handle{touch-action:none;user-select:none;cursor:grab}.definition-sort-handle.definition-dragging{cursor:grabbing}.type-events :deep(.definition-actions .cell){white-space:nowrap}.batch-arrow{margin-left:8px}.definition-remove{color:var(--el-color-danger)}.el-dropdown{margin-right:10px}.action-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.definition-raster{object-fit:contain;vertical-align:middle;margin-right:6px}.type-events small,.event-unavailable{color:var(--tl-muted);font-size:12px;line-height:20px}.event-parameter{display:inline-block;margin-right:12px}.type-events :deep(.el-form-item__content){gap:8px}.type-events :deep(.el-select){width:100%}</style>
