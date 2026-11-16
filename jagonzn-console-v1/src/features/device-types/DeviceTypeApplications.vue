<script setup lang="ts">
import {computed,inject,onScopeDispose,ref,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {routerKey} from 'vue-router'
import DefinitionExternalIcon from './DefinitionExternalIcon.vue'
import DeviceTypeUserAddPolicyDialog from './DeviceTypeUserAddPolicyDialog.vue'
import DeviceTypePropertyDisplayDialog from './DeviceTypePropertyDisplayDialog.vue'
import DeviceTypePaymentCodesDialog from './DeviceTypePaymentCodesDialog.vue'
import type {PropertyDisplayAudience,PropertyDisplaySettingsTransport} from './property-display-settings-api'
import type {UserAddSettingsTransport} from './user-add-settings-api'
const props=withDefaults(defineProps<{typeId:string;wifi?:boolean;disabled?:boolean;userAddTransport?:UserAddSettingsTransport;propertyDisplayTransport?:PropertyDisplaySettingsTransport}>(),{disabled:false})
const emit=defineEmits<{locked:[boolean]}>(),policyLocked=ref(false),xsLocked=ref(false),adminLocked=ref(false)
const displayLocked=computed(()=>xsLocked.value||adminLocked.value)
const displayAudience=(title:string):PropertyDisplayAudience=>title==='ThingsXS 配置'?'THINGS_XS':'THINGS_ADMIN'
function setDisplayLock(audience:PropertyDisplayAudience,value:boolean){if(audience==='THINGS_XS')xsLocked.value=value;else adminLocked.value=value}
const router=inject(routerKey,undefined),userApplicationsReadable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&can('application:read')&&['OWNER','ADMIN','OPERATOR','VIEWER'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN','OPERATOR','VIEWER'].includes(currentProject.value?.myRole||'')&&['ACTIVE','ARCHIVED'].includes(currentProject.value?.status||''))
function manageUserApplications(){if(!userApplicationsReadable.value||props.disabled||locked.value||!router)return;void router.push({name:'user-applications'})}
const panelReadable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&can('device:read')&&['OWNER','ADMIN','OPERATOR','VIEWER'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN','OPERATOR','VIEWER'].includes(currentProject.value?.myRole||'')&&['ACTIVE','ARCHIVED'].includes(currentProject.value?.status||''))
function editPanel(){if(!panelReadable.value||props.disabled||locked.value||!router)return;void router.push({name:'device-type-panel-editor',params:{typeId:props.typeId}})}
const unavailable=ref('')
const paymentCodesOpen=ref(false)
const locked=computed(()=>policyLocked.value||displayLocked.value||paymentCodesOpen.value||!!unavailable.value)
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
watch([()=>props.typeId,()=>projectId.value,()=>session.user?.accountId],()=>{unavailable.value='';policyLocked.value=false;xsLocked.value=false;adminLocked.value=false})
onScopeDispose(()=>emit('locked',false))
const groups=[
 {
  title:'ThingsX App 配置',
  description:'ThingsX 是面向用户的移动端应用，可零代码自定义设备面板，支持 iOS、Android、微信小程序。用户可使用独立账号登录 ThingsX，您可以创建多个用户，将项目中的设备分配给不同的用户。',
  docs:'https://www.thingscloud.xyz/docs/guide/customer-app/common-app.html',
  items:[
   {title:'编辑设备面板',description:'可视化编辑 App 中的设备面板界面，展示在 ThingsX App 中。',action:'打开编辑器',glyph:'󱥈'},
   {title:'管理 App',description:'创建和管理通用版 App，支持 iOS/Android/小程序/Webapp。',action:'进入应用管理',glyph:'󱍕'},
   {title:'用户添加设备',description:'可允许用户添加新设备，支持 WiFi 配网、设备二维码等。',action:'进入配置',glyph:'󱈀'},
  ],
 },
 {
  title:'ThingsXS 配置',
  description:'ThingsXS 是面向用户的 Web 应用，带给用户桌面级的应用体验，可绑定自有域名，支持个性化配置。',
  docs:'https://www.thingscloud.xyz/docs/guide/customer-app/common-saas.html',
  items:[{title:'属性展示配置',description:'设置在 ThingsXS 的设备详情页中展示哪些属性定义。',action:'进入配置',glyph:'󱒋'}],
 },
 {
  title:'ThingsAdmin 配置',
  description:'ThingsAdmin 是面向项目管理员的 Web 应用，可管理所有设备，支持自定义配置及绑定自有域名。',
  docs:'https://www.thingscloud.xyz/docs/guide/project-app/common-saas.html',
  items:[{title:'属性展示配置',description:'设置在 ThingsAdmin 的设备详情页中展示哪些属性定义。',action:'进入配置',glyph:'󱒋'}],
 },
 {
  title:'ThingsPay 配置',
  description:'ThingsPay 提供设备付款联动场景的支持，您可以为设备配置付款服务以及常用支付方式，并在付款成功后联动操作设备。用于实现设备付费互动场景，例如自动售货机、 自动取水机、预付费电表、付费游戏机等。',
  docs:'https://www.thingscloud.xyz/docs/guide/device-type/pay-page-editor.html',
  items:[
   {title:'编辑付款页面',description:'可视化编辑付款页面的展示信息和样式，以及管理付款服务。',action:'打开编辑器',vector:'store'},
   {title:'管理付款应用',description:'创建 ThingsPay 付款应用。',action:'进入应用管理',glyph:'󱍕'},
   {title:'获取设备付款码',description:'查看设备类型下所有设备的付款页面链接以及二维码。',action:'查看',vector:'pay-code'},
  ],
 },
]
</script>
<template>
 <div class="type-applications">
  <section v-for="group in groups" :key="group.title">
   <h3>{{group.title}}</h3>
   <p class="application-intro">
    {{group.description}}
    <a :href="group.docs" :aria-label="`了解详情：${group.title}`" target="_blank" rel="noopener noreferrer">
     了解详情 <DefinitionExternalIcon/>
    </a>
   </p>
   <div class="application-cards">
    <article v-for="item in group.items" :key="item.title">
     <ReferenceIcon v-if="item.glyph" class="application-icon" :glyph="item.glyph"/>
     <!-- Clarity Store Solid and IconPark Pay Code One. See device-type-payment-LICENSE.txt. -->
     <svg v-else-if="item.vector==='store'" class="application-icon" width="40" height="40" viewBox="0 0 36 36" fill="currentColor" aria-hidden="true">
      <path d="M28 30H16v-8h-2v8H8v-8H6v8a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2v-8h-2Z"/>
      <path d="m33.79 13.27l-4.08-8.16A2 2 0 0 0 27.92 4H8.08a2 2 0 0 0-1.79 1.11l-4.08 8.16a2 2 0 0 0-.21.9v3.08a2 2 0 0 0 .46 1.28A4.67 4.67 0 0 0 6 20.13a4.72 4.72 0 0 0 3-1.07a4.73 4.73 0 0 0 6 0a4.73 4.73 0 0 0 6 0a4.73 4.73 0 0 0 6 0a4.72 4.72 0 0 0 6.53-.52a2 2 0 0 0 .47-1.28v-3.09a2 2 0 0 0-.21-.9M15 14.4v1.52L14.18 17a2.71 2.71 0 0 1-4.37 0L9 15.88V14.4L11.59 6H16Zm12 1.48L26.19 17a2.71 2.71 0 0 1-4.37 0L21 15.88V14.4L20 6h4.45L27 14.4Z"/>
     </svg>
     <svg v-else-if="item.vector==='pay-code'" class="application-icon" width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M32 6h10v10H32zm0 26h10v10H32zM6 32h10v10H6zM6 6h10v10H6zm2 18h22m8 0h2M24 37v2m0-22v14m0-23v2"/>
     </svg>
     <div class="application-copy">
      <h4>{{item.title}}</h4>
      <p>{{item.description}}</p>
     </div>
     <div class="application-action">
      <DeviceTypeUserAddPolicyDialog v-if="item.title==='用户添加设备'" :type-id="typeId" :wifi="wifi" :disabled="disabled||displayLocked||paymentCodesOpen||!!unavailable" :transport="userAddTransport" @locked="policyLocked=$event"/>
      <DeviceTypePropertyDisplayDialog v-else-if="item.title==='属性展示配置'" :type-id="typeId" :audience="displayAudience(group.title)" :transport="propertyDisplayTransport" :disabled="disabled||policyLocked||paymentCodesOpen||!!unavailable||(group.title==='ThingsXS 配置'?adminLocked:xsLocked)" @locked="setDisplayLock(displayAudience(group.title),$event)"/>
      <el-button v-else-if="item.title==='编辑设备面板'" :disabled="disabled||locked||!panelReadable" @click="editPanel">{{item.action}}</el-button>
      <el-button v-else-if="item.title==='管理 App'" :disabled="disabled||locked||!userApplicationsReadable" @click="manageUserApplications">{{item.action}}</el-button>
      <DeviceTypePaymentCodesDialog v-else-if="item.title==='获取设备付款码'" :type-id="typeId" :disabled="disabled||policyLocked||displayLocked||!!unavailable" @locked="paymentCodesOpen=$event"/>
      <el-button v-else :disabled="disabled||locked" @click="unavailable=item.title">{{item.action}}</el-button>
     </div>
    </article>
   </div>
  </section>
  <el-dialog :model-value="unavailable==='编辑付款页面'" title="付款页面编辑器暂不可用" class="type-payment-editor-dialog" width="min(500px,94vw)" @close="unavailable=''">
   <p>当前项目尚未接入 ThingsPay 付款服务，暂无法编辑设备付款页面。</p>
   <a href="https://www.thingscloud.xyz/docs/guide/device-type/pay-page-editor.html" target="_blank" rel="noopener noreferrer">了解付款页面配置 <DefinitionExternalIcon/></a>
  </el-dialog>
  <el-dialog :model-value="unavailable==='管理付款应用'" :title="unavailable" width="min(560px,94vw)" @close="unavailable=''">
   <el-alert title="此功能当前暂不可用。" type="info" :closable="false"/>
   <template #footer><el-button @click="unavailable=''">关闭</el-button></template>
  </el-dialog>
 </div>
</template>
<style scoped>
.type-applications{display:grid;gap:51px;padding:26px 0 10px}
.type-applications h3{font-size:22px;font-weight:400;line-height:32px;margin:0 0 8px;color:#002822}
.application-intro{font-size:15px;color:#888;line-height:22px;margin:0}
.application-intro a{display:inline-flex;align-items:center;gap:4px;font-weight:500}
.application-intro a:hover{text-decoration:underline}
.application-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:30px}
.application-cards article{display:flex;align-items:center;gap:30px;min-width:0;min-height:92px;padding:20px;border:1px solid #e9e9e9;border-radius:3px;box-sizing:border-box}
.application-icon{flex:0 0 40px;font-size:40px;color:#1e88e5}
.application-copy{flex:1;min-width:0}
.application-copy h4{font-size:16px;font-weight:400;line-height:22px;margin:0 0 4px;color:#002822}
.application-copy p{font-size:12px;line-height:19px;margin:0;color:#999}
.application-action{flex:0 0 auto;margin-left:auto}
.application-action > :deep(.el-button){height:32px;padding:8px 15px;font-size:12px;line-height:1;border-radius:3px;background:var(--tl-primary);border-color:var(--tl-primary);color:#fff}
.application-action > :deep(.el-alert){max-width:300px}
:global(.type-payment-editor-dialog .el-dialog__body){padding:34px 20px 42px;font-size:15px;line-height:24px}
.type-payment-editor-dialog p{margin:0 0 10px}
@media(max-width:1100px){.application-cards{grid-template-columns:minmax(0,1fr)}}
@media(max-width:560px){
 .application-cards article{gap:14px;flex-wrap:wrap;padding:18px}
 .application-copy{flex-basis:calc(100% - 54px)}
 .application-action{margin-left:54px}
}
</style>
