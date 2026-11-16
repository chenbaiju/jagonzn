<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import type {Schema} from '@/core/contracts'
import {projectId} from '@/core/session'
import {ApiError,errorMessage,identityEpoch} from '@/core/http'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import RuleActionDeviceTarget,{type RuleActionDeviceTarget as Target} from './RuleActionDeviceTarget.vue'
import {sceneTaskConfig,sceneTaskNode,sceneTaskPresentation,type SceneNode} from './scene-editor-draft'
import {automationTaskRun,automationTaskRunAction,automationTaskPresentation,type AutomationNode} from './automation-editor-draft'
import {readSceneDeviceTasks,readSceneTaskName} from './scene-editor-api'
import {definitionUuid} from './device-task-definition-port'
type DialogNode=SceneNode|AutomationNode
const props=defineProps<{value?:DialogNode;disabled?:boolean;mode?:'scene'|'automation'}>(),emit=defineEmits<{save:[node:DialogNode,deviceName:string,taskName:string];cancel:[];denied:[cause:ApiError]}>()
const automation=props.mode==='automation'
const presentation=automation?automationTaskPresentation:sceneTaskPresentation
const initial=props.value?(automation?automationTaskRun(props.value as AutomationNode):sceneTaskConfig(props.value as SceneNode)):undefined
const device=ref<Target>(),task=ref(''),options=ref<Schema<'DeviceTaskJobResponse'>[]>([]),original=ref<{id:string;name:string;status:string}>(),cursor=ref<string>(),hasMore=ref(false),loading=ref(false),targetBusy=ref(false),error=ref('')
const selectedName=computed(()=>options.value.find(row=>row.id===task.value)?.name||(original.value?.id===task.value?original.value.name:task.value))
const originalOutside=computed(()=>original.value&&!options.value.some(row=>row.id===original.value!.id)?original.value:undefined)
let usedCursors:(string|undefined)[]=[],alive=true,turn=0,request=0,initialApplied=false,controller:AbortController|undefined
function current(generation:number,project:string,id:string,epoch:number){return alive&&generation===turn&&project===projectId.value&&device.value?.id===id&&epoch===identityEpoch()}
async function page(append=false){
 const target=device.value;if(!target||props.disabled||loading.value||append&&!hasMore.value)return
 const generation=turn,project=projectId.value,epoch=identityEpoch(),next=append?cursor.value:undefined,sequence=++request
 controller?.abort();controller=new AbortController();loading.value=true;error.value=''
 try{
  const value=await readSceneDeviceTasks(project,target.id,next,controller.signal,[...(append?usedCursors:[]),next])
  if(sequence!==request||!current(generation,project,target.id,epoch))return
  const previous=new Map(options.value.map(row=>[row.id,row]))
  const merged=new Map((append?options.value:[]).map(row=>[row.id,row]));for(const row of value.items)merged.set(row.id,row)
  usedCursors=append?[...usedCursors,next]:[undefined];options.value=[...merged.values()];hasMore.value=value.hasMore;cursor.value=value.nextCursor??undefined
  // 分页/迟到回填只替换候选，不覆盖已选任务；已选任务暂时不在本页时保留原名称供回显。
  if(task.value&&!merged.has(task.value)&&original.value?.id!==task.value){const kept=previous.get(task.value);if(kept)original.value={id:kept.id,name:kept.name,status:kept.status??''}}
 }catch(cause){if(sequence===request&&current(generation,project,target.id,epoch)){error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status)){options.value=[];emit('denied',cause)}}}finally{if(sequence===request&&current(generation,project,target.id,epoch))loading.value=false}
}
async function selected(target:Target|undefined){
 // 同一设备在校验/重渲染时可能重复发出 selected；保留用户已选任务和候选页。
 if(target&&device.value?.id===target.id&&target.projectId===projectId.value){device.value={...target};return}
 turn++;usedCursors=[];controller?.abort();device.value=target;task.value='';options.value=[];original.value=undefined;cursor.value=undefined;hasMore.value=false;loading.value=false;error.value=''
 if(!target)return
 const generation=turn,project=projectId.value,epoch=identityEpoch(),restore=!initialApplied&&initial?.deviceId===target.id;initialApplied=true
 if(restore){
  task.value=initial!.taskId;original.value={id:initial!.taskId,name:initial!.taskId,status:''}
  try{const value=await readSceneTaskName(project,initial!.taskId);if(current(generation,project,target.id,epoch))original.value=value}
  catch(cause){if(current(generation,project,target.id,epoch)){if(cause instanceof ApiError&&[401,403].includes(cause.status))emit('denied',cause);error.value='原任务当前无法读取，已保留原标识。'}}
 }
 if(current(generation,project,target.id,epoch))await page()
}
function choose(id:string){if(props.disabled)return;if(!id){task.value='';return}if(loading.value){error.value='任务列表加载中，请稍候';return}const row=options.value.find(value=>value.id===id);if(!row&&original.value?.id!==id){error.value='请选择当前设备的任务';return}if(row)original.value={id:row.id,name:row.name,status:row.status??''};task.value=id;error.value=''}
function save(){if(props.disabled||targetBusy.value)return;if(loading.value){error.value='任务列表加载中，请稍候';return}if(!device.value||device.value.projectId!==projectId.value){error.value='请选择设备';return}if(!definitionUuid(task.value)){error.value='请选择任务';return}const node=automation?automationTaskRunAction({deviceId:device.value.id,taskId:task.value}):{nodeType:sceneTaskNode,config:{deviceId:device.value.id,taskId:task.value}};emit('save',node,device.value.name,selectedName.value)}
watch(projectId,()=>{turn++;usedCursors=[];controller?.abort();device.value=undefined;task.value='';options.value=[];original.value=undefined;loading.value=false})
onScopeDispose(()=>{alive=false;turn++;controller?.abort()})
</script>
<template><el-dialog :model-value="true" title="配置动作" width="800px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!disabled" :show-close="!disabled" append-to-body @update:model-value="!disabled&&emit('cancel')">
 <div class="scene-task-type"><span :style="{background:presentation.background,color:presentation.color}"><ReferenceIcon :glyph="presentation.glyph"/></span><div><strong>{{presentation.label}}</strong><p>{{presentation.description}}</p></div></div>
 <el-form label-position="top" :disabled="disabled"><el-form-item label="选择设备"><RuleActionDeviceTarget :initial-id="initial?.deviceId" :disabled="disabled" @selected="selected" @busy="targetBusy=$event"/></el-form-item>
 <el-form-item v-if="device" label="选择任务"><el-select :model-value="task" aria-label="选择任务" placeholder="请选择任务" filterable :loading="loading" :disabled="disabled||targetBusy" class="scene-task-select" @update:model-value="choose">
  <el-option v-if="originalOutside" :value="originalOutside.id" :label="originalOutside.name"><span class="task-option-name">{{originalOutside.name}}</span><span v-if="originalOutside.status" :class="['task-option-status',originalOutside.status==='ACTIVE'?'normal':'paused']">{{originalOutside.status==='ACTIVE'?'正常':'已停用'}}</span></el-option>
  <el-option v-for="row in options" :key="row.id" :value="row.id" :label="row.name"><span class="task-option-name">{{row.name}}</span><span :class="['task-option-status',row.status==='ACTIVE'?'normal':'paused']">{{row.status==='ACTIVE'?'正常':'已停用'}}</span></el-option>
  <template #footer><el-button v-if="hasMore" link :disabled="disabled||loading" @click="page(true)">加载更多</el-button></template>
 </el-select></el-form-item></el-form>
 <el-alert v-if="error" :title="error" type="warning" :closable="false"><el-button :disabled="disabled||loading" @click="page()">重新读取</el-button></el-alert>
 <template #footer><el-button :disabled="disabled" @click="emit('cancel')">取消</el-button><el-button type="primary" :disabled="disabled||loading||targetBusy" @click="save">确定</el-button></template>
</el-dialog></template>
<style scoped>.scene-task-type{display:flex;align-items:center;gap:14px;padding:14px 16px;background:#f8f9fa;border-radius:8px;margin-bottom:20px}.scene-task-type>span{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:10px;flex:none}.scene-task-type .reference-icon{font-size:22px}.scene-task-type strong{font-size:15px;font-weight:600;color:#333}.scene-task-type p{font-size:13px;color:#888;margin:4px 0 0}.scene-task-select{width:100%}.task-option-name{float:left;margin:0 80px 0 0}.task-option-status{float:right;font-size:13px}.task-option-status.normal{color:#67c23a}.task-option-status.paused{color:#999}</style>
