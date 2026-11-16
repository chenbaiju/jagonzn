<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import RuleFunctionCodeEditor from './RuleFunctionCodeEditor.vue'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {projectId as activeProject} from '@/core/session'
import {dataStreamParameterNames,dataStreamTemplate,type DataStreamItem} from '../device-types/data-stream-publication-api'
import {downlinkSampleBytes} from './data-downlink-function-api'
import {useDeviceDataPreviewSample,type DeviceDataPreviewSelection} from './use-device-data-preview-sample'
import {gatewayDataParserSource,normalizeGatewayDataParser,previewGatewayDataParser,type GatewayDataParser,type GatewayDataPreview} from './gateway-data-parser-api'
const props=defineProps<{projectId:string;typeId:string;scopeKey:string;stream:Pick<DataStreamItem,'identifier'|'mqttTopics'>;modelValue?:GatewayDataParser;disabled?:boolean;validationError?:string;top?:string}>()
const emit=defineEmits<{save:[value:GatewayDataParser];cancel:[];busy:[value:boolean]}>()
const deviceSample=useDeviceDataPreviewSample({projectId:()=>props.projectId,typeId:()=>props.typeId,scopeKey:()=>props.scopeKey,streamIdentifier:()=>props.stream.identifier,disabled:()=>!!props.disabled})
const source=ref(props.modelValue?.source??(deviceSample.context.value?gatewayDataParserSource.replace('identifier, data, options','identifier, data'):gatewayDataParserSource)),shown=ref(false),mode=ref<'HEX'|'TEXT'|'JSON'>('HEX'),sample=ref(''),params=ref<Record<string,string>>({}),busy=ref(false),error=ref(''),result=shallowRef<GatewayDataPreview>()
const stream=computed(()=>deviceSample.context.value?deviceSample.member.value?.streams.find(row=>row.identifier===props.stream.identifier):props.stream)
const size=computed(()=>new TextEncoder().encode(source.value).length),names=computed(()=>stream.value?dataStreamParameterNames(stream.value):[])
const editorOpen=ref(true),formatBusy=ref(false),conflicting=computed(()=>busy.value||formatBusy.value)
let alive=true,generation=0,controller:AbortController|undefined
function clear(){generation++;controller?.abort();busy.value=false;error.value='';result.value=undefined}
function close(){if(!busy.value){editorOpen.value=false;formatBusy.value=false;emit('cancel')}}
function save(){if(props.disabled||conflicting.value)return;try{emit('save',normalizeGatewayDataParser({source:source.value}))}catch(cause){error.value=errorMessage(cause)}}
async function preview(){
 if(props.disabled||conflicting.value||props.projectId!==activeProject.value)return
 let raw:Uint8Array,selection:DeviceDataPreviewSelection|undefined;try{selection=deviceSample.capture();if(!stream.value)throw new Error('请选择样例设备已发布的输入流');raw=downlinkSampleBytes(sample.value,mode.value)}catch(cause){error.value=errorMessage(cause);return}
 const s={generation,epoch:identityEpoch(),project:props.projectId,type:props.typeId,scope:props.scopeKey,stream:stream.value!,selection,previewType:selection?.member.deviceTypeId??props.typeId};controller?.abort();controller=new AbortController();busy.value=true;error.value='';result.value=undefined
 const current=()=>alive&&!props.disabled&&generation===s.generation&&identityEpoch()===s.epoch&&activeProject.value===s.project&&props.projectId===s.project&&props.typeId===s.type&&props.scopeKey===s.scope&&stream.value===s.stream&&deviceSample.current(s.selection)
 try{const value=await previewGatewayDataParser({projectId:s.project,deviceTypeId:s.previewType,scopeKey:s.scope},s.stream,source.value,raw,dataStreamTemplate(s.stream)?params.value:undefined,current,controller.signal,s.selection);if(current())result.value=value}catch(cause){if(current()){error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))emit('cancel')}}finally{if(current())busy.value=false}
}
watch(names,value=>{params.value=Object.fromEntries(value.map(name=>[name,'']))},{immediate:true,flush:'sync'})
watch(params,clear,{deep:true,flush:'sync'});watch([source,mode,sample,deviceSample.member],clear,{flush:'sync'})
watch([()=>props.projectId,()=>props.typeId,()=>props.scopeKey,()=>props.stream,()=>props.disabled],()=>{clear();emit('cancel')})
watch(conflicting,value=>emit('busy',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{clear();emit('cancel')});onScopeDispose(()=>{alive=false;clear();dispose()})
</script>
<template><el-dialog :model-value="true" title="配置操作" :width="top?'min(1000px,94vw)':'min(920px,94vw)'" :top="top" :lock-scroll="top===undefined" :close-on-click-modal="false" :close-on-press-escape="!disabled&&!busy" :show-close="!disabled&&!busy" :before-close="close" append-to-body>
 <el-form label-position="top" :disabled="disabled||busy" @submit.prevent="save"><el-form-item label="云函数"><RuleFunctionCodeEditor v-if="editorOpen" v-model="source" ariaLabel="云网关解析函数" :disabled="disabled||busy" @busy="formatBusy=$event"/></el-form-item>
 <p v-if="!deviceSample.context.value" class="help">{{size}} / 65536 UTF8字节。函数接收(identifier, data, options)，返回“子设备地址 → 属性对象”，最多64个地址；返回null或空对象不转发。地址来自网关当前有效绑定，保留大小写与前导零；Topic参数可从options.params读取，不代表子设备身份。</p>
 <el-button link type="primary" :disabled="disabled||conflicting" @click="shown=!shown">测试云函数</el-button>
 <section v-if="shown" class="function-test"><el-form-item v-if="deviceSample.context.value" label="选择模拟的设备"><el-select v-model="deviceSample.sampleDeviceId.value" filterable style="width:100%" aria-label="选择模拟的设备" placeholder="请选择设备" :disabled="disabled||busy"><el-option v-for="member in deviceSample.context.value.members" :key="member.deviceId" :value="member.deviceId" :label="member.name"/></el-select></el-form-item><el-alert v-if="deviceSample.error.value" :title="deviceSample.error.value" type="error" :closable="false"/><p v-if="!deviceSample.context.value" class="help">只模拟函数与输出结构，不查找子设备绑定、不校验模型、不写属性。</p><el-form-item label="模拟设备上报自定义数据"><el-radio-group v-model="mode" aria-label="网关模拟输入格式"><el-radio value="HEX">HEX</el-radio><el-radio value="TEXT">Plaintext</el-radio><el-radio value="JSON">JSON</el-radio></el-radio-group><el-input v-model="sample" type="textarea" :rows="3" aria-label="网关模拟上报数据"/></el-form-item>
 <template v-if="names.length"><p>纯模拟Topic参数</p><el-form-item v-for="name in names" :key="name" :label="name" required><el-input v-model="params[name]" :aria-label="'网关模拟Topic参数 '+name" maxlength="64"/></el-form-item></template>
 <el-button :disabled="disabled||conflicting" :loading="busy" @click="preview">测试</el-button><template v-if="result"><p role="status">模拟输出 {{result.targetCount}} 个地址，不代表子设备属性已写入。</p><pre aria-label="网关模拟子设备属性">{{result.outputJson}}</pre></template></section>
 </el-form><el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="validationError" :title="validationError" type="warning" :closable="false"/><template #footer><el-form :disabled="false"><el-button :disabled="disabled||busy" @click="close">取消</el-button><el-button type="primary" :disabled="disabled||conflicting" @click="save">保存</el-button></el-form></template>
</el-dialog></template>
<style scoped>.help{font-size:13px;color:var(--el-text-color-secondary);line-height:1.7}.function-test{margin:12px 0;padding:16px;background:var(--el-fill-color-light)}.function-test .el-radio-group{display:flex;margin-bottom:12px}.el-form-item{margin-top:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto}:deep(textarea){font-family:ui-monospace,SFMono-Regular,Menlo,monospace}</style>
