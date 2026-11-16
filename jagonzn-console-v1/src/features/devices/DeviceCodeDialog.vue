<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import {computed,ref,nextTick,watch} from 'vue'
import {DocumentCopy,Download} from '@element-plus/icons-vue'
import QrcodeVue from 'qrcode.vue'
import {errorMessage} from '@/core/http'
import {useDeviceOnboardingCode} from './use-device-onboarding-code'
const props=defineProps<{deviceId:string;visible:boolean;triggerText?:string}>()
const state=useDeviceOnboardingCode(()=>props.deviceId,()=>props.visible)
const {shown,data,busy,error,allowed}=state
const payload=computed(()=>data.value?.code||'')
const output=ref<HTMLElement>(),downloadSize=ref(0),exportError=ref('')
let exportGeneration=0
watch(data,()=>{exportGeneration++;downloadSize.value=0;exportError.value=''},{flush:'sync'})
function beforeClose(done:()=>void){state.close();done()}
async function copy(){
 if(!payload.value||!shown.value||!allowed.value)return
 const intent=exportGeneration
 try{await navigator.clipboard.writeText(payload.value);if(intent===exportGeneration)copySucceeded()}
 catch{if(intent===exportGeneration)copyFailed()}
}
async function download(size:number){
 if(!payload.value||!shown.value||!allowed.value||downloadSize.value)return
 const intent=exportGeneration,id=props.deviceId;downloadSize.value=size;exportError.value=''
 try{
  await nextTick()
  if(intent!==exportGeneration||!shown.value||!allowed.value)return
  const canvas=output.value?.querySelector('canvas')
  if(!canvas)throw new Error('二维码图片尚未生成，请重试')
  const image=document.createElement('canvas');image.width=image.height=size
  const context=image.getContext('2d')
  if(!context)throw new Error('浏览器无法生成二维码图片，请重试')
  context.imageSmoothingEnabled=false;context.drawImage(canvas,0,0,size,size)
  const anchor=document.createElement('a');anchor.download='device_qrcode_'+id+'_'+size+'px.png';anchor.href=image.toDataURL('image/png');anchor.click()
 }catch(cause){if(intent===exportGeneration)exportError.value=errorMessage(cause)}
 finally{if(intent===exportGeneration)downloadSize.value=0}
}
const sizes=[{size:600,label:'小型 (600×600)',description:'适合网页展示、小标签打印 (约 5cm @ 300dpi)'},{size:1200,label:'中型 (1200×1200)',description:'适合产品手册、一般打印 (约 10cm @ 300dpi)'},{size:2400,label:'大型 (2400×2400)',description:'适合海报、大尺寸印刷 (约 20cm @ 300dpi)'}]
</script>
<template>
<el-tooltip v-if="allowed" content="将设备码贴在设备上或产品手册中，用户可扫码添加设备。" placement="top" :trigger="['hover','focus']">
 <el-button v-if="triggerText" size="small" class="device-code-trigger device-code-trigger--text" :aria-label="triggerText" @click="state.start">{{triggerText}}</el-button>
<el-button v-else link class="device-code-trigger" aria-label="查看设备码" @click="state.start"><svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><path d="M1 1h6v6H1zm1.5 1.5v3h3v-3zM11 1h6v6h-6zm1.5 1.5v3h3v-3zM1 11h6v6H1zm1.5 1.5v3h3v-3zM9 1h1v3H9zm0 5h1v4H6V9h3zM1 9h3v1H1zm8 3h3v2h2v3h-2v-2H9zm5-3h3v3h-1v-2h-2zm2 5h1v3h-1zM9 16h1v1H9z"/></svg></el-button>
</el-tooltip>
<el-dialog :model-value="shown&&allowed" title="查看设备码" width="min(500px,94vw)" class="device-code-dialog" :before-close="beforeClose" :close-on-click-modal="false" destroy-on-close>
 <el-alert class="code-learning" type="info" :closable="false" show-icon><template #title>请浏览相关介绍： <a href="https://www.thingscloud.xyz/docs/guide/device-manage/device-qrcode.html" target="_blank" rel="noopener noreferrer">用户如何主动添加设备？设备码派上用场</a></template></el-alert>
 <el-skeleton v-if="busy" :rows="4" animated class="code-loading"/>
 <template v-else-if="error"><el-alert :title="error" type="error" :closable="false"/><el-button class="code-retry" @click="state.reload">重新读取</el-button></template>
 <template v-else-if="data">
  <el-alert v-if="!data.allowUserAdd" class="code-policy-warning" title="请先在 “设备类型 > 应用配置 > 用户添加设备” 中开启允许用户添加设备。" type="warning" :closable="false" show-icon/>
  <section class="code-section"><h3>设备码</h3><p>用户在应用中添加设备时可输入设备码。</p><div class="device-code-value"><strong>{{payload||'未设置设备标识'}}</strong><el-button v-if="payload" :icon="DocumentCopy" size="small" @click="copy">复制</el-button></div></section>
  <template v-if="payload">
   <section class="code-section"><h3>设备二维码</h3><p>用户在应用中添加设备时，可扫描该二维码。对于已添加的设备，扫描设备二维码可以快速进入设备面板。</p><div class="code-preview"><QrcodeVue :value="payload" :size="100" :margin="0" level="M" render-as="svg"/></div></section>
   <section class="code-section"><h3>下载高清二维码</h3><p>下载不同尺寸的高清二维码图片，适用于各种打印场景。</p><div class="code-download-list"><div v-for="item in sizes" :key="item.size" class="code-download-row"><div><strong>{{item.label}}</strong><small>{{item.description}}</small></div><el-button :icon="Download" size="small" :loading="downloadSize===item.size" :disabled="!!downloadSize" @click="download(item.size)">下载</el-button></div></div></section>
  </template>
 </template>
 <el-alert v-if="exportError" :title="exportError" type="error" :closable="false"/>
 <div v-if="downloadSize&&payload" ref="output" hidden><QrcodeVue :value="payload" :size="downloadSize" :margin="4" level="M" render-as="canvas"/></div>
</el-dialog>
</template>
<style>
.device-code-trigger.el-button{padding:0;height:22px;color:#999;margin-left:0!important}.device-code-trigger.el-button:hover{color:var(--tl-primary)}.device-code-trigger--text.el-button{height:28px;padding:0 15px;color:var(--el-text-color-regular);border:1px solid var(--el-border-color);border-radius:3px;background:#fff}.device-code-trigger--text.el-button:hover{color:var(--tl-primary);border-color:var(--tl-primary)}
.device-code-dialog{display:flex;flex-direction:column;max-height:90vh}.device-code-dialog .el-dialog__header{flex-shrink:0}.device-code-dialog .el-dialog__body{padding:30px 20px 50px;overflow-y:auto;min-height:0}.device-code-dialog .el-dialog__title{font-weight:400}.device-code-dialog .el-dialog__headerbtn{top:20px;right:14px;width:30px;height:24px}.device-code-dialog .el-alert__title{font-size:13px;line-height:22px;font-weight:400}.device-code-dialog .code-learning{background:#ecf0ff;border-left:2px solid var(--tl-primary)}.device-code-dialog .code-learning a{color:var(--tl-primary);text-decoration:underline;font-weight:600}.device-code-dialog .code-learning{margin-bottom:20px}.device-code-dialog .code-policy-warning{margin-bottom:26px}.device-code-dialog .code-section{margin-top:26px}.device-code-dialog .code-section h3{font-size:14px;font-weight:500;line-height:20px;margin:0 0 6px;color:#606266}.device-code-dialog .code-section p{margin:0 0 10px;font-size:13px;line-height:20px;color:#999}.device-code-dialog .device-code-value{display:flex;align-items:center;gap:16px}.device-code-dialog .device-code-value strong{font-size:24px;line-height:32px;font-weight:700;overflow-wrap:anywhere}.device-code-dialog .code-preview{margin-top:10px;width:100px;height:100px}.device-code-dialog .code-download-row{display:flex;justify-content:space-between;align-items:center;padding:14px 15px;border:1px solid #e4e7ed;border-radius:8px;background:#f7f7fb;gap:12px;margin-top:12px;min-height:78px;box-sizing:border-box}.device-code-dialog .code-download-row strong{font-size:14px;line-height:20px;font-weight:600;color:#303133}.device-code-dialog .code-download-row small{display:block;color:#999;font-size:12px;line-height:18px;margin-top:8px}.device-code-dialog .code-loading{margin-top:26px}.device-code-dialog .code-retry{margin-top:12px}
</style>
