<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,api,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {formatTime} from '@/core/time'
import {typeDeviceUuid} from './type-devices-api'
import {readProductDefinitionPackageDetails} from './product-definition-import-api'
import DeviceTypePortablePanelPreview from './DeviceTypePortablePanelPreview.vue'
import {verifyUserAddPromptImage} from './user-add-settings-api'
import {propertyValueText} from '../devices/property-decoder'
import {productTransport,prepareProductImport,productImportMatches,type ProductTransport,type SharedTypeProduct,type ProductImportIntent,type ProductImportReceipt} from './public-product-api'
const props=withDefaults(defineProps<{disabled?:boolean;transport?:ProductTransport}>(),{disabled:false,transport:()=>productTransport})
const emit=defineEmits<{locked:[value:boolean];created:[id:string]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const denied=ref(false),member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const readable=computed(()=>member.value&&!denied.value),writable=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const shown=ref(false),busy=ref(false),unknown=ref(false),id=ref(''),name=ref(''),error=ref(''),notice=ref(''),source=shallowRef<SharedTypeProduct>(),intent=shallowRef<ProductImportIntent>(),receipt=shallowRef<ProductImportReceipt>()
const details=shallowRef<ReturnType<typeof readProductDefinitionPackageDetails>>()
type ProductEnrollment=Schema<'DeviceTypeProductEnrollmentResponse'>
const enrollmentIdentifier=ref(''),enrollment=shallowRef<ProductEnrollment>(),enrollmentNotice=ref(''),enrollmentUncertain=ref(false)
const locked=computed(()=>shown.value||busy.value||unknown.value)
let generation=0,alive=true,controller:AbortController|undefined
function clear(){generation++;controller?.abort();shown.value=false;busy.value=false;unknown.value=false;source.value=undefined;details.value=undefined;intent.value=undefined;receipt.value=undefined;id.value='';name.value='';error.value='';notice.value='';enrollmentIdentifier.value='';enrollment.value=undefined;enrollmentNotice.value='';enrollmentUncertain.value=false}
function reset(){clear();denied.value=false}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId}}
function current(s:ReturnType<typeof capture>){return alive&&readable.value&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.account===session.user?.accountId}
function fail(cause:unknown,s:ReturnType<typeof capture>){if(!current(s)||cause instanceof IdentityChanged)return;if(cause instanceof ApiError&&[401,403].includes(cause.status)&&!cause.outcomeUnknown){clear();denied.value=true}else error.value=errorMessage(cause)}
function open(){if(!readable.value||props.disabled||locked.value)return;clear();shown.value=true}
function close(){if(busy.value)return;if(unknown.value)shown.value=false;else clear()}
function beforeClose(done:()=>void){if(!busy.value){close();done()}}
async function lookup(){if(!readable.value||props.disabled||busy.value||unknown.value)return;const known=id.value.trim().toLowerCase();if(!typeDeviceUuid.test(known)){error.value='请输入分享者提供的有效产品ID';return}const s=capture();busy.value=true;source.value=undefined;details.value=undefined;error.value='';controller=new AbortController();try{const result=await props.transport.lookup(s.project,known,controller.signal),packet=readProductDefinitionPackageDetails(result.packageJson,result.sourceMode);await verifyUserAddPromptImage(packet.thingsX?.userAdd.promptImage??null);if(current(s)){source.value=result;details.value=packet}}catch(cause){fail(cause,s)}finally{if(current(s))busy.value=false}}
function complete(value:ProductImportReceipt){receipt.value=value;busy.value=false;unknown.value=false;intent.value=undefined;shown.value=false;notice.value=value.deleted?'原请求已创建类型，但该类型现已删除；不会再次创建。':'已按选定发布版本创建新草稿类型。';if(!value.deleted)emit('created',value.deviceTypeId)}
async function create(){if(!writable.value||props.disabled||busy.value||unknown.value||!source.value)return;let original:ProductImportIntent;try{original=prepareProductImport(projectId.value,source.value,name.value)}catch(cause){error.value=errorMessage(cause);return}intent.value=original;unknown.value=true;busy.value=true;error.value='';const s=capture();controller=new AbortController();let acknowledged=false
 try{const returned=await props.transport.create(original,controller.signal);acknowledged=true;if(!current(s))return;if(!productImportMatches(returned,original))throw new Error('创建回执不符合原固定版本');const actual=await props.transport.imported(original,controller.signal);if(!current(s))return;if(actual.deviceTypeId!==returned.deviceTypeId||!productImportMatches(actual,original))throw new Error('原创建回执不一致');complete(actual)}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(!acknowledged&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&cause.status>=400&&cause.status<500){unknown.value=false;intent.value=undefined;source.value=undefined;details.value=undefined;if([401,403].includes(cause.status)){fail(cause,s);return}error.value=errorMessage(cause)+' 请重新按产品 ID 读取当前版本后核对。'}else error.value=errorMessage(cause)}}finally{if(current(s))busy.value=false}}
async function recover(){const original=intent.value;if(!original||!unknown.value||busy.value||!readable.value)return;const s=capture();busy.value=true;error.value='';controller=new AbortController();try{const actual=await props.transport.imported(original,controller.signal);if(current(s)){if(!productImportMatches(actual,original))throw new Error('原创建回执不符');complete(actual)}}catch(cause){if(current(s)&&cause instanceof ApiError&&cause.status===404)error.value='暂未读到本人原创建回执，仍保持未知；不会再次创建。';else fail(cause,s)}finally{if(current(s))busy.value=false}}
function finish(){if(!unknown.value||busy.value)return;clear();notice.value='已结束核对；原创建仍未确认，未标记成功。'}
async function enrollmentAction(method:'get'|'put'|'delete'){
 if(!writable.value||props.disabled||busy.value||unknown.value||method!=='get'&&enrollmentUncertain.value)return
 const code=enrollmentIdentifier.value, fixed=source.value
 if(code.length>128||!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(code)){enrollmentNotice.value='请输入设备使用的点分产品识别码，例如 brand.sensor-v1。';return}
 if(method==='put'&&!fixed||method==='delete'&&!enrollment.value?.enabled)return
 const s=capture(),path=`/api/v1/projects/${s.project}/type-product-enrollments/${code}` as const
 const signal=(controller=new AbortController()).signal
 busy.value=true;enrollmentNotice.value=''
 let accepted=false
 try{
  if(method==='put'&&fixed){
   const body:Schema<'AuthorizeDeviceTypeProductEnrollmentRequest'>={productId:fixed.productId,versionId:fixed.versionId,packageDigest:fixed.packageDigest}
   await api(path,{method,body,signal});accepted=true
  }
  if(method==='delete'){await api(path,{method,signal});accepted=true}
  const actual=await api<ProductEnrollment>(path,{signal})
  if(!current(s))return
  if(actual.productIdentifier!==code||typeof actual.enabled!=='boolean'||!typeDeviceUuid.test(actual.productId)||!typeDeviceUuid.test(actual.versionId)
   ||!/^[0-9a-f]{64}$/.test(actual.packageDigest)||actual.deviceTypeId!==null&&!typeDeviceUuid.test(actual.deviceTypeId))throw new Error('授权回执不完整')
  if(method==='put'&&(!actual.enabled||actual.productId!==fixed?.productId||actual.versionId!==fixed?.versionId||actual.packageDigest!==fixed?.packageDigest)
   ||method==='delete'&&actual.enabled)throw new Error('授权状态已变化，请核对当前状态')
  enrollment.value=actual;enrollmentUncertain.value=false
  enrollmentNotice.value=method==='put'?'已授权固定版本自动建型。':method==='delete'?'已撤销自动建型授权。':''
 }catch(cause){
  if(!current(s))return
  if(method==='get'&&cause instanceof ApiError&&cause.status===404){
   enrollment.value=undefined;enrollmentUncertain.value=false;enrollmentNotice.value='当前项目没有该识别码的自动建型授权。'
  }else if(method!=='get'&&(accepted||!(cause instanceof ApiError)||cause.outcomeUnknown||cause.status>=500)){
   enrollmentUncertain.value=true;enrollmentNotice.value='原操作结果尚未确认，请读取当前授权。'
  }else enrollmentNotice.value=errorMessage(cause)
 }finally{if(current(s))busy.value=false}
}
watch(enrollmentIdentifier,()=>{if(!busy.value&&!enrollmentUncertain.value){enrollment.value=undefined;enrollmentNotice.value=''}})
watch(id,()=>{if(!busy.value&&!unknown.value){source.value=undefined;details.value=undefined;error.value=''}})
watch([()=>projectId.value,()=>session.user?.accountId,()=>member.value],reset,{flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><section class="product-import"><h3>从产品库快速导入</h3><p>输入分享者提供的产品 ID，查看当前发布版本后创建设备类型草稿。</p><el-button :disabled="!readable||disabled||locked" @click="open">输入产品ID</el-button>
 <el-alert v-if="notice" :title="notice" type="info" :closable="false"/><p v-if="receipt">原新增类型：{{receipt.deviceTypeId}} · 发布版本：{{receipt.productVersionId}}</p><el-alert v-if="unknown&&!shown" title="存在尚未确认的原创建操作。" type="warning" :closable="false"><el-button @click="shown=true">查看产品导入核对</el-button></el-alert>
 <el-dialog :model-value="shown&&readable" title="通过产品ID创建新类型" width="min(850px,96vw)" :close-on-click-modal="false" :show-close="!busy" :before-close="beforeClose"><el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="unknown"><el-alert title="原创建结果未知，只按本人原键读取回执，不会重发或自动换新版本。" type="warning" :closable="false"/><p>产品ID：{{intent?.body.productId}} · 发布版本：{{intent?.body.productVersionId}}</p><p>目标名称：{{intent?.body.name}} · 原键：{{intent?.key}}</p><el-button :loading="busy" @click="recover">读取原产品导入回执</el-button><el-button :disabled="busy" @click="finish">结束本次产品导入核对</el-button></template>
  <template v-else><el-form label-position="top" :disabled="busy||disabled"><el-form-item label="分享者提供的产品ID"><el-input v-model="id" aria-label="分享产品ID" maxlength="36"/></el-form-item></el-form><el-button :loading="busy" :disabled="busy||disabled" @click="lookup">读取当前发布版本</el-button>
   <section v-if="source"><h4>{{source.name}}</h4><p>分享署名（自述）：{{source.publisherLabel}}</p><p>固定发布第 {{source.sequence}} 版 · {{formatTime(source.publishedAt)}}</p><p>发布版本ID：{{source.versionId}}</p><p>完整包摘要：{{source.packageDigest}}</p><details><summary>查看本次完整分享资料</summary><pre aria-label="产品固定版本完整资料" tabindex="0">{{source.packageJson}}</pre></details><section v-if="details" class="product-import-scope"><h4>本次新类型的实际复制范围</h4><p>基本资料；属性 {{details.choices.properties.length}} 项、事件 {{details.choices.events.length}} 项、命令 {{details.choices.commands.length}} 项。</p>
    <p v-if="details.extensions">扩展信息：{{details.extensions.fields.length}} 个自定义字段及 4 类特殊类型设置。</p>
    <template v-if="details.data"><p v-if="!details.data.configured">DATA：来源未配置发布，目标保持未配置。</p><p v-else-if="!details.data.streams.length">DATA：已配置空集，保留明确的空发布（0 条数据流）。</p><template v-else><p>DATA：{{details.data.streams.length}} 条数据流；TCP 目标：{{details.data.tcpStreamIdentifier||'未设置'}}。</p><ul><li v-for="stream in details.data.streams" :key="stream.identifier">{{stream.name}}（{{stream.identifier}}，{{stream.format}}，{{stream.disabled?'停用':'启用'}}）<span v-if="stream.mqttTopics">；发布 Topic：{{stream.mqttTopics.publishTopic}}；订阅 Topic：{{stream.mqttTopics.subscribeTopic}}</span></li></ul></template></template>
    <p v-if="details.thingsX">用户添加及 XS/Admin 属性展示配置：3 组类型设置，XS {{details.thingsX.thingsXs.propertyKeys.length}} 项、Admin {{details.thingsX.thingsAdmin.propertyKeys.length}} 项，保留各自的选集顺序及关闭态。{{details.panel?'':'不包含应用面板。'}}不包含 App 实例、实际 App 运行或付款资料。</p>
    <DeviceTypePortablePanelPreview v-if="details.panel" :panel="details.panel"/>
    <p v-if="details.tasks&&!details.generalTasks">当前类型直接关联的手动任务：{{details.tasks.tasks.length}} 项。导入后目标为 PAUSED（暂停），须发布模型并独立启用；不复制任务执行历史。</p>
    <p v-if="details.dailyTasks">固定每日任务：{{details.dailyTasks.tasks.length}} 项。保留时间与时区方式，导入后暂停。</p>
    <section v-if="details.generalTasks"><p>当前类型直接关联的任务：{{details.generalTasks.tasks.length}} 项。导入后暂停；已过期或已消费的一次计划须重新设置，不复制执行历史。</p><section v-for="(task,index) in details.generalTasks.tasks" :key="index"><h4>{{task.name}}</h4><p>源状态：{{task.sourceState}}；动作：{{task.actionType}}<span v-if="task.commandKey">；命令：{{task.commandKey}}</span>。</p><p>标签</p><pre>{{propertyValueText(task.tags)}}</pre><p>计划</p><pre>{{propertyValueText(task.plan)}}</pre><p>动作内容</p><pre>{{propertyValueText(task.input)}}</pre></section></section>
    <p v-if="details.rules">类型直接关联的属性前处理规则：{{details.rules.rules.length}} 项，仅属性上报／下发前处理。导入为 PAUSED（暂停）首版本，须独立启用，不自动发布模型或执行。同项目同名规则会明确拒绝整笔创建，不会自动改名。</p>
    <p>仅复制上述实际选中的类型声明，未列出的伴随域不在本次包内。设备、凭据、实际设备模型绑定及运行事实不会复制。新类型保持草稿；分享者更新或撤回后，旧预览会被拒绝。</p></section><el-form label-position="top" :disabled="busy||disabled||!writable"><el-form-item label="新类型名称"><el-input v-model="name" aria-label="产品导入新类型名称" maxlength="128"/></el-form-item></el-form></section>
   <section v-if="writable" class="product-enrollment">
    <h4>授权产品自动建型</h4>
    <p>读取并确认发布版本后，将它与设备使用的产品识别码绑定。首台设备认证通过时创建类型，后续设备复用。含规则、任务或设备面板的版本可手动导入。</p>
    <el-form label-position="top"><el-form-item label="产品识别码"><el-input v-model="enrollmentIdentifier" aria-label="自动建型产品识别码" maxlength="128" :disabled="busy||enrollmentUncertain" placeholder="例如 brand.sensor-v1"/></el-form-item></el-form>
    <el-button size="small" :disabled="busy||disabled||!enrollmentIdentifier" @click="enrollmentAction('get')">读取授权</el-button>
    <el-button size="small" :disabled="busy||disabled||!source||!!details?.tasks||!!details?.rules||!!details?.panel||!enrollmentIdentifier||enrollmentUncertain" @click="enrollmentAction('put')">授权当前固定版本</el-button>
    <el-button v-if="enrollment?.enabled" size="small" :disabled="busy||disabled||enrollmentUncertain" @click="enrollmentAction('delete')">撤销授权</el-button>
    <p v-if="enrollment">状态：{{enrollment.enabled?'已授权':'已撤销'}} · 固定版本：{{enrollment.versionId}} · 设备类型：{{enrollment.deviceTypeId||'待首启创建'}}</p>
    <p v-if="enrollmentNotice" role="status">{{enrollmentNotice}}</p>
   </section>
   <p v-if="!writable">当前账号或项目只允许查看，不能创建类型。</p>
  </template><template #footer><el-button :disabled="busy" @click="close">{{unknown?'关闭核对':'取消'}}</el-button><el-button v-if="!unknown&&source&&writable" type="primary" :loading="busy" :disabled="busy||disabled" @click="create">确认按此发布版本创建</el-button></template>
 </el-dialog></section></template>
<style scoped>.product-import p{font-size:13px;line-height:1.7;color:var(--tl-muted);overflow-wrap:anywhere}.product-import h3{font-weight:500;font-size:18px}.product-import pre{max-height:330px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--tl-bg);padding:12px;font-size:12px;line-height:1.7}.product-import :deep(.el-alert){margin:12px 0}</style>
