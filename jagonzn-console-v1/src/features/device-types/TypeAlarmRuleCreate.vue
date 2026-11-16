<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import ManagedAlarmRuleChoicesEditor from '../alarms/ManagedAlarmRuleChoicesEditor.vue'
import type {AlarmRuleConfiguration} from '../alarms/alarm-rule-management-api'
import {definitionUuid} from '../rules/device-task-definition-port'
import {typeProfileTransport} from './profile-api'
const props=withDefaults(defineProps<{typeId:string;ruleId?:string;disabled?:boolean}>(),{disabled:false})
const emit=defineEmits<{locked:[value:boolean];close:[];saved:[id:string,returnToType:boolean];removed:[id:string]}>()
const allowed=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&currentProject.value?.id===projectId.value&&currentProject.value.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value.myRole||'')&&can('device:read')&&can('alarm:read')&&can('alarm:manage')&&definitionUuid(props.typeId))
const opening=ref(false),opened=ref(false),busy=ref(false),review=ref(false),ended=ref(false),error=ref(''),typeName=ref('')
const initialSource=computed<AlarmRuleConfiguration['source']>(()=>({kind:'DEVICE_TYPE',ids:[props.typeId]})),locked=computed(()=>opening.value||opened.value)
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
let generation=0,alive=true,controller:AbortController|undefined
function clear(){generation++;controller?.abort();opening.value=false;opened.value=false;busy.value=false;review.value=false;ended.value=false;error.value='';typeName.value=''}
function current(g:number,epoch:number,project:string,type:string){return alive&&g===generation&&epoch===identityEpoch()&&project===projectId.value&&type===props.typeId&&allowed.value}
async function open(){
 if(!allowed.value||props.disabled||locked.value||ended.value)return
 if(props.ruleId){if(definitionUuid(props.ruleId))opened.value=true;else error.value='告警规则身份无效。';return}
 const g=++generation,epoch=identityEpoch(),project=projectId.value,type=props.typeId;controller=new AbortController();opening.value=true;error.value=''
 try{const value=await typeProfileTransport.read(project,type,controller.signal);if(!current(g,epoch,project,type))return;if(value.type.id!==type||value.type.projectId!==project)throw new Error('类型资料与当前项目不符');if(value.type.status!=='PUBLISHED')throw new Error('当前类型尚未发布物模型，请先发布后再创建类型告警规则');typeName.value=value.type.name;opened.value=true}
 catch(cause){if(current(g,epoch,project,type))error.value=errorMessage(cause)}
 finally{if(current(g,epoch,project,type))opening.value=false}
}
function close(){if(busy.value)return;if(review.value){ended.value=true;error.value='本次告警规则操作结果仍待核对，请刷新列表核对。'}opened.value=false;review.value=false;controller?.abort();opening.value=false;emit('close')}
function state(value:{busy:boolean;review:boolean}){busy.value=value.busy;review.value=value.review}
/** 来源来自保存后独立读取。已有规则编辑后刷新原列表，新建时按实际保存的来源返回。 */
function verified(id:string,source:AlarmRuleConfiguration['source']){
 if(!allowed.value||!opened.value||!definitionUuid(id)||props.ruleId&&props.ruleId!==id)return
 const returnToType=!!props.ruleId||source.kind==='DEVICE_TYPE'&&source.ids.includes(props.typeId)
 opened.value=false;busy.value=false;review.value=false;ended.value=true;emit('saved',id,returnToType)
}
function removed(id:string){
 if(!allowed.value||!opened.value||props.ruleId!==id)return
 opened.value=false;busy.value=false;review.value=false;ended.value=true;emit('removed',id)
}
watch([()=>props.typeId,()=>props.ruleId,()=>projectId.value,()=>session.user?.accountId,allowed,()=>props.disabled],()=>{clear();if(allowed.value&&!props.disabled)void open()},{immediate:true,flush:'sync'})
const dispose=onIdentityChange(clear);onScopeDispose(()=>{alive=false;clear();dispose()})
</script>
<template><section class="type-alarm-create">
 <p v-if="opening" class="tl-muted">正在核对来源类型资料…</p>
 <p v-if="!allowed" role="alert">当前账号没有类型告警{{ruleId?'编辑':'创建'}}权限，或项目不可写。</p>
 <div v-if="!opened&&!opening"><el-button v-if="error&&allowed&&!ended" :disabled="disabled" @click="open">重新读取来源类型</el-button><el-button @click="close">取消</el-button></div>
 <p v-if="error" role="alert">{{error}}</p>
 <p v-if="opened&&!ruleId" class="type-alarm-origin">来源设备类型：{{typeName}}。实际保存的设备源可在表单中调整。</p>
 <ManagedAlarmRuleChoicesEditor v-if="opened&&allowed" :key="projectId+':'+typeId" :rule-id="ruleId" :device-type-id="ruleId?typeId:undefined" :initial-source="initialSource" @verified="verified" @removed="removed" @state="state" @close="close"/>
</section></template>
<style scoped>.type-alarm-create [role="alert"]{font-size:13px;color:var(--tl-danger);line-height:22px}.type-alarm-origin{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}</style>
