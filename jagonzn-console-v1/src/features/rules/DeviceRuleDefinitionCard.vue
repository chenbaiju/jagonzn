<script setup lang="ts">
import {computed,nextTick,onScopeDispose,ref,watch} from 'vue'
import {useRouter} from 'vue-router'
import {InfoFilled} from '@element-plus/icons-vue'
import {can,projectId} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import {ruleKindLabels} from './rule-builder-draft'
import {ruleParticipation,type DeviceRuleDefinition,type DeviceRuleDefinitionPort} from './device-rule-definition-port'
const props=defineProps<{row:DeviceRuleDefinition;deviceId:string;transport:DeviceRuleDefinitionPort;refreshContext:()=>Promise<void>}>()
const emit=defineEmits<{busy:[id:string,value:boolean];denied:[cause:ApiError]}>()
const router=useRouter(),writing=ref(false),checking=ref(false),locked=ref(false),writeError=ref(''),notice=ref('')
const allowed=computed(()=>!!projectId.value&&can('rule:manage')),busy=computed(()=>writing.value||checking.value||locked.value),relation=computed(()=>({DEVICE:'设备',DEVICE_TYPE:'设备类型',LEGACY_PROJECT:''}[props.row.deviceSource.kind]))
let active=true,generation=0
function invalidate(){generation++;writing.value=false;writeError.value='';notice.value='';resource.clear()}
const resource=useResource(async signal=>ruleParticipation(await props.transport.preference(projectId.value,props.row.id,props.deviceId,props.row.definitionVersion,signal),props.deviceId,props.row.definitionVersion))
const dispose=onIdentityChange(()=>{checking.value=false;locked.value=false;invalidate()});onScopeDispose(()=>{active=false;generation++;dispose()})
watch([projectId,()=>props.deviceId,()=>props.row.id,()=>props.row.definitionVersion],(current,previous)=>{const same=!!previous&&current.slice(0,3).every((value,index)=>value===previous[index]);const retain=same&&(writing.value||checking.value||locked.value);invalidate();if(!same)checking.value=false;locked.value=retain;if(allowed.value&&!checking.value)void resource.reload()},{immediate:true})
watch(allowed,value=>{invalidate();if(value&&!locked.value)void resource.reload()})
watch(busy,value=>emit('busy',props.row.id,value),{immediate:true,flush:'sync'})
function denied(cause:unknown){if(cause instanceof ApiError&&[401,403,404].includes(cause.status))emit('denied',cause)}
watch(resource.error,denied)
async function change(value:boolean){
 const currentValue=resource.data.value
 if(!allowed.value||busy.value||resource.loading.value||!currentValue||typeof value!=='boolean'||currentValue.allowed===value)return
 const project=projectId.value,device=props.deviceId,rule=props.row.id,definition=props.row.definitionVersion,epoch=identityEpoch(),turn=generation
 const current=()=>active&&turn===generation&&epoch===identityEpoch()&&project===projectId.value&&device===props.deviceId&&rule===props.row.id&&definition===props.row.definitionVersion&&allowed.value
 writing.value=true;writeError.value='';notice.value=''
 try{
  const result=await props.transport.change(project,rule,device,definition,currentValue.version,value);if(!current())return
  const verified=ruleParticipation(result,device,definition)
  if(verified.allowed!==value||verified.version!==currentValue.version+1)throw new Error('设备规则参与变更回执不匹配，请先核对')
  resource.data.value=verified;notice.value=value?'已允许该设备使用规则':'已禁止该设备使用规则'
 }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){writeError.value=errorMessage(cause);locked.value=!(cause instanceof ApiError)||cause.outcomeUnknown||![400,401,403,404].includes(cause.status);denied(cause)}}
 finally{if(current())writing.value=false}
}
async function verify(){
 if(!allowed.value||writing.value||checking.value)return
 // 原卡片跨父定义回读保留；最新CAS的偏好也成功后，才解除未知锁。
 const project=projectId.value,device=props.deviceId,rule=props.row.id,epoch=identityEpoch()
 const sameObject=()=>active&&epoch===identityEpoch()&&project===projectId.value&&device===props.deviceId&&rule===props.row.id&&allowed.value
 checking.value=true;writing.value=true
 try{await props.refreshContext();await nextTick();if(!sameObject())return;const turn=generation;await resource.reload();if(sameObject()&&turn===generation&&!resource.error.value&&resource.data.value){locked.value=false;writeError.value='';notice.value=''}}
 catch(cause){if(sameObject()&&!(cause instanceof IdentityChanged)){locked.value=true;writeError.value=errorMessage(cause);denied(cause)}}
 finally{if(sameObject()){writing.value=false;checking.value=false}}
}
function detail(){if(allowed.value&&!busy.value)void router.push({path:`/rules/messages/${props.row.id}`,query:{source:'device',deviceId:props.deviceId}})}
</script>
<template><article class="device-rule-card">
 <header><button type="button" class="definition-name" :disabled="busy" @click="detail">{{row.name}}</button><span class="definition-status">{{row.status==='ACTIVE'?'已启用':'未启用'}}</span></header>
 <p class="definition-kind">{{row.ruleType?ruleKindLabels[row.ruleType].label:'类型未记录'}}{{relation?' - '+relation:''}}</p><p class="definition-version">版本 {{row.versionNumber}}</p>
 <footer><span>允许该设备 <el-tooltip content="设置是否允许当前设备使用该规则。"><el-icon aria-label="设备规则参与说明"><InfoFilled/></el-icon></el-tooltip></span><el-switch v-if="resource.data.value" :model-value="resource.data.value.allowed" :disabled="!allowed||busy||resource.loading.value" aria-label="允许该设备使用规则" @update:model-value="change(!!$event)"/><span v-else>未确认</span></footer>
 <AsyncState v-if="resource.error.value" :error="resource.error.value" @retry="resource.reload()"/>
 <p v-if="writeError" role="alert">{{writeError}}</p><p v-if="notice" role="status">{{notice}}</p><el-button v-if="locked" size="small" :disabled="writing||checking" @click="verify">重新读取核对</el-button>
</article></template>
<style scoped>
.device-rule-card{border:1px solid var(--tl-border);padding:16px 20px;background:#fff;min-width:0}.device-rule-card header{display:flex;gap:10px;justify-content:space-between;align-items:flex-start}.definition-name{padding:0;border:0;background:none;color:#333;font:inherit;font-size:16px;font-weight:600;text-align:left;cursor:pointer;overflow-wrap:anywhere}.definition-name:disabled{cursor:default}.definition-status{flex:none;color:#999;font-size:12px;line-height:22px}.definition-kind,.definition-version{margin:5px 0;color:#888;font-size:13px;overflow-wrap:anywhere}.device-rule-card footer{margin-top:18px;border-top:1px solid #eee;padding-top:10px;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#999;gap:12px}.device-rule-card footer>span{display:inline-flex;gap:5px;align-items:center}.device-rule-card p[role]{font-size:13px;overflow-wrap:anywhere}
</style>
