<script setup lang="ts">
import DefinitionHelp from './DefinitionHelp.vue'
import DefinitionStyleControl from './DefinitionStyleControl.vue'
import DefinitionColorDrawer from './DefinitionColorDrawer.vue'
import DefinitionTypeLabel from './DefinitionTypeLabel.vue'
import DefinitionGuide from './DefinitionGuide.vue'
import './function-definition.css'
import type {ModelEditContext} from './model-edit-api'
import {publishedEditContext,type DefinitionContext} from './model-definition-table-api'
import {useDefinitionTableActions,nextDefinitionOrder} from './use-definition-table-actions'
import DefinitionRasterIconPicker from './DefinitionRasterIconPicker.vue'
import {rasterIconSource,type DefinitionRasterIcon} from './definition-raster-icon'
import {computed,onScopeDispose,reactive,ref,shallowRef,watch,type Component} from 'vue'
import {ArrowDown,Edit,Sort,CopyDocument,Delete,Plus,Sunny,Pouring,Lightning,Location,SwitchButton,Document,Odometer,Clock,Connection,Warning,Cpu} from '@element-plus/icons-vue'
import {commandStyleIcons,fixedFunctionMdiIcon,sourceStyleTokenWithoutGlyph} from './function-style-icons'
import FunctionMdiIcon from './FunctionMdiIcon.vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {session,projectId,currentProject} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import CommandParameterSchemaEditor from './CommandParameterSchemaEditor.vue'
import {readCommandParameterForm} from './command-parameter-schema'
import {typeProfileId} from './profile-api'
import {commandTransport,commandDraft,commandCopyDraft,prepareCommand,prepareCommandDelete,commandMatches,type CommandTransport,type CommandDefinition,type CommandIntent} from './command-definition-api'

const iconPreviewBusy=ref(false),rasterSession=ref(0)
const props=withDefaults(defineProps<{typeId:string;typeStatus?:'DRAFT'|'PUBLISHED';disabled?:boolean;transport?:CommandTransport}>(),{transport:()=>commandTransport})
const emit=defineEmits<{locked:[boolean];changed:[]}>()
const commandIcons:Record<string,Component>={temperature:Sunny,humidity:Pouring,power:Lightning,location:Location,switch:SwitchButton,text:Document,number:Odometer,time:Clock,battery:Odometer,signal:Connection,alarm:Warning,device:Cpu}
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
const editing=shallowRef<CommandDefinition>(),intent=shallowRef<CommandIntent>(),observed=shallowRef<readonly CommandDefinition[]>(),form=reactive(commandDraft())
const editorLocked=computed(()=>shown.value||busy.value||unknown.value),locked=computed(()=>editorLocked.value||tableActions.locked),navigationBlocked=computed(()=>readable.value&&(busy.value||unknown.value||tableActions.busy||tableActions.unknown))
const observation=computed(()=>{const original=intent.value;if(!observed.value||!original)return'';const found=original.id?observed.value.find(row=>row.id===original.id):observed.value.find(row=>row.commandKey===original.body?.commandKey);return found?`当前可读命令：${found.name}（${found.commandKey}）`:'当前列表中未见原目标；这不能证明原操作的历史结果。'})
let generation=0,alive=true,controller:AbortController|undefined
const tableActions=useDefinitionTableActions<CommandDefinition>({
 typeId:()=>props.typeId,kind:'commands',rows:()=>resource.data.value,context:()=>tableContext.value,
 readable:()=>readable.value,writable:()=>editableRole.value,disabled:()=>!!props.disabled||editorLocked.value||resource.loading.value||!!resource.error.value,
 read:async signal=>{const items=await readDefinitions(signal);if(!tableContext.value)throw new Error('请重新读取完整定义后操作');return{items,context:tableContext.value}},
 write:(original,signal)=>{if(!props.transport.tableWrite)throw new Error('当前定义写入接口不完整');return props.transport.tableWrite(original,signal)},
 apply:actual=>{resource.error.value=undefined;resource.data.value=actual.items;tableContext.value=actual.context;editContext.value=publishedEditContext(actual.context)},
 unavailable:cause=>{resource.clear();resource.error.value=cause;tableContext.value=undefined;editContext.value=undefined},
 changed:()=>emit('changed')
})
function clearEditor(){editConflict.value=false;rasterSession.value++;iconPreviewBusy.value=false;generation++;controller?.abort();shown.value=false;busy.value=false;unknown.value=false;intent.value=undefined;observed.value=undefined;editing.value=undefined;error.value='';Object.assign(form,commandDraft())}
function scopeChanged(){tableActions.reset();tableContext.value=undefined;editContext.value=undefined;clearEditor();resource.clear();notice.value='';denied.value=false;if(member.value&&typeProfileId(props.typeId))void resource.reload()}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId,type:props.typeId}}
function current(s:ReturnType<typeof capture>){return alive&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.account===session.user?.accountId&&s.type===props.typeId&&readable.value}
function deny(cause:unknown){clearEditor();resource.clear();denied.value=true;error.value=errorMessage(cause)}
function restartEditing(){if(busy.value||unknown.value||!readable.value)return;clearEditor();resource.clear();void resource.reload()}
function reload(){if(!readable.value||props.disabled||locked.value)return;resource.clear();void resource.reload()}
function open(kind:'create'|'update'|'delete'|'copy',value?:CommandDefinition){
 if(!writable.value||props.disabled||busy.value||unknown.value||resource.loading.value||resource.error.value||!resource.data.value)return
 if(value&&!resource.data.value.includes(value))return
 if(kind==='copy'&&!value)return
 let appendedOrder:number|undefined;try{if(kind==='create'||kind==='copy')appendedOrder=nextDefinitionOrder(resource.data.value)}catch(cause){error.value=errorMessage(cause);return}
 clearEditor();mode.value=kind;editing.value=kind==='copy'?undefined:value;Object.assign(form,kind==='copy'?commandCopyDraft(value!):commandDraft(value));if(appendedOrder!==undefined)form.sortOrder=appendedOrder;shown.value=true;notice.value=''
}
function presentationChanged(){if(writable.value&&!busy.value&&!unknown.value)form.presentationMode='replace'}
function rasterChanged(value:DefinitionRasterIcon|null){if(!writable.value||busy.value||unknown.value)return;form.iconRaster=value;if(value){form.iconId='';form.color=''}form.presentationMode='replace'}
function fixedIconChanged(){if(!writable.value||busy.value||unknown.value)return;form.iconRaster=null;form.presentationMode='replace'}
function clearPresentation(){if(!writable.value||busy.value||unknown.value)return;form.iconId='';form.color='';form.iconRaster=null;form.presentationMode='clear'}
function parameterOrderChanged(kind:'input'|'output',order:string[]|null){if(!writable.value||busy.value||unknown.value)return;if(kind==='input')form.inputParameterOrder=order;else form.outputParameterOrder=order;form.presentationMode='replace'}
function colorChanged(value:unknown){if(!writable.value||busy.value||unknown.value)return;form.color=typeof value==='string'?value:'';presentationChanged()}
function close(){if(busy.value)return;if(unknown.value)shown.value=false;else clearEditor()}
async function apply(continueAdding=false){
 if(iconPreviewBusy.value||!writable.value||props.disabled||!shown.value||busy.value||unknown.value)return
 let original:CommandIntent
 try{
  original=mode.value==='delete'?prepareCommandDelete(projectId.value,props.typeId,editing.value!):prepareCommand(projectId.value,props.typeId,form,editing.value)
  if(props.typeStatus==='PUBLISHED'){if(!editContext.value)throw new Error('请重新读取当前模型后编辑');original=Object.freeze({...original,modelEdit:editContext.value})}
 }catch(cause){error.value=errorMessage(cause);return}
 intent.value=original;unknown.value=true;observed.value=undefined;busy.value=true;error.value='';const s=capture();controller=new AbortController();let writeAccepted=false
 try{
  const returned=await props.transport.write(original,controller.signal);writeAccepted=true
  if(!current(s)||!writable.value)return
  if(original.kind!=='delete'&&(!returned||!commandMatches(returned,original)))throw new Error('保存回执与本次命令不符，请读取当前列表核对')
  const actual=await readDefinitions(controller.signal)
  if(!current(s)||!writable.value)return
  if(original.kind==='delete'?actual.some(row=>row.id===original.id):!actual.some(row=>row.id===returned!.id&&commandMatches(row,original)))throw new Error('当前命令列表与操作回执不同，请核对原操作')
  resource.data.value=actual;clearEditor();notice.value=original.kind==='delete'?'命令已删除':'命令定义已保存';emit('changed')
  if(continueAdding&&original.kind==='create'&&writable.value){mode.value='create';shown.value=true}
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(!writeAccepted&&original.modelEdit&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&cause.status===409){unknown.value=false;intent.value=undefined;editConflict.value=true;error.value='功能定义已变化，请重新读取后编辑。';return}
  if(!writeAccepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[401,403,404].includes(cause.status)){deny(cause);return}
  if(!writeAccepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,413,422,429].includes(cause.status)){unknown.value=false;intent.value=undefined}
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
function parameterSummary(schema:string|null|undefined,order?:readonly string[]|null){
 if(!schema)return ''
 const form=readCommandParameterForm(schema,order)
 return form?form.rows.map(row=>row.name||row.key).join('、'):'已定义参数'
}
</script>
<template><section class="type-commands function-definitions"><header><h3>命令<DefinitionHelp text="了解命令定义" href="https://www.thingscloud.xyz/docs/guide/device-type/function-define.html#命令"/></h3><span><el-dropdown v-if="tableActions.selected.length" trigger="click" @command="tableActions.openDelete"><el-button size="small" :disabled="!tableActions.allowed">批量操作<el-icon class="batch-arrow"><ArrowDown/></el-icon></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="delete" class="definition-remove" :icon="Delete">移除命令</el-dropdown-item></el-dropdown-menu></template></el-dropdown><el-button v-if="editableRole" type="primary" :icon="Plus" :disabled="!writable||disabled||locked||resource.loading.value||!resource.data.value"  @click="open('create')">添加命令</el-button></span></header>
 <p v-if="!editableRole&&readable" class="tl-muted">当前账号、类型或项目状态只允许读取命令定义。</p>
 <el-alert v-if="notice" :title="notice" type="info" :closable="false"/><el-alert v-if="error&&!shown" :title="error" type="error" :closable="false"/>

 <el-alert v-if="tableActions.notice" :title="tableActions.notice" type="info" :closable="false"/>
 <el-alert v-if="tableActions.error&&!tableActions.shown" :title="tableActions.error" type="error" :closable="false"><el-button v-if="tableActions.conflict" size="small" @click="tableActions.reload">重新读取</el-button></el-alert>
 <el-button v-if="tableActions.unknown&&!tableActions.shown" @click="tableActions.shown=true">核对表格操作结果</el-button>
 <AsyncState :forbidden="!readable" :loading="resource.loading.value" :error="resource.error.value" @retry="reload"><el-table class="definition-table" :data="resource.data.value||[]" row-key="id" :row-class-name="tableActions.rowClass" @selection-change="tableActions.select" empty-text="暂无命令"><el-table-column v-if="editableRole" type="selection" width="24" :selectable="()=>tableActions.allowed"/><el-table-column label="命令名称" width="180"><template #default="{row}"><img v-if="row.presentation?.iconRaster" :src="rasterIconSource(row.presentation.iconRaster)" width="24" height="24" alt="功能图标" class="definition-raster"/><FunctionMdiIcon v-else-if="fixedFunctionMdiIcon(row.presentation?.iconId)" :icon-id="row.presentation.iconId" :color="row.presentation.color" class="command-icon"/><el-icon v-else-if="row.presentation?.iconId" :style="{color:row.presentation.color||undefined}" class="command-icon"><component :is="commandIcons[row.presentation.iconId]"/></el-icon><span v-else-if="row.presentation?.color" class="command-color" :style="{backgroundColor:row.presentation.color}"/>{{row.name}}</template></el-table-column><el-table-column prop="commandKey" label="命令标识符" width="180"/><el-table-column label="命令参数" min-width="200"><template #default="{row}">{{parameterSummary(row.inputSchema,row.presentation?.inputParameterOrder)}}</template></el-table-column><el-table-column label="回复参数" min-width="200"><template #default="{row}">{{parameterSummary(row.outputSchema,row.presentation?.outputParameterOrder)}}</template></el-table-column><el-table-column v-if="editableRole" width="260" align="right" class-name="definition-actions"><template #default="{row}"><el-button size="small" :icon="Edit" title="编辑" aria-label="编辑" :disabled="!writable||disabled||locked" @click="open('update',row)"><span class="action-label">编辑</span></el-button><el-button size="small" :icon="Sort" title="请点此拖动进行上下排序" aria-label="排序" :draggable="false" class="definition-sort-handle" :class="{'definition-dragging':tableActions.dragging}" :disabled="!tableActions.allowed||tableActions.shown" @pointerdown="tableActions.startPointer($event,row.id)" @dragstart.prevent><span class="action-label">排序</span></el-button><el-button size="small" :icon="CopyDocument" title="复制到新命令" aria-label="复制到新命令" :disabled="!writable||disabled||locked" @click="open('copy',row)"><span class="action-label">复制</span></el-button><el-button size="small" type="danger" :icon="Delete" title="移除" aria-label="移除" :disabled="!writable||disabled||locked" @click="open('delete',row)"><span class="action-label">删除</span></el-button></template></el-table-column></el-table></AsyncState>
 <el-button v-if="unknown&&!shown" @click="shown=true">核对命令操作结果</el-button>
 <el-dialog class="function-definition-dialog" :model-value="shown&&readable" :title="mode==='delete'?'删除命令':mode==='copy'?'复制到新命令':mode==='update'?'编辑命令':'添加命令'" width="min(700px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :before-close="(done:()=>void)=>{if(!busy){close();done()}}" destroy-on-close>
  <DefinitionGuide v-if="!unknown&&mode!=='delete'" kind="命令" :published="typeStatus==='PUBLISHED'"/>
  <el-button v-if="editConflict" :disabled="busy||unknown" @click="restartEditing">重新读取定义</el-button>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="unknown"><el-alert title="原操作结果尚未确认；只读取当前列表，不会重新提交。当前同值或缺失都不证明原写入的历史结果。" type="warning" :closable="false"/><p v-if="observed">{{observation}}</p></template>
  <p v-else-if="mode==='delete'">确认删除命令“{{editing?.name}}（{{editing?.commandKey}}）”？这会移除该类型草稿中的命令定义。</p>
  <el-form v-else label-position="top" :disabled="busy||unknown||disabled||!writable" @submit.prevent="apply(false)"><div class="definition-name-row"><el-form-item label="命令名称"><el-input v-model="form.name" aria-label="命令名称" maxlength="128" placeholder="填写命令名称"/></el-form-item><el-form-item><template #label>样式<DefinitionHelp text="选择图标和颜色，仅影响展示。"/></template><DefinitionStyleControl label="命令样式" :icons="commandStyleIcons" :icon-id="form.iconId" :active="shown&&!unknown" :disabled="busy||unknown||disabled||!writable" :selection-disabled="iconPreviewBusy" :color="form.color" @choose-icon="form.iconId=$event;fixedIconChanged()"><template #color><DefinitionColorDrawer :model-value="form.color" label="命令颜色" :default-color="'#2f4153'" :active="shown&&!unknown" :disabled="!!form.iconRaster||iconPreviewBusy||busy||unknown||disabled||!writable" @update:model-value="colorChanged($event)"/></template><template #preview><img v-if="form.iconRaster" :src="rasterIconSource(form.iconRaster)" width="24" height="24" alt="功能图标"/><FunctionMdiIcon v-else-if="fixedFunctionMdiIcon(form.iconId)" :icon-id="form.iconId" :color="form.color"/><el-icon v-else-if="form.iconId" :style="{color:form.color||undefined}"><component :is="commandIcons[form.iconId]"/></el-icon></template><template #icon="{value}"><span v-if="sourceStyleTokenWithoutGlyph(value)" class="definition-no-glyph">?</span><FunctionMdiIcon v-else-if="fixedFunctionMdiIcon(value)" :icon-id="value"/><el-icon v-else><component :is="commandIcons[value]"/></el-icon></template><template #upload><DefinitionRasterIconPicker :key="rasterSession" :type-id="typeId" :model-value="form.iconRaster" :active="shown&&!unknown" :disabled="busy||unknown||disabled||!writable" @update:model-value="rasterChanged" @busy="iconPreviewBusy=$event"/></template><span v-if="sourceStyleTokenWithoutGlyph(form.iconId)" class="tl-muted">原图标暂无对应图形，标识和颜色仍保留。</span><el-button v-if="mode!=='create'" :disabled="iconPreviewBusy" @click="clearPresentation">清除命令样式</el-button></DefinitionStyleControl></el-form-item></div><el-form-item><template #label>命令标识符<DefinitionHelp text="使用类型内唯一的标识符。"/></template><el-input v-model="form.commandKey" aria-label="命令标识符" maxlength="64" placeholder="填写唯一标识"/></el-form-item>
   <p v-if="mode==='copy'" class="tl-muted">填写新的唯一标识符后创建独立命令；取消不会写入副本。</p>
   <el-form-item label="命令参数"><CommandParameterSchemaEditor v-model="form.inputSchema" :parameter-order="form.inputParameterOrder" @update:parameter-order="parameterOrderChanged('input',$event)" label="命令输入" ariaLabel="命令输入Schema" :disabled="busy||unknown||disabled||!writable"/></el-form-item><el-form-item label="回复参数"><CommandParameterSchemaEditor v-model="form.outputSchema" :parameter-order="form.outputParameterOrder" @update:parameter-order="parameterOrderChanged('output',$event)" label="命令回复" ariaLabel="命令回复Schema" :disabled="busy||unknown||disabled||!writable"/></el-form-item>
   <details class="definition-advanced definition-command-options"><summary>高级设置</summary><el-form-item label="超时（秒）"><el-input v-model="form.timeoutSeconds" aria-label="命令超时秒数" inputmode="numeric" maxlength="5"/><p class="tl-muted">命令执行的等待上限，1 至 86400 秒。</p></el-form-item></details><el-form-item label="命令描述"><el-input v-model="form.description" aria-label="命令描述" type="textarea" :rows="5" maxlength="500"/></el-form-item>
  </el-form>
  <template #footer><el-button :disabled="busy" @click="close">{{unknown?'关闭':'取消'}}</el-button><template v-if="unknown"><el-button :loading="busy" @click="readCurrent">读取当前命令列表</el-button><el-button type="primary" :disabled="busy||observed===undefined" @click="finish">已核对，结束本次操作</el-button></template><template v-else><el-button v-if="writable" :type="mode==='delete'?'danger':'primary'" :disabled="disabled||busy||iconPreviewBusy" :loading="busy" @click="apply(false)">{{mode==='delete'?'确认删除':mode==='copy'?'创建副本':'保存'}}</el-button></template></template>
 </el-dialog> <el-dialog :model-value="tableActions.shown&&readable" title="提示" width="min(420px,94vw)" :show-close="!tableActions.busy&&!tableActions.unknown" :close-on-click-modal="false" :close-on-press-escape="false" :before-close="(done:()=>void)=>{if(!tableActions.busy&&!tableActions.unknown){tableActions.cancel();done()}}">
  <template v-if="tableActions.unknown"><p>原操作结果尚未确认；只读取当前定义，不会再次提交。</p><p v-if="tableActions.observed">已读取当前定义；当前状态不能证明原请求的历史结果。</p><el-alert v-if="tableActions.error" :title="tableActions.error" type="error" :closable="false"/></template><p v-else>确认移除吗？</p>
  <template #footer><template v-if="tableActions.unknown"><el-button :loading="tableActions.busy" @click="tableActions.review">读取当前定义</el-button><el-button :disabled="tableActions.busy||!tableActions.observed" @click="tableActions.finish">结束核对</el-button></template><template v-else><el-button @click="tableActions.cancel">取消</el-button><el-button type="primary" :loading="tableActions.busy" :disabled="!tableActions.allowed" @click="tableActions.confirmDelete">确定</el-button></template></template>
 </el-dialog>
</section></template>
<style scoped>.definition-sort-handle{touch-action:none;user-select:none;cursor:grab}.definition-sort-handle.definition-dragging{cursor:grabbing}.type-commands :deep(.definition-actions .cell){white-space:nowrap}.batch-arrow{margin-left:8px}.definition-remove{color:var(--el-color-danger)}.el-dropdown{margin-right:10px}.action-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.definition-raster{object-fit:contain;vertical-align:middle;margin-right:6px}.command-schema{font:12px/1.5 Monaco,Menlo,Consolas,monospace;white-space:pre-wrap;overflow:auto;max-height:112px;margin:0;word-break:break-word}.command-style{display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%}.command-style :deep(.el-select){width:150px}.command-style :deep(.el-input){width:140px}.command-icon{margin-right:6px}.command-color{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}</style>
