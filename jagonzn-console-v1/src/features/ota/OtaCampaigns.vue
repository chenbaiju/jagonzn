<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError} from '@/core/http'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import {campaignStatusLabel} from '../../../../../things-link-console/src/features/ota/campaign-model'
import {otaCampaignTransport,type OtaCampaignTransport} from './ota-campaign-api'
import CampaignCreate from './OtaCampaignCreate.vue'
import CampaignDetail from './OtaCampaignDetail.vue'
const props=withDefaults(defineProps<{transport?:OtaCampaignTransport}>(),{transport:()=>otaCampaignTransport})
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&!!projectId.value&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const writable=computed(()=>readable.value&&can('ota:deploy')&&currentProject.value?.status==='ACTIVE')
const page=ref(1),cursors=ref<(string|undefined)[]>([undefined]),selected=ref(''),creating=ref(false),createLocked=ref(false),detailLocked=ref(false),locked=computed(()=>createLocked.value||detailLocked.value)
const resource=useResource(signal=>props.transport.list(projectId.value,cursors.value[page.value-1],signal))
const forbidden=computed(()=>!readable.value||resource.error.value instanceof ApiError&&[401,403].includes(resource.error.value.status))
function load(){if(!readable.value||locked.value||resource.loading.value)return;selected.value='';resource.clear();void resource.reload()}
function reset(){creating.value=false;selected.value='';createLocked.value=false;detailLocked.value=false;page.value=1;cursors.value=[undefined];resource.clear();if(readable.value)void resource.reload()}
function turn(value:number){if(locked.value||resource.loading.value||!readable.value||value<1)return;if(value===page.value+1){if(!resource.data.value?.hasMore||!resource.data.value.nextCursor)return;cursors.value[value-1]=resource.data.value.nextCursor}else if(value!==page.value-1)return;page.value=value;load()}
function show(id:string){if(!locked.value&&readable.value&&resource.data.value?.items.some(row=>row.id===id))selected.value=id}
function created(id:string){creating.value=false;createLocked.value=false;selected.value=id;page.value=1;cursors.value=[undefined];resource.clear();void resource.reload()}
function changed(){if(readable.value)void resource.reload()}
onBeforeRouteLeave(()=>!locked.value);onBeforeRouteUpdate(()=>!locked.value)
function beforeUnload(event:BeforeUnloadEvent){if(locked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload))
watch([()=>projectId.value,()=>session.user?.accountId,()=>readable.value,()=>props.transport],reset,{immediate:true,flush:'sync'})
watch(resource.error,value=>{if(value instanceof ApiError&&[401,403,404].includes(value.status)){selected.value='';creating.value=false;createLocked.value=false;detailLocked.value=false}},{flush:'sync'})
</script>
<template><section class="ota-campaigns"><header><h1>升级活动</h1><div><el-button v-if="writable" type="primary" size="small" :disabled="locked" @click="creating=true">创建升级活动</el-button><el-button size="small" :disabled="!readable||locked" :loading="resource.loading.value" @click="reset">刷新活动列表</el-button></div></header><p class="help">从已就绪的发布固件创建固定计划，再明确排程和启动。活动状态、通知意图、作业成功与真实设备安装分别确认。当前角色需具备活动管理权限。</p>
 <AsyncState :forbidden="forbidden" :loading="resource.loading.value" :error="resource.error.value" :empty="resource.data.value?.items.length===0" empty-text="当前项目尚无升级活动" @retry="load"><template v-if="resource.data.value"><p role="status">第 {{page}} 页 · 本页 {{resource.data.value.items.length}} 个活动</p><el-table :data="resource.data.value.items" row-key="id"><el-table-column label="活动状态" width="110"><template #default="{row}">{{campaignStatusLabel(row.status)}}</template></el-table-column><el-table-column prop="id" label="活动ID" min-width="220"/><el-table-column prop="firmwareId" label="固件ID" min-width="220"/><el-table-column prop="targetCount" label="冻结目标" width="90"/><el-table-column prop="batchCount" label="批次" width="70"/><el-table-column label="创建时间" min-width="165"><template #default="{row}">{{formatTime(row.createdAt)}}</template></el-table-column><el-table-column label="操作" width="90"><template #default="{row}"><el-button link type="primary" :disabled="locked" @click="show(row.id)">活动详情</el-button></template></el-table-column></el-table><CursorPager :page="page" :limit="20" :has-next="resource.data.value.hasMore" :loading="resource.loading.value||locked" :show-sizes="false" :show-pages="false" @update:page="turn"/></template></AsyncState>
 <el-drawer :model-value="creating&&writable" title="创建升级活动草稿" size="min(640px,96vw)" :close-on-click-modal="false" :close-on-press-escape="!createLocked" :show-close="!createLocked" @close="!createLocked&&(creating=false)" destroy-on-close><CampaignCreate v-if="creating&&writable" :transport="transport" @locked="createLocked=$event" @close="creating=false" @saved="created"/></el-drawer>
 <el-drawer :model-value="!!selected&&readable" title="升级活动详情" size="min(1100px,96vw)" :close-on-click-modal="false" :close-on-press-escape="!detailLocked" :show-close="!detailLocked" @close="!detailLocked&&(selected='')" destroy-on-close><CampaignDetail v-if="selected&&readable" :key="selected" :campaign-id="selected" :transport="transport" @locked="detailLocked=$event" @changed="changed"/></el-drawer>
</section></template>
<style scoped>.ota-campaigns>header{display:flex;align-items:center;justify-content:space-between;gap:16px}.ota-campaigns h1{font-size:24px;font-weight:500;margin:0}.help{font-size:12px;line-height:1.7;color:var(--tl-muted)}@media(max-width:600px){.ota-campaigns>header{align-items:flex-start;flex-direction:column}}</style>
