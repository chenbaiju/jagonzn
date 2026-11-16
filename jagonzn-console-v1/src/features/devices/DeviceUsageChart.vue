<script setup lang="ts">
import {computed,nextTick,ref,onMounted,onScopeDispose,watch} from 'vue'
import {formatTime} from '@/core/time'
import {RefreshRight as Refresh,Download} from '@element-plus/icons-vue'
import type {UsageOverview} from './device-overview-api'
import {chartXlsx} from './device-usage-xlsx'
import OverviewChartTooltip from '../overview/OverviewChartTooltip.vue'
import {trendLayout} from '../overview/overview-trend-layout'
import type {TooltipPoint} from '../overview/overview-tooltip'
import {chartRatio,chartColor,chartMaximum,chartSegments,compactCount,usageLabels,chartStackMaximum,chartBars} from './device-usage-chart'
const props=defineProps<{title:string;chartKey:string;keys:readonly string[];data?:UsageOverview;loading:boolean}>()
defineEmits<{refresh:[]}>()
const hidden=ref(new Set<string>()),body=ref<HTMLElement>(),axisMeasure=ref<HTMLElement>(),viewWidth=ref(1020)
const labelWidths=ref({y:20,first:68,last:68})
const layout=computed(()=>trendLayout(viewWidth.value,300,labelWidths.value.y,labelWidths.value.first,labelWidths.value.last))
const plotWidth=computed(()=>layout.value.width)
const plotHeight=computed(()=>260-layout.value.top)
let observer:ResizeObserver|undefined
function measure(){if(body.value?.clientWidth)viewWidth.value=body.value.clientWidth;const labels=axisMeasure.value;labelWidths.value={y:Math.max(0,...Array.from(labels?.querySelectorAll('[data-y]')||[]).map(el=>el.getBoundingClientRect().width)),first:labels?.querySelector('[data-first]')?.getBoundingClientRect().width||0,last:labels?.querySelector('[data-last]')?.getBoundingClientRect().width||0};clearHover()}
onMounted(async()=>{await nextTick();measure();if(body.value&&typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(measure);observer.observe(body.value)}})
onScopeDispose(()=>observer?.disconnect())
const series=computed(()=>props.keys.map(k=>props.data?.series.find(s=>s.key===k)).filter(s=>!!s))
const visible=computed(()=>series.value.filter(s=>!hidden.value.has(s.key)))
const bytes=computed(()=>['mqtt','tcp','http'].includes(props.chartKey))
const stacked=computed(()=>['connections','alarms','notifications'].includes(props.chartKey))
const maximum=computed(()=>stacked.value?chartStackMaximum(visible.value):chartMaximum(visible.value,props.chartKey==='messages'?100n:10n))
const bars=computed(()=>chartBars(stacked.value?visible.value:props.chartKey==='messages'?visible.value.filter(s=>s.key==='total'):[],maximum.value,stacked.value,plotWidth.value,layout.value.left,plotHeight.value))
const lines=computed(()=>stacked.value?[]:visible.value.filter(s=>props.chartKey!=='messages'||s.key!=='total'))
const hoverIndex=ref<number|null>(null),tooltipPoint=ref<TooltipPoint>()
function clearHover(){hoverIndex.value=null;tooltipPoint.value=undefined}
watch(()=>[props.data,props.loading,props.keys],clearHover,{flush:'sync'})
function at(index:number,rect:DOMRect){
 if(!props.data||props.loading||!rect.width||!rect.height){clearHover();return}
 let stack=0n
 const ys=visible.value.flatMap(series=>{const value=series.values[index];if(value==null)return[];if(stacked.value)stack+=BigInt(value);return [260-chartRatio(stacked.value?stack.toString():value,maximum.value)*plotHeight.value]})
 if(!ys.length){clearHover();return}
 hoverIndex.value=index
 tooltipPoint.value={x:rect.left+(layout.value.left+index/Math.max(1,props.data.bucketStarts.length-1)*plotWidth.value)*rect.width/viewWidth.value,y:rect.top+ys.reduce((sum,value)=>sum+value,0)/ys.length*rect.height/300}
}
function hover(event:MouseEvent){
 const rect=(event.currentTarget as SVGElement).getBoundingClientRect(),n=props.data?.bucketStarts.length||0
 if(!rect.width||!rect.height||!n){clearHover();return}
 const x=(event.clientX-rect.left)/rect.width*viewWidth.value,y=(event.clientY-rect.top)/rect.height*300
 if(x<layout.value.left||x>layout.value.left+plotWidth.value||y<layout.value.top||y>260){clearHover();return}
 at(Math.max(0,Math.min(n-1,Math.round((x-layout.value.left)/plotWidth.value*(n-1)))),rect)
}
function step(delta:number){const n=props.data?.bucketStarts.length||0,rect=body.value?.querySelector('svg')?.getBoundingClientRect();if(n&&rect)at(Math.max(0,Math.min(n-1,(hoverIndex.value??0)+delta)),rect)}
const tooltipRows=computed(()=>visible.value.map(series=>({label:usageLabels[series.key]||series.key,color:chartColor(props.chartKey,props.keys.indexOf(series.key)),value:series.values[hoverIndex.value??-1]==null?'-':series.values[hoverIndex.value??-1]+(bytes.value?'B':'')})))
const observed=computed(()=>visible.value.some(s=>s.values.some(n=>n!==null)))
const ticks=computed(()=>Array.from({length:6},(_,i)=>({y:260-i*plotHeight.value/5,label:compactCount(maximum.value*BigInt(i)/5n)+(bytes.value?'B':'')})))
const timeTicks=computed(()=>{const buckets=props.data?.bucketStarts;if(!buckets?.length)return[];const count=viewWidth.value>800?5:viewWidth.value>500?3:2;return Array.from(new Set(Array.from({length:count},(_,n)=>Math.round(n*(buckets.length-1)/(count-1))))).map(i=>({x:layout.value.left+i/Math.max(1,buckets.length-1)*plotWidth.value,label:new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(buckets[i]!))}))})
watch([ticks,()=>props.data?.bucketStarts],async()=>{await nextTick();measure()})
function toggle(key:string){clearHover();const next=new Set(hidden.value);next.has(key)?next.delete(key):next.add(key);hidden.value=next}
function download(){if(!props.data)return;const blob=new Blob([chartXlsx(props.data,props.keys)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${props.data.deviceId}-${props.chartKey}-${props.data.range}.xlsx`;link.click();URL.revokeObjectURL(url)}
</script>
<template><section class="usage-chart" :aria-label="title"><header><h3>{{title}}</h3><span class="chart-actions"><el-button size="small" :icon="Download" :disabled="!data" @click="download">导出</el-button><el-button size="small" :icon="Refresh" :loading="loading" @click="$emit('refresh')">刷新</el-button></span></header><div class="chart-visual"><div ref="body" class="chart-body"><div ref="axisMeasure" class="axis-measure" aria-hidden="true"><span v-for="tick in ticks" :key="tick.y" data-y>{{tick.label}}</span><span data-first>{{timeTicks[0]?.label}}</span><span data-last>{{timeTicks.at(-1)?.label}}</span></div><svg :viewBox="`0 0 ${viewWidth} 300`" preserveAspectRatio="none" role="img" tabindex="0" :aria-label="`${title}趋势，左右方向键查看逐小时数据`" @mousemove="hover" @mouseleave="clearHover" @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)" @blur="clearHover"><g v-for="tick in ticks" :key="tick.y"><line :x1="layout.left" :x2="layout.left+plotWidth" :y1="tick.y" :y2="tick.y" :stroke="tick.y===260?'#e4e7ec':'#f2f4f7'"/><text :x="layout.left-10" :y="tick.y+4" text-anchor="end">{{tick.label}}</text></g><g v-if="observed"><rect v-for="bar in bars" :key="`${bar.key}-${bar.index}`" :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" :fill="chartColor(chartKey,keys.indexOf(bar.key))"/><g v-for="s in lines" :key="s.key"><polyline v-for="(points,n) in chartSegments(s,maximum,plotWidth,plotHeight,layout.left)" :key="n" :points="points" fill="none" :stroke="chartColor(chartKey,keys.indexOf(s.key))" stroke-width="2" vector-effect="non-scaling-stroke"><title>{{usageLabels[s.key]}}</title></polyline></g></g><text v-else :x="viewWidth/2" y="145" text-anchor="middle" class="no-observation">{{loading?'正在读取…':data&&series.length&&!visible.length?'请选择图例查看数据':'暂无观测数据'}}</text><text v-for="tick in timeTicks" :key="tick.x" :x="tick.x" y="285" :text-anchor="'middle'">{{tick.label}}</text></svg><OverviewChartTooltip v-if="hoverIndex!==null&&tooltipPoint&&data&&visible.length" :point="tooltipPoint" :title="formatTime(data.bucketStarts[hoverIndex])" :rows="tooltipRows" kind="trend" @dismiss="clearHover"/></div><div class="chart-legend"><button v-for="s in series" :key="s.key" type="button" :aria-pressed="!hidden.has(s.key)" :class="{muted:hidden.has(s.key)||s.coverage==='UNOBSERVED'}" :title="s.coverage==='UNOBSERVED'?'暂无观测数据':usageLabels[s.key]" @click="toggle(s.key)"><i :style="{background:chartColor(chartKey,keys.indexOf(s.key))}"/>{{usageLabels[s.key]}}</button></div></div></section></template>
<style scoped>
.usage-chart{margin-top:25px;min-width:0}header{display:flex;justify-content:space-between;align-items:center;gap:12px}h3{margin:0;font-size:15px;line-height:22px;font-weight:400;color:#444}.chart-actions{display:flex;gap:10px}.chart-actions :deep(.el-button+.el-button){margin-left:0}.chart-actions :deep(.el-button){height:28px;padding:7px 15px;font-size:12px;line-height:1}.chart-visual{display:flex;flex-direction:column;height:300px;margin-top:20px}.chart-body{position:relative;flex:1;min-height:0}.axis-measure{position:absolute;top:0;left:0;visibility:hidden;pointer-events:none;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:11px;white-space:nowrap}.axis-measure span{display:block;width:max-content}svg{display:block;width:100%;height:100%;overflow:visible}svg text{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:11px;fill:#98a2b3}.no-observation{font-size:14px;fill:#909399}.chart-legend{display:flex;justify-content:center;flex-wrap:wrap;flex:none;gap:8px 18px;margin:4px 0 0}.chart-legend button{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;display:inline-flex;align-items:center;gap:6px;border:0;background:none;padding:2px;line-height:18px;font-size:12px;color:#5e6d82;cursor:pointer}.chart-legend i{display:inline-block;width:11.314px;height:11.314px;border-radius:50%}.chart-legend .muted{opacity:.45}.chart-legend .muted[aria-pressed=false]{text-decoration:line-through}@media(max-width:640px){.chart-visual{height:250px}.chart-legend{margin-inline:12px}.chart-actions{gap:4px}header{align-items:flex-start}}
</style>
