<script setup lang="ts">
import {computed,reactive,ref,watch} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {ApiError,errorMessage,identityEpoch} from '@/core/http'
import {can,projectId} from '@/core/session'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import EndUserNotificationContactDialog from './EndUserNotificationContactDialog.vue'
import {endUserApi,type EndUser,type EndUserDeviceBinding,type EndUserRole} from './end-user-api'

const users=ref<EndUser[]>([]),nextCursor=ref<string|null>(null),hasMore=ref(false),moreBusy=ref(false)
const readable=computed(()=>can('enduser:read'))
const manageable=computed(()=>can('enduser:manage'))
const roleNames:Record<string,string>={APP_ADMIN:'应用管理员',MAINTAINER:'维护者',OPERATOR:'操作员',OBSERVER:'观察者'}
const roleOptions:EndUserRole[]=['APP_ADMIN','MAINTAINER','OPERATOR','OBSERVER']
const roleDialogOpen=ref(false),roleTarget=ref<EndUser>(),roleDraft=ref<EndUserRole>('OPERATOR'),roleBusy=ref(false),actionBusy=ref('')
const createOpen=ref(false),createForm=reactive({username:'',password:'',displayName:'',role:'OPERATOR' as EndUserRole}),createBusy=ref(false),createError=ref(''),createdUser=ref<EndUser>(),createUnknown=ref(false)
const contactOpen=ref(false),contactTarget=ref<EndUser|null>(null)
const devicesOpen=ref(false),devicesTarget=ref<EndUser|null>(null),devices=ref<EndUserDeviceBinding[]>([]),devicesBusy=ref(false),devicesError=ref('')
const lookupOpen=ref(false),lookupName=ref(''),lookupBusy=ref(false),lookupError=ref(''),lookupResult=ref<EndUser|null>(null)
let listEpoch=0
const resource=useResource(async signal=>{
  const project=projectId.value,epoch=identityEpoch()
  if(!project)throw new Error('请选择当前项目')
  const page=await endUserApi.list(project,undefined,signal)
  if(epoch!==identityEpoch())throw new Error('页面身份已改变')
  users.value=page.items;nextCursor.value=page.nextCursor;hasMore.value=page.hasMore
  return page
})
function refresh(){
  listEpoch++;moreBusy.value=false
  resource.clear()
  if(readable.value)void resource.reload()
}
watch([projectId,readable],(next,previous)=>{
  if(!next[1]){users.value=[];nextCursor.value=null;hasMore.value=false;moreBusy.value=false}
  else if(!previous||next[0]!==previous[0]){users.value=[];nextCursor.value=null;hasMore.value=false}
  if(!previous||next[0]!==previous[0]||!next[1]){
    roleDialogOpen.value=false;roleTarget.value=undefined;roleBusy.value=false
    createOpen.value=false;createdUser.value=undefined;createError.value='';createUnknown.value=false;createBusy.value=false
    contactOpen.value=false;contactTarget.value=null
    devicesOpen.value=false;devicesTarget.value=null;devices.value=[];devicesBusy.value=false;devicesError.value=''
    lookupOpen.value=false;lookupName.value='';lookupBusy.value=false;lookupError.value='';lookupResult.value=null
    actionBusy.value=''
  }
  refresh()
},{immediate:true,flush:'sync'})
async function loadMore(){
  const project=projectId.value,cursor=nextCursor.value
  if(!project||!cursor||!hasMore.value||moreBusy.value)return
  const epoch=identityEpoch(),token=listEpoch
  moreBusy.value=true
  try{
    const page=await endUserApi.list(project,cursor)
    if(epoch!==identityEpoch()||project!==projectId.value||token!==listEpoch||nextCursor.value!==cursor)return
    users.value=[...users.value,...page.items.filter(item=>!users.value.some(row=>row.id===item.id))]
    nextCursor.value=page.nextCursor;hasMore.value=page.hasMore
  }catch(cause){if(epoch===identityEpoch()&&token===listEpoch)ElMessage.error(errorMessage(cause))}
  finally{if(token===listEpoch)moreBusy.value=false}
}
function openCreate(){if(!manageable.value)return;Object.assign(createForm,{username:'',password:'',displayName:'',role:'OPERATOR'});createdUser.value=undefined;createError.value='';createUnknown.value=false;createOpen.value=true}
function closeCreate(){if(!createBusy.value)createOpen.value=false}
function validateCreate(){
 const username=createForm.username.trim(),displayName=createForm.displayName.trim(),password=createForm.password
 if(!username||username.length>128)return '用户名为1至128个字符'
 if(password.length<8||password.length>128||new TextEncoder().encode(password).length>72)return '初始口令需为8至128字符且UTF-8不超过72字节'
 if(displayName.length>128)return '显示名称最多128个字符'
 if(!roleOptions.includes(createForm.role))return '请选择有效的项目角色'
 return ''
}
async function createUser(){
 if(createBusy.value||!manageable.value||createUnknown.value)return
 const project=projectId.value,epoch=identityEpoch()
 if(!project)return
 const validation=validateCreate();if(validation){createError.value=validation;return}
 createBusy.value=true;createError.value=''
 if(!createdUser.value){
  try{
   createdUser.value=await endUserApi.provision(project,{username:createForm.username.trim(),password:createForm.password,displayName:createForm.displayName.trim()||undefined})
  }catch(cause){
   if(epoch!==identityEpoch()||project!==projectId.value)return
   if(cause instanceof ApiError&&cause.outcomeUnknown){createUnknown.value=true;createError.value=`${errorMessage(cause)}；结果未知，请关闭后按用户名核对，不会自动重试`}
   else createError.value=errorMessage(cause)
   createBusy.value=false;return
  }
 }
 try{
  await endUserApi.assignRole(project,createdUser.value.id,createForm.role)
  if(epoch!==identityEpoch()||project!==projectId.value)return
  ElMessage.success('用户已创建并分配角色');createOpen.value=false;await resource.reload()
 }catch(cause){
  if(epoch!==identityEpoch()||project!==projectId.value)return
  if(cause instanceof ApiError&&cause.outcomeUnknown)createError.value=`用户已创建（${createdUser.value.username}），角色分配结果未知；请重新读取目录核对，不会自动重试`
  else createError.value=`用户已创建（${createdUser.value.username}），但角色分配失败：${errorMessage(cause)}；可重新分配角色`
 }finally{if(epoch===identityEpoch())createBusy.value=false}
}
function openRole(user:EndUser){if(!manageable.value||actionBusy.value)return;roleTarget.value=user;roleDraft.value=(user.role as EndUserRole|undefined)||'OPERATOR';roleDialogOpen.value=true}
function closeRole(){if(!roleBusy.value)roleDialogOpen.value=false}
function openContact(user:EndUser){if(!manageable.value||actionBusy.value)return;contactTarget.value=user;contactOpen.value=true}
async function saveRole(){
 const user=roleTarget.value,project=projectId.value
 if(!user||!project||roleBusy.value||!manageable.value)return
 const epoch=identityEpoch()
 roleBusy.value=true;actionBusy.value=user.id
 try{await endUserApi.updateRole(project,user.id,roleDraft.value);if(epoch!==identityEpoch()||project!==projectId.value)return;ElMessage.success('角色已更新');roleDialogOpen.value=false;await resource.reload()}
 catch(cause){if(epoch!==identityEpoch()||project!==projectId.value)return;if(cause instanceof ApiError&&cause.outcomeUnknown){ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取目录核对`);await resource.reload()}else ElMessage.error(errorMessage(cause))}
 finally{if(epoch===identityEpoch()){roleBusy.value=false;actionBusy.value=''}}
}
async function changeStatus(user:EndUser){
 const project=projectId.value
 if(!project||actionBusy.value||!manageable.value)return
 const restore=user.roleStatus!=='ACTIVE'
 try{await ElMessageBox.confirm(restore?'确认恢复该用户在本项目的角色？':'确认停用该用户在本项目的角色？','终端用户',{type:'warning',confirmButtonText:restore?'恢复':'停用',cancelButtonText:'取消'})}catch{return}
 const epoch=identityEpoch();actionBusy.value=user.id
 try{await(restore?endUserApi.restore(project,user.id):endUserApi.suspend(project,user.id));if(epoch!==identityEpoch()||project!==projectId.value)return;ElMessage.success(restore?'角色已恢复':'角色已停用');await resource.reload()}
 catch(cause){if(epoch!==identityEpoch()||project!==projectId.value)return;if(cause instanceof ApiError&&cause.outcomeUnknown){ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取目录核对`);await resource.reload()}else ElMessage.error(errorMessage(cause))}
 finally{if(epoch===identityEpoch())actionBusy.value=''}
}
function openDevices(user:EndUser){
 if(devicesBusy.value)return
 devicesTarget.value=user;devices.value=[];devicesError.value='';devicesOpen.value=true
 void loadDevices()
}
async function loadDevices(){
 const user=devicesTarget.value,project=projectId.value
 if(!user||!project||devicesBusy.value)return
 const epoch=identityEpoch();devicesBusy.value=true;devicesError.value=''
 try{
  const rows=await endUserApi.devices(project,user.id)
  if(epoch!==identityEpoch()||project!==projectId.value||devicesTarget.value?.id!==user.id)return
  devices.value=rows
 }catch(cause){if(epoch===identityEpoch()&&project===projectId.value)devicesError.value=errorMessage(cause)}
 finally{if(epoch===identityEpoch())devicesBusy.value=false}
}
function openLookup(){if(!manageable.value)return;lookupName.value='';lookupError.value='';lookupResult.value=null;lookupOpen.value=true}
function closeLookup(){if(!lookupBusy.value)lookupOpen.value=false}
async function runLookup(){
 const project=projectId.value,name=lookupName.value.trim()
 if(!project||!name||lookupBusy.value||!manageable.value)return
 const epoch=identityEpoch();lookupBusy.value=true;lookupError.value='';lookupResult.value=null
 try{
  const user=await endUserApi.lookup(project,name)
  if(epoch!==identityEpoch()||project!==projectId.value)return
  lookupResult.value=user
 }catch(cause){
  if(epoch!==identityEpoch()||project!==projectId.value)return
  if(cause instanceof ApiError&&cause.code===60001)lookupError.value='当前项目归属租户内没有该精确用户名；不会按模糊文本猜测。'
  else lookupError.value=errorMessage(cause)
 }finally{if(epoch===identityEpoch())lookupBusy.value=false}
}
function roleLabel(role:string|null){return role?roleNames[role]||role:'未分配'}
function statusLabel(status:string){return status==='ACTIVE'?'正常':status==='SUSPENDED'||status==='DISABLED'?'已停用':status}
function roleStatusLabel(status:string|null){return status===null?'—':status==='ACTIVE'?'正常':status==='SUSPENDED'||status==='DISABLED'?'已停用':status}
</script>
<template>
 <main class="tl-page end-users-directory">
  <PageHeader title="用户" :count="users.length">
   <el-button size="small" disabled title="自定义用户角色后端能力待补">用户角色</el-button>
   <el-button v-if="manageable" type="primary" size="small" @click="openCreate">创建新用户</el-button>
   <el-button v-if="manageable" size="small" @click="openLookup">精确查找</el-button>
  </PageHeader>
  <div class="end-users-learning"><span>学习资源：</span><a href="https://www.thingscloud.xyz/docs" target="_blank" rel="noopener noreferrer">什么是用户账号？</a></div>
  <div class="end-users-info"><strong>管理用户应用的账号</strong><p>平台提供了内置的用户账号系统，并与项目中的设备进行原生关联，您可以在用户应用中直接使用。</p></div>
  <AsyncState :forbidden="!readable" :loading="resource.loading.value" :error="resource.error.value" :empty="!resource.loading.value&&!resource.error.value&&!users.length" empty-text=" " @retry="refresh">
   <template #empty><el-button type="primary" @click="openCreate">创建新用户</el-button></template>
   <el-table :data="users" class="end-users-table" empty-text="暂无终端用户">
    <el-table-column prop="username" label="用户名" min-width="160" />
    <el-table-column label="显示名称" min-width="140"><template #default="{row}">{{ row.displayName || '—' }}</template></el-table-column>
    <el-table-column label="账号状态" width="110" align="center"><template #default="{row}"><span :class="{'is-disabled':row.status!=='ACTIVE'}">{{ statusLabel(row.status) }}</span></template></el-table-column>
    <el-table-column label="项目角色" min-width="130"><template #default="{row}">{{ roleLabel(row.role) }}</template></el-table-column>
    <el-table-column label="角色状态" width="110" align="center"><template #default="{row}">{{ roleStatusLabel(row.roleStatus) }}</template></el-table-column>
    <el-table-column label="分配时间" min-width="170" align="center"><template #default="{row}">{{ row.assignedAt ? formatTime(row.assignedAt) : '—' }}</template></el-table-column>
    <el-table-column label="设备" width="80" align="center"><template #default="{row}"><el-button link type="primary" :disabled="devicesBusy" @click="openDevices(row)">查看</el-button></template></el-table-column>
    <el-table-column v-if="manageable" label="操作" width="300" align="center"><template #default="{row}"><el-button link type="primary" :disabled="actionBusy===row.id" @click="openRole(row)">修改角色</el-button><el-button link type="primary" :disabled="actionBusy===row.id" @click="openContact(row)">接收号码</el-button><el-button link :type="row.roleStatus==='ACTIVE'?'danger':'primary'" :disabled="actionBusy===row.id" @click="changeStatus(row)">{{ row.roleStatus==='ACTIVE'?'停用':'恢复' }}</el-button></template></el-table-column>
   </el-table>
   <div v-if="hasMore" class="end-users-more"><el-button size="small" :loading="moreBusy" :disabled="moreBusy" @click="loadMore">加载更多</el-button></div>
  </AsyncState>
  <el-dialog v-model="roleDialogOpen" title="修改终端用户角色" width="min(420px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!roleBusy" :show-close="!roleBusy" @close="closeRole">
   <p class="role-target">{{ roleTarget?.displayName ? `${roleTarget.displayName}（${roleTarget.username}）` : roleTarget?.username }}</p>
   <el-form label-position="top" :disabled="roleBusy"><el-form-item label="项目角色"><el-select v-model="roleDraft" aria-label="终端用户项目角色" style="width:100%"><el-option v-for="role in roleOptions" :key="role" :value="role" :label="roleNames[role]" /></el-select></el-form-item></el-form>
   <template #footer><el-button :disabled="roleBusy" @click="closeRole">取消</el-button><el-button type="primary" :loading="roleBusy" :disabled="roleBusy||!roleDraft" @click="saveRole">保存</el-button></template>
  </el-dialog>
  <el-dialog v-model="createOpen" title="创建终端用户" width="min(460px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!createBusy" :show-close="!createBusy" @close="closeCreate">
   <p v-if="createdUser" class="create-created">用户已创建：{{ createdUser.username }}。只需重新分配项目角色。</p>
   <el-form label-position="top" :disabled="createBusy||!!createdUser||createUnknown">
    <el-form-item label="用户名"><el-input v-model="createForm.username" aria-label="终端用户用户名" maxlength="128" placeholder="租户内用户名" /></el-form-item>
    <el-form-item label="初始口令"><el-input v-model="createForm.password" aria-label="终端用户初始口令" type="password" show-password maxlength="128" placeholder="8至128字符" /></el-form-item>
    <el-form-item label="显示名称"><el-input v-model="createForm.displayName" aria-label="终端用户显示名称" maxlength="128" placeholder="可选" /></el-form-item>
    <el-form-item label="项目角色"><el-select v-model="createForm.role" aria-label="新终端用户项目角色" style="width:100%"><el-option v-for="role in roleOptions" :key="role" :value="role" :label="roleNames[role]" /></el-select></el-form-item>
   </el-form>
   <el-alert v-if="createError" :title="createError" :type="createUnknown?'warning':'error'" :closable="false" />
   <template #footer><el-button :disabled="createBusy" @click="closeCreate">取消</el-button><el-button type="primary" :loading="createBusy" :disabled="createBusy||createUnknown" @click="createUser">{{ createdUser?'重新分配角色':'创建并分配角色' }}</el-button></template>
  </el-dialog>
  <el-dialog v-model="devicesOpen" title="终端用户设备绑定" width="min(640px,96vw)" :close-on-click-modal="false" @close="devicesTarget=null">
   <p class="role-target">{{ devicesTarget?.displayName ? `${devicesTarget.displayName}（${devicesTarget.username}）` : devicesTarget?.username }}</p>
   <el-alert v-if="devicesError" :title="devicesError" type="error" :closable="false" />
   <el-table v-else v-loading="devicesBusy" :data="devices" empty-text="暂无设备绑定" size="small">
    <el-table-column prop="deviceId" label="设备 ID" min-width="280" />
    <el-table-column prop="relationRole" label="关系角色" width="110" />
    <el-table-column prop="status" label="状态" width="100" />
    <el-table-column label="建立时间" min-width="170"><template #default="{row}">{{ formatTime(row.createdAt) }}</template></el-table-column>
   </el-table>
   <template #footer><el-button :disabled="devicesBusy" @click="devicesOpen=false">关闭</el-button><el-button :loading="devicesBusy" :disabled="devicesBusy" @click="loadDevices">刷新</el-button></template>
  </el-dialog>
  <el-dialog v-model="lookupOpen" title="按精确用户名查找" width="min(460px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!lookupBusy" :show-close="!lookupBusy" @close="closeLookup">
   <el-form label-position="top" :disabled="lookupBusy"><el-form-item label="用户名"><el-input v-model="lookupName" aria-label="精确用户名" maxlength="64" placeholder="精确用户名，不做模糊匹配" @keyup.enter="runLookup" /></el-form-item></el-form>
   <p class="lookup-note">仅项目 OWNER/ADMIN 可查找当前项目归属租户内的已有账号；匹配空格裁剪后的精确用户名。</p>
   <el-alert v-if="lookupError" :title="lookupError" type="error" :closable="false" />
   <dl v-if="lookupResult" class="lookup-result"><dt>用户 ID</dt><dd>{{ lookupResult.id }}</dd><dt>用户名</dt><dd>{{ lookupResult.username }}</dd><dt>显示名称</dt><dd>{{ lookupResult.displayName||'—' }}</dd><dt>账号状态</dt><dd>{{ statusLabel(lookupResult.status) }}</dd><dt>项目角色</dt><dd>{{ roleLabel(lookupResult.role) }}</dd></dl>
   <template #footer><el-button :disabled="lookupBusy" @click="closeLookup">关闭</el-button><el-button type="primary" :loading="lookupBusy" :disabled="lookupBusy||!lookupName.trim()" @click="runLookup">精确查找</el-button></template>
  </el-dialog>
  <EndUserNotificationContactDialog v-model="contactOpen" :user="contactTarget" />
 </main>
</template>
<style scoped>
.end-users-learning{display:flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;margin-bottom:10px;background:#eaf0fe;color:#606266;font-size:14px}.end-users-learning a{color:#1e88e5;font-weight:700;text-decoration:none}.end-users-info{display:grid;gap:4px;padding:14px 16px;margin-bottom:14px;border:1px solid #ebeef5;border-radius:4px;background:#fafafa;color:#606266;font-size:14px;line-height:20px}.end-users-info strong{color:#303133;font-weight:600}.end-users-info p{margin:0}
.end-users-table{font-size:14px}.end-users-table .is-disabled{color:#909399}.role-target{margin:0 0 14px;color:#606266;font-size:14px;line-height:22px}.create-created{margin:0 0 14px;color:#606266;font-size:14px;line-height:22px}.end-users-more{display:flex;justify-content:center;margin-top:20px}.lookup-note{margin:0 0 14px;color:#909399;font-size:12px;line-height:18px}.lookup-result{display:grid;grid-template-columns:100px minmax(0,1fr);gap:8px 14px;margin:14px 0 0;font-size:14px;line-height:22px}.lookup-result dt{color:#909399}.lookup-result dd{margin:0;overflow-wrap:anywhere}
</style>
