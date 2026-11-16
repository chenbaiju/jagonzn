<!--
  项目设置首屏优先呈现用量与额度，再展示项目 Agent、知识资料及个人事实集合。

  套餐归属与限额按租户共享，项目只是事实拆分维度。普通协作者只能经此项目接口读取
  当前项目的贡献以及共享池余量，不能借助页面反推出同租户其他项目或账单聚合；套餐摘要
  字段对跨租户协作者整体缺省，页面显示说明而不是伪造零额度套餐。
-->
<template>
  <div
    class="console-page console-developer-page console-developer-workspace console-rule-workspace console-operations-workspace console-studio-workspace project-settings"
    v-loading="loading"
  >
    <ConsoleWorkspaceHeader
      project-style
      title="用量与项目设置"
      description="先查看当前项目用量与租户共享额度，再按需要配置项目 Agent 与知识资料。"
      :links="[
        { label: '项目列表', path: '/project/list' },
        { label: '成员与邀请', path: '/project/members', permission: 'member:read' },
      ]"
    />
    <ElEmpty v-if="!projectId && !loading" :description="$t('quota.noProject')" />

    <template v-else>
      <section aria-label="用量与额度">
        <ElDivider content-position="left">用量与额度</ElDivider>

        <PlanSummaryPanel :summary="overview?.planSummary" />

        <ElCard shadow="never" class="project-settings__meta">
          <ElSkeleton animated :loading="loading">
            <template #template>
              <div class="quota-meta__skeleton">
                <ElSkeletonItem v-for="item in 5" :key="item" variant="text" />
              </div>
            </template>
            <template #default>
              <div class="quota-meta__content">
                <div class="quota-meta__item">
                  <span>{{ $t('quota.planCode') }}</span>
                  <strong>{{ overview?.policyCode || '—' }}</strong>
                </div>
                <div class="quota-meta__item">
                  <span>{{ $t('quota.window') }}</span>
                  <strong>{{ windowText }}</strong>
                </div>
                <div class="quota-meta__item">
                  <span>{{ $t('quota.policyVersion') }}</span>
                  <strong>{{ formatNumber(overview?.policyVersion) }}</strong>
                </div>
                <div class="quota-meta__item">
                  <span>{{ $t('quota.memberCount') }}</span>
                  <strong>{{ formatNumber(overview?.memberCount) }}</strong>
                </div>
                <div class="quota-meta__item">
                  <span>项目时区</span>
                  <strong>{{ projectTimezone || '—' }}</strong>
                </div>
              </div>
            </template>
          </ElSkeleton>
        </ElCard>

        <section class="project-settings__sections" aria-label="配额与日用量">
          <ElCard shadow="never">
            <template #header>
              <div class="quota-section__header console-page-header">
                <div>
                  <h4>{{ $t('quota.projectUsageTitle') }}</h4>
                </div>
              </div>
            </template>

            <QuotaUsageTable
              :scope="overview?.project"
              :message-unit-quotas="overview?.messageUnitQuotas"
              usage-scope="project"
            />
          </ElCard>

          <ElCard shadow="never">
            <template #header>
              <div class="quota-section__header console-page-header">
                <div>
                  <h4>{{ $t('quota.tenantPoolTitle') }}</h4>
                </div>
              </div>
            </template>

            <QuotaUsageTable
              :scope="overview?.tenantSharedPool"
              :message-unit-quotas="overview?.messageUnitQuotas"
              usage-scope="tenant"
            />
          </ElCard>
        </section>
      </section>
      <ProjectAlarmNotificationPolicyPanel :project-id="projectId" />
      <ElCard v-if="canManageSms" shadow="never" aria-label="项目告警接收设置">
        <SmsRecipientEditor purpose="DEVICE_ALARM" :project-id="projectId" />
      </ElCard>
      <section class="project-settings__configuration" aria-label="Agent 与知识配置">
        <ElDivider content-position="left">Agent 与知识配置</ElDivider>

        <AgentModelPanel />
        <ProjectKnowledgePanel :project-id="projectId" />
        <PersonalFactCollectionPanel :project-id="projectId" />
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
  import ConsoleWorkspaceHeader from '@/components/business/ConsoleWorkspaceHeader.vue'
  import AgentModelPanel from './AgentModelPanel.vue'
  import ProjectKnowledgePanel from '@/components/agent/ProjectKnowledgePanel.vue'
  import PersonalFactCollectionPanel from '@/components/agent/PersonalFactCollectionPanel.vue'
  import QuotaUsageTable from './QuotaUsageTable.vue'
  import PlanSummaryPanel from './PlanSummaryPanel.vue'
  import SmsRecipientEditor from '@/components/business/SmsRecipientEditor.vue'
  import ProjectAlarmNotificationPolicyPanel from '@/components/business/ProjectAlarmNotificationPolicyPanel.vue'
  import { fetchProjectQuota, type ProjectQuotaOverviewResponse } from '@/api/quota'
  import { fetchProjects } from '@/api/project'
  import { useUserStore } from '@/store/modules/user'
  import { HttpError } from '@/utils/http/error'
  import { formatTime } from '@/utils/time'

  defineOptions({ name: 'ProjectSettings' })

  const userStore = useUserStore()
  const projectId = computed(() => userStore.info.currentProjectId ?? '')
  const canManageSms = computed(() =>
    (userStore.info.roles || []).some((role) => role === 'OWNER' || role === 'ADMIN')
  )
  const loading = ref(false)
  const overview = ref<ProjectQuotaOverviewResponse>()
  const projectTimezone = ref('')

  /** 仅按平台时区展示服务端结算边界，原始结算窗口与查询条件保持不变。 */
  const windowText = computed(() =>
    overview.value?.windowStart && overview.value.windowEnd
      ? `${formatTime(overview.value.windowStart)} 至 ${formatTime(overview.value.windowEnd)}`
      : '—'
  )

  /** 缺失不是零；配额返回缺字段时用破折号保留“不确定”的语义。 */
  const formatNumber = (value?: number) =>
    typeof value === 'number' ? new Intl.NumberFormat('zh-CN').format(value) : '—'

  /** 失败由 HTTP 层统一提示；保留成功读取的旧快照，让临时网络问题不抹掉已知事实。 */
  const refresh = async () => {
    if (!projectId.value) return
    loading.value = true
    try {
      const [quota, projects] = await Promise.all([
        fetchProjectQuota(projectId.value),
        fetchProjects()
      ])
      overview.value = quota
      projectTimezone.value =
        projects.find((project) => project.id === projectId.value)?.timezone ?? ''
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('加载项目配额与日用量失败:', error)
    } finally {
      loading.value = false
    }
  }

  onMounted(() => void refresh())
</script>

<style lang="scss" scoped>
  .project-settings {
    > section,
    &__configuration {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }
    :deep(.el-card) {
      min-width: 0;
      margin: 0;
    }
    :deep(.el-card__header) {
      padding: 16px var(--console-page-spacing);
    }
    :deep(.el-card__header h4),
    :deep(.sms-recipient-editor h4) {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      line-height: 24px;
    }
    :deep(.el-card__body) {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
      padding: var(--console-page-spacing);
    }
    :deep(.el-alert),
    :deep(.el-card__body p),
    :deep(.console-actions),
    :deep(.console-toolbar),
    :deep(.agent-model-panel__status),
    :deep(.plan-summary__sections) {
      margin: 0;
    }
    :deep(.el-alert__title),
    :deep(.el-alert__description) {
      font-size: 14px;
      font-weight: 400;
      line-height: 20px;
    }
    :deep(.el-alert__icon) {
      width: 14px;
      font-size: 14px;
    }
    :deep(.console-toolbar) {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      padding: 0;
      background: transparent;
      border: 0;
    }
    :deep(.console-toolbar .el-button + .el-button) {
      margin-left: 0;
    }
    :deep(.el-form) {
      display: grid;
      gap: 16px;
      min-width: 0;
    }
    :deep(.el-form-item) {
      min-width: 0;
      margin: 0;
    }
    :deep(.el-form--label-top .el-form-item__label) {
      height: auto !important;
      margin-bottom: 6px;
      line-height: 20px !important;
    }
    :deep(.el-textarea__inner) {
      font-size: 14px;
      line-height: 22px;
    }
    :deep(.el-checkbox) {
      max-width: 100%;
      height: auto;
    }
    :deep(.sms-recipient-editor .el-checkbox) {
      margin: 0;
    }
    :deep(.el-checkbox__label) {
      font-size: 14px;
      line-height: 22px;
      white-space: normal;
    }
    :deep(.sms-recipient-editor) {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 0;
    }
    :deep(.plan-summary__sections > div) {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }
    :deep(.plan-summary__sections h4) {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      line-height: 24px;
    }
    &__sections {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    &__sections > *,
    &__configuration > * {
      min-width: 0;
    }
  }
  .quota-meta {
    &__skeleton,
    &__content {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 2.2fr) repeat(3, minmax(0, 0.8fr));
      gap: 16px;
    }
    &__item {
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-wrap: anywhere;
      span {
        font-size: 14px;
        line-height: 20px;
        color: var(--el-text-color-secondary);
      }
      strong {
        font-weight: 500;
      }
    }
  }
  .quota-section__header {
    margin: 0;
    h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      line-height: 24px;
    }
  }
  @media (width <= 1500px) {
    .project-settings__sections {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (width <= 1100px) {
    .quota-meta__skeleton,
    .quota-meta__content {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (width <= 640px) {
    .project-settings > section,
    .project-settings__configuration,
    .project-settings__sections,
    .project-settings :deep(.el-card__body),
    .project-settings :deep(.el-form),
    .project-settings :deep(.sms-recipient-editor) {
      gap: 12px;
    }
    .quota-meta__skeleton,
    .quota-meta__content {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
