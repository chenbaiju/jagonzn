<script setup lang="ts">
import {computed,nextTick,onScopeDispose,ref,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {InfoFilled,Refresh,Plus} from '@element-plus/icons-vue'
import {can,projectId,currentProject} from '@/core/session'
import {useResource} from '@/core/use-resource'
import {onIdentityChange,type ApiError} from '@/core/http'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import {deviceScenePage,type DeviceSceneDefinition,type DeviceSceneFilters,type DeviceSceneDefinitionPort} from './device-scene-definition-port'
import {useDeviceSceneRunState,type DeviceSceneRunIdentity} from './device-scene-run-state'
const props=defineProps<{deviceId:string;deviceName?:string;transport:DeviceSceneDefinitionPort;createScene?:()=>void;openScene?:(id:string)=>void}>()
const emit=defineEmits<{busy:[value:boolean]}>()
const blank=():DeviceSceneFilters=>({status:'',name:''})
const filters=ref(blank()),applied=ref(blank()),cursors=ref<(string|undefined)[]>([undefined]),selected=ref<DeviceSceneRunIdentity|null>(null),selectedName=ref('')
const allowed=computed(()=>!!projectId.value&&!!props.deviceId&&can('rule:manage'))
const writable=computed(()=>allowed.value&&currentProject.value?.status==='ACTIVE')
const resource=useResource(async signal=>deviceScenePage(await props.transport.read(projectId.value,props.deviceId,{...applied.value},cursors.value.at(-1),signal),props.deviceId,cursors.value))
function denied(cause:ApiError){selected.value=null;selectedName.value='';resource.clear();resource.error.value=cause}
async function rereadDefinition(){
 resource.clear();await resource.reload()
 if(resource.error.value)throw resource.error.value
 const row=resource.data.value?.items.find(item=>item.id===selected.value?.sceneId)
 selected.value=row?identity(row):null;selectedName.value=row?.name||''
}
const run=useDeviceSceneRunState(selected,props.transport,rereadDefinition,denied)
const busy=computed(()=>run.blocked.value)
watch(busy,value=>emit('busy',value),{immediate:true})
function identity(row:DeviceSceneDefinition):DeviceSceneRunIdentity{return {sceneId:row.id,deviceId:props.deviceId,versionId:row.activeVersionId,definitionVersion:row.definitionVersion,status:row.status}}
async function openRun(row:DeviceSceneDefinition){if(!writable.value||busy.value)return;selected.value=identity(row);selectedName.value=row.name;await nextTick();if(writable.value&&selected.value?.sceneId===row.id)run.open()}
async function search(){if(!allowed.value||busy.value||filters.value.name.length>128)return;applied.value={...filters.value};cursors.value=[undefined];resource.clear();await resource.reload()}
async function next(){const cursor=resource.data.value?.nextCursor;if(!allowed.value||busy.value||resource.loading.value||!cursor)return;cursors.value.push(cursor);resource.clear();await resource.reload()}
async function previous(){if(!allowed.value||busy.value||resource.loading.value||cursors.value.length<2)return;cursors.value.pop();resource.clear();await resource.reload()}
function create(){if(writable.value&&!busy.value)props.createScene?.()}
function detail(id:string){if(allowed.value&&!busy.value)props.openScene?.(id)}
/** 身份更替清旧私有范围；普通路由不能卸载在途或未知执行。 */
function resetScope(reload=true,keepPending=false){if(!keepPending)selected.value=null;selectedName.value='';filters.value=blank();applied.value=blank();cursors.value=[undefined];resource.clear();if(reload&&allowed.value)void resource.reload()}
const releaseIdentity=onIdentityChange(()=>resetScope(false));onScopeDispose(releaseIdentity)
onBeforeRouteLeave(()=>!busy.value);onBeforeRouteUpdate(()=>!busy.value)
function beforeUnload(event:BeforeUnloadEvent){if(busy.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
watch([projectId,()=>props.deviceId],()=>resetScope(),{immediate:true})
// 临时撤权只保留未决请求的内部身份，不保留名称或列表；切换作用域仍全部清除。
watch(allowed,value=>{if(!value)resetScope(false,run.locked.value||run.writing.value||run.checking.value);else{resource.clear();void resource.reload()}})
</script>
<template><section class="device-scene-definitions">
 <div class="scene-learning"><el-icon aria-hidden="true"><InfoFilled/></el-icon><span>学习资源：</span><a href="https://www.thingscloud.xyz/docs/guide/automations/overview.html" target="_blank" rel="noopener noreferrer">什么是场景？ ↗</a></div>
 <div v-if="allowed" class="scene-toolbar"><div class="scene-filters">
  <el-select v-model="filters.status" size="small" :empty-values="[null,undefined]" aria-label="场景状态" :disabled="busy" @change="search"><el-option value="" label="全部"/><el-option value="ACTIVE" label="正常"/><el-option value="PAUSED" label="已停用"/></el-select>
  <el-input v-model="filters.name" size="small" placeholder="搜索名称/描述" aria-label="搜索场景名称或描述" :maxlength="128" clearable :disabled="busy" @keyup.enter="search" @clear="search"/>
 </div><div class="scene-actions"><el-button size="small" :icon="Refresh" :loading="resource.loading.value" :disabled="busy" @click="search">刷新</el-button><el-button v-if="createScene" size="small" type="primary" :icon="Plus" :disabled="busy||!writable" @click="create">创建场景</el-button></div></div>
 <p v-if="run.error.value&&allowed" role="alert">{{run.error.value}}</p><p v-if="run.notice.value&&allowed" role="status">{{run.notice.value}}</p>
 <el-button v-if="run.locked.value&&allowed" size="small" :loading="run.checking.value" :disabled="run.busy.value" @click="run.verify">{{run.definitionStale.value?'重新读取场景定义':'核对同次执行结果'}}</el-button>
 <AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="search">
  <div v-if="resource.data.value&&!resource.data.value.items.length" class="scene-empty"><img src="/reference/empty-content.png" alt=""/><h2>{{applied.status||applied.name?'没有符合条件的场景':'一键执行标准操作流程'}}</h2><p>创建场景，在动作中使用该设备，将常用的操作步骤保存为标准化流程，需要时一键执行。</p><el-button v-if="createScene" type="primary" :disabled="busy||!writable" @click="create">创建场景</el-button></div>
  <div v-else-if="resource.data.value" class="scene-grid"><article v-for="row in resource.data.value.items" :key="row.id" class="scene-card">
   <header><button v-if="openScene" type="button" class="scene-name" :disabled="busy" @click="detail(row.id)">{{row.name}}</button><strong v-else class="scene-name">{{row.name}}</strong><span>{{row.status==='ACTIVE'?'正常':'已停用'}}</span></header>
   <p class="scene-kind">场景{{row.deviceScope.kind==='DEVICE'?' - 设备':row.deviceScope.kind==='DEVICE_TYPE'?' - 设备类型':''}}</p><p class="scene-version">版本 {{row.versionNumber}}</p>
   <footer><el-button size="small" type="primary" :disabled="busy||!writable||row.status!=='ACTIVE'" @click="openRun(row)">运行场景</el-button></footer>
  </article></div>
  <CursorPager v-if="resource.data.value&&((resource.data.value.items.length&&resource.data.value.hasMore)||cursors.length>1)" :page="cursors.length" :has-next="resource.data.value.hasMore" :loading="resource.loading.value||busy" :show-sizes="false" :show-pages="false" @next="next" @previous="previous"/>
 </AsyncState>
 <el-dialog v-if="allowed" :model-value="run.confirming.value" title="运行场景" width="500px" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!run.busy.value&&!run.locked.value" @update:model-value="!$event&&run.cancel()">
  <p>运行场景“{{selectedName}}”？</p><p>本次只对设备“{{deviceName||deviceId}}”执行。</p><p v-if="run.error.value" role="alert">{{run.error.value}}</p>
  <template #footer><el-button :disabled="run.busy.value||run.locked.value" @click="run.cancel">取消</el-button><el-button v-if="run.locked.value" :loading="run.checking.value" :disabled="run.busy.value" @click="run.verify">{{run.definitionStale.value?'重新读取场景定义':'核对同次执行结果'}}</el-button><el-button v-else type="primary" :loading="run.writing.value" :disabled="!run.canRun.value" @click="run.confirm">确定运行</el-button></template>
 </el-dialog>
</section></template>
<style scoped>
.scene-learning{display:flex;align-items:center;gap:6px;margin:10px 0 20px;border-left:2px solid var(--tl-primary);border-radius:4px;padding:10px 14px;background:#ebf0ff;color:#888;font-size:13px}.scene-learning a{color:var(--tl-primary)}.scene-toolbar{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:10px}.scene-filters,.scene-actions{display:flex;gap:8px;flex-wrap:wrap}.scene-filters .el-select{width:150px}.scene-filters .el-input{width:240px}.scene-filters :deep(.el-select__wrapper){min-height:32px}.scene-actions .el-button+.el-button{margin-left:0}.scene-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:20px}.scene-card{border:1px solid var(--tl-border);padding:16px 20px;background:#fff;min-width:0}.scene-card header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.scene-name{margin:0;padding:0;border:0;background:none;color:#333;font:inherit;font-size:16px;font-weight:600;text-align:left;overflow-wrap:anywhere}button.scene-name{cursor:pointer}.scene-card header>span{flex:none;color:#999;font-size:12px;line-height:22px}.scene-kind,.scene-version{margin:5px 0;color:#888;font-size:13px;overflow-wrap:anywhere}.scene-card footer{margin-top:18px;border-top:1px solid #eee;padding-top:10px;display:flex;justify-content:flex-end}.scene-empty{text-align:center;padding:60px 20px}.scene-empty img{width:160px}.scene-empty h2{font-size:26px;font-weight:400;line-height:36px;margin:20px 0 0}.scene-empty p{color:#999;font-size:14px;margin:12px auto 20px}@media(min-width:768px){.scene-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:992px){.scene-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:1920px){.scene-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
</style>
