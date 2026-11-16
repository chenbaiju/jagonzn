<script setup lang="ts">
import {computed,onScopeDispose,ref,watch,type CSSProperties} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {ElMessage,ElMessageBox} from 'element-plus'
import {ArrowDown,FullScreen,MoreFilled} from '@element-plus/icons-vue'
import {ApiError,errorMessage,identityEpoch} from '@/core/http'
import {can,projectId} from '@/core/session'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {devicesApi} from '@/features/devices/api'
import {dashboardApi,type DashboardCatalogItem} from './dashboard-api'
import {addTextToDashboard,dashboardComponentDetail,dashboardRenderComponents,dashboardVariableDevices,duplicateDashboardComponent,removeDashboardComponent,updateDashboardComponent,type DashboardComponentDetail,type DashboardRenderComponent} from './dashboard-schema'

const route=useRoute(),router=useRouter()
const id=computed(()=>typeof route.params.dashboardId==='string'?route.params.dashboardId:'')
const readable=computed(()=>can('dashboard_definition:read'))
const manageable=computed(()=>can('dashboard_definition:manage'))
const busy=ref(false),actionError=ref('')
const reported=ref<Record<string,Record<string,unknown>>>({})
const allDashboards=ref<DashboardCatalogItem[]>([])

const settingsOpen=ref(false),settingsTab=ref('basic'),settingsName=ref(''),settingsDescription=ref(''),settingsPublic=ref(false),settingsBusy=ref(false),settingsError=ref('')
const addOpen=ref(false),addText=ref(''),addBusy=ref(false),addError=ref(''),addUnknown=ref(false)
const editOpen=ref(false),editTarget=ref<DashboardComponentDetail>(),editTitle=ref(''),editTab=ref('component'),editBusy=ref(false),editError=ref(''),editUnknown=ref(false)
const editLayout=ref({x:0,y:0,w:6,h:12}),editProps=ref<Record<string,unknown>>({})
const copyOpen=ref(false),copyName=ref(''),copyBusy=ref(false),copyError=ref('')
const fullscreen=ref(false)
let valueController:AbortController|undefined

const dynamicText=computed(()=>editTarget.value?.kind==='TEXT'&&'text' in editTarget.value.bindings)
const resource=useResource(async signal=>{
  const project=projectId.value,epoch=identityEpoch(),dashboard=id.value
  if(!project||!dashboard)throw new Error('看板标识无效')
  const [catalog,draft]=await Promise.all([dashboardApi.find(project,dashboard,signal),dashboardApi.draft(project,dashboard,signal)])
  if(epoch!==identityEpoch()||project!==projectId.value||dashboard!==id.value)throw new Error('页面身份已改变')
  if(catalog.id!==dashboard||draft.dashboardId!==dashboard)throw new Error('看板回执身份不匹配')
  return {catalog,draft,components:dashboardRenderComponents(draft.content),variables:dashboardVariableDevices(draft.content)}
})
const catalog=computed(()=>resource.data.value?.catalog)
const draft=computed(()=>resource.data.value?.draft)
const components=computed(()=>resource.data.value?.components||[])
const variables=computed(()=>resource.data.value?.variables||{})
const mode=computed(()=>{
  const presentation=draft.value?.content.presentation
  return presentation&&typeof presentation==='object'&&!Array.isArray(presentation)&&(presentation as Record<string,unknown>).mode==='FIXED_SCREEN'?'FIXED_SCREEN':'RESPONSIVE_GRID'
})
watch([projectId,id,readable],()=>{
  reported.value={};allDashboards.value=[];settingsOpen.value=false;editOpen.value=false;addOpen.value=false;copyOpen.value=false
  valueController?.abort();valueController=undefined;resource.clear();if(readable.value&&id.value)void resource.reload()
},{immediate:true,flush:'sync'})
watch(()=>resource.data.value,value=>{if(value)void loadReported()},{flush:'post'})
onScopeDispose(()=>valueController?.abort())

async function loadReported(){
  const project=projectId.value,content=draft.value?.content
  if(!project||!content)return
  const devices=[...new Set(Object.values(variables.value))]
  if(!devices.length){reported.value={};return}
  valueController?.abort();valueController=new AbortController()
  const entries=await Promise.all(devices.map(async device=>{
    try{
      const shadow=await devicesApi.shadow(project,device,valueController!.signal)
      let parsed:Record<string,unknown>={}
      if(typeof shadow.reported==='string'&&shadow.reported){try{const value=JSON.parse(shadow.reported);if(value&&typeof value==='object'&&!Array.isArray(value))parsed=value as Record<string,unknown>}catch{parsed={}}}
      return [device,parsed] as const
    }catch{return [device,{}] as const}
  }))
  reported.value=Object.fromEntries(entries)
}
type BindableComponent={readonly bindings:Record<string,unknown>}
function bindingOf(component:BindableComponent){
  const value=component.bindings.value
  if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,unknown>
  const series=component.bindings.series
  if(Array.isArray(series)&&series[0]&&typeof series[0]==='object'&&!Array.isArray(series[0])){
    const first=(series[0] as Record<string,unknown>).value
    if(first&&typeof first==='object'&&!Array.isArray(first))return first as Record<string,unknown>
  }
  return undefined
}
function propertyKeyOf(component:BindableComponent){const binding=bindingOf(component);return binding&&typeof binding.propertyKey==='string'?binding.propertyKey:''}
function currentValue(component:BindableComponent){
  const binding=bindingOf(component);if(!binding||typeof binding.device!=='object'||!binding.device||Array.isArray(binding.device))return undefined
  const variableKey=(binding.device as Record<string,unknown>).variableKey
  if(typeof variableKey!=='string'||typeof binding.propertyKey!=='string')return undefined
  const device=variables.value[variableKey]
  return device?reported.value[device]?.[binding.propertyKey]:undefined
}
function displayValue(value:unknown){
  if(value===undefined||value===null)return '—'
  if(typeof value==='number')return Number.isFinite(value)?String(value):'—'
  if(typeof value==='boolean')return value?'开启':'关闭'
  if(typeof value==='string')return value
  try{const text=JSON.stringify(value);return text.length>120?`${text.slice(0,117)}…`:text}catch{return '—'}
}
function titleOf(component:DashboardRenderComponent){return component.kind==='TEXT'?'':component.title||propertyKeyOf(component)||component.kind}
function textStyle(component:DashboardRenderComponent):CSSProperties{
  const props=component.props
  const align=String(props.align||'LEFT').toLowerCase()
  return {textAlign:(align==='center'||align==='right'?align:'left') as CSSProperties['textAlign'],
    fontSize:props.size==='LARGE'?'22px':props.size==='SMALL'?'13px':'16px',
    color:props.tone==='PRIMARY'?'#409eff':props.tone==='SECONDARY'?'#909399':'#303133'}
}
function widgetStyle(component:DashboardRenderComponent){
  if(mode.value==='FIXED_SCREEN')return {left:`${component.layout.x/1920*100}%`,top:`${component.layout.y/1080*100}%`,width:`${component.layout.w/1920*100}%`,height:`${component.layout.h/1080*100}%`}
  return {left:`${component.layout.x/24*100}%`,top:`${component.layout.y*16}px`,width:`${component.layout.w/24*100}%`,height:`${Math.max(component.layout.h*16,120)}px`}
}
function canvasStyle(){
  if(mode.value==='FIXED_SCREEN')return {aspectRatio:'16 / 9'}
  const bottom=components.value.reduce((max,component)=>Math.max(max,component.layout.y*16+Math.max(component.layout.h*16,120)),0)
  return {height:`${Math.max(360,bottom+20)}px`}
}
function fullscreenToggle(){
  fullscreen.value=!fullscreen.value
  if(fullscreen.value)void document.documentElement.requestFullscreen?.().catch(()=>{})
  else if(document.fullscreenElement)void document.exitFullscreen?.().catch(()=>{})
}
function back(){void router.push('/dashboards')}
async function loadDashboardChoices(visible:boolean){
  if(!visible||allDashboards.value.length||!readable.value)return
  const project=projectId.value;if(!project)return
  try{const page=await dashboardApi.list(project,undefined);allDashboards.value=page.items}catch{}
}
function switchDashboard(dashboardId:string){if(dashboardId!==id.value)void router.push(`/dashboards/${dashboardId}`)}
function openSettings(){
  if(!catalog.value||!manageable.value)return
  settingsName.value=catalog.value.managementName;settingsDescription.value=catalog.value.description;settingsPublic.value=catalog.value.publicAccess
  settingsTab.value='basic';settingsError.value='';settingsOpen.value=true
}
async function saveSettings(){
  const project=projectId.value,current=catalog.value
  if(!project||!current||settingsBusy.value||!manageable.value)return
  const name=settingsName.value.trim()
  if(!name){settingsError.value='请输入看板名称';return}
  if(Array.from(name).length>80){settingsError.value='看板名称最多80个字符';return}
  if(Array.from(settingsDescription.value).length>1000){settingsError.value='看板描述最多1000个字符';return}
  const epoch=identityEpoch();settingsBusy.value=true;settingsError.value=''
  try{
    await dashboardApi.updateMetadata(project,current.id,name,settingsDescription.value,settingsPublic.value)
    if(epoch!==identityEpoch()||project!==projectId.value)return
    ElMessage.success('看板设置已保存');settingsOpen.value=false;await resource.reload()
  }catch(cause){if(epoch===identityEpoch()&&project===projectId.value)settingsError.value=errorMessage(cause)}
  finally{if(epoch===identityEpoch())settingsBusy.value=false}
}
function openCopy(){
  if(!catalog.value||!manageable.value)return
  copyName.value=`${catalog.value.managementName} 副本`;copyError.value='';copyOpen.value=true
}
async function copyDashboard(){
  const project=projectId.value,current=catalog.value,draftValue=draft.value,name=copyName.value.trim()
  if(!project||!current||!draftValue||!name||copyBusy.value||!manageable.value)return
  const epoch=identityEpoch();copyBusy.value=true;copyError.value=''
  try{
    const created=await dashboardApi.create(project,name,current.description,false,draftValue.content,crypto.randomUUID())
    if(epoch!==identityEpoch()||project!==projectId.value)return
    copyOpen.value=false;ElMessage.success('看板已复制');await router.push(`/dashboards/${created.id}`)
  }catch(cause){if(epoch===identityEpoch()&&project===projectId.value)copyError.value=errorMessage(cause)}
  finally{if(epoch===identityEpoch())copyBusy.value=false}
}
async function removeDashboard(){
  const project=projectId.value,current=catalog.value
  if(!project||!current||busy.value||!manageable.value)return
  try{await ElMessageBox.confirm('确认移除该看板吗？看板移除后无法恢复。','提示',{type:'warning',confirmButtonText:'确定',cancelButtonText:'取消'})}catch{return}
  const epoch=identityEpoch();busy.value=true
  try{await dashboardApi.softDelete(project,current.id,current.publicationRevision);if(epoch!==identityEpoch()||project!==projectId.value)return;ElMessage.success('看板已移除');settingsOpen.value=false;await router.push('/dashboards')}
  catch(cause){if(epoch===identityEpoch()&&project===projectId.value)ElMessage.error(errorMessage(cause))}
  finally{if(epoch===identityEpoch())busy.value=false}
}
async function publishDraft(){
  const project=projectId.value,current=catalog.value,draftValue=draft.value
  if(!project||!current||!draftValue||busy.value||!manageable.value)return
  try{await ElMessageBox.confirm('发布当前草稿为不可变版本？','发布看板',{type:'warning',confirmButtonText:'发布',cancelButtonText:'取消'})}catch{return}
  const epoch=identityEpoch();busy.value=true
  try{await dashboardApi.publish(project,current.id,draftValue.revision,current.publicationRevision);if(epoch!==identityEpoch()||project!==projectId.value)return;ElMessage.success('看板已发布');await resource.reload()}
  catch(cause){if(epoch===identityEpoch()&&project===projectId.value)ElMessage.error(errorMessage(cause))}
  finally{if(epoch===identityEpoch())busy.value=false}
}
async function withdrawPublication(){
  const project=projectId.value,current=catalog.value
  if(!project||!current||busy.value||!manageable.value||!current.currentVersionId)return
  try{await ElMessageBox.confirm('撤回当前发布版本？','撤回看板发布',{type:'warning',confirmButtonText:'撤回',cancelButtonText:'取消'})}catch{return}
  const epoch=identityEpoch();busy.value=true
  try{await dashboardApi.withdraw(project,current.id,current.publicationRevision);if(epoch!==identityEpoch()||project!==projectId.value)return;ElMessage.success('看板发布已撤回');await resource.reload()}
  catch(cause){if(epoch===identityEpoch()&&project===projectId.value)ElMessage.error(errorMessage(cause))}
  finally{if(epoch===identityEpoch())busy.value=false}
}
function openEdit(component:DashboardRenderComponent){
  const current=resource.data.value
  const detail=current?dashboardComponentDetail(current.draft.content,component.pageId,component.id):undefined
  if(!detail){ElMessage.error('看板组件事实不完整，无法编辑');return}
  editTarget.value=detail;editTitle.value=detail.title;editLayout.value={...detail.layout}
  editProps.value=Object.fromEntries(Object.entries(detail.props).filter(([key])=>key!=='title'))
  editTab.value='settings';editError.value='';editUnknown.value=false;editOpen.value=true
}
function cleanProps(){
  const result:Record<string,unknown>={}
  for(const [key,value] of Object.entries(editProps.value))if(value!==undefined&&value!==null)result[key]=value
  if(editTarget.value?.kind==='GAUGE'&&editProps.value.scaleMode==='MODEL'){delete result.min;delete result.max}
  return result
}
async function saveComponent(){
  const current=resource.data.value,target=editTarget.value,project=projectId.value
  if(!current||!target||!project||editBusy.value||editUnknown.value||!manageable.value)return
  let next:Record<string,unknown>
  try{next=updateDashboardComponent(current.draft.content,target.pageId,target.id,{title:editTitle.value,layout:{...editLayout.value},props:cleanProps()})}
  catch(cause){editError.value=errorMessage(cause);return}
  const epoch=identityEpoch();editBusy.value=true;editError.value=''
  try{
    const saved=await dashboardApi.saveDraft(project,current.catalog.id,current.draft.revision,next)
    if(epoch!==identityEpoch()||project!==projectId.value)return
    const readback=dashboardComponentDetail(saved.content,target.pageId,target.id)
    if(!readback||(target.kind!=='TEXT'&&readback.title!==editTitle.value.trim())
      ||readback.layout.x!==editLayout.value.x||readback.layout.y!==editLayout.value.y
      ||readback.layout.w!==editLayout.value.w||readback.layout.h!==editLayout.value.h)throw new Error('看板已保存，但回读组件事实不一致')
    ElMessage.success('组件已保存');editOpen.value=false;await resource.reload()
  }catch(cause){
    if(epoch!==identityEpoch()||project!==projectId.value)return
    if(cause instanceof ApiError&&cause.outcomeUnknown){editUnknown.value=true;editError.value=`${errorMessage(cause)}；结果未知，已重新读取看板核对，不会自动重试。`;await resource.reload()}
    else if(cause instanceof ApiError&&cause.code===60037){editError.value=`${errorMessage(cause)}；看板已被修改，已重新读取。`;await resource.reload()}
    else editError.value=errorMessage(cause)
  }finally{if(epoch===identityEpoch())editBusy.value=false}
}
async function componentCommand(command:string,component:DashboardRenderComponent){
  const current=resource.data.value,project=projectId.value
  if(!current||!project||!manageable.value||busy.value)return
  if(command==='edit'){openEdit(component);return}
  if(command==='reload'){await loadReported();return}
  let next:Record<string,unknown>
  try{
    if(command==='duplicate')next=duplicateDashboardComponent(current.draft.content,component.pageId,component.id)
    else if(command==='remove')next=removeDashboardComponent(current.draft.content,component.pageId,component.id)
    else return
  }catch(cause){ElMessage.error(errorMessage(cause));return}
  if(command==='remove'){
    try{await ElMessageBox.confirm('确认移除该组件吗？','移除组件',{type:'warning',confirmButtonText:'移除',cancelButtonText:'取消'})}catch{return}
  }
  const epoch=identityEpoch();busy.value=true;actionError.value=''
  try{
    await dashboardApi.saveDraft(project,current.catalog.id,current.draft.revision,next)
    if(epoch!==identityEpoch()||project!==projectId.value)return
    ElMessage.success(command==='duplicate'?'组件已复制':'组件已移除');await resource.reload()
  }catch(cause){
    if(epoch!==identityEpoch()||project!==projectId.value)return
    if(cause instanceof ApiError&&cause.code===60037){ElMessage.error(`${errorMessage(cause)}；看板已被修改，已重新读取。`);await resource.reload()}
    else ElMessage.error(errorMessage(cause))
  }finally{if(epoch===identityEpoch())busy.value=false}
}
function openAdd(){if(!manageable.value||addBusy.value)return;addText.value='';addError.value='';addUnknown.value=false;addOpen.value=true}
async function saveAdd(){
  const current=resource.data.value,project=projectId.value
  if(!current||!project||addBusy.value||addUnknown.value||!manageable.value)return
  let next:Record<string,unknown>
  try{next=addTextToDashboard(current.draft.content,addText.value)}catch(cause){addError.value=errorMessage(cause);return}
  const epoch=identityEpoch();addBusy.value=true;addError.value=''
  try{
    await dashboardApi.saveDraft(project,current.catalog.id,current.draft.revision,next)
    if(epoch!==identityEpoch()||project!==projectId.value)return
    ElMessage.success('文本组件已添加');addOpen.value=false;await resource.reload()
  }catch(cause){
    if(epoch!==identityEpoch()||project!==projectId.value)return
    if(cause instanceof ApiError&&cause.outcomeUnknown){addUnknown.value=true;addError.value=`${errorMessage(cause)}；结果未知，已重新读取看板核对，不会自动重试。`;await resource.reload()}
    else if(cause instanceof ApiError&&cause.code===60037){addError.value=`${errorMessage(cause)}；看板已被修改，已重新读取。`;await resource.reload()}
    else addError.value=errorMessage(cause)
  }finally{if(epoch===identityEpoch())addBusy.value=false}
}
</script>
<template>
 <main class="dashboard-editor" :class="{'is-fullscreen':fullscreen}">
  <header class="dashboard-editor__toolbar">
   <div class="dashboard-editor__title">
    <button type="button" class="dashboard-editor__back" aria-label="返回" @click="back"><ReferenceIcon glyph="󰁍" /><span>返回</span></button>
    <el-dropdown trigger="click" @visible-change="loadDashboardChoices" @command="switchDashboard">
     <span class="dashboard-editor__name">{{ catalog?.managementName || '看板' }}<el-icon><ArrowDown /></el-icon></span>
     <template #dropdown><el-dropdown-menu><el-dropdown-item v-for="item in allDashboards" :key="item.id" :command="item.id" :disabled="item.id===id">{{ item.managementName }}</el-dropdown-item></el-dropdown-menu></template>
    </el-dropdown>
   </div>
   <div class="dashboard-editor__actions">
    <el-button v-if="manageable" type="primary" size="small" :disabled="!catalog||busy" @click="openAdd">添加组件</el-button>
    <el-button v-if="manageable" size="small" :disabled="!catalog||busy" @click="openSettings">看板设置</el-button>
    <el-button size="small" class="dashboard-editor__fullscreen" aria-label="切换全屏" @click="fullscreenToggle"><el-icon><FullScreen /></el-icon></el-button>
   </div>
  </header>
  <div class="dashboard-editor__surface">
   <div v-if="!readable" class="dashboard-editor__state">当前账号没有此看板的读取权限</div>
   <div v-else-if="resource.loading.value" class="dashboard-editor__state">正在读取看板…</div>
   <div v-else-if="resource.error.value" class="dashboard-editor__state">{{ errorMessage(resource.error.value) }} <el-button size="small" @click="resource.reload">重新读取</el-button></div>
   <div v-else class="dashboard-canvas" :style="canvasStyle()">
    <article v-for="component in components" :key="component.id" class="dashboard-widget" :class="`is-${component.kind.toLowerCase()}`" :style="widgetStyle(component)">
     <div class="dashboard-widget__header">
      <el-dropdown v-if="manageable" trigger="click" @command="(command:string)=>componentCommand(command,component)">
       <button type="button" class="dashboard-widget__menu" aria-label="组件操作" :disabled="busy"><el-icon><MoreFilled /></el-icon></button>
       <template #dropdown><el-dropdown-menu><el-dropdown-item command="edit">编辑</el-dropdown-item><el-dropdown-item command="reload">重新加载</el-dropdown-item><el-dropdown-item command="duplicate" divided>复制到新组件</el-dropdown-item><el-dropdown-item command="remove" divided>移除</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown>
     </div>
     <div class="dashboard-widget__body">
      <template v-if="component.kind==='TEXT'"><div class="dashboard-widget__text" :style="textStyle(component)">{{ component.props.content || '' }}</div></template>
      <template v-else-if="component.kind==='VALUE_CARD'"><div class="dashboard-widget__number"><div class="dashboard-widget__title">{{ titleOf(component) }}</div><div class="dashboard-widget__value">{{ displayValue(currentValue(component)) }}</div></div></template>
      <template v-else-if="component.kind==='GAUGE'"><div class="dashboard-widget__number"><div class="dashboard-widget__title">{{ titleOf(component) }}</div><div class="dashboard-widget__value">{{ displayValue(currentValue(component)) }}</div><div class="dashboard-widget__gauge"><span :style="{width:displayValue(currentValue(component))==='—'?'0%':'60%'}" /></div></div></template>
      <template v-else-if="component.kind==='STATUS'"><div class="dashboard-widget__number"><div class="dashboard-widget__title">{{ titleOf(component) }}</div><div class="dashboard-widget__value">{{ displayValue(currentValue(component)) }}</div></div></template>
      <template v-else><div class="dashboard-widget__placeholder"><div class="dashboard-widget__title">{{ titleOf(component) }}</div><p>{{ component.kind }} · {{ propertyKeyOf(component)||'未绑定数据源' }}</p><span>该组件的原站预览尚未接入</span></div></template>
     </div>
    </article>
   </div>
  </div>
  <div v-if="actionError" class="dashboard-editor__error">{{ actionError }}</div>

  <el-drawer v-model="settingsOpen" title="看板设置" size="764px" :close-on-click-modal="false" :close-on-press-escape="!settingsBusy" :show-close="!settingsBusy">
   <el-tabs v-model="settingsTab" class="dashboard-settings-tabs">
    <el-tab-pane label="基本信息" name="basic">
     <el-form label-position="top" :disabled="settingsBusy">
      <el-form-item label="名称"><el-input v-model="settingsName" aria-label="看板名称" /></el-form-item>
      <el-form-item label="描述"><el-input v-model="settingsDescription" aria-label="看板描述" type="textarea" :rows="5" /></el-form-item>
      <div class="dashboard-settings__actions"><el-button type="primary" size="small" :loading="settingsBusy" :disabled="settingsBusy" @click="saveSettings">保存</el-button><el-button size="small" :disabled="settingsBusy" @click="settingsOpen=false">取消</el-button></div>
     </el-form>
    </el-tab-pane>
    <el-tab-pane label="公开" name="public">
     <el-form label-position="top" :disabled="settingsBusy">
      <el-form-item label="公开页面语言"><el-select model-value="简体中文" disabled style="width:100%"><el-option label="简体中文" value="简体中文" /></el-select></el-form-item>
      <el-form-item label="允许公开访问"><el-switch v-model="settingsPublic" /></el-form-item>
      <el-alert title="普通公开链接与授权公开链接的宿主地址尚未接入；当前仅保存公开访问开关，不伪造可复制链接。" type="info" :closable="false" />
      <div class="dashboard-settings__actions"><el-button type="primary" size="small" :loading="settingsBusy" :disabled="settingsBusy" @click="saveSettings">保存</el-button><el-button size="small" :disabled="settingsBusy" @click="settingsOpen=false">取消</el-button></div>
     </el-form>
    </el-tab-pane>
    <el-tab-pane label="高级" name="advanced">
     <section class="dashboard-settings__section"><h3>复制看板</h3><p>创建新的看板，将当前看板的所有组件复制到新看板中。</p><el-button size="small" :disabled="busy" @click="openCopy">复制到新看板</el-button></section>
     <section class="dashboard-settings__section"><h3>发布与版本</h3><p>发布草稿、撤回当前发布版本；这是 ThingsLink 既有管理能力，不属于原站“高级”页签已观察内容。</p><div class="dashboard-settings__actions"><el-button size="small" :loading="busy" :disabled="busy||!draft" @click="publishDraft">发布草稿</el-button><el-button size="small" :loading="busy" :disabled="busy||!catalog?.currentVersionId" @click="withdrawPublication">撤回发布</el-button></div></section>
     <section class="dashboard-settings__section is-danger"><h3>移除看板</h3><p>看板移除后，通过看板公开 URL 和项目应用生成的看板 URL，也将无法访问该看板。</p><el-button type="danger" size="small" :disabled="busy" @click="removeDashboard">移除</el-button></section>
    </el-tab-pane>
   </el-tabs>
   <el-alert v-if="settingsError" :title="settingsError" type="error" :closable="false" />
  </el-drawer>

  <el-dialog v-model="addOpen" title="添加组件" width="min(760px,96vw)" :close-on-click-modal="false" :close-on-press-escape="!addBusy" :show-close="!addBusy">
   <p class="dashboard-dialog-help">当前已接入静态文本组件；设备属性组件请从设备属性“加入看板”创建。原站 16 类组件库仍待逐类接入。</p>
   <el-form label-position="top" :disabled="addBusy"><el-form-item label="文本内容"><el-input v-model="addText" aria-label="文本内容" type="textarea" :rows="6" maxlength="4096" show-word-limit /></el-form-item></el-form>
   <el-alert v-if="addError" :title="addError" :type="addUnknown?'warning':'error'" :closable="false" />
   <template #footer><el-button :disabled="addBusy" @click="addOpen=false">取消</el-button><el-button type="primary" :loading="addBusy" :disabled="addBusy||addUnknown" @click="saveAdd">保存</el-button></template>
  </el-dialog>

  <el-dialog v-model="editOpen" title="设置组件" width="min(960px,96vw)" :close-on-click-modal="false" :close-on-press-escape="!editBusy" :show-close="!editBusy">
   <div v-if="editTarget" class="dashboard-component-editor">
    <div class="dashboard-component-editor__preview">
     <div class="dashboard-widget__title">{{ editTarget.kind==='TEXT'?editProps.content:editTitle }}</div>
     <div v-if="editTarget.kind!=='TEXT'" class="dashboard-widget__value">{{ displayValue(currentValue(editTarget)) }}</div>
    </div>
    <div class="dashboard-component-editor__panel">
     <el-tabs v-model="editTab">
      <el-tab-pane label="组件" name="component"><dl class="dashboard-facts"><dt>类型</dt><dd>{{ editTarget.kind }}</dd><dt>版本</dt><dd>{{ editTarget.componentVersion }}</dd><dt>数据源</dt><dd>{{ propertyKeyOf(editTarget)||'—' }}</dd></dl><details class="dashboard-bindings"><summary>查看只读绑定</summary><pre>{{ JSON.stringify(editTarget.bindings,null,2) }}</pre></details></el-tab-pane>
      <el-tab-pane label="选项" name="options">
       <el-form label-position="top" :disabled="editBusy">
        <template v-if="editTarget.kind==='TEXT'">
         <el-alert v-if="dynamicText" title="动态文本由变量绑定决定，不能编辑静态正文。" type="info" :closable="false" />
         <el-form-item v-else label="正文"><el-input v-model="editProps.content" type="textarea" :rows="4" maxlength="4096" show-word-limit /></el-form-item>
         <el-form-item label="对齐"><el-select v-model="editProps.align"><el-option label="左对齐" value="LEFT"/><el-option label="居中" value="CENTER"/><el-option label="右对齐" value="RIGHT"/></el-select></el-form-item>
         <el-form-item label="字号"><el-select v-model="editProps.size"><el-option label="小" value="SMALL"/><el-option label="中" value="MEDIUM"/><el-option label="大" value="LARGE"/></el-select></el-form-item>
         <el-form-item label="色调"><el-select v-model="editProps.tone"><el-option label="常规" value="REGULAR"/><el-option label="次要" value="SECONDARY"/><el-option label="强调" value="PRIMARY"/></el-select></el-form-item>
        </template>
        <template v-else-if="editTarget.kind==='VALUE_CARD'"><el-form-item label="显示精度"><el-input-number v-model="editProps.precision" :min="0" :max="6" /></el-form-item><el-form-item label="单位"><el-select v-model="editProps.unitMode"><el-option label="模型单位" value="MODEL"/><el-option label="不显示" value="NONE"/></el-select></el-form-item></template>
        <template v-else-if="editTarget.kind==='STATUS'"><el-form-item label="显示最后在线时间"><el-switch v-model="editProps.showLastOnlineAt" /></el-form-item></template>
        <template v-else-if="editTarget.kind==='GAUGE'"><el-form-item label="量程"><el-select v-model="editProps.scaleMode"><el-option label="模型量程" value="MODEL"/><el-option label="显式量程" value="EXPLICIT"/></el-select></el-form-item><el-form-item label="显示精度"><el-input-number v-model="editProps.precision" :min="0" :max="6" /></el-form-item><el-form-item label="单位"><el-select v-model="editProps.unitMode"><el-option label="模型单位" value="MODEL"/><el-option label="不显示" value="NONE"/></el-select></el-form-item><template v-if="editProps.scaleMode==='EXPLICIT'"><el-form-item label="最小值"><el-input-number v-model="editProps.min" /></el-form-item><el-form-item label="最大值"><el-input-number v-model="editProps.max" /></el-form-item></template></template>
        <template v-else-if="editTarget.kind==='LINE_CHART'"><el-form-item label="显示图例"><el-switch v-model="editProps.showLegend" /></el-form-item></template>
        <template v-else-if="editTarget.kind==='JSON_VIEW'"><el-form-item label="初始展开深度"><el-input-number v-model="editProps.initialExpandDepth" :min="0" :max="2" /></el-form-item></template>
        <template v-else-if="editTarget.kind==='ALARM_LIST'"><el-form-item label="分页大小"><el-input-number v-model="editProps.pageSize" :min="1" :max="50" /></el-form-item><el-form-item label="显示清除时间"><el-switch v-model="editProps.showClearedAt" /></el-form-item></template>
        <template v-else-if="editTarget.kind==='DEVICE_SELECTOR'"><el-form-item label="占位文本"><el-input v-model="editProps.placeholder" maxlength="256" /></el-form-item><el-form-item label="分页大小"><el-input-number v-model="editProps.pageSize" :min="1" :max="50" /></el-form-item></template>
        <template v-else-if="editTarget.kind==='TABLE'"><el-form-item label="表格模式"><el-input :model-value="editProps.mode" disabled /></el-form-item><el-form-item label="行数上限"><el-input-number v-model="editProps.rowLimit" :min="1" :max="256" /></el-form-item></template>
        <template v-else-if="editTarget.kind==='IMAGE'"><el-form-item label="替代文本"><el-input v-model="editProps.alt" maxlength="256" /></el-form-item><el-form-item label="填充"><el-select v-model="editProps.fit"><el-option label="包含" value="CONTAIN"/><el-option label="覆盖" value="COVER"/></el-select></el-form-item></template>
        <p v-else class="dashboard-dialog-help">该组件类型没有可编辑的冻结属性。</p>
       </el-form>
      </el-tab-pane>
      <el-tab-pane label="设置" name="settings">
       <el-form label-position="top" :disabled="editBusy">
        <el-form-item v-if="editTarget.kind!=='TEXT'" label="组件标题"><el-input v-model="editTitle" aria-label="组件标题" maxlength="80" show-word-limit /></el-form-item>
        <div class="dashboard-layout-grid"><el-form-item label="横向 x"><el-input-number v-model="editLayout.x" :min="0" :max="1919" /></el-form-item><el-form-item label="纵向 y"><el-input-number v-model="editLayout.y" :min="0" :max="1079" /></el-form-item><el-form-item label="宽度 w"><el-input-number v-model="editLayout.w" :min="1" :max="1920" /></el-form-item><el-form-item label="高度 h"><el-input-number v-model="editLayout.h" :min="1" :max="1080" /></el-form-item></div>
       </el-form>
      </el-tab-pane>
     </el-tabs>
    </div>
   </div>
   <el-alert v-if="editError" :title="editError" :type="editUnknown?'warning':'error'" :closable="false" />
   <template #footer><el-button :disabled="editBusy" @click="editOpen=false">取消</el-button><el-button type="primary" :loading="editBusy" :disabled="editBusy||editUnknown||(editTarget?.kind!=='TEXT'&&!editTitle.trim())" @click="saveComponent">保存</el-button></template>
  </el-dialog>

  <el-dialog v-model="copyOpen" title="复制到新看板" width="500px" :close-on-click-modal="false" :close-on-press-escape="!copyBusy" :show-close="!copyBusy">
   <el-alert title="创建新的看板，将当前看板中的所有组件复制到新看板中。看板关联用户不会自动复制。" type="info" :closable="false" />
   <el-form label-position="top" class="dashboard-copy-form" :disabled="copyBusy"><el-form-item label="新看板名称"><el-input v-model="copyName" aria-label="新看板名称" /></el-form-item></el-form>
   <el-alert v-if="copyError" :title="copyError" type="error" :closable="false" />
   <template #footer><el-button :disabled="copyBusy" @click="copyOpen=false">取消</el-button><el-button type="primary" :loading="copyBusy" :disabled="!copyName.trim()||copyBusy" @click="copyDashboard">创建并复制</el-button></template>
  </el-dialog>
 </main>
</template>
<style scoped>
.dashboard-editor{min-height:calc(100vh - 50px);background:#fff}
.dashboard-editor__toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;height:70px;padding:0 28px}
.dashboard-editor__title{display:flex;align-items:center;gap:40px;min-width:0}
.dashboard-editor__back{display:inline-flex;align-items:center;gap:4px;border:0;background:none;padding:0;color:#4a4a4a;font-size:14px;cursor:pointer}
.dashboard-editor__back:hover{color:#409eff}
.dashboard-editor__name{display:inline-flex;align-items:center;gap:6px;max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#606266;font-size:18px;line-height:26px;cursor:pointer}
.dashboard-editor__actions{display:flex;align-items:center;gap:10px}
.dashboard-editor__actions .el-button+.el-button{margin-left:0}
.dashboard-editor__fullscreen{width:34px;padding:0}
.dashboard-editor__surface{background:#f9f9f9;min-height:calc(100vh - 120px);padding:10px}
.dashboard-editor__state{padding:60px 20px;text-align:center;color:#909399}
.dashboard-canvas{position:relative;width:100%}
.dashboard-widget{position:absolute;box-sizing:border-box;background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.1);overflow:hidden}
.dashboard-widget__header{position:absolute;top:0;right:0;z-index:2;height:30px;display:flex;align-items:center;padding:0 6px}
.dashboard-widget__menu{width:28px;height:28px;border:0;border-radius:50%;background:transparent;color:#606266;cursor:pointer;opacity:0}
.dashboard-widget:hover .dashboard-widget__menu,.dashboard-widget__menu:focus{opacity:1;background:#fff}
.dashboard-widget__body{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box}
.dashboard-widget__number{text-align:center;max-width:100%}
.dashboard-widget__title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#222;font-size:14px;line-height:17px}
.dashboard-widget__value{margin-top:4px;color:#222;font-size:clamp(24px,4vw,69px);line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dashboard-widget__text{width:100%;height:100%;white-space:pre-wrap;overflow:auto;overflow-wrap:anywhere}
.dashboard-widget__gauge{margin-top:10px;height:6px;border-radius:3px;background:#ebeef5;overflow:hidden}.dashboard-widget__gauge span{display:block;height:100%;background:#409eff}
.dashboard-widget__placeholder{text-align:center;color:#909399;font-size:13px;line-height:20px}.dashboard-widget__placeholder p{margin:6px 0;color:#606266}
.dashboard-settings-tabs{margin-top:0}
.dashboard-settings-tabs :deep(.el-tabs__content){padding-top:6px}
.dashboard-settings-tabs :deep(.el-form-item){margin-bottom:22px}
.dashboard-settings-tabs :deep(.el-form-item__label){height:32px;line-height:32px;margin-bottom:0;padding:0;font-weight:700}
.dashboard-settings-tabs :deep(.el-textarea__inner){height:117px}
.dashboard-settings__actions{display:flex;gap:8px;margin-top:40px}.dashboard-settings__actions .el-button+.el-button{margin-left:0}.dashboard-settings__section{padding:14px 0;border-bottom:1px solid #ebeef5}.dashboard-settings__section h3{margin:0 0 6px;font-size:14px;color:#303133}.dashboard-settings__section p{margin:0 0 10px;color:#909399;font-size:13px;line-height:20px}.dashboard-settings__section.is-danger h3{color:#f56c6c}
.dashboard-dialog-help{margin:0 0 14px;color:#909399;font-size:13px;line-height:20px}
.dashboard-component-editor{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(320px,1fr);gap:20px;min-height:420px}
.dashboard-component-editor__preview{display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f9f9f9;border-radius:6px;padding:20px;min-height:360px}
.dashboard-component-editor__preview .dashboard-widget__value{font-size:56px}
.dashboard-component-editor__panel{border-left:1px solid #ebeef5;padding-left:20px}
.dashboard-facts{display:grid;grid-template-columns:80px minmax(0,1fr);gap:8px 12px;margin:0;font-size:13px}.dashboard-facts dt{color:#909399}.dashboard-facts dd{margin:0;overflow-wrap:anywhere}.dashboard-bindings{margin-top:12px;font-size:12px;color:#606266}.dashboard-bindings pre{padding:10px;background:#f5f7fa;max-height:28vh;overflow:auto}
.dashboard-layout-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
.dashboard-copy-form{margin-top:20px}
@media(max-width:760px){.dashboard-editor__toolbar{padding:0 14px}.dashboard-editor__name{max-width:180px}.dashboard-component-editor{grid-template-columns:1fr}.dashboard-component-editor__panel{border-left:0;padding-left:0}}
</style>
