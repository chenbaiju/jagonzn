<script setup lang="ts">
import { computed } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import AsyncState from '../../ui/AsyncState.vue'
import { memberChannelChoices, type MemberChannelChoice, type NotificationGroupMemberChoice } from './notification-group-draft'
const props=defineProps<{members:NotificationGroupMemberChoice[];modelValue:Record<string,MemberChannelChoice[]>;loading?:boolean;error?:unknown;disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:Record<string,MemberChannelChoice[]>];retry:[]}>()
const rows=computed(()=>[...props.members,...Object.keys(props.modelValue).filter(id=>props.modelValue[id]?.length&&!props.members.some(row=>row.accountId===id)).map(accountId=>({accountId,email:`成员已不可用（${accountId}）`,availableChannels:[] as MemberChannelChoice[]}))])
function choose(accountId:string,channel:MemberChannelChoice,checked:boolean){
 if(props.disabled||props.loading||props.error)return
 if(checked&&!props.members.find(row=>row.accountId===accountId)?.availableChannels.includes(channel))return
 const value=Object.fromEntries(Object.entries(props.modelValue).map(([id,channels])=>[id,[...channels]])),previous=value[accountId]||[]
 value[accountId]=checked?[...new Set([...previous,channel])]:previous.filter(item=>item!==channel);emit('update:modelValue',value)
}
</script>
<template><AsyncState :loading="loading" :error="error" @retry="emit('retry')"><div class="member-scroll" tabindex="0" aria-label="成员通知方式，可横向滚动"><table class="member-table"><thead><tr><th>成员</th><th v-for="channel in memberChannelChoices" :key="channel.value">{{ channel.label }} <el-tooltip v-if="channel.help" :content="channel.help"><el-icon class="help-icon" tabindex="0" :aria-label="channel.help"><QuestionFilled /></el-icon></el-tooltip></th></tr></thead><tbody><tr v-for="member in rows" :key="member.accountId"><td>{{ member.email }}</td><td v-for="channel in memberChannelChoices" :key="channel.value"><el-checkbox :model-value="modelValue[member.accountId]?.includes(channel.value)||false" :disabled="disabled||(!member.availableChannels.includes(channel.value)&&!modelValue[member.accountId]?.includes(channel.value))" :aria-label="`${member.email}${channel.label}`" @change="(checked:boolean|string|number)=>choose(member.accountId,channel.value,checked===true)" /></td></tr></tbody></table></div></AsyncState></template>
<style scoped>
.help-icon{color:var(--tl-muted);font-size:12px;margin-left:4px;vertical-align:middle}
.member-scroll{width:100%;overflow-x:auto}.member-table{width:100%;min-width:600px;border-collapse:collapse;font-size:14px}.member-table th,.member-table td{padding:12px 8px;text-align:center;border-bottom:1px solid var(--tl-border)}.member-table th:first-child,.member-table td:first-child{text-align:left;width:33%}.member-table th{font-weight:400;color:var(--tl-muted)}
</style>
