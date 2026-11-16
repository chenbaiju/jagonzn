<script setup lang="ts">
import {computed,nextTick,onScopeDispose,ref,watch} from 'vue'
import type {Map as LeafletMap,Marker,TileLayer,LeafletMouseEvent} from 'leaflet'
import {directoryMapProvider} from './directory-map'
import {canDisplayLocationPoint,locationMapDisplayLongitude,locationMapPoint,locationMapSelection,type LocationMapPoint} from './location-map-draft'
const props=defineProps<{longitude?:number;latitude?:number;session:number;disabled?:boolean}>()
const emit=defineEmits<{select:[point:LocationMapPoint,session:number]}>()
const container=ref<HTMLElement>(),active=ref(false),loading=ref(false),providerError=ref(''),tileError=ref('')
const point=computed(()=>locationMapPoint(props.longitude,props.latitude))
const provider=(()=>{try{return directoryMapProvider(import.meta.env)}catch(cause){providerError.value=cause instanceof Error?cause.message:'地图底图配置无效';return null}})()
const draftSession=props.session
let disposed=false,sequence=0,map:LeafletMap|undefined,marker:Marker|undefined,tiles:TileLayer|undefined,leaflet:typeof import('leaflet')|undefined,resize:ResizeObserver|undefined
function renderPoint(){
 marker?.remove();marker=undefined
 const value=point.value;if(!map||!leaflet||!canDisplayLocationPoint(value))return
 marker=leaflet.marker([value.latitude,locationMapDisplayLongitude(value.longitude,map.getCenter().lng)],{title:'草稿位置',keyboard:true,icon:leaflet.divIcon({className:'location-draft-marker',html:'<span></span>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map)
}
function showDraft(){const value=point.value;if(!disposed&&!props.disabled&&props.session===draftSession&&canDisplayLocationPoint(value)&&map){map.setView([value.latitude,value.longitude],13);renderPoint()}}
function focusDraft(session:number){if(session===draftSession)showDraft()}
defineExpose({focusDraft})
function pick(event:LeafletMouseEvent){
 if(disposed||props.disabled||props.session!==draftSession||!map)return
 const selected=locationMapSelection(event.latlng.lng,event.latlng.lat);if(!selected)return
 emit('select',selected,draftSession)
 void nextTick(()=>{if(!disposed&&!props.disabled&&props.session===draftSession)renderPoint()})
}
async function start(){
 if(!provider||props.disabled||disposed||active.value||props.session!==draftSession)return
 active.value=true;loading.value=true;const current=++sequence
 try{
  await nextTick();const engine=await import('leaflet');await import('leaflet/dist/leaflet.css')
  if(disposed||current!==sequence||props.disabled||props.session!==draftSession||!container.value){if(!disposed&&current===sequence){active.value=false;loading.value=false}return}
  leaflet=engine;map=engine.map(container.value,{attributionControl:true,zoomControl:true});map.attributionControl.setPrefix(false)
  tiles=engine.tileLayer(provider.tileUrl,{maxZoom:19,attribution:provider.attribution,referrerPolicy:'origin',updateWhenIdle:true,updateWhenZooming:false,keepBuffer:1,detectRetina:false})
  tiles.on('tileerror',()=>{if(!disposed){tileError.value='地图底图加载失败，可继续手动填写经纬度。';loading.value=false}})
  tiles.on('load',()=>{if(!disposed)loading.value=false})
  tiles.addTo(map);engine.control.scale({imperial:false}).addTo(map);map.on('click',pick)
  const value=point.value;if(canDisplayLocationPoint(value))map.setView([value.latitude,value.longitude],13);else map.setView([20,0],2)
  renderPoint()
  if(typeof ResizeObserver!=='undefined'){resize=new ResizeObserver(()=>map?.invalidateSize());resize.observe(container.value)}
 }catch{if(!disposed&&current===sequence){providerError.value='地图组件加载失败，可继续手动填写经纬度。';loading.value=false;map?.remove();map=undefined}}
}
watch(()=>[props.longitude,props.latitude],renderPoint)
onScopeDispose(()=>{disposed=true;sequence++;resize?.disconnect();marker?.remove();tiles?.off();map?.off();map?.remove();map=undefined})
</script>
<template><section class="location-map-picker" aria-label="位置草稿地图">
 <p v-if="providerError" role="alert">{{providerError}}</p>
 <p v-else-if="!provider" role="status">当前未配置可用地图底图，请手动填写经纬度。</p>
 <template v-else>
  <p class="location-map-notice">启用后将加载 OpenStreetMap 外部底图，供应商会收到所查看的地图区域。地图选点仅修改草稿，保存后才更新设备位置。</p>
  <el-button v-if="!active" :disabled="disabled" @click="start">启用地图选点</el-button>
  <template v-else><p v-if="tileError" role="alert">{{tileError}}</p><p v-else-if="loading" role="status">正在加载地图底图…</p><div ref="container" class="location-map-canvas" aria-label="点击地图选择草稿位置"/><el-button :disabled="disabled||!canDisplayLocationPoint(point)" @click="showDraft">显示草稿位置</el-button><p v-if="point&&!canDisplayLocationPoint(point)" role="status">该纬度超出当前底图显示范围，手填坐标仍可保存。</p><p v-else-if="!point" role="status">请点击地图选点，或完整填写经纬度。</p></template>
 </template>
</section></template>
<style scoped>
.location-map-picker{min-width:0}.location-map-notice{font-size:12px;color:var(--tl-muted);line-height:1.6;margin:0 0 12px}.location-map-canvas{width:100%;height:460px;background:#f4f5f6;margin-bottom:10px}.location-map-picker [role=alert]{color:var(--el-color-danger)}.location-map-picker [role=status]{font-size:13px}.location-map-canvas :deep(.location-draft-marker span){display:block;width:18px;height:18px;margin:3px;border-radius:50%;background:#409eff;border:2px solid white;box-shadow:0 1px 5px #3337}@media(max-width:600px){.location-map-canvas{height:320px}}
</style>
