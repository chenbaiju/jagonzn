<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {externalAction} from './rule-external-action-draft'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router'
import {Plus} from '@element-plus/icons-vue'
import {can,projectId} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import type {Schema} from '@/core/contracts'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {activateRule,getRule,listRuleDirectory,pauseRule} from './api'
import {ruleKinds,ruleKindLabels,type RuleKind} from './rule-builder-draft'
import {definitionUuid} from './device-task-definition-port'
import {cas} from './models'
const route=useRoute(),router=useRouter(),allowed=computed(()=>!!projectId.value&&can('rule:manage'))
const sourceKind=ref(''),ruleType=ref(''),status=ref(''),limit=ref(24),cursors=ref<(string|undefined)[]>([undefined])
const page=computed(()=>cursors.value.length),writing=ref(false),checking=ref(false),unavailable=ref(false),writeError=ref('')
type Item=Schema<'MessageRuleDirectoryItem'>
const pending=ref<{project:string;id:string;expected:number;versionId:string;enabled:boolean;uncertain:boolean;accepted:boolean}>()
const blocked=computed(()=>writing.value||checking.value||!!pending.value)
let alive=true,generation=0
const resource=useResource(signal=>listRuleDirectory(projectId.value,{sourceKind:sourceKind.value,ruleType:ruleType.value,status:status.value,limit:limit.value,cursor:cursors.value.at(-1)},signal))
function invalidate(){generation++;pending.value=undefined;writing.value=false;checking.value=false;unavailable.value=false;writeError.value='';resource.clear();cursors.value=[undefined]}
function denyAuthority(cause:unknown,uncertain=false){
 if(!(cause instanceof ApiError)||![401,403,404].includes(cause.status))return false
 generation++;pending.value=undefined;writing.value=false;checking.value=false;resource.clear();unavailable.value=true;writeError.value=(uncertain?'原写未确认。':'')+errorMessage(cause);return true
}
watch(resource.error,cause=>{denyAuthority(cause,!!pending.value)})
const dispose=onIdentityChange(invalidate);onScopeDispose(()=>{alive=false;dispose()})
function filtersFromRoute(){sourceKind.value=['DEVICE','DEVICE_TYPE'].includes(String(route.query.sourceKind))?String(route.query.sourceKind):'';ruleType.value=ruleKinds.includes(route.query.ruleType as RuleKind)?String(route.query.ruleType):'';status.value=['ACTIVE','INACTIVE'].includes(String(route.query.status))?String(route.query.status):''}
watch([()=>route.query.sourceKind,()=>route.query.ruleType,()=>route.query.status],()=>{filtersFromRoute();cursors.value=[undefined];if(allowed.value&&!unavailable.value&&!blocked.value)void resource.reload()},{immediate:true})
watch([projectId,allowed],()=>{invalidate();filtersFromRoute();if(allowed.value)void resource.reload()},{immediate:true})
async function filter(){if(blocked.value||unavailable.value)return;const query={...route.query};for(const [key,value] of Object.entries({sourceKind:sourceKind.value,ruleType:ruleType.value,status:status.value})){if(value)query[key]=value;else delete query[key]}await router.replace({query})}
function next(){const cursor=resource.data.value?.nextCursor;if(!blocked.value&&cursor&&!cursors.value.includes(cursor)){cursors.value.push(cursor);void resource.reload()}}
function previous(){if(!blocked.value&&page.value>1){cursors.value.pop();void resource.reload()}}
function resize(value:number){if(!blocked.value){limit.value=value;cursors.value=[undefined];void resource.reload()}}
function detail(row:Item){if(blocked.value||!definitionUuid(row.id))return;void router.push({path:`/rules/messages/${row.id}`,query:{origin:'directory',...(row.sourceKind==='DEVICE_TYPE'&&row.sourceReferenceId?{source:'device-type',deviceTypeId:row.sourceReferenceId}:{})}})}
function create(){if(allowed.value&&!unavailable.value&&!blocked.value)void router.push('/rules/messages/create')}
function sourceLabel(value?:string|null){return value==='DEVICE_TYPE'?'设备类型':value==='DEVICE'?'设备':'项目'}
function kindLabel(value?:string|null){return value&&ruleKinds.includes(value as RuleKind)?ruleKindLabels[value as RuleKind].label:'类型未记录'}
const actionLabels:Record<string,string>={'PERIOD_USAGE':'计算抄表周期累计值','POINT_IN_CIRCLE':'GPS 位置电子围栏检查（圆形）','POINT_IN_POLYGON':'GPS 位置电子围栏检查（多边形）','COORDINATE_TRANSFORM':'GPS 位置坐标系转换','event-ota-check-action':'OTA 升级检查','external-url-forward-action':'推送到外部 URL','external-mqtt-forward-action':'推送到外部 MQTT','report-cloud-function':'自定义云函数','report-gateway-properties-function':'向当前网关上报子设备属性','event-device-properties-function':'向指定设备下发属性','event-device-command-function':'向指定设备下发命令','current-device-properties-function':'向当前设备下发属性','current-device-command-function':'向当前设备下发命令','current-device-data-function':'自定义数据下发函数','current-device-cloud-properties-function':'向当前设备更新云端属性','current-device-report-data-function':'向当前设备下发自定义数据','event-cloud-function':'自定义云函数','device-report-properties-function':'向指定设备下发属性','device-report-cloud-properties-function':'向指定设备更新云端属性','device-report-command-function':'向指定设备下发命令','device-report-data-function':'向指定设备下发自定义数据','cloud-function':'云函数','device-command-action':'向设备下发命令','device-property-set-action':'向当前设备下发属性','notification-action':'发送通知','email-action':'发送邮件通知','webhook-action':'HTTP请求','device-notification-action':'设备消息通知','alarm-create-action':'创建告警','alarm-clear-action':'清除告警','DATA_PROPERTY':'属性解析函数','DATA_MODBUS_RTU':'Modbus RTU解析','DATA_GATEWAY_PROPERTY':'云网关解析函数','DATA_DATA_DOWNLINK':'自定义数据下发','CLOUD_FUNCTION':'云函数','FUNCTION':'云函数','DEVICE_COMMAND':'向设备下发命令','DEVICE_PROPERTY_UPDATE':'更新设备属性','DEVICE_PROPERTY_PUSH':'向设备下发属性','HTTP_REQUEST':'HTTP请求','DEVICE_NOTIFICATION':'设备通知','device-notification':'设备通知'}
/** 仅已确认的函数类使用原站FUNCTION样式，其它原生操作不推测配色。 */
function functionAction(value:string){return value.toLowerCase().includes('function')||['DATA_PROPERTY','DATA_GATEWAY_PROPERTY','DATA_DATA_DOWNLINK','CLOUD_FUNCTION','FUNCTION','PREPROCESS','DATA_DOWNLINK','GATEWAY_PARSER'].includes(value)}
function actionLabel(value:string){return actionLabels[value]??({'PREPROCESS':'预处理函数','DATA_OPERATIONS':'自定义数据操作','DATA_DOWNLINK':'自定义数据下发','GATEWAY_PARSER':'云网关解析','NATIVE_PARSER':'Modbus RTU解析'}[value]??value)}
async function toggle(row:Item,enabled:boolean){
 if(!allowed.value||unavailable.value||blocked.value||!definitionUuid(row.id)||enabled===(row.status==='ACTIVE'))return
 const snapshot={id:row.id,version:row.version,status:row.status,activeVersionId:row.activeVersionId,selectedVersionId:row.selectedVersionId,ruleType:row.ruleType}
 const project=projectId.value,id=snapshot.id,turn=generation,epoch=identityEpoch(),current=()=>alive&&turn===generation&&epoch===identityEpoch()&&project===projectId.value&&allowed.value
 writing.value=true;writeError.value=''
 try{
  const before=await getRule(project,id);if(!current())return
  if(before.id!==snapshot.id||before.version!==snapshot.version||before.status!==snapshot.status||(before.activeVersionId??null)!==(snapshot.activeVersionId??null)){writeError.value='规则状态已变化，请按最新状态重新操作';await resource.reload();return}
  // 显式触发卡片启用所展示候选；暂停始终核原活动版本，历史无触发规则保持旧优先级。
  const versionId=enabled?(snapshot.ruleType==null?before.activeVersionId??snapshot.selectedVersionId:snapshot.selectedVersionId):before.activeVersionId;if(!definitionUuid(versionId))throw new Error('规则没有完整版本，请打开规则详情核对')
  const expected=cas(snapshot.version),intent={project,id,expected,versionId,enabled,uncertain:false,accepted:false};pending.value=intent
  const result=enabled?await activateRule(project,id,versionId,expected):await pauseRule(project,id,expected)
  if(!current())return
  intent.accepted=true
  if(result.id!==id||result.version!==expected+1||result.status!==(enabled?'ACTIVE':'PAUSED')||result.activeVersionId!==versionId)throw new Error('规则状态回执不匹配，请先核对')
  const fresh=await getRule(project,id);if(!current())return
  if(fresh.id!==id||fresh.version!==result.version||fresh.status!==result.status||fresh.activeVersionId!==result.activeVersionId)throw new Error('规则状态回读不匹配，请先核对')
  pending.value=undefined;await resource.reload()
 }catch(cause){if(current()){
  writeError.value=errorMessage(cause)
  if(pending.value){
   if(!pending.value.accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,401,403,404,409,422].includes(cause.status)){
    pending.value=undefined
    if(cause.status===409){writeError.value='规则状态已变化，请按最新状态重新操作';await resource.reload()}
   }else pending.value.uncertain=true
  }
  denyAuthority(cause,!!pending.value)
 }}
 finally{if(current())writing.value=false}
}
async function verify(){const intent=pending.value;if(!intent||writing.value||checking.value||!allowed.value)return;const turn=generation,epoch=identityEpoch(),current=()=>alive&&turn===generation&&epoch===identityEpoch()&&projectId.value===intent.project&&allowed.value;checking.value=true
 try{const fresh=await getRule(intent.project,intent.id);if(!current())return;if(fresh.id!==intent.id||fresh.version!==intent.expected+1||fresh.status!==(intent.enabled?'ACTIVE':'PAUSED')||fresh.activeVersionId!==intent.versionId)throw new Error('当前规则尚未确认本次状态变更；保留原操作，不重复发送');pending.value=undefined;writeError.value='';await resource.reload()}catch(cause){if(current()){writeError.value=errorMessage(cause);denyAuthority(cause,true)}}finally{if(current())checking.value=false}}
onBeforeRouteLeave(()=>!blocked.value)
onBeforeRouteUpdate(to=>!blocked.value||to.fullPath===route.fullPath)
function beforeUnload(event:BeforeUnloadEvent){if(blocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
</script>
<template><main class="tl-page rule-directory">
 <header class="directory-header"><h1>消息规则 <span v-if="resource.data.value">({{resource.data.value.totalCount}})</span></h1><el-button v-if="allowed&&!unavailable" type="primary" size="small" :icon="Plus" :disabled="blocked" @click="create">创建规则</el-button></header>
 <div v-if="allowed&&!unavailable" class="tl-learning-resource"><ReferenceIcon glyph="󰋽"/><span>学习资源：</span><a href="https://www.thingscloud.xyz/docs/guide/rules/overview.html" target="_blank" rel="noopener noreferrer"><span>什么是消息规则？</span><ReferenceIcon glyph="󰏌"/></a></div>
 <div v-if="allowed&&!unavailable" class="directory-filters">
  <el-select v-model="sourceKind" aria-label="设备来源类型" placeholder="不限设备来源类型" size="small" :disabled="blocked" @change="filter"><el-option label="不限设备来源类型" value=""/><el-option label="设备" value="DEVICE"/><el-option label="设备类型" value="DEVICE_TYPE"/></el-select>
  <el-select v-model="ruleType" aria-label="规则类型" placeholder="不限规则类型" size="small" :disabled="blocked" @change="filter"><el-option label="不限规则类型" value=""/><el-option v-for="kind in ruleKinds" :key="kind" :label="ruleKindLabels[kind].label" :value="kind"/></el-select>
  <el-select v-model="status" aria-label="规则状态" placeholder="不限规则状态" size="small" :disabled="blocked" @change="filter"><el-option label="不限规则状态" value=""/><el-option label="启用" value="ACTIVE"/><el-option label="停用" value="INACTIVE"/></el-select>
 </div>
 <el-alert v-if="writeError" :title="writeError" type="error" :closable="false"/><el-button v-if="pending?.uncertain" size="small" :loading="checking" :disabled="writing" @click="verify">重新读取核对</el-button>
 <AsyncState :forbidden="!allowed||unavailable" :loading="resource.loading.value" :error="resource.error.value" :empty="!resource.data.value?.items?.length" empty-text="无所不能的消息规则" @retry="resource.reload">
  <template #empty><p class="rule-directory-empty-copy">通过消息规则，ThingsLink 可以对设备属性和事件的上报进行各种预设的计算和调度，从而实现设备自动化、智能化。</p><el-button type="primary" size="small" :disabled="blocked" @click="create">创建规则</el-button></template>
  <div class="rules-cards"><article v-for="row in resource.data.value?.items" :key="row.id" class="rule-card" :aria-busy="writing&&pending?.id===row.id">
   <button class="card-link" type="button" :disabled="blocked" @click="detail(row)"><h2>{{row.name}}</h2><p>{{sourceLabel(row.sourceKind)}} - {{kindLabel(row.ruleType)}}</p><div class="card-actions"><el-tooltip v-for="(action,index) in row.actionTypes" :key="index" :content="actionLabel(action)"><span class="action-icon" :class="{'function-action':functionAction(action)}" aria-hidden="true"><ReferenceIcon :glyph="externalAction(action)?'󰤲':action.toLowerCase().includes('function')||action.startsWith('DATA_')?'󰡱':'󰭽'"/></span></el-tooltip></div></button>
   <el-switch class="card-status" :model-value="row.status==='ACTIVE'" :aria-label="row.name+'启用状态'" :disabled="blocked" @update:model-value="toggle(row,!!$event)"/>
  </article></div>
  <CursorPager v-if="page>1||resource.data.value?.nextCursor" :page="page" :has-next="!!resource.data.value?.nextCursor" :loading="resource.loading.value||blocked" :limit="limit" :show-pages="false" @next="next" @previous="previous" @update:limit="resize"/>
 </AsyncState>
</main></template>
<style scoped>
.rule-directory{padding:20px 30px 50px;min-width:0}.directory-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 0 20px}.directory-header h1{display:flex;align-items:center;gap:10px;margin:0;font-size:28px;font-weight:400;line-height:40px;color:#1f2f3d}.directory-header h1 span{font-size:20px}.directory-filters{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:20px}.directory-filters .el-select{width:150px}.directory-filters :deep(.el-select__wrapper){height:33px;min-height:33px;font-size:13px;line-height:33px;padding:0 5px 0 16px;gap:6px}.directory-filters :deep(.el-select__suffix){width:25px;justify-content:center}.directory-filters :deep(.el-select__caret){font-size:14px;color:#c0c4cc}.tl-learning-resource .reference-icon{font-size:16px;line-height:20px;height:20px;margin:0 5px 0 0}.tl-learning-resource a{display:inline-flex;align-items:center}.tl-learning-resource a>span{margin-right:.25rem}.rules-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:20px}.rule-card{color:#303133;position:relative;min-width:0;border:1px solid #ebeef5;border-radius:4px;background:#fff;transition:box-shadow .3s}.rule-card:hover{box-shadow:0 2px 12px 0 #0000001a}.card-link{display:block;width:100%;height:100%;border:0;background:none;text-align:left;padding:20px;cursor:pointer;font:inherit;color:inherit}.card-link:disabled{cursor:default}.card-link h2{height:22px;margin:0 50px 0 0;font-size:16px;line-height:22px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.card-link p{margin:5px 0 0;font-size:14px;line-height:22px;color:#888}.card-actions{margin-top:10px;height:28px;overflow:hidden;display:flex;gap:5px}.action-icon{display:inline-block;width:28px;height:28px;text-align:center;border-radius:5px;color:#fff;background:#7266ba}.action-icon.function-action{background:#107c41}.action-icon .reference-icon{font-size:14px;height:28px}.card-status{position:absolute;top:20px;right:20px;height:20px}.rule-directory-empty-copy{max-width:680px;margin:0 auto 20px;color:var(--tl-muted);font-size:14px;line-height:1.7;text-align:center}@media(min-width:1920px){.rules-cards{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:991px){.rules-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:767px){.rules-cards{grid-template-columns:1fr}.rule-directory{padding:20px 15px 40px}}
</style>
