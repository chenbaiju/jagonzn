<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError, errorMessage, identityEpoch, onIdentityChange } from '@/core/http'
import { currentProject, projectId, session } from '@/core/session'
import { formatTime } from '@/core/time'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import ApplicationAdminProfileFields from './ApplicationAdminProfileFields.vue'
import { applicationAdminApi } from './application-admin-api'
import { createInput, emptyDraft, validateCreateDraft, type AdminDraft } from './application-admin-model'
import {
  clearAdminCreateRecovery,
  newIdempotencyKey,
  readAdminCreateRecovery,
  saveAdminCreateRecovery,
  type AdminCreateRecovery
} from './application-admin-recovery'

const router = useRouter()
const manager = computed(() => session.ready && !session.transitioning && !!session.user?.accountId && !!projectId.value && !!currentProject.value
  && ['OWNER','ADMIN'].includes(session.user?.projectRole || '') && ['OWNER','ADMIN'].includes(currentProject.value.myRole || '')
  && ['ACTIVE','ARCHIVED'].includes(currentProject.value.status || ''))
const writable = computed(() => manager.value && currentProject.value?.status === 'ACTIVE')
const draft = ref<AdminDraft>(emptyDraft())
const idempotencyKey = ref('')
const recovery = ref<AdminCreateRecovery | null>(null)
/** 页面重新加载后只能保留登录名和时间，幂等键已丢弃，提交保持禁用。 */
const degraded = computed(() => !!recovery.value && recovery.value.idempotencyKey === null)
const unknown = ref(false)
const busy = ref(false)
const error = ref('')

/** 持久记录只有登录名可回填；其余表单内容只允许留在当前页面内存。 */
function draftFromRecovery(record: AdminCreateRecovery): AdminDraft {
  return { ...emptyDraft(), loginName: record.loginName }
}
function resetFromStorage() {
  const accountId = session.user?.accountId
  recovery.value = projectId.value && accountId
    ? readAdminCreateRecovery(projectId.value, accountId, identityEpoch())
    : null
  unknown.value = !!recovery.value
  idempotencyKey.value = recovery.value?.idempotencyKey || ''
  draft.value = recovery.value ? draftFromRecovery(recovery.value) : emptyDraft()
  error.value = ''
}
watch(projectId, resetFromStorage, { immediate: true })
const stopIdentity = onIdentityChange(() => {
  recovery.value = null
  unknown.value = false
  idempotencyKey.value = ''
  draft.value = emptyDraft()
  error.value = ''
})
onScopeDispose(stopIdentity)

const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(recovery.value ? draftFromRecovery(recovery.value) : emptyDraft()))

function goDirectory() { void router.push('/admins') }

async function cancel() {
  if (busy.value) return
  if (!unknown.value && dirty.value) {
    try { await ElMessageBox.confirm('放弃当前创建内容？', '创建管理员', { type: 'warning', confirmButtonText: '放弃', cancelButtonText: '继续编辑' }) }
    catch { return }
  }
  goDirectory()
}

async function restart() {
  if (busy.value || !projectId.value) return
  try { await ElMessageBox.confirm('清除恢复记录并重新开始创建？请先到管理员目录核对是否存在同名账号。', '创建结果未确认', { type: 'warning', confirmButtonText: '重新开始', cancelButtonText: '取消' }) }
  catch { return }
  clearAdminCreateRecovery(projectId.value)
  recovery.value = null
  unknown.value = false
  idempotencyKey.value = ''
  draft.value = emptyDraft()
  error.value = ''
}

async function submit() {
  if (busy.value || unknown.value || !writable.value) return
  const validation = validateCreateDraft(draft.value)
  if (validation) { error.value = validation; return }
  if (!idempotencyKey.value) idempotencyKey.value = newIdempotencyKey()
  const project = projectId.value, epoch = identityEpoch(), key = idempotencyKey.value
  busy.value = true
  error.value = ''
  try {
    const created = await applicationAdminApi.create(project, createInput(draft.value), key)
    if (epoch !== identityEpoch() || project !== projectId.value) return
    clearAdminCreateRecovery(project)
    recovery.value = null
    ElMessage.success('管理员已创建')
    await router.replace(`/admins/${created.id}`)
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.outcomeUnknown) {
      unknown.value = true
      const accountId = session.user?.accountId
      if (!accountId) {
        error.value = `${errorMessage(cause)}；创建结果未知，当前操作者身份已不可用，无法保存恢复记录。请立即核对账号事实，不要自动重试。`
        return
      }
      const record: AdminCreateRecovery = Object.freeze({
        version: 1 as const,
        projectId: project,
        accountId,
        sessionEpoch: epoch,
        idempotencyKey: key,
        loginName: draft.value.loginName.trim(),
        requestedAt: new Date().toISOString()
      })
      const saved = saveAdminCreateRecovery(record)
      recovery.value = record
      error.value = `${errorMessage(cause)}；创建结果未知${saved ? '，已保留最小恢复记录（项目、操作者、登录名、幂等键、请求时间）' : '，恢复记录未能写入本标签页'}。邮箱、手机号、描述、标签和权限只留在当前页面内存；同名账号只作调查线索，请先到管理员目录核对，不会自动重试。`
    } else {
      // 明确的 4xx 拒绝可换新键重试；未知结果必须保留原键，不能在这里清掉。
      idempotencyKey.value = ''
      error.value = cause instanceof ApiError && cause.code === 60071
        ? '登录名已存在（项目内忽略大小写）；请修改登录名后重新创建。'
        : errorMessage(cause)
    }
  } finally {
    if (epoch === identityEpoch()) busy.value = false
  }
}
</script>

<template>
  <main class="tl-page admin-create">
    <PageHeader title="创建管理员" back :back-disabled="busy" @back="cancel" />
    <AsyncState :forbidden="!manager">
      <template v-if="manager">
        <el-alert v-if="!writable" title="当前项目不是活动状态，不能创建应用管理员。" type="warning" :closable="false" />
        <el-alert v-if="unknown || recovery" type="warning" :closable="false" class="admin-create__recovery">
          <template #title>有一次创建结果未确认{{ recovery ? `（登录名 ${recovery.loginName}，${formatTime(recovery.requestedAt)}）` : '' }}</template>
          <p v-if="degraded">页面已重新加载，原幂等键已丢弃；只保留登录名和请求时间作为核对提示。邮箱、手机号、描述、标签、权限和口令均未持久化。同名账号只作调查线索，不能确认由该请求创建；请先到管理员目录核对，不会自动重发。</p>
          <p v-else>恢复记录只保留项目、操作者身份、登录名、幂等键和请求时间；邮箱、手机号、描述、标签、权限和口令均未持久化。同名账号只作调查线索，不能确认由该请求创建；请先到管理员目录核对。</p>
          <div class="admin-create__recovery-actions">
            <el-button size="small" @click="goDirectory">前往管理员目录</el-button>
            <el-button size="small" type="warning" plain @click="restart">清除恢复记录并重新开始</el-button>
          </div>
        </el-alert>
        <el-alert v-if="error" :title="error" :type="unknown ? 'warning' : 'error'" :closable="false" class="admin-create__error" />
        <ApplicationAdminProfileFields v-model="draft" mode="create" :disabled="busy || unknown || !writable" />
        <div class="tl-form-actions">
          <el-button :disabled="busy" @click="cancel">取消</el-button>
          <el-button type="primary" :loading="busy" :disabled="busy || unknown || !writable" @click="submit">创建</el-button>
        </div>
      </template>
    </AsyncState>
  </main>
</template>

<style scoped>
.admin-create__recovery,.admin-create__error{margin-bottom:18px}
.admin-create__recovery p{margin:6px 0 10px;font-size:13px;line-height:20px}
.admin-create__recovery-actions{display:flex;gap:8px;flex-wrap:wrap}
</style>
