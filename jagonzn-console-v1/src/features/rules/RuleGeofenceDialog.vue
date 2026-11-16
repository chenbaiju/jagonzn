<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,projectId,session} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {RuleSourceInput} from './rule-source-selection'
import {deviceSourceMembers,type RuleDeviceSourceContract} from './rule-source-api'
import {coordinateRuleSource} from './coordinate-transform-draft'
import {geofenceDraft,readRuleGeofenceProperties,type GeofenceDraft,type GeofenceKind,type GeofencePropertyChoices} from './geofence-draft'
const props=withDefaults(defineProps<{projectId:string;source:RuleSourceInput|RuleDeviceSourceContract;kind:GeofenceKind;draft?:GeofenceDraft;disabled?:boolean;validationError?:string;top?:string;recoveryPending?:boolean;recovering?:boolean}>(),{disabled:false})
const emit=defineEmits<{save:[draft:GeofenceDraft];cancel:[];busy:[value:boolean];recover:[];denied:[error:ApiError]}>()
const point=ref(''),fence=ref(''),result=ref(''),choices=ref<GeofencePropertyChoices>({points:[],circles:[],polygons:[],results:[]}),loading=ref(false),candidateReady=ref(false),sealed=ref(false),error=ref(''),candidateError=ref('')
const permitted=computed(()=>!!props.projectId&&props.projectId===projectId.value&&!session.transitioning&&can('rule:manage')),locked=computed(()=>props.disabled||!permitted.value||sealed.value)
const fenceChoices=computed(()=>props.kind==='POINT_IN_CIRCLE'?choices.value.circles:choices.value.polygons)
let turn=0,active=true,controller:AbortController|undefined,previousScope:string|undefined
function sourceKey(){try{const source=coordinateRuleSource(props.source);return source.kind+':'+deviceSourceMembers(source).join(',')}catch{return ''}}
function clearDraft(){point.value='';fence.value='';result.value=''}
function stop(){turn++;controller?.abort();choices.value={points:[],circles:[],polygons:[],results:[]};candidateReady.value=false;loading.value=false;emit('busy',false)}
async function reset(){
 stop();error.value='';candidateError.value=''
 const scope=props.projectId+':'+String(session.user?.accountId)+':'+sourceKey()+':'+props.kind,sameScope=previousScope===undefined||previousScope===scope;previousScope=scope;clearDraft()
 if(sameScope&&props.draft&&!sealed.value){point.value=props.draft.point;result.value=props.draft.result;fence.value='circle' in props.draft?props.draft.circle:props.draft.polygon}
 if(!permitted.value||sealed.value)return
 const generation=turn,epoch=identityEpoch(),actor=session.user?.accountId,project=props.projectId,source=sourceKey(),kind=props.kind;controller=new AbortController();const signal=controller.signal
 const current=()=>active&&generation===turn&&epoch===identityEpoch()&&actor===session.user?.accountId&&project===props.projectId&&source===sourceKey()&&kind===props.kind&&permitted.value&&!signal.aborted
 loading.value=true;emit('busy',true)
 try{const value=await readRuleGeofenceProperties(project,props.source,signal);if(current()){choices.value=value;candidateReady.value=true}}
 catch(cause){if(current()){if(cause instanceof ApiError&&[401,403].includes(cause.status)){sealed.value=true;clearDraft();error.value=errorMessage(cause);emit('denied',cause)}else candidateError.value=errorMessage(cause)+'；可手动填写属性。'}}
 finally{if(current()){loading.value=false;emit('busy',false)}}
}
watch([()=>props.draft,()=>props.kind,sourceKey,()=>props.projectId,()=>session.user?.accountId,permitted],()=>{void reset()},{immediate:true,deep:true})
const dispose=onIdentityChange(()=>{stop();sealed.value=true;clearDraft();candidateError.value='';error.value='当前身份已变化，请关闭后重新配置。'})
function suggest(values:readonly string[],query:string,done:(items:{value:string}[])=>void){done(values.filter(key=>key.toLowerCase().includes(query.toLowerCase())).map(value=>({value})))}
const pointSuggestions=(query:string,done:(items:{value:string}[])=>void)=>suggest(choices.value.points,query,done)
const fenceSuggestions=(query:string,done:(items:{value:string}[])=>void)=>suggest(fenceChoices.value,query,done)
const resultSuggestions=(query:string,done:(items:{value:string}[])=>void)=>suggest(choices.value.results,query,done)
function save(){if(locked.value||loading.value)return;try{coordinateRuleSource(props.source);const draft=geofenceDraft(props.kind,props.kind==='POINT_IN_CIRCLE'?{point:point.value,circle:fence.value,result:result.value}:{point:point.value,polygon:fence.value,result:result.value});if(candidateReady.value&&(!choices.value.points.includes(draft.point)||!fenceChoices.value.includes(fence.value)||!choices.value.results.includes(draft.result)))throw new Error('请选择当前设备来源共有的对应属性');error.value='';emit('save',draft)}catch(cause){error.value=errorMessage(cause)}}
function cancel(){if(props.disabled)return;stop();clearDraft();emit('cancel')}
onScopeDispose(()=>{active=false;stop();dispose()})
</script>
<template><el-dialog :model-value="true" title="配置操作" :top="top??'15vh'" :lock-scroll="false" width="min(1000px,94vw)" class="rule-geofence-dialog" :close-on-click-modal="false" :close-on-press-escape="!disabled" :show-close="!disabled" :before-close="cancel" append-to-body>
 <el-form label-position="top" :disabled="locked" @submit.prevent="save">
  <el-form-item><template #label>位置属性 <el-tooltip content="填写设备当前上报的位置属性标识符。"><span class="help-mark" tabindex="0">?</span></el-tooltip></template><el-autocomplete v-model="point" :fetch-suggestions="pointSuggestions" aria-label="位置属性" placeholder="填写属性标识符" :maxlength="32" :loading="loading"/></el-form-item>
  <el-form-item><template #label>电子围栏属性 <el-tooltip :content="kind==='POINT_IN_CIRCLE'?'填写设备的电子围栏属性标识符，使用地理圆形围栏数据类型。':'填写设备的电子围栏属性标识符，使用地理多边形围栏数据类型。'"><span class="help-mark" tabindex="0">?</span></el-tooltip></template><el-autocomplete v-model="fence" :fetch-suggestions="fenceSuggestions" aria-label="电子围栏属性" placeholder="填写属性标识符" :maxlength="32" :loading="loading"/></el-form-item>
  <el-form-item><template #label>结果属性 <el-tooltip content="填写保存检查结果的属性标识符，结果为开关量数据类型，表示是否在电子围栏中。"><span class="help-mark" tabindex="0">?</span></el-tooltip></template><el-autocomplete v-model="result" :fetch-suggestions="resultSuggestions" aria-label="结果属性" placeholder="填写属性标识符" :maxlength="32" :loading="loading"/></el-form-item>
 </el-form>
 <el-alert v-if="candidateError" :title="candidateError" type="warning" :closable="false"/><el-alert v-if="error||validationError" :title="error||validationError" type="warning" :closable="false"/>
 <template #footer><el-form :disabled="false"><el-button v-if="recoveryPending" :disabled="recovering" @click="emit('recover')">读取核对</el-button><el-button :disabled="disabled" @click="cancel">取消</el-button><el-button type="primary" :disabled="locked||loading" @click="save">保存</el-button></el-form></template>
</el-dialog></template>
<style scoped>
.rule-geofence-dialog .el-form-item{margin-bottom:22px}.rule-geofence-dialog :deep(.el-form-item__label){font-size:14px;font-weight:400;color:#606266;line-height:40px;padding-bottom:10px}.rule-geofence-dialog :deep(.el-autocomplete){width:100%}.rule-geofence-dialog :deep(.el-input__wrapper){height:40px;min-height:40px;padding:0 15px}.rule-geofence-dialog :deep(.el-input__inner){font-size:14px;color:#606266}.help-mark{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1px solid #909399;border-radius:50%;font-size:11px;line-height:12px;color:#909399;margin-left:5px}
</style>
