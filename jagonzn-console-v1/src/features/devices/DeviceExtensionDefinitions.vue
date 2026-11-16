<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ArrowDown,Calendar,Clock,EditPen,Link,List,Operation,Phone,Plus,QuestionFilled,SwitchButton} from '@element-plus/icons-vue'
import {projectId,currentProject,can,session} from '@/core/session'
import {onIdentityChange} from '@/core/http'
import AsyncState from '@/ui/AsyncState.vue'
import DefinitionExternalIcon from '../device-types/DefinitionExternalIcon.vue'
import ExtensionScalarInput from './ExtensionScalarInput.vue'
import {useExtensionEditor} from './use-extension-editor'
import {readExtensionDefinitions,prepareExtensionDefinitions,submitExtensionDefinitions,MAX_EXTENSION_REVISION,type ExtensionField,type ExtensionSchema,type ExtensionDefinitionsIntent} from './device-extensions-api'
const props=withDefaults(defineProps<{deviceTypeId:string;disabled?:boolean;specialRows?:readonly {id:string;name:string;kind:string}[]}>(),{disabled:false,specialRows:()=>[]})
const tableRows=computed(()=>[...props.specialRows.map(row=>({...row,special:true,defaultValue:null})),...(data.value?.fields||[])])
const emit=defineEmits<{locked:[value:boolean];changed:[]}>()
const kinds={TEXT:'文字',NUMBER:'数值',SWITCH:'开关',SELECT:'选项',DATE:'日期',TIME:'时间',PHONE:'电话',URL:'网址'} as const
const kindIcons={TEXT:EditPen,NUMBER:Operation,SWITCH:SwitchButton,SELECT:List,DATE:Calendar,TIME:Clock,PHONE:Phone,URL:Link} as const
type Kind=keyof typeof kinds
const form=shallowRef<ExtensionField>(),notice=ref('')
const writeAllowed=computed(()=>can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||''))
let existing=false,originalOptions=0
const editor=useExtensionEditor<ExtensionSchema,ExtensionField[],ExtensionDefinitionsIntent>({id:()=>props.deviceTypeId,readable:()=>can('device:read'),
 writable:()=>writeAllowed.value,
 read:signal=>readExtensionDefinitions({project:projectId.value,type:props.deviceTypeId},signal),draft:snapshot=>snapshot.fields.map(field=>({...field,options:[...field.options]})),
 prepare:(before,fields)=>prepareExtensionDefinitions({project:projectId.value,type:props.deviceTypeId},before,fields),submit:submitExtensionDefinitions,onSaved:()=>{notice.value='扩展信息定义已保存';emit('changed')}})
const {data,draft,review,loading,sending,editing,reviewLoading,error,readable,denied}=editor
const writable=computed(()=>editor.writable.value&&!!data.value&&data.value.revision<MAX_EXTENSION_REVISION)
const canStart=computed(()=>writable.value&&!props.disabled&&!editing.value),locked=computed(()=>editing.value||sending.value||!!review.value||reviewLoading.value)
const showWriteActions=computed(()=>writable.value||(loading.value&&writeAllowed.value&&!!data.value&&data.value.revision<MAX_EXTENSION_REVISION))
function patch(value:Partial<ExtensionField>){if(form.value&&!props.disabled&&writable.value&&!sending.value&&!review.value)form.value={...form.value,...value}}
function setAppVisibility(value:unknown){
 if(typeof value==='boolean')patch({showInUserApp:value,userAppEditable:value&&form.value?.userAppEditable===true})
}
function setAppEditable(value:unknown){
 if(form.value?.showInUserApp&&typeof value==='boolean')patch({showInUserApp:true,userAppEditable:value})
}
function text(key:'name'|'description'|'onLabel'|'offLabel',value:unknown){if(typeof value==='string')patch({[key]:value})}
function option(index:number,value:unknown){if(!form.value||index<originalOptions||typeof value!=='string')return;const options=[...form.value.options];options[index]=value;patch({options})}
function addOption(){if(form.value&&form.value.options.length<20)patch({options:[...form.value.options,'']})}
function removeOption(index:number){if(form.value&&index>=originalOptions)patch({options:form.value.options.filter((_,i)=>i!==index)})}
async function openField(value:ExtensionField|Kind){
 if(!canStart.value)return
 notice.value=''
 await editor.begin({keepVisibleData:true});if(!editing.value||!draft.value)return
 if(typeof value==='string'){
  if(draft.value.length>=20){editor.cancel();error.value='最多添加20项扩展信息。';return}
  existing=false;originalOptions=0;form.value={id:crypto.randomUUID(),name:'',description:'',kind:value,enabled:true,options:value==='SELECT'?['']:[],defaultValue:null,onLabel:value==='SWITCH'?'是':null,offLabel:value==='SWITCH'?'否':null}
 }else{
  const current=draft.value.find(field=>field.id===value.id);if(!current){editor.cancel();error.value='该扩展信息已变化，请重新选择。';return}
  existing=true;originalOptions=current.options.length;form.value={...current,options:[...current.options]}
 }
}
function cancel(){if(sending.value)return;editor.cancel();form.value=undefined}
function beforeClose(done:()=>void){if(sending.value)return;cancel();done()}
async function save(){
 if(!writable.value||props.disabled||!form.value||!draft.value)return
 const selected={...form.value,options:[...form.value.options]}
 draft.value=draft.value.some(value=>value.id===selected.id)?draft.value.map(value=>value.id===selected.id?selected:value):[...draft.value,selected]
 await editor.save();if(!editing.value)form.value=undefined
}
async function toggle(field:ExtensionField,value:unknown){
 if(!canStart.value||typeof value!=='boolean'||!editor.beginCurrent()||!draft.value)return
 notice.value=''
 draft.value=draft.value.map(row=>row.id===field.id?{...row,enabled:value}:row)
 await editor.save()
}
function adopt(){const unknown=review.value?.stage==='unknown';editor.useCurrent();editor.cancel();form.value=undefined;notice.value=unknown?'已采用当前定义；原保存结果仍未确认，未标记成功。':'已采用当前定义，未重发原请求。'}
function defaultLabel(field:ExtensionField){if(field.defaultValue===null)return '';if(field.kind==='SWITCH')return field.defaultValue==='true'?field.onLabel:field.offLabel;return field.defaultValue===''?'空文本':field.defaultValue}
function reset(){editor.reset();form.value=undefined;notice.value=''}
watch([()=>projectId.value,()=>props.deviceTypeId,()=>can('device:read'),()=>session.user?.accountId],()=>{reset();if(can('device:read')&&projectId.value&&props.deviceTypeId)void editor.load()},{immediate:true,flush:'sync'})
watch(writeAllowed,value=>{if(!value&&!sending.value&&!review.value){editor.cancel();form.value=undefined}},{flush:'sync'})
watch(denied,value=>{if(value){form.value=undefined;notice.value=''}},{flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
onScopeDispose(onIdentityChange(reset))
onScopeDispose(()=>emit('locked',false))
</script>
<template><section class="device-extension-definitions">
 <h2>编辑扩展信息</h2><p class="extension-definition-tips">为该类型下的设备定义扩展信息，以满足各业务场景的设备管理需求。常见的扩展信息例如：设备位置、维护人、到期时间、合同编号、所属单位等。 <a href="https://www.thingscloud.xyz/docs/guide/device-type/extend-info-define.html" target="_blank" rel="noopener noreferrer">了解详情 <DefinitionExternalIcon/></a></p>
 <el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <el-alert v-if="error&&!form" :title="error" type="error" :closable="false"/>
 <el-alert v-if="review" :title="review.stage==='unknown'?'保存结果未确认，请先读取当前定义核对。':'扩展信息定义或写入权限已变化，请先读取当前定义核对。'" type="warning" :closable="false">
  <el-button :loading="reviewLoading" :disabled="sending||reviewLoading" @click="editor.readCurrent">读取当前定义</el-button><template v-if="review.current"><ul><li v-for="field in review.current.fields" :key="field.id">{{field.name}} · {{kinds[field.kind as Kind]}} · {{field.enabled?'启用':'停用'}}</li></ul><p v-if="!review.current.fields.length">当前没有扩展信息定义。</p><el-button :disabled="sending||reviewLoading" @click="adopt">采用当前定义</el-button></template>
 </el-alert>
 <AsyncState :loading="loading&&!data" :error="!data&&error&&!review?error:undefined" :forbidden="!readable||denied" @retry="editor.load"><template v-if="data">
  <el-table :data="tableRows" empty-text="暂无扩展信息" class="extension-definition-table">
   <el-table-column prop="name" label="名称" min-width="140"/>
   <el-table-column label="类型" min-width="140"><template #default="{row}">{{row.special?row.kind:kinds[row.kind as Kind]}}</template></el-table-column>
   <el-table-column label="默认值" min-width="140"><template #default="{row}"><span class="extension-definition-default">{{row.special?'':defaultLabel(row)}}</span></template></el-table-column>
   <el-table-column :width="writeAllowed?340:130">
    <template #header><span class="extension-enabled-help">启用 <el-tooltip content="是否启用该信息定义" :trigger="['hover','focus']"><el-icon tabindex="0" aria-label="是否启用该信息定义"><QuestionFilled/></el-icon></el-tooltip></span></template>
    <template #default="{row}">
     <slot v-if="row.special" name="special-enabled" :row="row"/>
     <div v-else class="extension-row-controls">
      <el-switch :model-value="row.enabled" :aria-label="`启用${row.name}`" :disabled="!canStart" @change="toggle(row,$event)"/>
      <el-button v-if="showWriteActions||editing" class="extension-row-edit" size="small" :disabled="!canStart" @click="openField(row)">编辑</el-button>
     </div>
    </template>
   </el-table-column>
  </el-table>
  <div v-if="showWriteActions" class="extension-definition-add"><el-dropdown trigger="click" popper-class="extension-definition-menu" :disabled="!canStart||data.fields.length>=20" @command="openField"><el-button size="small" :icon="Plus" :disabled="!canStart||data.fields.length>=20">添加扩展信息 <el-icon><ArrowDown/></el-icon></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="(label,kind) in kinds" :key="kind" :command="kind" :icon="kindIcons[kind]">{{label}}</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div>
  <el-button v-if="editing&&!form&&!review" size="small" :disabled="sending" @click="cancel">取消修改</el-button>
 </template></AsyncState>
 <el-dialog class="extension-definition-dialog" :model-value="!!form&&editing&&readable" :title="existing?'编辑扩展信息':'添加扩展信息'" width="min(600px,94vw)" :close-on-click-modal="false" :show-close="!sending" :before-close="beforeClose" destroy-on-close>
  <template v-if="form"><el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="review" title="保存前提需要核对，请关闭此窗口后读取当前定义。" type="warning" :closable="false"/><el-form label-position="top" @submit.prevent><el-form-item label="名称"><el-input :model-value="form.name" aria-label="扩展信息名称" maxlength="64" :disabled="disabled||!writable||sending||!!review" @update:model-value="text('name',$event)"/></el-form-item>
   <el-form-item v-if="form.kind==='SELECT'" label="选项"><p v-if="originalOptions" class="tl-muted">已有选项保留，可追加新选项。</p><div v-for="(value,index) in form.options" :key="index" class="extension-option"><el-input :model-value="value" :aria-label="`选项${index+1}`" maxlength="64" :disabled="disabled||!writable||sending||!!review||index<originalOptions" @update:model-value="option(index,$event)"/><el-button v-if="index>=originalOptions" text :disabled="disabled||!writable||sending||!!review" @click="removeOption(index)">移除</el-button></div><el-button size="small" :disabled="disabled||!writable||sending||!!review||form.options.length>=20" @click="addOption">添加选项</el-button></el-form-item>
   <div v-if="form.kind==='SWITCH'" class="extension-switch-labels">
    <el-form-item label="“是”显示文字"><el-input :model-value="form.onLabel" aria-label="是显示文字" maxlength="64" :disabled="disabled||!writable||sending||!!review" @update:model-value="text('onLabel',$event)"/></el-form-item>
    <el-form-item label="“否”显示文字"><el-input :model-value="form.offLabel" aria-label="否显示文字" maxlength="64" :disabled="disabled||!writable||sending||!!review" @update:model-value="text('offLabel',$event)"/></el-form-item>
   </div>
   <el-form-item v-else label="默认值"><ExtensionScalarInput class="extension-dialog-default" :field="{...form,defaultValue:null}" label="扩展信息默认值" :model-value="form.defaultValue" :disabled="disabled||!writable||sending||!!review" @update:model-value="patch({defaultValue:$event})"/></el-form-item>
   <el-form-item class="extension-app-control">
    <template #label><span class="extension-description-label"><span>显示在用户 <strong>App</strong></span><el-tooltip content="将此扩展信息显示给已绑定设备的用户" :trigger="['hover','focus']"><el-icon tabindex="0" aria-label="将此扩展信息显示给已绑定设备的用户"><QuestionFilled/></el-icon></el-tooltip></span></template>
    <el-switch :model-value="form.showInUserApp??false" aria-label="显示在用户 App" :disabled="disabled||!writable||sending||!!review" @change="setAppVisibility"/>
   </el-form-item>
   <el-form-item v-if="form.showInUserApp" class="extension-app-control">
    <template #label><span class="extension-description-label">允许用户编辑 <el-tooltip content="允许有设备编辑权限的 App 用户修改此字段的值" :trigger="['hover','focus']"><el-icon tabindex="0" aria-label="允许有设备编辑权限的 App 用户修改此字段的值"><QuestionFilled/></el-icon></el-tooltip></span></template>
    <el-switch :model-value="form.userAppEditable??false" aria-label="允许用户编辑" :disabled="disabled||!writable||sending||!!review" @change="setAppEditable"/>
   </el-form-item>
   <el-form-item>
    <template #label><span class="extension-description-label">描述 <el-tooltip content="说明此扩展信息的用途" :trigger="['hover','focus']"><el-icon tabindex="0" aria-label="说明此扩展信息的用途"><QuestionFilled/></el-icon></el-tooltip></span></template>
    <el-input :model-value="form.description" aria-label="扩展信息描述" type="textarea" :rows="3" maxlength="500" :disabled="disabled||!writable||sending||!!review" @update:model-value="text('description',$event)"/>
   </el-form-item>
  </el-form></template>
  <template #footer><el-button :disabled="sending" @click="cancel">取消</el-button><el-button type="primary" :loading="sending" :disabled="disabled||!writable" @click="save">保存</el-button></template>
 </el-dialog>
</section></template>
<style scoped>
.device-extension-definitions h2{font-size:22px;line-height:32px;font-weight:400;color:#002822;margin:26px 0 0}
.extension-definition-tips{color:#888;font-size:15px;line-height:22px;margin:8px 0 0}
.extension-definition-tips a{color:#1e88e5;font-weight:600;white-space:nowrap}
.extension-definition-table{margin-top:14px;--el-table-border-color:#eee}
.extension-definition-table :deep(th.el-table__cell){color:var(--tl-title);font-weight:700}
.extension-definition-table :deep(.cell){padding-inline:10px;line-height:23px}
.extension-definition-default{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.extension-definition-add{margin-top:20px}
.extension-definition-add .el-icon{margin-left:6px}
.extension-enabled-help{display:flex;align-items:center;justify-content:center;gap:10px;width:110px}
.extension-enabled-help .el-icon{color:#c0c4cc;font-size:12px;outline-offset:3px}
.extension-row-controls,.extension-definition-table :deep(.extension-policy-control){display:grid;grid-template-columns:110px minmax(0,1fr);align-items:center}
.extension-definition-table :deep(.el-switch){height:23px;justify-self:center;--el-switch-on-color:#1e88e5;--el-switch-off-color:#ccc}
.extension-row-edit,.extension-definition-table :deep(.extension-policy-edit){height:28px;padding:7px 15px;margin:0;justify-self:end}
.extension-definition-table :deep(.extension-policy-control > :not(.el-switch,.extension-policy-edit)){grid-column:1/-1;justify-self:start;max-width:100%;white-space:normal;overflow-wrap:anywhere}
.extension-option{display:flex;width:100%;gap:8px;margin-bottom:8px}
.extension-option .el-input{max-width:400px}
</style>

<style>
.extension-definition-menu .el-dropdown-menu{padding:10px 0}
.extension-definition-menu .el-dropdown-menu__item{padding:0 20px;line-height:36px}
.extension-definition-menu .el-dropdown-menu__item .el-icon{font-size:13px;margin-right:10px}
.extension-definition-dialog .el-dialog__body{padding:38px 20px 24px}
.extension-definition-dialog .el-form-item{margin-bottom:28px}
.extension-definition-dialog .el-form-item__label{line-height:20px;margin-bottom:6px;color:var(--tl-text);font-weight:500}
.extension-switch-labels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.extension-description-label{display:inline-flex;align-items:center;gap:10px}
.extension-description-label .el-icon{color:#c0c4cc;font-size:12px;outline-offset:3px}
.extension-definition-dialog .extension-app-control .el-form-item__content,.extension-definition-dialog .extension-app-control .el-switch{min-height:24px;height:24px}
.extension-definition-dialog .el-input__wrapper,.extension-definition-dialog .el-select__wrapper{min-height:33px;padding-block:0}
.extension-definition-dialog .el-input__inner{height:33px;line-height:33px}
.extension-definition-dialog .el-input__inner,.extension-definition-dialog .el-textarea__inner,.extension-definition-dialog .el-select__wrapper{font-size:13px}
.extension-definition-dialog .el-textarea__inner{min-height:70px;padding:5px 15px;line-height:20px}
.extension-definition-dialog .extension-dialog-default{width:100%}
.extension-definition-dialog .extension-dialog-default > :is(.el-input,.el-select,.el-date-editor){max-width:none}
.extension-definition-dialog .extension-dialog-default .extension-unset{display:none}
.extension-definition-dialog .el-dialog__footer{display:flex;justify-content:flex-end;gap:10px}
.extension-definition-dialog .el-dialog__footer .el-button{margin-left:0}
</style>
