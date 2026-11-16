import {computed,ref,shallowRef,watch,onScopeDispose} from 'vue'
import {can,currentProject,projectId} from '@/core/session'
import {ApiError,IdentityChanged,onIdentityChange,errorMessage} from '@/core/http'
import {useDeviceGuard} from './use-device-guard'
import {readUserAssociations,readUserCandidates,prepareAssociationOperation,applyAssociationOperation,recoverAssociationOperation,
 type DeviceUserAssociation,type DeviceUserCandidate,type PreparedAssociationOperation} from './user-associations-api'

/** Source列表与选择器各自续读；只有完整明确的目标集合才发一次批量写。 */
export function useDeviceUserAssociations(device:()=>string){
 const rows=shallowRef<DeviceUserAssociation[]>([]),selected=shallowRef<DeviceUserAssociation[]>([]),loading=ref(false),error=ref(''),denied=ref(false)
 const nextCursor=ref<string|null>(null),dialog=ref(false),choices=shallowRef<DeviceUserCandidate[]>([]),chosen=ref<string[]>([]),candidateLoading=ref(false),candidateError=ref(''),candidateNext=ref<string|null>(null)
 const writeBusy=ref(false),writeError=ref(''),unknown=ref(false),notice=ref(''),selectingAll=ref(false)
 const selectionLoadingMessage='关联列表正在加载，请加载完成后重新全选。'
 const prepared=shallowRef<PreparedAssociationOperation>(),capture=useDeviceGuard(device)
 const canRead=computed(()=>can('enduser:read')),canManage=computed(()=>canRead.value&&can('enduser:manage')&&!denied.value)
 const canAdd=computed(()=>canManage.value&&currentProject.value?.status==='ACTIVE')
 let scope=0,listSequence=0,candidateSequence=0,writeSequence=0,live=true,candidateQuery=''
 let listController:AbortController|undefined,candidateController:AbortController|undefined,writeController:AbortController|undefined
 let listCursors=new Set<string>(),candidateCursors=new Set<string>()
 function clearDialog(){candidateSequence++;writeSequence++;candidateController?.abort();candidateController=undefined;dialog.value=false;choices.value=[];chosen.value=[];candidateError.value='';candidateNext.value=null;candidateLoading.value=false;candidateQuery='';candidateCursors.clear();writeController?.abort();writeController=undefined;prepared.value=undefined;unknown.value=false;writeBusy.value=false;writeError.value=''}
 function cancelDialog(){const pending=writeBusy.value||unknown.value?prepared.value:undefined;clearDialog();if(pending){prepared.value=pending;unknown.value=true;writeError.value='已停止等待，操作结果未确认；可重新核对，不会自动重发。'}}
 function deny(cause:unknown){scope++;listSequence++;listController?.abort();listController=undefined;clearDialog();rows.value=[];selected.value=[];nextCursor.value=null;loading.value=false;error.value=errorMessage(cause);denied.value=true;notice.value='';selectingAll.value=false;listCursors.clear()}
 function reset(){scope++;listSequence++;listController?.abort();listController=undefined;clearDialog();rows.value=[];selected.value=[];nextCursor.value=null;loading.value=false;error.value='';denied.value=false;notice.value='';selectingAll.value=false;listCursors=new Set()}
 function current(version:number,check:()=>void,signal:AbortSignal){if(!live||version!==scope||signal.aborted)return false;check();return true}
 async function load(resetPage=true){
  if(!canRead.value||denied.value||loading.value&&!resetPage||!resetPage&&!nextCursor.value)return
  listController?.abort();listController=new AbortController();const signal=listController.signal,version=scope,sequence=++listSequence,check=capture(),cursor=resetPage?undefined:nextCursor.value!
  if(resetPage){rows.value=[];selected.value=[];nextCursor.value=null;listCursors.clear()}
  error.value='';loading.value=true
  try{
   const page=await readUserAssociations(projectId.value,device(),cursor,signal)
   if(!current(version,check,signal)||sequence!==listSequence)return
   const combined=resetPage?page.items:[...rows.value,...page.items]
   if(new Set(combined.map(row=>row.bindingId)).size!==combined.length||new Set(combined.map(row=>row.appUserId)).size!==combined.length||page.nextCursor&&listCursors.has(page.nextCursor))throw new Error('关联目录在续读时发生变化，请重新读取。')
   rows.value=combined;nextCursor.value=page.nextCursor;if(page.nextCursor)listCursors.add(page.nextCursor)
   if(writeError.value===selectionLoadingMessage)writeError.value=''
  }catch(cause){
   if(!signal.aborted&&version===scope&&!(cause instanceof IdentityChanged)){
    rows.value=[];selected.value=[];nextCursor.value=null;error.value=errorMessage(cause)
    if(cause instanceof ApiError&&[401,403,404].includes(cause.status))deny(cause)
   }
  }finally{if(sequence===listSequence)loading.value=false}
 }
 async function loadCandidates(query=candidateQuery,resetPage=true){
  if(!dialog.value||!canAdd.value||candidateLoading.value&&!resetPage||!resetPage&&!candidateNext.value)return
  candidateController?.abort();candidateController=new AbortController();const signal=candidateController.signal,version=scope,sequence=++candidateSequence,check=capture(),cursor=resetPage?undefined:candidateNext.value!
  if(resetPage){choices.value=[];candidateNext.value=null;candidateQuery=query;candidateCursors.clear()}
  candidateError.value='';candidateLoading.value=true
  try{
   const page=await readUserCandidates(projectId.value,device(),query,cursor,signal)
   if(!current(version,check,signal)||sequence!==candidateSequence||!dialog.value||!canAdd.value)return
   const combined=resetPage?page.items:[...choices.value,...page.items]
   if(new Set(combined.map(row=>row.appUserId)).size!==combined.length||page.nextCursor&&candidateCursors.has(page.nextCursor))throw new Error('用户候选在续读时发生变化，请重新搜索。')
   choices.value=combined;candidateNext.value=page.nextCursor;if(page.nextCursor)candidateCursors.add(page.nextCursor)
  }catch(cause){if(!signal.aborted&&version===scope&&sequence===candidateSequence&&!(cause instanceof IdentityChanged)){choices.value=[];candidateNext.value=null;candidateError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))deny(cause)}}
  finally{if(sequence===candidateSequence)candidateLoading.value=false}
 }
 function openAdd(){if(!canAdd.value||writeBusy.value||unknown.value||selectingAll.value)return;clearDialog();notice.value='';dialog.value=true;void loadCandidates('',true)}
 function setSelection(values:DeviceUserAssociation[]){selected.value=values.filter(value=>rows.value.some(row=>row.bindingId===value.bindingId))}
 async function collectAllSelection():Promise<DeviceUserAssociation[]|undefined>{
  if(selectingAll.value||writeBusy.value)return
  // 续页在途时明确拒绝全选，避免对立即返回的load反复await并饿死网络回调。
  if(loading.value){writeError.value=selectionLoadingMessage;return}
  selectingAll.value=true;const version=scope
  try{
   while(nextCursor.value&&rows.value.length<=200){await load(false);if(version!==scope||error.value)return}
   if(rows.value.length>200||nextCursor.value){writeError.value='完整选择超过二百条，请逐项选择本次目标；不会截断或自动拆批。';selected.value=[];return}
   selected.value=[...rows.value];return rows.value
  }finally{if(version===scope)selectingAll.value=false}
 }
 async function execute(action:'ADD'|'REMOVE',targets:string[]){
  if(!canManage.value||action==='ADD'&&!canAdd.value||writeBusy.value||unknown.value||selectingAll.value||!targets.length)return false
  writeError.value='';notice.value=''
  try{prepared.value=prepareAssociationOperation(projectId.value,device(),action,targets)}catch(cause){writeError.value=errorMessage(cause);return false}
  const version=scope,sequence=++writeSequence,check=capture();writeController=new AbortController();const signal=writeController.signal,operation=prepared.value
  writeBusy.value=true
  try{
   await applyAssociationOperation(operation,signal)
   if(!current(version,check,signal)||sequence!==writeSequence)return false
   notice.value=action==='ADD'?'添加成功':'移除成功';selected.value=[]
   clearDialog();void load(true);return true
  }catch(cause){
   if(!signal.aborted&&version===scope&&sequence===writeSequence&&!(cause instanceof IdentityChanged)){
    writeError.value=errorMessage(cause);unknown.value=cause instanceof ApiError&&cause.outcomeUnknown
    if(cause instanceof ApiError&&!cause.outcomeUnknown&&[401,403,404].includes(cause.status))deny(cause)
   }
   return false
  }finally{if(version===scope&&sequence===writeSequence)writeBusy.value=false}
 }
 async function add(){return execute('ADD',[...chosen.value])}
 async function remove(targets=selected.value.map(row=>row.bindingId)){return execute('REMOVE',[...targets])}
 async function verifyUnknown(){
  if(!unknown.value||writeBusy.value||!prepared.value)return false
  const operation=prepared.value,version=scope,sequence=++writeSequence,check=capture();writeController=new AbortController();const signal=writeController.signal;writeBusy.value=true
  try{
   await recoverAssociationOperation(operation,signal)
   if(!current(version,check,signal)||sequence!==writeSequence)return false
   notice.value='操作已完成';clearDialog();void load(true);return true
  }catch(cause){if(!signal.aborted&&version===scope&&sequence===writeSequence&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny(cause);return false}writeError.value='结果仍未确认，本次操作不会自动重发。'}return false}
  finally{if(version===scope&&sequence===writeSequence)writeBusy.value=false}
 }
 const dispose=onIdentityChange(()=>{reset();const version=scope;queueMicrotask(()=>{if(live&&scope===version&&canRead.value)void load(true)})})
 watch([()=>projectId.value,()=>device(),()=>canRead.value,()=>can('enduser:manage')],()=>{reset();if(canRead.value&&projectId.value&&device())void load(true)},{immediate:true})
 // 归档阻止新增，但原精确撤销和未知操作只读核对仍沿既有权限。
 watch(canAdd,value=>{if(!value&&dialog.value)cancelDialog()},{flush:'sync'})
 onScopeDispose(()=>{live=false;reset();dispose()})
 return{rows,selected,loading,error,denied,nextCursor,dialog,choices,chosen,candidateLoading,candidateError,candidateNext,writeBusy,writeError,unknown,notice,selectingAll,canRead,canManage,canAdd,
  load,loadCandidates,openAdd,clearDialog,cancelDialog,setSelection,collectAllSelection,add,remove,verifyUnknown}
}
