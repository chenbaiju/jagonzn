<template>
  <div
    class="console-page console-developer-page console-developer-workspace console-rule-workspace message-rules"
  >
    <ConsoleWorkspaceHeader
      project-style
      title="消息规则"
      description="处理上行数据并配置动作。先保存草稿与调试，再明确启用版本。"
      :links="[
        { label: '执行记录', path: '/rule/executions?source=rule', permission: 'rule:read' }
      ]"
    >
      <template #actions>
        <ElButton
          v-if="allowed"
          type="primary"
          :icon="Plus"
          :disabled="writesBlocked"
          @click="create"
        >
          创建规则
        </ElButton>
      </template>
    </ConsoleWorkspaceHeader>
    <ElAlert v-if="allowed && error && !visible" :title="error" type="error" :closable="false" />
    <ElCard v-if="!allowed" shadow="never"
      ><ElAlert
        title="需要 OWNER 或 ADMIN 的规则管理权限"
        type="warning"
        :closable="false"
        show-icon
    /></ElCard>
    <template v-else>
      <ElCard class="console-list-filter" shadow="never"
        ><ConsoleFilterBar
          :items="[
            { key: 'field0', label: '名称' },
            { key: 'field1', label: '状态' }
          ]"
          :show-expand="false"
          :show-reset="false"
          :show-search="true"
          @search="load(false)"
          :loading="busy"
        >
          <template #field0
            ><ElInput v-model="filters.name" placeholder="按名称搜索" aria-label="按名称搜索"
          /></template>
          <template #field1
            ><ElSelect v-model="filters.status" clearable placeholder="状态" aria-label="状态"
              ><ElOption
                v-for="status in ['DRAFT', 'ACTIVE', 'PAUSED']"
                :key="status"
                :value="status"
                :label="
                  ({ DRAFT: '草稿', ACTIVE: '已启用', PAUSED: '已暂停' } as Record<string, string>)[
                    status
                  ] || status
                " /></ElSelect
          ></template> </ConsoleFilterBar
      ></ElCard>
      <ElCard class="console-list-data" shadow="never"
        ><ElTable :data="items" row-key="id" v-loading="busy">
          <ElTableColumn show-overflow-tooltip prop="name" label="名称" /><ElTableColumn
            show-overflow-tooltip
            prop="status"
            label="状态"
            ><template #default="{ row }"
              ><ConsoleStatusTag :status="row.status" /></template></ElTableColumn
          ><ElTableColumn
            min-width="190"
            show-overflow-tooltip
            prop="activeVersionId"
            label="活动版本"
          />
          <ElTableColumn min-width="190" label="更新时间"
            ><template #default="{ row }">{{ formatTime(row.updatedAt) }}</template></ElTableColumn
          >
          <ElTableColumn class-name="console-table-actions-cell" min-width="64" label="操作"
            ><template #default="{ row }"
              ><ConsoleTableAction
                :disabled="busy"
                @click="open(row)"
                label="管理"
                icon="ri:settings-3-line" /></template
          ></ElTableColumn>
        </ElTable>
        <ElButton v-if="next" :loading="busy" @click="load(true)">加载更多</ElButton></ElCard
      >
    </template>
    <ElDialog
      class="console-dialog console-developer-dialog console-rule-dialog"
      :model-value="visible"
      @update:model-value="dialogVisibility"
      title="消息规则版本管理"
      width="850px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <p class="console-description" v-if="selected"
        >状态 {{ selected.status }} · CAS
        {{ Number.isSafeInteger(selected.version) ? selected.version : '无法精确表示' }} · 活动版本
        {{ selected.activeVersionId ?? '无' }}</p
      >
      <section
        v-if="selected"
        data-testid="script-health"
        class="console-section"
        aria-label="规则脚本健康"
      >
        <div class="console-actions">
          <strong>脚本健康与恢复</strong>
          <ElButton data-testid="refresh-script-health" :disabled="busy" @click="refreshHealth"
            >刷新健康状态</ElButton
          >
          <ElButton
            v-if="selected.status === 'PAUSED' && selected.activeVersionId"
            data-testid="restore-rule"
            type="warning"
            :disabled="!canActivate"
            @click="restore"
          >
            恢复原活动版本
          </ElButton>
        </div>
        <ElAlert
          v-if="needsVerification"
          type="warning"
          :closable="false"
          title="操作后须刷新核对；以下仅为上次已读状态，不代表本次操作结果。"
        />
        <ElAlert
          v-if="readOnly"
          type="warning"
          :closable="false"
          title="项目当前只读，仍可查询健康状态；解除只读后重新打开页面再操作。"
        />
        <ElAlert v-if="healthIssue" :title="healthIssue" type="warning" :closable="false" />
        <ElAlert v-if="operationNotice" :title="operationNotice" type="info" :closable="false" />
        <template v-if="scriptHealth">
          <p>{{ pauseLabel }}</p>
          <ElDescriptions :column="2" border>
            <ElDescriptionsItem label="连续脚本失败"
              >{{ scriptHealth.consecutiveFailures }} /
              {{ scriptHealth.failureThreshold }}</ElDescriptionsItem
            >
            <ElDescriptionsItem label="相邻失败间隔"
              >{{ scriptHealth.failureGapSeconds }} 秒</ElDescriptionsItem
            >
            <ElDescriptionsItem label="最近脚本失败">{{
              observedTime(scriptHealth.lastScriptFailureAt)
            }}</ElDescriptionsItem>
            <ElDescriptionsItem label="自动暂停时间">{{
              observedTime(scriptHealth.autoPausedAt)
            }}</ElDescriptionsItem>
            <ElDescriptionsItem label="运行代次">{{
              scriptHealth.executionGeneration
            }}</ElDescriptionsItem>
            <ElDescriptionsItem label="健康快照 CAS">{{ scriptHealth.version }}</ElDescriptionsItem>
          </ElDescriptions>
          <p class="console-description"
            >这是数据库持久观测，页面不自行清零或倒计时。成功归零，平台故障和额度不足不计数；窗口由下一次可计结果裁决。</p
          >
        </template>
        <p v-else>健康状态不可用；不得据此认定零失败或继续发布/恢复。</p>
        <p class="console-description"
          >请先修复并保存新版本，或确认原活动版本可运行后显式恢复。恢复会重置当前计数并推进运行代次，不补跑历史消息或死信，历史审计保留。</p
        >
      </section>
      <ElForm class="rule-version-form" label-position="top">
        <ElFormItem class="rule-form-field--half" label="名称"
          ><ElInput
            v-model="form.name"
            aria-label="规则名称"
            maxlength="128"
            :disabled="writesBlocked"
        /></ElFormItem>
        <ElFormItem class="rule-form-field--half" label="说明"
          ><ElInput
            v-model="form.description"
            aria-label="规则说明"
            maxlength="512"
            :disabled="writesBlocked"
        /></ElFormItem>
        <ElFormItem label="JavaScript 函数源码"
          ><ElInput
            v-model="form.source"
            aria-label="规则源码"
            type="textarea"
            :rows="6"
            :disabled="writesBlocked"
        /></ElFormItem>
        <RuleNodeEditor
          :key="editorKey"
          v-model="actions"
          :descriptors="catalog.actions ?? []"
          :disabled="writesBlocked"
          @valid="editorValid = $event"
        />
        <ElButton
          type="primary"
          :disabled="writesBlocked || !editorValid || !form.name?.trim()"
          @click="save"
          >保存新版本</ElButton
        >
      </ElForm>
      <template v-if="selected">
        <ElDivider content-position="left">不可变历史（最新版本在前）</ElDivider>
        <ElTable :data="versions" row-key="id"
          ><ElTableColumn show-overflow-tooltip prop="versionNumber" label="版本号" /><ElTableColumn
            show-overflow-tooltip
            prop="id"
            label="版本 ID"
          />
          <ElTableColumn class-name="console-table-actions-cell" min-width="144" label="操作"
            ><template #default="{ row }"
              ><ConsoleTableAction
                :disabled="busy"
                @click="copyVersion(row)"
                label="载入编辑"
                icon="ri:edit-box-line" /><ConsoleTableAction
                :disabled="!canActivate"
                @click="activate(row)"
                label="发布此版本"
                icon="ri:send-plane-line" /><ConsoleTableAction
                :disabled="busy"
                @click="debug(row)"
                label="调试此版本"
                icon="ri:bug-line" /></template
          ></ElTableColumn>
        </ElTable>
        <div class="console-actions">
          <ElButton v-if="historyNext" :disabled="busy" @click="moreVersions">更多历史</ElButton>
          <ElButton :disabled="writesBlocked || selected.status !== 'ACTIVE'" @click="pause"
            >暂停规则</ElButton
          ><ElButton type="danger" :disabled="writesBlocked" @click="remove">删除规则</ElButton>
        </div>
        <ElFormItem label="调试样例 JSON（无动作副作用）"
          ><ElInput v-model="inputJson" type="textarea" aria-label="调试样例"
        /></ElFormItem>
        <pre data-testid="debug-result">{{ debugResult }}</pre>
      </template>
      <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
    </ElDialog>
  </div>
</template>
<script setup lang="ts">
  import ConsoleWorkspaceHeader from '@/components/business/ConsoleWorkspaceHeader.vue'
  import ConsoleFilterBar from '@/components/ConsoleFilterBar.vue'
  import { Plus } from '@element-plus/icons-vue'
  import ConsoleTableAction from '@/components/ConsoleTableAction.vue'

  import ConsoleStatusTag from '@/components/ConsoleStatusTag.vue'
  import { formatTime } from '@/utils/time'
  import { computed, h, onBeforeUnmount, reactive, ref, watch } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { useUserStore } from '@/store/modules/user'
  import * as api from '@/api/rule-management'
  import type {
    MessageRule,
    MessageVersion,
    RuleWrite,
    RuleAction,
    RuleCatalog
  } from '@/api/rule-management'
  import RuleNodeEditor from '../components/RuleNodeEditor.vue'
  import { HttpError } from '@/utils/http/error'
  import { currentIdentityEpoch } from '@/utils/http/identity-scope'
  import {
    coherentScriptHealth,
    scriptPauseLabel,
    isActivationReceipt,
    type ScriptHealthSnapshot
  } from '@/features/rule/script-health'

  defineOptions({ name: 'MessageRules' })
  const user = useUserStore()
  const project = computed(() => user.info.currentProjectId ?? '')
  const allowed = computed(
    () => user.isLogin && !!project.value && !!user.info.buttons?.includes('rule:manage')
  )
  const items = ref<MessageRule[]>([]),
    versions = ref<MessageVersion[]>([])
  const selected = ref<MessageRule>(),
    next = ref<string>(),
    historyNext = ref<string>()
  const catalog = ref<RuleCatalog>({}),
    actions = ref<RuleAction[]>([])
  const filters = reactive({ name: '', status: '' })
  const form = reactive<RuleWrite>({ name: '', description: '', source: 'input => input' })
  const visible = ref(false),
    busy = ref(false),
    editorValid = ref(true),
    editorKey = ref(0)
  const inputJson = ref('{}'),
    debugResult = ref(''),
    error = ref('')
  const scriptHealth = ref<ScriptHealthSnapshot>()
  const healthIssue = ref(''),
    operationNotice = ref('')
  const needsVerification = ref(false),
    activationUnknown = ref(false),
    readOnly = ref(false)
  const writesBlocked = computed(() => busy.value || needsVerification.value || readOnly.value)
  const canActivate = computed(
    () =>
      allowed.value &&
      !writesBlocked.value &&
      !!scriptHealth.value &&
      !!selected.value &&
      scriptHealth.value.version === selected.value.version &&
      Number.isSafeInteger(scriptHealth.value.version + 1)
  )
  const pauseLabel = computed(() =>
    scriptHealth.value ? scriptPauseLabel(scriptHealth.value) : ''
  )
  function observedTime(value?: string) {
    return formatTime(value, '未记录')
  }
  function resetObservation() {
    scriptHealth.value = undefined
    healthIssue.value = ''
    operationNotice.value = ''
    needsVerification.value = false
    activationUnknown.value = false
  }
  function dialogVisibility(value: boolean) {
    if (value) {
      visible.value = true
      return
    }
    generation++
    visible.value = false
    busy.value = false
    selected.value = undefined
    versions.value = []
    historyNext.value = undefined
    actions.value = []
    form.source = ''
    debugResult.value = ''
    resetObservation()
  }
  let generation = 0
  function clear() {
    generation++
    resetObservation()
    readOnly.value = false
    visible.value = false
    items.value = []
    versions.value = []
    selected.value = undefined
    actions.value = []
    catalog.value = {}
    form.name = ''
    form.description = ''
    form.source = ''
    inputJson.value = '{}'
    debugResult.value = ''
    error.value = ''
    next.value = undefined
    historyNext.value = undefined
    busy.value = false
    editorKey.value++
  }
  async function run(work: (current: () => boolean, projectId: string) => Promise<void>) {
    if (!allowed.value || busy.value) return
    const epoch = generation,
      identity = currentIdentityEpoch(),
      pid = project.value
    busy.value = true
    error.value = ''
    const current = () =>
      epoch === generation &&
      identity === currentIdentityEpoch() &&
      pid === project.value &&
      allowed.value
    try {
      await work(current, pid)
    } catch (reason) {
      if (current() && reason !== 'cancel' && reason !== 'close') {
        if (reason instanceof HttpError && [40033, 403, 10003, 50001].includes(reason.code)) clear()
        else error.value = reason instanceof Error ? reason.message : '操作失败，请刷新后重试'
      }
    } finally {
      if (epoch === generation) busy.value = false
    }
  }
  function load(more = false) {
    return run(async (current, pid) => {
      const page = await api.listRules(pid, {
        ...filters,
        status: filters.status || undefined,
        cursor: more ? next.value : undefined
      })
      if (current()) {
        items.value = more ? [...items.value, ...(page.items ?? [])] : (page.items ?? [])
        next.value = page.nextCursor ?? undefined
      }
    })
  }
  function create() {
    if (!allowed.value || writesBlocked.value) return
    resetObservation()
    selected.value = undefined
    versions.value = []
    historyNext.value = undefined
    actions.value = []
    Object.assign(form, { name: '', description: '', source: 'input => input' })
    debugResult.value = ''
    inputJson.value = '{}'
    editorKey.value++
    visible.value = true
  }
  function copyVersion(version: MessageVersion) {
    form.source = version.source ?? ''
    actions.value = JSON.parse(JSON.stringify(version.actions ?? []))
    editorKey.value++
    debugResult.value = ''
  }
  function accessFailure(reason: unknown) {
    return reason instanceof HttpError && [40033, 403, 10003, 50001].includes(reason.code)
  }
  /** 每个读端口独立撤销当前上下文；不能由并发聚合的首个普通失败吸收迟到失权。 */
  function readWithAccessFence<T>(pending: Promise<T>, current: () => boolean): Promise<T> {
    return pending.catch((reason: unknown) => {
      if (current() && accessFailure(reason)) clear()
      throw reason
    })
  }
  async function readObservation(pid: string, id: string, current: () => boolean) {
    const [detail, observation] = await Promise.all([
      readWithAccessFence(api.getRule(pid, id), current),
      readWithAccessFence(api.getRuleScriptHealth(pid, id), current)
        .then((value) => ({ value }))
        .catch((reason: unknown) => {
          if (accessFailure(reason)) throw reason
          return { value: undefined }
        })
    ])
    if (detail.id !== id) throw new Error('规则读取身份不匹配，请重新打开核对。')
    let health: ScriptHealthSnapshot | undefined,
      issue = ''
    try {
      if (!observation.value) throw new Error('脚本健康读取失败，请刷新健康状态后再确认。')
      health = coherentScriptHealth(detail, observation.value)
    } catch (reason) {
      issue = reason instanceof Error ? reason.message : '健康状态不可用，请刷新核对。'
    }
    return { detail, health, issue }
  }
  function applyObservation(observation: Awaited<ReturnType<typeof readObservation>>) {
    selected.value = observation.detail
    scriptHealth.value = observation.health
    healthIssue.value = observation.issue
    items.value = items.value.map((item) =>
      item.id === observation.detail.id ? observation.detail : item
    )
  }
  function open(row: MessageRule) {
    if (busy.value) return
    resetObservation()
    return run(async (current, pid) => {
      const [observation, history] = await Promise.all([
        readObservation(pid, row.id!, current),
        readWithAccessFence(api.ruleHistory(pid, row.id!), current)
      ])
      if (!current()) return
      applyObservation(observation)
      Object.assign(form, {
        name: observation.detail.name,
        description: observation.detail.description ?? ''
      })
      versions.value = history.items ?? []
      historyNext.value = history.nextCursor ?? undefined
      inputJson.value = '{}'
      debugResult.value = ''
      if (versions.value[0]) copyVersion(versions.value[0])
      visible.value = true
    })
  }
  function refreshHealth() {
    if (!selected.value?.id) return
    return run(async (current, pid) => {
      const id = selected.value!.id!,
        wasUnknown = activationUnknown.value,
        wasPending = needsVerification.value
      scriptHealth.value = undefined
      healthIssue.value = '健康状态正在重新读取。'
      let observation: Awaited<ReturnType<typeof readObservation>>
      try {
        observation = await readObservation(pid, id, current)
      } catch (reason) {
        if (current()) healthIssue.value = '无法取得完整规则健康状态，请刷新后核对。'
        throw reason
      }
      if (!current()) return
      applyObservation(observation)
      if (observation.health) {
        needsVerification.value = false
        activationUnknown.value = false
        if (wasPending)
          operationNotice.value = wasUnknown
            ? '已读取当前状态；此查询不证明上次操作成功或其归因。再次操作须重新确认，不补跑历史消息。'
            : '已刷新当前状态，再次操作须重新确认，不补跑历史消息。'
      }
    })
  }
  function save() {
    if (writesBlocked.value) return
    return run(async (current, pid) => {
      const result = await api.saveRule(pid, selected.value?.id ?? '', {
        ...form,
        expectedVersion: selected.value?.version,
        actions: actions.value
      })
      if (!current()) return
      selected.value = result
      scriptHealth.value = undefined
      const observation = await readObservation(pid, result.id!, current)
      if (!current()) return
      applyObservation(observation)
      const history = await api.ruleHistory(pid, result.id!)
      if (current()) {
        versions.value = history.items ?? []
        historyNext.value = history.nextCursor ?? undefined
        items.value = [observation.detail, ...items.value.filter((item) => item.id !== result.id)]
      }
    })
  }
  function restore() {
    if (!selected.value?.activeVersionId || selected.value.status !== 'PAUSED') return
    return activate({ id: selected.value.activeVersionId }, true)
  }
  function activate(version: MessageVersion, restoring = false) {
    if (!canActivate.value || !version.id || !selected.value?.id || !scriptHealth.value) return
    return run(async (current, pid) => {
      const id = selected.value!.id!,
        target = version.id!,
        expected = scriptHealth.value!.version
      const confirmationCurrent = () =>
        current() &&
        visible.value &&
        selected.value?.id === id &&
        selected.value.version === expected
      const message =
        `${restoring ? '恢复原活动版本' : '发布 / 回滚'}：规则“${selected.value!.name}”，版本 ${target}，当前 CAS ${expected}。` +
        '请确认脚本已修复或原版本已可运行。操作将清当前连续失败计数并推进运行代次，不补跑历史消息或死信，历史审计保留。'
      await ElMessageBox.confirm(
        () =>
          h(
            'span',
            confirmationCurrent()
              ? message
              : '操作上下文已失效，请取消并重新打开规则；此确认不会提交。'
          ),
        restoring ? '确认人工恢复' : '确认发布 / 回滚',
        { customClass: 'console-rule-feedback' }
      )
      if (
        !current() ||
        selected.value?.id !== id ||
        selected.value.version !== expected ||
        scriptHealth.value?.version !== expected
      )
        return
      let result: MessageRule
      try {
        result = await api.activateRule(pid, id, target, expected)
        if (!isActivationReceipt(result, id, target, expected)) throw new Error('发布回执不完整')
      } catch (reason) {
        if (!current()) return
        if (accessFailure(reason)) throw reason
        needsVerification.value = true
        activationUnknown.value = !(reason instanceof HttpError) || reason.outcomeUnknown
        if (reason instanceof HttpError && reason.code === 50017) readOnly.value = true
        error.value =
          reason instanceof HttpError && reason.code === 40034
            ? '规则状态或版本已变化，请刷新健康状态后重新确认；未自动重试。'
            : '规则发布/恢复未确认，请刷新健康状态核对；未自动重试，也未清零计数。'
        return
      }
      if (!current()) return
      selected.value = result
      scriptHealth.value = undefined
      needsVerification.value = true
      operationNotice.value = '发布操作已返回；请以重新读取的当前健康状态为准，不补跑历史消息。'
      const observation = await readObservation(pid, id, current)
      if (!current()) return
      applyObservation(observation)
      if (observation.health) needsVerification.value = false
    })
  }
  function pause() {
    if (writesBlocked.value) return
    return run(async (current, pid) => {
      const row = selected.value!
      await api.pauseRule(pid, row.id!, row.version!)
      if (!current()) return
      const observation = await readObservation(pid, row.id!, current)
      if (current()) applyObservation(observation)
    })
  }
  function remove() {
    if (writesBlocked.value) return
    return run(async (current, pid) => {
      const row = selected.value!
      await ElMessageBox.confirm(
        () =>
          h(
            'span',
            current() && visible.value && selected.value?.id === row.id
              ? `删除规则“${row.name}”？历史执行将保留。`
              : '操作上下文已失效，请取消并重新打开规则。'
          ),
        '确认删除',
        { customClass: 'console-rule-feedback' }
      )
      if (!current()) return
      await api.deleteRule(pid, row.id!, row.version!)
      if (current()) {
        visible.value = false
        items.value = items.value.filter((item) => item.id !== row.id)
        selected.value = undefined
        resetObservation()
        versions.value = []
        actions.value = []
        form.source = ''
        debugResult.value = ''
      }
    })
  }
  function moreVersions() {
    return run(async (current, pid) => {
      const page = await api.ruleHistory(pid, selected.value!.id!, historyNext.value)
      if (current()) {
        versions.value.push(...(page.items ?? []))
        historyNext.value = page.nextCursor ?? undefined
      }
    })
  }
  function debug(version: MessageVersion) {
    return run(async (current, pid) => {
      const result = await api.debugRule(pid, selected.value!.id!, version.id!, inputJson.value)
      if (current()) debugResult.value = JSON.stringify(result, null, 2)
    })
  }
  watch(
    () => [
      project.value,
      allowed.value,
      user.info.userId,
      user.info.tenantId,
      user.isLogin,
      currentIdentityEpoch()
    ],
    () => {
      clear()
      if (allowed.value)
        void run(async (current, pid) => {
          const [nodes, page] = await Promise.all([
            api.ruleCatalog(pid, 'MESSAGE_RULE'),
            api.listRules(pid, {})
          ])
          if (current()) {
            catalog.value = nodes
            items.value = page.items ?? []
            next.value = page.nextCursor ?? undefined
          }
        })
    },
    { immediate: true, flush: 'sync' }
  )
  onBeforeUnmount(clear)
</script>

<style scoped lang="scss"></style>
