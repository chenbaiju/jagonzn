<script setup lang="ts">
import {onScopeDispose,ref,watch} from 'vue'
import {projectId} from '@/core/session'
import {ApiError,errorMessage,identityEpoch} from '@/core/http'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {automationScenePresentation,automationSceneRun,automationSceneRunAction,type AutomationNode} from './automation-editor-draft'
import {definitionUuid} from './device-task-definition-port'
import {listScenes} from './api'
const props=defineProps<{value?:AutomationNode;disabled?:boolean}>(),emit=defineEmits<{save:[node:AutomationNode,sceneName:string];cancel:[];denied:[cause:ApiError]}>()
const initial=props.value?automationSceneRun(props.value):undefined
const scenes=ref<{id:string;name:string;status:string}[]>([]),sceneId=ref(initial?.sceneId??''),wait=ref(initial?.waitForCompletion??true),loading=ref(false),error=ref('')
let alive=true,turn=0,controller:AbortController|undefined
function current(generation:number,project:string,epoch:number){return alive&&generation===turn&&project===projectId.value&&epoch===identityEpoch()}
async function load(){
 if(props.disabled)return
 const generation=turn,project=projectId.value,epoch=identityEpoch();controller?.abort();controller=new AbortController();loading.value=true;error.value=''
 try{
  const page=await listScenes(project,{status:'ACTIVE',limit:100},controller.signal)
  if(!current(generation,project,epoch))return
  scenes.value=(page.items??[]).filter(row=>definitionUuid(row.id)).map(row=>({id:row.id!,name:row.name??row.id!,status:row.status??''}))
 }catch(cause){if(current(generation,project,epoch)){error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))emit('denied',cause)}}finally{if(current(generation,project,epoch))loading.value=false}
}
function save(){
 if(props.disabled||loading.value)return
 if(!definitionUuid(sceneId.value)){error.value='请选择场景';return}
 const selected=scenes.value.find(row=>row.id===sceneId.value)
 emit('save',automationSceneRunAction({sceneId:sceneId.value,waitForCompletion:wait.value}),selected?.name??sceneId.value)
}
watch(projectId,()=>{turn++;controller?.abort();scenes.value=[];sceneId.value='';wait.value=true;loading.value=false;error.value='';void load()},{immediate:true})
onScopeDispose(()=>{alive=false;turn++;controller?.abort()})
</script>
<template><el-dialog :model-value="true" title="配置动作" width="650px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!disabled" :show-close="!disabled" append-to-body @update:model-value="!disabled&&emit('cancel')">
 <div class="automation-scene-type"><span :style="{background:automationScenePresentation.background,color:automationScenePresentation.color}"><ReferenceIcon :glyph="automationScenePresentation.glyph"/></span><div><strong>{{automationScenePresentation.label}}</strong><p>{{automationScenePresentation.description}}</p></div></div>
 <el-form label-position="top" :disabled="disabled"><el-form-item label="选择场景" required><el-select v-model="sceneId" aria-label="选择场景" placeholder="请选择场景" filterable :loading="loading" :disabled="disabled" class="automation-scene-select">
  <el-option v-if="initial?.sceneId&&!scenes.some(row=>row.id===initial!.sceneId)" :value="initial.sceneId" :label="initial.sceneId"/>
  <el-option v-for="row in scenes" :key="row.id" :value="row.id" :label="row.name"/>
 </el-select></el-form-item>
 <el-form-item label="等待场景执行完成"><el-switch v-model="wait" :disabled="disabled"/><div class="form-item-tip">开启后，自动化将等待场景完全执行完成后再继续后续动作；关闭后，场景启动1秒后自动化即继续执行，场景在后台独立运行。</div></el-form-item></el-form>
 <el-alert v-if="error" :title="error" type="warning" :closable="false"><el-button :disabled="disabled||loading" @click="load">重新读取</el-button></el-alert>
 <template #footer><el-button :disabled="disabled" @click="emit('cancel')">取消</el-button><el-button type="primary" :disabled="disabled||loading" @click="save">确定</el-button></template>
</el-dialog></template>
<style scoped>.automation-scene-type{display:flex;align-items:center;gap:14px;padding:14px 16px;background:#f8f9fa;border-radius:8px;margin-bottom:20px}.automation-scene-type>span{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:10px;flex:none}.automation-scene-type .reference-icon{font-size:22px}.automation-scene-type strong{font-size:15px;font-weight:600;color:#333}.automation-scene-type p{font-size:13px;color:#888;margin:4px 0 0}.automation-scene-select{width:100%}.form-item-tip{font-size:12px;color:#999;line-height:1.6;margin-top:4px}</style>
