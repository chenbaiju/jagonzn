<!--
  项目设置页承载项目 Agent、知识资料、个人事实集合及告警通知配置。

  用量与额度面板已从本页移除；套餐与配额事实仍由服务端接口提供，供工作台等消费方读取。
-->
<template>
  <div
    class="console-page console-developer-page console-developer-workspace console-rule-workspace console-operations-workspace console-studio-workspace project-settings"
  >
    <ConsoleWorkspaceHeader
      project-style
      title="项目设置"
      description="配置项目 Agent、知识资料及告警通知。"
      :links="[
        { label: '项目列表', path: '/project/list' },
        { label: '成员与邀请', path: '/project/members', permission: 'member:read' }
      ]"
    />
    <ElEmpty v-if="!projectId" :description="$t('quota.noProject')" />

    <template v-else>
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
  import SmsRecipientEditor from '@/components/business/SmsRecipientEditor.vue'
  import ProjectAlarmNotificationPolicyPanel from '@/components/business/ProjectAlarmNotificationPolicyPanel.vue'
  import { useUserStore } from '@/store/modules/user'

  defineOptions({ name: 'ProjectSettings' })

  const userStore = useUserStore()
  const projectId = computed(() => userStore.info.currentProjectId ?? '')
  const canManageSms = computed(() =>
    (userStore.info.roles || []).some((role) => role === 'OWNER' || role === 'ADMIN')
  )
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
    :deep(.agent-model-panel__status) {
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
    &__configuration > * {
      min-width: 0;
    }
  }
  @media (width <= 640px) {
    .project-settings > section,
    .project-settings__configuration,
    .project-settings :deep(.el-card__body),
    .project-settings :deep(.el-form),
    .project-settings :deep(.sms-recipient-editor) {
      gap: 12px;
    }
  }
</style>
