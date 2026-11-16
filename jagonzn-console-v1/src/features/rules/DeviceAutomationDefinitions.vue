<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {InfoFilled,Refresh} from '@element-plus/icons-vue'
import {can,hasMenu,projectId} from '@/core/session'
import {onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import {deviceAutomationApi} from './device-automation-api'
import {blankAutomationFilters,deviceAutomationPage,deviceAutomationHistory,type DeviceAutomation,type DeviceAutomationExecution,type DeviceAutomationPort} from './device-automation-port'
const props=defineProps<{deviceId:string;transport?:DeviceAutomationPort}>()
const transport=computed(()=>props.transport??deviceAutomationApi),manage=computed(()=>can('rule:manage')),read=computed(()=>can('rule:read'))
const mode=ref<'definitions'|'history'>(manage.value?'definitions':'history'),limit=ref(24),filters=ref(blankAutomationFilters()),applied=ref(blankAutomationFilters()),cursors=ref<(string|undefined)[]>([undefined]),selected=ref<DeviceAutomationExecution>()
const allowed=computed(()=>!!projectId.value&&!!props.deviceId&&(mode.value==='definitions'?manage.value:read.value))
const resource=useResource(async signal=>mode.value==='definitions'
 ?{kind:'definitions' as const,...deviceAutomationPage(await transport.value.definitions(projectId.value,props.deviceId,{...applied.value},cursors.value.at(-1),limit.value,signal),cursors.value,limit.value)}
 :{kind:'history' as const,...deviceAutomationHistory(await transport.value.history(projectId.value,props.deviceId,cursors.value.at(-1),limit.value,signal),cursors.value,limit.value)})
const definitions=computed(()=>resource.data.value?.kind==='definitions'?resource.data.value.items:[]),history=computed(()=>resource.data.value?.kind==='history'?resource.data.value.items:[])
const filtered=computed(()=>Object.values(applied.value).some(Boolean))
const triggerLabels:Record<DeviceAutomation['triggerType'],string>={PROPERTY_REPORTED:'属性上报',PROPERTY_CHANGED:'设备属性变化',MIXED:'混合触发',ONE_SHOT:'一次性计划',CRON:'周期计划'}
function reset(reload=true){resource.clear();selected.value=undefined;cursors.value=[undefined];if(reload&&allowed.value)void resource.reload()}
function search(){if(!allowed.value)return;applied.value={...filters.value};reset()}
function resize(value:number){if(![24,48].includes(value)||value===limit.value)return;limit.value=value;reset()}
function next(){const cursor=resource.data.value?.nextCursor;if(!allowed.value||resource.loading.value||!cursor)return;cursors.value.push(cursor);selected.value=undefined;resource.clear();void resource.reload()}
function previous(){if(!allowed.value||resource.loading.value||cursors.value.length<2)return;cursors.value.pop();selected.value=undefined;resource.clear();void resource.reload()}
watch([projectId,()=>props.deviceId,manage,read,mode],()=>{
 filters.value=blankAutomationFilters();applied.value=blankAutomationFilters();resource.clear();selected.value=undefined
 if(!manage.value&&mode.value==='definitions'){mode.value='history';return}reset()
},{immediate:true})
onScopeDispose(onIdentityChange(()=>{filters.value=blankAutomationFilters();applied.value=blankAutomationFilters();reset(false)}))
</script>
<template><section class="device-automation-definitions">
 <div class="tl-learning-resource"><el-icon aria-hidden="true"><InfoFilled/></el-icon><span>学习资源：<a href="https://www.thingscloud.xyz/docs/guide/automations/overview.html" target="_blank" rel="noopener noreferrer">什么是自动化？ ↗</a></span></div>
 <div class="automation-modes"><el-radio-group v-model="mode" aria-label="自动化读取内容"><el-radio-button value="definitions" :disabled="!manage">关联定义</el-radio-button><el-radio-button value="history" :disabled="!read">执行历史</el-radio-button></el-radio-group></div>
 <form v-if="allowed" class="automation-toolbar" @submit.prevent="search">
  <div v-if="mode==='definitions'" class="automation-filters">
   <el-select v-model="filters.status" size="small" :empty-values="[null,undefined]" aria-label="自动化状态" @change="search"><el-option value="" label="全部状态"/><el-option value="ACTIVE" label="已启用"/><el-option value="PAUSED" label="未启用"/></el-select>
   <el-select v-model="filters.usage" size="small" :empty-values="[null,undefined]" aria-label="自动化用途" @change="search"><el-option value="" label="全部用途"/><el-option value="CONTEXT" label="触发/执行上下文"/><el-option value="CONDITION_INPUT" label="包含输入条件"/><el-option value="DEVICE_ACTION" label="设备命令或属性动作"/></el-select>
   <el-input v-model="filters.keyword" size="small" clearable maxlength="128" aria-label="自动化名称或描述" placeholder="搜索名称/描述" @clear="search"/>
   <el-button size="small" native-type="submit">搜索</el-button>
  </div>
  <div class="automation-actions"><el-button size="small" :icon="Refresh" :loading="resource.loading.value" @click="search">刷新</el-button><router-link v-if="hasMenu('RuleAutomations')" :to="{path:'/rules/automations'}">查看全部自动化</router-link></div>
 </form>
 <AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="search">
  <template v-if="mode==='definitions'">
   <div v-if="resource.data.value&&!definitions.length" class="automation-empty"><img src="/reference/empty-content.png" alt=""/><h2>{{filtered?'没有符合条件的自动化':'让设备自动响应业务事件'}}</h2><p>当前设备尚无匹配的已发布自动化。这里展示触发或执行设备上下文，包含暂停的定义。</p></div>
   <div v-else class="automation-cards"><article v-for="row in definitions" :key="row.id" class="automation-card"><header><h3>{{row.name}}</h3><span>{{row.status==='ACTIVE'?'已启用':'未启用'}}</span></header><p>{{row.description||'未填写描述'}}</p><p class="tl-muted">{{triggerLabels[row.triggerType]}} · 版本 {{row.versionNumber}}</p><div class="automation-uses"><el-tag size="small" type="info">触发/执行上下文</el-tag><el-tag v-if="row.usesConditionInput" size="small" type="info">包含输入条件</el-tag><el-tag v-if="row.hasDeviceAction" size="small" type="info">设备命令或属性动作</el-tag></div><p v-if="row.usesConditionInput" class="tl-muted">{{row.triggerType==='PROPERTY_REPORTED'?'条件基于本次属性上报':row.triggerType==='PROPERTY_CHANGED'?'条件基于本次属性变化':'条件基于配置输入，不读取设备当前属性'}}</p></article></div>
  </template>
  <template v-else><p class="tl-muted">执行状态表示自动化处理结果；DISPATCHED 不代表设备执行成功。</p><el-table :data="history" empty-text="暂无自动化执行记录"><el-table-column prop="id" label="执行ID" min-width="220"/><el-table-column prop="status" label="状态" min-width="140"/><el-table-column label="创建时间" min-width="180"><template #default="{row}">{{formatTime(row.createdAt)}}</template></el-table-column><el-table-column label="详情" width="80"><template #default="{row}"><el-button link type="primary" @click="selected=row">查看</el-button></template></el-table-column></el-table></template>
  <CursorPager v-if="resource.data.value&&(resource.data.value.items.length||cursors.length>1)" :page="cursors.length" :has-next="resource.data.value.hasMore" :limit="limit" :sizes="[24,48]" :loading="resource.loading.value" @next="next" @previous="previous" @update:limit="resize"/>
 </AsyncState>
 <el-dialog :model-value="!!selected" title="自动化执行记录" width="min(720px,94vw)" destroy-on-close @close="selected=undefined"><pre>{{JSON.stringify(selected,null,2)}}</pre></el-dialog>
</section></template>
<style scoped>
.automation-modes{margin:16px 0}.automation-toolbar,.automation-filters,.automation-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.automation-toolbar{justify-content:space-between}.automation-filters .el-select{width:150px}.automation-filters .el-select:nth-child(2){width:180px}.automation-filters .el-input{width:220px}.automation-cards{display:grid;grid-template-columns:1fr;gap:10px;margin-top:20px}.automation-card{border:1px solid var(--tl-border);padding:16px 20px;min-width:0}.automation-card header{display:flex;justify-content:space-between;gap:12px;align-items:start}.automation-card h3{font-size:16px;margin:0;overflow-wrap:anywhere}.automation-card header span{white-space:nowrap;color:#888;font-size:12px}.automation-card p{overflow-wrap:anywhere}.automation-uses{display:flex;gap:6px;flex-wrap:wrap}.automation-empty{text-align:center;padding:60px 20px}.automation-empty img{width:160px}.automation-empty h2{font-size:26px;font-weight:400;color:#002822;line-height:36px;margin:20px 0 0}.automation-empty p{font-size:14px;line-height:22px;color:#999;max-width:680px;margin:12px auto 20px}.device-automation-definitions pre{white-space:pre-wrap;overflow-wrap:anywhere}
@media(min-width:768px){.automation-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:992px){.automation-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:1920px){.automation-cards{grid-template-columns:repeat(4,minmax(0,1fr))}}
</style>
