<template>
  <section class="sms-recipient-editor" :aria-label="title">
    <h4>{{ title }}</h4>
    <p v-if="!allowed" class="console-description">仅当前项目所有者或管理员可以维护接收人。</p>
    <template v-else>
      <ElAlert
        v-if="notice"
        :title="notice"
        :type="failed ? 'warning' : 'success'"
        :closable="false"
        show-icon
      />
      <ElAlert
        v-if="saved && !saved.providerConfigured"
        title="平台尚未配置此类短信发送，当前不会外发；可以先保存接收设置。"
        type="info"
        :closable="false"
        show-icon
      />
      <ElForm label-position="top" @submit.prevent="save">
        <ElFormItem label="短信接收号码">
          <ElInput
            :model-value="phone"
            :aria-label="`${title}号码`"
            :disabled="!editable"
            maxlength="16"
            placeholder="例如 +8613800000000；留空清除"
            autocomplete="off"
            @update:model-value="changePhone"
          />
        </ElFormItem>
        <ElCheckbox v-model="enabled" :disabled="!editable || !phone"
          >启用本用途短信接收</ElCheckbox
        >
        <ElCheckbox v-model="confirmed" :disabled="!editable || !phone"
          >我确认有权将此号码用于本用途通知</ElCheckbox
        >
        <p class="console-description"
          >用途确认不代表已验证手机持有权。保存配置不会发送测试短信，也不会补发历史提醒。</p
        >
        <p v-if="saved && !saved.writable">当前配置只读，不能修改接收号码。</p>
        <p v-if="!valid">请填写大陆 +86 手机号码；启用时须确认用途，清空号码时须关闭。</p>
        <div class="console-actions">
          <ElButton
            type="primary"
            :disabled="!editable || !dirty || !valid"
            :loading="saving"
            @click="save"
            >保存接收设置</ElButton
          >
          <ElButton :disabled="loading || saving" :loading="loading" @click="load"
            >重新读取</ElButton
          >
        </div>
      </ElForm>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { useUserStore } from '@/store/modules/user'
  import { currentIdentityEpoch } from '@/utils/http/identity-scope'
  import {
    readSmsRecipient,
    updateSmsRecipient,
    type SmsRecipientConfiguration,
    type SmsRecipientPurpose
  } from '@/api/sms-recipients'

  const props = defineProps<{ purpose: SmsRecipientPurpose; projectId?: string }>()
  const user = useUserStore()
  const title = computed(
    () =>
      ({
        QUOTA_WARNING: '套餐额度预警',
        SUBSCRIPTION_EXPIRING: '套餐临近到期提醒',
        DEVICE_ALARM: '设备告警短信接收人'
      })[props.purpose]
  )
  const allowed = computed(
    () =>
      props.purpose !== 'DEVICE_ALARM' ||
      (!!props.projectId &&
        props.projectId === user.info.currentProjectId &&
        (user.info.roles || []).some((r) => r === 'OWNER' || r === 'ADMIN'))
  )
  const phone = ref(''),
    enabled = ref(false),
    confirmed = ref(false),
    notice = ref('')
  const loading = ref(false),
    saving = ref(false),
    failed = ref(false)
  const saved = ref<SmsRecipientConfiguration>()
  let generation = 0
  const editable = computed(
    () => allowed.value && !!saved.value?.writable && !loading.value && !saving.value
  )
  const valid = computed(
    () =>
      (!phone.value || /^\+861[3-9]\d{9}$/.test(phone.value)) &&
      (!enabled.value || (!!phone.value && confirmed.value)) &&
      (!confirmed.value || !!phone.value)
  )
  const dirty = computed(
    () =>
      !!saved.value &&
      (phone.value !== (saved.value.phoneNumber ?? '') ||
        enabled.value !== saved.value.enabled ||
        confirmed.value !== saved.value.confirmed)
  )
  function changePhone(value: string) {
    phone.value = value
    confirmed.value = false
    if (!value) enabled.value = false
  }
  function apply(value: SmsRecipientConfiguration) {
    if (
      value.purpose !== props.purpose ||
      typeof value.revision !== 'string' ||
      !/^(0|[1-9][0-9]{0,18})$/.test(value.revision) ||
      BigInt(value.revision) > 9223372036854775807n ||
      !('phoneNumber' in value) ||
      (value.phoneNumber !== null &&
        (typeof value.phoneNumber !== 'string' || !/^\+[1-9]\d{6,14}$/.test(value.phoneNumber))) ||
      [value.enabled, value.confirmed, value.writable, value.providerConfigured].some(
        (v) => typeof v !== 'boolean'
      )
    )
      throw new Error('配置响应不完整')
    saved.value = value
    phone.value = value.phoneNumber ?? ''
    enabled.value = value.enabled
    confirmed.value = value.confirmed
  }
  async function load() {
    const current = ++generation,
      identity = currentIdentityEpoch()
    saved.value = undefined
    phone.value = ''
    enabled.value = false
    confirmed.value = false
    notice.value = ''
    saving.value = false
    failed.value = false
    loading.value = false
    if (!allowed.value) return
    loading.value = true
    try {
      const value = await readSmsRecipient(props.purpose, props.projectId)
      if (current !== generation || identity !== currentIdentityEpoch()) return
      apply(value)
    } catch {
      if (current === generation && identity === currentIdentityEpoch()) {
        failed.value = true
        notice.value = '无法读取接收设置，请重新读取。'
      }
    } finally {
      if (current === generation && identity === currentIdentityEpoch()) loading.value = false
    }
  }
  async function save() {
    if (!editable.value || !dirty.value || !valid.value || !saved.value) return
    const current = generation,
      identity = currentIdentityEpoch()
    saving.value = true
    failed.value = false
    notice.value = ''
    try {
      const value = await updateSmsRecipient(props.purpose, props.projectId, {
        phoneNumber: phone.value || null,
        enabled: enabled.value,
        confirmed: confirmed.value,
        expectedRevision: saved.value.revision
      })
      if (current !== generation || identity !== currentIdentityEpoch()) return
      apply(value)
      notice.value = '接收设置已保存，未发送测试短信。'
    } catch {
      if (current === generation && identity === currentIdentityEpoch()) {
        saved.value = undefined
        failed.value = true
        notice.value = '保存未确认或配置已变化，请重新读取后核对；不会自动重发保存请求。'
      }
    } finally {
      if (current === generation && identity === currentIdentityEpoch()) saving.value = false
    }
  }
  watch(
    () => [
      props.purpose,
      props.projectId,
      user.info.userId,
      user.info.tenantId,
      user.info.currentProjectId,
      ...(user.info.roles || []),
      currentIdentityEpoch()
    ],
    load,
    { immediate: true, flush: 'sync' }
  )
  onBeforeUnmount(() => {
    generation++
  })
</script>

<style lang="scss" scoped>
  .sms-recipient-editor {
    min-width: 0;
    padding: 10px 0;
    h4 {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 500;
    }
    :deep(.el-alert) {
      margin-bottom: 10px;
    }
    :deep(.el-checkbox) {
      display: flex;
      width: fit-content;
      height: auto;
      margin: 8px 0;
    }
    :deep(.el-checkbox__label) {
      white-space: normal;
    }
    .console-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .console-actions :deep(.el-button + .el-button) {
      margin-left: 0;
    }
  }
</style>
