<script setup lang="ts">
import {ref,watch,onScopeDispose} from 'vue'
import {projectId,session,currentProject} from '@/core/session'
import {identityEpoch,onIdentityChange,errorMessage} from '@/core/http'
import {previewDefinitionRasterIcon,rasterIconSource,type DefinitionRasterIcon,type RasterIconPreviewTransport} from './definition-raster-icon'
const props=withDefaults(defineProps<{typeId:string;modelValue?:DefinitionRasterIcon|null;disabled?:boolean;active?:boolean;transport?:RasterIconPreviewTransport}>(),{active:true,transport:previewDefinitionRasterIcon})
const emit=defineEmits<{'update:modelValue':[DefinitionRasterIcon|null];busy:[boolean]}>()
const fileInput=ref<HTMLInputElement>(),pending=ref(false),error=ref(''),dragging=ref(false)
let generation=0,controller:AbortController|undefined,alive=true
function reset(){generation++;controller?.abort();pending.value=false;error.value='';dragging.value=false;if(fileInput.value)fileInput.value.value='';emit('busy',false)}
function permitted(){return props.active&&!props.disabled&&session.ready&&!session.transitioning&&!!projectId.value&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')}
function read(file:File){return new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('图片读取失败'));reader.onload=()=>reader.result instanceof ArrayBuffer?resolve(reader.result):reject(new Error('图片读取失败'));reader.readAsArrayBuffer(file)})}
function selected(event:Event){const file=(event.target as HTMLInputElement).files?.[0];if(file)void preview(file)}
function dragOver(event:DragEvent){
 if(!event.dataTransfer)return
 const allowed=permitted()&&!pending.value&&event.dataTransfer.types.includes('Files')
 dragging.value=allowed;event.dataTransfer.dropEffect=allowed?'copy':'none'
}
function dragLeave(event:DragEvent){
 if(!(event.relatedTarget instanceof Node)||!(event.currentTarget as HTMLElement).contains(event.relatedTarget))dragging.value=false
}
function dropped(event:DragEvent){
 dragging.value=false
 if(!permitted()||pending.value)return
 const files=event.dataTransfer?.files
 if(!files?.length)return
 if(files.length!==1){error.value='请一次选择一张图片';return}
 void preview(files[0]!)
}
async function preview(file:File){
 if(!permitted()||pending.value)return
 reset();if(file.size<8||file.size>524288){error.value='请选择最多512KiB的PNG或JPEG图片';return}
 pending.value=true;emit('busy',true);controller=new AbortController();const signal=controller.signal,g=generation,project=projectId.value,type=props.typeId,epoch=identityEpoch(),account=session.user?.accountId
 const current=()=>alive&&g===generation&&!signal.aborted&&permitted()&&project===projectId.value&&type===props.typeId&&epoch===identityEpoch()&&account===session.user?.accountId
 try{const bytes=new Uint8Array(await read(file));if(!current())return;let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const icon=await props.transport(project,type,btoa(binary),signal);if(current())emit('update:modelValue',icon)}catch(cause){if(current())error.value=errorMessage(cause)}finally{if(g===generation){pending.value=false;emit('busy',false);if(fileInput.value)fileInput.value.value=''}}
}
function clear(){if(permitted()&&!pending.value)emit('update:modelValue',null)}
watch([()=>projectId.value,()=>session.user?.accountId,()=>session.user?.projectRole,()=>currentProject.value?.myRole,()=>currentProject.value?.status,()=>props.typeId,()=>props.active,()=>props.disabled],reset,{flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;reset();dispose()})
</script>
<template>
 <div class="raster-picker">
  <div class="raster-drop-area" :class="{'is-dragging':dragging&&permitted()&&!pending}"
    @dragenter.prevent="dragOver" @dragover.prevent="dragOver" @dragleave="dragLeave" @drop.prevent="dropped">
   <el-button size="small" :disabled="!permitted()||pending" :loading="pending" @click="fileInput?.click()">选择本地图标</el-button>
   <input ref="fileInput" type="file" accept="image/png,image/jpeg" aria-label="上传图标文件" hidden @change="selected"/>
   <p>也可将图片拖到此处。支持 PNG、JPEG，最大 512 KiB。选择后仍需保存。</p>
  </div>
  <div v-if="modelValue" class="raster-preview">
   <img :src="rasterIconSource(modelValue)" width="32" height="32" alt="上传图标预览"/>
   <el-button text size="small" :disabled="!permitted()||pending" @click="clear">移除上传图标</el-button>
  </div>
  <p v-if="error" class="raster-error" role="alert">{{error}}</p>
 </div>
</template>
<style scoped>
.raster-drop-area{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:170px;padding:30px 24px;border:1px dashed var(--el-border-color);border-radius:5px;background:#fafafa;text-align:center}
.raster-drop-area.is-dragging{border-color:var(--tl-primary);background:var(--el-color-primary-light-9)}
.raster-drop-area .el-button{height:32px;padding:8px 15px}
.raster-drop-area p{margin:0;color:var(--tl-muted);font-size:14px;line-height:20px}
.raster-preview{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px}
.raster-preview img{object-fit:contain}
.raster-error{margin:8px 0 0;color:var(--el-color-danger)}
</style>
