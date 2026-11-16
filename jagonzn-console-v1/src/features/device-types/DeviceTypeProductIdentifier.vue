<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {typeDeviceUuid} from './type-devices-api'
import {prepareProductIdentifier,productIdentifierTransport,type ProductIdentifier,type ProductIdentifierIntent,type ProductIdentifierTransport} from './product-identifier-api'
const props=withDefaults(defineProps<{typeId:string;deviceKind:string;disabled?:boolean;compact?:boolean;transport?:ProductIdentifierTransport}>(),{disabled:false,compact:false,transport:()=>productIdentifierTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const denied=ref(false),readable=computed(()=>!denied.value&&session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const writable=computed(()=>readable.value&&can('device:update')&&props.deviceKind!=='SUB_DEVICE'&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const value=shallowRef<ProductIdentifier>(),intent=shallowRef<ProductIdentifierIntent>(),observed=shallowRef<ProductIdentifier>(),shown=ref(false),busy=ref(false),unknown=ref(false),draft=ref(false),alias=ref(''),error=ref(''),notice=ref('')
let generation=0,alive=true,controller:AbortController|undefined
const locked=computed(()=>shown.value||busy.value||unknown.value)
function clear(){generation++;controller?.abort();value.value=undefined;intent.value=undefined;observed.value=undefined;shown.value=false;busy.value=false;unknown.value=false;error.value='';notice.value=''}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:props.typeId,account:session.user?.accountId}}
function current(s:ReturnType<typeof capture>){return alive&&readable.value&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.type===props.typeId&&s.account===session.user?.accountId}
async function load(review=false){
 if(!readable.value||busy.value||unknown.value&&!review)return
 const s=capture();busy.value=true;error.value='';controller=new AbortController()
 try{const actual=await props.transport.read(s.project,s.type,controller.signal);if(!current(s))return;if(review)observed.value=actual;else value.value=actual}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){clear();denied.value=true}else error.value=errorMessage(cause)}}
 finally{if(current(s))busy.value=false}
}
function open(){if(!writable.value||props.disabled||busy.value||unknown.value||!value.value)return;draft.value=value.value.enabled;alias.value=value.value.productIdentifier||'';error.value='';notice.value='';shown.value=true}
function cancel(){if(!busy.value)shown.value=false}
async function save(){
 if((!shown.value&&!props.compact)||!writable.value||props.disabled||busy.value||unknown.value||!value.value)return
 let chosen:ProductIdentifierIntent
 try{chosen=prepareProductIdentifier(projectId.value,props.typeId,value.value,draft.value,alias.value)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=chosen;unknown.value=true;shown.value=false;busy.value=true;error.value='';observed.value=undefined
 const s=capture();controller=new AbortController();let accepted=false
 try{
  const returned=await props.transport.change(chosen,controller.signal);accepted=true;if(!current(s))return
  const expected=BigInt(chosen.body.revision)+(value.value.enabled===chosen.body.enabled&&value.value.productIdentifier===chosen.body.productIdentifier?0n:1n)
  if(returned.deviceTypeId!==chosen.typeId||returned.revision!==String(expected)||returned.enabled!==chosen.body.enabled||returned.productIdentifier!==chosen.body.productIdentifier)throw new Error('保存回执与原策略不符，请读取当前配置核对')
  const actual=await props.transport.read(chosen.project,chosen.typeId,controller.signal);if(!current(s))return
  if(actual.revision!==returned.revision||actual.enabled!==returned.enabled||actual.productIdentifier!==returned.productIdentifier)throw new Error('策略已变化，请读取当前配置核对')
  value.value=actual;unknown.value=false;intent.value=undefined;notice.value='产品识别码已保存；注册仍须原产品密钥和自动创建许可。'
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,413,422,429].includes(cause.status)&&cause.code!==10014){unknown.value=false;intent.value=undefined;value.value=undefined;error.value='本次保存被拒绝，请重新读取策略后编辑。'}
  else error.value='原保存结果尚未核对；只读取当前事实，不会再次提交。'
 }}finally{if(current(s)){busy.value=false;if(notice.value)emit('changed')}}
}
function finish(){if(!unknown.value||busy.value||!observed.value)return;value.value=observed.value;observed.value=undefined;unknown.value=false;intent.value=undefined;error.value='';notice.value='已采用当前配置；原保存结果仍未确认，未重新提交。'}
watch(value,current=>{if(props.compact&&current){draft.value=current.enabled;alias.value=current.productIdentifier||''}},{flush:'sync'})
function reset(){clear();denied.value=false;if(readable.value)void load()}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,()=>session.ready,()=>session.transitioning,()=>can('device:read'),()=>roles.includes(session.user?.projectRole||''),()=>roles.includes(currentProject.value?.myRole||'')],reset,{immediate:true,flush:'sync'})
watch(writable,allowed=>{if(!allowed)shown.value=false},{flush:'sync'})
watch(locked,lock=>emit('locked',lock),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><section class="product-identifier"><header v-if="!compact"><h3>产品识别码（PK）</h3><el-button v-if="writable" size="small" :disabled="disabled||locked||!value" @click="open">设置产品识别码</el-button></header><div v-if="compact&&value"><el-form label-position="top"><el-form-item label="启用产品识别码（PK）"><el-switch v-model="draft" aria-label="启用产品识别码" :disabled="disabled||!writable||locked"/></el-form-item><el-form-item v-if="draft" label="产品识别码"><el-input v-model="alias" aria-label="产品识别码" maxlength="128" :disabled="disabled||!writable||locked"/></el-form-item></el-form><el-button v-if="writable" size="small" type="primary" :disabled="disabled||locked" @click="save">保存产品识别码</el-button></div>
 <p v-if="!compact">公开产品别名用于选择已发布类型，不是产品凭据、类型ID或设备添加码。设备仍须提交原产品密钥，且类型允许自动创建；当前仅用于直连设备或网关的 HTTPS 注册。</p>
 <p v-if="!readable" role="status">当前账号没有读取权限。</p><template v-else><p v-if="value&&!compact">当前配置：{{value.enabled?'已启用':'未启用'}} · {{value.productIdentifier||'尚未设置'}}<span v-if="!compact" class="tl-muted"> · 版本 {{value.revision}}</span></p><p v-if="deviceKind==='SUB_DEVICE'">子设备经网关的产品识别码注册尚未接入。</p>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <template v-if="unknown"><p>原请求键：{{intent?.key}}。当前配置不能证明原请求结果。</p><p v-if="observed">当前读取：{{observed.enabled?'启用':'关闭'}} · {{observed.productIdentifier||'未设置'}}，版本 {{observed.revision}}</p><el-button :loading="busy" @click="load(true)">读取当前产品识别码核对</el-button><el-button :disabled="busy||!observed" @click="finish">采用当前配置并结束核对</el-button></template>
 <el-button v-else-if="!compact||error" size="small" :loading="busy" :disabled="busy||shown" @click="load()">刷新产品识别码</el-button></template>
 <el-dialog :model-value="shown&&readable&&writable" title="配置产品识别码" width="min(580px,94vw)" :close-on-click-modal="false" @close="cancel"><el-form label-position="top"><el-form-item label="启用产品识别码"><el-switch v-model="draft" aria-label="启用产品识别码"/></el-form-item><el-form-item label="产品识别码"><el-input v-model="alias" aria-label="产品识别码" maxlength="128" placeholder="例如 brand.sensor-v1"/></el-form-item></el-form><p>至少两段点分小写字母、数字或连字符，总长最多128；同项目当前类型不可重复。关闭可保留标识，也可清空后保存。此设置不生成、轮换或显示秘密。</p><template #footer><el-button @click="cancel">取消</el-button><el-button type="primary" :disabled="disabled||!writable||busy" @click="save">保存产品识别码</el-button></template></el-dialog>
 </section></template>
<style scoped>.product-identifier header{display:flex;align-items:center;justify-content:space-between;gap:12px}.product-identifier p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}</style>
