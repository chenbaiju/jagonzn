<script setup lang="ts">
import {computed,onScopeDispose,watch} from 'vue'
import {useRouter} from 'vue-router'
import {can,projectId} from '../../core/session'
import {onIdentityChange} from '../../core/http'
import {useResource} from '../../core/use-resource'
import AsyncState from '../../ui/AsyncState.vue'
import NotificationGroupCreationForm from './NotificationGroupCreationForm.vue'
import {alarmApi} from './api'
import {idOf} from './model'
import {createNotificationGroupAndVerify} from './notification-group-creation'
import type {NotificationGroupCreationContext,NotificationGroupDraft} from './notification-group-draft'
const router=useRouter(),manage=computed(()=>can('alarm:manage'))
const members=useResource(signal=>alarmApi.notificationMembers(projectId.value,signal))
let created=''
function clear(){created='';members.clear()}
async function read(){clear();if(projectId.value&&manage.value)await members.reload()}
watch([projectId,manage],()=>void read(),{immediate:true})
const dispose=onIdentityChange(clear);onScopeDispose(()=>{clear();dispose()})
async function save(context:NotificationGroupCreationContext,draft:NotificationGroupDraft){created=idOf(await createNotificationGroupAndVerify(context,draft,members.data.value||[]))}
function saved(){if(created)void router.push('/notification-groups/'+encodeURIComponent(created))}
</script>
<template><AsyncState :forbidden="!manage"><NotificationGroupCreationForm v-if="manage" :project-id="projectId" :can-manage="manage" :members="members.data.value||[]" :member-loading="members.loading.value" :member-error="members.error.value" :save="save" @retry-members="members.reload" @saved="saved" @cancel="router.push('/notification-groups')" /></AsyncState></template>
