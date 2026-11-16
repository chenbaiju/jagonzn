<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {ApiError} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {formatTime} from '@/core/time'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {otaReadTransport,type OtaReadTransport,type OtaReadPage,type OtaFirmware,type OtaFirmwareDirectoryPage} from './ota-read-api'
import {validOtaName} from './ota-management-metadata-api'
import TaskChoiceSelect from '../rules/TaskChoiceSelect.vue'
import FirmwareDetail from './OtaFirmwareDetail.vue'
import FirmwareCreate from './OtaFirmwareCreate.vue'
const props=withDefaults(defineProps<{transport?:OtaReadTransport}>(),{transport:()=>otaReadTransport})
const roles=['OWNER','ADMIN','OPERATOR','VIEWER'],readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const directoryAllowed=computed(()=>readable.value&&can('ota:read')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const keyword=ref(''),appliedKeyword=ref(''),filterError=ref('')
const typeIds=ref<string[]>([]),enabled=ref<''|'true'|'false'>(''),order=ref<'ASC'|'DESC'>('DESC')
const uploading=ref(false),creating=ref(false),createLocked=ref(false),canCreate=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&can('ota:read')&&can('ota:deploy')&&can('device:read')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
function closeCreate(){if(createLocked.value)return;creating.value=false}
function clearCreate(){creating.value=false;createLocked.value=false}
async function created(id:string){const project=projectId.value,account=session.user?.accountId;clearCreate();cursors.value=[undefined];page.value=1;resource.clear();await resource.reload();if(readable.value&&projectId.value===project&&session.user?.accountId===account)selected.value=id}
onBeforeRouteLeave(()=>!createLocked.value&&!uploading.value);onBeforeRouteUpdate(()=>!createLocked.value&&!uploading.value)
const cursors=ref<(string|undefined)[]>([undefined]),page=ref(1),selected=ref('')
const resource=useResource<OtaReadPage<OtaFirmware>|OtaFirmwareDirectoryPage>(signal=>directoryAllowed.value
 ?props.transport.directory(projectId.value,{deviceTypeId:typeIds.value[0],enabled:enabled.value===''?undefined:enabled.value==='true',keyword:appliedKeyword.value||undefined,order:order.value,cursor:cursors.value[page.value-1],limit:20},signal)
 :props.transport.list(projectId.value,cursors.value[page.value-1],signal))
const rows=computed(()=>resource.data.value?.items.map(item=>'firmware' in item?{...item.firmware,management:item.metadata,enablement:item.enablement}:{...item,management:null,enablement:null})??[])
const total=computed(()=>directoryAllowed.value&&resource.data.value&&'total' in resource.data.value?resource.data.value.total:undefined)
const forbidden=computed(()=>!readable.value||resource.error.value instanceof ApiError&&[401,403].includes(resource.error.value.status))
function load(){if(uploading.value||createLocked.value||!readable.value||resource.loading.value)return;selected.value='';resource.clear();void resource.reload()}
function reset(){clearCreate();uploading.value=false;resource.clear();cursors.value=[undefined];page.value=1;selected.value='';if(readable.value)void resource.reload()}
function turn(next:number){if(uploading.value||createLocked.value||resource.loading.value||!readable.value||next<1||!Number.isSafeInteger(next))return;if(next===page.value+1){if(!resource.data.value?.hasMore||!resource.data.value.nextCursor)return;cursors.value[next-1]=resource.data.value.nextCursor}else if(next!==page.value-1)return;page.value=next;load()}
function refresh(){if(!uploading.value&&!createLocked.value)reset()}
function startCreate(){if(canCreate.value&&!uploading.value&&!createLocked.value)creating.value=true}
function closeDetail(){if(!uploading.value)selected.value=''}
function detail(id:string){if(!uploading.value&&!createLocked.value&&!creating.value&&readable.value&&!resource.loading.value&&rows.value.some(item=>item.id===id))selected.value=id}
function search(){if(!directoryAllowed.value||uploading.value||createLocked.value)return;if(keyword.value!==''&&!validOtaName(keyword.value)){filterError.value='搜索词最多128个字符，不能仅为空白';return}filterError.value='';appliedKeyword.value=keyword.value;reset()}
function removed(id:string){if(uploading.value||selected.value!==id)return;selected.value='';changed()}
function changed(){if(!readable.value)return;resource.clear();cursors.value=[undefined];page.value=1;void resource.reload()}
function filterType(ids:string[]){if(!directoryAllowed.value||uploading.value||createLocked.value||ids.length>1||ids.some(id=>!typeDeviceUuid.test(id)))return;typeIds.value=ids;reset()}
function filterEnabled(value:''|'true'|'false'){if(!directoryAllowed.value||uploading.value||createLocked.value||!['','true','false'].includes(value))return;enabled.value=value;reset()}
function sort(value:'ASC'|'DESC'){if(!directoryAllowed.value||uploading.value||createLocked.value||!['ASC','DESC'].includes(value))return;order.value=value;reset()}
let previousScope:readonly [string,string|undefined,OtaReadTransport]|undefined
function scopeChanged(){
 const sameScope=previousScope?.[0]===projectId.value&&previousScope?.[1]===session.user?.accountId&&previousScope?.[2]===props.transport
 previousScope=[projectId.value,session.user?.accountId,props.transport];typeIds.value=[];enabled.value='';order.value='DESC';keyword.value='';appliedKeyword.value='';filterError.value=''
 // 原合法成员读取仍可用；目录撤权不得卸载在途上传的原意图。
 if(sameScope&&(uploading.value||createLocked.value)){resource.clear();cursors.value=[undefined];page.value=1;return}
 reset()
}
watch([()=>projectId.value,()=>session.user?.accountId,()=>readable.value,()=>directoryAllowed.value,()=>props.transport],scopeChanged,{immediate:true,flush:'sync'})
</script>
<template><section class="ota-versions"><header><h1>OTA 版本</h1><el-button v-if="canCreate" type="primary" size="small" :disabled="createLocked||uploading" @click="startCreate">创建固件草稿</el-button><el-button size="small" :loading="resource.loading.value" :disabled="!readable||createLocked||uploading" @click="refresh">刷新版本列表</el-button></header>
 <p class="help">读取当前项目的固件版本。固件就绪、发布尝试、下载与设备安装结果是不同状态。</p>
 <form v-if="directoryAllowed" class="directory-filters" @submit.prevent="search"><label>版本名称或模块<el-input v-model="keyword" aria-label="OTA版本名称或模块关键词" placeholder="搜索版本名称或模块" maxlength="256" :disabled="uploading||createLocked"/></label><label>设备类型<TaskChoiceSelect :model-value="typeIds" kind="device-types" :multiple="false" :disabled="uploading||createLocked" @update:model-value="filterType"/></label><label>版本状态<el-select :model-value="enabled" aria-label="OTA状态筛选" placeholder="不限版本状态" :disabled="uploading||createLocked" @update:model-value="filterEnabled"><el-option value="" label="不限版本状态"/><el-option value="true" label="已启用"/><el-option value="false" label="未启用"/></el-select></label><label>创建时间<el-select :model-value="order" aria-label="OTA创建时间排序" :disabled="uploading||createLocked" @update:model-value="sort"><el-option value="DESC" label="从新到旧"/><el-option value="ASC" label="从旧到新"/></el-select></label><el-button native-type="submit" :disabled="uploading||createLocked">查询</el-button></form><p v-if="filterError" role="alert">{{filterError}}</p>
 <p v-if="resource.data.value" role="status">第 {{page}} 页 · 本页 {{resource.data.value.items.length}} 个版本<span v-if="total!==undefined"> · 共 {{total}} 个版本</span></p>
 <p class="help">可创建绑定已发布物模型的固件草稿。草稿详情可上传文件并提交签名发布；升级活动仍需另行创建。</p>
 <AsyncState :forbidden="forbidden" :loading="resource.loading.value" :error="resource.error.value" :empty="resource.data.value?.items.length===0" :empty-text="directoryAllowed?'没有符合条件的 OTA 固件版本':'当前项目尚无 OTA 固件版本'" @retry="load">
  <template v-if="resource.data.value"><el-table :data="rows" border><el-table-column v-if="directoryAllowed" label="版本名称" min-width="180"><template #default="{row}">{{row.management?.metadata?.name??'未设置'}}</template></el-table-column><el-table-column prop="firmwareVersion" label="固件版本"/><el-table-column v-if="directoryAllowed" label="版本状态" width="110"><template #default="{row}">{{row.enablement.enabled?'已启用':'未启用'}}</template></el-table-column><el-table-column prop="deviceTypeId" label="设备类型 ID" min-width="220"/><el-table-column label="创建时间" min-width="175"><template #default="{row}">{{formatTime(row.createdAt)}}</template></el-table-column><el-table-column label="操作" width="90"><template #default="{row}"><el-button link type="primary" :disabled="uploading||createLocked" @click="detail(row.id)">查看详情</el-button></template></el-table-column></el-table></template>
 </AsyncState>
 <CursorPager v-if="resource.data.value&&(resource.data.value.items.length||page>1)" :page="page" :limit="20" :has-next="resource.data.value.hasMore" :loading="resource.loading.value||uploading||createLocked" :show-sizes="false" :show-pages="false" @update:page="turn"/>
 <el-drawer :model-value="creating&&(canCreate||createLocked)" title="创建固件草稿" size="min(600px,96vw)" :close-on-click-modal="false" :close-on-press-escape="!createLocked" :show-close="!createLocked" @close="closeCreate" destroy-on-close><FirmwareCreate v-if="creating&&(canCreate||createLocked)" @locked="createLocked=$event" @close="closeCreate" @saved="created"/></el-drawer>
 <el-drawer :model-value="!!selected&&(readable||uploading)" title="OTA 固件详情" size="min(1000px,96vw)" :close-on-click-modal="false" :show-close="!uploading" :close-on-press-escape="!uploading" @close="closeDetail" destroy-on-close><FirmwareDetail v-if="selected" :key="selected" :firmware-id="selected" :transport="transport" @locked="uploading=$event" @changed="changed" @deleted="removed"/></el-drawer>
</section></template>
<style scoped>.ota-versions>header{display:flex;align-items:center;justify-content:space-between;gap:16px}.ota-versions h1{font-size:24px;font-weight:500;margin:0}.directory-filters{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;margin:18px 0}.directory-filters>label{display:grid;gap:6px;min-width:180px;font-size:12px}.directory-filters>label:first-child{width:300px;max-width:100%}.help{font-size:12px;line-height:20px;color:var(--tl-muted);overflow-wrap:anywhere}@media(max-width:600px){.ota-versions>header{align-items:flex-start;flex-direction:column}}</style>
