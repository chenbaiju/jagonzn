<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {ApiError,errorMessage,identityEpoch} from '../../core/http'
import {can,projectId} from '../../core/session'
import {alarmApi} from './api'
import {channels,channelName,type Channel,type Group,type Template} from './model'
import type {Schema} from '../../core/contracts'

const props=defineProps<{modelValue:boolean;ruleId:string;ruleName?:string}>()
const emit=defineEmits<{ 'update:modelValue':[value:boolean] }>()
const manageable=computed(()=>can('alarm:manage'))
const rows=ref<Schema<'AlarmNotificationBindingResponse'>[]>([]),groups=ref<Group[]>([]),templates=ref<Template[]>([])
const loading=ref(false),error=ref(''),busy=ref(false),formError=ref(''),unknown=ref(false)
const formOpen=ref(false),editing=ref<Schema<'AlarmNotificationBindingResponse'>>()
const form=ref({channel:'EMAIL' as Channel,groupId:'',templateId:'',enabled:true})
const compatibleTemplates=computed(()=>templates.value.filter(item=>item.channel===form.value.channel))
let epochToken=0
function close(){emit('update:modelValue',false)}
function openCreate(){
 if(!manageable.value)return
 editing.value=undefined;form.value={channel:'EMAIL',groupId:groups.value.find(item=>item.enabled)?.id||'',templateId:compatibleTemplates.value.find(item=>item.enabled)?.id||'',enabled:true}
 formError.value='';unknown.value=false;formOpen.value=true
}
function openEdit(row:Schema<'AlarmNotificationBindingResponse'>){
 if(!manageable.value)return
 editing.value=row;form.value={channel:(row.channel as Channel|undefined)||'EMAIL',groupId:row.groupId||'',templateId:row.templateId||'',enabled:row.enabled??true}
 formError.value='';unknown.value=false;formOpen.value=true
}
function changeChannel(){
 if(!compatibleTemplates.value.some(item=>item.id===form.value.templateId))form.value.templateId=compatibleTemplates.value.find(item=>item.enabled)?.id||''
}
async function load(){
 const project=projectId.value,ruleId=props.ruleId
 if(!project||!ruleId||!props.modelValue)return
 const token=++epochToken,epoch=identityEpoch();loading.value=true;error.value=''
 try{
  const [bindings,groupPage,templatePage]=await Promise.all([
   alarmApi.bindings(project,ruleId),
   alarmApi.groups(project,undefined,undefined,50),
   alarmApi.templates(project,undefined,undefined,50)
  ])
  if(epoch!==identityEpoch()||project!==projectId.value||ruleId!==props.ruleId||token!==epochToken)return
  if(!Array.isArray(bindings)||bindings.length>200)throw new Error('规则通知路由响应不完整')
  rows.value=bindings
  groups.value=(groupPage.items||[]) as Group[]
  templates.value=(templatePage.items||[]) as Template[]
 }catch(cause){if(epoch===identityEpoch()&&token===epochToken)error.value=errorMessage(cause)}
 finally{if(token===epochToken)loading.value=false}
}
watch(()=>[props.modelValue,props.ruleId,projectId.value],()=>{if(props.modelValue)void load();else{rows.value=[];groups.value=[];templates.value=[];formOpen.value=false}},{immediate:true,flush:'sync'})
async function save(){
 const project=projectId.value,ruleId=props.ruleId
 if(!project||!ruleId||!manageable.value||busy.value||unknown.value)return
 if(!form.value.groupId||!form.value.templateId){formError.value='请选择通知组和同渠道模板';return}
 const template=templates.value.find(item=>item.id===form.value.templateId)
 if(!template||template.channel!==form.value.channel){formError.value='所选模板渠道与路由渠道不一致';return}
 const epoch=identityEpoch();busy.value=true;formError.value=''
 try{
  const body:Schema<'SaveAlarmNotificationBindingRequest'>={groupId:form.value.groupId,templateId:form.value.templateId,channel:form.value.channel,enabled:form.value.enabled}
  const saved=await alarmApi.saveBinding(project,ruleId,body,editing.value)
  if(epoch!==identityEpoch()||project!==projectId.value||ruleId!==props.ruleId)return
  if(!saved?.id||saved.channel!==body.channel||saved.groupId!==body.groupId||saved.templateId!==body.templateId||saved.enabled!==body.enabled)throw new Error('通知路由已保存，但回读事实不一致')
  ElMessage.success(editing.value?'通知路由已更新':'通知路由已创建');formOpen.value=false;await load()
 }catch(cause){
  if(epoch!==identityEpoch()||project!==projectId.value||ruleId!==props.ruleId)return
  if(cause instanceof ApiError&&cause.outcomeUnknown){unknown.value=true;formError.value=`${errorMessage(cause)}；结果未知，已重新读取核对，不会自动重试。`;await load()}
  else{formError.value=errorMessage(cause);if(cause instanceof ApiError&&cause.code===60030)await load()}
 }finally{if(epoch===identityEpoch())busy.value=false}
}
async function remove(row:Schema<'AlarmNotificationBindingResponse'>){
 const project=projectId.value,ruleId=props.ruleId
 if(!project||!ruleId||!manageable.value||busy.value)return
 try{await ElMessageBox.confirm('确认删除该通知路由？','删除通知路由',{type:'warning',confirmButtonText:'删除',cancelButtonText:'取消'})}catch{return}
 const epoch=identityEpoch();busy.value=true
 try{await alarmApi.deleteBinding(project,row);if(epoch!==identityEpoch()||project!==projectId.value||ruleId!==props.ruleId)return;ElMessage.success('通知路由已删除');await load()}
 catch(cause){if(epoch!==identityEpoch()||project!==projectId.value||ruleId!==props.ruleId)return;if(cause instanceof ApiError&&cause.outcomeUnknown){ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取核对`);await load()}else{ElMessage.error(errorMessage(cause));if(cause instanceof ApiError&&cause.code===60030)await load()}}
 finally{if(epoch===identityEpoch())busy.value=false}
}
function groupName(id?:string){return groups.value.find(item=>item.id===id)?.name||id||'—'}
function templateName(id?:string){return templates.value.find(item=>item.id===id)?.name||id||'—'}
function channelFor(row:Schema<'AlarmNotificationBindingResponse'>){return row.channel?channelName(row.channel):'—'}
</script>
<template>
 <el-dialog :model-value="modelValue" title="规则通知路由" width="min(760px,96vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" @update:model-value="emit('update:modelValue',$event)">
  <p class="rule-binding-target">规则：{{ ruleName||ruleId }}<span>仅显示当前项目、同渠道的通知组与模板；保存和删除按各自 version 防并发覆盖。</span></p>
  <div class="rule-binding-toolbar"><el-button type="primary" size="small" :disabled="!manageable||loading" @click="openCreate">添加通知路由</el-button><el-button size="small" :loading="loading" @click="load">刷新</el-button></div>
  <el-alert v-if="error" :title="error" type="error" :closable="false" />
  <el-table v-else v-loading="loading" :data="rows" size="small" empty-text="该规则还没有通知路由">
   <el-table-column label="渠道" width="110"><template #default="{row}">{{ channelFor(row) }}</template></el-table-column>
   <el-table-column label="通知组" min-width="160"><template #default="{row}">{{ groupName(row.groupId) }}</template></el-table-column>
   <el-table-column label="模板" min-width="180"><template #default="{row}">{{ templateName(row.templateId) }}</template></el-table-column>
   <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.enabled?'success':'info'" size="small">{{ row.enabled?'已启用':'已停用' }}</el-tag></template></el-table-column>
   <el-table-column v-if="manageable" label="操作" width="130" align="center"><template #default="{row}"><el-button link type="primary" :disabled="busy" @click="openEdit(row)">编辑</el-button><el-button link type="danger" :disabled="busy" @click="remove(row)">删除</el-button></template></el-table-column>
  </el-table>
  <el-dialog v-model="formOpen" :title="editing?'编辑通知路由':'添加通知路由'" width="min(520px,94vw)" append-to-body :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy">
   <el-form label-position="top" :disabled="busy">
    <el-form-item label="渠道" required><el-select v-model="form.channel" style="width:100%" @change="changeChannel"><el-option v-for="item in channels" :key="item.value" :value="item.value" :label="item.label" /></el-select></el-form-item>
    <el-form-item label="通知组" required><el-select v-model="form.groupId" filterable style="width:100%" placeholder="选择通知组"><el-option v-for="item in groups" :key="item.id" :value="item.id" :label="`${item.name||item.id}${item.enabled===false?'（已停用）':''}`" /></el-select></el-form-item>
    <el-form-item label="同渠道模板" required><el-select v-model="form.templateId" filterable style="width:100%" placeholder="选择同渠道模板"><el-option v-for="item in compatibleTemplates" :key="item.id" :value="item.id" :label="`${item.name||item.id}${item.enabled===false?'（已停用）':''}`" /></el-select><p class="rule-binding-help">这里只显示渠道与路由一致的模板。</p></el-form-item>
    <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
   </el-form>
   <el-alert v-if="formError" :title="formError" :type="unknown?'warning':'error'" :closable="false" />
   <template #footer><el-button :disabled="busy" @click="formOpen=false">取消</el-button><el-button type="primary" :loading="busy" :disabled="busy||unknown||!form.groupId||!form.templateId" @click="save">保存</el-button></template>
  </el-dialog>
  <template #footer><el-button :disabled="busy" @click="close">关闭</el-button></template>
 </el-dialog>
</template>
<style scoped>
.rule-binding-target{margin:0 0 14px;color:#606266;font-size:14px;line-height:22px;overflow-wrap:anywhere}.rule-binding-target span{display:block;color:#909399;font-size:12px}.rule-binding-toolbar{display:flex;gap:8px;margin-bottom:10px}.rule-binding-help{margin:6px 0 0;color:#909399;font-size:12px}
</style>
