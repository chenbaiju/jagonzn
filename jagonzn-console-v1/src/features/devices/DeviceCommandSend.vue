<script setup lang="ts">
import {ref,shallowRef,computed,watch,onScopeDispose} from 'vue'
import {ElMessage} from 'element-plus'
import {can,projectId,currentProject} from '@/core/session'
import {ApiError,IdentityChanged,onIdentityChange,errorMessage} from '@/core/http'
import {useResource} from '@/core/use-resource'
import JsonCodeEditor from '@/ui/JsonCodeEditor.vue'
import {useDeviceGuard} from './use-device-guard'
import {commandChoices,validateCommandInput,submitCommand,waitCommandReply,readCommandSubmission,type CommandChoice} from './command-send-api'
import type {CommandDetail} from './command-records-api'

const props=defineProps<{deviceId:string}>()
const emit=defineEmits<{saved:[];busy:[value:boolean]}>()
type Phase='idle'|'sending'|'checking'|'unknown'|'accepted'|'done'
type Intent=Readonly<{project:string;device:string;key:string;command:string;input:string;synchronous:boolean}>
const open=ref(false),command=ref(''),input=ref(''),sync=ref(false),phase=ref<Phase>('idle'),error=ref(''),reply=ref<string>(),accepted=shallowRef<CommandDetail>()
const busy=computed(()=>phase.value==='sending'||phase.value==='checking'),unknown=computed(()=>phase.value==='unknown'),recoverable=computed(()=>unknown.value||phase.value==='accepted'),locked=computed(()=>phase.value!=='idle')
const writable=computed(()=>can('device:control')&&currentProject.value?.status==='ACTIVE'),blocked=computed(()=>busy.value||recoverable.value)
const capture=useDeviceGuard(()=>props.deviceId)
const definitions=useResource(signal=>commandChoices(projectId.value,props.deviceId,signal))
const editorSession=ref(0)
let generation=0,controller:AbortController|undefined,intent:Intent|undefined
watch(blocked,value=>emit('busy',value),{immediate:true,flush:'sync'})
function clear(){generation++;editorSession.value++;controller?.abort();controller=undefined;intent=undefined;accepted.value=undefined;definitions.clear();open.value=false;command.value='';input.value='';sync.value=false;phase.value='idle';error.value='';reply.value=undefined}
function start(){if(!can('device:control')||busy.value)return;if(recoverable.value){open.value=true;return}if(writable.value){clear();open.value=true;void definitions.reload()}}
function close(done?:()=>void){if(phase.value==='sending')return;if(phase.value==='checking'){generation++;controller?.abort();phase.value=accepted.value?'accepted':'unknown'}if(recoverable.value)open.value=false;else clear();done?.()}
function suggestions(query:string,callback:(items:CommandChoice[])=>void){callback((definitions.data.value??[]).filter(item=>item.value.toLowerCase().startsWith(query.toLowerCase())))}
function select(value:Record<string,unknown>){if(locked.value)return;const item=definitions.data.value?.find(item=>item.value===value.value);if(item)input.value=item.defaults??'{}'}
function denied(){clear();ElMessage.error('操作权限已失效，请刷新权限后重试')}
function finishReply(result:CommandDetail){accepted.value=result;if(result.status==='SUCCEEDED'){reply.value=result.outputText??'null';phase.value='done';error.value=''}else if(result.status==='FAILED'||result.status==='TIMED_OUT'){phase.value='done';error.value='命令下发失败'}else{phase.value='accepted';error.value='等待超时，设备未回复命令'}emit('saved')}
async function readReply(){
 const original=intent,known=accepted.value
 if(!original||!known||busy.value||!can('device:control'))return
 const current=++generation,check=capture();controller=new AbortController();const signal=controller.signal;phase.value='checking';error.value=''
 try{const result=await waitCommandReply(original.project,known,signal);check();if(current!==generation||signal.aborted)return;finishReply(result)}
 catch(cause){if(current!==generation||signal.aborted||cause instanceof IdentityChanged)return;if(cause instanceof ApiError&&[401,403].includes(cause.status)){denied();return}phase.value='accepted';error.value=errorMessage(cause)}
}
async function send(){
 if(phase.value!=='idle'||!writable.value)return
 const selectedCommand=command.value,selectedInput=input.value
 try{if(!/^[A-Za-z0-9_-]{1,64}$/.test(selectedCommand))throw new Error('请填写有效命令标识符');validateCommandInput(selectedInput)}catch(cause){error.value=errorMessage(cause);return}
 const current=++generation,check=capture(),original=Object.freeze({project:projectId.value,device:props.deviceId,key:crypto.randomUUID(),command:selectedCommand,input:selectedInput,synchronous:sync.value})
 intent=original;controller=new AbortController();const signal=controller.signal;error.value='';reply.value=undefined;phase.value='sending'
 try{
  const result=await submitCommand(original.project,original.device,original.command,original.input,original.key,signal)
  check();if(current!==generation||signal.aborted)return
  accepted.value=result;emit('saved')
  if(!original.synchronous){clear();return}
  phase.value='accepted'
  if(['SUCCEEDED','FAILED','TIMED_OUT'].includes(result.status))finishReply(result);else await readReply()
 }catch(cause){
  if(current!==generation||signal.aborted||cause instanceof IdentityChanged)return
  if(cause instanceof ApiError&&[401,403].includes(cause.status)){denied();return}
  const definite=cause instanceof ApiError&&!cause.outcomeUnknown&&[400,404,409,413,415,422,429].includes(cause.status)&&![10010,10014].includes(cause.code||0)
  phase.value=definite?'idle':'unknown';if(definite)intent=undefined;error.value=errorMessage(cause)
 }
}
async function recover(){
 const original=intent
 if(phase.value!=='unknown'||!original||!can('device:control'))return
 const current=++generation,check=capture();controller=new AbortController();const signal=controller.signal;phase.value='checking';error.value=''
 try{
  const result=await readCommandSubmission(original.project,original.device,original.command,original.input,original.key,signal)
  check();if(current!==generation||signal.aborted)return
  accepted.value=result;emit('saved')
  if(!original.synchronous){clear();return}
  if(['SUCCEEDED','FAILED','TIMED_OUT'].includes(result.status))finishReply(result);else{phase.value='accepted';error.value='原请求已受理，请继续读取设备回复。'}
 }catch(cause){if(current!==generation||signal.aborted||cause instanceof IdentityChanged)return;if(cause instanceof ApiError&&[401,403].includes(cause.status)){denied();return}phase.value='unknown';error.value=cause instanceof ApiError&&cause.status===404?'暂未定位原请求回执，请稍后核对；本次操作不会再次发送。':errorMessage(cause)}
}
const dispose=onIdentityChange(clear)
watch([()=>props.deviceId,()=>projectId.value,()=>can('device:control')],clear)
onScopeDispose(()=>{clear();dispose();emit('busy',false)})
</script>
<template>
 <el-button v-if="can('device:control')" size="small" plain class="source-command-open" :disabled="busy||(!writable&&!recoverable)" @click="start"><svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12"><path d="M6 17a4 4 0 0 1-.8-7.9A6 6 0 0 1 16.5 7a5 5 0 0 1 1.5 9.8M12 11v9m-4-4 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg> 下发命令</el-button>
 <el-dialog :model-value="open" title="下发命令" width="min(500px,94vw)" :close-on-click-modal="false" :show-close="phase!=='sending'" :close-on-press-escape="phase!=='sending'" :before-close="close" destroy-on-close class="source-command-dialog">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <el-alert v-if="unknown" title="结果未知，请核对原请求；本次操作不会再次发送。" type="warning" :closable="false"/>
  <el-alert v-if="phase==='accepted'||phase==='checking'&&accepted" title="命令已受理，设备回复尚未确认；本次操作不会再次发送。" type="warning" :closable="false"/>
  <el-form label-position="top" @submit.prevent="send">
   <el-form-item label="命令标识符"><el-autocomplete v-model="command" :fetch-suggestions="suggestions" placeholder="填写命令标识符" aria-label="命令标识符" :disabled="locked" style="width:100%" @select="select"><template #default="{item}"><div>{{item.value}}</div><span class="command-name">{{item.name}}</span></template></el-autocomplete><span v-if="definitions.error.value" class="command-definition-error">{{errorMessage(definitions.error.value)}}</span></el-form-item>
   <el-form-item label="命令参数 JSON"><JsonCodeEditor :key="`input:${projectId}:${deviceId}:${editorSession}`" v-model="input" ariaLabel="命令参数 JSON" :height="200" :disabled="locked"/></el-form-item>
   <el-form-item><template #label>同步命令下发 <el-tooltip content="使用同步调用模式，会等待设备的命令回复消息。同步命令下发便于在应用端通过 API 请求设备并同步获得设备反馈。" placement="top"><span tabindex="0" role="img" aria-label="同步命令下发说明" class="command-help">?</span></el-tooltip></template><el-switch v-model="sync" aria-label="同步命令下发" :disabled="locked"/></el-form-item>
   <el-form-item v-if="sync&&reply!==undefined" label="设备回复参数 JSON"><JsonCodeEditor :key="`reply:${projectId}:${deviceId}:${editorSession}`" :model-value="reply" ariaLabel="设备回复参数 JSON" :height="150" readonly/></el-form-item>
  </el-form>
  <template #footer><el-button :disabled="phase==='sending'" @click="close()">取消</el-button><el-button v-if="unknown||phase==='checking'&&!accepted" type="primary" :loading="busy" :disabled="busy" @click="recover">核对原请求</el-button><el-button v-else-if="phase==='accepted'||phase==='checking'&&accepted" type="primary" :loading="busy" :disabled="busy" @click="readReply">读取命令结果</el-button><el-button v-else-if="phase!=='done'" type="primary" :loading="busy" :disabled="locked||!writable" @click="send">发送</el-button></template>
 </el-dialog>
</template>
<style scoped>
.source-command-open{height:32px;padding:9px 15px;font-size:12px;line-height:1;border-radius:3px;}.source-command-open :deep(>span){display:inline-block;}.source-command-open svg{vertical-align:-1px;margin-right:3px;}.command-name{font-size:12px;color:#999;}.command-help{display:inline-flex;align-items:center;justify-content:center;border:1px solid currentColor;border-radius:50%;font-size:10px;width:12px;height:12px;color:#909399;vertical-align:1px;}.command-definition-error{color:var(--el-color-danger);font-size:12px;}
</style>
<style>
.source-command-dialog .el-dialog__body{padding:30px 20px;max-height:calc(85dvh - 124px);overflow-y:auto;}.source-command-dialog .el-dialog__header{padding:20px 20px 10px;}.source-command-dialog .el-dialog__footer{padding:10px 20px 20px;}.source-command-dialog .el-form-item{margin-bottom:22px;}.source-command-dialog .el-form-item__label{height:32px;line-height:32px;padding:0;margin:0;color:#606266;font-weight:700;}.source-command-dialog .el-form-item__content{line-height:24px;min-height:24px;}.source-command-dialog .el-switch{height:20px;line-height:20px;}
</style>
