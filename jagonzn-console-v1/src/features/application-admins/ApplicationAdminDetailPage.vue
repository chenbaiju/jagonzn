<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError, errorMessage, identityEpoch } from '@/core/http'
import { currentProject, projectId, session } from '@/core/session'
import { formatTime } from '@/core/time'
import { useResource } from '@/core/use-resource'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import SectionPanel from '@/ui/SectionPanel.vue'
import ApplicationAdminProfileFields from './ApplicationAdminProfileFields.vue'
import { applicationAdminApi } from './application-admin-api'
import {
  draftFromAdmin,
  emptyDraft,
  isUuid,
  permissionGroups,
  validatePassword,
  validateUpdateDraft,
  updateInput,
  type AdminDraft
} from './application-admin-model'

const route = useRoute(), router = useRouter()
const adminId = computed(() => typeof route.params.adminId === 'string' ? route.params.adminId : '')
const manager = computed(() => session.ready && !session.transitioning && !!session.user?.accountId && !!projectId.value && !!currentProject.value
  && ['OWNER','ADMIN'].includes(session.user?.projectRole || '') && ['OWNER','ADMIN'].includes(currentProject.value.myRole || '')
  && ['ACTIVE','ARCHIVED'].includes(currentProject.value.status || ''))
const writable = computed(() => manager.value && currentProject.value?.status === 'ACTIVE')
const resource = useResource(async signal => {
  const project = projectId.value
  if (!project) throw new Error('请选择当前项目')
  if (!isUuid(adminId.value)) throw new Error('管理员 ID 格式无效')
  return applicationAdminApi.get(project, adminId.value, signal)
})
const admin = computed(() => resource.data.value)
const editing = ref(false), draft = ref<AdminDraft>(emptyDraft()), editBusy = ref(false), editError = ref(''), editUnknown = ref(false), conflicted = ref(false)
const actionBusy = ref('')
const passwordOpen = ref(false), passwordValue = ref(''), passwordConfirm = ref(''), passwordError = ref(''), passwordBusy = ref(false)

watch([projectId, adminId, manager], () => {
  if (manager.value && isUuid(adminId.value)) void resource.reload()
  else resource.clear()
}, { immediate: true, flush: 'sync' })

const dirty = computed(() => editing.value && !!admin.value && JSON.stringify(draft.value) !== JSON.stringify(draftFromAdmin(admin.value)))

function startEdit() {
  if (!writable.value || !admin.value) return
  draft.value = draftFromAdmin(admin.value)
  editError.value = ''
  editUnknown.value = false
  conflicted.value = false
  editing.value = true
}
async function leaveEdit(): Promise<boolean> {
  if (editBusy.value) return false
  if (dirty.value) {
    try { await ElMessageBox.confirm('放弃尚未保存的编辑？', '应用管理员', { type: 'warning', confirmButtonText: '放弃', cancelButtonText: '继续编辑' }) }
    catch { return false }
  }
  editing.value = false
  editError.value = ''
  editUnknown.value = false
  conflicted.value = false
  return true
}
async function cancelEdit() { await leaveEdit() }
async function goBack() {
  if (actionBusy.value) return
  if (editing.value && !(await leaveEdit())) return
  await router.push('/admins')
}
async function saveEdit() {
  const current = admin.value
  if (!current || editBusy.value || conflicted.value || !writable.value) return
  const validation = validateUpdateDraft(draft.value)
  if (validation) { editError.value = validation; editUnknown.value = false; return }
  const project = projectId.value, epoch = identityEpoch()
  editBusy.value = true
  editError.value = ''
  editUnknown.value = false
  try {
    const updated = await applicationAdminApi.update(project, current.id, updateInput(draft.value, current.revision))
    if (epoch !== identityEpoch() || project !== projectId.value) return
    resource.data.value = updated
    editing.value = false
    ElMessage.success('管理员资料已保存')
    await resource.reload()
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.status === 409) {
      conflicted.value = true
      editError.value = '保存被拒绝：账号已被其他操作修改。请重新读取最新资料后再编辑，不会覆盖他人修改。'
    } else if (cause instanceof ApiError && cause.outcomeUnknown) {
      editUnknown.value = true
      editError.value = `${errorMessage(cause)}；保存结果未知，已重新读取账号核对，不会自动重试。`
      editing.value = false
      await resource.reload()
    } else if (cause instanceof ApiError && cause.status === 404) {
      editError.value = '管理员已不存在或不属于当前项目。'
      editing.value = false
      await resource.reload()
    } else {
      editError.value = errorMessage(cause)
    }
  } finally { if (epoch === identityEpoch()) editBusy.value = false }
}
async function reloadAfterConflict() {
  conflicted.value = false
  editing.value = false
  editError.value = ''
  await resource.reload()
}
async function toggleStatus() {
  const current = admin.value
  if (!current || !writable.value || actionBusy.value) return
  const target = current.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  try { await ElMessageBox.confirm(target === 'DISABLED' ? `确认停用管理员“${current.name}”？` : `确认启用管理员“${current.name}”？`, '应用管理员', { type: 'warning', confirmButtonText: target === 'DISABLED' ? '停用' : '启用', cancelButtonText: '取消' }) }
  catch { return }
  const project = projectId.value, epoch = identityEpoch()
  actionBusy.value = current.id
  try {
    const updated = await applicationAdminApi.changeStatus(project, current.id, target, current.revision)
    if (epoch !== identityEpoch() || project !== projectId.value) return
    resource.data.value = updated
    ElMessage.success(target === 'DISABLED' ? '管理员已停用' : '管理员已启用')
    await resource.reload()
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.outcomeUnknown) { ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取账号核对`); await resource.reload() }
    else if (cause instanceof ApiError && cause.status === 409) { ElMessage.warning('账号已被其他操作修改，已重新读取；请核对后再操作。'); await resource.reload() }
    else ElMessage.error(errorMessage(cause))
  } finally { if (epoch === identityEpoch()) actionBusy.value = '' }
}
function openPassword() {
  if (!writable.value || actionBusy.value) return
  passwordValue.value = ''
  passwordConfirm.value = ''
  passwordError.value = ''
  passwordOpen.value = true
}
function closePassword() { if (!passwordBusy.value) passwordOpen.value = false }
async function submitPassword() {
  const current = admin.value
  if (!current || passwordBusy.value || !writable.value) return
  try { validatePassword(passwordValue.value) }
  catch (error) { passwordError.value = errorMessage(error); return }
  if (passwordValue.value !== passwordConfirm.value) { passwordError.value = '两次输入的新密码不一致'; return }
  const project = projectId.value, epoch = identityEpoch()
  passwordBusy.value = true
  passwordError.value = ''
  try {
    const updated = await applicationAdminApi.resetPassword(project, current.id, passwordValue.value, current.revision)
    if (epoch !== identityEpoch() || project !== projectId.value) return
    resource.data.value = updated
    passwordOpen.value = false
    passwordValue.value = ''
    passwordConfirm.value = ''
    ElMessage.success('管理员密码已重设')
    await resource.reload()
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.outcomeUnknown) {
      passwordOpen.value = false
      ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取账号核对`)
      await resource.reload()
    } else if (cause instanceof ApiError && cause.status === 409) {
      passwordError.value = '账号已被其他操作修改，已重新读取；请核对后再次确认。'
      await resource.reload()
    } else passwordError.value = errorMessage(cause)
  } finally { if (epoch === identityEpoch()) passwordBusy.value = false }
}
async function removeAdmin() {
  const current = admin.value
  if (!current || !writable.value || actionBusy.value) return
  try { await ElMessageBox.confirm(`确认删除管理员“${current.name}（${current.loginName}）”？删除后目录不再返回该账号，登录名可重新使用；当前没有应用管理员会话宿主，不会撤销会话。`, '删除应用管理员', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }) }
  catch { return }
  const project = projectId.value, epoch = identityEpoch()
  actionBusy.value = current.id
  try {
    await applicationAdminApi.delete(project, current.id, current.revision)
    if (epoch !== identityEpoch() || project !== projectId.value) return
    ElMessage.success('管理员已删除')
    await router.replace('/admins')
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.outcomeUnknown) { ElMessage.warning(`${errorMessage(cause)}；删除结果未知，已重新读取账号核对`); await resource.reload() }
    else if (cause instanceof ApiError && cause.status === 409) { ElMessage.warning('账号已被其他操作修改，已重新读取；请核对后再操作。'); await resource.reload() }
    else ElMessage.error(errorMessage(cause))
  } finally { if (epoch === identityEpoch()) actionBusy.value = '' }
}
</script>

<template>
  <main class="tl-page application-admin-detail">
    <PageHeader :title="admin?.name || '管理员详情'" back :back-disabled="editBusy||!!actionBusy" @back="goBack">
      <template v-if="admin && !editing">
        <el-button v-if="writable" size="small" @click="startEdit">编辑</el-button>
        <el-button v-if="writable" size="small" :type="admin.status==='ACTIVE'?'danger':'primary'" :disabled="!!actionBusy" @click="toggleStatus">{{ admin.status==='ACTIVE'?'停用':'启用' }}</el-button>
        <el-button v-if="writable" size="small" :disabled="!!actionBusy" @click="openPassword">重设密码</el-button>
        <el-button v-if="writable" size="small" type="danger" plain :disabled="!!actionBusy" @click="removeAdmin">删除</el-button>
      </template>
      <template v-else-if="editing">
        <el-button size="small" :disabled="editBusy" @click="cancelEdit">取消</el-button>
        <el-button type="primary" size="small" :loading="editBusy" :disabled="editBusy||conflicted" @click="saveEdit">保存</el-button>
      </template>
    </PageHeader>
    <AsyncState :forbidden="!manager" :loading="resource.loading.value" :error="resource.error.value" @retry="resource.reload">
      <template v-if="admin">
        <el-alert v-if="!writable" title="当前项目不是活动状态，管理操作不可用。" type="warning" :closable="false" class="admin-detail__alert" />
        <el-alert v-if="editError" :title="editError" :type="editUnknown?'warning':'error'" :closable="false" class="admin-detail__alert">
          <el-button v-if="conflicted" size="small" @click="reloadAfterConflict">重新读取最新资料</el-button>
        </el-alert>
        <template v-if="!editing">
          <SectionPanel title="账号资料">
            <dl class="tl-key-values">
              <dt>名称</dt><dd>{{ admin.name }}</dd>
              <dt>登录名</dt><dd>{{ admin.loginName }}</dd>
              <dt>状态</dt><dd><el-tag :type="admin.status==='ACTIVE'?'success':'info'" size="small">{{ admin.status==='ACTIVE'?'启用':'停用' }}</el-tag></dd>
              <dt>账号版本</dt><dd>{{ admin.revision }}</dd>
              <dt>创建时间</dt><dd>{{ formatTime(admin.createdAt) }}</dd>
              <dt>更新时间</dt><dd>{{ formatTime(admin.updatedAt) }}</dd>
              <dt>邮箱</dt><dd>{{ admin.email || '—' }}</dd>
              <dt>手机号</dt><dd>{{ admin.phone || '—' }}</dd>
              <dt>描述</dt><dd>{{ admin.description || '—' }}</dd>
              <dt>标签</dt><dd><div v-if="admin.tags.length" class="admin-tags"><el-tag v-for="(tag,index) in admin.tags" :key="index" size="small">{{ tag.name }}<template v-if="tag.value">：{{ tag.value }}</template></el-tag></div><span v-else>—</span></dd>
            </dl>
          </SectionPanel>
          <SectionPanel title="权限（配置证据）">
            <el-alert title="权限位当前只作为账号配置保存和回读；设备、任务、告警规则和用户操作的实际准入待登录宿主与权限映射验收。" type="info" :closable="false" class="admin-permission-note" />
            <div class="admin-permission-groups">
              <section v-for="group in permissionGroups" :key="group.label" class="admin-permission-groups__group">
                <h3>{{ group.label }}</h3>
                <div><el-checkbox v-for="item in group.items" :key="item.key" :model-value="admin.permissions[item.key]" disabled>{{ item.label }}</el-checkbox></div>
              </section>
            </div>
          </SectionPanel>
        </template>
        <SectionPanel v-else title="编辑资料与权限">
          <ApplicationAdminProfileFields v-model="draft" mode="edit" :disabled="editBusy||conflicted" />
        </SectionPanel>
      </template>
    </AsyncState>
    <el-dialog v-model="passwordOpen" title="重设管理员密码" width="min(460px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!passwordBusy" :show-close="!passwordBusy" @close="closePassword">
      <el-form label-position="top" :disabled="passwordBusy">
        <el-form-item label="新密码"><el-input v-model="passwordValue" aria-label="新管理员密码" type="password" show-password maxlength="128" placeholder="8至128字符" /></el-form-item>
        <el-form-item label="确认新密码"><el-input v-model="passwordConfirm" aria-label="确认新管理员密码" type="password" show-password maxlength="128" placeholder="再次输入新密码" /></el-form-item>
      </el-form>
      <p class="admin-password-note">重设后旧口令立即失效。当前应用管理员登录宿主尚未接入，因此不会撤销任何应用管理员会话。</p>
      <el-alert v-if="passwordError" :title="passwordError" type="error" :closable="false" />
      <template #footer><el-button :disabled="passwordBusy" @click="closePassword">取消</el-button><el-button type="primary" :loading="passwordBusy" :disabled="passwordBusy" @click="submitPassword">确认重设</el-button></template>
    </el-dialog>
  </main>
</template>

<style scoped>
.admin-detail__alert{margin-bottom:14px}
.admin-tags{display:flex;flex-wrap:wrap;gap:6px}
.admin-permission-note{margin-bottom:16px}
.admin-permission-groups{display:flex;flex-direction:column;gap:12px}
.admin-permission-groups__group{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px}
.admin-permission-groups__group h3{margin:0;font-size:14px;font-weight:400;color:var(--tl-muted);line-height:32px}
.admin-permission-groups__group>div{display:flex;flex-wrap:wrap;gap:4px 18px}
.admin-permission-groups__group :deep(.el-checkbox){margin-right:0;height:32px}
.admin-password-note{margin:0 0 14px;color:var(--tl-muted);font-size:12px;line-height:18px}
@media(max-width:760px){.admin-permission-groups__group{grid-template-columns:1fr;gap:2px}.admin-permission-groups__group h3{line-height:24px}}
</style>
