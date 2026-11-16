<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import {computed,ref,watch,onScopeDispose} from 'vue'
import {DocumentCopy,TopRight} from '@element-plus/icons-vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {onIdentityChange,errorMessage} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {devicesApi} from './api'
import DeviceApplicationMqttLocator from './DeviceApplicationMqttLocator.vue'
import ProjectApplicationConnection from '@/features/projects/ProjectApplicationConnection.vue'
import {useDeviceGuard,isDeviceScopeCurrent} from './use-device-guard'
import {readConnectionAccess,readConnectionEndpoints,connectionEndpoint} from './connection-access-api'
const props=defineProps<{deviceId:string}>()
const capture=useDeviceGuard(()=>props.deviceId)
const allowed=computed(()=>can('device:read')&&can('device:update')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&currentProject.value?.status==='ACTIVE')
const publicAllowed=computed(()=>can('device:read')&&!!session.user?.accountId&&!!projectId.value&&!session.transitioning&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&currentProject.value?.status==='ACTIVE')
const applicationScope=computed(()=>`${session.user?.accountId||''}:${projectId.value}:${props.deviceId}`)
const resource=useResource(signal=>readConnectionAccess(projectId.value,props.deviceId,signal))
const identity=useResource(signal=>devicesApi.profile(projectId.value,props.deviceId,signal))
const endpoints=useResource(signal=>readConnectionEndpoints(projectId.value,props.deviceId,signal))
const legacyCredential=computed(()=>!!resource.error.value&&['当前凭据不支持重复读取，请由管理员重新签发后核对','当前凭据未保存可重复读取的原文副本；本次未重新签发','设备连接凭据暂不可读取，请联系管理员检查连接凭据配置'].includes(errorMessage(resource.error.value)))
// 旧兼容回执不能证明凭据有效；只读查询现有列表后再说明保留原值或主动更换的处理方式。
const credentialState=useResource(async signal=>{
 const device=props.deviceId,rows=await devicesApi.credentials(projectId.value,device,signal)
 if(!Array.isArray(rows)||rows.some(row=>!row||row.deviceId!==device||typeof row.id!=='string'||typeof row.authType!=='string'||row.expiresAt!=null&&(typeof row.expiresAt!=='string'||!Number.isFinite(Date.parse(row.expiresAt)))))throw new Error('凭据状态回执无效')
 return rows.some(row=>row.authType==='ACCESS_TOKEN'&&(row.expiresAt==null||Date.parse(row.expiresAt)>Date.now()))
})
watch([legacyCredential,allowed],()=>{credentialState.clear();if(legacyCredential.value&&allowed.value&&projectId.value&&props.deviceId)void credentialState.reload()},{flush:'sync'})
const copying=ref(false)
let generation=0
function clear(){generation++;resource.clear();identity.clear();endpoints.clear();credentialState.clear();copying.value=false}
const dispose=onIdentityChange(clear)
onScopeDispose(()=>{clear();dispose()})
watch(()=>[projectId.value,props.deviceId,allowed.value,session.user?.accountId],()=>{clear();if(allowed.value&&projectId.value&&props.deviceId)void resource.reload();if(allowed.value&&projectId.value&&props.deviceId)void identity.reload();if(allowed.value&&projectId.value&&props.deviceId)void endpoints.reload()},{immediate:true,flush:'sync'})
async function reload(){generation++;resource.clear();copying.value=false;if(allowed.value)await resource.reload()}
async function reloadEndpoints(){endpoints.clear();if(allowed.value)await endpoints.reload()}
async function copy(kind:'accessToken'|'projectKey'|'projectCode'|'deviceKey'|'mqttHost'|'mqttPort'|'tcpHost'|'tcpPort'|'tcpRegistration'){
 if(!allowed.value||copying.value)return
 if((kind==='accessToken'||kind==='projectKey'||kind==='tcpRegistration')&&!resource.data.value)return
 if((kind==='projectCode'&&!projectCode.value)||(kind==='deviceKey'&&!deviceKey.value))return
 if(kind==='tcpRegistration'&&!tcp.value)return
 const text=kind==='projectCode'?projectCode.value:kind==='deviceKey'?deviceKey.value:kind==='mqttHost'?mqtt.value?.hostname:kind==='mqttPort'?(mqtt.value?port.value:undefined):kind==='tcpHost'?tcp.value?.hostname:kind==='tcpPort'?tcp.value?.port:kind==='tcpRegistration'?`${resource.data.value!.projectKey}&${resource.data.value!.accessToken}`:resource.data.value?.[kind]
 if(!text)return
 const check=capture(),request=generation
 copying.value=true
 try{await navigator.clipboard.writeText(text);if(request===generation&&isDeviceScopeCurrent(check)&&allowed.value)copySucceeded()}
 catch{if(request===generation&&isDeviceScopeCurrent(check)&&allowed.value)copyFailed('复制失败，请检查浏览器剪贴板权限后重试')}
 finally{if(request===generation)copying.value=false}
}
// 新后端同时返回 projectCode；旧响应只有兼容字段 projectKey。
const projectCode=computed(()=>currentProject.value?.projectCode||'')
const deviceKey=computed(()=>identity.data.value?.deviceKey||'')
const mqtt=computed(()=>endpoints.data.value?connectionEndpoint(endpoints.data.value.mqtt,'mqtt'):null)
const port=computed(()=>mqtt.value?.port||'1883')
const tcp=computed(()=>endpoints.data.value?connectionEndpoint(endpoints.data.value.tcp,'tcp'):null)
</script>
<template><section class="connection-access"><h2>设备证书</h2><p v-if="allowed" class="tips">每个设备拥有唯一的 AccessToken，设备连接云平台进行普通身份验证时使用 AccessToken，请妥善保管。 <a href="https://www.thingscloud.xyz/docs/guide/connect-device/device-certificate.html" target="_blank" rel="noopener noreferrer">了解详情 <el-icon><TopRight/></el-icon></a></p><aside v-if="allowed&&legacyCredential" class="credential-note tl-learning-resource" role="note" aria-label="AccessToken 查看说明"><ReferenceIcon glyph="󰘥"/><div><p v-if="credentialState.loading.value" role="status">正在核对凭据状态…</p><template v-else-if="credentialState.error.value"><p role="alert">凭据状态暂时无法确认，请重新核对。</p><el-button size="small" @click="credentialState.reload">重新核对</el-button></template><template v-else-if="credentialState.data.value===true"><p>当前已有有效的 AccessToken，但数据库中未保存对应的加密副本，无法再次读取原文。</p><ul><li>已保存原文：可继续使用原值，无需更换。</li><li>原文已遗失：需由管理员主动更换，并更新设备配置；旧值将失效。</li></ul></template><p v-else>当前未查询到有效的 AccessToken，请由管理员核对签发或到期状态。</p></div></aside><AsyncState v-else :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="reload"><template v-if="resource.data.value">

 <div class="certificate-actions"><el-button size="small" :icon="DocumentCopy" :disabled="copying" @click="copy('accessToken')">复制 AccessToken</el-button><el-button size="small" :icon="DocumentCopy" :disabled="copying" @click="copy('projectKey')">复制 ProjectKey</el-button></div>
</template></AsyncState><AsyncState :forbidden="!allowed" :loading="endpoints.loading.value" :error="endpoints.error.value" @retry="reloadEndpoints"><template v-if="endpoints.data.value"><section class="endpoint"><h2>设备端 MQTT 接入点</h2><p class="tips">MQTT 接入方式为设备和云平台提供双向连接，设备既可上报属性数据，也可接收云端的消息下发。 <a href="http://localhost:4321/docs/device/mqtt" target="_blank" rel="noopener noreferrer">了解详情 <el-icon><TopRight/></el-icon></a></p><pre v-if="mqtt" class="code">{{endpoints.data.value.mqtt}}</pre><p v-else class="unavailable">尚未配置接入点</p>
 <table v-if="mqtt" class="parameters"><tbody><tr><th>MQTT 主机:</th><td><button class="plain-copy" :disabled="copying" @click="copy('mqttHost')">{{mqtt.hostname}} <el-icon><DocumentCopy/></el-icon></button></td></tr><tr><th>MQTT 端口:</th><td><button class="plain-copy" :disabled="copying" @click="copy('mqttPort')">{{port}} <el-icon><DocumentCopy/></el-icon></button></td></tr><tr><th>ProjectCode:</th><td><button v-if="projectCode" class="plain-copy" :disabled="copying" @click="copy('projectCode')">&lt;点此复制&gt; <el-icon><DocumentCopy/></el-icon></button><span v-else class="unavailable-secret">未读取项目标识</span></td></tr><tr><th>DeviceKey:</th><td><button v-if="deviceKey" class="plain-copy" :disabled="copying" @click="copy('deviceKey')">&lt;点此复制&gt; <el-icon><DocumentCopy/></el-icon></button><span v-else class="unavailable-secret">未读取 DeviceKey</span></td></tr></tbody></table></section>
 <section class="endpoint"><h2>设备端 MQTTs TLS 接入点</h2><p class="tips">对于安全要求较高，并且有较多计算资源的设备，可以使用基于 SSL/TLS 的 MQTT 身份验证方式。 <a href="http://localhost:4321/docs/device/mqtt#连接参数" target="_blank" rel="noopener noreferrer">了解详情 <el-icon><TopRight/></el-icon></a></p><pre v-if="endpoints.data.value.mqttTls" class="code">{{endpoints.data.value.mqttTls}}</pre><p v-else class="unavailable">尚未配置接入点</p></section>
 <section class="endpoint"><h2>设备端 HTTP 接入点</h2><p class="tips">HTTP 接入方式较为简单快捷，适用于只上报数据，而不需要云端控制的设备。 <a href="http://localhost:4321/docs/device/protocols#https-上报" target="_blank" rel="noopener noreferrer">了解详情 <el-icon><TopRight/></el-icon></a></p><pre v-if="endpoints.data.value.http" class="code">{{endpoints.data.value.http}}</pre><p v-else class="unavailable">尚未配置接入点</p></section>
 <section class="endpoint"><h2>设备端 HTTPs 接入点</h2><p class="tips">HTTPs 接入方式在 HTTP 基础上提供了 SSL 证书加密通信，要求硬件设备支持 SSL。 <a href="http://localhost:4321/docs/device/protocols#https-上报" target="_blank" rel="noopener noreferrer">了解详情 <el-icon><TopRight/></el-icon></a></p><pre v-if="endpoints.data.value.https" class="code">{{endpoints.data.value.https}}</pre><p v-else class="unavailable">尚未配置接入点</p></section>
 <section class="endpoint"><h2>设备端 TCP 接入点</h2><p class="tips">TCP 接入方式为设备提供了最原始的 TCP/IP 传输方式，支持 ASCII、HEX、JSON 等有效负载，适合一些自定义协议的通信场景，也适用于 TCP 透传方式。连接时需启用 TLS 加密。 <a href="http://localhost:4321/docs/device/protocols#tcp-与-coap-客户端" target="_blank" rel="noopener noreferrer">了解详情 <el-icon><TopRight/></el-icon></a></p><pre v-if="tcp" class="code">{{endpoints.data.value.tcp}}</pre><p v-else class="unavailable">尚未配置接入点</p><table v-if="tcp" class="parameters tcp-parameters"><tbody><tr><th>TCP 地址:</th><td><button class="plain-copy" aria-label="复制 TCP 地址" :disabled="copying" @click="copy('tcpHost')">{{tcp.hostname}} <el-icon><DocumentCopy/></el-icon></button></td></tr><tr v-if="tcp.port"><th>TCP 端口:</th><td><button class="plain-copy" aria-label="复制 TCP 端口" :disabled="copying" @click="copy('tcpPort')">{{tcp.port}} <el-icon><DocumentCopy/></el-icon></button></td></tr><tr><th>注册包:</th><td><button v-if="resource.data.value" class="secret-copy" aria-label="复制 TCP 注册包" :disabled="copying" @click="copy('tcpRegistration')">&lt;点此复制&gt; <el-icon><DocumentCopy/></el-icon></button><span v-else class="unavailable-secret">未获取设备证书</span></td></tr></tbody></table></section>
</template></AsyncState><ProjectApplicationConnection v-if="publicAllowed" :key="applicationScope" presentation="api" reference class="application-api-section"/><DeviceApplicationMqttLocator :device-id="deviceId" reference/></section></template>
<style scoped>
.credential-note{margin-top:12px}.credential-note p{margin:0}.credential-note ul{margin:6px 0 0;padding-left:20px;list-style:disc}.credential-note .el-button{margin-top:8px}

.application-api-section{margin-top:40px}
.connection-access h2{margin:10px 0 0;font-size:22px;line-height:32px;font-weight:400;color:#002822}.tips{margin:8px 0 0;font-size:15px;line-height:22px;color:#888}.certificate-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:10px 0 0}.certificate-actions .el-button+.el-button{margin-left:0}.endpoint{margin-top:40px}.code{margin:12px 0 0;padding:10px;background:#464646;color:#fff;font:500 14px/20px 'Andale Mono',Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.parameters{margin-top:10px;width:100%;border-collapse:collapse;font-size:14px;line-height:23px;color:#606266}.parameters th,.parameters td{padding:5px 0;border-bottom:1px solid #ebeef5;text-align:left}.parameters th{width:120px;font-weight:600}.secret-copy,.plain-copy{display:inline-flex;align-items:center;gap:6px;border:0;padding:0;background:transparent;color:#909399;font:inherit;cursor:pointer}.plain-copy{color:#606266}.secret-copy:focus-visible,.plain-copy:focus-visible{outline:2px solid var(--tl-primary);outline-offset:3px}.secret-copy:disabled,.plain-copy:disabled{cursor:wait}.unavailable-secret{color:#909399}.unavailable{font-size:14px;color:#909399}.unavailable{margin:10px 0}
.tips a{display:inline;white-space:nowrap;color:var(--tl-primary);font-weight:500;text-decoration:none;margin-left:6px}.tips a:hover{color:var(--el-color-primary-light-3)}.tips a:focus-visible{outline:2px solid var(--tl-primary);outline-offset:3px}.tips a .el-icon{font-size:14px;vertical-align:-2px}
</style>
