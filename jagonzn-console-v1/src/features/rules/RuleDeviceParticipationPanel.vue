<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,projectId} from '@/core/session'
import {ApiError,identityEpoch,onIdentityChange,errorMessage,IdentityChanged} from '@/core/http'
import {useResource} from '@/core/use-resource'
import RuleRelatedDevicesView from './RuleRelatedDevicesView.vue'
import {readRuleControlDefinition,readRuleDeviceDirectory,changeRuleParticipation,knownPreprocessRejection,PreprocessOutcomeUnknown,type RuleControlScope,type ExactRuleControlDefinition,type ExactRuleDeviceDirectoryPage} from './preprocess-control-api'
const props=defineProps<{scope:RuleControlScope;definitionVersion:string;inactive?:boolean;refreshContext:()=>Promise<string>}>()
const emit=defineEmits<{busy:[value:boolean];locked:[value:boolean];denied:[cause:ApiError,uncertain:boolean]}>()
const writing=ref(false),locked=ref(false),error=ref(''),notice=ref(''),limit=ref(24),cursors=ref<(string|undefined)[]>([undefined])
const allowed=computed(()=>!!projectId.value&&projectId.value===props.scope.projectId&&can('rule:manage'))
let alive=true,turn=0,controller:AbortController|undefined
function checker(){const generation=turn,epoch=identityEpoch(),key=props.scope.scopeKey,project=props.scope.projectId,rule=props.scope.ruleId;return ()=>alive&&generation===turn&&epoch===identityEpoch()&&key===props.scope.scopeKey&&project===projectId.value&&rule===props.scope.ruleId&&allowed.value}
async function read(input:RuleControlScope,expected:string,cursor:string|undefined,size:number,current:()=>boolean,signal:AbortSignal):Promise<{header:ExactRuleControlDefinition;page:ExactRuleDeviceDirectoryPage}>{
 const header=await readRuleControlDefinition(input,current,signal)
 if(header.version!==expected)throw new Error('规则版本已变化，请刷新关联设备')
 const page=await readRuleDeviceDirectory(input,header,cursor,size,current,signal,cursors.value)
 return {header,page}
}
const resource=useResource(async signal=>read({...props.scope},props.definitionVersion,cursors.value.at(-1),limit.value,checker(),signal))
function reset(){turn++;controller?.abort();resource.clear();writing.value=false;locked.value=false;error.value='';notice.value='';cursors.value=[undefined];limit.value=24}
const dispose=onIdentityChange(reset)
onScopeDispose(()=>{alive=false;controller?.abort();dispose();emit('busy',false);emit('locked',false)})
watch([()=>props.scope.scopeKey,()=>props.scope.projectId,()=>props.scope.ruleId,allowed],()=>{reset();if(allowed.value&&!props.inactive)void resource.reload()},{immediate:true})
watch([()=>props.definitionVersion,()=>props.inactive],(value,previous)=>{if(writing.value)return;if(previous&&value[0]!==previous[0])cursors.value=[undefined];resource.clear();if(allowed.value&&!props.inactive&&!locked.value)void resource.reload()})
watch(writing,value=>emit('busy',value),{immediate:true,flush:'sync'});watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
function authority(cause:unknown,uncertain:boolean){const value=cause instanceof PreprocessOutcomeUnknown?cause.cause:cause;if(value instanceof ApiError&&[401,403,404].includes(value.status))emit('denied',value,uncertain)}
watch(resource.error,cause=>authority(cause,locked.value))
const ready=computed(()=>allowed.value&&!props.inactive&&!writing.value&&!locked.value&&!resource.loading.value&&!resource.error.value&&!!resource.data.value)
const rows=computed(()=>resource.data.value?.page.items.map(row=>({key:row.deviceId,label:row.name,href:can('device:read')?'/devices/'+row.deviceId+'?tab=rules':undefined,allowed:row.allowed,canChange:row.version!=='9223372036854775807'&&props.definitionVersion!=='9223372036854775807'}))??[])
async function change(device:string,value:boolean){
 const data=resource.data.value,row=data?.page.items.find(item=>item.deviceId===device)
 if(!ready.value||!data||!row||data.page.readOnly||row.allowed===value||row.version==='9223372036854775807'||props.definitionVersion==='9223372036854775807')return
 const current=checker(),input={...props.scope};controller?.abort();controller=new AbortController();writing.value=true;error.value='';notice.value=''
 try{
  const result=await changeRuleParticipation(input,data.header,device,{deviceId:device,allowed:row.allowed,version:row.version,definitionVersion:data.header.version},value,crypto.randomUUID(),current,controller.signal)
  if(current()){resource.data.value={header:data.header,page:{...data.page,items:data.page.items.map(item=>item.deviceId===device?{...item,allowed:result.allowed,version:result.version}:item)}};notice.value=value?'已允许该设备使用规则':'已禁止该设备使用规则'}
 }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){error.value=errorMessage(cause);locked.value=!knownPreprocessRejection(cause)||cause instanceof ApiError&&cause.status===409;authority(cause,locked.value)}}finally{if(current())writing.value=false}
}
async function refresh(){
 if(!allowed.value||writing.value||props.inactive)return
 const current=checker(),input={...props.scope},wasLocked=locked.value;controller?.abort();controller=new AbortController();writing.value=true;error.value='';notice.value=''
 try{
  const expected=await props.refreshContext();if(!current())return
  cursors.value=[undefined]
  const data=await read(input,expected,undefined,limit.value,current,controller.signal);if(!current())return
  resource.data.value=data;resource.error.value=undefined;locked.value=false;notice.value='已重新读取当前关联设备，请按最新状态操作。'
 }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){locked.value=wasLocked;error.value=wasLocked?'设备许可结果尚未确认。'+errorMessage(cause):'';resource.data.value=undefined;resource.error.value=cause}}finally{if(current())writing.value=false}
}
function next(){const cursor=resource.data.value?.page.nextCursor;if(!ready.value||!cursor||cursors.value.includes(cursor))return;cursors.value.push(cursor);resource.clear();void resource.reload()}
function previous(){if(!ready.value||cursors.value.length<2)return;cursors.value.pop();resource.clear();void resource.reload()}
function resize(value:number){if(!ready.value||![24,48].includes(value)||value===limit.value)return;limit.value=value;cursors.value=[undefined];resource.clear();void resource.reload()}
</script>
<template><RuleRelatedDevicesView v-show="!inactive" :rows="rows" :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" :busy="writing" :locked="locked" :read-only="resource.data.value?.page.readOnly" :write-error="error" :notice="notice" :page="cursors.length" :has-next="!!resource.data.value?.page.nextCursor" :limit="limit" @change="change" @refresh="refresh" @reread="refresh" @next="next" @previous="previous" @resize="resize"/></template>
