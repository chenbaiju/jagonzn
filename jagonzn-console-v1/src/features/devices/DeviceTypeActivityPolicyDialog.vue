<script setup lang="ts">
import {computed,defineComponent,h,onBeforeUnmount,onMounted,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ElDialog} from 'element-plus'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {decodeActivityPolicy,policyId,policyReceiptMatches,prepareActivityPolicy,readActivityPolicy,writeActivityPolicy,type ActivityPolicy,type ActivityPolicyIntent} from './device-type-activity-policy-api'
const props=defineProps<{disabled?:boolean;inline?:boolean;typeId?:string;typeName?:string}>()
const InlinePolicy=defineComponent({inheritAttrs:false,setup(_,{slots}){return()=>h('section',{class:'inline-activity-policy'},[slots.default?.(),h('footer',slots.footer?.())])}})
const emit=defineEmits<{locked:[boolean];changed:[]}>()
const shown=ref(false),name=ref(''),type=ref(''),draft=ref(''),busy=ref(false),error=ref(''),denied=ref(false),notice=ref('')
const snapshot=shallowRef<ActivityPolicy>(),observed=shallowRef<ActivityPolicy>(),intent=shallowRef<ActivityPolicyIntent>()
const review=ref<'rejected'|'unknown'>()
const memberRoles=['OWNER','ADMIN','OPERATOR','VIEWER']
const readScope=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&!!projectId.value&&!!currentProject.value&&memberRoles.includes(session.user?.projectRole||'')&&memberRoles.includes(currentProject.value?.myRole||''))
const readable=computed(()=>readScope.value&&!denied.value)
const writable=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const locked=computed(()=>(shown.value&&!props.inline)||busy.value||review.value==='unknown')
const navigationBlocked=computed(()=>busy.value||review.value==='unknown')
let generation=0,sequence=0,disposed=false,controller:AbortController|undefined
function reset(){generation++;sequence++;controller?.abort();shown.value=false;type.value='';name.value='';draft.value='';snapshot.value=undefined;observed.value=undefined;intent.value=undefined;review.value=undefined;busy.value=false;error.value='';notice.value='';denied.value=false}
function capture(){return{generation,sequence:++sequence,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId,type:type.value}}
function current(s:ReturnType<typeof capture>){return !disposed&&s.generation===generation&&s.sequence===sequence&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.account===session.user?.accountId&&s.type===type.value&&readable.value}
function reject(cause:unknown){if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){reset();denied.value=true}error.value=errorMessage(cause)}
async function read(){
 if(!readable.value||busy.value||!type.value)return
 const s=capture();controller?.abort();controller=new AbortController();busy.value=true;error.value=''
 if(review.value)observed.value=undefined;else snapshot.value=undefined
 try{const value=decodeActivityPolicy(await readActivityPolicy({project:s.project,type:s.type},controller.signal),s.type);if(!current(s))return
  if(review.value)observed.value=value;else{snapshot.value=value;draft.value=value.activeTimeoutMinutes===null?'':String(value.activeTimeoutMinutes)}
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged))reject(cause)}finally{if(current(s))busy.value=false}
}
async function open(id:string,label:string){
 if(props.disabled||!readable.value||busy.value||!policyId(id)||!label)return
 if(review.value==='unknown'){shown.value=true;return}
 reset();type.value=id;name.value=label;shown.value=true;await read()
}
function close(){if(busy.value)return;if(props.inline){if(review.value)return;draft.value=snapshot.value?.activeTimeoutMinutes===null?'':String(snapshot.value?.activeTimeoutMinutes??'');error.value='';return}if(review.value==='unknown')shown.value=false;else reset()}
function setDraft(value:string){if(!props.disabled&&shown.value&&!busy.value&&!review.value&&writable.value&&snapshot.value)draft.value=value}
async function save(){
 if(props.disabled||!shown.value||!writable.value||busy.value||review.value||!snapshot.value)return
 let chosen:ActivityPolicyIntent
 try{chosen=prepareActivityPolicy({project:projectId.value,type:type.value},snapshot.value,draft.value)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=chosen;review.value='unknown';observed.value=undefined;error.value='';busy.value=true
 const s=capture();controller=new AbortController()
 try{const value=decodeActivityPolicy(await writeActivityPolicy(chosen,controller.signal),chosen.type);if(!current(s)||!writable.value)return
  if(!policyReceiptMatches(value,chosen))throw new Error('保存回执与本次类型、阈值或版本不符，请读取当前策略核对')
  if(props.inline){snapshot.value=value;draft.value=value.activeTimeoutMinutes===null?'':String(value.activeTimeoutMinutes);observed.value=undefined;intent.value=undefined;review.value=undefined}else reset();notice.value='类型活跃设置已保存';emit('changed')
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){reject(cause);return}
  review.value=cause instanceof ApiError&&!cause.outcomeUnknown&&[400,409,413,422,429].includes(cause.status)?'rejected':'unknown';error.value=errorMessage(cause)
 }}finally{if(current(s))busy.value=false}
}
function rebase(){if(review.value!=='rejected'||!observed.value||!writable.value||busy.value)return;snapshot.value=observed.value;observed.value=undefined;intent.value=undefined;review.value=undefined;error.value=''}
function finish(){if(review.value==='unknown'&&observed.value&&!busy.value){if(props.inline){snapshot.value=observed.value;draft.value=observed.value.activeTimeoutMinutes===null?'':String(observed.value.activeTimeoutMinutes);observed.value=undefined;intent.value=undefined;review.value=undefined;error.value=''}else reset();notice.value='已结束本次核对；原保存结果仍未确认'}}
function restart(){reset();if(props.inline&&readable.value&&typeof props.typeId==='string'&&policyId(props.typeId)&&props.typeName){type.value=props.typeId;name.value=props.typeName;shown.value=true;void read()}}
const dispose=onIdentityChange(reset)
watch([()=>projectId.value,()=>session.user?.accountId,()=>readScope.value],restart,{flush:'sync'})
/** 同项目仍可读时，权限或生命周期变化不能抹掉已发出写入的未知原件；新写仍由writable准入。 */
watch(()=>[session.user?.projectRole,currentProject.value?.myRole,currentProject.value?.status],()=>{
 if(review.value==='unknown'&&readScope.value)return
 restart()
},{flush:'sync'})
watch([()=>props.inline,()=>props.typeId,()=>props.typeName],restart,{immediate:true,flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
onBeforeRouteLeave(()=>!navigationBlocked.value);onBeforeRouteUpdate(to=>!navigationBlocked.value)
function beforeUnload(event:BeforeUnloadEvent){if(navigationBlocked.value){event.preventDefault();event.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',beforeUnload))
onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload))
onScopeDispose(()=>{disposed=true;reset();dispose();emit('locked',false)})
defineExpose({open})
</script>
<template>
 <p v-if="notice" role="status">{{notice}}</p><p v-if="error&&!shown" role="alert">{{error}}</p>
 <el-button v-if="review==='unknown'&&!shown" size="small" @click="shown=true">核对类型活跃设置</el-button>
 <component :is="inline?InlinePolicy:ElDialog" v-if="!inline||shown" :model-value="shown" title="类型活跃设置" width="min(520px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :before-close="(done:()=>void)=>{if(!busy){close();done()}}" destroy-on-close>
  <template v-if="!inline"><p>设备类型：{{name}}</p><p>修改会影响该类型的全部设备。</p></template>
  <p v-if="!inline" class="policy-boundary">活跃依据已观测的合格通信；不活跃仅在来源窗口完整时判定，从未上报按不活跃处理，观察缺失或能力不完整不判定；具体筛选以当前目录能力为准。</p>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="review">
   <p role="status">{{review==='unknown'?'保存结果尚未确认；只读取当前策略，不会重新提交。':'本次保存被拒绝；原草稿已保留，请读取当前策略核对。'}}</p>
   <p>原草稿：{{intent?.minutes}} 分钟；基准版本 {{intent?.expectedVersion}}</p>
   <p v-if="observed">当前阈值：{{observed.activeTimeoutMinutes??'未配置'}}；当前版本 {{observed.version}}。当前值不证明原请求的历史结果。</p>
  </template>
  <template v-else-if="snapshot"><el-form label-position="top" @submit.prevent="save"><el-form-item :label="inline?'活跃超时时间（分钟）':'活跃超时（分钟）'"><el-input :model-value="draft" aria-label="活跃超时分钟" inputmode="numeric" maxlength="4" placeholder="请输入1至5000的整数" :disabled="disabled||busy||!writable" @update:model-value="setDraft"/></el-form-item></el-form><p v-if="!snapshot.configured">尚未配置活跃阈值。</p><p v-if="!writable">当前账号或项目状态只允许查看。</p></template>
  <p v-else-if="busy">正在读取当前策略…</p>
  <template #footer><el-button v-if="!inline||!review" :disabled="busy" @click="close">{{review?'关闭':'取消'}}</el-button>
   <template v-if="review"><el-button :loading="busy" @click="read">读取当前策略</el-button><el-button v-if="review==='rejected'&&observed&&writable" :disabled="busy" type="primary" @click="rebase">使用当前版本继续编辑</el-button><el-button v-if="review==='unknown'" :disabled="busy||!observed" type="primary" @click="finish">已核对，结束本次操作</el-button></template>
   <template v-else><el-button v-if="!snapshot&&!busy" @click="read">重新读取策略</el-button><el-button v-if="writable" type="primary" :loading="busy" :disabled="disabled||!snapshot||busy" @click="save">{{inline?'保存活跃超时':'保存'}}</el-button></template>
  </template>
 </component>
</template>
<style scoped>.policy-boundary{font-size:13px;color:var(--tl-muted);line-height:1.6}</style>
