<script setup lang="ts">
import {onScopeDispose,ref,watch} from 'vue'
import {errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import {readTypeDevices} from '../device-types/type-devices-api'
import {readSubdeviceDataPreviewSource,type SubdeviceDataPreviewSource} from './data-property-preview-api'
const props=defineProps<{projectId:string;typeId:string;scopeKey:string;streamIdentifier:string;disabled?:boolean}>()
const emit=defineEmits<{source:[value:SubdeviceDataPreviewSource|undefined];busy:[value:boolean]}>()
const page=ref(1),keyword=ref(''),search=ref(''),selected=ref(''),loading=ref(false),error=ref(''),source=ref<SubdeviceDataPreviewSource>()
const directory=useResource(signal=>readTypeDevices(props.projectId,props.typeId,{page:page.value,limit:24,keyword:search.value},signal))
let generation=0,alive=true,controller:AbortController|undefined
function clearSource(){generation++;controller?.abort();source.value=undefined;loading.value=false;error.value='';emit('source',undefined)}
function load(next=1){if(props.disabled||loading.value||!Number.isInteger(next)||next<1||next>10000)return;clearSource();selected.value='';page.value=next;directory.clear();void directory.reload()}
function searchDevices(){search.value=keyword.value;load()}
async function choose(){clearSource();if(props.disabled||!directory.data.value?.items.some(row=>row.id===selected.value))return;const s={generation,epoch:identityEpoch(),project:props.projectId,type:props.typeId,scope:props.scopeKey,child:selected.value,stream:props.streamIdentifier};controller=new AbortController();loading.value=true
 const current=()=>alive&&!props.disabled&&generation===s.generation&&identityEpoch()===s.epoch&&props.projectId===s.project&&props.typeId===s.type&&props.scopeKey===s.scope&&selected.value===s.child&&props.streamIdentifier===s.stream
 try{const value=await readSubdeviceDataPreviewSource(s.project,s.type,s.child,s.stream,current,controller.signal);if(current()){source.value=value;emit('source',value)}}catch(cause){if(current())error.value=errorMessage(cause)}finally{if(current())loading.value=false}
}
function reset(){clearSource();directory.clear();selected.value='';keyword.value='';search.value='';page.value=1;if(!props.disabled)load()}
watch(selected,()=>{void choose()},{flush:'sync'})
watch([()=>props.projectId,()=>props.typeId,()=>props.scopeKey,()=>props.streamIdentifier],reset,{immediate:true,flush:'sync'})
watch([loading,directory.loading],()=>emit('busy',loading.value||directory.loading.value),{immediate:true})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clearSource();directory.clear();dispose();emit('busy',false)})
</script>
<template><section class="subdevice-data-preview-picker"><h4>选择实际子设备样例</h4><el-input v-model="keyword" aria-label="操作模拟子设备搜索" maxlength="128" placeholder="搜索当前类型子设备"/><el-button :disabled="disabled||loading||directory.loading.value" @click="searchDevices">搜索子设备</el-button><el-alert v-if="directory.error.value||error" :title="error||errorMessage(directory.error.value)" type="error" :closable="false"/>
 <el-select v-model="selected" aria-label="操作模拟实际子设备" :loading="loading||directory.loading.value" :disabled="disabled||directory.loading.value" placeholder="选择本页实际子设备"><el-option v-for="child in directory.data.value?.items??[]" :key="child.id" :value="child.id" :label="child.name+' · '+child.id"/></el-select><p>第 {{page}} 页，每页24台。模拟读取当前网关的数据流；实际执行仍以该次上报连接为准。</p><el-button :disabled="disabled||loading||directory.loading.value||page<=1" @click="load(page-1)">上一页子设备</el-button><el-button :disabled="disabled||loading||directory.loading.value||!directory.data.value||BigInt(directory.data.value.total??'0')<=BigInt(page*24)" @click="load(page+1)">下一页子设备</el-button>
 <p v-if="source">已读取 {{directory.data.value?.items.find(child=>child.id===source!.subDeviceId)?.name??'已选子设备'}} 的有效标准网关数据流。</p>
</section></template>
<style scoped>.subdevice-data-preview-picker{padding:12px 0}.subdevice-data-preview-picker p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}.subdevice-data-preview-picker .el-select{width:100%;margin-top:10px}</style>
