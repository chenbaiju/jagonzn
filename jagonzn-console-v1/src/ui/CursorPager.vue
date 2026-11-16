<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{
  page: number; hasNext?: boolean; loading?: boolean; limit?: number;
  total?: string; sizes?: readonly number[]; showSizes?: boolean; showPages?: boolean; grouped?: boolean;
}>(), { limit: 24, sizes: () => [24, 48, 72, 96], showSizes: true, showPages: true, grouped: false })
const emit = defineEmits<{ previous: []; next: []; 'update:limit': [value: number]; 'update:page': [value: number] }>()
const count = computed(() => props.total !== undefined && /^(0|[1-9]\d{0,18})$/.test(props.total) ? BigInt(props.total) : undefined)
const invalid = computed(() => !Number.isSafeInteger(props.page) || props.page < 1 || !Number.isSafeInteger(props.limit) || props.limit < 1 || (props.total !== undefined && count.value === undefined))
const pageCount = computed(() => count.value === undefined || invalid.value ? undefined : ((count.value + BigInt(props.limit) - 1n) / BigInt(props.limit) || 1n))
const pages = computed(() => {
  const current = BigInt(Number.isSafeInteger(props.page) && props.page > 0 ? props.page : 1), last = pageCount.value
  if (last === undefined) return [current.toString()]
  const values = new Set<bigint>([1n, last])
  const start = last <= 7n || current <= 4n ? 1n : current >= last - 3n ? last - 4n : current - 1n
  const end = last <= 7n ? last : current <= 4n ? 5n : current >= last - 3n ? last : current + 1n
  for (let value = start; value <= end && value <= last; value++) if (value > 0n) values.add(value)
  const ordered = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0), result: (string | null)[] = []
  ordered.forEach((value, index) => { if (index && value - ordered[index - 1] > 1n) result.push(null); result.push(value.toString()) })
  return result
})
const canNext = computed(() => !invalid.value && props.page < Number.MAX_SAFE_INTEGER && (pageCount.value === undefined ? props.hasNext : BigInt(props.page) < pageCount.value))
function selectPage(value: string) {
  const number = Number(value)
  if (!props.loading && !invalid.value && Number.isSafeInteger(number) && number > 0 && number !== props.page) emit('update:page', number)
}
function previous() { if (!props.loading && !invalid.value && props.page > 1) { emit('previous'); emit('update:page', props.page - 1) } }
function next() { if (!props.loading && canNext.value) { emit('next'); emit('update:page', props.page + 1) } }
</script>
<template>
  <nav class="tl-pager" :class="{ 'tl-pager--grouped': grouped }" aria-label="分页">
    <template v-if="grouped">
      <div class="tl-pager__navigation">
        <el-button size="small" :disabled="page <= 1 || loading || invalid" aria-label="上一页" @click="previous">‹</el-button>
        <template v-for="(value, index) in showPages ? pages : []" :key="value ?? `gap-${index}`">
          <span v-if="value === null" class="tl-pager__gap" aria-hidden="true">…</span>
          <button v-else type="button" class="tl-pager__page" :class="{ 'is-current': value === String(page) }" :aria-label="`第 ${value} 页`" :aria-current="value === String(page) ? 'page' : undefined" :disabled="loading || invalid || BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)" @click="selectPage(value)">{{ value }}</button>
        </template>
        <el-button size="small" :disabled="!canNext || loading" aria-label="下一页" @click="next">›</el-button>
      </div>
      <span v-if="showSizes" class="tl-pager__sizes"><el-select :model-value="limit" size="small" aria-label="每页数量" style="width: 74px" :disabled="loading || invalid" @update:model-value="$emit('update:limit', $event)"><el-option v-for="n in sizes" :key="n" :value="n" :label="String(n)" /></el-select><span class="tl-pager__size-label">个 / 页</span></span>
    </template>
    <template v-else>
    <el-button size="small" :disabled="page <= 1 || loading || invalid" aria-label="上一页" @click="previous">‹</el-button>
    <template v-for="(value, index) in showPages ? pages : []" :key="value ?? `gap-${index}`">
      <span v-if="value === null" class="tl-pager__gap" aria-hidden="true">…</span>
      <button v-else type="button" class="tl-pager__page" :class="{ 'is-current': value === String(page) }" :aria-label="`第 ${value} 页`" :aria-current="value === String(page) ? 'page' : undefined" :disabled="loading || invalid || BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)" @click="selectPage(value)">{{ value }}</button>
    </template>
    <el-button size="small" :disabled="!canNext || loading" aria-label="下一页" @click="next">›</el-button>
    <template v-if="showSizes">
      <el-select :model-value="limit" size="small" aria-label="每页数量" style="width: 74px" :disabled="loading || invalid" @update:model-value="$emit('update:limit', $event)"><el-option v-for="n in sizes" :key="n" :value="n" :label="String(n)" /></el-select>
      <span>个 / 页</span>
    </template>
    </template>
    <span v-if="invalid" role="alert">分页数量无效，请刷新后重试</span>
  </nav>
</template>
<style scoped>
.tl-pager { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 28px 0; font-size: 12px; }
.tl-pager__page { display: grid; place-items: center; min-width: 30px; height: 30px; padding: 0 6px; color: var(--tl-text); background: var(--tl-fill); border: 0; border-radius: 2px; cursor: pointer; }
.tl-pager__page:hover { color: var(--tl-primary); }.tl-pager__page.is-current { color: #fff; background: var(--tl-primary); }
.tl-pager__page:disabled { cursor: not-allowed; }.tl-pager__gap { color: var(--tl-muted); }.tl-pager .el-button + .el-button { margin-left: 0; }
</style>
