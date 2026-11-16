<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { JsonEditorEngine } from './json-code-editor-engine'

const props = withDefaults(defineProps<{
  modelValue: string; ariaLabel: string; height?: number; disabled?: boolean; readonly?: boolean
}>(), { height: 200, disabled: false, readonly: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const host = ref<HTMLElement>(), ready = ref(false), failed = ref(false)
let engine: JsonEditorEngine | undefined, live = true, generation = 0
const options = () => ({ ariaLabel: props.ariaLabel, disabled: props.disabled, readonly: props.readonly })
async function load() {
  const current = ++generation
  failed.value = false
  try {
    const { createJsonEditor } = await import('./json-code-editor-engine')
    if (!live || current !== generation || !host.value) return
    engine = createJsonEditor(host.value, props.modelValue, options(), value => {
      if (live && current === generation && !props.disabled && !props.readonly) emit('update:modelValue', value)
    })
    ready.value = true
    await nextTick()
    if (live && current === generation) engine?.measure()
  } catch {
    if (live && current === generation) failed.value = true
  }
}
watch(() => props.modelValue, value => engine?.setValue(value))
watch(() => [props.disabled, props.readonly, props.ariaLabel], () => engine?.configure(options()))
onMounted(load)
onBeforeUnmount(() => { live = false; ++generation; engine?.destroy(); engine = undefined })
</script>
<template>
  <div class="tl-json-editor" :class="{ 'is-disabled': disabled }" :style="{ height: `${height}px` }">
    <div v-show="ready" ref="host" class="tl-json-editor__host" />
    <textarea v-if="!ready" class="tl-json-editor__fallback" :value="modelValue" :aria-label="ariaLabel" spellcheck="false" :disabled="disabled" :readonly="readonly" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" />
    <div v-if="failed" class="tl-json-editor__error" role="alert">编辑器加载失败，输入内容已保留。<button type="button" @click="load">重新加载</button></div>
  </div>
</template>
<style scoped>
.tl-json-editor { position: relative; width: 100%; min-width: 0; background: #272822; color: #f8f8f2; }
.tl-json-editor__host { height: 100%; min-width: 0; }
.tl-json-editor__fallback { width: 100%; height: 100%; resize: none; border: 0; border-radius: 0; outline: none; padding: 2px 8px; background: #272822; color: #f8f8f2; font: 12px/1.5 Monaco, Menlo, Consolas, monospace; }
.tl-json-editor__error { position: absolute; bottom: 0; left: 0; right: 0; padding: 4px 8px; background: #272822; color: #e6db74; font-size: 12px; }
.tl-json-editor__error button { color: #8ac4ff; background: none; border: 0; padding: 0 4px; cursor: pointer; font: inherit; }
.tl-json-editor.is-disabled { opacity: .65; }
</style>
