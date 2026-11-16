<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {InfoFilled} from '@element-plus/icons-vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {typeDeviceUuid} from './type-devices-api'
import {importSections} from './definition-import-api'
import {readProductDefinitionPackageDetails} from './product-definition-import-api'
import DeviceTypePortablePanelPreview from './DeviceTypePortablePanelPreview.vue'
import {currentProductPublicationTransport,prepareCurrentProductCapture,prepareCurrentProductPublish,decodeCurrentProductCapture,decodeCurrentProductPublication,sameCurrentProductCapture,sameCurrentProductPublication,type CurrentProductPublicationTransport,type CurrentProductCapture,type CurrentProductPublication,type CurrentProductCaptureIntent,type CurrentProductPublishIntent} from './current-product-publication-api'
import type {OwnedProduct} from './public-product-api'
import {verifyUserAddPromptImage,userAddPromptImageSource} from './user-add-settings-api'
import {propertyValueText} from '../devices/property-decoder'
const props=withDefaults(defineProps<{typeId:string;disabled?:boolean;transport?:CurrentProductPublicationTransport}>(),{disabled:false,transport:()=>currentProductPublicationTransport})
const emit=defineEmits<{locked:[value:boolean];published:[];close:[]}>()
const roles=['OWNER','ADMIN','OPERATOR','VIEWER'],applicationAudiences=[['thingsXs','XS'],['thingsAdmin','Admin']] as const
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&can('device:read')&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const busy=ref(false),unknown=ref<'capture'|'publish'|null>(null),loaded=ref(false),label=ref(''),confirmed=ref(false),error=ref(''),notice=ref(''),finished=ref(false),attemptedRead=ref(false)
const includeExtensions=ref(false),includeData=ref(false),includeApplication=ref(false),includeTasks=ref(false),includeRules=ref(false)
const scopeOptions=[
 {
  value:includeExtensions,
  label:'发布扩展信息定义',
  name:'同时分享扩展信息',
  description:'包含自定义扩展字段，以及地理坐标、平面坐标、摄像头和 ICCID 的基础设置。',
 },
 {
  value:includeRules,
  label:'发布规则',
  name:'同时分享类型直接关联的属性前处理规则',
  description:'包含设备类型下的属性上报和下发前处理规则，包括已暂停的规则。',
 },
 {
  value:includeTasks,
  label:'发布任务',
  name:'同时分享当前类型任务定义',
  description:'包含设备类型下的任务、计划与标签，包括已暂停的任务。',
 },
 {
  value:includeData,
  label:'发布自定义数据流',
  name:'同时分享DATA声明',
  description:'包含设备类型下已发布的数据流、停用状态、MQTT Topic 和 TCP 绑定设置。',
 },
 {
  value:includeApplication,
  label:'发布 ThingsX App 配置',
  name:'同时分享设备面板和用户应用配置',
  description:'包含设备面板草稿、用户添加设备设置，以及 XS 和 Admin 的属性展示配置。',
 },
]

const available=ref<boolean>(),previous=shallowRef<OwnedProduct|null>(null)
const preview=shallowRef<CurrentProductCapture>(),published=shallowRef<CurrentProductPublication>(),captureIntent=shallowRef<CurrentProductCaptureIntent>(),publishIntent=shallowRef<CurrentProductPublishIntent>()
const packageDetails=computed(()=>preview.value?readProductDefinitionPackageDetails(preview.value.packageJson,'CURRENT_TYPE_CAPTURE'):undefined),choices=computed(()=>packageDetails.value?.choices),extensions=computed(()=>packageDetails.value?.extensions),extensionSettings=computed(()=>packageDetails.value?.extensionSettings),data=computed(()=>packageDetails.value?.data),application=computed(()=>packageDetails.value?.thingsX),tasks=computed(()=>packageDetails.value?.tasks),dailyTasks=computed(()=>packageDetails.value?.dailyTasks),generalTasks=computed(()=>packageDetails.value?.generalTasks),rules=computed(()=>packageDetails.value?.rules),actionRules=computed(()=>packageDetails.value?.actionRules),locked=computed(()=>busy.value||!!unknown.value)
let generation=0,alive=true,controller:AbortController|undefined,captureAck:CurrentProductCapture|undefined,publishAck:CurrentProductPublication|undefined
function snapshot(){return{generation,project:projectId.value,type:props.typeId,account:session.user?.accountId,epoch:identityEpoch()}}
function current(s:ReturnType<typeof snapshot>){return alive&&readable.value&&s.generation===generation&&s.project===projectId.value&&s.type===props.typeId&&s.account===session.user?.accountId&&s.epoch===identityEpoch()}
function reset(){generation++;controller?.abort();busy.value=false;unknown.value=null;available.value=undefined;loaded.value=false;previous.value=null;preview.value=undefined;published.value=undefined;captureIntent.value=undefined;publishIntent.value=undefined;captureAck=undefined;publishAck=undefined;label.value='';confirmed.value=false;error.value='';notice.value='';finished.value=false;attemptedRead.value=false;includeExtensions.value=false;includeData.value=false;includeApplication.value=false;includeTasks.value=false;includeRules.value=false}
function definitive(cause:unknown){return cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,401,403,404,409,413,422,429].includes(cause.status)}
async function load(){if(!readable.value||busy.value||unknown.value||preview.value||finished.value)return;const s=snapshot();controller=new AbortController();busy.value=true;loaded.value=false;error.value='';try{const result=await props.transport.owned(s.project,controller.signal);if(!current(s))return;const matches=result.items.filter(row=>row.sourceDeviceTypeId===s.type);if(matches.length>1)throw new Error('当前类型有重复产品来源，请重新核对');previous.value=matches[0]?Object.freeze({...matches[0],product:Object.freeze({...matches[0].product})}):null;available.value=result.available;loaded.value=true}catch(cause){if(current(s)&&!(cause instanceof IdentityChanged))error.value=errorMessage(cause)}finally{if(current(s))busy.value=false}}
async function acceptCapture(value:CurrentProductCapture,original:CurrentProductCaptureIntent,s:ReturnType<typeof snapshot>,write=false){const row=decodeCurrentProductCapture(value,original);await verifyUserAddPromptImage(readProductDefinitionPackageDetails(row.packageJson,'CURRENT_TYPE_CAPTURE').thingsX?.userAdd.promptImage??null);if(!current(s)||write&&!writable.value)return;if(captureAck&&!sameCurrentProductCapture(row,captureAck))throw new Error('原捕获回读与保存回执不符');preview.value=row;unknown.value=null;error.value='';notice.value=row.scopes.rules?'已选资料固定预览已生成；类型属性前处理规则导入为暂停首版本，须独立启用。':row.scopes.tasks?'已选资料固定预览已生成；任务导入后暂停，须发布模型并独立启用。':row.scopes.thingsX?'已选资料固定预览已生成，用户添加及 XS/Admin 属性展示配置仅为类型配置子集。':row.scopes.data?'所选功能与 DATA 声明固定预览已生成，尚未公开产品。':row.scopes.extensions?'功能定义与扩展信息固定预览已生成，尚未公开产品。':'固定预览已生成，尚未公开产品。'}
async function capture(){if(props.disabled||!writable.value||locked.value||!loaded.value||!available.value||preview.value||finished.value)return;const s=snapshot(),original=prepareCurrentProductCapture(s.project,s.type,includeExtensions.value,includeData.value,includeApplication.value,includeTasks.value,includeRules.value);captureIntent.value=original;controller=new AbortController();busy.value=true;unknown.value='capture';attemptedRead.value=false;error.value='';let accepted=false
 try{const value=await props.transport.capture(original,controller.signal);accepted=true;if(!current(s)||!writable.value)return;captureAck=decodeCurrentProductCapture(value,original);const read=await props.transport.captured(original,controller.signal);if(current(s)&&writable.value)await acceptCapture(read,original,s,true)}catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(!accepted&&definitive(cause)){unknown.value=null;captureIntent.value=undefined}error.value=errorMessage(cause)}}finally{if(current(s))busy.value=false}}
function acceptPublication(value:CurrentProductPublication,original:CurrentProductPublishIntent){const row=decodeCurrentProductPublication(value,original);if(publishAck&&!sameCurrentProductPublication(row,publishAck))throw new Error('原发布回读与保存回执不符');published.value=row;unknown.value=null;error.value='';notice.value=original.capture.scopes.rules?'已选资料已发布；类型属性前处理规则导入为暂停首版本，须独立启用，不自动执行或改名。':original.capture.scopes.tasks?'已选资料已发布；任务导入后暂停，须发布模型并独立启用。':original.capture.scopes.thingsX?'已选资料已发布；用户应用配置已固定；不包含 App 实例、实际 App 运行或付款资料。':original.capture.scopes.data?'所选功能与 DATA 声明已发布；规则、任务和 ThingsX 未包含。':original.capture.scopes.extensions?'功能定义与扩展信息已发布；规则、任务、DATA 和 ThingsX 未包含。':'功能定义已发布；其它五类资料未包含。';emit('published')}
async function publish(){if(props.disabled||!writable.value||busy.value||unknown.value||!preview.value||!confirmed.value||published.value||finished.value)return;let original:CurrentProductPublishIntent;try{original=prepareCurrentProductPublish(projectId.value,props.typeId,preview.value,previous.value,label.value)}catch(cause){error.value=errorMessage(cause);return}const s=snapshot();publishIntent.value=original;controller=new AbortController();busy.value=true;unknown.value='publish';attemptedRead.value=false;error.value='';let accepted=false
 try{const saved=await props.transport.publish(original,controller.signal);accepted=true;if(!current(s)||!writable.value)return;publishAck=decodeCurrentProductPublication(saved,original);const read=await props.transport.published(original,controller.signal);if(current(s)&&writable.value)acceptPublication(read,original)}catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(!accepted&&definitive(cause)){unknown.value=null;publishIntent.value=undefined}error.value=errorMessage(cause)}}finally{if(current(s))busy.value=false}}
async function readOriginal(){if(!readable.value||busy.value||!unknown.value)return;const s=snapshot(),phase=unknown.value;controller=new AbortController();busy.value=true;attemptedRead.value=true;error.value=''
 try{if(phase==='capture'&&captureIntent.value){const original=captureIntent.value,value=await props.transport.captured(original,controller.signal);if(current(s))await acceptCapture(value,original,s)}else if(phase==='publish'&&publishIntent.value){const original=publishIntent.value,value=await props.transport.published(original,controller.signal);if(current(s))acceptPublication(value,original)}}catch(cause){if(current(s)&&!(cause instanceof IdentityChanged))error.value=cause instanceof ApiError&&cause.status===404?'尚未读到本人原键结果，仍为未知；不会重新提交。':errorMessage(cause)}finally{if(current(s))busy.value=false}}
function finish(){if(!unknown.value||busy.value||!attemptedRead.value)return;unknown.value=null;finished.value=true;notice.value='已结束本次核对；原操作结果仍未确认，未标记发布成功。'}
function close(){if(!locked.value)emit('close')}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,readable,()=>props.transport],()=>{reset();if(readable.value)void load()},{immediate:true,flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset)
onScopeDispose(()=>{alive=false;reset();dispose();emit('locked',false)})
</script>
<template><section class="current-product-publisher">
 <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <p v-if="!readable" role="alert">当前没有设备类型读取权限。</p>
 <template v-else-if="!unknown&&!finished">
  <template v-if="!preview">
   <div v-if="loaded&&available&&previous" class="publication-update-hint">
    <el-icon aria-hidden="true"><InfoFilled/></el-icon>
    {{previous.product.state==='PUBLISHED'?'更新已发布的产品，产品 ID 保持不变。':'再次发布已撤回的产品，产品 ID 保持不变。'}}
   </div>
   <div v-if="loaded&&available" class="publication-scopes">
    <section>
     <h4>发布功能定义</h4>
     <p>包含设备类型下的所有属性、事件、命令等功能定义。</p>
     <el-switch :model-value="true" disabled aria-label="发布功能定义"/>
    </section>
    <section v-for="option in scopeOptions" :key="option.name">
     <h4>{{option.label}}</h4>
     <p>{{option.description}}</p>
     <el-switch v-model="option.value.value" :aria-label="option.name" :disabled="disabled||!writable||locked"/>
    </section>
   </div>
   <p v-if="available===false">当前环境未启用按产品 ID 分享。</p>
   <el-skeleton v-if="busy&&!loaded" :rows="4" animated/>
   <el-button v-else-if="!loaded" :disabled="disabled" @click="load">重新读取分享状态</el-button>
  </template>
  <template v-else><p>固定预览截止时间：{{preview.expiresAt}}</p><p>取消只取消公开发布，不删除已生成的预览。</p><section v-for="[kind,title] in importSections" :key="kind"><h4>{{title}}（{{choices?.[kind].length}} 项）</h4><ul><li v-for="item in choices?.[kind]" :key="item.key">{{item.name}}（{{item.key}}）</li></ul></section>
   <section v-if="extensions" class="extension-preview"><h4>扩展信息（{{extensions.fields.length}} 个自定义字段，4 类特殊设置）</h4><ul><li v-for="(field,index) in extensions.fields" :key="index">{{field.name}}（{{field.kind}}，{{field.enabled?'启用':'停用'}}）<span v-if="field.description">：{{field.description}}</span></li></ul><p>地理坐标：{{extensions.location.mode}}<span v-if="extensions.location.propertyKey">（{{extensions.location.propertyKey}}）</span>；平面坐标：{{extensions.planar.enabled?'启用':'停用'}}；摄像头：{{extensions.camera.enabled?'启用':'停用'}}；ICCID：{{extensions.iccid.mode}}<span v-if="extensions.iccid.propertyKey">（{{extensions.iccid.propertyKey}}）</span></p><p>仅分享类型声明，不包含设备值、摄像头实例、供应商凭据或来源字段 ID。</p></section><p v-else>扩展信息未选择，不包含在本次发布中。</p>
   <section v-if="extensions && extensionSettings"><h4>用户应用和位置策略</h4><ul><li v-for="(field,index) in extensions.fields" :key="index">{{field.name}}：用户应用{{extensionSettings.fieldAccess[index]?.showInUserApp?'显示':'不显示'}}，{{extensionSettings.fieldAccess[index]?.userAppEditable?'可编辑':'不可编辑'}}</li></ul><p>地理坐标：{{extensionSettings.preferReported?'优先上报并允许人工回退':'不启用上报优先'}}；用户应用{{extensionSettings.locationShowInUserApp?'显示':'不显示'}}</p></section>
   <section v-if="data" class="data-preview"><h4>DATA 声明（{{data.streams.length}} 条数据流）</h4><p v-if="!data.configured">来源尚未配置 DATA 发布；新类型也保持未配置。</p><p v-else-if="!data.streams.length">来源已配置为空 DATA 发布；保留此明确空发布声明。</p><ul><li v-for="stream in data.streams" :key="stream.identifier">{{stream.name}}（{{stream.identifier}}，{{stream.format}}，{{stream.disabled?'停用':'启用'}}）<span v-if="stream.mqttTopics">；发布 Topic：{{stream.mqttTopics.publishTopic}}；订阅 Topic：{{stream.mqttTopics.subscribeTopic}}</span><span v-if="stream.description">：{{stream.description}}</span></li></ul><p>TCP 目标：{{data.tcpStreamIdentifier||'未设置'}}。仅分享声明，不包含发布 ID、创建时间、修订、设备接入代次、原始数据或凭据。</p></section><p v-else>{{application||tasks||rules?'DATA 未选择，不包含在本次发布中。':'本次规则、任务、DATA 和 ThingsX 不包含。'}}</p>
   <section v-if="application" class="application-preview"><h4>用户添加及 XS/Admin 属性展示配置</h4><p>允许用户添加：{{application.userAdd.allowUserAdd?'开启':'关闭'}}；添加标识：{{application.userAdd.codeMode==='AUTO'?'自动标识':'业务标识'}}；添加目录可见：{{application.userAdd.visibleInAddDirectory?'是':'否'}}。</p><p>添加提示文字：{{application.userAdd.promptText??'未设置'}}。</p><p>显示提示图片：{{application.userAdd.showPromptImage?'开启':'关闭'}}{{application.userAdd.promptImage?'（完整 PNG 仍包含）':''}}。</p><details v-if="application.userAdd.promptImage" :open="application.userAdd.showPromptImage"><summary>查看已保存提示 PNG（{{application.userAdd.promptImage.width}}×{{application.userAdd.promptImage.height}}）</summary><img :src="userAddPromptImageSource(application.userAdd.promptImage)" alt="公开包中的完整用户添加提示PNG" style="max-width:100%;max-height:240px"/><p>PNG SHA-256：{{application.userAdd.promptImage.sha256}}</p></details><section v-for="[audience,title] in applicationAudiences" :key="audience"><h4>{{title}} 属性展示：{{application[audience].customEnabled?'开启自定义':'关闭自定义（保留已选顺序）'}}</h4><ol><li v-for="key in application[audience].propertyKeys" :key="key">{{choices?.properties.find(row=>row.key===key)?.name||key}}（{{key}}）</li></ol></section><p>不包含 App 实例、实际 App 运行或付款资料。</p><DeviceTypePortablePanelPreview v-if="packageDetails?.panel" :panel="packageDetails.panel"/><p v-else>本版本不包含应用面板。</p></section><p v-else>用户添加及 XS/Admin 属性展示配置未选择，不包含在本次发布中。</p>
   <section v-if="tasks&&!generalTasks" class="task-preview"><h4>当前类型手动任务定义（{{tasks.tasks.length}} 项）</h4><p>导入后暂停，须发布模型并独立启用。不迁移执行历史或原目标设备；固定每日计划另列如下。</p><p>下方完整命令输入会随产品公开，请逐项核对原文。</p><section v-for="(task,index) in tasks.tasks" :key="index"><h4>{{task.name}}</h4><p v-if="task.description">{{task.description}}</p><p>原始源状态：{{task.sourceState==='ACTIVE'?'启用':'暂停'}}（{{task.sourceState}}）；目标：当前类型；计划：手动；命令：{{task.commandKey}}。</p><pre class="task-input">{{propertyValueText(task.input)}}</pre></section></section><p v-else-if="!generalTasks">当前类型任务定义未选择，不包含在本次发布中。</p>
   <section v-if="dailyTasks" class="task-preview"><h4>固定每日任务（{{dailyTasks.tasks.length}} 项）</h4><p>导入后暂停，须独立启用；跟随项目时区的计划使用目标项目时区。</p><section v-for="(task,index) in dailyTasks.tasks" :key="index"><h4>{{task.name}}</h4><p>命令：{{task.commandKey}}；原始状态：{{task.sourceState}}；时区：{{task.plan.zoneMode==='FOLLOW_PROJECT'?'跟随项目':task.plan.zone}}；时间：{{task.plan.times.join('、')}}；星期：{{task.plan.weekdays.join('、')}}。</p><pre class="task-input">{{propertyValueText(task.input)}}</pre></section></section>
   <section v-if="generalTasks" class="task-preview"><h4>当前类型任务（{{generalTasks.tasks.length}} 项）</h4><p>导入后暂停，需在目标项目核对并启用；已消费或过期的一次计划须重新设置。动作及函数原文会随产品公开，请逐项核对。</p><section v-for="(task,index) in generalTasks.tasks" :key="index"><h4>{{task.name}}</h4><p v-if="task.description">{{task.description}}</p><p>原始状态：{{task.sourceState}}；动作：{{task.actionType}}<span v-if="task.commandKey">；命令：{{task.commandKey}}</span>。</p><p>标签</p><pre class="task-input">{{propertyValueText(task.tags)}}</pre><p>计划</p><pre class="task-input">{{propertyValueText(task.plan)}}</pre><p>动作内容</p><pre class="task-input">{{propertyValueText(task.input)}}</pre></section></section>
   <section v-if="rules" class="rule-preview"><h4>类型直接关联的属性前处理规则（{{rules.rules.length}} 项）</h4><p>仅属性上报前处理和属性下发前处理。导入为暂停首版本，须独立启用，不自动发布模型、执行或改名；同名冲突会整批拒绝。</p><p>下方标签、条件与完整函数正文会随产品公开，请逐项核对原文。</p><section v-for="(rule,index) in rules.rules" :key="index"><h4>{{rule.name}}</h4><p v-if="rule.description">{{rule.description}}</p><p>原始源状态：{{rule.sourceState==='ACTIVE'?'启用':'暂停'}}（{{rule.sourceState}}）；来源：当前类型；触发：{{rule.trigger.kind==='ATTRS_RPT_PREPROC'?'属性上报前处理':'属性下发前处理'}}。</p><p>标签：{{JSON.stringify(rule.tags)}}</p><pre class="rule-filter">{{propertyValueText(rule.trigger.filter)}}</pre><section v-for="(fn,position) in rule.functions" :key="position"><p>函数 {{position+1}}：{{fn.format}}</p><pre class="rule-function">{{fn.source}}</pre></section></section></section><p v-else>类型直接关联的属性前处理规则未选择，不包含在本次发布中。</p>
   <section v-if="actionRules" class="rule-preview"><h4>当前设备上报后处理规则（{{actionRules.rules.length}} 项）</h4><p>导入后保持暂停；函数原文和可能包含的业务常量会公开，请核对。</p><section v-for="(rule,index) in actionRules.rules" :key="index"><h4>{{rule.name}}</h4><p>原始源状态：{{rule.sourceState==='ACTIVE'?'启用':'暂停'}}</p><section v-for="(action,position) in rule.actions" :key="position"><p>操作 {{position+1}}：{{action.nodeType}}</p><pre class="rule-function">{{propertyValueText(action.config)}}</pre></section></section></section>
   <details><summary>查看本次固定资料完整原文</summary><pre>{{preview.packageJson}}</pre></details>
   <el-form v-if="!published" label-position="top"><el-form-item label="分享署名"><el-input v-model="label" aria-label="当前类型分享署名" maxlength="80" :disabled="disabled||!writable||busy"/></el-form-item><el-checkbox v-model="confirmed" aria-label="确认仅公开上述固定功能资料" :disabled="disabled||!writable||busy">我确认仅公开上述已选固定资料</el-checkbox></el-form>
   <template v-else><p role="status">产品 ID：{{published.product.productId}}</p><p>原发布版本：{{published.product.sequence}}；当前状态：{{published.product.state}}</p><p v-if="published.product.versionId!==published.product.currentVersionId">当前产品已存在其它版本，本次原发布版本保持不变。</p></template>
  </template>
 </template>
 <template v-if="unknown"><el-alert title="原操作结果尚未确认，保留原正文和原键，只读取原结果，不会重新提交。" type="warning" :closable="false"/><p>待核对阶段：{{unknown==='capture'?'固定预览':'产品发布'}}</p><el-button :disabled="busy||!readable" :loading="busy" @click="readOriginal">读取原{{unknown==='capture'?'固定预览':'发布结果'}}</el-button><el-button :disabled="busy||!attemptedRead" @click="finish">结束本次核对</el-button></template>
 <div class="publication-actions">
  <el-button :disabled="locked" @click="close">{{preview&&!published?'取消发布':loaded&&available&&!preview&&!unknown&&!finished?'取消':'关闭'}}</el-button>
  <el-button v-if="loaded&&available&&!preview&&!unknown&&!finished" type="primary" :loading="busy" :disabled="disabled||!writable||locked" @click="capture">生成固定预览</el-button>
  <el-button v-else-if="preview&&!published&&!unknown&&!finished" type="primary" :loading="busy" :disabled="disabled||!writable||busy||!confirmed||!label.trim()" @click="publish">{{extensions||data||application||tasks||rules?'确认发布所选资料':'确认发布功能定义'}}</el-button>
 </div>
 </section></template>
<style scoped>.current-product-publisher p{font-size:14px;line-height:1.7}.current-product-publisher h4{font-size:14px;font-weight:500;margin:16px 0 8px}.current-product-publisher ul{max-height:200px;overflow:auto;padding-left:22px}.current-product-publisher pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto;font-size:12px}.current-product-publisher details{margin:16px 0}.current-product-publisher .el-alert{margin:12px 0}.current-product-publisher :deep(.el-checkbox){height:auto;min-height:30px;margin:12px 0}</style>

<style scoped>
.publication-update-hint { display: flex; align-items: center; gap: 8px; margin-bottom: 26px; padding: 9px 16px 10px; border-radius: 4px; background: var(--el-color-info-light-9); color: var(--el-color-info); font-size: 13px; line-height: 18px; }
.publication-update-hint .el-icon { flex: 0 0 16px; width: 16px; font-size: 16px; }
.publication-scopes { display: grid; gap: 24px; }
.publication-scopes h4 { margin: 0 0 5px; color: var(--tl-text); font-weight: 600; line-height: 20px; }
.publication-scopes p { margin: 0 0 7px; color: var(--el-text-color-secondary); line-height: 18px; }
.publication-scopes :deep(.el-switch) { --el-switch-on-color: #1e88e5; }
.publication-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
.publication-scopes ~ .publication-actions { margin-top: 56px; }
.publication-actions .el-button { margin: 0; }
</style>
