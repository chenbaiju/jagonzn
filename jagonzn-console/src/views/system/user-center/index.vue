<template>
  <div
    class="console-page console-developer-page console-developer-workspace console-rule-workspace console-operations-workspace console-studio-workspace user-center-page"
  >
    <ConsoleWorkspaceHeader
      project-style
      title="个人中心"
      description="查看当前账号和会话资料；项目身份随当前选择的项目变化。"
      :links="userInfo.currentProjectId ? [] : [{ label: '项目列表', path: '/project/list' }]"
    />
    <ElCard shadow="never" class="user-center-page__profile">
      <div class="profile-identity">
        <img class="profile-identity__avatar" :src="avatarUrl" alt="avatar" />
        <div class="profile-identity__text">
          <h4>{{ displayValue(userInfo.userName) }}</h4>
          <p class="console-description">{{ displayValue(userInfo.email) }}</p>
        </div>
      </div>
    </ElCard>

    <ElCard shadow="never" class="user-center-page__details">
      <template #header>
        <h4>{{ $t('userCenter.accountSection') }}</h4>
      </template>

      <dl class="profile-details">
        <div class="profile-details__item">
          <dt>{{ $t('userCenter.accountId') }}</dt>
          <dd>{{ displayValue(userInfo.userId) }}</dd>
        </div>
        <div class="profile-details__item">
          <dt>{{ $t('userCenter.email') }}</dt>
          <dd>{{ displayValue(userInfo.email) }}</dd>
        </div>
        <div class="profile-details__item">
          <dt>{{ $t('userCenter.tenantId') }}</dt>
          <dd>{{ displayValue(userInfo.tenantId) }}</dd>
        </div>
        <div class="profile-details__item">
          <dt>{{ $t('userCenter.currentProjectId') }}</dt>
          <dd>
            {{ userInfo.currentProjectId ? userInfo.currentProjectId : $t('userCenter.noProject') }}
          </dd>
        </div>
        <div class="profile-details__item profile-details__item--roles">
          <dt>{{ $t('userCenter.roles') }}</dt>
          <dd>
            <template v-if="userInfo.roles?.length">
              <ElTag v-for="role in userInfo.roles" :key="role" effect="plain">{{ role }}</ElTag>
            </template>
            <span v-else>{{ $t('userCenter.noRoles') }}</span>
          </dd>
        </div>
      </dl>
    </ElCard>
    <ProjectInvitations :table-height="520" />
  </div>
</template>

<script setup lang="ts">
  import ConsoleWorkspaceHeader from '@/components/business/ConsoleWorkspaceHeader.vue'
  import { storeToRefs } from 'pinia'
  import ProjectInvitations from '@/components/ProjectInvitations.vue'
  import defaultAvatar from '@imgs/brand/jagonzn-original.png'
  import { useUserStore } from '@/store/modules/user'

  defineOptions({ name: 'UserCenter' })

  const userStore = useUserStore()
  const { getUserInfo: userInfo } = storeToRefs(userStore)
  const avatarUrl = computed(() => userInfo.value.avatar || defaultAvatar)

  const displayValue = (value?: string) => value?.trim() || '—'
</script>

<style lang="scss" scoped>
  .user-center-page {
    min-width: 0;
    height: auto;

    :deep(.el-card__header h4) {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      line-height: 24px;
    }

    :deep(.project-invitations .el-card__header .console-toolbar) {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      padding: 0;
      margin: 0;
      background: none;
      border: 0;
    }
  }

  .profile-identity {
    display: flex;
    gap: 16px;
    align-items: center;

    &__avatar {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 50%;
    }

    &__text {
      min-width: 0;

      h4,
      p {
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      h4 {
        margin-bottom: 4px;
        font-size: 14px;
        font-weight: 500;
        line-height: 24px;
      }

      p {
        font-size: 14px;
        line-height: 22px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  .profile-details {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 24px;
    margin: 0;

    &__item {
      min-width: 0;

      dt {
        margin-bottom: 6px;
        font-size: 14px;
        line-height: 20px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 0;
        font-size: 14px;
        line-height: 22px;
        overflow-wrap: anywhere;
      }

      .el-tag + .el-tag {
        margin-left: 8px;
      }
    }

    &__item--roles {
      grid-column: 1 / -1;
    }
  }

  @media (width <= 640px) {
    .profile-details {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }

    .profile-details__item--roles {
      grid-column: auto;
    }
  }
</style>
