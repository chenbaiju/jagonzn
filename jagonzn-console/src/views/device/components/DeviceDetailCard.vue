<template>
  <ElCard class="device-detail-card" shadow="never" role="region" :aria-label="title">
    <template #header>
      <div class="device-detail-card__header">
        <h3 :id="headingId">{{ title }}</h3>
        <div v-if="$slots.meta" class="device-detail-card__meta">
          <slot name="meta" />
        </div>
        <div v-if="$slots.actions" class="device-detail-card__actions">
          <slot name="actions" />
        </div>
      </div>
    </template>
    <slot />
  </ElCard>
</template>

<script setup lang="ts">
  import { ElCard } from 'element-plus'

  defineProps<{ title: string; headingId?: string }>()
</script>

<style scoped lang="scss">
  .device-detail-card.el-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    color: var(--el-text-color-regular);
    background: var(--el-bg-color);
    border: 1px solid var(--console-line);
    border-radius: 4px;
    box-shadow: none;

    :deep(> .el-card__header) {
      flex-shrink: 0;
      padding: 0;
      background: var(--el-fill-color-light);
      border-bottom: 1px solid var(--console-line);
    }

    :deep(> .el-card__body) {
      flex: 1;
      min-width: 0;
      min-height: 0;
      padding: 16px;
      font-size: 14px;
      line-height: 22px;
    }
  }

  .device-detail-card__header {
    box-sizing: border-box;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    padding: 10px 16px;

    h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      line-height: 22px;
      color: var(--el-text-color-primary);
    }
  }

  .device-detail-card__meta {
    min-width: 0;
    max-width: 100%;
    margin-left: auto;
    font-size: 12px;
    font-weight: 400;
    line-height: 20px;
    color: var(--el-text-color-secondary);
    text-align: right;
    overflow-wrap: anywhere;
  }

  .device-detail-card__actions {
    --el-component-custom-height: 22px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    min-width: 0;
    font-size: 14px;
    line-height: 22px;

    :deep(.el-button.is-text),
    :deep(.el-button.is-link) {
      height: 22px;
      min-height: 22px;
      padding: 0;
      margin: 0;
      font-size: 14px;
      line-height: 22px;
    }
  }
</style>
