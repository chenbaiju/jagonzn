<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError, errorMessage, identityEpoch, onIdentityChange } from '@/core/http'
import { can, currentProject, loadSession, projectId, session } from '@/core/session'
import { formatTime } from '@/core/time'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import SectionPanel from '@/ui/SectionPanel.vue'
import { projectMemberApi, type AssignableRole, type ProjectInvitation, type ProjectMember, type ProjectRole } from './project-member-api'

const router = useRouter()
const roleNames: Record<ProjectRole, string> = { OWNER: '所有者', ADMIN: '管理员', OPERATOR: '操作员', VIEWER: '观察者' }
const assignable: AssignableRole[] = ['ADMIN','OPERATOR','VIEWER']
const readable = computed(() => can('member:read'))
const canInvite = computed(() => can('member:invite'))
const canUpdateRole = computed(() => can('member:update_role'))
const canRemove = computed(() => can('member:remove'))
const active = computed(() => currentProject.value?.status === 'ACTIVE')
const isOwner = computed(() => session.user?.projectRole === 'OWNER' && currentProject.value?.myRole === 'OWNER')
const selfAccountId = computed(() => session.user?.accountId || '')
const members = ref<ProjectMember[]>([]), invitations = ref<ProjectInvitation[]>([]), invitationNext = ref<string|null>(null), invitationHasMore = ref(false)
const loading = ref(false), membersError = ref(''), invitationsLoading = ref(false), invitationsError = ref(''), moreBusy = ref(false)
const actionBusy = ref(''), inviteOpen = ref(false), inviteBusy = ref(false), inviteError = ref('')
const inviteForm = reactive<{email:string; role:AssignableRole}>({ email: '', role: 'OPERATOR' })
const roleOpen = ref(false), roleTarget = ref<ProjectMember|null>(null), roleDraft = ref<AssignableRole>('OPERATOR'), roleBusy = ref(false), roleError = ref('')
let generation = 0

function reset() {
  generation++
  members.value = []; invitations.value = []; invitationNext.value = null; invitationHasMore.value = false
  loading.value = false; membersError.value = ''; invitationsLoading.value = false; invitationsError.value = ''; moreBusy.value = false
  actionBusy.value = ''; inviteOpen.value = false; inviteBusy.value = false; inviteError.value = ''
  roleOpen.value = false; roleTarget.value = null; roleBusy.value = false; roleError.value = ''
}
async function refresh() {
  const token = ++generation, project = projectId.value, epoch = identityEpoch()
  if (!readable.value || !project) { members.value = []; invitations.value = []; return }
  loading.value = true; membersError.value = ''
  try {
    const rows = await projectMemberApi.listMembers(project)
    if (token !== generation || project !== projectId.value || epoch !== identityEpoch()) return
    members.value = [...rows]
  } catch (cause) {
    if (token === generation && project === projectId.value) membersError.value = errorMessage(cause)
  } finally { if (token === generation) loading.value = false }
  if (token === generation && canInvite.value) void loadInvitations(true)
}
async function loadInvitations(first: boolean) {
  const token = generation, project = projectId.value, epoch = identityEpoch()
  if (!canInvite.value || !project || (!first && (!invitationHasMore.value || !invitationNext.value || moreBusy.value))) return
  const cursor = first ? undefined : invitationNext.value || undefined
  if (first) { invitationsLoading.value = true; invitationsError.value = '' } else moreBusy.value = true
  try {
    const page = await projectMemberApi.listInvitations(project, cursor)
    if (token !== generation || project !== projectId.value || epoch !== identityEpoch()) return
    invitations.value = first ? [...page.items] : [...invitations.value, ...page.items.filter(item => !invitations.value.some(row => row.id === item.id))]
    invitationNext.value = page.nextCursor
    invitationHasMore.value = page.hasMore
  } catch (cause) {
    if (token === generation && project === projectId.value) invitationsError.value = errorMessage(cause)
  } finally {
    if (token === generation) { invitationsLoading.value = false; moreBusy.value = false }
  }
}
watch([projectId, readable, canInvite], (next, previous) => {
  if (!next[1]) reset()
  else if (!previous || next[0] !== previous[0]) { members.value = []; invitations.value = []; invitationNext.value = null; invitationHasMore.value = false; reset(); void refresh() }
  else void loadInvitations(true)
}, { immediate: true, flush: 'sync' })
const stopIdentity = onIdentityChange(() => { reset() })
onScopeDispose(stopIdentity)

function immutable(row: ProjectMember) { return row.role === 'OWNER' || row.accountId === selfAccountId.value }
function immutableHint(row: ProjectMember) { return row.role === 'OWNER' ? '项目所有者不可在此修改' : row.accountId === selfAccountId.value ? '不能修改自己' : '' }
function tagType(role: ProjectRole): 'warning' | 'primary' | 'success' | 'info' { return role === 'OWNER' ? 'warning' : role === 'ADMIN' ? 'primary' : role === 'OPERATOR' ? 'success' : 'info' }
function roleName(value: unknown) { return roleNames[value as ProjectRole] || String(value) }
function openInvite() { if (!canInvite.value || !active.value) return; inviteForm.email = ''; inviteForm.role = 'OPERATOR'; inviteError.value = ''; inviteOpen.value = true }
function closeInvite() { if (!inviteBusy.value) inviteOpen.value = false }
async function submitInvite() {
  const project = projectId.value
  if (!project || inviteBusy.value || !canInvite.value) return
  const email = inviteForm.email.trim()
  if (!email || email.length > 254 || !email.includes('@')) { inviteError.value = '请输入有效邮箱'; return }
  const epoch = identityEpoch(); inviteBusy.value = true; inviteError.value = ''
  try {
    await projectMemberApi.createInvitation(project, { email, role: inviteForm.role })
    if (epoch !== identityEpoch() || project !== projectId.value) return
    ElMessage.success('邀请已创建，等待对方接受')
    inviteOpen.value = false
    await loadInvitations(true)
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.outcomeUnknown) { inviteError.value = `${errorMessage(cause)}；结果未知，已重新读取邀请列表核对`; await loadInvitations(true) }
    else if (cause instanceof ApiError && cause.status === 404) inviteError.value = '该邮箱尚未注册；请确认对方已注册控制台账号。'
    else if (cause instanceof ApiError && cause.status === 409) inviteError.value = `邀请未创建：${errorMessage(cause)}`
    else inviteError.value = errorMessage(cause)
  } finally { if (epoch === identityEpoch()) inviteBusy.value = false }
}
function openRole(row: ProjectMember) {
  if (!canUpdateRole.value || !active.value || immutable(row) || actionBusy.value) return
  roleTarget.value = row; roleDraft.value = row.role === 'OWNER' ? 'OPERATOR' : row.role; roleError.value = ''; roleOpen.value = true
}
function closeRole() { if (!roleBusy.value) roleOpen.value = false }
async function saveRole() {
  const row = roleTarget.value, project = projectId.value
  if (!row || !project || roleBusy.value || !canUpdateRole.value) return
  const epoch = identityEpoch(); roleBusy.value = true; roleError.value = ''
  try {
    await projectMemberApi.updateRole(project, row.accountId, roleDraft.value)
    if (epoch !== identityEpoch() || project !== projectId.value) return
    ElMessage.success('成员角色已更新'); roleOpen.value = false; await refresh()
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.outcomeUnknown) { roleError.value = `${errorMessage(cause)}；结果未知，已重新读取成员目录核对`; await refresh() }
    else roleError.value = errorMessage(cause)
  } finally { if (epoch === identityEpoch()) roleBusy.value = false }
}
async function removeMember(row: ProjectMember) {
  const project = projectId.value
  if (!project || actionBusy.value || !canRemove.value || immutable(row)) return
  try { await ElMessageBox.confirm(`确认将 ${row.displayName || row.email} 移出项目？只解除项目关联，不删除账号。`, '移除成员', { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' }) }
  catch { return }
  const epoch = identityEpoch(); actionBusy.value = row.accountId
  try {
    await projectMemberApi.remove(project, row.accountId)
    if (epoch !== identityEpoch() || project !== projectId.value) return
    ElMessage.success('成员已移出项目'); await refresh()
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.outcomeUnknown) { ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取成员目录核对`); await refresh() }
    else ElMessage.error(errorMessage(cause))
  } finally { if (epoch === identityEpoch()) actionBusy.value = '' }
}
async function transferOwner(row: ProjectMember) {
  const project = projectId.value
  if (!project || actionBusy.value || !isOwner.value || immutable(row)) return
  try { await ElMessageBox.confirm(`确认把项目所有权转让给 ${row.displayName || row.email}？转让后你将成为管理员。`, '转让项目所有权', { type: 'warning', confirmButtonText: '转让', cancelButtonText: '取消' }) }
  catch { return }
  const epoch = identityEpoch(); actionBusy.value = row.accountId
  try {
    await projectMemberApi.transferOwner(project, row.accountId)
    if (epoch !== identityEpoch() || project !== projectId.value) return
    ElMessage.success('项目所有权已转让')
    await loadSession()
    await refresh()
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.outcomeUnknown) {
      ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取会话和成员目录核对`)
      // 转让可能已成功：当前账号的角色可能已变为 ADMIN，必须重新读取会话而不是只刷新成员表。
      await loadSession().catch(() => undefined)
      if (epoch !== identityEpoch() || project !== projectId.value) return
      await refresh()
    } else ElMessage.error(errorMessage(cause))
  } finally { if (epoch === identityEpoch()) actionBusy.value = '' }
}
async function leaveProject() {
  const project = projectId.value
  if (!project || actionBusy.value || isOwner.value) return
  try { await ElMessageBox.confirm('确认退出当前项目？这只会解除你的项目成员关联，不删除账号。', '退出项目', { type: 'warning', confirmButtonText: '退出', cancelButtonText: '取消' }) }
  catch { return }
  const epoch = identityEpoch(); actionBusy.value = selfAccountId.value || 'leave'
  try {
    await projectMemberApi.leave(project)
    if (epoch !== identityEpoch()) return
    ElMessage.success('已退出项目')
    await loadSession().catch(() => undefined)
    await router.replace('/projects')
  } catch (cause) {
    if (epoch !== identityEpoch()) return
    if (cause instanceof ApiError && cause.outcomeUnknown) {
      ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取会话核对`)
      // 退出可能已成功：重新读取会话，项目已不在列表中时返回项目列表，否则刷新成员。
      await loadSession().catch(() => undefined)
      if (epoch !== identityEpoch()) return
      if (!session.projects.some(item => item.id === project)) await router.replace('/projects')
      else await refresh()
      return
    }
    ElMessage.error(errorMessage(cause))
  } finally { if (epoch === identityEpoch()) actionBusy.value = '' }
}
async function resend(row: ProjectInvitation) {
  const project = projectId.value
  if (!project || actionBusy.value || !canInvite.value) return
  const epoch = identityEpoch(); actionBusy.value = row.id
  try {
    await projectMemberApi.resendInvitation(project, row.id)
    if (epoch !== identityEpoch() || project !== projectId.value) return
    ElMessage.success('邀请已重发，旧邀请码失效'); await loadInvitations(true)
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.outcomeUnknown) { ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取邀请列表核对`); await loadInvitations(true) }
    else ElMessage.error(errorMessage(cause))
  } finally { if (epoch === identityEpoch()) actionBusy.value = '' }
}
async function revoke(row: ProjectInvitation) {
  const project = projectId.value
  if (!project || actionBusy.value || !canInvite.value) return
  try { await ElMessageBox.confirm(`确认撤回发给 ${row.targetEmail} 的邀请？`, '撤回邀请', { type: 'warning', confirmButtonText: '撤回', cancelButtonText: '取消' }) }
  catch { return }
  const epoch = identityEpoch(); actionBusy.value = row.id
  try {
    await projectMemberApi.revokeInvitation(project, row.id)
    if (epoch !== identityEpoch() || project !== projectId.value) return
    ElMessage.success('邀请已撤回'); await loadInvitations(true)
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.outcomeUnknown) { ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取邀请列表核对`); await loadInvitations(true) }
    else ElMessage.error(errorMessage(cause))
  } finally { if (epoch === identityEpoch()) actionBusy.value = '' }
}
</script>

<template>
  <main class="tl-page project-members-page">
    <PageHeader title="项目成员与邀请" :count="members.length">
      <el-button v-if="canInvite && active" type="primary" size="small" @click="openInvite">邀请成员</el-button>
      <el-button v-if="readable && !isOwner && active" size="small" :disabled="!!actionBusy" @click="leaveProject">退出项目</el-button>
    </PageHeader>
    <p class="member-scope-note">项目成员是 ThingsLink 控制台身份；应用终端用户使用独立账号与项目角色，应用管理员是项目级第三类身份。三者不复用令牌或权限。</p>
    <AsyncState :forbidden="!readable" :loading="loading" :error="membersError || undefined" :empty="!loading && !membersError && !members.length" empty-text="暂无项目成员" @retry="refresh">
      <el-table :data="members" class="member-table">
        <el-table-column label="成员" min-width="230">
          <template #default="{row}"><div class="member-identity"><strong>{{ row.displayName || row.email }}</strong><span>{{ row.email }}</span></div></template>
        </el-table-column>
        <el-table-column label="角色" width="120"><template #default="{row}"><el-tag :type="tagType(row.role)" size="small">{{ roleName(row.role) }}</el-tag></template></el-table-column>
        <el-table-column label="加入时间" min-width="170"><template #default="{row}">{{ formatTime(row.joinedAt) }}</template></el-table-column>
        <el-table-column label="操作" width="260" align="center">
          <template #default="scope">
            <span v-if="immutable(scope.row)" class="member-hint">{{ immutableHint(scope.row) }}</span>
            <template v-else>
              <el-button v-if="canUpdateRole && active" link type="primary" :disabled="actionBusy===scope.row.accountId" @click="openRole(scope.row)">修改角色</el-button>
              <el-button v-if="isOwner && active" link type="warning" :disabled="actionBusy===scope.row.accountId" @click="transferOwner(scope.row)">转让所有权</el-button>
              <el-button v-if="canRemove && active" link type="danger" :disabled="actionBusy===scope.row.accountId" @click="removeMember(scope.row)">移除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </AsyncState>
    <SectionPanel v-if="readable && canInvite" title="待接受邀请" class="member-invitations">
      <template #extra><el-button link type="primary" :loading="invitationsLoading" @click="loadInvitations(true)">刷新</el-button></template>
      <el-alert v-if="invitationsError" :title="invitationsError" type="error" :closable="false" class="member-invitation-error" />
      <el-table v-else v-loading="invitationsLoading" :data="invitations" empty-text="暂无待接受邀请" size="small">
        <el-table-column prop="targetEmail" label="邀请邮箱" min-width="220" />
        <el-table-column label="角色" width="110"><template #default="{row}">{{ roleName(row.role) }}</template></el-table-column>
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column prop="deliveryStatus" label="投递" width="120" />
        <el-table-column label="到期时间" min-width="170"><template #default="{row}">{{ formatTime(row.expiresAt) }}</template></el-table-column>
        <el-table-column label="操作" width="150" align="center">
          <template #default="{row}">
            <el-button v-if="row.status==='PENDING'" link type="primary" :disabled="actionBusy===row.id" @click="resend(row)">重发</el-button>
            <el-button v-if="row.status==='PENDING'" link type="danger" :disabled="actionBusy===row.id" @click="revoke(row)">撤回</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="invitationHasMore" class="member-more"><el-button size="small" :loading="moreBusy" :disabled="moreBusy" @click="loadInvitations(false)">加载更多</el-button></div>
    </SectionPanel>
    <el-dialog v-model="inviteOpen" title="邀请成员" width="min(460px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!inviteBusy" :show-close="!inviteBusy" @close="closeInvite">
      <el-form label-position="top" :disabled="inviteBusy">
        <el-form-item label="注册邮箱"><el-input v-model="inviteForm.email" aria-label="邀请成员邮箱" maxlength="254" placeholder="对方已注册的控制台邮箱" /></el-form-item>
        <el-form-item label="项目角色"><el-select v-model="inviteForm.role" aria-label="邀请成员角色" style="width:100%"><el-option v-for="role in assignable" :key="role" :value="role" :label="roleNames[role]" /></el-select></el-form-item>
      </el-form>
      <p class="member-dialog-note">邀请创建后需对方接受；不会直接成为项目成员，也不会复用应用终端用户身份。</p>
      <el-alert v-if="inviteError" :title="inviteError" type="error" :closable="false" />
      <template #footer><el-button :disabled="inviteBusy" @click="closeInvite">取消</el-button><el-button type="primary" :loading="inviteBusy" :disabled="inviteBusy" @click="submitInvite">创建邀请</el-button></template>
    </el-dialog>
    <el-dialog v-model="roleOpen" title="修改成员角色" width="min(420px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!roleBusy" :show-close="!roleBusy" @close="closeRole">
      <p class="member-dialog-note">{{ roleTarget?.displayName }}（{{ roleTarget?.email }}）</p>
      <el-form label-position="top" :disabled="roleBusy"><el-form-item label="项目角色"><el-select v-model="roleDraft" aria-label="成员项目角色" style="width:100%"><el-option v-for="role in assignable" :key="role" :value="role" :label="roleNames[role]" /></el-select></el-form-item></el-form>
      <el-alert v-if="roleError" :title="roleError" type="error" :closable="false" />
      <template #footer><el-button :disabled="roleBusy" @click="closeRole">取消</el-button><el-button type="primary" :loading="roleBusy" :disabled="roleBusy" @click="saveRole">保存</el-button></template>
    </el-dialog>
  </main>
</template>

<style scoped>
.member-scope-note{margin:0 0 16px;color:var(--tl-muted);font-size:12px;line-height:18px}
.member-identity{display:flex;flex-direction:column;gap:2px}.member-identity strong{font-weight:500;color:var(--tl-title)}.member-identity span{color:var(--tl-muted);font-size:12px}
.member-hint{color:var(--tl-muted);font-size:12px}
.member-invitations{margin-top:22px}.member-invitation-error{margin-bottom:12px}.member-more{display:flex;justify-content:center;margin-top:16px}
.member-dialog-note{margin:0 0 14px;color:var(--tl-muted);font-size:12px;line-height:18px}
</style>
