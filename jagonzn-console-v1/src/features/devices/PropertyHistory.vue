<script setup lang="ts">
import {ref,watch,onScopeDispose} from 'vue'
import {ArrowLeft,ArrowRight,Download,Plus} from '@element-plus/icons-vue'
import {projectId} from '@/core/session'
import {ApiError,onIdentityChange} from '@/core/http'
import PropertyHistoryExport from './PropertyHistoryExport.vue'
import EastEightDateTimeInput from './HistoryRemovalDateTimeInput.vue'
import {useEastEightRange} from './device-civil-time'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import {devicesApi} from './api'
import {propertyObservations} from './property-observations-api'
import {decodePropertyObservations,observationWindow,defaultObservationWindow,type ObservationQuery,type ObservationSource} from './property-observations-json'
import AsyncState from '@/ui/AsyncState.vue'
const props=defineProps<{deviceId:string;propertyKey:string;modelVersionId?:string;propertyName?:string;dataType?:string}>(),emit=defineEmits<{close:[];unavailable:[cause:unknown]}>()
const exporting=ref(false)
const initialWindow=defaultObservationWindow(),range=ref<[Date,Date]>([new Date(initialWindow.from),new Date(initialWindow.to)]),source=ref<ObservationSource|''>(''),includeActor=ref(false),page=ref(1),cursors=ref<Array<string|undefined>>([undefined])
const {draft:dateDraft,dirty:dateDirty,edit:editDraft,parse:parseDates,reset:resetDateDrafts}=useEastEightRange(range)
const resource=useResource(async signal=>{
 if(dateDirty.value)range.value=parseDates()
 const project=projectId.value,device=props.deviceId,property=props.propertyKey,cursor=cursors.value[page.value-1]
 const queryFrom=range.value?.[0]?.toISOString(),queryTo=range.value?.[1]?.toISOString(),actor=includeActor.value,kind=source.value
 try{if(!queryFrom||!queryTo)throw new Error();observationWindow(queryFrom,queryTo)}catch{throw new Error('请选择含时区且起点早于终点的有效时间')}
 let model=props.modelVersionId
 if(!model){const binding=await devicesApi.binding(project,device,signal);if(binding.deviceId!==device||!binding.version?.id)throw new Error('设备当前物模型不可用，请刷新设备信息');model=binding.version.id}
 const query:ObservationQuery={project,device,model:model!,property,source:kind||undefined,from:queryFrom!,to:queryTo!,limit:20,includeActor:actor}
 return {...decodePropertyObservations(await propertyObservations(query,cursor,signal),query),modelVersionId:query.model}
})
function load(){exporting.value=false;resource.clear();if(projectId.value)void resource.reload()}
function search(){page.value=1;cursors.value=[undefined];load()}
function editDate(index:0|1,value:string|undefined){editDraft(index,value);exporting.value=false;resource.clear()}
function changeDates(){try{range.value=parseDates();search()}catch(cause){exporting.value=false;resource.clear();resource.error.value=cause}}
let resettingScope=false
watch(()=>[projectId.value,props.deviceId,props.propertyKey],()=>{resetDateDrafts();resettingScope=true;includeActor.value=false;source.value='';resettingScope=false;search()},{immediate:true})
watch([includeActor,source],()=>{if(!resettingScope)search()},{flush:'sync'})
function next(){if(!resource.loading.value&&resource.data.value?.nextCursor){cursors.value[page.value]=resource.data.value.nextCursor;page.value++;load()}}
function previous(){if(!resource.loading.value&&page.value>1){page.value--;load()}}
function unavailable(cause:unknown){exporting.value=false;resource.clear();resource.error.value=cause}
watch(resource.error,cause=>{if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){exporting.value=false;emit('unavailable',cause)}})
watch(()=>props.modelVersionId,(next,previous)=>{if(next!==previous){exporting.value=false;resource.clear();emit('close')}})
watch(()=>props.dataType,()=>{exporting.value=false})
const disposeHistoryIdentity=onIdentityChange(()=>{exporting.value=false;emit('close')});onScopeDispose(disposeHistoryIdentity)
// 三筛选项已由公开交付脚本核对；表格另两来源标签仍按真实消息语义描述，不把它们当当前定义流向。
function sourceName(source:ObservationSource){return {DEVICE_REPORT:'设备上报',PLATFORM_DOWNLINK:'属性下发',PLATFORM_CLOUD_UPDATE:'云端属性更新'}[source]}
</script>
<template><el-dialog :model-value="true" class="property-history-dialog" title="属性历史数据" width="960px" @close="emit('close')"><div class="history-tools"><div class="history-filters"><div class="history-date-range" aria-label="东八区时间范围"><EastEightDateTimeInput :model-value="dateDraft[0]" size="small" :clearable="false" placeholder="开始时间" @update:model-value="editDate(0,$event)" @change="changeDates"/><span>至</span><EastEightDateTimeInput :model-value="dateDraft[1]" size="small" :clearable="false" placeholder="结束时间" @update:model-value="editDate(1,$event)" @change="changeDates"/></div><el-select v-model="source" aria-label="历史属性类型" placeholder="不限属性类型" size="small" class="history-source-select" style="width:140px"><el-option label="不限属性类型" value=""/><el-option label="属性上报" value="DEVICE_REPORT"/><el-option label="属性下发" value="PLATFORM_DOWNLINK"/><el-option label="云端更新" value="PLATFORM_CLOUD_UPDATE"/></el-select></div><div class="history-actions"><el-tooltip content="属性历史加入看板尚未接入"><span><el-button type="primary" plain size="small" :icon="Plus" disabled>加入看板</el-button></span></el-tooltip><el-button v-if="['NUMBER','TEXT','SWITCH','ENUM'].includes(dataType||'')" size="small" :icon="Download" :disabled="dateDirty||resource.loading.value||!!resource.error.value||!resource.data.value" @click="exporting=true">导出</el-button><el-button size="small" @click="search">刷新</el-button></div></div><div class="history-actor"><el-tooltip content="显示当前已记录的控制台操作账号"><el-checkbox v-model="includeActor">显示操作用户</el-checkbox></el-tooltip></div><AsyncState :loading="resource.loading.value" :error="resource.error.value" :empty="!resource.data.value?.items.length" @retry="load"><el-table :data="resource.data.value?.items"><el-table-column label="时间" min-width="180"><template #default="{row}"><el-tooltip :content="row.timeKind==='PLATFORM_ACCEPTED'?'平台受理时间':'设备采集时间'"><span>{{formatTime(row.at)}}</span></el-tooltip></template></el-table-column><el-table-column prop="propertyKey" label="属性" min-width="130"/><el-table-column prop="valueText" label="值" min-width="180" align="center"/><el-table-column label="属性类型" width="120" align="center"><template #default="{row}"><span class="history-source-tag" :class="`is-${row.sourceKind}`">{{sourceName(row.sourceKind)}}</span></template></el-table-column><el-table-column v-if="includeActor" label="操作用户" width="120"><template #default="{row}"><el-tooltip v-if="row.actorId" content="控制台账号"><span>{{row.actorDisplayName||'—'}}</span></el-tooltip><span v-else>—</span></template></el-table-column></el-table></AsyncState><nav class="history-pager" aria-label="属性历史分页"><el-button class="history-pager__button" size="small" :icon="ArrowLeft" aria-label="上一页" :disabled="page<=1||resource.loading.value" @click="previous"/><span class="history-pager__page" aria-current="page" :aria-label="`第 ${page} 页`">{{page}}</span><el-button class="history-pager__button" size="small" :icon="ArrowRight" aria-label="下一页" :disabled="!resource.data.value?.hasMore||resource.loading.value" @click="next"/></nav><PropertyHistoryExport v-if="exporting&&resource.data.value&&!dateDirty" :device-id="deviceId" :property-key="propertyKey" :model-version-id="resource.data.value.modelVersionId" :from="range[0].toISOString()" :to="range[1].toISOString()" :property-name="propertyName" @close="exporting=false" @unavailable="unavailable"/></el-dialog></template>
<style scoped>:global(.el-dialog.property-history-dialog){max-width:calc(100vw - 32px);}.history-source-select :deep(.el-select__wrapper){min-height:33px;font-size:13px;padding-left:15px}.history-source-tag{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:4px;font-size:12px;color:#fff;background:#7957d5}.history-source-tag.is-PLATFORM_DOWNLINK{background:#409eff}.history-source-tag.is-PLATFORM_CLOUD_UPDATE{background:#67c23a}.history-tools{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px;}.history-filters{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0;}.history-actions{display:flex;align-items:center;gap:12px;}.history-actions>.el-button{margin-left:0;}.history-actor{display:flex;justify-content:flex-end;margin:12px 0 8px;}.history-date-range{display:flex;align-items:center;gap:6px;flex:0 1 360px;width:360px;max-width:100%;min-width:0;}.history-date-range :deep(.history-civil-input){flex:1;min-width:0;max-width:none;}.history-date-range>span{font-size:12px;color:var(--tl-muted);}.history-date-range :deep(.el-input__inner){font-size:12px;}.history-pager{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:24px;}.history-pager__button{width:28px;height:28px;min-width:28px;padding:0;margin:0;border:0;border-radius:2px;background:var(--tl-fill);color:var(--tl-text);}.history-pager__button:disabled{color:var(--tl-input-border);}.history-pager__page{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}@media(max-width:640px){.history-date-range{flex-direction:column;align-items:stretch;flex-basis:100%;width:100%;gap:6px;}.history-date-range>span{align-self:center;}.history-date-range :deep(.history-civil-input){width:100%;flex:auto;}}</style>
