<script setup lang="ts">
import {computed,onScopeDispose,reactive,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {typeDeviceUuid} from './type-devices-api'
import {propertyAccess,propertyTypes} from './property-definition-api'
import DefinitionTypeLabel from './DefinitionTypeLabel.vue'
import FunctionMdiIcon from './FunctionMdiIcon.vue'
import {functionMdiPath} from './function-style-icons'
import {rasterIconSource} from './definition-raster-icon'
import {preparePropertyDisplaySettings,propertyDisplayReceiptMatches,samePropertyDisplaySettings,propertyDisplaySettingsTransport,type PropertyDisplaySettings,type PropertyDisplaySettingsTransport,type PropertyDisplayAudience,type PropertyDisplayIntent,type DisplayDefinition} from './property-display-settings-api'
const props=withDefaults(defineProps<{typeId:string;audience:PropertyDisplayAudience;disabled?:boolean;transport?:PropertyDisplaySettingsTransport}>(),{disabled:false,transport:()=>propertyDisplaySettingsTransport})
const emit=defineEmits<{locked:[boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER'],label=computed(()=>props.audience==='THINGS_XS'?'ThingsXS':'ThingsAdmin')
const denied=ref(false),member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&can('device:read')&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||'')),readable=computed(()=>member.value&&!denied.value)
const writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const shown=ref(false),busy=ref(false),unknown=ref(false),conflict=ref(false),error=ref(''),notice=ref(''),snapshot=shallowRef<PropertyDisplaySettings>(),definitions=shallowRef<readonly DisplayDefinition[]>([]),intent=shallowRef<PropertyDisplayIntent>(),observed=shallowRef<PropertyDisplaySettings>(),draft=reactive({customEnabled:false,propertyKeys:[] as string[]})
const locked=computed(()=>shown.value||busy.value||unknown.value),rows=computed(()=>[...definitions.value.map(row=>({...row,missing:false})),...(snapshot.value?.propertyKeys||[]).filter(key=>!definitions.value.some(row=>row.propertyKey===key)).map(key=>({propertyKey:key,name:key+'（已从当前定义移除）',accessType:null,dataType:null,presentation:null,missing:true}))]),allVisible=computed(()=>definitions.value.length>0&&definitions.value.every(row=>draft.propertyKeys.includes(row.propertyKey)))
let generation=0,alive=true,controller:AbortController|undefined
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:props.typeId,actor:session.user?.accountId,audience:props.audience}}
function current(value:ReturnType<typeof capture>){return alive&&readable.value&&value.generation===generation&&value.epoch===identityEpoch()&&value.project===projectId.value&&value.type===props.typeId&&value.actor===session.user?.accountId&&value.audience===props.audience}
function reset(){generation++;controller?.abort();shown.value=false;busy.value=false;unknown.value=false;conflict.value=false;error.value='';snapshot.value=undefined;intent.value=undefined;observed.value=undefined;definitions.value=[];draft.customEnabled=false;draft.propertyKeys=[]}
function bind(value:PropertyDisplaySettings){snapshot.value=value;draft.customEnabled=value.customEnabled;draft.propertyKeys=[...value.propertyKeys]}
function fail(cause:unknown){if(cause instanceof ApiError&&[401,403].includes(cause.status)){reset();denied.value=true}error.value=errorMessage(cause)}
async function load(){if(!readable.value||busy.value||unknown.value)return;const state=capture();busy.value=true;error.value='';controller=new AbortController();try{const [value,available]=await Promise.all([props.transport.read(state.project,state.type,state.audience,controller.signal),props.transport.choices(state.project,state.type,controller.signal)]);if(current(state)){bind(value);definitions.value=available;conflict.value=false}}catch(cause){if(current(state)&&!(cause instanceof IdentityChanged))fail(cause)}finally{if(current(state))busy.value=false}}
async function open(){if(!readable.value||props.disabled||locked.value)return;reset();notice.value='';shown.value=true;await load()}
function close(){if(busy.value)return;if(unknown.value)shown.value=false;else reset()}
function select(key:string,enabled:boolean){if(!writable.value||props.disabled||busy.value||unknown.value||conflict.value||!draft.customEnabled)return;if(enabled&&!draft.propertyKeys.includes(key)){if(draft.propertyKeys.length>=1000){error.value='最多选择1000项，请先明确移除不需要的属性';return}draft.propertyKeys.push(key)}else if(!enabled)draft.propertyKeys=draft.propertyKeys.filter(value=>value!==key)}
function selectAll(enabled:boolean){if(!writable.value||props.disabled||busy.value||unknown.value||conflict.value||!draft.customEnabled)return;const missing=draft.propertyKeys.filter(key=>!definitions.value.some(row=>row.propertyKey===key)),next=enabled?[...missing,...definitions.value.map(row=>row.propertyKey)]:missing;if(next.length>1000){error.value='当前属性与保留的失效项合计超过1000项，请先明确移除失效项';return}draft.propertyKeys=next;error.value=''}
async function save(){
 if(!shown.value||!writable.value||props.disabled||busy.value||unknown.value||conflict.value||!snapshot.value)return;let original:PropertyDisplayIntent;try{original=preparePropertyDisplaySettings(projectId.value,props.typeId,props.audience,snapshot.value,draft.customEnabled,draft.propertyKeys,definitions.value)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=original;unknown.value=true;busy.value=true;observed.value=undefined;error.value='';const state=capture();controller=new AbortController();let accepted=false
 try{const returned=await props.transport.change(original,controller.signal);accepted=true;if(!current(state))return;if(!propertyDisplayReceiptMatches(returned,original))throw new Error('保存回执与原属性展示选择不符，请读取当前配置核对');const actual=await props.transport.read(state.project,state.type,state.audience,controller.signal);if(!current(state))return;if(!samePropertyDisplaySettings(returned,actual))throw new Error('当前属性展示配置已变化，请读取核对');bind(actual);unknown.value=false;busy.value=false;intent.value=undefined;shown.value=false;notice.value=label.value+' 属性展示配置已保存';emit('changed')}
 catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){fail(cause);if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,409,413,422,429].includes(cause.status)&&cause.code!==10014){unknown.value=false;conflict.value=true;intent.value=undefined;error.value='配置保存被拒绝，请重新读取后选择。'}}}finally{if(current(state))busy.value=false}
}
async function readCurrent(){if(!unknown.value||!readable.value||busy.value)return;const state=capture();busy.value=true;observed.value=undefined;error.value='';controller=new AbortController();try{const value=await props.transport.read(state.project,state.type,state.audience,controller.signal);if(current(state))observed.value=value}catch(cause){if(current(state)&&!(cause instanceof IdentityChanged))fail(cause)}finally{if(current(state))busy.value=false}}
function finish(){if(!unknown.value||busy.value)return;reset();notice.value='已结束本次核对；原保存结果仍未确认'}
watch([()=>projectId.value,()=>props.typeId,()=>props.audience,()=>session.user?.accountId,member],()=>{reset();denied.value=false;notice.value=''},{flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{reset();denied.value=false;notice.value=''});onScopeDispose(()=>{alive=false;reset();dispose();emit('locked',false)})
const accessLabel=(value:string|null)=>propertyAccess.find(([key])=>key===value)?.[1]||'—',typeLabel=(value:string|null)=>propertyTypes.find(([key])=>key===value)?.[1]||'—'
</script>
<template><el-button :disabled="!readable||disabled||locked" @click="open">进入配置</el-button><el-alert v-if="notice" :title="notice" type="info" :closable="false"/><el-alert v-if="error&&!shown" :title="error" type="error" :closable="false"/><el-button v-if="unknown&&!shown&&readable" @click="shown=true">查看未确认设置</el-button>
 <el-dialog :model-value="shown&&readable" :title="label+' 属性展示配置'" class="type-property-display-dialog" width="min(900px,94vw)" top="50px" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" :before-close="(done:()=>void)=>{if(!busy){close();done()}}">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="unknown"><p>原保存结果尚未确认；只读取当前受众配置，不会再次提交。</p><p v-if="observed">当前：{{observed.customEnabled?'自定义选择 '+observed.propertyKeys.length+' 项':'默认展示全部授权属性'}}。当前值不能证明原保存结果。</p></template>
  <el-skeleton v-else-if="busy&&!snapshot" :rows="3" animated/>
  <el-form v-else-if="snapshot" label-position="top" :disabled="!writable||disabled||busy||conflict">
   <el-form-item label="自定义展示属性" class="display-toggle">
    <p>开启后，可分别设置每个属性是否在 {{label}} 设备详情页中展示。</p>
    <el-switch v-model="draft.customEnabled" aria-label="自定义展示属性"/>
   </el-form-item>
   <template v-if="draft.customEnabled">
    <div class="display-selection-heading">
     <div><h4>选择属性</h4><p>设置哪些属性在 {{label}} 设备详情页中展示。</p></div>
     <div class="display-select-all"><span>全部展示</span><el-switch :model-value="allVisible" aria-label="全部展示" :disabled="!definitions.length" @update:model-value="selectAll($event===true)"/></div>
    </div>
    <el-table class="display-properties" :data="rows" row-key="propertyKey" empty-text="暂无属性">
     <el-table-column label="属性名称" min-width="190">
      <template #default="{row}">
       <span class="display-property-name">
        <img v-if="row.presentation?.iconRaster" :src="rasterIconSource(row.presentation.iconRaster)" alt="" width="18" height="18"/>
        <FunctionMdiIcon v-else-if="functionMdiPath(row.presentation?.iconId)" :icon-id="row.presentation.iconId" :color="row.presentation.color"/>
        {{row.name}}
       </span>
      </template>
     </el-table-column>
     <el-table-column prop="propertyKey" label="属性标识符" width="150" class-name="display-property-key"/>
     <el-table-column label="属性类型" width="120">
      <template #default="{row}"><span v-if="row.accessType&&row.accessType!=='UNDEFINED'" class="display-access" :data-access="row.accessType">{{accessLabel(row.accessType)}}</span><span v-else>—</span></template>
     </el-table-column>
     <el-table-column label="数据类型" width="175">
      <template #default="{row}"><DefinitionTypeLabel v-if="row.dataType" :type="row.dataType" :label="typeLabel(row.dataType)"/><span v-else>—</span></template>
     </el-table-column>
     <el-table-column label="是否展示" width="100" align="center">
      <template #default="{row}"><el-switch :model-value="draft.propertyKeys.includes(row.propertyKey)" :aria-label="'展示属性 '+row.propertyKey" @update:model-value="select(row.propertyKey,$event===true)"/></template>
     </el-table-column>
    </el-table>
   </template>
  </el-form>
  <el-button v-if="conflict||!snapshot&&!busy&&!unknown" :disabled="busy" @click="load">重新读取配置</el-button>
  <template #footer><template v-if="unknown"><el-button :disabled="busy" @click="close">关闭</el-button><el-button :loading="busy" @click="readCurrent">读取当前配置</el-button><el-button :disabled="busy" @click="finish">结束核对</el-button></template><template v-else><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" :loading="busy" :disabled="!writable||disabled||conflict||!snapshot" @click="save">保存</el-button></template></template>
 </el-dialog></template>
<style scoped>
p { margin: 0; font-size: 14px; line-height: 22px; color: #999; }
.display-toggle { margin: 0; }
.display-toggle p { margin-bottom: 8px; }
.display-toggle :deep(.el-form-item__label) { margin-bottom: 3px; font-weight: 500; }
.display-toggle :deep(.el-form-item__content) { display: block; }
.display-selection-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 22px 0 18px; }
.display-selection-heading h4 { margin: 0 0 3px; color: #606266; font-size: 14px; font-weight: 500; }
.display-select-all { display: flex; align-items: center; gap: 8px; color: #606266; white-space: nowrap; }
.display-properties { border: 1px solid #ebeef5; border-radius: 4px; }
.display-properties :deep(th.el-table__cell) { height: 55px; background: #f5f7fa; font-weight: 500; }
.display-properties :deep(td.el-table__cell) { height: 57px; }
.display-properties :deep(.cell) { padding: 0 20px; overflow-wrap: anywhere; }
.display-properties :deep(.display-property-key) { font-family: monospace; color: #999; }
.display-properties :deep(.definition-type-label) { gap: 6px; }
.display-properties :deep(.definition-type-label svg) { width: 18px; height: 18px; }
.display-property-name { display: inline-flex; align-items: center; gap: 8px; }
.display-access { display: inline-block; padding: 0 6px; border-radius: 4px; background: #909399; color: #fff; font-size: 12px; line-height: 24px; white-space: nowrap; }
.display-access[data-access="REPORT"] { background: #f39c12; }
.display-access[data-access="DOWNLINK"] { background: #10b981; }
.display-access[data-access="SHARED"] { background: #3b82f6; }
.display-access[data-access="CLOUD_PRIVATE"] { background: #ec4899; }
.el-alert { margin: 10px 0; }
:global(.type-property-display-dialog .el-dialog__body) { padding: 36px 20px 48px; }
@media(max-width:560px) { .display-selection-heading { align-items: flex-start; flex-wrap: wrap; } }
</style>
