<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {useRouter} from 'vue-router'
import {ElMessage,ElMessageBox} from 'element-plus'
import {DocumentCopy,Delete,MoreFilled,TopRight,InfoFilled,Plus} from '@element-plus/icons-vue'
import {ApiError,errorMessage,identityEpoch} from '@/core/http'
import {can,projectId} from '@/core/session'
import {useResource} from '@/core/use-resource'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import {dashboardApi,type DashboardCatalogItem} from './dashboard-api'
import {dashboardComponentCount} from './dashboard-schema'

const router=useRouter()
const pages=ref<DashboardCatalogItem[]>([]),nextCursor=ref<string|null>(null),hasMore=ref(false),moreBusy=ref(false)
const copyOpen=ref(false),copySource=ref<DashboardCatalogItem>(),copyName=ref(''),copyBusy=ref(false),copyError=ref('')
const removeBusy=ref('')
let copyController:AbortController|undefined
const readable=computed(()=>can('dashboard_definition:read'))
const manageable=computed(()=>can('dashboard_definition:manage'))
const resource=useResource(async signal=>{
  const project=projectId.value,epoch=identityEpoch()
  if(!project)throw new Error('请选择当前项目')
  const page=await dashboardApi.list(project,undefined,signal)
  if(epoch!==identityEpoch())throw new Error('页面身份已改变')
  pages.value=page.items;nextCursor.value=page.nextCursor;hasMore.value=page.hasMore
  return page
})
watch([projectId,readable],()=>{pages.value=[];nextCursor.value=null;hasMore.value=false;moreBusy.value=false;copyOpen.value=false;copyController?.abort();copyController=undefined;resource.clear();if(readable.value)void resource.reload()},{immediate:true,flush:'sync'})
onScopeDispose(()=>copyController?.abort())
async function loadMore(){
  const project=projectId.value,cursor=nextCursor.value
  if(!project||!cursor||!hasMore.value||moreBusy.value)return
  const epoch=identityEpoch();moreBusy.value=true
  try{
    const page=await dashboardApi.list(project,cursor)
    if(epoch!==identityEpoch()||project!==projectId.value||nextCursor.value!==cursor)return
    pages.value=[...pages.value,...page.items.filter(item=>!pages.value.some(row=>row.id===item.id))]
    nextCursor.value=page.nextCursor;hasMore.value=page.hasMore
  }catch(cause){if(epoch===identityEpoch())ElMessage.error(errorMessage(cause))}
  finally{if(epoch===identityEpoch())moreBusy.value=false}
}
function openCreate(){if(manageable.value)void router.push('/dashboards/new')}
function openCopy(item:DashboardCatalogItem){
  if(!manageable.value)return
  copySource.value=item;copyName.value=`${item.managementName} 副本`;copyError.value='';copyOpen.value=true
}
function closeCopy(){if(copyBusy.value)return;copyOpen.value=false;copyController?.abort();copyController=undefined}
async function copyDashboard(){
  const source=copySource.value,project=projectId.value,name=copyName.value.trim()
  if(!source||!project||!name||copyBusy.value||!manageable.value)return
  const epoch=identityEpoch();copyBusy.value=true;copyError.value=''
  copyController?.abort();copyController=new AbortController()
  try{
    const draft=await dashboardApi.draft(project,source.id,copyController.signal)
    const created=await dashboardApi.create(project,name,source.description,false,draft.content,crypto.randomUUID(),copyController.signal)
    if(epoch!==identityEpoch()||project!==projectId.value)return
    copyOpen.value=false
    ElMessage.success('看板已复制')
    await router.push(`/dashboards/${created.id}`)
  }catch(cause){
    if(epoch!==identityEpoch()||project!==projectId.value)return
    copyError.value=errorMessage(cause)
  }finally{if(epoch===identityEpoch())copyBusy.value=false}
}
async function removeDashboard(item:DashboardCatalogItem){
  const project=projectId.value
  if(!project||removeBusy.value||!manageable.value)return
  try{await ElMessageBox.confirm('确认移除该看板吗？看板移除后无法恢复。','提示',{type:'warning',confirmButtonText:'确定',cancelButtonText:'取消'})}catch{return}
  const epoch=identityEpoch();removeBusy.value=item.id
  try{
    await dashboardApi.softDelete(project,item.id,item.publicationRevision)
    if(epoch!==identityEpoch()||project!==projectId.value)return
    ElMessage.success('看板已移除')
    await resource.reload()
  }catch(cause){
    if(epoch!==identityEpoch()||project!==projectId.value)return
    if(cause instanceof ApiError&&cause.code===60037)await resource.reload()
    else ElMessage.error(errorMessage(cause))
  }finally{if(epoch===identityEpoch())removeBusy.value=''}
}
function componentCount(item:DashboardCatalogItem){return componentCountCache.value[item.id]??0}
const componentCountCache=ref<Record<string,number>>({})
let countToken=0
watch(pages,async list=>{
  const project=projectId.value
  if(!project)return
  const token=++countToken,next:Record<string,number>={}
  await Promise.all(list.slice(0,50).map(async item=>{
    try{const draft=await dashboardApi.draft(project,item.id);next[item.id]=dashboardComponentCount(draft.content)}
    catch{next[item.id]=0}
  }))
  if(token!==countToken||project!==projectId.value)return
  componentCountCache.value=next
},{immediate:true,flush:'post'})
</script>
<template>
 <main class="tl-page dashboard-directory">
  <PageHeader title="看板" :count="pages.length">
   <el-button v-if="manageable" type="primary" size="small" :icon="Plus" @click="openCreate">创建看板</el-button>
  </PageHeader>
  <div class="dashboard-learning">
   <el-icon><InfoFilled /></el-icon>
   <span>学习资源：</span>
   <a href="https://www.thingscloud.xyz/docs/guide/visualization/board.html" target="_blank" rel="noopener noreferrer">如何制作看板？<el-icon><TopRight /></el-icon></a>
  </div>
  <AsyncState :forbidden="!readable" :loading="resource.loading.value" :error="resource.error.value" :empty="false" @retry="resource.reload">
   <div class="dashboard-cards">
    <article v-for="item in pages" :key="item.id" class="dashboard-card">
     <router-link :to="`/dashboards/${item.id}`" class="dashboard-card__main" :aria-label="item.managementName">
      <div class="dashboard-card__preview" />
      <div class="dashboard-card__info">
       <strong :title="item.managementName">{{ item.managementName }}</strong>
       <p>{{ componentCount(item) }} 组件</p>
      </div>
     </router-link>
     <el-dropdown v-if="manageable" trigger="click" class="dashboard-card__menu" @command="(command:string)=>command==='copy'?openCopy(item):removeDashboard(item)">
      <button type="button" class="dashboard-card__menu-button" aria-label="看板操作" :disabled="!!removeBusy"><el-icon><MoreFilled /></el-icon></button>
      <template #dropdown>
       <el-dropdown-menu>
        <el-dropdown-item command="copy"><el-icon><DocumentCopy /></el-icon>复制到新看板</el-dropdown-item>
        <el-dropdown-item command="remove" divided :disabled="removeBusy===item.id"><el-icon><Delete /></el-icon>移除看板</el-dropdown-item>
       </el-dropdown-menu>
      </template>
     </el-dropdown>
    </article>
   </div>
   <div v-if="hasMore" class="dashboard-more"><el-button size="small" :loading="moreBusy" :disabled="moreBusy" @click="loadMore">加载更多</el-button></div>
  </AsyncState>
  <el-dialog v-model="copyOpen" title="复制到新看板" width="500px" :close-on-click-modal="false" :close-on-press-escape="!copyBusy" :show-close="!copyBusy" @close="closeCopy">
   <el-alert title="创建新的看板，将当前看板中的所有组件复制到新看板中。看板关联用户不会自动复制。" type="info" :closable="false" />
   <el-form label-position="top" class="dashboard-copy-form" :disabled="copyBusy">
    <el-form-item label="新看板名称"><el-input v-model="copyName" aria-label="新看板名称" @keyup.enter="copyDashboard" /></el-form-item>
   </el-form>
   <el-alert v-if="copyError" :title="copyError" type="error" :closable="false" />
   <template #footer><el-button :disabled="copyBusy" @click="closeCopy">取消</el-button><el-button type="primary" :loading="copyBusy" :disabled="!copyName.trim()||copyBusy" @click="copyDashboard">创建并复制</el-button></template>
  </el-dialog>
 </main>
</template>
<style scoped>
.dashboard-directory>.dashboard-learning{display:flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;margin-bottom:20px;background:#eaf0fe;color:#606266;font-size:14px}
.dashboard-learning>a{display:inline-flex;align-items:center;gap:4px;color:#1e88e5;font-weight:700;text-decoration:none}
.dashboard-cards{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.dashboard-card{position:relative;min-width:0;height:120px;border:1px solid #ebeef5;border-radius:4px;background:#fff;overflow:hidden;transition:box-shadow .2s}
.dashboard-card:hover{box-shadow:0 2px 12px rgba(0,0,0,.1)}
.dashboard-card__main{display:block;height:100%;color:#303133;text-decoration:none}
.dashboard-card__preview{height:120px}
.dashboard-card__info{position:absolute;inset:0;padding:20px;box-sizing:border-box}
.dashboard-card__info strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:44px;font-size:16px;font-weight:600;line-height:22px;color:#303133}
.dashboard-card__info p{margin:5px 0 0;color:#888;font-size:14px;line-height:22px}
.dashboard-card__menu{position:absolute;top:6px;right:6px;opacity:0;transition:opacity .15s}
.dashboard-card:hover .dashboard-card__menu,.dashboard-card__menu:focus-within{opacity:1}
.dashboard-card__menu-button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:1px solid #dcdfe6;border-radius:50%;background:#fff;color:#606266;cursor:pointer}
.dashboard-card__menu-button:hover{color:#409eff;border-color:#c6e2ff;background:#ecf5ff}
.dashboard-more{display:flex;justify-content:center;margin-top:20px}
.dashboard-copy-form{margin-top:20px}
@media(min-width:768px){.dashboard-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:992px){.dashboard-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1920px){.dashboard-cards{grid-template-columns:repeat(4,minmax(0,1fr))}}
</style>
