<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue'
import {countText,type OverviewRing} from './overview-model'
import OverviewChartTooltip from './OverviewChartTooltip.vue'
import type {TooltipBounds,TooltipPoint,TooltipRow} from './overview-tooltip'
import {ringSectorPath} from './overview-ring-geometry'
const props=defineProps<{ring:OverviewRing}>()
const tooltip=ref<{point:TooltipPoint;bounds:TooltipBounds;rows:TooltipRow[]}>()
const emphasized=ref<string>()
const expansion=ref<Record<string,number>>({})
let hoverGeometry:{box:DOMRect;body:DOMRect}|undefined
function leave(){tooltip.value=undefined;emphasized.value=undefined;hoverGeometry=undefined}
const progress=ref(1)
let frame=0,emphasisFrame=0
function replay(){
  if(frame)cancelAnimationFrame(frame)
  if(emphasisFrame)cancelAnimationFrame(emphasisFrame)
  expansion.value={}
  leave()
  if(!props.ring.available){progress.value=0;return}
  if(typeof requestAnimationFrame!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){progress.value=1;return}
  progress.value=0
  const start=performance.now()
  function draw(now:number){const phase=Math.min(1,Math.max(0,(now-start)/1000));progress.value=phase<.5?4*phase**3:1-(-2*phase+2)**3/2;if(phase<1)frame=requestAnimationFrame(draw);else frame=0}
  frame=requestAnimationFrame(draw)
}
watch(()=>props.ring,replay,{immediate:true,flush:'post'})
onBeforeUnmount(()=>{if(frame)cancelAnimationFrame(frame);if(emphasisFrame)cancelAnimationFrame(emphasisFrame)})
const activeMaximum=computed(()=>Math.max(1,...props.ring.slices.map(row=>row.value)))
const total=computed(()=>props.ring.slices.reduce((n,row)=>n+row.value,0))
const arcs=computed(()=>{let offset=0;return props.ring.slices.map(row=>{const length=total.value?row.value/total.value*100:0,item={...row,length,offset};offset+=length;return item})})
watch(emphasized,()=>{
 if(emphasisFrame)cancelAnimationFrame(emphasisFrame)
 const from={...expansion.value},target=Object.fromEntries(arcs.value.map(arc=>[arc.label,emphasized.value===arc.label?5:0]))
 if(typeof requestAnimationFrame!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){expansion.value=target;return}
 if(Object.keys(target).every(key=>(from[key]||0)===target[key]))return
 const start=performance.now()
 function draw(now:number){const phase=Math.max(0,Math.min(1,(now-start)/300)),eased=1-(1-phase)**3;expansion.value=Object.fromEntries(Object.entries(target).map(([key,value])=>[key,(from[key]||0)+(value-(from[key]||0))*eased]));if(phase<1)emphasisFrame=requestAnimationFrame(draw);else emphasisFrame=0}
 emphasisFrame=requestAnimationFrame(draw)
},{flush:'sync'})
function move(event:PointerEvent){
  const svg=event.currentTarget as SVGElement
  hoverGeometry??={box:svg.getBoundingClientRect(),body:svg.parentElement!.getBoundingClientRect()}
  const {box,body}=hoverGeometry
  if(!props.ring.available||!box.width||!box.height){leave();return}
  const x=(event.clientX-box.left)/box.width*160-80,y=(event.clientY-box.top)/box.height*160-80
  let selected=props.ring.slices
  if(props.ring.key==='activity'){
    if(x < -80||x>80||y < -48||y>48){leave();return}
  }else{
    const radius=Math.hypot(x,y),angle=(Math.atan2(y,x)+Math.PI/2+2*Math.PI)%(2*Math.PI)/Math.PI/2*100
    const arc=arcs.value.find(row=>row.length>0&&angle>=row.offset*progress.value&&angle<(row.offset+row.length)*progress.value)
    if(!arc||radius<32||radius>(emphasized.value===arc.label?61:56)){leave();return}selected=[arc];emphasized.value=arc.label
  }
  const previous=tooltip.value?.rows
  const unchanged=previous?.length===selected.length&&selected.every((row,index)=>previous[index]?.label===row.label&&previous[index]?.value===countText(row.value)&&previous[index]?.color===row.color)
  tooltip.value={point:{x:event.clientX,y:event.clientY},bounds:{left:body.left,top:body.top,right:body.right,bottom:body.bottom},rows:unchanged?previous!:selected.map(row=>({label:row.label,value:countText(row.value),color:row.color}))}
}
</script>
<template><section class="overview-panel overview-ring"><h2>{{ring.title}}</h2><div class="ring-body" :aria-busy="ring.available&&progress<1" :data-draw-progress="progress">
<svg v-if="ring.key==='activity'" class="activity-bars" viewBox="0 0 160 160" preserveAspectRatio="none" role="img" :aria-label="ring.title+' '+ring.center" @pointermove="move" @pointerleave="leave"><g v-for="(row,index) in ring.slices" :key="row.label"><rect :x="16+index*32" y="32" width="22" height="96" fill="rgba(180,180,180,.2)"/><rect :x="16+index*32" :y="128-row.value/activeMaximum*96*progress" width="22" :height="row.value/activeMaximum*96*progress" :fill="row.color"/></g><rect v-if="tooltip" class="activity-pointer" x="0" y="32" width="160" height="96" fill="rgba(19,33,68,.045)"/></svg>
<svg v-else viewBox="0 0 160 160" role="img" :aria-label="ring.title+' '+ring.center" @pointermove="move" @pointerleave="leave"><circle v-if="!ring.available||!total" cx="80" cy="80" r="44" fill="none" stroke="#eef1f5" stroke-width="24"/><path v-for="arc in arcs" :key="arc.label" class="ring-sector" :class="{emphasized:emphasized===arc.label}" :d="ringSectorPath(arc.offset,arc.length,56+(expansion[arc.label]||0),progress)" :fill="arc.color" :data-outer-radius="56+(expansion[arc.label]||0)"/><rect class="ring-hit-plane" x="0" y="0" width="160" height="160" fill="transparent" pointer-events="all"/></svg>
<ul v-if="ring.available" class="ring-legend"><li v-for="row in ring.slices" :key="row.label"><i :style="{background:row.color}"/><span>{{row.label}} {{countText(row.value)}}{{ring.key!=='activity'&&total>0?' ('+Math.floor(row.value/total*100)+'%)':''}}</span></li></ul><p v-else class="unavailable">暂无分布数据</p><OverviewChartTooltip v-if="tooltip" v-bind="tooltip" kind="item" @dismiss="leave"/></div></section></template>
<style scoped>

.overview-ring{height:220px;min-width:0;padding:16px}.overview-ring h2{margin:0;font-size:16px;line-height:24px;font-weight:600;color:#303133}.ring-body{position:relative;height:160px}.ring-body svg{position:absolute;left:calc(25% - 80px);top:0;width:160px;height:160px}.ring-body svg.activity-bars{left:0;width:60%;height:160px}.ring-legend{position:absolute;right:10%;top:50%;transform:translateY(-50%);list-style:none;margin:0;padding:0;max-width:65%}.ring-legend li{display:flex;align-items:center;gap:5px;line-height:22px;font-size:12px;white-space:nowrap}.ring-legend i{width:25px;height:14px;border-radius:3px;flex:none}.ring-legend strong{margin-left:0;font-weight:400;color:#606266}.unavailable{margin:0;color:#a2a8af;font-size:12px}
</style>
