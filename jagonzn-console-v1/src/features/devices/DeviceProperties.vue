<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import {useRouter} from 'vue-router'
import AddToDashboardDialog from '../dashboards/AddToDashboardDialog.vue'
import {dashboardPropertyKind,type DashboardAddTarget} from '../dashboards/dashboard-schema'
import {watch,ref,shallowRef,reactive,computed,onScopeDispose,nextTick} from 'vue'
import type {TableInstance} from 'element-plus'
import {api,ApiError,onIdentityChange,IdentityChanged,identityEpoch} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {projectId,can,currentProject} from '@/core/session'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import AsyncState from '@/ui/AsyncState.vue'
import DeviceLearningResource from './DeviceLearningResource.vue'
import {devicesApi} from './api'
import {assertProfile} from './reference-profile'
import type {StrictJsonObject,StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import PropertyHistory from './PropertyHistory.vue'
import PropertyCurve from './PropertyCurve.vue'
import {valueText} from './strict-values'
import {frozenEnumOptions} from './single-property-enum'
import {frozenSwitchEncoding} from './switch-value'
import {decodePlatformCurrent} from './platform-properties-json'
import {readDevicePropertySources,type PropertySourceItem} from './device-property-sources-api'
import {captureBoundPropertyDownlinkModel} from './property-downlink-capabilities-api'
import {platformCurrent} from './platform-properties-api'
import PlatformPropertyAction from './PlatformPropertyAction.vue'
import CurrentPropertyRemovalAction from './CurrentPropertyRemovalAction.vue'
import PropertyHistoryRemovalAction from './PropertyHistoryRemovalAction.vue'
import {Bell,Clock,DataBoard,DataLine,Delete,Document,MoreFilled,RefreshRight as Refresh} from '@element-plus/icons-vue'
const props=defineProps<{deviceId:string;presentation?:'cards'|'table'}>()
const emit=defineEmits<{busy:[value:boolean];'create-alarm':[propertyKey:string]}>()
const downlinkAction=shallowRef<InstanceType<typeof PlatformPropertyAction>>(),cloudAction=shallowRef<InstanceType<typeof PlatformPropertyAction>>(),removalAction=shallowRef<InstanceType<typeof CurrentPropertyRemovalAction>>(),propertyDraftRevision=ref(0)
const propertyActionLocks=reactive({DOWNLINK:false,CLOUD_UPDATE:false,REMOVE:false}),propertyActionGeneration=ref(0)
const propertyActionBlocked=computed(()=>propertyActionLocks.DOWNLINK||propertyActionLocks.CLOUD_UPDATE||propertyActionLocks.REMOVE)
watch(propertyActionBlocked,value=>emit('busy',value),{immediate:true,flush:'sync'})
function resetPropertyLocks(){propertyActionGeneration.value++;propertyActionLocks.DOWNLINK=false;propertyActionLocks.CLOUD_UPDATE=false;propertyActionLocks.REMOVE=false}
function propertyBusy(kind:'DOWNLINK'|'CLOUD_UPDATE'|'REMOVE'){const project=projectId.value,device=props.deviceId,generation=propertyActionGeneration.value,epoch=identityEpoch();return(value:boolean)=>{if(typeof value==='boolean'&&generation===propertyActionGeneration.value&&project===projectId.value&&device===props.deviceId&&epoch===identityEpoch()&&can('device:control'))propertyActionLocks[kind]=value}}
const downlinkBusyListener=computed(()=>propertyBusy('DOWNLINK')),cloudBusyListener=computed(()=>propertyBusy('CLOUD_UPDATE')),removalBusyListener=computed(()=>propertyBusy('REMOVE'))
watch([()=>projectId.value,()=>props.deviceId,()=>can('device:control')],resetPropertyLocks,{flush:'sync'})
onScopeDispose(()=>{resetPropertyLocks();emit('busy',false)})
const accessTypeNames:Readonly<Record<string,string>>={REPORT:'设备上报',DOWNLINK:'云端下发',SHARED:'设备云端共享',CLOUD_PRIVATE:'云端私有'}
const accessTypeColors:Readonly<Record<string,string>>={REPORT:'#F59E0B',DOWNLINK:'#10B981',SHARED:'#3B82F6',CLOUD_PRIVATE:'#EC4899'}
const propertyTable=ref<TableInstance>(),accessTypeFilter=ref<string[]>([])
const accessTypeOptions=Object.entries(accessTypeNames).map(([value,text])=>({value,text}))
function matchesAccessType(value:string,row:{accessType:string}){return row.accessType===value}
const resource=useResource(async signal=>{
 const project=projectId.value,device=props.deviceId,epoch=identityEpoch()
 const profile=await devicesApi.profile(project,device,signal)
 if(signal.aborted)throw new IdentityChanged()
 assertProfile(profile,device)
 if(profile.deviceTypeId===null)return {unbound:true,modelVersionId:undefined,propertyKeys:[],jsonText:undefined,rows:[],deviceName:profile.name,modelDigest:undefined,modelDigestAlgorithm:undefined}
 const binding=await devicesApi.binding(project,device,signal).catch((cause:unknown)=>{
  if(signal.aborted||project!==projectId.value||device!==props.deviceId||epoch!==identityEpoch())throw new IdentityChanged()
  if(cause instanceof ApiError&&cause.status===404&&cause.code===30020&&!cause.outcomeUnknown)throw new ApiError('设备物模型绑定暂不可读取，请刷新核对。',cause.status,cause.code,cause.traceId,cause.outcomeUnknown)
  throw cause
 })
 if(signal.aborted)throw new IdentityChanged()
 if(binding.deviceId!==device||binding.deviceTypeId!==profile.deviceTypeId||!binding.version?.id)throw new Error('设备绑定物模型不可用')
 const snapshot=await api<Schema<'ThingModelSnapshotResponse'>>(`/api/v1/projects/${project}/device-types/${binding.deviceTypeId}/thing-model-versions/${binding.version.id}`,{signal})
 if(snapshot.version?.id!==binding.version.id||snapshot.version.schemaDigest!==binding.version.schemaDigest)throw new Error('冻结模型版本不匹配')
 const model=snapshot.modelSnapshot as Record<string,Record<string,Record<string,unknown>>>
 if(!model?.properties||typeof model.properties!=='object'||Array.isArray(model.properties))throw new Error('属性定义不完整')
 const downlinkModel=captureBoundPropertyDownlinkModel(project,device,binding.deviceTypeId,binding.version,snapshot)
 const keys=Object.keys(model.properties)
 if(keys.length>200)throw new Error('当前模型属性过多，暂时无法完整读取')
 const reported:StrictJsonObject=Object.create(null),occurredAt:Record<string,string>=Object.create(null),sources:Record<string,string>=Object.create(null)
 let received=0
 for(let offset=0;offset<keys.length;offset+=50){
  const chunk=keys.slice(offset,offset+50)
  if(received>=4194304)throw new Error('当前属性响应超过完整读取范围')
  const bytes=await platformCurrent(project,device,binding.version.id,chunk,signal,4194304-received)
  received+=bytes.byteLength;if(received>4194304)throw new Error('当前属性响应超过完整读取范围')
  const current=decodePlatformCurrent(bytes,project,device,binding.version.id,chunk);Object.assign(reported,current.values);Object.assign(occurredAt,current.updatedAt);Object.assign(sources,current.sources)
 }
 // 展示名只用已冻证据；旧工厂没存name时，当前定义另作展示元数据，不回填snapshot或重释值。
 const named=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0
 const currentNames=new Map<string,string>(),visibleKeys=keys.filter(key=>Object.hasOwn(reported,key))
 if(visibleKeys.some(key=>!named(model.properties[key]!.name))){
  const definitions=await api<Schema<'DevicePropertyDefinitionResponse'>[]>(`/api/v1/projects/${project}/device-types/${binding.deviceTypeId}/properties`,{signal,maxResponseBytes:1048576})
  if(!Array.isArray(definitions)||definitions.length>2000)throw new Error('当前属性名称目录不完整')
  const seen=new Set<string>()
  for(const definition of definitions){
   if(!definition||typeof definition!=='object'||Array.isArray(definition)||definition.deviceTypeId!==binding.deviceTypeId||typeof definition.propertyKey!=='string'||!named(definition.name)||seen.has(definition.propertyKey))throw new Error('当前属性名称目录身份不匹配或重复')
   seen.add(definition.propertyKey);currentNames.set(definition.propertyKey,definition.name)
  }
 }
 return {unbound:false,modelVersionId:binding.version.id,propertyKeys:keys,deviceName:profile.name,modelDigest:snapshot.version?.schemaDigest||binding.version.schemaDigest,modelDigestAlgorithm:snapshot.version?.digestAlgorithm||binding.version.digestAlgorithm||'PG_JSONB_TEXT_V1_SHA256',downlinkModel,jsonText:valueText(reported),jsonGroups:['DEVICE_REPORT','PLATFORM_DOWNLINK','PLATFORM_CLOUD_UPDATE'].map(source=>{const group:Record<string,StrictJsonValue>=Object.create(null);for(const [key,value] of Object.entries(reported))if(sources[key]===source)group[key]=value;const entries=Object.entries(group);return entries.length?`{\n${entries.map(([key,value])=>`    ${JSON.stringify(key)}: ${valueText(value)}`).join(',\n')}\n}`:'{}'}),rows:Object.entries(model.properties).filter(([key])=>Object.hasOwn(reported,key)).map(([key,definition])=>({key,
  name:named(definition.name)?definition.name:currentNames.get(key)||'—',nameIsCurrent:!named(definition.name)&&currentNames.has(key),
  dataType:String(definition.dataType||'未知'),switchEncoding:frozenSwitchEncoding(definition),enumOptions:definition.dataType==='ENUM'?frozenEnumOptions(definition):undefined,accessType:String(definition.accessType||'未知'),value:reported[key]===undefined?'—':valueText(reported[key]),updatedAt:occurredAt[key]}))}
})
const json=ref(false),historyKey=ref(''),curveKey=ref(''),selectedKeys=ref<string[]>([])
const jsonSources=shallowRef<readonly PropertySourceItem[]>([]),jsonSourceLoading=ref(false),jsonSourceError=ref<unknown>(null)
let jsonSourceGeneration=0
/** 三段 JSON 单独读取真实来源，不复用“最新来源”合并结果；关闭或身份变化使旧响应失效。 */
async function loadJsonSources(){
 const data=resource.data.value,project=projectId.value,device=props.deviceId,epoch=identityEpoch()
 if(!project||!data?.modelVersionId||!data.propertyKeys.length)return
 const generation=++jsonSourceGeneration
 jsonSourceLoading.value=true;jsonSourceError.value=null;jsonSources.value=[]
 try{
  const items:PropertySourceItem[]=[]
  for(let offset=0;offset<data.propertyKeys.length;offset+=50)
   items.push(...await readDevicePropertySources(project,device,data.modelVersionId,data.propertyKeys.slice(offset,offset+50)))
  if(generation!==jsonSourceGeneration||!json.value||project!==projectId.value||device!==props.deviceId||epoch!==identityEpoch())return
  jsonSources.value=Object.freeze(items)
 }catch(cause){
  if(generation!==jsonSourceGeneration)return
  jsonSourceError.value=cause instanceof IdentityChanged?new Error('页面身份已变化，请重新打开属性 JSON'):cause
 }finally{if(generation===jsonSourceGeneration)jsonSourceLoading.value=false}
}
const jsonSourceGroups=computed(()=>{
 const groups:[Record<string,StrictJsonValue>,Record<string,StrictJsonValue>,Record<string,StrictJsonValue>]=[Object.create(null),Object.create(null),Object.create(null)]
 for(const item of jsonSources.value){
  if(item.reported.state==='VALUE')groups[0]![item.propertyKey]=item.reported.value!
  if(item.downlink.state==='VALUE')groups[1]![item.propertyKey]=item.downlink.value!
  if(item.cloud.state==='VALUE')groups[2]![item.propertyKey]=item.cloud.value!
 }
 return groups.map(group=>{const entries=Object.entries(group);return entries.length?`{\n${entries.map(([key,value])=>`    ${JSON.stringify(key)}: ${valueText(value)}`).join(',\n')}\n}`:'{}'})
})
watch(json,open=>{if(open)void loadJsonSources();else{jsonSourceGeneration++;jsonSources.value=[];jsonSourceError.value=null;jsonSourceLoading.value=false}},{flush:'sync'})
const router=useRouter()
const dashboardOpen=ref(false),dashboardTarget=shallowRef<DashboardAddTarget>()
const dashboardCapable=computed(()=>can('dashboard_definition:manage')&&currentProject.value?.status==='ACTIVE')
function dashboardAvailable(row:{key:string;name:string;dataType:string}){
 return dashboardCapable.value&&!!resource.data.value?.modelVersionId&&!!resource.data.value?.modelDigest&&!!dashboardPropertyKind(row.dataType)
}
function dashboardUnavailableReason(row:{key:string;name:string;dataType:string}){
 if(!can('dashboard_definition:manage'))return '当前账号没有管理看板定义的权限'
 if(!resource.data.value?.modelVersionId||!resource.data.value?.modelDigest)return '当前模型摘要不可用，暂不能加入看板'
 if(!dashboardPropertyKind(row.dataType))return '当前属性类型暂不支持加入看板'
 return ''
}
function openDashboard(row:{key:string;name:string;dataType:string}){
 if(!dashboardAvailable(row))return
 const data=resource.data.value
 if(!data?.modelVersionId||!data.modelDigest)return
 dashboardTarget.value=Object.freeze({deviceId:props.deviceId,deviceName:data.deviceName||props.deviceId,propertyKey:row.key,propertyName:row.name==='—'?row.key:row.name,dataType:row.dataType,modelVersionId:data.modelVersionId,modelDigest:data.modelDigest,modelDigestAlgorithm:data.modelDigestAlgorithm||'PG_JSONB_TEXT_V1_SHA256'})
 dashboardOpen.value=true
}
function openDashboardByKey(key:string){const row=resource.data.value?.rows.find(item=>item.key===key);if(row)openDashboard(row)}
function dashboardSaved(id:string){void router.push(`/dashboards/${id}`)}
const propertyDetail=shallowRef<Readonly<{key:string;name:string;nameIsCurrent:boolean;value:string;project:string;device:string;epoch:number;modelVersionId:string}>>()
const copyPending=ref(false)
const propertyDetailAvailable=computed(()=>can('device:read')&&!propertyActionBlocked.value&&!resource.loading.value&&!resource.error.value&&!!resource.data.value?.modelVersionId)
function closePropertyDetail(){propertyDetail.value=undefined;copyPending.value=false}
function openPropertyDetail(key:string){
 if(!propertyDetailAvailable.value)return
 const current=resource.data.value,row=current?.rows.find(item=>item.key===key)
 if(!current?.modelVersionId||!row||!['OBJECT','LIST','DAILY_TIMER','DAILY_TIMER_RANGE','DAILY_TIMER_DURATION','DAILY_TIMER_INTERVAL','DAILY_TIMER_LIST','DAILY_TIMER_RANGE_LIST','DAILY_TIMER_DURATION_LIST','DAILY_TIMER_INTERVAL_LIST'].includes(row.dataType))return
 closePropertyDetail()
 // 直接冻结同源展示字符串，不解析重序列化，保留大整数和小数的原始词法。
 propertyDetail.value=Object.freeze({key:row.key,name:row.name,nameIsCurrent:row.nameIsCurrent,value:row.value,project:projectId.value,device:props.deviceId,epoch:identityEpoch(),modelVersionId:current.modelVersionId})
}
async function copyPropertyDetail(){
 const snapshot=propertyDetail.value
 const current=()=>!!snapshot&&propertyDetail.value===snapshot&&propertyDetailAvailable.value&&snapshot.project===projectId.value&&snapshot.device===props.deviceId&&snapshot.epoch===identityEpoch()&&snapshot.modelVersionId===resource.data.value?.modelVersionId
 if(!current()||copyPending.value)return
 copyPending.value=true
 try{
  if(typeof navigator.clipboard?.writeText!=='function'){copyFailed('当前浏览器无法访问剪贴板，请手动复制 JSON。');return}
  await navigator.clipboard.writeText(snapshot!.value)
  if(current())copySucceeded()
 }catch{if(current())copyFailed('复制失败，请检查剪贴板权限后重试。')}
 finally{if(current())copyPending.value=false}
}
// 当前投影变更、写操作占用或撤权都关闭只读详情，旧剪贴板承诺不得回填新作用域。
watch([()=>resource.data.value,()=>resource.loading.value,()=>resource.error.value,()=>can('device:read'),propertyActionBlocked],closePropertyDetail,{flush:'sync'})
onScopeDispose(closePropertyDetail)
function singlePropertyKind(access:string){return access==='DOWNLINK'||access==='SHARED'?'DOWNLINK':access==='CLOUD_PRIVATE'?'CLOUD_UPDATE':undefined}
const singlePropertyWritable=computed(()=>propertyDetailAvailable.value&&can('device:control')&&currentProject.value?.status==='ACTIVE')
function startSingleProperty(key:string){
 if(!singlePropertyWritable.value)return
 const current=resource.data.value,row=current?.rows.find(item=>item.key===key)
 if(!current?.modelVersionId||!row)return
 const kind=singlePropertyKind(row.accessType);if(!kind)return
 const snapshot=Object.freeze({project:projectId.value,device:props.deviceId,epoch:identityEpoch(),model:current.modelVersionId,key:row.key,name:row.name,nameIsCurrent:row.nameIsCurrent,accessType:row.accessType,dataType:row.dataType,switchEncoding:row.switchEncoding,value:row.value,enumOptions:row.enumOptions})
 ;(kind==='DOWNLINK'?downlinkAction.value:cloudAction.value)?.startSingle(snapshot)
}
async function propertyCardCommand(command:string,key:string){
 if(command==='dashboard'){openDashboardByKey(key);return}
 if(command==='update'){startSingleProperty(key);return}
 if(command==='json'){openPropertyDetail(key);return}
 if(command==='alarm'){if(can('alarm:manage'))emit('create-alarm',key);return}
 if(command==='remove'&&can('device:control')&&singlePropertyWritable.value){selectedKeys.value=[key];await nextTick();removalAction.value?.start()}
}
watch([()=>resource.data.value,()=>resource.loading.value,()=>resource.error.value],()=>{propertyDraftRevision.value++},{flush:'sync'})
const curveProperties=computed(()=>resource.data.value?.rows.filter(row=>row.dataType==='NUMBER')||[])
function curveUnavailable(cause:unknown){closePropertyDetail();resource.clear();resource.error.value=cause;json.value=false;historyKey.value='';curveKey.value='';selectedKeys.value=[]}
const disposePropertyIdentity=onIdentityChange(()=>{resetAccessTypeFilter();closePropertyDetail();resetPropertyLocks();json.value=false;historyKey.value='';curveKey.value='';selectedKeys.value=[]})
onScopeDispose(disposePropertyIdentity)
// 筛选只改变表格视图；完整JSON与已冻结写入原件保持独立，隐藏行不沿旧选择进入新删除。
function clearPropertySelection(){selectedKeys.value=[];propertyTable.value?.clearSelection()}
function openAccessTypeFilter(event:Event){
 const target=event.currentTarget
 if(target instanceof HTMLElement)target.closest('th')?.querySelector<HTMLElement>('.el-table__column-filter-trigger')?.click()
}
function changeAccessTypeFilter(filters:Record<string,string[]>){accessTypeFilter.value=[...(filters.accessType||[])];clearPropertySelection()}
function resetAccessTypeFilter(){accessTypeFilter.value=[];clearPropertySelection();propertyTable.value?.clearFilter('accessType')}
function selectRows(rows:Array<{key:string}>){selectedKeys.value=rows.filter(row=>resource.data.value?.rows.some(current=>current.key===row.key&&(!accessTypeFilter.value.length||accessTypeFilter.value.includes(current.accessType)))).map(row=>row.key)}
watch([()=>resource.data.value,()=>can('device:read'),()=>can('device:control')],resetAccessTypeFilter,{flush:'sync'})
function reload(){closePropertyDetail();selectedKeys.value=[];json.value=false;historyKey.value='';curveKey.value='';resource.clear();if(projectId.value)void resource.reload()}
watch(()=>[projectId.value,props.deviceId],()=>{historyKey.value='';curveKey.value='';reload()},{immediate:true})
</script>
<template><DeviceLearningResource v-if="presentation!=='cards'" kind="property"/><div class="tl-toolbar" :class="{'property-cards-toolbar':presentation==='cards','is-empty':presentation==='cards'&&!resource.loading.value&&!resource.error.value&&!resource.data.value?.unbound&&!resource.data.value?.rows.length}"><h2 v-if="presentation==='cards'">当前属性</h2><el-button v-if="presentation!=='cards'" :disabled="!resource.data.value?.modelVersionId||resource.loading.value||!!resource.error.value||propertyActionBlocked" @click="json=true"><span class="reference-icon property-icon-json" aria-hidden="true"/>查看属性 JSON</el-button><PlatformPropertyAction ref="downlinkAction" :hide-trigger="presentation==='cards'" :draft-revision="propertyDraftRevision" :device-id="deviceId" :model-version-id="resource.data.value?.modelVersionId" :bound-downlink-model="resource.data.value?.downlinkModel" kind="DOWNLINK" @busy="downlinkBusyListener" :disabled="!resource.data.value?.modelVersionId||resource.loading.value||!!resource.error.value||propertyActionBlocked" @saved="reload"/><PlatformPropertyAction ref="cloudAction" :hide-trigger="presentation==='cards'" :draft-revision="propertyDraftRevision" :device-id="deviceId" :model-version-id="resource.data.value?.modelVersionId" kind="CLOUD_UPDATE" @busy="cloudBusyListener" :disabled="!resource.data.value?.modelVersionId||resource.loading.value||!!resource.error.value||propertyActionBlocked" @saved="reload"/><CurrentPropertyRemovalAction ref="removalAction" @busy="removalBusyListener" :hide-trigger="presentation==='cards'" :device-id="deviceId" :model-version-id="resource.data.value?.modelVersionId" :keys="selectedKeys" :disabled="!resource.data.value?.modelVersionId||resource.loading.value||!!resource.error.value||propertyActionBlocked" @saved="reload"/><PropertyHistoryRemovalAction v-if="presentation!=='cards'&&can('device:delete')" :device-id="deviceId" @changed="historyKey='';curveKey=''" @unavailable="curveUnavailable"/><el-button class="property-refresh" :icon="Refresh" :size="presentation==='cards'?'small':'default'" @click="reload">刷新</el-button></div><AsyncState :loading="resource.loading.value" :error="resource.error.value" @retry="reload"><p v-if="resource.data.value?.unbound" role="status" class="tl-muted">设备尚未绑定设备类型，模型属性暂不可读取。</p><div v-else-if="presentation==='cards'&&resource.data.value?.rows.length" class="property-cards"><article v-for="row in resource.data.value?.rows" :key="row.key"><header><span class="property-card-name" :title="`${row.name} (${row.key})`">{{row.name}} <span class="tl-muted">({{row.key}})</span></span><span class="property-card-actions"><el-tooltip content="查看历史数据"><el-button link :icon="Clock" aria-label="查看历史数据" @click="historyKey=row.key"/></el-tooltip><el-tooltip v-if="row.dataType==='NUMBER'" content="查看时序图表"><el-button link :icon="DataLine" aria-label="查看时序图表" @click="curveKey=row.key"/></el-tooltip><el-dropdown class="property-card-more" trigger="click" popper-class="property-card-menu" @command="(command:string)=>propertyCardCommand(command,row.key)"><el-button link :icon="MoreFilled" :aria-label="`更多属性操作：${row.key}`"/><template #dropdown><el-dropdown-menu><el-dropdown-item command="dashboard" :disabled="!dashboardAvailable(row)" :title="dashboardUnavailableReason(row)"><el-icon><DataBoard/></el-icon>加入看板</el-dropdown-item><el-dropdown-item v-if="can('alarm:manage')" command="alarm"><el-icon><Bell/></el-icon>创建告警规则</el-dropdown-item><el-dropdown-item v-if="can('device:control')&&singlePropertyKind(row.accessType)" command="update"><el-icon><DataLine/></el-icon>{{singlePropertyKind(row.accessType)==='DOWNLINK'?'下发属性':'更新云端属性'}}</el-dropdown-item><el-dropdown-item v-if="['OBJECT','LIST','DAILY_TIMER','DAILY_TIMER_RANGE','DAILY_TIMER_DURATION','DAILY_TIMER_INTERVAL','DAILY_TIMER_LIST','DAILY_TIMER_RANGE_LIST','DAILY_TIMER_DURATION_LIST','DAILY_TIMER_INTERVAL_LIST'].includes(row.dataType)" command="json"><el-icon><Document/></el-icon>查看属性 JSON</el-dropdown-item><el-dropdown-item v-if="can('device:control')" command="remove" divided><el-icon><Delete/></el-icon>移除该属性值</el-dropdown-item></el-dropdown-menu></template></el-dropdown></span></header><strong>{{row.value}}</strong><footer><time>{{formatTime(row.updatedAt)}}</time></footer></article></div><el-table v-else-if="presentation!=='cards'" class="tl-device-detail-table" ref="propertyTable" :data="resource.data.value?.rows||[]" empty-text="暂无数据" @selection-change="selectRows" @filter-change="changeAccessTypeFilter"><el-table-column v-if="can('device:control')" type="selection" width="55"/><el-table-column label="属性类型" min-width="120" column-key="accessType" :filters="accessTypeOptions" :filter-method="matchesAccessType" :filtered-value="accessTypeFilter"><template #header><button type="button" class="property-filter-heading" @click.stop="openAccessTypeFilter">属性类型</button></template><template #default="{row}"><el-tag v-if="accessTypeNames[row.accessType]" effect="dark" :color="accessTypeColors[row.accessType]" :style="{color:'#fff',borderColor:accessTypeColors[row.accessType]}" size="small">{{accessTypeNames[row.accessType]}}</el-tag><span v-else>—</span></template></el-table-column><el-table-column prop="key" label="属性标识符" min-width="140" sortable/><el-table-column label="属性名称" min-width="140"><template #default="{row}"><el-tooltip v-if="row.nameIsCurrent" content="当前属性定义名称" placement="top"><span>{{row.name}}</span></el-tooltip><span v-else>{{row.name}}</span></template></el-table-column><el-table-column label="属性值" min-width="160"><template #default="{row}"><span>{{row.value}}</span><el-button v-if="['OBJECT','LIST','DAILY_TIMER','DAILY_TIMER_RANGE','DAILY_TIMER_DURATION','DAILY_TIMER_INTERVAL','DAILY_TIMER_LIST','DAILY_TIMER_RANGE_LIST','DAILY_TIMER_DURATION_LIST','DAILY_TIMER_INTERVAL_LIST'].includes(row.dataType)" link type="primary" class="property-value-json" :aria-label="`查看属性 JSON：${row.key}`" :disabled="!propertyDetailAvailable" @click="openPropertyDetail(row.key)">JSON</el-button></template></el-table-column><el-table-column label="更新时间" min-width="180"><template #default="{row}">{{formatTime(row.updatedAt)}}</template></el-table-column><el-table-column label="历史数据" width="90" align="center"><template #default="{row}"><el-tooltip content="查看历史数据"><el-button link class="property-history-button" aria-label="查看历史数据" @click="historyKey=row.key"><span class="reference-icon property-history-icon" aria-hidden="true">󰋚</span></el-button></el-tooltip></template></el-table-column><el-table-column label="图表分析" width="90" align="center"><template #default="{row}"><el-tooltip v-if="row.dataType==='NUMBER'" content="查看时序图表"><el-button link class="property-chart-button" aria-label="查看时序图表" @click="curveKey=row.key"><span class="reference-icon property-chart-icon" aria-hidden="true">󰺓</span></el-button></el-tooltip></template></el-table-column><el-table-column label="加入看板" width="90" align="center"><template #default="{row}"><el-tooltip :content="dashboardAvailable(row)?'将当前属性加入看板':'当前属性暂不可加入看板'"><span><el-button link class="property-dashboard-button" aria-label="加入看板" :disabled="!dashboardAvailable(row)" @click="openDashboard(row)"><span class="reference-icon property-dashboard-icon" aria-hidden="true">󰨇</span></el-button></span></el-tooltip></template></el-table-column><el-table-column label="操作" width="80" align="center"><template #default="{row}"><el-button v-if="can('device:control')&&singlePropertyKind(row.accessType)" link type="primary" :aria-label="`${singlePropertyKind(row.accessType)==='DOWNLINK'?'下发属性':'更新云端属性'}：${row.key}`" :disabled="!singlePropertyWritable" @click="startSingleProperty(row.key)">{{singlePropertyKind(row.accessType)==='DOWNLINK'?'下发':'更新'}}</el-button></template></el-table-column></el-table></AsyncState><PropertyHistory v-if="historyKey&&resource.data.value?.modelVersionId" :device-id="deviceId" :property-key="historyKey" :model-version-id="resource.data.value.modelVersionId" :data-type="resource.data.value.rows.find(row=>row.key===historyKey)?.dataType" :property-name="resource.data.value.rows.find(row=>row.key===historyKey)?.name==='—'?undefined:resource.data.value.rows.find(row=>row.key===historyKey)?.name" @unavailable="curveUnavailable" @close="historyKey=''" /><PropertyCurve v-if="curveKey&&resource.data.value?.modelVersionId" :device-id="deviceId" :property-key="curveKey" :model-version-id="resource.data.value.modelVersionId" :properties="curveProperties" @unavailable="curveUnavailable" @close="curveKey=''" /><el-dialog v-if="propertyDetail" :model-value="true" title="属性详情" width="min(720px,94vw)" @close="closePropertyDetail"><div class="property-value-detail"><dl><dt>属性标识符</dt><dd>{{propertyDetail.key}}</dd><dt>属性名称</dt><dd>{{propertyDetail.name}}<small v-if="propertyDetail.nameIsCurrent" class="tl-muted">（当前属性定义名称）</small></dd><dt>属性值</dt><dd><pre>{{propertyDetail.value}}</pre></dd></dl><div class="property-value-detail-actions"><el-button :disabled="copyPending||!propertyDetailAvailable" @click="copyPropertyDetail">复制 JSON</el-button><el-button @click="closePropertyDetail">关闭</el-button></div></div></el-dialog><el-dialog v-model="json" title="查看属性 JSON" width="min(600px,94vw)" class="property-json-dialog"><p class="property-json-note">按真实来源分别展示各自最近的属性值；共享属性可能同时出现在多个来源，某来源无值时显示为空对象。</p><AsyncState :loading="jsonSourceLoading" :error="jsonSourceError" @retry="loadJsonSources"><section v-for="(label,index) in ['设备上报属性','云端下发属性','云端私有属性']" :key="label" class="property-json-group"><div>{{label}}</div><pre>{{jsonSourceGroups[index]||'{}'}}</pre></section></AsyncState></el-dialog><AddToDashboardDialog v-if="dashboardTarget" v-model="dashboardOpen" :target="dashboardTarget" @saved="dashboardSaved"/></template>
<style scoped>
.property-cards-toolbar.is-empty{margin-bottom:0}
.property-filter-heading{border:0;padding:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
.property-history-button{padding:0;color:#606266}.property-history-icon{font-size:18px;line-height:1}
.property-chart-button{padding:0;color:#606266}.property-chart-icon{font-size:18px;line-height:1}
.property-dashboard-button{padding:0;color:#909399}.property-dashboard-icon{font-size:18px;line-height:1}
.property-json-note{margin:0 0 16px;color:#909399;font-size:12px}.property-json-group{margin-bottom:24px}.property-json-group:last-child{margin-bottom:0}.property-json-group>div{margin-bottom:6px;color:#909399;font-size:14px;line-height:20px}.property-json-group pre{margin:0;padding:8px;background:#252526;color:#fff;font:600 14px/21px monospace;max-height:40vh;overflow:auto}
.property-value-json{margin-left:8px}.property-value-detail dl{margin:0}.property-value-detail dt{font-weight:500;margin-top:14px}.property-value-detail dd{margin:6px 0;overflow-wrap:anywhere}.property-value-detail pre{margin:0;padding:12px;background:var(--tl-background,#f5f7fa);border-radius:4px}.property-value-detail-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.property-value-detail [role="alert"]{color:var(--el-color-danger)}
.tl-toolbar:not(.property-cards-toolbar) > .property-refresh{margin-left:auto}
.tl-toolbar:not(.property-cards-toolbar){gap:10px}
.tl-toolbar:not(.property-cards-toolbar) :deep(.el-button + .el-button){margin-left:0}
.tl-toolbar:not(.property-cards-toolbar) :deep(.reference-icon){font-size:14px;margin-right:5px}
.tl-toolbar:not(.property-cards-toolbar) :deep(.property-icon-json::before){content:"󰘦"}
.tl-toolbar:not(.property-cards-toolbar) :deep(.property-icon-downlink::before){content:"󰭽"}
.tl-toolbar:not(.property-cards-toolbar) :deep(.property-icon-cloud::before){content:"󱋖"}
.tl-toolbar:not(.property-cards-toolbar) :deep(.el-button){height:32px;padding:9px 15px;font-size:12px;line-height:1;border-radius:3px}
.el-table :deep(.el-tag){height:24px;padding:0 9px;border-width:0;border-radius:4px;font-size:12px;line-height:18px}
.property-cards-toolbar{justify-content:flex-end;margin-top:14px}.property-cards-toolbar h2{font-size:22px;line-height:32px;font-weight:400;color:#002822;margin:0 auto 0 0}.property-cards{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.property-cards article{border:1px solid var(--tl-border);border-radius:4px;padding:20px;min-height:145px;position:relative;box-shadow:0 2px 12px 0 transparent;transition:box-shadow .3s}.property-cards article:hover{box-shadow:0 2px 12px 0 rgba(0,0,0,.1)}.property-cards header{display:flex;align-items:center;gap:12px;font-size:14px;line-height:20px;color:var(--tl-title)}.property-card-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}.property-card-name .tl-muted{color:#999}.property-card-actions{display:flex;gap:7px;align-items:center;flex:none}.property-card-actions>.el-button,.property-card-more>.el-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:18px;min-width:18px;height:27px;min-height:27px;padding:0;margin:0;color:#606266;line-height:1}.property-card-actions .el-icon{font-size:18px;line-height:1}.property-card-more{display:inline-flex;width:25px;height:27px;align-items:center;justify-content:center}.property-card-more>.el-button{width:25px;min-width:25px}:global(.property-card-menu.el-popper){box-sizing:border-box;width:145px;min-width:145px;padding:10px 0}:global(.property-card-menu .el-dropdown-menu__item){height:40px;padding:0 14px;font-size:16px;line-height:40px;color:#4a4a4a}:global(.property-card-menu .el-dropdown-menu__item .el-icon){width:18px;margin-right:7px;font-size:14px}.property-cards strong{display:block;font-size:30px;font-weight:400;line-height:50px;color:var(--tl-title);margin:5px 0;overflow-wrap:anywhere}.property-cards footer{position:absolute;bottom:15px;left:0;right:0;padding:0 20px;height:25px;display:flex;justify-content:flex-end;align-items:center;font-size:12px;color:var(--tl-muted);min-height:18px}.property-cards time{overflow-wrap:anywhere}@media(min-width:768px){.property-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:992px){.property-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:1200px){.property-cards{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(min-width:1920px){.property-cards{grid-template-columns:repeat(6,minmax(0,1fr))}}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:60vh;overflow:auto;}
</style>
