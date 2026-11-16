<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import PageHeader from '../../ui/PageHeader.vue'
import NotificationMemberChannels from './NotificationMemberChannels.vue'
import { ApiError, assertIdentity, errorMessage, identityEpoch, IdentityChanged, onIdentityChange } from '../../core/http'
import { copyNotificationGroupDraft, emptyNotificationGroupDraft, notificationGroupDraftError, notificationGroupModes, notificationSmsTargets, type NotificationGroupCreationContext, type NotificationGroupDraft, type NotificationGroupMemberChoice, type NotificationGroupMode, type RobotMode } from './notification-group-draft'
const props=withDefaults(defineProps<{
 projectId:string;canManage:boolean;members:NotificationGroupMemberChoice[];memberLoading?:boolean;memberError?:unknown;
 initialMode?:NotificationGroupMode;bodyFunctionTemplate?:string;
 save:(context:NotificationGroupCreationContext,draft:NotificationGroupDraft)=>Promise<void>
}>(),{initialMode:'member',bodyFunctionTemplate:'',memberLoading:false})
const emit=defineEmits<{cancel:[];saved:[];retryMembers:[]}>()
const draft=reactive(emptyNotificationGroupDraft(props.initialMode,props.bodyFunctionTemplate)),busy=ref(false),error=ref(''),review=ref(false)
const robotMode=computed(()=>['qywx_robot','dingding_robot','feishu_robot'].includes(draft.mode)?draft.mode as RobotMode:undefined)
const robotLabel=computed(()=>({qywx_robot:'设置企业微信机器人URL',dingding_robot:'设置钉钉机器人URL',feishu_robot:'设置飞书机器人URL'}[robotMode.value||'qywx_robot']))
let serial=0
function reset(){serial++;Object.assign(draft,emptyNotificationGroupDraft(props.initialMode,props.bodyFunctionTemplate));busy.value=false;error.value='';review.value=false}
const dispose=onIdentityChange(()=>{reset();emit('cancel')});onScopeDispose(()=>{reset();dispose()})
watch(()=>props.projectId,()=>{reset();emit('cancel')})
watch(()=>props.canManage,value=>{if(!value){reset();emit('cancel')}},{flush:'sync'})
async function submit(){
 if(busy.value||review.value||!props.canManage||!props.projectId)return
 if(draft.mode==='member'&&(props.memberLoading||props.memberError)){error.value='请先读取当前项目成员';return}
 error.value=notificationGroupDraftError(draft,props.members)||'';if(error.value)return
 const context={projectId:props.projectId,identityEpoch:identityEpoch()},request=++serial;busy.value=true
 try {const payload=copyNotificationGroupDraft(draft);if(payload.mode==='sms')payload.smsText=notificationSmsTargets(payload.smsText).join('\n');await props.save(context,payload);assertIdentity(context.identityEpoch);if(request!==serial||props.projectId!==context.projectId)return;emit('saved')}
 catch(cause){
  if(cause instanceof IdentityChanged||request!==serial)return
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){reset();emit('cancel');return}
  const validation=cause instanceof ApiError&&!cause.outcomeUnknown&&(cause.status===400||cause.status===422)
  review.value=!validation
  error.value=validation?errorMessage(cause):cause instanceof ApiError&&cause.status===409?'通知组已变更，请返回列表重新读取核对。':'创建结果未知，请返回通知组列表重新读取核对。'
 }
 finally {if(request===serial)busy.value=false}
}
</script>
<template>
 <main class="tl-page notification-group-create">
  <PageHeader title="创建通知组" back @back="!busy&&emit('cancel')" />
  <el-form label-position="top" @submit.prevent="submit">
   <el-form-item label="通知组名称"><el-input v-model="draft.name" class="compact-input" maxlength="64" :disabled="busy||!canManage" aria-label="通知组名称" /></el-form-item>
   <el-form-item label="通知组描述"><el-input v-model="draft.description" class="compact-input" type="textarea" :rows="5" maxlength="2048" :disabled="busy||!canManage" aria-label="通知组描述" /></el-form-item>
   <el-form-item label="通知方式"><el-radio-group v-model="draft.mode" class="notification-modes" :disabled="busy||!canManage" aria-label="通知方式"><el-radio-button v-for="mode in notificationGroupModes" :key="mode.value" :value="mode.value">{{ mode.label }}</el-radio-button></el-radio-group></el-form-item>
   <template v-if="draft.mode==='member'">
    <el-form-item label="设置成员通知方式">
    <NotificationMemberChannels v-model="draft.memberChannels" :members="members" :loading="memberLoading" :error="memberError" :disabled="busy||!canManage" @retry="emit('retryMembers')" />
    </el-form-item>
   </template>
   <el-form-item v-else-if="draft.mode==='email'"><template #label>设置邮箱 <el-tooltip content="多个邮箱请用换行分隔。"><el-icon class="help-icon" tabindex="0" aria-label="多个邮箱请用换行分隔。"><QuestionFilled /></el-icon></el-tooltip></template><el-input v-model="draft.emailsText" type="textarea" :rows="3" :disabled="busy||!canManage" aria-label="设置邮箱" /></el-form-item>
   <el-form-item v-else-if="draft.mode==='sms'"><template #label>设置手机号 <el-tooltip content="多个手机号请用换行分隔。"><el-icon class="help-icon" tabindex="0" aria-label="多个手机号请用换行分隔。"><QuestionFilled /></el-icon></el-tooltip></template><el-input v-model="draft.smsText" type="textarea" :rows="6" :disabled="busy||!canManage" aria-label="设置手机号" /></el-form-item>
   <template v-else-if="draft.mode==='voice'">
    <el-form-item><template #label>设置被叫号码 <el-tooltip content="可填写手机号（例如：186****1234）或座机号（例如：0755****5678）。"><el-icon class="help-icon" tabindex="0" aria-label="可填写手机号或座机号。"><QuestionFilled /></el-icon></el-tooltip></template><el-input v-model="draft.voiceNumber" :disabled="busy||!canManage" aria-label="设置被叫号码" /></el-form-item>
    <el-form-item><template #label>设置集成语音服务 <el-tooltip content="可使用专属的语音服务资质和模版，请在项目集成中设置第三方语音服务。"><el-icon class="help-icon" tabindex="0" aria-label="集成语音服务说明"><QuestionFilled /></el-icon></el-tooltip></template><el-select v-model="draft.voicePlatform" placeholder="请选择" :disabled="busy||!canManage" aria-label="设置集成语音服务"><el-option label="阿里云语音服务" value="aliyun" /></el-select></el-form-item>
   </template>
   <el-form-item v-else-if="robotMode" :label="robotLabel"><el-input v-model="draft.robotUrls[robotMode]" placeholder="https://" :disabled="busy||!canManage" :aria-label="robotLabel" autocomplete="off" /></el-form-item>
   <template v-else-if="draft.mode==='webhook'">
    <el-form-item label="Webhook URL"><el-input v-model="draft.webhookUrl" placeholder="https://" :disabled="busy||!canManage" aria-label="Webhook URL" autocomplete="off" /></el-form-item>
    <el-form-item label="自定义 HTTP 请求头"><div class="http-headers"><div v-for="(header,index) in draft.headers" :key="index" class="http-header-row"><el-input v-model="header.name" :disabled="busy||!canManage" :aria-label="`请求头${index+1}名称`" autocomplete="off" /><el-input v-model="header.value" :disabled="busy||!canManage" :aria-label="`请求头${index+1}值`" autocomplete="off" /><el-button size="small" :disabled="busy||!canManage" @click="draft.headers.splice(index,1)">移除</el-button></div><el-button size="small" :disabled="busy||!canManage" @click="draft.headers.push({name:'',value:''})">添加</el-button></div></el-form-item>
    <el-form-item label="使用自定义请求格式"><el-switch v-model="draft.customBody" :disabled="busy||!canManage" aria-label="使用自定义请求格式" /></el-form-item>
    <el-form-item v-if="draft.customBody" label="编辑正文函数"><slot name="body-editor" :value="draft.bodyFunctionSource" :update="(value:string)=>draft.bodyFunctionSource=value" :disabled="busy||!canManage"><el-input v-model="draft.bodyFunctionSource" class="body-function-input" type="textarea" :rows="16" :disabled="busy||!canManage" spellcheck="false" aria-label="编辑正文函数" /></slot></el-form-item>
   </template>
   <el-alert v-if="error" :title="error" type="error" :closable="false" />
   <el-form-item class="form-actions"><el-button size="large" type="primary" :loading="busy" :disabled="!canManage||review" @click="submit">创建</el-button><el-button size="large" :disabled="busy" @click="emit('cancel')">取消</el-button></el-form-item>
  </el-form>
 </main>
</template>
<style scoped>
.notification-group-create :deep(.tl-page-header) {min-height:24px}
.notification-group-create :deep(.el-form-item) {margin-bottom:28px}
.notification-group-create :deep(.el-select__wrapper) {min-height:40px}
.compact-input {width:min(350px,100%)}
.notification-modes {display:flex;flex-wrap:wrap;row-gap:8px;max-width:100%}
.notification-modes :deep(.el-radio-button__inner) {padding:10px 20px;font-weight:400}
.help-icon {color:var(--tl-muted);font-size:12px;margin-left:4px;vertical-align:middle}
.http-headers {width:100%}.http-header-row {display:flex;align-items:center;gap:8px;width:100%;margin-bottom:8px}.http-header-row .el-input {flex:1;min-width:0}
.body-function-input :deep(textarea) {font-family:ui-monospace,SFMono-Regular,monospace;background:#272822;color:#f8f8f2;min-height:350px;tab-size:2}
.form-actions {margin-top:50px}
@media(max-width:600px){.http-header-row {display:grid;grid-template-columns:minmax(0,1fr) auto}.http-header-row .el-input:first-child {grid-column:1/-1}.notification-modes {gap:8px}.notification-modes :deep(.el-radio-button__inner) {padding:10px 12px;border:1px solid var(--tl-input-border);border-radius:4px;box-shadow:none}.notification-modes :deep(.el-radio-button.is-active .el-radio-button__inner) {border-color:var(--tl-primary)}}
</style>
