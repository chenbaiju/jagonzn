<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,projectId} from '@/core/session'
import {endUserApi,type EndUser} from './end-user-api'

const props=defineProps<{modelValue:boolean;user:EndUser|null}>()
const emit=defineEmits<{'update:modelValue':[boolean]}>()
const canManage=computed(()=>can('enduser:manage'))
const voice=ref(''),sms=ref(''),revision=ref<string|null>(null),savedVoice=ref<string|null>(null),savedSms=ref<string|null>(null)
const loading=ref(false),saving=ref(false),message=ref(''),messageType=ref<'success'|'warning'|'error'>('success')
let controller:AbortController|undefined,generation=0
const voiceValue=computed(()=>voice.value.trim()),smsValue=computed(()=>sms.value.trim())
const validNumber=(value:string)=>!value||/^\+[1-9][0-9]{6,14}$/.test(value)
const valid=computed(()=>validNumber(voiceValue.value)&&validNumber(smsValue.value))
const editable=computed(()=>canManage.value&&!!props.user&&revision.value!==null&&!loading.value&&!saving.value)
const dirty=computed(()=>voiceValue.value!==(savedVoice.value??'')||smsValue.value!==(savedSms.value??''))
function apply(value:{voiceNumber:string|null;smsNumber:string|null;revision:string}){
  revision.value=value.revision;voice.value=value.voiceNumber??'';sms.value=value.smsNumber??''
  savedVoice.value=value.voiceNumber;savedSms.value=value.smsNumber
}
function invalidate(){generation++;controller?.abort();controller=undefined;loading.value=false;saving.value=false}
async function load(keepMessage=false){
  const user=props.user,project=projectId.value
  if(!props.modelValue||!user||!project||!canManage.value){invalidate();return}
  controller?.abort();const current=new AbortController();controller=current
  const scope=++generation,epoch=identityEpoch(),userId=user.id
  loading.value=true;revision.value=null;savedVoice.value=savedSms.value=null
  if(!keepMessage){voice.value='';sms.value='';message.value=''}
  try{
    const value=await endUserApi.notificationContact(project,userId,current.signal)
    if(scope!==generation||epoch!==identityEpoch()||project!==projectId.value||userId!==props.user?.id)return
    apply(value)
    if(!keepMessage){message.value='';messageType.value='success'}
  }catch(cause){
    if(scope!==generation||epoch!==identityEpoch()||current.signal.aborted)return
    messageType.value='warning'
    message.value=`接收号码读取失败，请重新打开核对；不能据此判断尚未配置。${errorMessage(cause)}`
  }finally{if(scope===generation&&controller===current)loading.value=false}
}
function close(){if(saving.value)return;emit('update:modelValue',false)}
async function save(){
  const user=props.user,project=projectId.value,expected=revision.value
  if(!editable.value||!dirty.value||!valid.value||!user||!project||expected===null)return
  const scope=generation,epoch=identityEpoch(),body={voiceNumber:voiceValue.value||null,smsNumber:smsValue.value||null,expectedRevision:expected}
  saving.value=true;message.value=''
  try{
    const value=await endUserApi.updateNotificationContact(project,user.id,body)
    if(scope!==generation||epoch!==identityEpoch()||project!==projectId.value||user.id!==props.user?.id)return
    if(value.voiceNumber!==body.voiceNumber||value.smsNumber!==body.smsNumber||value.revision===expected)throw new Error('接收号码写入回执不一致')
    apply(value);messageType.value='success';message.value='接收号码已保存。'
  }catch(cause){
    if(scope!==generation||epoch!==identityEpoch()||project!==projectId.value||user.id!==props.user?.id)return
    messageType.value='warning'
    message.value=cause instanceof ApiError&&cause.code===60062
      ?'号码已被其他管理员修改，已重新读取；请按最新号码核对后再保存。'
      :cause instanceof ApiError&&cause.outcomeUnknown
        ?`${errorMessage(cause)}；结果未知，已重新读取；不会自动重复提交。`
        :`保存未确认，已重新读取；请按最新号码核对。${errorMessage(cause)}`
    saving.value=false
    await load(true)
  }finally{if(scope===generation)saving.value=false}
}
watch([()=>props.modelValue,()=>props.user?.id,()=>canManage.value,projectId],()=>{if(props.modelValue&&props.user&&canManage.value)void load();else invalidate()},{immediate:true,flush:'sync'})
const disposeIdentity=onIdentityChange(()=>invalidate())
onScopeDispose(()=>{invalidate();disposeIdentity()})
</script>
<template>
 <el-dialog :model-value="modelValue" title="接收号码" width="min(520px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @close="close">
  <div class="contact-body">
   <p class="contact-user">终端用户：<strong>{{ user?.displayName || user?.username || '—' }}</strong></p>
   <el-alert v-if="!canManage" type="warning" :closable="false" title="当前账号没有管理终端用户的权限" />
   <template v-else>
    <el-alert v-if="message" :title="message" :type="messageType" :closable="false" />
    <p v-if="loading" class="contact-hint">正在读取当前项目接收号码…</p>
    <el-form label-position="top" :disabled="!editable">
     <el-form-item label="电话告警接收号码"><el-input v-model="voice" aria-label="电话告警接收号码" maxlength="16" placeholder="例如 +8613800000000；留空清除" autocomplete="off" /></el-form-item>
     <el-form-item label="短信告警接收号码"><el-input v-model="sms" aria-label="短信告警接收号码" maxlength="16" placeholder="例如 +8613800000000；留空清除" autocomplete="off" /></el-form-item>
    </el-form>
    <p v-if="!valid" class="contact-error">号码格式不正确，请使用 +国家码和数字，或留空清除。</p>
    <p class="contact-note">号码按当前项目保存，只用于本项目告警通知；留空保存会清除对应号码。</p>
   </template>
  </div>
  <template #footer><el-button :disabled="saving" @click="close">取消</el-button><el-button v-if="canManage" type="primary" :loading="saving" :disabled="!editable||!dirty||!valid" @click="save">保存接收号码</el-button></template>
 </el-dialog>
</template>
<style scoped>
.contact-body{display:grid;gap:14px}.contact-user{margin:0;color:#606266;font-size:14px;line-height:22px}.contact-hint,.contact-note{margin:0;color:#909399;font-size:12px;line-height:20px}.contact-error{margin:0;color:#f56c6c;font-size:12px;line-height:20px}
</style>
