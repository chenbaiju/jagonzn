<script setup lang="ts">
import {showOperationFeedback} from '@/ui/operation-feedback'
import {computed,onScopeDispose,ref,watch} from 'vue'
import {Plus, QuestionFilled} from '@element-plus/icons-vue'
import {ElMessage} from 'element-plus'
import {ApiError,IdentityChanged,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {formatTime} from '@/core/time'
import {typeDeviceUuid} from './type-devices-api'
import DefinitionExternalIcon from './DefinitionExternalIcon.vue'
import DefinitionLevelIcon from './DefinitionLevelIcon.vue'
import {dataStreamTransport,dataStreamTemplate,dataStreamReceiptMatches,normalizeDataStreamDefinition,validateDataStreamPublicationInput,dataStreamPublishTopic,dataStreamSubscribeTopic,prepareDataStreamPublication,type DataStreamDescriptions,type DataStreamItem,type DataStreamIntent,type DataStreamPublication,type DataStreamTransport} from './data-stream-publication-api'
const props=withDefaults(defineProps<{typeId:string;typeStatus:string;disabled?:boolean;transport?:DataStreamTransport}>(),{disabled:false,transport:()=>dataStreamTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>()
const roles=['OWNER','ADMIN','OPERATOR','VIEWER'],member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&can('device:read')&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const denied=ref(false),readable=computed(()=>member.value&&!denied.value),writable=computed(()=>readable.value&&can('device:update')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')&&currentProject.value?.status==='ACTIVE')
const current=ref<DataStreamPublication>(),intent=ref<DataStreamIntent>(),observed=ref<DataStreamPublication>(),open=ref(false),busy=ref(false),loading=ref(false),review=ref<'unknown'|'rejected'>(),ended=ref(false),error=ref(''),notice=ref(''),check=ref('')
const description=ref('')
const guideUrl='https://www.thingscloud.xyz/docs/guide/device-type/custom-data.html'
const formatLabels={HEX:'HEX 16进制消息',TEXT:'Plaintext 文本消息',JSON:'JSON 格式消息'} as const
const topicHelp={
 literal:'固定 Topic 以 data/ 开头，后接 1～64 位字母、数字、下划线或横线，不支持变量、通配符或多层路径。两个方向不能相同，订阅不会自动添加 /set。修改在设备重新连接后生效。',
 template:'参数须占完整一层，例如 data/application/{app_id}/device/{dev_id}。两个方向的参数名须一致，不能重复。不同流的同方向路径不能重叠。路径最多 8 层、256 字节。参数名以字母或下划线开头，只含字母、数字和下划线，最多 64 位。修改在设备重新连接后生效。',
}
const mode=ref<'create'|'edit'|'tcp'|'status'>('create'),editingIndex=ref(-1)
type StreamDraft={identifier:string;name:string;format:string;disabled?:true;mqttTopics?:NonNullable<DataStreamItem['mqttTopics']>}
const rows=ref<StreamDraft[]>([]),tcp=ref<string|null>(null)
const tcpChoice=computed({get:()=>tcp.value??'',set:(value:string)=>{tcp.value=value||null}})
const locked=computed(()=>busy.value||!!review.value)
const draft=computed(()=>rows.value[editingIndex.value])
const formDisabled=computed(()=>!!review.value||!writable.value||props.disabled)
const formComplete=computed(()=>{
 if(mode.value==='tcp')return true
 const row=draft.value
 return !!row&&!!row.name.trim()&&!!row.identifier&&!!row.format&&(!row.mqttTopics||!!topicSuffix(row.mqttTopics.publishTopic)&&!!topicSuffix(row.mqttTopics.subscribeTopic))
})
const validationError=computed(()=>{
 if(!formComplete.value)return ''
 try{
  validateDataStreamPublicationInput(normalizeDataStreamDefinition({streams:rows.value,tcpStreamIdentifier:tcp.value}))
  return ''
 }catch(cause){return message(cause)}
})
const valid=computed(()=>formComplete.value&&!validationError.value)
const streamDetails=computed(()=>new Map(current.value?.publication?.managementDetails.map(item=>[item.identifier,item])))
let alive=true,generation=0,controller:AbortController|undefined
function scope(){return{generation,project:projectId.value,type:props.typeId,account:session.user?.accountId}}
function same(value:ReturnType<typeof scope>){return alive&&generation===value.generation&&value.project===projectId.value&&value.type===props.typeId&&value.account===session.user?.accountId&&readable.value}
function clearEditor(){generation++;controller?.abort();controller=undefined;open.value=false;busy.value=false;loading.value=false;review.value=undefined;intent.value=undefined;observed.value=undefined;rows.value=[];tcp.value=null;description.value='';error.value='';check.value=''}
function reset(){clearEditor();denied.value=false;current.value=undefined;notice.value='';ended.value=false;if(member.value)void load()}
function deny(){clearEditor();denied.value=true;current.value=undefined;notice.value=''}
function message(cause:unknown){return cause instanceof Error?cause.message:'数据流操作失败，请重新读取核对'}
async function load(){if(!readable.value||props.disabled||locked.value||loading.value)return;generation++;controller?.abort();controller=new AbortController();const state=scope();loading.value=true;error.value='';try{const value=await props.transport.read(state.project,state.type,controller.signal);if(same(state))current.value=value}catch(cause){if(same(state)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();else error.value=message(cause)}}finally{if(same(state))loading.value=false}}
function edit(nextMode:'create'|'edit'|'tcp'='create',index=-1){if(!writable.value||props.disabled||locked.value||loading.value||ended.value||!current.value)return;rows.value=(current.value.publication?.definition.streams||[]).map(item=>({...item}));tcp.value=current.value.publication?.definition.tcpStreamIdentifier??null;error.value='';notice.value='';mode.value=nextMode;editingIndex.value=index;description.value=streamDetails.value.get(rows.value[index]?.identifier??'')?.description??'';if(nextMode==='create'){rows.value.push({identifier:'',name:'',format:''});editingIndex.value=rows.value.length-1}open.value=true}
function setAdvanced(value:unknown){if(!writable.value||props.disabled||busy.value||review.value)return;const row=rows.value[editingIndex.value];if(!row)return;if(value===true)row.mqttTopics={profile:'TL_LITERAL_TOPIC_PAIR_V1',publishTopic:'data/',subscribeTopic:'data/'};else delete row.mqttTopics}
function setTopicMode(value:unknown){if(!writable.value||props.disabled||busy.value||review.value||!['literal','template'].includes(String(value)))return;const row=rows.value[editingIndex.value];if(row?.mqttTopics)row.mqttTopics={...row.mqttTopics,profile:value==='template'?'TL_TEMPLATE_TOPIC_PAIR_V1':'TL_LITERAL_TOPIC_PAIR_V1'}}
function topicSuffix(value:string){return value.startsWith('data/')?value.slice(5):value}
function setLiteralTopic(direction:'publishTopic'|'subscribeTopic',value:string){if(!writable.value||props.disabled||busy.value||review.value)return;const row=rows.value[editingIndex.value];if(row?.mqttTopics)row.mqttTopics={...row.mqttTopics,[direction]:`data/${topicSuffix(value)}`}}
function cancel(){if(busy.value)return;if(review.value)open.value=false;else clearEditor()}
function beforeClose(done:()=>void){if(!busy.value){cancel();done()}}
function publish(){
 if(!valid.value)return
 const descriptions=mode.value==='tcp'||!draft.value?undefined:{[draft.value.identifier]:description.value||null}
 void submit({streams:rows.value,tcpStreamIdentifier:tcp.value},descriptions)
}
function toggleStatus(row:DataStreamItem){
 const definition=current.value?.publication?.definition
 if(!definition||!writable.value||props.disabled||locked.value||loading.value||ended.value)return
 if(!row.disabled&&definition.tcpStreamIdentifier===row.identifier){
  ElMessage.warning('请先解除该数据流的 TCP 绑定，再停用')
  return
 }
 const next=definition.streams.map(item=>{
  if(item.identifier!==row.identifier)return item
  const changed={...item}
  if(changed.disabled)delete changed.disabled
  else changed.disabled=true
  return changed
 })
 mode.value='status'
 void submit({...definition,streams:next},undefined,row.disabled?'已启用':'已停用')
}
async function submit(definition:unknown,descriptions?:DataStreamDescriptions,statusMessage?:string){
 if(!writable.value||props.disabled||busy.value||review.value||!current.value||ended.value)return
 let original:DataStreamIntent
 try{original=prepareDataStreamPublication(projectId.value,props.typeId,current.value,definition,descriptions)}
 catch(cause){if(statusMessage)ElMessage.error(message(cause));else error.value=message(cause);return}
 intent.value=original
 review.value='unknown'
 busy.value=true
 error.value=''
 notice.value=''
 const state=scope()
 controller=new AbortController()
 try{
  const actual=await props.transport.publish(original,controller.signal)
  if(!same(state))return
  if(!dataStreamReceiptMatches(actual,original))throw new Error('回执与本次定义或代次不同，请只读核对')
  clearEditor()
  current.value=actual
  if(statusMessage)showOperationFeedback(`${statusMessage}，设备重新连接后生效`)
  else notice.value='数据流配置已保存。'
  emit('changed')
 }catch(cause){
  if(same(state)&&!(cause instanceof IdentityChanged)){
   if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}
   error.value=message(cause)
   if(cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&cause.status>=400&&cause.status<500)review.value='rejected'
   if(statusMessage)open.value=true
  }
 }finally{if(same(state))busy.value=false}
}
async function readCurrent(){const original=intent.value;if(!original||!review.value||!readable.value||busy.value)return;const state=scope();controller?.abort();controller=new AbortController();busy.value=true;error.value='';check.value='';try{const actual=await props.transport.read(original.project,original.typeId,controller.signal);if(!same(state))return;observed.value=actual;check.value=`本次读取代次 ${actual.revision}；${actual.publication&&JSON.stringify(actual.publication.definition)===JSON.stringify(original.body.definition)&&Object.entries(original.body.descriptions??{}).every(([id,value])=>actual.publication!.managementDetails.some(row=>row.identifier===id&&row.description===value))?'当前定义与原正文相同':'当前状态与原正文不同'}，均不能证明原请求成功。`}catch(cause){if(same(state)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();else if(cause instanceof ApiError&&cause.status===404)check.value='本次读取未见资源或其不可见；原请求结果仍未确认。';else error.value=message(cause)}}finally{if(same(state))busy.value=false}}
function finish(){if(!review.value||busy.value)return;const unknown=review.value==='unknown',actual=observed.value;clearEditor();if(actual)current.value=actual;ended.value=unknown;notice.value=unknown?'已结束本次核对，原请求仍未确认成功；本页不再发布，请保留原请求信息。':'本次发布被拒绝，未自动重发。请重新读取当前定义后再编辑。'}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,()=>member.value,()=>props.transport],reset,{immediate:true,flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clearEditor();dispose();emit('locked',false)})
</script>
<template>
 <section class="type-data-streams" aria-labelledby="type-data-streams-heading">
  <h2 id="type-data-streams-heading">设置自定义数据流</h2>
  <p class="stream-intro">
   自定义数据流是对平台标准通信协议的补充和扩展，用来支持更多类型的设备接入。自定义数据流支持设备通过 TCP 协议（包括 TCP 透传方式）接入平台，同时支持丰富的协议解析规则。
   <a :href="guideUrl" target="_blank" rel="noopener noreferrer">了解详情 <DefinitionExternalIcon/></a>
  </p>
  <div v-if="writable" class="stream-actions">
   <el-button size="small" type="primary" :icon="Plus" :disabled="disabled||locked||loading||!current||ended||(current.publication?.definition.streams.length??0)>=64" @click="edit('create')">创建自定义数据流</el-button>
   <el-button size="small" :disabled="disabled||locked||loading||!current||ended" @click="edit('tcp')">绑定 TCP 数据流</el-button>
  </div>
  <p v-if="!readable" role="status">当前账号没有读取权限。</p>
  <el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
  <el-alert v-if="error&&!open" :title="error" type="error" :closable="false"><el-button @click="load">重新加载</el-button></el-alert>
  <el-alert v-if="review&&!open" title="存在未结束的数据流保存核对" type="warning" :closable="false"><el-button @click="open=true">查看原保存核对</el-button></el-alert>
  <el-table v-if="readable" v-loading="loading" class="stream-table" :data="current?.publication?.definition.streams??[]" empty-text="暂无数据">
   <el-table-column prop="name" label="名称" min-width="126" show-overflow-tooltip/>
   <el-table-column prop="identifier" label="标识符" min-width="126" show-overflow-tooltip/>
   <el-table-column label="消息格式" min-width="126" show-overflow-tooltip>
    <template #default="{row}">{{formatLabels[row.format as keyof typeof formatLabels]}}</template>
   </el-table-column>
   <el-table-column label="发布 Topic" min-width="126" show-overflow-tooltip>
    <template #default="{row}">{{dataStreamPublishTopic(row)}}</template>
   </el-table-column>
   <el-table-column label="订阅 Topic" min-width="126" show-overflow-tooltip>
    <template #default="{row}">{{dataStreamSubscribeTopic(row)}}</template>
   </el-table-column>
   <el-table-column label="绑定 TCP" min-width="126">
    <template #default="{row}">{{current?.publication?.definition.tcpStreamIdentifier===row.identifier?'已配置':''}}</template>
   </el-table-column>
   <el-table-column label="创建时间" width="180">
    <template #default="{row}"><span :title="streamDetails.get(row.identifier)?.createdAt?'':'历史记录未保存单条创建时间'">{{streamDetails.get(row.identifier)?.createdAt?formatTime(streamDetails.get(row.identifier)!.createdAt!):'-'}}</span></template>
   </el-table-column>
   <el-table-column label="状态" width="100">
    <template #default="{row}"><span :class="row.disabled?'stream-disabled':'stream-configured'" title="设备重新连接后使用当前配置">{{row.disabled?'未启用':'已启用'}}</span></template>
   </el-table-column>
   <el-table-column v-if="writable" width="160">
    <template #default="{row,$index}">
     <div class="stream-row-actions">
      <el-button size="small" :disabled="disabled||locked||loading||ended" @click="edit('edit',$index)">编辑</el-button>
      <el-button size="small" :type="row.disabled?'primary':'danger'" :plain="!!row.disabled" :disabled="disabled||locked||loading||ended" @click="toggleStatus(row)">{{row.disabled?'启用':'停用'}}</el-button>
     </div>
    </template>
   </el-table-column>
  </el-table>
  <el-dialog
   :model-value="open&&readable"
   :title="mode==='status'?'更新数据流状态':mode==='tcp'?'设置 TCP 数据流':mode==='create'?'添加自定义数据流':'编辑自定义数据流'"
   class="type-stream-dialog"
   :class="{'type-stream-dialog--tcp':mode==='tcp'}"
   width="min(500px,94vw)"
   :close-on-click-modal="false"
   :close-on-press-escape="!busy"
   :show-close="!busy"
   :before-close="beforeClose"
  >
   <div v-if="mode==='create'||mode==='edit'" class="stream-guide tl-learning-resource">
    <DefinitionLevelIcon level="INFO"/>
    <a :href="guideUrl" target="_blank" rel="noopener noreferrer">如何使用自定义数据流？ <DefinitionExternalIcon/></a>
   </div>
   <el-alert v-if="error" :title="error" type="error" :closable="false"/>
   <el-form v-if="mode!=='status'" label-position="top" :disabled="formDisabled" @submit.prevent="publish">
    <template v-if="mode!=='tcp'&&draft">
     <el-form-item label="数据流名称"><el-input v-model="draft.name" aria-label="数据流名称" maxlength="128"/></el-form-item>
     <el-form-item>
      <template #label>
       <span class="stream-form-label">数据流标识符
        <el-tooltip content="用于区分数据流，也用于生成默认 Topic。创建后无法修改。" :trigger="['hover','focus']">
         <el-icon tabindex="0" aria-label="数据流标识符说明"><QuestionFilled/></el-icon>
        </el-tooltip>
       </span>
      </template>
      <el-input v-model="draft.identifier" aria-label="数据流标识符" maxlength="64" :readonly="mode==='edit'"/>
     </el-form-item>
     <el-form-item class="stream-advanced">
      <template #label>
       <span class="stream-form-label"><span><strong>MQTT Topic</strong> 高级模式</span>
        <el-tooltip content="开启后可单独设置设备发布和订阅的 Topic。" :trigger="['hover','focus']">
         <el-icon tabindex="0" aria-label="MQTT Topic 高级模式说明"><QuestionFilled/></el-icon>
        </el-tooltip>
       </span>
      </template>
      <el-switch :model-value="!!draft.mqttTopics" aria-label="MQTT Topic 高级模式" @update:model-value="setAdvanced"/>
      <el-radio-group v-if="draft.mqttTopics" class="stream-topic-modes" :model-value="dataStreamTemplate(draft)?'template':'literal'" aria-label="Topic类型" @update:model-value="setTopicMode">
       <el-radio value="literal">固定 Topic</el-radio><el-radio value="template">带参数 Topic</el-radio>
      </el-radio-group>
     </el-form-item>
     <template v-if="draft.mqttTopics">
      <el-form-item v-for="field in [{key:'publishTopic',label:'发布 Topic'},{key:'subscribeTopic',label:'订阅 Topic'}] as const" :key="field.key" :error="!review&&!topicSuffix(draft.mqttTopics[field.key])?'请填写':''">
       <template #label>
        <span class="stream-form-label"><strong>{{field.label}}</strong>
         <el-tooltip :content="dataStreamTemplate(draft)?topicHelp.template:topicHelp.literal" :trigger="['hover','focus']">
          <el-icon tabindex="0" :aria-label="field.label+'说明'"><QuestionFilled/></el-icon>
         </el-tooltip>
        </span>
       </template>
       <el-input :model-value="topicSuffix(draft.mqttTopics[field.key])" :aria-label="'数据流'+field.label" :maxlength="dataStreamTemplate(draft)?256:69" @update:model-value="setLiteralTopic(field.key,String($event))">
        <template #prepend>data/</template>
       </el-input>
      </el-form-item>
     </template>
     <el-form-item label="消息格式">
      <el-select v-model="draft.format" aria-label="数据流格式" placeholder="选择消息格式">
       <el-option v-for="(label,format) in formatLabels" :key="format" :value="format" :label="label"/>
      </el-select>
     </el-form-item>
     <el-form-item label="数据流描述">
      <el-input v-model="description" aria-label="数据流描述" type="textarea" :rows="2" maxlength="500"/>
     </el-form-item>
    </template>
    <el-form-item v-else-if="mode==='tcp'" label="绑定到自定义数据流">
     <el-select v-model="tcpChoice" aria-label="TCP目标配置" placeholder="选择自定义数据流">
      <el-option value="" label="不绑定"/>
      <el-option v-for="row in rows.filter(row=>!row.disabled&&!dataStreamTemplate(row))" :key="row.identifier" :value="row.identifier" :label="row.name"/>
     </el-select>
    </el-form-item>
   </el-form>
   <p v-if="validationError&&!review" class="stream-validation" role="status">{{validationError}}</p>
   <template v-if="review">
    <el-alert :title="review==='unknown'?'原发布结果未知，不会自动重发；读取当前同值也不能确认原请求成功。':'本次发布被拒绝，原正文和请求键已保留；不会自动重发。'" type="warning" :closable="false"/>
    <p class="tl-muted stream-request-key">原请求键：{{intent?.key}}</p>
    <p v-if="check">{{check}}</p>
    <el-button :loading="busy" @click="readCurrent">只读核对当前定义</el-button>
    <el-button :disabled="busy" @click="finish">结束本次核对</el-button>
   </template>
   <template #footer>
    <el-button :disabled="busy" @click="cancel">{{review?'关闭':'取消'}}</el-button>
    <el-button v-if="!review&&writable" type="primary" :disabled="disabled||!valid||busy||ended" :loading="busy" @click="publish">保存</el-button>
   </template>
  </el-dialog>
 </section>
</template>

<style scoped>
.type-data-streams{margin-top:26px}
.type-data-streams h2{margin:0;color:#002822;font-size:22px;line-height:32px;font-weight:400}
.stream-intro{margin:8px 0 0;color:#888;font-size:15px;line-height:22px}
.stream-intro a{display:inline-flex;align-items:center;gap:3px;color:#1e88e5;font-weight:600;white-space:nowrap}
.stream-actions{display:flex;flex-wrap:wrap;gap:10px;margin:30px 0 0}
.stream-actions .el-button+.el-button{margin-left:0}
.stream-table{margin-top:22px;--el-table-border-color:#eee}
.stream-table :deep(th.el-table__cell){color:var(--tl-title);font-weight:700}
.stream-table :deep(.el-table__cell){height:46px;padding:0}
.stream-table :deep(td.el-table__cell){height:53px}
.stream-table :deep(.cell){padding-inline:10px;line-height:23px}
.stream-configured{color:var(--el-color-success-dark-2)}
.stream-disabled{color:var(--tl-muted)}
.stream-row-actions{display:flex;gap:10px}
.stream-row-actions .el-button{height:28px;margin:0;padding:7px 15px}
.type-data-streams :deep(.el-alert){margin:12px 0}
</style>

<style>
.type-stream-dialog .el-dialog__body{max-height:calc(85vh - 130px);overflow:auto;padding:31px 20px 24px}
.type-stream-dialog--tcp .el-dialog__body{padding-top:46px}
.type-stream-dialog .stream-guide{margin:0 0 26px;align-items:center}
.type-stream-dialog .stream-guide .definition-level{flex:none;margin-right:5px}
.type-stream-dialog .stream-guide a{display:inline-flex;align-items:center;gap:3px}
.type-stream-dialog .el-form-item{margin-bottom:28px}
.type-stream-dialog .el-form-item__label{line-height:20px;margin-bottom:6px;font-weight:500}
.type-stream-dialog .el-select{width:100%}
.type-stream-dialog .el-input-group__prepend{padding-inline:20px}
.type-stream-dialog .el-textarea__inner{min-height:54px!important;padding:5px 15px;line-height:22px}
.type-stream-dialog .stream-form-label{display:inline-flex;align-items:center;gap:10px}
.type-stream-dialog .stream-form-label .el-icon{color:#c0c4cc;font-size:12px;outline-offset:3px}
.type-stream-dialog .stream-advanced .el-form-item__content{min-height:24px;gap:0 16px}
.type-stream-dialog .stream-advanced .el-switch,.type-stream-dialog .stream-topic-modes .el-radio{height:24px}
.type-stream-dialog .stream-topic-modes{gap:0 16px}
.type-stream-dialog .stream-topic-modes .el-radio{margin:0}
.type-stream-dialog .stream-validation{margin:0;color:var(--el-color-danger);line-height:20px}
.type-stream-dialog .stream-request-key{margin:8px 0;overflow-wrap:anywhere}
.type-stream-dialog .el-dialog__footer{display:flex;justify-content:flex-end;gap:10px}
.type-stream-dialog .el-dialog__footer .el-button{margin-left:0}
</style>
