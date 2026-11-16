<script setup lang="ts">
import {computed,ref,onScopeDispose} from 'vue'
import {identityEpoch,onIdentityChange} from '@/core/http'
import {projectId} from '@/core/session'
import DirectoryAmapFrame from './DirectoryAmapFrame.vue'
import {locationMapPoint} from './location-map-draft'
import type {PickerPoint} from './directory-amap-protocol'
import type {DirectoryMapRow} from './directory-map'
const props=defineProps<{deviceId:string;longitude?:number|null;latitude?:number|null;session?:number;editable?:boolean;disabled?:boolean}>()
const emit=defineEmits<{point:[point:PickerPoint,name:string];busy:[value:boolean]}>()
const frame=ref<InstanceType<typeof DirectoryAmapFrame>>(),ready=ref(false),loading=ref(true),error=ref(''),epoch=ref(identityEpoch())
const release=onIdentityChange(()=>{epoch.value=identityEpoch();error.value='';ready.value=false});onScopeDispose(release)
const scopeKey=computed(()=>`${epoch.value}:${projectId.value}:${props.deviceId}:position:${props.editable?'edit':'view'}:${props.session??0}:${props.editable?'':`${props.longitude}:${props.latitude}`}`)
const point=computed(()=>locationMapPoint(props.longitude,props.latitude))
const rows=computed<readonly DirectoryMapRow[]>(()=>point.value?[{deviceId:props.deviceId,name:'设备位置',...point.value,online:false,version:'0'}]:[])
function selected(value:PickerPoint,name:string){if(props.editable&&!props.disabled)emit('point',value,name)}
function locateName(name:string){if(props.editable&&!props.disabled&&name.trim())frame.value?.queryPicker({kind:'name',name})}
function focusPoint(){if(props.editable&&!props.disabled&&point.value)frame.value?.queryPicker({kind:'coordinates',point:point.value})}
function cancel(){frame.value?.cancelPicker()}
defineExpose({locateName,focusPoint,cancel})
</script>
<template><div class="device-position-map" :class="{'is-editable':editable}" :aria-label="editable?'设备位置选点地图':'设备位置地图'">
 <DirectoryAmapFrame v-if="projectId&&(point||editable)" ref="frame" :project-id="projectId" :scope-key="scopeKey" :rows="rows" selected="" base-map="vector" :disabled="disabled" :picker="point" :picker-zoom="13" :picker-read-only="!editable" picker-appearance="device-location" @point="selected" @picker-busy="emit('busy',$event)" @ready="ready=$event" @loading="loading=$event" @error="error=$event"/>
 <div class="position-map-zoom"><button type="button" aria-label="放大位置地图" :disabled="!ready||disabled" @click="frame?.zoom('in')">+</button><button type="button" aria-label="缩小位置地图" :disabled="!ready||disabled" @click="frame?.zoom('out')">−</button></div>
 <div v-if="error||loading" class="position-map-feedback"><p :role="error?'alert':'status'">{{error?'地图暂不可用':'正在加载地图…'}}</p><button v-if="error" type="button" :disabled="disabled" @click="frame?.restart()">重新加载</button></div>
</div></template>
<style scoped>
.device-position-map{position:relative;width:440px;max-width:100%;height:220px;background:#f4f5f6;overflow:hidden}.device-position-map.is-editable{width:100%;height:460px}.position-map-zoom{position:absolute;right:10px;bottom:45px;display:flex;flex-direction:column;box-shadow:0 1px 4px #0002;border-radius:3px;overflow:hidden}.position-map-zoom button{width:30px;height:30px;padding:0;border:0;background:white;color:#606266;font-size:22px;cursor:pointer}.position-map-zoom button+button{border-top:1px solid #eee}.position-map-zoom button:disabled{color:#c0c4cc;cursor:default}.position-map-feedback{position:absolute;top:10px;left:50%;transform:translateX(-50%);max-width:calc(100% - 30px);background:#fffe;padding:6px 10px;border-radius:3px;font-size:12px;text-align:center;white-space:nowrap}.position-map-feedback p{margin:0}.position-map-feedback button{border:0;background:transparent;color:#409eff;cursor:pointer;margin-top:4px}
</style>
