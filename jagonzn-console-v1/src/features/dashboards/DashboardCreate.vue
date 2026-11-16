<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {useRouter} from 'vue-router'
import {ElMessage} from 'element-plus'
import {ApiError,errorMessage,identityEpoch} from '@/core/http'
import {can,projectId} from '@/core/session'
import PageHeader from '@/ui/PageHeader.vue'
import {dashboardApi} from './dashboard-api'
import {emptyDashboardContent} from './dashboard-schema'

const router=useRouter()
const manageable=computed(()=>can('dashboard_definition:manage'))
const name=ref(''),description=ref(''),visibility=ref<'PRIVATE'|'PUBLIC'>('PRIVATE')
const busy=ref(false),error=ref('')
let controller:AbortController|undefined,key=''
watch([name,description,visibility],()=>{key=''})
onScopeDispose(()=>controller?.abort())
function back(){if(!busy.value)void router.push('/dashboards')}
async function create(){
  const project=projectId.value,value=name.value.trim()
  if(!project||busy.value||!manageable.value)return
  if(!value){error.value='请输入看板名称';return}
  if(Array.from(value).length>80){error.value='看板名称最多80个字符';return}
  if(Array.from(description.value).length>1000){error.value='看板描述最多1000个字符';return}
  const epoch=identityEpoch()
  busy.value=true;error.value=''
  controller?.abort();controller=new AbortController()
  if(!key)key=crypto.randomUUID()
  try{
    const created=await dashboardApi.create(project,value,description.value,visibility.value==='PUBLIC',
      emptyDashboardContent(),key,controller.signal)
    if(epoch!==identityEpoch()||project!==projectId.value)return
    ElMessage.success('看板已创建')
    await router.push(`/dashboards/${created.id}`)
  }catch(cause){
    if(epoch!==identityEpoch()||project!==projectId.value)return
    if(cause instanceof ApiError&&cause.outcomeUnknown)error.value=`${errorMessage(cause)}；结果未知，请返回目录刷新核对，不会自动重试。`
    else error.value=errorMessage(cause)
  }finally{if(epoch===identityEpoch())busy.value=false}
}
</script>
<template>
 <main class="tl-page dashboard-create">
  <PageHeader title="创建看板" back :back-disabled="busy" @back="back" />
  <div v-if="!manageable" class="dashboard-create__forbidden">当前账号没有创建看板的权限</div>
  <el-form v-else label-position="top" class="dashboard-create__form" :disabled="busy">
   <el-form-item label="名称">
    <el-input v-model="name" aria-label="看板名称" maxlength="80" class="dashboard-create__input" @keyup.enter="create" />
   </el-form-item>
   <el-form-item label="描述">
    <el-input v-model="description" aria-label="看板描述" type="textarea" :rows="5" maxlength="1000" class="dashboard-create__input dashboard-create__textarea" />
   </el-form-item>
   <div class="dashboard-create__section">看板公开性</div>
   <p class="dashboard-create__tip">私有看板只有项目成员可以浏览。公开看板拥有公开的 URL，任何人无需登录即可浏览。</p>
   <el-form-item label="公开性">
    <el-radio-group v-model="visibility">
     <el-radio value="PRIVATE">私有看板</el-radio>
     <el-radio value="PUBLIC">公开看板</el-radio>
    </el-radio-group>
   </el-form-item>
   <el-form-item>
    <div class="dashboard-create__actions">
     <el-button type="primary" :loading="busy" :disabled="busy" @click="create">创建</el-button>
     <el-button :disabled="busy" @click="back">取消</el-button>
    </div>
   </el-form-item>
  </el-form>
  <el-alert v-if="error" :title="error" type="error" :closable="false" class="dashboard-create__error" />
 </main>
</template>
<style scoped>
.dashboard-create :deep(.tl-page-header){min-height:24px;margin-bottom:20px}
.dashboard-create :deep(.tl-page-header__title){gap:40px}
.dashboard-create :deep(.tl-page-header__divider){display:none}
.dashboard-create :deep(.tl-page-header h1){min-height:24px;line-height:24px}
.dashboard-create :deep(.el-form-item){margin-bottom:22px}
.dashboard-create :deep(.el-form-item__label){height:32px;line-height:32px;margin-bottom:0;padding:0;font-weight:700}
.dashboard-create__form{max-width:none}
.dashboard-create__input{width:350px}
.dashboard-create__textarea{width:350px;height:117px}
.dashboard-create__section{margin:42px 0 10px;font-size:20px;line-height:32px;color:#002822}
.dashboard-create__tip{margin:0 0 22px;font-size:14px;line-height:20px;color:#666}
.dashboard-create__actions{display:flex;gap:10px;margin-top:20px}
.dashboard-create__actions .el-button{width:70px;height:40px;margin-left:0}
.dashboard-create__error{margin-top:16px;max-width:600px}
.dashboard-create__forbidden{padding:44px 20px;text-align:center;color:#909399}
@media(max-width:520px){.dashboard-create__form,.dashboard-create__input,.dashboard-create__textarea{max-width:100%;width:100%}}
</style>
