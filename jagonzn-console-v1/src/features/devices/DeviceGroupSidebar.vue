<script setup lang="ts">
import {computed,ref,watch,onScopeDispose} from 'vue'
import type {Group} from './api'
const props=defineProps<{groups:Group[];selected:string;loading?:boolean;ungrouped?:boolean}>()
const emit=defineEmits<{select:[id:string];ungrouped:[]}>()
const expanded=ref(new Set<string>())
const sidebar=ref<HTMLElement>(),width=ref<number>(),dragging=ref(false)
let originX=0,originWidth=0,pointerId:number|undefined
const maxWidth=()=>Math.max(150,Math.min(600,window.innerWidth-240))
function setWidth(value:number){width.value=Math.max(150,Math.min(maxWidth(),value))}
function stopResize(){dragging.value=false;pointerId=undefined;window.removeEventListener('pointermove',moveResize);window.removeEventListener('pointerup',stopResize);window.removeEventListener('pointercancel',stopResize)}
function moveResize(event:PointerEvent){if(event.pointerId===pointerId)setWidth(originWidth+event.clientX-originX)}
function startResize(event:PointerEvent){if(event.button!==0||!sidebar.value)return;event.preventDefault();stopResize();originX=event.clientX;originWidth=sidebar.value.getBoundingClientRect().width;pointerId=event.pointerId;dragging.value=true;window.addEventListener('pointermove',moveResize);window.addEventListener('pointerup',stopResize);window.addEventListener('pointercancel',stopResize)}
function resizeKey(event:KeyboardEvent){if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();setWidth((width.value??sidebar.value?.getBoundingClientRect().width??200)+(event.key==='ArrowRight'?10:-10))}
onScopeDispose(stopResize)
const nodes=computed(()=>{
 const valid=props.groups.filter((group):group is Group&{id:string}=>!!group.id)
 const ids=new Set(valid.map(group=>group.id)),children=new Map<string,typeof valid>(),roots:typeof valid=[]
 for(const group of valid){const parent=group.parentId;if(parent&&parent!==group.id&&ids.has(parent)){const list=children.get(parent)||[];list.push(group);children.set(parent,list)}else roots.push(group)}
 return {valid,children,roots}
})
watch(()=>props.groups,()=>{const parents=new Set(nodes.value.children.keys());expanded.value=new Set([...expanded.value,...parents])},{immediate:true})
watch(()=>props.selected,id=>{if(!id)return;const byId=new Map(nodes.value.valid.map(group=>[group.id,group])),seen=new Set<string>();let parent=byId.get(id)?.parentId;while(parent&&!seen.has(parent)){seen.add(parent);expanded.value.add(parent);parent=byId.get(parent)?.parentId}expanded.value=new Set(expanded.value)},{immediate:true})
const rows=computed(()=>{const result:Array<{group:Group&{id:string};depth:number;hasChildren:boolean}>=[],seen=new Set<string>();function visit(group:Group&{id:string},depth:number){if(seen.has(group.id))return;seen.add(group.id);const nested=nodes.value.children.get(group.id)||[];result.push({group,depth,hasChildren:nested.length>0});if(expanded.value.has(group.id))nested.forEach(child=>visit(child,depth+1))}nodes.value.roots.forEach(group=>visit(group,0));return result})
function toggle(id:string){const next=new Set(expanded.value);next.has(id)?next.delete(id):next.add(id);expanded.value=next}
</script>
<template>
 <aside ref="sidebar" class="device-group-sidebar" :class="{resizing:dragging}" :style="width===undefined?undefined:{width:`${width}px`}" aria-label="设备分组">
  <button type="button" class="sidebar-filter" :class="{selected:!selected&&!ungrouped}" @click="emit('select','')"><span class="group-toggle-space"/><span class="group-color" aria-hidden="true"/><span class="sidebar-label">全部设备</span></button>
  <button type="button" class="sidebar-filter" :class="{selected:ungrouped}" @click="emit('ungrouped')"><span class="group-toggle-space"/><span class="group-color" aria-hidden="true"/><span class="sidebar-label">未分组设备</span></button>
  <span v-if="loading" class="tl-muted sidebar-loading">正在读取分组…</span>
  <div v-for="row in rows" :key="row.group.id" class="group-row" :class="{selected:selected===row.group.id}" :style="{paddingLeft:`${8+row.depth*18}px`}">
   <button v-if="row.hasChildren" type="button" class="group-toggle" :aria-label="`${expanded.has(row.group.id)?'收起':'展开'} ${row.group.name}`" :aria-expanded="expanded.has(row.group.id)" @click="toggle(row.group.id)"><span :class="{open:expanded.has(row.group.id)}">▸</span></button><span v-else class="group-toggle-space"/>
   <span class="group-color" :style="{backgroundColor:row.group.color||'transparent'}" aria-hidden="true"/>
   <button type="button" class="group-name" :title="row.group.name" @click="emit('select',row.group.id)">{{row.group.name}}</button>
   <router-link class="group-detail" :to="{name:'device-groups',params:{groupId:row.group.id}}" :aria-label="`查看设备组 ${row.group.name} 详情`" :title="`查看 ${row.group.name} 详情`">↗</router-link>
  </div>
  <div class="sidebar-resizer" role="separator" tabindex="0" aria-label="调整设备组侧栏宽度" aria-orientation="vertical" :aria-valuenow="Math.round(width??360)" aria-valuemin="150" :aria-valuemax="maxWidth()" @pointerdown="startResize" @keydown="resizeKey"/>
 </aside>
</template>
<style scoped>
.device-group-sidebar{position:relative;box-sizing:border-box;width:360px;max-width:calc(100vw - 80px);flex:none;padding:10px;border-right:1px solid #ebeef5;overflow-y:auto;overflow-x:hidden;font-size:14px;line-height:21px}
.sidebar-filter{display:flex;align-items:center;width:100%;height:34px;box-sizing:border-box;padding:5px 0 5px 8px;border:0;background:none;font:inherit;line-height:21px;color:#4a4a4a;text-align:left;white-space:nowrap;cursor:pointer}
.sidebar-filter:hover,.group-row:hover{background:#f6f7fb;color:#1e88e5}
.sidebar-filter.selected,.group-row.selected{background:transparent;color:#1e88e5;font-weight:700}
.sidebar-filter.selected .sidebar-label,.group-row.selected .group-name{font-weight:700}
.sidebar-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sidebar-loading{display:block;padding:12px 20px}
.group-row{display:flex;align-items:center;height:34px;box-sizing:border-box;padding:5px 0 5px 8px;color:#4a4a4a;cursor:pointer}
.group-toggle,.group-toggle-space{display:inline-flex;align-items:center;justify-content:center;width:16px;height:100%;flex:none}
.group-toggle{padding:0;border:0;background:none;color:#c0c4cc;font:inherit;cursor:pointer}
.group-toggle span{display:inline-block;line-height:1;transition:transform .15s}
.group-toggle span.open{transform:rotate(90deg)}
.group-color{width:5px;height:20px;flex:none;margin-right:8px;border-radius:2px;background:transparent}
.group-name{flex:1;min-width:0;padding:0;border:0;background:none;font:inherit;line-height:21px;color:inherit;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.group-detail{visibility:hidden;flex:none;margin-left:4px;padding:0 3px;color:#606266;line-height:1;text-decoration:none}
.group-row:hover .group-detail,.group-row:focus-within .group-detail{visibility:visible}
.group-detail:hover{color:#1e88e5}
.sidebar-resizer{position:absolute;z-index:2;top:0;right:-1px;width:1px;height:100%;background:#ebeef5;cursor:col-resize;touch-action:none}
.sidebar-resizer::before{content:"";position:absolute;top:0;bottom:0;left:-3px;right:-3px}
.sidebar-resizer:hover,.sidebar-resizer:focus-visible,.device-group-sidebar.resizing .sidebar-resizer{width:3px;background:#409eff;outline:none}
@media(max-width:760px){.device-group-sidebar{width:150px}}
</style>
