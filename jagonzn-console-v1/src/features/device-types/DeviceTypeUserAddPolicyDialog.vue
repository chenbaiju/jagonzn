<script setup lang="ts">
import {computed,onScopeDispose,reactive,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {typeDeviceUuid} from './type-devices-api'
import UserAddPromptImagePicker from './UserAddPromptImagePicker.vue'
import DefinitionExternalIcon from './DefinitionExternalIcon.vue'
import {prepareUserAddSettings,sameUserAddSettings,userAddSettingsReceiptMatches,userAddSettingsDraft,userAddSettingsTransport,type UserAddSettings,type UserAddSettingsIntent,type UserAddSettingsTransport,type UserAddPromptImage} from './user-add-settings-api'
const props=withDefaults(defineProps<{typeId:string;wifi?:boolean;disabled?:boolean;transport?:UserAddSettingsTransport}>(),{disabled:false,transport:()=>userAddSettingsTransport})
const emit=defineEmits<{locked:[boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const denied=ref(false),member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const readable=computed(()=>member.value&&!denied.value),writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const shown=ref(false),busy=ref(false),imagePending=ref(false),unknown=ref(false),conflict=ref(false),error=ref(''),notice=ref(''),snapshot=shallowRef<UserAddSettings>(),observed=shallowRef<UserAddSettings>(),intent=shallowRef<UserAddSettingsIntent>()
const draft=reactive(userAddSettingsDraft()),locked=computed(()=>shown.value||busy.value||unknown.value)
let generation=0,alive=true,controller:AbortController|undefined
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:props.typeId,actor:session.user?.accountId}}
function current(value:ReturnType<typeof capture>){return alive&&readable.value&&value.generation===generation&&value.epoch===identityEpoch()&&value.project===projectId.value&&value.type===props.typeId&&value.actor===session.user?.accountId}
function reset(){generation++;controller?.abort();shown.value=false;busy.value=false;unknown.value=false;conflict.value=false;snapshot.value=undefined;observed.value=undefined;intent.value=undefined;error.value='';imagePending.value=false;Object.assign(draft,userAddSettingsDraft())}
function bind(value:UserAddSettings){snapshot.value=value;Object.assign(draft,userAddSettingsDraft(value))}
function promptImageChanged(value:UserAddPromptImage|null){draft.promptImage=value;if(!value)draft.showPromptImage=false}
function fail(cause:unknown){if(cause instanceof ApiError&&[401,403].includes(cause.status)){reset();denied.value=true}error.value=errorMessage(cause)}
async function load(){if(!readable.value||busy.value||unknown.value)return;const state=capture();busy.value=true;error.value='';controller=new AbortController();try{const value=await props.transport.read(state.project,state.type,controller.signal);if(current(state)){bind(value);conflict.value=false}}catch(cause){if(current(state)&&!(cause instanceof IdentityChanged))fail(cause)}finally{if(current(state))busy.value=false}}
async function open(){if(!readable.value||props.disabled||locked.value)return;reset();notice.value='';shown.value=true;await load()}
function close(){if(busy.value)return;if(unknown.value)shown.value=false;else reset()}
async function save(){
 if(!shown.value||!writable.value||props.disabled||busy.value||unknown.value||conflict.value||imagePending.value||!snapshot.value)return
 let original:UserAddSettingsIntent;try{original=prepareUserAddSettings(projectId.value,props.typeId,snapshot.value,draft)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=original;unknown.value=true;busy.value=true;observed.value=undefined;error.value='';const state=capture();controller=new AbortController();let accepted=false
 try{const returned=await props.transport.change(original,controller.signal);accepted=true;if(!current(state))return;if(!userAddSettingsReceiptMatches(returned,original))throw new Error('保存回执与原设置不符，请读取当前设置核对');const actual=await props.transport.read(state.project,state.type,controller.signal);if(!current(state))return;if(!sameUserAddSettings(returned,actual))throw new Error('当前用户添加设置已变化，请读取核对');bind(actual);unknown.value=false;busy.value=false;intent.value=undefined;shown.value=false;notice.value='用户添加设备设置已保存';emit('changed')}
 catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){fail(cause);if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,409,413,422,429].includes(cause.status)&&cause.code!==10014){unknown.value=false;intent.value=undefined;conflict.value=true;error.value='设置保存被拒绝，请重新读取后编辑。'}}}finally{if(current(state))busy.value=false}
}
async function readCurrent(){if(!unknown.value||!readable.value||busy.value)return;const state=capture();busy.value=true;observed.value=undefined;error.value='';controller=new AbortController();try{const value=await props.transport.read(state.project,state.type,controller.signal);if(current(state))observed.value=value}catch(cause){if(current(state)&&!(cause instanceof IdentityChanged))fail(cause)}finally{if(current(state))busy.value=false}}
function finish(){if(!unknown.value||busy.value)return;reset();notice.value='已结束本次核对；原保存结果仍未确认'}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,member],()=>{reset();denied.value=false;notice.value=''},{flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{reset();denied.value=false;notice.value=''});onScopeDispose(()=>{alive=false;reset();dispose();emit('locked',false)})
</script>
<template><el-button :disabled="!readable||disabled||locked" @click="open">进入配置</el-button><el-alert v-if="notice" :title="notice" type="info" :closable="false"/><el-alert v-if="error&&!shown" :title="error" type="error" :closable="false"/><el-button v-if="unknown&&!shown&&readable" @click="shown=true">查看未确认设置</el-button>
 <el-dialog :model-value="shown&&readable" title="配置用户添加设备" class="type-user-add-dialog" width="min(600px,94vw)" top="50px" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" :before-close="(done:()=>void)=>{if(!busy){close();done()}}">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="unknown"><p>原保存结果尚未确认；只读取当前设置，不会再次提交。</p><p v-if="observed">当前设置：{{observed.allowUserAdd?'允许':'不允许'}}用户添加，{{observed.codeMode==='AUTO'?'平台自动生成':'设备业务标识'}}。当前值不能证明原保存结果。</p><p v-if="observed">可添加目录：{{observed.visibleInAddDirectory?'显示':'隐藏'}}；提示文字：{{observed.promptText||'系统默认'}}；提示图片：{{observed.showPromptImage?'显示':'不显示'}}。</p></template>
  <el-skeleton v-else-if="busy&&!snapshot" :rows="3" animated/>
  <el-form v-else-if="snapshot" class="user-add-form" label-position="top" :disabled="!writable||disabled||busy||conflict||imagePending">
   <section>
    <h3>全局选项</h3>
    <p class="section-copy">可设置是否允许用户主动添加该类型设备。用户可通过设备码或设备二维码添加设备。
     <a href="https://www.thingscloud.xyz/docs/guide/customer-app/what-is-customer.html#用户主动添加设备" target="_blank" rel="noopener noreferrer">了解用户如何添加设备？ <DefinitionExternalIcon/></a>
    </p>
    <el-form-item label="允许用户添加设备">
     <p>允许用户在 App 中主动添加该类型的设备。</p>
     <el-switch v-model="draft.allowUserAdd" aria-label="允许用户添加设备"/>
    </el-form-item>
    <template v-if="draft.allowUserAdd">
     <el-form-item label="显示在可添加的设备中">
      <p>用户进入添加设备页面时，是否显示该设备类型。</p>
      <el-switch v-model="draft.visibleInAddDirectory" aria-label="显示在可添加的设备中"/>
     </el-form-item>
     <el-form-item label="允许多用户添加"><p>同一设备由一位用户主动添加，其他用户可通过设备共享取得访问权限。</p></el-form-item>
    </template>
    <el-form-item label="验证设备有效添加时间"><p>ThingsLink 暂未接入按设备设置添加时间的功能。</p></el-form-item>
   </section>
   <section>
    <h3>设备码选项</h3>
    <p class="section-copy">用户可通过设备码添加设备。请在设备详情页中获取设备码。</p>
    <el-form-item label="设备码类型">
     <p>选择设备码的生成方式。</p>
     <el-radio-group v-model="draft.codeMode" aria-label="设备码类型">
      <el-radio value="AUTO">平台自动生成（8位数字）</el-radio>
      <el-radio value="BUSINESS_KEY">使用设备业务标识</el-radio>
     </el-radio-group>
     <p v-if="draft.codeMode==='BUSINESS_KEY'">请先在 ThingsLink 设备详情中设置设备业务标识。</p>
    </el-form-item>
    <el-form-item label="自定义提示文字">
     <p>显示在用户输入设备码的页面。未设置则显示系统默认文字。</p>
     <el-input v-model="draft.promptText" aria-label="自定义提示文字" maxlength="512"/>
    </el-form-item>
    <el-form-item label="显示提示图片">
     <p>开启后，在用户输入设备码的页面显示提示图片。</p>
     <el-switch v-model="draft.showPromptImage" aria-label="显示提示图片"/>
    </el-form-item>
    <el-form-item label="上传提示图片">
     <UserAddPromptImagePicker :type-id="typeId" :active="shown&&!unknown" :disabled="!writable||disabled||busy||conflict" :model-value="draft.promptImage" :transport="transport.previewImage" @update:model-value="promptImageChanged" @busy="imagePending=$event"/>
    </el-form-item>
   </section>
   <section v-if="wifi">
    <h3>WiFi 配网选项</h3>
    <p class="section-copy">该设备类型采用 WiFi 通信方式。ThingsLink App 暂未接入 SoftAP 或蓝牙配网。</p>
   </section>
  </el-form>
  <el-button v-if="conflict||!snapshot&&!busy&&!unknown" :disabled="busy" @click="load">重新读取设置</el-button>
  <template #footer><template v-if="unknown"><el-button :disabled="busy" @click="close">关闭</el-button><el-button :loading="busy" @click="readCurrent">读取当前设置</el-button><el-button :disabled="busy" @click="finish">结束核对</el-button></template><template v-else><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" :loading="busy" :disabled="!writable||disabled||conflict||imagePending||!snapshot" @click="save">保存</el-button></template></template>
 </el-dialog></template>
<style scoped>
p { font-size: 14px; line-height: 21px; color: #999; margin: 0 0 7px; }
.user-add-form section+section { margin-top: 38px; }
.user-add-form h3 { margin: 0 0 6px; font-size: 16px; font-weight: 600; line-height: 24px; color: #002822; }
.section-copy { margin-bottom: 24px; }
.user-add-form .el-form-item { margin-bottom: 24px; }
.user-add-form .el-form-item:last-child { margin-bottom: 0; }
.user-add-form :deep(.el-form-item__label) { margin-bottom: 3px; font-weight: 500; }
.user-add-form :deep(.el-form-item__content) { display: block; }
.user-add-form a { display: inline-flex; align-items: center; gap: 4px; color: #1e88e5; font-weight: 600; }
.el-radio-group { display: flex; column-gap: 24px; flex-wrap: wrap; }
.el-radio-group .el-radio { margin-right: 0; }
.el-alert { margin: 10px 0; }
:global(.type-user-add-dialog .el-dialog__body) { padding: 40px 20px 38px; }
</style>
