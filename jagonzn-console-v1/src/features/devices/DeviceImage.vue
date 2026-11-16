<script setup lang="ts">
import {ref,watch,onScopeDispose} from 'vue'
import {api,errorMessage,IdentityChanged,onIdentityChange} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {projectId,can} from '@/core/session'
import {useResource} from '@/core/use-resource'
import {devicePath} from './api'
import {useDeviceGuard} from './use-device-guard'
import AsyncState from '@/ui/AsyncState.vue'
const props=defineProps<{deviceId:string}>(),capture=useDeviceGuard(()=>props.deviceId)
const url=ref(''),file=ref<File>(),busy=ref(false),error=ref(''),version=ref(0)
let generation=0
function clear(){generation++;if(url.value)URL.revokeObjectURL(url.value);url.value='';file.value=undefined;error.value='';version.value++}
const dispose=onIdentityChange(clear);onScopeDispose(()=>{clear();dispose()})
const resource=useResource(async signal=>{const current=generation,base=devicePath(projectId.value,props.deviceId);const state=await api<Schema<'DeviceImageView'>>(`${base}/image`,{signal});if(!/^(0|[1-9][0-9]*)$/.test(state.revision))throw new Error('图片修订号无效');let blob:Blob|undefined;if(state.present)blob=await api<Blob>(`${base}/image/content`,{query:{revision:state.revision},responseType:'blob',maxResponseBytes:1048576,signal});if(current===generation){if(url.value)URL.revokeObjectURL(url.value);url.value=blob?URL.createObjectURL(blob):''}return state})
watch(()=>[projectId.value,props.deviceId,can('device:update')],()=>{clear();resource.clear();if(projectId.value)void resource.reload()},{immediate:true})
function choose(e:Event){file.value=undefined;error.value='';const chosen=(e.target as HTMLInputElement).files?.[0];if(!chosen)return;if(!['image/png','image/jpeg'].includes(chosen.type)||!chosen.size||chosen.size>1048576){error.value='请选择不超过1MiB的PNG/JPEG图片';return}file.value=chosen}
async function change(remove:boolean){if(!resource.data.value?.writable||!can('device:update')||busy.value||(!remove&&!file.value))return;const check=capture(),state=resource.data.value,chosen=file.value;busy.value=true;file.value=undefined;version.value++;error.value='';try{if(remove)await api<Schema<'DeviceImageView'>>(`${devicePath(projectId.value,props.deviceId)}/image`,{method:'delete',query:{expectedRevision:state.revision}});else await api<Schema<'DeviceImageView'>>(`${devicePath(projectId.value,props.deviceId)}/image`,{method:'put',query:{expectedRevision:state.revision},body:chosen,headers:{'Content-Type':chosen!.type,'Idempotency-Key':crypto.randomUUID()}});check();await resource.reload()}catch(e){if(!(e instanceof IdentityChanged)){try{check()}catch{return}error.value=errorMessage(e)+'；请重新读取状态核对，未自动重传。';await resource.reload()}}finally{busy.value=false}}
</script>
<template><el-alert v-if="error" :title="error" type="error" :closable="false"/><AsyncState :loading="resource.loading.value" :error="resource.error.value" @retry="resource.reload"><img v-if="url" :src="url" alt="当前设备图片" class="device-image"/><el-empty v-else description="暂无设备图片" :image-size="72"/><p class="tl-muted">修订 {{resource.data.value?.revision}} · {{resource.data.value?.width||'—'}} × {{resource.data.value?.height||'—'}} · {{resource.data.value?.sizeBytes||0}} 字节</p><p v-if="resource.data.value?.pendingState">处理状态 {{resource.data.value.pendingState}}</p><div class="tl-toolbar"><template v-if="can('device:update')&&resource.data.value?.writable"><input :key="version" type="file" accept="image/png,image/jpeg" aria-label="选择设备图片" :disabled="busy" @change="choose"/><el-button type="primary" :disabled="!file" :loading="busy" @click="change(false)">上传或替换</el-button><el-popconfirm title="确认删除当前图片？" @confirm="change(true)"><template #reference><el-button type="danger" plain :disabled="!resource.data.value?.present||busy">删除图片</el-button></template></el-popconfirm></template><el-button :disabled="busy" @click="resource.reload">刷新图片状态</el-button></div><p class="tl-muted">PNG/JPEG，不超过1MiB、2048×2048像素；服务端最终校验。</p></AsyncState></template>
<style scoped>.device-image{display:block;max-width:100%;max-height:320px;object-fit:contain;margin:0 auto 20px;}</style>
