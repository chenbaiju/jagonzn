<script setup lang="ts">
import {computed,ref,watch,onScopeDispose,toRaw} from 'vue'
import {can,projectId} from '@/core/session'
import {ApiError,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import {formatTime} from '@/core/time'
import CursorPager from '@/ui/CursorPager.vue'
import {canReadNextHistoryPage} from './history-page-budget'
import DeviceStateControls from './DeviceStateControls.vue'
import DeviceLearningResource from './DeviceLearningResource.vue'
import {Refresh} from '@element-plus/icons-vue'
import {readCommandNumberPage,readCommandDetail,type CommandRow} from './command-records-api'

const props=defineProps<{deviceId:string}>()
const emit=defineEmits<{busy:[value:boolean]}>()
const page=ref(1),limit=ref(24),selected=ref<CommandRow>(),denied=ref(false)
const allowed=computed(()=>can('device:control')&&!denied.value)
const records=useResource(signal=>readCommandNumberPage(projectId.value,props.deviceId,page.value,limit.value,signal))
const detail=useResource(signal=>{if(!selected.value)throw new Error('请重新选择命令');return readCommandDetail(projectId.value,selected.value,signal)})
function beforeClose(done:()=>void){close();done()}
function close(){selected.value=undefined;detail.clear()}
function clear(){close();records.clear();page.value=1}
function reset(){clear();if(allowed.value&&projectId.value&&props.deviceId)void records.reload()}
function reload(){if(!allowed.value)return;records.clear();void records.reload()}
function move(direction:1|-1){
 if(records.loading.value||!allowed.value)return
 if(direction===1){if(!records.data.value||!canReadNextHistoryPage(page.value,limit.value))return}
 else if(page.value<=1)return
 close();page.value+=direction;reload()
}
function show(row:CommandRow){if(!allowed.value||records.loading.value||!records.data.value?.items.some(item=>toRaw(item)===toRaw(row)))return;close();selected.value=Object.freeze({...row});void detail.reload()}
function refreshDetail(){if(!allowed.value||!selected.value)return;detail.clear();void detail.reload()}
watch(()=>[props.deviceId,projectId.value,can('device:control')],()=>{denied.value=false;reset()},{immediate:true,flush:'sync'})
watch([records.error,detail.error],errors=>{if(errors.some(error=>error instanceof ApiError&&error.status===403)){denied.value=true;clear()}})
const dispose=onIdentityChange(()=>{denied.value=false;clear()});onScopeDispose(dispose)
</script>
<template><section class="device-commands">
 <template v-if="allowed">
  <DeviceLearningResource kind="command" />
  <div class="tl-toolbar command-toolbar"><DeviceStateControls :key="`${projectId}-${deviceId}`" :device-id="deviceId" kind="command" @saved="reset" @busy="emit('busy',$event)" /><el-button size="small" class="source-small-button" plain :icon="Refresh" :loading="records.loading.value" @click="reset">刷新</el-button></div>
  <AsyncState :loading="records.loading.value" :error="records.error.value" @retry="reload">
   <el-table class="tl-device-detail-table" :data="records.data.value?.items" aria-label="命令记录" empty-text="暂无数据">
    <el-table-column label="命令标识符"><template #default="{row}">{{row.commandKey??'—'}}</template></el-table-column>
    <el-table-column label="命令名称"><template #default="{row}"><span title="当前定义名称；无法确认原定义时显示—，不代表受理时名称">{{row.currentDefinitionName??'—'}}</span></template></el-table-column>
    <el-table-column label="命令下发时间" width="180" align="center"><template #default="{row}">{{formatTime(row.dispatchedAt)}}</template></el-table-column>
    <el-table-column label="命令回复时间" width="180" align="center"><template #default="{row}">{{formatTime(row.repliedAt)}}</template></el-table-column>
    <el-table-column label="查看命令" width="150" align="center"><template #default="{row}"><el-button link type="primary" class="command-view-link" @click="show(row)">查看</el-button></template></el-table-column>
   </el-table>
  </AsyncState>
  <CursorPager :page="page" :limit="limit" :sizes="[24,48]" :show-sizes="false" :show-pages="false" :has-next="!!records.data.value&&canReadNextHistoryPage(page,limit)" :loading="records.loading.value" @next="move(1)" @previous="move(-1)" @update:limit="limit=$event;reset()" />
  <p v-if="records.data.value&&!canReadNextHistoryPage(page,limit)" role="status">已到达当前查询的分页上限。</p>
 </template>
 <p v-else class="command-forbidden" role="status">当前账号没有命令记录的读取权限</p>
 <el-dialog class="command-view-dialog" :model-value="!!selected&&allowed" title="查看命令" width="min(600px,94vw)" destroy-on-close :before-close="beforeClose">
  <div class="command-dialog-body"><AsyncState :loading="detail.loading.value" :error="detail.error.value" @retry="refreshDetail">
   <template v-if="detail.data.value"><dl class="command-details">
    <dt>命令标识符</dt><dd :title="detail.data.value.currentDefinitionName?'当前定义名称：'+detail.data.value.currentDefinitionName:'无法确认原定义名称'">{{detail.data.value.commandKey??'—'}}</dd>
    <dt>命令 ID</dt><dd>{{detail.data.value.id}}</dd>
    <dt>命令下发参数</dt><dd><pre>{{detail.data.value.inputText}}</pre></dd>
    <dt>命令回复参数</dt><dd><pre v-if="detail.data.value.outputText!==null">{{detail.data.value.outputText}}</pre><span v-else>无</span></dd>
    <dt>命令下发时间</dt><dd>{{formatTime(detail.data.value.dispatchedAt)}}</dd>
    <dt>命令回复时间</dt><dd>{{formatTime(detail.data.value.repliedAt)}}</dd>
   </dl></template>
  </AsyncState></div>
 </el-dialog>
</section></template>
<style scoped>
.command-view-link{color:#1e88e5}.command-view-link:hover{color:#409eff}.source-small-button{height:32px;padding:9px 15px;font-size:12px;line-height:1;border-radius:3px;}.source-small-button :deep(.el-icon+span){margin-left:5px;}.command-dialog-body{max-height:60vh;overflow:auto;padding-top:14px;}.command-toolbar{justify-content:space-between;gap:12px;}.command-details{margin:0;overflow-wrap:anywhere;}.command-details dt{color:var(--tl-muted);margin:18px 0 4px;}.command-details dt:first-child{margin-top:0;}.command-details dd{margin:0;color:#002822;}.command-details pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:20px;margin:0;padding:7px 8px;background:#262626;color:#fff;max-height:240px;overflow:auto;}.command-forbidden{text-align:center;padding:44px 20px;color:var(--tl-muted);}
</style>
