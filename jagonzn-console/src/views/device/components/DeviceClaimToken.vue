<template>
  <section v-if="canManage" class="device-claim-token">
    <ElDivider content-position="left">设备用途二维码</ElDivider>

    <ElInput
      v-model="address"
      aria-label="设备二维码平台地址"
      placeholder="App 当前登录的 HTTPS 平台根地址"
      :disabled="busy"
    />
    <div class="device-claim-token__actions">
      <ElButton :disabled="busy || !projectInfo" @click="locate">显示设备定位码</ElButton>
      <ElButton
        :disabled="busy || projectInfo?.status !== 'ACTIVE' || primaryKnown || !!codeId"
        @click="issue"
        >签发认领令牌</ElButton
      >
      <ElButton v-if="codeId" :disabled="busy || projectInfo?.status !== 'ACTIVE'" @click="revoke"
        >撤销本次认领码</ElButton
      >
    </div>
    <ElAlert v-if="notice" :title="notice" type="warning" :closable="false" show-icon />
    <ElAlert v-if="primaryKnown" type="info" :closable="false"
      >当前设备已有主控，不能再次签发认领令牌。</ElAlert
    >
    <template v-if="token"
      ><ElInput
        :model-value="token"
        aria-label="一次性认领令牌"
        type="password"
        show-password
        readonly
        autocomplete="off"
    /></template>
    <template v-if="payload"
      ><QrcodeVue :value="payload" :size="240" level="M" render-as="svg" /><p>{{
        purpose === 'CLAIM'
          ? '一次性设备认领码，请勿转发。'
          : '设备定位码，扫码后仍需当前项目访问权限。'
      }}</p></template
    >
    <p v-if="expiresAt"
      >本次认领能力到期：{{ formatTime(expiresAt) }}；关闭展示不会撤销，需点击撤销或等待到期。</p
    >
    <ElButton v-if="payload || token" @click="hide">关闭令牌展示</ElButton>
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import QrcodeVue from 'qrcode.vue'
  import { ElMessageBox } from 'element-plus'
  import {
    issueDeviceClaimCode,
    readDeviceLocationCode,
    revokeDeviceClaimCode
  } from '@/api/device-purpose-codes'
  import { fetchProjects, type ProjectResponse } from '@/api/project'
  import { useUserStore } from '@/store/modules/user'
  import { currentIdentityEpoch } from '@/utils/http/identity-scope'
  import { formatTime } from '@/utils/time'
  import { defaultAppProjectAddress } from '@/utils/app-project-entry'
  import { devicePurposeCode, devicePurposeOrigin } from '@/utils/device-purpose-code'
  const props = defineProps<{ projectId: string; deviceId: string; primaryKnown: boolean }>()
  const user = useUserStore()
  const canManage = computed(
    () =>
      !!props.projectId &&
      props.projectId === user.info.currentProjectId &&
      (user.info.buttons || []).includes('enduser:manage') &&
      (user.info.roles || []).some((r) => r === 'OWNER' || r === 'ADMIN')
  )
  const address = ref(defaultAppProjectAddress(window.location.hostname))
  const token = ref(''),
    expiresAt = ref(''),
    codeId = ref(''),
    payload = ref(''),
    purpose = ref(''),
    notice = ref(''),
    busy = ref(false)
  const projectInfo = ref<ProjectResponse>()
  let generation = 0,
    timer: ReturnType<typeof setTimeout> | undefined
  function hide() {
    token.value = ''
    payload.value = ''
    purpose.value = ''
  }
  function clear() {
    hide()
    codeId.value = ''
    expiresAt.value = ''
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  const current = (epoch: number, identity: number) =>
    epoch === generation && identity === currentIdentityEpoch() && canManage.value
  async function locate() {
    if (busy.value || !projectInfo.value || !canManage.value) return
    const epoch = generation,
      identity = currentIdentityEpoch()
    busy.value = true
    notice.value = ''
    hide()
    try {
      const value = await readDeviceLocationCode(props.projectId, props.deviceId)
      if (!current(epoch, identity)) return
      payload.value = devicePurposeCode(projectInfo.value, address.value, props.deviceId, value)
      purpose.value = 'LOCATE'
    } catch {
      if (current(epoch, identity)) notice.value = '定位码不可用，请核对平台地址和当前设备权限。'
    } finally {
      if (current(epoch, identity)) busy.value = false
    }
  }
  async function issue() {
    if (
      busy.value ||
      !canManage.value ||
      projectInfo.value?.status !== 'ACTIVE' ||
      props.primaryKnown ||
      codeId.value
    )
      return
    const epoch = generation,
      identity = currentIdentityEpoch()
    busy.value = true
    notice.value = ''
    hide()
    try {
      devicePurposeOrigin(projectInfo.value, address.value)
      try {
        await ElMessageBox.confirm(
          '有效项目用户扫码确认后将成为设备主控。能力仅本次响应可见，结果未知不自动补签；关闭不撤销，旧令牌不会因本次签发自动失效。',
          '确认签发认领令牌',
          { customClass: 'console-studio-feedback', type: 'warning' }
        )
      } catch {
        return
      }
      if (!current(epoch, identity) || props.primaryKnown || projectInfo.value?.status !== 'ACTIVE')
        return
      const result = await issueDeviceClaimCode(props.projectId, props.deviceId)
      if (!current(epoch, identity)) return
      payload.value = devicePurposeCode(projectInfo.value, address.value, props.deviceId, result)
      token.value = result.token
      codeId.value = result.codeId
      expiresAt.value = result.expiresAt
      purpose.value = 'CLAIM'
      timer = setTimeout(clear, Math.min(Date.parse(result.expiresAt) - Date.now(), 600_000))
    } catch {
      if (current(epoch, identity)) {
        hide()
        notice.value = '签发结果未确认或输入无效，不自动重发；请先核对设备关系，无法回查原明文。'
      }
    } finally {
      if (current(epoch, identity)) busy.value = false
    }
  }
  async function revoke() {
    if (busy.value || !codeId.value || !canManage.value || projectInfo.value?.status !== 'ACTIVE')
      return
    const epoch = generation,
      identity = currentIdentityEpoch(),
      id = codeId.value
    busy.value = true
    notice.value = ''
    try {
      try {
        await ElMessageBox.confirm(
          '仅撤销本次未消费认领码，不会解除已认领设备的主控关系。',
          '确认撤销认领码',
          { customClass: 'console-studio-feedback', type: 'warning' }
        )
      } catch {
        return
      }
      if (!current(epoch, identity)) return
      await revokeDeviceClaimCode(props.projectId, props.deviceId, id)
      if (current(epoch, identity)) {
        clear()
        notice.value = '本次未消费认领码已撤销，设备关系未改变。'
      }
    } catch {
      if (current(epoch, identity)) {
        hide()
        notice.value = '撤销未确认或该码已消费，未解除设备关系；可重新核对。'
      }
    } finally {
      if (current(epoch, identity)) busy.value = false
    }
  }
  watch(
    () => [
      props.projectId,
      props.deviceId,
      props.primaryKnown,
      user.info.currentProjectId,
      user.info.userId,
      user.info.tenantId,
      currentIdentityEpoch(),
      canManage.value
    ],
    async () => {
      const epoch = ++generation
      clear()
      busy.value = false
      notice.value = ''
      projectInfo.value = undefined
      if (!canManage.value || !props.deviceId) return
      try {
        const result = await fetchProjects()
        if (epoch === generation)
          projectInfo.value = result.find((project) => project.id === props.projectId)
      } catch {
        if (epoch === generation) notice.value = '项目资格读取失败，暂时不能生成用途码。'
      }
    },
    { immediate: true, flush: 'sync' }
  )
  watch(address, hide)
  onBeforeUnmount(() => {
    generation++
    clear()
  })
</script>
<style scoped>
  .device-claim-token__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin: 10px 0;
  }
</style>
