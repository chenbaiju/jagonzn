import {computed,onScopeDispose,reactive,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {projectId,session} from '@/core/session'
import {prepareDefinitionTableOperation,type DefinitionContext,type DefinitionKind,type DefinitionTableIntent,type DefinitionTableList} from './model-definition-table-api'

type Row={id:string}
type Options<T extends Row>={typeId:()=>string;kind:DefinitionKind;rows:()=>readonly T[]|undefined;context:()=>DefinitionContext|undefined;readable:()=>boolean;writable:()=>boolean;disabled:()=>boolean;read:(signal:AbortSignal)=>Promise<DefinitionTableList<T>>;write:(intent:DefinitionTableIntent,signal:AbortSignal)=>Promise<DefinitionTableList<T>>;apply:(value:DefinitionTableList<T>)=>void;unavailable:(cause:unknown)=>void;changed:()=>void}
/** 同一表内的明确选择与拖动动作；只有真实同快照上下文才允许发出一次原子请求。 */
export function useDefinitionTableActions<T extends Row>(options:Options<T>){
 const selected=ref<string[]>([]),shown=ref(false),busy=ref(false),unknown=ref(false),conflict=ref(false),error=ref(''),notice=ref(''),observed=ref(false),intent=shallowRef<DefinitionTableIntent>()
 const dragging=ref(false)
 const drag=shallowRef<{id:string;token:string;ids:readonly string[];identity:ReturnType<typeof capture>;pointerId:number;x:number;y:number;handle:HTMLElement;table:Element}>()
 const allowed=computed(()=>options.readable()&&options.writable()&&!options.disabled()&&!busy.value&&!unknown.value&&!conflict.value&&!!options.context()&&!!options.rows())
 const locked=computed(()=>shown.value||busy.value||unknown.value||dragging.value)
 let generation=0,alive=true,controller:AbortController|undefined
 function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:options.typeId(),actor:session.user?.accountId}}
 function current(value:ReturnType<typeof capture>){return alive&&options.readable()&&value.generation===generation&&value.epoch===identityEpoch()&&value.project===projectId.value&&value.type===options.typeId()&&value.actor===session.user?.accountId}
 function reset(){generation++;controller?.abort();selected.value=[];shown.value=false;busy.value=false;unknown.value=false;conflict.value=false;intent.value=undefined;endDrag();error.value='';notice.value='';observed.value=false}
 function select(rows:T[]){if(!busy.value&&!unknown.value&&!shown.value)selected.value=rows.map(row=>row.id)}
 function operation(kind:'order'|'delete',ids:readonly string[]){return prepareDefinitionTableOperation(projectId.value,options.typeId(),options.kind,kind,options.context(),(options.rows()||[]).map(row=>row.id),ids)}
 function openDelete(){if(!allowed.value||!selected.value.length)return;endDrag();try{intent.value=operation('delete',selected.value);error.value='';notice.value='';shown.value=true}catch(cause){error.value=errorMessage(cause)}}
 function hideUnavailable(cause:unknown){if(cause instanceof ApiError&&[401,403,404].includes(cause.status))options.unavailable(cause)}
 function cancel(){if(!busy.value&&!unknown.value){shown.value=false;intent.value=undefined;error.value=''}}
 async function submit(original:DefinitionTableIntent){
  if(!allowed.value)return
  intent.value=original;busy.value=true;unknown.value=true;observed.value=false;notice.value='';error.value='';const state=capture();controller=new AbortController();let accepted=false
  try{
   const returned=await options.write(original,controller.signal);accepted=true;if(!current(state))return
   const actual=await options.read(controller.signal);if(!current(state))return
   const ids=actual.items.map(row=>row.id)
   if(returned.context.token!==actual.context.token||(original.operation==='order'?(ids.length!==original.ids.length||ids.some((id,index)=>id!==original.ids[index])):original.ids.some(id=>ids.includes(id))))throw new Error('操作回执与当前列表不同，请核对原操作')
   options.apply(actual);selected.value=[];busy.value=false;unknown.value=false;shown.value=false;intent.value=undefined;notice.value=original.operation==='order'?'排序已保存':'已移除选中的功能定义';options.changed()
  }catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){
   hideUnavailable(cause)
   if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,413,422,429].includes(cause.status)&&cause.code!==10014){unknown.value=false;conflict.value=true;shown.value=false;error.value='功能定义已变化或本次操作被拒绝，请重新读取后操作。'}
   else{shown.value=true;error.value=errorMessage(cause)}
  }}finally{if(current(state))busy.value=false}
 }
 async function confirmDelete(){const original=intent.value;if(!shown.value||!original||original.operation!=='delete'||!allowed.value)return;await submit(original)}
 async function review(){if(!unknown.value||!options.readable()||busy.value)return;const state=capture();busy.value=true;controller=new AbortController();error.value='';observed.value=false;try{const actual=await options.read(controller.signal);if(current(state)){options.apply(actual);observed.value=true}}catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){hideUnavailable(cause);error.value=errorMessage(cause)}}finally{if(current(state))busy.value=false}}
 function finish(){if(!unknown.value||!observed.value||busy.value)return;unknown.value=false;shown.value=false;intent.value=undefined;selected.value=[];notice.value='已结束本次核对；原操作结果仍未确认';options.changed()}
 async function reload(){if(!options.readable()||busy.value||unknown.value)return;const state=capture();busy.value=true;controller=new AbortController();try{const actual=await options.read(controller.signal);if(current(state)){options.apply(actual);selected.value=[];conflict.value=false;error.value=''}}catch(cause){if(current(state)){hideUnavailable(cause);error.value=errorMessage(cause)}}finally{if(current(state))busy.value=false}}
 function endDrag(){
  const original=drag.value;drag.value=undefined;dragging.value=false
  window.removeEventListener('pointermove',movePointer);window.removeEventListener('pointerup',finishPointer);window.removeEventListener('pointercancel',cancelPointer);window.removeEventListener('blur',endDrag)
  if(original){try{if(original.handle.hasPointerCapture?.(original.pointerId))original.handle.releasePointerCapture(original.pointerId)}catch{/* 已失去指针捕获时只清理本次拖动。 */}}
 }
 function startPointer(event:PointerEvent,id:string){
  if(event.button!==0||event.isPrimary===false||shown.value||!allowed.value||drag.value||!(options.rows()||[]).some(row=>row.id===id))return
  const handle=event.currentTarget instanceof HTMLElement?event.currentTarget:null,table=handle?.closest('.el-table');if(!handle||!table)return
  event.preventDefault();drag.value={id,token:options.context()!.token,ids:(options.rows()||[]).map(row=>row.id),identity:capture(),pointerId:event.pointerId,x:event.clientX,y:event.clientY,handle,table}
  try{handle.setPointerCapture?.(event.pointerId)}catch{/* 窗口监听仍可接收同一指针的结束或取消。 */}
  window.addEventListener('pointermove',movePointer);window.addEventListener('pointerup',finishPointer);window.addEventListener('pointercancel',cancelPointer);window.addEventListener('blur',endDrag)
 }
 function moved(event:PointerEvent,original:NonNullable<typeof drag.value>){return Math.hypot(event.clientX-original.x,event.clientY-original.y)>=6}
 function movePointer(event:PointerEvent){const original=drag.value;if(!original||event.pointerId!==original.pointerId)return;if(!current(original.identity)||!allowed.value||shown.value){endDrag();return}if(dragging.value||moved(event,original)){dragging.value=true;event.preventDefault()}}
 function cancelPointer(event:PointerEvent){if(event.pointerId===drag.value?.pointerId)endDrag()}
 function finishPointer(event:PointerEvent){
  const original=drag.value;if(!original||event.pointerId!==original.pointerId)return
  const active=dragging.value||moved(event,original),element=document.elementFromPoint(event.clientX,event.clientY),target=element?.closest('.el-table__row'),cl=target&&original.table.contains(target)?Array.from(target.classList).find(name=>name.startsWith('model-definition-row-')):undefined,id=cl?.slice('model-definition-row-'.length)
  endDrag()
  if(!active||!id||id===original.id||shown.value||!allowed.value||!current(original.identity))return
  const ids=(options.rows()||[]).map(row=>row.id)
  if(options.context()?.token!==original.token||ids.length!==original.ids.length||ids.some((value,index)=>value!==original.ids[index])){error.value='功能定义已变化，请重新读取后排序。';conflict.value=true;return}
  const from=ids.indexOf(original.id),to=ids.indexOf(id);if(from<0||to<0)return;ids.splice(from,1);ids.splice(to,0,original.id)
  try{void submit(operation('order',ids))}catch(cause){error.value=errorMessage(cause)}
 }
 const rowClass=({row}:{row:T})=>'model-definition-row-'+row.id
 watch([()=>projectId.value,()=>options.typeId(),()=>session.user?.accountId,()=>options.readable()],reset,{flush:'sync'})
 watch(()=>options.context()?.token,()=>{if(!busy.value&&!unknown.value&&!shown.value){selected.value=[];endDrag()}},{flush:'sync'})
 watch(()=>options.writable(),value=>{if(!value&&!busy.value&&!unknown.value){shown.value=false;intent.value=undefined;selected.value=[]}},{flush:'sync'})
 watch(allowed,value=>{if(!value)endDrag()},{flush:'sync'})
 const navigationBlocked=computed(()=>options.readable()&&(busy.value||unknown.value))
 onBeforeRouteLeave(()=>!navigationBlocked.value);onBeforeRouteUpdate(()=>!navigationBlocked.value)
 function beforeUnload(event:BeforeUnloadEvent){if(navigationBlocked.value){event.preventDefault();event.returnValue=''}}
 window.addEventListener('beforeunload',beforeUnload)
 const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;reset();dispose();window.removeEventListener('beforeunload',beforeUnload)})
 return reactive({selected,shown,busy,unknown,conflict,error,notice,observed,intent,allowed,locked,dragging,select,openDelete,cancel,confirmDelete,review,finish,reload,startPointer,rowClass,reset})
}

/** 新建或复制追加在当前末尾；达到整数上限时先让用户重新排序。 */
export function nextDefinitionOrder(rows:readonly {sortOrder:number}[]):number{
 const maximum=rows.reduce((value,row)=>Math.max(value,row.sortOrder),-1)
 if(!Number.isInteger(maximum)||maximum>=2147483647)throw new Error('功能顺序已达上限，请重新排序后再添加')
 return maximum+1
}
