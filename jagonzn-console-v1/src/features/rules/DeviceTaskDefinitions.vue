<script setup lang="ts">
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRouter} from 'vue-router'
import {computed,onScopeDispose,reactive,ref,watch} from 'vue'
import {InfoFilled,Plus,Refresh} from '@element-plus/icons-vue'
import {can,projectId} from '@/core/session'
import {useResource} from '@/core/use-resource'
import {ApiError,IdentityChanged,onIdentityChange} from '@/core/http'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import DeviceTaskDefinitionCard from './DeviceTaskDefinitionCard.vue'
import {deviceTaskDefinitionPage,type DeviceTaskDefinitionFilters,type DeviceTaskDefinitionPort} from './device-task-definition-port'
const props=defineProps<{deviceId:string;deviceName?:string;transport:DeviceTaskDefinitionPort;createTask?:()=>void}>()
const router=useRouter()
const blank=():DeviceTaskDefinitionFilters=>({relation:'',taskType:'',status:''})
const filters=ref(blank()),applied=ref(blank()),cursors=ref<(string|undefined)[]>([undefined]),busyCards=reactive<Record<string,boolean>>({})
const rereading=ref(false),rereadTarget=ref('');let rereadGeneration=0
const allowed=computed(()=>!!projectId.value&&!!props.deviceId&&can('task:read')),busy=computed(()=>rereading.value||Object.values(busyCards).some(Boolean))
const canCreate=computed(()=>!!props.createTask||!!(props.transport.create&&props.transport.definition))
const resource=useResource(async signal=>{const target=rereadTarget.value;const page=deviceTaskDefinitionPage(await props.transport.read(projectId.value,props.deviceId,{...applied.value},cursors.value.at(-1),signal),cursors.value);if(target&&[target,...Object.keys(busyCards).filter(id=>busyCards[id])].some(id=>!page.items.some(row=>row.id===id)))throw new Error('当前目录未找到待核对任务，原结果仍待核对');return page})
function resetBusy(){rereadGeneration++;rereading.value=false;rereadTarget.value='';for(const id of Object.keys(busyCards))delete busyCards[id]}
async function search(){if(!allowed.value||busy.value)return;applied.value={...filters.value};cursors.value=[undefined];resource.clear();resetBusy();await resource.reload()}
/** 人工回读保留原卡片及未知锁；父定义成功不代表偏好已核对。 */
async function refreshContext(id:string){
 if(!allowed.value)throw new IdentityChanged()
 if(rereading.value)throw new Error('另一个卡片正在核对，请稍后重新读取')
 const turn=++rereadGeneration;rereadTarget.value=id;rereading.value=true
 try{await resource.reload();if(turn!==rereadGeneration)throw new IdentityChanged();if(resource.error.value){const cause=resource.error.value;if(cause instanceof ApiError&&[401,403,404].includes(cause.status))denied(cause);throw cause}}
 finally{if(turn===rereadGeneration){rereading.value=false;rereadTarget.value=''}}
}
async function next(){const cursor=resource.data.value?.nextCursor;if(!allowed.value||busy.value||resource.loading.value||!cursor)return;cursors.value.push(cursor);resource.clear();await resource.reload()}
async function previous(){if(!allowed.value||busy.value||resource.loading.value||cursors.value.length<2)return;cursors.value.pop();resource.clear();await resource.reload()}
function cardBusy(id:string,value:boolean){if(resource.data.value?.items.some(row=>row.id===id))busyCards[id]=value}
function denied(cause:ApiError){resource.clear();resetBusy();resource.error.value=cause}
function openCreate(){if(busy.value||!can('task:manage')||!canCreate.value)return;if(props.createTask)props.createTask();else void router.push({path:'/tasks/jobs/create',query:{source:'device',deviceId:props.deviceId}})}
/** 同范围写在途及未知不能由普通导航卸载；身份变化沿原清理边界退出旧范围。 */
function resetScope(reload=true){resource.clear();filters.value=blank();applied.value=blank();cursors.value=[undefined];resetBusy();if(reload&&allowed.value)void resource.reload()}
const releaseIdentity=onIdentityChange(()=>resetScope(false));onScopeDispose(releaseIdentity)
onBeforeRouteLeave(()=>!busy.value);onBeforeRouteUpdate(()=>!busy.value)
function beforeUnload(event:BeforeUnloadEvent){if(busy.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
watch([projectId,()=>props.deviceId,allowed],()=>resetScope(),{immediate:true})
const filtered=computed(()=>Object.values(applied.value).some(Boolean))
</script>
<template><section class="device-task-definitions">
  <div class="device-definition-learning"><el-icon aria-hidden="true"><InfoFilled/></el-icon><span>学习资源：</span><a href="https://www.thingscloud.xyz/docs/guide/tasks/overview.html" target="_blank" rel="noopener noreferrer">什么是任务？ ↗</a></div>
  <div v-if="allowed" class="device-definition-toolbar"><div class="device-definition-filters">
    <el-select v-model="filters.relation" size="small" :empty-values="[null,undefined]" aria-label="任务关联范围" :disabled="busy" @change="search"><el-option value="" label="所有关联任务"/><el-option value="DEVICE" label="设备任务"/><el-option value="DEVICE_TYPE" label="所属设备类型任务"/></el-select>
    <el-select v-model="filters.taskType" size="small" :empty-values="[null,undefined]" aria-label="任务类型" :disabled="busy" @change="search"><el-option value="" label="不限任务类型"/><el-option value="PROPERTY_SET" label="属性下发"/><el-option value="CLOUD_UPDATE" label="属性更新"/><el-option value="COMMAND" label="命令下发"/><el-option value="DATA_DOWNLINK" label="自定义数据下发"/></el-select>
    <el-select v-model="filters.status" size="small" :empty-values="[null,undefined]" aria-label="任务状态" :disabled="busy" @change="search"><el-option value="" label="不限任务状态"/><el-option value="ACTIVE" label="已启用"/><el-option value="PAUSED" label="未启用"/></el-select>
  </div><div class="device-definition-actions"><el-button size="small" :icon="Refresh" :loading="resource.loading.value" :disabled="busy" @click="search">刷新</el-button><el-button v-if="can('task:manage')" size="small" type="primary" :icon="Plus" :disabled="busy||!canCreate" :title="!canCreate?'设备上下文创建入口尚未开放':undefined" @click="openCreate">创建任务</el-button></div></div>
  <AsyncState :forbidden="!allowed" :loading="resource.loading.value&&!resource.data.value" :error="resource.data.value?undefined:resource.error.value" @retry="search">
    <div v-if="resource.data.value&&!resource.data.value.items.length" class="device-definition-empty"><img src="/reference/empty-content.png" alt=""/><h2>{{filtered?'没有符合条件的任务':'让设备批量或定时执行任务'}}</h2><p>通过任务，您可以从云端下发消息或控制指令到设备，触发设备完成各类操作。</p><el-button v-if="can('task:manage')" type="primary" :disabled="!canCreate" @click="openCreate">创建任务</el-button></div>
    <div v-else-if="resource.data.value" class="device-task-card-grid"><DeviceTaskDefinitionCard v-for="row in resource.data.value.items" :key="row.id" :row="row" :device-id="deviceId" :device-name="deviceName" :transport="transport" :refresh-context="()=>refreshContext(row.id)" @busy="cardBusy" @denied="denied"/></div>
    <p v-else-if="allowed" class="tl-muted" role="status">请刷新读取当前设备任务。</p>
    <CursorPager v-if="resource.data.value&&(resource.data.value.hasMore||cursors.length>1)" :page="cursors.length" :has-next="resource.data.value.hasMore" :loading="resource.loading.value||busy" :show-sizes="false" :show-pages="false" @next="next" @previous="previous"/>
  </AsyncState>
</section></template>
<style scoped>
.device-definition-learning{display:flex;align-items:center;gap:6px;margin:10px 0 20px;border-left:2px solid var(--tl-primary);border-radius:4px;padding:10px 14px;background:#ebf0ff;color:#888;font-size:13px}.device-definition-learning a{color:var(--tl-primary)}.device-definition-toolbar{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:10px}.device-definition-filters,.device-definition-actions{display:flex;gap:8px;flex-wrap:wrap}.device-definition-filters .el-select{width:150px}.device-definition-actions .el-button+.el-button{margin-left:0}.device-task-card-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:20px}.device-definition-empty{text-align:center;padding:60px 20px}.device-definition-empty img{width:160px}.device-definition-empty h2{font-size:26px;font-weight:400;color:#002822;line-height:36px;margin:20px 0 0}.device-definition-empty p{font-size:14px;line-height:22px;color:#999;max-width:680px;margin:12px auto 20px}@media(min-width:768px){.device-task-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:992px){.device-task-card-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:1920px){.device-task-card-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
</style>
