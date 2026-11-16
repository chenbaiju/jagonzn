<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {tooltipPosition,type TooltipBounds,type TooltipPoint,type TooltipRow} from './overview-tooltip'
const props=defineProps<{point:TooltipPoint;rows:readonly TooltipRow[];title?:string;kind:'item'|'trend';bounds?:TooltipBounds}>()
const emit=defineEmits<{dismiss:[]}>()
const element=ref<HTMLElement>(),size=ref({width:0,height:0}),ready=ref(false),moving=ref(false)
const position=computed(()=>tooltipPosition(props.point,size.value,props.bounds||{left:0,top:0,right:window.innerWidth,bottom:window.innerHeight},props.kind))
let generation=0
watch(()=>props.point,()=>{moving.value=ready.value})
watch(()=>[props.rows,props.title],async()=>{const current=++generation;await nextTick();if(current!==generation||!element.value)return;const box=element.value.getBoundingClientRect();size.value={width:box.width,height:box.height};ready.value=true},{immediate:true,flush:'post'})
function dismiss(){emit('dismiss')}
onMounted(()=>{window.addEventListener('scroll',dismiss,true);window.addEventListener('resize',dismiss)})
onBeforeUnmount(()=>{generation++;window.removeEventListener('scroll',dismiss,true);window.removeEventListener('resize',dismiss)})
</script>
<template><Teleport to="body"><div ref="element" role="tooltip" class="overview-chart-tooltip" :class="[kind,{moving}]" :style="{left:kind==='item'?'0':position.x+'px',top:kind==='item'?'0':position.y+'px',transform:kind==='item'?`translate3d(${position.x}px,${position.y}px,0)`:undefined,visibility:ready?'visible':'hidden'}"><div v-if="title" class="tooltip-heading">{{title}}</div><div v-for="row in rows" :key="row.label" class="tooltip-row"><i :style="{background:row.color}"/><span class="tooltip-label">{{row.label}}</span><span class="tooltip-value">{{row.value}}</span></div></div></Teleport></template>
<style scoped>
.overview-chart-tooltip.item{will-change:transform}.overview-chart-tooltip.item.moving{transition:transform .4s cubic-bezier(.23,1,.32,1),opacity .2s cubic-bezier(.23,1,.32,1)}@media(prefers-reduced-motion:reduce){.overview-chart-tooltip.item.moving{transition:none}}
.overview-chart-tooltip{position:fixed;max-width:calc(100vw - 8px);max-height:calc(100vh - 8px);box-sizing:border-box;overflow:hidden;background:#fff;border:1px solid #e7eaf3;border-radius:8px;box-shadow:0 6px 20px rgba(19,33,68,.12);padding:10px 14px;pointer-events:none;z-index:100;font-size:12px;line-height:1.7;color:#1f2d3d;transition:opacity .15s ease}.overview-chart-tooltip.trend{min-width:140px}.tooltip-heading{font-weight:600;color:#1f2d3d;margin-bottom:6px}.tooltip-row{display:flex;align-items:center;margin:3px 0;white-space:nowrap}.tooltip-row i{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none;margin-right:8px}.tooltip-label{color:#5e6d82}.tooltip-value{margin-left:auto;padding-left:20px;font-weight:600;color:#1f2d3d}.item .tooltip-row i{width:10px;height:10px}.item .tooltip-label{color:#1f2d3d}.item .tooltip-value{font-weight:900}
</style>
