<script setup lang="ts">
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {plainDeclaredNumber} from './scalar-material-values'
import FunctionMdiIcon from './FunctionMdiIcon.vue'
import {sourceStyleTokenWithoutGlyph} from './function-style-icons'
import {Plus,Close} from '@element-plus/icons-vue'
import './function-definition.css'
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {typeProfileId} from './profile-api'
import {convertThingsCloudTsl,convertThingsCloudScalarTsl,convertThingsCloudFunctionTsl,convertThingsCloudNumberFunctionTsl,convertThingsCloudStyledFunctionTsl,convertThingsCloudCompositeTsl,convertThingsCloudSourceStyleTsl,convertThingsCloudBasicObjectTsl,type TslPreview,type TslFunctionPreview} from './things-cloud-tsl'
import {readStandardLibraryCatalog,prepareStandardLibrarySelection,type StandardFunctionDefinitionsCatalog,type StandardFunctionDefinitionEntry} from './standard-function-catalog-api'
import {prepareTslMaterial,prepareTslMaterialConfirmation,tslMaterialFormat,scalarTslMaterialFormat,tslMaterialMaximumBytes,tslMaterialTransport,materialDefinitionCount,type MaterialProperty,type TslMaterialTransport,type TslMaterialCandidate,type TslMaterialPreview,type TslMaterialIntent,type TslMaterialReceipt} from './tsl-material-import-api'
import {functionTslMaterialFormat,numericFunctionTslMaterialFormat,styledFunctionTslMaterialFormat,compositeTslMaterialFormat,sourceStyleTslMaterialFormat,basicObjectTslMaterialFormat} from './function-material-values'
const props=withDefaults(defineProps<{typeId:string;typeStatus:string;disabled?:boolean;toolbar?:boolean;transport?:TslMaterialTransport}>(),{disabled:false,toolbar:false,transport:()=>tslMaterialTransport})
const mode=ref<'tsl'|'standard'>('tsl'),catalog=shallowRef<StandardFunctionDefinitionsCatalog>(),selected=ref<string[]>([]),search=ref(''),category=ref(''),page=ref(1),pageSize=50
const visibleStandards=computed(()=>catalog.value?.entries.filter(e=>(!category.value||e.category===category.value)&&`${standardName(e)} ${standardKey(e)} ${e.category}`.toLowerCase().includes(search.value.trim().toLowerCase()))||[])
const categories=computed(()=>[...new Set(catalog.value?.entries.map(entry=>entry.category)||[])])
const pagedStandards=computed(()=>visibleStandards.value.slice((page.value-1)*pageSize,page.value*pageSize))
const standardPages=computed(()=>Math.max(1,Math.ceil(visibleStandards.value.length/pageSize)))
watch([search,category],()=>{page.value=1})
watch(standardPages,value=>{if(page.value>value)page.value=value})
const chosenStandards=computed(()=>selected.value.flatMap(id=>{const entry=catalog.value?.entries.find(row=>row.id===id);return entry?[entry]:[]}))
const standardSelectionNotice=ref('')
const conversionFormat=ref(tslMaterialFormat)
type DisplayProperty=Omit<Partial<MaterialProperty>,'unit'|'decimalPlaces'|'minimumValue'|'maximumValue'>&{unit?:string|null;decimalPlaces?:number|null;minimumValue?:string|null;maximumValue?:string|null}
const accessLabels:Record<string,string>={REPORT:'设备上报',DOWNLINK:'云端下发',SHARED:'设备云端共享',CLOUD_PRIVATE:'云端私有'},typeLabels:Record<string,string>={NUMBER:'Number',TEXT:'Text',SWITCH:'Switch',ENUM:'Enum',OBJECT:'Object',LIST:'List'}
function optionsSummary(row:DisplayProperty){const parts:string[]=[]
 if(row.dataType==='NUMBER'){if(row.unit)parts.push(row.unit);if(row.numericStep!==undefined)parts.push(`精度 ${plainDeclaredNumber(row.numericStep)}`);if(row.decimalPlaces!=null)parts.push(`小数位数 ${row.decimalPlaces}`);if(row.minimumValue!=null)parts.push(`最小值 ${plainDeclaredNumber(row.minimumValue)}`);if(row.maximumValue!=null)parts.push(`最大值 ${plainDeclaredNumber(row.maximumValue)}`);if(row.defaultValue!==undefined)parts.push(`默认值 ${plainDeclaredNumber(row.defaultValue)}`)}
 else if(row.dataType==='TEXT'&&row.textDefaultValue!==undefined)parts.push(`默认值 ${JSON.stringify(row.textDefaultValue)}`)
 else if(row.dataType==='SWITCH'){parts.push(row.switchEncoding==='NUMBER'?'Number（1 / 0）':row.switchEncoding==='TEXT'?'Text（ON / OFF）':'Boolean（true / false）');if(row.onLabel)parts.push(`开启 ${row.onLabel}`);if(row.offLabel)parts.push(`关闭 ${row.offLabel}`)}
 else if(row.dataType==='ENUM')parts.push(...(row.enumOptions||[]).map(value=>`${value}${row.presentation?.enumDescriptions?.[value]?`：${row.presentation.enumDescriptions[value]}`:''}`))
 else if(row.dataType==='OBJECT'&&row.schema){const schema=parseDashboardRuntimeResponse(new TextEncoder().encode(row.schema)),required=Array.isArray(schema.required)?schema.required:[];parts.push('平台封闭对象，maxProperties 等于子字段数');for(const [key,field]of Object.entries(row.presentation?.objectFields||{}))parts.push(`${field.name}（${key}） · ${required.includes(key)?'必填':'可选'}${field.description?' · '+field.description:''}`)}
 else if(row.dataType==='LIST'&&row.compositeProfile==='BASIC_MIXED_LIST_V1')parts.push('平台混合基本值列表 · 无 items · 最多256项')
 return parts.join(' · ')||'未设扩展选项'
}
function standardStyle(entry:StandardFunctionDefinitionEntry){return entry.property?.presentation??entry.event?.presentation??entry.command?.presentation}
function standardValue(entry:StandardFunctionDefinitionEntry){return entry.property||entry.event||entry.command}
function standardName(entry:StandardFunctionDefinitionEntry){return standardValue(entry)?.name||''}
function standardKey(entry:StandardFunctionDefinitionEntry){return entry.property?.propertyKey||entry.event?.eventKey||entry.command?.commandKey||''}
function standardDescription(entry:StandardFunctionDefinitionEntry){return standardValue(entry)?.description||''}
function selectStandards(value:unknown){
 if(props.disabled||locked.value||!Array.isArray(value)||!catalog.value)return
 const ids=value.filter((id):id is string=>typeof id==='string');if(ids.length!==value.length)return
 const ordered=[...selected.value.filter(id=>ids.includes(id)),...ids.filter(id=>!selected.value.includes(id))],keys=new Set<string>(),accepted:string[]=[]
 standardSelectionNotice.value=''
 if(ordered.length>100){standardSelectionNotice.value='每次最多添加100项功能，请分批选择。';return}
 for(const id of ordered){const entry=catalog.value.entries.find(row=>row.id===id);if(!entry)continue;const key=entry.kind+':'+standardKey(entry);if(keys.has(key)){standardSelectionNotice.value='已选择同标识的功能，请先取消原选择。';continue}keys.add(key);accepted.push(id)}
 selected.value=accepted
}

function standardCardSummary(entry:StandardFunctionDefinitionEntry){
 const value=entry.property
 if(!value)return standardDescription(entry)
 const parts:string[]=[]
 if(value.unit)parts.push(`单位: ${value.unit}`)
 if(value.minimumValue!=null||value.maximumValue!=null)parts.push(`范围: ${value.minimumValue!=null?plainDeclaredNumber(value.minimumValue):'-'}-${value.maximumValue!=null?plainDeclaredNumber(value.maximumValue):'-'}`)
 if(value.numericStep!==undefined)parts.push(`精度: ${plainDeclaredNumber(value.numericStep)}`)
 return parts.join('  ')
}
function standardSummary(entry:StandardFunctionDefinitionEntry){if(entry.property)return `${accessLabels[entry.property.accessType||'']||'未知流向'} · ${typeLabels[entry.property.dataType||'']||'未知类型'} · ${optionsSummary(entry.property)}`;if(entry.event)return '事件 · '+entry.event.parameters?.map(row=>row.name+'（'+row.parameterKey+'）').join('、');return '命令 · 超时30秒（平台默认）'}
const localEvents=computed(()=>result.value&&'events' in result.value?result.value.events:[]),localCommands=computed(()=>result.value&&'commands' in result.value?result.value.commands:[]),localDecisions=computed(()=>result.value&&'adaptationDecisions' in result.value?result.value.adaptationDecisions:[])
const localCount=computed(()=>(result.value?.properties.length||0)+localEvents.value.length+localCommands.value.length)
const emit=defineEmits<{locked:[value:boolean];changed:[]}>()
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeProfileId(props.typeId)&&!!projectId.value&&currentProject.value?.id===projectId.value&&['ACTIVE','ARCHIVED'].includes(currentProject.value.status||'')&&['OWNER','ADMIN','OPERATOR','VIEWER'].includes(session.user.projectRole||'')&&['OWNER','ADMIN','OPERATOR','VIEWER'].includes(currentProject.value.myRole||'')&&can('device:read'))
const writable=computed(()=>readable.value&&['DRAFT','PUBLISHED'].includes(props.typeStatus)&&currentProject.value?.status==='ACTIVE'&&can('device:update')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const shown=ref(false),text=ref(''),result=shallowRef<TslPreview|TslFunctionPreview>(),busy=ref(false),pipeline=ref(false),unknown=ref(false),error=ref(''),notice=ref(''),candidate=shallowRef<TslMaterialCandidate>(),authority=shallowRef<TslMaterialPreview>(),intent=shallowRef<TslMaterialIntent>(),receipt=shallowRef<TslMaterialReceipt>()
const converted=computed(()=>result.value&&!result.value.issues.length?JSON.stringify({properties:result.value.properties},null,2):''),withinBudget=computed(()=>new TextEncoder().encode(text.value).length<=tslMaterialMaximumBytes),locked=computed(()=>busy.value||unknown.value||pipeline.value)
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
let generation=0,alive=true,controller:AbortController|undefined
function clear(){standardSelectionNotice.value='';generation++;controller?.abort();shown.value=false;mode.value='tsl';catalog.value=undefined;selected.value=[];search.value='';category.value='';text.value='';result.value=undefined;candidate.value=undefined;authority.value=undefined;intent.value=undefined;receipt.value=undefined;busy.value=false;pipeline.value=false;unknown.value=false;error.value='';notice.value=''}
function invalidate(){if(unknown.value)return;generation++;controller?.abort();busy.value=false;result.value=undefined;candidate.value=undefined;authority.value=undefined;error.value=''}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:props.typeId,account:session.user?.accountId}}
function current(s:ReturnType<typeof capture>){return alive&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.type===props.typeId&&s.account===session.user?.accountId&&readable.value}
function open(){if(readable.value&&!props.disabled&&!locked.value){clear();shown.value=true}}
async function openStandard(){
 if(!readable.value||props.disabled||locked.value)return
 clear();mode.value='standard';shown.value=true;const s=capture();busy.value=true;controller=new AbortController()
 try{const value=await readStandardLibraryCatalog(s.project,controller.signal);if(current(s))catalog.value=value}catch(cause){if(current(s)&&!(cause instanceof IdentityChanged))error.value=errorMessage(cause)}finally{if(current(s))busy.value=false}
}
async function readStandardAuthority(){
 if(!writable.value||props.disabled||(busy.value||unknown.value)||!catalog.value||!selected.value.length)return
 const s=capture(),source=catalog.value,ids=[...selected.value];busy.value=true;error.value='';authority.value=undefined;controller=new AbortController()
 try{const prepared=await prepareStandardLibrarySelection(s.project,s.type,source,ids);if(!current(s))return;candidate.value=prepared;const value=await props.transport.preview(prepared,controller.signal);if(current(s)&&candidate.value===prepared)authority.value=value}catch(cause){if(current(s)&&!(cause instanceof IdentityChanged))error.value=errorMessage(cause)}finally{if(current(s))busy.value=false}
}
function close(){if(busy.value||pipeline.value)return;if(unknown.value)shown.value=false;else clear()}
function preview(){
 if(!readable.value||props.disabled||!shown.value||locked.value)return
 const bytes=new TextEncoder().encode(text.value)
 if(new TextDecoder('utf-8',{fatal:true}).decode(bytes)!==text.value){result.value={properties:[],issues:[{path:'$',message:'原文含无效Unicode字符串'}]};return}
 const legacy=convertThingsCloudTsl(bytes),scalar=legacy.issues.length?convertThingsCloudScalarTsl(bytes):legacy,functions=scalar.issues.length?convertThingsCloudFunctionTsl(bytes):undefined,numeric=functions?.issues.length?convertThingsCloudNumberFunctionTsl(bytes):undefined,styled=numeric?.issues.length?convertThingsCloudStyledFunctionTsl(bytes):undefined,composite=styled?.issues.length?convertThingsCloudCompositeTsl(bytes):undefined,tokens=composite?.issues.length?convertThingsCloudSourceStyleTsl(bytes):undefined,basic=tokens?.issues.length?convertThingsCloudBasicObjectTsl(bytes):undefined;conversionFormat.value=!legacy.issues.length?tslMaterialFormat:!scalar.issues.length?scalarTslMaterialFormat:!functions?.issues.length?functionTslMaterialFormat:!numeric?.issues.length?numericFunctionTslMaterialFormat:!styled?.issues.length?styledFunctionTslMaterialFormat:!composite?.issues.length?compositeTslMaterialFormat:!tokens?.issues.length?sourceStyleTslMaterialFormat:basicObjectTslMaterialFormat;result.value=!scalar.issues.length?scalar:basic??tokens??composite??styled??numeric??functions;candidate.value=undefined;authority.value=undefined;error.value=''
}
async function readAuthority(){
 if(!writable.value||props.disabled||locked.value||!withinBudget.value||!result.value||result.value.issues.length||!localCount.value)return
 const s=capture(),source=text.value;busy.value=true;error.value='';candidate.value=undefined;authority.value=undefined;controller=new AbortController()
 try{const prepared=await prepareTslMaterial(s.project,s.type,source,conversionFormat.value);if(!current(s)||text.value!==source)return;candidate.value=prepared;const actual=await props.transport.preview(prepared,controller.signal);if(current(s)&&candidate.value===prepared)authority.value=actual}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged))error.value=errorMessage(cause)}finally{if(current(s))busy.value=false}
}
function standardSelectionKey(){return JSON.stringify(selected.value)}
async function addStandard(){
 if(!props.toolbar||mode.value!=='standard'||!writable.value||props.disabled||(busy.value||unknown.value)||!catalog.value||!selected.value.length)return
 const s=capture(),source=catalog.value,keys=standardSelectionKey();pipeline.value=true
 try{await readStandardAuthority()
 if(!current(s)||!writable.value||props.disabled||catalog.value!==source||standardSelectionKey()!==keys||!candidate.value||!authority.value)return
 if(authority.value.issues.length){error.value=authority.value.issues.map(issue=>issue.message).join('；');return}
 await confirm()
 }finally{if(current(s))pipeline.value=false}
}
function complete(value:TslMaterialReceipt){receipt.value=value;unknown.value=false;intent.value=undefined;candidate.value=undefined;authority.value=undefined;busy.value=false;shown.value=false;notice.value=props.toolbar&&mode.value==='standard'?`已添加 ${value.items.length} 项标准功能。`:`已原子导入 ${value.items.length} 项功能，原新增身份已确认；类型功能已保存，现有设备绑定保持。`;emit('changed')}
async function confirm(){
 if(!writable.value||props.disabled||(busy.value||unknown.value)||!candidate.value||!authority.value||authority.value.issues.length)return
 const s=capture();let original:TslMaterialIntent;try{original=prepareTslMaterialConfirmation(candidate.value,authority.value)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=original;unknown.value=true;busy.value=true;error.value='';controller=new AbortController()
 try{const saved=await props.transport.confirm(original,controller.signal);if(current(s)&&intent.value===original)complete(saved)}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){error.value=errorMessage(cause);const rejected=cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,401,403,404,409,413,422].includes(cause.status);if(rejected){unknown.value=false;intent.value=undefined;candidate.value=undefined;authority.value=undefined}}}
 finally{if(current(s))busy.value=false}
}
async function original(){
 const saved=intent.value;if(!readable.value||busy.value||!unknown.value||!saved)return
 const s=capture();busy.value=true;error.value='';controller=new AbortController()
 try{const actual=await props.transport.original(saved,controller.signal);if(current(s)&&intent.value===saved)complete(actual)}catch(cause){if(current(s)&&!(cause instanceof IdentityChanged))error.value=cause instanceof ApiError&&cause.status===404?'尚未找到同次导入原件，结果仍未知，请继续按原键核对。':errorMessage(cause)}finally{if(current(s))busy.value=false}
}
watch(text,invalidate)
watch(selected,()=>{if(!locked.value){candidate.value=undefined;authority.value=undefined;error.value=''}},{deep:true})
watch([()=>props.typeId,()=>projectId.value,()=>session.user?.accountId,readable],clear,{flush:'sync'})
watch(()=>props.typeStatus,()=>{if(!unknown.value&&shown.value){clear();notice.value='设备类型状态已变化，请重新读取材料和权威预览。'}},{flush:'sync'})
watch(writable,()=>{if(!locked.value){candidate.value=undefined;authority.value=undefined}})
const dispose=onIdentityChange(clear);onScopeDispose(()=>{alive=false;clear();dispose()})
</script>
<template><section class="tsl-preview" :class="{'tsl-toolbar':toolbar}">
 <el-button v-if="readable&&!toolbar" :disabled="disabled||locked" @click="open">预览 ThingsCloud TSL 转换</el-button>
 <el-button v-if="readable" :type="toolbar?'primary':undefined" :icon="Plus" :disabled="disabled||locked" @click="openStandard">添加标准功能</el-button>
 <p v-if="notice" role="status">{{notice}}</p><p v-if="receipt&&!toolbar">本次新增：{{receipt.items.map(item=>item.key).join('、')}}</p>
 <el-alert v-if="error&&(!toolbar||!shown)" :title="error" type="error" :closable="false"/>
 <p v-if="unknown&&(!toolbar||!shown)" role="alert">本次导入结果待核对，请勿重复提交。<el-button :disabled="busy||!readable" @click="original">按原键读取导入结果</el-button></p>
 <component :is="toolbar?'el-dialog':'section'" v-if="shown&&readable" :model-value="shown&&readable" :title="mode==='tsl'?'导入 ThingsCloud TSL 材料':'添加标准功能'" width="min(800px,96vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :before-close="(done:()=>void)=>{if(!busy&&!pipeline){close();done()}}" :class="toolbar?'standard-dialog function-tool-dialog':'tsl-panel'">
  <el-alert v-if="toolbar&&error" :title="error" type="error" :closable="false"/>
  <template v-if="toolbar&&unknown"><p>本次添加结果待核对，请勿重复提交。</p><el-button :disabled="busy||!readable" @click="original">按原键读取导入结果</el-button></template>
  <template v-else-if="mode==='standard'">
   <el-button v-if="toolbar" text @click="mode='tsl'">改用 ThingsCloud TSL 材料</el-button>
   <h3 v-if="!toolbar">ThingsLink 标准功能</h3><p v-if="!toolbar">选择常用功能添加到当前类型；已有同名标识不会被覆盖。</p><p v-if="catalog&&!toolbar">当前提供 {{catalog.entries.length}} 项标准功能。</p><div :class="{'standard-columns':toolbar}"><section><div class="standard-filters"><el-select v-if="toolbar" v-model="category" placeholder="选择所属品类" clearable aria-label="标准功能所属品类" :disabled="locked"><el-option v-for="value in categories" :key="value" :value="value" :label="value"/></el-select>
   <el-input v-model="search" aria-label="搜索标准功能" placeholder="搜索功能名称" :disabled="locked"/></div>
   <p v-if="standardSelectionNotice" role="status">{{standardSelectionNotice}}</p>
   <el-checkbox-group :model-value="selected" @update:model-value="selectStandards" aria-label="标准功能选择" :disabled="disabled||locked"><div v-for="entry in pagedStandards" :key="entry.id" class="standard-entry" :class="{'standard-entry--selected':selected.includes(entry.id)}"><el-checkbox :value="entry.id" :title="standardName(entry)+'（'+standardKey(entry)+'） '+standardDescription(entry)"><template v-if="toolbar"><span class="standard-entry-title"><FunctionMdiIcon :icon-id="standardStyle(entry)?.iconId" :color="standardStyle(entry)?.color"/>{{standardName(entry)}}<span class="standard-kind">{{entry.kind==='EVENT'?'事件':entry.kind==='COMMAND'?'命令':'属性'}}</span><span class="definition-parameter-action-label">（{{standardKey(entry)}}）</span></span><span class="standard-entry-meta">{{standardCardSummary(entry)}}</span><svg class="standard-entry-arrow" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h9V4l7 8-7 8v-4H4Z"/></svg></template><template v-else><FunctionMdiIcon :icon-id="standardStyle(entry)?.iconId" :color="standardStyle(entry)?.color"/>{{standardName(entry)}}（{{standardKey(entry)}}）</template></el-checkbox><template v-if="!toolbar"><span>{{entry.category}} · {{standardSummary(entry)}}</span><p>{{standardDescription(entry)}}</p><p v-if="sourceStyleTokenWithoutGlyph(standardStyle(entry)?.iconId)">原图标暂无对应图形，标识和颜色仍保留。</p></template></div></el-checkbox-group><div class="standard-pagination"><span>共 {{ visibleStandards.length }} 项</span><el-pagination v-if="visibleStandards.length>pageSize" v-model:current-page="page" :page-size="pageSize" :total="visibleStandards.length" layout="prev, pager, next" :disabled="locked" small /></div>
   <p v-if="catalog&&!visibleStandards.length">没有匹配的标准功能。</p></section><aside v-if="toolbar"><h4>已选功能</h4><el-empty v-if="!chosenStandards.length" description="请从左侧选择标准功能" :image-size="160"/><div v-else class="standard-chosen-list"><div v-for="entry in chosenStandards" :key="entry.id" class="standard-chosen-entry" :title="standardName(entry)+'（'+standardKey(entry)+'）'"><FunctionMdiIcon :icon-id="standardStyle(entry)?.iconId" :color="standardStyle(entry)?.color"/><span>{{standardName(entry)}}<span class="standard-kind">{{entry.kind==='EVENT'?'事件':entry.kind==='COMMAND'?'命令':'属性'}}</span></span><el-button :icon="Close" text :aria-label="`取消选择${standardKey(entry)}`" :disabled="disabled||locked" @click="selectStandards(selected.filter(id=>id!==entry.id))"/></div></div></aside></div><p v-if="!toolbar&&chosenStandards.some(entry=>entry.event)">事件参数按平台非必填处理，仍拒绝额外参数。</p><p v-if="!toolbar&&chosenStandards.some(entry=>entry.command)">命令参数不新增必填或额外字段关闭规则；源未声明超时，采用平台默认30秒。</p><p v-if="!toolbar">已选 {{selected.length}} 项；选择不会保存定义。</p>
   <el-button v-if="writable&&!toolbar" type="primary" :disabled="disabled||locked||!selected.length" @click="readStandardAuthority">预览标准功能导入</el-button><el-button v-if="!toolbar" :disabled="busy" @click="close">{{unknown?'关闭预览（保留原请求）':'取消标准选择'}}</el-button>
  </template>
  <template v-else>
  <el-button v-if="toolbar" text @click="mode='standard'">返回标准功能</el-button>
  <p>转换预览不会写入或发布物模型；只有权威预览通过并明确确认，才一次追加所选功能；已发布目标会生成后继模型，现有设备绑定保持。属性支持已确认的Number/Text/Switch/Enum及四种流向；V6另承接一层具名Number子字段的Object与无items的混合List。Object封闭和List容量等约束属于平台适配，不是源站声明。事件参数另支持原站未指定子字段结构的Object，转换时会明确显示平台适配边界；命令参数仍仅适配已确认的string/boolean/number。缺少约束的List/Enum和其它未知字段逐路径报错，整份不导入。</p>
  <p>源名称、说明和图标只作来源资料展示，不覆盖当前类型。属性顺序按 attributes 数组生成排序号；未提供的单位、量程、步进和默认声明不会补造。本地预览最多1MiB；提交导入材料最多256KiB。</p>
  <el-input v-model="text" type="textarea" :rows="10" aria-label="ThingsCloud TSL原文" :disabled="disabled||locked"/>
  <div class="tsl-actions"><el-button type="primary" :disabled="disabled||locked||!text" @click="preview">转换预览</el-button><el-button :disabled="busy" @click="close">{{unknown?'关闭预览（保留原请求）':'关闭并清除'}}</el-button></div>
  <template v-if="result">
   <dl v-if="result.source"><dt>来源类型</dt><dd>{{result.source.name}}</dd><dt>来源说明</dt><dd>{{result.source.description||'—'}}</dd><dt>来源图标标识</dt><dd>{{result.source.icon||'—'}}</dd></dl>
   <ul v-if="result.issues.length" class="tsl-issues" role="alert"><li v-for="(issue,index) in result.issues" :key="index"><code>{{issue.path}}</code>：{{issue.message}}</li></ul>
   <template v-else><p>已转换 {{localCount}} 项功能（{{result.properties.length}} 个属性、{{localEvents.length}} 个事件、{{localCommands.length}} 个命令）；仅预览，尚未导入。</p><el-table :data="[...result.properties]" empty-text="TSL中没有可转换的属性"><el-table-column prop="name" label="名称"/><el-table-column prop="propertyKey" label="标识"/><el-table-column label="流向"><template #default="{row}">{{accessLabels[row.accessType]}}</template></el-table-column><el-table-column label="类型"><template #default="{row}">{{typeLabels[row.dataType]}}</template></el-table-column><el-table-column label="扩展选项" min-width="220"><template #default="{row}">{{optionsSummary(row)}}</template></el-table-column><el-table-column prop="description" label="说明"/></el-table><p v-for="event in localEvents" :key="event.eventKey">事件：{{event.name}}（{{event.eventKey}}） · {{event.parameters?.map(row=>row.name+'（'+row.parameterKey+'）').join('、')}}</p><p v-for="command in localCommands" :key="command.commandKey">命令：{{command.name}}（{{command.commandKey}}）</p><ul v-if="localDecisions.length"><li v-for="decision in localDecisions" :key="decision.scope+decision.code">{{decision.message}}</li></ul><pre aria-label="ThingsLink属性转换预览">{{converted}}</pre>
    <p v-if="!withinBudget" role="alert">此材料只可本地预览：超过256KiB，不能提交导入。</p>
    <el-button v-if="writable" :loading="busy&&!unknown" :disabled="disabled||locked||!withinBudget||!localCount" @click="readAuthority">读取权威导入预览</el-button>
   </template>
  </template>
  </template>
  <section v-if="authority&&(!toolbar||mode==='tsl')" class="authority-preview"><h3>权威导入预览</h3><p>目标已核对；将一次性追加 {{materialDefinitionCount(authority)}} 项功能，不覆盖现有标识。已发布目标会生成一个后继模型，现有设备绑定保持。</p><ul v-if="authority.adaptationDecisions?.length"><li v-for="decision in authority.adaptationDecisions" :key="decision.scope+decision.code">{{decision.message}}</li></ul><p v-for="event in authority.events||[]" :key="event.eventKey">事件：{{event.name}}（{{event.eventKey}}）</p><p v-for="command in authority.commands||[]" :key="command.commandKey">命令：{{command.name}}（{{command.commandKey}}）</p><ul v-if="authority.issues.length" class="tsl-issues" role="alert"><li v-for="(issue,index) in authority.issues" :key="index"><code>{{issue.path}}</code>：{{issue.message}}</li></ul><el-table v-else :data="[...authority.properties]"><el-table-column prop="sourcePointer" label="来源路径"/><el-table-column prop="propertyKey" label="标识"/><el-table-column prop="name" label="名称"/><el-table-column prop="description" label="说明"/><el-table-column label="流向"><template #default="{row}">{{accessLabels[row.accessType]}}</template></el-table-column><el-table-column label="类型"><template #default="{row}">{{typeLabels[row.dataType]}}</template></el-table-column><el-table-column label="扩展选项" min-width="240"><template #default="{row}">{{optionsSummary(row)}}</template></el-table-column></el-table><details v-for="property in authority.properties.filter(row=>row.schema)" :key="property.propertyKey"><summary>{{property.name}} · 复合属性平台Schema</summary><pre :aria-label="'复合属性Schema '+property.propertyKey">{{property.schema}}</pre></details><el-button type="primary" :loading="busy&&unknown" :disabled="!writable||disabled||locked||!!authority.issues.length||!materialDefinitionCount(authority)" @click="confirm">确认原子导入</el-button></section>
  <template v-if="toolbar" #footer><el-button :disabled="busy" @click="close">{{unknown?'关闭':'取消'}}</el-button><el-button v-if="!unknown&&mode!=='tsl'" type="primary" :loading="busy" :disabled="!writable||disabled||locked||!selected.length" @click="addStandard">确定</el-button></template>
 </component>
</section></template>
<style scoped>.tsl-toolbar{padding:0!important}.standard-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30px;height:350px}.standard-columns aside{border:1px solid #eee;min-width:0;overflow:auto}.standard-columns aside h4{height:40px;line-height:40px;margin:0;padding:0 20px;background:#eee;font-size:14px;font-weight:600}.standard-columns .el-select{width:100%;margin-bottom:0}@media(max-width:640px){.standard-columns{grid-template-columns:1fr}.standard-columns aside{border-left:0;padding-left:0}}.standard-entry{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--tl-border)}.standard-entry p{width:100%;margin:0;color:var(--tl-muted)}.tsl-preview{padding:12px 0}.tsl-panel{margin:12px 0;padding:14px;border:1px solid var(--tl-border);font-size:13px;line-height:22px}.tsl-actions{display:flex;gap:8px;margin:12px 0}.tsl-issues{padding-left:20px;color:var(--tl-danger)}.tsl-panel pre{white-space:pre-wrap;overflow-wrap:anywhere}.tsl-panel dd{margin:0 0 8px;overflow-wrap:anywhere}.authority-preview{margin-top:18px}</style>

<style scoped>
.standard-filters{display:flex;gap:15px;margin-bottom:14px;padding-top:4px}.standard-filters>.el-input,.standard-filters>.el-select{min-width:0;flex:1}
.standard-columns :deep(.el-checkbox-group){max-height:300px;overflow:auto}
.standard-columns .standard-entry{padding:0;margin-bottom:10px;border:1px solid #eee;min-height:68px;display:block;position:relative;box-sizing:border-box}
.standard-columns .standard-entry--selected{border-color:var(--tl-primary);background:#ecf5ff}
.standard-columns .standard-entry :deep(.el-checkbox){display:flex;min-height:66px;height:auto;width:100%;margin:0;position:relative;align-items:center}
.standard-columns .standard-entry :deep(.el-checkbox__input){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.standard-columns .standard-entry :deep(.el-checkbox__label){padding:8px 38px 8px 10px;white-space:normal;font-size:14px;width:100%;box-sizing:border-box;color:#163333;font-weight:400}
.standard-entry-title{display:block;line-height:22px}.standard-entry-meta{display:block;color:#909399;font-size:12px;line-height:20px;min-height:20px;margin-top:4px}
.standard-kind{font-size:12px;line-height:15px;display:inline-block;padding:0 4px;color:#fff;background:#1699ef;border-radius:3px;margin-left:8px;vertical-align:1px}
.standard-entry-arrow{position:absolute;right:18px;top:50%;transform:translateY(-50%);color:#909399;font-size:20px}
.standard-columns .standard-entry :deep(.el-checkbox:has(:focus-visible)){outline:2px solid var(--tl-primary);outline-offset:-2px}
.standard-columns aside :deep(.el-empty){padding:40px 0 20px}.standard-columns aside :deep(.el-empty__description p){font-size:14px;color:#909399}
.standard-chosen-list{max-height:308px;overflow:auto}.standard-chosen-entry{display:flex;align-items:center;gap:6px;padding:10px;border-bottom:1px solid #eee;font-size:14px}.standard-chosen-entry>span{flex:1;min-width:0}.standard-chosen-entry .el-button{padding:0;flex-shrink:0}
@media(max-width:640px){.standard-columns{grid-template-columns:1fr;height:auto}.standard-columns aside{min-height:180px}.standard-columns aside :deep(.el-empty){padding:10px}.standard-filters{flex-wrap:wrap}}
</style>
