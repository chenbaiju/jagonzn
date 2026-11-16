<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError, errorMessage, identityEpoch, onIdentityChange } from '@/core/http'
import { currentProject, projectId, session } from '@/core/session'
import { formatTime } from '@/core/time'
import { useResource } from '@/core/use-resource'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import { applicationAdminApi } from './application-admin-api'
import { permissionCount, type ApplicationAdmin } from './application-admin-model'
import { clearAdminCreateRecovery, readAdminCreateRecovery, type AdminCreateRecovery } from './application-admin-recovery'

const router = useRouter()
const emptyImage = `${import.meta.env.BASE_URL}reference/empty-content.png`
const manager = computed(() => session.ready && !session.transitioning && !!session.user?.accountId && !!projectId.value && !!currentProject.value
  && ['OWNER','ADMIN'].includes(session.user?.projectRole || '') && ['OWNER','ADMIN'].includes(currentProject.value.myRole || '')
  && ['ACTIVE','ARCHIVED'].includes(currentProject.value.status || ''))
const writable = computed(() => manager.value && currentProject.value?.status === 'ACTIVE')
const admins = ref<ApplicationAdmin[]>([]), nextCursor = ref<string | null>(null), hasMore = ref(false), moreBusy = ref(false)
const recovery = ref<AdminCreateRecovery | null>(null), actionBusy = ref('')
let listEpoch = 0
const resource = useResource(async signal => {
  const project = projectId.value, epoch = identityEpoch()
  if (!project) throw new Error('请选择当前项目')
  const page = await applicationAdminApi.list(project, undefined, signal)
  if (epoch !== identityEpoch()) throw new Error('页面身份已改变')
  admins.value = [...page.items]
  nextCursor.value = page.nextCursor
  hasMore.value = page.hasMore
  return page
})
function loadRecovery() {
  const accountId = session.user?.accountId
  recovery.value = projectId.value && accountId
    ? readAdminCreateRecovery(projectId.value, accountId, identityEpoch())
    : null
}
const stopIdentity = onIdentityChange(() => { recovery.value = null })
onScopeDispose(stopIdentity)
function refresh() {
  listEpoch++
  moreBusy.value = false
  loadRecovery()
  resource.clear()
  if (manager.value) void resource.reload()
}
watch([projectId, manager], (next, previous) => {
  if (!next[1]) { admins.value = []; nextCursor.value = null; hasMore.value = false }
  else if (!previous || next[0] !== previous[0]) { admins.value = []; nextCursor.value = null; hasMore.value = false }
  actionBusy.value = ''
  refresh()
}, { immediate: true, flush: 'sync' })

async function loadMore() {
  const project = projectId.value, cursor = nextCursor.value
  if (!project || !cursor || !hasMore.value || moreBusy.value) return
  const epoch = identityEpoch(), token = listEpoch
  moreBusy.value = true
  try {
    const page = await applicationAdminApi.list(project, cursor)
    if (epoch !== identityEpoch() || project !== projectId.value || token !== listEpoch || nextCursor.value !== cursor) return
    admins.value = [...admins.value, ...page.items.filter(item => !admins.value.some(row => row.id === item.id))]
    nextCursor.value = page.nextCursor
    hasMore.value = page.hasMore
  } catch (cause) {
    if (epoch === identityEpoch() && token === listEpoch) ElMessage.error(errorMessage(cause))
  } finally { if (token === listEpoch) moreBusy.value = false }
}
function openCreate() { if (writable.value) void router.push('/admin_add') }
function openDetail(row: ApplicationAdmin) { void router.push(`/admins/${row.id}`) }
function sameLogin(row: ApplicationAdmin) { return !!recovery.value && row.loginName.toLowerCase() === recovery.value.loginName.toLowerCase() }
async function clearRecovery() {
  if (!projectId.value) return
  try { await ElMessageBox.confirm('清除这次创建未确认的恢复记录？同名账号仍只能作为调查线索。', '创建结果未确认', { type: 'warning', confirmButtonText: '清除', cancelButtonText: '取消' }) }
  catch { return }
  clearAdminCreateRecovery(projectId.value)
  recovery.value = null
}
async function changeStatus(row: ApplicationAdmin) {
  const project = projectId.value
  if (!project || !writable.value || actionBusy.value) return
  const restore = row.status === 'DISABLED'
  try { await ElMessageBox.confirm(restore ? `确认启用管理员“${row.name}”？` : `确认停用管理员“${row.name}”？`, '应用管理员', { type: 'warning', confirmButtonText: restore ? '启用' : '停用', cancelButtonText: '取消' }) }
  catch { return }
  const epoch = identityEpoch()
  actionBusy.value = row.id
  try {
    await applicationAdminApi.changeStatus(project, row.id, restore ? 'ACTIVE' : 'DISABLED', row.revision)
    if (epoch !== identityEpoch() || project !== projectId.value) return
    ElMessage.success(restore ? '管理员已启用' : '管理员已停用')
    await resource.reload()
  } catch (cause) {
    if (epoch !== identityEpoch() || project !== projectId.value) return
    if (cause instanceof ApiError && cause.outcomeUnknown) { ElMessage.warning(`${errorMessage(cause)}；结果未知，已重新读取目录核对`); await resource.reload() }
    else if (cause instanceof ApiError && cause.status === 409) { ElMessage.warning('管理员已被其他操作修改，已重新读取目录；请核对后再操作。'); await resource.reload() }
    else ElMessage.error(errorMessage(cause))
  } finally { if (epoch === identityEpoch()) actionBusy.value = '' }
}
</script>

<template>
  <main class="tl-page application-admins-directory">
    <PageHeader title="管理员" :count="admins.length">
      <el-button v-if="writable" type="primary" size="small" @click="openCreate">创建管理员</el-button>
    </PageHeader>
    <div class="admin-learning"><span>学习资源：</span><a href="https://www.thingscloud.xyz/docs/guide/project-app/common-saas.html#%E7%AE%A1%E7%90%86%E5%91%98%E8%B4%A6%E5%8F%B7" target="_blank" rel="noopener noreferrer">什么是管理员账号？</a></div>
    <p class="admin-scope-note">权限列仅展示账号配置，不代表设备、任务、告警规则或用户操作的实际准入；实际权限生效另行验收。</p>
    <el-alert v-if="recovery" type="warning" :closable="false" class="admin-recovery" show-icon>
      <template #title>有一次创建结果未确认（登录名 {{ recovery.loginName }}，{{ formatTime(recovery.requestedAt) }}）</template>
      <p v-if="recovery.idempotencyKey === null">页面已重新加载，原幂等键已丢弃；只保留登录名和请求时间。同名账号只作调查线索，不能确认由该请求创建；不会自动重发。</p>
      <p v-else>同名账号只作调查线索，不能确认由该请求创建；恢复记录只保留非秘密上下文。</p>
      <div class="admin-recovery__actions">
        <el-button size="small" @click="router.push('/admin_add')">查看创建记录</el-button>
        <el-button size="small" @click="clearRecovery">清除恢复记录</el-button>
      </div>
    </el-alert>
    <AsyncState :forbidden="!manager" :loading="resource.loading.value" :error="resource.error.value" :empty="!resource.loading.value&&!resource.error.value&&!admins.length" empty-text=" " @retry="refresh">
      <template #empty>
        <div class="admin-empty">
          <img :src="emptyImage" alt="" class="admin-empty__image">
          <h2>项目级应用的管理员</h2>
          <p>平台为项目级应用提供了内置的管理员账号系统，简单项目应用场景可以直接使用，而无需实现自己的账号系统。</p>
          <el-button v-if="writable" type="primary" @click="openCreate">创建管理员</el-button>
        </div>
      </template>
      <el-table :data="admins" class="admin-table" empty-text="暂无应用管理员">
        <el-table-column label="名称" min-width="180">
          <template #default="{row}"><span>{{ row.name }}</span><el-tag v-if="sameLogin(row)" size="small" type="info" class="admin-lookalike">同名线索</el-tag></template>
        </el-table-column>
        <el-table-column prop="loginName" label="登录名" min-width="160" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{row}"><el-tag :type="row.status==='ACTIVE'?'success':'info'" size="small">{{ row.status==='ACTIVE'?'启用':'停用' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="权限" width="100" align="center">
          <template #default="{row}">{{ permissionCount(row.permissions) }}/12</template>
        </el-table-column>
        <el-table-column label="联系方式" min-width="190">
          <template #default="{row}"><div v-if="row.email||row.phone" class="admin-contact"><span v-if="row.email">{{ row.email }}</span><span v-if="row.phone">{{ row.phone }}</span></div><span v-else>—</span></template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="170">
          <template #default="{row}">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="center">
          <template #default="{row}">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button v-if="writable" link :type="row.status==='ACTIVE'?'danger':'primary'" :disabled="actionBusy===row.id" @click="changeStatus(row)">{{ row.status==='ACTIVE'?'停用':'启用' }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="hasMore" class="admin-more"><span>已加载 {{ admins.length }} 位</span><el-button size="small" :loading="moreBusy" :disabled="moreBusy" @click="loadMore">加载更多</el-button></div>
    </AsyncState>
  </main>
</template>

<style scoped>
.admin-learning{display:flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;margin-bottom:10px;background:#eaf0fe;color:#606266;font-size:14px}.admin-learning a{color:#1e88e5;font-weight:700;text-decoration:none}
.admin-scope-note{margin:0 0 14px;color:var(--tl-muted);font-size:12px;line-height:18px}
.admin-recovery{margin-bottom:14px}.admin-recovery p{margin:6px 0 10px;font-size:13px;line-height:20px}.admin-recovery__actions{display:flex;gap:8px;flex-wrap:wrap}
.admin-table{font-size:14px}.admin-lookalike{margin-left:8px}.admin-contact{display:flex;flex-direction:column;gap:2px;line-height:18px;overflow-wrap:anywhere}
.admin-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0 12px}.admin-empty__image{width:120px;max-width:40vw;height:auto}.admin-empty h2{margin:4px 0 0;font-size:18px;font-weight:400;color:var(--tl-title)}.admin-empty p{max-width:620px;margin:0 0 8px;color:var(--tl-muted);font-size:14px;line-height:22px}
.admin-more{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:18px;color:var(--tl-muted);font-size:12px}
</style>
