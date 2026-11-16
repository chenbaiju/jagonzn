<template>
  <ConsoleFilterBar
    class="device-advanced-filter"
    :items="filterItems"
    :span="8"
    label-position="top"
    :show-expand="false"
    @search="emit('search')"
    @reset="emit('reset')"
  >
    <template #keyword>
      <ElInput
        v-model.trim="model.keyword"
        maxlength="128"
        clearable
        placeholder="请输入名称或标识符"
      />
    </template>
    <template #deviceTypeIds>
      <ElSelect
        v-model="model.deviceTypeIds"
        multiple
        collapse-tags
        collapse-tags-tooltip
        clearable
        placeholder="全部类型"
      >
        <ElOption v-for="type in deviceTypes" :key="type.id" :label="type.name" :value="type.id" />
      </ElSelect>
    </template>
    <template #statuses>
      <ElSelect
        v-model="model.statuses"
        multiple
        collapse-tags
        collapse-tags-tooltip
        clearable
        placeholder="全部状态"
      >
        <ElOption label="未激活" value="INACTIVE" />
        <ElOption label="在线" value="ONLINE" />
        <ElOption label="离线" value="OFFLINE" />
      </ElSelect>
    </template>
    <template #groupId>
      <ElSelect v-model="model.groupId" clearable placeholder="全部设备组">
        <ElOption v-for="group in groups" :key="group.id" :label="group.name" :value="group.id" />
      </ElSelect>
    </template>
    <template #tagKey>
      <ElInput v-model.trim="model.tagKey" maxlength="64" clearable placeholder="例如 region" />
    </template>
    <template #tagValue>
      <ElInput
        v-model.trim="model.tagValue"
        maxlength="128"
        clearable
        placeholder="例如 cn-east-1"
      />
    </template>
  </ConsoleFilterBar>
</template>

<script setup lang="ts">
  import ConsoleFilterBar from '@/components/ConsoleFilterBar.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'

  const filterItems: SearchFormItem[] = [
    { key: 'keyword', label: '名称 / 标识' },
    { key: 'statuses', label: '设备状态' },
    { key: 'deviceTypeIds', label: '设备类型' },
    { key: 'groupId', label: '设备组' },
    { key: 'tagKey', label: '标签键' },
    { key: 'tagValue', label: '标签值' }
  ]
  /** 设备高级筛选的固定白名单状态；不向后端传递自由表达式或排序字段。 */
  export interface DeviceAdvancedFilterModel {
    keyword: string
    deviceTypeIds: string[]
    statuses: Array<'INACTIVE' | 'ONLINE' | 'OFFLINE'>
    groupId: string
    tagKey: string
    tagValue: string
  }

  interface SelectOption {
    id: string
    name: string
  }

  defineProps<{
    deviceTypes: SelectOption[]
    groups: SelectOption[]
  }>()

  const model = defineModel<DeviceAdvancedFilterModel>({ required: true })
  const emit = defineEmits<{
    search: []
    reset: []
  }>()
</script>

<style lang="scss">
  .device-advanced-filter.console-filter-bar.art-search-bar {
    container: device-filter / inline-size;

    .el-form > .el-row {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 10px 16px;
      align-items: end;
      margin-inline: 0 !important;
    }
    .el-col {
      grid-column: span 4;
      width: auto;
      max-width: none;
      padding-inline: 0 !important;
    }
    .el-col:nth-child(n + 4) {
      grid-column: span 3;
    }
    .el-form-item .el-form-item__label {
      justify-content: flex-start;
      // Override the legacy global 36px horizontal-label rule for this top-label filter only.
      height: auto !important;
      margin: 0 0 2px;
      font-size: 14px;
      line-height: 18px !important;
    }
    .action-column .action-buttons-wrapper {
      justify-content: flex-end;
      margin: 0 !important;
    }
    .form-buttons .el-button {
      min-width: 80px;
    }

    @container device-filter (max-width: 760px) {
      .el-form > .el-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .el-col,
      .el-col:nth-child(n + 4) {
        grid-column: span 1;
      }
      .el-col.action-column {
        grid-column: 1 / -1;
      }
    }
    @container device-filter (max-width: 480px) {
      .el-form > .el-row {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }
</style>
