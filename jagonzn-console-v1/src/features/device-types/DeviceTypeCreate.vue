<script setup lang="ts">
import {computed,onScopeDispose,reactive,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRouter} from 'vue-router'
import {session,projectId,currentProject} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import DeviceTypePrivateTemplates from './DeviceTypePrivateTemplates.vue'
import DeviceTypeProductImport from './DeviceTypeProductImport.vue'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {typeProfileTransport,typeKinds,directNetworks,subNetworks,typeProtocols,typeProfileDraft,prepareTypeCreation,creationMatches,type TypeProfileTransport,type TypeCreateDraft,type TypeCreateIntent} from './profile-api'

const props=withDefaults(defineProps<{transport?:TypeProfileTransport}>(),{transport:()=>typeProfileTransport})
const roles=['OWNER','ADMIN','OPERATOR','VIEWER'],denied=ref(false)
const member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&!!projectId.value&&!!currentProject.value&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const readable=computed(()=>member.value&&!denied.value),manager=computed(()=>readable.value&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const writable=computed(()=>manager.value&&currentProject.value?.status==='ACTIVE')
const router=useRouter(),form=reactive<TypeCreateDraft>({...typeProfileDraft(),deviceKind:'DIRECT',networkType:'',payloadProtocol:'STANDARD',defaultStream:false,initialFormat:'',initialTcpTarget:false})
const error=ref(''),busy=ref(false),unknown=ref(false),deleted=ref(false),intent=shallowRef<TypeCreateIntent>()
const templatesLocked=ref(false),productImportLocked=ref(false)
const locked=computed(()=>readable.value&&(busy.value||unknown.value||templatesLocked.value||productImportLocked.value)),networks=computed(()=>form.deviceKind==='SUB_DEVICE'?subNetworks:directNetworks)
let generation=0,alive=true,controller:AbortController|undefined
function reset(){generation++;controller?.abort();busy.value=false;unknown.value=false;deleted.value=false;intent.value=undefined;error.value='';denied.value=false;Object.assign(form,{...typeProfileDraft(),deviceKind:'DIRECT',networkType:'',payloadProtocol:'STANDARD',defaultStream:false,initialFormat:'',initialTcpTarget:false})}
function capture(){return{generation,epoch:identityEpoch(),account:session.user?.accountId,project:projectId.value}}
function current(s:ReturnType<typeof capture>){return alive&&s.generation===generation&&s.epoch===identityEpoch()&&s.account===session.user?.accountId&&s.project===projectId.value&&readable.value}
function deny(cause:unknown){reset();denied.value=true;error.value=errorMessage(cause)}
function changeKind(value:string){if(!writable.value||busy.value||unknown.value||deleted.value||templatesLocked.value||productImportLocked.value)return;form.deviceKind=value;form.networkType='';form.payloadProtocol=value==='GATEWAY'?'STANDARD_GATEWAY':'STANDARD'}
function cancel(){if(!locked.value)void router.push('/device-types')}
async function submit(){
 if(!writable.value||busy.value||unknown.value||deleted.value||templatesLocked.value||productImportLocked.value)return
 let chosen:TypeCreateIntent
 try{chosen=prepareTypeCreation(projectId.value,form)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=chosen;unknown.value=true;busy.value=true;error.value='';const s=capture();controller=new AbortController();let writeAccepted=false
 try{
  const accepted=await props.transport.create(chosen,controller.signal)
  writeAccepted=true
  if(!current(s)||!manager.value)return
  if(!creationMatches(accepted,chosen.body))throw new Error('创建回执与原草稿不符，请核对原创建请求')
  const actual=await props.transport.read(chosen.project,accepted.type.id,controller.signal)
  if(!current(s)||!manager.value)return
  if(!creationMatches(actual,chosen.body))throw new Error('设备类型已受理，当前资料需要按原请求核对')
  unknown.value=false;intent.value=undefined;busy.value=false;await router.push(`/device-types/${actual.type.id}`)
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(!writeAccepted&&cause instanceof ApiError&&[401,403].includes(cause.status)&&!cause.outcomeUnknown){deny(cause);return}
  if(!writeAccepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,404,413,422,429].includes(cause.status)){unknown.value=false;intent.value=undefined}
  error.value=errorMessage(cause)
 }}finally{if(current(s))busy.value=false}
}
async function recover(){
 const original=intent.value;if(!original||!unknown.value||!manager.value||busy.value)return
 const s=capture();controller=new AbortController();busy.value=true;error.value=''
 try{
  const result=await props.transport.recover(original,controller.signal)
  if(!current(s)||!manager.value)return
  if(result.deleted){unknown.value=false;deleted.value=true;error.value='原请求已创建设备类型，但该类型现已删除；本页不会再次创建。';return}
  const actual=await props.transport.read(original.project,result.deviceTypeId,controller.signal)
  if(!current(s)||!manager.value)return
  unknown.value=false;intent.value=undefined;busy.value=false;await router.push(`/device-types/${actual.type.id}`)
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&[401,403].includes(cause.status)&&!cause.outcomeUnknown){deny(cause);return}
  error.value=cause instanceof ApiError&&cause.status===404?'尚未读到原创建结果，仍保持未知；不会再次提交。':errorMessage(cause)
 }}finally{if(current(s))busy.value=false}
}
watch([()=>projectId.value,()=>session.user?.accountId,()=>member.value],reset,{flush:'sync'})
const dispose=onIdentityChange(reset)
onBeforeRouteLeave(()=>!locked.value);onBeforeRouteUpdate(()=>!locked.value)
function beforeUnload(event:BeforeUnloadEvent){if(locked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload)
onScopeDispose(()=>{alive=false;reset();dispose();window.removeEventListener('beforeunload',beforeUnload)})
</script>
<template><main class="tl-page type-create"><PageHeader title="创建设备类型" back :back-disabled="locked" @back="cancel"/>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/>
 <AsyncState :forbidden="!readable">
  <div class="type-create-modes"><div class="is-current"><strong>创建自定义类型</strong><p>从零起步，根据需求添加功能定义、规则、任务等，适用于个性化硬件设备。</p></div><div><DeviceTypePrivateTemplates mode="import" :disabled="busy||unknown||deleted||productImportLocked" @locked="templatesLocked=$event" @created="router.push(`/device-types/${$event}`)"/></div><div><DeviceTypeProductImport :disabled="busy||unknown||deleted||templatesLocked" @locked="productImportLocked=$event" @created="router.push(`/device-types/${$event}`)"/></div></div>
  <p v-if="!writable" role="status">当前账号或项目状态不允许创建设备类型。</p>
  <el-alert v-if="unknown" title="创建结果尚未确认，原键和草稿已保留；只核对原请求，不会再次提交。" type="warning" :closable="false"/>
  <el-button v-if="unknown" :loading="busy" :disabled="!manager||busy" @click="recover">核对原创建请求</el-button>
  <el-form label-position="top" class="type-create-form" :disabled="!writable||busy||unknown||deleted||templatesLocked||productImportLocked" @submit.prevent="submit">
   <el-form-item label="类型名称">
    <el-input v-model="form.name" class="type-create-name" aria-label="类型名称" maxlength="128">
     <template #prepend><ReferenceIcon glyph="󰆧"/></template>
    </el-input>
   </el-form-item>
   <el-form-item label="设备接入类型"><el-radio-group :model-value="form.deviceKind" aria-label="设备接入类型" @update:model-value="changeKind(String($event))"><el-radio v-for="[value,label] in typeKinds" :key="value" :value="value">{{label}}</el-radio></el-radio-group></el-form-item>
   <el-form-item label="设备通信方式"><el-select v-model="form.networkType" aria-label="设备通信方式" placeholder="请选择"><el-option v-for="[value,label] in networks" :key="value" :value="value" :label="label"/></el-select></el-form-item>
   <h2>设置接入协议</h2><p>ThingsLink 为不同设备提供标准接入协议，并支持已有专用协议的转换。</p>
   <el-form-item :label="form.deviceKind==='GATEWAY'?'网关接入协议':'设备接入协议'"><el-select v-model="form.payloadProtocol" aria-label="设备接入协议"><el-option v-for="[value,label] in typeProtocols(form.deviceKind)" :key="value" :value="value" :label="label"/></el-select></el-form-item>
   <el-alert v-if="['OTHER','CUSTOM_GATEWAY'].includes(form.payloadProtocol)" type="info" :closable="false" title="此协议尚无报文适配器；可保存类型资料和定义，暂不能使用标准报文上下行。"/>
   <h2>设置自定义数据流</h2><p>创建类型时添加一条默认数据流，可选择 HEX、文本或 JSON 格式。创建后可在「自定义数据流」查看配置，设备连接后按发布配置收发数据。</p>
   <el-form-item label="创建默认自定义数据流"><el-switch v-model="form.defaultStream" aria-label="创建默认自定义数据流"/></el-form-item>
   <template v-if="form.defaultStream"><el-form-item label="默认数据流消息格式"><el-select v-model="form.initialFormat" aria-label="默认数据流消息格式" placeholder="请选择消息格式"><el-option value="HEX" label="HEX 原始字节展示"/><el-option value="TEXT" label="Plaintext 文本消息"/><el-option value="JSON" label="JSON 格式消息"/></el-select></el-form-item><el-form-item label="设为默认 TCP 目标配置"><el-switch v-model="form.initialTcpTarget" aria-label="设为默认TCP目标配置"/></el-form-item><p>选择后将此数据流设为 TCP 接入的默认目标；当前仅保存设置。</p></template>
   <h2>更多设备类型信息</h2><el-form-item label="描述"><el-input v-model="form.description" aria-label="类型描述" type="textarea" :rows="4" maxlength="500"/></el-form-item>
   <el-form-item label="标签"><div class="type-tag-rows"><div v-for="(row,index) in form.tags" :key="index" class="type-tag-row"><el-input v-model="row.key" :aria-label="`标签名称${index+1}`" placeholder="标签名称"/><el-input v-model="row.value" :aria-label="`标签值${index+1}`" placeholder="标签值"/><el-button @click="form.tags.splice(index,1)">移除</el-button></div><el-button :disabled="form.tags.length>=20" @click="form.tags.push({key:'',value:''})">添加标签</el-button></div></el-form-item>
  </el-form>
  <el-button type="primary" :loading="busy" :disabled="!writable||busy||unknown||deleted||templatesLocked||productImportLocked" @click="submit">创建</el-button><el-button :disabled="locked" @click="cancel">取消</el-button>
 </AsyncState></main></template>
<style scoped>
.type-create { padding: 20px 30px 50px; }
.type-create-modes { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; max-width: 920px; margin-bottom: 34px; }
.type-create-modes > div { min-height: 150px; border: 1px solid var(--tl-border); border-radius: 4px; padding: 20px; }
.type-create-modes .is-current { border-color: var(--tl-primary); }
.type-create-modes strong, .type-create-modes :deep(.private-templates > header > h3), .type-create-modes :deep(.product-import > h3) {
 display: block;
 margin: 0 0 6px;
 color: var(--tl-title);
 font-size: 16px;
 font-weight: 500;
 line-height: 24px;
}
.type-create-modes :deep(.private-templates) { display: grid; justify-items: start; margin-top: 0; }
.type-create-modes :deep(.private-templates > header) { display: contents; }
.type-create-modes :deep(.private-templates > header > .el-button) { grid-row: 3; }
.type-create-modes :deep(.private-templates > p) { grid-row: 2; }
.type-create-modes p, .type-create-modes :deep(.private-templates > p), .type-create-modes :deep(.product-import > p) {
 margin: 0 0 8px;
 font-size: 13px;
 line-height: 18px;
 color: var(--tl-muted);
}
.type-create-modes :deep(.private-templates > p), .type-create-modes :deep(.product-import > p) { min-height: 36px; }
.type-create-modes :deep(.private-templates > header > .el-button), .type-create-modes :deep(.product-import > .el-button) {
 height: 32px;
 padding: 8px 12px;
 font-size: 12px;
}
p { font-size: 13px; line-height: 22px; color: var(--tl-muted); }
.type-create-form { max-width: 700px; }
.type-create-form h2 { margin: 28px 0 12px; font-size: 20px; line-height: 28px; font-weight: 400; color: var(--tl-title); }
.type-create-form :deep(.el-form-item__content > :is(.el-input,.el-select,.el-textarea)) { width: min(350px,100%); }
.type-create-name :deep(.el-input-group__prepend) { padding: 0 10px; background: var(--el-fill-color-blank); color: var(--tl-text); }
.type-create-name .reference-icon { font-size: 21px; }
.type-tag-rows { width: 100%; }
.type-tag-row { display: flex; gap: 10px; margin-bottom: 12px; }
.type-tag-row :deep(.el-input) { min-width: 0; }
@media(max-width:760px) {
 .type-create { padding: 20px 15px; }
 .type-create-modes { grid-template-columns: minmax(0,1fr); }
 .type-create-modes > div { min-height: auto; }
 .type-tag-row { flex-wrap: wrap; }
 .type-tag-row :deep(.el-input) { flex: 1 1 40%; }
}
</style>
