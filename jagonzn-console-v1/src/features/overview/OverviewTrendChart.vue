<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import type {OverviewChart} from './overview-api'
import {formatTrendValue,trendPresentation,trendSegments,validCount} from './overview-model'
import OverviewChartTooltip from './OverviewChartTooltip.vue'
import type {TooltipPoint} from './overview-tooltip'
import {trendEntrance,trendLayout} from './overview-trend-layout'
const props=defineProps<{chart:OverviewChart;from?:string;stepHours?:number;loading?:boolean}>()
defineEmits<{refresh:[];export:[]}>()
const svg=ref<SVGSVGElement>(),measure=ref<HTMLElement>(),viewport=ref({width:680,height:270}),labelWidths=ref({y:0,first:0,last:0}),progress=ref(0)
const layout=computed(()=>trendLayout(viewport.value.width,viewport.value.height,labelWidths.value.y,labelWidths.value.first,labelWidths.value.last))
let observer:ResizeObserver|undefined,frame=0,disposed=false
function resize(){if(!svg.value)return;const box=svg.value.getBoundingClientRect();if(box.width&&box.height)viewport.value={width:box.width,height:box.height};const spans=measure.value;labelWidths.value={y:Math.max(0,...Array.from(spans?.querySelectorAll('[data-y]')||[]).map(row=>row.getBoundingClientRect().width)),first:spans?.querySelector('[data-first]')?.getBoundingClientRect().width||0,last:spans?.querySelector('[data-last]')?.getBoundingClientRect().width||0};leave()}
function enter(){if(disposed)return;if(frame&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(frame);if(typeof requestAnimationFrame!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){progress.value=1;return}progress.value=0;const start=performance.now();function step(now:number){if(disposed)return;progress.value=trendEntrance(now-start);if(now-start<1000)frame=requestAnimationFrame(step);else frame=0}frame=requestAnimationFrame(step)}
onMounted(async()=>{await nextTick();resize();if(typeof ResizeObserver!=='undefined'&&svg.value){observer=new ResizeObserver(resize);observer.observe(svg.value)}enter()})
onBeforeUnmount(()=>{disposed=true;observer?.disconnect();if(typeof cancelAnimationFrame==='function')cancelAnimationFrame(frame)})
const hidden=ref<string[]>([]),hover=ref<number>(),point=ref<TooltipPoint>()
function leave(){hover.value=undefined;point.value=undefined}
watch(()=>props.chart,async()=>{hidden.value=[];leave();await nextTick();resize();enter()})
watch(()=>[props.from,props.stepHours,props.loading],leave)
const raw=computed(()=>(props.chart.series||[]).map((row,index)=>({...row,...trendPresentation(props.chart,index)})))
const length=computed(()=>props.chart.series?.[0]?.values?.length||0)
const maximum=computed(()=>{
  let result=0
  for(let index=0;index<length.value;index++){let stack=0;for(const row of raw.value){const value=row.values?.[index];if(hidden.value.includes(row.key||'')||!validCount(value))continue;if(row.bar&&row.stacked)stack+=value;else result=Math.max(result,value)}result=Math.max(result,stack)}
  return Math.max(['active','connections','alarms','notifications'].includes(props.chart.key||'')?10:100,Math.ceil(result/5)*5)
})
const series=computed(()=>{
  const offsets=Array.from({length:length.value},()=>0),bucket=length.value?layout.value.width/length.value:layout.value.width
  return raw.value.map(row=>{
    const bars=(row.values||[]).flatMap((value,index)=>{if(!row.bar||hidden.value.includes(row.key||'')||!validCount(value))return [];const base=row.stacked?offsets[index]!:0;if(row.stacked)offsets[index]=base+value;return [{index,x:(index+.5)*bucket-bucket*.28,y:layout.value.height-(base+value)/maximum.value*layout.value.height,width:bucket*.56,height:value/maximum.value*layout.value.height,value}]})
    return {...row,bars,segments:row.bar?[]:trendSegments(row.values||[],maximum.value,layout.value.width,layout.value.height)}
  })
})
const yLabels=computed(()=>[0,1,2,3,4,5].map(tick=>formatTrendValue(maximum.value*(5-tick)/5,props.chart.unit)))
watch(yLabels,async()=>{await nextTick();resize()})
const hasValues=computed(()=>(props.chart.series||[]).some(row=>row.values?.some(validCount)))
const tooltipRows=computed(()=>series.value.filter(row=>!hidden.value.includes(row.key||'')).map(row=>({label:row.label||'',color:row.color,value:validCount(row.values?.[hover.value??-1])?formatTrendValue(row.values![hover.value!],props.chart.unit):'未统计'})))
function time(index:number){const value=Date.parse(props.from||'')+index*(props.stepHours||1)*3600000;if(!Number.isFinite(value))return '—';const date=new Date(value),pad=(n:number)=>String(n).padStart(2,'0');return `${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`}
function move(event:PointerEvent){
 const box=(event.currentTarget as SVGElement).getBoundingClientRect();if(!box.width||!box.height||!length.value||props.loading||!hasValues.value){leave();return}
 const x=event.clientX-box.left-layout.value.left,y=event.clientY-box.top-layout.value.top
 if(x<0||x>=layout.value.width||y<0||y>layout.value.height){leave();return}const index=Math.floor(x/layout.value.width*length.value)
 const points=series.value.flatMap(row=>{const value=row.values?.[index];if(hidden.value.includes(row.key||'')||!validCount(value))return [];const bar=row.bars.find(item=>item.index===index);return [row.bar?bar!.y:layout.value.height-value/maximum.value*layout.value.height]})
 hover.value=index;point.value={x:box.left+layout.value.left+(index+.5)/length.value*layout.value.width,y:points.length?box.top+layout.value.top+layout.value.height-(layout.value.height-points.reduce((sum,value)=>sum+value,0)/points.length)*progress.value:event.clientY}
}
function toggle(key:string){hidden.value=hidden.value.includes(key)?hidden.value.filter(value=>value!==key):[...hidden.value,key];leave()}
</script>
<template>
  <div class="overview-trend">
    <div class="curve-heading"><h3>{{chart.title}}</h3><div class="chart-actions"><button type="button" :disabled="loading||!hasValues" @click="$emit('export')"><ReferenceIcon :glyph="String.fromCodePoint(0xf01da)"/>导出</button><button type="button" :disabled="loading" @click="$emit('refresh')"><ReferenceIcon :glyph="String.fromCodePoint(0xf0450)"/>刷新</button></div></div>
    <div ref="measure" class="axis-measure" aria-hidden="true"><span v-for="label in yLabels" :key="label" data-y>{{label}}</span><span data-first>{{time(0)}}</span><span data-last>{{time(Math.max(0,length-1))}}</span></div><div class="chart-canvas" :aria-busy="progress<1" :data-draw-progress="progress"><div class="plot"><svg ref="svg" :viewBox="`0 0 ${viewport.width} ${viewport.height}`" role="img" :aria-label="chart.title" preserveAspectRatio="none" @pointermove="move" @pointerleave="leave">
      <g v-for="tick in [0,1,2,3,4,5]" :key="tick"><line :x1="layout.left" :x2="viewport.width-layout.right" :y1="layout.top+tick*layout.height/5" :y2="layout.top+tick*layout.height/5" stroke="#f2f4f7" vector-effect="non-scaling-stroke"/></g>
      <g :transform="`translate(${layout.left} ${layout.top})`"><g :transform="`translate(0 ${layout.height*(1-progress)}) scale(1 ${progress})`"><g v-for="row in series" v-show="!hidden.includes(row.key||'')" :key="row.key"><rect v-for="bar in row.bars" :key="bar.index" :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" :fill="row.color"/><template v-for="(segment,index) in row.segments" :key="index"><path :d="segment.path" fill="none" :stroke="row.color" stroke-width="2" vector-effect="non-scaling-stroke"/><circle v-if="segment.single" :cx="segment.x" :cy="segment.y" r="2.5" :fill="row.color"/></template></g></g><rect v-if="hover!==undefined&&length" :x="hover/length*layout.width" y="0" :width="layout.width/length" :height="layout.height" fill="rgba(19,33,68,.045)"/></g>

    </svg><div class="chart-axis" aria-hidden="true"><span v-for="tick in [0,1,2,3,4,5]" :key="tick" class="axis-y" :style="{top:layout.top+tick*layout.height/5+'px',width:layout.left-10+'px'}">{{yLabels[tick]}}</span><span class="axis-x start" :style="{left:layout.left+'px'}">{{time(0)}}</span><span class="axis-x middle" :style="{left:layout.left+layout.width/2+'px'}">{{time(Math.floor((length-1)/2))}}</span><span class="axis-x end" :style="{right:layout.right+'px'}">{{time(Math.max(0,length-1))}}</span></div><p v-if="!hasValues" class="plot-empty">暂无统计数据</p><OverviewChartTooltip v-if="hover!==undefined&&point&&hasValues&&tooltipRows.length" :point="point" :title="time(hover)" :rows="tooltipRows" kind="trend" @dismiss="leave"/></div>
    <div class="trend-legend"><button v-for="row in series" :key="row.key" type="button" :aria-pressed="!hidden.includes(row.key||'')" :class="{muted:hidden.includes(row.key||'')}" @click="toggle(row.key||'')"><i :style="{background:row.color}"/>{{row.label}}</button></div></div>
  </div>
</template>
<style scoped>
.overview-trend{display:grid;grid-template-columns:minmax(0,1fr);float:none;clear:both;width:100%;min-width:0;margin-top:25px}.overview-trend>.curve-heading{grid-column:1;grid-row:1;position:static;float:none;display:flex;flex-direction:row;width:100%;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}.overview-trend h3{font-size:15px;line-height:22px;font-weight:400;margin:0;color:#444}.chart-actions{display:flex;gap:10px}.chart-actions button{display:flex;align-items:center;gap:4px;min-height:28px;border:1px solid #dcdfe6;border-radius:3px;padding:5px 10px;font-size:12px;color:#606266;background:#fff;cursor:pointer}.chart-actions button:disabled{opacity:.5;cursor:default}.chart-actions .reference-icon{font-size:14px}.overview-trend>.chart-canvas{grid-column:1;grid-row:2;clear:both;float:none;width:100%;height:300px;display:flex;flex-direction:column}.plot{position:relative;flex:1;min-height:0}.plot svg{display:block;width:100%;height:100%}.chart-axis{position:absolute;inset:0;pointer-events:none;color:#98a2b3;font-size:11px;line-height:16px}.axis-y{position:absolute;left:0;text-align:right;transform:translateY(-50%)}.axis-x{position:absolute;bottom:0;white-space:nowrap}.axis-x.start,.axis-x.middle,.axis-x.end{transform:translateX(-50%)}.axis-x.end{transform:translateX(50%)}.axis-measure{position:absolute;visibility:hidden;pointer-events:none;font-size:11px;line-height:13.2px;white-space:nowrap}.axis-measure span{display:block;width:max-content}.plot-empty{position:absolute;inset:40% 0 auto;text-align:center;color:#a8aeb5;font-size:13px;pointer-events:none}.trend-legend i{height:6px;width:10px;border-radius:2px;display:inline-block;flex:none}.trend-legend{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 12px;margin-top:8px;min-height:22px;flex-shrink:0}.trend-legend button{display:flex;align-items:center;gap:5px;font-size:11px;color:#909399;padding:0;background:none;border:0;cursor:pointer}.trend-legend button.muted{opacity:.4}@media(max-width:600px){.chart-actions{gap:6px}.chart-actions button{padding:5px 8px}}
</style>
