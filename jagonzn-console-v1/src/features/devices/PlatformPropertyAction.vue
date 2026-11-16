<script setup lang="ts">
import {showOperationFeedback} from '@/ui/operation-feedback'
import {dailyTimerValue,dailyTimerListValue,dailyTimerRangeValue,dailyTimerRangeListValue,dailyTimerDurationValue,dailyTimerDurationListValue,dailyTimerIntervalValue,dailyTimerIntervalListValue} from './daily-timer-value'
import {ref,shallowRef,computed,watch,onScopeDispose} from 'vue'
import {ElMessage} from 'element-plus'
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {can,projectId,currentProject} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,onIdentityChange,identityEpoch} from '@/core/http'
import {copyEnumOptions,enumDraftValue} from './single-property-enum'
import {readNumberDraft} from './single-property-number'
import {switchState,switchEncoding,type SwitchEncoding} from './switch-value'
import {useDeviceGuard} from './use-device-guard'
import {preparePlatformPropertyBody,prepareSinglePlatformPropertyBody,decodePlatformCurrent,samePlatformCurrent} from './platform-properties-json'
import {readPropertyDownlinkCapabilities,uniquePropertyDownlinkCapability,type BoundPropertyDownlinkModel} from './property-downlink-capabilities-api'
import {submitPlatformProperties,platformCurrent,readPlatformPropertySubmission,assertPlatformReceipt,type PlatformPropertyKind,type PlatformPropertyReceipt} from './platform-properties-api'
const props=defineProps<{deviceId:string;modelVersionId?:string;kind:PlatformPropertyKind;disabled?:boolean;hideTrigger?:boolean;draftRevision?:number;boundDownlinkModel?:BoundPropertyDownlinkModel}>()
const emit=defineEmits<{saved:[];busy:[value:boolean]}>()
const open=ref(false),input=ref('{}'),status=ref<'idle'|'sending'|'accepted'|'confirmed'|'unknown'>('idle'),error=ref(''),checking=ref(false)
type SinglePropertySnapshot=Readonly<{project:string;device:string;epoch:number;model:string;key:string;name:string;nameIsCurrent:boolean;accessType:string;dataType:string;switchEncoding?:SwitchEncoding;value:string;enumOptions?:readonly string[]}>
const single=shallowRef<SinglePropertySnapshot>()
const textDraft=ref<string>(),textType=computed(()=>single.value?.dataType==='TEXT')
const invalidTextDraft=computed(()=>textType.value&&textDraft.value===undefined)
// 显示草稿只在打开时解码；每次编辑仅编码字符串，超长或坏Unicode草稿不能被读取上限清空。
const textValue=computed({get:()=>textDraft.value??'',set:(value:string)=>{if(status.value==='idle'&&textType.value&&typeof value==='string'){textDraft.value=value;input.value=JSON.stringify(value)}}})
function initialText(raw:string):string|undefined{
 try{const value=parseDashboardRuntimeResponse(new TextEncoder().encode(`{"v":${raw}}`));return Object.keys(value).length===1&&typeof value.v==='string'?value.v:undefined}catch{return undefined}
}
const switchDraft=computed(()=>single.value?.dataType==='SWITCH')
const switchOptions=computed(()=>single.value?.switchEncoding==='NUMBER'?[{value:'1',label:'开启（1）'},{value:'0',label:'关闭（0）'}]:single.value?.switchEncoding==='TEXT'?[{value:'"ON"',label:'开启（ON）'},{value:'"OFF"',label:'关闭（OFF）'}]:[{value:'true',label:'开启（true）'},{value:'false',label:'关闭（false）'}])
const switchSelection=computed({get:()=>{try{const parsed=parseDashboardRuntimeResponse(new TextEncoder().encode(`{"v":${input.value}}`));const state=switchState(parsed.v,single.value?.switchEncoding);return state===undefined?undefined:switchOptions.value[state?0:1]!.value}catch{return undefined}},set:(value:string|undefined)=>{if(status.value==='idle'&&switchOptions.value.some(option=>option.value===value))input.value=value!}})
const invalidSwitchDraft=computed(()=>switchDraft.value&&switchSelection.value===undefined)
const enumDraft=computed(()=>single.value?.dataType==='ENUM')
const enumValue=computed({get:()=>enumDraftValue(input.value,single.value?.enumOptions),set:(value:string|undefined)=>{if(status.value==='idle'&&typeof value==='string'&&single.value?.enumOptions?.includes(value))input.value=JSON.stringify(value)}})
const invalidEnumDraft=computed(()=>enumDraft.value&&enumValue.value===undefined)
const numberType=computed(()=>single.value?.dataType==='NUMBER')
const numberDraft=computed(()=>numberType.value?readNumberDraft(input.value):undefined)
const invalidNumberDraft=computed(()=>numberType.value&&numberDraft.value===undefined)
const numberValue=computed({get:()=>input.value,set:(value:string)=>{if(status.value==='idle'&&numberType.value&&writable.value&&typeof value==='string')input.value=value}})
function stepNumber(direction:1|-1){
 if(status.value!=='idle'||!numberType.value||!writable.value)return
 const next=direction===1?numberDraft.value?.increase:numberDraft.value?.decrease
 if(next!==undefined)input.value=next
}
const denied=ref(false)
const writable=computed(()=>can('device:control')&&currentProject.value?.status==='ACTIVE')
const blocked=computed(()=>status.value==='sending'||checking.value||status.value==='unknown'||status.value==='accepted'&&!!single.value)
watch(blocked,value=>emit('busy',value),{immediate:true,flush:'sync'})
const receipt=ref<PlatformPropertyReceipt>(),capture=useDeviceGuard(()=>props.deviceId)
let generation=0,controller:AbortController|undefined,intent:Readonly<{project:string;device:string;model:string;kind:PlatformPropertyKind;key:string;bodyHash:string;draftRevision?:number;boundModel?:BoundPropertyDownlinkModel;expectedDownlinkCapabilityId?:string;prepared:ReturnType<typeof preparePlatformPropertyBody>|null}>|undefined
function reset(){generation++;controller?.abort();controller=undefined;open.value=false;single.value=undefined;textDraft.value=undefined;input.value='{}';status.value='idle';error.value='';receipt.value=undefined;intent=undefined;checking.value=false}
function resetScope(){denied.value=false;reset()}
function deny(){reset();denied.value=true;ElMessage.error('操作权限已失效，请刷新权限后重试')}
const dispose=onIdentityChange(resetScope);onScopeDispose(()=>{reset();dispose();emit('busy',false)})
watch([()=>projectId.value,()=>props.deviceId,()=>props.kind,()=>can('device:control')],resetScope)
watch(()=>props.draftRevision,()=>{if(single.value&&status.value==='idle')reset()},{flush:'sync'})
watch(()=>props.modelVersionId,model=>{if(intent&&model!==intent.model&&!blocked.value&&status.value!=='accepted')resetScope()})
function start(){
 if(denied.value||!can('device:control')||status.value==='sending'||checking.value)return
 if(status.value==='unknown'||status.value==='accepted'){open.value=true;return}
 if(!writable.value||!props.modelVersionId||props.disabled)return
 reset();intent=Object.freeze({project:projectId.value,device:props.deviceId,model:props.modelVersionId,kind:props.kind,key:crypto.randomUUID(),bodyHash:'',draftRevision:props.draftRevision,prepared:null,...(props.kind==='DOWNLINK'&&props.boundDownlinkModel?{boundModel:Object.freeze({...props.boundDownlinkModel,mixedKeys:Object.freeze([...props.boundDownlinkModel.mixedKeys])})}:{})});open.value=true
}
function startSingle(snapshot:SinglePropertySnapshot){
 if(denied.value||!writable.value||props.disabled||checking.value||['sending','unknown','accepted'].includes(status.value))return
 if(snapshot.dataType==='SWITCH'&&snapshot.switchEncoding!==undefined&&!switchEncoding(snapshot.switchEncoding))return
 if(snapshot.project!==projectId.value||snapshot.device!==props.deviceId||snapshot.epoch!==identityEpoch()||snapshot.model!==props.modelVersionId||typeof snapshot.value!=='string'||!/^[_a-zA-Z0-9-]{1,64}$/.test(snapshot.key))return
 if(props.kind==='DOWNLINK'?!['DOWNLINK','SHARED'].includes(snapshot.accessType):snapshot.accessType!=='CLOUD_PRIVATE')return
 start();if(!open.value||!intent)return
 single.value=Object.freeze({...snapshot,enumOptions:snapshot.dataType==='ENUM'?copyEnumOptions(snapshot.enumOptions):undefined});input.value=snapshot.value;textDraft.value=snapshot.dataType==='TEXT'?initialText(snapshot.value):undefined
}
defineExpose({startSingle})
function close(){if(status.value==='sending'||checking.value)return;if(status.value==='accepted'){reset();return}open.value=false}
async function confirm(current:number,check:()=>void){
 if(!intent?.prepared||!receipt.value)return
 const original=intent,accepted=receipt.value;checking.value=true;controller=new AbortController()
 try{
  const bytes=await platformCurrent(original.project,original.device,original.model,original.prepared!.keys,controller.signal);check();if(current!==generation)return
  const actual=decodePlatformCurrent(bytes,original.project,original.device,original.model,original.prepared!.keys)
  if(!samePlatformCurrent(actual,accepted.operationId!,original.kind,original.prepared!.properties))throw new Error('操作已受理，当前属性可能已变化，请刷新核对')
  status.value='confirmed';error.value='';open.value=false;emit('saved');showOperationFeedback(accepted.deliveryMode==='TCP_LOGICAL'?'平台已受理':original.kind==='DOWNLINK'?'属性下发已受理':'云端属性已更新')
 }catch(cause){if(current===generation&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}status.value='accepted';error.value=`操作已受理，当前值核对未完成。${errorMessage(cause)}`;emit('saved')}}
 finally{if(current===generation)checking.value=false}
}
async function reread(){if(status.value!=='accepted'||checking.value)return;await confirm(generation,capture())}
async function recover(){
 if(status.value!=='unknown'||checking.value||!intent?.prepared||!can('device:control'))return
 const current=generation,check=capture(),original=intent;checking.value=true;error.value='';controller=new AbortController()
 try{
  const value=await readPlatformPropertySubmission(original.project,original.device,original.model,original.kind,original.key,original.bodyHash,controller.signal);check();if(current!==generation)return
  assertPlatformReceipt(value,original.project,original.device,original.model,original.kind);receipt.value=value;status.value='accepted';await confirm(current,check)
 }catch(cause){if(current===generation&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}status.value='unknown';error.value=cause instanceof ApiError&&cause.status===404?'暂未定位原请求回执，请稍后核对；本次操作不会再次提交。':errorMessage(cause)}}
 finally{if(current===generation)checking.value=false}
}
async function submit(){
 if(denied.value||!intent||status.value!=='idle'||!writable.value)return
 const current=generation,check=capture();error.value=''
 if(invalidNumberDraft.value){error.value='请填写有效的数值';return}
 if(invalidTextDraft.value){error.value='请明确输入文本或选择使用空文本';return}
 if(invalidSwitchDraft.value){error.value='请选择符合固定值类型的开关值';return}
 if(invalidEnumDraft.value){error.value='请从冻结枚举候选中选择属性值';return}
 const originalInput=input.value,singleKey=single.value?.key
 let prepared:ReturnType<typeof preparePlatformPropertyBody>
 try{prepared=singleKey!==undefined?prepareSinglePlatformPropertyBody(intent.model,singleKey,originalInput):preparePlatformPropertyBody(intent.model,originalInput);if(single.value?.dataType==='DAILY_TIMER'&&(props.kind!=='CLOUD_UPDATE'||!singleKey||!dailyTimerValue(prepared.properties[singleKey])))throw new Error('请填写有效的每日定时器 JSON：enable、time、repeat及可选timezone');if(single.value?.dataType==='DAILY_TIMER_LIST'&&(props.kind!=='CLOUD_UPDATE'||!singleKey||!dailyTimerListValue(prepared.properties[singleKey])))throw new Error('请填写有效的每日定时器列表 JSON：timers及可选timezone');if(single.value?.dataType==='DAILY_TIMER_RANGE'&&(props.kind!=='CLOUD_UPDATE'||!singleKey||!dailyTimerRangeValue(prepared.properties[singleKey])))throw new Error('请填写有效的每日定时区间 JSON：enable、start_time、end_time、repeat及可选timezone');if(single.value?.dataType==='DAILY_TIMER_RANGE_LIST'&&(props.kind!=='CLOUD_UPDATE'||!singleKey||!dailyTimerRangeListValue(prepared.properties[singleKey])))throw new Error('请填写有效的每日定时区间列表 JSON：timers及可选timezone');if(single.value?.dataType==='DAILY_TIMER_DURATION'&&(props.kind!=='CLOUD_UPDATE'||!singleKey||!dailyTimerDurationValue(prepared.properties[singleKey])))throw new Error('请填写有效的每日定时时长 JSON：enable、start_time、duration、repeat及可选timezone');if(single.value?.dataType==='DAILY_TIMER_DURATION_LIST'&&(props.kind!=='CLOUD_UPDATE'||!singleKey||!dailyTimerDurationListValue(prepared.properties[singleKey])))throw new Error('请填写有效的每日定时时长列表 JSON：timers及可选timezone');if(single.value?.dataType==='DAILY_TIMER_INTERVAL'&&(props.kind!=='CLOUD_UPDATE'||!singleKey||!dailyTimerIntervalValue(prepared.properties[singleKey])))throw new Error('请填写有效的每日间歇定时 JSON：enable、from_time、to_time、duration、interval、repeat及可选timezone');if(single.value?.dataType==='DAILY_TIMER_INTERVAL_LIST'&&(props.kind!=='CLOUD_UPDATE'||!singleKey||!dailyTimerIntervalListValue(prepared.properties[singleKey])))throw new Error('请填写有效的每日间歇定时列表 JSON：timers及可选timezone')}catch(cause){error.value=errorMessage(cause);return}
 const original=intent;status.value='sending';let beforeWrite=true
 try{
  let capabilityId:string|undefined
  if(original.kind==='DOWNLINK'&&original.boundModel?.mixedKeys.some(key=>prepared.keys.includes(key))){
   if(original.boundModel.projectId!==original.project||original.boundModel.deviceId!==original.device||original.boundModel.modelVersionId!==original.model)throw new Error('设备连接与当前模型不一致，请刷新后重试')
   capabilityId=original.expectedDownlinkCapabilityId
   if(!capabilityId){
    controller=new AbortController();let capabilities
    try{capabilities=await readPropertyDownlinkCapabilities(original.project,original.device,original.model,controller.signal)}catch(cause){check();if(cause instanceof ApiError&&[401,403].includes(cause.status))throw cause;throw new Error('暂时无法确认设备连接，请稍后重试')}
    check();if(current!==generation)return
    capabilityId=uniquePropertyDownlinkCapability(capabilities,original.boundModel)
   }
   prepared=singleKey!==undefined?prepareSinglePlatformPropertyBody(original.model,singleKey,originalInput,capabilityId):preparePlatformPropertyBody(original.model,originalInput,capabilityId)
  }
  if(capabilityId&&(props.modelVersionId!==original.model||props.draftRevision!==original.draftRevision||props.boundDownlinkModel?.schemaDigest!==original.boundModel?.schemaDigest))throw new Error('设备模型已变化，请重新打开后重试')
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(prepared.body));check();if(current!==generation)return
  // 摘要等待期间项目可能归档；首次写前再核资格，不影响已发送原件的只读恢复。
  if(!writable.value)throw new Error('项目当前不可修改，本次操作尚未提交。')
  if(capabilityId&&(props.modelVersionId!==original.model||props.draftRevision!==original.draftRevision||props.boundDownlinkModel?.schemaDigest!==original.boundModel?.schemaDigest))throw new Error('设备模型已变化，请重新打开后重试')
  intent=Object.freeze({...original,prepared,...(capabilityId?{expectedDownlinkCapabilityId:capabilityId}:{}),bodyHash:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')});beforeWrite=false
  const value=await submitPlatformProperties(original.project,original.device,original.kind,prepared.body,original.key);check();if(current!==generation)return
  assertPlatformReceipt(value,original.project,original.device,original.model,original.kind);receipt.value=value;status.value='accepted';await confirm(current,check)
 }catch(cause){
  if(current===generation&&!(cause instanceof IdentityChanged)){
   if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}
   status.value=beforeWrite||cause instanceof ApiError&&!cause.outcomeUnknown&&cause.status>=400&&cause.status<500&&![10010,10014].includes(cause.code||0)?'idle':'unknown';error.value=errorMessage(cause)
  }
 }
}
</script>
<template><el-button v-if="!denied&&can('device:control')&&(!hideTrigger||status==='unknown'||status==='accepted')" :disabled="status==='sending'||checking||((disabled||!modelVersionId||!writable)&&status!=='unknown'&&status!=='accepted')" @click="start"><span class="reference-icon" :class="kind==='DOWNLINK'?'property-icon-downlink':'property-icon-cloud'" aria-hidden="true"/>{{kind==='DOWNLINK'?'下发属性':'更新云端属性'}}</el-button><el-dialog v-if="!denied" :model-value="open" :title="kind==='DOWNLINK'?'下发属性到设备':'更新云端属性'" class="platform-property-dialog" width="min(700px,94vw)" :close-on-click-modal="false" :show-close="status!=='sending'&&!checking" :close-on-press-escape="status!=='sending'&&!checking" @close="close"><el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="status==='unknown'" title="操作结果暂时无法确认，请核对原请求。本次操作不能再次提交。" type="warning" :closable="false"/><el-form label-position="top"><template v-if="single"><el-form-item label="属性标识符"><span>{{single.key}}</span></el-form-item><el-form-item label="属性名称"><span>{{single.name}}<small v-if="single.nameIsCurrent">（当前属性定义名称）</small></span></el-form-item></template><el-form-item v-if="switchDraft" label="属性值"><p v-if="invalidSwitchDraft" role="alert">{{single?.switchEncoding&&single.switchEncoding!=='BOOLEAN'?'当前值不符合固定开关值类型，请明确选择开启或关闭。':'当前值不符合布尔类型，请明确选择开启或关闭。'}}</p><el-radio-group v-model="switchSelection" :aria-label="single?.switchEncoding&&single.switchEncoding!=='BOOLEAN'?'单属性开关值':'单属性布尔值'" :disabled="status!=='idle'"><el-radio v-for="option in switchOptions" :key="option.value" :value="option.value">{{option.label}}</el-radio></el-radio-group></el-form-item><el-form-item v-else-if="enumDraft" label="属性值"><p v-if="!single?.enumOptions" role="alert">冻结枚举定义不可用，请核对设备绑定模型。</p><p v-else-if="invalidEnumDraft" role="alert">当前值不属于冻结枚举候选，请明确选择。</p><el-select v-model="enumValue" filterable aria-label="单属性枚举值" placeholder="请选择枚举值" :disabled="status!=='idle'||!single?.enumOptions" style="width:100%"><el-option v-for="option in single?.enumOptions" :key="option" :label="option" :value="option"/></el-select></el-form-item><el-form-item v-else-if="numberType" label="属性值"><p v-if="invalidNumberDraft" role="alert">请填写有效的数值，空值不会自动设为零。</p><p v-else-if="numberDraft?.increase===undefined||numberDraft?.decrease===undefined" role="status">该数值暂不支持按钮增减，请直接编辑。</p><el-input v-model="numberValue" type="text" inputmode="decimal" aria-label="单属性数值" :disabled="status!=='idle'||!writable" @keydown.up.prevent="stepNumber(1)" @keydown.down.prevent="stepNumber(-1)" style="width:100%"><template #prepend><el-button aria-label="数值减少一" :disabled="status!=='idle'||!writable||numberDraft?.decrease===undefined" @click="stepNumber(-1)">−</el-button></template><template #append><el-button aria-label="数值增加一" :disabled="status!=='idle'||!writable||numberDraft?.increase===undefined" @click="stepNumber(1)">＋</el-button></template></el-input></el-form-item><el-form-item v-else-if="textType" label="属性值"><p v-if="invalidTextDraft" role="alert">当前值不符合文本类型，请明确输入文本，或选择使用空文本。</p><el-input v-model="textValue" type="textarea" :rows="2" aria-label="单属性文本值" :disabled="status!=='idle'"/><el-button v-if="invalidTextDraft" :disabled="status!=='idle'" @click="textValue=''">使用空文本</el-button></el-form-item><el-form-item v-else :label="single?'属性 JSON 值':'属性 JSON 对象'"><el-input v-model="input" type="textarea" :rows="10" class="platform-property-json-editor" :input-style="{height:'320px',minHeight:'320px',resize:'none'}" :disabled="status!=='idle'" :aria-label="single?'单属性JSON值':'属性JSON'" :placeholder="single?'请输入该属性的JSON值':'请输入属性JSON对象'"/></el-form-item></el-form><template #footer><div style="display:flex;justify-content:flex-end;gap:10px"><el-button :disabled="status==='sending'||checking" @click="close">取消</el-button><el-button v-if="status==='accepted'" :loading="checking" @click="reread">重新核对</el-button><el-button v-else-if="status==='unknown'" :loading="checking" @click="recover">核对原请求</el-button><el-button v-else type="primary" :loading="status==='sending'||checking" :disabled="status!=='idle'||!writable||invalidSwitchDraft||invalidEnumDraft||invalidTextDraft||invalidNumberDraft" @click="submit">提交</el-button></div></template></el-dialog></template>
<style scoped>
:global(.platform-property-dialog .el-dialog__title){font-size:16px;font-weight:500;color:#303133;line-height:24px}
:global(.platform-property-dialog .el-dialog__body){color:#606266;font-size:14px;line-height:22px}
:global(.platform-property-dialog .el-form-item__label){color:#606266;font-size:14px;font-weight:600;line-height:22px}
:global(.platform-property-dialog .el-input__inner),:global(.platform-property-dialog .el-textarea__inner){color:#606266;font-family:inherit;font-size:14px;font-weight:400;line-height:22px}
:global(.platform-property-dialog .el-input__inner::placeholder),:global(.platform-property-dialog .el-textarea__inner::placeholder){color:#a8abb2;font-size:14px;font-weight:400}
:global(.platform-property-dialog .platform-property-json-editor .el-textarea__inner){min-height:320px;padding:4px 12px;background:#20211d;border:1px solid #20211d;border-radius:3px;color:#f8f8f2;font-family:SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:14px;font-weight:500;line-height:21px;box-shadow:none}
:global(.platform-property-dialog .platform-property-json-editor .el-textarea__inner::placeholder){color:#a0a0a0;font:400 14px/21px inherit}
:global(.platform-property-dialog .el-form-item){margin-bottom:20px}
:global(.platform-property-dialog .el-dialog__footer .el-button){font-size:14px;font-weight:400}
:global(.platform-property-dialog .el-dialog__footer .el-button + .el-button){margin-left:0}
:global(.platform-property-dialog small),:global(.platform-property-dialog [role=status]){color:#909399;font-size:12px;font-weight:400}
:global(.platform-property-dialog [role=alert]){color:#f56c6c;font-size:14px;font-weight:400}
</style>
