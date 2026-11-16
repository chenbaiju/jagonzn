<script setup lang="ts">
import { ref, reactive, watch, computed, shallowRef, onScopeDispose } from 'vue'
import { useRouter } from 'vue-router'
import {RefreshRight as Refresh,Download,Plus,VideoPause} from '@element-plus/icons-vue'
import {alarmLabel} from './page-alarm-status'
import { projectId, can, currentProject, session } from '@/core/session'
import {identityEpoch,onIdentityChange,IdentityChanged,ApiError,errorMessage} from '@/core/http'
import DeviceTypeActivityPolicyDialog from './DeviceTypeActivityPolicyDialog.vue'
import DevicePropertyQueryDialog from './DevicePropertyQueryDialog.vue'
import {policyId} from './device-type-activity-policy-api'
import {decodeDirectoryActivity,activitySupported,type DirectoryActivity} from './directory-activity-capabilities'
import { useResource } from '@/core/use-resource'
import { formatTime,relativeTime } from '@/core/time'
import PageHeader from '@/ui/PageHeader.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import { devicesApi, statusLabel, type DirectoryQuery, type DeviceType } from './api'
import { useDeviceOptions } from './use-options'
import {downloadTabular} from './device-data-export'
import {readDeviceOnboardingCode} from './device-onboarding-code-api'
import DeviceCatalogToolbar, {type CatalogFilterForm,type CatalogView} from './DeviceCatalogToolbar.vue'
import { directoryQuery } from './directory-query'
import { directoryAlarmStatus } from './directory-alarm-status'
import {directoryReferenceKeys} from './directory-reference-identity'
import {directoryDisplayFacts,staticGroupPath} from './directory-display-facts'
import DeviceGroupSidebar from './DeviceGroupSidebar.vue'
import DeviceBatchActions from './DeviceBatchActions.vue'
import DirectoryGlyph from './DirectoryGlyph.vue'
import DeviceDirectoryMap from './DeviceDirectoryMap.vue'
import {directoryEffectiveMapRows} from './directory-map'
import {rememberBatchReturn,takeBatchReturn} from './batch-return'
const router = useRouter()
const blankFilters=():CatalogFilterForm=>({online:'',activity:'',alarm:'',enabled:'',kind:''})
const filters=ref(blankFilters()),keyword=ref(''),typeId=ref(''),order=ref('CREATED_ASC')
const extra=reactive({groupId:'',ungrouped:false})
const view=ref<CatalogView>('cards'),groupsVisible=ref(true),limit=ref(24),page=ref(1),validation=ref('')
const applied=ref<DirectoryQuery>({page:1,limit:24,order:'CREATED_ASC'})
const selected=ref<string[]>([]),batchLocked=ref(false),policyLocked=ref(false),typeSelectionPending=ref(false)
const queryLocked=ref(false),queryDialog=shallowRef<InstanceType<typeof DevicePropertyQueryDialog>>()
const exportDialog=ref(false)
const exportFields=['设备ID','设备名称','设备唯一标识','设备码','设备描述','设备类型','设备组','最近活跃时间','在线状态','告警状态','设备创建时间','业务别名'] as const
type ExportField=typeof exportFields[number]
const selectedExportFields=ref<ExportField[]>([...exportFields])
const exportFormat=ref<'xlsx'|'csv'>('xlsx')
const exportBusy=ref(false),exportError=ref('')
let exportController:AbortController|undefined
watch(exportDialog,shown=>{if(!shown){exportController?.abort();exportController=undefined;exportBusy.value=false;exportError.value=''}})
onScopeDispose(()=>exportController?.abort())
const catalogLocked=computed(()=>batchLocked.value||policyLocked.value||queryLocked.value||typeSelectionPending.value)
function openQuery(){if(!catalogLocked.value&&can('device:read'))queryDialog.value?.open(typeId.value||undefined,selectedType.value?.name,selected.value.length?selected.value:undefined)}
/** 批量关联前保留当前选择；返回同账号/项目/路径时只恢复一次，原站返回语义仍待补证。 */
function manageUsers(){
 if(catalogLocked.value)return
 const account=session.user?.accountId,project=projectId.value
 if(account&&project)rememberBatchReturn(account,project,router.currentRoute.value.fullPath,selected.value)
 void router.push({name:'end-users'})
}
const capability=shallowRef<DirectoryActivity>(),capabilityError=ref('')
const routeTypeParam=computed(()=>router.currentRoute?.value.query.deviceTypeId)
const routeGroupParam=computed(()=>router.currentRoute?.value.query.groupId)
const linkedType=shallowRef<DeviceType>(),linkedTypeLoading=ref(false),linkedTypeError=shallowRef<Error>()
let linkedGeneration=0,linkedController:AbortController|undefined,listDisposed=false,pendingRouteInitialization=false
function routeTypeId(value:unknown){return typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)?value.toLowerCase():undefined}
function clearLinkedType(){linkedGeneration++;linkedController?.abort();linkedController=undefined;linkedType.value=undefined;linkedTypeLoading.value=false;linkedTypeError.value=undefined}
const policyDialog=shallowRef<InstanceType<typeof DeviceTypeActivityPolicyDialog>>()
const selectionMode=computed(()=>selected.value.length>0)
const selectedAll=computed(()=>!!resource.data.value?.items?.length&&selected.value.length===resource.data.value.items!.length)
const selectedSome=computed(()=>selected.value.length>0&&!selectedAll.value)
function selectOne(id:string,checked:boolean){if(catalogLocked.value||!resource.data.value?.items?.some(item=>item.id===id))return;selected.value=checked?[...selected.value.filter(value=>value!==id),id]:selected.value.filter(value=>value!==id)}
function selectAll(checked:boolean){if(catalogLocked.value)return;selected.value=checked?(resource.data.value?.items?.map(item=>item.id!).filter(Boolean)||[]):[]}
/** 原站同页选择模式：卡片点击只改变选择，不穿透成设备导航。 */
function selectCard(id:string){if(selectionMode.value&&!catalogLocked.value)selectOne(id,!selected.value.includes(id))}
function selectCardLink(event:MouseEvent,id:string){if(catalogLocked.value||selectionMode.value){event.preventDefault();event.stopPropagation();selectCard(id)}}
/** 批次结果未核对时保留当前表格范围；普通选择模式仍沿用表格链接。 */
function guardBatchNavigation(event:MouseEvent){if(catalogLocked.value){event.preventDefault();event.stopPropagation()}}
const resource=useResource(async signal=>{
 if(!projectId.value||!can('device:read')||session.transitioning)throw new IdentityChanged()
 // 未展示的标签筛选不能由旧草稿或已应用范围悄悄带入目录。
 const query={...applied.value};delete query.tagKey;delete query.tagValue
 if(routeGroupParam.value!==undefined&&(!routeTypeId(routeGroupParam.value)||query.groupId!==routeTypeId(routeGroupParam.value)))throw new Error('设备组链接无效')
 if(routeTypeParam.value!==undefined&&(linkedTypeLoading.value||linkedTypeError.value||!linkedType.value||linkedType.value.id!==routeTypeId(routeTypeParam.value)||query.deviceTypeIds?.length!==1||query.deviceTypeIds[0]!==linkedType.value.id))throw linkedTypeError.value||new Error('请先确认链接中的设备类型')
 const project=projectId.value,account=session.user?.accountId,epoch=identityEpoch(),observationEpoch=capability.value?.observationEpoch,observationVersion=capability.value?.contractVersion
 const windowActivity=query.activity==='ACTIVE'||query.activity==='INACTIVE'?query.activity:undefined
 if(windowActivity&&!activitySupported(capability.value,windowActivity))throw new Error('当前活跃观察能力不可用，请取消筛选后重新读取')
 const requestedMap=view.value==='map'
 delete query.includeManualLocation
 if(requestedMap)query.includeLocationObservation=true
 else delete query.includeLocationObservation
 let data:Awaited<ReturnType<typeof devicesApi.directory>>
 try{data=await devicesApi.directory(project,query,signal)}catch(cause){
  if(!signal.aborted&&epoch===identityEpoch()&&account===session.user?.accountId&&project===projectId.value&&windowActivity&&cause instanceof ApiError&&[400,422].includes(cause.status)){capability.value=undefined;filters.value={...filters.value,activity:''};applied.value={...applied.value,activity:undefined};validation.value='服务端未接受活跃筛选，已清除旧能力。请明确重新搜索；不会自动请求全量。'}
  throw cause
 }
 if(signal.aborted||epoch!==identityEpoch()||account!==session.user?.accountId||project!==projectId.value)throw new IdentityChanged()
 let next:DirectoryActivity|undefined;capabilityError.value=''
 try{next=decodeDirectoryActivity(data.activity)}catch(cause){capabilityError.value=cause instanceof Error?cause.message:'目录活跃能力不可用'}
 if(next&&capability.value&&(next.contractVersion!==observationVersion||next.observationEpoch!==observationEpoch))selected.value=[]
 if(windowActivity&&(!activitySupported(next,windowActivity)||next?.observationEpoch!==observationEpoch||next?.contractVersion!==observationVersion)){
  capability.value=undefined;filters.value={...filters.value,activity:''};applied.value={...applied.value,activity:undefined};validation.value='活跃观察能力已变化，已清除旧筛选。请明确重新搜索；当前结果未展示。';throw new Error(validation.value)
 }
 const display=directoryDisplayFacts(data.items,data.displayFacts)
 const decoded={...data,alarmSummary:directoryAlarmStatus(data.items,data.alarmObservations),referenceKeys:directoryReferenceKeys(data.items,data.referenceIdentities),display,mapRows:requestedMap?directoryEffectiveMapRows(data.items,display):undefined}
 capability.value=next
 return decoded
})
let batchReturnRestored=false
watch(()=>resource.data.value,data=>{
 if(!data||batchReturnRestored)return
 batchReturnRestored=true
 const account=session.user?.accountId,project=projectId.value
 if(!account||!project)return
 const ids=takeBatchReturn(account,project,router.currentRoute.value.fullPath)
 if(ids.length)selected.value=ids
},{immediate:true})
const filtered=computed(()=>Object.entries(applied.value).some(([key,value])=>!['page','limit','order','tagKey','tagValue'].includes(key)&&value!==undefined&&value!==''&&value!==null&&(!Array.isArray(value)||value.length>0)))
const alarms=computed(()=>resource.data.value?.alarmSummary||directoryAlarmStatus([],[]))
let clearAfterBatch=false
function reload(){if(catalogLocked.value)return;if(routeTypeParam.value!==undefined&&(!linkedType.value||linkedTypeError.value))return initializeScope();selected.value=[];resource.clear();return resource.reload()}
function batchChanged(){clearAfterBatch=true;void resource.reload()}
function batchLock(value:boolean){batchLocked.value=value;if(!value&&clearAfterBatch){clearAfterBatch=false;selected.value=[]}}
function clearSelection(){if(!catalogLocked.value)selected.value=[]}
const {groups,allTypes,types,moreTypes}=useDeviceOptions()
const catalogTypes=computed(()=>!can('device:read')||session.transitioning?[]:linkedType.value?[linkedType.value,...allTypes.value.filter(t=>t.id!==linkedType.value?.id)]:allTypes.value)
const selectedType=computed(()=>{if(linkedType.value?.id===typeId.value)return linkedType.value;if(!types.data.value||types.error.value||!policyId(typeId.value))return;const found=allTypes.value.filter(t=>t.id===typeId.value);if(found.length===1&&found[0]?.name)return found[0]})
const policyAvailable=computed(()=>!!selectedType.value&&capability.value?.policyReadSupported===true&&!!session.user?.accountId&&session.ready&&!session.transitioning&&!!currentProject.value&&can('device:read'))
function openPolicy(){if(!catalogLocked.value&&policyAvailable.value&&selectedType.value)void policyDialog.value?.open(selectedType.value.id!,selectedType.value.name!)}
function policyChanged(){if(!catalogLocked.value){selected.value=[];resource.clear();void resource.reload()}}
function search(){
  if(catalogLocked.value)return
  try{
   const query=directoryQuery(keyword.value,typeId.value,filters.value,order.value,1,limit.value,{...extra,tagKey:'',tagValue:''},capability.value)
   applied.value=query.groupId?{...query,includeSubgroups:true}:query
   validation.value='';page.value=1;void reload()
  }
  catch(cause){validation.value=cause instanceof Error?cause.message:'设备筛选无效'}
}
/** 只有明确改变类型后才移除链接限定；路由未完成时不先请求全量。 */
async function changeTypeSelection(value:string){
 if(catalogLocked.value)return
 if(routeTypeParam.value===undefined){typeId.value=value;return}
 if(linkedType.value&&value===typeId.value)return
 const generation=linkedGeneration,project=projectId.value,account=session.user?.accountId,epoch=identityEpoch(),target=router.currentRoute.value
 typeSelectionPending.value=true
 try{
  const query={...target.query};delete query.deviceTypeId
  await router.replace({path:target.path,query,hash:target.hash})
  if(listDisposed||generation!==linkedGeneration||project!==projectId.value||account!==session.user?.accountId||epoch!==identityEpoch())return
  if(routeTypeParam.value!==undefined){validation.value='类型限定未能清除，请重试';return}
  typeSelectionPending.value=false;clearLinkedType();typeId.value=value;search()
 }catch(cause){if(generation===linkedGeneration)validation.value=errorMessage(cause)}
 finally{if(generation===linkedGeneration)typeSelectionPending.value=false}
}
function replaceGroupLink(id:string){
 const target=router.currentRoute.value,query={...target.query}
 if(id)query.groupId=id
 else{delete query.groupId;delete query.includeSubgroups}
 return router.replace({path:target.path,query,hash:target.hash})
}
/** 侧栏选组只同步查询参数，不让路由监听重置当前筛选；原站选组后 URL 可刷新保持。 */
let groupLinkPending=0,groupSelectionToken=0
function syncGroupLink(id:string){
 const target=router?.currentRoute?.value
 if(!target)return
 if(id?target.query.groupId===id&&target.query.includeSubgroups==='1':target.query.groupId===undefined&&target.query.includeSubgroups===undefined)return
 const query={...target.query}
 if(id){query.groupId=id;query.includeSubgroups='1'}
 else{delete query.groupId;delete query.includeSubgroups}
 groupLinkPending++
 const navigation=router.replace({path:target.path,query,hash:target.hash})
 void navigation.finally(()=>queueMicrotask(()=>{groupLinkPending=Math.max(0,groupLinkPending-1)}))
 return navigation.catch(()=>undefined)
}
async function selectGroup(id:string){
 if(catalogLocked.value)return
 const token=++groupSelectionToken,project=projectId.value,epoch=identityEpoch()
 extra.groupId=id;extra.ungrouped=false
 if(routeGroupParam.value!==id)await syncGroupLink(id)
 if(token!==groupSelectionToken||listDisposed||catalogLocked.value||project!==projectId.value||epoch!==identityEpoch())return
 search()
}
async function selectUngrouped(){
 if(catalogLocked.value)return
 const token=++groupSelectionToken,project=projectId.value,epoch=identityEpoch()
 extra.groupId='';extra.ungrouped=true
 if(routeGroupParam.value!==undefined)await syncGroupLink('')
 if(token!==groupSelectionToken||listDisposed||catalogLocked.value||project!==projectId.value||epoch!==identityEpoch())return
 search()
}
function reset(){
 if(catalogLocked.value)return
 if(routeGroupParam.value!==undefined){
  const target=router.currentRoute.value,query={...target.query}
  delete query.groupId;delete query.includeSubgroups;delete query.deviceTypeId
  void router.replace({path:target.path,query,hash:target.hash})
  return
 }
 filters.value=blankFilters();keyword.value='';order.value='CREATED_ASC';Object.assign(extra,{groupId:'',ungrouped:false})
 if(routeTypeParam.value!==undefined)void changeTypeSelection('');else{typeId.value='';search()}
}
function changePage(value:number){if(catalogLocked.value||value===page.value)return;page.value=value;applied.value={...applied.value,page:value};void reload()}
function changeLimit(value:number){if(catalogLocked.value)return;limit.value=value;search()}
async function exportPage(){
  if(exportBusy.value||catalogLocked.value||!can('device:read')||!selectedExportFields.value.length||!resource.data.value?.items?.length)return
  const snapshot=resource.data.value,items=snapshot.items!,project=projectId.value,epoch=identityEpoch(),exportPageNumber=page.value
  const controller=new AbortController();exportController=controller;exportBusy.value=true;exportError.value=''
  try{
  const fields=exportFields.filter(field=>selectedExportFields.value.includes(field))
  const codes=fields.includes('设备码')?await Promise.all(items.map(d=>readDeviceOnboardingCode(project,d.id!,controller.signal))):[]
  if(controller.signal.aborted||!exportDialog.value||epoch!==identityEpoch()||project!==projectId.value||snapshot!==resource.data.value||!can('device:read'))return
  const rows=[fields,...items.map((d,index)=>{const fact=snapshot.display?.[d.id||''];const values:Record<ExportField,unknown>={'设备ID':d.id,'设备名称':d.name,'设备唯一标识':d.deviceKey,'设备码':codes[index]?.code,'设备描述':d.description,'设备类型':fact?.deviceTypeName,'设备组':fact?.staticGroups?.map(group=>group.name).join(' / '),'最近活跃时间':fact?.lastDataReportAt?formatTime(fact.lastDataReportAt):'','在线状态':statusLabel(d.status),'告警状态':alarmLabel(snapshot.alarmSummary.states[d.id||'']),'设备创建时间':formatTime(d.createdAt),'业务别名':snapshot.referenceKeys[d.id||'']};return fields.map(field=>String(values[field]??''))})]
  downloadTabular(rows,exportFormat.value,`设备-第${exportPageNumber}页`,undefined,'设备')
  exportDialog.value=false
  }catch(cause){if(!controller.signal.aborted&&epoch===identityEpoch())exportError.value=`导出失败：${errorMessage(cause)}`}
  finally{if(exportController===controller){exportController=undefined;exportBusy.value=false}}
}
/** 卡片/表格仅换展示；地图按需读取同页人工点，离开地图清除精确点。 */
function changeView(value:CatalogView){
 if(catalogLocked.value||!can('device:read')||!projectId.value||!['cards','table','map'].includes(value)||view.value===value)return
 const needsRead=value==='map'||view.value==='map';view.value=value
 if(needsRead)void reload()
}
function openMapDevice(id:string){if(!catalogLocked.value&&can('device:read')&&resource.data.value?.items?.some(item=>item.id===id))void router.push(`/devices/${id}`)}
function clearScope(){exportDialog.value=false;clearLinkedType();typeSelectionPending.value=false;pendingRouteInitialization=false;capability.value=undefined;capabilityError.value='';view.value='cards';selected.value=[];resource.clear();filters.value=blankFilters();keyword.value='';typeId.value='';order.value='CREATED_ASC';Object.assign(extra,{groupId:'',ungrouped:false});page.value=1;validation.value='';applied.value={page:1,limit:limit.value,order:'CREATED_ASC'}}
/** URL中的类型先独立确认为当前项目对象，再读取受限设备页。 */
async function initializeScope(){
 clearScope();if(!projectId.value||!can('device:read')||session.transitioning)return
 if(routeGroupParam.value!==undefined){
  const groupId=routeTypeId(routeGroupParam.value)
  if(!groupId){validation.value='设备组链接无效，请清除分组限定。';return}
  extra.groupId=groupId;groupsVisible.value=true
  applied.value={...applied.value,groupId,includeSubgroups:true}
 }
 if(routeTypeParam.value===undefined){void resource.reload();return}
 const id=routeTypeId(routeTypeParam.value);if(!id){linkedTypeError.value=new Error('设备类型链接无效，请重新选择或清除类型限定。');return}
 const generation=linkedGeneration,project=projectId.value,account=session.user?.accountId,epoch=identityEpoch();linkedController=new AbortController();const signal=linkedController.signal;linkedTypeLoading.value=true
 const current=()=>!listDisposed&&!signal.aborted&&generation===linkedGeneration&&project===projectId.value&&account===session.user?.accountId&&epoch===identityEpoch()&&can('device:read')&&!session.transitioning&&routeTypeId(routeTypeParam.value)===id
 try{
  const value=await devicesApi.type(project,id,signal)
  if(!current())return
  if(value.id!==id||value.projectId!==project||typeof value.name!=='string'||!value.name.trim()||value.name.length>128)throw new Error('类型资料与当前项目不符')
  linkedType.value=value;typeId.value=id;applied.value={...applied.value,deviceTypeIds:[id]};linkedTypeLoading.value=false;void resource.reload()
 }catch(cause){if(current()&&!(cause instanceof IdentityChanged))linkedTypeError.value=new Error(`无法读取链接中的设备类型：${errorMessage(cause)}。可重试或清除类型限定。`)}
 finally{if(current())linkedTypeLoading.value=false}
}
const disposeIdentity=onIdentityChange(()=>{clearScope();const generation=linkedGeneration;if(routeTypeParam.value!==undefined||routeGroupParam.value!==undefined)queueMicrotask(()=>{if(!listDisposed&&generation===linkedGeneration)void initializeScope()})})
onScopeDispose(()=>{listDisposed=true;clearLinkedType();disposeIdentity()})
watch([()=>projectId.value,()=>session.user?.accountId,()=>can('device:read'),()=>session.transitioning],initializeScope,{immediate:true,flush:'sync'})
watch([routeTypeParam,routeGroupParam],()=>{if(groupLinkPending>0)return;if(typeSelectionPending.value)return;if(catalogLocked.value){pendingRouteInitialization=true;return}void initializeScope()},{flush:'sync'})
watch(catalogLocked,value=>{if(!value&&pendingRouteInitialization){pendingRouteInitialization=false;void initializeScope()}},{flush:'sync'})
</script>
<template><main class="device-layout" :class="{'device-layout--map':view==='map'}"><DeviceGroupSidebar v-if="groupsVisible" :inert="catalogLocked||undefined" :groups="groups.data.value||[]" :selected="extra.groupId" :ungrouped="extra.ungrouped" :loading="groups.loading.value" @select="selectGroup" @ungrouped="selectUngrouped"/><section class="tl-page device-content">
  <PageHeader title="设备" :count="resource.data.value?.total"><el-button size="small" :icon="Refresh" :disabled="catalogLocked" :loading="resource.loading.value" @click="reload">刷新</el-button><el-button size="small" :icon="Download" :disabled="catalogLocked||!resource.data.value?.items?.length" @click="exportDialog=true">导出</el-button><el-button v-if="can('device:create')" :disabled="catalogLocked" size="small" :icon="Plus" type="primary" @click="router.push('/devices/create')">创建设备</el-button></PageHeader>
  <DeviceCatalogToolbar :activity="capability" :policy-available="policyAvailable" @activity-policy="openPolicy" :disabled="catalogLocked||linkedTypeLoading" :type-id="typeId" @update:typeId="changeTypeSelection" :keyword="keyword" @update:keyword="!catalogLocked&&(keyword=$event)" :order="order" @update:order="!catalogLocked&&(order=$event)" :view="view" @update:view="changeView" :filters="filters" @update:filters="!catalogLocked&&(filters=$event)" :types="catalogTypes" :has-more-types="types.data.value?.hasMore" :loading-types="types.loading.value" @more-types="!catalogLocked&&moreTypes()" @queries="openQuery" @search="search" :groups-visible="groupsVisible" @groups="!catalogLocked&&(groupsVisible=!groupsVisible)"><template #selection><DeviceBatchActions :device-ids="selected" :selected-group-id="extra.groupId" :group-management-available="true" :user-management-available="can('enduser:read')" @manage-groups="router.push({name:'device-groups'})" @manage-users="manageUsers" :disabled="policyLocked||!can('device:read')||!resource.data.value||resource.loading.value||!!resource.error.value" @cleared="clearSelection" @changed="batchChanged" @locked="batchLock"/></template></DeviceCatalogToolbar>
  <el-button v-if="routeTypeParam!==undefined" size="small" :disabled="catalogLocked" @click="changeTypeSelection('')">清除类型限定</el-button>
  <el-button v-if="routeGroupParam!==undefined" size="small" :disabled="catalogLocked" @click="replaceGroupLink('')">清除分组限定</el-button>
  <DeviceTypeActivityPolicyDialog ref="policyDialog" :disabled="batchLocked" @locked="policyLocked=$event" @changed="policyChanged"/>
  <DevicePropertyQueryDialog ref="queryDialog" :disabled="batchLocked||policyLocked||typeSelectionPending" @locked="queryLocked=$event"/>
  <el-button v-if="projectId&&can('device:read')&&!types.data.value&&!types.loading.value&&!types.error.value" size="small" :disabled="catalogLocked" @click="types.reload">重新读取设备类型</el-button>
  <p v-if="capabilityError" role="status">{{capabilityError}}；新活跃筛选和设置入口暂不可用。</p>
  <AsyncState v-if="types.error.value" :error="types.error.value" @retry="types.reload" />
  <AsyncState v-if="groups.error.value" :error="groups.error.value" @retry="groups.reload" />
  <el-alert v-if="validation" :title="validation" type="warning" :closable="false" />

  <AsyncState :forbidden="!can('device:read') || !projectId" :loading="linkedTypeLoading||resource.loading.value" :error="linkedTypeError||resource.error.value" @retry="reload">
    <DeviceDirectoryMap v-if="view==='map'&&resource.data.value?.mapRows" :key="`${projectId}:${session.user?.accountId}:${identityEpoch()}`" :project-id="projectId" :scope-key="`${projectId}:${session.user?.accountId}:${identityEpoch()}`" :rows="resource.data.value.mapRows" :disabled="catalogLocked||!can('device:read')" @navigate="openMapDevice"/>
    <div v-else-if="!resource.data.value?.items?.length" class="device-empty"><img src="/reference/empty-content.png" alt=""/><h2>{{filtered?'无匹配的设备':'创建设备，3分钟接入平台'}}</h2><p>支持各种单片机、嵌入式设备、传感器、执行器、控制器、网关、DTU、PLC等，支持MQTT、HTTP、TCP自定义协议。</p><div v-if="can('device:create')" class="device-empty-action"><el-button type="primary" :disabled="catalogLocked" @click="!catalogLocked&&router.push('/devices/create')">创建设备</el-button></div></div>
    <div v-else-if="view==='cards'" class="device-grid"><article v-for="d in resource.data.value?.items" :key="d.id" class="device-card" :class="{selected:selected.includes(d.id!),selectable:selectionMode}" @click="selectCard(d.id!)"><el-checkbox class="card-selection" @click.stop :model-value="selected.includes(d.id!)" :disabled="catalogLocked" :aria-label="`选择设备 ${d.name}`" @update:model-value="selectOne(d.id!,!!$event)"/><span v-if="resource.data.value?.display?.[d.id!]?.deviceKind==='GATEWAY'" class="card-device-kind" role="img" title="网关" aria-label="网关"><ReferenceIcon glyph="󰩩"/></span><span v-else-if="resource.data.value?.display?.[d.id!]?.deviceKind==='SUB_DEVICE'" class="card-device-kind" role="img" title="网关子设备" aria-label="网关子设备"><ReferenceIcon glyph="󱲙"/></span><router-link class="card-main" :to="`/devices/${d.id}`" :aria-disabled="catalogLocked||selectionMode||undefined" @click.capture="selectCardLink($event,d.id!)"><el-icon class="device-icon"><DirectoryGlyph kind="device"/></el-icon><div><strong>{{d.name || resource.data.value?.referenceKeys[d.id!] || '—'}}</strong><div v-if="resource.data.value?.display?.[d.id!]?.staticGroups?.length" class="card-groups"><span v-for="group in resource.data.value?.display?.[d.id!]?.staticGroups" :key="group.id" class="directory-tag" :style="group.color ? {color:group.color,borderColor:group.color,background:'transparent'} : undefined" :title="staticGroupPath(group)">{{staticGroupPath(group)}}</span></div></div></router-link><footer><router-link class="card-footer-link" :to="`/devices/${d.id}`" :aria-label="`查看设备 ${d.name || resource.data.value?.referenceKeys[d.id!] || '设备'}详情`" :aria-disabled="catalogLocked||selectionMode||undefined" @click.capture="selectCardLink($event,d.id!)"/><span :class="{'is-online':resource.data.value?.display?.[d.id!]?.enabled!==false&&d.status==='ONLINE','is-disabled':resource.data.value?.display?.[d.id!]?.enabled===false}"><el-icon><VideoPause v-if="resource.data.value?.display?.[d.id!]?.enabled===false"/><DirectoryGlyph v-else kind="connection"/></el-icon>{{resource.data.value?.display?.[d.id!]?.enabled===false?'已停用':d.status==='ONLINE'?'在线':'离线'}}<span v-if="d.status!=='ONLINE'&&d.lastOnlineAt" class="card-last-seen" :title="formatTime(d.lastOnlineAt)">{{relativeTime(d.lastOnlineAt)}}</span></span><router-link :to="`/devices/${d.id}`" :aria-disabled="catalogLocked||selectionMode||undefined" @click.capture="selectCardLink($event,d.id!)" :class="{'is-alarming':alarms.states[d.id!]==='ACTIVE'}">{{alarmLabel(alarms.states[d.id!])}}</router-link></footer></article></div>
    <el-table v-else class="device-directory-table" :data="resource.data.value?.items" row-key="id" empty-text="暂无设备">
      <el-table-column width="35" class-name="directory-selection-column" align="center"><template #header><el-checkbox :model-value="selectedAll" :indeterminate="selectedSome" :disabled="catalogLocked" aria-label="选择本页全部设备" @update:model-value="selectAll(!!$event)"/></template><template #default="{row}"><el-checkbox :model-value="selected.includes(row.id)" :disabled="catalogLocked" :aria-label="`选择设备 ${row.name}`" @update:model-value="selectOne(row.id,!!$event)"/></template></el-table-column>
      <el-table-column label="设备名称" min-width="200"><template #default="{row}"><router-link :aria-disabled="catalogLocked||undefined" @click.capture="guardBatchNavigation" class="table-name" :to="`/devices/${row.id}`"><el-icon><DirectoryGlyph kind="device"/></el-icon>{{row.name}}</router-link></template></el-table-column>
      <el-table-column width="35" class-name="directory-kind-column"><template #default="{row}"><span v-if="resource.data.value?.display?.[row.id]?.deviceKind==='GATEWAY'" role="img" title="网关" aria-label="网关"><ReferenceIcon glyph="󰩩"/></span><span v-else-if="resource.data.value?.display?.[row.id]?.deviceKind==='SUB_DEVICE'" role="img" title="网关子设备" aria-label="网关子设备"><ReferenceIcon glyph="󱲙"/></span></template></el-table-column>
      <el-table-column label="设备唯一标识" min-width="120"><template #default="{row}"><span class="table-key">{{row.deviceKey??''}}</span></template></el-table-column>
      <el-table-column label="业务别名" min-width="120"><template #default="{row}"><span class="table-key">{{resource.data.value?.referenceKeys[row.id]??''}}</span></template></el-table-column>
      <el-table-column label="设备类型"><template #default="{row}"><span v-if="!resource.data.value?.display">—</span><span v-else-if="resource.data.value?.display?.[row.id]?.deviceTypeName" class="directory-tag" :title="resource.data.value?.display?.[row.id]?.deviceTypeName??undefined">{{resource.data.value?.display?.[row.id]?.deviceTypeName}}</span></template></el-table-column>
      <el-table-column label="设备组" min-width="110"><template #default="{row}"><span v-if="!resource.data.value?.display">—</span><div v-else class="group-tags"><span v-for="group in resource.data.value?.display?.[row.id]?.staticGroups||[]" :key="group.id" class="directory-tag">{{group.name}}</span></div></template></el-table-column>
      <el-table-column label="在线状态" align="center" min-width="120"><template #default="{row}"><span class="table-online" :class="{'is-online':resource.data.value?.display?.[row.id]?.enabled!==false&&row.status==='ONLINE','is-disabled':resource.data.value?.display?.[row.id]?.enabled===false}"><el-icon><VideoPause v-if="resource.data.value?.display?.[row.id]?.enabled===false"/><DirectoryGlyph v-else kind="connection"/></el-icon>{{resource.data.value?.display?.[row.id]?.enabled===false?'已停用':row.status==='ONLINE'?'在线':'离线'}}</span></template></el-table-column>
      <el-table-column label="活跃时间" align="center" width="180"><template #default="{row}"><span title="最近一次成功属性或事件上报；其他活动尚未归入此读面">{{formatTime(resource.data.value?.display?.[row.id]?.lastDataReportAt)}}</span></template></el-table-column>
      <el-table-column label="告警状态" align="center" min-width="120"><template #default="{row}"><router-link :aria-disabled="catalogLocked||undefined" @click.capture="guardBatchNavigation" class="table-alarm" :class="{'is-alarming':alarms.states[row.id]==='ACTIVE'}" :to="`/devices/${row.id}?tab=alarms`">{{alarmLabel(alarms.states[row.id])}}</router-link></template></el-table-column>
    </el-table>
  </AsyncState>
  <CursorPager grouped v-if="can('device:read')&&resource.data.value&&(resource.data.value.items?.length||page>1)" :page="page" :total="resource.data.value?.total" :loading="resource.loading.value||catalogLocked" :limit="limit" :sizes="[24,48,72,96]" @update:page="changePage" @update:limit="changeLimit" />
</section><el-dialog v-model="exportDialog" title="导出设备信息" width="500px" class="device-export-dialog" :close-on-click-modal="false"><div class="device-export"><div class="export-label">导出字段</div><el-checkbox-group v-model="selectedExportFields" class="export-fields" :disabled="exportBusy"><el-checkbox v-for="field in exportFields" :key="field" :value="field">{{field}}</el-checkbox></el-checkbox-group><div class="export-label export-format-label">导出文件类型</div><el-radio-group v-model="exportFormat" :disabled="exportBusy"><el-radio value="xlsx">Excel</el-radio><el-radio value="csv">CSV</el-radio></el-radio-group><el-alert v-if="exportError" :title="exportError" type="error" :closable="false"/></div><template #footer><el-button @click="exportDialog=false">取消</el-button><el-button type="primary" :icon="Download" :loading="exportBusy" :disabled="catalogLocked||!selectedExportFields.length||!resource.data.value?.items?.length" @click="exportPage">导出</el-button></template></el-dialog></main></template>
<style scoped>
:global(.device-export-dialog.el-dialog){max-width:calc(100vw - 32px)}
:global(.device-export-dialog .el-dialog__header){padding:20px 20px 10px}
:global(.device-export-dialog .el-dialog__title){font-size:18px;font-weight:400;color:#303133;line-height:24px}
:global(.device-export-dialog .el-dialog__body){padding:38px 20px 48px;max-height:calc(85dvh - 145px);overflow-y:auto}
:global(.device-export-dialog .el-dialog__footer){padding:10px 20px 20px}
:global(.device-export-dialog .el-dialog__footer .el-button){height:40px;padding:12px 20px;font-size:14px}
:global(.device-export-dialog .el-dialog__footer .el-button+.el-button){margin-left:10px}
.device-export{font-size:14px;color:#606266;line-height:20px}.export-label{font-weight:700;line-height:22px}.export-fields{display:flex;flex-direction:column;align-items:flex-start}.export-fields :deep(.el-checkbox){height:28px;margin-right:0;font-weight:400}.export-fields :deep(.el-checkbox__label){font-size:14px;padding-left:12px}.export-fields :deep(.el-checkbox.is-checked:not(.is-disabled) .el-checkbox__label){color:#606266}.export-format-label{margin-top:24px}.device-export :deep(.el-radio__label){font-size:14px}
.device-layout{display:flex;min-height:calc(100vh - 50px);}.device-content{flex:1;min-width:0;padding:20px 20px 26px;}
.device-content :deep(.tl-page-header){margin-bottom:28px;}
.device-content :deep(.tl-page-header h1){font-size:28px;line-height:40px;color:#1f2f3d;}
.device-content :deep(.tl-page-header__count){font-size:20px;}
.device-content :deep(.tl-page-header__actions){gap:8px;}
.device-content :deep(.tl-page-header__actions .el-button+.el-button){margin-left:0;}

.device-empty{padding:60px 0;text-align:center}.device-empty>img{width:160px;display:inline-block}.device-empty h2{margin:20px 0 0;font-size:26px;line-height:36px;font-weight:400;color:#002822}.device-empty>p{margin:10px 0 0;display:inline-block;padding:0 20px;width:500px;max-width:100%;font-size:14px;line-height:22px;color:#909399}.device-empty-action{margin:20px 0 0}
.device-grid{display:grid;grid-template-columns:1fr;gap:10px;}
.device-card{position:relative;border:1px solid var(--tl-border);border-radius:4px;padding:16px 24px 40px;min-width:0;height:160px;display:flex;flex-direction:column;transition:box-shadow .18s;}
.device-card:not(.selected):hover{box-shadow:0 2px 12px 0 rgba(0,0,0,.1)}.device-card.selected{border:2px solid var(--tl-primary);box-shadow:0 0 8px rgba(64,158,255,.3)}.device-card.selectable:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.15)}.device-card.selectable .card-main,.device-card.selectable footer a{pointer-events:none}.card-selection{position:absolute;left:8px;top:3px;z-index:10;opacity:0}.device-card:hover .card-selection,.device-card.selectable .card-selection,.card-selection:focus-within{opacity:1}.card-main{display:flex;gap:16px;color:var(--tl-title);min-width:0;flex:1;}.card-last-seen{margin-left:16px;color:#888}.device-icon{font-size:38px;color:#999;width:47px;height:47px;flex:none}.card-main>div{min-width:0;overflow:hidden;}.card-main strong{display:block;font-size:16px;font-weight:600;line-height:22px;color:#333;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;}.card-main p{font-size:13px;line-height:20px;color:#888;margin:5px 0 0;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;}
.card-device-kind{position:absolute;top:16px;right:20px;height:20px;font-size:18px;color:#888;display:flex;justify-content:flex-end;align-items:center}
.card-device-kind + .card-main strong{padding-right:22px}
.card-groups{display:flex;flex-wrap:nowrap;gap:6px;margin-top:7px;overflow-x:auto;scrollbar-width:none}.card-groups::-webkit-scrollbar{display:none}.card-groups .directory-tag{flex-shrink:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;padding:2px 8px;font-size:12px;line-height:18px;border:1px solid #ececec;border-radius:3px;white-space:nowrap;color:#666;background:#f5f5f5}
.device-card footer{position:absolute;bottom:0;left:24px;right:24px;height:40px;border-top:1px solid #f9f9f9;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:var(--tl-muted);}.device-card footer .card-footer-link{position:absolute;inset:0;}.device-card footer>span{pointer-events:none;display:flex;align-items:center;gap:3px;}.device-card footer a{color:var(--tl-muted);}.device-card footer a:not(.card-footer-link){position:relative;z-index:1;}.device-card footer .is-online{color:#67c23a;}.device-card footer a.is-alarming{color:var(--el-color-danger);}
.device-directory-table{font-size:14px}.device-directory-table :deep(.directory-selection-column .cell){padding:0;text-overflow:clip;}.table-name{display:flex;align-items:center;gap:8px}.table-name .el-icon{color:#999;font-size:20px}.table-key{color:#606266;font-size:12px}.directory-tag{display:inline-block;max-width:100%;padding:0 8px;border:0;border-radius:4px;background:#f5f5f5;color:#363636;font-family:inherit;font-size:12px;line-height:24px;overflow-wrap:anywhere}.group-tags{display:flex;flex-wrap:wrap;gap:4px}.table-online{display:inline-flex;align-items:center;gap:4px;color:#999}.table-online.is-online{color:#67c23a}.table-online.is-disabled,.device-card footer .is-disabled{color:#999}.table-alarm{color:#999}.table-alarm.is-alarming{color:var(--el-color-danger)}.table-name[aria-disabled="true"],.table-alarm[aria-disabled="true"]{pointer-events:none}
.device-directory-table :deep(.cell){padding-left:10px;padding-right:10px}
.device-directory-table :deep(th.el-table__cell){color:#363636;font-weight:700}
.device-directory-table :deep(.directory-kind-column .cell){padding:0;overflow:visible;text-overflow:clip;text-align:center}
.device-directory-table :deep(.el-checkbox){height:23px;margin-right:0}
.device-directory-table .directory-tag{display:inline-flex;align-items:center;height:24px;padding:0 9px;color:#4a4a4a;line-height:18px;white-space:nowrap;overflow-wrap:normal}
@media(min-width:768px){.device-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}@media(min-width:992px){.device-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}@media(min-width:1920px){.device-grid{grid-template-columns:repeat(4,minmax(0,1fr));}}@media(max-width:767px){.device-content{padding:25px 15px 26px;}}
/* 目录独立分组沿原站控件留白与行盒；32高导航组通过外边距保持既有控件基线。 */
.device-content :deep(.tl-pager--grouped){gap:0;margin:26px 0 0;}
.device-content :deep(.tl-pager--grouped .tl-pager__navigation){display:inline-flex;align-items:center;gap:0;padding:2px 5px;white-space:nowrap;}
.device-content :deep(.tl-pager--grouped .tl-pager__navigation>*){margin:0 5px;min-width:30px;height:28px;line-height:28px;}
.device-content :deep(.tl-pager--grouped .tl-pager__navigation>.el-button){width:30px;margin:0 5px;padding:0;border:0;border-radius:2px;background:#f4f4f5;}
.device-content :deep(.tl-pager--grouped .tl-pager__sizes){display:inline-block;white-space:nowrap;font-size:16px;line-height:24px;}
.device-content :deep(.tl-pager--grouped .tl-pager__sizes>.el-select){width:70px!important;}
.device-content :deep(.tl-pager--grouped .el-select__wrapper){height:28px;min-height:28px;}
.device-content :deep(.tl-pager--grouped .tl-pager__size-label){margin-left:8px;font-size:14px;line-height:20px;}
/* 地图占据工具栏与分页之间的剩余视口，避免换行后叠加固定高度。 */
@media(min-width:768px){
 .device-layout--map{height:calc(100vh - 50px);min-height:0;}
 .device-layout--map .device-content{display:flex;flex-direction:column;min-height:0;}
 .device-layout--map .device-content > *{flex-shrink:0;}
 .device-layout--map .device-content > :deep(.directory-map){flex:1;min-height:0;height:auto;}
}
</style>
