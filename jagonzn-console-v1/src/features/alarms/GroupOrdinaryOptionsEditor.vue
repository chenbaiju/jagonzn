<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import AsyncState from '../../ui/AsyncState.vue'
import { ApiError, assertIdentity, errorMessage, identityEpoch, IdentityChanged, onIdentityChange } from '../../core/http'
import { emptyNotificationGroupDraft, notificationGroupDraftError, notificationSmsTargets, type NotificationGroupMemberChoice } from './notification-group-draft'
import NotificationMemberChannels from './NotificationMemberChannels.vue'
import { copyOrdinaryOptions, type NotificationOrdinaryEditContext, type NotificationOrdinaryOptions } from './notification-ordinary-options'
const props=defineProps<{projectId:string;groupId:string;canManage:boolean;initial?:NotificationOrdinaryOptions;loading?:boolean;error?:unknown;members:NotificationGroupMemberChoice[];memberLoading?:boolean;memberError?:unknown;save:(context:NotificationOrdinaryEditContext,value:NotificationOrdinaryOptions)=>Promise<void>}>()
const emit=defineEmits<{close:[];saved:[];retry:[];retryMembers:[]}>()
const draft=ref<NotificationOrdinaryOptions>(),busy=ref(false),error=ref(''),review=ref(false)
let serial=0
function clear(){serial++;draft.value=undefined;busy.value=false;error.value='';review.value=false}
function read(){clear();if(!props.canManage||props.error||props.loading||!props.initial)return;const value=props.initial;if(!Number.isInteger(value.configurationVersion)||value.configurationVersion<0||value.configurationVersion>2147483647||!['member','sms','voice'].includes(value.mode)){error.value='通知方式资料不完整，请重新读取';return}draft.value=copyOrdinaryOptions(value)}
watch([()=>props.initial,()=>props.loading,()=>props.error],read,{immediate:true})
watch([()=>props.projectId,()=>props.groupId],()=>{clear();emit('close')})
watch(()=>props.canManage,value=>{if(!value){clear();emit('close')}},{flush:'sync'})
const dispose=onIdentityChange(()=>{clear();emit('close')});onScopeDispose(()=>{clear();dispose()})
async function save(){
 if(busy.value||review.value||!props.canManage||!props.projectId||!props.groupId||!draft.value||props.loading||props.error)return
 if(draft.value.mode==='member'&&(props.memberLoading||props.memberError)){error.value='请先读取当前项目成员';return}
 const snapshot=copyOrdinaryOptions(draft.value),form={...emptyNotificationGroupDraft(snapshot.mode),...snapshot,name:'通知组'}
 error.value=notificationGroupDraftError(form,props.members)||'';if(error.value)return
 if(snapshot.mode==='sms')snapshot.smsText=notificationSmsTargets(snapshot.smsText).join('\n')
 const context={projectId:props.projectId,groupId:props.groupId,identityEpoch:identityEpoch()},request=++serial;busy.value=true
 try{await props.save(context,snapshot);assertIdentity(context.identityEpoch);if(request!==serial||props.projectId!==context.projectId||props.groupId!==context.groupId)return;emit('saved');emit('close')}
 catch(cause){if(cause instanceof IdentityChanged||request!==serial)return;if(cause instanceof ApiError&&(cause.status===403||cause.status===404)){clear();emit('close');return}review.value=cause instanceof ApiError&&(cause.outcomeUnknown||cause.status===409);error.value=review.value?(cause instanceof ApiError&&cause.status===409?'通知方式已变更，请关闭后重新读取。':'保存结果未知，请关闭后重新读取核对。'):errorMessage(cause)}
 finally{if(request===serial)busy.value=false}
}
</script>
<template><el-dialog :model-value="true" title="修改通知方式" width="min(800px, 94vw)" :show-close="!busy" :close-on-click-modal="!busy" :close-on-press-escape="!busy" @close="!busy&&emit('close')"><AsyncState :loading="loading" :error="props.error" @retry="emit('retry')"><el-form v-if="draft" label-position="top">
 <el-form-item v-if="draft.mode==='member'" label="设置成员通知方式"><NotificationMemberChannels v-model="draft.memberChannels" :members="members" :loading="memberLoading" :error="memberError" :disabled="busy||!canManage" @retry="emit('retryMembers')" /></el-form-item>
 <el-form-item v-else-if="draft.mode==='sms'"><template #label>设置手机号 <el-tooltip content="多个手机号请用换行分隔。"><el-icon class="help-icon" tabindex="0" aria-label="多个手机号请用换行分隔。"><QuestionFilled /></el-icon></el-tooltip></template><el-input v-model="draft.smsText" type="textarea" :rows="6" :disabled="busy||!canManage" aria-label="设置手机号" /></el-form-item>
 <template v-else-if="draft.mode==='voice'"><el-form-item><template #label>设置被叫号码 <el-tooltip content="可填写手机号或座机号。"><el-icon class="help-icon" tabindex="0" aria-label="可填写手机号或座机号。"><QuestionFilled /></el-icon></el-tooltip></template><el-input v-model="draft.voiceNumber" :disabled="busy||!canManage" aria-label="设置被叫号码" /></el-form-item><el-form-item><template #label>设置集成语音服务 <el-tooltip content="可使用专属的语音服务资质和模版，请在项目集成中设置第三方语音服务。"><el-icon class="help-icon" tabindex="0" aria-label="集成语音服务说明"><QuestionFilled /></el-icon></el-tooltip></template><el-select v-model="draft.voicePlatform" :disabled="busy||!canManage" aria-label="设置集成语音服务"><el-option label="阿里云语音服务" value="aliyun" /></el-select></el-form-item></template>
 </el-form></AsyncState><el-alert v-if="error" :title="error" type="error" :closable="false" /><template #footer><el-button :disabled="busy" @click="emit('close')">取消</el-button><el-button type="primary" :loading="busy" :disabled="busy||review||loading||!!props.error||!draft||!canManage" @click="save">保存</el-button></template></el-dialog></template>
<style scoped>.help-icon{color:var(--tl-muted);font-size:12px;margin-left:4px;vertical-align:middle}:deep(.el-select__wrapper){min-height:40px}</style>
