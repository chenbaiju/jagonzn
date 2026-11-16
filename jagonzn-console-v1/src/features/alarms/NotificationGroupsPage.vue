<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { InfoFilled, Plus, TopRight } from '@element-plus/icons-vue'
import notificationEmpty from './assets/notification-empty.png'
import PageHeader from '../../ui/PageHeader.vue'
import AsyncState from '../../ui/AsyncState.vue'
import SectionPanel from '../../ui/SectionPanel.vue'
import CursorPager from '../../ui/CursorPager.vue'
import { can, projectId } from '../../core/session'
import { directoryTotal, groupDescription } from './model'
import { onIdentityChange } from '../../core/http'
import NotificationGroupOptionsPanel from './NotificationGroupOptionsPanel.vue'
import { useAlarmWorkspace } from './use-alarm-workspace'
const route = useRoute(), router = useRouter(), tab = ref('group')
const groupId = computed(() => String(route.params.groupId || ''))
const w = useAlarmWorkspace(() => groupId.value, true, false)
const { directory, detail, manage, page, limit, editingGroup, busy, error, needsReview, name, description, enabled } = w
const groups = directory.data, group = detail.data
const disposeIdentity = onIdentityChange(() => { tab.value = 'group' })
onScopeDispose(disposeIdentity)
watch([projectId, manage, groupId], () => { tab.value = 'group' })
</script>
<template>
  <main class="tl-page alarm-groups">
    <PageHeader :title="groupId ? '通知组详情' : (directoryTotal(groups) !== undefined ? `通知组 (${directoryTotal(groups)})` : '通知组')" :back="!!groupId" @back="router.push('/notification-groups')">
      <el-button v-if="!groupId && manage" size="small" type="primary" :icon="Plus" @click="router.push('/notification-groups/create')">创建通知组</el-button>
    </PageHeader>
    <div v-if="!groupId" class="tl-learning-resource"><el-icon><InfoFilled /></el-icon><span>学习资源：<a href="https://www.thingscloud.xyz/docs/guide/alarm/notification.html" target="_blank" rel="noopener noreferrer">什么是告警通知组？<el-icon><TopRight /></el-icon></a></span></div>
    <el-alert v-if="error && !editingGroup" :title="error" type="error" :closable="false"><el-button @click="w.resetEditor(); w.reload()">重新读取核对</el-button></el-alert>
    <AsyncState v-if="!groupId" :forbidden="!can('alarm:read')" :loading="directory.loading.value" :error="directory.error.value" @retry="w.reload">
      <div v-if="!groups?.items?.length" class="group-empty"><img :src="notificationEmpty" alt=""><h2>简单易用的告警通知</h2><p>通过创建告警通知组，并结合告警规则，您可以快速实现设备告警通知。</p><div v-if="manage" class="group-empty-action"><el-button type="primary" @click="router.push('/notification-groups/create')">创建通知组</el-button></div></div>
      <div v-else class="group-grid">
        <article v-for="row in groups?.items" :key="row.id" class="group-card">
          <router-link :to="`/notification-groups/${row.id}`" class="group-name">{{ row.name }}</router-link>
          <el-switch :model-value="row.enabled" :disabled="!manage || busy || needsReview" :aria-label="`${row.name}启用状态`" @change="(value: boolean) => w.toggleGroup(row, value)" />
        </article>
      </div>
    </AsyncState>
    <CursorPager v-if="!groupId && can('alarm:read') && !directory.error.value && (page > 1 || !!groups?.items?.length)" :page="page" :loading="directory.loading.value" :limit="limit" :total="directoryTotal(groups)" @update:page="w.selectPage" @update:limit="w.setLimit" />
    <AsyncState v-if="groupId" :forbidden="!can('alarm:read')" :loading="detail.loading.value" :error="detail.error.value" @retry="w.reload">
      <template v-if="group">
        <div class="group-heading"><h2>{{ group.name }}</h2><el-button v-if="manage" link type="primary" @click="w.openGroup(group)">编辑</el-button></div>
        <p class="tl-muted">ID：{{ group.id }}</p>
        <el-tabs v-model="tab" class="tl-tabs">
          <el-tab-pane label="通知组" name="group">
            <SectionPanel title="通知方式">
              <NotificationGroupOptionsPanel :group-id="groupId" @saved="w.reload" />
            </SectionPanel>
            <SectionPanel title="状态"><span>启用通知组</span><el-switch :model-value="group.enabled" :disabled="!manage || busy || needsReview" aria-label="启用通知组" @change="(value: boolean) => w.toggleGroup(group!, value)" style="margin-left:24px" /><p class="tl-muted">停用通知组后，告警规则无法通过该通知组发送通知。</p></SectionPanel>
          </el-tab-pane>
          <el-tab-pane label="设置" name="settings">
            <SectionPanel title="通知组描述"><template #extra><el-button v-if="manage" link type="primary" @click="w.openGroup(group)">编辑</el-button></template><p class="tl-muted">{{ groupDescription(group) || '无' }}</p></SectionPanel>
          </el-tab-pane>
        </el-tabs>
      </template>
    </AsyncState>
    <el-dialog v-model="editingGroup" :title="w.selectedGroup.value ? '修改信息' : '创建通知组'" width="min(500px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" @closed="w.resetEditor">
      <el-form label-position="top" @submit.prevent="w.saveGroup"><el-form-item label="通知组名称" required><el-input v-model="name" maxlength="64" :disabled="busy" /></el-form-item><el-form-item label="通知组描述"><el-input v-model="description" type="textarea" :rows="5" maxlength="2048" :disabled="busy" /></el-form-item><el-form-item v-if="!w.selectedGroup.value" label="启用通知组"><el-switch v-model="enabled" :disabled="busy" /></el-form-item></el-form>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <template #footer><el-button :disabled="busy" @click="editingGroup = false">取消</el-button><el-button type="primary" :loading="busy" :disabled="needsReview || !manage" @click="w.saveGroup">保存</el-button></template>
    </el-dialog>
  </main>
</template>
<style scoped>
.group-empty{padding:60px 0;text-align:center}.group-empty>img{width:160px;display:inline-block}.group-empty>h2{margin:20px 0 0;font-size:26px;font-weight:400;line-height:36px;color:#002822}.group-empty>p{margin:10px 0 0;display:inline-block;padding:0 20px;width:500px;max-width:100%;font-size:14px;line-height:22px;color:#909399}.group-empty-action{margin-top:20px}.tl-learning-resource a .el-icon{margin-left:4px;vertical-align:-2px}@media(max-width:767px){.group-empty>p{width:auto}}
.group-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr)); gap:20px; }
.group-card { border:1px solid var(--tl-border); padding:20px; min-width:0; transition:border-color .15s; }
.group-card:hover { border-color:var(--tl-primary); }.group-name { display:inline-block; max-width:75%; font-weight:600; color:var(--tl-title); overflow-wrap:anywhere; margin-right:12px; }.group-card p { margin:12px 0 0; }.group-heading {display:flex; align-items:center; gap:16px; }.group-heading h2 { font-size:20px; font-weight:500; margin:0; overflow-wrap:anywhere; }
</style>
