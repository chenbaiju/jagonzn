<script setup lang="ts">
import {computed,ref,watch,onScopeDispose,toRaw} from 'vue'
import {can,projectId} from '@/core/session'
import {ApiError,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import {canReadNextHistoryPage} from './history-page-budget'
import DeviceLearningResource from './DeviceLearningResource.vue'
import {Refresh} from '@element-plus/icons-vue'
import type {DeviceEventItem} from './event-decoder'
import {readEventNumberPage,readEventDetail,readEventChoices,type EventFilters} from './event-records-api'
const props=defineProps<{deviceId:string}>()
const eventKey=ref(''),applied=ref<EventFilters>(Object.freeze({eventKey:''})),page=ref(1),limit=ref(24),selected=ref<DeviceEventItem>(),denied=ref(false)
const allowed=computed(()=>can('device:read')&&!denied.value)
const records=useResource(signal=>readEventNumberPage(projectId.value,props.deviceId,applied.value,page.value,limit.value,signal))
const choices=useResource(signal=>readEventChoices(projectId.value,props.deviceId,signal))
const detail=useResource(signal=>{if(!selected.value)throw new Error('请重新选择事件');return readEventDetail(projectId.value,props.deviceId,selected.value,signal)})
function beforeClose(done:()=>void){close();done()}
function close(){selected.value=undefined;detail.clear()}
function clear(){close();records.clear();page.value=1}
function reload(){if(!allowed.value)return;records.clear();void records.reload()}
function reset(){clear();if(allowed.value&&projectId.value&&props.deviceId)void records.reload()}
function query(){applied.value=Object.freeze({eventKey:eventKey.value||''});reset()}
function refresh(){reset();choices.clear();if(allowed.value)void choices.reload()}
function scope(){denied.value=false;eventKey.value='';applied.value=Object.freeze({eventKey:''});choices.clear();reset();if(allowed.value&&projectId.value&&props.deviceId)void choices.reload()}
function move(direction:1|-1){
 if(records.loading.value||!allowed.value)return
 if(direction===1){if(!records.data.value||!canReadNextHistoryPage(page.value,limit.value))return}
 else if(page.value<=1)return
 close();page.value+=direction;reload()
}
function show(row:DeviceEventItem){if(!allowed.value||records.loading.value||!records.data.value?.items.some(item=>toRaw(item)===toRaw(row)))return;close();selected.value=row;void detail.reload()}
function refreshDetail(){if(!allowed.value||!selected.value)return;detail.clear();void detail.reload()}
watch(()=>[props.deviceId,projectId.value,can('device:read')],scope,{immediate:true,flush:'sync'})
watch([records.error,detail.error],errors=>{if(errors.some(error=>error instanceof ApiError&&error.status===403)){denied.value=true;clear();choices.clear()}})
const dispose=onIdentityChange(()=>{clear();choices.clear();eventKey.value='';applied.value=Object.freeze({eventKey:''})});onScopeDispose(dispose)
</script>
<template><section class="device-events">
 <template v-if="allowed">
  <DeviceLearningResource kind="event" />
  <div class="tl-toolbar event-toolbar"><el-select v-model="eventKey" aria-label="事件筛选" size="small" clearable :loading="choices.loading.value" style="width:150px" placeholder="所有事件" @change="query"><el-option label="所有事件" value=""/><el-option v-for="key in choices.data.value" :key="key" :value="key" :label="key" /></el-select><el-button size="small" class="source-small-button" plain :icon="Refresh" :loading="records.loading.value" @click="refresh">刷新</el-button></div>
  <AsyncState v-if="choices.error.value" :error="choices.error.value" @retry="choices.reload" />
  <AsyncState :loading="records.loading.value" :error="records.error.value" @retry="reload"><el-table class="tl-device-detail-table" :data="records.data.value?.items" aria-label="事件记录" empty-text="暂无数据"><el-table-column prop="eventKey" label="事件标识符" /><el-table-column label="事件名称"><template #default="{row}"><span title="当前定义名称；无法确认原定义身份时显示—，不按同键新对象回填">{{row.currentDefinitionName??'—'}}</span></template></el-table-column><el-table-column label="事件上报时间" width="200"><template #default="{row}">{{formatTime(row.occurredAt)}}</template></el-table-column><el-table-column label="查看事件" width="100" align="center"><template #default="{row}"><el-button link @click="show(row)">查看</el-button></template></el-table-column></el-table></AsyncState>
  <CursorPager :page="page" :limit="limit" :show-sizes="false" :show-pages="false" :has-next="!!records.data.value&&canReadNextHistoryPage(page,limit)" :loading="records.loading.value" @next="move(1)" @previous="move(-1)" @update:limit="limit=$event;reset()" />
  <p v-if="records.data.value&&!canReadNextHistoryPage(page,limit)" role="status">已到达当前查询的分页上限。</p>
 </template><p v-else class="event-forbidden" role="status">当前账号没有事件记录的读取权限</p>
 <el-dialog :model-value="!!selected&&allowed" title="查看事件" width="min(600px,94vw)" destroy-on-close :before-close="beforeClose"><div class="event-dialog-body"><AsyncState :loading="detail.loading.value" :error="detail.error.value" @retry="refreshDetail"><dl v-if="detail.data.value" class="event-details"><dt>事件名称</dt><dd>{{detail.data.value.currentDefinitionName??'—'}}</dd><dt>事件消息</dt><dd><pre>{{detail.data.value.paramsText}}</pre><p v-if="detail.data.value.paramsRedacted" class="event-redacted">部分参数已隐藏</p></dd><dt>事件上报时间</dt><dd>{{formatTime(detail.data.value.occurredAt)}}</dd></dl></AsyncState></div><template #footer><el-button type="primary" @click="close">关闭</el-button></template></el-dialog>
</section></template>
<style scoped>.source-small-button{height:32px;padding:9px 15px;font-size:12px;line-height:1;border-radius:3px;}.source-small-button :deep(.el-icon+span){margin-left:5px;}.event-toolbar{justify-content:space-between;gap:12px;}.event-dialog-body{max-height:60vh;overflow:auto;}.event-details{margin:0;overflow-wrap:anywhere;}.event-details dt{color:var(--tl-muted);margin:18px 0 6px;}.event-details dt:first-child{margin-top:0;}.event-details dd{margin:0;}.event-details pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.6;margin:0;padding:12px;background:var(--tl-fill);max-height:240px;overflow:auto;}.event-redacted{color:var(--tl-muted);font-size:12px;}.event-forbidden{text-align:center;padding:44px 20px;color:var(--tl-muted);}</style>
