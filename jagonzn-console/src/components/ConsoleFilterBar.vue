<script setup lang="ts">
  import ArtSearchBar, {
    type SearchFormItem
  } from '@/components/core/forms/art-search-bar/index.vue'

  defineOptions({ inheritAttrs: false })
  withDefaults(
    defineProps<{
      items: SearchFormItem[]
      labelPosition?: 'left' | 'top'
      span?: number
      showExpand?: boolean
      showSearch?: boolean
      showReset?: boolean
      disabledSearch?: boolean
      loading?: boolean
    }>(),
    {
      labelPosition: 'left',
      span: 8,
      showExpand: true,
      showSearch: true,
      showReset: true,
      disabledSearch: false,
      loading: false
    }
  )
  const emit = defineEmits<{ search: []; reset: [] }>()
  // Field slots bind each page's existing model. This shell never clones or
  // sanitizes domain values such as Date objects; pages own query and reset.
  const presentationModel = reactive<Record<string, unknown>>({})
</script>

<template>
  <ArtSearchBar
    v-bind="$attrs"
    class="console-filter-bar"
    :class="{ 'console-filter-bar--no-actions': !showSearch && !showReset && !showExpand }"
    :model-value="presentationModel"
    :items="items"
    :span="span"
    :gutter="20"
    :button-left-limit="0"
    :show-expand="showExpand"
    :is-expand="!showExpand"
    :show-search="showSearch"
    :show-reset="showReset"
    :disabled-search="disabledSearch || loading"
    :search-loading="loading"
    :label-position="labelPosition"
    label-width="auto"
    @search="emit('search')"
    @reset="emit('reset')"
    @submit.prevent="emit('search')"
  >
    <template v-for="item in items" :key="item.key" #[item.key]>
      <slot :name="item.key" />
    </template>
  </ArtSearchBar>
  <div v-if="$slots.actions" class="console-actions"><slot name="actions" /></div>
</template>

<style lang="scss" scoped>
  .console-filter-bar.art-search-bar {
    width: 100%;
    padding: 0 !important;
    margin-bottom: 0;
    background: transparent !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;

    :deep(.el-row) {
      row-gap: 8px;
      align-items: center;
    }
    :deep(.el-form-item) {
      align-items: center;
      margin-bottom: 0;
    }
    :deep(.el-form-item__label) {
      justify-content: flex-start;
      font-size: 14px;
      line-height: 32px;
      color: var(--el-text-color-regular);
    }
    :deep(.el-input),
    :deep(.el-select),
    :deep(.el-date-editor) {
      width: 100% !important;
      min-width: 0;
      max-width: 100%;
    }
    :deep(.el-input__wrapper),
    :deep(.el-select__wrapper) {
      box-sizing: border-box;
      min-height: 32px;
    }
    :deep(.action-column .action-buttons-wrapper) {
      gap: 8px;
      margin-bottom: 0;
    }
    :deep(.action-column .form-buttons) {
      gap: 8px;
    }
    :deep(.form-buttons .el-button) {
      min-width: 62px;
      height: 32px;
      margin: 0;
    }
    :deep(.filter-toggle) {
      margin-left: 0;
      line-height: 32px;
      color: var(--el-color-primary);
    }
    &.console-filter-bar--no-actions :deep(.action-column) {
      display: none;
    }
    @media (width <= 640px) {
      :deep(.el-form-item) {
        flex-direction: column;
        align-items: stretch;
      }
      :deep(.el-form-item__label) {
        justify-content: flex-start;
        width: auto !important;
        padding: 0;
        line-height: 28px;
      }
      :deep(.el-form-item__content) {
        margin-left: 0 !important;
      }
      :deep(.form-buttons) {
        width: 100%;
      }
      :deep(.form-buttons .el-button) {
        flex: 1;
      }
    }
  }
</style>
