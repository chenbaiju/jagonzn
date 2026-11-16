<script setup lang="ts">
import {showOperationFeedback} from '@/ui/operation-feedback'
import { onMounted, onScopeDispose, ref, watch } from 'vue'
import { ApiError, api, errorMessage, onIdentityChange } from '@/core/http'
import type { Schema } from '@/core/contracts'
import { projectId, session } from '@/core/session'

const props = defineProps<{ typeId: string; disabled: boolean; allowed: boolean }>()
const emit = defineEmits<{ locked: [value: boolean] }>()
type Registration = Schema<'DeviceEnrollmentAdmissionResponse'>
type AdmissionWrite = Schema<'ImportDeviceEnrollmentSerialsRequest'> | Schema<'ChangeDeviceEnrollmentAdmissionRequest'>
const shown = ref(false)
const busy = ref(false)
const changing = ref(false)
const counts = ref<Registration>()
const draft = ref('')
const error = ref('')
let request: AbortController | undefined

function reset() {
  request?.abort()
  request = undefined
  busy.value = false
  changing.value = false
  counts.value = undefined
  close()
}

function close() {
  shown.value = false
  draft.value = ''
  error.value = ''
}

watch(() => shown.value || changing.value, value => emit('locked', value), { flush: 'sync' })
watch([projectId, () => props.typeId, () => props.allowed, () => session.user?.accountId], reset, { flush: 'sync' })
const unsubscribe = onIdentityChange(reset)
onScopeDispose(() => { reset(); unsubscribe() })
onMounted(() => void load())

function serialNumbers() {
  const lines = draft.value.split(/\r\n|\n|\r/).filter(line => line !== '')
  if (!lines.length || lines.length > 500) throw new Error('每批请输入 1 至 500 个序列号。')
  if (lines.some(line => !line.trim() || line !== line.trim() || [...line].length > 128
      || /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(line))) {
    throw new Error('每行一个序列号，最多 128 个字符，请去掉首尾空格和控制字符。')
  }
  return lines
}

async function load(body?: AdmissionWrite) {
  const policy = body && 'enabled' in body
  if (busy.value || !props.allowed || (body && props.disabled) || (body && !policy && !shown.value)) return
  const typeId = props.typeId
  const path = `/api/v1/projects/${projectId.value}/device-types/${typeId}/enrollment-admission` as const
  const operation = new AbortController()
  request = operation
  busy.value = true
  changing.value = !!policy
  error.value = ''
  try {
    const options = { signal: operation.signal, maxResponseBytes: 8 * 1024 }
    const result = body
      ? await api<Registration>(policy ? `${path}/policy` : path, { ...options, method: 'put', body })
      : await api<Registration>(path, options)
    if (request !== operation) return
    if (result?.deviceTypeId !== typeId || !Number.isSafeInteger(result.total) || !Number.isSafeInteger(result.pending)
        || result.pending < 0 || result.total < result.pending
        || typeof result.enabled !== 'boolean' || typeof result.canEnable !== 'boolean'
        || (policy && result.enabled !== body.enabled)) throw new Error('名单回执不完整')
    counts.value = result
    if (policy) {
      showOperationFeedback(result.enabled ? '设备白名单已开启' : '设备白名单已关闭')
    } else if (body) {
      draft.value = ''
      showOperationFeedback('序列号已导入')
    }
  } catch (cause) {
    if (request !== operation) return
    if (!body || policy) counts.value = undefined
    if (body && (!(cause instanceof ApiError) || cause.outcomeUnknown || cause.status >= 500)) {
      error.value = policy
        ? '开关修改结果尚未确认，请重新读取当前状态。'
        : '导入结果尚未确认。原批次已保留，请先读取当前名单统计。'
      counts.value = undefined
    } else {
      error.value = errorMessage(cause)
    }
  } finally {
    if (request === operation) {
      request = undefined
      busy.value = false
      changing.value = false
    }
  }
}

function open() {
  if (props.disabled || !props.allowed || !counts.value?.enabled || !counts.value.canEnable) return
  shown.value = true
  void load()
}

function changeEnabled(enabled: boolean) {
  if (!counts.value || enabled === counts.value.enabled || (enabled && !counts.value.canEnable)) return
  void load({ enabled })
}

function submit() {
  if (!counts.value?.enabled || !counts.value.canEnable || busy.value) return
  try { void load({ serialNumbers: serialNumbers() }) }
  catch (cause) { error.value = errorMessage(cause) }
}

function beforeClose(done: () => void) {
  if (!busy.value) { close(); done() }
}
</script>

<template>
  <div v-if="allowed" class="enrollment-admission">
    <div class="enrollment-controls">
      <el-switch v-if="counts" :model-value="counts.enabled" :loading="changing"
        :disabled="disabled || busy || (!counts.canEnable && !counts.enabled)"
        aria-label="启用设备白名单" @change="changeEnabled($event === true)" />
      <span v-else-if="busy" role="status">正在读取白名单状态</span>
      <el-button v-else size="small" :disabled="disabled" @click="load()">重新读取白名单状态</el-button>
      <el-button v-if="counts?.enabled && counts.canEnable" size="small" class="enrollment-import"
        :disabled="disabled || busy" @click="open">导入序列号</el-button>
    </div>
    <p v-if="counts && !counts.canEnable" class="enrollment-hint">开启设备白名单和导入序列号需要有效付费订阅。</p>
    <p v-if="error && !shown" class="enrollment-hint" role="alert">{{ error }}</p>
    <el-dialog :model-value="shown" title="导入设备序列号" width="min(500px, 94vw)"
      class="type-settings-dialog" append-to-body :close-on-click-modal="false" :show-close="!busy" :before-close="beforeClose">
      <p v-if="counts">
        {{ `已导入 ${counts.total} 个，待首启 ${counts.pending} 个。` }}
      </p>
      <p v-if="counts && (!counts.enabled || !counts.canEnable)">请关闭此弹窗并检查白名单开关和套餐。</p>
      <p>名单首启使用取证书接口，由设备提交项目密钥、TypeKey 和序列号。「允许设备自动创建」关闭时暂停首启注册。</p>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-form label-position="top" :disabled="busy">
        <el-form-item label="序列号">
          <el-input v-model="draft" type="textarea" :rows="8" :maxlength="130000" resize="vertical"
            aria-label="序列号" placeholder="每行粘贴一个序列号，每批最多 500 个" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="busy" @click="close">关闭</el-button>
        <el-button v-if="!counts" :loading="busy" @click="load()">读取名单统计</el-button>
        <el-button v-else type="primary" :loading="busy"
          :disabled="!draft || disabled || !counts.enabled || !counts.canEnable" @click="submit">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.enrollment-admission { width: 100%; }
.enrollment-controls { display: flex; align-items: center; gap: 12px; }
.enrollment-import { margin-inline-start: auto; }
.enrollment-hint { margin: 4px 0 0; color: var(--el-text-color-secondary); line-height: 18px; }
</style>
