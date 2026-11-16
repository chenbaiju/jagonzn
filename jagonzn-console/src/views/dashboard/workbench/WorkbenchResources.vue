<template>
  <section class="workbench-resources" aria-labelledby="resources-heading">
    <h2 id="resources-heading">我的资源</h2>
    <ul>
      <li v-for="row in rows" :key="row.path">
        <span class="workbench-resources__icon"><ArtSvgIcon :icon="row.icon" /></span>
        <div>
          <span>{{ row.label }}</span>
          <span class="workbench-resources__count" :aria-label="`${row.label}数量`">{{
            row.failed
              ? '暂不可用'
              : row.count === undefined
                ? '—'
                : row.count.toLocaleString('zh-CN')
          }}</span>
        </div>
      </li>
    </ul>
    <p v-if="!rows.length" class="workbench-resources__empty">当前角色暂无可查看的资源统计。</p>
  </section>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue'
  import { currentIdentityEpoch } from '@/utils/http/identity-scope'
  import { countWorkbenchResource, workbenchResources } from '@/utils/workbench-resources'

  const props = defineProps<{ projectId: string; scopeKey: string; allowedPaths: string[] }>()
  type ResourceRow = (typeof workbenchResources)[number] & { count?: number; failed: boolean }
  const rows = ref<ResourceRow[]>([])
  let generation = 0
  let nextReadAt = 0
  const delays = new Map<ReturnType<typeof setTimeout>, () => void>()
  const clearDelays = () => {
    for (const [timer, resolve] of delays) {
      clearTimeout(timer)
      resolve()
    }
    delays.clear()
  }
  const waitForRead = () => {
    const scheduledAt = Math.max(Date.now(), nextReadAt)
    // 后台统计最多每秒四次（含续页），给首屏与用户操作保留读取预算。
    nextReadAt = scheduledAt + 250
    return new Promise<void>((resolve) => {
      const timer = setTimeout(
        () => {
          delays.delete(timer)
          resolve()
        },
        Math.max(0, scheduledAt - Date.now())
      )
      delays.set(timer, resolve)
    })
  }
  async function load() {
    const request = ++generation
    clearDelays()
    // 等待首屏上下文/摘要读取后再启动非关键统计，不与它们争抢一秒窗口。
    nextReadAt = Date.now() + 1000
    const projectId = props.projectId
    const epoch = currentIdentityEpoch()
    const current = () => request === generation && epoch === currentIdentityEpoch()
    rows.value = workbenchResources
      .filter((resource) => props.allowedPaths.includes(resource.path))
      .map((resource) => ({ ...resource, failed: false }))
    const pending = [...rows.value]
    // 最多三个目录同时读取，避免首页一次并发请求全部模块。
    await Promise.all(
      Array.from({ length: Math.min(3, pending.length) }, async () => {
        while (current() && pending.length) {
          const row = pending.shift()!
          try {
            const count = await countWorkbenchResource(row, projectId, current, waitForRead)
            if (current()) row.count = count
          } catch {
            if (current()) row.failed = true
          }
        }
      })
    )
  }
  watch(() => [props.projectId, props.scopeKey, props.allowedPaths, currentIdentityEpoch()], load, {
    immediate: true
  })
  onBeforeUnmount(() => {
    generation++
    clearDelays()
  })
</script>

<style scoped lang="scss">
  .workbench-resources {
    padding: 20px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-light);
    border-radius: 4px;

    h2 {
      margin: 0 0 20px;
      font-size: 14px;
      font-weight: 500;
    }

    ul {
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 0;
      margin: 0;
      list-style: none;
    }

    li {
      display: flex;
      gap: 14px;
      align-items: center;
      font-size: 14px;
    }
  }

  .workbench-resources__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    font-size: 16px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
    border-radius: 4px;
  }

  .workbench-resources__count {
    display: block;
    margin-top: 4px;
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }

  .workbench-resources__empty {
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }
</style>
