<script setup lang="ts">
import { THINGSLINK_EXTRAS_VISIBLE } from '@/core/replica-scope'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { can, projectId, session } from '@/core/session'
import { useResource } from '@/core/use-resource'
import { ApiError, IdentityChanged, errorMessage, identityEpoch, onIdentityChange } from '@/core/http'
import { formatTime } from '@/core/time'
import type { Schema } from '@/core/contracts'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import SectionPanel from '@/ui/SectionPanel.vue'
import { getRule, getVersion, ruleHistory, getHealth, saveRule, saveRuleInformation, pauseRule, activateRule, debugRule } from './api'
import { WarningFilled } from '@element-plus/icons-vue'
import { ruleEditor, cas } from './models'
import {ruleDeletionIntent,removeMessageRule,readMessageRuleDeletion,type RuleDeletionIntent} from './message-rule-deletion'
import { checkedRuleDefinition, RuleDefinitionReadError } from './rule-definition-read'
import { useDetailTab } from './detail-tab'
import { definitionUuid } from './device-task-definition-port'
import UsageStatisticsPanel from './UsageStatisticsPanel.vue'
import RuleDebugLogPanel from './RuleDebugLogPanel.vue'
import RuleDeviceParticipationPanel from './RuleDeviceParticipationPanel.vue'
import { ruleDebugLogTransport } from './rule-debug-transport'
const props = defineProps<{ internal?: boolean }>()
const internal = Boolean(THINGSLINK_EXTRAS_VISIBLE) && props.internal === true
const route = useRoute(), router = useRouter(), tab = useDetailTab(['rule', 'devices', 'statistics', 'logs', 'settings'], 'rule'), selected = ref(''), historyCursors = ref<(string | undefined)[]>([undefined])
const historyLimit = ref(24)
const allowed = computed(() => can('rule:manage')), id = computed(() => String(route.params.id || ''))
/** 设备入口只影响返回位置；权限、规则和来源仍由各自权威读取验证。 */
function back(){if(devicesBlocked.value)return;const device=route.query.deviceId;void router.push(route.query.source==='device'&&typeof device==='string'&&definitionUuid(device)?{path:'/devices/'+device,query:{tab:'rules'}}:'/rules/messages')}
const logsVisited = ref(false), logsBusy = ref(false), logsLocked = ref(false), logsConfirming = ref(false)
const logsBlocked = computed(() => logsBusy.value || logsLocked.value || logsConfirming.value)
const devicesVisited=ref(false),devicesBusy=ref(false),devicesLocked=ref(false)
const devicesBlocked=computed(()=>devicesBusy.value||devicesLocked.value)
const operationsBlocked=computed(()=>logsBlocked.value||devicesBlocked.value)
watch(()=>tab.value,value=>{if(value==='devices')devicesVisited.value=true},{immediate:true})
onBeforeRouteLeave(()=>!devicesBlocked.value)
onBeforeRouteUpdate(to=>!devicesBlocked.value||to.fullPath===route.fullPath)
function beforeUnload(event:BeforeUnloadEvent){if(devicesBlocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
function deviceScope(){return {projectId:projectId.value,ruleId:id.value,scopeKey:`${identityEpoch()}:${lifecycle}:${projectId.value}:${id.value}`}}

watch([projectId, id, () => tab.value], (current, previous) => {
  if (!previous || current[0] !== previous[0] || current[1] !== previous[1]) { logsVisited.value = false; logsBusy.value = false; logsLocked.value = false; logsConfirming.value = false }
  if (!internal && current[2] === 'logs') logsVisited.value = true
}, { immediate: true })
const removal=ref<{project:string;id:string;expectedVersion:number}>(),deletion=ref<RuleDeletionIntent>(),deletionSealed=ref(false)
const dialog = ref(false), saving = ref(false), writeError = ref(''), needsRead = ref(false)
const draft = ref<Schema<'MessageRuleWriteRequest'>>({}), actionsText = ref('')
const debugVisible = ref(false), debugInput = ref('{}'), debugOutput = ref<Schema<'DebugResponse'>>()
const resource = useResource(async signal => {
  const project = projectId.value, ruleId = id.value
  if (!internal) {
    const rule = checkedRuleDefinition(await getRule(project, ruleId, signal), ruleId)
    const history: Schema<'RuleManagementPageMessageRuleVersionView'> = { items: [] }
    return { rule, history, health: undefined, version: undefined }
  }
  const [value, history, health] = await Promise.all([getRule(project, ruleId, signal), ruleHistory(project, ruleId, historyCursors.value.at(-1), signal, historyLimit.value), internal ? getHealth(project, ruleId, signal) : Promise.resolve(undefined)])
  const rule = checkedRuleDefinition(value, ruleId)
  const versionId = selected.value || rule.activeVersionId || history.items?.[0]?.id
  const version = versionId ? await getVersion(project, ruleId, versionId, signal) : undefined
  return { rule, history, health, version }
})
function resizeHistory(value: number) { historyLimit.value = value; historyCursors.value = [undefined]; void resource.reload() }
function nextHistory() { const cursor = resource.data.value?.history.nextCursor; if (cursor) { historyCursors.value.push(cursor); void resource.reload() } }
function previousHistory() { if (historyCursors.value.length > 1) { historyCursors.value.pop(); void resource.reload() } }
watch(resource.error, cause => { if (cause instanceof RuleDefinitionReadError || cause instanceof ApiError && [401,403,404].includes(cause.status)) { resource.data.value = undefined; lifecycle++; clearEditor() } })
function chooseVersion(value: string) { selected.value = value; void resource.reload() }
function clearEditor() { removal.value=undefined; debugVisible.value = false; debugInput.value = '{}'; debugOutput.value = undefined; dialog.value = false; draft.value = {}; actionsText.value = ''; saving.value = false }
function resetIdentity() { const seal=!!deletion.value||deletionSealed.value;deletion.value=undefined;deletionSealed.value=seal;resource.clear();lifecycle++;devicesBusy.value=false;devicesLocked.value=false;devicesVisited.value=tab.value==='devices'; clearEditor(); writeError.value = seal?'身份已变化，原删除结果尚未确认，请安全离开。':''; needsRead.value = seal }
let active = true, lifecycle = 0
const dispose = onIdentityChange(resetIdentity); onScopeDispose(() => { active = false; dispose() })
watch([projectId, id, allowed,()=>session.user?.accountId], (current,previous) => { const keepLock=!!previous && current[0]===previous[0] && current[1]===previous[1] && (saving.value || needsRead.value);resetIdentity();if(previous&&(current[0]!==previous[0]||current[1]!==previous[1]))deletionSealed.value=false;needsRead.value=keepLock||deletionSealed.value;if(keepLock)writeError.value='请重新读取规则核对最新状态';selected.value = ''; historyCursors.value = [undefined]; resource.clear(); if (projectId.value && allowed.value) void resource.reload() }, { immediate: true })
function edit() {
  const data = resource.data.value
  if (!allowed.value || saving.value || operationsBlocked.value || removal.value || resource.error.value || needsRead.value || !data?.rule.version || (internal && !data.version)) return
  try {
    draft.value = internal ? ruleEditor(data.rule, data.version!) : { name: data.rule.name, description: data.rule.description, expectedVersion: data.rule.version }
    actionsText.value = internal ? JSON.stringify(draft.value.actions, null, 2) : ''
    writeError.value = ''; dialog.value = true
  } catch (e) { writeError.value = errorMessage(e) }
}
async function write(action: (current: () => boolean) => Promise<unknown>, removed = false) {
  if (!allowed.value || saving.value || needsRead.value || operationsBlocked.value) return
  const epoch = identityEpoch(), generation = lifecycle, project = projectId.value, ruleId = id.value
  const current = () => active && generation === lifecycle && identityEpoch() === epoch && projectId.value === project && id.value === ruleId && allowed.value
  saving.value = true; writeError.value = ''
  try { await action(current); if (!current()) return; clearEditor(); needsRead.value = false; writeError.value = ''; if (removed) { resource.clear(); await router.push('/rules/messages'); return }; await resource.reload() }
  catch (e) { if (current() && !(e instanceof IdentityChanged)) {
    writeError.value = errorMessage(e)
    if (e instanceof ApiError && (e.outcomeUnknown || e.status === 409)) needsRead.value = true
    if (e instanceof ApiError && [401,403,404].includes(e.status)) { resource.clear(); resource.error.value = e }
  } }
  finally { if (current()) saving.value = false }
}
function switchRule(value: boolean) {
  if(removal.value || dialog.value || operationsBlocked.value)return
  const data = resource.data.value
  if (!data?.rule.version) return
  const project = projectId.value, ruleId = id.value, expectedVersion = data.rule.version
  const version = data.rule.activeVersionId || data.version?.id
  void write(async current => {
    if (!value) return pauseRule(project, ruleId, expectedVersion)
    let candidate = version
    if (!candidate) {
      const history = await ruleHistory(project, ruleId, undefined, undefined, 1)
      if (!current()) throw new IdentityChanged()
      candidate = history.items?.[0]?.id
    }
    if (!candidate) throw new Error('没有可启用的规则版本')
    return activateRule(project, ruleId, candidate, expectedVersion)
  })
}
function save() {
  if(removal.value)return
  if (!internal) {
    const body = { name: draft.value.name, description: draft.value.description, expectedVersion: draft.value.expectedVersion }
    void write(() => saveRuleInformation(projectId.value, id.value, body)); return
  }
  try {
    const actions: unknown = JSON.parse(actionsText.value)
    if (!Array.isArray(actions)) throw new Error('动作必须是数组')
    const data = resource.data.value
    if (!data?.version) return
    // 同一守卫校验编辑后的每一个动作，保持完整集合。
    const checked = ruleEditor(data.rule, { ...data.version, source: draft.value.source, actions: JSON.parse(actionsText.value) })
    if (!draft.value.name?.trim()) throw new Error('请填写名称')
    const body = { ...checked, name: draft.value.name, description: draft.value.description, expectedVersion: draft.value.expectedVersion }
    void write(() => saveRule(projectId.value, id.value, body))
  } catch (e) { writeError.value = errorMessage(e) }
}
async function debug() {
  const version = resource.data.value?.version?.id
  if (!allowed.value || !version || saving.value) return
  try { JSON.parse(debugInput.value) } catch { writeError.value = '请输入合法 JSON'; return }
  const epoch = identityEpoch(), generation = lifecycle, project = projectId.value, ruleId = id.value
  saving.value = true; writeError.value = ''; debugOutput.value = undefined
  try { const result = await debugRule(project, ruleId, version, debugInput.value); if (active && generation === lifecycle && identityEpoch() === epoch && allowed.value && projectId.value === project && id.value === ruleId) debugOutput.value = result }
  catch (e) { if (active && generation === lifecycle && identityEpoch() === epoch && allowed.value && !(e instanceof IdentityChanged)) writeError.value = errorMessage(e) }
  finally { if (active && generation === lifecycle && identityEpoch() === epoch) saving.value = false }
}
function openRemoval(){
  const row=resource.data.value?.rule
  if(internal || !allowed.value || saving.value || needsRead.value || operationsBlocked.value || dialog.value || debugVisible.value || resource.error.value)return
  if(!row?.id || row.id!==id.value){writeError.value='请重新读取规则核对最新状态';return}
  try{removal.value={project:projectId.value,id:row.id,expectedVersion:cas(row.version)};writeError.value=''}catch{writeError.value='请重新读取规则核对最新状态'}
}
function closeRemoval(value:boolean){if(!value && !saving.value)removal.value=undefined}
function deletionFailed(cause:unknown,intent:RuleDeletionIntent){
 clearEditor();resource.clear();needsRead.value=true;writeError.value='原删除结果尚未确认，请勿重复移除。'+errorMessage(cause)
 if(cause instanceof ApiError&&[401,403].includes(cause.status)||session.user?.accountId!==intent.actor){deletion.value=undefined;deletionSealed.value=true;if(cause instanceof ApiError)resource.error.value=cause}else deletion.value=intent
}
async function removeExact(project:string,rule:string,expected:number){
 if(!allowed.value||saving.value||needsRead.value||operationsBlocked.value||deletion.value||deletionSealed.value)return
 let intent:RuleDeletionIntent
 try{intent=ruleDeletionIntent(project,rule,session.user?.accountId??'',String(cas(expected)))}catch(cause){writeError.value=errorMessage(cause);return}
 deletion.value=intent;const epoch=identityEpoch(),generation=lifecycle,actor=session.user?.accountId
 const current=()=>active&&epoch===identityEpoch()&&generation===lifecycle&&projectId.value===project&&id.value===rule&&session.user?.accountId===actor&&allowed.value
 saving.value=true;writeError.value=''
 try{await removeMessageRule(intent);if(current()){deletion.value=undefined;needsRead.value=false;clearEditor();resource.clear();await router.push('/rules/messages')}}
 catch(cause){if(current()){
  if(cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,409].includes(cause.status)){deletion.value=undefined;clearEditor();needsRead.value=true;writeError.value=errorMessage(cause)}else deletionFailed(cause,intent)
 }}finally{if(current())saving.value=false}
}
async function removeFormal(){const intent=removal.value;if(intent&&intent.project===projectId.value&&intent.id===id.value)await removeExact(intent.project,intent.id,intent.expectedVersion)}
async function remove(){const version=resource.data.value?.rule.version;if(version)await removeExact(projectId.value,id.value,version)}
async function verifyDeletion(){
 const intent=deletion.value;if(!intent||!allowed.value||saving.value||deletionSealed.value)return
 if(intent.actor!==session.user?.accountId||intent.project!==projectId.value||intent.rule!==id.value){deletionFailed(new IdentityChanged(),intent);return}
 const epoch=identityEpoch(),generation=lifecycle;const current=()=>active&&epoch===identityEpoch()&&generation===lifecycle&&intent.actor===session.user?.accountId&&intent.project===projectId.value&&intent.rule===id.value&&allowed.value
 saving.value=true
 try{await readMessageRuleDeletion(intent);if(current()){deletion.value=undefined;needsRead.value=false;clearEditor();resource.clear();await router.push('/rules/messages')}}catch(cause){if(current())deletionFailed(cause,intent)}finally{if(current())saving.value=false}
}
async function reread() {
  if(deletion.value){await verifyDeletion();return}if(deletionSealed.value)return
  if (saving.value || logsBusy.value) return
  const epoch = identityEpoch(), scope = lifecycle, project = projectId.value, ruleId = id.value
  clearEditor(); await resource.reload()
  // 被替换的读取完成时，不得清除新对象后来产生的未知写锁。
  if (active && lifecycle === scope && identityEpoch() === epoch && projectId.value === project && id.value === ruleId && allowed.value
    && !resource.error.value && resource.data.value?.rule.id === ruleId) { needsRead.value = false; writeError.value = '' }
}
function resourceDenied(cause: ApiError) { lifecycle++;devicesBusy.value=false;devicesLocked.value=false;clearEditor();resource.clear();resource.error.value=cause }
async function refreshDeviceContext():Promise<string>{
 const epoch=identityEpoch(),generation=lifecycle,project=projectId.value,rule=id.value,data=resource.data.value
 if(!allowed.value||!data)throw new IdentityChanged()
 const checked=checkedRuleDefinition(await getRule(project,rule),rule)
 if(!active||epoch!==identityEpoch()||generation!==lifecycle||project!==projectId.value||rule!==id.value||!allowed.value)throw new IdentityChanged()
 resource.data.value={...data,rule:checked}
 return String(cas(checked.version))
}
function deviceDenied(cause:ApiError,uncertain:boolean){resourceDenied(cause);if(uncertain)writeError.value='设备许可结果尚未确认。'+errorMessage(cause)}
</script>
<template>
  <main class="tl-page" :class="{'rule-device-directory-page':tab==='devices'}">
    <PageHeader :title="internal ? resource.data.value?.rule.name || '消息规则' : '规则详情'" back :back-disabled="devicesBlocked" @back="back">
      <template v-if="internal" #status><el-tag v-if="resource.data.value">{{ resource.data.value.rule.status }}</el-tag></template>
      <el-button v-if="internal" :disabled="!allowed || !resource.data.value?.version || saving || needsRead || operationsBlocked" @click="edit">编辑</el-button>
      <template v-if="internal"><el-popconfirm v-if="resource.data.value?.rule.status === 'ACTIVE'" title="确认停用？旧排队和重试将失效。" @confirm="write(() => pauseRule(projectId, id, resource.data.value!.rule.version!))"><template #reference><el-button :disabled="!allowed || saving || needsRead || operationsBlocked || !!removal">停用</el-button></template></el-popconfirm>
      <el-popconfirm v-else title="确认发布选定版本？恢复不会补跑历史消息。" @confirm="write(() => activateRule(projectId, id, resource.data.value!.version!.id!, resource.data.value!.rule.version!))"><template #reference><el-button type="primary" :disabled="!allowed || !resource.data.value?.version || saving || needsRead || operationsBlocked">发布 / 恢复</el-button></template></el-popconfirm>
      <el-button :disabled="!allowed || !resource.data.value?.version || saving" @click="debugVisible = true">沙箱调试</el-button>
      <el-popconfirm title="确认移除规则？历史执行记录将保留。" @confirm="remove"><template #reference><el-button type="danger" :disabled="!allowed || !resource.data.value || saving || needsRead || operationsBlocked">移除</el-button></template></el-popconfirm>
      </template>
    </PageHeader>
    <div v-if="!internal && resource.data.value" class="reference-object-heading"><h2>{{ resource.data.value.rule.name }}</h2><el-button size="small" :disabled="!allowed || !resource.data.value.rule.version || saving || needsRead || operationsBlocked || !!removal" @click="edit">编辑</el-button><p>ID：{{ resource.data.value.rule.id }}</p></div>
    <el-alert v-if="writeError" :title="writeError" type="error" :closable="false"><el-button v-if="needsRead&&!deletionSealed" :disabled="saving||!allowed" @click="reread">{{deletion ? '读取原删除回执' : '重新读取核对'}}</el-button><el-button v-if="deletion||deletionSealed" :disabled="saving" @click="router.push('/rules/messages')">安全离开</el-button></el-alert>
    <el-alert v-if="logsLocked" title="日志操作结果尚未核对，请返回日志页签读取最新状态" type="error" :closable="false"><el-button @click="router.replace({ query: { ...route.query, tab: 'logs' } })">查看日志核对</el-button></el-alert>
    <AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="reread">
      <el-tabs v-model="tab" class="tl-tabs"><el-tab-pane label="规则" name="rule" :disabled="devicesBlocked"/><el-tab-pane label="设备" name="devices" :disabled="devicesBlocked||saving||needsRead||dialog||!!removal"/><el-tab-pane label="统计" name="statistics" :disabled="devicesBlocked"/><el-tab-pane label="日志" name="logs" :disabled="devicesBlocked"/><el-tab-pane label="设置" name="settings" :disabled="devicesBlocked"/></el-tabs>
      <template v-if="resource.data.value">
        <div v-if="tab === 'rule'" :class="{ 'rule-reference-grid': !internal }"><SectionPanel :title="internal ? '消息规则' : '基本信息'">
          <p v-if="internal">{{ resource.data.value.rule.description || '暂无说明' }}</p>
          <template v-if="internal"><el-select :model-value="resource.data.value.version?.id" placeholder="选择不可变版本" @change="chooseVersion"><el-option v-for="version in resource.data.value.history.items || []" :key="version.id" :label="`版本 ${version.versionNumber}`" :value="version.id || ''" /></el-select>
          <CursorPager :page="historyCursors.length" :has-next="!!resource.data.value.history.nextCursor" :loading="resource.loading.value" :limit="historyLimit" @update:limit="resizeHistory" @next="nextHistory" @previous="previousHistory" />
          <pre>{{ resource.data.value.version?.source }}</pre>
          <p>连续失败：{{ resource.data.value.health?.consecutiveFailures ?? '—' }} / {{ resource.data.value.health?.failureThreshold ?? '—' }}</p>
          <p v-if="resource.data.value.health?.pauseReason">{{ resource.data.value.health?.pauseReason }} · {{ formatTime(resource.data.value.health?.autoPausedAt) }}</p></template>
          <dl v-if="!internal" class="tl-key-values"><dt>创建时间</dt><dd>{{ formatTime(resource.data.value.rule.createdAt) }}</dd><dt>修改时间</dt><dd>{{ formatTime(resource.data.value.rule.updatedAt) }}</dd></dl>

        </SectionPanel><SectionPanel v-if="!internal" title="规则状态"><span>启用规则</span><el-switch :model-value="resource.data.value.rule.status === 'ACTIVE'" :disabled="!allowed || saving || needsRead || operationsBlocked || !!removal" @change="switchRule" /></SectionPanel></div>
        <UsageStatisticsPanel v-else-if="tab === 'statistics'" kind="rule" :id="id" @denied="resourceDenied" />
        <template v-else-if="tab === 'settings'"><SectionPanel v-if="internal" title="设置"><dl class="tl-key-values"><dt>说明</dt><dd>{{ resource.data.value.rule.description || '—' }}</dd><dt>创建时间</dt><dd>{{ formatTime(resource.data.value.rule.createdAt) }}</dd><dt>更新时间</dt><dd>{{ formatTime(resource.data.value.rule.updatedAt) }}</dd></dl></SectionPanel><template v-else><section class="rule-settings-section"><h3>规则描述</h3><p>{{ resource.data.value.rule.description || '—' }}</p></section><section class="rule-settings-section"><h3>移除规则</h3><p class="tl-muted">规则移除后将立即生效，应用该规则的设备将不会再触发该规则。</p><el-button v-if="allowed" type="danger" size="small" :disabled="saving || needsRead || operationsBlocked || dialog || !!resource.error.value" @click="openRemoval">移除规则</el-button></section></template></template>
        <SectionPanel v-else-if="internal && tab === 'logs'" title="执行日志"><el-button @click="router.push({ path: '/rules/executions', query: { ruleId: id } })">查看执行记录</el-button></SectionPanel>
      </template>
    </AsyncState>
    <RuleDeviceParticipationPanel v-if="!internal&&allowed&&devicesVisited&&resource.data.value" :scope="deviceScope()" :definition-version="String(resource.data.value.rule.version)" :inactive="tab!=='devices'||saving||needsRead||dialog||!!removal||logsBlocked||resource.loading.value||!!resource.error.value" :refresh-context="refreshDeviceContext" @busy="devicesBusy=$event" @locked="devicesLocked=$event" @denied="deviceDenied"/>
    <RuleDebugLogPanel v-if="!internal && logsVisited" :rule-id="id" :transport="ruleDebugLogTransport" :inactive="tab !== 'logs' || !allowed || resource.loading.value || !!resource.error.value || !resource.data.value || saving || needsRead || dialog || !!removal || debugVisible" @busy="logsBusy = $event" @locked="logsLocked = $event" @confirming="logsConfirming = $event" @denied="resourceDenied" />
    <el-dialog v-if="!internal" :model-value="!!removal" title="提示" width="420px" align-center :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" @update:model-value="closeRemoval">
      <div class="rule-removal-prompt"><el-icon class="rule-removal-warning"><WarningFilled /></el-icon><span>确认移除规则吗？</span></div>
      <template #footer><el-button :disabled="saving" @click="closeRemoval(false)">取消</el-button><el-button type="primary" :loading="saving" :disabled="needsRead || operationsBlocked || !allowed" @click="removeFormal">确定</el-button></template>
    </el-dialog>
    <el-dialog v-model="dialog" :title="internal ? '编辑消息规则' : '修改规则信息'" width="680px" :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" @closed="clearEditor">
      <el-form label-position="top" class="tl-form"><el-form-item :label="internal ? '名称' : '规则名称'"><el-input v-model="draft.name" maxlength="128" /></el-form-item><el-form-item :label="internal ? '说明' : '规则描述'"><el-input v-model="draft.description" type="textarea" /></el-form-item><el-form-item v-if="internal" label="规则源码"><el-input v-model="draft.source" type="textarea" :rows="10" /></el-form-item><el-form-item v-if="internal" label="完整动作集合（JSON）"><el-input v-model="actionsText" type="textarea" :rows="6" /></el-form-item></el-form>
      <el-alert v-if="writeError" :title="writeError" type="error" :closable="false" />
      <template #footer><el-button :disabled="saving" @click="clearEditor">取消</el-button><el-button v-if="needsRead" @click="reread">重新读取核对</el-button><el-button type="primary" :loading="saving" :disabled="!allowed || needsRead || operationsBlocked" @click="save">{{ internal ? '保存新版本' : '保存' }}</el-button></template>
    </el-dialog>
    <el-dialog v-if="internal" v-model="debugVisible" title="沙箱调试" width="640px" :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
      <p class="tl-muted">执行选定版本，不派发动作。</p><el-input v-model="debugInput" type="textarea" :rows="8" aria-label="调试输入 JSON" />
      <el-alert v-if="writeError" :title="writeError" type="error" :closable="false" /><pre v-if="debugOutput">{{ JSON.stringify(debugOutput, null, 2) }}</pre>
      <template #footer><el-button :disabled="saving" @click="debugVisible = false">关闭</el-button><el-button type="primary" :loading="saving" :disabled="!allowed" @click="debug">调试</el-button></template>
    </el-dialog>
  </main>
</template>
<style scoped>.rule-settings-section{margin:0 0 32px}.rule-settings-section h3{margin:0 0 12px;font-size:14px;font-weight:500;color:var(--tl-title)}.rule-settings-section p{margin:0 0 12px;overflow-wrap:anywhere}.rule-removal-prompt{display:flex;align-items:center;gap:12px;min-height:36px}.rule-removal-warning{color:var(--el-color-warning);font-size:20px;flex-shrink:0}
pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--tl-bg, #f7f8fa); padding: 16px; max-height: 480px; overflow: auto; }
.reference-object-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 10px 0 24px; }
.reference-object-heading h2 { margin: 0; font-size: 22px; font-weight: 400; overflow-wrap: anywhere; }
.reference-object-heading p { width: 100%; margin: 0; color: var(--tl-muted); font-size: 12px; overflow-wrap: anywhere; }
.rule-device-directory-page{padding-top:12px;padding-left:30px;padding-right:30px}.rule-device-directory-page .reference-object-heading{row-gap:9px;margin-bottom:22px}.rule-device-directory-page .reference-object-heading h2{font-size:26px;line-height:34px;color:#002822}
@media(max-width:767px){.rule-device-directory-page{padding-left:15px;padding-right:15px}}
.rule-reference-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr); gap: 12px; align-items: start; }
@media (max-width: 900px) { .rule-reference-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
