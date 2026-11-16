<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {Delete,InfoFilled,Plus} from '@element-plus/icons-vue'
import {ApiError,assertIdentity,errorMessage,identityEpoch,IdentityChanged,onIdentityChange} from '../../core/http'
import AsyncState from '../../ui/AsyncState.vue'
import ReferenceIcon from '../../ui/ReferenceIcon.vue'
import DefinitionTypeLabel from '../device-types/DefinitionTypeLabel.vue'
import AlarmFieldHelp from './AlarmFieldHelp.vue'
import {alarmRuleSourceIdentity} from './alarm-rule-source-choices'
import AlarmRuleTimeSlots from './AlarmRuleTimeSlots.vue'
import AlarmRuleChoicePager from './AlarmRuleChoicePager.vue'
import type {AlarmRuleChoiceCategory,AlarmRulePagedEditorChoices} from './alarm-rule-choice-reader'
import {alarmRuleTimeRanges} from './alarm-rule-time-slots'
import type {ConfiguredAlarmRule,CreateConfiguredAlarmRule,AlarmRuleConfiguration} from './alarm-rule-management-api'
import {alarmRuleDraftRequest,alarmRuleDurations,alarmRuleInactiveDurations,alarmRuleOperators,blankAlarmRuleTerm,changeAlarmRuleTermProperty,editAlarmRuleDraft,newAlarmRuleDraft,type AlarmRuleEditContext,type AlarmRuleEditorChoices,type AlarmRuleEditorDraft,type AlarmRuleTermDraft} from './alarm-rule-editor-draft'
const props=defineProps<{projectId:string;ruleId?:string;initialSource?:AlarmRuleConfiguration['source'];initialPropertyKey?:string;canManage:boolean;initial?:ConfiguredAlarmRule;choices?:AlarmRuleEditorChoices;loading?:boolean;choicesLoading?:boolean;error?:unknown;choicesError?:unknown;choicePages?:AlarmRulePagedEditorChoices['pages'];save:(context:AlarmRuleEditContext,value:CreateConfiguredAlarmRule)=>Promise<void>;remove?:(context:AlarmRuleEditContext)=>Promise<void>}>()
const emit=defineEmits<{close:[];saved:[];removed:[];state:[value:{busy:boolean;review:boolean}];retry:[configuration:boolean];sourceChanged:[source:AlarmRuleConfiguration['source']];searchSources:[query:string];pageChoices:[category:AlarmRuleChoiceCategory,direction:'previous'|'next']}>()
const groupLabels=ref<Record<string,string>>({}),appLabels=ref<Record<string,string>>({})
const draft=ref<AlarmRuleEditorDraft>(),tab=ref('basic'),busy=ref(false),error=ref(''),review=ref(false),confirmRemove=ref(false)
watch([busy,review],()=>emit('state',{busy:busy.value,review:review.value}),{immediate:true,flush:'sync'})
const tabs=[{key:'basic',label:'基本信息'},{key:'notify',label:'告警通知'},{key:'valid_time',label:'有效时间'},{key:'alarm_clear',label:'告警解除'},{key:'settings',label:'其它设置'}] as const
function tabKey(event:KeyboardEvent,index:number){
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
 event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length
 tab.value=tabs[next]!.key;const buttons=(event.currentTarget as HTMLElement).parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]');buttons[next]?.focus()
}
let serial=0,initialized=false
const blocked=computed(()=>busy.value||review.value||!props.canManage),inactivity=computed(()=>draft.value?.configuration.triggerKind==='INACTIVITY')
const scopedChoices=computed(()=>props.choices?.projectId===props.projectId?props.choices:undefined)
const sourceChoices=computed(()=>scopedChoices.value?.source.kind===draft.value?.configuration.source.kind?scopedChoices.value?.sources??[]:[])
const currentChoices=computed(()=>{
 const source=draft.value?.configuration.source,choices=scopedChoices.value
 return source&&choices&&source.kind===choices.source.kind&&source.ids.join(',')===choices.source.ids.join(',')?choices:undefined
})
// 仅记住当前已选引用曾读到的展示名；切项目/身份清除，名称不是引用授权。
watch([()=>draft.value?.configuration.notifications.groupIds,()=>scopedChoices.value?.groups],()=>{const ids=draft.value?.configuration.notifications.groupIds??[];groupLabels.value=Object.fromEntries(ids.flatMap(id=>{const name=scopedChoices.value?.groups.find(item=>item.id===id)?.label??groupLabels.value[id];return name?[[id,name]]:[]}))},{immediate:true})
watch([()=>draft.value?.configuration.notifications.wechatAppId,()=>scopedChoices.value?.applications],()=>{const id=draft.value?.configuration.notifications.wechatAppId,name=id?scopedChoices.value?.applications.find(item=>item.id===id)?.label??appLabels.value[id]:undefined;appLabels.value=id&&name?{[id]:name}:{}},{immediate:true})
const properties=computed(()=>currentChoices.value?.properties??[])
const validChoices=computed(()=>!!currentChoices.value&&!props.choicesLoading&&!props.choicesError)
const selectedType=computed({get:()=>draft.value?.configuration.source.ids[0]??'',set:(value:string)=>{if(draft.value){draft.value.configuration.source.ids=value?[value]:[];sourceChanged()}}})
const ranges=computed(()=>draft.value?alarmRuleTimeRanges(draft.value.configuration.schedule.halfHourSlots).map(range=>range.join(' - ')).join('，'):'')
function clear(){serial++;groupLabels.value={};appLabels.value={};draft.value=undefined;busy.value=false;review.value=false;error.value='';confirmRemove.value=false;tab.value='basic';initialized=false}
function read(){clear();if(!props.canManage||props.loading||props.error||props.ruleId&&!props.initial)return;try{if(props.ruleId&&props.initial?.id!==props.ruleId)throw new Error('规则身份不一致');draft.value=props.initial?editAlarmRuleDraft(props.initial):newAlarmRuleDraft(props.initialSource?.kind);if(!props.initial&&props.initialSource)draft.value.configuration.source=alarmRuleSourceIdentity(props.initialSource);initialized=!!props.initial;sourceChanged()}catch(cause){error.value=errorMessage(cause)}}
function sourceChanged(){if(draft.value)emit('sourceChanged',{kind:draft.value.configuration.source.kind,ids:[...draft.value.configuration.source.ids]})}
watch([()=>props.initial,()=>props.loading,()=>props.error],read,{immediate:true})
watch(()=>props.initialSource,()=>{if(!props.ruleId)read()})
watch([()=>props.projectId,()=>props.ruleId],()=>{clear();emit('close')},{flush:'sync'})
watch(()=>props.canManage,value=>{if(!value){clear();emit('close')}},{flush:'sync'})
watch([properties,()=>props.initialPropertyKey],([value,initialKey])=>{if(initialized||!value.length||!draft.value)return;const term=blankAlarmRuleTerm(),property=value.find(item=>item.key===initialKey);if(property)changeAlarmRuleTermProperty(term,property,inactivity.value);draft.value.terms=[term];initialized=true},{immediate:true})
const dispose=onIdentityChange(()=>{clear();emit('close')});onScopeDispose(()=>{clear();dispose()})
function kindChanged(){if(draft.value){draft.value.configuration.source.ids=[];sourceChanged()}}
function triggerChanged(){if(!draft.value)return;for(const term of draft.value.terms)changeAlarmRuleTermProperty(term,properties.value.find(p=>p.key===term.key),inactivity.value)}
function propertyChanged(term:AlarmRuleTermDraft){changeAlarmRuleTermProperty(term,properties.value.find(p=>p.key===term.key),inactivity.value)}
function isRange(term:AlarmRuleTermDraft){return term.operator==='BETWEEN'||term.operator==='NOT_BETWEEN'}
function type(term:AlarmRuleTermDraft){return properties.value.find(p=>p.key===term.key)?.dataType}
function options(term:AlarmRuleTermDraft){return alarmRuleOperators(type(term),inactivity.value)}
function channel(value:AlarmRuleConfiguration['notifications']['customerChannels'][number],enabled:boolean){if(!draft.value)return;const list=draft.value.configuration.notifications.customerChannels;draft.value.configuration.notifications.customerChannels=enabled?[...new Set([...list,value])]:list.filter(v=>v!==value)}
function context():AlarmRuleEditContext{return {projectId:props.projectId,ruleId:props.ruleId,version:props.initial?.version,identityEpoch:identityEpoch()}}
async function submit(removing=false){
 if(blocked.value||!props.projectId||!draft.value||props.loading||props.error||removing&&!props.remove||!removing&&!validChoices.value)return
 if(props.initial?.version===2147483647){review.value=true;error.value='当前规则无法继续编辑，请重新读取。';return}
 const c=context();let value:CreateConfiguredAlarmRule|undefined
 if(!removing){try{value=alarmRuleDraftRequest(draft.value,properties.value)}catch(cause){error.value=errorMessage(cause);return}}
 const request=++serial;busy.value=true;error.value=''
 try{if(removing)await props.remove!(c);else await props.save(c,value!);assertIdentity(c.identityEpoch);if(request!==serial||c.projectId!==props.projectId||c.ruleId!==props.ruleId)return;if(removing)emit('removed');else emit('saved');emit('close')}
 catch(cause){
  if(cause instanceof IdentityChanged||request!==serial)return
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){clear();emit('close');return}
  const validation=cause instanceof ApiError&&!cause.outcomeUnknown&&[400,422].includes(cause.status)
  review.value=!validation;error.value=validation?errorMessage(cause):cause instanceof ApiError&&cause.status===409?'规则已变更，请重新读取后核对。':props.ruleId?'操作结果待确认，请重新读取核对。':'创建结果待确认，请关闭后刷新规则列表核对。'
 }finally{if(request===serial)busy.value=false}
}
</script>
<template>
 <el-dialog :model-value="true" class="alarm-rule-dialog" :class="{'has-rule-feedback':!!choicesError||!!error||confirmRemove}" title="设置告警规则" width="min(700px,94vw)" top="15vh" :lock-scroll="false" :show-close="!busy" :close-on-click-modal="false" :close-on-press-escape="!busy" @close="!busy&&emit('close')">
  <AsyncState :loading="loading" :error="props.error" @retry="emit('retry',true)">
   <el-form v-if="draft" label-position="top" class="rule-editor" :disabled="blocked">
    <div class="rule-tabs" role="tablist" aria-label="告警规则设置"><button v-for="(item,index) in tabs" :id="`tab-${item.key}`" :key="item.key" type="button" role="tab" :aria-selected="tab===item.key" :aria-controls="`pane-${item.key}`" :tabindex="tab===item.key?0:-1" :class="{active:tab===item.key}" @click="tab=item.key" @keydown="tabKey($event,index)">{{item.label}}</button></div>
    <div class="rule-panels">
     <section v-show="tab==='basic'" id="pane-basic" role="tabpanel" aria-labelledby="tab-basic">
      <div class="tl-learning-resource rule-guide"><el-icon aria-hidden="true"><InfoFilled/></el-icon><a href="https://www.thingscloud.xyz/docs/guide/alarm/alarm-rule.html" target="_blank" rel="noopener noreferrer">如何使用告警规则？ <ReferenceIcon glyph="󰏌"/></a></div>
      <el-form-item label="规则名称" required><el-input v-model="draft.name" maxlength="128" aria-label="规则名称" /></el-form-item>
      <el-form-item label="设备源类型" required><el-radio-group v-model="draft.configuration.source.kind" :disabled="blocked||!!ruleId" aria-label="设备源类型" @change="kindChanged"><el-radio value="DEVICE">设备</el-radio><el-radio value="DEVICE_TYPE">设备类型</el-radio></el-radio-group><p v-if="ruleId" class="help">设备源类型不支持修改</p></el-form-item>
      <el-form-item label="设备源" required>
       <el-select v-if="draft.configuration.source.kind==='DEVICE'" v-model="draft.configuration.source.ids" multiple filterable remote :remote-method="(query:string)=>emit('searchSources',query)" :loading="choicesLoading" placeholder="请选择设备源" aria-label="设备源" @change="sourceChanged"><el-option v-for="item in sourceChoices" :key="item.id" :value="item.id" :label="item.label"><span class="source-option source-device"><ReferenceIcon glyph="󰆧"/>{{item.label}}</span></el-option><el-option v-for="id in draft.configuration.source.ids.filter(id=>!sourceChoices.some(item=>item.id===id))" :key="id" :value="id" label="来源资料待核对" /></el-select>
       <el-select v-else v-model="selectedType" filterable remote :remote-method="(query:string)=>emit('searchSources',query)" :loading="choicesLoading" placeholder="请选择设备源" aria-label="设备源"><el-option v-for="item in sourceChoices" :key="item.id" :value="item.id" :label="item.label"><span class="source-option"><ReferenceIcon glyph="󰆧"/>{{item.label}}</span></el-option><el-option v-if="selectedType&&!sourceChoices.some(item=>item.id===selectedType)" :value="selectedType" label="来源资料待核对" /></el-select>
       <AlarmRuleChoicePager name="设备源" :page="choicePages?.sources" :disabled="blocked||choicesLoading" @page="emit('pageChoices','sources',$event)" />
      </el-form-item>
      <el-form-item label="触发类型"><el-radio-group v-model="draft.configuration.triggerKind" aria-label="触发类型" @change="triggerChanged"><el-radio value="ATTRIBUTES">设备属性变化 <AlarmFieldHelp label="设备属性变化" content="设备属性满足下方条件时触发告警。"/></el-radio><el-radio value="INACTIVITY">设备不活跃 <AlarmFieldHelp label="设备不活跃" content="指定属性超过设定时间未更新时触发告警。"/></el-radio></el-radio-group></el-form-item>
      <el-form-item label="告警触发条件" required>
       <div class="conditions"><div v-for="(term,index) in draft.terms" :key="index" class="condition">
        <el-select v-model="term.join" :disabled="blocked||index===0" :aria-label="`条件${index+1}连接`" class="join"><el-option label="AND" value="AND" /><el-option label="OR" value="OR" /></el-select>
        <el-select v-model="term.key" filterable placeholder="选择属性" :aria-label="`条件${index+1}属性`" class="attribute" @change="propertyChanged(term)"><el-option v-for="p in properties" :key="p.key" :value="p.key" :label="p.label"><DefinitionTypeLabel :type="p.dataType" :label="p.label"/></el-option><el-option v-if="term.key&&!properties.some(p=>p.key===term.key)" :value="term.key" label="属性资料待核对" /></el-select>
        <template v-if="term.key">
        <el-select v-model="term.operator" :aria-label="`条件${index+1}操作符`" class="operator"><el-option v-for="op in options(term)" :key="op.value" :value="op.value" :label="op.label" /></el-select>
        <el-select v-if="inactivity" v-model="term.value" :aria-label="`条件${index+1}失活时间`" class="operand"><el-option v-for="item in alarmRuleInactiveDurations" :key="item.value" :value="item.value" :label="item.label" /></el-select>
        <el-select v-else-if="type(term)==='SWITCH'" v-model="term.value" :aria-label="`条件${index+1}开关值`" class="operand"><el-option label="ON" value="true" /><el-option label="OFF" value="false" /></el-select>
        <template v-else><el-input v-model="term.value" :placeholder="isRange(term)?'最小值':type(term)==='NUMBER'?'数值或{属性标识符}':'字符串'" :aria-label="`条件${index+1}值`" :class="isRange(term)?'range':'operand'" /><el-input v-if="isRange(term)" v-model="term.upper" placeholder="最大值" :aria-label="`条件${index+1}上界`" class="range" /></template>
        </template>
        <el-button size="small" type="danger" :icon="Delete" :aria-label="`删除条件${index+1}`" @click="draft.terms.splice(index,1)"/>
       </div><el-button size="small" :icon="Plus" @click="draft.terms.push(blankAlarmRuleTerm())">添加条件</el-button></div>
      </el-form-item>
      <div v-if="!inactivity" class="rule-field-grid"><el-form-item label="重复次数"><template #label>重复次数 <AlarmFieldHelp label="重复次数" content="设置条件需要额外满足的次数。"/></template><el-select v-model="draft.configuration.repeatCount" aria-label="重复次数"><el-option label="无" :value="0" /><el-option v-for="n in 10" :key="n" :label="`加${n}次`" :value="n" /></el-select></el-form-item><el-form-item label="持续时间"><template #label>持续时间 <AlarmFieldHelp label="持续时间" content="设置触发前条件必须持续满足的时间。"/></template><el-select v-model="draft.configuration.durationSeconds" aria-label="持续时间"><el-option v-for="item in alarmRuleDurations" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></div>
      <el-form-item label="告警级别"><el-radio-group v-model="draft.configuration.level" aria-label="告警级别"><el-radio value="NORMAL">普通告警</el-radio><el-radio value="IMPORTANT">重要告警</el-radio><el-radio value="URGENT">紧急告警</el-radio></el-radio-group></el-form-item>
      <el-form-item label="告警备注"><template #label>告警备注 <AlarmFieldHelp label="告警备注" content="备注文字将出现在部分告警通知中。"/></template><el-input v-model="draft.configuration.remark" type="textarea" :rows="3" maxlength="2048" aria-label="告警备注" /><p class="help">选填，备注文字将出现在部分告警通知中。</p></el-form-item>
     </section>
     <section v-show="tab==='notify'" id="pane-notify" role="tabpanel" aria-labelledby="tab-notify">
      <div class="tl-learning-resource rule-guide"><el-icon aria-hidden="true"><InfoFilled/></el-icon><a href="https://www.thingscloud.xyz/docs/guide/alarm/notification.html" target="_blank" rel="noopener noreferrer">如何使用通知组发送告警通知？ <ReferenceIcon glyph="󰏌"/></a></div>
      <el-form-item label="通知组"><template #label>通知组 <AlarmFieldHelp label="通知组" content="规则触发时，按所选通知组的配置发送告警通知。"/></template><el-select v-model="draft.configuration.notifications.groupIds" multiple filterable placeholder="请选择" aria-label="通知组"><el-option v-for="item in scopedChoices?.groups??[]" :key="item.id" :value="item.id" :label="item.label" /><el-option v-for="id in draft.configuration.notifications.groupIds.filter(id=>!scopedChoices?.groups.some(item=>item.id===id))" :key="id" :value="id" :label="groupLabels[id]??'通知组资料待核对'" /></el-select><AlarmRuleChoicePager name="通知组" :page="choicePages?.groups" :disabled="blocked||choicesLoading" @page="emit('pageChoices','groups',$event)" /></el-form-item>
      <div class="tl-learning-resource rule-guide"><el-icon aria-hidden="true"><InfoFilled/></el-icon><a href="https://www.thingscloud.xyz/docs/guide/alarm/customer-alarm-notify.html" target="_blank" rel="noopener noreferrer">如何为用户发送告警通知？ <ReferenceIcon glyph="󰏌"/></a></div>
      <p class="notify-title">通知用户 <AlarmFieldHelp label="通知用户" content="向设备所属用户发送告警通知。"/></p>
      <el-form-item label="微信服务号通知" class="rule-inline-switch"><template #label>微信服务号通知 <AlarmFieldHelp label="微信服务号通知" content="通过微信服务号向设备所属用户发送通知。"/></template><el-switch size="default" :model-value="draft.configuration.notifications.customerChannels.includes('WECHAT')" aria-label="微信服务号通知" @change="channel('WECHAT',!!$event)" /></el-form-item>
      <template v-if="draft.configuration.notifications.customerChannels.includes('WECHAT')"><el-form-item label="服务号消息支持查看详情"><el-radio-group v-model="draft.configuration.notifications.wechatClickAction" aria-label="服务号消息支持查看详情"><el-radio value="NONE">无</el-radio><el-radio value="PROJECT_APP">打开用户应用</el-radio></el-radio-group></el-form-item><el-form-item v-if="draft.configuration.notifications.wechatClickAction==='PROJECT_APP'" label="服务号消息关联用户应用"><el-select v-model="draft.configuration.notifications.wechatAppId" aria-label="服务号消息关联用户应用"><el-option v-for="item in scopedChoices?.applications??[]" :key="item.id" :value="item.id" :label="item.label" /><el-option v-if="draft.configuration.notifications.wechatAppId&&!scopedChoices?.applications.some(item=>item.id===draft?.configuration.notifications.wechatAppId)" :value="draft.configuration.notifications.wechatAppId" :label="appLabels[draft.configuration.notifications.wechatAppId]??'应用资料待核对'" /></el-select><AlarmRuleChoicePager name="用户应用" :page="choicePages?.applications" :disabled="blocked||choicesLoading" @page="emit('pageChoices','applications',$event)" /></el-form-item></template>
      <el-form-item label="短信通知" class="rule-inline-switch"><template #label>短信通知 <AlarmFieldHelp label="短信通知" content="通过短信向设备所属用户发送通知。"/></template><el-switch size="default" :model-value="draft.configuration.notifications.customerChannels.includes('SMS')" aria-label="短信通知" @change="channel('SMS',!!$event)" /></el-form-item><el-form-item v-if="draft.configuration.notifications.customerChannels.includes('SMS')" label="消耗用户短信配额"><el-switch size="default" v-model="draft.configuration.notifications.customerSmsQuotaRequired" aria-label="消耗用户短信配额" /></el-form-item>
      <el-form-item label="电话通知" class="rule-inline-switch"><template #label>电话通知 <AlarmFieldHelp label="电话通知" content="通过电话向设备所属用户发送通知。"/></template><el-switch size="default" :model-value="draft.configuration.notifications.customerChannels.includes('VOICE')" aria-label="电话通知" @change="channel('VOICE',!!$event)" /></el-form-item><el-form-item v-if="draft.configuration.notifications.customerChannels.includes('VOICE')" label="消耗用户电话配额"><el-switch size="default" v-model="draft.configuration.notifications.customerVoiceQuotaRequired" aria-label="消耗用户电话配额" /></el-form-item>
      <el-form-item label="App 通知" class="rule-inline-switch"><template #label>App 通知 <AlarmFieldHelp label="App 通知" content="向设备所属用户发送 App 通知。"/></template><el-switch size="default" :model-value="draft.configuration.notifications.customerChannels.includes('APP')" aria-label="App 通知" @change="channel('APP',!!$event)" /></el-form-item>
      <div class="rule-field-grid notify-limits"><el-form-item label="每日通知次数上限"><template #label>每日通知次数上限 <AlarmFieldHelp label="每日通知次数上限" content="填写 0 表示不限制此规则的每日通知次数。"/></template><el-input-number controls-position="right" v-model="draft.configuration.notifications.dailyLimit" :min="0" :max="draft.configuration.notifications.dailyLimit>10000?2147483647:10000" :precision="0" aria-label="每日通知次数上限" /></el-form-item><el-form-item label="单个设备每日通知次数上限"><template #label>单个设备每日通知次数上限 <AlarmFieldHelp label="单个设备每日通知次数上限" content="填写 0 表示不限制单个设备的每日通知次数。"/></template><el-input-number controls-position="right" v-model="draft.configuration.notifications.perDeviceDailyLimit" :min="0" :max="draft.configuration.notifications.perDeviceDailyLimit>10000?2147483647:10000" :precision="0" aria-label="单个设备每日通知次数上限" /></el-form-item></div>
     </section>
     <section v-show="tab==='valid_time'" id="pane-valid_time" role="tabpanel" aria-labelledby="tab-valid_time"><p class="notify-title">有效时段 <AlarmFieldHelp label="有效时段" content="设置每天允许此规则触发的时段。"/></p><el-form-item label="启用有效时段" class="rule-inline-switch"><template #label>启用有效时段 <AlarmFieldHelp label="启用有效时段" content="开启后只在所选时段内触发告警。"/></template><el-switch size="default" v-model="draft.configuration.schedule.enabled" aria-label="启用有效时段" /></el-form-item><template v-if="draft.configuration.schedule.enabled"><el-form-item label="选择时间段"><AlarmRuleTimeSlots v-model="draft.configuration.schedule.halfHourSlots" :disabled="blocked" /><p class="time-ranges">{{ranges||'未选择时段'}}</p></el-form-item><el-form-item label="无效时段允许告警恢复" class="rule-inline-switch"><template #label>无效时段允许告警恢复 <AlarmFieldHelp label="无效时段允许告警恢复" content="开启后，时段之外也允许已有告警恢复。"/></template><el-switch size="default" v-model="draft.configuration.schedule.recoveryOutsideAllowed" aria-label="无效时段允许告警恢复" /></el-form-item></template></section>
     <section v-show="tab==='alarm_clear'" id="pane-alarm_clear" role="tabpanel" aria-labelledby="tab-alarm_clear"><el-form-item label="允许解除告警"><template #label>允许解除告警 <AlarmFieldHelp label="允许解除告警" content="允许有权限的操作者手动解除告警。"/></template><el-switch size="default" v-model="draft.configuration.recovery.manualClearAllowed" aria-label="允许解除告警" /></el-form-item><el-form-item v-if="draft.configuration.recovery.manualClearAllowed" label="允许用户解除告警"><el-switch size="default" v-model="draft.configuration.recovery.customerClearAllowed" aria-label="允许用户解除告警" /></el-form-item></section>
     <section v-show="tab==='settings'" id="pane-settings" role="tabpanel" aria-labelledby="tab-settings"><el-form-item label="规则可用"><template #label>规则可用 <AlarmFieldHelp label="规则可用" content="关闭后停止使用此规则。"/></template><el-switch size="default" v-model="draft.enabled" aria-label="规则可用" /></el-form-item><el-form-item label="允许用户禁用规则"><template #label>允许用户禁用规则 <AlarmFieldHelp label="允许用户禁用规则" content="允许用户在用户应用中对设备禁用此规则。"/></template><el-switch size="default" v-model="draft.configuration.recovery.customerDisableAllowed" aria-label="允许用户禁用规则" /></el-form-item></section>
    </div>
   </el-form>
  </AsyncState>
  <template #footer>
   <el-alert v-if="choicesError" class="rule-feedback" title="设备源资料读取失败，请重新读取。" type="error" :closable="false" /><el-alert v-if="error" class="rule-feedback" :title="error" type="error" :closable="false" />
   <div v-if="confirmRemove" class="remove-confirm"><span>确认移除该告警规则吗？</span><el-button :disabled="busy" @click="confirmRemove=false">取消移除</el-button><el-button type="danger" :loading="busy" :disabled="blocked" @click="submit(true)">确认移除</el-button></div>
   <div class="rule-footer"><el-button v-if="ruleId&&remove&&draft" type="danger" plain :disabled="blocked||loading||!!props.error" @click="confirmRemove=true">移除规则</el-button><span class="footer-space" /><el-button v-if="review&&ruleId||choicesError" :disabled="busy" @click="emit('retry',review)">重新读取</el-button><el-button :disabled="busy" @click="emit('close')">取消</el-button><el-button type="primary" :loading="busy" :disabled="blocked||loading||!!props.error||!draft||!validChoices" @click="submit(false)">提交</el-button></div>
  </template>
 </el-dialog>
</template>
<style scoped>
:global(.alarm-rule-dialog .el-dialog__body) {
 max-height: calc(85dvh - 130px);
 padding-top: 28px;
 padding-bottom: 40px;
 overflow-y: auto;
 overscroll-behavior: contain;
}
:global(.alarm-rule-dialog.has-rule-feedback .el-dialog__body) { max-height: calc(85dvh - 200px); }
.rule-tabs { display: flex; gap: 40px; max-width: 100%; overflow-x: auto; white-space: nowrap; border-bottom: 1px solid var(--tl-border); margin-bottom: 30px; scrollbar-width: thin; }
.rule-tabs > button { flex: none; min-height: 42px; padding: 0; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--tl-title); font: inherit; font-weight: 500; cursor: pointer; }
.rule-tabs > button.active { color: var(--tl-primary); border-bottom-color: var(--tl-primary); }
.rule-tabs > button:focus-visible { outline: 2px solid var(--tl-primary); outline-offset: -3px; }
.rule-panels, .rule-editor { min-width: 0; }
.rule-editor :deep(.el-select), .rule-editor :deep(.el-input-number) { width: 100%; }
.rule-editor :deep(.el-select__wrapper) { min-height: var(--el-component-size-small); }
.rule-editor :deep(.el-form-item) { margin-bottom: 26px; }
.rule-editor :deep(.el-form-item__label) { margin-bottom: 6px; line-height: 22px; color: var(--tl-text); font-size: 14px; font-weight: 600; }
.rule-editor :deep(.el-form-item__content) { font-size: 14px; }
.rule-editor :deep(.el-radio-group) { flex-wrap: wrap; }
.rule-editor :deep(.el-radio) { height: 24px; }
.rule-editor :deep(.el-radio__label) { font-size: 14px; }
.rule-editor :deep(.el-input) { --el-input-height: var(--el-component-size-small); }
.rule-editor :deep(.el-input__wrapper) { padding-inline: 15px; }
.rule-editor :deep(.el-input-number.is-controls-right .el-input__wrapper) { padding-right: 42px; }
.rule-editor :deep(.el-input-number .el-input__inner) { text-align: left; }
.rule-guide { margin: 0 0 24px; }
.source-option { display: inline-flex; align-items: center; gap: 12px; max-width: 100%; }
.source-option .reference-icon { color: #999; }
.source-device { font-weight: 700; }
.source-device .reference-icon { font-size: 24px; }
.help { width: 100%; margin: 5px 0 0; color: var(--tl-muted); font-size: 12px; line-height: 1.6; }
.rule-field-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
.conditions { width: 100%; min-width: 0; padding-top: 8px; }
.condition { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; flex-wrap: wrap; }
.condition .join { width: 75px; }
.condition .attribute { width: 150px; }
.condition .operator { width: 118px; }
.condition .operand { flex: 1 1 130px; }
.condition .range { flex: 1 1 85px; }
.condition > .el-button { min-width: 44px; margin: 0; }
.notify-title { margin: 4px 0 10px; color: var(--tl-text); font-weight: 600; }
.rule-editor .rule-inline-switch { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0; min-height: 32px; gap: 10px; }
.rule-inline-switch :deep(.el-form-item__label) { margin: 0; font-weight: 400; }
.rule-inline-switch :deep(.el-form-item__content) { flex: none; }
.notify-limits { margin-top: 28px; }
.time-ranges { width: 100%; margin: 3px 0; line-height: 1.5; }
.rule-feedback { margin-bottom: 12px; text-align: left; }
.rule-footer { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.rule-footer > .el-button { margin: 0; }
.footer-space { flex: 1; }
.remove-confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
@media (max-width: 600px) {
 .rule-tabs { gap: 24px; }
 .condition .attribute { flex: 1 1 120px; }
 .condition .operator { width: 110px; }
 .condition .operand { flex: 1 1 120px; }
}
@media (max-width: 450px) { .rule-field-grid { grid-template-columns: minmax(0,1fr); gap: 0; } }
</style>
