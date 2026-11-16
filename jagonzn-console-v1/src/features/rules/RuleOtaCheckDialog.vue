<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,projectId,session} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {ActionDraft} from './RuleActionsEditor.vue'
import type {RuleSourceInput} from './rule-source-selection'
import {deviceSourceMembers,type RuleDeviceSourceContract} from './rule-source-api'
import {otaRuleSource,otaVersionPropertyKey,readRuleOtaVersionProperties} from './rule-ota-version-properties'

const props=withDefaults(defineProps<{action:ActionDraft;source:RuleSourceInput|RuleDeviceSourceContract;disabled?:boolean;validationError?:string;top?:string}>(),{disabled:false})
const emit=defineEmits<{save:[action:ActionDraft];cancel:[];busy:[value:boolean]}>()
const versionProperty=ref(''),module=ref('main'),choices=ref<readonly string[]>([]),loading=ref(false),error=ref(''),candidateError=ref('')
const permitted=computed(()=>!!projectId.value&&can('rule:manage'))
let turn=0,active=true,controller:AbortController|undefined
function stop(){turn++;controller?.abort();choices.value=[];loading.value=false;emit('busy',false)}
function sourceKey(){try{const source=otaRuleSource(props.source);return source.kind+':'+deviceSourceMembers(source).join(',')}catch{return ''}}
async function reset(){
 stop();versionProperty.value=typeof props.action.config.versionProperty==='string'?props.action.config.versionProperty:'';module.value=typeof props.action.config.module==='string'?props.action.config.module:'main';error.value='';candidateError.value=''
 if(!permitted.value){versionProperty.value='';module.value='main';return}
 const generation=turn,epoch=identityEpoch(),actor=session.user?.accountId,project=projectId.value,source=sourceKey();controller=new AbortController();const signal=controller.signal
 const current=()=>active&&generation===turn&&epoch===identityEpoch()&&actor===session.user?.accountId&&project===projectId.value&&source===sourceKey()&&permitted.value&&!signal.aborted
 loading.value=true;emit('busy',true)
 try{const result=await readRuleOtaVersionProperties(project,props.source,signal);if(current())choices.value=result}catch(cause){if(current()){choices.value=[];candidateError.value=errorMessage(cause)+'；可手动填写版本属性，保存时将按完整来源核对。';if(cause instanceof ApiError&&[401,403,404].includes(cause.status))choices.value=[]}}finally{if(current()){loading.value=false;emit('busy',false)}}
}
watch([()=>props.action,sourceKey,projectId,()=>session.user?.accountId,permitted],()=>{void reset()},{immediate:true,deep:true})
const dispose=onIdentityChange(()=>{stop();versionProperty.value='';module.value='main';error.value='当前身份已变化，请关闭后重新配置。';candidateError.value=''})
function suggestions(query:string,done:(values:{value:string}[])=>void){done(choices.value.filter(key=>key.toLowerCase().includes(query.toLowerCase())).map(value=>({value})))}
function save(){
 if(props.disabled||!permitted.value)return
 try{if(props.action.nodeType!=='event-ota-check-action')throw new Error('操作类型不匹配');otaRuleSource(props.source);if(!otaVersionPropertyKey.test(versionProperty.value))throw new Error('版本属性须为1至32位英文字母、数字、下划线或短横线');if(module.value!=='main')throw new Error('当前仅支持 main 主应用模块的OTA检查');error.value='';emit('save',{id:props.action.id,nodeType:props.action.nodeType,config:{versionProperty:versionProperty.value,module:module.value}})}catch(cause){error.value=errorMessage(cause)}
}
function cancel(){if(props.disabled)return;stop();versionProperty.value='';module.value='main';emit('cancel')}
onScopeDispose(()=>{active=false;stop();dispose()})
</script>
<template><el-dialog :model-value="true" title="配置操作" :top="top" :lock-scroll="top===undefined" width="800px" class="rule-ota-check-dialog" :close-on-click-modal="false" :close-on-press-escape="!disabled" :show-close="!disabled" :before-close="cancel" append-to-body>
 <el-form label-position="top" :disabled="disabled||!permitted" @submit.prevent="save">
  <el-form-item><template #label>版本属性 <el-tooltip content="选择记录设备当前版本号的属性标识符，用于消息规则计算是否有可用的新版本。"><span class="help-mark" tabindex="0">?</span></el-tooltip></template>
   <el-autocomplete v-model="versionProperty" :fetch-suggestions="suggestions" :trigger-on-focus="true" aria-label="版本属性" :maxlength="32" :loading="loading"/>
  </el-form-item>
  <el-form-item><template #label>模块 <el-tooltip content="对应 OTA 版本库中的模块标识符，适用于多模块固件升级场景。"><span class="help-mark" tabindex="0">?</span></el-tooltip></template><el-input v-model="module" aria-label="模块"/></el-form-item>
 </el-form>
 <el-alert v-if="candidateError" :title="candidateError" type="warning" :closable="false"/>
 <el-alert v-if="error" :title="error" type="warning" :closable="false"/>
 <el-alert v-if="validationError" :title="validationError" type="warning" :closable="false"/><template #footer><el-button :disabled="disabled" @click="cancel">取消</el-button><el-button type="primary" :disabled="disabled||!permitted" @click="save">保存</el-button></template>
</el-dialog></template>
<style scoped>
.rule-ota-check-dialog .el-form-item{margin-bottom:22px}.rule-ota-check-dialog :deep(.el-form-item__label){font-size:14px;font-weight:400;color:#606266;line-height:40px;padding-bottom:10px}.rule-ota-check-dialog :deep(.el-autocomplete){width:100%}.rule-ota-check-dialog :deep(.el-input__wrapper){height:40px;min-height:40px;padding:0 15px}.rule-ota-check-dialog :deep(.el-input__inner){font-size:14px;color:#606266}.help-mark{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1px solid #909399;border-radius:50%;font-size:11px;line-height:12px;color:#909399;margin-left:5px}
</style>
