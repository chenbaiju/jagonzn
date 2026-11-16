<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {InfoFilled,TopRight} from '@element-plus/icons-vue'
import {onBeforeRouteLeave} from 'vue-router'
import {projectId,can,session,currentProject} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import CursorPager from '@/ui/CursorPager.vue'
import {formatTime} from '@/core/time'
import DeviceBatchActions from './DeviceBatchActions.vue'
import {preparePropertyQuery,propertyQueryTransport,propertyQueryCsv,type PropertyQueryResult,type PropertyQueryTransport,type PropertyQueryValidation} from './device-property-query-api'
import {savedPropertyQueryTransport,prepareSavedQuery,savedQueryMatches,type SavedPropertyQuery,type SavedPropertyQueryTransport,type SavedQueryIntent} from './device-saved-property-query-api'
const props=withDefaults(defineProps<{disabled?:boolean;transport?:PropertyQueryTransport;savedTransport?:SavedPropertyQueryTransport}>(),{transport:()=>propertyQueryTransport,savedTransport:()=>savedPropertyQueryTransport})
const emit=defineEmits<{locked:[boolean];changed:[]}>()
const shown=ref(false),expression=ref(''),busy=ref(false),error=ref(''),denied=ref(false),writeDenied=ref(false),page=ref(1),notice=ref('')
const validation=shallowRef<PropertyQueryValidation>(),result=shallowRef<PropertyQueryResult>(),scopeType=ref<string>(),scopeName=ref(''),scopeDevices=shallowRef<readonly string[]>()
const readable=computed(()=>session.ready&&!session.transitioning&&!!projectId.value&&!!session.user?.accountId&&can('device:read')&&!denied.value)
const writable=computed(()=>readable.value&&!writeDenied.value&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')&&['OWNER','ADMIN'].includes(session.user?.projectRole||''))
const rows=computed(()=>result.value?.items.slice((page.value-1)*24,page.value*24)||[])
const savedRows=shallowRef<readonly SavedPropertyQuery[]>([]),savedVersions=shallowRef<readonly SavedPropertyQuery[]>([]),savedBase=shallowRef<SavedPropertyQuery>(),listLoading=ref(false),listError=ref('')
const saveShown=ref(false),saveMode=ref<'CREATE'|'CHANGE'|'DELETE'>('CREATE'),saveName=ref(''),saveBusy=ref(false),saveUnknown=ref(false),readAttempted=ref(false),intent=shallowRef<SavedQueryIntent>()
const selected=ref<string[]>([]),batchLocked=ref(false),batchStale=ref(false)
const blocked=computed(()=>props.disabled||saveBusy.value||saveUnknown.value||batchLocked.value)
const locked=computed(()=>shown.value||saveBusy.value||saveUnknown.value||batchLocked.value)
let generation=0,queryGeneration=0,alive=true,controller:AbortController|undefined,savedController:AbortController|undefined
function invalidate(){queryGeneration++;controller?.abort();controller=undefined;busy.value=false;error.value='';validation.value=undefined;result.value=undefined;page.value=1;selected.value=[];batchStale.value=false}
function reset(){generation++;savedController?.abort();savedController=undefined;invalidate();shown.value=false;expression.value='';scopeType.value=undefined;scopeName.value='';scopeDevices.value=undefined;denied.value=false;writeDenied.value=false;notice.value='';savedRows.value=[];savedVersions.value=[];savedBase.value=undefined;listLoading.value=false;listError.value='';saveShown.value=false;saveBusy.value=false;saveUnknown.value=false;readAttempted.value=false;intent.value=undefined;saveName.value='';batchLocked.value=false}
function open(type?:string,name?:string,devices?:readonly string[]){if(props.disabled||!readable.value)return;if(saveUnknown.value||batchLocked.value){shown.value=true;return}reset();scopeType.value=type;scopeName.value=name||'选定设备类型';scopeDevices.value=devices?.length?[...devices]:undefined;shown.value=true;return loadSaved()}
async function openSaved(id:string){
 if(props.disabled||!readable.value||saveUnknown.value||saveBusy.value||batchLocked.value)return
 const opened=open();const s=snapshot();await opened
 if(!current(s)||!shown.value)return
 if(!savedRows.value.some(row=>row.id===id)){error.value='保存查询当前不可读，请重新读取目录';return}
 await selectSaved(id)
}
function close(){if(saveBusy.value||batchLocked.value)return;if(saveUnknown.value){shown.value=false;saveShown.value=false;return}reset()}
function edit(value:string){if(blocked.value)return;invalidate();expression.value=value;notice.value=''}
function snapshot(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId}}
function current(s:ReturnType<typeof snapshot>){return alive&&readable.value&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.account===session.user?.accountId}
function lost(cause:unknown,management=false){if(!(cause instanceof ApiError)||![401,403,404].includes(cause.status))return false;reset();shown.value=true;if(management&&cause.status===403){writeDenied.value=true;error.value='保存查询管理权限已变化，原写结果未确认。当前仅可读取。'}else{denied.value=true;error.value='当前项目或设备读取权限已不可用。请关闭后重新选择项目。'}return true}
async function loadSaved(){
 if(!shown.value||!readable.value||saveUnknown.value||saveBusy.value||batchLocked.value)return
 const s=snapshot();savedController?.abort();savedController=new AbortController();const signal=savedController.signal;listLoading.value=true;listError.value=''
 try{const values=await props.savedTransport.list(s.project,signal);if(current(s)&&!signal.aborted)savedRows.value=values}
 catch(cause){if(current(s)&&!signal.aborted&&!(cause instanceof IdentityChanged)){savedRows.value=[];listError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))lost(cause)}}
 finally{if(current(s)&&!signal.aborted)listLoading.value=false}
}
function selectSaved(id:string){
 if(blocked.value||busy.value)return
 invalidate();savedBase.value=undefined;savedVersions.value=[];notice.value=''
 if(!id){expression.value='';return}
 const row=savedRows.value.find(value=>value.id===id);if(!row)return
 expression.value=row.expression;savedBase.value=row;saveName.value=row.name
}
async function run(kind:'validate'|'execute'){
 if(!shown.value||blocked.value||!readable.value||busy.value)return
 invalidate();const s=snapshot(),q=queryGeneration;busy.value=true;controller=new AbortController();const signal=controller.signal;let savedExecution=false
 try{
  const prepared=await preparePropertyQuery(s.project,expression.value,scopeType.value,scopeDevices.value)
  if(!current(s)||signal.aborted||q!==queryGeneration||!shown.value)return
  if(kind==='validate'){const response=await props.transport.validate(prepared,signal);if(current(s)&&!signal.aborted&&q===queryGeneration)validation.value=response}
  else{const saved=savedBase.value;savedExecution=!!saved&&expression.value===saved.expression;const response=await(savedExecution?props.savedTransport.execute(saved!,prepared,signal):props.transport.execute(prepared,signal));if(current(s)&&!signal.aborted&&q===queryGeneration){result.value=response;page.value=1}}
 }catch(cause){if(current(s)&&!signal.aborted&&q===queryGeneration&&!(cause instanceof IdentityChanged)){if(savedExecution&&cause instanceof ApiError&&cause.status===404){savedVersions.value=[];error.value='保存查询或指定版本当前不可读，请重新读取保存查询。'}else if(!lost(cause))error.value=errorMessage(cause)}}
 finally{if(current(s)&&q===queryGeneration)busy.value=false}
}
function startSave(kind:'CREATE'|'CHANGE'|'DELETE'){
 if(!writable.value||blocked.value||busy.value||listLoading.value||kind!=='CREATE'&&!savedBase.value)return
 if(kind==='CREATE'){saveMode.value='CREATE';saveName.value='';saveShown.value=true;error.value='';return}
 if(kind==='DELETE'){saveMode.value='DELETE';saveName.value='';saveShown.value=true;error.value='';return}
 const base=savedBase.value!
 if(base.expression===expression.value&&base.revision===base.currentRevision){notice.value='查询条件未修改';return}
 saveMode.value='CHANGE';saveName.value=base.name;saveShown.value=false
 void writeSave('CHANGE',base.name,expression.value)
}
function saveCurrent(){if(!writable.value||blocked.value||busy.value||listLoading.value)return;if(savedBase.value)startSave('CHANGE');else startSave('CREATE')}
function saveAs(){if(!writable.value||blocked.value||busy.value||listLoading.value)return;saveMode.value='CREATE';saveName.value=savedBase.value?copyName(savedBase.value.name):'';saveShown.value=true;error.value=''}
function copyName(name:string){const suffix=' 副本',chars=Array.from(name);return chars.slice(0,Math.max(1,128-Array.from(suffix).length)).join('')+suffix}
function closeSave(){if(!saveBusy.value)saveShown.value=false}
async function confirmed(row:SavedPropertyQuery,original:SavedQueryIntent,s:ReturnType<typeof snapshot>,signal:AbortSignal){
 if(!savedQueryMatches(row,original))throw new Error('原键原件与本次完整内容不一致，请继续核对')
 const values=await props.savedTransport.list(original.project,signal);if(!current(s)||signal.aborted)return
 savedRows.value=values;saveUnknown.value=false;intent.value=undefined;readAttempted.value=false;saveShown.value=false;savedVersions.value=[]
 const actual=values.find(value=>value.id===row.id);savedBase.value=actual;saveName.value=actual?.name||''
 if(actual)expression.value=actual.expression
 notice.value=original.kind==='DELETE'?'保存查询已删除，当前条件仍可另存为':actual?'设备查询已保存':'原保存已受理，当前目录未见该查询';error.value='';emit('changed')
}
async function writeSaved(){
 if(!saveShown.value||!writable.value||blocked.value||busy.value)return
 await writeSave(saveMode.value,saveName.value,expression.value)
}
async function writeSave(kind:'CREATE'|'CHANGE'|'DELETE',name:string,text:string){
 if(!writable.value||blocked.value||busy.value)return
 const s=snapshot();saveBusy.value=true;error.value='';let sent=false,writeAccepted=false
 savedController?.abort();savedController=new AbortController();const signal=savedController.signal
 try{
  const original=await prepareSavedQuery(s.project,kind,name,text,savedBase.value)
  if(!current(s)||signal.aborted||!writable.value)return
  invalidate();intent.value=original;saveUnknown.value=true;readAttempted.value=false;sent=true
  const response=await props.savedTransport.write(original,signal);writeAccepted=true
  if(!current(s)||signal.aborted)return
  const proof=original.kind==='DELETE'?await props.savedTransport.recover(original,signal):response
  if(!proof)throw new Error('保存原件不可读，请按原键核对')
  await confirmed(proof,original,s,signal)
 }catch(cause){if(current(s)&&!signal.aborted&&!(cause instanceof IdentityChanged)){
  if(sent&&!writeAccepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,413,422,429].includes(cause.status)){saveUnknown.value=false;intent.value=undefined}
  if(!(cause instanceof ApiError&&[401,403].includes(cause.status)&&lost(cause,true)))error.value=errorMessage(cause)
 }}finally{if(current(s))saveBusy.value=false}
}
async function recoverSaved(){
 const original=intent.value;if(!original||!saveUnknown.value||saveBusy.value||!readable.value)return
 const s=snapshot();saveBusy.value=true;savedController?.abort();savedController=new AbortController();const signal=savedController.signal;error.value='';readAttempted.value=true
 try{const row=await props.savedTransport.recover(original,signal);if(current(s)&&!signal.aborted)await confirmed(row,original,s,signal)}
 catch(cause){if(current(s)&&!signal.aborted&&!(cause instanceof IdentityChanged)){if(!(cause instanceof ApiError&&[401,403].includes(cause.status)&&lost(cause,true)))error.value=cause instanceof ApiError&&cause.status===404?'未读到本人原键，原写结果仍未确认；不会重新发送。':errorMessage(cause)}}finally{if(current(s))saveBusy.value=false}
}
function finishUnknown(){if(saveUnknown.value&&readAttempted.value&&!saveBusy.value){saveUnknown.value=false;intent.value=undefined;saveShown.value=false;savedBase.value=undefined;savedVersions.value=[];expression.value='';saveName.value='';invalidate();notice.value='已结束核对；原保存或删除结果仍未确认，请先重新读取保存的查询。'}}
function changePage(value:number){if(result.value&&!blocked.value&&Number.isSafeInteger(value)&&value>=1&&value<=Math.max(1,Math.ceil(result.value.items.length/24)))page.value=value}
function exportResult(){if(!result.value||blocked.value||!readable.value)return;const data=propertyQueryCsv(result.value),url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`设备查询-${result.value.evaluatedAt.replace(/[:.]/g,'-')}.csv`;link.click();URL.revokeObjectURL(url)}
function selectResult(id:string,checked:boolean){if(!result.value||blocked.value||batchStale.value||!readable.value||!result.value.items.some(row=>row.deviceId===id))return;if(checked&&selected.value.length>=96){error.value='最多96台，请缩小查询或选择范围';return}selected.value=checked?[...selected.value.filter(value=>value!==id),id]:selected.value.filter(value=>value!==id)}
function selectAll(){if(!result.value||blocked.value||batchStale.value)return;if(result.value.items.length>96){error.value='最多96台，请缩小查询或选择范围';return}selected.value=result.value.items.map(row=>row.deviceId)}
function batchChanged(){batchStale.value=true;notice.value='批量操作已改变设备，当前结果保留原查询时刻；再次操作前请重新查询。'}
watch([()=>projectId.value,()=>session.user?.accountId,()=>can('device:read'),()=>session.transitioning],reset,{flush:'sync'})
watch(locked,value=>emit('locked',value),{flush:'sync'})
const dispose=onIdentityChange(reset)
onBeforeRouteLeave(()=>{if(saveBusy.value||saveUnknown.value||batchLocked.value)return false;reset();return true})
function beforeUnload(event:BeforeUnloadEvent){if(saveBusy.value||saveUnknown.value||batchLocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload)
onScopeDispose(()=>{alive=false;reset();dispose();window.removeEventListener('beforeunload',beforeUnload);emit('locked',false)})
const highlightBox=ref<HTMLElement>()
const highlighted=computed(()=>highlightExpression(expression.value))
function onInput(event:Event){edit((event.target as HTMLTextAreaElement).value)}
function syncScroll(event:Event){const input=event.target as HTMLTextAreaElement;if(highlightBox.value){highlightBox.value.scrollTop=input.scrollTop;highlightBox.value.scrollLeft=input.scrollLeft}}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))}
function highlightExpression(value:string){
 const tokens=/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(?:and|or|not|true|false|null)\b|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_.]*|<>|!=|>=|<=|=|<|>|[()+\-*\/,]/gi
 let output='',last=0
 for(const match of value.matchAll(tokens)){
  const index=match.index??0,text=match[0]
  output+=escapeHtml(value.slice(last,index))
  const logical=/^(?:and|or|not)$/i.test(text),literal=/^(?:true|false|null)$/i.test(text),number=/^\d/.test(text),string=/^["']/.test(text),operator=/^(?:<>|!=|>=|<=|=|<|>|[()+\-*\/,])$/.test(text)
  const cls=string?'tok-string':logical?'tok-logical':literal||number?'tok-number':operator?'tok-operator':'tok-property'
  output+=`<span class="${cls}">${escapeHtml(text)}</span>`
  last=index+text.length
 }
 return output+escapeHtml(value.slice(last))
}
defineExpose({open,openSaved,reset})
</script>
<template><el-alert v-if="saveUnknown&&!shown" title="原保存或删除结果尚未确认" type="warning" :closable="false"><el-button size="small" @click="shown=true">核对保存查询结果</el-button></el-alert><el-dialog :model-value="shown" title="设备查询" width="min(800px,95vw)" class="device-query-dialog" :close-on-click-modal="false" @update:model-value="!$event&&close()" @close="close">
 <div class="tc-query">
  <div class="tc-query-resource"><el-icon><InfoFilled/></el-icon><a href="https://www.thingscloud.xyz/docs/guide/device-manage/device-query.html" target="_blank" rel="noopener noreferrer">如何编写正确的查询条件？ <el-icon><TopRight/></el-icon></a></div>
  <el-form label-position="top" class="tc-query-form" @submit.prevent>
   <el-form-item label="读取设备查询"><el-select :model-value="savedBase?.id||''" clearable filterable :disabled="blocked||busy||!readable||listLoading" :loading="listLoading" placeholder="请选择" aria-label="读取设备查询" style="width:100%" @update:model-value="selectSaved"><el-option v-for="row in savedRows" :key="row.id" :value="row.id" :label="row.name"/></el-select></el-form-item>
   <el-form-item label="查询条件"><div class="tc-code-editor"><pre ref="highlightBox" class="tc-code-highlight" aria-hidden="true" v-html="highlighted"></pre><textarea class="tc-code-input" :value="expression" :disabled="!readable||blocked" aria-label="设备查询条件" spellcheck="false" autocomplete="off" autocapitalize="off" @input="onInput" @scroll="syncScroll"></textarea></div></el-form-item>
  </el-form>
  <el-alert v-if="listError" :title="`保存查询未能读取：${listError}`" type="warning" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/><el-alert v-if="saveUnknown" title="原写结果尚未确认，原键和草稿已保留，不会再次发送。" type="warning" :closable="false"><el-button size="small" :disabled="saveBusy" @click="recoverSaved">按原键核对</el-button><el-button size="small" :disabled="saveBusy||!readAttempted" @click="finishUnknown">已核对，结束本次操作</el-button></el-alert><el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <div class="tc-query-actions"><el-button v-if="writable" class="tc-query-button" :disabled="blocked||busy||listLoading||!expression.trim()" @click="saveCurrent">保存</el-button><el-button v-if="writable" class="tc-query-button" :disabled="blocked||busy||listLoading||!expression.trim()" @click="saveAs">另存为…</el-button><span class="tc-query-spacer"/><el-button class="tc-query-button" :disabled="!readable||blocked" @click="edit('')">清空</el-button><el-button class="tc-query-button tc-query-primary" :disabled="busy||!readable||blocked||!expression.trim()" :loading="busy" @click="run('execute')">查询</el-button></div>
  <section v-if="result" aria-label="设备查询结果"><p role="status">候选 {{result.candidateCount}} 台，匹配 {{result.matchedCount}} 台，未知 {{result.unknownCount}} 台 · {{formatTime(result.evaluatedAt)}}</p>
  <div class="query-result-actions"><el-button size="small" :disabled="blocked||!readable" @click="exportResult">导出全部匹配CSV</el-button><el-button size="small" :disabled="blocked||batchStale||!result.items.length||result.items.length>96" :title="result.items.length>96?'最多96台，请缩小查询或选择范围':undefined" @click="selectAll">选择全部匹配</el-button><span v-if="result.items.length>96" class="tl-muted">最多96台，请缩小查询或选择范围</span><el-button v-if="selected.length" size="small" :disabled="batchLocked||saveBusy||saveUnknown" @click="selected=[]">清除选择</el-button><DeviceBatchActions nested :device-ids="selected" :disabled="disabled||saveBusy||saveUnknown||batchStale||!readable" @cleared="selected=[]" @changed="batchChanged" @locked="batchLocked=$event"/></div><el-table :data="rows" empty-text="无匹配设备"><el-table-column label="选择" width="55"><template #default="{row}"><el-checkbox :model-value="selected.includes(row.deviceId)" :disabled="blocked||batchStale" :aria-label="`选择查询设备 ${row.name}`" @update:model-value="selectResult(row.deviceId,!!$event)"/></template></el-table-column><el-table-column label="设备名称" min-width="200"><template #default="{row}"><router-link :to="`/devices/${row.deviceId}`" @click="close">{{row.name}}</router-link></template></el-table-column><el-table-column prop="deviceId" label="设备ID" min-width="220"/><el-table-column label="在线状态" width="110"><template #default="{row}">{{row.status==='ONLINE'?'在线':'离线'}}</template></el-table-column></el-table>
  <CursorPager v-if="result.items.length>24" :page="page" :total="result.matchedCount" :limit="24" :show-sizes="false" :loading="blocked" @update:page="changePage"/></section>
 </div>
</el-dialog>
 <el-dialog :model-value="saveShown" :title="saveMode==='DELETE'?'删除保存查询':saveMode==='CHANGE'?'保存查询新版本':'保存设备查询'" width="min(460px,95vw)" class="device-query-save-dialog" :close-on-click-modal="false" :show-close="!saveBusy" @update:model-value="!$event&&closeSave()"><p v-if="saveMode==='DELETE'">确定删除“{{savedBase?.name}}”？保存版本与原键会保留，普通目录不再显示。</p><template v-else><el-form label-position="top"><el-form-item label="查询名称"><el-input v-model="saveName" :disabled="saveBusy||saveUnknown" maxlength="128" aria-label="保存查询名称"/></el-form-item></el-form><p class="tl-muted">每次保存产生一个不可变版本。当前候选范围不随条件保存。</p></template><el-alert v-if="error" :title="error" type="error" :closable="false"/><p v-if="saveUnknown" class="tl-muted">原结果待核对，请关闭此窗口后按原键读取。</p><template #footer><el-button :disabled="saveBusy" @click="closeSave">取消</el-button><el-button :type="saveMode==='DELETE'?'danger':'primary'" :loading="saveBusy" :disabled="saveBusy||saveUnknown||!writable||saveMode==='CHANGE'&&!!savedBase&&savedBase.revision===savedBase.currentRevision&&saveName.trim()===savedBase.name&&expression===savedBase.expression" @click="writeSaved">{{saveMode==='DELETE'?'确认删除':'确认保存'}}</el-button></template></el-dialog></template>
<style>
.device-query-dialog{border-radius:3px;overflow:hidden}
.device-query-dialog .el-dialog__header{margin:0;padding:20px 20px 10px}
.device-query-dialog .el-dialog__title{font-size:18px;font-weight:400;line-height:24px;color:#303133}
.device-query-dialog .el-dialog__headerbtn{top:20px;right:20px;width:16px;height:24px;font-size:16px}
.device-query-dialog .el-dialog__body{padding:30px 20px 20px}
.tc-query{font-size:14px;color:#606266}
.tc-query-resource{display:flex;align-items:center;gap:8px;box-sizing:border-box;height:40px;padding:0 16px;margin-bottom:26px;background:#e9f0ff;border-left:2px solid #409eff;border-radius:3px;color:#606266}
.tc-query-resource a{font-size:14px;color:#409eff;text-decoration:underline}.tc-query-resource a .el-icon{vertical-align:middle}
.tc-query-form .el-form-item{margin-bottom:26px}
.tc-query-form .el-form-item__label{height:auto;padding:0;font-size:14px;font-weight:600;line-height:22px;color:#606266}
.tc-query-form .el-select__wrapper{min-height:36px;border-radius:3px;box-shadow:0 0 0 1px #dcdfe6 inset;font-size:14px}
.tc-query-form .el-select__placeholder{color:#c0c4cc}
.tc-code-editor{position:relative;width:100%;height:100px;background:#111;overflow:hidden}
.tc-code-highlight,.tc-code-input{position:absolute;inset:0;box-sizing:border-box;margin:0;padding:12px 14px;border:0;outline:0;font:13px/1.65 Monaco,Menlo,Consolas,"Courier New",monospace;white-space:pre-wrap;overflow-wrap:break-word;tab-size:2}
.tc-code-highlight{overflow:auto;color:#e8e8e8;background:#000;pointer-events:none}
.tc-code-input{resize:none;overflow:auto;color:transparent;caret-color:#fff;background:transparent;word-break:break-word}
.tc-code-input::selection{background:rgba(255,157,0,.32);color:transparent}
.tc-code-input:disabled{color:transparent;background:transparent}
.tc-code-highlight .tok-property{color:#e8e8e8}
.tc-code-highlight .tok-operator,.tc-code-highlight .tok-number{color:#ff9d00}
.tc-code-highlight .tok-logical{color:#8b949e}
.tc-code-highlight .tok-string{color:#a5d6a7}
.tc-query-actions{display:flex;align-items:center;gap:10px;margin-top:60px}
.tc-query-actions .el-button+.el-button{margin-left:0}
.tc-query-spacer{flex:1}
.tc-query-button{height:40px;padding:0 20px;border-radius:3px;border-color:#dcdfe6;background:#fff;color:#606266;font-size:14px}
.tc-query-button:hover,.tc-query-button:focus{border-color:#c0c4cc;background:#fafafa;color:#1f2329}
.tc-query-primary,.tc-query-primary:hover,.tc-query-primary:focus{border-color:#409eff;background:#409eff;color:#fff}
.tc-query-primary:hover,.tc-query-primary:focus{border-color:#66b1ff;background:#66b1ff}
.tc-query-primary.is-disabled,.tc-query-primary.is-disabled:hover{border-color:#a0cfff;background:#a0cfff;color:#fff}
.tc-query section{margin-top:22px}
.tc-query .query-result-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0}
.tc-query .query-result-actions .el-button+.el-button{margin-left:0}
.tc-query .el-alert{margin:14px 0}
.device-query-save-dialog .el-dialog__title{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:18px}
</style>
