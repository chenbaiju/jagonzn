<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router'
import {Sort,Edit,Delete,ArrowRight} from '@element-plus/icons-vue'
import {can,currentProject,projectId} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {Schema} from '@/core/contracts'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import SceneDevicePropertyDialog from './SceneDevicePropertyDialog.vue'
import SceneTaskRunDialog from './SceneTaskRunDialog.vue'
import SceneDelayDialog from './SceneDelayDialog.vue'
import RuleTagsEditor from './RuleTagsEditor.vue'
import {readScene,readSceneLatest,readSceneVersion,createScene,reviseScene,activateScene,pauseScene,findSceneByName,readSceneTaskName} from './scene-editor-api'
import {newSceneDraft,loadedSceneDraft,sceneDraftBody,scenePropertyConfig,scenePropertyTransformConfig,sceneCloudTransformConfig,sceneCloudOperationText,cloneSceneValue,moveSceneAction,assertSceneContent,sceneSignature,scenePropertyPresentation,sceneTaskConfig,sceneTaskPresentation,sceneTagRows,sceneDelayConfig,sceneDelayPresentation,sceneExecutionPolicy,type ScenePropertyPurpose,type SceneNode,type SceneDraft,type SceneBody} from './scene-editor-draft'
import {cas} from './models'
import {ExactDecimal,writePreprocessJson} from './preprocess-exact-json'
import {selectedTaskChoices} from './task-choices'
const route=useRoute(),router=useRouter(),id=computed(()=>String(route.params.id||'')),editing=computed(()=>!!id.value)
const allowed=computed(()=>can('rule:manage')&&!!projectId.value),writable=computed(()=>allowed.value&&currentProject.value?.status==='ACTIVE')
const draft=ref<SceneDraft>(newSceneDraft()),step=ref(1),loading=ref(false),busy=ref(false),pending=ref(false),conflict=ref(false),error=ref('')
const base=ref<Schema<'RuleSceneView'>>(),baseVersion=ref<Schema<'RuleSceneVersionView'>>(),picker=ref(false),actionEditor=ref<{index?:number;node?:SceneNode;purpose:ScenePropertyPurpose|'task-run'|'delay'}>(),names=ref(new Map<string,string>()),taskNames=ref(new Map<string,string>())
type Intent={mode:'create'|'atomic-edit';expectedFinalCAS:number;expectedStatus:'DRAFT'|'ACTIVE'|'PAUSED';previousVersionId?:string;previousActiveVersionId?:string|null;selectedVersionId?:string;project:string;body:SceneBody;enabled:boolean;sceneId?:string;before:number;stage:'definition'|'activation'|'pause';definition?:Schema<'RuleSceneView'>;version?:Schema<'RuleSceneVersionView'>;expected?:number;stateSent?:boolean}
const intent=ref<Intent>(),blocked=computed(()=>busy.value||pending.value||!!intent.value),formBlocked=computed(()=>!writable.value||loading.value||blocked.value||conflict.value)
const pickerActions=computed(()=>[{purpose:'downlink',...scenePropertyPresentation.downlink},{purpose:'cloud-update',...scenePropertyPresentation['cloud-update']},{purpose:'task-run',...sceneTaskPresentation},...(draft.value.executionPolicy?[{purpose:'delay' as const,...sceneDelayPresentation}]:[])] as const)
let generation=0,alive=true,dragged=''
function current(turn:number,project:string,epoch:number){return alive&&turn===generation&&project===projectId.value&&epoch===identityEpoch()&&allowed.value}
function reset(){generation++;draft.value=newSceneDraft();step.value=1;base.value=undefined;baseVersion.value=undefined;intent.value=undefined;picker.value=false;actionEditor.value=undefined;pending.value=false;busy.value=false;loading.value=false;error.value='';conflict.value=false;names.value=new Map();taskNames.value=new Map();dragged=''}
async function load(){
 reset();if(!allowed.value||!editing.value)return
 const turn=generation,project=projectId.value,epoch=identityEpoch(),scene=id.value;loading.value=true
 try{
  const first=await readScene(project,scene)
  if(first.status!=='DRAFT'&&!first.activeVersionId)throw new Error('场景当前发布版本无法读取，不能自动改用未发布候选。')
  const version=first.status!=='DRAFT'?await readSceneVersion(project,scene,first.activeVersionId!):await readSceneLatest(project,scene),last=await readScene(project,scene)
  if(!current(turn,project,epoch)||scene!==id.value)return
  if(first.version!==last.version||first.activeVersionId!==last.activeVersionId)throw new Error('场景正在变化，请重新读取。')
  draft.value=loadedSceneDraft(last,version);base.value=last;baseVersion.value=version
  const devices=[...new Set(draft.value.actions.flatMap(row=>{const transform=sceneTransform(row.node),device=(scenePropertyConfig(row.node)||transform||sceneTaskConfig(row.node))?.deviceId;return [...(device?[device]:[]),...(transform?.operations.flatMap(op=>op.op==='set_ref'?[op.refDeviceId]:[])??[])]}))]
  if(devices.length){try{const choices=await selectedTaskChoices(project,'devices',devices);if(current(turn,project,epoch))names.value=new Map(choices.map(row=>[row.id,row.label]))}catch{/* 设备不可读取时保原动作，不伪造名称。 */}}
  const tasks=[...new Set(draft.value.actions.map(row=>sceneTaskConfig(row.node)?.taskId).filter((value):value is string=>!!value))].slice(0,20),resolved=new Map<string,string>()
  for(let offset=0;offset<tasks.length;offset+=4){await Promise.all(tasks.slice(offset,offset+4).map(async task=>{try{const value=await readSceneTaskName(project,task);resolved.set(value.id,value.name)}catch{/* 原任务失效时保原UUID。 */}}));if(!current(turn,project,epoch))return}
  if(current(turn,project,epoch))taskNames.value=resolved
 }catch(cause){if(current(turn,project,epoch))error.value=errorMessage(cause)}finally{if(current(turn,project,epoch))loading.value=false}
}
watch([projectId,id],()=>{void load()},{immediate:true})
/** 同范围失权只清可见资料，未决原意图留在内部；恢复后只能核对，不重发任何写。 */
watch(allowed,value=>{
 if(!value){
  generation++;draft.value=newSceneDraft();base.value=undefined;baseVersion.value=undefined;picker.value=false;actionEditor.value=undefined;names.value=new Map();taskNames.value=new Map();loading.value=false;busy.value=false;error.value='';dragged=''
  if(intent.value)pending.value=true
 }else if(intent.value){
  const held=intent.value,body=held.body
  draft.value={name:body.name,description:body.description??'',enabled:held.enabled,tags:sceneTagRows(body.tags),conditions:cloneSceneValue(body.conditions),actions:cloneSceneValue(body.actions).map(node=>({key:crypto.randomUUID(),node})),deviceScope:cloneSceneValue(body.deviceScope),executionPolicy:sceneExecutionPolicy(body.executionPolicy)}
  busy.value=false;pending.value=true;error.value='原场景保存结果仍待核对，请重新读取；未重复提交。'
 }else void load()
})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;dispose()})
watch(writable,value=>{if(!value){picker.value=false;actionEditor.value=undefined}})
onBeforeRouteLeave(()=>!allowed.value||!blocked.value);onBeforeRouteUpdate(to=>String(to.params.id||'')===id.value||!allowed.value||!blocked.value)
function beforeUnload(event:BeforeUnloadEvent){if(allowed.value&&blocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
function back(){if(!allowed.value||!blocked.value)void router.push(editing.value?`/rules/scenes/${id.value}`:'/rules/scenes')}
function sceneTransform(node:SceneNode){return sceneCloudTransformConfig(node)||scenePropertyTransformConfig(node)}
function chooseAction(purpose:ScenePropertyPurpose|'task-run'|'delay'){if(formBlocked.value)return;picker.value=false;actionEditor.value={purpose}}
function editAction(index:number){if(formBlocked.value)return;const node=draft.value.actions[index]?.node;const config=node&&(scenePropertyConfig(node)||sceneTransform(node)),task=node&&sceneTaskConfig(node),delay=node&&sceneDelayConfig(node);if(node&&(config||task||delay))actionEditor.value={index,node:cloneSceneValue(node),purpose:config?.purpose??(task?'task-run':'delay')}}
function saveAction(node:SceneNode,deviceName?:string){
 const editor=actionEditor.value;if(!editor||formBlocked.value)return
 const transform=sceneTransform(node),config=scenePropertyConfig(node)||transform;if(!config||config.purpose!==editor.purpose){error.value='属性动作用途或配置不完整';return}
 if(transform&&!draft.value.executionPolicy){error.value='属性操作需要完整执行策略，请重新读取场景。';return}
 if(deviceName)names.value=new Map(names.value).set(config.deviceId,deviceName)
 const next={key:editor.index===undefined?crypto.randomUUID():draft.value.actions[editor.index]!.key,node:cloneSceneValue(node)}
 if(editor.index===undefined)draft.value.actions.push(next);else draft.value.actions.splice(editor.index,1,next)
 actionEditor.value=undefined;error.value=''
 const references=[...new Set(transform?.operations.flatMap(row=>row.op==='set_ref'&&!names.value.has(row.refDeviceId)?[row.refDeviceId]:[])??[])]
 if(references.length){
  const turn=generation,project=projectId.value,epoch=identityEpoch()
  void selectedTaskChoices(project,'devices',references).then(found=>{
   if(!current(turn,project,epoch))return
   const resolved=new Map(names.value)
   for(const row of found)if(references.includes(row.id)&&!resolved.has(row.id))resolved.set(row.id,row.label)
   names.value=resolved
  }).catch(()=>{/* 名称读取失败保留原UUID，不阻塞保存或改变引用配置。 */})
 }
}
function saveTaskAction(node:SceneNode,deviceName:string,taskName:string){
 const editor=actionEditor.value,config=sceneTaskConfig(node);if(!editor||editor.purpose!=='task-run'||formBlocked.value||!config)return
 names.value=new Map(names.value).set(config.deviceId,deviceName);taskNames.value=new Map(taskNames.value).set(config.taskId,taskName)
 const next={key:editor.index===undefined?crypto.randomUUID():draft.value.actions[editor.index]!.key,node:cloneSceneValue(node)}
 if(editor.index===undefined)draft.value.actions.push(next);else draft.value.actions.splice(editor.index,1,next)
 actionEditor.value=undefined;error.value=''
}
function saveDelayAction(node:SceneNode){
 const editor=actionEditor.value;if(!editor||editor.purpose!=='delay'||formBlocked.value||!draft.value.executionPolicy||!sceneDelayConfig(node))return
 const next={key:editor.index===undefined?crypto.randomUUID():draft.value.actions[editor.index]!.key,node:cloneSceneValue(node)}
 if(editor.index===undefined)draft.value.actions.push(next);else draft.value.actions.splice(editor.index,1,next)
 actionEditor.value=undefined;error.value=''
}
function actionAppearance(node:SceneNode){const property=scenePropertyConfig(node)||sceneTransform(node);return property?scenePropertyPresentation[property.purpose]:sceneTaskConfig(node)?sceneTaskPresentation:sceneDelayConfig(node)?sceneDelayPresentation:undefined}
function removeAction(index:number){if(!formBlocked.value)draft.value.actions.splice(index,1)}
function move(index:number,offset:number){if(!formBlocked.value)draft.value.actions=moveSceneAction(draft.value.actions,index,index+offset)}
function startDrag(index:number,event:DragEvent){if(formBlocked.value){event.preventDefault();return}dragged=draft.value.actions[index]!.key;event.dataTransfer?.setData('text/plain',dragged)}
function drop(index:number,event:DragEvent){event.preventDefault();if(!formBlocked.value&&dragged)draft.value.actions=moveSceneAction(draft.value.actions,draft.value.actions.findIndex(row=>row.key===dragged),index);dragged=''}
/** 普通摘要展开自然数值；核同签名和运输仍沿原精确规范形式。 */
function summaryValue(value:unknown){if(value instanceof ExactDecimal){try{return writePreprocessJson(value,true)}catch{return value.canonical()}}return sceneSignature(value)}
function summary(node:SceneNode){const transform=sceneTransform(node);if(transform)return `${names.value.get(transform.deviceId)||transform.deviceId} · ${transform.operations.map(row=>sceneCloudOperationText(row,summaryValue,id=>names.value.get(id)||id)).join('，')}`;const delay=sceneDelayConfig(node);if(delay)return `延迟 ${delay.durationSeconds%60===0?delay.durationSeconds/60+' 分钟':delay.durationSeconds+' 秒'}`;const task=sceneTaskConfig(node);if(task)return `${names.value.get(task.deviceId)||task.deviceId} · ${taskNames.value.get(task.taskId)||task.taskId}`;const config=scenePropertyConfig(node);if(!config)return '原有操作配置保持不变';return `${names.value.get(config.deviceId)||config.deviceId} · ${Object.entries(config.properties).map(([key,value])=>`${key} = ${summaryValue(value)}`).join('，')}`}
function next(){if(formBlocked.value)return;if(!draft.value.actions.length){error.value='请至少添加 1 个动作';return}error.value='';step.value=2}
async function finish(value:Intent){intent.value=undefined;pending.value=false;busy.value=false;error.value='';await router.push(`/rules/scenes/${value.sceneId}`)}
/** 原子编辑只认原CAS、最终状态和新选中版本；不以latest替代已发布指针。 */
function assertAtomicDefinition(value:Intent,definition:Schema<'RuleSceneView'>){
 if(definition.id!==value.sceneId||cas(definition.version)!==value.expectedFinalCAS||definition.status!==value.expectedStatus||value.expectedStatus==='DRAFT'&&definition.activeVersionId!=null||value.expectedStatus!=='DRAFT'&&(!definition.activeVersionId||definition.activeVersionId===value.previousActiveVersionId||value.selectedVersionId&&definition.activeVersionId!==value.selectedVersionId))throw new Error('场景当前状态尚未与原保存意图一致；未重复提交。')
}
async function verifyAtomicEdit(value:Intent){
 if(value.mode!=='atomic-edit'||!value.sceneId)throw new Error('场景内容修订上下文不完整，请重新读取核对。')
 const first=await readScene(value.project,value.sceneId);assertAtomicDefinition(value,first)
 const version=first.status==='DRAFT'?await readSceneLatest(value.project,value.sceneId):await readSceneVersion(value.project,value.sceneId,first.activeVersionId!)
 const last=await readScene(value.project,value.sceneId);assertAtomicDefinition(value,last)
 if(first.activeVersionId!==last.activeVersionId||!version.id||version.id===value.previousVersionId||value.selectedVersionId&&version.id!==value.selectedVersionId||last.status!=='DRAFT'&&last.activeVersionId!==version.id)throw new Error('场景新版本尚未与原保存意图一致；未重复提交。')
 assertSceneContent(value.body,last,version);value.definition=last;value.version=version;value.selectedVersionId=version.id
}
async function prepareState(value:Intent){
 if(value.mode!=='create')throw new Error('内容修订不追加独立状态操作。')
 const definition=await readScene(value.project,value.sceneId!),version=await readSceneLatest(value.project,value.sceneId!)
 assertSceneContent(value.body,definition,version)
 if(cas(definition.version)!==value.before+1)throw new Error('场景定义版本与本次保存期望不一致；未重复提交。')
 value.definition=definition;value.version=version
 if(value.enabled){if(definition.status==='ACTIVE'&&definition.activeVersionId===version.id)return false;value.stage='activation'}
 else{if(definition.status!=='ACTIVE')return false;value.stage='pause'}
 value.expected=cas(definition.version);return true
}
async function changeState(value:Intent){
 if(value.mode!=='create'||!value.sceneId||!value.version?.id||!value.expected)throw new Error('场景状态操作缺少原版本，请只读核对。')
 value.stateSent=true
 const response=value.stage==='activation'?await activateScene(value.project,value.sceneId,value.version.id,value.expected):await pauseScene(value.project,value.sceneId,value.expected)
 if(response.id!==value.sceneId||cas(response.version)!==value.expected+1||response.status!==(value.enabled?'ACTIVE':'PAUSED')||value.enabled&&response.activeVersionId!==value.version.id)throw new Error('场景状态回执与原意图不一致，请只读核对。')
 const observed=await readScene(value.project,value.sceneId)
 if(observed.id!==response.id||observed.version!==response.version||observed.status!==response.status||observed.activeVersionId!==response.activeVersionId)throw new Error('场景状态回读尚未一致，请只读核对。')
}
async function save(){
 if(formBlocked.value||actionEditor.value||picker.value)return
 let body:SceneBody
 try{body=sceneDraftBody(draft.value)}catch(cause){error.value=errorMessage(cause);return}
 let value:Intent
 try{
  const mode=editing.value?'atomic-edit':'create',before=mode==='atomic-edit'?cas(base.value?.version):0,enabled=draft.value.enabled,previousActiveVersionId=base.value?.activeVersionId??null
  if(mode==='atomic-edit'&&!baseVersion.value?.id)throw new Error('场景原版本尚未完整读取。')
  value={mode,expectedFinalCAS:cas(before+(mode==='create'?(enabled?2:1):enabled?2:previousActiveVersionId?3:1)),expectedStatus:enabled?'ACTIVE':previousActiveVersionId?'PAUSED':'DRAFT',previousVersionId:baseVersion.value?.id,previousActiveVersionId,project:projectId.value,body,enabled,sceneId:mode==='atomic-edit'?id.value:undefined,before,stage:'definition'}
 }catch(cause){error.value=errorMessage(cause);return}
 intent.value=value;busy.value=true;error.value='';const turn=generation,epoch=identityEpoch();let accepted=false
 try{
  const response=value.mode==='atomic-edit'?await reviseScene(value.project,value.sceneId!,body,value.before,value.enabled):await createScene(value.project,body);accepted=true
  if(!current(turn,value.project,epoch))return
  if(value.mode==='atomic-edit'){
   assertAtomicDefinition(value,response);if(response.activeVersionId)value.selectedVersionId=response.activeVersionId
   await verifyAtomicEdit(value)
  }else{
   if(!response.id||cas(response.version)!==value.before+1)throw new Error('场景保存回执不完整，请只读核对。')
   value.sceneId=response.id
   if(await prepareState(value)){if(!current(turn,value.project,epoch))return;if(!writable.value)throw new Error('项目当前不可修改，状态操作尚未提交。');await changeState(value)}
  }
  if(current(turn,value.project,epoch))await finish(value)
 }catch(cause){if(current(turn,value.project,epoch)&&!(cause instanceof IdentityChanged)){
  const known=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409].includes(cause.status)
  pending.value=!known;error.value=errorMessage(cause)
  if(known){intent.value=undefined;conflict.value=cause instanceof ApiError&&cause.status===409}
 }}finally{if(current(turn,value.project,epoch))busy.value=false}
}
/** 未知只核原意图，绝不自动重复任何写步骤。尚未发送的启用可在核对后明确继续。 */
async function verify(){
 const value=intent.value;if(!value||busy.value||!allowed.value)return
 const turn=generation,epoch=identityEpoch();busy.value=true
 try{
  if(value.mode==='atomic-edit'){await verifyAtomicEdit(value);if(current(turn,value.project,epoch))await finish(value);return}
  if(!value.sceneId)value.sceneId=(await findSceneByName(value.project,value.body.name)).id
  if(!value.sceneId)throw new Error('原场景仍待核对；未再次创建。')
  if(value.stage==='definition'){
   if(await prepareState(value)){if(!current(turn,value.project,epoch))return;pending.value=false;error.value='已核对当前场景内容；状态操作尚未提交，请继续完成。';return}
  }else{
   const definition=await readScene(value.project,value.sceneId),version=await readSceneLatest(value.project,value.sceneId)
   assertSceneContent(value.body,definition,version)
   if(!value.stateSent){if(cas(definition.version)!==value.expected)throw new Error('场景版本已经变化，请继续核对。');if(current(turn,value.project,epoch)){pending.value=false;error.value='当前内容已核对，状态操作尚未提交，请继续完成。'}return}
   if(!value.expected||cas(definition.version)!==value.expected+1||definition.status!==(value.enabled?'ACTIVE':'PAUSED')||value.enabled&&definition.activeVersionId!==value.version?.id)throw new Error('当前场景状态尚未与原意图一致；未重复提交。')
  }
  if(current(turn,value.project,epoch))await finish(value)
 }catch(cause){if(current(turn,value.project,epoch)){pending.value=true;error.value=errorMessage(cause)}}finally{if(current(turn,value.project,epoch))busy.value=false}
}
async function continueState(){const value=intent.value;if(!value||value.mode!=='create'||pending.value||busy.value||!writable.value)return;const turn=generation,epoch=identityEpoch();busy.value=true;try{await changeState(value);if(current(turn,value.project,epoch))await finish(value)}catch(cause){if(current(turn,value.project,epoch)){pending.value=true;error.value=errorMessage(cause)}}finally{if(current(turn,value.project,epoch))busy.value=false}}
</script>
<template><main class="tl-page scene-editor-page"><PageHeader :title="editing?'编辑场景':'创建场景'" back @back="back"/>
 <AsyncState :forbidden="!allowed" :loading="loading"><el-alert v-if="error" :title="error" type="warning" :closable="false"><el-button v-if="pending" :disabled="busy" @click="verify">重新读取核对</el-button><el-button v-else-if="intent" :disabled="busy||!writable" @click="continueState">继续完成</el-button><el-button v-else-if="conflict||editing&&!base" :disabled="busy" @click="load">重新读取场景</el-button></el-alert>
 <template v-if="!editing||base||intent"><el-form label-position="top" :disabled="formBlocked" @submit.prevent>
  <section v-if="editing||step===1"><h2>设置动作</h2><p class="scene-action-tips">场景被执行后，将按顺序执行这些动作。</p>
   <div v-if="draft.actions.length" class="scene-action-list"><div v-for="(row,index) in draft.actions" :key="row.key" class="scene-action-item" @dragover.prevent @drop="drop(index,$event)">
    <span class="scene-action-icon" :style="actionAppearance(row.node)?{background:actionAppearance(row.node)!.background,color:actionAppearance(row.node)!.color}:undefined"><ReferenceIcon :glyph="actionAppearance(row.node)?.glyph||'󰐊'"/></span><div class="scene-action-content"><div class="scene-action-name">{{actionAppearance(row.node)?.label||'已有操作'}}</div><div class="scene-action-summary">{{summary(row.node)}}</div></div>
    <div class="scene-action-ops"><el-button :icon="Sort" size="small" :disabled="formBlocked" :aria-label="`调整动作顺序 ${index+1}`" :draggable="!formBlocked" title="拖动排序，或使用上下方向键" @dragstart="startDrag(index,$event)" @dragend="dragged=''" @keydown.up.prevent="move(index,-1)" @keydown.down.prevent="move(index,1)"/><el-button v-if="scenePropertyConfig(row.node)||sceneTransform(row.node)||sceneTaskConfig(row.node)||sceneDelayConfig(row.node)" :icon="Edit" size="small" :disabled="formBlocked" :aria-label="`编辑动作 ${index+1}`" @click="editAction(index)"/><el-button :icon="Delete" size="small" type="danger" :disabled="formBlocked" :aria-label="`移除动作 ${index+1}`" @click="removeAction(index)"/></div>
   </div></div><div v-else class="scene-action-empty"><ReferenceIcon glyph="󰐊"/>暂无动作</div>
   <el-button class="scene-add-action" plain type="primary" :disabled="formBlocked" @click="picker=true">添加动作</el-button>
   <section v-if="draft.executionPolicy" class="scene-other-settings"><h2>其他设置</h2><el-form-item label="并发优先级"><el-radio-group v-model="draft.executionPolicy.concurrencyPolicy" aria-label="并发优先级" :disabled="formBlocked"><el-radio value="skip_current">放弃本次</el-radio><el-radio value="terminate_prev">终止前次</el-radio></el-radio-group><div class="form-item-tip">当自动化触发时，若前次的动作执行未结束，选择处理策略。</div></el-form-item><el-form-item label="动作失败策略"><el-radio-group v-model="draft.executionPolicy.actionFailPolicy" aria-label="动作失败策略" :disabled="formBlocked"><el-radio value="continue">继续执行</el-radio><el-radio value="stop">立即终止</el-radio></el-radio-group><div class="form-item-tip">当某个动作执行失败时，是否继续执行后续动作</div></el-form-item></section>
   <div class="scene-editor-footer" :class="{'is-editing':editing}"><template v-if="editing"><el-button type="primary" :disabled="formBlocked" :loading="busy" @click="save">保存</el-button><el-button :disabled="blocked" @click="back">取消</el-button></template><el-button v-else type="primary" :disabled="formBlocked" @click="next">下一步</el-button></div>
  </section>
  <section v-else><el-form-item label="名称"><el-input v-model="draft.name" class="scene-metadata-input" aria-label="场景名称" maxlength="40" show-word-limit :disabled="formBlocked"/></el-form-item><el-form-item label="描述"><el-input v-model="draft.description" class="scene-metadata-input" aria-label="场景描述" type="textarea" :rows="4" maxlength="200" show-word-limit :disabled="formBlocked"/></el-form-item><RuleTagsEditor v-model="draft.tags" class="scene-tags" aria-label="场景标签" :disabled="formBlocked" :maximum-rows="null"/><el-form-item label="启用场景"><el-switch v-model="draft.enabled" aria-label="启用场景" :disabled="formBlocked"/></el-form-item><div class="scene-create-footer"><el-button :disabled="formBlocked" @click="step=1">上一步</el-button><el-button type="primary" :disabled="formBlocked" :loading="busy" @click="save">创建</el-button></div></section>
 </el-form></template></AsyncState>
 <el-dialog v-model="picker" title="添加动作" width="550px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!blocked" :show-close="!blocked" append-to-body><button v-for="action in pickerActions" :key="action.purpose" class="scene-action-picker" :data-purpose="action.purpose" type="button" :disabled="formBlocked" @click="chooseAction(action.purpose)"><span class="scene-picker-icon" :style="{background:action.background,color:action.color}"><ReferenceIcon :glyph="action.glyph"/></span><span class="scene-picker-info"><strong>{{action.label}}</strong><small>{{action.description}}</small></span><el-icon><ArrowRight/></el-icon></button></el-dialog>
 <SceneDelayDialog v-if="actionEditor?.purpose==='delay'" :value="actionEditor.node" :disabled="formBlocked" @save="saveDelayAction" @cancel="actionEditor=undefined"/>
 <SceneTaskRunDialog v-else-if="actionEditor?.purpose==='task-run'" :value="actionEditor.node" :disabled="formBlocked" @save="saveTaskAction" @cancel="actionEditor=undefined" @denied="error=errorMessage($event)"/>
 <SceneDevicePropertyDialog v-else-if="actionEditor" :key="actionEditor.purpose+String(actionEditor.index)" :purpose="actionEditor.purpose as ScenePropertyPurpose" :allow-transforms="!!draft.executionPolicy" :value="actionEditor.node" :disabled="formBlocked" @save="saveAction" @cancel="actionEditor=undefined" @denied="error=errorMessage($event)"/>
</main></template>
<style scoped>
.scene-editor-page h2{font-size:20px;font-weight:400;color:#002822;line-height:22px;padding:10px 0 0;margin:0 0 10px}.scene-action-tips{color:#666;font-size:14px;line-height:20px;margin:0 0 22px}.scene-action-list{border:1px solid #f0f0f0;border-radius:4px;overflow:hidden}.scene-action-item{display:flex;align-items:center;gap:16px;min-height:60px;padding:10px 16px;border-bottom:1px solid #f0f0f0;background:#fff}.scene-action-item:last-child{border-bottom:0}.scene-action-item:hover{background:#fafafa}.scene-action-icon{flex:none;width:30px;height:30px;border-radius:5px;color:#1e88e5;background:#e3f2fd;text-align:center;font-size:18px;line-height:30px}.scene-action-content{flex:1;min-width:0;min-height:40px;display:flex;flex-direction:column;justify-content:center}.scene-action-name{font-size:14px;font-weight:500;color:#333;line-height:1.4}.scene-action-summary{font-size:12px;line-height:1.4;color:#888;margin-top:4px;overflow-wrap:anywhere}.scene-action-ops{display:flex;gap:6px}.scene-action-ops .el-button{margin:0;height:28px;padding:7px 10px}.scene-action-empty{padding:20px;text-align:center;color:#999;font-size:14px;border:1px dashed #e0e0e0;border-radius:8px;background:#fafafa}.scene-action-empty .reference-icon{display:block;font-size:20px;color:#ccc;margin-bottom:6px}.scene-add-action{margin-top:16px}.scene-editor-footer{margin-top:50px}.scene-editor-footer.is-editing{margin-top:30px}.scene-other-settings{margin-top:20px}.form-item-tip{flex-basis:100%;font-size:13px;color:#909399;margin-top:8px;line-height:1.4}.scene-create-footer{margin-top:30px}.scene-tags{margin-bottom:22px}.scene-tags :deep(.tag-label){font-weight:700}.scene-metadata-input{width:420px;max-width:100%}.scene-action-picker{display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid #e8e8e8;border-radius:8px;cursor:pointer;background:#fff;width:100%;text-align:left}.scene-action-picker+.scene-action-picker{margin-top:8px}.scene-action-picker:hover{border-color:#409eff;background:#f5f9ff}.scene-picker-icon{width:42px;height:42px;border-radius:10px;background:#e3f2fd;color:#1e88e5;display:flex;align-items:center;justify-content:center;font-size:22px;flex:none}.scene-picker-info{flex:1;min-width:0}.scene-picker-info strong{display:block;font-size:15px;font-weight:600;color:#333}.scene-picker-info small{display:block;font-size:13px;color:#888;margin-top:4px}
</style>
