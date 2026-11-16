<template>
  <ElCard v-if="allowed" shadow="never" aria-label="项目告警通知策略">
    <template #header>
      <h4>项目告警通知</h4>
    </template>
    <p class="console-description">
      暂停只影响本项目的告警通知，告警仍正常记录。不影响套餐额度预警、到期提醒或直接规则通知。
    </p>
    <p class="console-description">
      已经在途的通知仍可能送达。恢复只影响后续告警，不补发静默期或已被停止的旧通知。
    </p>
    <ElAlert
      v-if="notice"
      :title="notice"
      :type="failed ? 'warning' : 'success'"
      :closable="false"
      show-icon
    />
    <p v-if="loading" role="status">正在读取项目策略…</p>
    <p v-else-if="saved" role="status">
      当前状态：{{ saved.muted ? '已暂停告警通知' : '允许告警通知' }}
    </p>
    <p v-else role="status">当前策略尚未确认，请重新读取。</p>
    <p v-if="saved && !saved.writable">当前项目只读，不能修改通知策略。</p>
    <div class="console-actions">
      <ElButton type="primary" :disabled="!editable" :loading="saving" @click="toggle">
        {{ saved?.muted ? '恢复告警通知' : '暂停告警通知' }}
      </ElButton>
      <ElButton :disabled="loading || saving" :loading="loading" @click="load"> 重新读取 </ElButton>
    </div>
    <p class="console-description">
      保存策略不会发送测试通知，也不会开启未配置的供应商或改变套餐权益。
    </p>
  </ElCard>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { useUserStore } from '@/store/modules/user'
  import { currentIdentityEpoch } from '@/utils/http/identity-scope'
  import {
    readProjectAlarmNotificationPolicy,
    updateProjectAlarmNotificationPolicy,
    type ProjectAlarmNotificationPolicy
  } from '@/api/project-alarm-notification-policy'

  const props = defineProps<{ projectId: string }>()
  const user = useUserStore()
  const allowed = computed(
    () =>
      !!props.projectId &&
      props.projectId === user.info.currentProjectId &&
      (user.info.roles || []).some((role) => role === 'OWNER' || role === 'ADMIN')
  )
  const saved = ref<ProjectAlarmNotificationPolicy>()
  const loading = ref(false)
  const saving = ref(false)
  const failed = ref(false)
  const notice = ref('')
  let generation = 0
  const editable = computed(
    () => allowed.value && !!saved.value?.writable && !loading.value && !saving.value
  )

  function apply(value: ProjectAlarmNotificationPolicy) {
    if (
      typeof value.muted !== 'boolean' ||
      typeof value.writable !== 'boolean' ||
      typeof value.revision !== 'string' ||
      !/^(0|[1-9][0-9]{0,18})$/.test(value.revision) ||
      BigInt(value.revision) > 9223372036854775807n
    ) {
      throw new Error('项目策略响应不完整')
    }
    saved.value = value
  }

  async function load() {
    const current = ++generation
    const identity = currentIdentityEpoch()
    saved.value = undefined
    loading.value = false
    saving.value = false
    failed.value = false
    notice.value = ''
    if (!allowed.value) return
    loading.value = true
    try {
      const value = await readProjectAlarmNotificationPolicy(props.projectId)
      if (current !== generation || identity !== currentIdentityEpoch()) return
      apply(value)
    } catch {
      if (current === generation && identity === currentIdentityEpoch()) {
        failed.value = true
        notice.value = '无法确认当前项目策略，请重新读取。'
      }
    } finally {
      if (current === generation && identity === currentIdentityEpoch()) loading.value = false
    }
  }

  async function toggle() {
    if (!editable.value || !saved.value) return
    const current = generation
    const identity = currentIdentityEpoch()
    const muted = !saved.value.muted
    saving.value = true
    failed.value = false
    notice.value = ''
    try {
      const value = await updateProjectAlarmNotificationPolicy(props.projectId, {
        muted,
        expectedRevision: saved.value.revision
      })
      if (current !== generation || identity !== currentIdentityEpoch()) return
      apply(value)
      if (value.muted !== muted) throw new Error('策略保存结果不一致')
      notice.value = muted
        ? '项目告警通知已暂停，告警仍正常记录。'
        : '项目告警通知已恢复，未补发旧通知。'
    } catch {
      if (current === generation && identity === currentIdentityEpoch()) {
        saved.value = undefined
        failed.value = true
        notice.value = '保存未确认或策略已变化，请重新读取后核对；不会自动重复保存。'
      }
    } finally {
      if (current === generation && identity === currentIdentityEpoch()) saving.value = false
    }
  }

  watch(
    () => [
      props.projectId,
      user.info.userId,
      user.info.tenantId,
      user.info.currentProjectId,
      ...(user.info.roles || []),
      currentIdentityEpoch()
    ],
    load,
    { immediate: true, flush: 'sync' }
  )
  onBeforeUnmount(() => {
    generation++
  })
</script>

<style lang="scss" scoped>
  h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
  }

  .console-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 12px 0;

    :deep(.el-button + .el-button) {
      margin-left: 0;
    }
  }
</style>
