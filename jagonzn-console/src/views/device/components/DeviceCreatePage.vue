<template>
  <section class="device-create-page" aria-label="创建设备">
    <header class="device-create-page__header">
      <ElButton
        class="device-create-page__back"
        link
        type="primary"
        :icon="Back"
        aria-label="返回设备列表"
        :disabled="submitting"
        @click="emit('cancel')"
      />
      <h1>创建设备</h1>
    </header>
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top" @submit.prevent>
      <ElFormItem label="设备名称" prop="name" class="device-create-page__field">
        <ElInput
          :model-value="model.name"
          @update:model-value="update('name', String($event).trim())"
          aria-label="设备名称"
          maxlength="128"
        />
      </ElFormItem>
      <ElFormItem label="设备标识符" prop="deviceKey" class="device-create-page__field">
        <ElInput
          :model-value="model.deviceKey"
          @update:model-value="update('deviceKey', String($event).trim())"
          aria-label="设备标识符"
          maxlength="64"
          placeholder="例如 sensor_01"
        />
        <div class="device-create-page__help">创建后不可修改，用于 MQTT Topic。</div>
      </ElFormItem>

      <section class="device-create-page__section" aria-labelledby="device-create-type-heading">
        <h2 id="device-create-type-heading">为此设备绑定设备类型</h2>
        <p
          >设备类型是指一类拥有相同功能的设备，通过功能定义来简化多个设备的管理。功能定义包括属性、事件、命令等，除此之外设备类型还可以定义规则和任务。</p
        >
        <ElFormItem label="设备类型（选填）" class="device-create-page__field">
          <ElSelect
            :model-value="model.deviceTypeId"
            @update:model-value="update('deviceTypeId', String($event ?? ''))"
            aria-label="设备类型"
            clearable
            placeholder="请选择设备类型"
            :loading="typesLoading"
            @popup-scroll="emit('typeScroll', $event)"
          >
            <ElOption
              v-for="type in types"
              :key="type.id"
              :label="type.name"
              :value="type.id ?? ''"
            />
          </ElSelect>
        </ElFormItem>
      </section>

      <section class="device-create-page__section" aria-labelledby="device-create-group-heading">
        <h2 id="device-create-group-heading">将此设备加入分组</h2>
        <p
          >使用设备组可以对设备进行更好的归类管理，同时还可以基于分组对设备数据进行统计监控和聚合分析。</p
        >
        <ElFormItem label="设备组（选填）" prop="groupId" class="device-create-page__field">
          <ElSelect
            :model-value="model.groupId"
            @update:model-value="update('groupId', String($event ?? ''))"
            aria-label="设备组"
            clearable
            filterable
            placeholder="请选择设备组"
          >
            <ElOption
              v-for="group in groups"
              :key="group.id"
              :label="group.name"
              :value="group.id ?? ''"
            />
            <template #empty
              ><div class="device-create-page__empty">暂无可选静态设备组</div></template
            >
          </ElSelect>
        </ElFormItem>
      </section>

      <section class="device-create-page__section" aria-labelledby="device-create-more-heading">
        <h2 id="device-create-more-heading">更多设备信息</h2>
        <ElFormItem label="位置（选填）" class="device-create-page__field">
          <ElInput
            :model-value="model.location"
            @update:model-value="update('location', String($event).trim())"
            maxlength="256"
            placeholder="例如 机房A"
          />
        </ElFormItem>
        <ElFormItem label="设备描述（选填）" class="device-create-page__field">
          <ElInput
            :model-value="model.description"
            @update:model-value="update('description', String($event).trim())"
            type="textarea"
            :rows="3"
          />
        </ElFormItem>
        <ElFormItem label="标签（选填）" prop="tags">
          <div class="device-create-page__tags">
            <div
              v-for="(tag, index) in model.tags"
              :key="index"
              class="device-create-page__tag-row"
            >
              <ElInput
                :model-value="tag.key"
                @update:model-value="updateTag(index, 'key', String($event))"
                maxlength="64"
                placeholder="标签名称，例如 region"
                :aria-label="`标签名称 ${index + 1}`"
              />
              <ElInput
                :model-value="tag.value"
                @update:model-value="updateTag(index, 'value', String($event))"
                maxlength="128"
                placeholder="标签值，例如 east"
                :aria-label="`标签值 ${index + 1}`"
              />
              <ElButton
                type="danger"
                plain
                :aria-label="`移除标签 ${index + 1}`"
                @click="
                  update(
                    'tags',
                    model.tags.filter((_, row) => row !== index)
                  )
                "
                >移除</ElButton
              >
            </div>
            <ElButton
              :icon="Plus"
              :disabled="model.tags.length >= 20"
              @click="update('tags', [...model.tags, { key: '', value: '' }])"
              >添加标签</ElButton
            >
          </div>
        </ElFormItem>
      </section>
      <div class="device-create-page__actions">
        <ElButton type="primary" :loading="submitting" @click="emit('submit')">创建</ElButton>
        <ElButton :disabled="submitting" @click="emit('cancel')">取消</ElButton>
      </div>
    </ElForm>
  </section>
</template>

<script setup lang="ts">
  import { Back, Plus } from '@element-plus/icons-vue'
  import type { FormInstance, FormRules } from 'element-plus'
  import type { DeviceTypeResponse } from '@/api/device'
  import type { DeviceGroupResponse } from '@/api/device-group'
  import type { DeviceCreationForm, DeviceCreationTag } from '../device-creation-form'

  const props = defineProps<{
    model: DeviceCreationForm
    rules: FormRules
    types: DeviceTypeResponse[]
    groups: DeviceGroupResponse[]
    typesLoading: boolean
    submitting: boolean
  }>()
  const emit = defineEmits<{
    cancel: []
    submit: []
    typeScroll: [event: Event]
    'update:model': [model: DeviceCreationForm]
  }>()
  const update = <K extends keyof DeviceCreationForm>(key: K, value: DeviceCreationForm[K]) => {
    emit('update:model', { ...props.model, [key]: value })
    if (key === 'tags') formRef.value?.clearValidate('tags')
  }
  const updateTag = (index: number, key: keyof DeviceCreationTag, value: string) =>
    update(
      'tags',
      props.model.tags.map((tag, row) => (row === index ? { ...tag, [key]: value } : tag))
    )
  const formRef = ref<FormInstance>()
  defineExpose({ validate: () => formRef.value!.validate() })
</script>

<style scoped lang="scss">
  .device-create-page {
    color: var(--el-text-color-primary);

    &__header {
      display: flex;
      gap: 8px;
      align-items: center;
      padding-bottom: 20px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }
    &__header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 400;
      line-height: 28px;
    }
    &__back {
      width: 24px;
      min-height: 38px;
      padding: 0;
      margin: 0;
      font-size: 22px;
    }
    :deep(.device-create-page__back .el-icon) {
      font-size: 16px;
    }
    &__field {
      width: 320px;
      max-width: 100%;
    }
    &__section {
      margin-top: 32px;
    }
    &__section h2 {
      margin: 0 0 10px;
      font-size: 16px;
      font-weight: 400;
      line-height: 24px;
    }
    &__section p,
    &__help {
      font-size: 14px;
      line-height: 22px;
      color: var(--el-text-color-secondary);
    }
    &__section p {
      margin: 0 0 20px;
    }
    &__help {
      margin-top: 6px;
    }
    &__tags {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
      width: 720px;
      max-width: 100%;
    }
    &__tag-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 64px;
      gap: 8px;
      width: 100%;
    }
    &__empty {
      padding: 12px;
      font-size: 14px;
      text-align: center;
    }
    &__actions {
      display: flex;
      gap: 8px;
      padding-block: 16px 8px;
    }
    :deep(.el-form-item) {
      margin-bottom: 20px;
    }
    :deep(.el-form-item__label) {
      height: auto;
      margin-bottom: 6px;
      font-size: 14px;
      font-weight: 400;
      line-height: 22px;
    }
    :deep(.el-form-item__error) {
      position: static;
      padding-top: 4px;
      font-size: 14px;
      line-height: 22px;
    }
    :deep(.el-input__wrapper),
    :deep(.el-select__wrapper) {
      min-height: 32px;
      font-size: 14px;
      border-radius: 4px;
    }
    :deep(.el-textarea__inner) {
      font-size: 14px;
      line-height: 22px;
      border-radius: 4px;
    }
    :deep(.el-button:not(.device-create-page__back)) {
      height: 32px;
      min-height: 32px;
      padding: 4px 16px;
      margin: 0;
      font-size: 14px;
      font-weight: 400;
      border-radius: 4px;
    }
    :deep(.el-select) {
      width: 100%;
    }
  }

  @media (width <= 640px) {
    .device-create-page__tag-row {
      grid-template-columns: minmax(0, 1fr) 64px;
    }
    .device-create-page__tag-row > :first-child {
      grid-column: 1 / -1;
    }
  }
</style>
