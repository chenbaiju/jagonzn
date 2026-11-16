<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import type {ActionDraft} from './RuleActionsEditor.vue'
import {ExactDecimal,validUnicode,type ExactJson} from './preprocess-exact-json'
const props=withDefaults(defineProps<{action:ActionDraft;disabled?:boolean;validationError?:string;top?:string;triggerKind?:string}>(),{disabled:false,triggerKind:'EVENT_RPT'})
const emit=defineEmits<{save:[action:ActionDraft];cancel:[];busy:[value:boolean]}>()
const url=ref(''),ignoreSsl=ref(false),host=ref(''),port=ref(''),clientId=ref(''),username=ref(''),topic=ref(''),messageFormat=ref(''),password=ref(''),clearing=ref(false),error=ref('')
const replacement=ref<Extract<NonNullable<ActionDraft['credential']>,{mode:'REPLACE'}>>()
const mqtt=computed(()=>props.action.nodeType==='external-mqtt-forward-action'),configured=computed(()=>props.action.config.credentialConfigured===true),messageName=computed(()=>props.triggerKind==='ATTRS_RPT'?'属性':'事件')
const text=(value:ExactJson|undefined)=>typeof value==='string'?value:''
function integer(value:ExactJson|undefined){return value instanceof ExactDecimal?value.expanded():''}
function route(value:Record<string,ExactJson>){return JSON.stringify([text(value.host),integer(value.port),Object.hasOwn(value,'clientId')?[text(value.clientId)]:null,Object.hasOwn(value,'username')?[text(value.username)]:null,text(value.topic),value.tls])}
let initialRoute='',initialUrl='',hasInitialRoute=false
function wipe(){password.value='';replacement.value=undefined;clearing.value=false}
function reset(){const config=props.action.config;wipe();url.value=text(config.url);initialUrl=url.value;ignoreSsl.value=config.ignoreSslError===true;host.value=text(config.host);port.value=integer(config.port);clientId.value=text(config.clientId);username.value=text(config.username);topic.value=text(config.topic);messageFormat.value=text(config.messageFormat);initialRoute=route(config);hasInitialRoute=!!host.value&&!!port.value&&!!topic.value;error.value='';emit('busy',false)}
watch(()=>props.action,reset,{immediate:true,deep:true})
watch(password,value=>{if(value){clearing.value=false;replacement.value={mode:'REPLACE',writeId:crypto.randomUUID(),value}}else replacement.value=undefined})
function clearPassword(){if(props.disabled)return;const next=!clearing.value;password.value='';replacement.value=undefined;clearing.value=next;error.value=''}
function cancel(){if(props.disabled)return;wipe();error.value='';emit('cancel')}
function validText(value:string){return validUnicode(value)&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value)}
function save(){
 if(props.disabled)return
 try{
  if(!['SIMPLE','ADVANCED'].includes(messageFormat.value))throw new Error('请选择转发消息格式')
  const config:Record<string,ExactJson>={...props.action.config,messageFormat:messageFormat.value}
  let credential=props.action.credential
  if(!mqtt.value){
   if(props.action.nodeType!=='external-url-forward-action')throw new Error('操作类型不匹配')
   if(ignoreSsl.value)throw new Error('转发必须校验 SSL 证书，请关闭“忽略 SSL 证书验证”。')
   let parsed:URL;try{parsed=new URL(url.value)}catch{throw new Error('请填写正确的 HTTPS URL')}
   if(!validText(url.value)||url.value!==url.value.trim()||parsed.protocol!=='https:'||parsed.username||parsed.password||/^[^:]+:\/\/[^/?#]*@/.test(url.value)||url.value.includes('?')||url.value.includes('#'))throw new Error('请填写 HTTPS URL，不支持用户信息、查询参数或片段')
   config.url=url.value;config.ignoreSslError=false
   if(url.value!==initialUrl){delete config.targetRef;delete config.targetDigest}
   credential=undefined
  }else{
   if(!host.value||!validText(host.value)||host.value!==host.value.trim()||/[\s/\\?#@]/u.test(host.value)||host.value.includes('://'))throw new Error('请填写 MQTT 服务器主机名或 IP，不包含协议或路径')
   if(!/^[1-9][0-9]{0,4}$/.test(port.value)||Number(port.value)>65535)throw new Error('请填写1至65535的整数端口号')
   if(!topic.value.trim()||!validText(topic.value)||!validText(clientId.value)||!validText(username.value))throw new Error('请填写发布到 topic，并检查 client ID 和 username')
   config.host=host.value;config.port=new ExactDecimal(port.value);config.topic=topic.value;config.tls=true
   if(clientId.value===''&&props.action.config.clientId!=='')delete config.clientId;else config.clientId=clientId.value
   if(username.value===''&&props.action.config.username!=='')delete config.username;else config.username=username.value
   const changed=(hasInitialRoute||!!config.credentialRef||!!config.credentialWriteId||!!config.targetDigest)&&route(config)!==initialRoute
   if(password.value&&(!validUnicode(password.value)||password.value.includes('\0')||new TextEncoder().encode(password.value).length>1024))throw new Error('密码最多1024个UTF8字节，不能包含NUL或不完整字符')
   const choice=clearing.value?{mode:'CLEAR' as const}:replacement.value
   if(changed&&!choice)throw new Error('连接或发布目标已修改，请重新输入密码或明确选择清除密码')
   if(changed){delete config.credentialRef;delete config.credentialWriteId;delete config.targetDigest}
   if(choice){credential=choice;delete config.credentialRef;delete config.credentialWriteId;config.credentialConfigured=choice.mode==='REPLACE'}
  }
  const result:ActionDraft={...props.action,config}
  if(credential)result.credential={...credential};else delete result.credential
  error.value='';emit('save',result)
 }catch(cause){error.value=cause instanceof Error?cause.message:'请检查操作配置'}
}
onScopeDispose(()=>{wipe();emit('busy',false)})
</script>
<template><el-dialog :model-value="true" title="配置操作" :top="top" :lock-scroll="top===undefined" width="800px" class="rule-external-action-dialog" :close-on-click-modal="false" :close-on-press-escape="!disabled" :show-close="!disabled" :before-close="cancel" append-to-body>
 <el-form label-position="top" :disabled="disabled" @submit.prevent="save">
  <template v-if="!mqtt"><el-form-item label="推送URL"><el-input v-model="url" aria-label="推送URL"/></el-form-item>
   <el-form-item label="转发消息格式"><el-radio-group v-model="messageFormat" aria-label="转发消息格式"><el-radio value="SIMPLE">简单格式<el-tooltip :content="'只推送'+messageName+'消息。'"><span class="help-mark" tabindex="0">?</span></el-tooltip></el-radio><el-radio value="ADVANCED">高级格式<el-tooltip :content="'推送'+messageName+'消息和设备信息。'"><span class="help-mark" tabindex="0">?</span></el-tooltip></el-radio></el-radio-group></el-form-item>
   <el-form-item label="忽略 SSL 证书验证"><el-switch v-model="ignoreSsl" aria-label="忽略 SSL 证书验证"/><p class="security-note">转发仅支持 HTTPS，并始终校验 SSL 证书。</p></el-form-item>
  </template>
  <template v-else><el-form-item label="MQTT 服务器主机名/IP"><el-input v-model="host" aria-label="MQTT 服务器主机名/IP"/><p class="security-note">MQTT 转发使用 TLS，并校验服务器证书。</p></el-form-item>
   <el-form-item label="MQTT 服务器端口"><el-input v-model="port" inputmode="numeric" aria-label="MQTT 服务器端口"/></el-form-item>
   <el-form-item label="client ID"><el-input v-model="clientId" aria-label="client ID"/></el-form-item>
   <el-form-item label="username"><el-input v-model="username" aria-label="username"/></el-form-item>
   <el-form-item label="password"><el-input v-model="password" type="password" autocomplete="new-password" aria-label="password" :placeholder="configured?'已配置，留空保持不变':''"/><div class="password-state"><span v-if="clearing">已选择清除密码</span><span v-else-if="configured">已配置</span><el-button link size="small" :disabled="disabled" @click="clearPassword">{{clearing?'撤销清除':'清除密码'}}</el-button></div></el-form-item>
   <el-form-item label="发布到 topic"><el-input v-model="topic" aria-label="发布到 topic"/></el-form-item>
   <el-form-item label="转发消息格式"><el-radio-group v-model="messageFormat" aria-label="转发消息格式"><el-radio value="SIMPLE">简单格式<el-tooltip :content="'只推送'+messageName+'消息。'"><span class="help-mark" tabindex="0">?</span></el-tooltip></el-radio><el-radio value="ADVANCED">高级格式<el-tooltip :content="'推送'+messageName+'消息和设备信息。'"><span class="help-mark" tabindex="0">?</span></el-tooltip></el-radio></el-radio-group></el-form-item>
  </template>
 </el-form><el-alert v-if="error" :title="error" type="warning" :closable="false"/>
 <el-alert v-if="validationError" :title="validationError" type="warning" :closable="false"/><template #footer><el-button :disabled="disabled" @click="cancel">取消</el-button><el-button type="primary" :disabled="disabled" @click="save">保存</el-button></template>
</el-dialog></template>
<style scoped>
.rule-external-action-dialog .el-form-item{margin-bottom:22px}.rule-external-action-dialog :deep(.el-form-item__label){font-size:14px;font-weight:400;color:#606266;line-height:40px;padding-bottom:10px}.rule-external-action-dialog :deep(.el-input__wrapper){height:40px;min-height:40px;padding:0 15px}.rule-external-action-dialog :deep(.el-input__inner){font-size:14px;color:#606266}.rule-external-action-dialog .el-radio{font-size:14px;color:#606266}.security-note{width:100%;font-size:13px;line-height:20px;color:#909399;margin:8px 0 0}.password-state{display:flex;align-items:center;gap:12px;min-height:26px;width:100%;font-size:13px;color:#909399}.password-state .el-button{margin-left:0}.help-mark{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1px solid #909399;border-radius:50%;font-size:11px;line-height:12px;color:#909399;margin-left:5px}
</style>
