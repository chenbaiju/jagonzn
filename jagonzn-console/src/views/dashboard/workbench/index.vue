<template>
  <main class="console-page console-developer-page developer-workbench">
    <header class="workbench-hero">
      <div class="workbench-hero__content">
        <div class="workbench-hero__title">
          <h1>{{ projectName || (projectId ? '当前项目' : '开始你的设备开发') }}</h1>
          <span v-if="projectId" class="workbench-role">{{ roleLabel }}</span>
        </div>
        <p class="console-description">从物模型到设备接入，让数据进入你的应用。</p>
        <div class="workbench-hero__actions">
          <ElButton v-if="allowed('/device/types')" type="primary" @click="go('/device/types')"
            >接入设备</ElButton
          >
          <ElButton v-else type="primary" @click="go('/project/list')">选择项目</ElButton>
          <ElButton
            v-if="allowed('/dashboard/workbench')"
            text
            type="primary"
            @click="showProjectStatistics"
            >项目统计 <ArtSvgIcon icon="tl:chevron-right"
          /></ElButton>
        </div>
      </div>
      <div class="workbench-connection-art" aria-hidden="true">
        <div class="workbench-connection-art__devices"
          ><ArtSvgIcon icon="tl:thermometer" /><ArtSvgIcon icon="tl:monitor" /><ArtSvgIcon
            icon="tl:cpu"
        /></div>
        <svg viewBox="0 0 170 120" class="workbench-connection-art__lines">
          <path d="M0 15H45Q65 15 85 60H170M0 60H170M0 105H45Q65 105 85 60" />
        </svg>
        <span class="workbench-connection-art__gateway"><ArtSvgIcon icon="tl:server" /></span>
        <span class="workbench-connection-art__link"></span>
        <span class="workbench-connection-art__cloud"><ArtSvgIcon icon="tl:cloud-upload" /></span>
      </div>
    </header>
    <template v-if="projectId">
      <div class="workbench-start">
        <section class="workbench-section workbench-panel" aria-label="继续开发">
          <div class="development-steps">
            <button
              v-for="(step, index) in steps"
              :key="step.path"
              class="development-step"
              :disabled="!allowed(step.path)"
              @click="go(step.path)"
            >
              <ArtSvgIcon :icon="step.icon" class="development-step__icon" aria-hidden="true" />
              <span class="development-step__number">0{{ index + 1 }}</span>
              <span class="development-step__content"
                ><strong>{{ step.title }}</strong
                ><span>{{ allowed(step.path) ? step.description : '当前角色无此入口' }}</span></span
              >
              <ArtSvgIcon
                icon="tl:arrow-right"
                class="development-step__arrow"
                aria-hidden="true"
              />
            </button>
          </div>
        </section>
        <section
          v-if="allowed('/dashboard/workbench')"
          class="workbench-summary"
          aria-label="项目运行摘要"
        >
          <ElAlert v-if="snapshotError" title="运行摘要暂不可用" type="warning" :closable="false"
            ><ElButton text @click="load">重新读取</ElButton></ElAlert
          >
          <ProjectDeviceCountCards :overview="snapshot" :loading="loading" />
        </section>
      </div>
      <div class="workbench-columns">
        <div class="workbench-main">
          <section class="workbench-panel" aria-labelledby="recent-heading">
            <div class="workbench-section-heading"
              ><h2 id="recent-heading">本机最近访问</h2
              ><div class="workbench-recent__actions"
                ><span>最近 7 天</span
                ><ElButton v-if="recent.length" text type="primary" @click="clearRecent"
                  >清空</ElButton
                ></div
              ></div
            >
            <p v-if="!recent.length" class="console-description"
              >打开设备类型、设备或应用后，可在这里继续。记录仅保留最近 7 天。</p
            >
            <template v-else>
              <div class="workbench-recent__head" aria-hidden="true"
                ><span>资源名称</span><span>类型</span><span>最近访问时间</span><span></span
              ></div>
              <ul class="workbench-recent"
                ><li v-for="item in recent" :key="`${item.kind}:${item.id}`"
                  ><button @click="openRecent(item)"
                    ><strong
                      ><ArtSvgIcon
                        :icon="
                          {
                            type: 'tl:layers',
                            device: 'tl:cpu',
                            application: 'tl:layout-dashboard'
                          }[item.kind]
                        "
                      />{{ item.label }}</strong
                    ><span>{{ kindLabel[item.kind] }}</span
                    ><span>{{
                      item.visitedAt ? formatTime(new Date(item.visitedAt).toISOString()) : '—'
                    }}</span
                    ><ArtSvgIcon icon="tl:chevron-right" /></button></li
              ></ul>
            </template>
            <div v-if="!recent.length" class="workbench-shortcuts"
              ><ElButton
                v-for="step in steps.filter((item) => allowed(item.path)).slice(0, 3)"
                :key="step.path"
                @click="go(step.path)"
                >{{ step.title }}</ElButton
              ></div
            >
          </section>
          <section
            v-if="allowed('/dashboard/workbench')"
            class="workbench-panel workbench-traffic"
            aria-label="消息流量概览"
          >
            <ElSkeleton :loading="loading" animated :rows="4">
              <div class="workbench-window" aria-label="统计窗口">
                <div
                  ><span class="workbench-window__label"
                    ><ArtSvgIcon icon="tl:calendar" aria-hidden="true" />统计窗口</span
                  ><strong>{{ windowText }}</strong></div
                >
                <div>
                  <span class="workbench-window__label"
                    ><ArtSvgIcon icon="tl:refresh-cw" aria-hidden="true" />生成时间</span
                  ><strong>{{ formatTime(snapshot?.generatedAt) }}</strong>
                </div>
              </div>
              <div class="workbench-traffic__metrics">
                <div
                  v-for="(item, index) in trafficCards"
                  :key="item.label"
                  class="workbench-traffic__metric"
                >
                  <div class="workbench-traffic__heading">
                    <span class="workbench-traffic__icon" aria-hidden="true">
                      <ArtSvgIcon :icon="index === 0 ? 'tl:clipboard-list' : 'tl:activity'" />
                    </span>
                    <p class="workbench-traffic__label">{{ item.label }}</p>
                  </div>
                  <strong class="workbench-traffic__value">{{ item.value }}</strong>
                </div>
              </div>
            </ElSkeleton>
          </section>
          <section
            v-if="allowed('/dashboard/workbench')"
            ref="overviewSection"
            class="workbench-overview"
            aria-label="项目统计"
          >
            <ProjectOverviewContent
              :project-id="projectId"
              :identity="overviewIdentity"
              :overview="snapshot"
              :loading="loading"
              compact
            />
          </section>
        </div>
        <aside class="workbench-aside">
          <WorkbenchPlanOverview
            v-if="allowed('/project/settings')"
            :overview="quota"
            :loading="quotaLoading"
            :failed="quotaError"
            @retry="load"
            @resources="go('/project/settings')"
          />
          <section v-if="showFirstDeviceHelp" class="workbench-panel workbench-help"
            ><ArtSvgIcon icon="tl:book-open" class="workbench-help__icon" /><h2
              >接入你的第一台设备</h2
            ><p>选择设备类型，获取当前设备的接入配置，再通过消息记录确认上报结果。</p
            ><ElButton @click="helpOpen = true">查看接入步骤</ElButton></section
          >
          <WorkbenchResources
            v-else-if="hasDevices"
            :project-id="projectId"
            :scope-key="JSON.stringify(scope)"
            :allowed-paths="resourcePaths"
          />
          <WorkbenchAppAndDocs />
        </aside>
      </div>
    </template>
    <ElEmpty v-else description="先选择或创建项目，再开始设备开发"
      ><ElButton @click="go('/project/list')">进入项目列表</ElButton></ElEmpty
    >
    <ElDrawer
      class="console-developer-drawer"
      v-model="helpOpen"
      title="设备接入步骤"
      size="min(480px, 100%)"
      ><ol class="workbench-guide"
        ><li v-for="step in steps" :key="step.path"
          ><h3>{{ step.title }}</h3
          ><p>{{ step.help }}</p
          ><ElButton v-if="allowed(step.path)" text type="primary" @click="openHelpStep(step.path)"
            >进入{{ step.title }} →</ElButton
          ></li
        ></ol
      ></ElDrawer
    >
  </main>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { useUserStore } from '@/store/modules/user'
  import { useMenuStore } from '@/store/modules/menu'
  import { fetchProjectOverview, type OverviewResponse } from '@/api/overview'
  import { fetchProjects } from '@/api/project'
  import { fetchProjectQuota, type ProjectQuotaOverviewResponse } from '@/api/quota'
  import WorkbenchPlanOverview from './WorkbenchPlanOverview.vue'
  import WorkbenchResources from './WorkbenchResources.vue'
  import WorkbenchAppAndDocs from './WorkbenchAppAndDocs.vue'
  import ProjectOverviewContent from '../overview/components/ProjectOverviewContent.vue'
  import ProjectDeviceCountCards from '../overview/components/ProjectDeviceCountCards.vue'
  import { currentIdentityEpoch } from '@/utils/http/identity-scope'
  import {
    clearRecentResources,
    readRecentResources,
    type RecentResource
  } from '@/utils/workbench-recent'
  import { formatTime } from '@/utils/time'
  import type { AppRouteRecord } from '@/types/router'
  defineOptions({ name: 'DeveloperWorkbench' })
  const user = useUserStore(),
    menu = useMenuStore(),
    router = useRouter()
  const projectId = computed(() => user.info.currentProjectId ?? '')
  const scope = computed(() => ({
    userId: user.info.userId ?? '',
    tenantId: user.info.tenantId ?? '',
    projectId: projectId.value
  }))
  const overviewSection = ref<HTMLElement>()
  const overviewIdentity = computed(() =>
    JSON.stringify([projectId.value, user.info.userId, user.info.tenantId, currentIdentityEpoch()])
  )
  const projectName = ref(''),
    snapshot = ref<OverviewResponse>(),
    loading = ref(false),
    snapshotError = ref(false),
    helpOpen = ref(false)
  const recent = ref<RecentResource[]>([])
  const quota = ref<ProjectQuotaOverviewResponse>()
  const quotaLoading = ref(false)
  const quotaError = ref(false)
  const deviceCount = computed(
    () => snapshot.value?.devices?.total ?? quota.value?.project?.deviceCount?.used
  )
  const showFirstDeviceHelp = computed(() => deviceCount.value === 0)
  const hasDevices = computed(() => typeof deviceCount.value === 'number' && deviceCount.value > 0)
  const kindLabel = { type: '设备类型', device: '设备', application: '应用' }
  const paths = computed(() => {
    const result = new Set<string>()
    const visit = (rows: AppRouteRecord[]) =>
      rows.forEach((row) => {
        result.add(row.path)
        if (row.children) visit(row.children)
      })
    visit(menu.menuList)
    return result
  })
  const allowed = (path: string) => paths.value.has(path)
  const resourcePaths = computed(() => Array.from(paths.value))
  const go = (path: string) => {
    if (allowed(path)) void router.push(path)
  }
  const roleLabel = computed(
    () =>
      ({ OWNER: '项目所有者', ADMIN: '管理员', OPERATOR: '操作员', VIEWER: '观察者' })[
        user.info.roles?.[0] ?? ''
      ] ?? '项目成员'
  )
  const steps = [
    {
      title: '定义物模型',
      description: '定义属性、事件与命令',
      path: '/device/types',
      icon: 'tl:layers',
      help: '在设备类型中定义属性、事件和命令，核对协议后发布模型。'
    },
    {
      title: '设备接入',
      description: '创建设备并获取配置',
      path: '/device/list',
      icon: 'tl:cpu',
      help: '选择已发布的设备类型，创建设备并在接入配置中读取实际连接地址与凭据要求。'
    },
    {
      title: '上报调试',
      description: '核对消息与设备数据',
      path: '/device/messages',
      icon: 'tl:terminal',
      help: '完成设备连接与上报后，在设备详情和消息日志中核对结果。在线不等于上报已成功。'
    },
    {
      title: '规则与自动化',
      description: '配置触发条件与动作',
      path: '/rule/automations',
      icon: 'tl:git-branch',
      help: '按场景配置规则或自动化，保存后通过执行记录核对结果；只读角色可从运行记录查看事实。'
    },
    {
      title: '应用与看板',
      description: '把设备数据呈现给用户',
      path: '/dashboard/applications',
      icon: 'tl:layout-dashboard',
      help: '创建看板并绑定受权设备数据，预览确认后按现有流程发布，再将看板组合到应用中。'
    }
  ]
  const number = (value?: number) =>
    typeof value === 'number' ? value.toLocaleString('zh-CN') : '—'
  /** 沿用项目概况的二进制流量单位，缺少后端统计时不显示为零。 */
  const formatBytes = (value?: number) => {
    if (typeof value !== 'number') return '—'
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    let size = value
    let unit = 0
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024
      unit += 1
    }
    return `${size.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} ${units[unit]}`
  }
  const trafficCards = computed(() => [
    {
      label: '24 小时消息量',
      value: number(snapshot.value?.messages24h?.count)
    },
    {
      label: '24 小时流量',
      value: formatBytes(snapshot.value?.messages24h?.bytes)
    }
  ])
  const windowText = computed(() => {
    const window = snapshot.value?.window
    return window?.from && window.to
      ? `${formatTime(window.from)} 至 ${formatTime(window.to)}`
      : '—'
  })
  let generation = 0
  async function load() {
    const id = projectId.value,
      epoch = currentIdentityEpoch(),
      request = ++generation
    snapshot.value = undefined
    quota.value = undefined
    quotaLoading.value = !!id && allowed('/project/settings')
    quotaError.value = false
    projectName.value = ''
    snapshotError.value = false
    helpOpen.value = false
    recent.value = readRecentResources(scope.value)
    loading.value = !!id
    if (!id) return
    const current = () =>
      generation === request && epoch === currentIdentityEpoch() && projectId.value === id
    void fetchProjects()
      .then((rows) => {
        if (current()) projectName.value = rows.find((row) => row.id === id)?.name ?? ''
      })
      .catch(() => {})
    if (allowed('/project/settings')) {
      void fetchProjectQuota(id)
        .then((value) => {
          if (current()) quota.value = value
        })
        .catch(() => {
          if (current()) quotaError.value = true
        })
        .finally(() => {
          if (current()) quotaLoading.value = false
        })
    }
    if (!allowed('/dashboard/workbench')) {
      loading.value = false
      return
    }
    try {
      const value = await fetchProjectOverview(id)
      if (current()) snapshot.value = value
    } catch {
      if (current()) snapshotError.value = true
    } finally {
      if (current()) loading.value = false
    }
  }
  function showProjectStatistics() {
    if (allowed('/dashboard/workbench')) overviewSection.value?.scrollIntoView({ block: 'start' })
  }
  function openHelpStep(path: string) {
    helpOpen.value = false
    go(path)
  }
  function clearRecent() {
    clearRecentResources(scope.value)
    recent.value = []
  }
  function openRecent(item: RecentResource) {
    const path = {
      type: '/device/types',
      device: '/device/list',
      application: '/dashboard/applications'
    }[item.kind]
    if (allowed(path))
      void router.push({ path, query: { resourceId: item.id, contextProjectId: projectId.value } })
  }
  watch(
    () => [
      projectId.value,
      user.info.userId,
      user.info.tenantId,
      currentIdentityEpoch(),
      allowed('/dashboard/workbench'),
      allowed('/project/settings')
    ],
    load,
    { immediate: true }
  )
</script>
<style scoped lang="scss">
  :global(#app-main:has(.developer-workbench)) {
    background-color: var(--el-bg-color);
  }
  .console-developer-page.developer-workbench {
    container: workbench / inline-size;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background-color: var(--el-bg-color);
  }
  .workbench-hero {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 156px;
    padding: 20px 24px;
    overflow: hidden;
    background: linear-gradient(105deg, var(--el-bg-color) 30%, var(--el-color-primary-light-9));
    border: 1px solid var(--console-line);
    border-radius: 4px;
  }
  .workbench-hero__content {
    position: relative;
    z-index: 1;
    min-width: 0;
  }
  .workbench-hero__title {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    margin-bottom: 8px;
  }
  .workbench-hero h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 400;
    line-height: 28px;
    overflow-wrap: anywhere;
  }
  .workbench-hero .console-description {
    margin: 0;
  }
  .workbench-role {
    padding: 3px 10px;
    font-size: 14px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
    border-radius: 4px;
  }
  .workbench-hero__actions {
    display: flex;
    gap: 16px;
    margin-top: 20px;
  }
  .workbench-hero__actions .el-button {
    margin: 0;
  }
  .workbench-connection-art {
    position: absolute;
    inset: 16px 36px 16px auto;
    display: flex;
    align-items: center;
    width: 420px;
    color: var(--el-color-primary);
    opacity: 0.6;
    mask-image: linear-gradient(to right, transparent, black 15%);
  }
  .workbench-connection-art__devices {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .workbench-connection-art__devices > svg {
    box-sizing: content-box;
    width: 18px;
    height: 18px;
    padding: 8px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-color-primary-light-5);
    border-radius: 5px;
  }
  .workbench-connection-art__lines {
    width: 130px;
    fill: none;
    stroke: currentcolor;
    stroke-dasharray: 2 5;
  }
  .workbench-connection-art__gateway {
    display: flex;
    padding: 12px;
    font-size: 36px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-color-primary-light-7);
    border-radius: 8px;
  }
  .workbench-connection-art__gateway > svg {
    width: 36px;
    height: 36px;
  }
  .workbench-connection-art__cloud > svg {
    width: 96px;
    height: 96px;
  }
  .workbench-connection-art__link {
    width: 60px;
    border-top: 2px dotted currentcolor;
  }
  .workbench-connection-art__cloud {
    font-size: 96px;
  }
  .workbench-panel {
    min-width: 0;
    padding: 20px;
    background: var(--el-bg-color);
    border: 1px solid var(--console-line);
    border-radius: 4px;
  }
  .workbench-start {
    display: grid;
    grid-auto-rows: 1fr;
    gap: 16px;
    min-width: 0;
  }
  .workbench-start:has(.workbench-summary > .el-alert) {
    grid-auto-rows: auto;
  }
  .workbench-section {
    min-height: 140px;
    padding: 0;
    overflow: hidden;
  }
  .workbench-summary {
    min-width: 0;
  }
  .workbench-summary > .el-alert {
    margin-bottom: 12px;
  }
  .workbench-section-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .developer-workbench h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 24px;
  }
  .workbench-section-heading > span,
  .workbench-recent__actions > span {
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }
  .development-steps {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    grid-auto-rows: minmax(138px, 1fr);
    height: 100%;
  }
  .development-step {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
    min-width: 0;
    min-height: 138px;
    padding: 20px;
    color: var(--el-text-color-primary);
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-right: 1px solid var(--console-line);
    border-radius: 0;
    transition:
      background-color 0.15s,
      color 0.15s;
  }
  .development-step:last-child {
    border-right: 0;
  }
  .development-step:hover:not(:disabled) {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
  .development-step:hover:not(:disabled) .development-step__arrow {
    color: var(--el-color-primary);
  }
  .development-step:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: -3px;
  }
  .development-step:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .development-step__icon {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    font-size: 20px;
    color: var(--el-color-primary);
  }
  .development-step__number {
    position: absolute;
    top: 20px;
    right: 20px;
    font-size: 14px;
    font-weight: 400;
    line-height: 20px;
    color: var(--el-text-color-secondary);
  }
  .development-step__content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .development-step strong {
    font-size: 14px;
    font-weight: 600;
    line-height: 22px;
  }
  .development-step__content > span {
    font-size: 14px;
    line-height: 18px;
    color: var(--el-text-color-secondary);
  }
  .development-step__arrow {
    position: absolute;
    right: 20px;
    bottom: 16px;
    width: 14px;
    height: 14px;
    font-size: 14px;
    color: var(--el-text-color-secondary);
    transform: rotate(-45deg);
  }
  .workbench-traffic__value {
    display: block;
    font-size: 24px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 32px;
    color: var(--el-text-color-primary);
    overflow-wrap: anywhere;
  }
  .workbench-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(300px, 28%, 420px);
    gap: 16px;
  }
  .workbench-main,
  .workbench-aside {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  .workbench-overview {
    min-width: 0;
    scroll-margin-top: calc(var(--art-header-height, 60px) + 16px);
  }
  .workbench-shortcuts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;
  }
  .workbench-shortcuts .el-button {
    margin: 0;
  }
  .workbench-recent__actions {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .workbench-recent {
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .workbench-recent__head,
  .workbench-recent button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 70px 150px 16px;
    gap: 14px;
    align-items: center;
    padding: 12px 10px;
  }
  .workbench-recent__head {
    padding-block: 8px;
    font-size: 14px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
  }
  .workbench-recent button {
    width: 100%;
    font-size: 14px;
    color: var(--el-text-color-regular);
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--console-line);
  }
  .workbench-recent button:hover {
    color: var(--el-color-primary);
    background: var(--el-fill-color-light);
  }
  .workbench-recent strong {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .workbench-recent strong svg {
    flex-shrink: 0;
    color: var(--el-text-color-secondary);
  }
  .workbench-recent button > span {
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }
  .workbench-traffic {
    padding: 0;
    overflow: hidden;
  }
  .workbench-traffic :deep(.el-skeleton) {
    padding: 20px;
  }
  .workbench-traffic__metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    padding: 20px;
    border-top: 1px solid var(--console-line);
  }
  .workbench-traffic__metric {
    min-width: 0;
  }
  .workbench-traffic__heading {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 8px;
  }
  .workbench-traffic__icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    font-size: 18px;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-radius: 4px;
  }
  .workbench-traffic__label {
    margin: 0;
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }
  .workbench-window {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    padding: 16px 20px;
  }
  .workbench-window > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .workbench-window span {
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }
  .workbench-window strong {
    font-size: 14px;
    font-weight: 400;
    overflow-wrap: anywhere;
  }
  .workbench-window__label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .workbench-window__label svg {
    width: 14px;
    height: 14px;
    color: var(--el-color-primary);
  }
  .workbench-help__icon {
    margin-bottom: 12px;
    font-size: 20px;
    color: var(--el-color-primary);
  }
  .workbench-help p,
  .workbench-guide p {
    font-size: 14px;
    line-height: 22px;
    color: var(--el-text-color-secondary);
  }
  .workbench-guide {
    padding-left: 24px;
  }
  .workbench-guide li {
    margin-bottom: 24px;
  }
  @container workbench (max-width: 1050px) {
    .workbench-connection-art {
      right: 12px;
      width: 350px;
      opacity: 0.4;
    }
  }
  @container workbench (max-width: 850px) {
    .workbench-columns {
      grid-template-columns: minmax(0, 1fr);
    }
    .workbench-connection-art {
      opacity: 0.18;
    }
    .development-steps {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .development-step {
      grid-column: span 2;
    }
    .development-step:nth-last-child(-n + 2) {
      grid-column: span 3;
    }
    .development-step:nth-child(-n + 3) {
      border-bottom: 1px solid var(--console-line);
    }
    .development-step:nth-child(3) {
      border-right: 0;
    }
  }
  @container workbench (max-width: 560px) {
    .workbench-hero {
      min-height: 170px;
      padding: 20px;
    }
    .workbench-connection-art {
      display: none;
    }
    .development-steps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .development-step,
    .development-step:nth-last-child(-n + 2) {
      grid-column: auto;
      border-right: 0;
    }
    .development-step:not(:last-child) {
      border-bottom: 1px solid var(--console-line);
    }
    .development-step:nth-child(odd):not(:last-child) {
      border-right: 1px solid var(--console-line);
    }
    .development-step:last-child {
      grid-column: 1 / -1;
    }
    .development-step__content > span {
      text-wrap: balance;
    }
    .workbench-recent__head,
    .workbench-recent button {
      grid-template-columns: minmax(0, 1fr) 60px 16px;
      gap: 8px;
    }
    .workbench-recent__head > span:nth-child(3),
    .workbench-recent button > span:nth-child(3) {
      display: none;
    }
    .workbench-window {
      padding: 14px 16px;
    }
    .workbench-traffic__metrics {
      padding: 16px;
    }
    .workbench-traffic__heading {
      gap: 6px;
    }
    .workbench-traffic__icon {
      width: 24px;
      height: 24px;
      font-size: 16px;
    }
  }
  @media (width <= 1100px) {
    .workbench-start {
      grid-auto-rows: auto;
    }
    .development-steps {
      grid-auto-rows: minmax(140px, auto);
      height: auto;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .development-step {
      transition: none;
    }
  }
</style>
