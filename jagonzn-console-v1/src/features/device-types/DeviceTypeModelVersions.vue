<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {Refresh} from '@element-plus/icons-vue'
import {ApiError} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import AsyncState from '@/ui/AsyncState.vue'
import {typeDeviceUuid} from './type-devices-api'
import {modelVersionTransport,type ModelSnapshot,type ModelVersionTransport} from './model-version-api'
const props=withDefaults(defineProps<{typeId:string;typeStatus:string;disabled?:boolean;transport?:ModelVersionTransport}>(),{disabled:false,transport:()=>modelVersionTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>()
const roles=['OWNER','ADMIN','OPERATOR','VIEWER'],member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const versionInput=ref(''),selected=ref(''),inputError=ref('')
const resource=useResource(async signal=>{
 const project=projectId.value,typeId=props.typeId,status=props.typeStatus,versionId=selected.value,transport=props.transport
 if(versionId)return{kind:'version' as const,value:await transport.snapshot(project,typeId,versionId,signal),latest:false}
 let latest
 try{latest=await transport.latest(project,typeId,signal)}catch(cause){if(status==='DRAFT'&&cause instanceof ApiError&&cause.status===404&&cause.code===30052)return{kind:'unpublished' as const};throw cause}
 return{kind:'version' as const,value:await transport.snapshot(project,typeId,latest.id,signal,latest),latest:true}
})
const forbidden=computed(()=>!member.value||resource.error.value instanceof ApiError&&[401,403].includes(resource.error.value.status))
const snapshot=computed<ModelSnapshot|undefined>(()=>resource.data.value?.kind==='version'?resource.data.value.value:undefined)
function reset(){versionInput.value='';selected.value='';inputError.value='';resource.clear();if(member.value)void resource.reload()}
function reload(){if(!member.value||props.disabled||resource.loading.value)return;inputError.value='';resource.clear();void resource.reload()}
function latest(){if(!member.value||props.disabled||resource.loading.value)return;selected.value='';versionInput.value='';reload()}
function exact(){if(!member.value||props.disabled||resource.loading.value)return;const id=versionInput.value.trim();if(!typeDeviceUuid.test(id)){inputError.value='请输入完整的小写版本 UUID';return}selected.value=id;reload()}
watch([()=>projectId.value,()=>props.typeId,()=>props.typeStatus,()=>session.user?.accountId,()=>member.value,()=>props.transport],reset,{immediate:true,flush:'sync'})
emit('locked',false);onScopeDispose(()=>emit('locked',false))
</script>
<template><section class="type-model-versions">
 <header><h3>物模型版本</h3><el-button size="small" :icon="Refresh" :disabled="!member||disabled||resource.loading.value" @click="latest">读取最新版本</el-button></header>
 <p class="model-help">已发布版本保持不可变。后续版本不会自动升级已绑定设备；未来新设备使用创建时的最新版本。</p>
 <p class="model-help">可读取最新版本，或按已知版本 ID 查看对应的冻结快照。</p>
 <form v-if="member" class="version-lookup" @submit.prevent="exact"><el-input v-model="versionInput" aria-label="物模型版本ID" placeholder="输入已知版本ID读取历史快照" maxlength="36" :disabled="disabled||resource.loading.value"/><el-button native-type="submit" :disabled="disabled||resource.loading.value">按版本ID读取</el-button></form>
 <el-alert v-if="inputError" :title="inputError" type="error" :closable="false"/>
 <AsyncState :forbidden="forbidden" :loading="resource.loading.value" :error="resource.error.value" @retry="reload">
  <el-empty v-if="resource.data.value?.kind==='unpublished'" description="此草稿尚无已发布的物模型版本" :image-size="64"/>
  <template v-else-if="snapshot"><p role="status">{{resource.data.value?.latest?'本次读取的最新版本':'按指定版本ID读取的历史版本'}}</p>
   <p v-if="typeStatus==='DRAFT'" class="model-help">已读取到发布版本；类型页面状态可能已变化，请刷新类型资料。</p>
   <dl class="model-facts"><dt>版本号</dt><dd>{{snapshot.version.versionNumber}}</dd><dt>版本ID</dt><dd>{{snapshot.version.id}}</dd><dt>变化级别</dt><dd>{{snapshot.version.changeLevel}}</dd><dt>发布时间</dt><dd>{{formatTime(snapshot.version.publishedAt)}}</dd><dt>服务端快照摘要</dt><dd>{{snapshot.version.schemaDigest}}</dd><dt>摘要算法</dt><dd>{{snapshot.version.digestAlgorithm}}</dd></dl>
   <p>属性 {{snapshot.counts.properties}} 项 · 事件 {{snapshot.counts.events}} 项 · 命令 {{snapshot.counts.commands}} 项</p>
   <details><summary>查看此版本的冻结快照</summary><p class="model-help">按精确版本ID读取；下方排版仅供阅读，未重新计算服务端摘要。</p><pre tabindex="0" aria-label="物模型冻结快照">{{snapshot.text}}</pre></details>
  </template>
 </AsyncState>
</section></template>
<style scoped>.type-model-versions{margin-top:26px}.type-model-versions>header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}.type-model-versions h3{font-size:18px;font-weight:500;margin:0}.model-help{color:var(--tl-muted);font-size:12px;line-height:20px}.version-lookup{display:flex;gap:8px;max-width:640px;margin:16px 0}.model-facts{display:grid;grid-template-columns:130px minmax(0,1fr);gap:10px 16px;font-size:13px;line-height:20px}.model-facts dt{color:var(--tl-muted)}.model-facts dd{margin:0;overflow-wrap:anywhere}.type-model-versions summary{cursor:pointer}.type-model-versions pre{max-height:460px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;background:var(--tl-bg);font-size:12px;line-height:19px}@media(max-width:600px){.version-lookup{flex-wrap:wrap}.version-lookup .el-input{flex-basis:100%}.model-facts{grid-template-columns:100px minmax(0,1fr);gap:8px}}</style>
