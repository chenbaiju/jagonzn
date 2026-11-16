<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,toRaw,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import AlarmRuntimeClearDialog from '../alarms/AlarmRuntimeClearDialog.vue'
import type {AlarmRuntimeInstanceIdentity} from '../alarms/alarm-runtime-instance-api'
import NotificationCustomerChannels from '../alarms/NotificationCustomerChannels.vue'
import {Plus,QuestionFilled,Refresh} from '@element-plus/icons-vue'
import ManagedAlarmRuleChoicesEditor from '../alarms/ManagedAlarmRuleChoicesEditor.vue'
import DeviceAlarmHistory from '../alarms/DeviceAlarmHistory.vue'
import CursorPager from '@/ui/CursorPager.vue'
import {readDeviceAlarmRules,type DeviceAlarmRule,type DeviceAlarmRulePage} from './device-alarm-rules-api'
import {MAX_ALLOWANCE_VERSION} from './device-alarm-allowance-api'
import {useDeviceAlarmAllowance} from './use-device-alarm-allowance'
const props=defineProps<{deviceId:string;visible:boolean;createRequestKey?:string;createPropertyKey?:string}>()
const emit=defineEmits<{cleared:[project:string,device:string]}>()
const data=shallowRef<DeviceAlarmRulePage>(),loading=ref(false),error=ref(''),denied=ref(false),page=ref(1),open=ref(false),selection=shallowRef<AlarmRuntimeInstanceIdentity>()
const readable=computed(()=>can('device:read')&&can('alarm:read')&&!denied.value),writable=computed(()=>readable.value&&can('alarm:maintain')&&currentProject.value?.status==='ACTIVE')
type EditorSelection=Readonly<{key:number;ruleId?:string;initialSource?:{kind:'DEVICE';ids:string[]};initialPropertyKey?:string;saved:(id:string)=>void;removed:(id:string)=>void;close:()=>void}>
const editor=shallowRef<EditorSelection>(),historyRuleId=ref<string>()
const editable=computed(()=>readable.value&&can('alarm:manage')&&currentProject.value?.status==='ACTIVE')
const allowanceWritable=computed(()=>editable.value&&['OWNER','ADMIN'].includes(session.user?.projectRole||''))
let generation=0,editorSerial=0,controller:AbortController|undefined,consumedCreateRequestKey=''
function closeAuxiliary(){editor.value=undefined;historyRuleId.value=undefined}
function clear(){allowance.reset();closeAuxiliary();generation++;controller?.abort();data.value=undefined;error.value='';loading.value=false;open.value=false;selection.value=undefined}
async function load(){
 if(!props.visible||!readable.value||allowance.busy.value)return
 closeAuxiliary();open.value=false
 const g=++generation,epoch=identityEpoch();controller?.abort();const active=new AbortController();controller=active;data.value=undefined;loading.value=true;error.value=''
 try{const result=await readDeviceAlarmRules(projectId.value,props.deviceId,page.value,24,active.signal);if(g===generation&&epoch===identityEpoch()&&props.visible&&readable.value)data.value=result}
 catch(cause){if(g!==generation||active.signal.aborted||epoch!==identityEpoch())return;error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){denied.value=true;selection.value=undefined;open.value=false;closeAuxiliary()}}
 finally{if(g===generation)loading.value=false}
}
function refresh(){if(!props.visible||!readable.value||loading.value||allowance.busy.value)return;page.value=1;void load()}
/** 分页事件先核当前可读快照与忙碌状态，不能只改页码而仍展示旧页。 */
function selectPage(value:number){
 if(!props.visible||!readable.value||loading.value||allowance.busy.value||!data.value||!Number.isSafeInteger(value)||value<1||value>2147483647||value===page.value||BigInt(value)>((BigInt(data.value.total)+23n)/24n||1n))return
 page.value=value;void load()
}
function select(row:DeviceAlarmRule){if(!existing(row)||!writable.value||allowance.busy.value||!row.manualClearAllowed||row.incident?.conditionState!=='ACTIVE')return;if(selection.value?.instanceId!==row.incident.instanceId||selection.value.ruleId!==row.id||selection.value.deviceId!==props.deviceId)selection.value={instanceId:row.incident.instanceId,ruleId:row.id,deviceId:props.deviceId};open.value=true}
const completed=computed(()=>{
 const selected=selection.value,project=projectId.value,device=props.deviceId,epoch=identityEpoch()
 return()=>{
  if(!selected||selection.value!==selected||!open.value||!props.visible||!readable.value||project!==projectId.value||device!==props.deviceId||epoch!==identityEpoch())return
  emit('cleared',project,device);void load()
 }
})
function existing(row:DeviceAlarmRule){return props.visible&&readable.value&&!loading.value&&data.value?.items.some(item=>toRaw(item)===toRaw(row))}
const allowance=useDeviceAlarmAllowance({
 device:()=>props.deviceId,visible:()=>props.visible,readable:()=>readable.value,writable:()=>allowanceWritable.value,
 current:row=>!!existing(row)&&!loading.value&&!!data.value?.items.some(item=>toRaw(item)===toRaw(row)&&item.deviceAllowed===row.deviceAllowed&&item.deviceAllowanceVersion===row.deviceAllowanceVersion),
 hasRule:rule=>!!data.value?.items.some(item=>item.id===rule),
 apply:state=>{if(data.value)data.value={...data.value,items:data.value.items.map(row=>row.id===state.ruleId?{...row,deviceAllowed:state.allowed,deviceAllowanceVersion:state.version}:row)}},
 beforeWrite:()=>{generation++;controller?.abort();loading.value=false;closeAuxiliary();open.value=false},
 readDenied:cause=>{clear();denied.value=true;error.value=errorMessage(cause)}
})
function changeAllowance(row:DeviceAlarmRule){void allowance.change(row,!row.deviceAllowed);return false}
function editRule(row?:DeviceAlarmRule,initialSource?:{kind:'DEVICE';ids:string[]},initialPropertyKey?:string){
 if(!props.visible||!editable.value||allowance.busy.value||row&&!existing(row))return
 closeAuxiliary();open.value=false
 const key=++editorSerial,epoch=identityEpoch(),project=projectId.value,device=props.deviceId,ruleId=row?.id
 const current=()=>editor.value?.key===key&&props.visible&&editable.value&&epoch===identityEpoch()&&project===projectId.value&&device===props.deviceId
 const saved=(id:string)=>{if(!current()||ruleId&&id!==ruleId||!ruleId&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id))return;editor.value=undefined;refresh()}
 editor.value=Object.freeze({key,ruleId,initialSource,initialPropertyKey,saved,removed:(id:string)=>{if(current()&&ruleId&&id===ruleId){editor.value=undefined;refresh()}},close:()=>{if(editor.value?.key===key)editor.value=undefined}})
}
function showHistory(row:DeviceAlarmRule){if(!existing(row))return;closeAuxiliary();open.value=false;historyRuleId.value=row.id}
const levels:Record<string,string>={NORMAL:'普通',IMPORTANT:'重要',URGENT:'紧急'}
const sources:Record<string,string>={DEVICE:'设备',DEVICE_TYPE:'设备类型'}
const allowanceHelp='是否允许当前设备使用该告警规则。'
watch(()=>[projectId.value,props.deviceId,session.user?.accountId,session.user?.projectRole,can('device:read'),can('alarm:read'),can('alarm:maintain'),can('alarm:manage'),currentProject.value?.status],()=>{clear();denied.value=false;page.value=1;void load()},{immediate:true,flush:'sync'})
watch(()=>props.visible,shown=>{allowance.hide();closeAuxiliary();generation++;controller?.abort();loading.value=false;open.value=false;if(shown)void load()},{flush:'sync'})
watch(()=>[props.createRequestKey,props.visible,editable.value] as const,([requestKey,shown,allowed])=>{if(!requestKey){consumedCreateRequestKey='';return}if(!shown||!allowed||requestKey===consumedCreateRequestKey)return;consumedCreateRequestKey=requestKey;editRule(undefined,{kind:'DEVICE',ids:[props.deviceId]},props.createPropertyKey)},{immediate:true,flush:'post'})
const stop=onIdentityChange(()=>{clear();denied.value=false;page.value=1;void load()});onScopeDispose(()=>{clear();stop()})
</script>
<template><section v-show="visible" aria-label="设备适用告警规则">
 <div class="alarm-rule-toolbar"><div class="rules-leading"><slot name="leading"/></div><div v-if="readable" class="rules-actions"><el-button size="small" plain :icon="Refresh" :loading="loading" :disabled="allowance.busy.value" @click="refresh">刷新</el-button><el-button v-if="editable" size="small" type="primary" :icon="Plus" :disabled="allowance.busy.value" @click="editRule()">创建告警规则</el-button></div></div>
 <p v-if="!readable" role="alert">没有设备告警规则的读取权限</p>
 <template v-else><el-alert v-if="error" :title="error" type="error" :closable="false"/>
 <el-alert v-if="allowance.writeDenied.value" title="当前设备规则允许状态的写入权限已撤销，仍可读取核对。" type="warning" :closable="false"/>
 <div v-for="review in allowance.reviews.value" :key="review.intent.rule" class="allowance-review">
  <el-alert :title="`${review.name}：${review.stage==='unknown'?'允许状态保存结果尚未确认':'允许状态保存已被拒绝'}，请读取当前状态核对。`" type="warning" :closable="false"/>
  <p v-if="review.error">{{review.error}}</p><p v-if="review.current">当前允许状态：{{review.current.allowed?'允许':'不允许'}}，版本 {{review.current.version}}。读取当前状态不代表原操作已成功。</p>
  <el-button size="small" :loading="review.reading" :disabled="allowance.busy.value" @click="allowance.readCurrent(review)">读取当前允许状态</el-button><el-button v-if="review.current" size="small" :disabled="allowance.busy.value" @click="allowance.continueWithCurrent(review)">按当前状态继续</el-button>
 </div>
 <el-table v-loading="loading" :data="data?.items||[]" empty-text="暂无数据">
 <el-table-column label="告警状态" min-width="120"><template #default="{row}"><span :class="{'active-alarm':row.incident?.conditionState==='ACTIVE'}">{{row.incident?.conditionState==='ACTIVE'?'告警中':row.incident?.conditionState==='PENDING'?'待定':'无告警'}}</span></template></el-table-column>
 <el-table-column prop="name" label="规则名称" min-width="100"/><el-table-column label="严重级别" width="100" align="center"><template #default="{row}"><el-tag size="small" effect="plain" :type="row.level==='URGENT'?'danger':row.level==='IMPORTANT'?'warning':'info'">{{levels[row.level]}}</el-tag></template></el-table-column>
 <el-table-column label="设备源类型" min-width="90"><template #default="{row}">{{sources[row.sourceKind]}}</template></el-table-column>
 <el-table-column label="规则可用" align="center"><template #default="{row}"><span :class="row.enabled?'rule-enabled':'rule-disabled'">{{row.enabled?'启用':'停用'}}</span></template></el-table-column>
 <el-table-column label="通知组" min-width="80"><template #default="{row}"><div v-if="row.notificationGroups.length" class="notification-groups"><el-tag v-for="group in row.notificationGroups" :key="group.id" size="small" effect="plain">{{group.name??'—'}}</el-tag></div><span v-else class="rule-unset">未设置</span></template></el-table-column>
 <el-table-column label="用户通知" min-width="80"><template #default="{row}"><NotificationCustomerChannels :channels="row.customerChannels"/></template></el-table-column>
 <el-table-column label="允许该设备" min-width="110" align="center"><template #header><span class="allowance-header">允许该设备<el-tooltip :content="allowanceHelp" placement="top" :trigger="['hover','focus']"><el-icon class="allowance-help" tabindex="0" role="img" :aria-label="allowanceHelp"><QuestionFilled/></el-icon></el-tooltip></span></template><template #default="{row}"><el-switch :model-value="row.deviceAllowed" :aria-label="`允许该设备：${row.name}`" :title="row.deviceAllowanceVersion===MAX_ALLOWANCE_VERSION?'允许状态版本已达上限，只能读取':undefined" :disabled="!allowance.canChange(row)" :loading="allowance.rowBusy(row.id)" :before-change="()=>changeAllowance(row)"/></template></el-table-column>
 <el-table-column min-width="200" align="right"><template #default="{row}"><el-button v-if="writable&&row.manualClearAllowed&&row.incident?.conditionState==='ACTIVE'" type="danger" size="small" :disabled="allowance.busy.value" @click="select(row)">解除告警</el-button><el-tooltip v-if="editable" content="编辑整条规则，可能影响其他设备" placement="top"><el-button size="small" :disabled="allowance.busy.value" @click="editRule(row)">编辑</el-button></el-tooltip><el-button size="small" @click="showHistory(row)">告警历史</el-button></template></el-table-column>
 </el-table><CursorPager v-if="data&&(page>1||data.items.length>0)" :page="page" :limit="24" :total="data?.total" :has-next="false" :loading="loading||allowance.busy.value" :show-sizes="false" @update:page="selectPage"/></template>
 </section><ManagedAlarmRuleChoicesEditor v-if="editor&&visible&&editable" :key="editor.key" :rule-id="editor.ruleId" :initial-source="editor.initialSource" :initial-property-key="editor.initialPropertyKey" @saved="editor.saved" @removed="editor.removed" @close="editor.close"/>
 <el-dialog :model-value="!!historyRuleId&&visible&&readable" title="告警历史" width="900px" class="device-rule-history-dialog" destroy-on-close @update:model-value="(shown:boolean)=>{if(!shown)historyRuleId=undefined}"><DeviceAlarmHistory v-if="historyRuleId&&visible&&readable" :key="historyRuleId" :device-id="deviceId" :rule-id="historyRuleId" :visible="true"/></el-dialog>
 <AlarmRuntimeClearDialog v-model="open" :identity="selection" @cleared="completed"/>
</template>
<style scoped>.alarm-rule-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:20px}.rules-leading:empty{display:none}.rules-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-left:auto}.rules-actions .el-button+.el-button{margin-left:0}.allowance-header{display:inline-flex;align-items:center;gap:4px}.allowance-help{font-size:13px;color:#c0c4cc;cursor:help}.allowance-help:focus-visible{outline:2px solid var(--tl-primary);outline-offset:2px;border-radius:50%}.allowance-review{margin-bottom:12px}.allowance-review p{margin:6px 0}.rule-enabled{color:#67c23a}.rule-disabled{color:#909399}.active-alarm{color:#f56c6c}.notification-groups{display:flex;flex-wrap:wrap;gap:6px}.rule-unset{color:#c0c4cc}:global(.device-rule-history-dialog){max-width:calc(100vw - 32px)}</style>
