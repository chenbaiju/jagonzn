<template>
  <section v-if="visible" class="device-image-panel console-fragment" aria-label="设备图片">
    <ElAlert v-if="error" type="error" :closable="false" :title="error" />
    <ElAlert
      v-if="state?.pendingState"
      type="warning"
      :closable="false"
      title="存在未决图片上传，暂不能覆盖；未知结果仍保留存储占用。"
    />
    <div class="device-image-panel__layout">
      <div class="device-image-panel__preview">
        <img v-if="imageUrl" :src="imageUrl" class="device-image" alt="设备当前图片" />
        <ElEmpty
          v-else
          :image-size="64"
          :description="state?.present ? '当前图片暂不可读取' : '尚未设置设备图片'"
        />
      </div>
      <div class="device-image-panel__controls">
        <p class="device-image-panel__description"
          >每台设备保留一张图片，支持 PNG/JPEG，最大 1 MiB。</p
        >
        <p class="device-image-panel__caption"
          >单边不超过 2048 像素，总像素不超过
          1048576。上传后移除原元数据；处理后过大请缩小图片重试。</p
        >
        <p v-if="state?.present" class="device-image-panel__caption"
          >{{ state.width }} × {{ state.height }} · {{ state.sizeBytes }} 字节</p
        >
        <div v-if="manager" class="device-image-panel__file">
          <input
            ref="input"
            type="file"
            accept="image/png,image/jpeg"
            aria-label="选择设备图片"
            hidden
            :disabled="!canWrite"
            @change="choose"
          />
          <ElButton :disabled="!canWrite" @click="input?.click()">选择图片</ElButton>
          <span :title="file?.name">{{ file?.name || '未选择图片' }}</span>
        </div>
        <div class="device-image-panel__actions">
          <ElButton
            v-if="manager"
            type="primary"
            :disabled="!canWrite || !file"
            :loading="saving"
            @click="save"
            >上传或替换图片</ElButton
          >
          <ElButton :disabled="loading || saving" @click="load">刷新图片状态</ElButton>
          <ElButton
            v-if="manager && state?.present"
            type="danger"
            plain
            :disabled="!canWrite"
            @click="remove"
            >删除图片</ElButton
          >
        </div>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue'
  import { useUserStore } from '@/store/modules/user'
  import { currentIdentityEpoch } from '@/utils/http/identity-scope'
  import {
    readDeviceImage,
    readDeviceImageContent,
    uploadDeviceImage,
    removeDeviceImage,
    type DeviceImage
  } from '@/api/device-images'
  const props = defineProps<{ projectId: string; deviceId: string; active?: boolean }>()
  const user = useUserStore()
  const visible = computed(
    () =>
      props.active !== false &&
      !!props.deviceId &&
      !!props.projectId &&
      props.projectId === user.info.currentProjectId
  )
  const manager = computed(() =>
    (user.info.roles || []).some((r) => r === 'OWNER' || r === 'ADMIN')
  )
  const state = ref<DeviceImage>(),
    imageUrl = ref(''),
    error = ref(''),
    loading = ref(false),
    saving = ref(false)
  const file = ref<File>(),
    input = ref<HTMLInputElement>()
  let generation = 0
  const canWrite = computed(
    () =>
      manager.value &&
      state.value?.writable &&
      !state.value.pendingState &&
      !error.value &&
      !loading.value &&
      !saving.value
  )
  function clearUrl() {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''
  }
  function clearFile() {
    file.value = undefined
    if (input.value) input.value.value = ''
  }
  function valid(value: DeviceImage) {
    return (
      typeof value?.revision === 'string' &&
      /^(0|[1-9][0-9]{0,18})$/.test(value.revision) &&
      typeof value.present === 'boolean' &&
      typeof value.writable === 'boolean' &&
      (value.pendingState == null ||
        ['RESERVED', 'WRITING', 'UNKNOWN', 'RECEIPT', 'VERIFIED'].includes(value.pendingState)) &&
      (!value.present ||
        (Number.isInteger(value.width) &&
          value.width! > 0 &&
          value.width! <= 2048 &&
          Number.isInteger(value.height) &&
          value.height! > 0 &&
          value.height! <= 2048 &&
          Number.isInteger(value.sizeBytes) &&
          value.sizeBytes! > 0 &&
          value.sizeBytes! <= 1048576))
    )
  }
  async function load() {
    const token = ++generation,
      identity = currentIdentityEpoch(),
      project = props.projectId,
      device = props.deviceId
    clearUrl()
    clearFile()
    state.value = undefined
    error.value = ''
    saving.value = false
    loading.value = false
    if (!visible.value) return
    loading.value = true
    try {
      const result = await readDeviceImage(project, device)
      if (token !== generation || identity !== currentIdentityEpoch()) return
      if (!valid(result)) throw new Error('图片状态不完整')
      state.value = result
      if (result.present) {
        const blob = await readDeviceImageContent(project, device, result.revision)
        if (token !== generation || identity !== currentIdentityEpoch()) return
        imageUrl.value = URL.createObjectURL(blob)
      }
    } catch {
      if (token === generation) error.value = '无法读取设备图片，请刷新状态后核对。'
    } finally {
      if (token === generation) loading.value = false
    }
  }
  function choose(event: Event) {
    const selected = (event.target as HTMLInputElement).files?.[0]
    clearFile()
    if (!selected) return
    if (
      !['image/png', 'image/jpeg'].includes(selected.type) ||
      selected.size < 1 ||
      selected.size > 1048576
    ) {
      error.value = '请选择不超过 1 MiB 的 PNG/JPEG 图片；刷新状态后可重新选择。'
      return
    }
    file.value = selected
  }
  async function change(remove: boolean) {
    if (!canWrite.value || !state.value || (!remove && !file.value)) return
    const token = generation,
      identity = currentIdentityEpoch(),
      project = props.projectId,
      device = props.deviceId,
      revision = state.value.revision,
      selected = file.value
    saving.value = true
    clearFile()
    try {
      if (remove) await removeDeviceImage(project, device, revision)
      else await uploadDeviceImage(project, device, revision, selected!, crypto.randomUUID())
      if (token === generation && identity === currentIdentityEpoch()) await load()
    } catch {
      if (token === generation && identity === currentIdentityEpoch())
        error.value = '图片操作未确认，未自动重发。请刷新图片状态后核对。'
    } finally {
      if (token === generation) saving.value = false
    }
  }
  const save = () => change(false),
    remove = () => change(true)
  watch(
    () => [
      props.projectId,
      props.deviceId,
      props.active,
      user.info.userId,
      user.info.tenantId,
      user.info.currentProjectId,
      (user.info.roles || []).join(','),
      currentIdentityEpoch()
    ],
    load,
    { immediate: true }
  )
  onBeforeUnmount(() => {
    generation++
    clearUrl()
    clearFile()
  })
</script>
<style scoped lang="scss">
  .device-image-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  .device-image-panel__layout {
    display: grid;
    grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  .device-image-panel__preview {
    display: grid;
    place-items: center;
    min-height: 220px;
    padding: 16px;
    background: var(--el-fill-color-light);
    border: 1px solid var(--console-line);
    border-radius: 4px;
  }
  .device-image {
    display: block;
    max-width: 100%;
    max-height: 240px;
    object-fit: contain;
  }
  .device-image-panel__controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .device-image-panel__description {
    margin: 0;
    font-size: 14px;
    line-height: 22px;
    color: var(--el-text-color-primary);
  }
  .device-image-panel__caption,
  .device-image-panel__file > span {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--el-text-color-secondary);
    overflow-wrap: anywhere;
  }
  .device-image-panel__file,
  .device-image-panel__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .device-image-panel__file > .el-button,
  .device-image-panel__actions > .el-button {
    margin: 0;
  }
  @media (width <= 700px) {
    .device-image-panel__layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }
  }
</style>
