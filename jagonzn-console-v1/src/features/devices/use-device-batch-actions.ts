import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {readStaticGroups,decodeStaticGroups} from './static-group-membership-api'
import {readUserCandidates,type DeviceUserCandidate} from './user-associations-api'
import {batchId,batchSelection,readBatchDevice,readBatchAccess,prepareBatchRow,writeBatchRow,observeBatchRow,type BatchAction,type BatchRow} from './device-batch-api'

type Inputs={deviceIds:()=>readonly string[];selectedGroupId:()=>string|undefined;disabled:()=>boolean;changed:()=>void;cleared:()=>void;locked:(value:boolean)=>void}
type Plan=Readonly<{generation:number;epoch:number;project:string;action:BatchAction;target:string;rows:BatchRow[]}>
/** 当前页的有界串行写队列；读/确认/未知核对均独立，不自动重放或推进下一行。 */
export function useDeviceBatchActions(input:Inputs){
 const action=ref<BatchAction>(),shown=ref(false),phase=ref<'choose'|'confirm'|'result'>('choose')
 const rows=shallowRef<BatchRow[]>([]),metadata=shallowRef<Array<{id:string;name:string;enabled:boolean}>>([])
 const loading=ref(false),preparing=ref(false),writing=ref(false),checking=ref(false),error=ref(''),denied=ref(false),staleSelection=ref(false)
 const notice=ref('')
 const group=ref(''),user=ref(''),query=ref(''),choices=shallowRef<DeviceUserCandidate[]>([]),groups=shallowRef<Array<{id:string;name:string}>>([]),optionLoading=ref(false),optionError=ref(''),more=ref(false)
 let generation=0,optionSequence=0,dialogSequence=0,disposed=false,controller:AbortController|undefined,optionController:AbortController|undefined,plan:Plan|undefined
 let groupAfter:string|undefined,userCursors=new Map<string,string|null|undefined>(),userQuery=''
 let userPositions=new Map<string,Set<string>>(),userPageIds=new Map<string,Set<string>>()
 const selection=computed(()=>{try{return batchSelection(input.deviceIds())}catch{return []}})
 const readable=computed(()=>session.ready&&!session.transitioning&&can('device:read')&&!denied.value&&!!projectId.value)
 const manager=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
 const unknown=computed(()=>rows.value.some(r=>r.status==='UNKNOWN'))
 const locked=computed(()=>shown.value||preparing.value||writing.value||checking.value||unknown.value)
 const busy=computed(()=>loading.value||preparing.value||writing.value||checking.value)
 const counts=computed(()=>({enable:metadata.value.filter(r=>!r.enabled).length,disable:metadata.value.filter(r=>r.enabled).length}))
 function allowed(kind:BatchAction){return manager.value&&can(kind==='associate'?'enduser:manage':kind==='remove'?'device:delete':'device:update')&&(kind!=='associate'||can('enduser:read'))}
 const valid=(p:Plan)=>!disposed&&p.generation===generation&&p.epoch===identityEpoch()&&p.project===projectId.value&&readable.value
 function patch(id:string,change:Partial<BatchRow>){rows.value=rows.value.map(r=>r.id===id?{...r,...change}:r)}
 function reset(){generation++;optionSequence++;dialogSequence++;controller?.abort();optionController?.abort();plan=undefined;rows.value=[];metadata.value=[];action.value=undefined;shown.value=false;phase.value='choose';loading.value=false;preparing.value=false;writing.value=false;checking.value=false;error.value='';notice.value='';denied.value=false;staleSelection.value=false;group.value='';user.value='';query.value='';choices.value=[];groups.value=[];optionLoading.value=false;optionError.value='';more.value=false;groupAfter=undefined;userCursors.clear();userPositions.clear();userPageIds.clear()}
 function scope(){return {generation,epoch:identityEpoch(),project:projectId.value}}
 function current(s:ReturnType<typeof scope>){return !disposed&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&readable.value}
 function fail(cause:unknown){error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))denied.value=true}
 async function reload(){
  if(!readable.value||locked.value||disposed)return
  const s=scope();controller?.abort();controller=new AbortController();const signal=controller.signal
  loading.value=true;metadata.value=[];error.value=''
  try{
   batchId(s.project);const ids=batchSelection(input.deviceIds()),result:typeof metadata.value=[]
   // 最多四个并行只读请求；完整选集完成后才公开计数，任何失败不补零。
   let next=0
   await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{
    while(next<ids.length){const id=ids[next++]!;if(!current(s)||signal.aborted)return
     const d=await readBatchDevice(s.project,id,signal),a=await readBatchAccess(s.project,id,signal)
     if(!current(s)||signal.aborted)return;result.push({...d,enabled:a.enabled})
    }
   }))
   if(current(s)&&!signal.aborted){if(result.length!==ids.length)throw new Error('设备选择读取不完整');metadata.value=ids.map(id=>result.find(r=>r.id===id)!)}
  }catch(cause){if(current(s)&&!signal.aborted&&!(cause instanceof IdentityChanged)){controller.abort();metadata.value=[];fail(cause)}}
  finally{if(s.generation===generation)loading.value=false}
 }
 function start(kind:BatchAction){
  if(!allowed(kind)||input.disabled()||busy.value||locked.value||!selection.value.length||metadata.value.length!==selection.value.length)return
  if(kind==='remove-group'&&!input.selectedGroupId())return
  action.value=kind;shown.value=true;phase.value='choose';error.value='';notice.value='';optionError.value='';query.value='';rows.value=[];group.value=kind==='remove-group'?input.selectedGroupId()!:'';user.value='';choices.value=[];groups.value=[];more.value=false;groupAfter=undefined;userCursors.clear();staleSelection.value=false
  const dialog=++dialogSequence
  submit.value=async()=>{if(dialog===dialogSequence&&shown.value&&phase.value==='choose'&&action.value===kind&&(kind==='add-group'||kind==='associate'))await prepare(true)}
  if(kind==='add-group')void loadGroups(false)
  else if(kind==='associate')void loadUsers('',false)
  else void prepare()
 }
 async function loadGroups(append:boolean){
  if(!shown.value||action.value!=='add-group'||!allowed('add-group')||optionLoading.value||append&&!more.value)return
  const s=scope(),seq=++optionSequence;optionController?.abort();optionController=new AbortController();const signal=optionController.signal,after=append?groupAfter:undefined
  optionLoading.value=true;optionError.value=''
  try{
   const bound={project:s.project,device:selection.value[0]!},page=decodeStaticGroups(await readStaticGroups(bound,false,after,signal),bound,false,after)
   if(!current(s)||seq!==optionSequence||!shown.value)return
   const combined=append?[...groups.value,...page.items.map(r=>({id:r.groupId,name:r.name}))]:page.items.map(r=>({id:r.groupId,name:r.name}))
   if(combined.length>1000||new Set(combined.map(r=>r.id)).size!==combined.length)throw new Error('设备组目录超过上限或发生变化，请改用单台设备操作')
   groups.value=combined;groupAfter=page.nextAfterGroupId||undefined;more.value=page.hasMore
  }catch(cause){if(current(s)&&seq===optionSequence&&!signal.aborted){optionError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))fail(cause)}}
  finally{if(seq===optionSequence)optionLoading.value=false}
 }
 async function loadUsers(value:string,append:boolean){
  if(!shown.value||action.value!=='associate'||!allowed('associate')||append&&(!more.value||optionLoading.value))return
  const s=scope(),seq=++optionSequence;optionController?.abort();optionController=new AbortController();const signal=optionController.signal
  if(Array.from(value).length>128){optionLoading.value=false;choices.value=[];user.value='';more.value=false;optionError.value='搜索内容不能超过128个字符';return}
  if(!append){userQuery=value;query.value=value;user.value='';choices.value=[];userCursors=new Map(selection.value.map(id=>[id,undefined]));userPositions.clear();userPageIds.clear()}
  const cursors=new Map(userCursors),result=new Map(choices.value.map(r=>[r.appUserId,r]))
  const positions=new Map([...userPositions].map(([id,seen])=>[id,new Set(seen)])),pageIds=new Map([...userPageIds].map(([id,seen])=>[id,new Set(seen)]))
  optionLoading.value=true;optionError.value=''
  try{
   const pending=[...cursors].filter(([,cursor])=>cursor!==null);let next=0
   await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
    while(next<pending.length){const [id,cursor]=pending[next++]!;if(!current(s)||seq!==optionSequence||signal.aborted)return
     const page=await readUserCandidates(s.project,id,userQuery,cursor||undefined,signal)
     if(!current(s)||seq!==optionSequence||signal.aborted)return
     const seen=positions.get(id)||new Set<string>(),previousIds=pageIds.get(id)||new Set<string>()
     if(page.nextCursor&&(page.nextCursor===cursor||seen.has(page.nextCursor)))throw new Error('用户候选位置未推进或重复')
     for(const r of page.items){if(previousIds.has(r.appUserId))throw new Error('用户候选在续读时重复');previousIds.add(r.appUserId);const old=result.get(r.appUserId);if(old&&(old.username!==r.username||old.displayName!==r.displayName))throw new Error('用户候选在读取时发生变化');result.set(r.appUserId,r)}
     if(page.nextCursor)seen.add(page.nextCursor);positions.set(id,seen);pageIds.set(id,previousIds)
     if(result.size>1000)throw new Error('用户候选超过1000个，请输入更精确的搜索内容；不会截断')
     cursors.set(id,page.nextCursor)
    }
   }))
   if(current(s)&&seq===optionSequence&&!signal.aborted){choices.value=[...result.values()];userCursors=cursors;userPositions=positions;userPageIds=pageIds;more.value=[...cursors.values()].some(c=>c!==null)}
  }catch(cause){if(current(s)&&seq===optionSequence&&!signal.aborted){optionController.abort();choices.value=[];user.value='';more.value=false;optionError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))fail(cause)}}
  finally{if(seq===optionSequence)optionLoading.value=false}
 }
 const loadMore=()=>action.value==='add-group'?loadGroups(true):loadUsers(userQuery,true)
 const target=()=>action.value==='associate'?user.value:group.value
 async function prepare(sendAfterRead=false){
  const kind=action.value;if(!kind||!allowed(kind)||input.disabled()||busy.value||unknown.value||!shown.value||staleSelection.value)return
  const selectedTarget=target()
  if(kind==='add-group'&&!groups.value.some(g=>g.id===selectedTarget)||kind==='associate'&&!choices.value.some(u=>u.appUserId===selectedTarget)){error.value='请先选择有效目标';return}
  if(kind==='remove-group'){try{batchId(selectedTarget)}catch(e){fail(e);return}}
  optionSequence++;optionController?.abort();optionLoading.value=false
  const s=scope(),ids=batchSelection(input.deviceIds());controller?.abort();controller=new AbortController();const signal=controller.signal
  preparing.value=true;error.value='';plan=undefined;rows.value=[]
  try{
   const result:BatchRow[]=[]
   for(const id of ids){if(!current(s)||signal.aborted)return
    result.push(await prepareBatchRow(s.project,id,kind,selectedTarget,signal))
   }
   if(!current(s)||signal.aborted||!shown.value)return
   rows.value=result;phase.value='confirm';plan=Object.freeze({...s,action:kind,target:selectedTarget,rows:result.map(r=>({...r}))})
   const prepared=plan;confirm.value=()=>perform(prepared)
   // 原站选择后直接提交；完整预检仍先完成，不新增第二层确认界面。
   if(sendAfterRead){await perform(prepared);if(valid(prepared)&&rows.value.every(r=>r.status==='SUCCESS'||r.status==='NOOP')){notice.value=rows.value.some(r=>r.status==='SUCCESS')?(kind==='add-group'?'添加成功':'关联成功'):'当前已符合目标状态';finish()}}
  }catch(cause){if(current(s)&&!signal.aborted){rows.value=[];phase.value='choose';fail(cause)}}
  finally{if(s.generation===generation)preparing.value=false}
 }
 const confirm=shallowRef<()=>Promise<void>>(async()=>{})
 const submit=shallowRef<()=>Promise<void>>(async()=>{})
 async function perform(p:Plan){
  if(plan!==p||!valid(p)||!allowed(p.action)||input.disabled()||writing.value||checking.value||phase.value!=='confirm'||!shown.value||staleSelection.value)return
  phase.value='result';writing.value=true;error.value='';controller?.abort();controller=new AbortController();const signal=controller.signal;let attempted=false
  try{
   for(const row of p.rows){
    if(row.status==='NOOP')continue
    if(!valid(p)||!allowed(p.action)||input.disabled()||signal.aborted||staleSelection.value){if(valid(p))patch(row.id,{status:'NOTRUN',detail:'范围变化，未发送'});break}
    attempted=true;patch(row.id,{status:'RUNNING',detail:'正在提交'})
    try{await writeBatchRow(p.project,row,p.action,p.target,signal);if(!valid(p))return;patch(row.id,{status:'SUCCESS',detail:'已完成'})}
    catch(cause){
     if(!valid(p)||cause instanceof IdentityChanged)return
     // 写后读回也可能失败，所有未能完整确认的行均保守保留未知，禁止自动续写。
     patch(row.id,{status:'UNKNOWN',detail:errorMessage(cause),checked:false});error.value='本次操作已停止，请核对结果；未执行的设备不会自动继续。';break
    }
   }
   if(valid(p)){rows.value=rows.value.map(r=>r.status==='READY'?{...r,status:'NOTRUN',detail:'批次已停止，未发送'}:r);if(attempted)input.changed()}
  }finally{if(p.generation===generation)writing.value=false}
 }
 async function verify(){
  const p=plan;if(!p||!valid(p)||!shown.value||!unknown.value||writing.value||checking.value)return
  checking.value=true;controller?.abort();controller=new AbortController();const signal=controller.signal;error.value=''
  rows.value=rows.value.map(r=>r.status==='UNKNOWN'?{...r,checked:false,observation:undefined}:r)
  try{
   for(const row of rows.value.filter(r=>r.status==='UNKNOWN')){
    const observation=await observeBatchRow(p.project,row,p.action,p.target,signal)
    if(!valid(p)||signal.aborted)return;patch(row.id,{checked:true,observation})
   }
  }catch(cause){if(valid(p)&&!signal.aborted)error.value=errorMessage(cause)}
  finally{if(p.generation===generation)checking.value=false}
 }
 const canFinish=computed(()=>!writing.value&&!checking.value&&rows.value.filter(r=>r.status==='UNKNOWN').every(r=>r.checked))
 function close(){if(writing.value||preparing.value||checking.value)return;dialogSequence++;optionSequence++;optionController?.abort();optionLoading.value=false;shown.value=false;if(!unknown.value){plan=undefined;rows.value=[];phase.value='choose'}}
 function finish(){if(!canFinish.value||phase.value!=='result')return;shown.value=false;plan=undefined;rows.value=[];phase.value='choose';staleSelection.value=false;void reload()}
 function clear(){if(locked.value||busy.value||input.disabled())return;input.cleared()}
 function reopen(){if(unknown.value&&!writing.value)shown.value=true}
 const stop=onIdentityChange(()=>{reset();queueMicrotask(()=>{if(!disposed)void reload()})})
 watch([()=>projectId.value,()=>session.ready,()=>session.transitioning,()=>can('device:read'),()=>can('device:update'),()=>can('device:delete'),()=>can('enduser:read'),()=>can('enduser:manage'),()=>currentProject.value?.status,()=>currentProject.value?.myRole],()=>{reset();void reload()},{immediate:true,flush:'sync'})
 watch(()=>JSON.stringify([input.deviceIds(),input.selectedGroupId()]),()=>{
  if(locked.value){staleSelection.value=true;optionSequence++;optionController?.abort();if(!writing.value&&!unknown.value){close();rows.value=[];plan=undefined;void reload()}return}
  reset();void reload()
 },{flush:'sync'})
 watch(locked,v=>input.locked(v),{immediate:true,flush:'sync'})
 onScopeDispose(()=>{disposed=true;reset();stop();input.locked(false)})
 return{action,shown,phase,rows,metadata,loading,preparing,writing,checking,error,notice,denied,staleSelection,group,user,query,choices,groups,optionLoading,optionError,more,selection,readable,counts,unknown,locked,busy,allowed,start,reload,loadGroups,loadUsers,loadMore,prepare,confirm,submit,verify,canFinish,finish,close,clear,reopen}
}
