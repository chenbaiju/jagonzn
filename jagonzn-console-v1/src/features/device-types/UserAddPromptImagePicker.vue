<script setup lang="ts">
import {onScopeDispose,ref,watch} from 'vue'
import {projectId,session,currentProject,can} from '@/core/session'
import {identityEpoch,onIdentityChange,errorMessage} from '@/core/http'
import DefinitionExternalIcon from './DefinitionExternalIcon.vue'
import {promptPngDimensions,userAddPromptImageMaximumBytes,userAddPromptImageSource,type UserAddPromptImage,type UserAddPromptPreview} from './user-add-settings-api'
const props=defineProps<{typeId:string;active:boolean;disabled:boolean;modelValue:UserAddPromptImage|null;transport:UserAddPromptPreview}>()
const emit=defineEmits<{'update:modelValue':[UserAddPromptImage|null];busy:[boolean]}>(),fileInput=ref<HTMLInputElement>(),pending=ref(false),error=ref('')
let generation=0,alive=true,controller:AbortController|undefined
function reset(){generation++;controller?.abort();pending.value=false;error.value='';if(fileInput.value)fileInput.value.value='';emit('busy',false)}
function permitted(){return props.active&&!props.disabled&&session.ready&&!session.transitioning&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')}
function read(file:File){return new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('图片读取失败'));reader.onload=()=>reader.result instanceof ArrayBuffer?resolve(reader.result):reject(new Error('图片读取失败'));reader.readAsArrayBuffer(file)})}
async function selected(event:Event){
 if(!permitted()||pending.value)return;const files=Array.from((event.target as HTMLInputElement).files||[]);if(!files.length)return;reset();if(files.length!==1){error.value='每次只能选择一张PNG图片';return}const file=files[0]!;if(file.size<33||file.size>userAddPromptImageMaximumBytes||file.type&&file.type!=='image/png'){error.value='请选择一张不超过256KiB的PNG图片';return}
 pending.value=true;emit('busy',true);controller=new AbortController();const g=generation,signal=controller.signal,project=projectId.value,type=props.typeId,epoch=identityEpoch(),actor=session.user?.accountId
 const current=()=>alive&&g===generation&&!signal.aborted&&permitted()&&project===projectId.value&&type===props.typeId&&epoch===identityEpoch()&&actor===session.user?.accountId
 try{const bytes=new Uint8Array(await read(file));if(!current())return;promptPngDimensions(bytes);let binary='';for(let index=0;index<bytes.length;index+=8192)binary+=String.fromCharCode(...bytes.subarray(index,index+8192));const image=await props.transport(project,type,btoa(binary),signal);if(current())emit('update:modelValue',image)}catch(cause){if(current())error.value=errorMessage(cause)}finally{if(g===generation){pending.value=false;emit('busy',false);if(fileInput.value)fileInput.value.value=''}}
}
function remove(){if(permitted()&&!pending.value)emit('update:modelValue',null)}
watch([()=>projectId.value,()=>session.user?.accountId,()=>session.user?.projectRole,()=>currentProject.value?.myRole,()=>currentProject.value?.status,()=>props.typeId,()=>props.active,()=>props.disabled],reset,{flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;reset();dispose()})
</script>
<template><div class="prompt-image-picker"><img v-if="modelValue" :src="userAddPromptImageSource(modelValue)" alt="用户添加设备提示图片预览"/><div><el-button size="small" :disabled="!permitted()||pending" :loading="pending" @click="fileInput?.click()">选择图片</el-button><el-button v-if="modelValue" size="small" :disabled="!permitted()||pending" @click="remove">移除图片</el-button></div><input ref="fileInput" type="file" accept="image/png" aria-label="上传用户添加提示PNG" hidden @change="selected"/><p>支持 PNG 图片，文件大小不超过 256 KiB。 <a href="https://www.thingscloud.xyz/docs/guide/faq/console.html#图片上传" target="_blank" rel="noopener noreferrer">图片上传常见问题 <DefinitionExternalIcon/></a></p><p v-if="error" role="alert">{{error}}</p></div></template>
<style scoped>.prompt-image-picker{width:100%}.prompt-image-picker img{display:block;max-width:100%;max-height:220px;object-fit:contain;margin:0 0 12px}.prompt-image-picker p{font-size:12px;line-height:20px;color:var(--tl-muted);margin:8px 0}.prompt-image-picker [role=alert]{color:var(--el-color-danger)}</style>
