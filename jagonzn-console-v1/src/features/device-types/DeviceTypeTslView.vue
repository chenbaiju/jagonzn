<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import {computed,onScopeDispose,ref,watch} from 'vue'
import {jsonLanguage} from '@codemirror/lang-json'
import {highlightTree,tagHighlighter,tags} from '@lezer/highlight'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,onIdentityChange,errorMessage} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import {typeProfileId} from './profile-api'
import {tslSourceTransport,type TslSourceTransport} from './tsl-source-api'
import {thingsCloudTslFile} from './things-cloud-tsl-export'
const props=withDefaults(defineProps<{typeId:string;disabled?:boolean;transport?:TslSourceTransport}>(),{disabled:false,transport:()=>tslSourceTransport})
const roles=['OWNER','ADMIN','OPERATOR','VIEWER'],notice=ref(''),error=ref('')
const member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeProfileId(projectId.value)&&typeProfileId(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const resource=useResource(signal=>props.transport.read(projectId.value,props.typeId,signal))
const denied=computed(()=>!member.value||resource.error.value instanceof ApiError&&[401,403].includes(resource.error.value.status))
const result=computed(()=>resource.data.value?thingsCloudTslFile(resource.data.value):undefined)
const file=computed(()=>result.value?.file)
const highlight=tagHighlighter([
 {tag:tags.propertyName,class:'tsl-key'},
 {tag:tags.string,class:'tsl-string'},
 {tag:[tags.number,tags.bool,tags.null],class:'tsl-literal'}
])
const preview=computed(()=>{
 const content=file.value?.content??''
 // 大文件保留可选中的原文，避免为每个词法节点创建 DOM。
 if(content.length>128*1024)return [{text:content,style:''}]
 const text=content.replace(/(^|\n)( +)/g,(_match,lineBreak,indent)=>lineBreak+indent.repeat(2))
 const segments:{text:string;style:string}[]=[]
 let end=0
 highlightTree(jsonLanguage.parser.parse(text),highlight,(from,to,style)=>{
  if(from>end)segments.push({text:text.slice(end,from),style:''})
  segments.push({text:text.slice(from,to),style})
  end=to
 })
 if(end<text.length)segments.push({text:text.slice(end),style:''})
 return segments
})
let alive=true
const ready=computed(()=>!denied.value&&!props.disabled&&!resource.loading.value&&!resource.error.value&&!!file.value)
function reset(){notice.value='';error.value='';resource.clear();if(member.value&&!props.disabled)void resource.reload()}
function reload(){if(!member.value||props.disabled||resource.loading.value)return;reset()}
async function copy(){
 if(!ready.value||!file.value)return
 const value=file.value;notice.value='';error.value=''
 try{await navigator.clipboard.writeText(value.content);if(alive&&ready.value&&file.value===value)copySucceeded('已复制 TSL')}catch{if(alive&&ready.value&&file.value===value)copyFailed()}
}
function download(){
 if(!ready.value||!file.value)return
 const value=file.value;notice.value='';error.value=''
 try{const url=URL.createObjectURL(new Blob([value.content],{type:value.mime})),link=document.createElement('a');link.href=url;link.download=value.name;link.rel='noopener';try{link.click()}finally{setTimeout(()=>URL.revokeObjectURL(url),0)}notice.value='已下载 TSL'}catch(cause){if(ready.value&&file.value===value)error.value=errorMessage(cause)}
}
watch([()=>projectId.value,()=>props.typeId,()=>props.disabled,()=>session.user?.accountId,()=>member.value,()=>props.transport],reset,{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{resource.clear();notice.value='';error.value=''});onScopeDispose(()=>{alive=false;dispose()})
</script>
<template><section class="type-tsl-view">
 <el-alert v-if="notice" :title="notice" type="success" :closable="false"/>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/>
 <AsyncState :forbidden="denied" :loading="resource.loading.value" :error="resource.error.value" @retry="reload">
  <template v-if="result">
   <div v-if="result.issues.length" role="alert" class="tsl-issues"><p>当前定义无法完整转换为 TSL：</p><ul><li v-for="item in result.issues" :key="item.path+' '+item.message"><code>{{item.path}}</code>：{{item.message}}</li></ul></div>
   <template v-if="file">
    <div class="tsl-actions">
     <el-button :disabled="!ready" @click="copy">复制 TSL</el-button>
     <el-button :disabled="!ready" @click="download">下载 TSL</el-button>
    </div>
    <pre class="tsl-code" aria-label="功能定义TSL" tabindex="0"><code><template v-for="(segment,index) in preview" :key="index"><span v-if="segment.style" :class="segment.style">{{segment.text}}</span>{{segment.style?'':segment.text}}</template></code></pre>
   </template>
  </template>
 </AsyncState>
</section></template>
<style scoped>
.type-tsl-view :deep(.el-alert){margin:0 0 12px}
.tsl-actions{display:flex;justify-content:flex-end;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.tsl-actions :deep(.el-button){height:40px;padding:12px 20px;margin:0}
.tsl-code{margin:0;padding:7px;overflow:auto;background:#272727;color:#f8f8f2;font:14px/21px Monaco,Menlo,Consolas,monospace;white-space:pre;tab-size:4}
.tsl-code code{font:inherit}
.tsl-string{color:#a6e22e}
.tsl-literal{color:#ae81ff}
.tsl-issues{color:var(--tl-text);line-height:22px;overflow-wrap:anywhere}
.tsl-issues ul{padding-left:20px}
.tsl-issues code{font-size:12px}
</style>
