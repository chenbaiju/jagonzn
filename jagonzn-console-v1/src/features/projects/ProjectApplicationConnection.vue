<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import {computed,ref,watch,onScopeDispose,nextTick} from 'vue'
import {DocumentCopy,TopRight} from '@element-plus/icons-vue'
import {currentProject,projectId,session} from '@/core/session'
import {identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import {readApplicationConnection} from './application-connection-api'

const props=defineProps<{presentation:'api'|'mqtt';reference?:boolean}>()
const allowed=computed(()=>!!session.user?.accountId&&!!projectId.value&&!session.transitioning
 &&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&currentProject.value?.status==='ACTIVE')
const resource=useResource(signal=>readApplicationConnection(projectId.value,signal))
const copying=ref(false)
const title=computed(()=>props.presentation==='api'?'应用端 API 接入点':'应用端 MQTT 连接参数')
const endpoint=computed(()=>resource.data.value?.[props.presentation].endpoint??null)
const canCopy=computed(()=>allowed.value&&!resource.loading.value&&!resource.error.value&&!!endpoint.value&&!copying.value)
let generation=0,disposed=false
function clear(){generation++;resource.clear();copying.value=false}
const dispose=onIdentityChange(clear)
onScopeDispose(()=>{disposed=true;clear();dispose()})
watch(()=>[projectId.value,session.user?.accountId,session.user?.projectRole,allowed.value,props.presentation],()=>{
 clear();const request=generation
 if(allowed.value)void nextTick(()=>{if(!disposed&&request===generation&&allowed.value)void resource.reload()})
},{immediate:true,flush:'sync'})
async function reload(){clear();if(allowed.value)await resource.reload()}
async function copy(){
 if(!canCopy.value||!endpoint.value)return
 const text=endpoint.value,request=generation,epoch=identityEpoch(),project=projectId.value,account=session.user?.accountId
 const current=()=>!disposed&&request===generation&&epoch===identityEpoch()&&project===projectId.value&&account===session.user?.accountId&&allowed.value
 copying.value=true
 try{await navigator.clipboard.writeText(text);if(current())copySucceeded('已复制公开接入点')}
 catch{if(current())copyFailed('复制失败，请检查浏览器剪贴板权限后重试')}
 finally{if(current())copying.value=false}
}
</script>
<template>
 <section class="application-connection" :aria-label="title">
  <h2>{{title}}</h2>
  <p v-if="reference&&presentation==='api'" class="tips">应用端可以通过 API 实现项目资源管理、设备访问，包括设备消息下发、云端属性更新等。 <a href="https://www.thingscloud.xyz/docs/guide/api/app-device-api.html" target="_blank" rel="noopener noreferrer">了解详情 <el-icon><TopRight/></el-icon></a></p>
  <p v-else class="tips">{{presentation==='api'?'应用端通过独立 API 读取设备属性或提交已启用的写入操作。':'应用端通过独立 MQTT 服务订阅项目设备消息。'}}以下仅显示当前部署配置，不代表已建立连接。</p>
  <AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="reload">
   <template v-if="resource.data.value">
    <pre v-if="endpoint" class="code">{{endpoint}}</pre>
    <p v-else class="unavailable" role="status">尚未配置{{presentation==='api'?'应用端 API':'应用端 MQTT'}} 接入点</p>
    <template v-if="!reference&&presentation==='api'">
     <p class="availability" role="status">{{resource.data.value.api.enabled?'应用端 API 读取已配置启用':'应用端 API 未启用'}}；{{resource.data.value.api.writesEnabled?'应用写入已配置启用':'应用写入未启用'}}</p>
    </template>
    <p v-else-if="!reference" class="availability" role="status">{{resource.data.value.mqtt.enabled?'应用端 MQTT 协议已配置启用':'应用端 MQTT 协议未启用'}}</p>
    <div v-if="endpoint&&!reference" class="endpoint-actions"><el-button size="small" :icon="DocumentCopy" :disabled="!canCopy" :aria-label="`复制${presentation==='api'?'应用 API':'应用 MQTT'}接入点`" @click="copy">复制接入点</el-button></div>
   </template>
   <el-button v-if="!reference" class="refresh" size="small" :aria-label="`重新读取${presentation==='api'?'应用 API':'应用 MQTT'}参数`" @click="reload">重新读取</el-button>
  </AsyncState>
 </section>
</template>
<style scoped>
.application-connection h2{margin:10px 0 0;font-size:22px;line-height:32px;font-weight:400;color:#002822}.tips{margin:8px 0 0;font-size:15px;line-height:22px;color:#888}.code{margin:12px 0 0;padding:10px;background:#464646;color:#fff;font:500 14px/20px 'Andale Mono',Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.unavailable,.availability{font-size:14px;color:#909399;line-height:24px}.unavailable,.availability{margin:10px 0}.endpoint-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:10px}.endpoint-actions .el-button+.el-button{margin-left:0}.refresh{margin-top:10px}
.tips a{display:inline;white-space:nowrap;color:var(--tl-primary);font-weight:500;text-decoration:none;margin-left:6px}.tips a:hover{color:var(--el-color-primary-light-3)}.tips a:focus-visible{outline:2px solid var(--tl-primary);outline-offset:3px}.tips a .el-icon{font-size:14px;vertical-align:-2px}
</style>
