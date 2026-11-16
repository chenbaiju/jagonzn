<script setup lang="ts">
import {computed,reactive,ref,watch} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {ApiError,errorMessage,identityEpoch} from '../../core/http'
import {can,projectId} from '../../core/session'
import {formatTime} from '../../core/time'
import PageHeader from '../../ui/PageHeader.vue'
import AsyncState from '../../ui/AsyncState.vue'
import {alarmApi} from './api'
import {channels,channelName,templateBody,templateVariables,previewTemplate,type Template} from './model'
import type {Channel} from './model'

const readable=computed(()=>can('alarm:read'))
const manageable=computed(()=>can('alarm:manage'))
const rows=ref<Template[]>([]),nextCursor=ref<string|null>(null),hasMore=ref(false),loading=ref(false),moreBusy=ref(false),error=ref('')
const dialogOpen=ref(false),editing=ref<Template>(),busy=ref(false),formError=ref(''),unknown=ref(false)
const form=reactive({name:'',channel:'EMAIL' as Channel,subjectTemplate:'',bodyTemplate:'',enabled:true})
const availableChannels=channels
let loadEpoch=0
function resetForm(row?:Template){
 editing.value=row
 Object.assign(form,{name:row?.name||'',channel:(row?.channel as Channel|undefined)||'EMAIL',subjectTemplate:row?.subjectTemplate||'',bodyTemplate:row?.bodyTemplate||'',enabled:row?.enabled ?? true})
 formError.value='';unknown.value=false
}
function openCreate(){if(!manageable.value)return;resetForm();dialogOpen.value=true}
function openEdit(row:Template){if(!manageable.value)return;resetForm(row);dialogOpen.value=true}
function closeDialog(){if(!busy.value)dialogOpen.value=false}
async function load(reset=true){
 const project=projectId.value
 if(!project||!readable.value)return
 const token=++loadEpoch,epoch=identityEpoch(),cursor=reset?undefined:nextCursor.value||undefined
 if(reset){loading.value=true;error.value=''}else moreBusy.value=true
 try{
  const page=await alarmApi.templates(project,cursor)
  if(epoch!==identityEpoch()||project!==projectId.value||token!==loadEpoch)return
  const items=page.items||[]
  rows.value=reset?items:[...rows.value,...items.filter(item=>!rows.value.some(row=>row.id===item.id))]
  nextCursor.value=page.nextCursor||null;hasMore.value=!!page.hasMore
 }catch(cause){if(epoch===identityEpoch()&&token===loadEpoch)error.value=errorMessage(cause)}
 finally{if(token===loadEpoch){loading.value=false;moreBusy.value=false}}
}
watch([projectId,readable],()=>{rows.value=[];nextCursor.value=null;hasMore.value=false;dialogOpen.value=false;busy.value=false;void load(true)},{immediate:true,flush:'sync'})
async function save(){
 const project=projectId.value,row=editing.value
 if(!project||!manageable.value||busy.value||unknown.value)return
 const epoch=identityEpoch()
 let body:ReturnType<typeof templateBody>
 try{body=templateBody(form.name,form.channel,form.subjectTemplate,form.bodyTemplate,form.enabled,row)}catch(cause){formError.value=errorMessage(cause);return}
 busy.value=true;formError.value=''
 try{
  const saved=await alarmApi.saveTemplate(project,body,row)
  if(epoch!==identityEpoch()||project!==projectId.value)return
  if(!saved?.id||saved.channel!==body.channel||saved.enabled!==body.enabled)throw new Error('通知模板已保存，但回读事实不一致')
  ElMessage.success(row?'通知模板已更新':'通知模板已创建');dialogOpen.value=false;await load(true)
 }catch(cause){
  if(epoch!==identityEpoch()||project!==projectId.value)return
  if(cause instanceof ApiError&&cause.outcomeUnknown){unknown.value=true;formError.value=`${errorMessage(cause)}；结果未知，已重新读取核对，不会自动重试。`;await load(true)}
  else{formError.value=errorMessage(cause);if(cause instanceof ApiError&&cause.code===60030)await load(true)}
 }finally{if(epoch===identityEpoch())busy.value=false}
}
async function remove(row:Template){
 const project=projectId.value
 if(!project||!manageable.value||busy.value)return
 try{await ElMessageBox.confirm(`确认删除通知模板“${row.name||''}”？仍被规则绑定时服务端会拒绝。`,'删除通知模板',{type:'warning',confirmButtonText:'删除',cancelButtonText:'取消'})}catch{return}
 const epoch=identityEpoch();busy.value=true
 try{await alarmApi.deleteTemplate(project,row);if(epoch!==identityEpoch()||project!==projectId.value)return;ElMessage.success('通知模板已删除');await load(true)}
 catch(cause){if(epoch!==identityEpoch()||project!==projectId.value)return;if(cause instanceof ApiError&&cause.outcomeUnknown){ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取核对`);await load(true)}else{ElMessage.error(errorMessage(cause));if(cause instanceof ApiError&&cause.code===60030)await load(true)}}
 finally{if(epoch===identityEpoch())busy.value=false}
}
function variablesPreview(value:string){try{return previewTemplate(value)}catch{return ''}}
</script>
<template>
 <main class="tl-page notification-templates-page">
  <PageHeader title="通知模板">
   <el-button v-if="manageable" type="primary" size="small" @click="openCreate">创建通知模板</el-button>
   <el-button size="small" :loading="loading" :disabled="!readable||loading" @click="load(true)">刷新</el-button>
  </PageHeader>
  <el-alert title="模板只替换固定告警变量；配置保存不等于实际送达，实际投递仍以告警历史和投递事实核对。" type="info" :closable="false" />
  <AsyncState :forbidden="!readable" :loading="loading" :error="error" empty-text="暂无通知模板" :empty="!loading&&!error&&!rows.length" @retry="load(true)">
   <el-table :data="rows" class="notification-template-table" empty-text="暂无通知模板">
    <el-table-column prop="name" label="模板名称" min-width="160" />
    <el-table-column label="渠道" width="110"><template #default="{row}">{{ channelName(row.channel) }}</template></el-table-column>
    <el-table-column label="主题" min-width="220"><template #default="{row}">{{ row.subjectTemplate||'—' }}</template></el-table-column>
    <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.enabled?'success':'info'" size="small">{{ row.enabled?'已启用':'已停用' }}</el-tag></template></el-table-column>
    <el-table-column label="更新时间" min-width="170"><template #default="{row}">{{ row.updatedAt?formatTime(row.updatedAt):'—' }}</template></el-table-column>
    <el-table-column v-if="manageable" label="操作" width="140" align="center"><template #default="{row}"><el-button link type="primary" :disabled="busy" @click="openEdit(row)">编辑</el-button><el-button link type="danger" :disabled="busy" @click="remove(row)">删除</el-button></template></el-table-column>
   </el-table>
   <div v-if="hasMore" class="notification-template-more"><el-button size="small" :loading="moreBusy" :disabled="moreBusy" @click="load(false)">加载更多</el-button></div>
  </AsyncState>
  <el-dialog v-model="dialogOpen" :title="editing?'编辑通知模板':'创建通知模板'" width="min(680px,96vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" @close="closeDialog">
   <el-form label-position="top" :disabled="busy">
    <div class="notification-template-grid">
     <el-form-item label="模板名称" required><el-input v-model="form.name" aria-label="通知模板名称" maxlength="128" /></el-form-item>
     <el-form-item label="渠道" required><el-select v-model="form.channel" aria-label="通知模板渠道" style="width:100%"><el-option v-for="item in availableChannels" :key="item.value" :value="item.value" :label="item.label" /></el-select></el-form-item>
    </div>
    <el-form-item label="可用变量"><div class="notification-template-vars"><el-tag v-for="(label,key) in templateVariables" :key="key" type="info" size="small">{{ label }} {{ key }}</el-tag></div></el-form-item>
    <el-form-item v-if="form.channel==='EMAIL'" label="邮件主题" required><el-input v-model="form.subjectTemplate" aria-label="通知模板主题" maxlength="256" /></el-form-item>
    <el-form-item label="正文" required><el-input v-model="form.bodyTemplate" aria-label="通知模板正文" type="textarea" :rows="8" maxlength="20000" show-word-limit /></el-form-item>
    <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
    <el-form-item v-if="form.bodyTemplate" label="变量替换预览（仅本地替换，不代表已发送）"><pre class="notification-template-preview">{{ variablesPreview(form.bodyTemplate) }}</pre></el-form-item>
   </el-form>
   <el-alert v-if="formError" :title="formError" :type="unknown?'warning':'error'" :closable="false" />
   <template #footer><el-button :disabled="busy" @click="closeDialog">取消</el-button><el-button type="primary" :loading="busy" :disabled="busy||unknown||!manageable" @click="save">保存</el-button></template>
  </el-dialog>
 </main>
</template>
<style scoped>
.notification-templates-page>.el-alert{margin-bottom:16px}.notification-template-table{font-size:14px}.notification-template-more{display:flex;justify-content:center;margin-top:20px}.notification-template-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:0 16px}.notification-template-vars{display:flex;flex-wrap:wrap;gap:6px}.notification-template-preview{margin:0;padding:10px;background:#f5f7fa;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/18px monospace;max-height:160px;overflow:auto}@media(max-width:640px){.notification-template-grid{grid-template-columns:1fr}}
</style>
