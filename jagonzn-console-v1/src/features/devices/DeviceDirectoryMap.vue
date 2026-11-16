<script setup lang="ts">
import {computed,nextTick,onMounted,onScopeDispose,ref,watch} from 'vue'
import {ElCheckbox} from 'element-plus'
import ReferenceIcon from '../../ui/ReferenceIcon.vue'
import DirectoryAmapFrame from './DirectoryAmapFrame.vue'
import {canPlaceMapPoint,directoryMapBounds,type DirectoryMapRow,type DirectoryBaseMap} from './directory-map'
const props=defineProps<{rows:readonly DirectoryMapRow[];projectId:string;scopeKey:string;disabled?:boolean}>()
const emit=defineEmits<{navigate:[deviceId:string]}>()
const selected=ref(''),providerError=ref(''),loading=ref(false),viewport=ref<HTMLElement>(),fullscreen=ref(false),fullscreenSupported=ref(false),fullscreenBusy=ref(false),fullscreenError=ref(''),mapReady=ref(false),frame=ref<InstanceType<typeof DirectoryAmapFrame>>()
const baseMap=ref<DirectoryBaseMap>('vector'),baseMapMenu=ref(false),baseMapToggle=ref<HTMLButtonElement>(),tools=ref<HTMLElement>()
const baseMapLabel=computed(()=>baseMap.value==='satellite'?'卫星地图':'街道地图')
const checked=ref<string[]>([])
const placeableRows=computed(()=>props.rows.filter(canPlaceMapPoint))
const allChecked=computed(()=>placeableRows.value.length>0&&placeableRows.value.every(row=>checked.value.includes(row.deviceId)))
const someChecked=computed(()=>checked.value.length>0&&!allChecked.value)
function checkRows(ids:string[]){if(props.disabled)return;checked.value=ids.filter(id=>placeableRows.value.some(row=>row.deviceId===id));if(mapReady.value&&checked.value.length)frame.value?.fit(checked.value)}
function checkRow(id:string,value:unknown){checkRows(value?[...checked.value,id]:checked.value.filter(item=>item!==id))}
function locationLabel(row:DirectoryMapRow){return row.locationSource==='DISABLED'?'类型已关闭地理坐标扩展':row.locationSource==='UNAVAILABLE'?'当前类型位置来源不可用':row.longitude===null?'未设置人工坐标':!canPlaceMapPoint(row)?'该纬度超出当前底图显示范围':`${row.locationSource==='REPORTED_PROPERTY'?'设备上报 · ':''}经度 ${row.longitude} · 纬度 ${row.latitude}`}
const selectedRow=computed(()=>props.rows.find(row=>row.deviceId===selected.value))
let disposed=false,fullscreenGeneration=0
function syncFullscreen(){if(disposed)return;fullscreenSupported.value=document.fullscreenEnabled===true&&typeof viewport.value?.requestFullscreen==='function'&&typeof document.exitFullscreen==='function';fullscreen.value=!!viewport.value&&document.fullscreenElement===viewport.value}
async function releaseFullscreen(element=viewport.value){if(!element||document.fullscreenElement!==element||typeof document.exitFullscreen!=='function')return;try{await document.exitFullscreen()}catch{if(!disposed)fullscreenError.value='无法退出地图全屏，请按 Esc 退出。'}syncFullscreen()}
function cancelFullscreen(){fullscreenGeneration++;fullscreenError.value='';void releaseFullscreen()}
async function toggleFullscreen(){
 if(disposed||props.disabled||fullscreenBusy.value||!mapReady.value||!viewport.value)return
 syncFullscreen();if(!fullscreenSupported.value)return
 if(document.fullscreenElement&&document.fullscreenElement!==viewport.value){fullscreenError.value='请先退出其它内容的全屏模式。';return}
 const element=viewport.value,generation=fullscreenGeneration,leaving=document.fullscreenElement===element
 fullscreenBusy.value=true;fullscreenError.value=''
 try{if(leaving)await document.exitFullscreen();else await element.requestFullscreen();if(disposed||generation!==fullscreenGeneration||props.disabled||viewport.value!==element){await releaseFullscreen(element);return}syncFullscreen();await nextTick()}
 catch{if(!disposed&&generation===fullscreenGeneration){fullscreenError.value=leaving?'无法退出地图全屏，请按 Esc 退出。':'无法进入地图全屏，可继续使用当前地图。';syncFullscreen()}}
 finally{if(!disposed)fullscreenBusy.value=false}
}
function navigate(id:string){if(!props.disabled&&props.rows.some(row=>row.deviceId===id))emit('navigate',id)}
function select(id:string){if(!props.disabled&&props.rows.some(row=>row.deviceId===id))selected.value=id}
function fitPage(){if(!props.disabled&&mapReady.value)frame.value?.fit()}
function closeBaseMapMenu(){baseMapMenu.value=false;if(!disposed&&!props.disabled)baseMapToggle.value?.focus()}
function outsideBaseMapMenu(event:PointerEvent){if(baseMapMenu.value&&event.target instanceof Node&&!tools.value?.contains(event.target))baseMapMenu.value=false}
function chooseBaseMap(kind:DirectoryBaseMap){if(disposed||props.disabled||!mapReady.value)return;closeBaseMapMenu();baseMap.value=kind}
function mapError(message:string){providerError.value=message;if(message){mapReady.value=false;loading.value=false;selected.value='';cancelFullscreen()}}
watch(()=>props.rows,()=>{cancelFullscreen();baseMapMenu.value=false;selected.value='';checked.value=[]},{flush:'sync'})
watch(()=>[props.scopeKey,props.disabled],()=>{cancelFullscreen();baseMapMenu.value=false;selected.value='';checked.value=[];mapReady.value=false},{flush:'sync'})
onMounted(()=>{document.addEventListener('fullscreenchange',syncFullscreen);document.addEventListener('pointerdown',outsideBaseMapMenu);syncFullscreen()})
onScopeDispose(()=>{disposed=true;fullscreenGeneration++;document.removeEventListener('fullscreenchange',syncFullscreen);document.removeEventListener('pointerdown',outsideBaseMapMenu);void releaseFullscreen()})
</script>
<template><section class="directory-map" aria-label="当前页设备地图">
 <aside class="directory-map-list" aria-label="地图设备列表">
  <div class="directory-map-list-header"><ElCheckbox :model-value="allChecked" :indeterminate="someChecked" :disabled="disabled||!placeableRows.length" aria-label="选择全部有位置设备" @change="checkRows($event?placeableRows.map(row=>row.deviceId):[])"/><h3>设备名称</h3></div>
  <div class="directory-map-rows"><p v-if="!rows.length" class="map-list-empty" role="status">当前页没有设备</p>
   <div v-for="row in rows" :key="row.deviceId" class="directory-map-row" :class="{'is-selected':selected===row.deviceId,'is-checked':checked.includes(row.deviceId)}">
    <div class="map-device-check"><template v-if="canPlaceMapPoint(row)"><ReferenceIcon class="map-device-pin" :class="{'is-online':row.online}" glyph="󰟙"/><ElCheckbox :model-value="checked.includes(row.deviceId)" :disabled="disabled" :aria-label="`选择位置 ${row.name}`" @change="checkRow(row.deviceId,$event)"/></template></div>
    <button class="map-device-select" type="button" :title="`${row.name} · ${locationLabel(row)}`" :disabled="disabled" :aria-pressed="selected===row.deviceId" @click="select(row.deviceId)">{{row.name}}</button>
    <small class="map-sr-only">{{locationLabel(row)}}</small>
    <div class="map-device-actions"><button class="map-device-detail" type="button" :disabled="disabled" :aria-label="`查看设备详情：${row.name}`" title="查看设备详情" @click="navigate(row.deviceId)"><ReferenceIcon glyph="󱦴"/></button></div>
   </div>
  </div>
 </aside>
 <div class="directory-map-panel">
  <div ref="viewport" class="directory-map-viewport"><div class="directory-map-canvas" :aria-label="`高德${baseMapLabel}底图`"><DirectoryAmapFrame ref="frame" :project-id="projectId" :scope-key="scopeKey" :rows="rows" :selected="selected" :base-map="baseMap" :disabled="disabled" @select="select" @navigate="navigate" @ready="mapReady=$event" @loading="loading=$event" @error="mapError"/></div>
   <div ref="tools" class="map-tools"><button type="button" class="map-tool map-fullscreen" :title="fullscreen?'退出全屏':'全屏'" :aria-label="fullscreen?'退出地图全屏':'地图全屏'" :aria-pressed="fullscreen" :disabled="disabled||fullscreenBusy||!fullscreenSupported||!mapReady" @click="toggleFullscreen"><ReferenceIcon :glyph="fullscreen?'󰊔':'󰊓'"/></button>
    <div class="map-tool-spacer"/>
    <button ref="baseMapToggle" type="button" class="map-tool map-basemap-menu" title="切换地图底图" aria-label="切换地图底图" aria-haspopup="menu" :aria-expanded="baseMapMenu" :disabled="disabled||!mapReady" @click="baseMapMenu=!baseMapMenu" @keydown.esc.stop.prevent="closeBaseMapMenu"><ReferenceIcon glyph="󰨁"/></button>
    <div v-if="baseMapMenu" class="map-basemap-choices" role="menu" aria-label="地图底图" @keydown.esc.stop.prevent="closeBaseMapMenu"><button v-for="kind in (['vector','satellite'] as const)" :key="kind" type="button" role="menuitemradio" :data-basemap="kind" :aria-checked="baseMap===kind" :disabled="disabled" @click="chooseBaseMap(kind)"><span class="map-menu-check" aria-hidden="true">{{baseMap===kind?'✓':''}}</span>{{kind==='vector'?'街道地图':'卫星地图'}}</button></div>
   </div>
   <div class="map-zoom" aria-label="地图缩放"><button type="button" aria-label="放大地图" :disabled="disabled||!mapReady" @click="frame?.zoom('in')">+</button><button type="button" aria-label="缩小地图" :disabled="disabled||!mapReady" @click="frame?.zoom('out')">−</button></div>
   <button type="button" class="map-tool map-fit" title="显示本页位置" aria-label="显示本页位置" :disabled="disabled||!mapReady||!directoryMapBounds(rows)" @click="fitPage"><ReferenceIcon glyph="󱣵"/></button>
   <div v-if="providerError||loading||fullscreenError" class="map-notice"><template v-if="providerError"><p role="alert">{{providerError}}</p><button type="button" :disabled="disabled" @click="frame?.restart()">重新读取地图</button></template><p v-else-if="loading" role="status">正在加载地图与当前页点位…</p><p v-if="fullscreenError" role="alert">{{fullscreenError}}</p></div>
   <p v-if="!rows.some(canPlaceMapPoint)&&!loading&&!providerError" class="map-points-empty" role="status">当前页没有可显示的位置</p>
   <span class="map-sr-only" role="status">{{baseMapLabel}}{{loading?'加载中':''}}</span>
  </div>
  <p v-if="!fullscreenSupported" class="map-sr-only" role="status">当前浏览器不支持地图全屏，可继续使用当前地图。</p><p v-if="selectedRow" class="map-sr-only map-selected" aria-live="polite">已选择：{{selectedRow.name}}</p>
 </div>
</section></template>
<style scoped>
.directory-map{display:flex;gap:15px;height:calc(100vh - 265px);min-height:400px}.directory-map-list{width:245px;flex-shrink:0;display:flex;flex-direction:column;min-height:0}.directory-map-list-header{height:40px;flex-shrink:0;background:#f4f4f4;display:flex;align-items:center}.directory-map-list-header>.el-checkbox{margin:0 10px;width:20px;justify-content:center}.directory-map-list-header h3{flex:1;margin:0;font-size:14px;font-weight:500;line-height:30px}.directory-map-rows{overflow-y:auto;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:#ddd white}.directory-map-rows::-webkit-scrollbar{width:6px}.directory-map-rows::-webkit-scrollbar-thumb{background:#ddd;border-radius:20px}.directory-map-row{position:relative;height:60px;border-bottom:1px solid #ebeef5;display:flex;align-items:center;box-sizing:border-box}.directory-map-row:hover{background:#fafafa}.map-device-check{margin:0 10px;width:20px;flex:none;text-align:center}.map-device-check .map-device-pin{font-size:24px;color:#ccc}.map-device-check .map-device-pin.is-online{color:#67c23a}.map-device-check .el-checkbox{display:none;height:30px}.directory-map-row:hover .map-device-check .el-checkbox,.directory-map-row:focus-within .map-device-check .el-checkbox,.directory-map-row.is-checked .map-device-check .el-checkbox{display:inline-flex}.directory-map-row:hover .map-device-pin,.directory-map-row:focus-within .map-device-pin,.directory-map-row.is-checked .map-device-pin{display:none}.map-device-select{flex:1;min-width:0;padding:0;font-family:inherit;font-size:14px;font-weight:500;line-height:30px;text-align:left;border:0;background:none;color:var(--tl-text);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.directory-map-row.is-checked .map-device-select{font-weight:700;color:#1e88e5}.map-device-actions{width:50px;flex:none;margin-right:10px;display:flex;justify-content:flex-end}.map-device-detail{visibility:hidden;display:flex;align-items:center;justify-content:center;width:25px;height:25px;padding:0;border:1px solid #999;border-radius:5px;color:#666;background:white;cursor:pointer}.map-device-detail .reference-icon{font-size:20px}.directory-map-row:hover .map-device-detail,.directory-map-row:focus-within .map-device-detail{visibility:visible}.map-device-detail:hover{border-color:#1e88e5;color:#1e88e5}.directory-map button:disabled{cursor:not-allowed;opacity:.55}.directory-map-panel{position:relative;flex:1;min-width:0}.directory-map-viewport,.directory-map-canvas{width:100%;height:100%;position:relative;background:#f4f5f6}.map-tools{position:absolute;top:10px;left:10px;z-index:1000;display:flex;flex-direction:column}.map-tool{width:30px;height:30px;border:0;border-radius:5px;background:white;color:#999;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;box-shadow:0 1px 4px #0002}.map-tool .reference-icon{font-size:20px}.map-tool:hover:not(:disabled){background:#1e88e5;color:white}.map-tool-spacer{height:10px}.map-basemap-choices{position:absolute;top:40px;left:40px;z-index:1001;background:white;border:1px solid #ebeef5;border-radius:4px;padding:6px 0;box-shadow:0 2px 12px #0002;min-width:132px}.map-basemap-choices button{display:flex;align-items:center;width:100%;border:0;background:white;padding:8px 12px;white-space:nowrap;text-align:left;font:inherit;font-size:14px;cursor:pointer;color:#606266}.map-basemap-choices button:hover{background:#ecf5ff;color:#409eff}.map-menu-check{width:22px;flex:none;color:#409eff}.map-zoom{position:absolute;bottom:55px;right:10px;z-index:1000;display:flex;flex-direction:column;box-shadow:0 1px 4px #0002;border-radius:5px;overflow:hidden}.map-zoom button{width:30px;height:30px;padding:0;border:0;background:white;color:#666;cursor:pointer;font-size:20px}.map-zoom button+button{border-top:1px solid #ebeef5}.map-fit{position:absolute;bottom:125px;right:10px;z-index:1000}.directory-map-viewport:fullscreen{width:100vw;height:100vh;background:#f4f5f6}.map-notice{position:absolute;top:10px;left:50%;transform:translateX(-50%);max-width:calc(100% - 120px);padding:8px 12px;background:#fff;border-radius:4px;box-shadow:0 1px 6px #0002;z-index:1001;font-size:13px}.map-notice p{margin:0}.map-notice [role=alert]{color:var(--el-color-danger)}.map-notice button{margin-top:8px;border:1px solid #dcdfe6;background:white;border-radius:3px;color:#606266;padding:5px 10px;cursor:pointer}.map-points-empty{position:absolute;top:10px;left:50%;transform:translateX(-50%);margin:0;padding:7px 12px;background:#fffe;border-radius:4px;color:#909399;font-size:12px;white-space:nowrap}.map-list-empty{font-size:13px;color:#909399;padding:10px}.map-sr-only{position:absolute;top:0;left:0;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:767px){.directory-map{height:auto;min-height:0;flex-direction:column}.directory-map-list{width:100%;height:220px}.directory-map-panel{height:420px;flex:none}.map-device-detail{visibility:visible}}
</style>
