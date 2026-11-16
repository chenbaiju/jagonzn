<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import { ref, reactive, watch, computed, onScopeDispose } from 'vue'
import {QuestionFilled} from '@element-plus/icons-vue'
import {pageAlarmStatus,alarmLabel} from './page-alarm-status'
import { useRoute,useRouter } from 'vue-router'
import {session, can, projectId, currentProject } from '@/core/session'
import { useResource } from '@/core/use-resource'
import { ApiError, IdentityChanged, errorMessage, identityEpoch, assertIdentity, onIdentityChange } from '@/core/http'
import PageHeader from '@/ui/PageHeader.vue'
import {groupReturnPath} from '@/features/device-groups/group-return'
import {ruleDetailReturnPath} from '@/features/rules/rule-detail-return'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import DirectoryGlyph from './DirectoryGlyph.vue'
import AsyncState from '@/ui/AsyncState.vue'
import SectionPanel from '@/ui/SectionPanel.vue'
import DeviceAutomationDefinitions from '../rules/DeviceAutomationDefinitions.vue'
import DeviceTaskDefinitions from '../rules/DeviceTaskDefinitions.vue'
import {deviceTaskDefinitionApi} from '../rules/device-task-definition-api'
import DeviceRuleDefinitions from '../rules/DeviceRuleDefinitions.vue'
import {deviceRuleDefinitionApi} from '../rules/device-rule-definition-api'
import DeviceSceneDefinitions from '../rules/DeviceSceneDefinitions.vue'
import {deviceSceneDefinitionApi} from '../rules/device-scene-definition-api'
import DeviceDiagnostics from './DeviceDiagnostics.vue'
import DeviceAlarms from './DeviceAlarms.vue'
import DeviceLearningResource from './DeviceLearningResource.vue'
import DeviceMaintenanceDialog from './DeviceMaintenanceDialog.vue'
import DeviceCodeDialog from './DeviceCodeDialog.vue'
import {useDeviceMaintenanceAction} from './use-device-maintenance-action'
import DeviceCommands from './DeviceCommands.vue'
import DeviceEvents from './DeviceEvents.vue'
import DeviceUserAssociations from './DeviceUserAssociations.vue'
import DeviceLocation from './DeviceLocation.vue'
import DevicePlanarPosition from './DevicePlanarPosition.vue'
import DeviceCameraReference from './DeviceCameraReference.vue'
import DeviceIccidInformation from './DeviceIccidInformation.vue'
import DeviceLogicalPresence from './DeviceLogicalPresence.vue'
import DeviceExtensionValues from './DeviceExtensionValues.vue'
import DeviceTags from './DeviceTags.vue'
import DeviceTypeAssignment from './DeviceTypeAssignment.vue'
import DeviceTypeAdaptationStatus from './DeviceTypeAdaptationStatus.vue'
import DeviceModel from './DeviceModel.vue'
import DeviceStaticGroupMemberships from './DeviceStaticGroupMemberships.vue'
import DeviceProperties from './DeviceProperties.vue'
import DeviceOverview from './DeviceOverview.vue'
import DeviceConnectionAccess from './DeviceConnectionAccess.vue'
import DeviceDataStreamRuntime from './DeviceDataStreamRuntime.vue'
import GatewaySubDevices from './GatewaySubDevices.vue'
import {useDeviceGuard,isDeviceScopeCurrent} from './use-device-guard'
import {referenceDeviceTabs,referenceDeviceTab} from '@/core/replica-scope'
import { devicesApi } from './api'
import {assertProfile,sameProfile,changeProfileBody,type ValidDeviceProfile} from './reference-profile'
const businessKeyHelp='设备唯一标识创建后不可修改，用于设备接入。'
const emit=defineEmits<{'create-user':[];'open-user':[appUserId:string];'open-users':[];'manage-apps':[]}>()
const route=useRoute(),router=useRouter(),id=ref(''),tab=ref('overview'),dialog=ref(''),busy=ref(false),error=ref(''),unknown=ref(false)
type ActionSource='scenes'|'debug'|'commands'|'properties'|'users'|'model'|'location'|'planar'|'camera'|'iccid'|'data'|'topology'
const actionBlocked=reactive<Record<ActionSource,boolean>>({scenes:false,debug:false,commands:false,properties:false,users:false,model:false,location:false,planar:false,camera:false,iccid:false,data:false,topology:false}),actionEpoch=ref(identityEpoch()),actionGeneration=ref(0),actionNavigationAttempted=ref(false)
const topologyMount=ref<HTMLElement>()
const denied=ref(false),readable=computed(()=>can('device:read')&&!denied.value)
const sceneWriteBlocked=computed(()=>actionBlocked.scenes&&readable.value&&actionEpoch.value===identityEpoch())
const messageWriteBlocked=computed(()=>(actionBlocked.debug||actionBlocked.commands||actionBlocked.properties)&&readable.value&&actionEpoch.value===identityEpoch())
const associationWriteBlocked=computed(()=>actionBlocked.users&&readable.value&&actionEpoch.value===identityEpoch())
const modelWriteBlocked=computed(()=>actionBlocked.model&&readable.value&&actionEpoch.value===identityEpoch())
const locationWriteBlocked=computed(()=>(actionBlocked.location||actionBlocked.planar||actionBlocked.camera||actionBlocked.iccid)&&readable.value&&actionEpoch.value===identityEpoch())
const dataWriteBlocked=computed(()=>actionBlocked.data&&readable.value&&actionEpoch.value===identityEpoch())
const topologyWriteBlocked=computed(()=>actionBlocked.topology&&actionEpoch.value===identityEpoch())
const actionWriteBlocked=computed(()=>topologyWriteBlocked.value||sceneWriteBlocked.value||messageWriteBlocked.value||associationWriteBlocked.value||modelWriteBlocked.value||locationWriteBlocked.value||dataWriteBlocked.value)
const actionNavigationBlocked=computed(()=>sceneWriteBlocked.value&&can('rule:manage')&&currentProject.value?.status==='ACTIVE'||messageWriteBlocked.value&&can('device:control')||associationWriteBlocked.value&&can('enduser:read')&&can('enduser:manage')||modelWriteBlocked.value||locationWriteBlocked.value||dataWriteBlocked.value||topologyWriteBlocked.value)
const canEdit=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&!actionWriteBlocked.value),canRemove=computed(()=>readable.value&&can('device:delete')&&currentProject.value?.status==='ACTIVE'&&!actionWriteBlocked.value)
function resetActionLocks(preserveTopology=false){actionGeneration.value++;actionBlocked.scenes=false;actionBlocked.debug=false;actionBlocked.commands=false;actionBlocked.properties=false;actionBlocked.users=false;actionBlocked.model=false;actionBlocked.location=false;actionBlocked.planar=false;actionBlocked.camera=false;actionBlocked.iccid=false;actionBlocked.data=false;if(!preserveTopology)actionBlocked.topology=false;actionNavigationAttempted.value=false}
function scopedBusyListener(source:ActionSource){const sourceTab=source==='properties'&&tab.value==='overview'?'overview':source==='model'?'settings':source==='location'||source==='planar'||source==='camera'||source==='iccid'?'info':source==='data'?'connection':source==='topology'?'subdevices':source,project=projectId.value,device=id.value,epoch=actionEpoch.value,generation=actionGeneration.value;return (value:boolean)=>{if(typeof value!=='boolean'||tab.value!==sourceTab||generation!==actionGeneration.value||epoch!==identityEpoch()||epoch!==actionEpoch.value||project!==projectId.value||device!==id.value||!readable.value)return;actionBlocked[source]=value;if(!value)actionNavigationAttempted.value=false}}
const sceneBusyListener=computed(()=>scopedBusyListener('scenes')),diagnosticBusyListener=computed(()=>scopedBusyListener('debug')),commandBusyListener=computed(()=>scopedBusyListener('commands')),propertyBusyListener=computed(()=>scopedBusyListener('properties')),associationBusyListener=computed(()=>scopedBusyListener('users')),modelBusyListener=computed(()=>scopedBusyListener('model')),locationBusyListener=computed(()=>scopedBusyListener('location')),planarBusyListener=computed(()=>scopedBusyListener('planar')),cameraBusyListener=computed(()=>scopedBusyListener('camera')),iccidBusyListener=computed(()=>scopedBusyListener('iccid')),dataBusyListener=computed(()=>scopedBusyListener('data'))
const topologyBusyListener=computed(()=>{const project=projectId.value,device=id.value,account=session.user?.accountId,epoch=actionEpoch.value;return(value:boolean)=>{if(typeof value!=='boolean'||project!==projectId.value||device!==id.value||account!==session.user?.accountId||epoch!==identityEpoch()||epoch!==actionEpoch.value)return;actionBlocked.topology=value;if(!value)actionNavigationAttempted.value=false}})
watch(tab,(value,previous)=>{if(value!==previous)resetActionLocks(topologyWriteBlocked.value)},{flush:'sync'})
const removeActionNavigationGuard=typeof router.beforeEach==='function'?router.beforeEach((to,from)=>{if(!actionNavigationBlocked.value||to.fullPath===from.fullPath)return true;actionNavigationAttempted.value=true;return false}):undefined
onScopeDispose(()=>removeActionNavigationGuard?.())
function beforeActionUnload(event:BeforeUnloadEvent){if(actionNavigationBlocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeActionUnload)
onScopeDispose(()=>window.removeEventListener('beforeunload',beforeActionUnload))
let editGeneration=0
let editSnapshot:Readonly<ValidDeviceProfile>|undefined
function closeDialog(){editGeneration++;dialog.value='';editSnapshot=undefined}
function beforeEditClose(done:()=>void){closeDialog();done()}
const form=reactive({name:'',businessKey:'',description:''})
const disposeProfileIdentity=onIdentityChange(()=>{actionEpoch.value=identityEpoch();resetActionLocks();closeDialog();Object.assign(form,{name:'',businessKey:'',description:''});error.value='';unknown.value=false})
onScopeDispose(disposeProfileIdentity)
const resource=useResource(signal=>devicesApi.read(projectId.value,id.value,signal))
const profile=useResource(async signal=>{const value=await devicesApi.profile(projectId.value,id.value,signal);assertProfile(value,id.value);return value})
const effectiveTypeId=computed(()=>profile.data.value?profile.data.value.deviceTypeId:resource.data.value?.deviceTypeId)
const access=useResource(signal=>devicesApi.access(projectId.value,id.value,signal))
const deviceType=useResource(signal=>devicesApi.type(projectId.value,effectiveTypeId.value||'',signal))
const alarmStatus=useResource(signal=>pageAlarmStatus(projectId.value,[id.value],signal))
/** 明确解除只使原摘要失效，仍按权威读面判断是否存在其它事故。 */
function refreshAlarmStatus(project:string,device:string){
 if(!readable.value||tab.value!=='alarms'||project!==projectId.value||device!==id.value||resource.data.value?.id!==device)return
 alarmStatus.clear();void alarmStatus.reload()
}
watch(effectiveTypeId,()=>{deviceType.clear();if(readable.value&&effectiveTypeId.value)void deviceType.reload()})
watch(resource.data,value=>{alarmStatus.clear();if(readable.value&&value?.id)void alarmStatus.reload()})
const idCopyPending=ref(false)
let idCopyGeneration=0
function clearIdCopy(){idCopyGeneration++;idCopyPending.value=false}
watch([id,()=>projectId.value,()=>session.user?.accountId,readable,()=>resource.data.value?.id],clearIdCopy,{flush:'sync'})
onScopeDispose(clearIdCopy)
/** 兼容内嵌浏览器的用户点击复制，临时选区结束后恢复焦点。 */
function copyIdSelection(value:string){
 if(typeof document.execCommand!=='function')return false
 const field=document.createElement('textarea'),focus=document.activeElement instanceof HTMLElement?document.activeElement:undefined,selection=document.getSelection(),ranges=selection?Array.from({length:selection.rangeCount},(_,index)=>selection.getRangeAt(index).cloneRange()):[]
 field.value=value;field.readOnly=true;field.setAttribute('aria-hidden','true');field.style.cssText='position:fixed;top:0;left:0;opacity:0;width:1px;height:1px;padding:0;border:0;pointer-events:none'
 document.body.append(field)
 try{field.focus({preventScroll:true});field.select();field.setSelectionRange(0,value.length);return document.execCommand('copy')}catch{return false}
 finally{field.remove();focus?.focus({preventScroll:true});if(selection){selection.removeAllRanges();for(const range of ranges)selection.addRange(range)}}
}
async function copyDeviceId(){
 if(idCopyPending.value||!readable.value||!id.value||resource.data.value?.id!==id.value)return
 const generation=idCopyGeneration,device=id.value,project=projectId.value,epoch=identityEpoch()
 const current=()=>generation===idCopyGeneration&&readable.value&&id.value===device&&resource.data.value?.id===device&&projectId.value===project&&identityEpoch()===epoch
 idCopyPending.value=true
 try{if(!copyIdSelection(device)){if(typeof navigator.clipboard?.writeText!=='function')throw new Error('clipboard unavailable');await navigator.clipboard.writeText(device)}if(current())copySucceeded('已复制完整 ID')}
 catch{if(current())copyFailed('复制失败，请手动复制完整 ID')}
 finally{if(current())idCopyPending.value=false}
}
const capture=useDeviceGuard(()=>id.value)
const removeMaintenance=useDeviceMaintenanceAction('remove',{device:()=>id.value,readable:()=>readable.value,visible:()=>tab.value==='settings',available:()=>!actionWriteBlocked.value&&!busy.value&&!dialog.value&&!accessMaintenance.shown.value&&!accessMaintenance.writing.value,access:()=>access.data.value,onRemoved:()=>{if(readable.value)void router.push('/devices')},onAccess:value=>{access.data.value=value}})
const accessMaintenance=useDeviceMaintenanceAction('access',{device:()=>id.value,readable:()=>readable.value,visible:()=>tab.value==='settings',available:()=>!actionWriteBlocked.value&&!busy.value&&!dialog.value&&!removeMaintenance.shown.value&&!removeMaintenance.writing.value,access:()=>access.data.value,onRemoved:()=>{},onAccess:value=>{access.data.value=value}})
const maintenanceBusy=computed(()=>removeMaintenance.shown.value||accessMaintenance.shown.value||removeMaintenance.writing.value||accessMaintenance.writing.value)
const isGateway=computed(()=>readable.value&&resource.data.value?.id===id.value&&!!effectiveTypeId.value&&deviceType.data.value?.id===effectiveTypeId.value&&deviceType.data.value?.projectId===projectId.value&&deviceType.data.value?.deviceKind==='GATEWAY')
const tabs=computed<readonly(readonly[string,string])[]>(()=>isGateway.value||topologyWriteBlocked.value?[...referenceDeviceTabs.slice(0,2),['subdevices','子设备'],...referenceDeviceTabs.slice(2)]:referenceDeviceTabs)
function clearPrivate(keepAction=false,preserveTopology=false){closeDialog();Object.assign(form,{name:'',businessKey:'',description:''});error.value='';unknown.value=false;access.clear();if(!keepAction){resetActionLocks(preserveTopology);resource.clear();profile.clear();deviceType.clear();alarmStatus.clear()}}
watch([()=>projectId.value,()=>route.params.deviceId,()=>can('device:read'),()=>can('device:update'),()=>can('device:delete'),()=>currentProject.value?.status,()=>can('device:control'),()=>can('enduser:read'),()=>can('enduser:manage'),()=>session.user?.accountId],(next,previous)=>{const preserveTopology=topologyWriteBlocked.value&&!!previous&&next[0]===previous[0]&&next[1]===previous[1]&&next[9]===previous[9];const keepAction=actionWriteBlocked.value&&(tab.value==='settings'&&modelWriteBlocked.value||tab.value==='info'&&locationWriteBlocked.value||tab.value==='debug'&&dataWriteBlocked.value||tab.value==='subdevices'&&topologyWriteBlocked.value||tab.value==='scenes'||['overview','debug','commands','properties'].includes(tab.value)&&can('device:control')||tab.value==='users'&&can('enduser:read')&&can('enduser:manage'))&&!!previous&&next[0]===previous[0]&&next[1]===previous[1]&&next[2]===true&&previous[2]===true;id.value=String(route.params.deviceId||'');denied.value=false;clearPrivate(keepAction,preserveTopology);if(!keepAction&&readable.value&&projectId.value&&id.value){void resource.reload();void profile.reload()}},{immediate:true,flush:'sync'})
watch([resource.error,profile.error,access.error],errors=>{if(errors.some(cause=>cause instanceof ApiError&&[401,403,404].includes(cause.status))){denied.value=true;clearPrivate(false,topologyWriteBlocked.value)}})
watch([()=>route.query.tab,isGateway,topologyWriteBlocked],([value])=>{if(topologyWriteBlocked.value&&tab.value==='subdevices')return;tab.value=value==='subdevices'&&(isGateway.value||topologyWriteBlocked.value)?'subdevices':referenceDeviceTab(value)},{immediate:true})
watch(()=>[tab.value,id.value,projectId.value,readable.value,canEdit.value],()=>{if(!readable.value||!id.value||!projectId.value)return;if(tab.value==='settings')void access.reload()},{immediate:true})
function reloadType(){if(!readable.value)return;profile.clear();resource.clear();deviceType.clear();void profile.reload();void resource.reload()}
function createAlarmForProperty(propertyKey:string){if(!readable.value||!can('alarm:manage'))return;void router.push({query:{...route.query,tab:'alarms',createAlarmFor:propertyKey}})}
/** 等待真实路由裁决后才允许页签选中，子路由拒绝时标题与当前内容保持一致。 */
async function switchTab(value:string|number){
 if(actionNavigationBlocked.value){actionNavigationAttempted.value=true;return false}
 const next=String(value)
 if(next===tab.value)return true
 if(!tabs.value.some(([key])=>key===next))return false
 try{return !(await router.replace({query:{...route.query,tab:next}}))}catch{return false}
}
async function edit(){
 if(!canEdit.value||busy.value||maintenanceBusy.value)return
 const intent=++editGeneration,check=capture();error.value='';unknown.value=false;profile.clear();await profile.reload()
 if(intent!==editGeneration||!isDeviceScopeCurrent(check)||!canEdit.value)return
 if(profile.error.value||!profile.data.value){error.value=errorMessage(profile.error.value||new Error('设备资料尚未读取'));return}
 editSnapshot=Object.freeze({...profile.data.value});Object.assign(form,{name:editSnapshot.name,businessKey:editSnapshot.businessKey||'',description:editSnapshot.description||''});dialog.value='edit'
}
async function save(){
 if(busy.value||unknown.value||!canEdit.value)return
 if(!editSnapshot){error.value='请重新读取设备资料';return}
 const check=capture(),intent=editGeneration
 const active=()=>isDeviceScopeCurrent(check)&&intent===editGeneration&&dialog.value==='edit'&&canEdit.value
 let accepted=false
 busy.value=true;error.value=''
 try{
  const result=await devicesApi.changeProfile(projectId.value,id.value,changeProfileBody(form,editSnapshot),crypto.randomUUID());accepted=true
  if(!active())return
  assertProfile(result,id.value);profile.clear();await profile.reload()
  if(!active())return
  if(profile.error.value)throw profile.error.value
  if(!profile.data.value||!sameProfile(result,profile.data.value))throw new Error('保存后资料发生变化，请重新核对')
  if(resource.data.value)resource.data.value={...resource.data.value,name:profile.data.value.name,description:profile.data.value.description||undefined,deviceTypeId:profile.data.value.deviceTypeId||undefined}
  closeDialog()
 }catch(e){if(active()&&!(e instanceof IdentityChanged)){error.value=errorMessage(e);unknown.value=accepted||e instanceof ApiError&&e.outcomeUnknown}}
 finally{busy.value=false}
}
</script>
<template><main class="tl-page"><PageHeader title="设备详情" back @back="router.push(ruleDetailReturnPath(route.query)||groupReturnPath(route.query)||'/devices')" />
<section v-if="readable&&resource.data.value" class="device-heading"><div class="device-name"><ReferenceIcon class="device-symbol" glyph="󰆧"/><h2>{{profile.data.value?.name||resource.data.value.name}}</h2><DeviceCodeDialog :device-id="id" :visible="readable"/><el-button v-if="canEdit" size="small" :loading="profile.loading.value" @click="edit">编辑</el-button></div><div class="device-meta"><el-tooltip :content="`完整 ID: ${id}，点击复制`" placement="top" :trigger="['hover','focus']"><button type="button" class="device-id-copy" aria-label="复制完整设备 ID" :title="`完整 ID: ${id}`" :disabled="idCopyPending" @click="copyDeviceId">ID: {{id.slice(-12)}}</button></el-tooltip><span v-if="profile.data.value?.deviceKey" class="device-business-key" :title="`设备标识: ${profile.data.value.deviceKey}`">设备标识: {{profile.data.value.deviceKey}}</span><span>设备类型: <router-link v-if="effectiveTypeId" :to="`/device-types/${effectiveTypeId}`">{{deviceType.data.value?.name||'未知'}}</router-link><template v-else>无</template></span><span class="device-online" :class="{'is-online':resource.data.value.status==='ONLINE'}"><el-icon><DirectoryGlyph kind="connection"/></el-icon>{{resource.data.value.status==='ONLINE'?'在线':resource.data.value.status==='INACTIVE'?'尚未接入':'离线'}}</span><span class="device-alarm" :class="{'is-alarming':alarmStatus.data.value?.states[id]==='ACTIVE'}"><ReferenceIcon :glyph="alarmStatus.data.value?.states[id]==='NORMAL'?'󰪑':alarmStatus.data.value?.states[id]==='ACTIVE'?'󰋔':'󱔢'"/>{{alarmLabel(alarmStatus.data.value?.states[id])}}</span><DeviceLogicalPresence :key="projectId+':'+id+':logical-presence'" :device-id="id" compact/></div></section>
<AsyncState :loading="resource.loading.value" :error="resource.error.value" :forbidden="!readable" @retry="resource.reload"><template v-if="resource.data.value"><el-tabs :model-value="tab" class="tl-tabs" :before-leave="switchTab" @update:model-value="switchTab"><el-tab-pane v-for="[key,label] in tabs" :key="key" :name="key" :label="label" :disabled="actionNavigationBlocked" /></el-tabs><p v-if="actionNavigationAttempted&&actionNavigationBlocked" role="status">{{topologyWriteBlocked?'子设备地址操作尚未结束，请先读取原绑定核对。':dataWriteBlocked?'DATA原投递尚未核对，请先完成当前确认或原键读取。':locationWriteBlocked?'设备资料操作尚未结束，请先读取当前资料核对。':modelWriteBlocked?'模型升级尚未结束，请先核对原转换结果。':sceneWriteBlocked?'场景操作尚未结束，请先完成当前确认或结果核对。':'消息操作尚未结束，请先完成当前发送或原请求核对。'}}</p>
<el-alert v-if="error&&!dialog" :title="error" type="error" :closable="false" />
<DeviceOverview :not-connected="resource.data.value.status==='INACTIVE'" v-if="tab==='overview'" :key="`${projectId}-${id}-${actionGeneration}`" :device-id="id" @busy="propertyBusyListener" @create-alarm="createAlarmForProperty" />
<section v-if="tab==='info'" class="device-information"><DeviceLearningResource kind="information"/><h2>地理位置</h2><p>您可以在设备类型的扩展信息中设置如何更新设备位置，支持手动设置每台设备的位置，也可以使用设备上报位置属性来动态更新。</p><DeviceLocation :device-id="id" edit-label="编辑" use-type-policy reference :disabled="busy||!!dialog||unknown||maintenanceBusy||actionBlocked.planar||actionBlocked.camera||actionBlocked.iccid" @locked="locationBusyListener"/><DevicePlanarPosition reference :device-id="id" :disabled="busy||!!dialog||unknown||maintenanceBusy||actionBlocked.location||actionBlocked.camera||actionBlocked.iccid" @locked="planarBusyListener"/><DeviceCameraReference reference :device-id="id" :disabled="busy||!!dialog||unknown||maintenanceBusy||actionBlocked.location||actionBlocked.planar||actionBlocked.iccid" @locked="cameraBusyListener"/><DeviceIccidInformation reference :device-id="id" :disabled="busy||!!dialog||unknown||maintenanceBusy||actionBlocked.location||actionBlocked.planar||actionBlocked.camera" @locked="iccidBusyListener"/><div :inert="locationWriteBlocked"><DeviceExtensionValues :device-id="id"/></div></section>
<DeviceProperties v-if="tab==='properties'" :key="`${projectId}-${id}-${actionGeneration}`" :device-id="id" @busy="propertyBusyListener" />
<section v-else-if="tab==='connection'"><DeviceConnectionAccess :device-id="id"/><details v-show="false" class="device-data-debug-extension"><summary>TCP / MQTT 数据流调试</summary><DeviceDataStreamRuntime :key="`${projectId}-${id}-${actionGeneration}`" :device-id="id" :disabled="busy||!!dialog||unknown||maintenanceBusy||sceneWriteBlocked||messageWriteBlocked||associationWriteBlocked||modelWriteBlocked||locationWriteBlocked" @locked="dataBusyListener"/></details></section>
<div v-else-if="tab==='subdevices'&&(isGateway||topologyWriteBlocked)" ref="topologyMount"/>
<DeviceCommands v-else-if="tab==='commands'" :key="`${projectId}-${id}-${actionGeneration}`" :device-id="id" @busy="commandBusyListener" />
<DeviceEvents v-else-if="tab==='events'" :device-id="id" />
<DeviceUserAssociations v-else-if="tab==='users'" :key="`${projectId}-${id}-${actionGeneration}`" :device-id="id" @busy="associationBusyListener" @create-user="emit('create-user')" @open-user="emit('open-user',$event)" @open-users="emit('open-users')" @manage-apps="emit('manage-apps')"/>
<DeviceAlarms v-else-if="tab==='alarms'" :device-id="id" :create-alarm-request="typeof route.query.createAlarmFor==='string'?route.query.createAlarmFor:undefined" @cleared="refreshAlarmStatus"/>
<template v-else-if="tab==='debug'"><div :inert="dataWriteBlocked"><DeviceDiagnostics :key="`${projectId}-${id}-${actionGeneration}`" :device-id="id" @busy="diagnosticBusyListener"/></div></template>
<DeviceTaskDefinitions v-else-if="tab==='tasks'" :device-id="id" :device-name="profile.data.value?.name||resource.data.value.name" :transport="deviceTaskDefinitionApi"/>
<DeviceRuleDefinitions v-else-if="tab==='rules'" :device-id="id" :device-name="profile.data.value?.name||resource.data.value.name" :transport="deviceRuleDefinitionApi"/>
<DeviceSceneDefinitions v-else-if="tab==='scenes'" :key="`${projectId}-${id}-${actionGeneration}`" :device-id="id" :device-name="profile.data.value?.name||resource.data.value.name" :transport="deviceSceneDefinitionApi" @busy="sceneBusyListener"/>
<DeviceAutomationDefinitions v-else-if="tab==='automations'" :key="`${id}-${tab}`" :device-id="id" />
<template v-else-if="tab==='settings'"><div class="device-settings"><SectionPanel v-if="effectiveTypeId" title="物模型绑定"><DeviceModel :key="`${projectId}-${id}-${actionGeneration}`" :device-id="id" :disabled="busy||!!dialog||unknown||maintenanceBusy" @locked="modelBusyListener"/></SectionPanel><div :inert="modelWriteBlocked"><SectionPanel title="设备描述"><p v-if="profile.data.value?.description">{{profile.data.value.description}}</p><el-button v-if="canEdit" size="small" @click="edit">编辑</el-button></SectionPanel><SectionPanel title="设备类型"><p>{{effectiveTypeId?(deviceType.data.value?.name||'读取中'):'无类型'}}</p><DeviceTypeAssignment :device-id="id" @changed="reloadType"/><DeviceTypeAdaptationStatus :key="`${projectId}-${id}-${effectiveTypeId}`" :device-id="id"/></SectionPanel><SectionPanel title="设备分组"><DeviceStaticGroupMemberships :device-id="id" @changed="reloadType"/></SectionPanel><SectionPanel title="标签"><DeviceTags :device-id="id" /></SectionPanel><SectionPanel title="设备码"><p>将设备码贴在外包装或产品手册中，用户可在 App 中通过设备码主动添加设备。</p><DeviceCodeDialog :device-id="id" :visible="readable" trigger-text="查看" /></SectionPanel><SectionPanel title="设备状态"><AsyncState :loading="access.loading.value" :error="access.error.value" @retry="access.reload"><p>停用设备后，设备将无法连接到平台，无法上报及接收消息。</p><p>{{access.data.value?.enabled?'正常':'已停用'}}</p><el-button v-if="canEdit&&access.data.value?.canManage" :disabled="busy" :loading="accessMaintenance.writing.value" @click="accessMaintenance.start">{{access.data.value.enabled?'停用设备':'恢复接入'}}</el-button></AsyncState></SectionPanel><SectionPanel v-if="canRemove" title="移除设备"><p>设备移除后无法继续接入。历史保留按服务端规则处理。</p><el-button type="danger" :disabled="busy" :loading="removeMaintenance.writing.value" @click="removeMaintenance.start">移除设备</el-button></SectionPanel></div></div></template>

</template></AsyncState>
<GatewaySubDevices v-if="tab==='subdevices'&&isGateway||topologyWriteBlocked" portal :target="topologyMount" :key="`${projectId}-${id}-${session.user?.accountId}-${actionEpoch}`" :gateway-id="id" :read-blocked="!readable" :disabled="busy||!!dialog||unknown||maintenanceBusy||sceneWriteBlocked||messageWriteBlocked||associationWriteBlocked||modelWriteBlocked||locationWriteBlocked||dataWriteBlocked" @locked="topologyBusyListener"/>
<el-dialog :model-value="!!dialog&&canEdit" title="修改设备信息" width="min(500px,94vw)" class="device-edit-dialog" :close-on-click-modal="false" :before-close="beforeEditClose" destroy-on-close>
<template v-if="dialog==='edit'"><el-alert v-if="error" :title="error" type="error" :closable="false" /><el-alert v-if="unknown" title="结果未确认，请关闭弹窗并重新读取设备信息核对。" type="warning" :closable="false" /><el-form label-position="top" @submit.prevent><el-form-item label="设备名称"><el-input v-model="form.name" maxlength="128" /></el-form-item><el-form-item label="设备标识"><template #label><span>设备标识</span><el-tooltip :content="businessKeyHelp" placement="top" :trigger="['hover','focus']"><el-icon class="device-key-help" tabindex="0" role="img" :aria-label="businessKeyHelp"><QuestionFilled/></el-icon></el-tooltip></template><el-input :model-value="editSnapshot?.deviceKey" aria-label="设备标识" readonly /></el-form-item><el-form-item label="设备描述"><el-input v-model="form.description" type="textarea" :rows="5" maxlength="500" /></el-form-item></el-form></template>
<template #footer><el-button @click="closeDialog">取消</el-button><el-button v-if="dialog==='edit'" type="primary" :loading="busy" :disabled="unknown||!canEdit" @click="save">保存</el-button></template></el-dialog>
<DeviceMaintenanceDialog :state="removeMaintenance"/><DeviceMaintenanceDialog :state="accessMaintenance"/>
</main></template>
<style scoped>
.device-data-debug-extension{margin-top:24px;padding-top:14px;border-top:1px solid var(--tl-border)}.device-data-debug-extension>summary{color:var(--tl-text-primary);font-size:16px;font-weight:600;line-height:24px;cursor:pointer;list-style:none}.device-data-debug-extension>summary::-webkit-details-marker{display:none}.device-data-debug-extension>summary::after{content:'展开';float:right;color:var(--tl-muted);font-size:13px;font-weight:400}.device-data-debug-extension[open]>summary::after{content:'收起'}
</style>
<style scoped>
.device-alarm{display:inline-flex;align-items:center;gap:4px}.device-alarm .reference-icon{font-size:16px}.device-alarm.is-alarming{color:var(--el-color-danger)}.device-key-help{margin-left:4px;font-size:13px;color:#c0c4cc;cursor:help;vertical-align:-1px}.device-key-help:focus-visible{outline:2px solid var(--tl-primary);outline-offset:2px;border-radius:50%}.tl-page{padding:20px 30px 50px}.tl-page :deep(.tl-page-header){margin-bottom:20px;min-height:24px}.tl-page :deep(.tl-page-header h1.is-secondary){line-height:24px}.tl-page :deep(.tl-tabs > .el-tabs__header){margin-bottom:15px}.device-heading{margin:0 0 20px;}.device-name{padding-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}.device-symbol{font-size:32px;color:#999;}.device-name h2{font-size:26px;line-height:34px;font-weight:500;margin:0;color:#002822;overflow-wrap:anywhere;min-width:0;}.device-name .el-button{margin-left:8px;height:28px;padding:7px 15px;line-height:1;}.device-meta{position:relative;display:flex;align-items:center;gap:14px 30px;flex-wrap:wrap;margin-top:10px;font-size:14px;line-height:20px;color:#999;}.device-meta>span{overflow-wrap:anywhere;min-width:0;}.device-id-copy{flex:none;padding:0;border:0;background:none;color:inherit;font:inherit;line-height:inherit;cursor:pointer;white-space:nowrap}.device-id-copy:hover{color:var(--tl-primary)}.device-id-copy:focus-visible{outline:2px solid var(--tl-primary);outline-offset:3px}.device-meta>.device-business-key{max-width:100%;white-space:normal;overflow-wrap:anywhere}.device-online .reference-icon{font-size:14px;}.device-online{display:inline-flex;align-items:center;gap:5px;}.device-online.is-online{color:#67c23a;}@media(max-width:767px){.tl-page{padding:25px 15px}.device-meta{gap:8px 16px;}}
.device-information h2{font-size:22px;line-height:32px;font-weight:400;color:#002822;margin:10px 0 0}.device-information>p{font-size:15px;line-height:22px;color:#888;margin:8px 0 0}.device-information :deep(.information-standard){margin-top:30px}.device-information :deep(.information-standard>header){display:block}.device-information :deep(.information-standard>header h3){margin:0;font-size:22px;line-height:32px;font-weight:400;color:#002822}.device-information :deep(.information-standard>header .el-button){margin:12px 0 0}.device-information :deep(.information-standard p){font-size:15px;line-height:22px;color:#888;margin:8px 0}.device-information :deep(.information-standard .information-value){font-size:16px;line-height:24px;color:#4a4a4a;margin:12px 0 0}.device-information :deep(.information-standard .information-value.is-unset){font-style:italic;color:#6b7280}.device-information :deep(.information-standard .el-dialog p){font-size:14px;line-height:22px}.device-information :deep(.information-standard .el-form-item){margin-bottom:20px}.device-settings :deep(.tl-section-panel){border:0;border-radius:0;margin-bottom:30px;overflow:visible}.device-settings :deep(.tl-section-panel__header){padding:0;margin-bottom:12px;background:none;border:0;min-height:24px}.device-settings :deep(.tl-section-panel__header h2){font-size:16px;font-weight:600;line-height:24px}.device-settings :deep(.tl-section-panel__body){padding:0}.device-settings p{margin:0 0 10px;font-size:14px;color:var(--tl-muted);line-height:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;margin:0;}.el-tag+.el-tag{margin-left:6px;}</style>

<style>
.device-edit-dialog .el-dialog__body{padding:31px 20px 30px}.device-edit-dialog .el-textarea .el-textarea__inner{border:1px solid var(--el-input-border-color,var(--el-border-color));box-shadow:none}.device-edit-dialog .el-textarea .el-textarea__inner:hover{border-color:var(--el-input-hover-border-color,var(--el-border-color-hover))}.device-edit-dialog .el-textarea .el-textarea__inner:focus{border-color:var(--el-input-focus-border-color,var(--el-color-primary))}.device-edit-dialog .el-form-item{margin-bottom:22px}.device-edit-dialog .el-form-item__label{height:32px;line-height:32px;padding:0;margin-bottom:0;font-size:14px;font-weight:500}.device-edit-dialog .el-dialog__footer{padding:10px 20px 20px}
</style>
