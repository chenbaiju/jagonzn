<script setup lang="ts">
import {computed,watch,onScopeDispose} from 'vue'
import {QuestionFilled} from '@element-plus/icons-vue'
import {projectId,currentProject,can,session} from '@/core/session'
import {onIdentityChange} from '@/core/http'
import {ElMessage} from 'element-plus'
import AsyncState from '@/ui/AsyncState.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import ExtensionScalarInput from './ExtensionScalarInput.vue'
import {useExtensionEditor} from './use-extension-editor'
import {readExtensionValues,prepareExtensionValues,submitExtensionValues,MAX_EXTENSION_REVISION,type ExtensionValues,type ExtensionValuesIntent} from './device-extensions-api'
const props=defineProps<{deviceId:string}>()
type Draft=Record<string,string|null>
const editor=useExtensionEditor<ExtensionValues,Draft,ExtensionValuesIntent>({id:()=>props.deviceId,readable:()=>can('device:read'),
 writable:()=>can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||''),
 read:signal=>readExtensionValues({project:projectId.value,device:props.deviceId},signal),draft:value=>Object.fromEntries(value.fields.map(entry=>[entry.definition.id,entry.value])),
 prepare:(before,draft)=>prepareExtensionValues({project:projectId.value,device:props.deviceId},before,Object.entries(draft).filter((entry):entry is [string,string]=>entry[1]!==null).map(([fieldId,value])=>({fieldId,value}))),submit:submitExtensionValues})
const {data,draft,review,loading,sending,editing,reviewLoading,error,denied,readable}=editor
const writable=computed(()=>editor.writable.value&&!!data.value?.deviceTypeId&&data.value.valueRevision<MAX_EXTENSION_REVISION)
const fields=computed(()=>data.value?.fields??[])
async function begin(){
 if(!writable.value)return
 if(!fields.value.length){ElMessage.info('请在设备类型中添加扩展信息');return}
 await editor.begin()
 if(editing.value&&!data.value?.fields.length){editor.cancel();ElMessage.info('请在设备类型中添加扩展信息')}
}
function change(id:string,value:string|null){if(!sending.value&&!review.value&&draft.value)draft.value={...draft.value,[id]:value}}
function display(entry:ExtensionValues['fields'][number]){const value=entry.effectiveValue;if(value===null)return '未设置';if(entry.definition.kind==='SWITCH')return value==='true'?entry.definition.onLabel:entry.definition.offLabel;return value===''?'空文本':value}
watch(()=>[projectId.value,props.deviceId,can('device:read'),can('device:update'),currentProject.value?.status,session.user?.accountId,session.user?.projectRole],()=>{editor.reset();if(can('device:read')&&projectId.value&&props.deviceId)void editor.load()},{immediate:true,flush:'sync'})
onScopeDispose(onIdentityChange(editor.reset))
</script>
<template><section class="device-extension-values">
 <h2>更多扩展信息</h2><p class="extension-tips">在设备类型的扩展信息中可添加或编辑扩展信息定义。</p>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/>
 <el-alert v-if="review" :title="review.stage==='unknown'?'保存结果未确认，请先读取当前信息核对。':'扩展信息或写入权限已变化，请先读取当前信息核对。'" type="warning" :closable="false">
  <el-button :loading="reviewLoading" :disabled="sending||reviewLoading" @click="editor.readCurrent">读取当前信息</el-button>
  <template v-if="review.current"><dl class="extension-review"><template v-for="entry in review.current.fields" :key="entry.definition.id"><dt>{{entry.definition.name}}</dt><dd>{{display(entry)}}</dd></template></dl><p v-if="!review.current.fields.length">当前设备没有启用的扩展信息。</p><el-button :disabled="sending||reviewLoading" @click="editor.useCurrent">采用当前信息</el-button></template>
 </el-alert>
 <AsyncState :loading="loading" :error="!data&&error&&!review?error:undefined" :forbidden="!readable||denied" @retry="editor.load">
  <template v-if="data">
   <div class="extension-actions"><el-button v-if="!editing&&writable" size="small" @click="begin">编辑</el-button><template v-if="editing"><el-button size="small" :disabled="sending" @click="editor.cancel">取消</el-button><el-button size="small" type="primary" :loading="sending" :disabled="!writable" @click="editor.save">保存</el-button></template></div>
   <p v-if="!data.deviceTypeId" class="extension-unbound">当前设备未绑定类型，暂无扩展信息。</p>
   <div v-for="entry in fields" :key="entry.definition.id" class="extension-field">
    <div class="extension-field-label">{{entry.definition.name}} <el-tooltip v-if="entry.definition.description" :content="entry.definition.description" :trigger="['hover','focus']"><el-icon tabindex="0" :aria-label="entry.definition.description"><QuestionFilled/></el-icon></el-tooltip></div>
    <ExtensionScalarInput v-if="editing&&draft" reference :field="entry.definition" :model-value="draft[entry.definition.id]??null" :disabled="sending||!!review||!writable" @update:model-value="change(entry.definition.id,$event)"/>
    <div v-else class="extension-field-value" :class="{'is-unset':entry.effectiveValue===null}"><a v-if="entry.definition.kind==='URL'&&entry.effectiveValue" :href="entry.effectiveValue" target="_blank" rel="noopener noreferrer"><ReferenceIcon glyph="󰌷"/>{{entry.effectiveValue}}</a><template v-else>{{display(entry)}}</template><span v-if="entry.value===null&&entry.effectiveValue!==null" class="extension-default">默认值</span></div>
   </div>
  </template>
 </AsyncState>
</section></template>
<style scoped>.device-extension-values{margin-top:30px;min-width:0}.device-extension-values h2{margin:0;color:#002822;font-size:22px;line-height:32px;font-weight:400}.extension-tips{margin:8px 0 0;color:#888;font-size:15px;line-height:22px}.extension-actions{display:flex;gap:8px;margin-top:12px}.extension-actions .el-button+.el-button{margin-left:0}.extension-field{margin-top:20px;padding-bottom:10px}.extension-field-label{display:flex;gap:5px;align-items:center;font-size:14px;line-height:20px;font-weight:600}.extension-field-label .el-icon{color:#888;outline-offset:3px}.extension-field-value,.extension-field :deep(.extension-scalar-input){margin-top:8px;font-size:16px;line-height:24px;overflow-wrap:anywhere;white-space:pre-wrap}.extension-field-value a{display:inline-flex;align-items:center;gap:4px;max-width:100%;overflow-wrap:anywhere}.extension-field-value a .reference-icon{flex:none;font-size:14px}.is-unset{font-style:italic;color:#6b7280}.extension-unbound{margin:12px 0 0;font-size:14px;line-height:22px;color:#888}.device-extension-values :deep(.extension-scalar-input>.el-input),.device-extension-values :deep(.extension-scalar-input>.el-select){max-width:none;width:100%}.device-extension-values :deep(.extension-scalar-input>.el-date-editor){width:220px;max-width:100%}.extension-default{margin-left:8px;color:#888;font-size:12px}.extension-review{margin:10px 0}.extension-review dt{font-weight:600}.extension-review dd{margin:4px 0 10px;overflow-wrap:anywhere}</style>
