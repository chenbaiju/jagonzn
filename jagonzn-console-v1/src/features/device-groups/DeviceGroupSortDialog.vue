<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {InfoFilled} from '@element-plus/icons-vue'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {showOperationFeedback} from '@/ui/operation-feedback'
import type {DeviceGroup,GroupOrderItem,GroupTransport} from './device-group-api'

const props=defineProps<{modelValue:boolean;project:string;writable:boolean;transport:GroupTransport}>()
const emit=defineEmits<{ 'update:modelValue':[value:boolean]; locked:[value:boolean]; saved:[] }>()
type Node={group:DeviceGroup;children:Node[];order?:number}
const roots=ref<Node[]>([]),loading=ref(false),busy=ref(false),unknown=ref(false),error=ref(''),notice=ref(''),dragged=ref(''),hovered=ref('')
let controller:AbortController|undefined,sequence=0,dragSnapshot:Node[]|undefined
const blocked=computed(()=>loading.value||busy.value||unknown.value||!props.writable||!!error.value)
function findMovable(id:string){for(const root of roots.value){if(root.group.id===id)return {node:root,parent:null as Node|null};const child=root.children.find(node=>node.group.id===id);if(child)return {node:child,parent:root}}}
const draggedLeaf=computed(()=>{const source=findMovable(dragged.value);return !!source&&!source.node.children.length})
const draggedChild=computed(()=>!!findMovable(dragged.value)?.parent)
watch([busy,unknown],([writing,uncertain])=>emit('locked',writing||uncertain),{flush:'sync'})
function buildTree(groups:DeviceGroup[]):Node[]{
 const map=new Map(groups.map(group=>[group.id,{group,children:[] as Node[]}]))
 const top:Node[]=[]
 for(const node of map.values()){
  if(!node.group.parentId)top.push(node)
  else {const parent=map.get(node.group.parentId);if(!parent)throw new Error('设备组父级不完整，请重新读取');parent.children.push(node)}
 }
 const compare=(a:Node,b:Node)=>a.group.sortOrder-b.group.sortOrder||a.group.id.localeCompare(b.group.id)
 const visited=new Set<string>()
 function visit(nodes:Node[],depth:number){nodes.sort(compare);for(const node of nodes){if(depth>16||visited.has(node.group.id))throw new Error('设备组层级不合法，请重新读取');visited.add(node.group.id);visit(node.children,depth+1)}}
 visit(top,1);if(visited.size!==groups.length)throw new Error('设备组层级不完整，请重新读取')
 return top
}
function descendants(root:Node):{node:Node;depth:number}[]{const result:{node:Node;depth:number}[]=[];function visit(nodes:Node[],depth:number){for(const node of nodes){result.push({node,depth});visit(node.children,depth+1)}}visit(root.children,1);return result}
async function load(){
 if(busy.value)return
 const turn=++sequence,project=props.project,epoch=identityEpoch(),wasUnknown=unknown.value;controller?.abort();controller=new AbortController();const signal=controller.signal
 loading.value=true;error.value='';roots.value=[]
 try {
  if(!props.transport.order)throw new Error('设备组排序接口不可用')
  const groups=await props.transport.order(project,signal)
  if(turn===sequence&&!signal.aborted&&project===props.project&&epoch===identityEpoch()){roots.value=buildTree(groups);unknown.value=false;notice.value=wasUnknown?'已读取当前排序；原请求结果无法确认，请核对后再操作。':''}
 }catch(cause){if(turn===sequence&&!signal.aborted)error.value=errorMessage(cause)}finally{if(turn===sequence)loading.value=false}
}
watch(()=>[props.modelValue,props.project] as const,([open])=>{if(open)void load();else{sequence++;controller?.abort();roots.value=[];dragged.value=''}},{immediate:true})
const dispose=onIdentityChange(()=>{sequence++;controller?.abort();clearPointer();endDrag();roots.value=[];unknown.value=false;busy.value=false})
onScopeDispose(()=>{sequence++;controller?.abort();dispose();emit('locked',false)})
function move(sourceId:string,targetId:string,after:boolean){
 if(blocked.value||sourceId===targetId)return
 const list=roots.value,from=list.findIndex(node=>node.group.id===sourceId),target=list.findIndex(node=>node.group.id===targetId)
 if(from<0||target<0)return
 const [item]=list.splice(from,1),index=list.findIndex(node=>node.group.id===targetId)
 list.splice(index+(after?1:0),0,item!)
}
const dragVisual=ref<{x:number;y:number;width:number;offsetX:number;offsetY:number;node:Node;child:boolean}|null>(null)
let pointerDrag:{id:string;x:number;y:number;active:boolean;element:HTMLElement}|undefined
function pointerStart(event:PointerEvent,id:string){
 if(event.button!==0||blocked.value)return
 const row=event.currentTarget as HTMLElement,element=findMovable(id)?.parent?row:row.closest<HTMLElement>('.sort-root')||row
 pointerDrag={id,x:event.clientX,y:event.clientY,active:false,element}
 window.addEventListener('pointermove',pointerMove);window.addEventListener('pointerup',pointerFinish);window.addEventListener('pointercancel',pointerCancel)
}
function pointerMove(event:PointerEvent){
 const state=pointerDrag;if(!state)return
 if(!state.active){if(Math.hypot(event.clientX-state.x,event.clientY-state.y)<5)return;state.active=true;dragSnapshot=[...roots.value];dragged.value=state.id;const source=findMovable(state.id),rect=state.element.getBoundingClientRect();if(source)dragVisual.value={x:event.clientX,y:event.clientY,width:rect.width,offsetX:state.x-rect.left,offsetY:state.y-rect.top,node:source.node,child:!!source.parent}}
 if(dragVisual.value){dragVisual.value.x=event.clientX;dragVisual.value.y=event.clientY}
 event.preventDefault()
 const row=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('.sort-root-row')
 if(row?.dataset.groupId)dragOver({currentTarget:row,clientY:event.clientY} as unknown as DragEvent,row.dataset.groupId)
}
function clearPointer(){pointerDrag=undefined;dragVisual.value=null;window.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',pointerFinish);window.removeEventListener('pointercancel',pointerCancel)}
watch(()=>[props.modelValue,props.project] as const,([open,project],[wasOpen,previousProject])=>{if((wasOpen&&!open)||project!==previousProject){clearPointer();endDrag()}},{flush:'sync'})
function pointerFinish(event:PointerEvent){
 const state=pointerDrag;clearPointer();if(!state?.active)return
 const target=document.elementFromPoint(event.clientX,event.clientY),tree=target?.closest('.sort-tree')
 if(!tree){endDrag();return}
 const children=target?.closest<HTMLElement>('.sort-children')
 if(children?.dataset.groupId&&children.dataset.groupId!==state.id&&draggedLeaf.value&&event.clientX>=tree.getBoundingClientRect().left+34)dropInside(children.dataset.groupId)
 else if(draggedChild.value){const row=target?.closest<HTMLElement>('.sort-root')?.querySelector<HTMLElement>('.sort-root-row');if(row?.dataset.groupId)dropAtRoot(row.dataset.groupId,event.clientY>=row.getBoundingClientRect().bottom);else endDrag()}
 else endDrag(false)
}
function pointerCancel(){clearPointer();endDrag()}
onScopeDispose(clearPointer)
function startDrag(event:DragEvent,id:string){if(blocked.value){event.preventDefault();return}dragSnapshot=[...roots.value];dragged.value=id;if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);const group=findMovable(id)?.parent?event.currentTarget:(event.currentTarget as HTMLElement).closest('.sort-root');if(group instanceof HTMLElement)event.dataTransfer.setDragImage(group,20,15)}}
function endDrag(cancel=true){if(cancel&&dragSnapshot)roots.value=dragSnapshot;dragSnapshot=undefined;dragged.value='';hovered.value=''}
function dragOver(event:DragEvent,targetId:string){
 hovered.value=targetId
 if(!dragged.value||dragged.value===targetId)return
 const rect=(event.currentTarget as HTMLElement).getBoundingClientRect()
 if(!draggedChild.value)move(dragged.value,targetId,event.clientY>=rect.top+rect.height/2)
}
function drop(event:DragEvent,targetId:string){
 const source=dragged.value,found=findMovable(source),rect=(event.currentTarget as HTMLElement).getBoundingClientRect(),after=event.clientY>=rect.top+rect.height/2
 const previewMoved=!!dragSnapshot&&roots.value.some((node,index)=>node.group.id!==dragSnapshot?.[index]?.group.id)
 endDrag(false)
 if(found?.parent){
  if(found.node.children.some(child=>child.children.length))return
  found.parent.children.splice(found.parent.children.indexOf(found.node),1)
  const index=roots.value.findIndex(root=>root.group.id===targetId)
  roots.value.splice(index+(after?1:0),0,found.node)
 }else if(!previewMoved)move(source,targetId,after)
}
function dropAtRoot(targetId:string,after:boolean){
 const found=findMovable(dragged.value),index=roots.value.findIndex(root=>root.group.id===targetId)
 if(!found?.parent||index<0||found.node.children.some(child=>child.children.length)){endDrag();return}
 found.parent.children.splice(found.parent.children.indexOf(found.node),1)
 roots.value.splice(index+(after?1:0),0,found.node)
 endDrag(false)
}
function dropChildren(event:DragEvent,targetId:string){
 const tree=(event.currentTarget as HTMLElement).closest('.sort-tree')
 if(draggedChild.value&&tree&&event.clientX<tree.getBoundingClientRect().left+34)dropAtRoot(targetId,true)
 else dropInside(targetId)
}
function dropInside(targetId:string){
 const sourceId=dragged.value;endDrag(false);if(blocked.value||sourceId===targetId)return
 const source=findMovable(sourceId),target=roots.value.find(node=>node.group.id===targetId)
 if(!source||!target||source.node.children.length||source.parent===target)return
 const last=target.children.reduce((value,node)=>Math.max(value,node.order??node.group.sortOrder),-1)
 if(last>=2147483647){error.value='子组排序已达到上限，请重新读取';return}
 if(source.parent)source.parent.children.splice(source.parent.children.indexOf(source.node),1)
 else roots.value.splice(roots.value.indexOf(source.node),1)
 source.node.order=last+1;target.children.push(source.node)
}
function moveBy(id:string,direction:number){const index=roots.value.findIndex(node=>node.group.id===id),target=index+direction;if(index<0||target<0||target>=roots.value.length||blocked.value)return;const item=roots.value[index]!;roots.value.splice(index,1);roots.value.splice(target,0,item)}
function positions():GroupOrderItem[]{const result:GroupOrderItem[]=[];function add(node:Node,parentId:string|null,order:number){result.push({id:node.group.id,parentId,sortOrder:order,revision:node.group.revision});for(const child of node.children)add(child,node.group.id,child.order??child.group.sortOrder)}roots.value.forEach((root,index)=>add(root,null,index));return result}
function verify(items:GroupOrderItem[],groups:DeviceGroup[]){
 const actual=new Map(groups.map(group=>[group.id,group]));if(actual.size!==items.length)throw new Error('排序回执中的设备组集合不完整')
 const before=new Map(roots.value.flatMap(root=>[root.group,...descendants(root).map(item=>item.node.group)]).map(group=>[group.id,group]))
 for(const item of items){const group=actual.get(item.id!),old=before.get(item.id!);if(!group||!old||group.parentId!==item.parentId||group.sortOrder!==item.sortOrder)throw new Error('排序回执与提交位置不一致');const changed=old.parentId!==item.parentId||old.sortOrder!==item.sortOrder;if(group.revision!==(BigInt(old.revision)+(changed?1n:0n)).toString())throw new Error('排序回执版本不一致')}
}
async function save(){
 if(blocked.value||!props.transport.sort)return
 const items=positions(),project=props.project,epoch=identityEpoch(),turn=++sequence;controller?.abort();controller=new AbortController();const signal=controller.signal
 busy.value=true;error.value=''
 try{
  const result=await props.transport.sort(project,items,signal)
  if(turn!==sequence||signal.aborted||project!==props.project||epoch!==identityEpoch())return
  try{verify(items,result)}catch{throw new ApiError('排序回执不符，请重新读取核对',200,undefined,undefined,true)}
  showOperationFeedback('分组排序已保存');emit('saved');emit('update:modelValue',false)
 }catch(cause){
  if(turn!==sequence||signal.aborted)return
  unknown.value=cause instanceof ApiError&&(cause.outcomeUnknown||cause.status===409||cause.status>=500||cause.status===0)
  error.value=errorMessage(cause)
 }finally{if(turn===sequence)busy.value=false}
}
function close(value:boolean){if(!value&&!busy.value&&!unknown.value)emit('update:modelValue',false)}
</script>
<template>
 <el-dialog :model-value="modelValue" title="分组排序" width="min(600px,94vw)" :close-on-click-modal="!busy&&!unknown" :close-on-press-escape="!busy&&!unknown" :show-close="!busy&&!unknown" @update:model-value="close">
  <div class="sort-help"><el-icon><InfoFilled/></el-icon>通过上下拖动分组名称，您可以修改分组排序以及所属级别。</div>
  <p v-if="notice" role="status">{{notice}}</p>
  <p v-if="loading">正在读取设备组…</p><p v-else-if="error" role="alert">{{error}} <el-button link :disabled="busy" @click="load">重新读取核对</el-button></p>
  <TransitionGroup v-if="!loading && !error" tag="div" name="sort-list" class="sort-tree" aria-label="设备组排序">
   <div v-for="root in roots" :key="root.group.id" class="sort-root" :class="{'is-drop-target':hovered===root.group.id&&dragged!==root.group.id,'is-drag-source':dragged===root.group.id,'is-child-target':draggedChild&&hovered===root.group.id}">
    <div v-if="draggedChild" class="root-drop-slot" aria-label="拖到此处成为一级分组" @dragover.prevent="hovered=root.group.id" @drop.stop.prevent="dropAtRoot(root.group.id,false)">拖到此处成为一级分组</div>
    <div class="sort-row sort-root-row" :draggable="false" :data-group-id="root.group.id" @pointerdown="pointerStart($event,root.group.id)" tabindex="0" role="button" :aria-label="`${root.group.name}，使用上下方向键调整排序`" @keydown.up.prevent="moveBy(root.group.id,-1)" @keydown.down.prevent="moveBy(root.group.id,1)" @dragstart="startDrag($event,root.group.id)" @dragend="endDrag()" @dragover.prevent="dragOver($event,root.group.id)" @drop.prevent="drop($event,root.group.id)"><span><i v-if="root.group.color" :style="{background:root.group.color}"/>{{root.group.name}}</span></div>
    <div class="sort-children" :data-group-id="root.group.id" :class="{'is-dragging':draggedLeaf}" @dragover.prevent="hovered=root.group.id" @drop.stop.prevent="dropChildren($event,root.group.id)"><div v-for="item in descendants(root)" :key="item.node.group.id" class="sort-row" :class="{'sort-child-row':item.depth===1,'is-drag-source':dragged===item.node.group.id}" :draggable="false" @pointerdown.stop="item.depth===1&&pointerStart($event,item.node.group.id)" :style="{paddingLeft:`${13+(item.depth-1)*17}px`}" @dragstart.stop="item.depth===1&&startDrag($event,item.node.group.id)" @dragend.stop="endDrag()"><i v-if="item.node.group.color" :style="{background:item.node.group.color}"/>{{item.node.group.name}}</div><span v-if="draggedLeaf && dragged!==root.group.id" class="sort-drop-hint">拖到此处作为子组</span></div>
    <div v-if="draggedChild" class="root-drop-slot" aria-label="拖到此处成为一级分组" @dragover.prevent="hovered=root.group.id" @drop.stop.prevent="dropAtRoot(root.group.id,true)">拖到此处成为一级分组</div>
   </div>
  </TransitionGroup>
  <Teleport to="body"><div v-if="dragVisual" class="sort-drag-preview" :style="{left:`${dragVisual.x-dragVisual.offsetX}px`,top:`${dragVisual.y-dragVisual.offsetY}px`,width:`${dragVisual.width}px`}"><div class="sort-row"><i v-if="dragVisual.node.group.color" :style="{background:dragVisual.node.group.color}"/>{{dragVisual.node.group.name}}</div><div v-if="!dragVisual.child" class="sort-preview-children"><div v-for="item in descendants(dragVisual.node)" :key="item.node.group.id" class="sort-row" :style="{paddingLeft:`${13+(item.depth-1)*17}px`}"><i v-if="item.node.group.color" :style="{background:item.node.group.color}"/>{{item.node.group.name}}</div></div></div></Teleport>
  <template #footer><el-button :disabled="busy||unknown" @click="close(false)">取消</el-button><el-button type="primary" :loading="busy" :disabled="blocked" @click="save">保存</el-button></template>
 </el-dialog>
</template>
<style scoped>
.sort-help{display:flex;align-items:center;gap:8px;padding:10px 16px;background:#f4f4f5;color:#909399;font-size:12px;border-radius:4px}.sort-tree{margin:16px 0;max-height:50vh;overflow:auto}.sort-root{border:1px solid transparent;border-radius:4px}.sort-root.is-drop-target{border:1px dashed #409eff;background:#edf1ff}.sort-root.is-drag-source{opacity:.55}.sort-row{min-height:31px;padding:6px 13px;box-sizing:border-box;color:#606266;font-size:14px;overflow-wrap:anywhere}.sort-root-row{cursor:grab}.sort-root-row:active{cursor:grabbing}.sort-row i{display:inline-block;width:4px;height:12px;margin-right:8px}.sort-children{padding-left:17px}.sort-children.is-dragging{min-height:24px}.sort-drop-hint{display:block;padding:4px 13px;color:#909399;font-size:12px}
.sort-list-move{transition:transform .18s ease}
.sort-root{position:relative}.sort-drop-hint{height:24px;box-sizing:border-box}.root-drop-slot{position:absolute!important;left:0;right:0;min-height:6px!important;height:6px;overflow:hidden;line-height:6px!important;z-index:1}.root-drop-slot:first-child{top:0}.root-drop-slot:last-child{bottom:0}
.sort-root-row,.sort-child-row{touch-action:none;user-select:none}
.sort-child-row{cursor:grab}.sort-child-row:active{cursor:grabbing}.sort-row.is-drag-source{opacity:.55}.sort-root.is-child-target>.sort-root-row{border-top:2px dashed #409eff}
.root-drop-slot{min-height:24px;border:1px dashed #a0cfff;border-radius:4px;color:#79aee9;font-size:12px;line-height:24px;text-align:center}.root-drop-slot:hover{background:#edf5ff}
.sort-drag-preview{position:fixed;z-index:4000;pointer-events:none;box-sizing:border-box;background:rgba(117,139,229,.28);border:1px dashed #409eff;border-radius:4px;opacity:.9}.sort-preview-children{padding-left:17px}.sort-drag-preview .sort-row{min-height:31px;padding:6px 13px;box-sizing:border-box;color:#606266;font-size:14px}.sort-drag-preview i{display:inline-block;width:4px;height:12px;margin-right:8px}.sort-root.is-drag-source,.sort-row.is-drag-source{opacity:.38;outline:1px dashed #409eff;background:#edf1ff}.sort-drop-hint,.root-drop-slot{font-size:0;color:transparent}
</style>
