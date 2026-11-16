<script setup lang="ts">
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import { computed, reactive, ref, watch, onScopeDispose } from 'vue'
import { useRouter } from 'vue-router'
import { can, projectId } from '@/core/session'
import { ApiError, errorMessage, IdentityChanged, identityEpoch, assertIdentity, onIdentityChange } from '@/core/http'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import { devicesApi,type DeviceType } from './api'
import { createBody, emptyDeviceForm } from './form-model'
import {MAX_DEVICE_TAGS} from './tag-rules'
import {assertProfile,sameProfile} from './reference-profile'
import {readDeviceTagSet,decodeDeviceTagSet} from './device-tag-set-api'
import {readStaticGroup,decodeStaticGroup} from './static-group-membership-api'
import { useDeviceOptions } from './use-options'
import { QuestionFilled } from '@element-plus/icons-vue'
const props=defineProps<{fixedDeviceTypeId?:string;returnDeviceTypeId?:string}>()
const router = useRouter(), form = reactive(emptyDeviceForm()), busy = ref(false), error = ref(''), unknown = ref(false)
const { types, groups, allTypes, moreTypes } = useDeviceOptions()
const contextProject=ref(projectId.value),fixedType=ref<DeviceType>(),fixedLoading=ref(false),fixedError=ref('')
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const typeOptions=computed(()=>props.fixedDeviceTypeId?(fixedType.value?[fixedType.value]:[]):allTypes.value)
const returnTarget=computed(()=>props.returnDeviceTypeId&&uuid.test(props.returnDeviceTypeId)&&contextProject.value===projectId.value?`/device-types/${props.returnDeviceTypeId}`:'/devices')
// 当前合同只有平级静态组，不制造子节点或层级箭头；清空仍归一为原单组字段。
const groupOptions = computed(() => (groups.data.value || []).filter(group => group.type === 'STATIC').map(group => ({ value: group.id!, label: group.name })))
const selectedGroup = computed({ get: () => form.groupId, set: (value: unknown) => { form.groupId = typeof value === 'string' ? value : '' } })
let generation=0
let pendingRead:AbortController|undefined
let typeRead:AbortController|undefined
function resetScope(){generation++;pendingRead?.abort();pendingRead=undefined;typeRead?.abort();typeRead=undefined;busy.value=false;Object.assign(form,emptyDeviceForm());error.value='';unknown.value=false;fixedType.value=undefined;fixedLoading.value=false;fixedError.value=''}
async function loadFixedType(){
 const id=props.fixedDeviceTypeId;if(!id)return
 if(!uuid.test(id)||!projectId.value||projectId.value!==contextProject.value){fixedError.value='项目或类型上下文已变化，请返回设备类型重新打开';return}
 if(!can('device:create'))return
 const current=generation,epoch=identityEpoch(),project=projectId.value;typeRead?.abort();typeRead=new AbortController();fixedLoading.value=true;fixedError.value=''
 try{const value=await devicesApi.type(project,id,typeRead.signal);assertIdentity(epoch);if(current!==generation)return
  if(value.id!==id||value.projectId!==project||typeof value.name!=='string'||!value.name.trim()||!['DRAFT','PUBLISHED'].includes(value.status||''))throw new Error('指定设备类型资料不完整')
  fixedType.value=value;form.deviceTypeId=id
 }catch(cause){if(current===generation&&!(cause instanceof IdentityChanged))fixedError.value=errorMessage(cause)}
 finally{if(current===generation)fixedLoading.value=false}
}
const disposeProfileIdentity=onIdentityChange(resetScope)
onScopeDispose(()=>{generation++;pendingRead?.abort();typeRead?.abort();disposeProfileIdentity()})
watch(()=>props.fixedDeviceTypeId,()=>{contextProject.value=projectId.value},{flush:'sync'})
watch(()=>[projectId.value,props.fixedDeviceTypeId,can('device:create')],()=>{if(!contextProject.value&&projectId.value)contextProject.value=projectId.value;resetScope();if(props.fixedDeviceTypeId)void loadFixedType()},{immediate:true,flush:'sync'})
async function submit() {
  if (busy.value || unknown.value || !can('device:create') || !projectId.value) return
  if(props.fixedDeviceTypeId&&(!fixedType.value||fixedType.value.id!==props.fixedDeviceTypeId||fixedLoading.value||contextProject.value!==projectId.value)){
    error.value='指定设备类型尚未核实，请重新读取后创建';return
  }
  const epoch = identityEpoch(), project = projectId.value, current=generation
  let accepted=false
  let request:AbortController|undefined
  try {
    const body = createBody({...form,deviceTypeId:props.fixedDeviceTypeId||form.deviceTypeId}); request=new AbortController();pendingRead=request;busy.value = true; error.value = ''
    const result = await devicesApi.createProfile(project, body,crypto.randomUUID()); accepted=true; assertIdentity(epoch); if(current!==generation)return
    assertProfile(result)
    // 回读相同资料只能证明两次响应一致，必须先绑定本次实际发送的字段。
    if(result.name!==body.name || result.businessKey!==(body.businessKey??null)
      || typeof result.deviceKey!=='string' || !result.deviceKey
      || (body.deviceKey!=null && result.deviceKey!==body.deviceKey)
      || result.deviceTypeId!==(body.deviceTypeId??null) || result.description!==(body.description??null)) {
      throw new Error('创建回执与本次提交不一致，请返回列表核对')
    }
    const saved = await devicesApi.profile(project, result.deviceId,request.signal); assertIdentity(epoch); if(current!==generation)return
    if (!sameProfile(result,saved)) throw new Error('设备已创建但回读发生变化，请返回列表核对')
    const tags=decodeDeviceTagSet(await readDeviceTagSet(project,result.deviceId,request.signal),result.deviceId)
    assertIdentity(epoch);if(current!==generation)return
    const expected=new Map(Object.entries(body.tags??{}))
    if(tags.tags.length!==expected.size||tags.tags.some(row=>!expected.has(row.key)||expected.get(row.key)!==row.value)) {
      throw new Error('设备已创建但标签回读与本次提交不一致，请返回列表核对')
    }
    if(body.groupId){
      const scope={project,device:result.deviceId}
      const group=decodeStaticGroup(await readStaticGroup(scope,body.groupId,request.signal),scope,body.groupId)
      assertIdentity(epoch);if(current!==generation)return
      if(!group.member)throw new Error('设备已创建但所选分组尚未核实，请返回列表核对')
    }
    await router.push(props.returnDeviceTypeId?returnTarget.value:`/devices/${result.deviceId}`)
  } catch (cause) { if (current===generation && !(cause instanceof IdentityChanged)) { error.value = errorMessage(cause); unknown.value = accepted || cause instanceof ApiError && cause.outcomeUnknown } }
  finally { if(current===generation){busy.value=false;if(pendingRead===request)pendingRead=undefined} }
}
</script>
<template>
  <main class="tl-page device-create-page">
    <PageHeader title="创建设备" back @back="router.push(returnTarget)" />
    <AsyncState :forbidden="!can('device:create') || !projectId">
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <el-alert v-if="unknown" title="创建结果尚未确认。请返回设备列表，按名称、创建时间或唯一标识核对；不要重复提交。" type="warning" :closable="false" />
      <el-form class="tl-form device-create" label-position="top" @submit.prevent="submit">
        <el-form-item label="设备名称"><template #label><span>设备名称</span><el-tooltip content="起一个便于识别的名称，支持中文，仅在应用中显示。" placement="top"><el-icon class="field-help" aria-label="设备名称说明"><QuestionFilled/></el-icon></el-tooltip></template><el-input v-model="form.name" aria-label="设备名称" aria-required="true" maxlength="128" /></el-form-item>
        <el-form-item label="设备唯一标识（选填）"><template #label><span>设备唯一标识（选填）</span><el-tooltip content="设备侧唯一标识，留空时由平台生成；创建后不可修改，并直接作为 MQTT Topic 标识。" placement="top"><el-icon class="field-help" aria-label="设备唯一标识说明"><QuestionFilled/></el-icon></el-tooltip></template><el-input v-model="form.deviceKey" aria-label="设备唯一标识" maxlength="64" placeholder="留空由平台生成" /></el-form-item>

        <section class="tl-form-section"><h2>为此设备绑定设备类型</h2><p>设备类型是指一类拥有相同功能的设备，通过功能定义来简化多个设备的管理。功能定义包括属性、事件、命令等，除此之外设备类型还可以定义规则和任务。 <a href="http://localhost:4321/docs/device/thing-model" target="_blank" rel="noopener noreferrer">了解详情 <ReferenceIcon glyph="󰏌"/></a></p></section>
        <el-form-item label="设备类型（选填）"><el-select v-model="form.deviceTypeId" :disabled="!!fixedDeviceTypeId||fixedLoading" :clearable="!fixedDeviceTypeId" filterable placeholder="请选择" aria-label="设备类型"><el-option v-for="type in typeOptions" :key="type.id" :label="type.name || type.typeKey" :value="type.id!" /></el-select><el-button v-if="!fixedDeviceTypeId&&types.data.value?.hasMore" text :loading="types.loading.value" @click="moreTypes">加载更多类型</el-button></el-form-item>
        <AsyncState v-if="fixedDeviceTypeId" :loading="fixedLoading" :error="fixedError" @retry="loadFixedType"/>
        <AsyncState v-if="types.error.value" :error="types.error.value" @retry="types.reload" />
        <section class="tl-form-section"><h2>将此设备加入分组</h2><p>使用设备组可以对设备进行更好的归类管理，同时还可以基于分组对设备数据进行统计监控和聚合分析。 <a href="http://localhost:4321/docs/device/management#档案标签与分组" target="_blank" rel="noopener noreferrer">了解详情 <ReferenceIcon glyph="󰏌"/></a></p></section>
        <el-form-item label="设备分组（选填）"><el-cascader v-model="selectedGroup" :options="groupOptions" :props="{checkStrictly:true,emitPath:false}" clearable filterable placeholder="请选择" aria-label="设备分组" /></el-form-item>
        <AsyncState v-if="groups.error.value" :error="groups.error.value" @retry="groups.reload" />
        <section class="tl-form-section tl-form-section--plain"><h2>更多设备信息</h2></section>
        <el-form-item label="设备描述（选填）"><el-input v-model="form.description" type="textarea" :rows="5" maxlength="500" aria-label="设备描述" /></el-form-item>
        <el-form-item label="标签（选填）"><div class="device-tags"><div v-for="(tag,index) in form.tags" :key="index" class="device-tag-row"><el-input v-model="tag.key" size="small" :aria-label="`标签名称${index + 1}`" placeholder="标签名称，比如：服务商" /><el-input v-model="tag.value" size="small" :aria-label="`标签值${index + 1}`" placeholder="标签值，比如：ThingsLink" maxlength="128" /><el-button type="danger" size="small" @click="form.tags.splice(index,1)">移除</el-button></div><el-button size="small" :disabled="form.tags.length >= MAX_DEVICE_TAGS" @click="form.tags.push({key:'',value:''})">添加标签</el-button></div></el-form-item>
        <div class="tl-form-actions"><el-button type="primary" native-type="submit" :loading="busy" :disabled="unknown||!!fixedDeviceTypeId&&(!fixedType||fixedLoading)">创建</el-button><el-button :disabled="busy" @click="router.push(returnTarget)">取消</el-button></div>
      </el-form>
    </AsyncState>
  </main>
</template>
<style scoped>
.device-create-page { padding:20px 30px 50px; }
.device-create-page :deep(.tl-page-header) { min-height:22px; margin-bottom:20px; }
.device-create-page :deep(.tl-page-header h1.is-secondary) { line-height:24px; }
.device-create { max-width:none; margin-top:0; }
.device-create :deep(.el-input), .device-create :deep(.el-select), .device-create :deep(.el-cascader), .device-create :deep(.el-textarea) { max-width:350px; }
.device-create :deep(.el-cascader) { width:350px; max-width:100%; }
.device-create :deep(.el-form-item__label) { height:32px; line-height:32px; margin-bottom:0; font-weight:500; }
.device-create :deep(.el-form-item__content) { align-items:flex-start; flex-direction:column; gap:6px; }
.device-create :deep(.el-textarea__inner) { min-height:115px!important; height:115px; }
.device-create .tl-form-section { margin:42px 0 22px; }
.device-create .tl-form-section h2 { padding-top:10px; font-weight:400; line-height:22px; color:#002822; margin:0 0 10px; }
.device-create .tl-form-section p { color:#666; margin:0; line-height:20px; }
.device-create .tl-form-section--plain { margin-bottom:10px; }
.tl-form-section a { white-space:nowrap; }.tl-form-section a .reference-icon { font-size:13px; vertical-align:-1px; }
.field-help { margin-left:8px; color:#c0c4cc; font-size:13px; vertical-align:middle; }
.device-create .tl-form-actions { margin-top:50px; }
.device-create .tl-form-actions :deep(.el-button+.el-button) { margin-left:0; }
.device-tags { width:100%; }
.device-tag-row { display:flex; gap:8px; margin-bottom:8px; }
.device-tag-row :deep(.el-input) { max-width:none; }
@media(max-width:700px) { .device-create-page { padding:25px 15px; } .device-tag-row { flex-wrap:wrap; } .device-tag-row :deep(.el-input) { flex:1 1 180px; } }
</style>
