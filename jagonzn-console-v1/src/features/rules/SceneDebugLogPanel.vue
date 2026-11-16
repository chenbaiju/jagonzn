<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {Delete,Refresh} from '@element-plus/icons-vue'
import {ElMessageBox} from 'element-plus'
import {can,currentProject,projectId} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import {definitionUuid} from './device-task-definition-port'
import {sceneDebugLogApi,sceneLogElapsed,type SceneLogControl} from './scene-debug-log-api'
import SceneDebugLogTimeline from './SceneDebugLogTimeline.vue'
import AsyncState from '@/ui/AsyncState.vue'
const props=defineProps<{id:string;inactive?:boolean;disabled?:boolean}>()
const emit=defineEmits<{busy:[value:boolean];locked:[value:boolean];confirming:[value:boolean];denied:[cause:ApiError]}>()
const allowed=computed(()=>can('rule:manage')&&!!projectId.value&&definitionUuid(props.id)),visible=computed(()=>allowed.value&&!props.inactive),writable=computed(()=>visible.value&&currentProject.value?.status==='ACTIVE'&&!props.disabled)
const page=ref(1),control=ref<SceneLogControl>(),busy=ref(false),pending=ref(false),confirming=ref(false),writeError=ref(''),opened=ref('')
type Intent={project:string;id:string;epoch:number;kind:'enabled'|'clear';before:SceneLogControl;expectedVersion:string;expectedGeneration:string;enabled:boolean}
const intent=ref<Intent>(),locked=computed(()=>busy.value||pending.value||confirming.value||!!intent.value)
const resource=useResource(signal=>sceneDebugLogApi.page(projectId.value,props.id,page.value,signal))
const ready=computed(()=>writable.value&&!!control.value&&!resource.loading.value&&!resource.error.value&&!locked.value)
const numberTotal=computed(()=>resource.data.value&&BigInt(resource.data.value.total)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(resource.data.value.total):undefined)
const hasNext=computed(()=>!!resource.data.value&&BigInt(page.value)*20n<BigInt(resource.data.value.total))
let alive=true,viewGeneration=0,verifyController:AbortController|undefined
function scope(value:Intent){return alive&&value.epoch===identityEpoch()&&value.project===projectId.value&&value.id===props.id}
function hide(){viewGeneration++;resource.clear();control.value=undefined;opened.value='';verifyController?.abort();if(confirming.value)ElMessageBox.close();confirming.value=false;writeError.value='';if(intent.value)pending.value=true}
function reset(){hide();intent.value=undefined;pending.value=false;busy.value=false;page.value=1}
async function load(){if(!visible.value||busy.value||intent.value)return;const project=projectId.value,id=props.id,epoch=identityEpoch(),generation=viewGeneration;await resource.reload();if(!alive||project!==projectId.value||id!==props.id||epoch!==identityEpoch()||generation!==viewGeneration||!visible.value)return;if(resource.data.value)control.value=resource.data.value.control;const cause=resource.error.value;if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){control.value=undefined;emit('denied',cause)}}
watch([projectId,()=>props.id],()=>{reset();if(visible.value)void load()},{immediate:true})
watch(visible,value=>{if(!value)hide();else if(!intent.value)void load()})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;hide();dispose()})
watch(busy,value=>emit('busy',value),{immediate:true});watch(locked,value=>emit('locked',value),{immediate:true});watch(confirming,value=>emit('confirming',value),{immediate:true})
function matches(value:SceneLogControl,wanted:Intent){return value.sceneId===wanted.id&&value.version===wanted.expectedVersion&&value.generation===wanted.expectedGeneration&&value.enabled===wanted.enabled}
function makeIntent(kind:'enabled'|'clear',enabled:boolean):Intent{const before=control.value!;return {project:projectId.value,id:props.id,epoch:identityEpoch(),kind,before:{...before},expectedVersion:(BigInt(before.version)+1n).toString(),expectedGeneration:(BigInt(before.generation)+(kind==='clear'?1n:0n)).toString(),enabled}}
async function perform(value:Intent){
 if(!ready.value)return
 resource.clear();intent.value=value;busy.value=true;pending.value=false;confirming.value=false;writeError.value='';const generation=viewGeneration
 try{
  const result=value.kind==='clear'?await sceneDebugLogApi.clear(value.project,value.id,value.before.version):await sceneDebugLogApi.enabled(value.project,value.id,value.before.version,value.enabled)
  if(!scope(value))return
  if(generation!==viewGeneration||!visible.value){pending.value=true;return}
  if(!matches(result,value))throw new Error('场景日志状态与原操作尚未一致，请重新读取核对')
  control.value=result;intent.value=undefined;pending.value=false;if(value.kind==='clear')page.value=1;busy.value=false;await load()
 }catch(cause){if(scope(value)){
  const rejected=cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,422,429].includes(cause.status)
  if(rejected){intent.value=undefined;pending.value=false;control.value=undefined}else pending.value=true
  if(visible.value){writeError.value=errorMessage(cause);if(rejected&&cause instanceof ApiError&&[401,403,404].includes(cause.status))emit('denied',cause)}
 }}finally{if(scope(value))busy.value=false}
}
async function toggle(value:string|number|boolean){if(!ready.value||typeof value!=='boolean'||value===control.value?.enabled)return;await perform(makeIntent('enabled',value))}
async function openClear(){if(!ready.value)return;confirming.value=true;try{await ElMessageBox.confirm('确认清空所有运行日志吗？','提示',{type:'warning',confirmButtonText:'确定',cancelButtonText:'取消'});if(confirming.value&&writable.value)await clear()}catch{/* 取消或关闭确认不创建写入意图。 */}finally{confirming.value=false}}
async function clear(){if(!confirming.value||!control.value||!writable.value||busy.value||intent.value)return;confirming.value=false;await perform(makeIntent('clear',control.value.enabled))}
async function verify(){
 const value=intent.value;if(!value||!pending.value||busy.value||!visible.value)return
 busy.value=true;writeError.value='';const generation=viewGeneration;verifyController?.abort();verifyController=new AbortController()
 try{const result=await sceneDebugLogApi.control(value.project,value.id,verifyController.signal);if(!scope(value)||generation!==viewGeneration||!visible.value)return;if(!matches(result,value))throw new Error('当前日志状态尚未与原操作一致；未重复提交');control.value=result;intent.value=undefined;pending.value=false;if(value.kind==='clear')page.value=1;busy.value=false;await load()}
 catch(cause){if(scope(value)&&generation===viewGeneration&&visible.value){writeError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){control.value=undefined;emit('denied',cause)}}}finally{if(scope(value))busy.value=false}
}
async function changePage(value:number){if(!visible.value||locked.value||resource.loading.value||!Number.isSafeInteger(value)||value<1||value>2147483647)return;page.value=value;opened.value='';resource.clear();await load()}
</script>
<template><section v-show="!inactive" class="scene-debug-logs"><AsyncState :forbidden="!allowed">
 <h2>调试状态</h2><p class="scene-log-tips">开启调试状态后，将记录场景运行日志，包括运行错误信息，便于调试执行流程和动作。日志仅用于调试，最多保存 7 天。</p>
 <div class="scene-log-switch"><el-switch v-if="control" :model-value="control.enabled" aria-label="场景调试状态" active-color="#1e88e5" inactive-color="#cccccc" :loading="busy" :disabled="!ready" @change="toggle"/><el-skeleton v-else-if="resource.loading.value" :rows="1" animated/></div>
 <el-alert v-if="writeError||pending" :title="writeError||'原场景日志操作结果待核对；未重复提交'" type="warning" :closable="false"><el-button v-if="pending" :disabled="busy||!visible" @click="verify">重新读取核对</el-button><el-button v-else :disabled="busy" @click="load">重新读取</el-button></el-alert>
 <header><h2>执行日志</h2><div class="scene-log-actions"><el-button size="small" :icon="Refresh" :loading="resource.loading.value" :disabled="busy||pending||confirming" @click="load">刷新</el-button><el-button size="small" type="danger" :icon="Delete" :disabled="!ready" @click="openClear">清空</el-button></div></header>
 <AsyncState :loading="resource.loading.value&&!resource.data.value" :error="resource.error.value" @retry="load"><p v-if="resource.data.value&&!resource.data.value.items.length" class="scene-log-empty">暂无执行日志</p><template v-else-if="resource.data.value"><el-collapse v-model="opened" accordion class="scene-log-collapse"><el-collapse-item v-for="entry in resource.data.value.items" :key="entry.executionId" :name="entry.executionId"><template #title><div class="run-header"><div class="run-header-left"><span class="run-time">{{formatTime(entry.occurredAt)}}</span><span class="run-duration">耗时 {{sceneLogElapsed(entry.durationMillis)}}</span></div><el-tag size="small" :type="entry.result==='SUCCEEDED'?'success':entry.result==='FAILED'?'danger':entry.result==='PENDING'||entry.result==='TERMINATED'?'warning':'info'">{{{SUCCEEDED:'完成',FAILED:'失败',PENDING:'执行中',UNKNOWN:'结果未确认',SKIPPED:'跳过',TERMINATED:'终止'}[entry.result]}}</el-tag></div></template><SceneDebugLogTimeline v-if="opened===entry.executionId" :scene-id="id" :entry="entry" @denied="emit('denied',$event)"/></el-collapse-item></el-collapse>
 <div class="scene-log-pages"><el-pagination v-if="numberTotal!==undefined" background layout="prev, pager, next" :current-page="page" :page-size="20" :total="numberTotal" :disabled="locked||resource.loading.value" @current-change="changePage"/><template v-else><el-button :disabled="page<=1||locked||resource.loading.value" @click="changePage(page-1)">上一页</el-button><span>{{page}}</span><el-button :disabled="!hasNext||locked||resource.loading.value" @click="changePage(page+1)">下一页</el-button></template></div></template></AsyncState>

</AsyncState></section></template>
<style scoped>
.scene-debug-logs h2{margin:0;font-size:22px;font-weight:400;line-height:32px;color:#002822}.scene-log-tips{margin:10px 0 0;font-size:15px;font-weight:400;line-height:22px;color:#888}.scene-log-switch{margin-top:12px;min-height:20px}.scene-debug-logs>header,header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:40px}.scene-log-actions{display:flex;gap:10px}.scene-log-actions :deep(.el-button){margin:0;height:32px;padding:9px 15px;font-size:12px;border-radius:3px}.scene-log-empty{margin:20px 0 0;color:#6b7280;font-size:14px}.scene-log-collapse{margin-top:20px}.scene-log-collapse :deep(.el-collapse-item__header){height:auto;line-height:1.5;padding:12px 0}.run-header{display:flex;align-items:center;justify-content:space-between;width:100%;padding-right:10px}.run-header-left{display:flex;align-items:center;gap:16px}.run-time{font-weight:600;color:#333}.run-duration{color:#666;font-size:13px}.scene-log-pages{margin-top:20px;display:flex;justify-content:center;align-items:center;gap:8px}.scene-debug-logs :deep(.el-alert){margin-top:16px}
</style>
