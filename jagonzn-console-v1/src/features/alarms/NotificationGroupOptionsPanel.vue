<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { can, projectId } from '../../core/session'
import { onIdentityChange } from '../../core/http'
import { useResource } from '../../core/use-resource'
import { alarmApi } from './api'
import AsyncState from '../../ui/AsyncState.vue'
import GroupEmailOptionsEditor from './GroupEmailOptionsEditor.vue'
import NotificationMemberChannels from './NotificationMemberChannels.vue'
import ManagedOrdinaryGroupOptionsEditor from './ManagedOrdinaryGroupOptionsEditor.vue'
import ManagedSecretGroupOptionsEditor from './ManagedSecretGroupOptionsEditor.vue'
const props=defineProps<{groupId:string}>(),emit=defineEmits<{saved:[]}>()
const identity=useResource(signal=>alarmApi.groupConfiguration(projectId.value,props.groupId,signal))
const emails=useResource(signal=>alarmApi.groupEmailOptions(projectId.value,props.groupId,signal))
const options=useResource(async signal=>{
 const expected=identity.data.value
 if(!expected?.configured)throw new Error('请重新读取通知方式')
 const result=await alarmApi.groupPublicOptions(projectId.value,props.groupId,signal)
 if(result.notificationType!==expected.notificationType||result.configurationVersion!==expected.configurationVersion)throw new Error('通知方式已变更，请重新读取核对')
 return result
})
const publicMembers=computed(()=>options.data.value?.members.map(member=>({accountId:member.accountId,email:member.accountId,availableChannels:[]}))||[])
const publicSelections=computed(()=>Object.fromEntries(options.data.value?.members.map(member=>[member.accountId,member.channels])||[]))
const editing=ref<'email'|'ordinary'|'secret'>()
const kind=computed(()=>identity.data.value?.notificationType)
const labels={MEMBER:'成员通知',EMAIL:'邮箱通知',SMS:'短信通知',VOICE:'电话通知',WECOM_ROBOT:'企业微信群机器人',DINGTALK_ROBOT:'钉钉群机器人',FEISHU_ROBOT:'飞书群机器人',WEBHOOK:'Webhook'}
const emailCompatible=computed(()=>!!identity.data.value&&(!identity.data.value.configured||kind.value==='EMAIL'))
const ordinaryEditable=computed(()=>kind.value==='MEMBER'||kind.value==='SMS'||kind.value==='VOICE')
const secretKind=computed(()=>kind.value==='WECOM_ROBOT'||kind.value==='DINGTALK_ROBOT'||kind.value==='FEISHU_ROBOT'||kind.value==='WEBHOOK'?kind.value:undefined)
function clear(){identity.clear();emails.clear();options.clear();editing.value=undefined}
async function reload(){clear();if(projectId.value&&props.groupId&&can('alarm:read'))await identity.reload()}
watch([projectId,()=>props.groupId,()=>can('alarm:read')],()=>void reload(),{immediate:true})
watch(()=>can('alarm:manage'),value=>{if(!value)editing.value=undefined},{flush:'sync'})
watch(identity.data,value=>{
 emails.clear();options.clear();editing.value=undefined
 if(!value||!can('alarm:read'))return
 if(value.configured&&['MEMBER','SMS','VOICE'].includes(value.notificationType!))void options.reload()
 if(!value.configured||value.notificationType==='EMAIL')void emails.reload()
})
watch(options.error,value=>{if(value){options.data.value=undefined;editing.value=undefined}})
watch(identity.error,value=>{if(value){identity.data.value=undefined;emails.clear();options.clear();editing.value=undefined}})
const dispose=onIdentityChange(clear);onScopeDispose(()=>{clear();dispose()})
function saved(){emit('saved');void reload()}
</script>
<template><AsyncState :loading="identity.loading.value" :error="identity.error.value" @retry="reload"><dl v-if="identity.data.value" class="tl-key-values"><dt>通知类型</dt><dd>{{ kind?labels[kind]:'—' }} <el-button v-if="secretKind&&can('alarm:manage')" link type="primary" @click="editing='secret'">编辑</el-button><el-button v-if="ordinaryEditable&&options.data.value&&can('alarm:manage')" link type="primary" @click="editing='ordinary'">编辑</el-button></dd><template v-if="identity.data.value.configured&&['MEMBER','SMS','VOICE'].includes(kind!)"><dt>{{ kind==='MEMBER'?'成员通知方式':kind==='SMS'?'接收短信号码':'接听电话' }}</dt><dd :class="{ 'member-options':kind==='MEMBER' }"><AsyncState :loading="options.loading.value" :error="options.error.value" @retry="reload"><NotificationMemberChannels v-if="options.data.value?.notificationType==='MEMBER'" :members="publicMembers" :model-value="publicSelections" disabled /><span v-else-if="options.data.value" class="email-lines">{{ options.data.value.maskedNumbers.join('\n') }}</span></AsyncState></dd></template><template v-if="emailCompatible"><dt>设置邮箱</dt><dd><AsyncState :loading="emails.loading.value" :error="emails.error.value" @retry="emails.reload"><span class="email-lines">{{ emails.data.value?.filter(row=>row.enabled).map(row=>row.target).join('\n')||'无' }}</span> <el-button v-if="emails.data.value&&can('alarm:manage')" link type="primary" @click="editing='email'">编辑</el-button></AsyncState></dd></template></dl></AsyncState><GroupEmailOptionsEditor v-if="editing==='email'&&can('alarm:manage')" :group-id="groupId" @close="editing=undefined" @saved="saved" /><ManagedOrdinaryGroupOptionsEditor v-if="editing==='ordinary'&&can('alarm:manage')" :group-id="groupId" @close="editing=undefined" @saved="saved" /><ManagedSecretGroupOptionsEditor v-if="editing==='secret'&&secretKind&&can('alarm:manage')" :group-id="groupId" :expected-kind="secretKind" @close="editing=undefined" @saved="saved" /></template>
<style scoped>.email-lines{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:600px){.member-options{grid-column:1/-1;min-width:0}}</style>
