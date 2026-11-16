<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { formatTime } from '@/core/time'
import { onIdentityChange } from '@/core/http'
/** 仅为图表视图模型，不是服务端DTO；实际接口必须经生成合同适配。 */
const props = defineProps<{ points: { time: string; values: readonly (number | null)[] }[]; labels: readonly string[]; totalHeight?: number; horizontalInsets?: { left: number; right: number } }>()
const colors = ['#409eff', '#67c4c5']
const valid = computed(() => [1, 2].includes(props.labels.length) && props.points.every(p => /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(p.time) && Number.isFinite(Date.parse(p.time)) && p.values.length === props.labels.length && p.values.every(v => v === null || (Number.isSafeInteger(v) && v >= 0))))
const ceiling = computed(() => Math.max(100, ...props.points.flatMap(p => p.values.filter((v): v is number => v !== null))))
const viewport = ref({ width: 1000, height: 230 })
const fixedHeight = computed(() => props.totalHeight !== undefined)
const plot = computed(() => { const left = props.horizontalInsets?.left ?? 48, right = props.horizontalInsets?.right ?? 42; return { left, right: Math.max(left, viewport.value.width - right), top: 32, bottom: Math.max(32, viewport.value.height - 38) } })
const plotWidth = computed(() => plot.value.right - plot.value.left), plotHeight = computed(() => plot.value.bottom - plot.value.top)
const x = (index: number) => plot.value.left + index * plotWidth.value / Math.max(1, props.points.length - 1)
const y = (value: number) => plot.value.bottom - value * plotHeight.value / ceiling.value
type PlotPoint = { x: number; y: number }
const seriesSegments = computed(() => props.labels.map((_, series) => {
  const segments: PlotPoint[][] = []; let current: PlotPoint[] = []
  for (let i = 0; i < props.points.length; i++) {
    const value = props.points[i].values[series]
    if (value === null) { if (current.length) segments.push(current); current = []; continue }
    current.push({ x: x(i), y: y(value) })
  }
  if (current.length) segments.push(current)
  return segments
}))
const lines = computed(() => seriesSegments.value.map(segments => segments.map(points => points.map(point => `${point.x},${point.y}`).join(' '))))
/** 原0.3张力的相邻距离控制点；NULL已分段，不跨缺口取邻点。 */
function spline(points: readonly PlotPoint[]) {
  const cap = (point: PlotPoint): PlotPoint => ({ x: Math.max(plot.value.left, Math.min(plot.value.right, point.x)), y: Math.max(plot.value.top, Math.min(plot.value.bottom, point.y)) })
  const controls = points.map((point, index) => {
    const before = points[index - 1] ?? point, after = points[index + 1] ?? point
    const left = Math.hypot(point.x - before.x, point.y - before.y), right = Math.hypot(after.x - point.x, after.y - point.y), total = left + right
    const previous = total ? .3 * left / total : 0, next = total ? .3 * right / total : 0
    return { previous: cap({ x: point.x - previous * (after.x - before.x), y: point.y - previous * (after.y - before.y) }), next: cap({ x: point.x + next * (after.x - before.x), y: point.y + next * (after.y - before.y) }) }
  })
  let path = `M${points[0]!.x},${points[0]!.y}`
  for (let index = 1; index < points.length; index++) {
    const from = controls[index - 1]!.next, to = controls[index]!.previous, point = points[index]!
    path += ` C${from.x},${from.y} ${to.x},${to.y} ${point.x},${point.y}`
  }
  return path
}
const curves = computed(() => fixedHeight.value ? seriesSegments.value.map(segments => segments.map(spline)) : [])
const ticks = computed(() => [...new Set(Array.from({ length: Math.min(7, props.points.length) }, (_, i) => Math.round(i * (props.points.length - 1) / Math.max(1, Math.min(7, props.points.length) - 1))))])
function label(time: string) { const value = formatTime(time); return value === '—' ? value : `${value.slice(5, 10)} ${value.slice(11, 16)}` }
const figure = ref<HTMLElement>(), canvas = ref<SVGSVGElement>(), tooltipElement = ref<HTMLElement>()
const hover = ref<{ index: number; left: number; top: number; scale: number; highlight: number | null } | null>(null)
let revision = 0
function clearHover() { revision++; hover.value = null }
const band = computed(() => {
  if (!hover.value) return null
  const half = props.points.length > 1 ? plotWidth.value / (props.points.length - 1) / 2 : plotWidth.value
  const left = Math.max(plot.value.left, x(hover.value.index) - half), right = Math.min(plot.value.right, x(hover.value.index) + half)
  return { left, width: right - left }
})
async function pointAt(clientX: number, clientY: number) {
  const svg = canvas.value, parent = figure.value
  if (!svg || !parent || !valid.value || !props.points.length || !plotWidth.value || !plotHeight.value) return clearHover()
  const rect = svg.getBoundingClientRect(), parentRect = parent.getBoundingClientRect()
  // 规则viewBox采用真实视口；任务保旧比例，仍正确排除默认meet留白。
  const scale = Math.min(rect.width / viewport.value.width, rect.height / viewport.value.height)
  if (!(scale > 0)) return clearHover()
  const offsetX = (rect.width - viewport.value.width * scale) / 2, offsetY = (rect.height - viewport.value.height * scale) / 2
  const px = (clientX - rect.left - offsetX) / scale, py = (clientY - rect.top - offsetY) / scale
  if (px < plot.value.left || px > plot.value.right || py < plot.value.top || py > plot.value.bottom) return clearHover()
  const index = Math.round((px - plot.value.left) * Math.max(0, props.points.length - 1) / plotWidth.value)
  const values = props.points[index]!.values
  const available = values.flatMap((value, series) => value === null ? [] : [{ value, series }])
  if (!available.length) return clearHover()
  let nearest: number | null = null, distance = Infinity
  for (const item of available) {
    const candidate = Math.hypot((px - x(index)) * scale, (py - y(item.value)) * scale)
    // 原pointRadius=0/hitRadius=1；已高亮点的半径4加命中留白1。
    const radius = hover.value?.index === index && hover.value.highlight === item.series ? 5 : 1
    if (candidate < radius && candidate < distance) { nearest = item.series; distance = candidate }
  }
  const current = ++revision
  hover.value = { index, scale, highlight: nearest,
    left: rect.left - parentRect.left + offsetX + x(index) * scale,
    top: rect.top - parentRect.top + offsetY + available.reduce((sum, item) => sum + y(item.value), 0) / available.length * scale }
  await nextTick()
  if (current !== revision || !hover.value || !tooltipElement.value) return
  const tooltip = tooltipElement.value.getBoundingClientRect()
  const shift = tooltip.left < 4 ? 4 - tooltip.left : tooltip.right > window.innerWidth - 4 ? window.innerWidth - 4 - tooltip.right : 0
  hover.value.left += shift
}
function mouse(event: MouseEvent) { void pointAt(event.clientX, event.clientY) }
function touch(event: TouchEvent) { const item = event.touches[0]; if (item) void pointAt(item.clientX, item.clientY) }
function leave(event: MouseEvent) { if (!(event.relatedTarget instanceof Node) || !canvas.value?.contains(event.relatedTarget)) clearHover() }
watch(() => [props.points, props.labels], clearHover, { deep: true, flush: 'sync' })
let observer: ResizeObserver | undefined
function measureViewport() {
  if (!fixedHeight.value || !canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0 && (rect.width !== viewport.value.width || rect.height !== viewport.value.height)) {
    clearHover(); viewport.value = { width: rect.width, height: rect.height }
  }
}
watch([canvas, () => props.totalHeight], ([element]) => {
  observer?.disconnect(); observer = undefined; clearHover()
  viewport.value = { width: 1000, height: 230 }
  if (!element || !fixedHeight.value) return
  measureViewport()
  if (typeof ResizeObserver !== 'undefined') {
    const current = new ResizeObserver(() => { if (observer === current && canvas.value === element) measureViewport() })
    observer = current; current.observe(element)
  }
}, { flush: 'post' })
function resized() { clearHover(); measureViewport() }
const removeIdentityListener = onIdentityChange(clearHover)
window.addEventListener('resize', resized)
onBeforeUnmount(() => { clearHover(); observer?.disconnect(); observer = undefined; removeIdentityListener(); window.removeEventListener('resize', resized) })
</script>
<template>
  <div v-if="!valid" role="alert">统计数据无法显示，请重新读取</div>
  <el-empty v-else-if="!points.length" description="暂无统计数据" />
  <figure v-else ref="figure" class="usage-chart" :class="{ 'fixed-geometry': fixedHeight }" :style="{ height: totalHeight === undefined ? undefined : `${totalHeight}px` }" :aria-label="labels.join('、')">
    <svg ref="canvas" :viewBox="`0 0 ${viewport.width} ${viewport.height}`" role="img" :aria-label="labels.join('、')" @mousemove="mouse" @click="mouse" @mouseout="leave" @touchstart="touch" @touchmove="touch">
      <rect v-if="band" class="hover-band" :x="band.left" :y="plot.top" :width="band.width" :height="plotHeight" fill="rgba(19, 33, 68, 0.045)" />
      <g v-for="step in [0,1,2,3,4,5]" :key="step"><line :x1="plot.left" :x2="plot.right" :y1="y(step * ceiling / 5)" :y2="y(step * ceiling / 5)" stroke="#f0f2f5" /><text :x="plot.left - 12" :y="y(step * ceiling / 5) + 4" text-anchor="end">{{ Math.round(step * ceiling / 5) }}</text></g>
      <g v-for="(segments, series) in fixedHeight ? curves : lines" :key="series"><template v-if="fixedHeight"><path v-for="(segment, index) in segments" :key="index" :d="segment" fill="none" :stroke="colors[series]" stroke-width="1.5" :data-series="series" /></template><template v-else><polyline v-for="(segment, index) in segments" :key="index" :points="segment" fill="none" :stroke="colors[series]" stroke-width="1.5" :data-series="series" /></template></g>
      <circle v-if="hover && hover.highlight !== null" class="hover-point" :cx="x(hover.index)" :cy="y(points[hover.index]!.values[hover.highlight]!)" :r="4 / hover.scale" fill="#ffffff" :stroke="colors[hover.highlight]" stroke-width="2" vector-effect="non-scaling-stroke" />
      <text v-for="index in ticks" :key="index" :x="x(index)" :y="viewport.height - 18" text-anchor="middle">{{ label(points[index].time) }}</text>
    </svg>
    <div ref="tooltipElement" class="stat-chart-tooltip" role="tooltip" :style="{ left: `${hover?.left ?? 0}px`, top: `${hover?.top ?? 0}px`, opacity: hover ? 1 : 0 }">
      <template v-if="hover"><div class="tooltip-title">{{ label(points[hover.index]!.time) }}</div><div v-for="(name, series) in labels" :key="name" class="tooltip-row"><span class="tooltip-dot" :style="{ background: colors[series] }" /><span class="tooltip-label">{{ name }}</span><span class="tooltip-value">{{ points[hover.index]!.values[series] === null ? '未统计' : points[hover.index]!.values[series] }}</span></div></template>
    </div>
    <figcaption><span v-for="(name, index) in labels" :key="name"><i :style="{ background: colors[index] }" />{{ name }}</span></figcaption>
  </figure>
</template>
<style scoped>
.usage-chart { margin: 0; width: 100%; position: relative; }
svg { width: 100%; display: block; min-height: 220px; }
.fixed-geometry { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-width: 0; }
.fixed-geometry svg { height: 100%; min-height: 0; min-width: 0; }
text { font-size: 10px; fill: #a8abb2; }
figcaption { display: flex; justify-content: center; gap: 18px; font-size: 12px; color: #909399; }
figcaption span { display: inline-flex; align-items: center; gap: 6px; }
i { width: 10px; height: 10px; border-radius: 50%; }
.stat-chart-tooltip { position: absolute; min-width: 140px; background: #ffffff; border: 1px solid #e7eaf3; border-radius: 8px; box-shadow: 0 6px 20px rgba(19, 33, 68, 0.12); padding: 10px 14px; pointer-events: none; z-index: 100; opacity: 0; transition: opacity .15s ease; font-size: 12px; line-height: 1.7; transform: translate(-50%, calc(-100% - 14px)); }
.tooltip-title { font-weight: 600; color: #1f2d3d; margin-bottom: 6px; }
.tooltip-row { display: flex; align-items: center; margin: 3px 0; }
.tooltip-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex: none; margin-right: 8px; }
.tooltip-label { color: #5e6d82; }
.tooltip-value { margin-left: auto; padding-left: 20px; font-weight: 600; color: #1f2d3d; }
</style>
