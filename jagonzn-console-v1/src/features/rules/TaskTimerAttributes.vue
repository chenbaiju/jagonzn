<script setup lang="ts">
import {watch,onScopeDispose,ref} from 'vue'
import {api,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {projectId,can} from '@/core/session'
import type {Schema} from '@/core/contracts'
import type {TimerTimeType} from './task-schedule-state'
import {taskSelection,type TaskSelectionWrite} from './models'
/** 图标沿Source mdi:fan-clock/mdi:clock-start/mdi:timetable，路径来自Pictogrammers（Apache-2.0）。 */
const props=defineProps<{modelValue:readonly string[];timeTypes?:Readonly<Record<string,TimerTimeType>>;selection?:TaskSelectionWrite;disabled?:boolean}>()
const emit=defineEmits<{change:[identifiers:string[],timeTypes:Record<string,TimerTimeType>]}>()
const error=ref(''),generation=ref(0),choiceTypes=ref(new Map<string,readonly string[]>())
let request=0,resolving=0,active=true,controller:AbortController|undefined,resolver:AbortController|undefined
const family=['DAILY_TIMER','DAILY_TIMER_RANGE','DAILY_TIMER_DURATION','DAILY_TIMER_INTERVAL','DAILY_TIMER_LIST','DAILY_TIMER_RANGE_LIST','DAILY_TIMER_DURATION_LIST','DAILY_TIMER_INTERVAL_LIST'] as const
const rangeFamily=['DAILY_TIMER_RANGE','DAILY_TIMER_DURATION','DAILY_TIMER_INTERVAL','DAILY_TIMER_RANGE_LIST','DAILY_TIMER_DURATION_LIST','DAILY_TIMER_INTERVAL_LIST'] as const
const intervalFamily=['DAILY_TIMER_INTERVAL','DAILY_TIMER_INTERVAL_LIST'] as const
function hasRange(types:readonly string[]|undefined){return !!types?.some(type=>rangeFamily.some(kind=>kind===type))}
function invalidate(){generation.value++;request++;resolving++;controller?.abort();resolver?.abort();controller=undefined;resolver=undefined;choiceTypes.value=new Map();error.value=''}
const dispose=onIdentityChange(()=>{invalidate();void resolveStored()})
watch(()=>[projectId.value,JSON.stringify(props.selection),props.disabled,can('task:manage')],()=>{invalidate();void resolveStored()},{immediate:true})
onScopeDispose(()=>{active=false;invalidate();dispose()})
function endpoints(){const value:Record<string,TimerTimeType>=Object.create(null);return Object.assign(value,props.timeTypes)}
function change(identifiers:string[],timeTypes=endpoints()){
 if(props.disabled)return
 for(const key of Object.keys(timeTypes))if(!identifiers.includes(key))delete timeTypes[key]
 emit('change',identifiers,timeTypes)
}
function update(index:number,value:string){if(!props.disabled&&value!==props.modelValue[index])change(props.modelValue.map((v,i)=>i===index?value:v))}
function add(){if(!props.disabled&&props.modelValue.length<10)change([...props.modelValue,''])}
function remove(index:number){if(!props.disabled&&props.modelValue.length>1)change(props.modelValue.filter((_,i)=>i!==index))}
function isRange(identifier:string){return hasRange(choiceTypes.value.get(identifier))||!!props.timeTypes&&Object.hasOwn(props.timeTypes,identifier)}
function iconKind(identifier:string){const types=choiceTypes.value.get(identifier);if(!types)return;if(types.every(type=>intervalFamily.some(kind=>kind===type)))return 'INTERVAL';if(types.some(type=>intervalFamily.some(kind=>kind===type)))return;return hasRange(types)?(types.every(type=>rangeFamily.some(kind=>kind===type))?'RANGE':undefined):'POINT'}
function endpointValue(identifier:string){return props.timeTypes&&Object.hasOwn(props.timeTypes,identifier)?props.timeTypes[identifier]:undefined}
function setTime(index:number,value:unknown){const key=props.modelValue[index];if(!props.disabled&&key&&isRange(key)&&(value==='START'||value==='END')){const next=endpoints();next[key]=value;change([...props.modelValue],next)}}
function selected(index:number,item:unknown){
 if(props.disabled||!item||typeof item!=='object'||!('value' in item)||typeof item.value!=='string')return
 const identifier=item.value,ids=props.modelValue.map((v,i)=>i===index?identifier:v),next=endpoints(),types=choiceTypes.value.get(identifier)
 if(hasRange(types)){if(!Object.hasOwn(next,identifier))next[identifier]='START'}else if(types)delete next[identifier]
 change(ids,next)
}
/** 无集合仅兼容真实旧single；混合类型保留事实，不以某个点型掩盖区间。 */
function candidateTypes(item:Schema<'TaskDeviceTimerAttribute'>):boolean{
 if(!Object.hasOwn(item,'dataTypes'))return item.dataType==='DAILY_TIMER'
 const types=item.dataTypes
 if(!Array.isArray(types)||types.length<1||types.length>8||new Set(types).size!==types.length||types.some(t=>!family.some(kind=>kind===t)))return false
 return !Object.hasOwn(item,'dataType')||types.length===1&&item.dataType===types[0]
}
function remember(items:Schema<'TaskDeviceTimerAttribute'>[]){
 const known=new Map(choiceTypes.value),next=endpoints();let changed=false
 for(const item of items){const types=item.dataTypes||['DAILY_TIMER'];known.set(item.identifier,types);if(hasRange(types)&&props.modelValue.includes(item.identifier)&&!Object.hasOwn(next,item.identifier)){next[item.identifier]='START';changed=true}}
 choiceTypes.value=known
 if(changed)change([...props.modelValue],next)
}
async function query(project:string,prefix:string,signal:AbortSignal){
 const selection=props.selection;if(!selection)throw new Error('请选择任务目标')
 const scope=taskSelection(selection);if(!scope.targetType)throw new Error('请选择任务目标')
 const body:Schema<'TaskDeviceTimerAttributeQuery'>={...scope,targetType:scope.targetType,prefix,limit:50,dataTypes:[...family]}
 const page=await api<Schema<'TaskDeviceTimerAttributePage'>>(`/api/v1/projects/${project}/task-device-timer-attributes`,{method:'post',body,signal})
 if(!page||!Array.isArray(page.items)||page.items.length>50||typeof page.hasMore!=='boolean'||page.items.some(r=>!r||typeof r.identifier!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(r.identifier)||typeof r.name!=='string'||!candidateTypes(r))||new Set(page.items.map(r=>r.identifier)).size!==page.items.length)throw new Error('定时器属性候选不完整，请重新读取')
 return page
}
/** 只为当前编辑草稿查真实候选补START；从未向原持久计划或运行器签发缺省端点。 */
async function resolveStored(){
 const ids=[...new Set(props.modelValue.filter(id=>/^[A-Za-z0-9_-]{1,64}$/.test(id)))],project=projectId.value,epoch=identityEpoch(),local=generation.value,id=++resolving
 resolver?.abort();resolver=undefined
 if(!active||props.disabled||!props.selection||!project||!can('task:manage')||!ids.length||ids.length>10)return
 const own=new AbortController();resolver=own
 const current=()=>active&&!props.disabled&&can('task:manage')&&epoch===identityEpoch()&&local===generation.value&&id===resolving&&project===projectId.value
 try{const items:Schema<'TaskDeviceTimerAttribute'>[]=[];for(const key of ids){const page=await query(project,key,own.signal);if(!current())return;items.push(...page.items.filter(item=>item.identifier===key))}if(current())remember(items)}catch(cause){if(current())error.value=errorMessage(cause)}finally{if(resolver===own)resolver=undefined}
}
async function suggestions(prefix:string,done:(items:{value:string;name:string}[])=>void){
 const selection=props.selection,project=projectId.value,epoch=identityEpoch(),local=generation.value,id=++request
 controller?.abort();controller=undefined;resolver?.abort();resolver=undefined;resolving++
 if(props.disabled||!selection||!project||!/^[A-Za-z0-9_-]{0,64}$/.test(prefix)||!can('task:manage')){done([]);return}
 const current=()=>active&&!props.disabled&&can('task:manage')&&epoch===identityEpoch()&&local===generation.value&&id===request&&project===projectId.value
 controller=new AbortController();error.value=''
 try{const page=await query(project,prefix,controller.signal);if(!current())return;remember(page.items);done(page.items.map(r=>({value:r.identifier,name:r.name})))}catch(cause){if(!current())return;error.value=errorMessage(cause);done([])}
}
</script>
<template><el-form-item label="关联设备属性"><div class="task-timer-attributes"><div v-for="(identifier,index) in modelValue" :key="index" class="task-timer-row"><el-autocomplete :key="generation" :model-value="identifier" :fetch-suggestions="suggestions" value-key="value" size="small" placeholder="填写属性标识符" :aria-label="`定时器属性 ${index+1}`" :disabled="disabled" @update:model-value="update(index,$event)" @select="selected(index,$event)"><template #default="{item}"><span class="task-timer-suggestion"><span class="task-timer-icon"><svg v-if="iconKind(item.value)" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path v-if="iconKind(item.value)==='RANGE'" d="M12,1C8.14,1 5,4.14 5,8A7,7 0 0,0 12,15C15.86,15 19,11.87 19,8C19,4.14 15.86,1 12,1M12,3.15C14.67,3.15 16.85,5.32 16.85,8C16.85,10.68 14.67,12.85 12,12.85A4.85,4.85 0 0,1 7.15,8A4.85,4.85 0 0,1 12,3.15M11,5V8.69L14.19,10.53L14.94,9.23L12.5,7.82V5M4,16V24H6V21H18V24L22,20L18,16V19H6V16"/><path v-else-if="iconKind(item.value)==='INTERVAL'" d="M14,12H15.5V14.82L17.94,16.23L17.19,17.53L14,15.69V12M4,2H18A2,2 0 0,1 20,4V10.1C21.24,11.36 22,13.09 22,15A7,7 0 0,1 15,22C13.09,22 11.36,21.24 10.1,20H4A2,2 0 0,1 2,18V4A2,2 0 0,1 4,2M4,15V18H8.67C8.24,17.09 8,16.07 8,15H4M4,8H10V5H4V8M18,8V5H12V8H18M4,13H8.29C8.63,11.85 9.26,10.82 10.1,10H4V13M15,10.15A4.85,4.85 0 0,0 10.15,15C10.15,17.68 12.32,19.85 15,19.85A4.85,4.85 0 0,0 19.85,15C19.85,12.32 17.68,10.15 15,10.15Z"/><path v-else d="M16 14H17.5V16.8L19.9 18.2L19.1 19.5L16 17.7V14M21 11.3C20.8 7.9 17 7.2 13.3 9.2C13 8.8 12.6 8.5 12.1 8.3C12.3 7.4 12.7 6.3 13.7 5.8C16.1 4.6 16 1 11.5 1C7.9 1 7.2 5 9.1 8.7C8.7 9 8.4 9.4 8.2 9.9C7.3 9.7 6.2 9.3 5.7 8.3C4.6 5.9 1 6 1 10.5C1 14.1 5 14.8 8.7 12.9C9 13.3 9.5 13.6 9.9 13.8C9.7 14.7 9.3 15.8 8.3 16.3C5.9 17.4 6 21 10.5 21C10.8 21 11 21 11.2 20.9C12.5 22.8 14.6 24 17 24C20.9 24 24 20.9 24 17C24 14.6 22.8 12.5 21 11.3M11 10C11.6 10 12 10.4 12 11S11.6 12 11 12 10 11.6 10 11 10.4 10 11 10M17 22C14.2 22 12 19.8 12 17S14.2 12 17 12 22 14.2 22 17 19.8 22 17 22Z"/></svg></span><span>{{item.value}}</span><span class="task-timer-name">{{item.name}}</span></span></template></el-autocomplete><el-select v-if="isRange(identifier)" :model-value="endpointValue(identifier)" size="small" class="task-timer-endpoint" :aria-label="`定时器端点 ${index+1}`" :disabled="disabled" @update:model-value="setTime(index,$event)"><el-option value="START" label="开始时间"/><el-option value="END" label="结束时间"/></el-select><el-button v-if="modelValue.length>1" size="small" type="danger" :disabled="disabled" :aria-label="`移除定时器属性 ${index+1}`" @click="remove(index)">移除</el-button></div><div><el-button size="small" :disabled="disabled||modelValue.length>=10" @click="add">添加</el-button></div><p v-if="error" role="alert">{{error}}</p></div></el-form-item></template>
<style scoped>.task-timer-attributes{display:flex;flex-direction:column;gap:8px;max-width:100%}.task-timer-row{display:flex;gap:8px;align-items:center}.task-timer-row :deep(.el-autocomplete){width:300px;max-width:100%}.task-timer-row .task-timer-endpoint{width:100px;flex:none}.task-timer-suggestion{display:flex;align-items:center}.task-timer-icon{width:20px;height:20px;flex:none;margin-right:8px}.task-timer-name{flex:1;text-align:right;font-size:13px;margin-left:50px}</style>
