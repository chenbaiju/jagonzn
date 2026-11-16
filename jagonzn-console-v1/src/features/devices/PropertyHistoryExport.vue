<script setup lang="ts">
import {ref,shallowRef,computed,watch,onScopeDispose} from 'vue'
import {Download} from '@element-plus/icons-vue'
import {projectId,can} from '@/core/session'
import {ApiError,IdentityChanged,identityEpoch,assertIdentity,onIdentityChange,errorMessage} from '@/core/http'
import {readPropertyHistoryExport,downloadPropertyHistory} from './property-history-export'
const props=defineProps<{deviceId:string;propertyKey:string;modelVersionId:string;from:string;to:string;propertyName?:string}>()
const emit=defineEmits<{close:[];unavailable:[cause:unknown]}>()
const milliseconds=ref(false),format=ref<'xlsx'|'csv'>('xlsx'),busy=ref(false),count=ref(0),error=shallowRef<unknown>()
const allowed=computed(()=>can('device:read'))
let sequence=0,controller:AbortController|undefined
function cancel(){sequence++;controller?.abort();controller=undefined;busy.value=false;count.value=0;error.value=undefined}
function close(){cancel();emit('close')}
function deny(cause:unknown){cancel();emit('unavailable',cause);emit('close')}
async function save(){
 if(busy.value||!allowed.value)return
 cancel();const request=++sequence,identity=identityEpoch(),query={project:projectId.value,device:props.deviceId,model:props.modelVersionId,property:props.propertyKey,from:props.from,to:props.to},showMs=milliseconds.value,type=format.value,name=props.propertyName
 controller=new AbortController();const signal=controller.signal;busy.value=true
 try{
  const result=await readPropertyHistoryExport(query,signal,value=>{if(request===sequence&&!signal.aborted)count.value=value})
  assertIdentity(identity);if(request!==sequence||signal.aborted||!allowed.value)return
  if(!result.items.length)throw new Error('当前时间范围内无历史数据')
  downloadPropertyHistory(result,showMs,type,name);close()
 }catch(cause){if(request===sequence&&!signal.aborted&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){deny(cause);return}
  error.value=cause instanceof DOMException&&cause.name==='TimeoutError'?new Error('历史导出超过30秒读取预算，请缩小时间范围'):cause
 }}finally{if(request===sequence)busy.value=false}
}
const disposeIdentity=onIdentityChange(()=>deny(new IdentityChanged()))
watch(()=>[projectId.value,props.deviceId,props.propertyKey,props.modelVersionId,props.from,props.to],close)
watch(allowed,value=>{if(!value)deny(new ApiError('当前账号已无历史读取权限',403))},{flush:'sync'})
onScopeDispose(()=>{cancel();disposeIdentity()})
</script>
<template><el-dialog :model-value="true" title="导出数据" width="500px" class="property-history-export" append-to-body :close-on-click-modal="false" @close="close">
 <el-alert title="在线导出最多读取所选时间段的前5000条历史记录。可缩小时间范围读取更多记录。" type="info" :closable="false" show-icon/>
 <p class="export-scope">导出包含该属性的所有来源类型，不受列表类型筛选和操作用户选项影响。时间显示为 Asia/Shanghai，另保留原始时区与纳秒时间。导出期间新到的数据请重新导出。</p>
 <el-form label-position="top"><el-form-item label="时间包含毫秒"><el-switch v-model="milliseconds" :disabled="busy" aria-label="时间包含毫秒"/></el-form-item><el-form-item label="导出文件类型"><el-radio-group v-model="format" :disabled="busy"><el-radio value="xlsx">Excel</el-radio><el-radio value="csv">CSV</el-radio></el-radio-group></el-form-item></el-form>
 <p v-if="busy" role="status">正在读取 {{count}} 条历史记录…</p><p v-if="error" role="alert" class="export-error">{{errorMessage(error)}}</p>
 <template #footer><el-button @click="close">取消</el-button><el-button type="primary" :icon="Download" :loading="busy" :disabled="!allowed" @click="save">{{busy?'正在导出...':'导出'}}</el-button></template>
</el-dialog></template>
<style scoped>:global(.el-dialog.property-history-export){max-width:calc(100vw - 32px);}.export-scope{color:var(--tl-muted);font-size:12px;line-height:1.7;margin:12px 0 20px;}.export-error{color:var(--el-color-danger);overflow-wrap:anywhere;}</style>
