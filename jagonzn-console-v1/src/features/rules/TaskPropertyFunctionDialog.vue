<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ArrowDown,ArrowUp,InfoFilled} from '@element-plus/icons-vue'
import {projectId,can} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import RuleFunctionCodeEditor from './RuleFunctionCodeEditor.vue'
import TaskChoiceSelect from './TaskChoiceSelect.vue'
import {defaultTaskPropertyFunctionSource,defaultTaskCloudFunctionSource,defaultTaskCommandFunctionSource,taskPropertyFunctionValue} from './task-property-function'
import {defaultTaskDataFunctionSource} from './task-data-function'
import {previewTaskPropertyFunction,previewTaskDataFunction,previewTaskCommandFunction,type TaskPropertyFunctionPreview} from './task-property-function-api'

const props=withDefaults(defineProps<{modelValue:boolean;value?:unknown;purpose?:'downlink'|'cloud-update'|'data'|'command';busy?:boolean;locked?:boolean;pending?:boolean;error?:string;creationLayout?:boolean}>(),{purpose:'downlink'})
const cloud=computed(()=>props.purpose==='cloud-update')
const data=computed(()=>props.purpose==='data')
const command=computed(()=>props.purpose==='command')
const sourceLabel=computed(()=>command.value?'命令下发函数源码':data.value?'自定义数据下发函数源码':cloud.value?'属性更新函数源码':'属性下发函数源码')
const outputLabel=computed(()=>command.value?'命令下发函数模拟输出':data.value?'自定义数据下发函数模拟输出':cloud.value?'属性更新函数模拟输出':'属性下发函数模拟输出')
const emit=defineEmits<{'update:modelValue':[value:boolean];save:[value:ReturnType<typeof taskPropertyFunctionValue>];verify:[];busy:[value:boolean];denied:[cause:ApiError]}>()
const source=ref(''),shown=ref(false),sample=ref<string[]>([]),previewBusy=ref(false),formatBusy=ref(false),localError=ref(''),result=shallowRef<TaskPropertyFunctionPreview>()
const externalBlocked=computed(()=>props.busy||props.locked||props.pending),conflicting=computed(()=>externalBlocked.value||previewBusy.value||formatBusy.value)
let live=true,generation=0,controller:AbortController|undefined
function cancelPreview(){generation++;controller?.abort();controller=undefined;previewBusy.value=false;result.value=undefined;localError.value=''}
function clear(){cancelPreview();source.value='';sample.value=[];shown.value=false;formatBusy.value=false}
watch(()=>props.modelValue,open=>{
 clear();if(!open)return
 try{source.value=props.value===undefined?(command.value?defaultTaskCommandFunctionSource:data.value?defaultTaskDataFunctionSource:cloud.value?defaultTaskCloudFunctionSource:defaultTaskPropertyFunctionSource):taskPropertyFunctionValue(props.value).source}catch(cause){localError.value=errorMessage(cause)}
},{immediate:true})
watch([source,sample],cancelPreview,{flush:'sync'})
watch(()=>previewBusy.value||formatBusy.value,value=>emit('busy',value),{immediate:true,flush:'sync'})
watch([projectId,()=>can('task:manage')],()=>{clear();emit('update:modelValue',false)})
const dispose=onIdentityChange(()=>{clear();emit('update:modelValue',false)})
onScopeDispose(()=>{live=false;clear();dispose();emit('busy',false)})
function close(){if(props.busy||props.pending||previewBusy.value||formatBusy.value)return;clear();emit('update:modelValue',false)}
function save(){if(!props.modelValue||conflicting.value)return;try{emit('save',taskPropertyFunctionValue({format:'COMMON_JS',source:source.value}))}catch(cause){localError.value=errorMessage(cause)}}
function denied(cause:ApiError){if([401,403].includes(cause.status)){clear();emit('update:modelValue',false)}emit('denied',cause)}
async function preview(){
 if(!props.modelValue||conflicting.value||!can('task:manage')||!projectId.value)return
 let input:ReturnType<typeof taskPropertyFunctionValue>
 try{input=taskPropertyFunctionValue({format:'COMMON_JS',source:source.value});if(sample.value.length!==1)throw new Error('请选择模拟的设备。')}catch(cause){localError.value=errorMessage(cause);return}
 cancelPreview();controller=new AbortController();const signal=controller.signal,turn=generation,epoch=identityEpoch(),project=projectId.value,device=sample.value[0]!
 const purpose=props.purpose
 const current=()=>live&&props.modelValue&&!externalBlocked.value&&generation===turn&&identityEpoch()===epoch&&projectId.value===project&&can('task:manage')&&sample.value[0]===device&&source.value===input.source&&props.purpose===purpose
 previewBusy.value=true
 try{const value=await (purpose==='command'?previewTaskCommandFunction:purpose==='data'?previewTaskDataFunction:previewTaskPropertyFunction)(project,device,input.source,signal);if(current())result.value=value}catch(cause){if(current()){localError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))denied(cause)}}finally{if(current())previewBusy.value=false}
}
</script>
<template>
 <el-dialog :model-value="modelValue" class="task-property-function-dialog" :class="{'task-data-function-dialog':data,'task-create-function-dialog':creationLayout}" title="配置操作" width="min(800px,94vw)" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!pending&&!previewBusy&&!formatBusy" :show-close="!busy&&!pending&&!previewBusy&&!formatBusy" destroy-on-close append-to-body @update:model-value="close">
  <el-form v-if="modelValue" label-position="top" :disabled="externalBlocked||previewBusy" @submit.prevent="save">
   <div v-if="data" class="tl-learning-resource task-function-learning"><el-icon><InfoFilled/></el-icon><a href="https://www.thingscloud.xyz/docs/guide/tasks/data-set.html" target="_blank" rel="noopener noreferrer">学习自定义数据下发的云函数示例 ↗</a></div>
   <el-form-item :label="command?'使用云函数构造下发命令':data?'使用云函数构造下发自定义数据':cloud?'使用云函数构造更新属性':'使用云函数构造下发属性'"><RuleFunctionCodeEditor v-model="source" :ariaLabel="sourceLabel" :disabled="externalBlocked||previewBusy" @busy="formatBusy=$event"/></el-form-item>
   <el-button link type="primary" :disabled="conflicting" @click="shown=!shown">测试云函数<el-icon><ArrowUp v-if="shown"/><ArrowDown v-else/></el-icon></el-button>
   <section v-if="shown" class="task-function-test">
    <p><a href="https://www.thingscloud.xyz/blog/feature-rule-cloud-function-online-debug/" target="_blank" rel="noopener noreferrer">学习如何模拟测试云函数？ ↗</a></p>
    <el-form-item label="选择模拟的设备"><TaskChoiceSelect v-if="modelValue" v-model="sample" kind="devices" :multiple="false" :maximum="1" :disabled="conflicting" placeholder="请选择设备" @denied="denied"/></el-form-item>
    <el-button :loading="previewBusy" :disabled="conflicting||sample.length!==1" @click="preview">测试</el-button>
    <template v-if="result"><p role="status">{{result.status==='SUCCESS'?(command?'测试完成，仅模拟函数输出，不代表命令已下发。':data?'测试完成，仅模拟函数输出，不代表自定义数据已下发。':cloud?'测试完成，仅模拟函数输出，不代表云端属性已更新。':'测试完成，仅模拟函数输出，不代表属性已下发。'):'函数测试未成功'+(result.errorCode?'（'+result.errorCode+'）':'')}}</p><pre v-if="result.status==='SUCCESS'" :aria-label="outputLabel">{{result.outputJson===null?'null':result.outputJson}}</pre></template>
   </section>
  </el-form>
  <el-alert v-if="localError||error" :title="localError||error" type="warning" :closable="false"/>
  <template #footer><el-button :disabled="busy||pending||previewBusy||formatBusy" @click="close">取消</el-button><el-button v-if="pending" :disabled="busy" @click="emit('verify')">重新读取核对</el-button><el-button type="primary" :loading="busy" :disabled="conflicting" @click="save">完成</el-button></template>
 </el-dialog>
</template>
<style scoped>
.task-function-test{margin-top:12px}.task-function-test p{font-size:13px;line-height:20px;color:#606266}.task-function-test pre{max-height:260px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
.task-function-learning{margin:0 0 24px;font-size:14px;line-height:20px}.task-data-function-dialog :deep(.el-form-item__label){font-weight:700}
.task-property-function-dialog :deep(.el-dialog__header){padding:20px 20px 10px}.task-property-function-dialog :deep(.el-dialog__title){font-size:18px;font-weight:400}.task-property-function-dialog :deep(.el-dialog__body){padding:30px 20px}.task-property-function-dialog :deep(.el-dialog__footer){padding:10px 20px 20px}
:global(.el-dialog.task-create-function-dialog) { display: flex; flex-direction: column; min-height: min(600px, 80vh); }
:global(.task-create-function-dialog > .el-dialog__body) { flex: 1; padding-top: 37px; }
:global(.task-create-function-dialog .el-form-item:has(.function-code-editor)) { margin-bottom: 30px; }
:global(.task-create-function-dialog .el-form-item__label) { font-weight: 600; }
</style>
