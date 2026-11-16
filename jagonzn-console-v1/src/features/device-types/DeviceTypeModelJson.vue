<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import {computed,onScopeDispose,ref,watch} from 'vue'
import {Download,DocumentCopy,Refresh} from '@element-plus/icons-vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import {typeDeviceUuid} from './type-devices-api'
import {modelVersionTransport,type ModelVersionTransport} from './model-version-api'
import {modelSnapshotJsonFile} from './model-json-export'
const props=withDefaults(defineProps<{typeId:string;typeStatus:string;disabled?:boolean;transport?:ModelVersionTransport}>(),{disabled:false,transport:()=>modelVersionTransport})
const emit=defineEmits<{locked:[value:boolean]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const input=ref(''),selected=ref(''),notice=ref(''),error=ref('')
const resource=useResource(async signal=>{
 const project=projectId.value,type=props.typeId,id=selected.value,status=props.typeStatus,transport=props.transport
 if(id)return transport.snapshot(project,type,id,signal)
 let latest
 try{latest=await transport.latest(project,type,signal)}catch(cause){if(status==='DRAFT'&&cause instanceof ApiError&&cause.status===404&&cause.code===30052)return null;throw cause}
 return transport.snapshot(project,type,latest.id,signal,latest)
})
const denied=computed(()=>!member.value||resource.error.value instanceof ApiError&&[401,403].includes(resource.error.value.status))
const file=computed(()=>resource.data.value?modelSnapshotJsonFile(resource.data.value):undefined)
let alive=true
const ready=computed(()=>!denied.value&&!props.disabled&&!resource.loading.value&&!resource.error.value&&!!file.value)
function reset(){input.value='';selected.value='';notice.value='';error.value='';resource.clear();if(member.value&&!props.disabled)void resource.reload()}
function reload(){if(!member.value||props.disabled||resource.loading.value)return;notice.value='';error.value='';resource.clear();void resource.reload()}
function lookup(){if(!member.value||props.disabled||resource.loading.value)return;const id=input.value.trim();if(!typeDeviceUuid.test(id)){error.value='请输入完整的版本 UUID';return}selected.value=id;reload()}
function latest(){selected.value='';input.value='';reload()}
async function copy(){if(!ready.value||!file.value)return;const value=file.value;notice.value='';error.value='';try{await navigator.clipboard.writeText(value.content);if(alive&&ready.value&&file.value===value)copySucceeded('已复制所选固定版本模型 JSON。')}catch{if(alive&&ready.value&&file.value===value)copyFailed()}}
function download(){if(!ready.value||!file.value)return;const value=file.value,url=URL.createObjectURL(new Blob([value.content],{type:value.mime})),link=document.createElement('a');link.href=url;link.download=value.name;link.rel='noopener';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);notice.value='已生成所选固定版本模型 JSON 文件。'}
watch([()=>projectId.value,()=>props.typeId,()=>props.typeStatus,()=>props.disabled,()=>session.user?.accountId,()=>member.value,()=>props.transport],reset,{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{resource.clear();input.value='';selected.value='';notice.value='';error.value=''});emit('locked',false);onScopeDispose(()=>{alive=false;dispose();emit('locked',false)})
</script>
<template><section class="type-model-json"><header><h3>功能定义 JSON</h3><el-button size="small" :icon="Refresh" :disabled="!member||disabled||resource.loading.value" @click="latest">读取最新版本</el-button></header>
 <p class="tl-muted">内容来自明确的已发布版本，采用 ThingsLink 冻结物模型格式。不会混入当前草稿，不代表其它平台 TSL 的兼容格式。</p>
 <form v-if="member" class="json-lookup" @submit.prevent="lookup"><el-input v-model="input" aria-label="模型JSON版本ID" placeholder="输入已知固定版本ID" maxlength="36" :disabled="disabled||resource.loading.value"/><el-button native-type="submit" :disabled="disabled||resource.loading.value">按版本ID读取 JSON</el-button></form>
 <el-alert v-if="notice" :title="notice" type="success" :closable="false"/><el-alert v-if="error" :title="error" type="error" :closable="false"/>
 <AsyncState :forbidden="denied" :loading="resource.loading.value" :error="resource.error.value" @retry="reload"><el-empty v-if="resource.data.value===null" description="草稿尚无冻结版本，发布后可查看模型 JSON" :image-size="64"/>
  <template v-else-if="file&&resource.data.value"><p role="status">{{selected?'指定版本':'本次读取的最新版本'}}：{{resource.data.value.version.versionNumber}} · {{resource.data.value.version.id}}</p><p class="tl-muted">{{resource.data.value.version.digestAlgorithm}}：{{resource.data.value.version.schemaDigest}}</p><div><el-button :icon="DocumentCopy" :disabled="!ready" @click="copy">复制 JSON</el-button><el-button :icon="Download" :disabled="!ready" @click="download">下载 JSON</el-button></div><pre aria-label="固定版本功能定义JSON" tabindex="0">{{file.content}}</pre></template>
 </AsyncState></section></template>
<style scoped>.type-model-json{margin-top:26px}.type-model-json>header{display:flex;align-items:center;justify-content:space-between;gap:16px}.type-model-json h3{font-size:18px;font-weight:500}.type-model-json p{font-size:13px;line-height:21px;overflow-wrap:anywhere}.json-lookup{display:flex;gap:8px;max-width:680px;margin:16px 0}.type-model-json pre{max-height:460px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;background:var(--tl-bg);font-size:12px;line-height:19px}.type-model-json :deep(.el-alert){margin:12px 0}@media(max-width:600px){.json-lookup{flex-wrap:wrap}.json-lookup .el-input{flex-basis:100%}}</style>
