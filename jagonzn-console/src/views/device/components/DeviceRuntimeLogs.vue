<template>
  <section v-if="allowed" class="device-runtime-logs console-fragment" aria-label="设备运行日志">
    <DeviceDetailCard title="运行日志">
      <template v-if="from" #meta>
        <span data-testid="device-runtime-log-window"
          >当前有效窗口 {{ formatTimeGmt8(from) }} 至 {{ formatTimeGmt8(to) }}（不包含）</span
        >
      </template>
      <ElForm class="device-runtime-logs__toolbar" inline @submit.prevent="load(false)">
        <ElFormItem label="级别"
          ><ElSelect v-model="level" clearable aria-label="运行日志级别"
            ><ElOption v-for="item in levels" :key="item" :label="item" :value="item" /></ElSelect
        ></ElFormItem>
        <ElButton :loading="loading" @click="load(false)">刷新运行日志</ElButton>
      </ElForm>
      <ElAlert v-if="error" type="error" :closable="false" :title="error" />
      <ElTable v-loading="loading" :data="items" row-key="id">
        <ElTableColumn prop="receivedAt" label="平台接收" min-width="210">
          <template #default="{ row }">{{ formatTimeGmt8(row.receivedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="occurredAt" label="设备发生（可空）" min-width="210">
          <template #default="{ row }">{{ formatTimeGmt8(row.occurredAt) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="level" label="级别" width="90" />
        <ElTableColumn prop="component" label="组件" width="120" />
        <ElTableColumn prop="uptimeMs" label="运行毫秒" min-width="110" />
        <ElTableColumn prop="sequence" label="启动内序号" min-width="110" />
        <ElTableColumn prop="message" label="诊断文本" min-width="260" show-overflow-tooltip />
        <template #empty
          ><ElEmpty :description="error ? '运行日志不可用' : '当前可读窗口内暂无运行日志'"
        /></template>
      </ElTable>
      <ElButton v-if="cursor" :disabled="loading || !!error" @click="load(true)"
        >加载更多运行日志</ElButton
      >
    </DeviceDetailCard>
  </section>
</template>
<script setup lang="ts">
  import DeviceDetailCard from './DeviceDetailCard.vue'
  import { formatTimeGmt8 } from '@/utils/time'
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { useUserStore } from '@/store/modules/user'
  import { currentIdentityEpoch } from '@/utils/http/identity-scope'
  import { fetchDeviceRuntimeLogs, type DeviceRuntimeLogEntry } from '@/api/device-runtime-logs'
  const props = defineProps<{ projectId: string; deviceId: string; active?: boolean }>()
  const user = useUserStore()
  const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
  const allowed = computed(
    () =>
      props.active !== false &&
      !!props.deviceId &&
      !!props.projectId &&
      props.projectId === user.info.currentProjectId &&
      (user.info.roles || []).some((r) => r === 'OWNER' || r === 'ADMIN')
  )
  const level = ref(''),
    error = ref(''),
    from = ref(''),
    to = ref(''),
    cursor = ref('')
  const items = ref<DeviceRuntimeLogEntry[]>([]),
    loading = ref(false)
  let generation = 0,
    savedLevel = ''
  async function load(more = false) {
    if (more && (loading.value || !cursor.value || error.value)) return
    const version = ++generation,
      identity = currentIdentityEpoch()
    if (!more) {
      items.value = []
      from.value = ''
      to.value = ''
      cursor.value = ''
      savedLevel = level.value
    }
    error.value = ''
    loading.value = false
    if (!allowed.value) return
    loading.value = true
    try {
      const page = await fetchDeviceRuntimeLogs(props.projectId, props.deviceId, {
        ...(savedLevel ? { level: savedLevel } : {}),
        ...(more ? { from: from.value, to: to.value, cursor: cursor.value } : {})
      })
      if (version !== generation || identity !== currentIdentityEpoch()) return
      if (
        !Array.isArray(page.items) ||
        page.items.length > 100 ||
        typeof page.effectiveFrom !== 'string' ||
        typeof page.effectiveTo !== 'string' ||
        page.items.some(
          (row) =>
            typeof row.id !== 'string' ||
            typeof row.message !== 'string' ||
            typeof row.sequence !== 'string' ||
            typeof row.uptimeMs !== 'string' ||
            typeof row.receivedAt !== 'string'
        )
      )
        throw new Error('运行日志响应不完整')
      items.value = more ? [...items.value, ...page.items] : page.items
      if (!more) {
        from.value = page.effectiveFrom
        to.value = page.effectiveTo
      }
      cursor.value = page.nextCursor || ''
    } catch {
      if (version === generation && identity === currentIdentityEpoch())
        error.value = '无法读取运行日志，请刷新重试。'
    } finally {
      if (version === generation && identity === currentIdentityEpoch()) loading.value = false
    }
  }
  watch(
    () => [
      props.projectId,
      props.deviceId,
      props.active,
      user.info.currentProjectId,
      user.info.userId,
      user.info.tenantId,
      ...(user.info.roles || []),
      currentIdentityEpoch()
    ],
    () => {
      void load(false)
    },
    { immediate: true, flush: 'sync' }
  )
  onBeforeUnmount(() => {
    generation++
  })
</script>

<style scoped lang="scss">
  .device-runtime-logs {
    display: flex;
    flex-direction: column;
    min-width: 0;

    :deep(> .device-detail-card > .el-card__body) {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }
  }
  .device-runtime-logs__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin: 0;

    :deep(.el-form-item) {
      align-items: center;
      margin: 0;
    }
    :deep(.el-form-item__label) {
      height: 32px;
      font-size: 14px;
      line-height: 32px;
    }
    :deep(.el-select) {
      width: 180px;
    }
    > .el-button {
      margin: 0;
    }
  }
</style>
