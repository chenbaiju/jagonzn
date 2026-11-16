<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import {computed,ref,watch,onScopeDispose} from 'vue'
import {DocumentCopy,Right,TopRight} from '@element-plus/icons-vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import {useDeviceGuard,isDeviceScopeCurrent} from './use-device-guard'
import {readApplicationMqttLocator} from './application-mqtt-locator-api'

const props=defineProps<{deviceId:string;reference?:boolean}>()
const capture=useDeviceGuard(()=>props.deviceId)
const allowed=computed(()=>can('device:read')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')
 &&currentProject.value?.status==='ACTIVE'&&!!session.user?.accountId&&!!projectId.value&&!!props.deviceId)
const resource=useResource(signal=>readApplicationMqttLocator(projectId.value,props.deviceId,signal))
const copying=ref(false)
const canCopy=computed(()=>allowed.value&&!resource.loading.value&&!resource.error.value&&!!resource.data.value&&!copying.value)
let generation=0
function clear(){generation++;resource.clear();copying.value=false}
const dispose=onIdentityChange(clear)
onScopeDispose(()=>{clear();dispose()})
watch(()=>[projectId.value,props.deviceId,allowed.value,session.user?.accountId,session.user?.projectRole],()=>{
 clear();if(allowed.value)void resource.reload()
},{immediate:true,flush:'sync'})
async function reload(){clear();if(allowed.value)await resource.reload()}
async function copy(){
 if(!canCopy.value||!resource.data.value)return
 const text=resource.data.value.deviceViewToken,check=capture(),request=generation
 const current=()=>request===generation&&allowed.value&&isDeviceScopeCurrent(check)
 copying.value=true
 try{await navigator.clipboard.writeText(text);if(current())copySucceeded('已复制 DeviceViewToken')}
 catch{if(current())copyFailed('复制失败，请检查浏览器剪贴板权限后重试')}
 finally{if(current())copying.value=false}
}
</script>
<template>
 <section class="application-mqtt-locator" aria-labelledby="application-mqtt-locator-title">
  <h2 id="application-mqtt-locator-title">{{reference?'应用端 MQTT 订阅':'应用端 MQTT 设备定位'}}</h2>
  <p v-if="reference" class="tips">ThingsLink 支持 MQTT 应用端订阅，通过它您可以在自己的服务器或网页中订阅设备的实时消息。 <a href="https://www.thingscloud.xyz/docs/guide/api/project-mqtt-subscribe.html" target="_blank" rel="noopener noreferrer">了解详情 <el-icon><TopRight/></el-icon></a></p>
  <p v-else class="tips">DeviceViewToken 是已认证项目中的公开设备定位段，不是访问凭据。复制不会启用 MQTT 或授予订阅权限。</p>
  <template v-if="reference">
   <AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="reload"/>
   <div v-if="allowed" class="locator-actions">
    <el-button size="small" :icon="DocumentCopy" :disabled="!canCopy" @click="copy">复制 DeviceViewToken</el-button>
    <router-link class="el-button el-button--small" :to="{path:'/project-settings',query:{tab:'mqtt_sub'}}"><el-icon><Right/></el-icon>查看 MQTT 连接参数</router-link>

   </div>
  </template>
  <AsyncState v-else :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="reload">
   <template v-if="resource.data.value">
    <code class="locator-value">{{resource.data.value.deviceViewToken}}</code>
    <div class="locator-actions">
     <el-button size="small" :icon="DocumentCopy" :disabled="!canCopy" @click="copy">复制 DeviceViewToken</el-button>

    </div>
   </template>
   <el-button class="locator-refresh" size="small" aria-label="重新读取 DeviceViewToken" @click="reload">重新读取</el-button>
  </AsyncState>
 </section>
</template>
<style scoped>
.application-mqtt-locator{margin-top:40px;padding-bottom:32px}.application-mqtt-locator h2{margin:10px 0 0;font-size:22px;line-height:32px;font-weight:400;color:#002822}.tips{margin:8px 0 0;font-size:15px;line-height:22px;color:#888}.locator-refresh{margin-top:10px}.locator-value{display:block;margin-top:12px;font:500 14px/20px Consolas,monospace;overflow-wrap:anywhere;color:#606266}.locator-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:10px}.locator-actions .el-button+.el-button{margin-left:0}
.tips a{display:inline;white-space:nowrap;color:var(--tl-primary);font-weight:500;text-decoration:none;margin-left:6px}.tips a:hover{color:var(--el-color-primary-light-3)}.tips a:focus-visible{outline:2px solid var(--tl-primary);outline-offset:3px}.tips a .el-icon{font-size:14px;vertical-align:-2px}.locator-actions>a{text-decoration:none;gap:6px}
</style>
