<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {formatTime} from '@/core/time'
import {onIdentityChange} from '@/core/http'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import OverviewChartTooltip from '../overview/OverviewChartTooltip.vue'
import {trendEntrance,trendLayout} from '../overview/overview-trend-layout'
import type {TooltipPoint} from '../overview/overview-tooltip'
import type {SceneUsageSeries} from './scene-statistics-api'
const props=defineProps<{title:string;times:readonly string[];series:readonly SceneUsageSeries[];loading?:boolean}>()
defineEmits<{refresh:[];export:[]}>()
const svg=ref<SVGSVGElement>(),measure=ref<HTMLElement>(),viewport=ref({width:800,height:250}),widths=ref({y:0,first:0,last:0}),progress=ref(1),hidden=ref(new Set<string>())
const layout=computed(()=>trendLayout(viewport.value.width,viewport.value.height,widths.value.y,widths.value.first,widths.value.last))
const visible=computed(()=>props.series.filter(row=>!hidden.value.has(row.key)))
const maximum=computed(()=>{let max=100n;for(let i=0;i<props.times.length;i++){let stack=0n;for(const row of visible.value){const value=row.values[i];if(value==null)continue;if(row.kind==='bar')stack+=BigInt(value);else if(BigInt(value)>max)max=BigInt(value)}if(stack>max)max=stack}return (max+4n)/5n*5n})
function ratio(value:string){return Number(BigInt(value)*1000000n/maximum.value)/1000000}
const x=(index:number)=>(index+.5)/Math.max(1,props.times.length)*layout.value.width
const y=(value:string)=>layout.value.height-ratio(value)*layout.value.height
type Point={x:number;y:number}
/** 采用原站0.3张力，NULL切段；绘图只消费有界比例，不改变导出原值。 */
function curve(points:Point[]){
 const cap=(point:Point)=>({x:Math.max(0,Math.min(layout.value.width,point.x)),y:Math.max(0,Math.min(layout.value.height,point.y))})
 const controls=points.map((point,index)=>{const before=points[index-1]??point,after=points[index+1]??point,left=Math.hypot(point.x-before.x,point.y-before.y),right=Math.hypot(after.x-point.x,after.y-point.y),sum=left+right;return {before:cap({x:point.x-(sum ? .3*left/sum : 0)*(after.x-before.x),y:point.y-(sum ? .3*left/sum : 0)*(after.y-before.y)}),after:cap({x:point.x+(sum ? .3*right/sum : 0)*(after.x-before.x),y:point.y+(sum ? .3*right/sum : 0)*(after.y-before.y)})}})
 return points.map((point,index)=>index?`C${controls[index-1]!.after.x},${controls[index-1]!.after.y} ${controls[index]!.before.x},${controls[index]!.before.y} ${point.x},${point.y}`:`M${point.x},${point.y}`).join(' ')
}
/** 几何不读取hover，鼠标移动只更新索引和提示锚点。 */
const geometry=computed(()=>{
 const offsets=props.times.map(()=>0n),bucket=layout.value.width/Math.max(1,props.times.length)
 return visible.value.map(row=>{const bars:{index:number;x:number;y:number;width:number;height:number}[]=[],segments:Point[][]=[];let points:Point[]=[]
  row.values.forEach((value,index)=>{if(value===null){if(points.length)segments.push(points);points=[];return}if(row.kind==='bar'){const base=offsets[index]!;offsets[index]=base+BigInt(value);bars.push({index,x:x(index)-bucket*.28,y:y(offsets[index]!.toString()),width:bucket*.56,height:ratio(value)*layout.value.height})}else points.push({x:x(index),y:y(value)})})
  if(points.length)segments.push(points)
  return {...row,bars,paths:segments.map(points=>({path:curve(points),single:points.length===1,point:points[0]!}))}
 })
})
const yLabels=computed(()=>Array.from({length:6},(_,index)=>(maximum.value*BigInt(5-index)/5n).toLocaleString('en-US')))
function time(index:number){const value=formatTime(props.times[index]);return value==='—'?value:value.slice(5,16)}
const hover=ref<number>(),point=ref<TooltipPoint>()
const tooltipRows=computed(()=>visible.value.map(row=>({label:row.label,color:row.color,value:row.values[hover.value??-1]===null?'未统计':row.values[hover.value??-1]??'未统计'})))
function leave(){hover.value=undefined;point.value=undefined}
function at(index:number,box:DOMRect){const ys=geometry.value.flatMap(row=>{const value=row.values[index];if(value==null)return[];return [row.kind==='bar'?row.bars.find(b=>b.index===index)!.y:y(value)]});hover.value=index;point.value={x:box.left+(layout.value.left+x(index))*box.width/viewport.value.width,y:box.top+(layout.value.top+(ys.length?ys.reduce((sum,value)=>sum+value,0)/ys.length:layout.value.height))*box.height/viewport.value.height}}
function move(event:PointerEvent){const box=svg.value?.getBoundingClientRect();if(!box?.width||!box.height||props.loading||!props.times.length)return leave();const px=(event.clientX-box.left)*viewport.value.width/box.width-layout.value.left,py=(event.clientY-box.top)*viewport.value.height/box.height-layout.value.top;if(px<0||px>=layout.value.width||py<0||py>layout.value.height)return leave();at(Math.floor(px/layout.value.width*props.times.length),box)}
function step(delta:number){const box=svg.value?.getBoundingClientRect();if(box&&props.times.length)at(Math.max(0,Math.min(props.times.length-1,(hover.value??0)+delta)),box)}
function toggle(key:string){const next=new Set(hidden.value);next.has(key)?next.delete(key):next.add(key);hidden.value=next;leave()}
let observer:ResizeObserver|undefined,frame=0,disposed=false
function resize(){if(!svg.value)return;const box=svg.value.getBoundingClientRect();if(box.width>0&&box.height>0)viewport.value={width:box.width,height:box.height};widths.value={y:Math.max(0,...Array.from(measure.value?.querySelectorAll('[data-y]')??[]).map(e=>e.getBoundingClientRect().width)),first:measure.value?.querySelector('[data-first]')?.getBoundingClientRect().width??0,last:measure.value?.querySelector('[data-last]')?.getBoundingClientRect().width??0};leave()}
function enter(){if(frame)cancelAnimationFrame(frame);if(typeof requestAnimationFrame!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){progress.value=1;return}const start=performance.now();progress.value=0;function draw(now:number){if(disposed)return;progress.value=trendEntrance(now-start);if(now-start<1000)frame=requestAnimationFrame(draw);else frame=0}frame=requestAnimationFrame(draw)}
onMounted(async()=>{await nextTick();resize();if(svg.value&&typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(resize);observer.observe(svg.value)}enter()})
watch(()=>[props.times,props.series],async()=>{hidden.value=new Set();leave();await nextTick();resize();enter()})
watch(yLabels,async()=>{await nextTick();resize()})
const disposeIdentity=onIdentityChange(leave)
onBeforeUnmount(()=>{disposed=true;observer?.disconnect();disposeIdentity();if(frame)cancelAnimationFrame(frame)})
</script>
<template><section class="scene-stat-chart" :aria-label="title"><header><h3>{{title}}</h3><div class="chart-actions"><el-button size="small" :aria-label="title+'导出'" :disabled="loading||!times.length" @click="$emit('export')"><ReferenceIcon glyph="󰇚"/>导出</el-button><el-button size="small" :disabled="loading" :loading="loading" @click="$emit('refresh')"><ReferenceIcon glyph="󰑐"/>刷新</el-button></div></header>
 <div ref="measure" class="axis-measure" aria-hidden="true"><span v-for="label in yLabels" :key="label" data-y>{{label}}</span><span data-first>{{time(0)}}</span><span data-last>{{time(times.length-1)}}</span></div>
 <figure><div class="plot"><svg ref="svg" :viewBox="`0 0 ${viewport.width} ${viewport.height}`" role="img" :aria-label="title" tabindex="0" @pointermove="move" @pointerleave="leave" @blur="leave" @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)">
  <g v-for="tick in [0,1,2,3,4,5]" :key="tick"><line :x1="layout.left" :x2="viewport.width-layout.right" :y1="layout.top+tick*layout.height/5" :y2="layout.top+tick*layout.height/5" stroke="#f2f4f7"/></g>
  <g :transform="`translate(${layout.left} ${layout.top})`"><rect v-if="hover!==undefined" :x="hover/Math.max(1,times.length)*layout.width" y="0" :width="layout.width/Math.max(1,times.length)" :height="layout.height" fill="rgba(19,33,68,.045)"/><g :transform="`translate(0 ${layout.height*(1-progress)}) scale(1 ${progress})`"><g v-for="row in geometry" :key="row.key" :data-series="row.key"><rect v-for="bar in row.bars" :key="bar.index" :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" :fill="row.color"/><template v-for="(segment,index) in row.paths" :key="index"><path :d="segment.path" fill="none" :stroke="row.color" stroke-width="2"/><circle v-if="segment.single" :cx="segment.point.x" :cy="segment.point.y" r="2" :fill="row.color"/></template></g></g></g>
 </svg><div class="chart-axis" aria-hidden="true"><span v-for="(label,index) in yLabels" :key="index" class="axis-y" :style="{top:layout.top+index*layout.height/5+'px',width:layout.left-10+'px'}">{{label}}</span><span v-for="index in [...new Set([0,Math.floor((times.length-1)/2),times.length-1])]" :key="index" class="axis-x" :style="{left:layout.left+x(index)+'px'}">{{time(index)}}</span></div><OverviewChartTooltip v-if="hover!==undefined&&point&&tooltipRows.length" :point="point" :rows="tooltipRows" :title="time(hover)" kind="trend" @dismiss="leave"/></div>
 <figcaption><button v-for="row in series" :key="row.key" type="button" :aria-pressed="!hidden.has(row.key)" :class="{muted:hidden.has(row.key)}" @click="toggle(row.key)"><i :style="{background:row.color}"/>{{row.label}}</button></figcaption></figure>
</section></template>
<style scoped>
.scene-stat-chart{margin-top:20px;min-width:0;position:relative}.scene-stat-chart+.scene-stat-chart{margin-top:30px}header{display:flex;justify-content:space-between;align-items:center;gap:12px}h3{font-size:14px;font-weight:400;color:#666;line-height:20px;margin:0}.chart-actions{display:flex;gap:10px}.chart-actions :deep(.el-button){height:28px;padding:7px 15px;font-size:12px;border-radius:3px;margin:0}.chart-actions .reference-icon{margin-right:4px}figure{margin:0;height:280px;display:flex;flex-direction:column}.plot{position:relative;flex:1;min-height:0}svg{width:100%;height:100%;display:block}.chart-axis{position:absolute;inset:0;pointer-events:none;color:#98a2b3;font-size:11px;line-height:13.2px}.axis-y{position:absolute;left:0;text-align:right;transform:translateY(-50%)}.axis-x{position:absolute;bottom:0;white-space:nowrap;transform:translateX(-50%)}.axis-measure{position:absolute;visibility:hidden;pointer-events:none;font-size:11px;line-height:13.2px;white-space:nowrap}.axis-measure span{display:block;width:max-content}figcaption{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 18px;margin-top:8px;flex:none;min-height:22px}figcaption button{display:inline-flex;align-items:center;gap:6px;border:0;background:none;font-size:12px;color:#5e6d82;padding:0;cursor:pointer}figcaption i{display:block;width:8px;height:8px;border-radius:50%}figcaption .muted{opacity:.4;text-decoration:line-through}
</style>
