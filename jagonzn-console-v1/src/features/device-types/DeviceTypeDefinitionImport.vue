<script setup lang="ts">
import {MoreFilled} from '@element-plus/icons-vue'
import './function-definition.css'
import {Upload} from '@element-plus/icons-vue'
import {computed,onScopeDispose,reactive,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {definitionImportTransport,importableTypeStatus,importSections,prepareDefinitionImport,prepareDefinitionImportConfirmation,sameImportReceipt,type DefinitionImportTransport,type ImportCandidate,type ImportIntent,type ImportPreview,type ImportSource,type ImportReceipt} from './definition-import-api'
import DeviceTypeProductDefinitionImport from './DeviceTypeProductDefinitionImport.vue'
import type {ProductDefinitionImportTransport,ProductDefinitionReceipt} from './product-definition-import-api'
import type {DeviceTypeDirectoryPage} from './api'
import {typeDeviceUuid} from './type-devices-api'
const props=withDefaults(defineProps<{typeId:string;typeStatus:string;disabled?:boolean;toolbar?:boolean;transport?:DefinitionImportTransport;productTransport?:ProductDefinitionImportTransport}>(),{disabled:false,toolbar:false,transport:()=>definitionImportTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const denied=ref(false),member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const readable=computed(()=>member.value&&!denied.value),writable=computed(()=>readable.value&&importableTypeStatus(props.typeStatus)&&currentProject.value?.status==='ACTIVE'&&can('device:update')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const shown=ref(false),busy=ref(false),pipeline=ref(false),unknown=ref(false),error=ref(''),notice=ref(''),page=ref(1),directory=shallowRef<DeviceTypeDirectoryPage>(),source=shallowRef<ImportSource>(),candidate=shallowRef<ImportCandidate>(),preview=shallowRef<ImportPreview>(),intent=shallowRef<ImportIntent>(),receipt=shallowRef<ImportReceipt>()
const importTab=ref('type'),sourceId=ref(''),productImport=ref<InstanceType<typeof DeviceTypeProductDefinitionImport>>()
const productState=reactive({busy:false,unknown:false,ready:false,locked:false})
const selected=reactive({properties:[] as string[],events:[] as string[],commands:[] as string[]})
const hasSelection=computed(()=>importSections.some(([section])=>selected[section].length>0))
const locked=computed(()=>busy.value||unknown.value||pipeline.value||productState.locked),hasNext=computed(()=>!!directory.value&&BigInt(page.value)*24n<BigInt(directory.value.total))
let generation=0,alive=true,controller:AbortController|undefined
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:props.typeId,account:session.user?.accountId}}
function current(state:ReturnType<typeof capture>){return alive&&state.generation===generation&&state.epoch===identityEpoch()&&state.project===projectId.value&&state.type===props.typeId&&state.account===session.user?.accountId&&readable.value}
function invalidate(){if(unknown.value||busy.value)return;candidate.value=undefined;preview.value=undefined;error.value=''}
function clear(){Object.assign(productState,{busy:false,unknown:false,ready:false,locked:false});importTab.value='type';sourceId.value='';generation++;controller?.abort();shown.value=false;busy.value=false;pipeline.value=false;unknown.value=false;directory.value=undefined;source.value=undefined;candidate.value=undefined;preview.value=undefined;intent.value=undefined;receipt.value=undefined;page.value=1;error.value='';selected.properties=[];selected.events=[];selected.commands=[]}
function scopeChanged(){clear();denied.value=false;notice.value=''}
function fail(cause:unknown,state:ReturnType<typeof capture>){if(!current(state)||cause instanceof IdentityChanged)return;if(cause instanceof ApiError&&[401,403].includes(cause.status)){clear();denied.value=true;notice.value=''}else error.value=errorMessage(cause)}
async function readDirectory(){
 if(!writable.value||props.disabled||busy.value||unknown.value)return
 const state=capture();busy.value=true;error.value='';controller?.abort();controller=new AbortController()
 try{const result=await props.transport.directory(state.project,{page:page.value,limit:24},controller.signal);if(current(state))directory.value=result}catch(cause){fail(cause,state)}finally{if(current(state))busy.value=false}
}
async function open(){if(!writable.value||props.disabled||locked.value)return;clear();notice.value='';shown.value=true;await readDirectory()}
function close(){if(busy.value||pipeline.value||productState.busy)return;if(unknown.value||productState.unknown)shown.value=false;else clear()}
function beforeClose(done:()=>void){if(!busy.value&&!pipeline.value&&!productState.busy){close();done()}}
async function move(direction:1|-1){if(busy.value||unknown.value||direction<0&&page.value<=1||direction>0&&!hasNext.value)return;page.value+=direction;directory.value=undefined;await readDirectory()}
async function readSource(id:string){
 if(!writable.value||props.disabled||locked.value||!directory.value?.items.some(row=>row.id===id&&importableTypeStatus(row.status))||id===props.typeId)return
 const state=capture();busy.value=true;error.value='';source.value=undefined;candidate.value=undefined;preview.value=undefined;selected.properties=[];selected.events=[];selected.commands=[];controller?.abort();controller=new AbortController()
 try{const result=await props.transport.source(state.project,state.type,id,controller.signal);if(current(state))source.value=result}catch(cause){fail(cause,state)}finally{if(current(state))busy.value=false}
}
async function readPreview(){
 if(!writable.value||props.disabled||(busy.value||unknown.value)||!source.value)return
 let prepared:ImportCandidate;try{prepared=prepareDefinitionImport(projectId.value,props.typeId,source.value,selected)}catch(cause){error.value=errorMessage(cause);return}
 const state=capture();busy.value=true;error.value='';preview.value=undefined;candidate.value=prepared;controller?.abort();controller=new AbortController()
 try{const result=await props.transport.preview(prepared,controller.signal);if(current(state)&&candidate.value===prepared)preview.value=result}catch(cause){fail(cause,state)}finally{if(current(state))busy.value=false}
}
function selectionKey(){return importSections.map(([section])=>[...selected[section]].sort().join(',')).join('|')}
async function importSelected(){
 if(!props.toolbar||importTab.value!=='type'||!writable.value||props.disabled||locked.value||!source.value||!hasSelection.value)return
 const state=capture(),origin=source.value,keys=selectionKey();pipeline.value=true
 try{await readPreview()
 if(!current(state)||!writable.value||props.disabled||source.value!==origin||selectionKey()!==keys||!candidate.value||!preview.value)return
 if(preview.value.issues.length){error.value='所选功能存在冲突或非法定义，本次没有导入。'+preview.value.issues.map(issue=>issue.code==='IDENTIFIER_CONFLICT'?'同类标识已存在':issue.code==='SOURCE_DEFINITION_NOT_FOUND'?'来源定义已不存在':'定义不兼容或已变化').join('；');return}
 await confirm()
 }finally{if(current(state))pipeline.value=false}
}
function runSelected(){if(importTab.value==='product')void productImport.value?.importSelected();else void importSelected()}
function completeProduct(value:ProductDefinitionReceipt){receipt.value=undefined;shown.value=false;notice.value=`已导入 ${value.items.length} 项功能。`;emit('changed')}
function complete(value:ImportReceipt){const targetPublished=intent.value?.candidate.source.target.status==='PUBLISHED';receipt.value=value;unknown.value=false;intent.value=undefined;busy.value=false;shown.value=false;candidate.value=undefined;preview.value=undefined;notice.value=props.toolbar?`已导入 ${value.items.length} 项功能。`:`已原子导入 ${value.items.length} 项功能；${targetPublished?'已保存已发布类型功能':'已保存类型草稿'}，现有设备绑定保持。`;emit('changed')}
async function confirm(){
 if(!writable.value||props.disabled||(busy.value||unknown.value)||!candidate.value||!preview.value)return
 let original:ImportIntent;try{original=prepareDefinitionImportConfirmation(candidate.value,preview.value)}catch(cause){error.value=errorMessage(cause);return}
 const state=capture();intent.value=original;unknown.value=true;busy.value=true;error.value='';controller?.abort();controller=new AbortController();let acknowledged=false
 try{const result=await props.transport.confirm(original,controller.signal);acknowledged=true;if(!current(state))return
  const actual=await props.transport.original(original,controller.signal);if(!current(state))return;if(!sameImportReceipt(result,actual))throw new Error('原导入回执两次读取不一致，请继续按原键核对');complete(actual)
 }catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&[401,403].includes(cause.status)){fail(cause,state);return}
  error.value=errorMessage(cause);if(!acknowledged&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&cause.status>=400&&cause.status<500){unknown.value=false;intent.value=undefined;preview.value=undefined}
 }}finally{if(current(state))busy.value=false}
}
async function readOriginal(){
 const original=intent.value;if(!original||!unknown.value||!readable.value||busy.value)return
 const state=capture();busy.value=true;error.value='';controller?.abort();controller=new AbortController()
 try{const actual=await props.transport.original(original,controller.signal);if(current(state))complete(actual)}catch(cause){if(current(state)&&cause instanceof ApiError&&cause.status===404)error.value='暂未读到本人原导入回执；这不能确认原请求未执行，请稍后继续核对。';else fail(cause,state)}finally{if(current(state))busy.value=false}
}
function finishCheck(){if(!unknown.value||busy.value)return;clear();notice.value='已结束本次核对；原操作仍未确认，未标记为导入成功。'}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,()=>member.value,()=>props.transport],scopeChanged,{immediate:true,flush:'sync'})
watch(importTab,()=>{if(!unknown.value&&!productState.unknown){source.value=undefined;candidate.value=undefined;preview.value=undefined;error.value='';selected.properties=[];selected.events=[];selected.commands=[]}})
watch(()=>props.typeStatus,()=>{if(!unknown.value&&!productState.unknown){clear();notice.value='设备类型状态已变化，请重新打开导入并预览。'}},{flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{clear();notice.value=''});onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><section class="type-definition-import" :class="{'import-toolbar':toolbar}"><el-button v-if="toolbar" type="primary" :icon="Upload" :disabled="!writable||disabled||locked" @click="open">导入功能</el-button><header v-else><h3>导入功能</h3><el-button v-if="writable" :disabled="disabled||locked" @click="open">从其它设备类型导入</el-button></header>
 <p v-if="!toolbar" class="import-help">读取同项目其它设备类型的完整当前功能，全部预览后一次确认。不会覆盖同名功能；已发布目标生成后继模型，现有设备绑定保持。</p>
 <el-alert v-if="notice" :title="notice" type="info" :closable="false"/><p v-if="receipt&&!toolbar" class="import-help">原导入确认时间：{{receipt.createdAt}}</p>
 <el-alert v-if="(unknown||productState.unknown)&&!shown" title="存在尚未确认的原导入操作。" type="warning" :closable="false"><el-button @click="shown=true">查看原导入核对</el-button></el-alert>
 <el-dialog :class="{'function-tool-dialog function-import-dialog':toolbar}" :top="toolbar?'50px':'15vh'" :model-value="shown&&readable" :title="toolbar?'导入功能':'从其它设备类型导入功能'" :width="toolbar?'min(1000px,96vw)':'min(880px,96vw)'" :close-on-click-modal="false" :show-close="!busy&&!productState.busy" :before-close="beforeClose">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="unknown"><el-alert title="原导入结果尚未确认，不会再次提交；只按本人原键读取原回执。" type="warning" :closable="false"/><p>来源：{{intent?.sourceId}} · 目标：{{intent?.target}}</p><el-button :loading="busy" @click="readOriginal">读取原导入结果</el-button><el-button :disabled="busy" @click="finishCheck">结束本次核对</el-button></template>
  <template v-else>
   <el-tabs v-if="toolbar" v-model="importTab"><el-tab-pane label="从其它设备类型导入" name="type" :disabled="busy||productState.busy||productState.unknown"/><el-tab-pane label="从产品库导入" name="product" :disabled="busy||productState.busy||productState.unknown"/></el-tabs>
   <DeviceTypeProductDefinitionImport v-if="toolbar&&importTab==='product'" ref="productImport" :type-id="typeId" :type-status="typeStatus" :active="shown&&importTab==='product'" :disabled="disabled||busy||pipeline" :transport="productTransport" @state="Object.assign(productState,$event)" @completed="completeProduct"/>
   <section v-else>
   <div v-if="toolbar" class="import-source-label"><label for="definition-import-source">选择设备类型</label><el-popover placement="bottom-end" trigger="click" :width="350"><template #reference><el-button :icon="MoreFilled" link aria-label="来源目录选项"/></template><p class="import-help">可选择同项目其它草稿或已发布类型。</p><div class="import-pager"><el-button size="small" :disabled="busy||disabled||!writable||page<=1" @click="move(-1)">上一页来源</el-button><el-button size="small" :disabled="busy||disabled||!writable||!hasNext" @click="move(1)">下一页来源</el-button><el-button size="small" :disabled="busy||disabled||!writable" @click="readDirectory">刷新来源目录</el-button></div></el-popover></div><el-select v-if="toolbar" id="definition-import-source" v-model="sourceId" placeholder="选择设备类型" aria-label="选择导入来源类型" :disabled="busy||disabled||!writable" @change="readSource"><el-option v-for="row in directory?.items||[]" :key="row.id" :value="row.id" :label="row.name" :disabled="!importableTypeStatus(row.status)||row.id===typeId"/></el-select>
   <p v-if="!toolbar">选择其它设备类型（当前第 {{page}} 页）：</p>
   <el-table v-if="!toolbar" :data="directory?.items||[]" empty-text="本页暂无设备类型"><el-table-column prop="name" label="设备类型"/><el-table-column label="状态" width="100"><template #default="{row}">{{row.status==='DRAFT'?'草稿':'已发布'}}</template></el-table-column><el-table-column width="130"><template #default="{row}"><el-button size="small" :disabled="busy||disabled||!writable||!importableTypeStatus(row.status)||row.id===typeId" @click="readSource(row.id)">{{row.id===typeId?'当前目标':'选择来源'}}</el-button></template></el-table-column></el-table>
   <div v-if="!toolbar"><div class="import-pager"><el-button size="small" :disabled="busy||disabled||!writable||page<=1" @click="move(-1)">上一页来源</el-button><el-button size="small" :disabled="busy||disabled||!writable||!hasNext" @click="move(1)">下一页来源</el-button><el-button size="small" :disabled="busy||disabled||!writable" @click="readDirectory">刷新来源目录</el-button></div></div>
   <el-empty v-if="toolbar&&!source" description="暂无可用的功能列表" :image-size="160"/><template v-if="source"><h4 v-if="!toolbar">当前来源：{{source.source.name}}</h4><p v-if="!toolbar" class="import-help">{{source.source.id}}；来源或目标在预览后改变时，旧预览将被拒绝。</p>
    <section v-for="[section,label] in importSections" :key="section" class="import-selection"><h4>{{label}}（{{source.definitions.choices[section].length}} 项）</h4><p v-if="!source.definitions.choices[section].length" class="import-help">来源尚无{{label}}。</p><el-checkbox-group v-model="selected[section]" :aria-label="`选择导入${label}`" :disabled="busy||disabled||!writable" @change="invalidate"><el-checkbox v-for="row in source.definitions.choices[section]" :key="row.id" :value="row.id">{{row.name}}（{{row.key}}）</el-checkbox></el-checkbox-group></section>
    <el-button v-if="!toolbar" :disabled="busy||disabled||!writable" :loading="busy" @click="readPreview">预览所选功能</el-button>
   </template>
   <section v-if="preview&&!toolbar" class="import-preview"><h4>导入预览</h4><p>属性 {{preview.selection.properties.length}} 项 · 事件 {{preview.selection.events.length}} 项 · 命令 {{preview.selection.commands.length}} 项</p><p class="import-help">预览摘要：{{preview.previewDigest}}</p><el-alert v-if="preview.issues.length" title="存在冲突或非法定义，本次不会导入任何项。" type="warning" :closable="false"/><ul v-if="preview.issues.length"><li v-for="issue in preview.issues" :key="issue.path+issue.code">{{issue.path}}：{{issue.code==='IDENTIFIER_CONFLICT'?'同类标识已存在':issue.code==='SOURCE_DEFINITION_NOT_FOUND'?'来源定义已不存在':'定义不兼容或已变化'}}</li></ul><details><summary>查看本次完整定义与精确数字</summary><pre aria-label="导入完整定义预览" tabindex="0">{{preview.definitions.text}}</pre></details><p class="import-help">确认会向当前{{source?.target.status==='PUBLISHED'?'已发布类型一次性新增所有选中功能并生成后继模型':'类型草稿一次性新增所有选中功能'}}；任一冲突全部回滚，不跳过、不覆盖，现有设备绑定保持。</p>
   </section>
   </section>
  </template>
  <template #footer><el-button :disabled="busy||productState.busy" @click="close">{{unknown||productState.unknown?'关闭核对':toolbar?'取消':'取消导入'}}</el-button><el-button v-if="toolbar&&!unknown&&!productState.unknown" type="primary" :disabled="busy||disabled||!writable||(importTab==='product'?!productState.ready:!source||!hasSelection)" :loading="busy||productState.busy" @click="runSelected">导入</el-button><el-button v-else-if="!unknown&&preview&&importTab==='type'" type="primary" :disabled="busy||disabled||!writable||!!preview.issues.length" :loading="busy" @click="confirm">确认全部导入</el-button></template>
 </el-dialog></section></template>
<style scoped>.import-toolbar{margin-top:0!important}.import-toolbar .el-select{width:100%}.product-import .el-form-item__content{gap:8px}.type-definition-import{margin-top:26px}.type-definition-import>header{display:flex;justify-content:space-between;align-items:center;gap:16px}.type-definition-import h3{font-size:18px;font-weight:500}.type-definition-import p,.import-preview li{font-size:13px;line-height:21px;overflow-wrap:anywhere}.import-help{color:var(--tl-muted)}.import-pager{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 20px}.import-pager :deep(.el-button+.el-button){margin-left:0}.import-selection{margin:16px 0}.import-selection :deep(.el-checkbox-group){display:flex;flex-wrap:wrap;gap:6px 18px}.import-selection :deep(.el-checkbox){margin-right:0;height:auto;min-height:28px}.import-preview{border-top:1px solid var(--tl-border);margin-top:20px;padding-top:8px}.import-preview pre{font-size:12px;line-height:19px;max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;background:var(--tl-bg)}.type-definition-import :deep(.el-alert){margin:12px 0}.type-definition-import h4{font-size:14px;font-weight:500;margin:14px 0 8px}</style>

<style scoped>
.import-source-label{display:flex;align-items:center;justify-content:space-between;line-height:20px;margin-bottom:8px;font-size:14px;font-weight:600;color:#606266}.import-source-label .el-button{height:20px;padding:0;font-size:14px}
</style>
