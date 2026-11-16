<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Task, TaskWrite } from './models'
import { taskEditor } from './models'
import { errorMessage } from '@/core/http'
const props = defineProps<{ modelValue: boolean; task?: Task; busy?: boolean; locked?: boolean; error?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; save: [body: TaskWrite] }>()
const draft = ref<TaskWrite>(), localError = ref('')
watch([() => props.modelValue, () => props.task?.id], () => {
  draft.value = undefined; localError.value = ''
  if (props.modelValue && props.task) try { draft.value = taskEditor(props.task) } catch (e) { localError.value = errorMessage(e) }
}, { immediate: true })
function close() { if (!props.busy) { draft.value = undefined; emit('update:modelValue', false) } }
function save() {
  if (props.busy || props.locked || !draft.value) return
  if (!draft.value.name?.trim() || draft.value.name.length > 128 || (draft.value.description?.length || 0) > 512) { localError.value = '请填写任务名称（最多128字符），描述最多512字符'; return }
  emit('save', { ...draft.value })
}
</script>
<template><el-dialog :model-value="modelValue" title="修改任务信息" width="560px" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @update:model-value="close">
  <el-form v-if="draft" label-position="top" class="tl-form"><el-form-item label="任务名称"><el-input v-model="draft.name" maxlength="128" /></el-form-item><el-form-item label="任务描述"><el-input v-model="draft.description" type="textarea" maxlength="512" :rows="3" /></el-form-item></el-form>
  <el-alert v-if="localError || error" :title="localError || error" type="error" :closable="false" />
  <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" :loading="busy" :disabled="locked || !draft" @click="save">保存</el-button></template>
</el-dialog></template>
