<script setup lang="ts">
import {computed,onScopeDispose,reactive,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router'
import {session,projectId,currentProject} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import PageHeader from '@/ui/PageHeader.vue'
import {groupReturnPath} from '@/features/device-groups/group-return'
import {ruleDetailReturnPath} from '@/features/rules/rule-detail-return'
import AsyncState from '@/ui/AsyncState.vue'
import SectionPanel from '@/ui/SectionPanel.vue'
import {showOperationFeedback} from '@/ui/operation-feedback'
import DeviceTypeExtensions from './DeviceTypeExtensions.vue'
import DeviceTypeSettings from './DeviceTypeSettings.vue'
import DeviceTypeApplications from './DeviceTypeApplications.vue'
import DeviceTypeDevices from './DeviceTypeDevices.vue'
import DefinitionExternalIcon from './DefinitionExternalIcon.vue'
import './function-definition.css'
import DeviceTypeProperties from './DeviceTypeProperties.vue'
import DeviceTypeEvents from './DeviceTypeEvents.vue'
import DeviceTypeCommands from './DeviceTypeCommands.vue'
import DeviceTypeModelDocumentation from './DeviceTypeModelDocumentation.vue'
import DeviceTypeDefinitionImport from './DeviceTypeDefinitionImport.vue'
import DeviceTypeTslPreview from './DeviceTypeTslPreview.vue'
import DeviceTypeTslView from './DeviceTypeTslView.vue'
import DeviceTypeDataStreams from './DeviceTypeDataStreams.vue'
import DeviceTypeModbusRegisters from './DeviceTypeModbusRegisters.vue'
import DeviceTypeAssociations from './DeviceTypeAssociations.vue'
import TypeAlarmRuleCreate from './TypeAlarmRuleCreate.vue'
import DeviceTypeActivityPolicyDialog from '../devices/DeviceTypeActivityPolicyDialog.vue'
import {typeKinds,typeNetworks,typeProtocols,typeAccessDraft,typeProfileTransport,typeProfileId,typeProfileDraft,prepareTypeUpdate,profileMatches,type TypeProfileTransport,type TypeProfile,type TypeUpdateIntent} from './profile-api'

const props=withDefaults(defineProps<{typeId:string;transport?:TypeProfileTransport}>(),{transport:()=>typeProfileTransport})
const baseTabs=[['devices','关联设备'],['functions','功能定义'],['extensions','扩展信息'],['streams','自定义数据流'],['apps','应用配置'],['rules','规则'],['tasks','任务'],['alarms','告警'],['settings','设置']] as const
const tabs=computed(()=>resource.data.value?.type.payloadProtocol==='MODBUS_RTU_PASSTHROUGH'?[...baseTabs,['modbus','Modbus 寄存器'] as const]:baseTabs)
const documentShown=ref(false),tslShown=ref(false),aiShown=ref(false),settingsLocked=ref(false),applicationsLocked=ref(false),editSection=ref<'name'|'tags'>('name')
const route=useRoute(),router=useRouter(),roles=['OWNER','ADMIN','OPERATOR','VIEWER'],denied=ref(false)
const member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&!!projectId.value&&!!currentProject.value&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const readable=computed(()=>member.value&&!denied.value),writable=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const tab=computed(()=>tabs.value.some(([key])=>key===route.query.tab)?String(route.query.tab):'devices')
const tabLabel=computed(()=>tabs.value.find(([key])=>key===tab.value)![1])
const resource=useResource(signal=>props.transport.read(projectId.value,props.typeId,signal))
const shown=ref(false),busy=ref(false),error=ref(''),notice=ref(''),review=ref<'unknown'|'rejected'>(),policyLocked=ref(false),devicesLocked=ref(false),deleteLocked=ref(false),propertiesLocked=ref(false),eventsLocked=ref(false),commandsLocked=ref(false),publicationLocked=ref(false),extensionsLocked=ref(false),candidateLocked=ref(false),productCredentialsLocked=ref(false),registrationPolicyLocked=ref(false),definitionImportLocked=ref(false),definitionBatchLocked=ref(false),streamsLocked=ref(false),materialImportLocked=ref(false),productIdentifierLocked=ref(false),locationPolicyLocked=ref(false),planarPolicyLocked=ref(false),cameraPolicyLocked=ref(false),iccidPolicyLocked=ref(false),onlinePolicyLocked=ref(false),templatesLocked=ref(false),productSharingLocked=ref(false),typeAlarmSelection=ref<{ruleId?:string}>(),typeAlarmShown=computed(()=>!!typeAlarmSelection.value),typeAlarmLocked=ref(false),modbusLocked=ref(false),associationsEpoch=ref(0),definitionEpoch=reactive({properties:0,events:0,commands:0}),pendingDefinitionRefresh=reactive({properties:false,events:false,commands:false})
const snapshot=shallowRef<TypeProfile>(),observed=shallowRef<TypeProfile>(),intent=shallowRef<TypeUpdateIntent>(),form=reactive(typeProfileDraft())
const access=reactive(typeAccessDraft())
const accessEditability=ref<Awaited<ReturnType<TypeProfileTransport['accessEditability']>>>()
const checkingAccess=ref(false)
const canEditAccess=computed(()=>accessEditability.value==='EDITABLE')
const accessHints={
 PUBLISHED:'已发布类型的接入配置只读',
 ASSOCIATED_DEVICES:'类型已关联设备，接入配置只读',
 ACTIVE_ACCESS_CONFIGURATION:'类型仍有启用的自定义数据流，接入配置只读',
 EDITABLE:'',
}
const accessHint=computed(()=>checkingAccess.value?'正在检查接入配置是否可修改':
 accessEditability.value?accessHints[accessEditability.value]:'暂时无法确认接入配置是否可修改')
function withCurrentOption(options:readonly (readonly [string,string])[],value:string,label=value){
 return value&&!options.some(([key])=>key===value)?[...options,[value,label] as const]:options
}
const editNetworks=computed(()=>withCurrentOption(typeNetworks(access.deviceKind),access.networkType,
 [...typeNetworks('DIRECT'),...typeNetworks('SUB_DEVICE')].find(([key])=>key===access.networkType)?.[1]))
const editProtocols=computed(()=>withCurrentOption(typeProtocols(access.deviceKind),access.payloadProtocol,
 ['DIRECT','SUB_DEVICE','GATEWAY'].flatMap(typeProtocols).find(([key])=>key===access.payloadProtocol)?.[1]))
function changeAccessKind(value:string){
 if(!canEditAccess.value||busy.value||review.value||value===access.deviceKind)return
 access.deviceKind=value
 if(!typeNetworks(value).some(([key])=>key===access.networkType))access.networkType=''
 access.payloadProtocol=value==='GATEWAY'?'STANDARD_GATEWAY':'STANDARD'
}
const policy=shallowRef<InstanceType<typeof DeviceTypeActivityPolicyDialog>>()
const blocked=computed(()=>readable.value&&(documentShown.value||tslShown.value||aiShown.value||settingsLocked.value||applicationsLocked.value||busy.value||review.value==='unknown'||policyLocked.value||devicesLocked.value||deleteLocked.value||propertiesLocked.value||eventsLocked.value||commandsLocked.value||publicationLocked.value||extensionsLocked.value||candidateLocked.value||productCredentialsLocked.value||registrationPolicyLocked.value||definitionImportLocked.value||definitionBatchLocked.value||streamsLocked.value||materialImportLocked.value||productIdentifierLocked.value||locationPolicyLocked.value||planarPolicyLocked.value||cameraPolicyLocked.value||iccidPolicyLocked.value||onlinePolicyLocked.value||templatesLocked.value||productSharingLocked.value||typeAlarmShown.value||typeAlarmLocked.value||modbusLocked.value))
let generation=0,alive=true,controller:AbortController|undefined,eligibilityController:AbortController|undefined
function clearEditor(){generation++;controller?.abort();eligibilityController?.abort();checkingAccess.value=false;accessEditability.value=undefined;shown.value=false;busy.value=false;review.value=undefined;snapshot.value=undefined;observed.value=undefined;intent.value=undefined;error.value='';Object.assign(form,typeProfileDraft());Object.assign(access,typeAccessDraft())}
function scopeChanged(){pendingDefinitionRefresh.properties=false;pendingDefinitionRefresh.events=false;pendingDefinitionRefresh.commands=false;documentShown.value=false;tslShown.value=false;aiShown.value=false;settingsLocked.value=false;applicationsLocked.value=false;clearEditor();resource.clear();notice.value='';denied.value=false;policyLocked.value=false;devicesLocked.value=false;deleteLocked.value=false;propertiesLocked.value=false;eventsLocked.value=false;commandsLocked.value=false;publicationLocked.value=false;extensionsLocked.value=false;candidateLocked.value=false;productCredentialsLocked.value=false;registrationPolicyLocked.value=false;definitionImportLocked.value=false;definitionBatchLocked.value=false;streamsLocked.value=false;materialImportLocked.value=false;productIdentifierLocked.value=false;locationPolicyLocked.value=false;planarPolicyLocked.value=false;cameraPolicyLocked.value=false;iccidPolicyLocked.value=false;onlinePolicyLocked.value=false;templatesLocked.value=false;productSharingLocked.value=false;closeTypeAlarm();if(member.value&&typeProfileId(props.typeId))void resource.reload()}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId,id:props.typeId}}
function current(s:ReturnType<typeof capture>){return alive&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.account===session.user?.accountId&&s.id===props.typeId&&readable.value}
function deny(cause:unknown){clearEditor();resource.clear();denied.value=true;error.value=errorMessage(cause)}
async function checkAccess(profile:TypeProfile){
 eligibilityController?.abort()
 accessEditability.value=profile.type.status==='PUBLISHED'?'PUBLISHED':undefined
 if(profile.type.status==='PUBLISHED'){checkingAccess.value=false;Object.assign(access,typeAccessDraft(profile.type));return}
 const request=new AbortController(),s=capture()
 eligibilityController=request;checkingAccess.value=true
 try{
  const result=await props.transport.accessEditability(s.project,s.id,request.signal)
  if(current(s)&&!request.signal.aborted){accessEditability.value=result;if(result!=='EDITABLE')Object.assign(access,typeAccessDraft(profile.type))}
 }catch(cause){
  if(current(s)&&!request.signal.aborted){
   if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny(cause);return}
   Object.assign(access,typeAccessDraft(profile.type))
  }
 }finally{if(current(s)&&!request.signal.aborted)checkingAccess.value=false}
}
type DefinitionSection='properties'|'events'|'commands'
const definitionLocks={properties:propertiesLocked,events:eventsLocked,commands:commandsLocked}
function definitionsChanged(source?:DefinitionSection){
 for(const section of ['properties','events','commands'] as const){
  if(section===source)continue
  if(definitionLocks[section].value)pendingDefinitionRefresh[section]=true
  else definitionEpoch[section]++
 }
}
// 保留仍在编辑或核对的子组件，待它自行解锁后再刷新基版。
watch([propertiesLocked,eventsLocked,commandsLocked],()=>{
 for(const section of ['properties','events','commands'] as const)if(pendingDefinitionRefresh[section]&&!definitionLocks[section].value){pendingDefinitionRefresh[section]=false;definitionEpoch[section]++}
},{flush:'post'})
function reload(){if(!readable.value||blocked.value)return;resource.clear();if(typeProfileId(props.typeId))void resource.reload()}
function editProfile(section:'name'|'tags'){editSection.value=section;openEdit()}
function openEdit(){if(settingsLocked.value||applicationsLocked.value||documentShown.value||tslShown.value||aiShown.value||!writable.value||resource.loading.value||policyLocked.value||devicesLocked.value||deleteLocked.value||propertiesLocked.value||eventsLocked.value||commandsLocked.value||publicationLocked.value||extensionsLocked.value||candidateLocked.value||productCredentialsLocked.value||registrationPolicyLocked.value||definitionImportLocked.value||definitionBatchLocked.value||streamsLocked.value||materialImportLocked.value||productIdentifierLocked.value||locationPolicyLocked.value||planarPolicyLocked.value||cameraPolicyLocked.value||iccidPolicyLocked.value||onlinePolicyLocked.value||templatesLocked.value||productSharingLocked.value||busy.value)return;if(review.value==='unknown'){shown.value=true;return}if(!resource.data.value)return;clearEditor();snapshot.value=resource.data.value;Object.assign(form,typeProfileDraft(snapshot.value));if(editSection.value==='tags'&&!form.tags.length)form.tags.push({key:'',value:''});shown.value=true;notice.value='';if(editSection.value==='name'){Object.assign(access,typeAccessDraft(snapshot.value.type));void checkAccess(snapshot.value)}}
function close(){if(busy.value)return;if(review.value==='unknown')shown.value=false;else clearEditor()}
async function save(){
 if(settingsLocked.value||applicationsLocked.value||!writable.value||busy.value||checkingAccess.value||review.value||!shown.value||!snapshot.value||policyLocked.value||devicesLocked.value||deleteLocked.value||propertiesLocked.value||eventsLocked.value||commandsLocked.value||publicationLocked.value||extensionsLocked.value||candidateLocked.value||productCredentialsLocked.value||registrationPolicyLocked.value||definitionImportLocked.value||definitionBatchLocked.value||streamsLocked.value||materialImportLocked.value||productIdentifierLocked.value||locationPolicyLocked.value||planarPolicyLocked.value||cameraPolicyLocked.value||iccidPolicyLocked.value||onlinePolicyLocked.value||templatesLocked.value||productSharingLocked.value||typeAlarmShown.value||typeAlarmLocked.value)return
 let chosen:TypeUpdateIntent
 try{chosen=prepareTypeUpdate(projectId.value,snapshot.value,form,editSection.value==='name'&&canEditAccess.value?access:undefined)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=chosen;review.value='unknown';busy.value=true;observed.value=undefined;error.value='';const s=capture();controller=new AbortController();let writeAccepted=false
 try{
  const returned=await props.transport.update(chosen,controller.signal)
  writeAccepted=true
  if(!current(s)||!writable.value)return
  if(!profileMatches(returned,chosen.body))throw new Error('保存回执与原草稿不符，请读取当前资料核对')
  const actual=await props.transport.read(chosen.project,chosen.id,controller.signal)
  if(!current(s)||!writable.value)return
  if(actual.revision!==returned.revision||actual.profileToken!==returned.profileToken||!profileMatches(actual,chosen.body))throw new Error('当前类型资料已变化，请重新核对')
  resource.data.value=actual
  clearEditor()
  showOperationFeedback('设备类型资料已保存')
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(!writeAccepted&&cause instanceof ApiError&&[401,403,404].includes(cause.status)&&!cause.outcomeUnknown){deny(cause);return}
  review.value=!writeAccepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,409,413,422,429].includes(cause.status)?'rejected':'unknown';error.value=errorMessage(cause)
 }}finally{if(current(s))busy.value=false}
}
async function readCurrent(){
 const original=intent.value;if(!original||!review.value||!readable.value||busy.value)return
 const s=capture();controller=new AbortController();busy.value=true;observed.value=undefined;error.value=''
 try{const value=await props.transport.read(original.project,original.id,controller.signal);if(current(s))observed.value=value}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){deny(cause);return}error.value=errorMessage(cause)}}
 finally{if(current(s))busy.value=false}
}
function rebase(){
 const actual=observed.value
 if(review.value!=='rejected'||!actual||!writable.value||busy.value)return
 snapshot.value=actual;resource.data.value=actual
 if(editSection.value==='name'){
  Object.assign(access,intent.value?.body.access??typeAccessDraft(actual.type))
  void checkAccess(actual)
 }
 observed.value=undefined;intent.value=undefined;review.value=undefined;error.value=''
}
function finishReview(){if(review.value!=='unknown'||!observed.value||busy.value)return;resource.data.value=observed.value;clearEditor();notice.value='已结束本次核对；原保存结果仍未确认'}
function selectTab(value:string|number){if(blocked.value||!tabs.value.some(([key])=>key===value))return;void router.replace({path:route.path,query:{...route.query,tab:String(value)}})}
function openTypeAlarm(typeId:string,ruleId?:string){
 if(blocked.value||shown.value||typeId!==props.typeId||ruleId!==undefined&&!typeProfileId(ruleId))return
 typeAlarmSelection.value={ruleId}
}
function closeTypeAlarm(){typeAlarmSelection.value=undefined;typeAlarmLocked.value=false}
function typeAlarmSaved(_id:string,returnToType:boolean){closeTypeAlarm();if(returnToType)associationsEpoch.value++;else void router.push('/alarm-rules')}
function createTypeRule(id:string){if(blocked.value||shown.value||id!==props.typeId)return;void router.push({path:'/rules/messages/create',query:{source:'device-type',deviceTypeId:id}})}
function createTypeTask(id:string){if(blocked.value||shown.value||id!==props.typeId)return;void router.push({path:'/tasks/jobs/create',query:{source:'device-type',deviceTypeId:id}})}
function back(){if(!blocked.value)void router.push(ruleDetailReturnPath(route.query)||groupReturnPath(route.query)||'/device-types')}
function openPolicy(){if(readable.value&&!blocked.value&&!shown.value&&resource.data.value)void policy.value?.open(props.typeId,resource.data.value.type.name)}
watch([()=>projectId.value,()=>session.user?.accountId,()=>props.typeId,()=>member.value,()=>props.transport],scopeChanged,{immediate:true,flush:'sync'})
watch(()=>route.query.tab,()=>{if(!blocked.value)clearEditor()},{flush:'sync'})
const dispose=onIdentityChange(()=>{applicationsLocked.value=false;clearEditor();resource.clear();notice.value='';denied.value=false;policyLocked.value=false;devicesLocked.value=false;deleteLocked.value=false;propertiesLocked.value=false;eventsLocked.value=false;commandsLocked.value=false;publicationLocked.value=false;extensionsLocked.value=false;candidateLocked.value=false;productCredentialsLocked.value=false;registrationPolicyLocked.value=false;definitionImportLocked.value=false;definitionBatchLocked.value=false;materialImportLocked.value=false;productIdentifierLocked.value=false;locationPolicyLocked.value=false;planarPolicyLocked.value=false;cameraPolicyLocked.value=false;iccidPolicyLocked.value=false;queueMicrotask(()=>{if(alive&&member.value&&typeProfileId(props.typeId)&&!resource.loading.value)void resource.reload()})})
onBeforeRouteLeave(()=>!blocked.value);onBeforeRouteUpdate(()=>!blocked.value)
function beforeUnload(event:BeforeUnloadEvent){if(blocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload)
onScopeDispose(()=>{alive=false;clearEditor();dispose();window.removeEventListener('beforeunload',beforeUnload)})
</script>
<template><main class="tl-page type-detail"><PageHeader title="设备类型详情" back :back-disabled="blocked" @back="back"/>
 <el-alert v-if="notice" :title="notice" type="info" :closable="false"/><el-alert v-if="error&&!shown" :title="error" type="error" :closable="false"/>
 <AsyncState :forbidden="!readable" :loading="resource.loading.value" :error="resource.error.value" @retry="reload"><template v-if="resource.data.value">
  <header class="type-heading"><svg class="type-cube" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7Z M3 7l9 5 9-5 M12 12v10"/></svg><h2>{{resource.data.value.type.name}}</h2><el-button v-if="writable" size="small" :disabled="settingsLocked||applicationsLocked||documentShown||tslShown||aiShown||policyLocked||devicesLocked||deleteLocked||propertiesLocked||eventsLocked||commandsLocked||publicationLocked||extensionsLocked||candidateLocked||productCredentialsLocked||registrationPolicyLocked||definitionImportLocked||definitionBatchLocked||busy||streamsLocked||typeAlarmShown||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @click="editProfile('name')">编辑</el-button></header>
  <p class="type-summary">ID：{{resource.data.value.type.id}}<span>设备接入类型：{{typeKinds.find(([key])=>key===resource.data.value!.type.deviceKind)?.[1]}}</span></p>
  <el-tabs :model-value="tab" class="tl-tabs" :before-leave="()=>!blocked" @update:model-value="selectTab"><el-tab-pane v-for="[key,label] in tabs" :key="key" :name="key" :label="label" :disabled="blocked||streamsLocked"/></el-tabs>
  <DeviceTypeDevices v-if="tab==='devices'" :key="projectId+':'+typeId" :device-type-id="typeId" @locked="devicesLocked=$event"/>
  <DeviceTypeDataStreams v-else-if="tab==='streams'" :key="projectId+':'+typeId+':streams'" :type-id="typeId" :type-status="resource.data.value.type.status" :disabled="shown||busy||!!review||policyLocked||devicesLocked||deleteLocked||propertiesLocked||eventsLocked||commandsLocked||publicationLocked||extensionsLocked||candidateLocked||productCredentialsLocked||registrationPolicyLocked||definitionImportLocked||definitionBatchLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @locked="streamsLocked=$event"/>
  <DeviceTypeModbusRegisters v-else-if="tab==='modbus'" :key="projectId+':'+typeId+':modbus'" :type-id="typeId" :device-kind="resource.data.value.type.deviceKind" :disabled="shown||busy||!!review||modbusLocked" @locked="modbusLocked=$event"/>
  <DeviceTypeAssociations v-else-if="tab==='rules'||tab==='tasks'||tab==='alarms'" :key="projectId+':'+typeId+':associations:'+associationsEpoch" :type-id="typeId" :kind="tab" :disabled="shown||blocked" @create-rule="createTypeRule" @create-task="createTypeTask" @create-alarm="openTypeAlarm" @edit-alarm="openTypeAlarm"/>
  <DeviceTypeExtensions v-else-if="tab==='extensions'" :key="projectId+':'+typeId+':extensions'" :type-id="typeId" :type-status="resource.data.value.type.status" :disabled="!writable||shown||busy||!!review" @locked="extensionsLocked=$event"/>
  <template v-else-if="tab==='functions'">
   <section class="type-intro"><h3>编辑功能定义</h3><p>功能定义用来描述不同设备的能力，包括属性、事件和命令，从而加快设备接入和应用开发。功能定义对设备类型中的所有设备都有效。 <a class="definition-learn" href="https://www.thingscloud.xyz/docs/guide/device-type/function-define.html" target="_blank" rel="noopener noreferrer">了解详情 <DefinitionExternalIcon/></a></p></section>
   <div class="type-function-tools"><DeviceTypeTslPreview toolbar :key="projectId+':'+typeId+':tsl-material'" :type-id="typeId" :type-status="resource.data.value.type.status" :disabled="shown||busy||!!review||policyLocked||devicesLocked||deleteLocked||propertiesLocked||eventsLocked||commandsLocked||publicationLocked||extensionsLocked||candidateLocked||productCredentialsLocked||registrationPolicyLocked||definitionBatchLocked||streamsLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||definitionImportLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @locked="materialImportLocked=$event" @changed="definitionsChanged()"/><DeviceTypeDefinitionImport toolbar :key="projectId+':'+typeId+':import'" :type-id="typeId" :type-status="resource.data.value.type.status" :disabled="shown||busy||!!review||policyLocked||devicesLocked||deleteLocked||propertiesLocked||eventsLocked||commandsLocked||publicationLocked||extensionsLocked||candidateLocked||productCredentialsLocked||registrationPolicyLocked||definitionBatchLocked||streamsLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @locked="definitionImportLocked=$event" @changed="definitionsChanged()"/><el-button class="definition-ai" :disabled="blocked||shown" @click="aiShown=true">
     <template #icon>
      <!-- MingCute AI Line；来源及许可见 assets/icons/definition-ai-LICENSE.txt。 -->
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9.107 5.448c.598-1.75 3.016-1.803 3.725-.159l.06.16.807 2.36a4 4 0 0 0 2.276 2.411l.217.081 2.36.806c1.75.598 1.803 3.016.16 3.725l-.16.06-2.36.807a4 4 0 0 0-2.412 2.276l-.081.216-.806 2.361c-.598 1.75-3.016 1.803-3.724.16l-.062-.16-.806-2.36a4 4 0 0 0-2.276-2.412l-.216-.081-2.36-.806c-1.751-.598-1.804-3.016-.16-3.724l.16-.062 2.36-.806A4 4 0 0 0 8.22 8.025l.081-.216zM11 6.094l-.806 2.36a6 6 0 0 1-3.49 3.649l-.25.091-2.36.806 2.36.806a6 6 0 0 1 3.649 3.49l.091.25.806 2.36.806-2.36a6 6 0 0 1 3.49-3.649l.25-.09 2.36-.807-2.36-.806a6 6 0 0 1-3.649-3.49l-.09-.25zM19 2a1 1 0 0 1 .898.56l.048.117.35 1.026 1.027.35a1 1 0 0 1 .118 1.845l-.118.048-1.026.35-.35 1.027a1 1 0 0 1-1.845.117l-.048-.117-.35-1.026-1.027-.35a1 1 0 0 1-.118-1.845l.118-.048 1.026-.35.35-1.027A1 1 0 0 1 19 2"/></svg>
     </template>
     AI 生成
   </el-button></div>
   <DeviceTypeProperties :key="projectId+':'+typeId+':properties'+definitionEpoch.properties" :type-id="typeId" :type-status="resource.data.value.type.status" :disabled="shown||busy||!!review||policyLocked||devicesLocked||deleteLocked||eventsLocked||commandsLocked||publicationLocked||extensionsLocked||candidateLocked||productCredentialsLocked||registrationPolicyLocked||definitionImportLocked||definitionBatchLocked||streamsLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @locked="propertiesLocked=$event" @changed="definitionsChanged('properties')"/><DeviceTypeEvents :key="projectId+':'+typeId+':events'+definitionEpoch.events" :type-id="typeId" :type-status="resource.data.value.type.status" :disabled="shown||busy||!!review||policyLocked||devicesLocked||deleteLocked||propertiesLocked||commandsLocked||publicationLocked||extensionsLocked||candidateLocked||productCredentialsLocked||registrationPolicyLocked||definitionImportLocked||definitionBatchLocked||streamsLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @locked="eventsLocked=$event" @changed="definitionsChanged('events')"/><DeviceTypeCommands :key="projectId+':'+typeId+':commands'+definitionEpoch.commands" :type-id="typeId" :type-status="resource.data.value.type.status" :disabled="shown||busy||!!review||policyLocked||devicesLocked||deleteLocked||propertiesLocked||eventsLocked||publicationLocked||extensionsLocked||candidateLocked||productCredentialsLocked||registrationPolicyLocked||definitionImportLocked||definitionBatchLocked||streamsLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @locked="commandsLocked=$event" @changed="definitionsChanged('commands')"/>
   <section class="type-reference-section"><h3>功能定义 TSL</h3><p>TSL（Thing Specification Language）用于描述功能定义元信息，采用 JSON 格式。</p><el-button :disabled="blocked||shown" @click="tslShown=true">查看功能定义 TSL</el-button></section>
   <section class="type-reference-section"><h3>功能定义开发文档</h3><p>开发文档描述了功能定义的相关消息通信协议，便于开发者使用，采用 Markdown 和 HTML 格式。</p><el-button :disabled="blocked||shown" @click="documentShown=true">查看功能定义文档</el-button></section>
   <el-dialog v-model="documentShown" class="function-reference-dialog" title="查看功能定义文档" width="min(800px,94vw)" destroy-on-close><DeviceTypeModelDocumentation compact :type-id="typeId" :type-status="resource.data.value.type.status" :type-name="resource.data.value.type.name"/></el-dialog>
   <el-dialog v-model="tslShown" class="function-reference-dialog" title="查看功能定义 TSL" width="min(700px,94vw)" destroy-on-close><DeviceTypeTslView v-if="tslShown" :key="projectId+':'+typeId+':tsl-view'" :type-id="typeId"/></el-dialog>
   <el-dialog v-model="aiShown" title="AI 生成" width="min(760px,94vw)"><el-alert title="当前页面尚不支持直接生成并保存功能定义。" type="info" :closable="false"/></el-dialog>
  </template>
  <DeviceTypeSettings v-else-if="tab==='settings'" :key="projectId+':'+typeId+':settings'" :profile="resource.data.value" :disabled="shown||busy||!!review" @locked="settingsLocked=$event" @edit="editProfile" @changed="reload" @removed="back"/>
  <DeviceTypeApplications v-else-if="tab==='apps'" :type-id="typeId" :wifi="resource.data.value.type.networkType==='WIFI'" :disabled="shown||busy||!!review||documentShown||tslShown||aiShown||settingsLocked||typeAlarmShown||typeAlarmLocked" @locked="applicationsLocked=$event"/>
  <SectionPanel v-else :title="tabLabel"><p class="tl-muted">{{tabLabel}}尚未接入当前设备类型页面。</p></SectionPanel>
  <TypeAlarmRuleCreate v-if="typeAlarmSelection" :type-id="typeId" :rule-id="typeAlarmSelection.ruleId" :disabled="shown||busy||!!review||streamsLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @locked="typeAlarmLocked=$event" @close="closeTypeAlarm" @saved="typeAlarmSaved" @removed="typeAlarmSaved($event,true)"/>
  <el-button v-if="review==='unknown'&&!shown" @click="shown=true">核对资料保存结果</el-button>
 </template></AsyncState>
 <el-dialog :model-value="shown&&readable" :title="review?'核对类型资料':editSection==='tags'?'编辑标签':'修改信息'" :class="{'type-settings-profile-dialog':editSection==='tags'}" :width="editSection==='tags'?'min(700px,94vw)':'min(500px,94vw)'" :close-on-click-modal="false" :close-on-press-escape="!busy" :before-close="(done:()=>void)=>{if(!busy){close();done()}}" destroy-on-close>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <el-alert v-if="review" :title="review==='unknown'?'原保存结果尚未确认；当前资料不能证明原写入的历史结果，不会自动重发。':'本次保存被拒绝，原草稿已保留；请读取当前版本核对。'" type="warning" :closable="false"/>
  <p v-if="observed">当前名称：{{observed.type.name}}；当前描述：{{observed.description||'—'}}</p>
  <el-form label-position="top" :disabled="busy||!!review||!writable||streamsLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @submit.prevent="save">
   <template v-if="editSection==='name'">
    <el-form-item label="类型名称"><el-input v-model="form.name" aria-label="编辑类型名称" maxlength="128"/></el-form-item>
    <el-form-item label="设备接入类型">
     <el-radio-group :model-value="access.deviceKind" :disabled="!canEditAccess" aria-label="设备接入类型" @update:model-value="changeAccessKind(String($event))">
      <el-radio v-for="[value,label] in typeKinds" :key="value" :value="value">{{label}}</el-radio>
     </el-radio-group>
    </el-form-item>
    <el-form-item label="设备通信方式">
     <el-select v-model="access.networkType" :disabled="!canEditAccess" aria-label="设备通信方式" placeholder="请选择">
      <el-option v-for="[value,label] in editNetworks" :key="value" :value="value" :label="label"/>
     </el-select>
    </el-form-item>
    <el-form-item :label="access.deviceKind==='GATEWAY'?'网关接入协议':'设备接入协议'">
     <el-select v-model="access.payloadProtocol" :disabled="!canEditAccess" aria-label="设备接入协议" placeholder="请选择">
      <el-option v-for="[value,label] in editProtocols" :key="value" :value="value" :label="label"/>
     </el-select>
    </el-form-item>
    <p v-if="accessHint" class="type-access-hint tl-muted" role="status">{{accessHint}}</p>
   </template>
   <el-form-item v-if="editSection!=='tags'" label="类型描述"><el-input v-model="form.description" aria-label="编辑类型描述" placeholder="填写类型描述" type="textarea" :rows="4" maxlength="500"/></el-form-item>
   <el-form-item v-if="editSection==='tags'"><div class="type-tag-rows"><div v-for="(row,index) in form.tags" :key="index" class="type-tag-row"><el-input v-model="row.key" :aria-label="`编辑标签名称${index+1}`" placeholder="标签名称，比如：服务商"/><el-input v-model="row.value" :aria-label="`编辑标签值${index+1}`" placeholder="标签值，比如：ThingsLink"/><el-button size="small" text type="danger" @click="form.tags.splice(index,1)">移除</el-button></div><el-button size="small" plain :disabled="form.tags.length>=20||streamsLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @click="form.tags.push({key:'',value:''})">添加标签</el-button></div></el-form-item></el-form>
  <template #footer><el-button :disabled="busy||streamsLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @click="close">{{review?'关闭':'取消'}}</el-button><template v-if="review"><el-button :loading="busy" @click="readCurrent">读取当前资料</el-button><el-button v-if="review==='rejected'&&observed&&writable" :disabled="busy||streamsLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @click="rebase">使用当前版本继续编辑</el-button><el-button v-if="review==='unknown'" :disabled="busy||!observed||streamsLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" type="primary" @click="finishReview">已核对，结束本次操作</el-button></template><el-button v-else-if="writable" type="primary" :loading="busy" :disabled="checkingAccess" @click="save">{{editSection==='tags'?'提交':'保存'}}</el-button></template>
 </el-dialog><DeviceTypeActivityPolicyDialog ref="policy" :disabled="shown||busy||!!review||devicesLocked||deleteLocked||productCredentialsLocked||registrationPolicyLocked||definitionImportLocked||definitionBatchLocked||streamsLocked||materialImportLocked||productIdentifierLocked||locationPolicyLocked||planarPolicyLocked||cameraPolicyLocked||iccidPolicyLocked||onlinePolicyLocked||templatesLocked||productSharingLocked" @locked="policyLocked=$event"/>
</main></template>
<style scoped>.type-access-hint{margin:-10px 0 16px;font-size:12px}.type-detail{padding:12px 30px 50px}.type-detail :deep(.tl-back){font-size:14px;font-weight:500;line-height:24px}.type-detail :deep(.tl-page-header h1.is-secondary){color:#303133}.type-detail :deep(.tl-tabs>.el-tabs__header){margin-bottom:0}.type-heading{display:flex;align-items:center;gap:14px;margin:12px 0 26px}.type-summary>span{margin-left:28px}.type-function-tools{display:flex;align-items:center;gap:10px;margin:10px 0 30px;flex-wrap:wrap}.type-function-tools :deep(.el-button){margin-left:0;height:32px;padding:8px 15px;font-size:12px}.type-intro h3,.type-reference-section h3{font-size:22px;line-height:32px;font-weight:400;color:#002822;margin:26px 0 0}.type-intro p,.type-reference-section p,.type-limitation{font-size:14px;color:var(--tl-muted);line-height:1.7}.type-reference-section{margin:40px 0}.type-intro p{font-size:15px;font-weight:400;line-height:22px;color:#888;margin:8px 0 0;min-height:23px}.type-reference-section h3{font-size:22px;line-height:32px;margin:0}.type-reference-section p{font-size:15px;line-height:22px;color:#888;margin:8px 0 10px}.type-summary{margin:-14px 0 14px;color:var(--tl-muted);font-size:13px;line-height:24px;overflow-wrap:anywhere}.type-cube{flex-shrink:0;color:var(--tl-muted)}.type-heading>.el-icon{font-size:32px;color:var(--tl-muted)}.type-heading h2{font-size:26px;line-height:34px;font-weight:500;color:#002822;overflow-wrap:anywhere;margin:0}.type-detail :deep(.tl-section-panel){margin-bottom:24px}.type-candidate,.type-documentation{margin:20px 0}.type-candidate>summary,.type-documentation>summary{cursor:pointer;color:var(--tl-primary);font-size:14px}.type-tags{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.type-tag-rows{width:100%}.type-tag-row{display:flex;gap:8px;margin-bottom:8px}.type-tag-row :deep(.el-input){min-width:0}@media(max-width:640px){.type-detail{padding:20px 15px}.type-tag-row{flex-wrap:wrap}.type-tag-row :deep(.el-input){flex:1 1 40%}}</style>

<style scoped>
:global(.type-settings-profile-dialog .el-dialog__body) { max-height: calc(85dvh - 148px); padding: 24px 20px 30px; overflow-y: auto; }
:global(.type-settings-profile-dialog .el-form-item:last-child) { margin-bottom: 0; }
.type-tag-row :deep(.el-input) { --el-input-height: 33px; font-size: 12px; }
</style>
