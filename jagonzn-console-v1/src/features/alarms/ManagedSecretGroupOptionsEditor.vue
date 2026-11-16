<script setup lang="ts">
import {onScopeDispose,ref,watch} from 'vue'
import {ApiError,assertIdentity,errorMessage,identityEpoch,IdentityChanged,onIdentityChange} from '../../core/http'
import {can,projectId} from '../../core/session'
import {useResource} from '../../core/use-resource'
import AsyncState from '../../ui/AsyncState.vue'
import {notificationSecretApi} from './notification-secret-api'
import {secretGroupEdit,secretGroupSaveRequest,type SecretGroupEdit} from './notification-secret-contract'
const props=defineProps<{groupId:string;expectedKind:SecretGroupEdit['notificationType']}>(),emit=defineEmits<{close:[];saved:[]}>()
const resource=useResource(async signal=>{const value=await notificationSecretApi.read(projectId.value,props.groupId,signal);if(value.notificationType!==props.expectedKind)throw new Error('通知方式已变化，请重新读取');return value})
const draft=ref<SecretGroupEdit>(),busy=ref(false),error=ref(''),review=ref(false),customBody=ref(false),bodySource=ref('')
let serial=0
function clear(){serial++;draft.value=undefined;busy.value=false;error.value='';review.value=false;customBody.value=false;bodySource.value=''}
async function read(){clear();resource.clear();if(can('alarm:manage')&&projectId.value&&props.groupId)await resource.reload()}
watch([projectId,()=>props.groupId,()=>props.expectedKind,()=>can('alarm:manage')],(value,previous)=>{if(previous?.length&&(value[0]!==previous[0]||value[1]!==previous[1]||!value[3])){clear();resource.clear();emit('close');return}void read()},{immediate:true})
watch(resource.data,value=>{clear();if(value&&can('alarm:manage'))draft.value=secretGroupEdit(value,props.groupId)})
watch(resource.error,value=>{if(value){resource.data.value=undefined;clear();if(value instanceof ApiError&&[401,403,404].includes(value.status))emit('close')}})
const dispose=onIdentityChange(()=>{clear();resource.clear();emit('close')});onScopeDispose(()=>{clear();resource.clear();dispose()})
async function save(){
 if(busy.value||review.value||!draft.value||!can('alarm:manage')||resource.loading.value||resource.error.value)return
 if(customBody.value){error.value='自定义正文尚不能保存，请保留源码，待正文函数服务接通后重试';return}
 let body:ReturnType<typeof secretGroupSaveRequest>,previous:SecretGroupEdit
 try{previous=secretGroupEdit({...draft.value,headers:draft.value.headers.filter(row=>row.name||row.value)},props.groupId);body=secretGroupSaveRequest(previous)}catch(cause){error.value=errorMessage(cause);return}
 const project=projectId.value,group=props.groupId,epoch=identityEpoch(),request=++serial;busy.value=true;error.value=''
 try{
  const saved=await notificationSecretApi.save(project,group,body,previous);assertIdentity(epoch);if(request!==serial||project!==projectId.value||group!==props.groupId)throw new IdentityChanged()
  let fresh:SecretGroupEdit
  try{fresh=await notificationSecretApi.read(project,group);assertIdentity(epoch);if(fresh.notificationType!==previous.notificationType||fresh.configurationVersion!==saved.configurationVersion||fresh.url!==body.url||JSON.stringify(fresh.headers)!==JSON.stringify(body.headers))throw new ApiError('配置已再次变更',409)}
  catch(cause){if(cause instanceof IdentityChanged||cause instanceof ApiError&&[401,403,404,409].includes(cause.status))throw cause;throw new ApiError('保存后读取失败，请核对结果',0,undefined,undefined,true)}
  if(request!==serial||!can('alarm:manage'))return;clear();resource.clear();emit('saved');emit('close')
 }catch(cause){
  if(cause instanceof IdentityChanged||request!==serial)return
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){clear();resource.clear();emit('close');return}
  review.value=!(cause instanceof ApiError&&!cause.outcomeUnknown&&[400,422].includes(cause.status));error.value=review.value?(cause instanceof ApiError&&cause.status===409?'通知方式已变更，请关闭后重新读取。':'保存结果未知，请关闭后重新读取核对。'):errorMessage(cause)
 }finally{if(request===serial)busy.value=false}
}
function close(){if(!busy.value){clear();resource.clear();emit('close')}}
</script>
<template><el-dialog :model-value="true" title="修改通知方式" width="min(800px,94vw)" :show-close="!busy" :close-on-click-modal="false" :close-on-press-escape="!busy" @close="close"><AsyncState :loading="resource.loading.value" :error="resource.error.value" @retry="read"><el-form v-if="draft" label-position="top">
 <el-form-item :label="expectedKind==='WEBHOOK'?'Webhook URL':'机器人URL'"><el-input v-model="draft.url" :disabled="busy" :aria-label="expectedKind==='WEBHOOK'?'Webhook URL':'机器人URL'" placeholder="https://" autocomplete="off" /></el-form-item>
 <template v-if="expectedKind==='WEBHOOK'"><el-form-item label="自定义 HTTP 请求头"><div class="secret-headers"><div v-for="(header,index) in draft.headers" :key="index" class="secret-header-row"><el-input v-model="header.name" :disabled="busy" :aria-label="`请求头${index+1}名称`" autocomplete="off" /><el-input v-model="header.value" :disabled="busy" :aria-label="`请求头${index+1}值`" autocomplete="off" /><el-button :disabled="busy" size="small" @click="draft.headers.splice(index,1)">移除</el-button></div><el-button :disabled="busy" size="small" @click="draft.headers.push({name:'',value:''})">添加</el-button></div></el-form-item><el-form-item label="使用自定义请求格式"><el-switch v-model="customBody" :disabled="busy" aria-label="使用自定义请求格式" /></el-form-item><el-form-item v-if="customBody" label="编辑正文函数"><el-input v-model="bodySource" type="textarea" :rows="16" :disabled="busy" spellcheck="false" aria-label="编辑正文函数" /></el-form-item></template>
 </el-form></AsyncState><el-alert v-if="error" :title="error" type="error" :closable="false" /><template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" :loading="busy" :disabled="busy||review||resource.loading.value||!!resource.error.value||!draft||!can('alarm:manage')" @click="save">保存</el-button></template></el-dialog></template>
<style scoped>.secret-headers{width:100%}.secret-header-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}.secret-header-row .el-input{min-width:0;flex:1}@media(max-width:600px){.secret-header-row{display:grid;grid-template-columns:minmax(0,1fr) auto}.secret-header-row .el-input:first-child{grid-column:1/-1}}</style>
