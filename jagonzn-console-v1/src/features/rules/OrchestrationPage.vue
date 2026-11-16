<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { RefreshRight as Refresh, Plus } from '@element-plus/icons-vue'
import { can, projectId, currentProject } from '@/core/session'
import { useRouter } from 'vue-router'
import { useResource } from '@/core/use-resource'
import { ApiError, onIdentityChange } from '@/core/http'
import { formatTime } from '@/core/time'
import PageHeader from '@/ui/PageHeader.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import { listAutomations, listScenes } from './api'
const router=useRouter()
const writable=computed(()=>can('rule:manage')&&currentProject.value?.status==='ACTIVE')
function createDefinition(){if(writable.value)void router.push(props.kind==='scene'?'/rules/scenes/create':'/rules/automations/create')}
const props = defineProps<{ kind: 'automation' | 'scene' }>()
const allowed = computed(() => can('rule:manage')), name = ref(''), queryName = ref(''), status = ref(''), limit = ref(24), cursors = ref<(string | undefined)[]>([undefined])
const resource = useResource(signal => (props.kind === 'automation' ? listAutomations : listScenes)(projectId.value, { name: queryName.value, status: status.value, cursor: cursors.value.at(-1), limit: limit.value }, signal))
// 只有首游标的明确末页才证明集合完整；分页条数不能冒充总量。
const count=computed(()=>{const page=resource.data.value;return !resource.error.value&&!resource.loading.value&&cursors.value.length===1&&page?.nextCursor===null? page.items?.length:undefined})
function clearFilters() { name.value = ''; queryName.value = ''; status.value = ''; cursors.value = [undefined] }
const disposeIdentity = onIdentityChange(clearFilters)
onScopeDispose(disposeIdentity)
watch(resource.error, cause => { if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) { resource.data.value = undefined; clearFilters() } })
function reset() { cursors.value = [undefined]; queryName.value = name.value; if (projectId.value && allowed.value) void resource.reload(); else resource.clear() }
function next() { const cursor = resource.data.value?.nextCursor; if (cursor && projectId.value && allowed.value) { cursors.value.push(cursor); void resource.reload() } }
function previous() { if (cursors.value.length > 1 && projectId.value && allowed.value) { cursors.value.pop(); void resource.reload() } }
function resize(value: number) { limit.value = value; reset() }
function statusLabel(value: string | undefined) { return value === 'ACTIVE' ? '正常' : value === 'PAUSED' ? '已停用' : value === 'DRAFT' ? '草稿' : value || '未知' }
watch([projectId, allowed, () => props.kind], () => { resource.clear(); clearFilters(); if (projectId.value && allowed.value) void resource.reload() }, { immediate: true })
</script>
<template><main class="tl-page">
  <PageHeader :title="kind === 'automation' ? '自动化' : '场景'" :count="count"><el-button v-if="writable" type="primary" size="small" :icon="Plus" @click="createDefinition">{{kind==='scene'?'创建场景':'创建自动化'}}</el-button></PageHeader>
  <div v-if="allowed" class="tl-learning-resource"><ReferenceIcon glyph="󰋽"/><span>学习资源：<a href="https://www.thingscloud.xyz/docs/guide/automations/overview.html" target="_blank" rel="noopener noreferrer">{{ kind === 'automation' ? '什么是自动化？' : '什么是场景？' }} <ReferenceIcon glyph="󰏌"/></a></span></div>
  <div v-if="allowed" class="tl-toolbar orchestration-toolbar"><el-select v-model="status" class="orchestration-status" aria-label="状态" placeholder="全部" @change="reset"><el-option label="全部" value="" /><el-option label="正常" value="ACTIVE" /><el-option label="已停用" value="PAUSED" /><el-option label="草稿" value="DRAFT" /></el-select><el-input v-model="name" class="orchestration-search" aria-label="搜索名称/描述" placeholder="搜索名称/描述" maxlength="128" clearable @keyup.enter="reset" @clear="reset" /><el-button class="orchestration-refresh" :icon="Refresh" @click="reset">刷新</el-button></div>
  <AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" :empty="!resource.data.value?.items?.length" :empty-text="kind === 'automation' ? '创建自动化，让业务自动运转' : '定义标准动作流程，随时一键复用'" @retry="resource.reload"><template #empty><p class="orchestration-empty-copy">{{ kind === 'automation' ? '通过可视化编排，轻松实现复杂的设备联动、定时计划和智能运维。无需编写代码，让业务自动运转。' : '将常用的一组设备操作保存为标准化流程，需要时一键按序执行。适用于周期性灌溉、设备巡检路线、产线启停等重复性操作。' }}</p><el-button v-if="writable" type="primary" class="orchestration-empty-create" @click="createDefinition">{{kind==='scene'?'创建场景':'创建自动化'}}</el-button></template><el-table :data="resource.data.value?.items || []"><el-table-column prop="name" label="名称"><template #default="{row}"><router-link v-if="kind==='scene'" :to="`/rules/scenes/${row.id}`">{{row.name}}</router-link><router-link v-else :to="`/rules/automations/${row.id}`">{{row.name}}</router-link></template></el-table-column><el-table-column prop="status" label="状态"><template #default="{ row }">{{ statusLabel(row.status) }}</template></el-table-column><el-table-column prop="description" label="说明" show-overflow-tooltip /><el-table-column label="更新时间"><template #default="{ row }">{{ formatTime(row.updatedAt) }}</template></el-table-column></el-table><CursorPager :page="cursors.length" :has-next="!!resource.data.value?.nextCursor" :limit="limit" :loading="resource.loading.value" @next="next" @previous="previous" @update:limit="resize" /></AsyncState>
</main></template>
<style scoped>.orchestration-empty-create{display:block;margin:20px auto 0}.orchestration-empty-copy{max-width:680px;margin:0 auto;color:var(--tl-muted);font-size:14px;line-height:1.7;text-align:center}.orchestration-status{width:150px;max-width:100%}.orchestration-search{width:220px;max-width:100%}.orchestration-refresh{margin-left:auto;height:32px;padding:9px 15px;border-radius:3px;font-size:12px;line-height:12px}.orchestration-toolbar :deep(.el-select__wrapper){height:32px;min-height:32px;font-size:13px;line-height:32px;padding:0 5px 0 16px;gap:6px}.orchestration-toolbar :deep(.el-select__suffix){width:25px;justify-content:center}.orchestration-toolbar :deep(.el-select__caret){font-size:14px;color:#c0c4cc}.orchestration-toolbar :deep(.el-input__wrapper){height:32px;box-sizing:border-box;padding:0 15px;font-size:13px}.orchestration-toolbar :deep(.el-input__inner){height:32px;line-height:32px;font-size:13px}</style>
