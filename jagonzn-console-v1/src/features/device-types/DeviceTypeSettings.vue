<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {DocumentCopy} from '@element-plus/icons-vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {errorMessage} from '@/core/http'
import {formatTime} from '@/core/time'
import {useResource} from '@/core/use-resource'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {copyFailed,copySucceeded} from '@/ui/copy-feedback'
import {showOperationFeedback} from '@/ui/operation-feedback'
import type {TypeProfile} from './profile-api'
import {typeDeviceUuid} from './type-devices-api'
import {typeSettingsAggregateTransport,type TypeSettingsAggregateTransport} from './type-settings-aggregate-api'
import {useTypeSettingsAggregate} from './use-type-settings-aggregate'
import DeviceTypeDeleteDialog from './DeviceTypeDeleteDialog.vue'
import DeviceTypeCurrentProductPublisher from './DeviceTypeCurrentProductPublisher.vue'
import DeviceTypeProductPublisher from './DeviceTypeProductPublisher.vue'
import {currentProductPublicationTransport} from './current-product-publication-api'
import DeviceTypeEnrollmentAdmission from './DeviceTypeEnrollmentAdmission.vue'
const props=withDefaults(defineProps<{profile:TypeProfile;disabled?:boolean;settingsTransport?:TypeSettingsAggregateTransport}>(),{disabled:false,settingsTransport:()=>typeSettingsAggregateTransport})
const emit=defineEmits<{edit:[section:'name'|'tags'];locked:[value:boolean];changed:[];removed:[]}>()
const publishing=ref(false),publicationLocked=ref(false),withdrawalLocked=ref(false),removeLocked=ref(false),enrollmentLocked=ref(false),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&can('device:read')&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.profile.type.id)&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const manager=computed(()=>readable.value&&can('device:update')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const writable=computed(()=>manager.value&&currentProject.value?.status==='ACTIVE')
const productPublication=useResource(signal=>currentProductPublicationTransport.owned(projectId.value,signal))
const publishedProduct=computed(()=>productPublication.data.value?.items.find(row=>row.sourceDeviceTypeId===props.profile.type.id&&row.product.state==='PUBLISHED'))
const enrollmentAllowed=computed(()=>writable.value&&props.profile.type.status==='PUBLISHED'&&props.profile.type.deviceKind!=='SUB_DEVICE')
const aggregate=useTypeSettingsAggregate({typeId:()=>props.profile.type.id,readable:()=>readable.value,writable:group=>writable.value&&(group==='presence'||props.profile.type.deviceKind!=='SUB_DEVICE'),disabled:()=>props.disabled||removeLocked.value,transport:()=>props.settingsTransport,changed:()=>emit('changed')})
const shown=computed(()=>publishing.value?'publish':aggregate.group==='presence'?'online':aggregate.group==='registration'?'registration':undefined)
const typeKey=computed(()=>typeof props.profile.type.typeKey==='string'?props.profile.type.typeKey:'')
const childLocked=computed(()=>aggregate.busy||aggregate.unknown||publicationLocked.value||withdrawalLocked.value||removeLocked.value||enrollmentLocked.value)
const sectionLocked=computed(()=>props.disabled||!aggregate.readable||aggregate.locked||publishing.value||withdrawalLocked.value||removeLocked.value||enrollmentLocked.value)
const productActionsDisabled=computed(()=>props.disabled||!readable.value||aggregate.locked||publishing.value||removeLocked.value||enrollmentLocked.value||productPublication.loading.value||!!productPublication.error.value)
function open(value:'online'|'registration'|'publish'){if(sectionLocked.value)return;if(value==='publish')publishing.value=true;else void aggregate.open(value==='online'?'presence':'registration')}
function close(){if(!childLocked.value){aggregate.cancel();publishing.value=false}}
function beforeClose(done:()=>void){if(!childLocked.value){close();done()}}
function refreshProductPublication(){if(readable.value)void productPublication.reload()}
function publicationConfirmed(){
 const updating=!!publishedProduct.value
 // 外层详情仍锁定，更新产品回显不需要重载整个设备类型。
 emit('changed')
 publishing.value=false
 refreshProductPublication()
 showOperationFeedback(updating?'产品已更新':'产品已发布')
}
function minutes(value:string){return value===''?null:Number(value)}
function setMinutes(field:'online'|'activity',value:number|null|undefined){aggregate.presence[field]=value==null?'':String(value)}
async function copyTypeKey(){
 const value=typeKey.value
 if(!value||!readable.value||shown.value!=='registration')return
 try{await navigator.clipboard.writeText(value);copySucceeded('已复制 TypeKey')}catch{copyFailed()}
}
watch(()=>!!shown.value||childLocked.value,value=>emit('locked',value),{immediate:true,flush:'sync'})
watch([()=>props.profile.type.id,()=>projectId.value,()=>session.user?.accountId,()=>readable.value],()=>{
 publishing.value=false;publicationLocked.value=false;withdrawalLocked.value=false
 productPublication.clear()
 refreshProductPublication()
},{immediate:true,flush:'sync'})
onScopeDispose(()=>emit('locked',false))
</script>
<template><div class="type-settings">
 <section><h3>类型描述</h3><el-button v-if="writable" size="small" :disabled="sectionLocked" @click="emit('edit','name')">编辑</el-button></section>
 <section><h3>标签</h3><el-table :data="Object.entries(profile.tags).map(([key,value])=>({key,value}))" empty-text="无标签"><el-table-column prop="key" label="标签名称"/><el-table-column prop="value" label="值"/></el-table><el-button v-if="writable" size="small" :disabled="sectionLocked" @click="emit('edit','tags')">编辑</el-button></section>
 <section><h3>设备在线及活跃设置</h3><p>设备在线状态及活跃状态的相关设置。 <a href="https://www.thingscloud.xyz/docs/guide/device-manage/device-basic.html#设备活跃状态" target="_blank" rel="noopener noreferrer">了解详情 <ReferenceIcon glyph="󰏌"/></a></p><el-button size="small" :disabled="sectionLocked" @click="open('online')">设置</el-button></section>
 <section><h3>自动创建设备</h3><p>设备通过一型一密方式动态获取证书时，可支持自动创建设备。 <a href="https://www.thingscloud.xyz/docs/guide/connect-device/device-certificate.html#一型一密" target="_blank" rel="noopener noreferrer">了解详情 <ReferenceIcon glyph="󰏌"/></a></p><el-button size="small" :disabled="sectionLocked" @click="open('registration')">设置</el-button></section>
 <section><h3>发布到产品库</h3><p>将设备类型作为产品模板，发布到 ThingsLink 公共产品库。其他用户在创建设备类型时，可通过产品 ID，快速创建该设备类型。</p>
  <div v-if="writable || publishedProduct" class="product-publication-actions">
   <el-button v-if="writable" size="small" :disabled="productActionsDisabled||withdrawalLocked||!productPublication.data.value" @click="open('publish')">{{publishedProduct?'更新':'发布'}}</el-button>
   <DeviceTypeProductPublisher v-if="publishedProduct" :type-id="profile.type.id" withdraw-only :owned-product="publishedProduct" :disabled="productActionsDisabled||!manager" @locked="withdrawalLocked=$event" @refresh-products="refreshProductPublication"/>
  </div>
  <p v-if="productPublication.error.value" role="alert">{{errorMessage(productPublication.error.value)}} <el-button size="small" :disabled="sectionLocked" @click="refreshProductPublication">重新读取发布状态</el-button></p>
  <dl v-else-if="publishedProduct" class="product-publication-facts">
   <div><dt>产品 ID</dt><dd>{{publishedProduct.product.productId}}</dd></div>
   <div><dt>发布时间</dt><dd><time :datetime="publishedProduct.product.publishedAt">{{formatTime(publishedProduct.product.publishedAt)}}</time></dd></div>
  </dl>
 </section>
 <section><h3>移除设备类型</h3><p>仅当设备类型没有绑定的设备时，才可以移除。移除设备类型将自动移除设备类型下的所有规则、任务、告警规则，该操作无法恢复。</p><DeviceTypeDeleteDialog :device-type-id="profile.type.id" :disabled="disabled||aggregate.locked||publishing||withdrawalLocked||enrollmentLocked" @locked="removeLocked=$event" @removed="emit('removed')"/></section>
 <el-alert v-if="aggregate.notice" :title="aggregate.notice" type="info" :closable="false"/><el-alert v-if="aggregate.error&&!aggregate.group" :title="aggregate.error" type="error" :closable="false"/>
 <el-dialog :model-value="!!shown" :title="shown==='online'?'设备活跃设置':shown==='registration'?'配置自动创建设备':'发布到公共产品库'" class="type-settings-dialog" :class="{'type-product-publication-dialog':publishing}" width="min(500px,94vw)" top="15vh" :close-on-click-modal="false" :close-on-press-escape="!childLocked" :show-close="!childLocked" :before-close="beforeClose">
  <template v-if="aggregate.group">
   <el-alert v-if="aggregate.error" :title="aggregate.error" type="error" :closable="false"/>
   <template v-if="aggregate.unknown"><p>原保存结果尚未确认，整组只读取核对，不会再次提交或单独保存其中一项。</p><p v-if="aggregate.observed">已读取当前整组设置；当前状态不能证明原请求的历史结果。</p></template>
   <el-skeleton v-else-if="aggregate.busy&&!aggregate.snapshot" :rows="3" animated/>
   <div v-if="aggregate.group==='registration'&&aggregate.snapshot&&!aggregate.unknown&&profile.type.deviceKind!=='SUB_DEVICE'" class="registration-type-key">
    <div class="registration-type-key__label">TypeKey</div>
    <p>将 TypeKey 写入设备固件，动态获取设备证书时通过 TypeKey 指定设备类型。首次自动创建需要发布该类型并允许自动创建。</p>
    <el-button v-if="typeKey" size="small" :icon="DocumentCopy" @click="copyTypeKey">复制 TypeKey</el-button>
   </div>
   <el-form v-if="!aggregate.unknown&&aggregate.snapshot" class="type-settings-form" :class="{'type-registration-form':aggregate.group==='registration'}" label-position="top" :disabled="disabled||!aggregate.writable||aggregate.busy||aggregate.conflict">
    <template v-if="aggregate.group==='presence'">
     <el-form-item label="在线超时时间（分钟）"><p>用于判断设备是否异常离线。平台能确认设备在该时长内没有上报或心跳时，将其判为离线。留空时按接入状态判断。</p><el-input-number controls-position="right" :model-value="minutes(aggregate.presence.online)" :min="1" :max="5000" :value-on-clear="null" aria-label="在线超时时间（分钟）" placeholder="未配置" @update:model-value="setMinutes('online',$event)"/></el-form-item>
     <el-form-item label="活跃超时时间（分钟）"><p>用于判断设备是否活跃。设备在该时长内有上报数据或心跳时，平台将其判为活跃。</p><el-input-number controls-position="right" :model-value="minutes(aggregate.presence.activity)" :min="1" :max="5000" :value-on-clear="null" aria-label="活跃超时时间（分钟）" placeholder="未配置" @update:model-value="setMinutes('activity',$event)"/></el-form-item>
    </template>
    <template v-else>
     <el-form-item label="允许设备自动创建"><p>当设备动态获取证书时，如果设备唯一标识不存在，允许自动创建新设备。</p><el-switch v-model="aggregate.registration.automaticCreationEnabled" aria-label="允许设备自动创建"/></el-form-item>
     <el-form-item v-if="enrollmentAllowed" label="启用设备白名单">
      <p>启用后，仅允许白名单中的序列号首次自动创建设备。开关即时生效，关闭后保留已导入的序列号。</p>
      <DeviceTypeEnrollmentAdmission :type-id="profile.type.id" :allowed="enrollmentAllowed" :disabled="disabled||!aggregate.writable||aggregate.busy||aggregate.conflict" @locked="enrollmentLocked=$event"/>
     </el-form-item>
     <el-form-item label="启用产品识别码（PK）">
      <p>产品识别码（Product Key）由设备厂商为产品设置。平台自动创建设备时，根据这个标识匹配设备类型。</p>
      <el-switch v-model="aggregate.registration.identifierEnabled" aria-label="启用产品识别码"/>
     </el-form-item>
     <el-form-item v-if="aggregate.registration.identifierEnabled" label="产品识别码（PK）">
      <p id="type-product-identifier-help">
       请填写设备使用的产品识别码，以便新设备关联到正确的设备类型。<br/>
       识别码采用域名倒叙格式，至少两段，以点分隔。每段只允许小写字母、数字和短横线。<a href="https://www.thingscloud.xyz/docs/guide/device-type/product-key.html" target="_blank" rel="noopener noreferrer">查看说明 <ReferenceIcon glyph="󰏌"/></a>。
      </p>
      <el-input v-model="aggregate.registration.productIdentifier" class="registration-product-identifier"
        aria-label="产品识别码" aria-describedby="type-product-identifier-help" maxlength="128"
        placeholder="例如: your-company.temperature-sensor">
       <template #prepend>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
         <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v10h4a3 3 0 0 0 6 0h4V5H5Zm2 2h10v2H7V7Zm0 4h10v2H7v-2Z"/>
        </svg>
       </template>
      </el-input>
     </el-form-item>
     <p v-if="profile.type.deviceKind==='SUB_DEVICE'">子设备没有独立动态注册入口。</p>
    </template>
   </el-form>
   <el-button v-if="aggregate.conflict||!aggregate.snapshot&&!aggregate.busy" size="small" :disabled="aggregate.busy||aggregate.unknown" @click="aggregate.load">重新读取整组设置</el-button>
  </template>
  <DeviceTypeCurrentProductPublisher v-else-if="publishing" :type-id="profile.type.id" :disabled="disabled||aggregate.locked||removeLocked" @locked="publicationLocked=$event" @published="publicationConfirmed" @close="close"/>
  <template #footer><template v-if="aggregate.unknown"><el-button :loading="aggregate.busy" @click="aggregate.review">读取当前整组设置</el-button><el-button type="primary" :disabled="aggregate.busy||!aggregate.observed" @click="aggregate.finish">采用当前设置并结束核对</el-button></template><template v-else-if="aggregate.group"><el-button :disabled="aggregate.busy||enrollmentLocked" @click="close">取消</el-button><el-button type="primary" :loading="aggregate.busy" :disabled="disabled||!aggregate.writable||aggregate.conflict||!aggregate.snapshot||enrollmentLocked" @click="aggregate.save">保存</el-button></template><el-button v-else-if="!publishing" @click="close">关闭</el-button></template>
 </el-dialog>

</div></template>
<style scoped>
.type-settings { padding-top: 26px; }
.type-settings > section + section { margin-top: 30px; }
.type-settings > section > h3 { margin: 0; color: #002822; font-size: 16px; font-weight: 600; line-height: 22px; }
.type-settings > section > p { margin: 3px 0 10px; color: var(--tl-muted); font-size: 14px; line-height: 20px; white-space: pre-wrap; overflow-wrap: anywhere; }
.type-settings > section:first-child > h3 + .el-button { margin-top: 20px; }
.type-settings .el-table { margin: 0 0 10px; font-size: 12px; }
.type-settings :deep(.el-table th.el-table__cell) { padding-block: 6px; color: var(--tl-title); }
.type-settings :deep(.el-table .cell) { padding-inline: 10px; }
.type-settings a { color: #1e88e5; font-weight: 600; white-space: nowrap; }
.type-settings a .reference-icon { vertical-align: -1px; }
.type-settings :deep(section > .el-button--small) { height: 28px; }
.product-publication-actions { display: flex; align-items: center; gap: 10px; }
.product-publication-actions :deep(.el-button--small) { height: 28px; }
.product-publication-facts { margin: 10px 0 0; color: var(--tl-text); font-size: 12px; }
.product-publication-facts div { display: grid; grid-template-columns: minmax(90px, 180px) minmax(0, 1fr); padding: 10px; border-bottom: 1px solid var(--el-border-color-lighter); line-height: 20px; }
.product-publication-facts dd { margin: 0; overflow-wrap: anywhere; }
.type-settings :deep(.el-alert) { margin-bottom: 14px; }
:global(.type-settings-dialog .el-dialog__body) { max-height: calc(85dvh - 148px); padding: 24px 20px 30px; overflow-y: auto; }
:global(.type-product-publication-dialog .el-dialog__title) { display: block; color: var(--tl-title); }
:global(.type-product-publication-dialog .el-dialog__headerbtn) { top: 21px; }
:global(.type-product-publication-dialog .el-dialog__body) { max-height: calc(85dvh - 70px); padding-top: 31px; padding-bottom: 20px; }
:global(.type-product-publication-dialog .el-dialog__footer) { display: none; }
.type-settings-form :deep(.el-form-item) { margin-bottom: 26px; }
.registration-type-key { margin-bottom: 26px; }
.registration-type-key__label { color: var(--tl-text); font-weight: 600; }
.registration-type-key p { margin: 4px 0 8px; color: var(--tl-muted); line-height: 20px; }
.type-settings-form :deep(.el-form-item:last-child) { margin-bottom: 0; }
.type-settings-form :deep(.el-form-item__label) { margin-bottom: 5px; line-height: 20px; font-weight: 600; }
.type-settings-form :deep(.el-form-item__content) > p { width: 100%; margin: 0 0 10px; color: var(--tl-muted); line-height: 18px; }
.type-registration-form :deep(.el-form-item__content) > p,
.registration-type-key p { color: var(--el-text-color-secondary); }
.type-registration-form :deep(.el-switch) { --el-switch-on-color: #1e88e5; }
.registration-product-identifier { --el-input-height: 40px; }
.registration-product-identifier :deep(.el-input-group__prepend) {
  width: 32px;
  padding: 0;
  background: var(--el-fill-color-blank);
  color: #999;
}
.type-registration-form a { color: var(--el-color-primary); }
.type-settings-form :deep(.el-input-number) { width: 100%; }
.type-settings-form :deep(.el-input-number .el-input__inner) { text-align: left; }
.type-settings-form :deep(.el-input-number .el-input) { --el-input-height: 40px; }
.type-settings-form :deep(.el-input-number__increase), .type-settings-form :deep(.el-input-number__decrease) { --el-input-number-controls-height: 19px; }
</style>
