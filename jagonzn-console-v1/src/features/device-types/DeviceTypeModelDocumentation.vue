<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {Download,Refresh} from '@element-plus/icons-vue'
import {ApiError,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import {typeDeviceUuid} from './type-devices-api'
import {modelVersionTransport,type ModelVersionTransport} from './model-version-api'
import {createModelDocumentation,modelDocumentationFile,modelDocumentationNotice,modelDocumentationTitle} from './model-documentation'
import DeviceTypeModelDocumentPreview from './DeviceTypeModelDocumentPreview.vue'
import DeviceTypeModelFieldTable from './DeviceTypeModelFieldTable.vue'
import DeviceTypeModelMarkdownPreview from './DeviceTypeModelMarkdownPreview.vue'

const props=withDefaults(defineProps<{typeId:string;typeStatus:string;typeName?:string;disabled?:boolean;compact?:boolean;transport?:ModelVersionTransport}>(),{disabled:false,compact:false,transport:()=>modelVersionTransport})
const emit=defineEmits<{locked:[value:boolean]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const versionInput=ref(''),selected=ref(''),inputError=ref(''),notice=ref('')
const resource=useResource(async signal=>{
 const project=projectId.value,typeId=props.typeId,status=props.typeStatus,versionId=selected.value,transport=props.transport
 let exact=versionId
 if(!exact){
  let latest
  try{latest=await transport.latest(project,typeId,signal)}catch(cause){if(status==='DRAFT'&&cause instanceof ApiError&&cause.status===404&&cause.code===30052)return{kind:'unpublished' as const};throw cause}
  const snapshot=await transport.snapshot(project,typeId,latest.id,signal,latest)
  return{kind:'document' as const,document:createModelDocumentation(snapshot,typeId),latest:true}
 }
 const snapshot=await transport.snapshot(project,typeId,exact,signal)
 return{kind:'document' as const,document:createModelDocumentation(snapshot,typeId),latest:false}
})
const forbidden=computed(()=>!member.value||resource.error.value instanceof ApiError&&[401,403].includes(resource.error.value.status))
const documentation=computed(()=>member.value&&resource.data.value?.kind==='document'?resource.data.value.document:undefined)
const markdownOpen=ref(false)
watch(documentation,()=>{markdownOpen.value=false},{flush:'sync'})
function toggleMarkdown(event:Event){markdownOpen.value=(event.currentTarget as HTMLDetailsElement).open}
const ready=computed(()=>member.value&&!forbidden.value&&!props.disabled&&!resource.loading.value&&!resource.error.value&&!!documentation.value)
function reset(){versionInput.value='';selected.value='';inputError.value='';notice.value='';resource.clear();if(member.value&&!props.disabled)void resource.reload()}
function reload(){if(!member.value||props.disabled||resource.loading.value)return;inputError.value='';notice.value='';resource.clear();void resource.reload()}
function latest(){if(!member.value||props.disabled||resource.loading.value)return;selected.value='';versionInput.value='';reload()}
function exact(){if(!member.value||props.disabled||resource.loading.value)return;const id=versionInput.value.trim();if(!typeDeviceUuid.test(id)){inputError.value='请输入完整的小写版本 UUID';return}selected.value=id;reload()}
function download(format:'markdown'|'html'){
 if(!ready.value||!documentation.value)return
 const file=modelDocumentationFile(documentation.value,format),url=URL.createObjectURL(new Blob([file.content],{type:file.mime})),link=document.createElement('a')
 link.href=url;link.download=file.name;link.rel='noopener';link.click();setTimeout(()=>URL.revokeObjectURL(url),0)
 notice.value='已生成此固定版本的本地文档，未向网络上传。'
}
watch([()=>projectId.value,()=>props.typeId,()=>props.typeStatus,()=>props.disabled,()=>session.user?.accountId,()=>member.value,()=>props.transport],reset,{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{versionInput.value='';selected.value='';inputError.value='';notice.value='';resource.clear()})
emit('locked',false);onScopeDispose(()=>{dispose();emit('locked',false)})
</script>
<template><section class="type-model-documentation" :class="{compact}">
 <header v-if="!compact"><h3>开发文档</h3><el-button size="small" :icon="Refresh" :disabled="!member||disabled||resource.loading.value" @click="latest">读取最新文档</el-button></header>
 <p v-if="!compact" class="documentation-help">{{modelDocumentationNotice}}</p>
 <form v-if="member&&!compact" class="documentation-lookup" @submit.prevent="exact"><el-input v-model="versionInput" aria-label="文档版本ID" placeholder="输入已知版本ID读取固定文档" maxlength="36" :disabled="disabled||resource.loading.value"/><el-button native-type="submit" :disabled="disabled||resource.loading.value">按版本ID读取文档</el-button></form>
 <el-alert v-if="inputError" :title="inputError" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="success" :closable="false"/>
 <AsyncState :forbidden="forbidden" :loading="resource.loading.value" :error="resource.error.value" @retry="reload">
  <el-empty v-if="resource.data.value?.kind==='unpublished'" description="此草稿尚无冻结版本，发布后可生成开发文档" :image-size="64"/>
  <template v-else-if="documentation">
   <p v-if="!compact" role="status">{{resource.data.value?.kind==='document'&&resource.data.value.latest?'本次读取的最新版本文档':'按指定版本ID读取的历史文档'}}；内容固定于下方版本。</p>
   <dl v-if="!compact" class="documentation-facts"><template v-for="fact in documentation.facts" :key="fact.label"><dt>{{fact.label}}</dt><dd>{{fact.value}}</dd></template></dl>
   <div class="documentation-actions">
    <el-button :icon="compact?undefined:Download" :disabled="!ready" @click="download('markdown')">{{compact?'下载 Markdown 文档':'导出 Markdown'}}</el-button>
    <el-button :icon="compact?undefined:Download" :disabled="!ready" @click="download('html')">{{compact?'下载 HTML 文档':'导出静态 HTML'}}</el-button>
   </div>
   <DeviceTypeModelDocumentPreview v-if="compact" :documentation="documentation" :type-name="typeName"/>
   <template v-else>
    <section v-for="section in documentation.sections" :key="section.title" class="documentation-section"><h4>{{section.title}}（{{section.items.length}} 项）</h4><p v-if="!section.items.length" class="documentation-help">此版本未定义{{section.title}}。</p>
     <article v-for="entry in section.items" :key="entry.key"><h5>{{entry.key}}</h5><dl class="documentation-fields"><template v-for="field in entry.fields" :key="field.label"><dt>{{field.label}}</dt><dd><pre>{{field.value}}</pre></dd></template></dl>
      <template v-if="section.title==='事件'"><p v-if="entry.parametersNote" class="documentation-help">{{entry.parametersNote}}</p><section v-for="parameter in entry.parameters" :key="parameter.key" class="documentation-parameter"><h6>参数：{{parameter.key}}</h6><dl class="documentation-fields"><template v-for="field in parameter.fields" :key="field.label"><dt>{{field.label}}</dt><dd><pre>{{field.value}}</pre></dd></template></dl></section></template>
     </article>
    </section>
   </template>
   <div :class="{'documentation-disclosures':compact}">
    <details v-if="compact">
     <summary>查看版本信息</summary>
     <div class="documentation-disclosure-body">
      <DeviceTypeModelFieldTable :fields="documentation.facts"/>
     </div>
    </details>
    <details :key="documentation.versionId" @toggle="toggleMarkdown">
     <summary>查看 Markdown 文档 · {{modelDocumentationTitle}}</summary>
     <div v-if="markdownOpen" :class="{'documentation-disclosure-body':compact}">
      <DeviceTypeModelMarkdownPreview :documentation="documentation"/>
     </div>
    </details>
   </div>
  </template>
 </AsyncState>
</section></template>
<style scoped>.type-model-documentation.compact{margin-top:0}.type-model-documentation{margin-top:26px}.type-model-documentation>header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}.type-model-documentation h3{font-size:18px;font-weight:500;margin:0}.documentation-help{color:var(--tl-muted);font-size:12px;line-height:20px}.documentation-lookup{display:flex;gap:8px;max-width:660px;margin:16px 0}.documentation-facts,.documentation-fields{display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px 16px;font-size:13px;line-height:20px}.documentation-facts dt,.documentation-fields dt{color:var(--tl-muted)}.documentation-facts dd,.documentation-fields dd{margin:0;overflow-wrap:anywhere}.documentation-actions{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.documentation-actions :deep(.el-button+.el-button){margin-left:0}.documentation-section h4{font-size:16px;font-weight:500;margin:24px 0 12px}.documentation-section article{border-top:1px solid var(--tl-border);padding:12px 0}.documentation-section h5,.documentation-section h6{font-size:14px;font-weight:500;margin:0 0 12px;overflow-wrap:anywhere}.documentation-parameter{margin:16px 0 0 20px}.documentation-fields pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:0}.type-model-documentation summary{cursor:pointer;font-size:13px}@media(max-width:600px){.documentation-lookup{flex-wrap:wrap}.documentation-lookup .el-input{flex-basis:100%}.documentation-facts,.documentation-fields{grid-template-columns:100px minmax(0,1fr);gap:8px}.documentation-parameter{margin-left:8px}}
.compact .documentation-actions{justify-content:flex-end;gap:10px;margin:0 0 10px}
.compact .documentation-actions :deep(.el-button){height:40px;padding:12px 20px;margin:0}
.documentation-disclosures{margin-top:16px;border:1px solid var(--tl-border);border-radius:4px}
.documentation-disclosures details+details{border-top:1px solid var(--tl-border)}
.documentation-disclosures summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:10px 16px;list-style:none;color:var(--tl-text);font-size:14px;font-weight:500}
.documentation-disclosures summary::-webkit-details-marker{display:none}
.documentation-disclosures summary::after{content:'';flex:none;width:7px;height:7px;margin-right:3px;border:solid var(--tl-muted);border-width:0 1px 1px 0;transform:rotate(-45deg)}
.documentation-disclosures details[open]>summary,.documentation-disclosures summary:hover{background:var(--tl-fill)}
.documentation-disclosures details[open]>summary::after{transform:rotate(45deg)}
.documentation-disclosures summary:focus-visible{outline:2px solid var(--tl-primary);outline-offset:-2px}
.documentation-disclosure-body{padding:12px 16px 16px;border-top:1px solid var(--tl-border)}
</style>
