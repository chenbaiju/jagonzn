<script setup lang="ts">
import {computed,onScopeDispose,reactive,ref,watch} from 'vue'
import {can,projectId} from '@/core/session'
import {IdentityChanged,ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {cas,ruleActions,validateRule} from './models'
import {definitionUuid} from './device-task-definition-port'
import type {DeviceRuleDefinitionPort} from './device-rule-definition-port'
const props=defineProps<{deviceId:string;deviceName?:string;transport:DeviceRuleDefinitionPort;initialState?:'DRAFT'|'PAUSED'}>()
const emit=defineEmits<{close:[];created:[id:string];busy:[value:boolean];locked:[value:boolean]}>()
const initial=computed(()=>props.initialState||'DRAFT')
const form=reactive({name:'',description:'',source:'',actions:'[]'}),busy=ref(false),unknown=ref(false),error=ref('')
let generation=0,active=true,controller:AbortController|undefined
function invalidate(){generation++;controller?.abort();busy.value=false;emit('busy',false);emit('close')}
watch(unknown,value=>emit('locked',value),{immediate:true})
const dispose=onIdentityChange(invalidate);onScopeDispose(()=>{active=false;generation++;controller?.abort();dispose()})
watch([projectId,()=>props.deviceId,()=>can('rule:manage')],invalidate)
function canonical(value:unknown):string{
 if(typeof value==='number'&&(!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value)))throw new Error('动作参数含无法精确提交的数字')
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}'
 return JSON.stringify(value)
}
function definition(value:Schema<'MessageRuleView'>,body:Schema<'MessageRuleWriteRequest'>,id?:string){
 if(!value||!definitionUuid(value.id)||id&&value.id!==id||value.status!==initial.value||(initial.value==='PAUSED'?!definitionUuid(value.activeVersionId):value.activeVersionId!=null)||value.name!==body.name||(value.description??'')!==(body.description??'')||cas(value.version)!==1)throw new Error('规则创建定义回执不一致，请核对后再操作')
 return value.id
}
async function submit(){
 if(busy.value||unknown.value||!can('rule:manage')||!projectId.value)return
 const project=projectId.value,device=props.deviceId,epoch=identityEpoch(),turn=generation,current=()=>active&&turn===generation&&epoch===identityEpoch()&&project===projectId.value&&device===props.deviceId&&can('rule:manage')
 let attempted=false,accepted=false
 try{
  if(!props.transport.create||!props.transport.definition||!props.transport.history||!definitionUuid(device))throw new Error('当前设备规则创建入口不可用')
  const body=validateRule({name:form.name.trim(),description:form.description.trim()||undefined,source:form.source,actions:ruleActions(JSON.parse(form.actions))});canonical(body.actions)
  busy.value=true;emit('busy',true);error.value='';controller=new AbortController();attempted=true
  const saved=await props.transport.create(project,device,body);accepted=true;if(!current())return
  const id=definition(saved,body),readback=await props.transport.definition(project,id,controller.signal);if(!current())return;definition(readback,body,id);if(initial.value==='PAUSED'&&readback.activeVersionId!==saved.activeVersionId)throw new Error('规则创建版本指针回读不一致，请核对后再操作')
  const history=await props.transport.history(project,id,controller.signal);if(!current())return
  if(!history||typeof history!=='object'||!('items' in history)||!Array.isArray(history.items)||history.items.length!==1||!('nextCursor' in history)||history.nextCursor!=null)throw new Error('规则已创建但首版本回读不完整，请勿重复创建')
  const version=history.items[0]
  if(!version||!definitionUuid(version.id)||version.versionNumber!==1||initial.value==='PAUSED'&&version.id!==readback.activeVersionId||version.source!==body.source||canonical(version.actions)!==canonical(body.actions)||version.deviceSource?.kind!=='DEVICE'||version.deviceSource.referenceId!==device)throw new Error('规则已创建但设备来源或源码回读不一致，请勿重复创建')
  emit('created',id)
 }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){error.value=errorMessage(cause);unknown.value=accepted||attempted&&(!(cause instanceof ApiError)||cause.outcomeUnknown||![400,401,403,404,409].includes(cause.status))}}
 finally{if(current()){busy.value=false;controller=undefined;emit('busy',false)}}
}
function close(){if(!busy.value&&!unknown.value)emit('close')}
defineExpose({requestClose:close})
</script>
<template><section class="device-rule-create-form">
 <el-form label-position="top" :disabled="busy||unknown" @submit.prevent="submit"><el-form-item label="规则名称"><el-input v-model="form.name" aria-label="新规则名称" maxlength="128"/></el-form-item><el-form-item label="来源设备">{{deviceName||deviceId}}</el-form-item><el-form-item label="规则源码"><el-input v-model="form.source" aria-label="新规则源码" type="textarea" :rows="8"/></el-form-item><el-form-item label="完整动作集合（JSON）"><el-input v-model="form.actions" aria-label="新规则动作" type="textarea" :rows="4"/></el-form-item><el-form-item label="规则描述（选填）"><el-input v-model="form.description" aria-label="新规则描述" type="textarea" maxlength="512"/></el-form-item></el-form>
 <el-alert v-if="error" :title="error" type="warning" :closable="false"/><el-alert v-if="unknown" title="规则创建结果待核对，请先检查规则记录，不要重复创建。" type="warning" :closable="false"/><p class="tl-muted">{{initial==='PAUSED'?'创建后保持未启用，可从设备规则页查看并按需启用。':'创建草稿后前往详情，确认后再启用。'}}</p>
 <footer class="create-actions"><el-button :disabled="busy||unknown" @click="close">取消</el-button><el-button type="primary" :loading="busy" :disabled="busy||unknown" @click="submit">创建</el-button></footer>

</section></template>
<style scoped>
.create-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.create-actions .el-button+.el-button{margin-left:0}
</style>
