<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {typeDeviceUuid} from './type-devices-api'
import {prepareLocationPolicy,prepareReportedLocationPolicy,locationPolicyTransport,type LocationPolicy,type LocationPolicyIntent,type LocationPolicyTransport} from './location-policy-api'
const props=withDefaults(defineProps<{typeId:string;typeStatus?:string;disabled?:boolean;compact?:boolean;transport?:LocationPolicyTransport}>(),{disabled:false,compact:false,transport:()=>locationPolicyTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const denied=ref(false),readable=computed(()=>!denied.value&&session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const value=shallowRef<LocationPolicy>(),intent=shallowRef<LocationPolicyIntent>(),observed=shallowRef<LocationPolicy>(),shown=ref(false),busy=ref(false),unknown=ref(false),draft=ref(false),sourceMode=ref<'MANUAL'|'REPORTED'>('MANUAL'),propertyKey=ref(''),choices=shallowRef<readonly string[]>([]),choicesBusy=ref(false),error=ref(''),notice=ref('')
const preferReported=ref(false),showInUserApp=ref(false)
let generation=0,choiceGeneration=0,alive=true,controller:AbortController|undefined
const locked=computed(()=>shown.value||busy.value||unknown.value)
function clear(){generation++;choiceGeneration++;controller?.abort();value.value=undefined;intent.value=undefined;observed.value=undefined;shown.value=false;busy.value=false;unknown.value=false;choices.value=[];choicesBusy.value=false;propertyKey.value='';error.value='';notice.value=''}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:props.typeId,account:session.user?.accountId}}
function current(s:ReturnType<typeof capture>){return alive&&readable.value&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.type===props.typeId&&s.account===session.user?.accountId}
async function load(review=false){
 if(!readable.value||busy.value||unknown.value&&!review)return
 const s=capture();busy.value=true;error.value='';controller=new AbortController()
 try{const actual=await props.transport.read(s.project,s.type,controller.signal);if(!current(s))return;if(review)observed.value=actual;else value.value=actual}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&([401,403].includes(cause.status)||!review&&cause.status===404)){clear();denied.value=true}else error.value=errorMessage(cause)}}
 finally{if(current(s))busy.value=false}
}
function open(){if(!writable.value||props.disabled||busy.value||unknown.value||!value.value)return;draft.value=value.value.mode!=='DISABLED';sourceMode.value=value.value.mode==='REPORTED'?'REPORTED':'MANUAL';propertyKey.value=value.value.propertyKey||'';preferReported.value=value.value.preferReported===true;showInUserApp.value=value.value.showInUserApp===true;choices.value=[];error.value='';notice.value='';shown.value=true;if(sourceMode.value==='REPORTED')void loadChoices()}
async function loadChoices(){
 if(!shown.value||!readable.value||!writable.value||sourceMode.value!=='REPORTED'||choicesBusy.value)return
 const s=capture(),choice=++choiceGeneration;choicesBusy.value=true;error.value='';controller=new AbortController()
 try{if(!props.transport.choices)throw new Error('上报位置属性读取尚未就绪');const values=await props.transport.choices(s.project,s.type,props.typeStatus,controller.signal);if(current(s)&&choice===choiceGeneration&&shown.value&&sourceMode.value==='REPORTED')choices.value=values}
 catch(cause){if(current(s)&&choice===choiceGeneration&&shown.value&&!(cause instanceof IdentityChanged)){choices.value=[];error.value=errorMessage(cause)}}finally{if(current(s)&&choice===choiceGeneration)choicesBusy.value=false}
}
function changeReported(enabled:unknown){
 if(typeof enabled!=='boolean'||!shown.value||!writable.value||props.disabled)return
 sourceMode.value=enabled?'REPORTED':'MANUAL'
 if(enabled){void loadChoices();return}
 choiceGeneration++
 controller?.abort()
 choicesBusy.value=false
 error.value=''
}
function cancel(){if(!busy.value){choiceGeneration++;controller?.abort();choicesBusy.value=false;shown.value=false}}
function sameConfiguration(left:Pick<LocationPolicy,'mode'|'propertyKey'|'preferReported'|'showInUserApp'>,right:typeof left){
 return left.mode===right.mode&&left.propertyKey===right.propertyKey
  &&!!left.preferReported===!!right.preferReported&&!!left.showInUserApp===!!right.showInUserApp
}
async function save(){
 if(!shown.value||!writable.value||props.disabled||busy.value||unknown.value||!value.value)return
 let chosen:LocationPolicyIntent
 try{
  const appChange=showInUserApp.value===!!value.value.showInUserApp?undefined:showInUserApp.value
  if(draft.value&&sourceMode.value==='REPORTED'){
   if(choicesBusy.value||!choices.value.includes(propertyKey.value))throw new Error('请选择当前合格的WGS84上报位置属性')
   const fallbackChange=preferReported.value===!!value.value.preferReported?undefined:preferReported.value
   chosen=prepareReportedLocationPolicy(projectId.value,props.typeId,value.value,propertyKey.value,fallbackChange,appChange)
  }else chosen=prepareLocationPolicy(projectId.value,props.typeId,value.value,draft.value,appChange)
 }catch(cause){error.value=errorMessage(cause);return}
 const requested={mode:chosen.body.mode as LocationPolicy['mode'],propertyKey:chosen.body.propertyKey,
  preferReported:chosen.body.mode==='REPORTED'&&preferReported.value,showInUserApp:chosen.body.mode!=='DISABLED'&&showInUserApp.value}
 intent.value=chosen;unknown.value=true;shown.value=false;busy.value=true;error.value='';observed.value=undefined
 const s=capture();controller=new AbortController();let accepted=false
 try{
  const returned=await props.transport.change(chosen,controller.signal);accepted=true;if(!current(s))return
  const expected=BigInt(chosen.body.revision)+(sameConfiguration(value.value,requested)?0n:1n)
  if(returned.deviceTypeId!==chosen.typeId||returned.revision!==String(expected)||!sameConfiguration(returned,requested))throw new Error('保存回执与原策略不符，请读取当前配置核对')
  const actual=await props.transport.read(chosen.project,chosen.typeId,controller.signal);if(!current(s))return
  if(actual.revision!==returned.revision||!sameConfiguration(actual,returned))throw new Error('策略已变化，请读取当前配置核对')
  value.value=actual;unknown.value=false;intent.value=undefined;notice.value=chosen.body.mode==='REPORTED'?'上报位置绑定已保存；有效点按每台设备的固定模型及真实上报读取。':'地理坐标策略已保存，已有人工坐标保持。'
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&(cause.status===401||accepted&&cause.status===403)){clear();denied.value=true;return}
  if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,413,422,429].includes(cause.status)&&cause.code!==10014){unknown.value=false;intent.value=undefined;value.value=undefined;error.value='本次保存被拒绝，请重新读取策略后编辑。'}
  else error.value='原保存结果尚未核对；只读取当前事实，不会再次提交。'
 }}finally{if(current(s)){busy.value=false;if(notice.value)emit('changed')}}
}
function finish(){if(!unknown.value||busy.value||!observed.value)return;value.value=observed.value;observed.value=undefined;unknown.value=false;intent.value=undefined;error.value='';notice.value='已采用当前配置；原保存结果仍未确认，未重新提交。'}
function toggleCompact(next:unknown){if(typeof next!=='boolean'||!writable.value||props.disabled||locked.value||!value.value)return;draft.value=next;sourceMode.value='MANUAL';preferReported.value=false;showInUserApp.value=false;shown.value=true;void save()}
function reset(){clear();denied.value=false;if(readable.value)void load()}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,()=>session.ready,()=>session.transitioning,()=>can('device:read'),()=>roles.includes(session.user?.projectRole||''),()=>roles.includes(currentProject.value?.myRole||'')],reset,{immediate:true,flush:'sync'})
watch(writable,allowed=>{if(!allowed)shown.value=false},{flush:'sync'})
watch(locked,lock=>emit('locked',lock),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><div v-if="compact" class="extension-policy-control">
 <el-switch :model-value="!!value && value.mode !== 'DISABLED'" aria-label="启用地理坐标" :loading="busy" :disabled="disabled||!writable||locked||!value" @change="toggleCompact"/>
 <el-button v-if="value && value.mode !== 'DISABLED' && writable" class="extension-policy-edit" size="small" :disabled="disabled||locked" @click="open">编辑</el-button><span v-if="!readable" role="status">无读取权限</span><span v-if="notice" role="status" class="tl-muted">{{notice}}</span>
 <el-alert v-if="error&&!shown" :title="error" type="error" :closable="false"/>
 <template v-if="unknown"><el-button size="small" :loading="busy" @click="load(true)">读取当前配置</el-button><el-button size="small" :disabled="busy||!observed" @click="finish">采用当前配置</el-button></template>
 <el-button v-else-if="error&&!shown" size="small" :disabled="busy" @click="load()">重新读取</el-button>
 </div><section v-else class="location-policy"><header><h3>地理坐标</h3><el-button v-if="writable" size="small" :disabled="disabled||locked||!value" @click="open">设置地理坐标扩展</el-button></header>
 <p>使用人工 WGS84 坐标，或绑定设备上报的位置属性。启用「优先使用上报属性」后，读取不到有效上报位置时使用人工位置。</p>
 <p v-if="!readable" role="status">当前账号没有读取权限。</p><template v-else><p v-if="value">当前配置：{{value.mode==='DISABLED'?'已关闭':value.mode==='REPORTED'?'设备上报（'+value.propertyKey+'）':value.mode==='MANUAL'?'已启用人工坐标':'沿用人工坐标（未配置类型策略）'}}<span class="tl-muted"> · 版本 {{value.revision}}</span></p>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <template v-if="unknown"><p>原请求键：{{intent?.key}}。当前配置不能证明原请求结果。</p><p v-if="observed">当前读取：{{observed.mode==='DISABLED'?'关闭':observed.mode==='REPORTED'?'设备上报（'+observed.propertyKey+'）':'人工坐标'}}，版本 {{observed.revision}}</p><el-button :loading="busy" @click="load(true)">读取当前地理坐标策略核对</el-button><el-button :disabled="busy||!observed" @click="finish">采用当前配置并结束核对</el-button></template>
 <el-button v-else size="small" :loading="busy" :disabled="busy||shown" @click="load()">刷新地理坐标策略</el-button></template>

</section>
 <el-dialog
  :model-value="shown&&readable&&writable"
  :title="compact?'编辑扩展信息':'配置地理坐标扩展'"
  :class="{'type-location-extension-dialog':compact}"
  :width="compact?'min(600px,94vw)':'min(580px,94vw)'"
  :append-to-body="compact"
  :close-on-click-modal="false"
  @close="cancel"
 >
  <el-form label-position="top" @submit.prevent="save">
   <el-form-item v-if="compact" label="使用设备上报属性">
    <p class="type-location-help">使用设备上报的属性数据作为设备位置。关闭时使用人工填写的位置。</p>
    <el-switch :model-value="sourceMode==='REPORTED'" aria-label="使用设备上报属性" @change="changeReported"/>
   </el-form-item>
   <template v-else>
    <el-form-item label="启用地理坐标"><el-switch v-model="draft" aria-label="启用人工地理坐标"/></el-form-item>
    <el-form-item v-if="draft" label="位置来源">
     <el-radio-group v-model="sourceMode" @change="loadChoices">
      <el-radio value="MANUAL">人工WGS84坐标</el-radio><el-radio value="REPORTED">设备上报WGS84对象</el-radio>
     </el-radio-group>
    </el-form-item>
   </template>
   <el-form-item v-if="draft&&sourceMode==='REPORTED'" :label="compact?'选择位置属性':'位置属性标识符'">
    <p v-if="compact" class="type-location-help">请先在功能定义中添加可上报的 WGS84 坐标属性。</p>
    <el-select v-model="propertyKey" aria-label="位置属性标识符" :loading="choicesBusy" :placeholder="compact?'请选择':'选择严格lat/lng数值对象'">
     <el-option v-for="key in choices" :key="key" :label="key" :value="key"/>
    </el-select>
    <p v-if="!compact">仅列出可上报的严格Object定义。设备仍按自己的固定模型核对；这是本平台WGS84绑定合同。不会替换人工点或自动升级设备模型。</p>
   </el-form-item>
   <el-form-item v-if="draft" label="优先使用上报属性">
    <p class="type-location-help">上报位置可用时优先使用上报位置，否则使用人工填写的位置。</p>
    <el-switch :model-value="sourceMode==='REPORTED'&&preferReported" aria-label="优先使用上报属性"
      :disabled="sourceMode!=='REPORTED'" @change="preferReported=$event===true"/>
   </el-form-item>
   <el-form-item v-if="draft" label="显示在用户 App">
    <p class="type-location-help">已绑定该设备的用户可在 App 设备详情中查看当前位置。</p>
    <el-switch v-model="showInUserApp" aria-label="显示在用户 App"/>
   </el-form-item>
  </el-form>
  <el-alert v-if="compact&&error" :title="error" type="error" :closable="false"/>
  <template #footer>
   <el-button @click="cancel">取消</el-button>
   <el-button type="primary" :disabled="disabled||!writable||busy||choicesBusy" @click="save">{{compact?'保存':'保存地理坐标策略'}}</el-button>
  </template>
 </el-dialog>
</template>
<style scoped>.location-policy header{display:flex;align-items:center;justify-content:space-between;gap:12px}.location-policy p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}</style>
<style>
.type-location-extension-dialog .el-dialog__body{padding:36px 20px 24px}
.type-location-extension-dialog .el-form-item{margin-bottom:28px}
.type-location-extension-dialog .el-form-item__label{margin-bottom:5px;line-height:20px;font-weight:500}
.type-location-extension-dialog .type-location-help{flex-basis:100%;margin:0 0 8px;color:#888;line-height:22px}
.type-location-extension-dialog .el-switch{height:24px}
.type-location-extension-dialog .el-select{width:100%}
.type-location-extension-dialog .el-dialog__footer{display:flex;justify-content:flex-end;gap:10px}
.type-location-extension-dialog .el-dialog__footer .el-button{margin-left:0}
</style>
