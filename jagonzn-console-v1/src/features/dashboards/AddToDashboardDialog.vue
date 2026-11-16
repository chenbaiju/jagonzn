<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {ElMessage} from 'element-plus'
import {ApiError,errorMessage,identityEpoch} from '@/core/http'
import {can,projectId} from '@/core/session'
import {dashboardApi,type DashboardCatalogItem} from './dashboard-api'
import {addPropertyToDashboard,dashboardComponentCount,dashboardPropertyKind,hasPropertyDashboardBinding,type DashboardAddMode,type DashboardAddTarget} from './dashboard-schema'

const props=defineProps<{
  modelValue:boolean
  target:DashboardAddTarget
  mode?:DashboardAddMode
}>()
const emit=defineEmits<{'update:modelValue':[boolean];saved:[string]}>()
const dashboards=ref<DashboardCatalogItem[]>([]),counts=ref<Record<string,number>>({})
const step=ref<1|2>(1),choiceMode=ref<'existing'|'new'>('existing'),choice=ref(''),name=ref(''),title=ref(''),kind=ref<'VALUE_CARD'|'JSON_VIEW'>('VALUE_CARD')
const loading=ref(false),busy=ref(false),error=ref(''),unknown=ref(false)
let controller:AbortController|undefined,createKey=''
const manageable=computed(()=>can('dashboard_definition:manage'))
const canNext=computed(()=>manageable.value&&!busy.value&&!loading.value&&(choiceMode.value==='new'?name.value.trim().length>0:true))
const canSave=computed(()=>manageable.value&&!busy.value&&!unknown.value&&title.value.trim().length>0)
function close(){if(busy.value)return;emit('update:modelValue',false)}
function targetKey(){return `${props.target.deviceId}:${props.target.propertyKey}:${props.mode||'current'}`}
function defaultTitle(){return `${props.target.deviceName} · ${props.target.propertyName}`.slice(0,80)}
async function load(){
  controller?.abort();const current=new AbortController();controller=current
  const project=projectId.value,epoch=identityEpoch(),key=targetKey()
  loading.value=true;error.value='';unknown.value=false
  try{
    const all:DashboardCatalogItem[]=[];let cursor:string|undefined
    for(let index=0;index<4;index++){
      const page=await dashboardApi.list(project,cursor,current.signal)
      all.push(...page.items)
      if(!page.hasMore)break
      if(!page.nextCursor||page.nextCursor===cursor)break
      cursor=page.nextCursor
    }
    if(epoch!==identityEpoch()||project!==projectId.value||key!==targetKey())return
    dashboards.value=all
    choice.value=all.length?all[0]!.id:''
    const pairs=await Promise.all(all.slice(0,50).map(async item=>{
      try{const draft=await dashboardApi.draft(project,item.id,current.signal);return [item.id,dashboardComponentCount(draft.content)] as const}
      catch{return [item.id,0] as const}
    }))
    if(epoch!==identityEpoch()||project!==projectId.value||key!==targetKey())return
    counts.value=Object.fromEntries(pairs)
    createKey=crypto.randomUUID()
  }catch(cause){if(epoch===identityEpoch()&&!current.signal.aborted)error.value=errorMessage(cause)}
  finally{if(controller===current&&epoch===identityEpoch())loading.value=false}
}
function defaultName(){return `${props.target.deviceName}看板`.slice(0,80)}
function reset(){dashboards.value=[];counts.value={};step.value=1;choiceMode.value='existing';choice.value='';name.value='';title.value='';kind.value=dashboardPropertyKind(props.target.dataType)||'VALUE_CARD';error.value='';unknown.value=false;busy.value=false;loading.value=false;createKey=''}
watch(()=>props.modelValue,value=>{if(value){reset();void load()}else{controller?.abort();controller=undefined}},{immediate:true})
watch([()=>projectId.value,()=>targetKey()],()=>{if(props.modelValue)void load()})
watch(choiceMode,value=>{if(value==='new'&&!name.value)name.value=defaultName()})
onScopeDispose(()=>controller?.abort())
function next(){
  if(!canNext.value||!manageable.value)return
  if(choiceMode.value==='new'&&!name.value.trim()){error.value='请填写看板名称';return}
  title.value=defaultTitle();kind.value=dashboardPropertyKind(props.target.dataType)||'VALUE_CARD';error.value='';step.value=2
}
async function save(){
  if(!canSave.value||!manageable.value)return
  const project=projectId.value,epoch=identityEpoch(),key=targetKey(),target={...props.target},mode=props.mode||'current'
  const existing=choiceMode.value==='existing'?choice.value:''
  const managementName=name.value.trim()
  if(choiceMode.value==='existing'&&!existing){error.value='请选择目标看板';return}
  if(!existing&&!managementName){error.value='请填写看板名称';step.value=1;return}
  busy.value=true;error.value='';unknown.value=false
  try{
    let id:string,revision:string,content:Record<string,unknown>
    if(existing){
      const draft=await dashboardApi.draft(project,existing)
      const next=addPropertyToDashboard(draft.content,target,mode,{kind:kind.value,title:title.value})
      const saved=await dashboardApi.saveDraft(project,existing,draft.revision,next)
      id=existing;revision=saved.revision;content=saved.content
    }else{
      if(!createKey)createKey=crypto.randomUUID()
      const created=await dashboardApi.create(project,managementName,'',false,addPropertyToDashboard(undefined,target,mode,{kind:kind.value,title:title.value}),createKey)
      id=created.id
      const draft=await dashboardApi.draft(project,id)
      revision=draft.revision;content=draft.content
    }
    if(epoch!==identityEpoch()||project!==projectId.value||key!==targetKey())return
    if(!hasPropertyDashboardBinding(content,target.deviceId,target.propertyKey))throw new Error('看板已保存，但回读未找到当前属性绑定，请打开看板核对')
    ElMessage.success(existing?'已加入看板':'看板已创建并加入当前属性')
    emit('saved',id);emit('update:modelValue',false)
  }catch(cause){
    if(epoch!==identityEpoch()||project!==projectId.value)return
    if(cause instanceof ApiError&&cause.outcomeUnknown){unknown.value=true;error.value=`${errorMessage(cause)}；结果未知，请关闭后在“看板”目录核对，不会自动重试。`}
    else error.value=errorMessage(cause)
  }finally{if(epoch===identityEpoch())busy.value=false}
}
</script>
<template>
 <el-dialog :model-value="modelValue" title="添加到看板" width="min(1273px,96vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" @close="close">
  <div class="add-dashboard-body">
   <el-alert v-if="!manageable" type="warning" :closable="false" title="当前账号没有管理看板定义的权限" />
   <template v-else-if="step===1">
    <el-form label-position="top" :disabled="busy||loading">
     <div class="add-dashboard-option">
      <el-radio v-model="choiceMode" value="existing">加入到现有看板</el-radio>
     </div>
     <div class="add-dashboard-option">
      <el-radio v-model="choiceMode" value="new">创建新看板</el-radio>
      <el-input v-if="choiceMode==='new'" v-model="name" aria-label="新看板名称" maxlength="80" placeholder="请输入看板名称" />
     </div>
    </el-form>
    <el-alert v-if="error" :title="error" :type="unknown?'warning':'error'" :closable="false" />
   </template>
   <template v-else>
    <el-form label-position="top" :disabled="busy">
     <el-form-item v-if="choiceMode==='existing'" label="目标看板">
      <el-select v-model="choice" aria-label="目标看板" placeholder="请选择" style="width:100%" :loading="loading">
       <el-option v-for="item in dashboards" :key="item.id" :label="item.managementName" :value="item.id">
        <span class="add-dashboard-option__name">{{ item.managementName }}</span>
        <span class="add-dashboard-option__count">{{ counts[item.id]??0 }} 个组件</span>
       </el-option>
      </el-select>
     </el-form-item>
     <p class="add-dashboard-hint">数据源：<strong>{{ target.propertyName }}</strong>（{{ target.propertyKey }}）</p>
     <el-form-item label="组件标题"><el-input v-model="title" aria-label="组件标题" maxlength="80" show-word-limit /></el-form-item>
     <el-form-item label="组件类型"><el-select v-model="kind" aria-label="组件类型" style="width:100%"><el-option v-if="dashboardPropertyKind(target.dataType)==='VALUE_CARD'" label="数值卡片" value="VALUE_CARD"/><el-option v-if="dashboardPropertyKind(target.dataType)==='JSON_VIEW'" label="JSON 视图" value="JSON_VIEW"/></el-select></el-form-item>
    </el-form>
    <el-alert v-if="error" :title="error" :type="unknown?'warning':'error'" :closable="false" />
    <p class="add-dashboard-note">原站第二步的完整组件样式、选项和画布设置尚未接入；这里只保存当前值组件。</p>
   </template>
  </div>
  <template #footer>
   <el-button :disabled="busy" @click="close">取消</el-button>
   <el-button v-if="step===1" type="primary" :loading="loading" :disabled="!canNext" @click="next">下一步</el-button>
   <template v-else><el-button :disabled="busy" @click="step=1">上一步</el-button><el-button type="primary" :loading="busy" :disabled="!canSave" @click="save">保存</el-button></template>
  </template>
 </el-dialog>
</template>
<style scoped>
.add-dashboard-body{display:grid;gap:14px}.add-dashboard-option{display:grid;gap:8px;margin-bottom:18px}.add-dashboard-option__name{float:left;max-width:70%;overflow:hidden;text-overflow:ellipsis}.add-dashboard-option__count{float:right;color:#909399;font-size:13px}.add-dashboard-hint{margin:0;color:#606266;font-size:14px;line-height:22px}.add-dashboard-note{margin:0;color:#909399;font-size:12px;line-height:20px}
</style>
