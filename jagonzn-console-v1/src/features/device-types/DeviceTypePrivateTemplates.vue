<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {formatTime} from '@/core/time'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {typeDeviceUuid} from './type-devices-api'
import {privateTemplateTransport,prepareSavePrivateTemplate,prepareImportPrivateTemplate,savedTemplateMatches,importedTemplateMatches,type PrivateTemplateTransport,type PrivateTemplate,type PrivateTemplateDirectory,type PrivateTemplateVersions,type PrivateTemplateVersion,type PrivateTemplatePreview,type PrivateTemplateIntent,type PrivateTemplateImportReceipt} from './private-template-api'
const props=withDefaults(defineProps<{mode:'save'|'import';typeId?:string;typeStatus?:string;disabled?:boolean;transport?:PrivateTemplateTransport}>(),{disabled:false,transport:()=>privateTemplateTransport})
const emit=defineEmits<{locked:[value:boolean];created:[id:string]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const denied=ref(false),member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||'')&&(props.mode==='import'||!!props.typeId&&typeDeviceUuid.test(props.typeId)))
const readable=computed(()=>member.value&&!denied.value),manager=computed(()=>readable.value&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const writable=computed(()=>manager.value&&currentProject.value?.status==='ACTIVE'&&(props.mode==='import'||props.typeStatus==='DRAFT'))
const shown=ref(false),busy=ref(false),unknown=ref(false),error=ref(''),notice=ref(''),name=ref(''),chosenTemplate=ref('new')
const directory=shallowRef<PrivateTemplateDirectory>(),versions=shallowRef<PrivateTemplateVersions>(),version=shallowRef<PrivateTemplateVersion>(),preview=shallowRef<PrivateTemplatePreview>(),intent=shallowRef<PrivateTemplateIntent>(),saved=shallowRef<PrivateTemplateVersion>(),created=shallowRef<PrivateTemplateImportReceipt>()
const locked=computed(()=>shown.value||busy.value||unknown.value),template=computed(()=>directory.value?.items.find(row=>row.id===chosenTemplate.value)??null)
let generation=0,alive=true,controller:AbortController|undefined
function clear(){generation++;controller?.abort();shown.value=false;busy.value=false;unknown.value=false;intent.value=undefined;directory.value=undefined;versions.value=undefined;version.value=undefined;preview.value=undefined;saved.value=undefined;created.value=undefined;name.value='';chosenTemplate.value='new';error.value='';notice.value=''}
function reset(){clear();denied.value=false}
function capture(){return{generation,epoch:identityEpoch(),account:session.user?.accountId,project:projectId.value,type:props.typeId,mode:props.mode}}
function current(s:ReturnType<typeof capture>){return alive&&readable.value&&s.generation===generation&&s.epoch===identityEpoch()&&s.account===session.user?.accountId&&s.project===projectId.value&&s.type===props.typeId&&s.mode===props.mode}
function fail(cause:unknown,s:ReturnType<typeof capture>){if(!current(s)||cause instanceof IdentityChanged)return;if(cause instanceof ApiError&&[401,403].includes(cause.status)&&!cause.outcomeUnknown){clear();denied.value=true}else error.value=errorMessage(cause)}
async function open(){
 if(!readable.value||props.disabled||busy.value||unknown.value||props.mode==='save'&&!writable.value)return
 clear();shown.value=true;const s=capture();busy.value=true;controller=new AbortController()
 try{const rows=await props.transport.directory(s.project,controller.signal);if(!current(s))return;directory.value=rows;if(props.mode==='save'&&props.typeId){const value=await props.transport.preview(s.project,props.typeId,controller.signal);if(current(s))preview.value=value}}
 catch(cause){fail(cause,s)}finally{if(current(s))busy.value=false}
}
function close(){if(busy.value)return;if(unknown.value)shown.value=false;else clear()}
function beforeClose(done:()=>void){if(!busy.value){close();done()}}
async function selectTemplate(id:string){
 if(busy.value||unknown.value||!directory.value?.items.some(row=>row.id===id))return
 chosenTemplate.value=id;version.value=undefined;versions.value=undefined;name.value='';const s=capture();busy.value=true;error.value='';controller=new AbortController()
 try{const values=await props.transport.versions(s.project,id,controller.signal);if(current(s))versions.value=values}catch(cause){fail(cause,s)}finally{if(current(s))busy.value=false}
}
async function selectVersion(id:string){
 if(busy.value||unknown.value||!versions.value?.items.some(row=>row.versionId===id))return
 const s=capture();busy.value=true;error.value='';version.value=undefined;controller=new AbortController()
 try{const value=await props.transport.version(s.project,id,controller.signal);if(!current(s))return;const summary=versions.value?.items.find(row=>row.versionId===id);if(value.templateId!==chosenTemplate.value||!summary||summary.packageDigest!==value.packageDigest||summary.sequence!==value.sequence)throw new Error('固定版本与所选目录不符，请重新读取');version.value=value}
 catch(cause){fail(cause,s)}finally{if(current(s))busy.value=false}
}
function finishSave(value:PrivateTemplateVersion){saved.value=value;unknown.value=false;busy.value=false;intent.value=undefined;shown.value=false;notice.value=`私有模板“${value.templateName}”第 ${value.sequence} 版已保存。源类型保持草稿。`}
function finishImport(value:PrivateTemplateImportReceipt){created.value=value;unknown.value=false;busy.value=false;intent.value=undefined;shown.value=false;notice.value=value.deleted?'原请求已创建新类型，但该类型现在已删除；不会再次创建。':'已按精确模板版本创建新草稿类型，未发布模型或绑定设备。';if(!value.deleted)emit('created',value.deviceTypeId)}
async function confirm(){
 if(!shown.value||!writable.value||props.disabled||busy.value||unknown.value)return
 let original:PrivateTemplateIntent
 try{if(props.mode==='save'){if(!preview.value)throw new Error('请先读取完整草稿预览');original=prepareSavePrivateTemplate(projectId.value,preview.value,template.value,name.value)}else{if(!version.value)throw new Error('请选择一个精确模板版本');original=prepareImportPrivateTemplate(projectId.value,version.value,name.value)}}catch(cause){error.value=errorMessage(cause);return}
 intent.value=original;unknown.value=true;busy.value=true;error.value='';const s=capture();controller=new AbortController();let acknowledged=false
 try{
  if(original.kind==='save'){const result=await props.transport.save(original,controller.signal);acknowledged=true;if(!current(s))return;if(!savedTemplateMatches(result,original))throw new Error('保存回执与原预览不符');const actual=await props.transport.saved(original,controller.signal);if(!current(s))return;if(result.versionId!==actual.versionId||!savedTemplateMatches(actual,original))throw new Error('原保存回执不一致');finishSave(actual)}
  else{const result=await props.transport.create(original,controller.signal);acknowledged=true;if(!current(s))return;if(!importedTemplateMatches(result,original))throw new Error('创建回执与原模板选择不符');const actual=await props.transport.imported(original,controller.signal);if(!current(s))return;if(result.deviceTypeId!==actual.deviceTypeId||!importedTemplateMatches(actual,original))throw new Error('原创建回执不一致');finishImport(actual)}
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(!acknowledged&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.status>=400&&cause.status<500){unknown.value=false;intent.value=undefined;if([401,403].includes(cause.status)){fail(cause,s);return}}error.value=errorMessage(cause)}}finally{if(current(s))busy.value=false}
}
async function recover(){
 const original=intent.value;if(!original||!unknown.value||!readable.value||busy.value)return
 const s=capture();busy.value=true;error.value='';controller=new AbortController()
 try{if(original.kind==='save'){const actual=await props.transport.saved(original,controller.signal);if(current(s)){if(!savedTemplateMatches(actual,original))throw new Error('原保存回执不匹配');finishSave(actual)}}else{const actual=await props.transport.imported(original,controller.signal);if(current(s)){if(!importedTemplateMatches(actual,original))throw new Error('原创建回执不匹配');finishImport(actual)}}}
 catch(cause){if(current(s)&&cause instanceof ApiError&&cause.status===404)error.value='暂未读到本人原请求回执；这不能证明未执行，将继续保留原意图，不会再次提交。';else fail(cause,s)}finally{if(current(s))busy.value=false}
}
function finishUnknown(){if(!unknown.value||busy.value)return;clear();notice.value='已结束本次核对；原操作仍未确认，未标记为成功。'}
watch([()=>projectId.value,()=>session.user?.accountId,()=>props.typeId,()=>props.mode,()=>member.value],reset,{flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><section class="private-templates">
 <header><h3 v-if="mode==='import'">从模板库导入</h3><el-button v-if="mode==='import'||writable" :disabled="!readable||disabled||locked" @click="open">{{mode==='save'?'保存为私有模板':'浏览项目私有模板'}}</el-button></header>
 <p v-if="mode==='import'">从当前项目的私有模板选择固定版本，快速创建设备类型草稿。</p>
 <p v-else>保存时冻结草稿基本资料、属性、事件与命令；不复制产品密钥、设备、规则或运行设置。</p>
 <p v-if="mode==='save'&&typeStatus!=='DRAFT'">当前类型已发布，不能按当前资料保存草稿模板。</p>
 <el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <p v-if="saved">固定版本：{{saved.versionId}} · 模板包摘要：{{saved.packageDigest}}</p>
 <p v-if="created">原新增类型：{{created.deviceTypeId}} · 模板版本：{{created.templateVersionId}}</p>
 <el-alert v-if="unknown&&!shown" title="存在尚未确认的模板操作。" type="warning" :closable="false"><el-button @click="shown=true">查看原模板核对</el-button></el-alert>
 <el-dialog :model-value="shown&&readable" :title="mode==='save'?'保存项目私有模板':'从精确私有模板版本创建'" width="min(900px,96vw)" :close-on-click-modal="false" :show-close="!busy" :before-close="beforeClose">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="unknown"><el-alert title="原操作结果尚未确认；仅按原键读取回执，不会重复提交。" type="warning" :closable="false"/><p>原请求键：{{intent?.key}}</p><p v-if="intent?.kind==='save'">草稿来源：{{intent.body.sourceDeviceTypeId}} · 包摘要：{{intent.body.expectedPackageDigest}}</p><p v-else-if="intent?.kind==='import'">模板版本：{{intent.body.templateVersionId}} · 目标名称：{{intent.body.name}}</p><el-button :loading="busy" @click="recover">读取原模板操作回执</el-button><el-button :disabled="busy" @click="finishUnknown">结束本次模板核对</el-button></template>
  <template v-else-if="mode==='save'">
   <p>草稿来源：{{typeId}}。保存只生成独立模板版本，不发布源类型。当前平台上限：项目20个模板、每模板10个版本、每包1MiB。</p>
   <el-form label-position="top" :disabled="busy||disabled||!writable"><el-form-item label="保存到模板"><el-select v-model="chosenTemplate" aria-label="保存到模板"><el-option value="new" label="新建项目私有模板"/><el-option v-for="row in directory?.items||[]" :key="row.id" :value="row.id" :label="`${row.name}（当前第 ${row.headSequence} 版）`" :disabled="row.headSequence>=10"/></el-select></el-form-item><el-form-item v-if="!template" label="模板名称"><el-input v-model="name" aria-label="模板名称" maxlength="128"/></el-form-item></el-form>
   <template v-if="preview"><p>属性 {{preview.propertyCount}} 项 · 事件 {{preview.eventCount}} 项 · 命令 {{preview.commandCount}} 项</p><p>完整包摘要：{{preview.packageDigest}}</p><p>运行模型摘要：{{preview.sourceSchemaDigest}}</p><details><summary>查看本次完整模板与精确数字</summary><pre aria-label="完整模板预览" tabindex="0">{{preview.packageJson}}</pre></details><p v-if="template">将以第 {{template.headSequence+1}} 版追加到“{{template.name}}”；当前头版本变化时整次拒绝，不覆盖原版本。</p></template>
  </template>
  <template v-else>
   <p>当前项目共 {{directory?.total??'—'}} 个私有模板。请选择固定版本。导入不复制产品密钥、设备、规则或运行设置。</p>
   <el-table :data="directory?.items||[]" empty-text="当前项目暂无私有模板"><el-table-column prop="name" label="模板"/><el-table-column prop="headSequence" label="当前版本" width="100"/><el-table-column width="115"><template #default="{row}"><el-button :disabled="busy||disabled" @click="selectTemplate(row.id)">选择模板</el-button></template></el-table-column></el-table>
   <section v-if="versions"><h4>{{template?.name}} 的固定版本</h4><el-table :data="versions.items" empty-text="暂无固定版本"><el-table-column prop="sequence" label="版本" width="75"/><el-table-column label="保存时间"><template #default="{row}">{{formatTime(row.createdAt)}}</template></el-table-column><el-table-column width="115"><template #default="{row}"><el-button :disabled="busy||disabled" @click="selectVersion(row.versionId)">选择第 {{row.sequence}} 版</el-button></template></el-table-column></el-table></section>
   <template v-if="version"><h4>已选：{{version.templateName}} 第 {{version.sequence}} 版</h4><p>当时草稿来源：{{version.sourceDeviceTypeId}} · 保存时间：{{formatTime(version.createdAt)}}</p><p>模板包摘要：{{version.packageDigest}}</p><details><summary>查看固定版本完整资料</summary><pre aria-label="固定模板完整资料" tabindex="0">{{version.packageJson}}</pre></details><el-form label-position="top" :disabled="!writable||disabled||busy"><el-form-item label="新类型名称"><el-input v-model="name" aria-label="模板新类型名称" maxlength="128"/></el-form-item></el-form><p>确认会按此固定版本一次创建新草稿及全部定义；任一错误不保留半类型。当前类型、设备与模型绑定不受影响。</p></template>
   <p v-if="!writable">当前账号或项目状态只允许浏览模板，不能创建类型。</p>
  </template>
  <template #footer><el-button :disabled="busy" @click="close">{{unknown?'关闭核对':'取消'}}</el-button><el-button v-if="!unknown&&writable" type="primary" :loading="busy" :disabled="disabled||busy||(mode==='save'?!preview:!version)" @click="confirm">{{mode==='save'?'确认保存私有模板版本':'确认从模板创建新类型'}}</el-button></template>
 </el-dialog></section></template>
<style scoped>.private-templates{margin-top:22px}.private-templates>header{display:flex;align-items:center;justify-content:space-between;gap:12px}.private-templates p{font-size:13px;line-height:1.7;overflow-wrap:anywhere;color:var(--tl-muted)}.private-templates h3{font-size:18px;font-weight:500}.private-templates pre{max-height:340px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--tl-bg);padding:12px;font-size:12px;line-height:1.6}.private-templates :deep(.el-select){width:100%}.private-templates :deep(.el-alert){margin:12px 0}</style>
