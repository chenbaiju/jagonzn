<script setup lang="ts">
import {computed,onScopeDispose,ref,watch,defineComponent,h,type Component} from 'vue'
import {Plus,Refresh,View,VideoPause,SwitchButton,Odometer,Document,Collection,Files,Box} from '@element-plus/icons-vue'
import {useRouter} from 'vue-router'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import DirectoryGlyph from '../devices/DirectoryGlyph.vue'
import {alarmLabel} from '../devices/page-alarm-status'
import {deviceListDisplayTransport,type DeviceListDisplayTransport} from './device-list-display-api'
import {useDeviceListDisplay} from './use-device-list-display'
import {readTypeDevices,typeDeviceUuid} from './type-devices-api'
import {readAdaptationBatch,adaptationStateLabel,type Adaptation} from '../devices/device-type-association-api'
import DeviceTypeAddDeviceDialog from './DeviceTypeAddDeviceDialog.vue'
import DeviceTypeRemoveDevicesDialog from './DeviceTypeRemoveDevicesDialog.vue'
const props=withDefaults(defineProps<{deviceTypeId:string;displayTransport?:DeviceListDisplayTransport}>(),{displayTransport:()=>deviceListDisplayTransport})
const emit=defineEmits<{locked:[value:boolean]}>()
const router=useRouter(),page=ref(1),limit=24,adding=ref(false),addingLocked=ref(false),removing=ref(false),removeLocked=ref(false),denied=ref(false)
const readable=computed(()=>!denied.value&&can('device:read')&&!!projectId.value&&!session.transitioning&&typeDeviceUuid.test(props.deviceTypeId))
const writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const resource=useResource(signal=>readTypeDevices(projectId.value,props.deviceTypeId,{page:page.value,limit},signal))
const display=useDeviceListDisplay({typeId:()=>props.deviceTypeId,readable:()=>readable.value,deviceIds:()=>resource.data.value?.items.map(row=>{if(typeof row.id!=='string'||!typeDeviceUuid.test(row.id))throw new Error('设备目录身份不符');return row.id})||[],transport:()=>props.displayTransport,unavailable:cause=>{resource.clear();resource.error.value=cause;if(cause instanceof ApiError&&[401,403].includes(cause.status))denied.value=true}})
const selected=ref<string[]>([]),adaptations=ref(new Map<string,Adaptation>()),adaptationError=ref('')
let adaptationController:AbortController|undefined
const selectedDevices=computed(()=>resource.data.value?.items.flatMap(row=>typeof row.id==='string'&&typeof row.name==='string'&&selected.value.includes(row.id)?[{id:row.id,name:row.name}]:[])||[])
const selectedAll=computed(()=>!!resource.data.value?.items.length&&selected.value.length===resource.data.value.items.length)
const selectedSome=computed(()=>selected.value.length>0&&!selectedAll.value)
const selectionLocked=computed(()=>!readable.value||locked.value||resource.loading.value)
function selectOne(id:string,checked:boolean){if(selectionLocked.value||!resource.data.value?.items.some(row=>row.id===id))return;selected.value=checked?[...selected.value.filter(value=>value!==id),id]:selected.value.filter(value=>value!==id)}
function selectAll(checked:boolean){if(!selectionLocked.value)selected.value=checked?(resource.data.value?.items.map(row=>row.id).filter((id):id is string=>typeof id==='string')||[]):[]}
const simTraffic=ref(false),simTrafficDraft=ref(false)
const simScope=computed(()=>readable.value&&session.user?.accountId?JSON.stringify([session.user.accountId,projectId.value,props.deviceTypeId]):'')
function simStorageKey(scope:string){return 'thingslink:type-device-sim-traffic:v1:'+scope}
watch(simScope,scope=>{let value=false;try{value=!!scope&&window.localStorage.getItem(simStorageKey(scope))==='true'}catch{}simTraffic.value=value;simTrafficDraft.value=value},{immediate:true,flush:'sync'})
watch(()=>display.shown,shown=>{if(shown&&!display.unknown)simTrafficDraft.value=simTraffic.value},{flush:'sync'})
async function saveDisplay(){const scope=simScope.value,epoch=identityEpoch(),value=simTrafficDraft.value;await display.save();if(!scope||scope!==simScope.value||epoch!==identityEpoch()||!readable.value||display.shown||display.unknown||display.formError)return;simTraffic.value=value;try{window.localStorage.setItem(simStorageKey(scope),String(value))}catch{}}
const locked=computed(()=>addingLocked.value||display.locked||removeLocked.value)
function loadDirectory(){if(!readable.value)return;selected.value=[];resource.clear();void resource.reload()}
function load(){if(!readable.value||locked.value)return;loadDirectory();void display.load()}
function changePage(value:number){if(locked.value||resource.loading.value||!Number.isSafeInteger(value)||value<1||value>10000)return;page.value=value;loadDirectory()}
function reset(){adaptationController?.abort();adaptations.value=new Map();adaptationError.value='';selected.value=[];resource.clear();display.reset();page.value=1;adding.value=false;addingLocked.value=false;removing.value=false;removeLocked.value=false}
async function loadAdaptations(){
 adaptationController?.abort()
 const rows=resource.data.value?.items||[],ids=rows.flatMap(row=>typeof row.id==='string'&&typeDeviceUuid.test(row.id)?[row.id]:[])
 adaptationError.value=''
 if(!readable.value||!ids.length){adaptations.value=new Map();return}
 const controller=new AbortController(),epoch=identityEpoch()
 adaptationController=controller
 try{
  const value=await readAdaptationBatch(projectId.value,ids,controller.signal)
  if(epoch===identityEpoch()&&!controller.signal.aborted)adaptations.value=value
 }catch(cause){if(epoch===identityEpoch()&&!controller.signal.aborted&&!(cause instanceof IdentityChanged))adaptationError.value=errorMessage(cause)}
}
watch(()=>resource.data.value,()=>{void loadAdaptations()},{flush:'sync'})
watch([()=>projectId.value,()=>props.deviceTypeId,()=>session.user?.accountId],()=>{denied.value=false;reset();if(readable.value)load()},{immediate:true,flush:'sync'})
watch([()=>readable.value,()=>session.transitioning],()=>{reset();if(readable.value)load()},{flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
let alive=true
const dispose=onIdentityChange(()=>{reset();denied.value=false;queueMicrotask(()=>{if(alive&&readable.value&&!resource.loading.value)load()})});onScopeDispose(()=>{alive=false;reset();dispose();emit('locked',false)})
function viewAll(){if(readable.value&&!locked.value)void router.push({path:'/devices',query:{deviceTypeId:props.deviceTypeId}})}
const dailyTimerIcon=defineComponent(()=>()=>h('svg',{viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},[h('path',{d:"M16 14H17.5V16.8L19.9 18.2L19.1 19.5L16 17.7V14M21 11.3C20.8 7.9 17 7.2 13.3 9.2C13 8.8 12.6 8.5 12.1 8.3C12.3 7.4 12.7 6.3 13.7 5.8C16.1 4.6 16 1 11.5 1C7.9 1 7.2 5 9.1 8.7C8.7 9 8.4 9.4 8.2 9.9C7.3 9.7 6.2 9.3 5.7 8.3C4.6 5.9 1 6 1 10.5C1 14.1 5 14.8 8.7 12.9C9 13.3 9.5 13.6 9.9 13.8C9.7 14.7 9.3 15.8 8.3 16.3C5.9 17.4 6 21 10.5 21C10.8 21 11 21 11.2 20.9C12.5 22.8 14.6 24 17 24C20.9 24 24 20.9 24 17C24 14.6 22.8 12.5 21 11.3M11 10C11.6 10 12 10.4 12 11S11.6 12 11 12 10 11.6 10 11 10.4 10 11 10M17 22C14.2 22 12 19.8 12 17S14.2 12 17 12 22 14.2 22 17 19.8 22 17 22Z"})]))
const dailyTimerRangeIcon=defineComponent(()=>()=>h('svg',{viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},[h('path',{d:"M12,1C8.14,1 5,4.14 5,8A7,7 0 0,0 12,15C15.86,15 19,11.87 19,8C19,4.14 15.86,1 12,1M12,3.15C14.67,3.15 16.85,5.32 16.85,8C16.85,10.68 14.67,12.85 12,12.85A4.85,4.85 0 0,1 7.15,8A4.85,4.85 0 0,1 12,3.15M11,5V8.69L14.19,10.53L14.94,9.23L12.5,7.82V5M4,16V24H6V21H18V24L22,20L18,16V19H6V16"})]))
// Source mdi:timetable，路径沿Pictogrammers Apache-2.0原图。
const dailyTimerIntervalIcon=defineComponent(()=>()=>h('svg',{viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},[h('path',{d:"M14,12H15.5V14.82L17.94,16.23L17.19,17.53L14,15.69V12M4,2H18A2,2 0 0,1 20,4V10.1C21.24,11.36 22,13.09 22,15A7,7 0 0,1 15,22C13.09,22 11.36,21.24 10.1,20H4A2,2 0 0,1 2,18V4A2,2 0 0,1 4,2M4,15V18H8.67C8.24,17.09 8,16.07 8,15H4M4,8H10V5H4V8M18,8V5H12V8H18M4,13H8.29C8.63,11.85 9.26,10.82 10.1,10H4V13M15,10.15A4.85,4.85 0 0,0 10.15,15C10.15,17.68 12.32,19.85 15,19.85A4.85,4.85 0 0,0 19.85,15C19.85,12.32 17.68,10.15 15,10.15Z"})]))
const propertyIcons:Partial<Record<string,Component>>={NUMBER:Odometer,SWITCH:SwitchButton,TEXT:Document,ENUM:Collection,OBJECT:Box,LIST:Files,DAILY_TIMER:dailyTimerIcon,DAILY_TIMER_LIST:dailyTimerIcon,DAILY_TIMER_RANGE:dailyTimerRangeIcon,DAILY_TIMER_RANGE_LIST:dailyTimerRangeIcon,DAILY_TIMER_DURATION:dailyTimerRangeIcon,DAILY_TIMER_DURATION_LIST:dailyTimerRangeIcon,DAILY_TIMER_INTERVAL:dailyTimerIntervalIcon,DAILY_TIMER_INTERVAL_LIST:dailyTimerIntervalIcon}
const propertyTypeNames:Record<string,string>={NUMBER:'数值',SWITCH:'开关',TEXT:'文本',ENUM:'枚举',OBJECT:'对象',LIST:'列表',DAILY_TIMER:'每日定时器',DAILY_TIMER_LIST:'每日定时器列表',DAILY_TIMER_RANGE:'每日定时区间',DAILY_TIMER_RANGE_LIST:'每日定时区间列表',DAILY_TIMER_DURATION:'每日定时时长',DAILY_TIMER_DURATION_LIST:'每日定时时长列表',DAILY_TIMER_INTERVAL:'每日间歇定时',DAILY_TIMER_INTERVAL_LIST:'每日间歇定时列表'}
</script>
<template><section class="type-devices">
 <div class="type-devices-actions"><el-button v-if="writable" size="small" type="primary" :icon="Plus" :disabled="display.locked||removeLocked" @click="adding=true">添加设备</el-button><el-button v-if="writable&&selected.length" size="small" type="danger" :disabled="selectionLocked" @click="removing=true">从类型中移除设备</el-button><div class="type-devices-actions__end"><el-button size="small" :icon="View" :disabled="!readable||display.loading||addingLocked||display.busy||removeLocked" @click="display.open">显示设置</el-button><el-button size="small" :icon="Refresh" :disabled="!readable||locked||resource.loading.value||display.loading" @click="load">刷新</el-button><el-button size="small" :disabled="!readable||locked" @click="viewAll">在设备列表中查看<ReferenceIcon class="type-devices-view-arrow" glyph="󰁔"/></el-button></div></div>
 <el-alert v-if="display.error" :title="display.error" type="error" :closable="false"><el-button size="small" :disabled="display.loading||locked" @click="display.load">重新读取显示设置</el-button></el-alert><el-alert v-if="display.notice" :title="display.notice" type="info" :closable="false"/><el-alert v-if="display.queryError" :title="display.queryError" type="error" :closable="false"><el-button size="small" :disabled="display.queryLoading||locked" @click="display.query">重读属性值</el-button></el-alert><el-alert v-if="adaptationError" :title="`关联适配状态读取失败：${adaptationError}`" type="error" :closable="false"><el-button size="small" :disabled="locked" @click="loadAdaptations">重读适配状态</el-button></el-alert>
 <AsyncState :forbidden="!readable" :loading="resource.loading.value" :error="resource.error.value" @retry="load"><template v-if="resource.data.value">
  <el-table class="type-devices-table" :aria-label="`关联设备，共 ${resource.data.value.total} 台`" :data="resource.data.value.items" row-key="id" empty-text="暂无数据">
   <el-table-column width="46" align="center" class-name="type-device-selection"><template #header><el-checkbox :model-value="selectedAll" :indeterminate="selectedSome" :disabled="selectionLocked||!resource.data.value.items.length" aria-label="选择本页全部设备" @update:model-value="selectAll(!!$event)"/></template><template #default="{row}"><el-checkbox :model-value="selected.includes(row.id)" :disabled="selectionLocked" :aria-label="`选择设备 ${row.name}`" @update:model-value="selectOne(row.id,!!$event)"/></template></el-table-column>
   <el-table-column label="设备名称" min-width="260"><template #default="{row}"><router-link :to="`/devices/${row.id}`">{{row.name}}</router-link></template></el-table-column>
   <el-table-column label="设备ID" min-width="300"><template #default="{row}">{{row.id}}</template></el-table-column>
   <el-table-column v-for="column in display.columns" :key="column.key" :label="column.name" min-width="160" align="center"><template #default="{row}"><span class="device-property-value">{{display.cellText(row.id,column.key)}}</span></template></el-table-column>
   <el-table-column v-if="simTraffic" label="物联网卡流量" width="150" align="center"><template #default><span class="sim-traffic-value">-</span></template></el-table-column>
   <el-table-column label="在线状态" width="100" align="center"><template #default="{row}"><span class="type-device-online" :class="{'is-online':resource.data.value.display?.[row.id]?.enabled!==false&&row.status==='ONLINE'}"><el-icon><VideoPause v-if="resource.data.value.display?.[row.id]?.enabled===false"/><DirectoryGlyph v-else kind="connection"/></el-icon>{{resource.data.value.display?.[row.id]?.enabled===false?'已停用':row.status==='ONLINE'?'在线':'离线'}}</span></template></el-table-column>
   <el-table-column label="活跃时间" width="200"><template #default="{row}"><span title="最近成功属性或事件上报；尚不表示全部通信的最后活跃时刻">{{resource.data.value.display?.[row.id]?.lastDataReportAt?formatTime(resource.data.value.display[row.id]!.lastDataReportAt):'尚无上报时间'}}</span></template></el-table-column>
   <el-table-column label="适配状态" width="120" align="center"><template #default="{row}"><span class="type-device-adaptation" :class="{'is-ready':adaptations.get(row.id)?.status==='READY'}">{{adaptationStateLabel(adaptations.get(row.id))}}</span></template></el-table-column>
   <el-table-column label="告警状态" width="110" align="center"><template #default="{row}"><router-link class="type-device-alarm" :class="{'is-alarming':resource.data.value.alarms.states[row.id]==='ACTIVE'}" :to="`/devices/${row.id}?tab=alarms`">{{alarmLabel(resource.data.value.alarms.states[row.id])}}</router-link></template></el-table-column>
  </el-table>
  <CursorPager v-if="resource.data.value.items.length||page>1" :page="page" :total="resource.data.value.total" :limit="limit" :show-sizes="false" :loading="resource.loading.value||locked" @update:page="changePage"/>
 </template></AsyncState>
 <DeviceTypeAddDeviceDialog v-if="readable" :open="adding" :device-type-id="deviceTypeId" @update:open="adding=$event" @changed="loadDirectory" @locked="addingLocked=$event"/>
 <DeviceTypeRemoveDevicesDialog v-if="readable" :open="removing" :device-type-id="deviceTypeId" :devices="selectedDevices" @update:open="removing=$event" @changed="page=1;loadDirectory()" @locked="removeLocked=$event"/>
 <el-dialog :model-value="display.shown&&readable" class="device-list-display-dialog" title="显示设置" width="min(500px,94vw)" :close-on-click-modal="false" :close-on-press-escape="false" :show-close="!display.busy&&!display.unknown" :before-close="(done:()=>void)=>{if(!display.busy&&!display.unknown){display.cancel();done()}}">
  <el-alert v-if="display.formError" :title="display.formError" type="error" :closable="false"/>
  <template v-if="display.unknown"><p>原保存结果尚未确认；只读取当前显示设置，不会再次提交。</p><p v-if="display.observed">已读取当前显示设置；当前状态不能证明原请求的历史结果。</p></template>
  <el-form v-else label-position="top" :disabled="display.busy||display.conflict||display.loading"><el-form-item label="选择显示属性"><el-select v-model="display.draft" multiple :multiple-limit="50" aria-label="选择显示属性" placeholder="请选择" class="device-display-select"><el-option class="device-display-option-row" v-for="option in display.optionsList" :key="option.propertyKey" :value="option.propertyKey" :label="option.name" :disabled="!display.selectable(option)&&!display.draft.includes(option.propertyKey)"><span class="device-display-option"><el-icon v-if="propertyIcons[option.dataType]"><component :is="propertyIcons[option.dataType]"/></el-icon><span>{{option.name}}<small>{{option.propertyKey}}</small></span><small>{{propertyTypeNames[option.dataType]||'已移除'}}</small></span></el-option></el-select></el-form-item><el-form-item label="附加信息列" class="device-display-extra"><el-checkbox v-model="simTrafficDraft" aria-label="显示物联网卡流量">物联网卡流量</el-checkbox><a class="device-display-sim-help" href="https://www.thingscloud.xyz/docs/guide/iot-card/sim-cards.html" target="_blank" rel="noopener noreferrer">如何关联物联网卡？ <ReferenceIcon glyph="󰏌"/></a></el-form-item></el-form>
  <el-button v-if="display.conflict" :disabled="display.loading" @click="display.reloadDraft">重新读取显示设置</el-button>
  <template #footer><template v-if="display.unknown"><el-button :loading="display.busy" @click="display.review">读取当前显示设置</el-button><el-button type="primary" :disabled="display.busy||!display.observed" @click="display.finish">采用当前设置并结束核对</el-button></template><template v-else><el-button :disabled="display.busy" @click="display.cancel">取消</el-button><el-button type="primary" :loading="display.busy" :disabled="display.conflict||display.loading" @click="saveDisplay">保存</el-button></template></template>
 </el-dialog>
</section></template>
<style scoped>.device-display-option-row{height:48px;line-height:20px}.device-display-select{width:100%}.device-display-option{display:flex;gap:10px;align-items:center;min-height:40px}.device-display-option>span{flex:1}.device-display-option small{font-size:12px;color:var(--tl-muted)}.device-display-option>span small{display:block;line-height:16px}.device-property-value{overflow-wrap:anywhere}.type-devices-table :deep(.type-device-selection .cell){padding:0}.type-devices-table :deep(.el-checkbox){height:14px;line-height:14px;vertical-align:middle}.type-devices-table :deep(.el-checkbox__label){display:none}.sim-traffic-value{color:#999}.type-devices-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:24px 0}.type-devices-actions__end{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-left:auto;flex-wrap:wrap}.type-devices-view-arrow{font-size:14px;margin-left:5px}.type-devices-actions .el-button+.el-button{margin-left:0}.type-devices a{color:var(--tl-primary);text-decoration:none}.type-devices-table :deep(th.el-table__cell){color:#363636;font-weight:700}.type-devices-table :deep(.cell){padding-left:12px;padding-right:12px}.type-device-online{display:inline-flex;align-items:center;gap:3px;color:#999}.type-device-online.is-online{color:#67c23a}.type-device-adaptation{color:#999}.type-device-adaptation.is-ready{color:#67c23a}.type-devices a.type-device-alarm{color:#999}.type-devices a.type-device-alarm.is-alarming{color:var(--el-color-danger)}.type-devices :deep(.tl-pager){gap:10px;margin:22px 0}.type-devices :deep(.tl-pager .el-button){min-width:30px;height:28px;padding:0;border:0;background:#f4f4f5}.type-devices :deep(.tl-pager__page){height:28px;font-size:13px}@media(max-width:640px){.type-devices-actions__end{gap:8px;width:100%}}</style>

<style>
.device-list-display-dialog .device-display-extra{margin-top:24px}.el-dialog.device-list-display-dialog a.device-display-sim-help{display:inline-flex;align-items:center;gap:4px;margin-left:8px;color:#888;font-size:14px;text-decoration:none}.device-list-display-dialog .device-display-sim-help .reference-icon{font-size:14px}.device-list-display-dialog .el-form-item__label{font-weight:700}.device-list-display-dialog .el-dialog__body{padding:40px 20px 30px}.device-list-display-dialog .el-dialog__footer .el-button{height:40px;padding:12px 20px}
</style>
