<template>
  <div
    class="console-page console-developer-page console-developer-workspace console-rule-workspace console-operations-workspace console-studio-workspace project-create"
  >
    <ConsoleWorkspaceHeader
      project-style
      title="添加项目"
      description="为您的物联网业务创建项目，选择设备接入与数据存储所在的区域。"
    />
    <ElForm
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      @submit.prevent="submit"
    >
      <ElFormItem prop="name" label="项目名称">
        <p class="console-description">为项目取一个便于识别的名称。</p>
        <ElInput
          v-model.trim="form.name"
          class="project-create__name"
          maxlength="128"
          show-word-limit
          placeholder="请输入项目名称"
        />
      </ElFormItem>
      <ElFormItem label="选择地域">
        <p class="console-description">选择项目所在地域。项目创建后，区域不可变更。</p>
        <ElAlert v-if="regionError" type="error" :closable="false" :title="regionError" />
        <div v-loading="regionLoading" class="project-create__options">
          <ElButton
            v-for="group in regionGroups"
            :key="group.areaCode"
            :type="areaCode === group.areaCode ? 'primary' : 'default'"
            :disabled="
              !group.regions.some((region) => region.enabled && region.projectCreationEnabled)
            "
            :aria-pressed="areaCode === group.areaCode"
            @click="chooseArea(group.areaCode)"
          >
            {{ group.areaName }}
          </ElButton>
        </div>
      </ElFormItem>
      <ElFormItem prop="region" label="选择可用区">
        <div class="project-create__options">
          <ElButton
            v-for="region in availableRegions"
            :key="region.code"
            :type="form.region === region.code ? 'primary' : 'default'"
            :disabled="!region.enabled || !region.projectCreationEnabled"
            :aria-pressed="form.region === region.code"
            @click="form.region = region.code"
          >
            {{ region.name }}
          </ElButton>
        </div>
      </ElFormItem>
      <ElFormItem prop="description" label="项目描述">
        <p class="console-description">可选，用于说明项目用途或补充项目资料。</p>
        <ElInput
          v-model="form.description"
          class="project-create__description"
          type="textarea"
          :rows="4"
          maxlength="1000"
          show-word-limit
          placeholder="请输入项目描述"
        />
      </ElFormItem>
      <ElButton
        type="primary"
        native-type="submit"
        :loading="submitting"
        :disabled="regionLoading || !!regionError || !selectedRegionCreatable"
        >创建项目</ElButton
      >
    </ElForm>
  </div>
</template>

<script setup lang="ts">
  import type { FormInstance, FormRules } from 'element-plus'
  import { ElMessage } from 'element-plus'
  import { useRouter } from 'vue-router'
  import ConsoleWorkspaceHeader from '@/components/business/ConsoleWorkspaceHeader.vue'
  import { fetchCreateProject } from '@/api/project'
  import { useProjectRegionCatalog } from '@/hooks/project/useProjectRegionCatalog'
  import { HttpError } from '@/utils/http/error'

  defineOptions({ name: 'ProjectCreate' })
  const router = useRouter()
  const {
    defaultProjectRegion,
    loading: regionLoading,
    loadProjectRegions,
    regionGroups
  } = useProjectRegionCatalog()
  const formRef = ref<FormInstance>()
  const form = reactive({ name: '', region: '', description: '' })
  const areaCode = ref('')
  const regionError = ref('')
  const submitting = ref(false)
  const availableRegions = computed(
    () => regionGroups.value.find((group) => group.areaCode === areaCode.value)?.regions ?? []
  )
  const selectedRegionCreatable = computed(() =>
    availableRegions.value.some(
      (region) => region.code === form.region && region.enabled && region.projectCreationEnabled
    )
  )
  const rules: FormRules = {
    name: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
    description: [{ max: 1000, message: '项目描述不能超过 1000 个字符', trigger: 'blur' }],
    region: [{ required: true, message: '请选择可用区', trigger: 'change' }]
  }
  const chooseArea = (code: string) => {
    areaCode.value = code
    form.region =
      availableRegions.value.find((region) => region.enabled && region.projectCreationEnabled)
        ?.code ?? ''
  }
  const submit = async () => {
    // 校验前同步锁定，防止连续点击创建多个项目。
    if (!formRef.value || submitting.value || !selectedRegionCreatable.value) return
    submitting.value = true
    try {
      await formRef.value.validate()
      await fetchCreateProject({
        name: form.name,
        region: form.region,
        description: form.description.trim() || undefined
      })
      ElMessage.success('项目创建成功')
      await router.push('/project/list')
    } catch (error) {
      if (error instanceof Error && !(error instanceof HttpError))
        console.error('创建项目失败:', error)
    } finally {
      submitting.value = false
    }
  }
  onMounted(async () => {
    try {
      await loadProjectRegions()
      const group = regionGroups.value.find((item) =>
        item.regions.some(
          (region) =>
            region.code === defaultProjectRegion.value &&
            region.enabled &&
            region.projectCreationEnabled
        )
      )
      if (group) {
        areaCode.value = group.areaCode
        form.region = defaultProjectRegion.value
      } else regionError.value = '暂无可创建项目的区域'
    } catch {
      regionError.value = '区域目录加载失败，请刷新页面重试'
    }
  })
</script>

<style scoped lang="scss">
  .project-create {
    > .el-form {
      padding: var(--console-page-spacing);
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 4px;
    }
    :deep(.el-form-item) {
      margin-bottom: 20px;
    }
    :deep(.el-form-item__content) {
      display: block;
    }
    :deep(.el-form-item__label) {
      height: auto !important;
      margin-bottom: 6px;
      font-weight: 500;
      line-height: 20px !important;
    }
    .console-description {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 20px;
    }
    > .el-form > .el-button {
      margin: 0;
    }
    &__name,
    &__description {
      max-width: 460px;
    }
    &__options {
      display: flex;
      flex-wrap: wrap;
      gap: 0;
    }
    &__options :deep(.el-button) {
      min-width: 88px;
      margin: 0;
      border-radius: 0;
    }
    &__options :deep(.el-button:first-child) {
      border-radius: 4px 0 0 4px;
    }
    &__options :deep(.el-button:last-child) {
      border-radius: 0 4px 4px 0;
    }
  }
  @media (width <= 640px) {
    .project-create__options {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .project-create__options :deep(.el-button),
    .project-create__options :deep(.el-button:first-child),
    .project-create__options :deep(.el-button:last-child) {
      width: 100%;
      border-radius: 4px;
    }
  }
</style>
