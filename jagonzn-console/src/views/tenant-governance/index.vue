<template>
  <div class="console-page console-developer-workspace console-page--single-panel">
    <ConsoleWorkspaceHeader
      title="租户安全治理"
      description="查询租户及安全操作历史。封禁与套餐到期、超额分别处理。"
      :links="[
        { label: '商业运营', path: '/commercial-operations', permission: 'commercial:adjust' }
      ]"
    />
    <ElCard v-if="allowed" class="console-page__main-panel" shadow="never">
      <ElAlert
        v-if="state.error || storageBroken"
        type="warning"
        :closable="false"
        :title="storageBroken ? '本地原申请无法读取，已阻止新操作。' : state.error"
      />
      <ElAlert
        v-if="state.pending"
        type="warning"
        :closable="false"
        title="存在待确认操作，请先核对原回执；不要创建另一笔相同操作。"
      />
      <section v-if="state.pending" class="console-section">
        <p>目标租户：{{ state.pending.tenantId }}</p
        ><p>原申请：{{ state.pending.request.operationId }}</p
        ><p
          >{{ state.pending.request.action === 'SUSPEND' ? '安全封禁' : '解除安全封禁' }} ·
          {{ state.pending.request.reason }}</p
        >
        <div class="console-actions"
          ><ElButton :disabled="state.busy" @click="model.recover">查询原申请</ElButton
          ><ElButton :disabled="state.busy" @click="model.retryOriginal"
            >查询后按原内容重试</ElButton
          ></div
        >
      </section>
      <ElForm inline label-position="top" @submit.prevent="search">
        <ElFormItem label="租户ID"
          ><ElInput v-model="filters.tenantId" :disabled="blocked" clearable
        /></ElFormItem>
        <ElFormItem label="名称前缀"
          ><ElInput v-model="filters.prefix" :disabled="blocked" maxlength="128" clearable
        /></ElFormItem>
        <ElFormItem label="安全状态"
          ><ElSelect v-model="filters.status" :disabled="blocked" clearable
            ><ElOption label="正常" value="ACTIVE" /><ElOption
              label="安全封禁"
              value="SUSPENDED" /><ElOption label="注销中" value="DELETING" /></ElSelect
        ></ElFormItem>
        <ElFormItem
          ><ElButton type="primary" :disabled="blocked" @click="search">查询</ElButton></ElFormItem
        >
      </ElForm>
      <ElTable :data="state.items" row-key="id" empty-text="暂无租户或尚未查询">
        <ElTableColumn prop="name" label="租户名称" /><ElTableColumn
          prop="id"
          label="租户ID"
          min-width="280"
        /><ElTableColumn label="安全状态"
          ><template #default="{ row }">{{ statusLabel(row.status) }}</template></ElTableColumn
        >
        <ElTableColumn label="操作"
          ><template #default="{ row }"
            ><ElButton
              link
              type="primary"
              :disabled="blocked"
              @click="row.id && model.select(row.id)"
              >查看与治理</ElButton
            ></template
          ></ElTableColumn
        >
      </ElTable>
      <ElButton v-if="state.nextCursor" :disabled="blocked" @click="search(state.nextCursor)"
        >下一页</ElButton
      >
      <section v-if="state.selected" class="console-section">
        <h3>{{ state.selected.name }}</h3
        ><p
          >{{ state.selected.id }} · {{ statusLabel(state.selected.status) }} · 安全版本
          {{ state.selected.securityVersion }}</p
        >
        <p v-if="state.selected.banOperationId">封禁回执：{{ state.selected.banOperationId }}</p>

        <ElForm label-position="top" @submit.prevent>
          <ElFormItem v-if="state.selected.status === 'ACTIVE'" label="安全原因"
            ><ElSelect v-model="reasonCode" :disabled="blocked"
              ><ElOption label="已核实滥用" value="ABUSE" /><ElOption
                label="身份或凭据泄露"
                value="COMPROMISED" /><ElOption
                label="其他已核实安全风险"
                value="OTHER_SECURITY" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="原因／工单及整改说明"
            ><ElInput v-model="reason" type="textarea" maxlength="512" :disabled="blocked"
          /></ElFormItem>
          <ElButton
            v-if="state.selected.status === 'ACTIVE' && !state.selected.deletedAt"
            type="danger"
            :disabled="blocked || !reason.trim()"
            @click="confirmChange('SUSPEND')"
            >核对并封禁</ElButton
          >
          <ElButton
            v-if="
              state.selected.status === 'SUSPENDED' &&
              state.selected.banOperationId &&
              !state.selected.deletedAt
            "
            type="primary"
            :disabled="blocked || !reason.trim()"
            @click="confirmChange('RESTORE')"
            >核对并解封</ElButton
          >
        </ElForm>
        <ElTable :data="state.history" empty-text="暂无安全操作"
          ><ElTableColumn prop="operationId" label="操作回执" min-width="280" /><ElTableColumn
            prop="action"
            label="动作"
          /><ElTableColumn prop="reason" label="原因" /><ElTableColumn
            prop="actorAccountId"
            label="操作账号"
            min-width="280"
          /><ElTableColumn prop="createdAt" label="时间" min-width="180"
            ><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></ElTableColumn
          ></ElTable
        >
        <ElButton v-if="state.historyCursor" :disabled="blocked" @click="model.moreHistory"
          >更多历史</ElButton
        >
      </section>
      <ElAlert
        v-if="state.result"
        type="success"
        :closable="false"
        :title="`操作已确认：${state.result.operationId}。请重新查询当前状态。`"
      />
    </ElCard>
    <ElEmpty v-else description="当前账号没有平台租户治理权限" />
  </div>
</template>
<script setup lang="ts">
  import { formatTime } from '@/utils/time'
  import ConsoleWorkspaceHeader from '@/components/business/ConsoleWorkspaceHeader.vue'
  import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue'
  import { ElMessageBox, ElMessage } from 'element-plus'
  import { useUserStore } from '@/store/modules/user'
  import {
    fetchTenantSafetyDirectory,
    fetchTenantSafety,
    fetchTenantSafetyHistory,
    changeTenantSafety
  } from '@/api/tenant-governance'
  import {
    createTenantSafetyModel,
    tenantSafetyState,
    tenantSafetyOperationId,
    tenantSafetyPendingStorage
  } from '@/features/tenant-governance/model'
  const user = useUserStore()
  const allowed = computed(() => user.info.buttons?.includes('tenant:govern') ?? false)
  const state = reactive(tenantSafetyState())
  const filters = reactive({ tenantId: '', prefix: '', status: '' })
  const activeFilters = ref({ tenantId: '', prefix: '', status: '' })
  const reason = ref(''),
    reasonCode = ref('ABUSE'),
    storageBroken = ref(false)
  const blocked = computed(
    () => !allowed.value || state.busy || !!state.pending || storageBroken.value
  )
  const storage = () => tenantSafetyPendingStorage(localStorage, String(user.info.userId))
  const model = createTenantSafetyModel(
    {
      list: fetchTenantSafetyDirectory,
      detail: fetchTenantSafety,
      history: fetchTenantSafetyHistory,
      change: changeTenantSafety,
      key: tenantSafetyOperationId,
      save: (p) => storage().save(p),
      remove: (id) => storage().remove(id)
    },
    state
  )
  watch(
    () => [user.info.userId, allowed.value],
    () => {
      model.invalidate()
      Object.assign(filters, { tenantId: '', prefix: '', status: '' })
      reason.value = ''
      storageBroken.value = false
      if (!allowed.value) return
      try {
        const p = storage().first()
        if (p) model.restore(p)
      } catch {
        storageBroken.value = true
      }
    },
    { immediate: true }
  )
  watch(
    () => state.selected?.id,
    () => {
      reason.value = ''
      reasonCode.value = 'ABUSE'
    }
  )
  onBeforeUnmount(() => model.invalidate())
  function statusLabel(s?: string) {
    return s === 'ACTIVE'
      ? '正常'
      : s === 'SUSPENDED'
        ? '安全封禁'
        : s === 'DELETING'
          ? '注销中'
          : '未知'
  }
  function search(cursor?: string | Event) {
    if (blocked.value) return
    if (typeof cursor !== 'string') activeFilters.value = { ...filters }
    const f = activeFilters.value
    void model.list({
      tenantId: f.tenantId.trim() || undefined,
      prefix: f.prefix.trim() || undefined,
      status: f.status || undefined,
      cursor: typeof cursor === 'string' ? cursor : undefined,
      limit: 20
    })
  }
  async function confirmChange(action: 'SUSPEND' | 'RESTORE') {
    if (blocked.value) return
    const actor = user.info.userId
    try {
      const p = model.prepare(
        action,
        action === 'RESTORE' ? 'REMEDIATED' : reasonCode.value,
        reason.value
      )
      await ElMessageBox.confirm(
        `${action === 'SUSPEND' ? '安全封禁' : '解除安全封禁'}租户 ${p.tenantId}？原因：${p.request.reason}`,
        '确认租户安全操作',
        { customClass: 'console-studio-feedback', type: 'warning' }
      )
      if (!allowed.value || user.info.userId !== actor) return
      await model.submit(p)
    } catch (e) {
      if (e !== 'cancel' && e !== 'close') ElMessage.warning('状态或本地记录已变化，请重新核对。')
    }
  }
</script>
