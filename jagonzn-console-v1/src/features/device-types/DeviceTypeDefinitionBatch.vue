<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {typeDeviceUuid} from './type-devices-api'
import {definitionBatchTransport,type DefinitionBatchTransport,type DefinitionBatchRow,type DefinitionBatchIntent} from './model-definition-batch'
const props=withDefaults(defineProps<{typeId:string;typeStatus:string;disabled?:boolean;transport?:DefinitionBatchTransport}>(),{disabled:false,transport:()=>definitionBatchTransport()})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&can('device:read')&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const writable=computed(()=>readable.value&&can('device:update')&&props.typeStatus==='DRAFT'&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
type Result={intent:DefinitionBatchIntent;state:'未执行'|'已删除'|'被拒绝'|'结果未知';message?:string}
const shown=ref(false),busy=ref(false),loading=ref(false),started=ref(false),stop=ref(false),error=ref(''),rows=shallowRef<readonly DefinitionBatchRow[]>([]),selected=ref<string[]>([]),results=ref<Result[]>([]),observation=ref(''),reviewed=ref(false),readBusy=ref(false)
const unknown=computed(()=>results.value.find(row=>row.state==='结果未知')),locked=computed(()=>shown.value||busy.value||!!unknown.value)
function denied(cause:unknown){return cause instanceof ApiError&&[401,403,404].includes(cause.status)&&!cause.outcomeUnknown}
const labels={property:'属性',event:'事件',command:'命令'}
const identity=(row:DefinitionBatchRow)=>`${row.kind}:${row.id}`
let generation=0,alive=true,controller:AbortController|undefined
function reset(){generation++;controller?.abort();shown.value=false;busy.value=false;loading.value=false;started.value=false;stop.value=false;error.value='';rows.value=[];selected.value=[];results.value=[];observation.value='';reviewed.value=false;readBusy.value=false}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:props.typeId}}
function current(s:ReturnType<typeof capture>){return alive&&readable.value&&generation===s.generation&&identityEpoch()===s.epoch&&projectId.value===s.project&&props.typeId===s.type}
async function open(){
 if(!writable.value||props.disabled||locked.value)return
 reset();shown.value=true;loading.value=true;const s=capture();controller=new AbortController()
 try{const actual=await props.transport.load(s.project,s.type,controller.signal);if(current(s))rows.value=actual}
 catch(cause){if(current(s))error.value=errorMessage(cause)}finally{if(current(s))loading.value=false}
}
function close(){if(busy.value||readBusy.value||unknown.value)return;const changed=results.value.some(row=>row.state==='已删除');reset();if(changed)emit('changed')}
async function run(){
 if(!shown.value||started.value||busy.value||loading.value||!writable.value||props.disabled)return
 const chosen=rows.value.filter(row=>selected.value.includes(identity(row)))
 if(!chosen.length||chosen.length>100||chosen.length!==selected.value.length){error.value='请明确选择1至100项定义';return}
 const s=capture();results.value=chosen.map(row=>({intent:props.transport.prepare(s.project,s.type,row),state:'未执行'}));started.value=true;busy.value=true;controller=new AbortController();error.value=''
 try{
  for(const item of results.value){
   if(!current(s)||stop.value||!writable.value||props.disabled)break
   // 每项先检查选择时内容仍在；这是尽力漂移检查，不宣称原DELETE具有CAS或整批事务。
   try{
    const latest=await item.intent.read(controller.signal);if(!current(s)||stop.value||!writable.value||props.disabled)break
    const found=latest.find(row=>row.id===item.intent.row.id)
    if(!found||found.fingerprint!==item.intent.row.fingerprint){item.state='被拒绝';item.message='定义已变化或不存在，未发送删除';break}
   }catch(cause){if(current(s)){item.state='被拒绝';item.message='读取失败，未发送删除：'+errorMessage(cause)}break}
   item.state='结果未知';let accepted=false
   try{
    await item.intent.remove(controller.signal);accepted=true;if(!current(s))break
    const actual=await item.intent.read(controller.signal);if(!current(s))break
    if(actual.some(row=>row.id===item.intent.row.id))throw new Error('删除回执后目标仍可读')
    item.state='已删除'
   }catch(cause){if(current(s)){
    if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,413,422,429].includes(cause.status)&&cause.code!==10014)item.state='被拒绝'
    item.message=errorMessage(cause)
   }break}
  }
 }finally{if(current(s)){busy.value=false;error.value='本批执行已结束；未执行项不会自动继续。'}}
}
async function review(){
 const item=unknown.value;if(!item||!readable.value||busy.value||readBusy.value)return
 const s=capture();readBusy.value=true;reviewed.value=false;observation.value='';controller=new AbortController()
 try{const actual=await item.intent.read(controller.signal);if(current(s)){observation.value=actual.some(row=>row.id===item.intent.row.id)?'当前仍可读此定义。':'当前列表中未见此定义。';reviewed.value=true}}
 catch(cause){if(current(s)){if(denied(cause)){reset();return}observation.value=errorMessage(cause)}}finally{if(current(s))readBusy.value=false}
}
function finishReview(){if(!reviewed.value||busy.value||readBusy.value)return;reset();emit('changed')}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,()=>readable.value],reset,{flush:'sync'})
watch(writable,allowed=>{if(!allowed){stop.value=true;if(!started.value)reset()}},{flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;reset();dispose();emit('locked',false)})
</script>
<template><section class="definition-batch"><el-button v-if="writable" size="small" :disabled="disabled||locked" @click="open">批量删除功能定义</el-button>
 <el-dialog :model-value="shown&&readable" title="逐项删除已选功能定义" width="min(780px,94vw)" :show-close="!busy&&!unknown" :close-on-click-modal="false" :close-on-press-escape="false" :before-close="(done:()=>void)=>{if(!busy&&!unknown){close();done()}}">
  <p>只删除本次明确选择的草稿定义，最多100项。每项独立提交，成功项不会回滚；遇拒绝、未知结果或停止请求即停止后续项。执行前会核对当前内容，但不会锁定定义；请避免同时编辑。</p>
  <el-alert v-if="error" :title="error" type="info" :closable="false"/>
  <template v-if="!started"><p v-if="loading">正在读取三类定义…</p><el-checkbox-group v-else v-model="selected" :disabled="!writable||disabled"><el-checkbox v-for="row in rows" :key="identity(row)" :value="identity(row)">{{labels[row.kind]}} · {{row.name}}（{{row.identifier}}）</el-checkbox></el-checkbox-group><p>已选 {{selected.length}} 项</p></template>
  <ol v-else><li v-for="row in results" :key="identity(row.intent.row)">{{labels[row.intent.row.kind]}} · {{row.intent.row.name}}：{{row.state}}<span v-if="row.message"> · {{row.message}}</span><small v-if="row.state==='结果未知'">原请求键：{{row.intent.key}}</small></li></ol>
  <template v-if="unknown&&!busy"><p>原删除结果未确认，不会重发或继续未执行项。{{observation}}当前存在或缺失都不能证明原请求结果。</p><el-button :loading="readBusy" @click="review">只读核对当前定义</el-button></template>
  <template #footer><el-button v-if="busy" :disabled="stop" @click="stop=true">当前项完成后停止</el-button><el-button v-else-if="unknown" :disabled="!reviewed||readBusy" @click="finishReview">结束核对，保留原结果未知</el-button><el-button v-else @click="close">{{started?'关闭结果':'取消'}}</el-button><el-button v-if="!started" type="danger" :disabled="loading||!writable||disabled||!selected.length||selected.length>100" @click="run">确认逐项删除</el-button></template>
 </el-dialog></section></template>
<style scoped>.definition-batch{margin:18px 0}.definition-batch p{font-size:13px;line-height:21px}.definition-batch .el-checkbox-group{display:flex;flex-direction:column;max-height:360px;overflow:auto}.definition-batch li{margin:10px 0;overflow-wrap:anywhere}.definition-batch small{display:block}</style>
